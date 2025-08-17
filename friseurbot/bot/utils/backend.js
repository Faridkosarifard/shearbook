// bot/utils/backend.js
const axios = require("axios");

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";
const BOT_TOKEN = process.env.BOT_TOKEN || process.env.X_BOT_TOKEN;

const client = axios.create({
  baseURL: BACKEND_URL,
  headers: {
    "X-Bot-Token": BOT_TOKEN,
  },
  timeout: 15000,
});

module.exports = client;
