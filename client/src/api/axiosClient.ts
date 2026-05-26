import axios from 'axios';
import type { AxiosResponse } from 'axios';

interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  meta?: unknown;
}

type AxiosResponseWithMeta<T = unknown> = AxiosResponse<T> & { meta?: unknown };

const isApiResponse = (value: unknown): value is ApiResponse =>
  typeof value === 'object' && value !== null && 'success' in value && 'data' in value;

const axiosClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3009/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor — attach Bearer token
axiosClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Send current app page so backend can authorize by page permission.
    if (typeof window !== 'undefined' && window.location?.pathname) {
      config.headers['x-page-path'] = window.location.pathname;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Response interceptor — handle ApiResponse structure and 401 errors
axiosClient.interceptors.response.use(
  (response) => {
    localStorage.removeItem('time_locked');
    if (isApiResponse(response.data)) {
      const apiResponse = response.data;
      return {
        ...response,
        data: apiResponse.data,
        meta: apiResponse.meta,
      } satisfies AxiosResponseWithMeta;
    }
    return response;
  },
  (error) => {
    const isUnauthorized = error.response?.status === 401;
    const isTimeLocked =
      error.response?.status === 403 &&
      (error.response?.data?.code === 'TIME_LOCKED' || error.response?.data?.error === 'Ngoài khung giờ truy cập hệ thống');

    if (isUnauthorized) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
      localStorage.removeItem('time_locked');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }

    if (isTimeLocked) {
      localStorage.setItem('time_locked', '1');
      if (window.location.pathname !== '/') {
        window.location.href = '/';
      }
    }
    console.error('[axiosClient] Error response:', {
      status: error.response?.status,
      data: error.response?.data,
      url: error.config?.url,
      method: error.config?.method,
    });
    return Promise.reject(error);
  },
);

export default axiosClient;
