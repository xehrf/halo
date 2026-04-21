const express = require("express");
const { z } = require("zod");
const db = require("../config/db");
const ApiError = require("../utils/api-error");
const asyncHandler = require("../utils/async-handler");
const { authenticate, requireRoles } = require("../middleware/auth");

const router = express.Router();

const createReviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).optional().default(""),
});

const updateReviewSchema = z
  .object({
    rating: z.coerce.number().int().min(1).max(5).optional(),
    comment: z.string().trim().max(2000).optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "At least one field is required",
  });

const serializeReview = (row) => ({
  id: Number(row.id),
  productId: Number(row.product_id),
  userId: Number(row.user_id),
  userName: row.user_name || null,
  rating: Number(row.rating),
  comment: row.comment || "",
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const refreshProductRating = async (queryable, productId) => {
  await queryable.query("SELECT refresh_product_rating($1)", [productId]);
};

const ensurePurchased = async (queryable, userId, productId) => {
  const result = await queryable.query(
    `SELECT 1
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     WHERE o.buyer_id = $1
       AND oi.product_id = $2
       AND o.status <> 'cancelled'
     LIMIT 1`,
    [userId, productId]
  );

  return result.rowCount > 0;
};

router.get(
  "/product/:productId",
  asyncHandler(async (req, res) => {
    const productId = Number(req.params.productId);
    if (Number.isNaN(productId)) {
      throw new ApiError(400, "Invalid product id");
    }

    const result = await db.query(
      `SELECT
         r.*,
         u.full_name AS user_name
       FROM reviews r
       JOIN users u ON u.id = r.user_id
       WHERE r.product_id = $1
       ORDER BY r.created_at DESC`,
      [productId]
    );

    res.json({ data: result.rows.map(serializeReview) });
  })
);

router.post(
  "/product/:productId",
  authenticate,
  requireRoles("buyer", "admin"),
  asyncHandler(async (req, res) => {
    const productId = Number(req.params.productId);
    if (Number.isNaN(productId)) {
      throw new ApiError(400, "Invalid product id");
    }

    const payload = createReviewSchema.parse(req.body);

    const review = await db.withTransaction(async (client) => {
      const product = await client.query(
        `SELECT id, is_active
         FROM products
         WHERE id = $1`,
        [productId]
      );

      if (product.rowCount === 0 || !product.rows[0].is_active) {
        throw new ApiError(404, "Product not found or unavailable");
      }

      if (req.user.role !== "admin") {
        const purchased = await ensurePurchased(client, req.user.id, productId);
        if (!purchased) {
          throw new ApiError(403, "Review is available only after purchase");
        }
      }

      const existing = await client.query(
        `SELECT id
         FROM reviews
         WHERE product_id = $1 AND user_id = $2`,
        [productId, req.user.id]
      );

      if (existing.rowCount > 0) {
        throw new ApiError(409, "You have already reviewed this product");
      }

      const created = await client.query(
        `INSERT INTO reviews (product_id, user_id, rating, comment)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [productId, req.user.id, payload.rating, payload.comment]
      );

      await refreshProductRating(client, productId);

      const enriched = await client.query(
        `SELECT
           r.*,
           u.full_name AS user_name
         FROM reviews r
         JOIN users u ON u.id = r.user_id
         WHERE r.id = $1`,
        [created.rows[0].id]
      );

      return serializeReview(enriched.rows[0]);
    });

    res.status(201).json({
      message: "Review added",
      review,
    });
  })
);

router.put(
  "/:reviewId",
  authenticate,
  requireRoles("buyer", "admin"),
  asyncHandler(async (req, res) => {
    const reviewId = Number(req.params.reviewId);
    if (Number.isNaN(reviewId)) {
      throw new ApiError(400, "Invalid review id");
    }

    const payload = updateReviewSchema.parse(req.body);

    const updated = await db.withTransaction(async (client) => {
      const existing = await client.query(
        `SELECT id, product_id, user_id
         FROM reviews
         WHERE id = $1`,
        [reviewId]
      );

      if (existing.rowCount === 0) {
        throw new ApiError(404, "Review not found");
      }

      const ownerId = Number(existing.rows[0].user_id);
      if (req.user.role !== "admin" && ownerId !== Number(req.user.id)) {
        throw new ApiError(403, "You can only edit your own review");
      }

      const updates = [];
      const values = [];
      const addUpdate = (field, value) => {
        values.push(value);
        updates.push(`${field} = $${values.length}`);
      };

      if (payload.rating !== undefined) addUpdate("rating", payload.rating);
      if (payload.comment !== undefined) addUpdate("comment", payload.comment);

      values.push(reviewId);
      await client.query(
        `UPDATE reviews
         SET ${updates.join(", ")}, updated_at = NOW()
         WHERE id = $${values.length}`,
        values
      );

      await refreshProductRating(client, existing.rows[0].product_id);

      const enriched = await client.query(
        `SELECT
           r.*,
           u.full_name AS user_name
         FROM reviews r
         JOIN users u ON u.id = r.user_id
         WHERE r.id = $1`,
        [reviewId]
      );

      return serializeReview(enriched.rows[0]);
    });

    res.json({
      message: "Review updated",
      review: updated,
    });
  })
);

router.delete(
  "/:reviewId",
  authenticate,
  requireRoles("buyer", "admin"),
  asyncHandler(async (req, res) => {
    const reviewId = Number(req.params.reviewId);
    if (Number.isNaN(reviewId)) {
      throw new ApiError(400, "Invalid review id");
    }

    await db.withTransaction(async (client) => {
      const existing = await client.query(
        `SELECT id, product_id, user_id
         FROM reviews
         WHERE id = $1`,
        [reviewId]
      );

      if (existing.rowCount === 0) {
        throw new ApiError(404, "Review not found");
      }

      const ownerId = Number(existing.rows[0].user_id);
      if (req.user.role !== "admin" && ownerId !== Number(req.user.id)) {
        throw new ApiError(403, "You can only delete your own review");
      }

      await client.query("DELETE FROM reviews WHERE id = $1", [reviewId]);
      await refreshProductRating(client, existing.rows[0].product_id);
    });

    res.json({ message: "Review deleted" });
  })
);

module.exports = router;

