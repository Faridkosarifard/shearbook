const axios = require("axios");
require("dotenv").config();

const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";
const BOT_TOKEN = process.env.BOT_TOKEN;

function createClient({ baseURL = BACKEND_URL, token = BOT_TOKEN } = {}) {
  if (!token) {
    throw new Error("BOT_TOKEN is not defined");
  }
  const client = axios.create({
    baseURL,
    headers: { "X-Bot-Token": token },
    timeout: 15000,
  });
  return client;
}

module.exports = { createClient, BACKEND_URL };
