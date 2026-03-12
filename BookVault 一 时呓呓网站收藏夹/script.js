/* ============================================================
   BookVault — script.js
   Features: themes · edit bookmarks · drag-drop · export/import
   ============================================================ */
'use strict';

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────
const STORAGE_KEY       = 'bookvault_data';
const SETTINGS_KEY      = 'bookvault_settings';

// ─────────────────────────────────────────────────────────────
// THEMES
// ─────────────────────────────────────────────────────────────
const THEMES = [
  { id: 'amber',    label: 'Amber',    color: '#e8a020' },
  { id: 'iris',     label: 'Iris',     color: '#7c6af7' },
  { id: 'jade',     label: 'Jade',     color: '#22a96e' },
  { id: 'rose',     label: 'Rose',     color: '#e5485a' },
  { id: 'sky',      label: 'Sky',      color: '#0e8ed4' },
  { id: 'obsidian', label: 'Obsidian', color: '#2a2a2a' },
];

// ─────────────────────────────────────────────────────────────
// DEFAULT DATA
// ─────────────────────────────────────────────────────────────
function defaultData() {
  return {
    type: 'folder', id: 'root', name: 'root',
    children: [
      {
        type: 'folder', id: uid(), name: '工作', children: [
          { type: 'bookmark', id: uid(), name: 'GitHub',  url: 'https://github.com',   description: '全球最大的代码托管与协作平台',   createdAt: Date.now() },
          { type: 'bookmark', id: uid(), name: 'Linear',  url: 'https://linear.app',   description: '现代化的项目管理与问题追踪工具', createdAt: Date.now() },
          { type: 'bookmark', id: uid(), name: 'Vercel',  url: 'https://vercel.com',   description: '前端项目一键部署托管平台',       createdAt: Date.now() },
        ]
      },
      {
        type: 'folder', id: uid(), name: '设计', children: [
          { type: 'bookmark', id: uid(), name: 'Figma',    url: 'https://figma.com',    description: '基于云的协作 UI/UX 设计工具',   createdAt: Date.now() },
          { type: 'bookmark', id: uid(), name: 'Dribbble', url: 'https://dribbble.com', description: '设计师作品展示与灵感社区',       createdAt: Date.now() },
        ]
      },
      {
        type: 'folder', id: uid(), name: '常用', children: [
          { type: 'bookmark', id: uid(), name: 'Google',    url: 'https://google.com',    description: '全球最大的搜索引擎',     createdAt: Date.now() },
          { type: 'bookmark', id: uid(), name: 'YouTube',   url: 'https://youtube.com',   description: '全球最大的视频分享平台', createdAt: Date.now() },
          { type: 'bookmark', id: uid(), name: 'Wikipedia', url: 'https://wikipedia.org', description: '自由的百科全书',         createdAt: Date.now() },
        ]
      }
    ]
  };
}

function uid() {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
}

// ─────────────────────────────────────────────────────────────
// PERSISTENCE
// ─────────────────────────────────────────────────────────────
function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : defaultData();
  } catch { return defaultData(); }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.root));
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : { theme: 'amber' };
  } catch { return { theme: 'amber' }; }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
}

// ─────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────
const state = {
  root:            loadData(),
  settings:        loadSettings(),
  currentFolderId: 'root',
  expandedIds:     new Set(['root']),
  contextTarget:   null,
  searchQuery:     '',
  // drag state
  drag: {
    sourceId:   null,  // id of dragged node
    sourceType: null,  // 'card' | 'tree'
  }
};

// ─────────────────────────────────────────────────────────────
// TREE HELPERS
// ─────────────────────────────────────────────────────────────
function findNodeById(id, node = state.root, parentArr = null) {
  if (node.id === id) return { node, parentArr };
  if (node.children) {
    for (const child of node.children) {
      const r = findNodeById(id, child, node.children);
      if (r) return r;
    }
  }
  return null;
}

function deleteNodeById(id) {
  function recurse(arr) {
    const i = arr.findIndex(c => c.id === id);
    if (i !== -1) { arr.splice(i, 1); return true; }
    for (const c of arr) {
      if (c.children && recurse(c.children)) return true;
    }
    return false;
  }
  recurse(state.root.children);
}

