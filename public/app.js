/* ============================================================
   NEON.IMG — 前端交互脚本
   严格按 CLAUDE.md §5 和文档 §7.3 实现
   ============================================================ */

// ---------- DOM 引用 ----------
const dropzone  = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const gallery   = document.getElementById('gallery');
const empty     = document.getElementById('empty');
const count     = document.getElementById('count');
const count2    = document.getElementById('count2');
const toastWrap = document.getElementById('toastWrap');
const modal     = document.getElementById('modal');
const modalOk   = document.getElementById('modalOk');
const modalCancel = document.getElementById('modalCancel');

let pendingDelete = null;
let pendingPurge = null;
let pendingPurgeAll = false;
let imageList = [];
let lbCurrentIndex = 0;
let viewBtnGrid = null;
let viewBtnList = null;
let searchKeyword = '';
let sortMode = 'time-desc';
let filterExt = 'all';
let selectedIds = new Set();
let batchMode = false;
let _pendingBatchDelete = false;

// ---------- 会话 ----------

function getJwt() {
  return localStorage.getItem('neon_img_jwt') || '';
}

function getUsername() {
  return localStorage.getItem('neon_img_username') || '';
}

function saveSession(data) {
  localStorage.setItem('neon_img_jwt', data.jwt);
  localStorage.setItem('neon_img_username', data.username);
  localStorage.setItem('neon_img_api_token', data.apiToken);
  localStorage.setItem('neon_img_is_admin', data.isAdmin ? '1' : '0');
}

function isAdmin() {
  return localStorage.getItem('neon_img_is_admin') === '1';
}

function clearSession() {
  ['neon_img_jwt', 'neon_img_username', 'neon_img_api_token', 'neon_img_is_admin'].forEach(function (k) {
    localStorage.removeItem(k);
  });
}

function isLoggedIn() {
  return !!getJwt();
}

function getAuthHeader() {
  return { 'Authorization': 'Bearer ' + getJwt() };
}

function handleUnauth() {
  clearSession();
  showAuthModal();
  toast('// SESSION EXPIRED // LOGIN AGAIN', 'error');
}

// ---------- 工具 ----------

function toast(msg, type) {
  type = type || 'success';
  var prefixMap = { success: '[ SUCCESS ]', error: '[ ERROR ]', info: '[ INFO ]', copied: '[ LINK COPIED ]' };
  var prefix = prefixMap[type] || '[ INFO ]';
  var el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = prefix + ' ' + msg;
  toastWrap.appendChild(el);

  setTimeout(function () {
    el.classList.add('toast-out');
    el.addEventListener('animationend', function () {
      el.remove();
    });
  }, 2500);
}

function copy(text, format) {
  navigator.clipboard.writeText(text).then(function () {
    var fmtMap = { url: 'URL', md: 'MARKDOWN', html: 'HTML' };
    toast('FORMAT \xB7 ' + (fmtMap[format] || format.toUpperCase()), 'copied');
  }).catch(function () {
    toast('COPY FAILED', 'error');
  });
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

function escapeHtml(str) {
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

function updateCount(n) {
  count.textContent = n;
  count2.textContent = n;
  if (n > 0) {
    empty.classList.add('hidden');
  } else {
    empty.classList.remove('hidden');
  }
}

// ---------- 卡片渲染 ----------

function renderCard(item, index) {
  var ext = item.name.split('.').pop().toUpperCase();
  var pref = localStorage.getItem('neon_img_last_format') || 'url';
  var card = document.createElement('div');
  card.className = 'card';
  card.dataset.id = item.id;
  card._item = item;

  card.innerHTML =
    '<div class="preview">' +
      '<div class="card-check">&#10003;</div>' +
      '<img src="' + escapeHtml(item.thumbUrl || item.url) + '" alt="' + escapeHtml(item.name) + '" loading="lazy">' +
      '<div class="card-overlay">' +
        '<div class="card-overlay-btns">' +
          '<button class="btn-overlay' + (pref === 'url'  ? ' btn-preferred' : '') + '" data-act="url">URL</button>' +
          '<button class="btn-overlay' + (pref === 'md'   ? ' btn-preferred' : '') + '" data-act="md">MD</button>' +
          '<button class="btn-overlay' + (pref === 'html' ? ' btn-preferred' : '') + '" data-act="html">&lt;/&gt;</button>' +
        '</div>' +
        '<div class="card-overlay-name" title="' + escapeHtml(item.name) + '">' + escapeHtml(item.name) + '</div>' +
      '</div>' +
    '</div>' +
    '<span class="badge-id">#' + String(index + 1).padStart(3, '0') + '</span>' +
    '<span class="badge-ext">.' + escapeHtml(ext) + '</span>' +
    '<div class="info">' +
      '<div class="info-row">' +
        '<span class="meta">' + formatSize(item.size) + '</span>' +
        '<button class="btn btn-danger" data-act="del">DEL</button>' +
      '</div>' +
    '</div>';

  return card;
}

function rerender(list) {
  gallery.innerHTML = '';
  list.forEach(function (item, i) {
    gallery.appendChild(renderCard(item, i));
  });
  updateCount(list.length);
  if (batchMode) updateBatchUI();
}

// ---------- API ----------

function loadList() {
  fetch('/api/list', { headers: getAuthHeader() })
    .then(function (res) { return res.json(); })
    .then(function (json) {
      if (json.code === 401) { handleUnauth(); return; }
      imageList = json.data || [];
      applyFilters();
      updateTrashBadge();
    })
    .catch(function () {
      toast('LOAD LIST FAILED', 'error');
    });
}

// ---------- 筛选 / 排序 / 搜索 ----------

function getFilteredList() {
  var list = imageList.slice();

  // 1. 格式筛选
  if (filterExt !== 'all') {
    list = list.filter(function (item) {
      return item.name.toLowerCase().endsWith('.' + filterExt);
    });
  }

  // 2. 关键词搜索
  if (searchKeyword.trim() !== '') {
    var kw = searchKeyword.trim().toLowerCase();
    list = list.filter(function (item) {
      return item.name.toLowerCase().indexOf(kw) !== -1;
    });
  }

  // 3. 排序
  list.sort(function (a, b) {
    switch (sortMode) {
      case 'time-asc':  return new Date(a.uploadedAt) - new Date(b.uploadedAt);
      case 'time-desc': return new Date(b.uploadedAt) - new Date(a.uploadedAt);
      case 'size-asc':  return a.size - b.size;
      case 'size-desc': return b.size - a.size;
      case 'name-asc':  return a.name.localeCompare(b.name);
      case 'name-desc': return b.name.localeCompare(a.name);
      default: return 0;
    }
  });

  return list;
}

function applyFilters() {
  var filtered = getFilteredList();
  rerender(filtered);

  if (filtered.length === 0) {
    var msg = '// NO PACKETS FOUND';
    if (searchKeyword.trim() !== '') {
      msg += ' // QUERY: "' + searchKeyword.trim() + '"';
    }
    if (filterExt !== 'all') {
      msg += ' // TYPE: ' + filterExt.toUpperCase();
    }
    if (searchKeyword.trim() === '' && filterExt === 'all') {
      msg = '// NO DATA FOUND IN VAULT';
    }
    empty.textContent = msg;
  }
}

// ---------- 控制栏事件绑定 ----------

var searchTimer = null;

function bindControlEvents() {
  var searchInput = document.getElementById('searchInput');
  var sortSelect = document.getElementById('sortSelect');
  var filterTags = document.getElementById('filterTags');

  // 搜索（debounce 300ms）
  if (searchInput) {
    searchInput.addEventListener('input', function () {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        searchKeyword = searchInput.value;
        applyFilters();
      }, 300);
    });
  }

  // 排序
  if (sortSelect) {
    var savedSort = localStorage.getItem('neon_img_sort');
    if (savedSort) {
      sortMode = savedSort;
      sortSelect.value = savedSort;
    }
    sortSelect.addEventListener('change', function () {
      sortMode = sortSelect.value;
      localStorage.setItem('neon_img_sort', sortMode);
      applyFilters();
    });
  }

  // 格式筛选
  if (filterTags) {
    filterTags.addEventListener('click', function (e) {
      var tag = e.target.closest('.filter-tag');
      if (!tag) return;
      var btns = filterTags.querySelectorAll('.filter-tag');
      btns.forEach(function (b) { b.classList.remove('active'); });
      tag.classList.add('active');
      filterExt = tag.dataset.ext;
      applyFilters();
    });
  }
}

