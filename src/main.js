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
    log(`加载设置失败: ${e}`, 'error');
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
  log('设置已保存', 'ok');
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
    label.textContent = '未选择目录';
    label.title = '请选择目录';
    return;
  }
  label.textContent = currentDir.replace(/^.*[\/\\]/, '') || currentDir;
  label.title = currentDir;
}

async function pickDirectory() {
  const selected = await open({
    directory: true,
    multiple: false,
    title: '选择要整理的目录',
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
  log(`扫描目录: ${currentDir}`);
  try {
    currentTree = await invoke('scan_directory', { path: currentDir });
    renderTree();
    $('btn-analyze').disabled = currentTree.entries.length === 0;
    $('btn-rescan').disabled = false;
    log(`扫描完成，共 ${currentTree.entries.length} 个条目`, 'ok');
  } catch (e) {
    currentTree = null;
    $('tree-list').innerHTML = '<div class="empty-state">扫描失败</div>';
    $('tree-count').textContent = '扫描失败';
    log(`扫描失败: ${e}`, 'error');
  } finally {
    setBusy(false);
  }
}

function renderTree() {
  const entries = currentTree?.entries || [];
  $('tree-count').textContent = `${entries.length} 个条目，最多 ${currentTree.max_depth} 层`;
  if (!entries.length) {
    $('tree-list').innerHTML = '<div class="empty-state">目录为空</div>';
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
    log('请先填写 Anthropic API Key', 'error');
    return;
  }
  setBusy(true);
  clearPlan();
  log('开始 AI 分析...');
  try {
    currentPlan = await invoke('analyze_with_ai', {
      tree: currentTree,
      apiKey: settings.api_key,
      model: settings.model,
    });
    renderPlan();
    log('AI 整理方案已生成', 'ok');
  } catch (e) {
    log(`AI 分析失败: ${e}`, 'error');
  } finally {
    setBusy(false);
  }
}

function renderPlan() {
  const ops = currentPlan?.operations || [];
  $('plan-description').textContent = currentPlan?.description || '无说明';
  $('plan-count').textContent = `${ops.length} 个操作`;
  $('btn-clear-plan').disabled = ops.length === 0;
  $('btn-execute').disabled = ops.length === 0 || busy;

  if (!ops.length) {
    $('plan-list').innerHTML = '<div class="empty-state">AI 没有建议操作</div>';
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
  $('plan-description').textContent = 'AI 方案会显示在这里，执行前请逐条审阅。';
  $('plan-count').textContent = '尚未分析';
  $('plan-list').innerHTML = '<div class="empty-state">扫描后点击底部“分析”</div>';
  $('btn-clear-plan').disabled = true;
  $('btn-execute').disabled = true;
}

async function executePlan() {
  if (!currentPlan?.operations?.length || !currentDir || busy) {
    return;
  }
  if (!confirm(`即将执行 ${currentPlan.operations.length} 个文件操作。请确认你已审阅方案。`)) {
    return;
  }
  setBusy(true);
  try {
    await invoke('execute_plan', {
      operations: currentPlan.operations,
      baseDir: currentDir,
    });
    log('整理已执行完成', 'ok');
    clearPlan();
    await refreshUndoState();
    await scanCurrentDirectory();
  } catch (e) {
    log(`执行失败: ${e}`, 'error');
  } finally {
    setBusy(false);
  }
}

async function undoPlan() {
  if (!currentDir || busy) {
    return;
  }
  if (!confirm('确定要撤销上一次整理吗？')) {
    return;
  }
  setBusy(true);
  try {
    await invoke('undo_plan', { baseDir: currentDir });
    log('撤销完成', 'ok');
    await refreshUndoState();
    await scanCurrentDirectory();
  } catch (e) {
    log(`撤销失败: ${e}`, 'error');
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

async function initEvents() {
  await listen('ai_output', (event) => log(event.payload, 'info'));
  await listen('exec_progress', (event) => log(event.payload, 'info'));

  $('btn-pick-dir').addEventListener('click', pickDirectory);
  $('btn-rescan').addEventListener('click', scanCurrentDirectory);
  $('btn-analyze').addEventListener('click', analyze);
  $('btn-execute').addEventListener('click', executePlan);
  $('btn-undo').addEventListener('click', undoPlan);
  $('btn-clear-plan').addEventListener('click', clearPlan);
  $('btn-log-clear').addEventListener('click', () => { $('log-output').innerHTML = ''; });
  $('btn-theme').addEventListener('click', toggleTheme);
  $('btn-settings').addEventListener('click', openModal);
  $('btn-settings-save').addEventListener('click', () => saveSettingsFromModal().catch((e) => log(`保存设置失败: ${e}`, 'error')));
  $('btn-settings-cancel').addEventListener('click', closeModal);
  $('settings-modal').querySelector('.modal-backdrop').addEventListener('click', closeModal);
}

initTheme();
initEvents().then(loadSettings).catch((e) => log(`初始化失败: ${e}`, 'error'));