function isDescendant(ancestorId, nodeId) {
  const { node: ancestor } = findNodeById(ancestorId) || {};
  if (!ancestor) return false;
  function check(n) {
    if (n.id === nodeId) return true;
    return (n.children || []).some(check);
  }
  return (ancestor.children || []).some(check);
}

function getBreadcrumb(targetId) {
  const path = [];
  function recurse(node) {
    if (node.id === targetId) { path.push(node); return true; }
    for (const c of (node.children || [])) {
      if (recurse(c)) { path.unshift(node); return true; }
    }
    return false;
  }
  recurse(state.root);
  return path;
}

function countChildren(folder) {
  if (!folder.children) return '空';
  const folders = folder.children.filter(c => c.type === 'folder').length;
  const bookmarks = folder.children.filter(c => c.type === 'bookmark').length;
  const parts = [];
  if (folders)   parts.push(`${folders} 文件夹`);
  if (bookmarks) parts.push(`${bookmarks} 书签`);
  return parts.join('，') || '空';
}

// Move `dragId` into `targetFolderId`, or reorder within same parent
function moveNode(dragId, targetId, position /* 'before'|'after'|'into' */) {
  if (dragId === targetId) return false;
  if (position === 'into' && isDescendant(dragId, targetId)) return false;

  const { node: dragNode,   parentArr: dragParent   } = findNodeById(dragId)   || {};
  const { node: targetNode, parentArr: targetParent } = findNodeById(targetId) || {};
  if (!dragNode || !dragParent || !targetNode) return false;

  if (position === 'into') {
    // Drop onto a folder → put inside it
    const si = dragParent.indexOf(dragNode);
    if (si === -1) return false;
    dragParent.splice(si, 1);
    if (!targetNode.children) targetNode.children = [];
    targetNode.children.push(dragNode);
    return true;
  }

  // Reorder (before / after):
  // When drag and target share the same parent array we must capture the
  // target index BEFORE removing the drag node, otherwise the index shifts.
  const sameParent = dragParent === targetParent;

  // Snapshot target index first
  let ti = targetParent.indexOf(targetNode);
  if (ti === -1) return false;

  // Remove drag node from its current position
  const si = dragParent.indexOf(dragNode);
  if (si === -1) return false;
  dragParent.splice(si, 1);

  // If same array and the drag node was before the target, removal shifted
  // the target one step left — compensate.
  if (sameParent && si < ti) ti -= 1;

  // Insert at the correct position
  if (position === 'after') ti += 1;
  targetParent.splice(ti, 0, dragNode);

  return true;
}

// ─────────────────────────────────────────────────────────────
// DOM SHORTCUTS
// ─────────────────────────────────────────────────────────────
const $  = id => document.getElementById(id);
const folderTree   = $('folder-tree');
const contentArea  = $('content-area');
const emptyState   = $('empty-state');
const breadcrumb   = $('breadcrumb');
const searchInput  = $('search-input');
const contextMenu  = $('context-menu');
const modalOverlay = $('modal-overlay');
const modalTitle   = $('modal-title');
const modalBody    = $('modal-body');
const modalConfirm = $('modal-confirm');
const modalCancel  = $('modal-cancel');
const modalClose   = $('modal-close');

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─────────────────────────────────────────────────────────────
// THEME
// ─────────────────────────────────────────────────────────────
function applyTheme(themeId) {
  // Remove all theme classes
  THEMES.forEach(t => document.body.classList.remove(`theme-${t.id}`));
  if (themeId !== 'amber') {
    document.body.classList.add(`theme-${themeId}`);
  }
  state.settings.theme = themeId;
  saveSettings();
  // Update active swatch
  document.querySelectorAll('.theme-swatch').forEach(sw => {
    sw.classList.toggle('active', sw.dataset.theme === themeId);
  });
}

function renderThemeSwatches() {
  const container = $('theme-swatches');
  container.innerHTML = '';
  THEMES.forEach(t => {
    const sw = document.createElement('button');
    sw.className = 'theme-swatch' + (state.settings.theme === t.id ? ' active' : '');
    sw.dataset.theme = t.id;
    sw.title = t.label;
    sw.style.background = t.color;
    sw.innerHTML = `
      <span class="swatch-check">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
          <polyline points="20 6 9 17 4 12" stroke="${t.id === 'obsidian' ? '#fff' : '#fff'}"
            stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </span>`;
    sw.addEventListener('click', () => applyTheme(t.id));
    container.appendChild(sw);
  });
}