function uploadFiles(files) {
  if (!files || files.length === 0) return;

  // 客户端文件校验
  var ALLOWED = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
  var MAX_SIZE = 10 * 1024 * 1024;
  for (var i = 0; i < files.length; i++) {
    if (files[i].size > MAX_SIZE) {
      toast('// ERROR: PACKET TOO LARGE // MAX SIZE 10MB', 'error');
      return;
    }
    var ext = '.' + files[i].name.split('.').pop().toLowerCase();
    if (ALLOWED.indexOf(ext) === -1) {
      toast('// ERROR: FORMAT REJECTED // ACCEPTED: JPG PNG GIF WEBP SVG', 'error');
      return;
    }
  }

  var fd = new FormData();
  for (var i = 0; i < files.length; i++) {
    fd.append('files', files[i]);
  }

  // 进度条 DOM
  var prog = document.createElement('div');
  prog.className = 'upload-progress';
  prog.innerHTML =
    '<div class="upload-progress-text">// UPLINK IN PROGRESS... ' + progressText(0) + '</div>' +
    '<div class="upload-progress-track">' +
      '<div class="upload-progress-fill" style="width:0%"></div>' +
    '</div>';
  dropzone.appendChild(prog);

  var xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/upload');
  xhr.setRequestHeader('Authorization', 'Bearer ' + getJwt());

  xhr.upload.onprogress = function (e) {
    if (e.lengthComputable) {
      var pct = Math.round(e.loaded / e.total * 100);
      prog.querySelector('.upload-progress-text').textContent =
        '// UPLINK IN PROGRESS... ' + progressText(pct);
      prog.querySelector('.upload-progress-fill').style.width = pct + '%';
    }
  };

  xhr.onload = function () {
    try {
      var json = JSON.parse(xhr.responseText);
      if (json.code === 0) {
        dropzone.classList.add('flash-success');
        setTimeout(function () { dropzone.classList.remove('flash-success'); }, 600);
        toast('DATA PACKET INJECTED // +' + files.length + ' FILE(S)');
        loadList();
      } else if (json.code === 401) {
        handleUnauth();
      } else {
        toast(json.msg || 'UPLOAD FAILED', 'error');
      }
    } catch (e) {
      toast('RESPONSE PARSE ERROR', 'error');
    }
    setTimeout(function () { prog.remove(); }, 1000);
  };

  xhr.onerror = function () {
    toast('CONNECTION LOST // RETRY?', 'error');
    prog.remove();
  };

  xhr.send(fd);
}

function progressText(pct) {
  var filled = Math.round(pct / 10);
  var bar = '';
  for (var i = 0; i < 10; i++) {
    bar += i < filled ? '█' : '░';
  }
  return '[' + bar + '] ' + pct + '%';
}

// ---------- 删除模态框 ----------

function askDelete(id, card) {
  pendingDelete = { id: id, card: card };
  pendingPurge = null;
  pendingPurgeAll = false;
  modal.querySelector('.modal-header').textContent = '! CONFIRM // DELETE';
  modal.querySelector('.modal-body').textContent = '即将将该数据包移入回收站，确认继续？';
  modalOk.textContent = '[ CONFIRM ]';
  modal.classList.remove('hidden');
}

function askPurge(id) {
  pendingPurge = { id: id };
  pendingDelete = null;
  pendingPurgeAll = false;
  modal.querySelector('.modal-header').textContent = '! CONFIRM // PURGE';
  modal.querySelector('.modal-body').textContent = '即将永久销毁该数据包，不可恢复，确认继续？';
  modalOk.textContent = '[ PURGE ]';
  modal.classList.remove('hidden');
}

function askPurgeAll() {
  pendingPurgeAll = true;
  pendingDelete = null;
  pendingPurge = null;
  modal.querySelector('.modal-header').textContent = '! CONFIRM // PURGE ALL';
  modal.querySelector('.modal-body').textContent = '将永久销毁回收站中的全部数据包，不可恢复，确认继续？';
  modalOk.textContent = '[ PURGE ALL ]';
  modal.classList.remove('hidden');
}

var _modalSubmitting = false;

function doDelete() {
  if (_modalSubmitting) return;
  _modalSubmitting = true;
  if (pendingDelete) {
    var id = pendingDelete.id;
    fetch('/api/image/' + id, {
      method: 'DELETE',
      headers: getAuthHeader()
    })
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (json.code === 0) {
          toast('DATA MOVED TO RECYCLE BIN');
          loadList();
        } else if (json.code === 401) {
          handleUnauth();
        } else {
          toast(json.msg, 'error');
        }
      })
      .catch(function () {
        toast('DELETE FAILED', 'error');
      })
      .then(function () {
        pendingDelete = null;
        modal.classList.add('hidden');
        _modalSubmitting = false;
      });
  } else if (pendingPurge) {
    var purgeId = pendingPurge.id;
    fetch('/api/purge/' + purgeId, {
      method: 'DELETE',
      headers: getAuthHeader()
    })
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (json.code === 0) {
          toast('[ DATA PURGED PERMANENTLY ]');
          loadTrash();
        } else if (json.code === 401) {
          handleUnauth();
        } else {
          toast(json.msg, 'error');
        }
      })
      .catch(function () {
        toast('PURGE FAILED', 'error');
      })
      .then(function () {
        pendingPurge = null;
        modal.classList.add('hidden');
        _modalSubmitting = false;
      });
  } else if (_pendingAdminPurgeId) {
    var adminPurgeId = _pendingAdminPurgeId;
    fetch('/api/admin/users/' + adminPurgeId, {
      method: 'DELETE',
      headers: getAuthHeader()
    })
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (json.code === 0) {
          toast('// USER PURGED');
          loadAdminPanel();
        } else if (json.code === 401) {
          handleUnauth();
        } else {
          toast(json.msg, 'error');
        }
      })
      .catch(function () {
        toast('// PURGE USER FAILED //', 'error');
      })
      .then(function () {
        _pendingAdminPurgeId = null;
        _pendingAdminPurgeName = null;
        modal.classList.add('hidden');
        _modalSubmitting = false;
      });
  } else if (_pendingBatchDelete) {
    doBatchDelete();
  } else if (pendingPurgeAll) {
    doPurgeAll();
  }
}

function cancelDelete() {
  pendingDelete = null;
  pendingPurge = null;
  pendingPurgeAll = false;
  _pendingAdminPurgeId = null;
  _pendingAdminPurgeName = null;
  _pendingBatchDelete = false;
  _modalSubmitting = false;
  modal.classList.add('hidden');
}

