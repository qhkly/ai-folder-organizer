(function () {
  const locales = {
    'zh-CN': {
      'toolbar.pick_dir_title': '选择目录',
      'toolbar.settings_btn': '⚙ API Key',
      'toolbar.settings_title': '设置',
      'toolbar.theme_title': '切换主题',
      'toolbar.lang_title': 'Switch to English',

      'tree.title': '当前目录树',
      'tree.waiting': '等待扫描',
      'tree.refresh': '刷新',
      'tree.empty_state': '点击左上角选择一个测试目录',
      'tree.empty_dir': '目录为空',
      'tree.count': '{count} 个条目，最多 {depth} 层',
      'tree.scan_failed': '扫描失败',

      'plan.title': '整理方案预览',
      'plan.not_analyzed': '尚未分析',
      'plan.clear': '清空',
      'plan.description_placeholder': 'AI 方案会显示在这里，执行前请逐条审阅。',
      'plan.empty_state': '扫描后点击底部"分析"',
      'plan.no_ops': 'AI 没有建议操作',
      'plan.no_description': '无说明',
      'plan.op_count': '{count} 个操作',

      'btn.analyze': '分析',
      'btn.execute': '执行整理',
      'btn.undo': '↩ 撤销',
      'btn.clear_log': '清空日志',

      'settings.title': '设置',
      'settings.api_key_label': 'Anthropic API Key',
      'settings.model': '模型',
      'settings.last_dir': '上次目录',
      'settings.save': '保存',
      'settings.cancel': '取消',

      'log.load_settings_failed': '加载设置失败',
      'log.settings_saved': '设置已保存',
      'log.save_settings_failed': '保存设置失败',
      'log.scanning': '扫描目录',
      'log.scan_done': '扫描完成，共 {count} 个条目',
      'log.scan_failed': '扫描失败',
      'log.no_api_key': '请先填写 Anthropic API Key',
      'log.analyzing': '开始 AI 分析...',
      'log.analyze_done': 'AI 整理方案已生成',
      'log.analyze_failed': 'AI 分析失败',
      'log.execute_done': '整理已执行完成',
      'log.execute_failed': '执行失败',
      'log.undo_done': '撤销完成',
      'log.undo_failed': '撤销失败',
      'log.init_failed': '初始化失败',

      'dialog.execute_confirm': '即将执行 {count} 个文件操作。请确认你已审阅方案。',
      'dialog.undo_confirm': '确定要撤销上一次整理吗？',
      'dialog.pick_dir_title': '选择要整理的目录',

      'event.ai.preparing': '正在准备目录摘要...',
      'event.ai.calling_model': '正在调用 Anthropic 模型: {model}',
      'event.ai.request_failed': 'AI 请求失败: {status}',
      'event.ai.parsing': 'AI 已返回方案，正在解析 JSON...',
      'event.ai.parsed': '整理方案解析完成，共 {count} 个操作。',
      'event.exec.executing': '执行 {idx}/{total}: {op}',
      'event.exec.done': '整理完成，撤销清单已保存。',
      'event.exec.undoing': '撤销 {idx}/{total}: {op}',
      'event.exec.undo_done': '撤销完成。',
    },
    'en-US': {
      'toolbar.pick_dir_title': 'Pick directory',
      'toolbar.settings_btn': '⚙ Settings',
      'toolbar.settings_title': 'Settings',
      'toolbar.theme_title': 'Toggle theme',
      'toolbar.lang_title': '切换为中文',

      'tree.title': 'Directory Tree',
      'tree.waiting': 'Waiting for scan',
      'tree.refresh': 'Refresh',
      'tree.empty_state': 'Click the folder icon to select a directory',
      'tree.empty_dir': 'Empty directory',
      'tree.count': '{count} entries, max {depth} levels',
      'tree.scan_failed': 'Scan failed',

      'plan.title': 'Organization Plan',
      'plan.not_analyzed': 'Not analyzed yet',
      'plan.clear': 'Clear',
      'plan.description_placeholder': 'AI plan will appear here. Review each step before executing.',
      'plan.empty_state': 'Scan a directory, then click "Analyze"',
      'plan.no_ops': 'AI suggested no operations',
      'plan.no_description': 'No description',
      'plan.op_count': '{count} operations',

      'btn.analyze': 'Analyze',
      'btn.execute': 'Execute',
      'btn.undo': '↩ Undo',
      'btn.clear_log': 'Clear log',

      'settings.title': 'Settings',
      'settings.api_key_label': 'Anthropic API Key',
      'settings.model': 'Model',
      'settings.last_dir': 'Last directory',
      'settings.save': 'Save',
      'settings.cancel': 'Cancel',

      'log.load_settings_failed': 'Failed to load settings',
      'log.settings_saved': 'Settings saved',
      'log.save_settings_failed': 'Failed to save settings',
      'log.scanning': 'Scanning directory',
      'log.scan_done': 'Scan complete, {count} entries',
      'log.scan_failed': 'Scan failed',
      'log.no_api_key': 'Please enter your Anthropic API Key in Settings',
      'log.analyzing': 'Starting AI analysis...',
      'log.analyze_done': 'AI organization plan generated',
      'log.analyze_failed': 'AI analysis failed',
      'log.execute_done': 'Organization executed successfully',
      'log.execute_failed': 'Execution failed',
      'log.undo_done': 'Undo complete',
      'log.undo_failed': 'Undo failed',
      'log.init_failed': 'Initialization failed',

      'dialog.execute_confirm': 'About to execute {count} file operations. Please confirm you have reviewed the plan.',
      'dialog.undo_confirm': 'Are you sure you want to undo the last organization?',
      'dialog.pick_dir_title': 'Select directory to organize',

      'event.ai.preparing': 'Preparing directory summary...',
      'event.ai.calling_model': 'Calling Anthropic model: {model}',
      'event.ai.request_failed': 'AI request failed: {status}',
      'event.ai.parsing': 'AI returned plan, parsing JSON...',
      'event.ai.parsed': 'Plan parsed, {count} operations.',
      'event.exec.executing': 'Executing {idx}/{total}: {op}',
      'event.exec.done': 'Organization complete, undo manifest saved.',
      'event.exec.undoing': 'Undoing {idx}/{total}: {op}',
      'event.exec.undo_done': 'Undo complete.',
    },
  };

  const SUPPORTED_LANGS = ['zh-CN', 'en-US'];
  const STORAGE_KEY = 'ai-organizer-lang';

  function detectLang() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && SUPPORTED_LANGS.includes(saved)) return saved;
    const nav = (navigator.language || 'en-US');
    return nav.startsWith('zh') ? 'zh-CN' : 'en-US';
  }

  let currentLang = detectLang();
  let dict = locales[currentLang] || locales['en-US'];

  function t(key, params) {
    let str = dict[key];
    if (str === undefined) str = (locales['en-US'][key] || key);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        str = str.replaceAll(`{${k}}`, v);
      }
    }
    return str;
  }

  function applyTranslations() {
    document.documentElement.lang = currentLang;
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.title = t(el.dataset.i18nTitle);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.placeholder = t(el.dataset.i18nPlaceholder);
    });
    const btn = document.getElementById('btn-lang');
    if (btn) {
      btn.textContent = currentLang === 'zh-CN' ? 'EN' : '中';
      btn.title = t('toolbar.lang_title');
    }
  }

  function setLang(lang) {
    if (!SUPPORTED_LANGS.includes(lang)) return;
    currentLang = lang;
    dict = locales[lang] || locales['en-US'];
    localStorage.setItem(STORAGE_KEY, lang);
    applyTranslations();
    document.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }));
  }

  function toggleLang() {
    setLang(currentLang === 'zh-CN' ? 'en-US' : 'zh-CN');
  }

  window.i18n = {
    t,
    setLang,
    toggleLang,
    get currentLang() { return currentLang; },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyTranslations);
  } else {
    applyTranslations();
  }
})();
