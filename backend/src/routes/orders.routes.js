const express = require("express");
const { z } = require("zod");
const db = require("../config/db");
const ApiError = require("../utils/api-error");
const asyncHandler = require("../utils/async-handler");
const { authenticate, requireRoles } = require("../middleware/auth");
const { createNotification } = require("../utils/notifications");

const router = express.Router();

const checkoutSchema = z.object({
  deliveryMethod: z.string().trim().min(2).max(80),
  deliveryAddress: z.string().trim().min(5).max(500),
  paymentMethod: z.string().trim().min(2).max(80),
});

const serializeOrderItem = (row) => ({
  id: Number(row.id),
  orderId: Number(row.order_id),
  productId: row.product_id ? Number(row.product_id) : null,
  sellerId: row.seller_id ? Number(row.seller_id) : null,
  productName: row.product_name,
  unitPrice: Number(row.unit_price),
  quantity: Number(row.quantity),
  lineTotal: Number(row.line_total),
  imageUrl: row.image_url || null,
});

const serializeOrder = (row, items) => ({
  id: Number(row.id),
  buyerId: Number(row.buyer_id),
  buyerName: row.buyer_name || null,
  buyerEmail: row.buyer_email || null,
  status: row.status,
  totalAmount: Number(row.total_amount),
  deliveryMethod: row.delivery_method,
  deliveryAddress: row.delivery_address,
  paymentMethod: row.payment_method,
  paymentStatus: row.payment_status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  items,
});

const fetchOrderById = async (queryable, orderId) => {
  const orderResult = await queryable.query(
    `SELECT
       o.*,
       u.full_name AS buyer_name,
       u.email AS buyer_email
     FROM orders o
     JOIN users u ON u.id = o.buyer_id
     WHERE o.id = $1`,
    [orderId]
  );

  if (orderResult.rowCount === 0) {
    return null;
  }

  const itemsResult = await queryable.query(
    `SELECT
       oi.*,
       p.image_url
     FROM order_items oi
     LEFT JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = $1
     ORDER BY oi.id`,
    [orderId]
  );

  return serializeOrder(orderResult.rows[0], itemsResult.rows.map(serializeOrderItem));
};

router.use(authenticate);

router.post(
  "/checkout",
  requireRoles("buyer", "admin"),
  asyncHandler(async (req, res) => {
    const payload = checkoutSchema.parse(req.body);

    const order = await db.withTransaction(async (client) => {
      const cartItems = await client.query(
        `SELECT
           ci.product_id,
           ci.quantity,
           p.name AS product_name,
           p.price,
           p.stock,
           p.seller_id,
           p.is_active
         FROM cart_items ci
         JOIN products p ON p.id = ci.product_id
         WHERE ci.user_id = $1
         FOR UPDATE OF p, ci`,
        [req.user.id]
      );

      if (cartItems.rowCount === 0) {
        throw new ApiError(400, "Cart is empty");
      }

      let totalAmount = 0;
      for (const item of cartItems.rows) {
        if (!item.is_active) {
          throw new ApiError(400, `Product "${item.product_name}" is unavailable`);
        }
        if (Number(item.stock) < Number(item.quantity)) {
          throw new ApiError(400, `Not enough stock for "${item.product_name}"`);
        }
        totalAmount += Number(item.price) * Number(item.quantity);
      }

      const createdOrder = await client.query(
        `INSERT INTO orders
         (buyer_id, status, total_amount, delivery_method, delivery_address, payment_method, payment_status)
         VALUES
         ($1, 'pending', $2, $3, $4, $5, 'unpaid')
         RETURNING id`,
        [req.user.id, totalAmount, payload.deliveryMethod, payload.deliveryAddress, payload.paymentMethod]
      );

      const orderId = Number(createdOrder.rows[0].id);

      for (const item of cartItems.rows) {
        const lineTotal = Number(item.price) * Number(item.quantity);
        await client.query(
          `INSERT INTO order_items
           (order_id, product_id, seller_id, product_name, unit_price, quantity, line_total)
           VALUES
           ($1, $2, $3, $4, $5, $6, $7)`,
          [
            orderId,
            item.product_id,
            item.seller_id,
            item.product_name,
            Number(item.price),
            Number(item.quantity),
            lineTotal,
          ]
        );

        await client.query(
          `UPDATE products
           SET stock = stock - $1, updated_at = NOW()
           WHERE id = $2`,
          [item.quantity, item.product_id]
        );
      }

      await createNotification(client, {
        userId: req.user.id,
        type: "order",
        title: "Заказ создан",
        message: `Ваш заказ #${orderId} успешно оформлен и ожидает подтверждения.`,
        metadata: { orderId, status: "pending" },
      });

      const sellerIds = [...new Set(cartItems.rows.map((item) => Number(item.seller_id)).filter(Boolean))];
      for (const sellerId of sellerIds) {
        await createNotification(client, {
          userId: sellerId,
          type: "order",
          title: "Новый заказ",
          message: `Поступил новый заказ #${orderId} с вашими товарами.`,
          metadata: { orderId, sellerId },
        });
      }

      await client.query("DELETE FROM cart_items WHERE user_id = $1", [req.user.id]);

      return fetchOrderById(client, orderId);
    });

    res.status(201).json({
      message: "Order placed successfully",
      order,
    });
  })
);