modalOk.addEventListener('click', doDelete);
modalCancel.addEventListener('click', cancelDelete);

// ---------- 事件委托：卡片按钮 + 批量选择 ----------

gallery.addEventListener('click', function (e) {
  var card = e.target.closest('.card');
  if (!card) return;

  var btn = e.target.closest('[data-act]');
  if (btn) {
    var act = btn.dataset.act;
    var id = card.dataset.id;
    var item = card._item;

    if (act === 'url') {
      copy(item.url, 'url');
      markCopied(btn);
      savePreference('url');
    } else if (act === 'md') {
      copy('![' + item.name + '](' + item.url + ')', 'md');
      markCopied(btn);
      savePreference('md');
    } else if (act === 'html') {
      copy('<img src="' + item.url + '" alt="' + item.name + '">', 'html');
      markCopied(btn);
      savePreference('html');
    } else if (act === 'del') {
      askDelete(id, card);
    }
    return;
  }

  // card-check 点击
  if (e.target.closest('.card-check')) {
    toggleSelect(card.dataset.id, card);
    if (!batchMode) enterBatchMode();
    return;
  }

  // 批量模式：点击卡片任意非按钮区域
  if (batchMode) {
    toggleSelect(card.dataset.id, card);
    return;
  }

  // Lightbox：点击预览区域
  if (e.target.closest('.card-overlay')) return;
  var preview = e.target.closest('.preview');
  if (preview) {
    var item = card._item;
    var idx = imageList.findIndex(function(x) { return x.id === item.id; });
    if (idx >= 0) openLightbox(idx);
  }
});

// 长按进入批量模式
var _longPressTimer = null;
var _longPressCard = null;
var _longPressStartX = 0;
var _longPressStartY = 0;

function _startLongPress(e, cx, cy) {
  var card = e.target.closest('.card');
  if (!card || e.target.closest('[data-act]')) return;
  _longPressCard = card;
  _longPressStartX = cx;
  _longPressStartY = cy;
  _longPressTimer = setTimeout(function () {
    if (!batchMode) enterBatchMode();
    toggleSelect(_longPressCard.dataset.id, _longPressCard);
    _longPressTimer = null;
  }, 500);
}

function _cancelLongPress() {
  if (_longPressTimer) {
    clearTimeout(_longPressTimer);
    _longPressTimer = null;
  }
  _longPressCard = null;
}

gallery.addEventListener('mousedown', function (e) {
  _startLongPress(e, e.clientX, e.clientY);
});

gallery.addEventListener('touchstart', function (e) {
  var t = e.touches[0];
  _startLongPress(e, t.clientX, t.clientY);
}, { passive: true });

gallery.addEventListener('mouseup', _cancelLongPress);
gallery.addEventListener('mouseleave', _cancelLongPress);
gallery.addEventListener('touchend', _cancelLongPress);
gallery.addEventListener('touchcancel', _cancelLongPress);

gallery.addEventListener('mousemove', function (e) {
  if (!_longPressTimer) return;
  if (Math.abs(e.clientX - _longPressStartX) > 10 || Math.abs(e.clientY - _longPressStartY) > 10) {
    _cancelLongPress();
  }
});

gallery.addEventListener('touchmove', function (e) {
  if (!_longPressTimer) return;
  var t = e.touches[0];
  if (Math.abs(t.clientX - _longPressStartX) > 10 || Math.abs(t.clientY - _longPressStartY) > 10) {
    _cancelLongPress();
  }
}, { passive: true });

// ---------- 批量选择函数 ----------

function enterBatchMode() {
  batchMode = true;
  gallery.classList.add('batch-mode');
  var bar = document.getElementById('batchBar');
  if (!bar) {
    bar = buildBatchBar();
    document.body.appendChild(bar);
    bindBatchBarEvents(bar);
  }
  bar.classList.remove('hidden');
  bar.style.animation = 'slideUp 0.25s ease';
  updateBatchUI();
}

function exitBatchMode() {
  batchMode = false;
  selectedIds.clear();
  gallery.classList.remove('batch-mode');
  var cards = gallery.querySelectorAll('.card');
  cards.forEach(function (c) { c.classList.remove('card-selected'); });
  var bar = document.getElementById('batchBar');
  if (bar) bar.classList.add('hidden');
}

function toggleSelect(id, card) {
  if (selectedIds.has(id)) {
    selectedIds.delete(id);
    if (card) card.classList.remove('card-selected');
  } else {
    selectedIds.add(id);
    if (card) card.classList.add('card-selected');
  }
  updateBatchUI();
  if (selectedIds.size === 0) exitBatchMode();
}

function updateBatchUI() {
  var n = selectedIds.size;
  var el = document.getElementById('bbCount');
  if (el) el.textContent = n;
  var cards = gallery.querySelectorAll('.card');
  cards.forEach(function (c) {
    var id = c.dataset.id;
    if (selectedIds.has(id)) {
      c.classList.add('card-selected');
    } else {
      c.classList.remove('card-selected');
    }
  });
}

function buildBatchBar() {
  var bar = document.createElement('div');
  bar.id = 'batchBar';
  bar.className = 'batch-bar hidden';
  bar.innerHTML =
    '<div class="bb-info">// SELECTED: <b id="bbCount">0</b> PACKETS</div>' +
    '<div class="bb-actions">' +
      '<button id="batchSelectAll" class="btn">[ SELECT ALL ]</button>' +
      '<button id="batchCopyBtn" class="btn">[ COPY LINKS ]</button>' +
      '<button id="batchDeleteBtn" class="btn btn-danger">[ DELETE ALL ]</button>' +
      '<button id="batchCancelBtn" class="btn">[ CANCEL ]</button>' +
    '</div>';
  return bar;
}

function bindBatchBarEvents(bar) {
  bar.querySelector('#batchSelectAll').addEventListener('click', function () {
    var list = getFilteredList();
    list.forEach(function (item) { selectedIds.add(item.id); });
    updateBatchUI();
  });

  bar.querySelector('#batchCopyBtn').addEventListener('click', function () {
    var urls = [];
    selectedIds.forEach(function (id) {
      var item = imageList.find(function (x) { return x.id === id; });
      if (item) urls.push(item.url);
    });
    if (urls.length > 0) {
      navigator.clipboard.writeText(urls.join('\n')).then(function () {
        toast('// COPIED // ' + urls.length + ' LINKS TO CLIPBOARD', 'copied');
      }).catch(function () {
        toast('COPY FAILED', 'error');
      });
    }
  });

  bar.querySelector('#batchDeleteBtn').addEventListener('click', function () {
    var n = selectedIds.size;
    if (n === 0) return;
    _pendingBatchDelete = true;
    pendingDelete = null;
    pendingPurge = null;
    pendingPurgeAll = false;
    _pendingAdminPurgeId = null;
    modal.querySelector('.modal-header').textContent = '! WARNING: BATCH DELETE';
    modal.querySelector('.modal-body').textContent = '即将移入回收站 ' + n + ' 个数据包，确认继续？';
    modalOk.textContent = '[ CONFIRM DELETE ]';
    modalCancel.textContent = '[ CANCEL ]';
    modal.classList.remove('hidden');
  });

  bar.querySelector('#batchCancelBtn').addEventListener('click', exitBatchMode);
}

