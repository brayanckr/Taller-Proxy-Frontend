import { api, ApiError } from './api.js';
import { config } from './config.js';

const LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];

const LEVEL_LABELS = {
  DEBUG: 'Depuración',
  INFO: 'Información',
  WARN: 'Advertencia',
  ERROR: 'Error',
  FATAL: 'Crítico',
};

const METRIC_LABELS = [
  ['totalRequests', 'Peticiones recibidas'],
  ['forwarded', 'Reenviadas al servicio de logs'],
  ['cacheHits', 'Respondidas desde caché'],
  ['unauthorized', 'Rechazadas por clave inválida'],
  ['forbidden', 'Rechazadas por falta de permisos'],
  ['rejected', 'Rechazadas por datos inválidos'],
  ['rateLimited', 'Bloqueadas por límite de uso'],
  ['redactions', 'Datos sensibles ocultados'],
  ['buffered', 'Guardadas en cola (servicio caído)'],
  ['pendingBuffer', 'Pendientes en cola'],
];

const ERROR_MESSAGES = {
  unauthorized: 'El proxy rechazó la petición: clave de API inválida (401).',
  forbidden: 'El proxy rechazó la petición: permisos insuficientes (403).',
  service_mismatch: 'El proxy rechazó la petición: el emisor no coincide con la clave (403).',
  rate_limited: 'El proxy bloqueó la petición: demasiadas solicitudes (429).',
  invalid_log: 'El proxy rechazó el log por datos inválidos (400).',
  network_error: 'No se pudo conectar con el proxy. ¿Está en ejecución?',
};

const $ = (selector) => document.querySelector(selector);
const dateFormat = new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'medium' });

const filtersForm = $('#filters');
const sendForm = $('#send-form');
const feedback = $('#feedback');

function showFeedback(text, kind = 'info') {
  feedback.textContent = text;
  feedback.dataset.kind = kind;
}

function describeError(error) {
  return ERROR_MESSAGES[error.code] ?? 'Ocurrió un error inesperado.';
}

function currentFilters() {
  return Object.fromEntries(new FormData(filtersForm));
}

function renderLevelCards(stats) {
  $('#level-cards').replaceChildren(
    ...LEVELS.map((level) => {
      const card = document.createElement('article');
      card.className = 'card';
      card.dataset.level = level;
      const count = document.createElement('strong');
      count.textContent = stats.byLevel[level] ?? 0;
      const label = document.createElement('span');
      label.textContent = LEVEL_LABELS[level];
      card.append(count, label);
      return card;
    }),
  );
}

function renderLogs(logs) {
  const rows = logs.map((log) => {
    const row = document.createElement('tr');
    const cells = [
      dateFormat.format(new Date(log.timestamp)),
      null,
      log.service,
      log.message,
    ].map((text) => {
      const cell = document.createElement('td');
      if (text !== null) cell.textContent = text;
      return cell;
    });
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.dataset.level = log.level;
    badge.textContent = LEVEL_LABELS[log.level];
    cells[1].append(badge);
    row.append(...cells);
    return row;
  });
  $('#logs-body').replaceChildren(...rows);
  $('#logs-empty').hidden = logs.length > 0;
}

function renderMetrics(metrics) {
  const items = METRIC_LABELS.flatMap(([key, label]) => {
    const term = document.createElement('dt');
    term.textContent = label;
    const value = document.createElement('dd');
    value.textContent = metrics[key] ?? 0;
    return [term, value];
  });
  $('#metrics').replaceChildren(...items);
}

function setStatus(state, text) {
  $('#status .dot').dataset.state = state;
  $('#status-text').textContent = text;
}

async function refresh() {
  try {
    const [health, logs, stats, metrics] = await Promise.all([
      api.health(),
      api.listLogs(currentFilters()),
      api.stats(),
      api.metrics(),
    ]);
    setStatus(
      health.status === 'ok' ? 'ok' : 'warn',
      health.status === 'ok' ? 'Proxy y servicio de logs activos' : 'Proxy activo, servicio de logs caído',
    );
    renderLogs(logs);
    renderLevelCards(stats);
    renderMetrics(metrics);
  } catch (error) {
    setStatus('error', error instanceof ApiError ? describeError(error) : 'Sin conexión');
  }
}

async function sendLog(producer, level, message) {
  return api.sendLog(producer.apiKey, { level, message });
}

sendForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(sendForm);
  const producer = config.producers.find((item) => item.name === data.get('producer'));
  try {
    const result = await sendLog(producer, data.get('level'), data.get('message'));
    showFeedback(
      result.status === 'stored'
        ? 'Log almacenado correctamente. Revisa si el proxy ocultó datos sensibles.'
        : 'El servicio de logs no responde: el proxy guardó el log en cola.',
      'ok',
    );
    sendForm.elements.message.value = '';
  } catch (error) {
    showFeedback(describeError(error), 'error');
  }
  refresh();
});

$('#burst').addEventListener('click', async () => {
  const outcomes = await Promise.allSettled(
    Array.from({ length: 10 }, (_, index) => {
      const producer = config.producers[index % config.producers.length];
      const level = LEVELS[index % LEVELS.length];
      return sendLog(producer, level, `Log de la ráfaga número ${index + 1}`);
    }),
  );
  const accepted = outcomes.filter((outcome) => outcome.status === 'fulfilled').length;
  showFeedback(`Ráfaga enviada: ${accepted} aceptados, ${outcomes.length - accepted} rechazados.`, accepted ? 'ok' : 'error');
  refresh();
});

$('#bad-key').addEventListener('click', async () => {
  try {
    await api.sendLog('clave-falsa', { level: 'INFO', message: 'Intento no autorizado' });
    showFeedback('Inesperado: el proxy aceptó una clave inválida.', 'error');
  } catch (error) {
    showFeedback(describeError(error), 'error');
  }
  refresh();
});

filtersForm.addEventListener('input', refresh);
filtersForm.addEventListener('submit', (event) => event.preventDefault());

let timer;
function applyAutoRefresh() {
  clearInterval(timer);
  if ($('#auto-refresh').checked) timer = setInterval(refresh, config.refreshMs);
}
$('#auto-refresh').addEventListener('change', applyAutoRefresh);

sendForm.elements.producer.replaceChildren(
  ...config.producers.map((producer) => new Option(producer.name, producer.name)),
);

applyAutoRefresh();
refresh();
