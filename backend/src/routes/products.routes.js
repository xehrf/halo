const express = require("express");
const { z } = require("zod");
const db = require("../config/db");
const ApiError = require("../utils/api-error");
const asyncHandler = require("../utils/async-handler");
const slugify = require("../utils/slugify");
const { authenticate, requireRoles } = require("../middleware/auth");

const router = express.Router();

const createProductSchema = z.object({
  sellerId: z.coerce.number().int().positive().optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  categoryName: z.string().trim().min(2).max(120).optional(),
  categorySlug: z.string().trim().min(2).max(120).optional(),
  name: z.string().trim().min(2).max(180),
  description: z.string().trim().max(5000).optional().default(""),
  price: z.coerce.number().nonnegative(),
  material: z.string().trim().max(80).optional().or(z.literal("")),
  size: z.string().trim().max(40).optional().or(z.literal("")),
  imageUrl: z.string().trim().max(500).optional().or(z.literal("")),
  stock: z.coerce.number().int().min(0).default(0),
  isActive: z.coerce.boolean().optional(),
});

const updateProductSchema = z
  .object({
    categoryId: z.coerce.number().int().positive().optional(),
    categoryName: z.string().trim().min(2).max(120).optional(),
    categorySlug: z.string().trim().min(2).max(120).optional(),
    name: z.string().trim().min(2).max(180).optional(),
    description: z.string().trim().max(5000).optional(),
    price: z.coerce.number().nonnegative().optional(),
    material: z.string().trim().max(80).optional().or(z.literal("")),
    size: z.string().trim().max(40).optional().or(z.literal("")),
    imageUrl: z.string().trim().max(500).optional().or(z.literal("")),
    stock: z.coerce.number().int().min(0).optional(),
    isActive: z.coerce.boolean().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "At least one field is required",
  });

const normalizeNullable = (value) => {
  if (value === undefined || value === null) return null;
  const trimmed = value.toString().trim();
  return trimmed.length === 0 ? null : trimmed;
};