// ─────────────────────────────────────────────────────────────
// SETTINGS PANEL
// ─────────────────────────────────────────────────────────────
const settingsPanel   = $('settings-panel');
const settingsOverlay = $('settings-overlay');

function openSettings() {
  renderThemeSwatches();
  settingsPanel.style.display   = '';
  settingsOverlay.style.display = '';
}

function closeSettings() {
  settingsPanel.style.display   = 'none';
  settingsOverlay.style.display = 'none';
}

$('btn-settings').addEventListener('click', e => {
  e.stopPropagation();
  if (settingsPanel.style.display === 'none') openSettings();
  else closeSettings();
});
$('settings-close').addEventListener('click', closeSettings);
settingsOverlay.addEventListener('click', closeSettings);

// ─────────────────────────────────────────────────────────────
// EXPORT / IMPORT
// ─────────────────────────────────────────────────────────────
$('btn-export').addEventListener('click', () => {
  const json = JSON.stringify(state.root, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `bookvault-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('备份已导出 ✓');
});

$('btn-import').addEventListener('click', () => {
  $('import-file-input').click();
});

$('import-file-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const parsed = JSON.parse(ev.target.result);
      if (parsed.type !== 'folder' || parsed.id !== 'root') {
        showToast('文件格式不正确', true); return;
      }
      state.root = parsed;
      state.currentFolderId = 'root';
      saveData();
      renderAll();
      closeSettings();
      showToast('导入成功 ✓');
    } catch {
      showToast('解析失败，请检查文件', true);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

// ─────────────────────────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────────────────────────
let _toastTimer = null;
function showToast(msg, isError = false) {
  const el = $('toast');
  el.textContent = msg;
  el.style.background = isError ? 'var(--danger)' : '';
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

// ─────────────────────────────────────────────────────────────
// RENDER: SIDEBAR TREE
// ─────────────────────────────────────────────────────────────
function renderTree() {
  folderTree.innerHTML = '';

  // Root row
  const rootRow = document.createElement('div');
  rootRow.className = 'tree-root' + (state.currentFolderId === 'root' ? ' active' : '');
  rootRow.innerHTML = `
    <svg class="tree-icon" width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <polyline points="9 22 9 12 15 12 15 22"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <span>全部收藏</span>`;
  rootRow.addEventListener('click', () => {
    state.currentFolderId = 'root';
    renderAll();
  });
  // Drop-into root
  setupTreeRowDrop(rootRow, state.root);
  folderTree.appendChild(rootRow);

  function renderFolderNode(node, container) {
    if (node.type !== 'folder' || node.id === 'root') return;

    const hasSubFolders = (node.children || []).some(c => c.type === 'folder');
    const isOpen   = state.expandedIds.has(node.id);
    const isActive = state.currentFolderId === node.id;

    const item = document.createElement('div');
    item.className = 'tree-item';
    item.dataset.id = node.id;

    item.innerHTML = `
      <div class="tree-row${isActive ? ' active' : ''}" data-id="${node.id}" draggable="true">
        <svg class="tree-chevron${hasSubFolders ? '' : ' invisible'}${isOpen ? ' open' : ''}"
          width="13" height="13" viewBox="0 0 24 24" fill="none">
          <polyline points="9 18 15 12 9 6" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <svg class="tree-icon" width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span class="tree-label">${escHtml(node.name)}</span>
      </div>
      <div class="tree-children${isOpen ? ' open' : ''}" data-children="${node.id}"></div>`;

    const row = item.querySelector('.tree-row');
    const childContainer = item.querySelector('.tree-children');

    row.addEventListener('click', e => {
      e.stopPropagation();
      if (hasSubFolders) {
        if (state.expandedIds.has(node.id)) state.expandedIds.delete(node.id);
        else state.expandedIds.add(node.id);
      }
      state.currentFolderId = node.id;
      renderAll();
    });

    row.addEventListener('contextmenu', e => {
      e.preventDefault();
      openContextMenu(e, node);
    });

    row.addEventListener('dragstart', e => {
      state.drag.sourceId        = node.id;
      state.drag.sourceType      = 'tree';
      state.drag.pendingTargetId = null;
      state.drag.pendingPosition = null;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', node.id);
      setTimeout(() => row.style.opacity = '.4', 0);
    });
    row.addEventListener('dragend', () => {
      row.style.opacity = '';
      clearAllDragStyles();
      const { sourceId, pendingTargetId, pendingPosition } = state.drag;
      if (sourceId && pendingTargetId && pendingPosition) {
        pushUndo();
        if (moveNode(sourceId, pendingTargetId, pendingPosition)) {
          saveData();
          renderAll();
        } else {
          undoStack.pop();
        }
      }
      state.drag.sourceId = state.drag.pendingTargetId = state.drag.pendingPosition = null;
    });

    // Tree drop target
    setupTreeRowDrop(row, node);

    container.appendChild(item);

    if (node.children) {
      node.children.forEach(child => renderFolderNode(child, childContainer));
    }
  }

  (state.root.children || []).forEach(child => renderFolderNode(child, folderTree));
}

function setupTreeRowDrop(rowEl, targetNode) {
  rowEl.addEventListener('dragover', e => {
    e.preventDefault();
    const dragId = state.drag.sourceId;
    if (!dragId || dragId === targetNode.id) return;
    if (isDescendant(dragId, targetNode.id)) return;

    e.dataTransfer.dropEffect = 'move';
    clearAllDragStyles();

    const rect = rowEl.getBoundingClientRect();
    const relY  = e.clientY - rect.top;
    const zone  = rect.height * 0.28;

    if (targetNode.type === 'folder' && relY > zone && relY < rect.height - zone) {
      rowEl.classList.add('drag-over-folder');
      state.drag.pendingTargetId = targetNode.id;
      state.drag.pendingPosition = 'into';
    } else if (relY < rect.height / 2) {
      rowEl.classList.add('drag-over-top');
      state.drag.pendingTargetId = targetNode.id;
      state.drag.pendingPosition = 'before';
    } else {
      rowEl.classList.add('drag-over-bottom');
      state.drag.pendingTargetId = targetNode.id;
      state.drag.pendingPosition = 'after';
    }
  });

  rowEl.addEventListener('dragleave', e => {
    if (!rowEl.contains(e.relatedTarget)) {
      clearAllDragStyles();
    }
  });

  // No 'drop' handler — dragend on the source card/row commits everything
}

function clearAllDragStyles() {
  document.querySelectorAll('.drag-over-top, .drag-over-bottom, .drag-over-folder, .drag-over')
    .forEach(el => {
      el.classList.remove('drag-over-top','drag-over-bottom','drag-over-folder','drag-over');
    });
}

// ─────────────────────────────────────────────────────────────
// RENDER: BREADCRUMB
// ─────────────────────────────────────────────────────────────
function renderBreadcrumb() {
  const path = getBreadcrumb(state.currentFolderId);
  breadcrumb.innerHTML = '';
  path.forEach((node, i) => {
    if (i > 0) {
      const sep = document.createElement('span');
      sep.className = 'breadcrumb-sep';
      sep.textContent = '/';
      breadcrumb.appendChild(sep);
    }
    const el = document.createElement('span');
    el.textContent = node.id === 'root' ? '全部收藏' : node.name;
    if (i < path.length - 1) {
      el.addEventListener('click', () => {
        state.currentFolderId = node.id;
        renderAll();
      });
    }
    breadcrumb.appendChild(el);
  });
}

// ─────────────────────────────────────────────────────────────
// RENDER: CONTENT CARDS
// ─────────────────────────────────────────────────────────────
function renderContent() {
  contentArea.innerHTML = '';

  const { node: folder } = findNodeById(state.currentFolderId) || { node: state.root };
  const q = state.searchQuery.toLowerCase().trim();

  let items = folder.children || [];

  if (q) {
    items = [];
    function collectAll(node) {
      if (node.type === 'bookmark') {
        if (node.name.toLowerCase().includes(q) ||
            (node.description || '').toLowerCase().includes(q) ||
            node.url.toLowerCase().includes(q)) items.push(node);
      }
      (node.children || []).forEach(collectAll);
    }
    collectAll(state.root);
  }

  // Folders first, then bookmarks
  const sorted = [...items].sort((a, b) => {
    if (a.type === b.type) return 0;
    return a.type === 'folder' ? -1 : 1;
  });

  if (sorted.length === 0) { emptyState.style.display = ''; return; }
  emptyState.style.display = 'none';

  sorted.forEach(item => {
    const card = item.type === 'folder'
      ? createFolderCard(item)
      : createBookmarkCard(item);
    setupCardDrag(card, item);
    contentArea.appendChild(card);
  });

  // Store current folder for content-area drop handler
  setupContentAreaDrop(folder);
}

function createFolderCard(node) {
  const card = document.createElement('div');
  card.className = 'card-folder';
  card.dataset.id = node.id;

  card.innerHTML = `
    <div class="card-folder-icon">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
    <div class="card-folder-info">
      <div class="card-folder-name">${escHtml(node.name)}</div>
      <div class="card-folder-count">${countChildren(node)}</div>
    </div>
    <button class="card-menu-btn" title="更多操作">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="5" r="1.5" fill="currentColor"/>
        <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
        <circle cx="12" cy="19" r="1.5" fill="currentColor"/>
      </svg>
    </button>`;

  card.addEventListener('click', e => {
    if (e.target.closest('.card-menu-btn')) return;
    state.currentFolderId = node.id;
    state.expandedIds.add(node.id);
    renderAll();
  });

  card.querySelector('.card-menu-btn').addEventListener('click', e => {
    e.stopPropagation();
    openContextMenu(e, node);
  });

  return card;
}

function createBookmarkCard(node) {
  const card = document.createElement('div');
  card.className = 'card-bookmark';
  card.dataset.id = node.id;

  const domain = (() => { try { return new URL(node.url).hostname; } catch { return ''; } })();
  const faviconUrl = `https://www.google.com/s2/favicons?sz=32&domain_url=${encodeURIComponent(node.url)}`;
  const initial = (node.name || '?')[0].toUpperCase();

  card.innerHTML = `
    <div class="card-bookmark-header">
      <div class="favicon-wrap">
        <img src="${faviconUrl}" alt=""
          onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
        <div class="favicon-fallback">${escHtml(initial)}</div>
      </div>
      <span class="card-bookmark-name">${escHtml(node.name)}</span>
      <button class="card-menu-btn" title="更多操作">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="5" r="1.5" fill="currentColor"/>
          <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
          <circle cx="12" cy="19" r="1.5" fill="currentColor"/>
        </svg>
      </button>
    </div>
    ${node.description ? `<div class="card-bookmark-desc">${escHtml(node.description)}</div>` : ''}
    <div class="card-bookmark-url">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
        <line x1="2" y1="12" x2="22" y2="12" stroke="currentColor" stroke-width="2"/>
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
          stroke="currentColor" stroke-width="2"/>
      </svg>
      ${escHtml(domain)}
    </div>`;

  card.addEventListener('click', e => {
    if (e.target.closest('.card-menu-btn')) return;
    window.open(node.url, '_blank', 'noopener,noreferrer');
  });

  card.querySelector('.card-menu-btn').addEventListener('click', e => {
    e.stopPropagation();
    openContextMenu(e, node);
  });

  return card;
}

// ─────────────────────────────────────────────────────────────
// UNDO HISTORY  (Ctrl+Z, up to 50 steps)
// ─────────────────────────────────────────────────────────────
const undoStack = [];
const UNDO_LIMIT = 50;

function pushUndo() {
  undoStack.push(JSON.stringify(state.root));
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
}

function undo() {
  if (undoStack.length === 0) { showToast('没有可撤销的操作'); return; }
  state.root = JSON.parse(undoStack.pop());
  // Make sure currentFolder still exists after undo
  if (!findNodeById(state.currentFolderId)) state.currentFolderId = 'root';
  saveData();
  renderAll();
  showToast('已撤销 ↩');
}

// ─────────────────────────────────────────────────────────────
// DRAG & DROP — CARDS
//
// Direction fix: use the card's DOM position index to decide
// 'before' vs 'after', not mouse Y (which fails on multi-column grids).
// Commit the move in 'dragend', which fires exactly once always.
// ─────────────────────────────────────────────────────────────
function getCardIndex(cardEl) {
  const cards = Array.from(contentArea.querySelectorAll('.card-folder, .card-bookmark'));
  return cards.indexOf(cardEl);
}

function setupCardDrag(card, node) {
  card.setAttribute('draggable', 'true');

  card.addEventListener('dragstart', e => {
    state.drag.sourceId        = node.id;
    state.drag.sourceType      = 'card';
    state.drag.pendingTargetId = null;
    state.drag.pendingPosition = null;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', node.id);
    setTimeout(() => card.classList.add('dragging'), 0);
  });

  // dragend fires always and exactly once — safe place to commit
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    clearAllDragStyles();
    const { sourceId, pendingTargetId, pendingPosition } = state.drag;

    if (sourceId) {
      pushUndo();
      let moved = false;

      if (!pendingTargetId) {
        // No target set at all → dropped on empty space, move to end of current folder
        // Only do this for card-initiated drags (tree drags have no meaningful "end")
        if (state.drag.sourceType === 'card') {
          const folder = state.drag.currentFolder;
          const { node: dragNode, parentArr } = findNodeById(sourceId) || {};
          if (dragNode && parentArr && folder) {
            const si = parentArr.indexOf(dragNode);
            const alreadyLast = parentArr === folder.children && si === folder.children.length - 1;
            if (si !== -1 && !alreadyLast) {
              parentArr.splice(si, 1);
              if (!folder.children) folder.children = [];
              folder.children.push(dragNode);
              moved = true;
            }
          }
        }
      } else if (pendingPosition) {
        moved = moveNode(sourceId, pendingTargetId, pendingPosition);
      }

      if (moved) { saveData(); renderAll(); }
      else undoStack.pop();
    }
    state.drag.sourceId = state.drag.pendingTargetId = state.drag.pendingPosition = null;
  });

  card.addEventListener('dragover', e => {
    e.preventDefault();
    const dragId = state.drag.sourceId;
    if (!dragId || dragId === node.id) return;
    e.dataTransfer.dropEffect = 'move';

    clearAllDragStyles();
    card.classList.add('drag-over');

    // Use DOM index order to decide before/after — correct for grid layouts
    const sourceCard = contentArea.querySelector(`[data-id="${dragId}"]`);
    const sourceIdx  = sourceCard ? getCardIndex(sourceCard) : -1;
    const targetIdx  = getCardIndex(card);

    if (node.type === 'folder') {
      // Middle horizontal zone → drop into folder; edges → reorder
      const rect = card.getBoundingClientRect();
      const relX  = e.clientX - rect.left;
      if (relX > rect.width * 0.2 && relX < rect.width * 0.8) {
        state.drag.pendingTargetId = node.id;
        state.drag.pendingPosition = 'into';
        return;
      }
    }

    state.drag.pendingTargetId = node.id;
    state.drag.pendingPosition = sourceIdx <= targetIdx ? 'after' : 'before';
  });

  card.addEventListener('dragleave', e => {
    if (!card.contains(e.relatedTarget)) {
      card.classList.remove('drag-over');
    }
  });
}

