// bot/utils/logger.js
/**
 * Winston-based logger for the WhatsApp bot.
 * - Console + file transports
 * - Pretty timestamps and colored levels
 * - Full error stack traces
 * - Configurable via env: LOG_LEVEL (e.g., "debug")
 */

const fs = require("fs");
const path = require("path");
const { createLogger, format, transports } = require("winston");

// Ensure logs directory exists
const logDir = path.join(__dirname, "../../logs");
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logger = createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: format.combine(
    format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    format.errors({ stack: true }), // include error stacks
    format.colorize({ all: true }),
    format.printf(({ timestamp, level, message, stack }) => {
      // Prefer stack for errors; fallback to message
      return stack
        ? `${timestamp} | ${level} | ${stack}`
        : `${timestamp} | ${level} | ${message}`;
    })
  ),
  transports: [
    new transports.Console(),
    new transports.File({
      filename: path.join(logDir, "bot.log"),
      maxsize: 5 * 1024 * 1024, // 5MB
      maxFiles: 3,              // keep 3 rotated files
    }),
  ],
});

// Optional: stream helper (e.g., for morgan or piping)
logger.stream = {
  write: (msg) => logger.info(msg.trim()),
};

module.exports = logger;
