const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const { open } = window.__TAURI__.dialog;

let settings = { api_key: '', last_dir: '', model: 'claude-opus-4-7' };
let currentDir = '';
let currentTree = null;
let currentPlan = null;
let busy = false;

function $(id) {
  return document.getElementById(id);
}

function t(key, params) {
  return window.i18n.t(key, params);
}

function initTheme() {
  const saved = localStorage.getItem('theme');
  if (saved) {
    document.documentElement.dataset.theme = saved;
  }
  updateThemeButton();
}

function toggleTheme() {
  const system = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  const current = document.documentElement.dataset.theme || system;
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('theme', next);
  updateThemeButton();
}

function updateThemeButton() {
  const system = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  const theme = document.documentElement.dataset.theme || system;
  $('btn-theme').textContent = theme === 'dark' ? '☀️' : '🌙';
}

function log(message, type = 'info') {
  const line = document.createElement('div');
  line.className = `log-line log-${type}`;
  line.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  $('log-output').appendChild(line);
  $('log-output').scrollTop = $('log-output').scrollHeight;
}

function translatePayload(payload) {
  try {
    const parsed = JSON.parse(payload);
    if (parsed && parsed.key) {
      return t(parsed.key, parsed.params);
    }
  } catch {
    // not a keyed event, fall through
  }
  return payload;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function loadSettings() {
  try {
    settings = await invoke('load_settings');
    currentDir = settings.last_dir || '';
    updateDirLabel();
    fillSettingsModal();
    if (currentDir) {
      await refreshUndoState();
      await scanCurrentDirectory();
    }
  } catch (e) {
    log(`${t('log.load_settings_failed')}: ${e}`, 'error');
  }
}

function fillSettingsModal() {
  $('s-api-key').value = settings.api_key || '';
  $('s-model').value = settings.model || 'claude-opus-4-7';
  $('s-last-dir').value = settings.last_dir || '';
}

async function saveSettingsFromModal() {
  settings = {
    api_key: $('s-api-key').value.trim(),
    model: $('s-model').value.trim() || 'claude-opus-4-7',
    last_dir: $('s-last-dir').value.trim(),
  };
  currentDir = settings.last_dir;
  await invoke('save_settings', { settings });
  closeModal();
  updateDirLabel();
  await refreshUndoState();
  log(t('log.settings_saved'), 'ok');
}

async function persistLastDir(path) {
  settings.last_dir = path;
  currentDir = path;
  await invoke('save_settings', { settings });
  updateDirLabel();
}

function updateDirLabel() {
  const label = $('current-dir');
  if (!currentDir) {
    label.textContent = t('toolbar.no_dir');
    label.title = t('toolbar.no_dir');
    return;
  }
  label.textContent = currentDir.replace(/^.*[\/\\]/, '') || currentDir;
  label.title = currentDir;
}

async function pickDirectory() {
  const selected = await open({
    directory: true,
    multiple: false,
    title: t('dialog.pick_dir_title'),
  });
  if (!selected) {
    return;
  }
  await persistLastDir(selected);
  clearPlan();
  await refreshUndoState();
  await scanCurrentDirectory();
}

async function scanCurrentDirectory() {
  if (!currentDir || busy) {
    return;
  }
  setBusy(true);
  log(`${t('log.scanning')}: ${currentDir}`);
  try {
    currentTree = await invoke('scan_directory', { path: currentDir });
    renderTree();
    $('btn-analyze').disabled = currentTree.entries.length === 0;
    $('btn-rescan').disabled = false;
    log(t('log.scan_done', { count: currentTree.entries.length }), 'ok');
  } catch (e) {
    currentTree = null;
    $('tree-list').innerHTML = `<div class="empty-state">${escapeHtml(t('tree.scan_failed'))}</div>`;
    $('tree-count').textContent = t('tree.scan_failed');
    log(`${t('log.scan_failed')}: ${e}`, 'error');
  } finally {
    setBusy(false);
  }
}

function renderTree() {
  const entries = currentTree?.entries || [];
  $('tree-count').textContent = t('tree.count', { count: entries.length, depth: currentTree.max_depth });
  if (!entries.length) {
    $('tree-list').innerHTML = `<div class="empty-state">${escapeHtml(t('tree.empty_dir'))}</div>`;
    return;
  }
  $('tree-list').innerHTML = entries.map((entry) => {
    const kind = entry.is_dir ? 'folder' : (entry.extension || 'file');
    const size = entry.is_dir ? '' : formatBytes(entry.size);
    const indent = Math.min(entry.depth, 5) * 14;
    return `
      <div class="tree-row" title="${escapeHtml(entry.relative_path)}">
        <span class="tree-name" style="padding-left: ${indent}px">
          <span class="tree-icon">${entry.is_dir ? '▸' : '·'}</span>
          ${escapeHtml(entry.name)}
        </span>
        <span class="tree-meta">${escapeHtml(kind)} ${size}</span>
      </div>
    `;
  }).join('');
}

async function analyze() {
  if (!currentTree || busy) {
    return;
  }
  if (!settings.api_key) {
    openModal();
    log(t('log.no_api_key'), 'error');
    return;
  }
  setBusy(true);
  clearPlan();
  log(t('log.analyzing'));
  try {
    currentPlan = await invoke('analyze_with_ai', {
      tree: currentTree,
      apiKey: settings.api_key,
      model: settings.model,
      lang: window.i18n.currentLang,
    });
    renderPlan();
    log(t('log.analyze_done'), 'ok');
  } catch (e) {
    log(`${t('log.analyze_failed')}: ${e}`, 'error');
  } finally {
    setBusy(false);
  }
}

function renderPlan() {
  const ops = currentPlan?.operations || [];
  $('plan-description').textContent = currentPlan?.description || t('plan.no_description');
  $('plan-count').textContent = t('plan.op_count', { count: ops.length });
  $('btn-clear-plan').disabled = ops.length === 0;
  $('btn-execute').disabled = ops.length === 0 || busy;

  if (!ops.length) {
    $('plan-list').innerHTML = `<div class="empty-state">${escapeHtml(t('plan.no_ops'))}</div>`;
    return;
  }

  $('plan-list').innerHTML = ops.map((op, index) => `
    <div class="op-row">
      <span class="op-index">${index + 1}</span>
      <span class="op-type op-${escapeHtml(op.type)}">${escapeHtml(op.type)}</span>
      <div class="op-paths">${renderOpPaths(op)}</div>
    </div>
  `).join('');
}

function renderOpPaths(op) {
  if (op.type === 'mkdir') {
    return `<span>${escapeHtml(op.path || '')}</span>`;
  }
  return `
    <span>${escapeHtml(op.from || '')}</span>
    <span class="arrow">→</span>
    <span>${escapeHtml(op.to || '')}</span>
  `;
}

function clearPlan() {
  currentPlan = null;
  $('plan-description').textContent = t('plan.description_placeholder');
  $('plan-count').textContent = t('plan.not_analyzed');
  $('plan-list').innerHTML = `<div class="empty-state">${escapeHtml(t('plan.empty_state'))}</div>`;
  $('btn-clear-plan').disabled = true;
  $('btn-execute').disabled = true;
}

async function executePlan() {
  if (!currentPlan?.operations?.length || !currentDir || busy) {
    return;
  }
  if (!confirm(t('dialog.execute_confirm', { count: currentPlan.operations.length }))) {
    return;
  }
  setBusy(true);
  try {
    await invoke('execute_plan', {
      operations: currentPlan.operations,
      baseDir: currentDir,
    });
    log(t('log.execute_done'), 'ok');
    clearPlan();
    await refreshUndoState();
    await scanCurrentDirectory();
  } catch (e) {
    log(`${t('log.execute_failed')}: ${e}`, 'error');
  } finally {
    setBusy(false);
  }
}

async function undoPlan() {
  if (!currentDir || busy) {
    return;
  }
  if (!confirm(t('dialog.undo_confirm'))) {
    return;
  }
  setBusy(true);
  try {
    await invoke('undo_plan', { baseDir: currentDir });
    log(t('log.undo_done'), 'ok');
    await refreshUndoState();
    await scanCurrentDirectory();
  } catch (e) {
    log(`${t('log.undo_failed')}: ${e}`, 'error');
  } finally {
    setBusy(false);
  }
}

async function refreshUndoState() {
  if (!currentDir) {
    $('btn-undo').disabled = true;
    return;
  }
  try {
    const hasUndo = await invoke('has_undo_manifest', { baseDir: currentDir });
    $('btn-undo').disabled = !hasUndo || busy;
  } catch {
    $('btn-undo').disabled = true;
  }
}

function setBusy(next) {
  busy = next;
  $('btn-pick-dir').disabled = next;
  $('btn-rescan').disabled = next || !currentDir;
  $('btn-analyze').disabled = next || !currentTree;
  $('btn-execute').disabled = next || !currentPlan?.operations?.length;
  refreshUndoState();
}

function openModal() {
  fillSettingsModal();
  $('settings-modal').classList.remove('hidden');
  $('s-api-key').focus();
}

function closeModal() {
  $('settings-modal').classList.add('hidden');
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, idx);
  return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function handleLangChange() {
  updateDirLabel();
  if (currentTree) {
    renderTree();
  } else {
    $('tree-count').textContent = t('tree.waiting');
    $('tree-list').innerHTML = `<div class="empty-state">${escapeHtml(t('tree.empty_state'))}</div>`;
  }
  if (currentPlan) {
    renderPlan();
  } else {
    clearPlan();
  }
}

async function initEvents() {
  await listen('ai_output', (event) => log(translatePayload(event.payload), 'info'));
  await listen('exec_progress', (event) => log(translatePayload(event.payload), 'info'));

  $('btn-pick-dir').addEventListener('click', pickDirectory);
  $('btn-rescan').addEventListener('click', scanCurrentDirectory);
  $('btn-analyze').addEventListener('click', analyze);
  $('btn-execute').addEventListener('click', executePlan);
  $('btn-undo').addEventListener('click', undoPlan);
  $('btn-clear-plan').addEventListener('click', clearPlan);
  $('btn-log-clear').addEventListener('click', () => { $('log-output').innerHTML = ''; });
  $('btn-theme').addEventListener('click', toggleTheme);
  $('btn-settings').addEventListener('click', openModal);
  $('btn-lang').addEventListener('click', () => window.i18n.toggleLang());
  $('btn-settings-save').addEventListener('click', () => saveSettingsFromModal().catch((e) => log(`${t('log.save_settings_failed')}: ${e}`, 'error')));
  $('btn-settings-cancel').addEventListener('click', closeModal);
  $('settings-modal').querySelector('.modal-backdrop').addEventListener('click', closeModal);

  document.addEventListener('langchange', handleLangChange);
}

initTheme();
// Set initial dir label via i18n (i18n.js has already run at this point)
updateDirLabel();
initEvents().then(loadSettings).catch((e) => log(`${t('log.init_failed')}: ${e}`, 'error'));