function setupContentAreaDrop(folder) {
  state.drag.currentFolder = folder;
}

// ─────────────────────────────────────────────────────────────
// RENDER: ALL
// ─────────────────────────────────────────────────────────────
function renderAll() {
  renderTree();
  renderBreadcrumb();
  renderContent();
  saveData();
}

// ─────────────────────────────────────────────────────────────
// CONTEXT MENU
// ─────────────────────────────────────────────────────────────
function openContextMenu(e, node) {
  state.contextTarget = node;
  contextMenu.style.display = '';

  // Label: "编辑" for bookmarks, "重命名" for folders
  $('ctx-edit-label').textContent = node.type === 'bookmark' ? '编辑' : '重命名';

  const x = Math.min(e.clientX, window.innerWidth  - 160);
  const y = Math.min(e.clientY, window.innerHeight - 80);
  contextMenu.style.left = x + 'px';
  contextMenu.style.top  = y + 'px';
}

function closeContextMenu() {
  contextMenu.style.display = 'none';
  state.contextTarget = null;
}

$('ctx-edit').addEventListener('click', () => {
  const node = state.contextTarget;
  closeContextMenu();
  if (!node) return;
  if (node.type === 'bookmark') openEditBookmarkModal(node);
  else openRenameFolderModal(node);
});

