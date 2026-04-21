const express = require("express");
const db = require("../config/db");
const asyncHandler = require("../utils/async-handler");

const router = express.Router();

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    await db.query("SELECT 1");
    res.json({
      status: "ok",
      service: "halo-api",
      timestamp: new Date().toISOString(),
    });
  })
);

module.exports = router;

