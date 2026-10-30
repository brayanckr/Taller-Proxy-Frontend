import { config } from './config.js';

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request(path, { apiKey = config.viewerKey, ...options } = {}) {
  let response;
  try {
    response = await fetch(`${config.apiUrl}${path}`, {
      ...options,
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, ...options.headers },
    });
  } catch {
    throw new ApiError(0, 'network_error', 'network error');
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(response.status, body.error ?? 'error', body.message ?? 'request failed');
  }
  return body;
}

export const api = {
  health: () => request('/api/health'),
  listLogs: (filters) => {
    const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value)).toString();
    return request(`/api/logs?limit=100${query ? `&${query}` : ''}`);
  },
  stats: () => request('/api/logs/stats'),
  metrics: () => request('/api/metrics'),
  sendLog: (apiKey, log) => request('/api/logs', { apiKey, method: 'POST', body: JSON.stringify(log) }),
};