$('ctx-delete').addEventListener('click', () => {
  const node = state.contextTarget;
  closeContextMenu();
  if (!node) return;
  confirmDelete(node);
});

document.addEventListener('click', e => {
  if (!contextMenu.contains(e.target)) closeContextMenu();
  if (!settingsPanel.contains(e.target) &&
      !$('btn-settings').contains(e.target) &&
      settingsPanel.style.display !== 'none') closeSettings();
});

// ─────────────────────────────────────────────────────────────
// MODAL HELPERS
// ─────────────────────────────────────────────────────────────
let _modalCallback = null;

function openModal(title, bodyHTML, onConfirm) {
  modalTitle.textContent = title;
  modalBody.innerHTML    = bodyHTML;
  _modalCallback         = onConfirm;
  // Reset confirm button style
  modalConfirm.textContent = '确认';
  modalConfirm.style.background = '';
  modalOverlay.style.display = '';
  setTimeout(() => {
    const first = modalBody.querySelector('input, textarea');
    if (first) { first.focus(); if (first.select) first.select(); }
  }, 40);
}

function closeModal() {
  modalOverlay.style.display = 'none';
  _modalCallback = null;
}

modalConfirm.addEventListener('click', () => { if (_modalCallback) _modalCallback(); });
modalCancel.addEventListener('click', closeModal);
modalClose.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); closeContextMenu(); closeSettings(); }
  if (e.key === 'Enter' && modalOverlay.style.display !== 'none') {
    if (document.activeElement?.tagName === 'TEXTAREA') return;
    modalConfirm.click();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && modalOverlay.style.display === 'none') {
    e.preventDefault();
    undo();
  }
});

