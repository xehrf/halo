const express = require("express");
const { z } = require("zod");
const db = require("../config/db");
const ApiError = require("../utils/api-error");
const asyncHandler = require("../utils/async-handler");
const { hashPassword, comparePassword } = require("../utils/hash");
const { signToken } = require("../utils/jwt");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(6).max(128),
  role: z.enum(["buyer", "seller"]).optional().default("buyer"),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

const sanitizeUser = (row) => ({
  id: Number(row.id),
  fullName: row.full_name,
  email: row.email,
  role: row.role,
  createdAt: row.created_at,
});

router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const payload = registerSchema.parse(req.body);
    const existingUser = await db.query("SELECT id FROM users WHERE email = $1", [payload.email]);
    if (existingUser.rowCount > 0) {
      throw new ApiError(409, "User with this email already exists");
    }

    const passwordHash = await hashPassword(payload.password);
    const created = await db.query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, full_name, email, role, created_at`,
      [payload.fullName, payload.email, passwordHash, payload.role]
    );

    const user = sanitizeUser(created.rows[0]);
    const token = signToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    res.status(201).json({
      message: "Registration successful",
      user,
      token,
    });
  })
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const payload = loginSchema.parse(req.body);
    const result = await db.query(
      `SELECT id, full_name, email, role, created_at, password_hash
       FROM users
       WHERE email = $1`,
      [payload.email]
    );

    if (result.rowCount === 0) {
      throw new ApiError(401, "Invalid email or password");
    }

    const userRow = result.rows[0];
    const passwordMatches = await comparePassword(payload.password, userRow.password_hash);
    if (!passwordMatches) {
      throw new ApiError(401, "Invalid email or password");
    }

    const user = sanitizeUser(userRow);
    const token = signToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    res.json({
      message: "Login successful",
      user,
      token,
    });
  })
);

router.get(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    const result = await db.query(
      `SELECT id, full_name, email, role, created_at
       FROM users
       WHERE id = $1`,
      [req.user.id]
    );

    if (result.rowCount === 0) {
      throw new ApiError(404, "User not found");
    }

    res.json({ user: sanitizeUser(result.rows[0]) });
  })
);

module.exports = router;

