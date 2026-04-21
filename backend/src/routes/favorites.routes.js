const express = require("express");
const db = require("../config/db");
const ApiError = require("../utils/api-error");
const asyncHandler = require("../utils/async-handler");
const { authenticate, requireRoles } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate, requireRoles("buyer", "admin"));

const getFavorites = async (queryable, userId) => {
  const result = await queryable.query(
    `SELECT
       f.id,
       f.user_id,
       f.product_id,
       f.created_at,
       p.name AS product_name,
       p.price,
       p.image_url,
       p.material,
       p.size,
       p.stock,
       p.is_active,
       p.rating_avg,
       p.rating_count,
       c.name AS category_name,
       c.slug AS category_slug
     FROM favorites f
     JOIN products p ON p.id = f.product_id
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE f.user_id = $1
     ORDER BY f.created_at DESC`,
    [userId]
  );

  return result.rows.map((row) => ({
    id: Number(row.id),
    userId: Number(row.user_id),
    productId: Number(row.product_id),
    createdAt: row.created_at,
    product: {
      id: Number(row.product_id),
      name: row.product_name,
      price: Number(row.price),
      imageUrl: row.image_url || null,
      material: row.material,
      size: row.size,
      stock: Number(row.stock),
      isActive: row.is_active,
      ratingAvg: Number(row.rating_avg),
      ratingCount: Number(row.rating_count),
      categoryName: row.category_name || null,
      categorySlug: row.category_slug || null,
    },
  }));
};

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const data = await getFavorites(db, req.user.id);
    res.json({ data });
  })
);

router.post(
  "/:productId",
  asyncHandler(async (req, res) => {
    const productId = Number(req.params.productId);
    if (Number.isNaN(productId)) {
      throw new ApiError(400, "Invalid product id");
    }

    await db.withTransaction(async (client) => {
      const product = await client.query(
        `SELECT id, is_active
         FROM products
         WHERE id = $1`,
        [productId]
      );

      if (product.rowCount === 0 || !product.rows[0].is_active) {
        throw new ApiError(404, "Product not found or unavailable");
      }

      await client.query(
        `INSERT INTO favorites (user_id, product_id)
         VALUES ($1, $2)
         ON CONFLICT (user_id, product_id) DO NOTHING`,
        [req.user.id, productId]
      );
    });

    const data = await getFavorites(db, req.user.id);
    res.status(201).json({
      message: "Added to favorites",
      data,
    });
  })
);

router.delete(
  "/:productId",
  asyncHandler(async (req, res) => {
    const productId = Number(req.params.productId);
    if (Number.isNaN(productId)) {
      throw new ApiError(400, "Invalid product id");
    }

    await db.query(
      `DELETE FROM favorites
       WHERE user_id = $1 AND product_id = $2`,
      [req.user.id, productId]
    );

    const data = await getFavorites(db, req.user.id);
    res.json({
      message: "Removed from favorites",
      data,
    });
  })
);

module.exports = router;