// ─────────────────────────────────────────────────────────────
// NEW FOLDER
// ─────────────────────────────────────────────────────────────
$('btn-new-folder').addEventListener('click', () => {
  openModal('新建文件夹',
    `<div class="form-group">
       <label class="form-label">文件夹名称</label>
       <input class="form-input" id="input-folder-name" placeholder="例如：工作、设计、娱乐…"/>
     </div>`,
    () => {
      const name = $('input-folder-name').value.trim();
      if (!name) { shakeEl($('input-folder-name')); return; }
      pushUndo();
      const { node: cur } = findNodeById(state.currentFolderId) || { node: state.root };
      if (!cur.children) cur.children = [];
      cur.children.push({ type: 'folder', id: uid(), name, children: [] });
      closeModal(); renderAll();
    }
  );
});

// ─────────────────────────────────────────────────────────────
// NEW BOOKMARK
// ─────────────────────────────────────────────────────────────
$('btn-new-bookmark').addEventListener('click', openNewBookmarkModal);

function openNewBookmarkModal() {
  openModal('新建书签',
    `<div class="form-group">
       <label class="form-label">网站名称 <span style="color:var(--danger)">*</span></label>
       <input class="form-input" id="bm-name" placeholder="例如：GitHub"/>
     </div>
     <div class="form-group">
       <label class="form-label">URL <span style="color:var(--danger)">*</span></label>
       <input class="form-input" id="bm-url" placeholder="https://example.com" type="url"/>
     </div>
     <div class="form-group">
       <label class="form-label">描述（可选）</label>
       <textarea class="form-input" id="bm-desc" placeholder="简单描述这个网站…"></textarea>
     </div>`,
    () => {
      const name = $('bm-name').value.trim();
      let url    = $('bm-url').value.trim();
      const desc = $('bm-desc').value.trim();
      if (!name) { shakeEl($('bm-name')); return; }
      if (!url)  { shakeEl($('bm-url'));  return; }
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
      pushUndo();
      const { node: cur } = findNodeById(state.currentFolderId) || { node: state.root };
      if (!cur.children) cur.children = [];
      cur.children.push({ type: 'bookmark', id: uid(), name, url, description: desc, createdAt: Date.now() });
      closeModal(); renderAll();
    }
  );
}

