// bot/utils/backend.js
const axios = require("axios");
require("dotenv").config();   

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";
const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  // Fail fast with a clear message in logs
  console.error("[Bot] Missing BOT_TOKEN. Set it in the environment or .env loaded by systemd.");
  throw new Error("BOT_TOKEN is not defined");
}

const client = axios.create({
  baseURL: BACKEND_URL,
  headers: {
    "X-Bot-Token": BOT_TOKEN,
  },
  timeout: 15000,
});

module.exports = client;
