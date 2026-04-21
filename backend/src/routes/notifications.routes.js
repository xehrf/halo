const express = require("express");
const db = require("../config/db");
const ApiError = require("../utils/api-error");
const asyncHandler = require("../utils/async-handler");
const { authenticate } = require("../middleware/auth");
const { serializeNotification } = require("../utils/notifications");

const router = express.Router();

router.use(authenticate);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const unreadOnly = req.query.unread === "1";

    const values = [req.user.id];
    let condition = "user_id = $1";

    if (unreadOnly) {
      condition += " AND is_read = FALSE";
    }

    values.push(limit);
    values.push(offset);

    const result = await db.query(
      `SELECT id, user_id, type, title, message, metadata, is_read, created_at, read_at
       FROM notifications
       WHERE ${condition}
       ORDER BY created_at DESC
       LIMIT $2
       OFFSET $3`,
      values
    );

    const unreadResult = await db.query(
      `SELECT COUNT(*)::int AS unread_count
       FROM notifications
       WHERE user_id = $1 AND is_read = FALSE`,
      [req.user.id]
    );

    res.json({
      data: result.rows.map(serializeNotification),
      unreadCount: unreadResult.rows[0].unread_count,
    });
  })
);

router.patch(
  "/:id/read",
  asyncHandler(async (req, res) => {
    const notificationId = Number(req.params.id);
    if (Number.isNaN(notificationId)) {
      throw new ApiError(400, "Invalid notification id");
    }

    const result = await db.query(
      `UPDATE notifications
       SET is_read = TRUE,
           read_at = COALESCE(read_at, NOW())
       WHERE id = $1 AND user_id = $2
       RETURNING id, user_id, type, title, message, metadata, is_read, created_at, read_at`,
      [notificationId, req.user.id]
    );

    if (result.rowCount === 0) {
      throw new ApiError(404, "Notification not found");
    }

    res.json({
      message: "Notification marked as read",
      notification: serializeNotification(result.rows[0]),
    });
  })
);

router.patch(
  "/read-all",
  asyncHandler(async (req, res) => {
    const result = await db.query(
      `UPDATE notifications
       SET is_read = TRUE,
           read_at = COALESCE(read_at, NOW())
       WHERE user_id = $1 AND is_read = FALSE
       RETURNING id`,
      [req.user.id]
    );

    res.json({
      message: "All notifications marked as read",
      updated: result.rowCount,
    });
  })
);

module.exports = router;