// ─────────────────────────────────────────────────────────────
// EDIT BOOKMARK  (name + url + description)
// ─────────────────────────────────────────────────────────────
function openEditBookmarkModal(node) {
  openModal('编辑书签',
    `<div class="form-group">
       <label class="form-label">网站名称 <span style="color:var(--danger)">*</span></label>
       <input class="form-input" id="edit-bm-name" value="${escHtml(node.name)}"/>
     </div>
     <div class="form-group">
       <label class="form-label">URL <span style="color:var(--danger)">*</span></label>
       <input class="form-input" id="edit-bm-url" type="url" value="${escHtml(node.url)}"/>
     </div>
     <div class="form-group">
       <label class="form-label">描述</label>
       <textarea class="form-input" id="edit-bm-desc">${escHtml(node.description || '')}</textarea>
     </div>`,
    () => {
      const name = $('edit-bm-name').value.trim();
      let url    = $('edit-bm-url').value.trim();
      const desc = $('edit-bm-desc').value.trim();
      if (!name) { shakeEl($('edit-bm-name')); return; }
      if (!url)  { shakeEl($('edit-bm-url'));  return; }
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
      pushUndo();
      node.name        = name;
      node.url         = url;
      node.description = desc;
      closeModal(); renderAll();
    }
  );
}

