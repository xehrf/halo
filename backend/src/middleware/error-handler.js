const ApiError = require("../utils/api-error");

const errorHandler = (error, _req, res, _next) => {
  if (error instanceof ApiError) {
    return res.status(error.statusCode).json({
      message: error.message,
      details: error.details,
    });
  }

  if (error?.name === "ZodError") {
    return res.status(400).json({
      message: "Validation error",
      details: error.issues,
    });
  }

  console.error(error);
  return res.status(500).json({
    message: "Internal server error",
  });
};

module.exports = errorHandler;

