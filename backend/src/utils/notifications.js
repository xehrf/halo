const createNotification = async (queryable, payload) => {
  const result = await queryable.query(
    `INSERT INTO notifications (user_id, type, title, message, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     RETURNING id, user_id, type, title, message, metadata, is_read, created_at, read_at`,
    [
      payload.userId,
      payload.type || "system",
      payload.title,
      payload.message,
      JSON.stringify(payload.metadata || {}),
    ]
  );

  return result.rows[0];
};

const serializeNotification = (row) => ({
  id: Number(row.id),
  userId: Number(row.user_id),
  type: row.type,
  title: row.title,
  message: row.message,
  metadata: row.metadata || {},
  isRead: row.is_read,
  createdAt: row.created_at,
  readAt: row.read_at,
});

module.exports = {
  createNotification,
  serializeNotification,
};

