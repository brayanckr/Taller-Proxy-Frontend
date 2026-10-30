import { api } from './api.js';
import { config } from './config.js';

const SERVICES = [
  { id: 'InventoryService', label: 'Inventario', icon: 'boxes', color: '#5b9bff' },
  { id: 'OrderService', label: 'Pedidos', icon: 'shopping-cart', color: '#34d399' },
  { id: 'PaymentService', label: 'Pagos', icon: 'credit-card', color: '#fbbf24' },
];
const SERVICE_BY_ID = Object.fromEntries(SERVICES.map((service) => [service.id, service]));
const STATUS_LABELS = { SUCCESS: 'Exitoso', ERROR: 'Con error' };
const DEGRADED_THRESHOLD = 5;

const $ = (selector) => document.querySelector(selector);
const filtersForm = $('#filters');
const timeFormat = new Intl.DateTimeFormat('es-CO', { timeStyle: 'medium' });
const numberFormat = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });

const filters = { service: '', status: '' };
let page = 0;
let totalPages = 0;
let animateNext = true;
let chart;
const expanded = new Set();

function icon(name) {
  const node = document.createElement('i');
  node.dataset.lucide = name;
  return node;
}

function element(tag, { className, text, dataset, style } = {}, ...children) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  if (dataset) Object.assign(node.dataset, dataset);
  if (style) for (const [key, value] of Object.entries(style)) node.style.setProperty(key, value);
  node.append(...children);
  return node;
}

function enterProps(index) {
  return animateNext ? { className: 'enter', style: { '--i': index } } : {};
}

function showFeedback(text, kind = 'info') {
  const feedback = $('#feedback');
  feedback.textContent = text;
  feedback.dataset.kind = kind;
}

function setBadge(id, state, text) {
  const badge = $(id);
  badge.dataset.state = state;
  if (text) badge.querySelector('span').textContent = text;
}

function healthOf(errorRate) {
  if (errorRate > config.errorRateThreshold) return 'bad';
  if (errorRate > DEGRADED_THRESHOLD) return 'warn';
  return 'ok';
}

const HEALTH_NOTES = {
  ok: ['circle-check', 'Operativo'],
  warn: ['triangle-alert', 'Degradado'],
  bad: ['siren', 'Servicio con problemas'],
};

function renderCards(summary) {
  const cards = summary.map((item, index) => {
    const service = SERVICE_BY_ID[item.serviceId];
    const health = healthOf(item.errorRate);
    const [noteIcon, noteText] = HEALTH_NOTES[health];
    const stats = [
      ['Llamadas', item.totalCalls],
      ['Éxito', `${numberFormat.format(item.successRate)}%`],
      ['Promedio', `${numberFormat.format(item.avgResponseTimeMs)} ms`],
    ].map(([label, value]) => element('div', {}, element('dt', { text: label }), element('dd', { text: value })));
    return element(
      'article',
      { ...enterProps(index), dataset: { health } },
      element('div', { className: 'card-head' },
        element('span', { className: 'card-icon' }, icon(service?.icon ?? 'server')),
        element('h3', { text: service?.label ?? item.serviceId }),
        element('span', { className: 'badge', dataset: { state: health } }, icon(noteIcon), element('span', { text: noteText }))),
      element('dl', { className: 'stats' }, ...stats),
      element('p', { className: 'card-note' }, icon(noteIcon),
        element('span', { text: health === 'bad' ? `${numberFormat.format(item.errorRate)}% de errores, supera el ${config.errorRateThreshold}%` : `${numberFormat.format(item.errorRate)}% de errores` })),
    );
  });
  const container = $('#service-cards');
  container.replaceChildren(...cards);
  for (const card of cards) card.classList.add('card');
}

