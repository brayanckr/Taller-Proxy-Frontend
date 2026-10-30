# Taller Proxy - Frontend

Dashboard (in Spanish) to watch the logs that reach the microservices through the proxy.
Plain HTML, CSS and ES modules: no build step and no dependencies.

Backend repository: https://github.com/brayanckr/Taller-Proxy-Backend

## Features

- Log table with filters by level, service and message text, auto-refreshed every 3 seconds.
- Counters per level and connection status of the proxy and the log service.
- Proxy panel: requests forwarded, served from cache, rejected, rate limited, redacted and buffered.
- Test tools: send a single log, send a burst of 10, and try an invalid API key to see the proxy reject it.

## Run

Start the backend first (`npm start` in the backend repository), then:

```bash
npm start
```

Open http://localhost:3000. To point to another proxy, set `window.LOGS_API_URL` before loading `app.js`, or edit `config.js`.

The API keys in `config.js` are demo values for the workshop.