const serializeProduct = (row) => ({
  id: Number(row.id),
  sellerId: Number(row.seller_id),
  sellerName: row.seller_name || null,
  categoryId: row.category_id ? Number(row.category_id) : null,
  categoryName: row.category_name || null,
  categorySlug: row.category_slug || null,
  name: row.name,
  description: row.description,
  price: Number(row.price),
  material: row.material,
  size: row.size,
  imageUrl: row.image_url,
  stock: Number(row.stock),
  isActive: row.is_active,
  ratingAvg: Number(row.rating_avg),
  ratingCount: Number(row.rating_count),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const fetchProductById = async (client, productId) => {
  const result = await client.query(
    `SELECT
       p.*,
       c.name AS category_name,
       c.slug AS category_slug,
       u.full_name AS seller_name
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN users u ON u.id = p.seller_id
     WHERE p.id = $1`,
    [productId]
  );
  return result.rowCount ? result.rows[0] : null;
};

const resolveSellerId = async (client, currentUser, payload) => {
  if (currentUser.role !== "admin" || !payload.sellerId) {
    return currentUser.id;
  }

  const seller = await client.query(
    `SELECT id, role
     FROM users
     WHERE id = $1`,
    [payload.sellerId]
  );

  if (seller.rowCount === 0) {
    throw new ApiError(404, "Specified seller not found");
  }

  if (!["seller", "admin"].includes(seller.rows[0].role)) {
    throw new ApiError(400, "sellerId must belong to seller/admin user");
  }

  return Number(seller.rows[0].id);
};

const resolveCategoryId = async (client, payload) => {
  if (payload.categoryId) {
    const category = await client.query("SELECT id FROM categories WHERE id = $1", [payload.categoryId]);
    if (category.rowCount === 0) {
      throw new ApiError(404, "Category not found");
    }
    return Number(category.rows[0].id);
  }

  if (!payload.categoryName && !payload.categorySlug) {
    return null;
  }

  const slug = slugify(payload.categorySlug || payload.categoryName);
  const name = (payload.categoryName || payload.categorySlug).trim();

  const existing = await client.query(
    `SELECT id
     FROM categories
     WHERE slug = $1 OR LOWER(name) = LOWER($2)
     LIMIT 1`,
    [slug, name]
  );

  if (existing.rowCount) {
    return Number(existing.rows[0].id);
  }

  const created = await client.query(
    `INSERT INTO categories (name, slug)
     VALUES ($1, $2)
     RETURNING id`,
    [name, slug]
  );
  return Number(created.rows[0].id);
};

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const search = req.query.search?.toString().trim() || null;
    const category = req.query.category?.toString().trim() || null;
    const material = req.query.material?.toString().trim() || null;
    const size = req.query.size?.toString().trim() || null;
    const minPrice = req.query.minPrice ? Number(req.query.minPrice) : null;
    const maxPrice = req.query.maxPrice ? Number(req.query.maxPrice) : null;
    const sellerId = req.query.sellerId ? Number(req.query.sellerId) : null;
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    if ((minPrice !== null && Number.isNaN(minPrice)) || (maxPrice !== null && Number.isNaN(maxPrice))) {
      throw new ApiError(400, "minPrice/maxPrice must be numeric");
    }
    if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
      throw new ApiError(400, "minPrice cannot be greater than maxPrice");
    }
    if (sellerId !== null && Number.isNaN(sellerId)) {
      throw new ApiError(400, "sellerId must be numeric");
    }

    const sort = req.query.sort?.toString() || "newest";
    const orderByMap = {
      newest: "p.created_at DESC",
      price_asc: "p.price ASC",
      price_desc: "p.price DESC",
      rating_desc: "p.rating_avg DESC, p.rating_count DESC",
    };
    const orderBy = orderByMap[sort] || orderByMap.newest;

    const conditions = ["p.is_active = TRUE"];
    const values = [];
    const addValue = (value) => {
      values.push(value);
      return `$${values.length}`;
    };

    if (search) {
      const needle = addValue(`%${search}%`);
      conditions.push(`(p.name ILIKE ${needle} OR p.description ILIKE ${needle})`);
    }

    if (category) {
      const normalizedCategory = addValue(category.toLowerCase());
      conditions.push(`(LOWER(c.name) = ${normalizedCategory} OR c.slug = ${normalizedCategory})`);
    }

    if (material) {
      const mat = addValue(`%${material}%`);
      conditions.push(`p.material ILIKE ${mat}`);
    }

    if (size) {
      const sizeValue = addValue(size);
      conditions.push(`p.size = ${sizeValue}`);
    }

    if (minPrice !== null) {
      const min = addValue(minPrice);
      conditions.push(`p.price >= ${min}`);
    }

    if (maxPrice !== null) {
      const max = addValue(maxPrice);
      conditions.push(`p.price <= ${max}`);
    }

    if (sellerId !== null) {
      const seller = addValue(sellerId);
      conditions.push(`p.seller_id = ${seller}`);
    }

    const baseFrom = `
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN users u ON u.id = p.seller_id
      WHERE ${conditions.join(" AND ")}
    `;

    const countResult = await db.query(`SELECT COUNT(*)::int AS total ${baseFrom}`, values);
    const total = countResult.rows[0].total;

    const limitPlaceholder = addValue(limit);
    const offsetPlaceholder = addValue(offset);
    const listResult = await db.query(
      `SELECT
         p.*,
         c.name AS category_name,
         c.slug AS category_slug,
         u.full_name AS seller_name
       ${baseFrom}
       ORDER BY ${orderBy}
       LIMIT ${limitPlaceholder}
       OFFSET ${offsetPlaceholder}`,
      values
    );

    res.json({
      data: listResult.rows.map(serializeProduct),
      pagination: {
        total,
        limit,
        offset,
      },
    });
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const productId = Number(req.params.id);
    if (Number.isNaN(productId)) {
      throw new ApiError(400, "Invalid product id");
    }

    const row = await fetchProductById(db, productId);
    if (!row || !row.is_active) {
      throw new ApiError(404, "Product not found");
    }

    res.json({ product: serializeProduct(row) });
  })
);

