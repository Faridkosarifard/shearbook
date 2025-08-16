// api.ts
import axios, { AxiosHeaders, InternalAxiosRequestConfig } from "axios";

const BASE_URL = import.meta.env.VITE_API_URL || "/api";
const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
});

function getCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp("(^|; )" + name + "=([^;]*)"));
  return m ? decodeURIComponent(m[2]) : null;
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const method = (config.method ?? "get").toLowerCase();
  const needsCsrf = ["post", "put", "patch", "delete"].includes(method);

  if (needsCsrf) {
    const csrf = getCookie("csrf_token");
    if (csrf) {
      if (config.headers instanceof AxiosHeaders) {
        config.headers.set("X-CSRF-Token", csrf);
      } else {
        // اطمینان از سازگاری تایپی
        const hdrs = new AxiosHeaders(config.headers as any);
        hdrs.set("X-CSRF-Token", csrf);
        config.headers = hdrs;
      }
    }
  }
  return config;
});

export default api;