// ─────────────────────────────────────────────────────────────
// RENAME FOLDER
// ─────────────────────────────────────────────────────────────
function openRenameFolderModal(node) {
  openModal('重命名文件夹',
    `<div class="form-group">
       <label class="form-label">文件夹名称</label>
       <input class="form-input" id="input-rename" value="${escHtml(node.name)}"/>
     </div>`,
    () => {
      const name = $('input-rename').value.trim();
      if (!name) { shakeEl($('input-rename')); return; }
      pushUndo();
      node.name = name;
      closeModal(); renderAll();
    }
  );
}

// ─────────────────────────────────────────────────────────────
// DELETE
// ─────────────────────────────────────────────────────────────
function confirmDelete(node) {
  const label = node.type === 'folder'
    ? `文件夹「${node.name}」及其所有内容`
    : `书签「${node.name}」`;

  openModal('确认删除',
    `<p style="font-size:13.5px;color:var(--text-secondary);line-height:1.6">
       确定要删除 <strong style="color:var(--text-primary)">${escHtml(label)}</strong> 吗？<br>此操作不可撤销。
     </p>`,
    () => {
      if (node.id === state.currentFolderId) state.currentFolderId = 'root';
      pushUndo();
      deleteNodeById(node.id);
      closeModal(); renderAll();
    }
  );
  modalConfirm.textContent = '删除';
  modalConfirm.style.background = 'var(--danger)';
}

// ─────────────────────────────────────────────────────────────
// SEARCH
// ─────────────────────────────────────────────────────────────
searchInput.addEventListener('input', () => {
  state.searchQuery = searchInput.value;
  renderContent();
  if (state.searchQuery) {
    breadcrumb.innerHTML =
      `<span style="cursor:pointer" id="bc-home">全部收藏</span>
       <span class="breadcrumb-sep">/</span>
       <span>「${escHtml(state.searchQuery)}」的搜索结果</span>`;
    $('bc-home').addEventListener('click', () => {
      searchInput.value = '';
      state.searchQuery = '';
      state.currentFolderId = 'root';
      renderAll();
    });
  } else {
    renderBreadcrumb();
  }
});

// ─────────────────────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────────────────────
function shakeEl(el) {
  if (!el) return;
  el.style.animation = 'none';
  void el.offsetHeight;
  el.style.animation = 'shake 320ms ease';
  el.addEventListener('animationend', () => { el.style.animation = ''; }, { once: true });
}

// ─────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────

// Register content-area drag listeners ONCE (not per render)
// Only call preventDefault to allow dropping — never touch pending state here.
// The pending state is set exclusively by individual card dragover handlers.
// If dragend fires with no pendingTargetId it means the user dropped on empty
// space, and we move the node to the end of the current folder.
contentArea.addEventListener('dragover', e => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
});

applyTheme(state.settings.theme);
renderAll();
