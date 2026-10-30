# Observabilidad de Microservicios - Frontend

Dashboard (in Spanish) of the workshop "Proxy de auditoría y logging". It shows the metrics and logs that the Spring Boot backend records for InventoryService, OrderService and PaymentService.

Backend repository: https://github.com/brayanckr/Taller-Proxy-Backend

Plain HTML, CSS and ES modules, plus Chart.js loaded from a CDN. No build step.

## Features

- Three service cards: total calls, success rate and average response time. A service with an error rate above 15% is highlighted in red.
- Line chart (Chart.js) with the response time of the last 20 calls of each service.
- Real-time log table (polling every 3 seconds) with request id, service, operation, duration and status.
- Filters by service, status and date range, with pagination.
- Click on a log to expand its input parameters, full response (or error) and stack trace.
- "Simular carga" button that calls `POST /api/metrics/simulate-load` and refreshes the dashboard.

## Run locally

Start the backend on port 8080, then:

```bash
npm start
```

Open http://localhost:3000.

## Configuration

`config.js` uses `http://localhost:8080` when served from localhost and `PRODUCTION_API_URL` otherwise. Set `PRODUCTION_API_URL` to the public URL of the Railway backend before deploying.

## Deploy (Vercel)

Static project: framework preset "Other", no build command, output directory = repository root.

## Production

- Frontend (Vercel): https://taller-proxy-frontend-tau.vercel.app
- Backend (Railway): https://backend-production-7a2b.up.railway.app
