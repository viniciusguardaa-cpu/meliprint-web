/* global labelgo */
const $ = (s) => document.querySelector(s);
let paused = false;

function apply(state) {
  paused = Boolean(state.paused);
  $('#printer-name').textContent = state.printerName || 'Sem impressora';
  $('#pending').textContent = `${state.pendingConfirmations ?? 0} confirmações pendentes`;
  const pill = $('#pill');
  pill.classList.remove('paused', 'offline');
  if (state.paused) {
    pill.classList.add('paused');
    $('#pill-text').textContent = 'Pausado';
  } else if (!state.paired || state.lastError?.kind === 'offline' || state.lastError?.kind === 'auth') {
    pill.classList.add('offline');
    $('#pill-text').textContent = state.paired ? 'Offline' : 'Não pareado';
  } else {
    $('#pill-text').textContent = 'Online';
  }
  $('#pause-text').textContent = paused ? 'Retomar agente' : 'Pausar agente';
}

labelgo.getState().then(apply);
labelgo.onState(apply);

$('#mi-open').addEventListener('click', () => labelgo.openPanel());
$('#mi-test').addEventListener('click', async () => { try { await labelgo.testPrint(); } catch { } });
$('#mi-pause').addEventListener('click', () => labelgo.setPaused(!paused));
$('#mi-quit').addEventListener('click', () => labelgo.quitApp());
