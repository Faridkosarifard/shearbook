// api.ts
/**
 * Central axios client for Admin UI.
 * - Uses VITE_API_URL (default http://127.0.0.1:8000)
 * - Sends cookies (withCredentials)
 * - Adds X-CSRF-Token header for state-changing requests from csrf_token cookie
 */

import axios, { AxiosRequestConfig } from "axios";

const BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

// Read a cookie by name (simple parser)
function getCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp("(^|; )" + name + "=([^;]*)"));
  return m ? decodeURIComponent(m[2]) : null;
}

const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  timeout: 10000,
});

// Attach CSRF for state-changing methods
api.interceptors.request.use((config: AxiosRequestConfig) => {
  const method = (config.method || "get").toLowerCase();
  const needsCsrf = ["post", "put", "patch", "delete"].includes(method);
  if (needsCsrf) {
    const csrf = getCookie("csrf_token");
    if (csrf) {
      (config.headers ||= {})["X-CSRF-Token"] = csrf;
    }
  }
  return config;
});

export default api;
