import axios from 'axios';

const USER_COLORS = ['#4f46e5', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2'];

export function getUserColor(user) {
  const seed = Number(user?.id) || (user?.name || 'u').charCodeAt(0);
  return USER_COLORS[Math.abs(seed) % USER_COLORS.length];
}

export function getSocketUrl() {
  if (window.location.hostname === 'localhost' && window.location.port === '5173') {
    return 'http://localhost:5000';
  }
  return window.location.origin;
}

export function getCollabWsUrl() {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/collab`;
}

export function isJwtExpiringSoon(token, bufferSeconds = 60) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64));
    if (!payload.exp) return false;
    return payload.exp * 1000 - Date.now() < bufferSeconds * 1000;
  } catch {
    return true;
  }
}

export async function getFreshAuthToken(forceRefresh = false) {
  const existing = localStorage.getItem('accessToken');
  if (!forceRefresh && existing && !isJwtExpiringSoon(existing, 60)) {
    return existing;
  }
  try {
    const res = await axios.post('/api/auth/refresh', {}, { withCredentials: true });
    const nextToken = res.data?.accessToken;
    if (nextToken) {
      localStorage.setItem('accessToken', nextToken);
      return nextToken;
    }
  } catch {
    // Fall back cleanly if refresh fails
  }
  return existing || '';
}
