import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 globally
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// Auth
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
};

// Videos
export const videoAPI = {
  list: (params) => api.get('/videos', { params }),
  get: (id) => api.get(`/videos/${id}`),
  upload: (formData, onUploadProgress) =>
    api.post('/videos/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress,
    }),
  update: (id, data) => api.patch(`/videos/${id}`, data),
  delete: (id) => api.delete(`/videos/${id}`),
  getStreamUrl: (id) => `/api/videos/${id}/stream`,
};

// Admin
export const adminAPI = {
  getUsers: (params) => api.get('/admin/users', { params }),
  updateRole: (id, role) => api.patch(`/admin/users/${id}/role`, { role }),
  updateStatus: (id, isActive) => api.patch(`/admin/users/${id}/status`, { isActive }),
  getStats: () => api.get('/admin/stats'),
};

export default api;