async function doBatchDelete() {
  var ids = Array.from(selectedIds);
  var total = ids.length;
  var failed = 0;

  for (var i = 0; i < ids.length; i++) {
    try {
      var res = await fetch('/api/image/' + ids[i], {
        method: 'DELETE',
        headers: getAuthHeader()
      });
      var json = await res.json();
      if (json.code === 401) {
        handleUnauth();
        _pendingBatchDelete = false;
        _modalSubmitting = false;
        modal.classList.add('hidden');
        return;
      }
      if (json.code !== 0) failed++;
    } catch (e) {
      failed++;
    }
  }

  _pendingBatchDelete = false;
  _modalSubmitting = false;
  modal.classList.add('hidden');
  exitBatchMode();
  loadList();

  if (failed > 0) {
    toast('// WARNING // ' + failed + '/' + total + ' DELETES FAILED', 'error');
  } else {
    toast('// ' + total + ' PACKETS MOVED TO RECYCLE BIN', 'success');
  }
}

function markCopied(btn) {
  var orig = btn.textContent;
  btn.textContent = '✓ COPIED';
  btn.classList.add('btn-copied');
  setTimeout(function () {
    btn.textContent = orig;
    btn.classList.remove('btn-copied');
  }, 1500);
}

function savePreference(format) {
  localStorage.setItem('neon_img_last_format', format);
}

// ---------- 拖拽上传 ----------

var dragCounter = 0;

dropzone.addEventListener('click', function () {
  fileInput.click();
});

fileInput.addEventListener('change', function (e) {
  uploadFiles(e.target.files);
});

dropzone.addEventListener('dragenter', function (e) {
  e.preventDefault();
  dragCounter++;
  if (dragCounter === 1) {
    dropzone.classList.add('hover');
    var icon = dropzone.querySelector('.uplink-icon');
    var main = dropzone.querySelector('.uplink-main');
    if (icon) icon.textContent = '⬇';
    if (main) main.innerHTML = '> PACKET DETECTED // RELEASE TO INJECT<span class="caret">_</span>';
  }
});

dropzone.addEventListener('dragover', function (e) {
  e.preventDefault();
});

dropzone.addEventListener('dragleave', function (e) {
  e.preventDefault();
  dragCounter--;
  if (dragCounter === 0) {
    dropzone.classList.remove('hover');
    var icon = dropzone.querySelector('.uplink-icon');
    var main = dropzone.querySelector('.uplink-main');
    if (icon) icon.textContent = '▼';
    if (main) main.innerHTML = '> DROP_FILE_HERE.exe<span class="caret">_</span>';
  }
});

dropzone.addEventListener('drop', function (e) {
  e.preventDefault();
  dragCounter = 0;
  dropzone.classList.remove('hover');
  var icon = dropzone.querySelector('.uplink-icon');
  var main = dropzone.querySelector('.uplink-main');
  if (icon) icon.textContent = '▼';
  if (main) main.innerHTML = '> DROP_FILE_HERE.exe<span class="caret">_</span>';
  uploadFiles(e.dataTransfer.files);
});

// ---------- 粘贴上传 ----------

document.addEventListener('paste', function (e) {
  var tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  var items = e.clipboardData && e.clipboardData.items;
  if (!items) return;
  var files = [];
  for (var i = 0; i < items.length; i++) {
    if (items[i].type.indexOf('image/') === 0) {
      files.push(items[i].getAsFile());
    }
  }
  if (files.length > 0) uploadFiles(files);
});

// ---------- Lightbox ----------

function formatDate(iso) {
  var d = new Date(iso);
  var yyyy = d.getFullYear();
  var mm = String(d.getMonth() + 1).padStart(2, '0');
  var dd = String(d.getDate()).padStart(2, '0');
  var hh = String(d.getHours()).padStart(2, '0');
  var mi = String(d.getMinutes()).padStart(2, '0');
  return yyyy + '-' + mm + '-' + dd + ' ' + hh + ':' + mi;
}

function buildLightbox(item) {
  var total = imageList.length;
  var idx = lbCurrentIndex;
  var ext = item.name.split('.').pop().toUpperCase();
  var pref = localStorage.getItem('neon_img_last_format') || 'url';

  var lb = document.createElement('div');
  lb.id = 'lightbox';
  lb.innerHTML =
    '<div class="lb-backdrop"></div>' +
    '<div class="lb-container">' +
      '<div class="lb-header">' +
        '<div class="lb-header-left">' +
          '<span class="lb-title">' + escapeHtml(item.name) + '</span>' +
          '<span class="lb-badge-ext">.' + escapeHtml(ext) + '</span>' +
        '</div>' +
        '<div class="lb-header-right">' +
          '<span class="lb-meta">' + formatSize(item.size) + ' \xB7 ' + formatDate(item.uploadedAt) + '</span>' +
          '<button class="btn btn-danger lb-close">× CLOSE WINDOW</button>' +
        '</div>' +
      '</div>' +
      '<div class="lb-stage">' +
        '<button class="lb-nav lb-prev">‹ PREV</button>' +
        '<img class="lb-img" src="' + escapeHtml(item.url) + '" alt="' + escapeHtml(item.name) + '">' +
        '<button class="lb-nav lb-next">NEXT ›</button>' +
      '</div>' +
      '<div class="lb-footer">' +
        '<span class="lb-index">// IMAGE ' + String(idx + 1).padStart(3, '0') + ' / ' + String(total).padStart(3, '0') + ' //</span>' +
        '<div class="lb-actions">' +
          '<button class="btn' + (pref === 'url'  ? ' btn-preferred' : '') + '" data-act="url">URL</button>' +
          '<button class="btn' + (pref === 'md'   ? ' btn-preferred' : '') + '" data-act="md">MD</button>' +
          '<button class="btn' + (pref === 'html' ? ' btn-preferred' : '') + '" data-act="html">HTML</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  return lb;
}

function openLightbox(index) {
  lbCurrentIndex = index;
  var item = imageList[index];
  if (!item) return;

  var existing = document.getElementById('lightbox');
  if (existing) existing.remove();

  var lb = buildLightbox(item);
  document.body.appendChild(lb);
  document.body.style.overflow = 'hidden';
  document.addEventListener('keydown', onLbKeydown);

  requestAnimationFrame(function () {
    lb.classList.add('lb-open');
  });

  bindLightboxEvents(lb);
}

function closeLightbox() {
  var lb = document.getElementById('lightbox');
  if (!lb) return;
  document.removeEventListener('keydown', onLbKeydown);
  document.body.style.overflow = '';
  lb.classList.remove('lb-open');
  lb.addEventListener('transitionend', function () {
    if (lb.parentNode) lb.parentNode.removeChild(lb);
  }, { once: true });
}

function bindLightboxEvents(lb) {
  lb.querySelector('.lb-backdrop').addEventListener('click', closeLightbox);
  lb.querySelector('.lb-close').addEventListener('click', closeLightbox);

  lb.querySelector('.lb-prev').addEventListener('click', function (e) {
    e.stopPropagation();
    navigateLightbox(-1);
  });
  lb.querySelector('.lb-next').addEventListener('click', function (e) {
    e.stopPropagation();
    navigateLightbox(1);
  });

  lb.querySelector('.lb-actions').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    var act = btn.dataset.act;
    var item = imageList[lbCurrentIndex];
    if (act === 'url') {
      copy(item.url, 'url');
      markCopied(btn);
      savePreference('url');
    } else if (act === 'md') {
      copy('![' + item.name + '](' + item.url + ')', 'md');
      markCopied(btn);
      savePreference('md');
    } else if (act === 'html') {
      copy('<img src="' + item.url + '" alt="' + item.name + '">', 'html');
      markCopied(btn);
      savePreference('html');
    }
  });
}

