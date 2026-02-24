import axios from 'axios';

const BASE = import.meta.env.PROD ? '/mintstock/api' : '/api';

export const api = axios.create({
  baseURL: BASE,
  withCredentials: true,
});

// Interceptor: 401 → редирект на MintAuth
api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      window.location.href = '/mintauth/auth/login?redirect=/mintstock/';
    }
    return Promise.reject(err);
  }
);
