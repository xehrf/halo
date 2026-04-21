const express = require("express");
const { z } = require("zod");
const db = require("../config/db");
const ApiError = require("../utils/api-error");
const asyncHandler = require("../utils/async-handler");
const { authenticate, requireRoles } = require("../middleware/auth");
const { createNotification } = require("../utils/notifications");

const router = express.Router();

const updateOrderStatusSchema = z.object({
  status: z.enum(["pending", "paid", "processing", "shipped", "delivered", "cancelled"]),
  paymentStatus: z.string().trim().min(2).max(40).optional(),
});

router.use(authenticate, requireRoles("admin"));

router.get(
  "/users",
  asyncHandler(async (_req, res) => {
    const result = await db.query(
      `SELECT
         id,
         full_name,
         email,
         role,
         created_at
       FROM users
       ORDER BY created_at DESC`
    );

    res.json({
      data: result.rows.map((row) => ({
        id: Number(row.id),
        fullName: row.full_name,
        email: row.email,
        role: row.role,
        createdAt: row.created_at,
      })),
    });
  })
);

router.get(
  "/products",
  asyncHandler(async (_req, res) => {
    const result = await db.query(
      `SELECT
         p.*,
         c.name AS category_name,
         c.slug AS category_slug,
         u.full_name AS seller_name
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN users u ON u.id = p.seller_id
       ORDER BY p.created_at DESC`
    );

    res.json({
      data: result.rows.map((row) => ({
        id: Number(row.id),
        sellerId: Number(row.seller_id),
        sellerName: row.seller_name,
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
      })),
    });
  })
);

router.get(
  "/orders",
  asyncHandler(async (_req, res) => {
    const ordersResult = await db.query(
      `SELECT
         o.*,
         u.full_name AS buyer_name,
         u.email AS buyer_email
       FROM orders o
       JOIN users u ON u.id = o.buyer_id
       ORDER BY o.created_at DESC`
    );

    const orders = [];
    for (const orderRow of ordersResult.rows) {
      const itemsResult = await db.query(
        `SELECT
           oi.*,
           p.image_url
         FROM order_items oi
         LEFT JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = $1
         ORDER BY oi.id`,
        [orderRow.id]
      );

      orders.push({
        id: Number(orderRow.id),
        buyerId: Number(orderRow.buyer_id),
        buyerName: orderRow.buyer_name,
        buyerEmail: orderRow.buyer_email,
        status: orderRow.status,
        totalAmount: Number(orderRow.total_amount),
        deliveryMethod: orderRow.delivery_method,
        deliveryAddress: orderRow.delivery_address,
        paymentMethod: orderRow.payment_method,
        paymentStatus: orderRow.payment_status,
        createdAt: orderRow.created_at,
        updatedAt: orderRow.updated_at,
        items: itemsResult.rows.map((item) => ({
          id: Number(item.id),
          productId: item.product_id ? Number(item.product_id) : null,
          sellerId: item.seller_id ? Number(item.seller_id) : null,
          productName: item.product_name,
          unitPrice: Number(item.unit_price),
          quantity: Number(item.quantity),
          lineTotal: Number(item.line_total),
          imageUrl: item.image_url || null,
        })),
      });
    }

    res.json({ data: orders });
  })
);

router.patch(
  "/orders/:id/status",
  asyncHandler(async (req, res) => {
    const orderId = Number(req.params.id);
    if (Number.isNaN(orderId)) {
      throw new ApiError(400, "Invalid order id");
    }

    const payload = updateOrderStatusSchema.parse(req.body);

    const updatedOrder = await db.withTransaction(async (client) => {
      const existing = await client.query(
        `SELECT id, buyer_id, status, payment_status
         FROM orders
         WHERE id = $1
         FOR UPDATE`,
        [orderId]
      );

      if (existing.rowCount === 0) {
        throw new ApiError(404, "Order not found");
      }

      const updates = ["status = $1", "updated_at = NOW()"];
      const values = [payload.status];

      if (payload.paymentStatus !== undefined) {
        values.push(payload.paymentStatus);
        updates.push(`payment_status = $${values.length}`);
      }

      values.push(orderId);
      const result = await client.query(
        `UPDATE orders
         SET ${updates.join(", ")}
         WHERE id = $${values.length}
         RETURNING id, buyer_id, status, payment_status, updated_at`,
        values
      );

      const row = result.rows[0];
      await createNotification(client, {
        userId: Number(row.buyer_id),
        type: "order",
        title: "Статус заказа обновлен",
        message: `Заказ #${row.id} теперь имеет статус "${row.status}".`,
        metadata: {
          orderId: Number(row.id),
          status: row.status,
          paymentStatus: row.payment_status,
        },
      });

      return row;
    });

    res.json({
      message: "Order status updated",
      order: {
        id: Number(updatedOrder.id),
        status: updatedOrder.status,
        paymentStatus: updatedOrder.payment_status,
        updatedAt: updatedOrder.updated_at,
      },
    });
  })
);

module.exports = router;