function onLbKeydown(e) {
  if (e.key === 'Escape') { closeLightbox(); return; }
  if (e.key === 'ArrowLeft')  { navigateLightbox(-1); return; }
  if (e.key === 'ArrowRight') { navigateLightbox(1);  return; }
}

function navigateLightbox(dir) {
  if (imageList.length === 0) return;
  lbCurrentIndex = (lbCurrentIndex + dir + imageList.length) % imageList.length;
  var item = imageList[lbCurrentIndex];
  var lb = document.getElementById('lightbox');
  if (!lb) return;

  lb.querySelector('.lb-img').src = item.url;
  lb.querySelector('.lb-img').alt = item.name;
  lb.querySelector('.lb-title').textContent = item.name;
  lb.querySelector('.lb-badge-ext').textContent = '.' + item.name.split('.').pop().toUpperCase();
  lb.querySelector('.lb-meta').textContent = formatSize(item.size) + ' \xB7 ' + formatDate(item.uploadedAt);
  lb.querySelector('.lb-index').textContent = '// IMAGE ' + String(lbCurrentIndex + 1).padStart(3, '0') + ' / ' + String(imageList.length).padStart(3, '0') + ' //';

  var pref = localStorage.getItem('neon_img_last_format') || 'url';
  var btns = lb.querySelectorAll('.lb-actions .btn');
  btns.forEach(function (b) {
    b.classList.remove('btn-preferred');
    if (b.dataset.act === pref) b.classList.add('btn-preferred');
  });
}

// ---------- 视图切换 ----------

function initViewToggle() {
  var title = document.querySelector('.section-title');
  if (!title) return;

  var header = document.createElement('div');
  header.className = 'section-header';
  title.parentNode.insertBefore(header, title);
  header.appendChild(title);

  var toggle = document.createElement('div');
  toggle.className = 'view-toggle';

  var btnGrid = document.createElement('button');
  btnGrid.className = 'view-btn';
  btnGrid.dataset.view = 'grid';
  btnGrid.textContent = '⊞ GRID';

  var btnList = document.createElement('button');
  btnList.className = 'view-btn';
  btnList.dataset.view = 'list';
  btnList.textContent = '≡ LIST';

  toggle.appendChild(btnGrid);
  toggle.appendChild(btnList);
  header.appendChild(toggle);

  viewBtnGrid = btnGrid;
  viewBtnList = btnList;

  var saved = localStorage.getItem('neon_img_view') || 'grid';
  setView(saved);

  toggle.addEventListener('click', function (e) {
    var btn = e.target.closest('.view-btn');
    if (!btn) return;
    var view = btn.dataset.view;
    localStorage.setItem('neon_img_view', view);
    setView(view);
  });
}

function setView(view) {
  if (view === 'list') {
    gallery.classList.add('gallery-list');
    if (viewBtnGrid) viewBtnGrid.classList.remove('active');
    if (viewBtnList) viewBtnList.classList.add('active');
  } else {
    gallery.classList.remove('gallery-list');
    if (viewBtnGrid) viewBtnGrid.classList.add('active');
    if (viewBtnList) viewBtnList.classList.remove('active');
  }
}

function toggleView() {
  var current = localStorage.getItem('neon_img_view') || 'grid';
  var next = current === 'grid' ? 'list' : 'grid';
  localStorage.setItem('neon_img_view', next);
  setView(next);
}

// ---------- 快捷键帮助面板 ----------

function buildShortcutPanel() {
  var panel = document.createElement('div');
  panel.id = 'shortcutPanel';
  panel.className = 'sp-hidden';
  panel.innerHTML =
    '<div class="sp-backdrop"></div>' +
    '<div class="sp-box">' +
      '<div class="sp-header">' +
        '<span>// KEYBOARD \xB7 SHORTCUTS //</span>' +
        '<button class="sp-close">\xD7</button>' +
      '</div>' +
      '<div class="sp-table">' +
        '<div class="sp-row"><span class="sp-key">/</span><span class="sp-desc">聚焦搜索框</span></div>' +
        '<div class="sp-row"><span class="sp-key">?</span><span class="sp-desc">打开/关闭本面板</span></div>' +
        '<div class="sp-row"><span class="sp-key">G</span><span class="sp-desc">切换网格/列表视图</span></div>' +
        '<div class="sp-row"><span class="sp-key">←</span><span class="sp-desc">上一张图片</span></div>' +
        '<div class="sp-row"><span class="sp-key">→</span><span class="sp-desc">下一张图片</span></div>' +
        '<div class="sp-row"><span class="sp-key">Esc</span><span class="sp-desc">关闭面板 / 弹窗</span></div>' +
      '</div>' +
      '<div class="sp-footer">// PRESS ? TO TOGGLE //</div>' +
    '</div>';
  return panel;
}

function toggleShortcutPanel() {
  var panel = document.getElementById('shortcutPanel');
  if (!panel) {
    panel = buildShortcutPanel();
    document.body.appendChild(panel);
    panel.querySelector('.sp-backdrop').addEventListener('click', closeShortcutPanel);
    panel.querySelector('.sp-close').addEventListener('click', closeShortcutPanel);
  }
  if (panel.classList.contains('sp-hidden')) {
    panel.classList.remove('sp-hidden');
    requestAnimationFrame(function () {
      panel.classList.add('sp-open');
    });
  } else {
    closeShortcutPanel();
  }
}

function closeShortcutPanel() {
  var panel = document.getElementById('shortcutPanel');
  if (!panel) return;
  panel.classList.remove('sp-open');
  panel.addEventListener('transitionend', function () {
    if (!panel.classList.contains('sp-open')) {
      panel.classList.add('sp-hidden');
    }
  }, { once: true });
}

// ---------- HUD 按钮 ----------

function initHudButton() {
  var hudRight = document.querySelector('.hud-right');
  if (!hudRight) return;
  var btn = document.createElement('button');
  btn.id = 'shortcutBtn';
  btn.className = 'hud-btn';
  btn.title = '快捷键';
  btn.textContent = '⌨';
  btn.addEventListener('click', function () {
    toggleShortcutPanel();
  });
  hudRight.appendChild(btn);
}

// ---------- 鉴权模态框 ----------

function buildAuthModal() {
  var modal = document.createElement('div');
  modal.id = 'authModal';
  modal.className = 'auth-modal hidden';
  modal.innerHTML =
    '<div class="auth-backdrop"></div>' +
    '<div class="auth-box">' +
      '<div class="auth-logo">◤ NEON.IMG ◢</div>' +
      '<div class="auth-subtitle">// IDENTITY VERIFICATION REQUIRED //</div>' +
      '<div class="auth-tabs">' +
        '<button class="auth-tab active" data-tab="login">[ LOGIN ]</button>' +
        '<button class="auth-tab" data-tab="register">[ REGISTER ]</button>' +
      '</div>' +
      '<form id="authForm">' +
        '<input class="auth-input" name="username" placeholder="USERNAME" autocomplete="username" spellcheck="false" maxlength="20">' +
        '<input class="auth-input" type="password" name="password" placeholder="PASSWORD" autocomplete="current-password">' +
        '<input class="auth-input hidden" type="password" name="confirm" placeholder="CONFIRM PASSWORD" autocomplete="new-password">' +
        '<div class="auth-error hidden"></div>' +
        '<button type="submit" class="auth-submit">[ AUTHENTICATE ]</button>' +
      '</form>' +
    '</div>';
  return modal;
}

