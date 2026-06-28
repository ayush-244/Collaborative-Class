import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL ? `${import.meta.env.VITE_BACKEND_URL}/api` : "/api";
const TOKEN_STORAGE_KEY = "collabclass-jwt";

export const tokenStorage = {
  get: () => window.localStorage.getItem(TOKEN_STORAGE_KEY),
  set: (token: string) => window.localStorage.setItem(TOKEN_STORAGE_KEY, token),
  clear: () => window.localStorage.removeItem(TOKEN_STORAGE_KEY)
};

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true
});

api.interceptors.request.use((config) => {
  const token = tokenStorage.get();
  if (token) {
    if (config.headers && typeof (config.headers as any).set === "function") {
      (config.headers as any).set("Authorization", `Bearer ${token}`);
    } else {
      config.headers = {
        ...(config.headers ?? {}),
        Authorization: `Bearer ${token}`
      } as any;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      tokenStorage.clear();
      try {
        const current = window.location.pathname;
        if (current !== "/login" && current !== "/register") {
          window.location.href = "/login";
        }
      } catch {
        // ignore navigation errors
      }
    }
    return Promise.reject(error);
  }
);

