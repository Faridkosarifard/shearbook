// bot/utils/backend.js
const axios = require("axios");
const logger = require("./logger");
require("dotenv").config();   

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";
const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  // Fail fast with a clear message in logs
  logger.error("[Bot] Missing BOT_TOKEN. Set it in the environment or .env loaded by systemd.");
  throw new Error("BOT_TOKEN is not defined");
}

const client = axios.create({
  baseURL: BACKEND_URL,
  headers: {
    "X-Bot-Token": BOT_TOKEN,
  },
  timeout: 15000,
});

client.interceptors.response.use(
  (r) => r,
  (err) => {
    const cfg = err.config || {};
    const msg = [
      "[Bot] API error:",
      cfg.method?.toUpperCase(), cfg.baseURL + cfg.url,
      "status=", err.response?.status,
      "code=", err.code,
      "data=", JSON.stringify(err.response?.data || {}),
    ].join(" ");
    logger.error(msg);
    return Promise.reject(err);
  }
);

logger.info(`[Bot] Using BACKEND_URL=${BACKEND_URL} | BOT_TOKEN.len=${BOT_TOKEN?.length || 0}`);
module.exports = client;