const express = require("express");
const db = require("../config/db");
const asyncHandler = require("../utils/async-handler");
const { authenticate, requireRoles } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate, requireRoles("seller", "admin"));

router.get(
  "/products",
  asyncHandler(async (req, res) => {
    const result = await db.query(
      `SELECT
         p.*,
         c.name AS category_name,
         c.slug AS category_slug
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.seller_id = $1
       ORDER BY p.created_at DESC`,
      [req.user.id]
    );

    const products = result.rows.map((row) => ({
      id: Number(row.id),
      sellerId: Number(row.seller_id),
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
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    res.json({ data: products });
  })
);

router.get(
  "/orders",
  asyncHandler(async (req, res) => {
    const result = await db.query(
      `SELECT
         o.id AS order_id,
         o.status,
         o.payment_status,
         o.delivery_method,
         o.delivery_address,
         o.created_at,
         buyer.full_name AS buyer_name,
         buyer.email AS buyer_email,
         oi.id AS order_item_id,
         oi.product_id,
         oi.product_name,
         oi.unit_price,
         oi.quantity,
         oi.line_total
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN users buyer ON buyer.id = o.buyer_id
       WHERE oi.seller_id = $1
       ORDER BY o.created_at DESC, oi.id ASC`,
      [req.user.id]
    );

    const grouped = new Map();
    for (const row of result.rows) {
      const orderId = Number(row.order_id);
      if (!grouped.has(orderId)) {
        grouped.set(orderId, {
          id: orderId,
          status: row.status,
          paymentStatus: row.payment_status,
          deliveryMethod: row.delivery_method,
          deliveryAddress: row.delivery_address,
          createdAt: row.created_at,
          buyerName: row.buyer_name,
          buyerEmail: row.buyer_email,
          items: [],
        });
      }

      grouped.get(orderId).items.push({
        id: Number(row.order_item_id),
        productId: row.product_id ? Number(row.product_id) : null,
        productName: row.product_name,
        unitPrice: Number(row.unit_price),
        quantity: Number(row.quantity),
        lineTotal: Number(row.line_total),
      });
    }

    res.json({ data: Array.from(grouped.values()) });
  })
);

module.exports = router;

