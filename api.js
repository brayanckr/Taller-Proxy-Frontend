import { config } from './config.js';

async function request(path, options) {
  const response = await fetch(`${config.apiUrl}${path}`, options);
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }
  return response.json();
}

function toQuery(params) {
  const entries = Object.entries(params).filter(([, value]) => value !== '' && value != null);
  return new URLSearchParams(entries).toString();
}

export const api = {
  summary: () => request('/api/metrics/summary'),
  logs: (params) => request(`/api/metrics/logs?${toQuery(params)}`),
  simulateLoad: () => request('/api/metrics/simulate-load', { method: 'POST' }),
};
