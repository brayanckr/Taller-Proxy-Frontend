import { api } from './api.js';
import { config } from './config.js';

const SERVICES = [
  { id: 'InventoryService', label: 'Inventario', color: '#2f6fe4' },
  { id: 'OrderService', label: 'Pedidos', color: '#1f9d62' },
  { id: 'PaymentService', label: 'Pagos', color: '#d9822b' },
];
const SERVICE_LABELS = Object.fromEntries(SERVICES.map((service) => [service.id, service.label]));
const STATUS_LABELS = { SUCCESS: 'Exitoso', ERROR: 'Con error' };

const $ = (selector) => document.querySelector(selector);
const filtersForm = $('#filters');
const timeFormat = new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'medium' });
const numberFormat = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });

let page = 0;
let totalPages = 0;
const expanded = new Set();
let chart;

function element(tag, { className, text, dataset } = {}, ...children) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  if (dataset) Object.assign(node.dataset, dataset);
  node.append(...children);
  return node;
}

function showFeedback(text, kind = 'info') {
  const feedback = $('#feedback');
  feedback.textContent = text;
  feedback.dataset.kind = kind;
}

function setStatus(state, text) {
  $('#status .dot').dataset.state = state;
  $('#status-text').textContent = text;
}

function renderCards(summary) {
  const cards = summary.map((item) => {
    const hasProblems = item.errorRate > config.errorRateThreshold;
    const stats = [
      ['Total de llamadas', item.totalCalls],
      ['Tasa de éxito', `${numberFormat.format(item.successRate)} %`],
      ['Tiempo promedio', `${numberFormat.format(item.avgResponseTimeMs)} ms`],
    ].map(([label, value]) =>
      element('div', {}, element('dt', { text: label }), element('dd', { text: value })));
    return element(
      'article',
      { className: 'card', dataset: { problem: hasProblems } },
      element('h3', { text: SERVICE_LABELS[item.serviceId] ?? item.serviceId }),
      element('dl', { className: 'stats' }, ...stats),
      element('p', {
        className: 'card-flag',
        text: hasProblems
          ? `Servicio con problemas: ${numberFormat.format(item.errorRate)} % de errores`
          : 'Funcionamiento normal',
      }),
    );
  });
  $('#service-cards').replaceChildren(...cards);
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
    tension: 0.25,
    pointRadius: 3,
  }));

  if (!chart) {
    chart = new Chart($('#chart'), {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        scales: {
          x: { title: { display: true, text: 'Llamada (de la más antigua a la más reciente)' } },
          y: { beginAtZero: true, title: { display: true, text: 'Tiempo de respuesta (ms)' } },
        },
      },
    });
    return;
  }
  chart.data.labels = labels;
  chart.data.datasets = datasets;
  chart.update();
}

function detailBlock(title, value) {
  return element('section', { className: 'detail-block' }, element('h4', { text: title }), element('pre', { text: value }));
}

function detailRow(entry) {
  const blocks = [
    detailBlock('Parámetros de entrada', JSON.stringify(entry.params, null, 2)),
    entry.status === 'SUCCESS'
      ? detailBlock('Respuesta completa', JSON.stringify(entry.response, null, 2))
      : detailBlock('Error', entry.error ?? 'Sin mensaje'),
  ];
  if (entry.stackTrace) blocks.push(detailBlock('Stack trace', entry.stackTrace));
  const cell = element('td', { className: 'details' }, ...blocks);
  cell.colSpan = 7;
  return element('tr', { className: 'detail-row' }, cell);
}

function logRows(entry) {
  const isOpen = expanded.has(entry.requestId);
  const toggle = element('button', {
    className: 'toggle',
    text: isOpen ? '▾' : '▸',
  });
  toggle.setAttribute('aria-expanded', String(isOpen));
  toggle.setAttribute('aria-label', 'Ver detalles de la llamada');

  const row = element(
    'tr',
    { className: 'log-row', dataset: { status: entry.status } },
    element('td', {}, toggle),
    element('td', { text: timeFormat.format(new Date(entry.timestamp)) }),
    element('td', { className: 'mono', text: entry.requestId }),
    element('td', { text: SERVICE_LABELS[entry.serviceId] ?? entry.serviceId }),
    element('td', { text: entry.operation }),
    element('td', { text: `${entry.durationMs} ms` }),
    element('td', {}, element('span', { className: 'badge', dataset: { status: entry.status }, text: STATUS_LABELS[entry.status] })),
  );
  row.addEventListener('click', () => {
    if (expanded.has(entry.requestId)) expanded.delete(entry.requestId);
    else expanded.add(entry.requestId);
    refreshLogs();
  });
  return isOpen ? [row, detailRow(entry)] : [row];
}

function toIsoOrEmpty(localValue) {
  return localValue ? new Date(localValue).toISOString() : '';
}

async function refreshLogs() {
  const data = new FormData(filtersForm);
  const result = await api.logs({
    service: data.get('service'),
    status: data.get('status'),
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
  $('#page-info').textContent = totalPages ? `Página ${page + 1} de ${totalPages} (${result.totalElements} logs)` : '';
  $('#prev').disabled = page === 0;
  $('#next').disabled = page + 1 >= totalPages;
}

async function refresh() {
  try {
    const [summary] = await Promise.all([api.summary(), refreshLogs(), renderChart()]);
    renderCards(summary);
    setStatus('ok', 'Backend conectado');
  } catch {
    setStatus('error', 'Sin conexión con el backend');
  }
}

$('#simulate').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  showFeedback('Generando 50 llamadas aleatorias…');
  try {
    const result = await api.simulateLoad();
    showFeedback(`Simulación terminada: ${result.success} llamadas exitosas y ${result.errors} con error.`, 'ok');
    page = 0;
  } catch {
    showFeedback('No se pudo ejecutar la simulación. Revisa la conexión con el backend.', 'error');
  } finally {
    button.disabled = false;
  }
  refresh();
});

filtersForm.addEventListener('change', () => {
  page = 0;
  refresh();
});
$('#clear-filters').addEventListener('click', () => {
  filtersForm.reset();
  page = 0;
  refresh();
});
$('#prev').addEventListener('click', () => {
  page = Math.max(0, page - 1);
  refresh();
});
$('#next').addEventListener('click', () => {
  page += 1;
  refresh();
});

refresh();
setInterval(refresh, config.refreshMs);
