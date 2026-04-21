const express = require("express");
const { z } = require("zod");
const db = require("../config/db");
const ApiError = require("../utils/api-error");
const asyncHandler = require("../utils/async-handler");
const { authenticate, requireRoles } = require("../middleware/auth");

const router = express.Router();

const addItemSchema = z.object({
  productId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().positive().default(1),
});

const updateItemSchema = z.object({
  quantity: z.coerce.number().int().positive(),
});

const getCartSnapshot = async (queryable, userId) => {
  const result = await queryable.query(
    `SELECT
       ci.id,
       ci.user_id,
       ci.product_id,
       ci.quantity,
       p.name AS product_name,
       p.price,
       p.image_url,
       p.stock,
       p.is_active,
       (ci.quantity * p.price) AS line_total
     FROM cart_items ci
     JOIN products p ON p.id = ci.product_id
     WHERE ci.user_id = $1
     ORDER BY ci.created_at DESC`,
    [userId]
  );

  const items = result.rows.map((row) => ({
    id: Number(row.id),
    userId: Number(row.user_id),
    productId: Number(row.product_id),
    productName: row.product_name,
    imageUrl: row.image_url,
    quantity: Number(row.quantity),
    price: Number(row.price),
    lineTotal: Number(row.line_total),
    stock: Number(row.stock),
    isActive: row.is_active,
  }));

  const totalAmount = items.reduce((sum, item) => sum + item.lineTotal, 0);

  return {
    items,
    totalAmount,
    totalItems: items.reduce((sum, item) => sum + item.quantity, 0),
  };
};

router.use(authenticate, requireRoles("buyer", "admin"));

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const cart = await getCartSnapshot(db, req.user.id);
    res.json(cart);
  })
);

router.post(
  "/items",
  asyncHandler(async (req, res) => {
    const payload = addItemSchema.parse(req.body);

    await db.withTransaction(async (client) => {
      const product = await client.query(
        `SELECT id, name, stock, is_active
         FROM products
         WHERE id = $1
         FOR UPDATE`,
        [payload.productId]
      );

      if (product.rowCount === 0 || !product.rows[0].is_active) {
        throw new ApiError(404, "Product not found or unavailable");
      }

      const current = await client.query(
        `SELECT id, quantity
         FROM cart_items
         WHERE user_id = $1 AND product_id = $2
         FOR UPDATE`,
        [req.user.id, payload.productId]
      );

      const currentQty = current.rowCount ? Number(current.rows[0].quantity) : 0;
      const nextQty = currentQty + payload.quantity;

      if (nextQty > Number(product.rows[0].stock)) {
        throw new ApiError(400, "Requested quantity exceeds available stock");
      }

      if (current.rowCount) {
        await client.query(
          `UPDATE cart_items
           SET quantity = $1, updated_at = NOW()
           WHERE id = $2`,
          [nextQty, current.rows[0].id]
        );
      } else {
        await client.query(
          `INSERT INTO cart_items (user_id, product_id, quantity)
           VALUES ($1, $2, $3)`,
          [req.user.id, payload.productId, payload.quantity]
        );
      }
    });

    const cart = await getCartSnapshot(db, req.user.id);
    res.status(201).json({
      message: "Item added to cart",
      ...cart,
    });
  })
);

router.patch(
  "/items/:itemId",
  asyncHandler(async (req, res) => {
    const itemId = Number(req.params.itemId);
    if (Number.isNaN(itemId)) {
      throw new ApiError(400, "Invalid cart item id");
    }

    const payload = updateItemSchema.parse(req.body);

    await db.withTransaction(async (client) => {
      const existing = await client.query(
        `SELECT
           ci.id,
           ci.product_id,
           p.stock,
           p.is_active
         FROM cart_items ci
         JOIN products p ON p.id = ci.product_id
         WHERE ci.id = $1 AND ci.user_id = $2
         FOR UPDATE OF ci, p`,
        [itemId, req.user.id]
      );

      if (existing.rowCount === 0) {
        throw new ApiError(404, "Cart item not found");
      }

      if (!existing.rows[0].is_active) {
        throw new ApiError(400, "Product is no longer available");
      }

      if (payload.quantity > Number(existing.rows[0].stock)) {
        throw new ApiError(400, "Requested quantity exceeds available stock");
      }

      await client.query(
        `UPDATE cart_items
         SET quantity = $1, updated_at = NOW()
         WHERE id = $2`,
        [payload.quantity, itemId]
      );
    });

    const cart = await getCartSnapshot(db, req.user.id);
    res.json({
      message: "Cart item updated",
      ...cart,
    });
  })
);

router.delete(
  "/items/:itemId",
  asyncHandler(async (req, res) => {
    const itemId = Number(req.params.itemId);
    if (Number.isNaN(itemId)) {
      throw new ApiError(400, "Invalid cart item id");
    }

    const removed = await db.query(
      `DELETE FROM cart_items
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [itemId, req.user.id]
    );

    if (removed.rowCount === 0) {
      throw new ApiError(404, "Cart item not found");
    }

    const cart = await getCartSnapshot(db, req.user.id);
    res.json({
      message: "Cart item removed",
      ...cart,
    });
  })
);

router.delete(
  "/clear",
  asyncHandler(async (req, res) => {
    await db.query("DELETE FROM cart_items WHERE user_id = $1", [req.user.id]);
    res.json({
      message: "Cart cleared",
      items: [],
      totalAmount: 0,
      totalItems: 0,
    });
  })
);

module.exports = router;

