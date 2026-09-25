/* LabelGo Agent — renderer logic */
/* global labelgo */

const $ = (sel) => document.querySelector(sel);

const ICONS = {
  info: `<svg width="17" height="17" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#111827"/><line x1="12" y1="8" x2="12" y2="8.01" stroke="#FFFDF8" stroke-width="2.4"/><line x1="12" y1="12" x2="12" y2="16" stroke="#FFFDF8" stroke-width="2.4"/></svg>`,
  ok: `<svg width="17" height="17" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#22C55E"/><path d="m8.5 12.5 2.5 2.5 5-5.5" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  error: `<svg width="17" height="17" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#EF4444"/><path d="M9 9l6 6M15 9l-6 6" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round"/></svg>`,
};

let state = null;
let printers = [];
let autostart = true;

// ---------------------------------------------------------------------------
// Window controls
// ---------------------------------------------------------------------------
$('#wc-min').addEventListener('click', () => labelgo.minimize());
$('#wc-max').addEventListener('click', () => labelgo.toggleMaximize());
$('#wc-close').addEventListener('click', () => labelgo.closeWindow());

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

async function refreshPrinters() {
  const sel = $('#printer-select');
  sel.innerHTML = '';
  $('#printers-count').textContent = 'Procurando impressoras…';
  printers = await labelgo.listPrinters();
  if (printers.length === 0) {
    const opt = document.createElement('option');
    opt.textContent = 'Nenhuma impressora detectada';
    opt.disabled = true;
    sel.appendChild(opt);
    $('#printers-count').textContent = 'Nenhuma impressora encontrada';
  } else {
    for (const p of printers) {
      const opt = document.createElement('option');
      opt.value = p;
      opt.textContent = p;
      sel.appendChild(opt);
    }
    if (state?.printerName && printers.includes(state.printerName)) {
      sel.value = state.printerName;
    }
    $('#printers-count').textContent = `${printers.length} impressora(s) encontradas`;
  }
}

$('#btn-refresh-printers').addEventListener('click', refreshPrinters);

$('#row-autostart').addEventListener('click', async () => {
  autostart = !autostart;
  $('#toggle-autostart').classList.toggle('on', autostart);
});

$('#adv-toggle').addEventListener('click', async () => {
  const panel = $('#adv-panel');
  const willShow = panel.hidden;
  panel.hidden = !willShow;
  if (willShow) {
    const config = await labelgo.getConfig();
    $('#server-url').value = config.serverUrl || 'https://app.labelgo.com.br';
  }
});

$('#btn-test-ob').addEventListener('click', async () => {
  const btn = $('#btn-test-ob');
  const printerName = $('#printer-select').value;
  if (!printerName) {
    $('#ob-error').textContent = 'Selecione uma impressora para testar.';
    $('#ob-error').hidden = false;
    return;
  }
  await labelgo.setPrinter(printerName);
  btn.disabled = true;
  try {
    await labelgo.testPrint();
    showObNotice('Etiqueta de teste enviada. Verifique a impressora.');
  } catch (err) {
    showObError(`Falha no teste: ${err.message}`);
  } finally {
    btn.disabled = false;
  }
});

function showObError(msg) {
  const el = $('#ob-error');
  el.style.color = '#B42318';
  el.textContent = msg;
  el.hidden = false;
}
function showObNotice(msg) {
  const el = $('#ob-error');
  el.style.color = '#22C55E';
  el.textContent = msg;
  el.hidden = false;
}

$('#btn-pair').addEventListener('click', async () => {
  const code = $('#pair-code').value.trim();
  const printerName = $('#printer-select').value;
  if (!code) return showObError('Digite o código de pareamento do painel LabelGo.');
  if (!printerName) return showObError('Selecione uma impressora.');

  const btn = $('#btn-pair');
  btn.disabled = true;
  btn.firstChild.textContent = 'Pareando… ';
  try {
    const advUrl = $('#adv-panel').hidden ? undefined : $('#server-url').value;
    await labelgo.pair({ code, printerName, autostart, serverUrl: advUrl });
    await labelgo.setAutostart(autostart);
    // state event will swap the view
  } catch (err) {
    showObError(err.message || 'Pareamento falhou. Confira o código.');
    btn.disabled = false;
    btn.firstChild.textContent = 'Parear e continuar ';
  }
});

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

const BANNER_DEFS = {
  subscription: {
    cls: 'danger', title: 'Assinatura inativa',
    body: 'O servidor recusou a conexão (403). Verifique sua assinatura para continuar imprimindo.',
    action: 'Ver assinatura', handler: () => labelgo.openSubscription(),
  },
  auth: {
    cls: 'danger', title: 'Sessão expirada (401).',
    body: 'Faça o pareamento novamente.',
    action: 'Re-parear', solid: true, handler: async () => labelgo.unpair(),
  },
  offline: {
    cls: 'network', title: 'Sem conexão',
    body: () => `Não foi possível alcançar o servidor. Nova tentativa em ${retryCountdown()} s.`,
    action: 'Tentar agora', handler: () => labelgo.retryNow(),
  },
  no_printer: {
    cls: 'warning', title: 'Nenhuma impressora configurada',
    body: 'Escolha uma impressora para receber as etiquetas.',
    action: 'Selecionar impressora', handler: () => openPrinterPicker(),
  },
};

function retryCountdown() {
  if (!state?.nextRetryAt) return 5;
  const s = Math.max(0, Math.ceil((new Date(state.nextRetryAt).getTime() - Date.now()) / 1000));
  return s;
}