var _authTab = 'login';
var _authSubmitting = false;

function showAuthModal() {
  var modal = document.getElementById('authModal');
  if (!modal) {
    modal = buildAuthModal();
    document.body.appendChild(modal);
    bindAuthEvents(modal);
  }
  _authTab = 'login';
  _authSubmitting = false;
  var form = modal.querySelector('#authForm');
  form.reset();
  form.querySelector('.auth-error').classList.add('hidden');
  var tabs = modal.querySelectorAll('.auth-tab');
  tabs.forEach(function (t) { t.classList.remove('active'); });
  tabs[0].classList.add('active');
  form.querySelector('[name="confirm"]').classList.add('hidden');
  form.querySelector('.auth-submit').textContent = '[ AUTHENTICATE ]';
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function hideAuthModal() {
  var modal = document.getElementById('authModal');
  if (!modal) return;
  modal.classList.add('hidden');
  document.body.style.overflow = '';
}

function bindAuthEvents(modal) {
  modal.addEventListener('click', function (e) {
    if (e.target === modal) hideAuthModal();
  });

  var tabs = modal.querySelectorAll('.auth-tab');
  var form = modal.querySelector('#authForm');
  var confirmInput = form.querySelector('[name="confirm"]');
  var submitBtn = form.querySelector('.auth-submit');
  var errorEl = form.querySelector('.auth-error');

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      var target = tab.dataset.tab;
      if (target === _authTab) return;
      _authTab = target;
      tabs.forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      if (target === 'register') {
        confirmInput.classList.remove('hidden');
        submitBtn.textContent = '[ REGISTER ]';
      } else {
        confirmInput.classList.add('hidden');
        submitBtn.textContent = '[ AUTHENTICATE ]';
      }
      errorEl.classList.add('hidden');
    });
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (_authSubmitting) return;
    var username = form.username.value.trim();
    var password = form.password.value;

    if (!username) {
      showAuthErr('// USERNAME REQUIRED //');
      return;
    }

    if (_authTab === 'register') {
      if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
        showAuthErr('// USERNAME: 3-20 CHARS, A-Z 0-9 _ //');
        return;
      }
      if (!password || password.length < 6) {
        showAuthErr('// PASSWORD: MIN 6 CHARS //');
        return;
      }
      if (password !== form.confirm.value) {
        showAuthErr('// PASSWORD MISMATCH //');
        return;
      }
      _authSubmitting = true;
      errorEl.classList.add('hidden');
      fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username, password: password })
      })
        .then(function (res) { return res.json(); })
        .then(function (json) {
          if (json.code === 0) {
            return fetch('/api/auth/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ username: username, password: password })
            }).then(function (res) { return res.json(); });
          } else {
            throw new Error(json.msg);
          }
        })
        .then(function (loginJson) {
          if (loginJson.code === 0) {
            saveSession(loginJson.data);
            hideAuthModal();
            initHUD();
            loadList();
          } else {
            throw new Error(loginJson.msg);
          }
        })
        .catch(function (err) {
          showAuthErr(err.message || '// REGISTRATION FAILED //');
        })
        .then(function () {
          _authSubmitting = false;
        });
    } else {
      _authSubmitting = true;
      errorEl.classList.add('hidden');
      fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username, password: password })
      })
        .then(function (res) { return res.json(); })
        .then(function (json) {
          if (json.code === 0) {
            saveSession(json.data);
            hideAuthModal();
            initHUD();
            loadList();
          } else {
            showAuthErr(json.msg || '// AUTH FAILED //');
          }
        })
        .catch(function () {
          showAuthErr('// CONNECTION LOST // RETRY?');
        })
        .then(function () {
          _authSubmitting = false;
        });
    }
  });

  function showAuthErr(msg) {
    errorEl.textContent = msg;
    errorEl.classList.remove('hidden');
  }
}

// ---------- HUD 用户状态 ----------

function initHUD() {
  var hudRight = document.querySelector('.hud-right');
  if (!hudRight) return;

  var oldUser = document.getElementById('hudUser');
  if (oldUser) oldUser.remove();
  var oldLogout = document.getElementById('logoutBtn');
  if (oldLogout) oldLogout.remove();
  var oldAdmin = document.getElementById('adminBtn');
  if (oldAdmin) oldAdmin.remove();

  if (isLoggedIn()) {
    var userEl = document.createElement('span');
    userEl.id = 'hudUser';
    userEl.className = 'hud-user';
    userEl.title = '用户面板';
    userEl.innerHTML = '◈ <b>' + escapeHtml(getUsername()) + '</b>';
    userEl.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleUserPanel();
    });
    hudRight.appendChild(userEl);

    var logoutBtn = document.createElement('button');
    logoutBtn.id = 'logoutBtn';
    logoutBtn.className = 'hud-btn';
    logoutBtn.title = '登出';
    logoutBtn.textContent = '⏻';
    logoutBtn.addEventListener('click', function () {
      logout();
    });
    hudRight.appendChild(logoutBtn);

    if (isAdmin()) {
      var adminBtn = document.createElement('button');
      adminBtn.id = 'adminBtn';
      adminBtn.className = 'hud-btn admin-btn';
      adminBtn.title = '管理面板';
      adminBtn.textContent = '⊛';
      adminBtn.addEventListener('click', function () {
        toggleAdminPanel();
      });
      hudRight.appendChild(adminBtn);
    }
  } else {
    var loginPrompt = document.createElement('span');
    loginPrompt.id = 'hudUser';
    loginPrompt.className = 'hud-user';
    loginPrompt.style.cursor = 'pointer';
    loginPrompt.textContent = '// NOT AUTHENTICATED //';
    loginPrompt.addEventListener('click', function () {
      showAuthModal();
    });
    hudRight.appendChild(loginPrompt);
  }
}

function logout() {
  clearSession();
  location.reload();
}

// ---------- 用户面板 ----------

function buildUserPanel() {
  var panel = document.createElement('div');
  panel.id = 'userPanel';
  panel.className = 'user-panel hidden';
  panel.innerHTML =
    '<div class="up-section">' +
      '<div class="up-label">// USERNAME //</div>' +
      '<div class="up-value">' + escapeHtml(getUsername()) + '</div>' +
    '</div>' +
    '<div class="up-section">' +
      '<div class="up-label">// API TOKEN //</div>' +
      '<div class="up-row">' +
        '<code class="up-token" id="apiTokenDisplay"></code>' +
        '<button class="btn up-copy-btn" id="copyApiToken">[ COPY ]</button>' +
      '</div>' +
      '<div class="up-row">' +
        '<button class="btn btn-danger up-reset-btn" id="resetApiTokenBtn">[ RESET TOKEN ]</button>' +
      '</div>' +
    '</div>' +
    '<button class="up-close" id="upClose">// CLOSE PANEL //</button>';
  return panel;
}

function toggleUserPanel() {
  var panel = document.getElementById('userPanel');
  if (!panel) {
    panel = buildUserPanel();
    document.body.appendChild(panel);
    bindUserPanelEvents(panel);
  }
  if (panel.classList.contains('hidden')) {
    var hudUser = document.getElementById('hudUser');
    var rect = hudUser.getBoundingClientRect();
    panel.style.top = (rect.bottom + 8) + 'px';
    panel.style.right = (window.innerWidth - rect.right) + 'px';
    panel.classList.remove('hidden');
    var token = localStorage.getItem('neon_img_api_token') || '';
    var tokenDisplay = panel.querySelector('#apiTokenDisplay');
    if (tokenDisplay) tokenDisplay.textContent = token || '// NO TOKEN //';
  } else {
    panel.classList.add('hidden');
  }
}

