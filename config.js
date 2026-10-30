// Demo configuration. In a real deployment the viewer key would come from a login flow.
export const config = {
  apiUrl: window.LOGS_API_URL || 'http://localhost:4000',
  viewerKey: 'dashboard-key',
  refreshMs: 3000,
  producers: [
    { name: 'auth-service', apiKey: 'producer-key-auth' },
    { name: 'payments-service', apiKey: 'producer-key-payments' },
    { name: 'orders-service', apiKey: 'producer-key-orders' },
  ],
};