function renderBanners() {
  const wrap = $('#banners');
  wrap.innerHTML = '';
  const err = state?.lastError;
  const def = err && BANNER_DEFS[err.kind];
  if (!def) return;

  const el = document.createElement('div');
  el.className = `banner ${def.cls}`;
  el.innerHTML = `
    <div class="b-text">
      <div class="b-title"></div>
      <div class="b-body"></div>
    </div>
    <button class="b-btn${def.solid ? ' solid' : ''}"></button>`;
  el.querySelector('.b-title').textContent = def.title;
  el.querySelector('.b-body').textContent = typeof def.body === 'function' ? def.body() : def.body;
  const btn = el.querySelector('.b-btn');
  btn.textContent = def.action;
  btn.addEventListener('click', def.handler);
  wrap.appendChild(el);
}

function renderLog() {
  const wrap = $('#log-rows');
  wrap.innerHTML = '';
  const items = state?.log || [];
  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'log-empty';
    empty.textContent = 'Aguardando etiquetas…';
    wrap.appendChild(empty);
    return;
  }
  for (const item of items.slice(0, 30)) {
    const row = document.createElement('div');
    row.className = 'log-row';
    row.innerHTML = `<span class="log-time"></span><span class="log-icon">${ICONS[item.icon] || ICONS.info}</span><span class="log-text"></span>`;
    row.querySelector('.log-time').textContent = item.at;
    row.querySelector('.log-text').textContent = item.text;
    wrap.appendChild(row);
  }
}

function formatHeartbeat() {
  if (!state?.lastHeartbeatAt) return '';
  const s = Math.max(0, Math.round((Date.now() - new Date(state.lastHeartbeatAt).getTime()) / 1000));
  return `Último heartbeat há ${s} s`;
}

function renderStatusPill() {
  const pill = $('#status-pill');
  const text = $('#status-pill-text');
  pill.classList.remove('paused', 'errored');
  const dot = pill.querySelector('.dot');
  dot.className = 'dot dot-green';
  if (state?.paused) {
    pill.classList.add('paused');
    text.textContent = 'Pausado';
    dot.className = 'dot dot-gray';
  } else if (state?.lastError?.kind === 'offline' || state?.lastError?.kind === 'auth' || state?.lastError?.kind === 'subscription') {
    pill.classList.add('errored');
    text.textContent = 'Offline';
    dot.className = 'dot dot-red';
  } else {
    text.textContent = 'Online';
  }
}

function renderDashboard() {
  $('#metric-printer-name').textContent = state?.printerName || 'Não configurada';
  $('#metric-pending').textContent = state?.pendingConfirmations ?? 0;
  $('#metric-printed').textContent = state?.printedToday ?? 0;
  $('#heartbeat-note').textContent = formatHeartbeat();
  $('#btn-pause').classList.toggle('paused', Boolean(state?.paused));
  renderStatusPill();
  renderBanners();
  renderLog();
}

async function openPrinterPicker() {
  const picker = $('#printer-picker');
  picker.hidden = false;
  const sel = $('#printer-select-dash');
  sel.innerHTML = '';
  printers = await labelgo.listPrinters();
  for (const p of printers) {
    const opt = document.createElement('option');
    opt.value = p;
    opt.textContent = p;
    sel.appendChild(opt);
  }
  if (state?.printerName && printers.includes(state.printerName)) {
    sel.value = state.printerName;
  }
}

$('#btn-apply-printer').addEventListener('click', async () => {
  const name = $('#printer-select-dash').value;
  if (!name) return;
  await labelgo.setPrinter(name);
  $('#printer-picker').hidden = true;
});

$('#link-trocar').addEventListener('click', openPrinterPicker);
$('#btn-trocar').addEventListener('click', openPrinterPicker);

$('#btn-test').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  try {
    await labelgo.testPrint();
  } catch (err) {
    // error lands in the activity log via state broadcast
  } finally {
    btn.disabled = false;
  }
});

$('#btn-pause').addEventListener('click', async () => {
  await labelgo.setPaused(!state?.paused);
});

$('#btn-overflow').addEventListener('click', (e) => {
  e.stopPropagation();
  $('#overflow-menu').hidden = !$('#overflow-menu').hidden;
});
document.addEventListener('click', () => { $('#overflow-menu').hidden = true; });

$('#mi-repair').addEventListener('click', async () => {
  await labelgo.unpair();
});
$('#mi-statedir').addEventListener('click', () => labelgo.openStateDir());

// ---------------------------------------------------------------------------
// State wiring
// ---------------------------------------------------------------------------

function applyState(next) {
  state = next;
  const paired = Boolean(state.paired);
  $('#view-onboarding').hidden = paired;
  $('#view-dashboard').hidden = !paired;
  if (paired) renderDashboard();
}

async function boot() {
  state = await labelgo.getState();
  const cfg = await labelgo.getConfig();
  autostart = await labelgo.getAutostart();
  $('#toggle-autostart').classList.toggle('on', autostart);
  if (!state.paired) {
    $('#server-url').value = cfg.serverUrl || 'https://app.labelgo.com.br';
    refreshPrinters();
  }
  applyState(state);
}

labelgo.onState(applyState);
labelgo.onTick(() => {
  if (!state?.paired) return;
  $('#heartbeat-note').textContent = formatHeartbeat();
  const banner = $('#banners .banner.network .b-body');
  if (banner) banner.textContent = `Não foi possível alcançar o servidor. Nova tentativa em ${retryCountdown()} s.`;
});

boot();
