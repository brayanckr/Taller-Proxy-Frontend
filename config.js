const PRODUCTION_API_URL = 'https://backend-production-7a2b.up.railway.app';
const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);

export const config = {
  apiUrl: window.API_URL || (isLocal ? 'http://localhost:8080' : PRODUCTION_API_URL),
  refreshMs: 3000,
  chartPoints: 20,
  pageSize: 10,
  errorRateThreshold: 15,
};