router.post(
  "/",
  requireRoles("buyer", "admin"),
  asyncHandler(async (req, res) => {
    const payload = checkoutSchema.parse(req.body);

    const order = await db.withTransaction(async (client) => {
      const cartItems = await client.query(
        `SELECT
           ci.product_id,
           ci.quantity,
           p.name AS product_name,
           p.price,
           p.stock,
           p.seller_id,
           p.is_active
         FROM cart_items ci
         JOIN products p ON p.id = ci.product_id
         WHERE ci.user_id = $1
         FOR UPDATE OF p, ci`,
        [req.user.id]
      );

      if (cartItems.rowCount === 0) {
        throw new ApiError(400, "Cart is empty");
      }

      let totalAmount = 0;
      for (const item of cartItems.rows) {
        if (!item.is_active) {
          throw new ApiError(400, `Product "${item.product_name}" is unavailable`);
        }
        if (Number(item.stock) < Number(item.quantity)) {
          throw new ApiError(400, `Not enough stock for "${item.product_name}"`);
        }
        totalAmount += Number(item.price) * Number(item.quantity);
      }

      const createdOrder = await client.query(
        `INSERT INTO orders
         (buyer_id, status, total_amount, delivery_method, delivery_address, payment_method, payment_status)
         VALUES
         ($1, 'pending', $2, $3, $4, $5, 'unpaid')
         RETURNING id`,
        [req.user.id, totalAmount, payload.deliveryMethod, payload.deliveryAddress, payload.paymentMethod]
      );

      const orderId = Number(createdOrder.rows[0].id);

      for (const item of cartItems.rows) {
        const lineTotal = Number(item.price) * Number(item.quantity);
        await client.query(
          `INSERT INTO order_items
           (order_id, product_id, seller_id, product_name, unit_price, quantity, line_total)
           VALUES
           ($1, $2, $3, $4, $5, $6, $7)`,
          [
            orderId,
            item.product_id,
            item.seller_id,
            item.product_name,
            Number(item.price),
            Number(item.quantity),
            lineTotal,
          ]
        );

        await client.query(
          `UPDATE products
           SET stock = stock - $1, updated_at = NOW()
           WHERE id = $2`,
          [item.quantity, item.product_id]
        );
      }

      await createNotification(client, {
        userId: req.user.id,
        type: "order",
        title: "Заказ создан",
        message: `Ваш заказ #${orderId} успешно оформлен и ожидает подтверждения.`,
        metadata: { orderId, status: "pending" },
      });

      const sellerIds = [...new Set(cartItems.rows.map((item) => Number(item.seller_id)).filter(Boolean))];
      for (const sellerId of sellerIds) {
        await createNotification(client, {
          userId: sellerId,
          type: "order",
          title: "Новый заказ",
          message: `Поступил новый заказ #${orderId} с вашими товарами.`,
          metadata: { orderId, sellerId },
        });
      }

      await client.query("DELETE FROM cart_items WHERE user_id = $1", [req.user.id]);

      return fetchOrderById(client, orderId);
    });

    res.status(201).json({
      message: "Order placed successfully",
      order,
    });
  })
);

router.get(
  "/my",
  requireRoles("buyer", "admin"),
  asyncHandler(async (req, res) => {
    const result = await db.query(
      `SELECT
         o.*,
         u.full_name AS buyer_name,
         u.email AS buyer_email
       FROM orders o
       JOIN users u ON u.id = o.buyer_id
       WHERE o.buyer_id = $1
       ORDER BY o.created_at DESC`,
      [req.user.id]
    );

    const orders = [];
    for (const row of result.rows) {
      const details = await fetchOrderById(db, row.id);
      if (details) {
        orders.push(details);
      }
    }

    res.json({ data: orders });
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const orderId = Number(req.params.id);
    if (Number.isNaN(orderId)) {
      throw new ApiError(400, "Invalid order id");
    }

    const order = await fetchOrderById(db, orderId);
    if (!order) {
      throw new ApiError(404, "Order not found");
    }

    if (req.user.role !== "admin" && Number(order.buyerId) !== Number(req.user.id)) {
      throw new ApiError(403, "You can only view your own orders");
    }

    res.json({ order });
  })
);

module.exports = router;