function bindUserPanelEvents(panel) {
  panel.querySelector('#upClose').addEventListener('click', function () {
    panel.classList.add('hidden');
  });

  panel.querySelector('#copyApiToken').addEventListener('click', function () {
    var token = localStorage.getItem('neon_img_api_token') || '';
    if (token) {
      navigator.clipboard.writeText(token).then(function () {
        toast('API TOKEN COPIED', 'copied');
      }).catch(function () {
        toast('COPY FAILED', 'error');
      });
    }
  });

  panel.querySelector('#resetApiTokenBtn').addEventListener('click', function () {
    fetch('/api/auth/reset-token', {
      method: 'POST',
      headers: getAuthHeader()
    })
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (json.code === 0) {
          localStorage.setItem('neon_img_api_token', json.data.apiToken);
          var tokenDisplay = panel.querySelector('#apiTokenDisplay');
          if (tokenDisplay) tokenDisplay.textContent = json.data.apiToken;
          toast('// API TOKEN RESET //', 'success');
        } else if (json.code === 401) {
          handleUnauth();
        } else {
          toast(json.msg, 'error');
        }
      })
      .catch(function () {
        toast('// CONNECTION LOST //', 'error');
      });
  });

  document.addEventListener('click', function (e) {
    if (panel.classList.contains('hidden')) return;
    if (!panel.contains(e.target) && e.target !== document.getElementById('hudUser')) {
      panel.classList.add('hidden');
    }
  });
}

// ---------- 全局快捷键 ----------

document.addEventListener('keydown', function (e) {
  // Lightbox 打开时全权由 onLbKeydown 处理
  if (document.getElementById('lightbox')) return;

  var tag = document.activeElement && document.activeElement.tagName;
  var inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

  if (e.key === 'Escape') {
    if (batchMode) {
      exitBatchMode();
      return;
    }
    var am = document.getElementById('authModal');
    if (am && !am.classList.contains('hidden')) {
      hideAuthModal();
      return;
    }
    var up = document.getElementById('userPanel');
    if (up && !up.classList.contains('hidden')) {
      up.classList.add('hidden');
      return;
    }
    var ap = document.getElementById('adminPanel');
    if (ap && !ap.classList.contains('hidden')) {
      ap.classList.add('hidden');
      document.body.style.overflow = '';
      return;
    }
    if (modal && !modal.classList.contains('hidden')) {
      cancelDelete();
    }
    var sp = document.getElementById('shortcutPanel');
    if (sp && !sp.classList.contains('sp-hidden')) {
      closeShortcutPanel();
    }
    return;
  }

  if (inInput) return;

  if (e.ctrlKey && e.key === 'a' && batchMode) {
    e.preventDefault();
    var allIds = getFilteredList().map(function (x) { return x.id; });
    allIds.forEach(function (id) { selectedIds.add(id); });
    updateBatchUI();
    return;
  }

  if (e.key === '/') {
    e.preventDefault();
    var searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.focus();
    return;
  }

  if (e.key === '?') {
    e.preventDefault();
    toggleShortcutPanel();
    return;
  }

  if (e.key === 'g' || e.key === 'G') {
    toggleView();
    return;
  }
});

// ---------- 回收站 ----------

function buildTrashView() {
  var tv = document.createElement('div');
  tv.id = 'trashView';
  tv.className = 'trash-view hidden';
  tv.innerHTML =
    '<div class="trash-header">' +
      '<h3 class="section-title">◤ DATA GRAVEYARD ◢</h3>' +
      '<div class="trash-actions">' +
        '<button id="purgeAllBtn" class="btn btn-danger">[ PURGE ALL ]</button>' +
        '<a href="#" class="btn">[ ← BACK TO VAULT ]</a>' +
      '</div>' +
    '</div>' +
    '<div id="trashList" class="trash-list"></div>' +
    '<p id="trashEmpty" class="empty hidden">// RECYCLE BIN EMPTY // NO CORRUPTED PACKETS</p>';
  return tv;
}

function handleRoute() {
  if (location.hash === '#trash') {
    showTrashView();
  } else {
    showMainView();
  }
}

function showMainView() {
  if (batchMode) exitBatchMode();
  var sections = [
    document.getElementById('dropzone'),
    document.querySelector('.section-header'),
    document.querySelector('.gallery-controls'),
    document.getElementById('gallery'),
    document.getElementById('empty')
  ];
  sections.forEach(function (el) {
    if (el) el.style.display = '';
  });
  var tv = document.getElementById('trashView');
  if (tv) tv.classList.add('hidden');
  document.title = '◤ NEON.IMG ◢ // DATA VAULT';
}

function showTrashView() {
  if (batchMode) exitBatchMode();
  var sections = [
    document.getElementById('dropzone'),
    document.querySelector('.section-header'),
    document.querySelector('.gallery-controls'),
    document.getElementById('gallery'),
    document.getElementById('empty')
  ];
  sections.forEach(function (el) {
    if (el) el.style.display = 'none';
  });
  var tv = document.getElementById('trashView');
  if (!tv) {
    tv = buildTrashView();
    document.querySelector('main').appendChild(tv);
    tv.querySelector('#purgeAllBtn').addEventListener('click', askPurgeAll);
    tv.querySelector('#trashList').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (!btn) return;
      var id = btn.dataset.id;
      if (btn.dataset.act === 'restore') {
        restoreItem(id);
      } else if (btn.dataset.act === 'purge') {
        askPurge(id);
      }
    });
  }
  tv.classList.remove('hidden');
  document.title = '◤ DATA GRAVEYARD ◢ // NEON.IMG';
  loadTrash();
}

function loadTrash() {
  fetch('/api/trash', { headers: getAuthHeader() })
    .then(function (res) { return res.json(); })
    .then(function (json) {
      if (json.code === 401) { handleUnauth(); return; }
      var items = json.data || [];
      renderTrashList(items);
      updateTrashCount(items.length);
    })
    .catch(function () {
      toast('LOAD TRASH FAILED', 'error');
    });
}

function renderTrashList(items) {
  var list = document.getElementById('trashList');
  var emptyMsg = document.getElementById('trashEmpty');
  if (!list) return;
  list.innerHTML = '';
  if (items.length === 0) {
    emptyMsg.classList.remove('hidden');
    return;
  }
  emptyMsg.classList.add('hidden');
  items.forEach(function (item) {
    list.appendChild(renderTrashCard(item));
  });
}

function renderTrashCard(item) {
  var card = document.createElement('div');
  card.className = 'trash-card';
  card.innerHTML =
    '<img class="trash-thumb" src="' + escapeHtml(item.thumbUrl || item.url) + '" alt="' + escapeHtml(item.name) + '">' +
    '<div class="trash-info">' +
      '<div class="trash-name" title="' + escapeHtml(item.name) + '">' + escapeHtml(item.name) + '</div>' +
      '<div class="trash-meta">' + formatSize(item.size) + ' // DELETED: ' + formatDate(item.deletedAt) + '</div>' +
      '<div class="trash-expires' + (item.daysLeft <= 3 ? ' warning' : '') + '">EXPIRES IN ' + item.daysLeft + ' DAYS</div>' +
    '</div>' +
    '<div class="trash-btns">' +
      '<button class="btn" data-act="restore" data-id="' + item.id + '">[ RESTORE ]</button>' +
      '<button class="btn btn-danger" data-act="purge" data-id="' + item.id + '">[ PURGE ]</button>' +
    '</div>';
  return card;
}