function renderBanner(summary, latencyMs, todayCount) {
  const total = summary.reduce((sum, item) => sum + item.totalCalls, 0);
  const alerts = summary.filter((item) => item.errorRate > config.errorRateThreshold).length;
  $('#m-total').textContent = total;
  $('#m-alerts').textContent = alerts;
  $('#m-today').textContent = todayCount;
  $('#m-latency').textContent = `${latencyMs} ms`;
  setBadge('#conn-badge', 'ok', 'Proxy activo');
  $('#m-alerts').style.color = alerts ? 'var(--bad)' : '';
}

async function renderChart() {
  const responses = await Promise.all(
    SERVICES.map((service) => api.logs({ service: service.id, size: config.chartPoints })),
  );
  const series = responses.map((response) => response.content.slice().reverse());
  const labels = Array.from({ length: config.chartPoints }, (_, index) => index + 1);
  const datasets = SERVICES.map((service, index) => ({
    label: service.label,
    data: series[index].map((entry) => entry.durationMs),
    borderColor: service.color,
    backgroundColor: service.color,
    tension: 0.3,
    pointRadius: 2.5,
    borderWidth: 2,
  }));

  if (!chart) {
    Chart.defaults.color = '#94a0b4';
    Chart.defaults.font.family = "'JetBrains Mono', monospace";
    Chart.defaults.font.size = 11;
    chart = new Chart($('#chart'), {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 500 },
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { labels: { usePointStyle: true, boxWidth: 8 } } },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.05)' }, title: { display: true, text: 'Llamada (de la más antigua a la más reciente)' } },
          y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.06)' }, title: { display: true, text: 'Tiempo de respuesta (ms)' } },
        },
      },
    });
    return;
  }
  chart.data.labels = labels;
  chart.data.datasets = datasets;
  chart.update('none');
}

function detailBlock(iconName, title, value) {
  return element('section', { className: 'detail-block' },
    element('h4', {}, icon(iconName), element('span', { text: title })),
    element('pre', { text: value }));
}

function detailRow(entry) {
  const blocks = [
    detailBlock('log-in', 'Parámetros de entrada', JSON.stringify(entry.params, null, 2)),
    entry.status === 'SUCCESS'
      ? detailBlock('package-check', 'Respuesta completa', JSON.stringify(entry.response, null, 2))
      : detailBlock('circle-alert', 'Error', entry.error ?? 'Sin mensaje'),
  ];
  if (entry.stackTrace) blocks.push(detailBlock('bug', 'Stack trace', entry.stackTrace));
  blocks.push(detailBlock('fingerprint', 'ID de solicitud', entry.requestId));
  const cell = element('td', {}, element('div', { className: 'details' }, ...blocks));
  cell.colSpan = 7;
  return element('tr', { className: 'detail-row' }, cell);
}

function logRows(entry, index) {
  const isOpen = expanded.has(entry.requestId);
  const service = SERVICE_BY_ID[entry.serviceId];
  const toggle = element('button', { className: 'toggle' }, icon('chevron-right'));
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', String(isOpen));
  toggle.setAttribute('aria-label', 'Ver detalles de la llamada');
  const ok = entry.status === 'SUCCESS';

  const row = element(
    'tr',
    { ...(animateNext ? { className: 'enter', style: { '--i': index } } : {}), dataset: { status: entry.status, open: isOpen } },
    element('td', {}, toggle),
    element('td', { text: timeFormat.format(new Date(entry.timestamp)) }),
    element('td', { text: entry.requestId.slice(0, 8), dataset: {} }),
    element('td', {}, element('span', { className: 'svc' }, icon(service?.icon ?? 'server'), element('span', { text: service?.label ?? entry.serviceId }))),
    element('td', { text: entry.operation }),
    element('td', { className: 'num', text: `${entry.durationMs} ms` }),
    element('td', {}, element('span', { className: 'badge', dataset: { state: ok ? 'ok' : 'bad' } },
      icon(ok ? 'circle-check' : 'circle-x'), element('span', { text: STATUS_LABELS[entry.status] }))),
  );
  row.classList.add('log-row');
  row.children[2].title = entry.requestId;
  row.addEventListener('click', () => {
    if (expanded.has(entry.requestId)) expanded.delete(entry.requestId);
    else expanded.add(entry.requestId);
    refreshLogs().then(() => lucide.createIcons());
  });
  return isOpen ? [row, detailRow(entry)] : [row];
}