router.post(
  "/",
  authenticate,
  requireRoles("seller", "admin"),
  asyncHandler(async (req, res) => {
    const payload = createProductSchema.parse(req.body);

    const createdProduct = await db.withTransaction(async (client) => {
      const sellerId = await resolveSellerId(client, req.user, payload);
      const categoryId = await resolveCategoryId(client, payload);
      const isActive = req.user.role === "admin" ? payload.isActive ?? true : true;

      const created = await client.query(
        `INSERT INTO products
         (seller_id, category_id, name, description, price, material, size, image_url, stock, is_active)
         VALUES
         ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id`,
        [
          sellerId,
          categoryId,
          payload.name,
          payload.description,
          payload.price,
          normalizeNullable(payload.material),
          normalizeNullable(payload.size),
          normalizeNullable(payload.imageUrl),
          payload.stock,
          isActive,
        ]
      );

      return fetchProductById(client, created.rows[0].id);
    });

    res.status(201).json({
      message: "Product created",
      product: serializeProduct(createdProduct),
    });
  })
);

router.put(
  "/:id",
  authenticate,
  requireRoles("seller", "admin"),
  asyncHandler(async (req, res) => {
    const productId = Number(req.params.id);
    if (Number.isNaN(productId)) {
      throw new ApiError(400, "Invalid product id");
    }

    const payload = updateProductSchema.parse(req.body);
    const updated = await db.withTransaction(async (client) => {
      const existing = await client.query("SELECT id, seller_id FROM products WHERE id = $1", [productId]);
      if (existing.rowCount === 0) {
        throw new ApiError(404, "Product not found");
      }

      const ownerId = Number(existing.rows[0].seller_id);
      if (req.user.role !== "admin" && ownerId !== Number(req.user.id)) {
        throw new ApiError(403, "You can only edit your own products");
      }

      const updates = [];
      const values = [];
      const addUpdate = (column, value) => {
        values.push(value);
        updates.push(`${column} = $${values.length}`);
      };

      if (payload.name !== undefined) addUpdate("name", payload.name);
      if (payload.description !== undefined) addUpdate("description", payload.description);
      if (payload.price !== undefined) addUpdate("price", payload.price);
      if (payload.material !== undefined) addUpdate("material", normalizeNullable(payload.material));
      if (payload.size !== undefined) addUpdate("size", normalizeNullable(payload.size));
      if (payload.imageUrl !== undefined) addUpdate("image_url", normalizeNullable(payload.imageUrl));
      if (payload.stock !== undefined) addUpdate("stock", payload.stock);

      const categoryPayloadSent =
        payload.categoryId !== undefined ||
        payload.categoryName !== undefined ||
        payload.categorySlug !== undefined;
      if (categoryPayloadSent) {
        const categoryId = await resolveCategoryId(client, payload);
        addUpdate("category_id", categoryId);
      }

      if (payload.isActive !== undefined) {
        if (req.user.role !== "admin") {
          throw new ApiError(403, "Only admin can change product activity state");
        }
        addUpdate("is_active", payload.isActive);
      }

      if (updates.length === 0) {
        throw new ApiError(400, "No fields to update");
      }

      values.push(productId);
      await client.query(
        `UPDATE products
         SET ${updates.join(", ")}, updated_at = NOW()
         WHERE id = $${values.length}`,
        values
      );

      return fetchProductById(client, productId);
    });

    res.json({
      message: "Product updated",
      product: serializeProduct(updated),
    });
  })
);

router.delete(
  "/:id",
  authenticate,
  requireRoles("seller", "admin"),
  asyncHandler(async (req, res) => {
    const productId = Number(req.params.id);
    if (Number.isNaN(productId)) {
      throw new ApiError(400, "Invalid product id");
    }

    await db.withTransaction(async (client) => {
      const existing = await client.query("SELECT id, seller_id FROM products WHERE id = $1", [productId]);
      if (existing.rowCount === 0) {
        throw new ApiError(404, "Product not found");
      }

      const ownerId = Number(existing.rows[0].seller_id);
      if (req.user.role !== "admin" && ownerId !== Number(req.user.id)) {
        throw new ApiError(403, "You can only remove your own products");
      }

      await client.query(
        `UPDATE products
         SET is_active = FALSE, updated_at = NOW()
         WHERE id = $1`,
        [productId]
      );
    });

    res.json({ message: "Product archived" });
  })
);

module.exports = router;