function restoreItem(id) {
  fetch('/api/restore/' + id, {
    method: 'POST',
    headers: getAuthHeader()
  })
    .then(function (res) { return res.json(); })
    .then(function (json) {
      if (json.code === 0) {
        toast('DATA RESTORED TO VAULT');
        loadTrash();
        loadList();
      } else if (json.code === 401) {
        handleUnauth();
      } else {
        toast(json.msg, 'error');
      }
    })
    .catch(function () {
      toast('RESTORE FAILED', 'error');
    });
}

function doPurge(id) {
  fetch('/api/purge/' + id, {
    method: 'DELETE',
    headers: getAuthHeader()
  })
    .then(function (res) { return res.json(); })
    .then(function (json) {
      if (json.code === 0) {
        toast('[ DATA PURGED PERMANENTLY ]');
        loadTrash();
        updateTrashBadge();
      } else if (json.code === 401) {
        handleUnauth();
      } else {
        toast(json.msg, 'error');
      }
    })
    .catch(function () {
      toast('PURGE FAILED', 'error');
    });
}

function doPurgeAll() {
  fetch('/api/trash', { headers: getAuthHeader() })
    .then(function (res) { return res.json(); })
    .then(function (json) {
      if (json.code === 401) { handleUnauth(); return; }
      var items = json.data || [];
      var promises = items.map(function (item) {
        return fetch('/api/purge/' + item.id, {
          method: 'DELETE',
          headers: getAuthHeader()
        }).then(function (res) { return res.json(); });
      });
      return Promise.all(promises).then(function (results) {
        var has401 = results.some(function (r) { return r.code === 401; });
        if (has401) { handleUnauth(); return; }
      });
    })
    .then(function () {
      toast('[ ALL CORRUPTED PACKETS PURGED ]');
      pendingPurgeAll = false;
      _modalSubmitting = false;
      modal.classList.add('hidden');
      loadTrash();
      updateTrashBadge();
    })
    .catch(function () {
      toast('PURGE ALL FAILED', 'error');
      pendingPurgeAll = false;
      _modalSubmitting = false;
      modal.classList.add('hidden');
    });
}

function updateTrashBadge() {
  fetch('/api/trash', { headers: getAuthHeader() })
    .then(function (res) { return res.json(); })
    .then(function (json) {
      updateTrashCount((json.data || []).length);
    })
    .catch(function () {});
}

function updateTrashCount(n) {
  var el = document.getElementById('trashCount');
  if (el) {
    el.textContent = n;
    el.style.display = n > 0 ? '' : 'none';
  }
}

// ---------- 管理员面板 ----------

var _pendingAdminPurgeId = null;
var _pendingAdminPurgeName = null;

function buildAdminPanel() {
  var panel = document.createElement('div');
  panel.id = 'adminPanel';
  panel.className = 'admin-panel hidden';
  panel.innerHTML =
    '<div class="admin-backdrop"></div>' +
    '<div class="admin-box">' +
      '<div class="admin-header">' +
        '<span>◤ ADMIN TERMINAL ◢ // USER MANAGEMENT</span>' +
        '<button class="admin-close">[ × CLOSE ]</button>' +
      '</div>' +
      '<div class="admin-stats" id="adminStats">// LOADING...</div>' +
      '<div id="adminUserList" class="admin-user-list"></div>' +
      '<div class="admin-footer">// ADMIN: ' + escapeHtml(getUsername()) + ' //</div>' +
    '</div>';
  return panel;
}

function toggleAdminPanel() {
  var panel = document.getElementById('adminPanel');
  if (!panel) {
    panel = buildAdminPanel();
    document.body.appendChild(panel);
    bindAdminPanelEvents(panel);
  }
  if (panel.classList.contains('hidden')) {
    panel.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    loadAdminPanel();
  } else {
    panel.classList.add('hidden');
    document.body.style.overflow = '';
  }
}

function bindAdminPanelEvents(panel) {
  panel.querySelector('.admin-backdrop').addEventListener('click', function () {
    panel.classList.add('hidden');
    document.body.style.overflow = '';
  });
  panel.querySelector('.admin-close').addEventListener('click', function () {
    panel.classList.add('hidden');
    document.body.style.overflow = '';
  });
  panel.querySelector('#adminUserList').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-act="purge-user"]');
    if (!btn) return;
    var userId = btn.dataset.id;
    var username = btn.dataset.username;
    askPurgeUser(userId, username);
  });
}

function loadAdminPanel() {
  fetch('/api/admin/users', { headers: getAuthHeader() })
    .then(function (res) { return res.json(); })
    .then(function (json) {
      if (json.code === 401) { handleUnauth(); return; }
      if (json.code === 403) {
        toast('// ACCESS DENIED // ADMIN ONLY', 'error');
        var ap = document.getElementById('adminPanel');
        if (ap) { ap.classList.add('hidden'); }
        document.body.style.overflow = '';
        return;
      }
      var users = json.data || [];
      renderAdminUserList(users);
    })
    .catch(function () {
      toast('// LOAD USERS FAILED //', 'error');
    });
}

function renderAdminUserList(users) {
  var list = document.getElementById('adminUserList');
  var stats = document.getElementById('adminStats');
  if (!list || !stats) return;

  var totalImages = 0;
  users.forEach(function (u) { totalImages += u.imageCount; });

  stats.textContent = '// TOTAL USERS: ' + users.length + ' // TOTAL IMAGES: ' + totalImages + ' //';

  list.innerHTML = '';
  var currentUser = getUsername();
  users.forEach(function (u) {
    var row = document.createElement('div');
    row.className = 'admin-user-row';
    var tag = u.isAdmin ? ' <span class="admin-tag">[ADMIN]</span>' : '';
    var isSelf = u.username === currentUser;
    var showPurge = !u.isAdmin && !isSelf;
    var purgeBtn = showPurge
      ? '<button class="btn btn-danger admin-purge-btn" data-act="purge-user" data-id="' + u.id + '" data-username="' + escapeHtml(u.username) + '">[ PURGE USER ]</button>'
      : '';
    row.innerHTML =
      '<span class="admin-username">' + escapeHtml(u.username) + tag + '</span>' +
      '<span class="admin-meta">' +
        'CREATED: ' + formatDate(u.createdAt) +
        ' // IMGS: ' + u.imageCount +
        ' // TRASH: ' + u.trashCount +
      '</span>' +
      purgeBtn;
    list.appendChild(row);
  });
}

function askPurgeUser(userId, username) {
  _pendingAdminPurgeId = userId;
  _pendingAdminPurgeName = username;
  pendingDelete = null;
  pendingPurge = null;
  pendingPurgeAll = false;
  modal.querySelector('.modal-header').textContent = '! WARNING: PURGE USER';
  modal.querySelector('.modal-body').textContent = '将删除用户 [' + username + '] 及其全部数据包，此操作不可逆，确认继续？';
  modalOk.textContent = '[ PURGE USER ]';
  modalCancel.textContent = '[ CANCEL ]';
  modal.classList.remove('hidden');
}

// ---------- 启动 ----------

function init() {
  initViewToggle();
  initHudButton();
  initHUD();
  bindControlEvents();
  window.addEventListener('hashchange', handleRoute);
  handleRoute();

  if (isLoggedIn()) {
    loadList();
  } else {
    showAuthModal();
  }
}

init();
