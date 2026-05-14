// ============================================
// API Client
// ============================================

// Use relative path for same-origin API calls in production
const API_URL = '/api';

function getAuthHeader() {
  const user = JSON.parse(localStorage.getItem('comepos_session') || 'null');
  return user && user.token ? { 'Authorization': `Bearer ${user.token}` } : {};
}

async function fetchAPI(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...getAuthHeader(),
    ...options.headers
  };

  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers
    });

    if (response.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('comepos_session');
      window.location.hash = '';
      window.location.reload();
      return null;
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Error en la petición');
    }

    return data;
  } catch (err) {
    console.error(`API Error (${endpoint}):`, err);
    throw err;
  }
}

export const api = {
  get: (endpoint) => fetchAPI(endpoint),
  post: (endpoint, body) => fetchAPI(endpoint, { method: 'POST', body: JSON.stringify(body) }),
  put: (endpoint, body) => fetchAPI(endpoint, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (endpoint) => fetchAPI(endpoint, { method: 'DELETE' }),

  // Auth helpers
  login: async (username, password) => {
    const res = await fetchAPI('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    // Save token and user info
    const sessionData = { ...res.user, token: res.token };
    localStorage.setItem('comepos_session', JSON.stringify(sessionData));
    return sessionData;
  },

  logout: () => {
    localStorage.removeItem('comepos_session');
  },

  getCurrentUser: () => {
    return JSON.parse(localStorage.getItem('comepos_session') || 'null');
  }
};