function toIsoOrEmpty(localValue) {
  return localValue ? new Date(localValue).toISOString() : '';
}

async function refreshLogs() {
  const data = new FormData(filtersForm);
  const result = await api.logs({
    service: filters.service,
    status: filters.status,
    from: toIsoOrEmpty(data.get('from')),
    to: toIsoOrEmpty(data.get('to')),
    page,
    size: config.pageSize,
  });
  totalPages = result.totalPages;
  if (page > 0 && page >= totalPages) {
    page = Math.max(0, totalPages - 1);
    return refreshLogs();
  }
  $('#logs-body').replaceChildren(...result.content.flatMap(logRows));
  $('#logs-empty').hidden = result.content.length > 0;
  $('#page-info').textContent = totalPages ? `${page + 1} / ${totalPages} · ${result.totalElements} logs` : '';
  $('#prev').disabled = page === 0;
  $('#next').disabled = page + 1 >= totalPages;
}

async function refresh() {
  const routeBadge = $('#route-badge');
  routeBadge.classList.add('is-routing');
  try {
    const started = performance.now();
    const summary = await api.summary();
    const latencyMs = Math.round(performance.now() - started);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const [, , today] = await Promise.all([
      refreshLogs(),
      renderChart(),
      api.logs({ from: startOfDay.toISOString(), size: 1 }),
    ]);
    renderCards(summary);
    renderBanner(summary, latencyMs, today.totalElements);
  } catch {
    setBadge('#conn-badge', 'bad', 'Sin conexión');
  } finally {
    routeBadge.classList.remove('is-routing');
    animateNext = false;
    lucide.createIcons();
  }
}

function replay() {
  animateNext = true;
  return refresh();
}

$('#simulate').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  button.classList.add('is-loading');
  showFeedback('Generando 50 llamadas aleatorias a través del proxy…');
  try {
    const result = await api.simulateLoad();
    showFeedback(`Simulación terminada: ${result.success} llamadas exitosas y ${result.errors} con error.`, 'ok');
    page = 0;
  } catch {
    showFeedback('No se pudo ejecutar la simulación. Revisa la conexión con el backend.', 'error');
  } finally {
    button.disabled = false;
    button.classList.remove('is-loading');
  }
  replay();
});

for (const group of document.querySelectorAll('.chip-group')) {
  group.addEventListener('click', (event) => {
    const chip = event.target.closest('.chip');
    if (!chip) return;
    filters[group.dataset.group] = chip.dataset.value;
    for (const other of group.querySelectorAll('.chip')) other.setAttribute('aria-pressed', String(other === chip));
    page = 0;
    replay();
  });
}

filtersForm.addEventListener('change', (event) => {
  if (event.target.type !== 'datetime-local') return;
  page = 0;
  replay();
});

$('#clear-filters').addEventListener('click', () => {
  filtersForm.reset();
  filters.service = '';
  filters.status = '';
  for (const chip of document.querySelectorAll('.chip')) chip.setAttribute('aria-pressed', String(chip.dataset.value === ''));
  page = 0;
  replay();
});
$('#prev').addEventListener('click', () => {
  page = Math.max(0, page - 1);
  replay();
});
$('#next').addEventListener('click', () => {
  page += 1;
  replay();
});

$('#endpoint').textContent = config.apiUrl.replace(/^https?:\/\//, '');
const secure = config.apiUrl.startsWith('https://');
setBadge('#tls-badge', secure ? 'ok' : 'warn', secure ? 'TLS activo' : 'Local, sin TLS');

lucide.createIcons();
refresh();
setInterval(refresh, config.refreshMs);
