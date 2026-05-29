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
let filterTag = '';
let selectedIds = new Set();
let batchMode = false;
let _pendingBatchDelete = false;
let guestMode = false;
let guestUploads = [];
let uploadQueue = [];
let activeUploads = 0;
const MAX_CONCURRENT = 3;

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
  toast('会话已过期，请重新登录', 'error');
}

// ---------- 工具 ----------

function toast(msg, type) {
  type = type || 'success';
  var prefixMap = { success: '[ 成功 ]', error: '[ 错误 ]', info: '[ 信息 ]', copied: '[ 已复制 ]' };
  var prefix = prefixMap[type] || '[ 信息 ]';
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
    toast('格式 \xB7 ' + (fmtMap[format] || format.toUpperCase()), 'copied');
  }).catch(function () {
    toast('复制失败', 'error');
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
  var shortName = item.name.length > 12
    ? item.name.substring(0, 12) + '…'
    : item.name;

  // 审核状态徽章
  var modBadge = '';
  var modHint = '';
  if (item.moderationStatus === 'PENDING') {
    modBadge = '<span class="badge-mod pending">审核中</span>';
    modHint = '<div class="mod-hint">// 审核中 // 链接可用</div>';
  } else if (item.moderationStatus === 'NEED_REVIEW') {
    modBadge = '<span class="badge-mod need-review">待复审</span>';
    modHint = '<div class="mod-hint">// 等待人工复审 //</div>';
  } else if (item.moderationStatus === 'REJECT') {
    modBadge = '<span class="badge-mod rejected">已拒绝</span>';
  }

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
    '<span class="badge-id">#' + String(index + 1).padStart(3, '0') +
    ' <span class="badge-filename">' + escapeHtml(shortName) + '</span></span>' +
    modBadge +
    '<span class="badge-ext">.' + escapeHtml(ext) + '</span>' +
    '<div class="info">' +
      '<div class="card-tags" id="cardTags-' + item.id + '"></div>' +
      '<div class="info-row">' +
        '<span class="meta">' + formatSize(item.size) + '</span>' +
        '<button class="btn btn-rename" data-act="rename" title="重命名">✎</button>' +
        '<button class="btn btn-danger" data-act="del">删除</button>' +
      '</div>' +
      modHint +
    '</div>';

  return card;
}

function rerender(list) {
  gallery.innerHTML = '';
  list.forEach(function (item, i) {
    var card = renderCard(item, i);
    gallery.appendChild(card);
    var tagsEl = card.querySelector('.card-tags');
    if (tagsEl) renderCardTags(item, tagsEl);
  });
  updateCount(list.length);
  if (batchMode) updateBatchUI();
}

// ---------- 重命名 ----------

function renameImage(item, card) {
  var infoRow = card.querySelector('.info-row');
  var originalHTML = infoRow.innerHTML;

  infoRow.innerHTML =
    '<input class="rename-input" type="text" maxlength="100" value="">' +
    '<button class="btn rename-ok" title="确认">✓</button>' +
    '<button class="btn rename-cancel" title="取消">✕</button>';

  var input = infoRow.querySelector('.rename-input');
  input.value = item.name;
  input.focus();
  input.select();

  function restore() {
    infoRow.innerHTML = originalHTML;
  }

  function submit() {
    var newName = input.value.trim();
    if (!newName) {
      toast('// 文件名不能为空', 'error');
      return;
    }
    var reg = /^[一-龥a-zA-Z0-9 _\-\.]{1,100}$/;
    if (!reg.test(newName)) {
      toast('// 文件名含非法字符', 'error');
      return;
    }

    fetch('/api/image/' + encodeURIComponent(item.id) + '/rename', {
      method: 'PATCH',
      headers: Object.assign({ 'Content-Type': 'application/json' }, getAuthHeader()),
      body: JSON.stringify({ name: newName })
    })
      .then(function (r) { return r.json(); })
      .then(function (json) {
        if (json.code === 0) {
          item.name = json.data.name;
          var idx = imageList.findIndex(function (x) { return x.id === item.id; });
          if (idx >= 0) imageList[idx].name = json.data.name;
          var ext = json.data.name.split('.').pop().toUpperCase();
          var badgeExt = card.querySelector('.badge-ext');
          if (badgeExt) badgeExt.textContent = '.' + ext;
          var overlayName = card.querySelector('.card-overlay-name');
          if (overlayName) {
            overlayName.textContent = json.data.name;
            overlayName.title = json.data.name;
          }
          var img = card.querySelector('img');
          if (img) img.alt = json.data.name;
          var badgeFilename = card.querySelector('.badge-filename');
          if (badgeFilename) {
            var newShort = json.data.name.length > 12
              ? json.data.name.substring(0, 12) + '…'
              : json.data.name;
            badgeFilename.textContent = newShort;
          }
          restore();
          toast('// 重命名成功');
        } else if (json.code === 401) {
          handleUnauth();
        } else {
          toast(json.msg || '// 重命名失败', 'error');
          restore();
        }
      })
      .catch(function () {
        toast('// 网络错误', 'error');
        restore();
      });
  }

  infoRow.querySelector('.rename-ok').addEventListener('click', submit);
  infoRow.querySelector('.rename-cancel').addEventListener('click', restore);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
    if (e.key === 'Escape') { restore(); }
  });
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
      updateModBadge();
      loadTagFilter();
    })
    .catch(function () {
      toast('加载列表失败', 'error');
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

  // 3. 标签筛选
  if (filterTag !== '') {
    list = list.filter(function (item) {
      return (item.tags || []).indexOf(filterTag) !== -1;
    });
  }

  // 4. 排序
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
    var msg = '未找到匹配文件';
    if (searchKeyword.trim() !== '') {
      msg += ' // 搜索: "' + searchKeyword.trim() + '"';
    }
    if (filterExt !== 'all') {
      msg += ' // 格式: ' + filterExt.toUpperCase();
    }
    if (filterTag !== '') {
      msg += ' // TAG: ' + filterTag;
    }
    if (searchKeyword.trim() === '' && filterExt === 'all' && filterTag === '') {
      msg = '// 暂无数据';
    }
    empty.textContent = msg;
  }
}

// ---------- 标签 ----------

function renderCardTags(item, container) {
  container.innerHTML = '';
  if (item.tags && item.tags.length > 0) {
    item.tags.forEach(function (tag) {
      var tagEl = document.createElement('span');
      tagEl.className = 'card-tag';
      tagEl.innerHTML = escapeHtml(tag) +
        '<button class="tag-del-btn" data-tag="' + escapeHtml(tag) + '" data-id="' + item.id + '">×</button>';
      container.appendChild(tagEl);
    });
  }
  var addBtn = document.createElement('button');
  addBtn.className = 'tag-add-btn';
  addBtn.dataset.id = item.id;
  addBtn.textContent = '+ 标签';
  container.appendChild(addBtn);
}

function showTagInput(item, card) {
  var tagsEl = card.querySelector('.card-tags');
  var addBtn = tagsEl.querySelector('.tag-add-btn');
  if (addBtn) addBtn.remove();

  var input = document.createElement('input');
  input.className = 'tag-input';
  input.placeholder = '输入标签';
  input.maxLength = 20;
  tagsEl.appendChild(input);

  var confirmBtn = document.createElement('button');
  confirmBtn.className = 'tag-confirm-btn';
  confirmBtn.textContent = '✓';
  tagsEl.appendChild(confirmBtn);

  var cancelBtn = document.createElement('button');
  cancelBtn.className = 'tag-cancel-btn';
  cancelBtn.textContent = '✕';
  tagsEl.appendChild(cancelBtn);

  input.focus();

  function cancel() {
    renderCardTags(item, tagsEl);
  }

  function submit() {
    var newTag = input.value.trim();
    if (!newTag) { cancel(); return; }
    if (item.tags && item.tags.indexOf(newTag) !== -1) {
      toast('// 标签已存在', 'error');
      cancel();
      return;
    }
    if (!/^[一-龥a-zA-Z0-9_\-]{1,20}$/.test(newTag)) {
      toast('// 标签格式不合法', 'error');
      cancel();
      return;
    }

    var newTags = (item.tags || []).concat([newTag]);
    fetch('/api/image/' + encodeURIComponent(item.id) + '/tags', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, getAuthHeader()),
      body: JSON.stringify({ tags: newTags })
    })
      .then(function (r) { return r.json(); })
      .then(function (json) {
        if (json.code === 0) {
          item.tags = json.data.tags;
          renderCardTags(item, tagsEl);
          loadTagFilter();
        } else if (json.code === 401) {
          handleUnauth();
        } else {
          toast(json.msg || '// 标签设置失败', 'error');
          cancel();
        }
      })
      .catch(function () {
        toast('// 网络错误', 'error');
        cancel();
      });
  }

  confirmBtn.addEventListener('click', submit);
  cancelBtn.addEventListener('click', cancel);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
    if (e.key === 'Escape') { cancel(); }
  });
}

function loadTagFilter() {
  fetch('/api/tags', { headers: getAuthHeader() })
    .then(function (res) { return res.json(); })
    .then(function (json) {
      if (json.code === 401) { handleUnauth(); return; }
      renderTagFilter(json.data || []);
    })
    .catch(function () {});
}

function renderTagFilter(tags) {
  var wrap = document.getElementById('tagFilterWrap');
  if (!wrap) return;
  if (tags.length === 0) { wrap.classList.add('hidden'); return; }
  wrap.classList.remove('hidden');

  var list = document.getElementById('tagFilterList');
  list.innerHTML = '';

  var allBtn = document.createElement('button');
  allBtn.className = 'tag-filter-btn' + (filterTag === '' ? ' active' : '');
  allBtn.dataset.tag = '';
  allBtn.textContent = '全部';
  list.appendChild(allBtn);

  tags.forEach(function (tag) {
    var btn = document.createElement('button');
    btn.className = 'tag-filter-btn' + (filterTag === tag ? ' active' : '');
    btn.dataset.tag = tag;
    btn.textContent = tag;
    list.appendChild(btn);
  });

  list.addEventListener('click', function (e) {
    var btn = e.target.closest('.tag-filter-btn');
    if (!btn) return;
    var btns = list.querySelectorAll('.tag-filter-btn');
    btns.forEach(function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
    filterTag = btn.dataset.tag;
    applyFilters();
  });
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

  // 批量选择按钮
  var batchToggleBtn = document.getElementById('batchToggleBtn');
  if (batchToggleBtn) {
    batchToggleBtn.addEventListener('click', function () {
      if (batchMode) {
        exitBatchMode();
      } else {
        enterBatchMode();
      }
    });
  }
}

function uploadFiles(files) {
  if (!files || files.length === 0) return;

  if (guestMode) {
    guestUploadFiles(files);
    return;
  }

  var ALLOWED = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
  var MAX_SIZE = 20 * 1024 * 1024;
  var added = 0;

  for (var i = 0; i < files.length; i++) {
    var ext = '.' + files[i].name.split('.').pop().toLowerCase();
    if (files[i].size > MAX_SIZE) {
      toast('错误: ' + files[i].name + ' 文件过大 // 单文件最大 20MB', 'error');
      continue;
    }
    if (ALLOWED.indexOf(ext) === -1) {
      toast('错误: ' + files[i].name + ' 格式不支持', 'error');
      continue;
    }

    var qItem = {
      file: files[i],
      id: Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6),
      status: 'queued',
      progress: 0,
      el: null
    };
    uploadQueue.push(qItem);
    createQueueItem(qItem);
    added++;
  }

  if (added > 0) {
    showQueuePanel();
    processQueue();
  }
}

function progressText(pct) {
  var filled = Math.round(pct / 10);
  var bar = '';
  for (var i = 0; i < 10; i++) {
    bar += i < filled ? '█' : '░';
  }
  return '[' + bar + '] ' + pct + '%';
}

// ---------- 上传队列面板 ----------

function buildQueuePanel() {
  var panel = document.createElement('div');
  panel.id = 'uploadQueue';
  panel.className = 'upload-queue hidden';
  panel.innerHTML =
    '<div class="uq-header">' +
      '<span class="uq-title">// 上传队列 //</span>' +
      '<button class="uq-close">×</button>' +
    '</div>' +
    '<div class="uq-list" id="uqList"></div>';

  panel.querySelector('.uq-close').addEventListener('click', function () {
    hideQueuePanel();
  });

  dropzone.parentNode.insertBefore(panel, dropzone.nextSibling);
}

function showQueuePanel() {
  var panel = document.getElementById('uploadQueue');
  if (!panel) { buildQueuePanel(); panel = document.getElementById('uploadQueue'); }
  panel.classList.remove('hidden');
}

function hideQueuePanel() {
  var panel = document.getElementById('uploadQueue');
  if (panel) panel.classList.add('hidden');
}

function createQueueItem(qItem) {
  var row = document.createElement('div');
  row.className = 'uq-item';
  row.id = 'uq-' + qItem.id;

  var shortName = qItem.file.name;
  if (shortName.length > 16) shortName = shortName.substring(0, 16) + '…';

  row.innerHTML =
    '<div class="uq-info">' +
      '<span class="uq-name" title="' + escapeHtml(qItem.file.name) + '">' + escapeHtml(shortName) + '</span>' +
      '<span class="uq-size">' + formatSize(qItem.file.size) + '</span>' +
    '</div>' +
    '<div class="uq-bar-wrap">' +
      '<div class="uq-bar-fill" style="width:0%"></div>' +
    '</div>' +
    '<span class="uq-status">等待中</span>';

  qItem.el = row;
  var list = document.getElementById('uqList');
  if (list) list.appendChild(row);
}

function updateQueueItem(qItem) {
  if (!qItem.el) return;
  var barFill = qItem.el.querySelector('.uq-bar-fill');
  var statusEl = qItem.el.querySelector('.uq-status');

  if (qItem.status === 'queued') {
    if (barFill) barFill.style.width = '0%';
    if (statusEl) statusEl.textContent = '等待中';
  } else if (qItem.status === 'uploading') {
    if (barFill) barFill.style.width = qItem.progress + '%';
    if (statusEl) statusEl.textContent = qItem.progress + '%';
  } else if (qItem.status === 'done') {
    if (barFill) { barFill.style.width = '100%'; barFill.style.background = 'var(--neon-cyan)'; }
    if (statusEl) statusEl.textContent = '✓ 完成';
  } else if (qItem.status === 'failed') {
    if (barFill) barFill.style.background = 'var(--neon-red)';
    statusEl.innerHTML = '<span class="uq-failed">✗ 失败</span>' +
      '<button class="uq-retry btn">重试</button>';
    var retryBtn = qItem.el.querySelector('.uq-retry');
    if (retryBtn) {
      retryBtn.addEventListener('click', function () { retryQueueItem(qItem); });
    }
  }
}

// ---------- 队列调度 ----------

function processQueue() {
  while (activeUploads < MAX_CONCURRENT) {
    var qItem = null;
    for (var i = 0; i < uploadQueue.length; i++) {
      if (uploadQueue[i].status === 'queued') { qItem = uploadQueue[i]; break; }
    }
    if (!qItem) break;
    startUpload(qItem);
  }
}

function startUpload(qItem) {
  qItem.status = 'uploading';
  activeUploads++;
  updateQueueItem(qItem);

  var fd = new FormData();
  fd.append('files', qItem.file);

  var xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/upload');
  xhr.setRequestHeader('Authorization', 'Bearer ' + getJwt());

  xhr.upload.onprogress = function (e) {
    if (e.lengthComputable) {
      qItem.progress = Math.round(e.loaded / e.total * 100);
      updateQueueItem(qItem);
    }
  };

  xhr.onload = function () {
    try {
      var json = JSON.parse(xhr.responseText);
      if (json.code === 0) {
        qItem.status = 'done';
      } else if (json.code === 401) {
        handleUnauth();
        qItem.status = 'failed';
      } else {
        qItem.status = 'failed';
        toast((json.msg || '上传失败') + ' // ' + qItem.file.name, 'error');
      }
    } catch (e) {
      qItem.status = 'failed';
      toast('响应解析错误 // ' + qItem.file.name, 'error');
    }
    if (activeUploads > 0) activeUploads--;
    updateQueueItem(qItem);
    processQueue();
    checkAllDone();
  };

  xhr.onerror = function () {
    qItem.status = 'failed';
    if (activeUploads > 0) activeUploads--;
    updateQueueItem(qItem);
    processQueue();
    checkAllDone();
  };

  xhr.send(fd);
}

function retryQueueItem(qItem) {
  qItem.status = 'queued';
  qItem.progress = 0;
  updateQueueItem(qItem);
  processQueue();
}

function checkAllDone() {
  if (uploadQueue.length === 0) return;

  var stillRunning = uploadQueue.some(function (q) {
    return q.status === 'uploading' || q.status === 'queued';
  });
  if (stillRunning) return;

  var hasSuccess = uploadQueue.some(function (q) {
    return q.status === 'done';
  });

  if (hasSuccess) {
    loadList();
  }

  setTimeout(function () {
    hideQueuePanel();
    uploadQueue = [];
    activeUploads = 0;
  }, 3000);
}

// ---------- 删除模态框 ----------

function askDelete(id, card) {
  pendingDelete = { id: id, card: card };
  pendingPurge = null;
  pendingPurgeAll = false;
  modal.querySelector('.modal-header').textContent = '! 确认删除';
  modal.querySelector('.modal-body').textContent = '即将将该数据包移入回收站，确认继续？';
  modalOk.textContent = '[ 确认 ]';
  modal.classList.remove('hidden');
}

function askPurge(id) {
  pendingPurge = { id: id };
  pendingDelete = null;
  pendingPurgeAll = false;
  modal.querySelector('.modal-header').textContent = '! 确认永久删除';
  modal.querySelector('.modal-body').textContent = '即将永久销毁该数据包，不可恢复，确认继续？';
  modalOk.textContent = '[ 永久删除 ]';
  modal.classList.remove('hidden');
}

function askPurgeAll() {
  pendingPurgeAll = true;
  pendingDelete = null;
  pendingPurge = null;
  modal.querySelector('.modal-header').textContent = '! 确认永久删除 ALL';
  modal.querySelector('.modal-body').textContent = '将永久销毁回收站中的全部数据包，不可恢复，确认继续？';
  modalOk.textContent = '[ 清空 ]';
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
          loadList();
          updateTrashBadge();
          showUndoBar([id], '1 个数据包已移入回收站');
        } else if (json.code === 401) {
          handleUnauth();
        } else {
          toast(json.msg, 'error');
        }
      })
      .catch(function () {
        toast('删除失败', 'error');
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
          toast('[ 已永久删除 ]');
          loadTrash();
        } else if (json.code === 401) {
          handleUnauth();
        } else {
          toast(json.msg, 'error');
        }
      })
      .catch(function () {
        toast('永久删除失败', 'error');
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
          toast('用户已删除');
          loadAdminPanel();
        } else if (json.code === 401) {
          handleUnauth();
        } else {
          toast(json.msg, 'error');
        }
      })
      .catch(function () {
        toast('删除用户失败', 'error');
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
    } else if (act === 'rename') {
      renameImage(card._item, card);
      return;
    }
    return;
  }

  // 标签添加按钮
  var tagAddBtn = e.target.closest('.tag-add-btn');
  if (tagAddBtn) {
    showTagInput(card._item, card);
    return;
  }

  // 标签删除按钮
  var tagDelBtn = e.target.closest('.tag-del-btn');
  if (tagDelBtn) {
    var delTag = tagDelBtn.dataset.tag;
    var delId = tagDelBtn.dataset.id;
    var delItem = card._item;
    fetch('/api/image/' + encodeURIComponent(delId) + '/tags/' + encodeURIComponent(delTag), {
      method: 'DELETE',
      headers: getAuthHeader()
    })
      .then(function (r) { return r.json(); })
      .then(function (json) {
        if (json.code === 0) {
          delItem.tags = (delItem.tags || []).filter(function (t) { return t !== delTag; });
          renderCardTags(delItem, card.querySelector('.card-tags'));
          loadTagFilter();
        } else if (json.code === 401) {
          handleUnauth();
        } else {
          toast(json.msg || '// 标签删除失败', 'error');
        }
      })
      .catch(function () {
        toast('// 网络错误', 'error');
      });
    return;
  }

  // card-check 点击（仅批量模式下有效）
  if (e.target.closest('.card-check')) {
    if (batchMode) toggleSelect(card.dataset.id, card);
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

// ---------- 游客画廊交互 ----------

document.addEventListener('click', function (e) {
  var card = e.target.closest('#guestGallery .card');
  if (!card) return;
  var btn = e.target.closest('[data-act]');
  if (!btn) return;
  var act = btn.dataset.act;
  var item = card._item;
  if (!item) return;

  if (act === 'url') {
    copyText(item.url, 'URL');
  } else if (act === 'md') {
    copyText('![' + item.name + '](' + item.url + ')', 'MD');
  } else if (act === 'html') {
    copyText('<img src="' + item.url + '" alt="' + item.name + '" />', 'HTML');
  } else if (act === 'guestDel') {
    guestDeleteImage(item.id, item.guestToken, card);
  }
});

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
  var btn = document.getElementById('batchToggleBtn');
  if (btn) {
    btn.textContent = '✕ 退出批量';
    btn.classList.add('active');
  }
}

function exitBatchMode() {
  batchMode = false;
  selectedIds.clear();
  gallery.classList.remove('batch-mode');
  var cards = gallery.querySelectorAll('.card');
  cards.forEach(function (c) { c.classList.remove('card-selected'); });
  var bar = document.getElementById('batchBar');
  if (bar) bar.classList.add('hidden');
  var btn = document.getElementById('batchToggleBtn');
  if (btn) {
    btn.textContent = '☑ 批量选择';
    btn.classList.remove('active');
  }
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
    '<div class="bb-info">// 已选中: <b id="bbCount">0</b> 个文件</div>' +
    '<div class="bb-actions">' +
      '<button id="batchSelectAll" class="btn">[ 全选 ]</button>' +
      '<button id="batchCopyBtn" class="btn">[ 复制链接 ]</button>' +
      '<button id="batchDeleteBtn" class="btn btn-danger">[ 批量删除 ]</button>' +
      '<button id="batchCancelBtn" class="btn">[ 取消 ]</button>' +
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
        toast('已复制 ' + urls.length + ' 条链接到剪贴板', 'copied');
      }).catch(function () {
        toast('复制失败', 'error');
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
    modal.querySelector('.modal-header').textContent = '! 警告: 批量删除';
    modal.querySelector('.modal-body').textContent = '即将移入回收站 ' + n + ' 个数据包，确认继续？';
    modalOk.textContent = '[ 确认删除 ]';
    modalCancel.textContent = '[ 取消 ]';
    modal.classList.remove('hidden');
  });

  bar.querySelector('#batchCancelBtn').addEventListener('click', exitBatchMode);
}

async function doBatchDelete() {
  var ids = Array.from(selectedIds);
  var total = ids.length;
  var failed = 0;
  var successIds = [];

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
      if (json.code === 0) {
        successIds.push(ids[i]);
      } else {
        failed++;
      }
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
    toast('// 警告 // ' + failed + '/' + total + ' 删除失败', 'error');
  }
  if (successIds.length > 0) {
    showUndoBar(successIds, successIds.length + ' 个数据包已移入回收站');
  }
}

// ---------- Undo 撤销机制 ----------

var _undoTimer = null;

function showUndoBar(ids, label) {
  if (_undoTimer) { clearInterval(_undoTimer); _undoTimer = null; }
  var old = document.getElementById('undoBar');
  if (old) old.remove();

  var bar = document.createElement('div');
  bar.id = 'undoBar';
  bar.className = 'undo-bar';
  bar.innerHTML =
    '<span class="undo-msg">// ' + label + ' // <span id="undoCountdown">30</span>s</span>' +
    '<div class="undo-actions">' +
      '<button id="undoBtn" class="btn undo-btn">撤销</button>' +
      '<button id="undoDismiss" class="btn">×</button>' +
    '</div>';

  document.body.appendChild(bar);

  var countdown = 30;
  _undoTimer = setInterval(function () {
    countdown--;
    var el = document.getElementById('undoCountdown');
    if (el) el.textContent = countdown;
    if (countdown <= 0) {
      clearInterval(_undoTimer);
      _undoTimer = null;
      hideUndoBar();
    }
  }, 1000);

  document.getElementById('undoBtn').addEventListener('click', function () {
    clearInterval(_undoTimer);
    _undoTimer = null;
    hideUndoBar();
    undoDelete(ids);
  });

  document.getElementById('undoDismiss').addEventListener('click', function () {
    clearInterval(_undoTimer);
    _undoTimer = null;
    hideUndoBar();
  });
}

function hideUndoBar() {
  if (_undoTimer) { clearInterval(_undoTimer); _undoTimer = null; }
  var bar = document.getElementById('undoBar');
  if (bar) bar.remove();
}

async function undoDelete(ids) {
  var successCount = 0;
  for (var i = 0; i < ids.length; i++) {
    try {
      var res = await fetch('/api/restore/' + ids[i], {
        method: 'POST',
        headers: getAuthHeader()
      });
      var json = await res.json();
      if (json.code === 0) successCount++;
      else if (json.code === 401) { handleUnauth(); return; }
    } catch (e) {}
  }
  if (successCount > 0) {
    toast('// 已撤销 // ' + successCount + ' 个数据包已恢复');
    loadList();
    updateTrashBadge();
  } else {
    toast('// 撤销失败', 'error');
  }
}

function markCopied(btn) {
  var orig = btn.textContent;
  btn.textContent = '✓ 已复制';
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
    if (main) main.innerHTML = '> 检测到文件 // 释放以上传<span class="caret">_</span>';
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
    if (main) main.innerHTML = '> 拖拽文件到此处<span class="caret">_</span>';
  }
});

dropzone.addEventListener('drop', function (e) {
  e.preventDefault();
  dragCounter = 0;
  dropzone.classList.remove('hover');
  var icon = dropzone.querySelector('.uplink-icon');
  var main = dropzone.querySelector('.uplink-main');
  if (icon) icon.textContent = '▼';
  if (main) main.innerHTML = '> 拖拽文件到此处<span class="caret">_</span>';
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

  // 审核状态提示
  var modStatusHtml = '';
  if (item.moderationStatus === 'PENDING') {
    modStatusHtml = '<span class="lb-mod-status">// 状态: 审核中</span>';
  } else if (item.moderationStatus === 'NEED_REVIEW') {
    modStatusHtml = '<span class="lb-mod-status">// 状态: 等待人工复审</span>';
  }

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
          '<span class="lb-meta">' + formatSize(item.size) + ' \xB7 ' + formatDate(item.uploadedAt) + ' ' + modStatusHtml + '</span>' +
          '<button class="btn btn-danger lb-close">× 关闭窗口</button>' +
        '</div>' +
      '</div>' +
      '<div class="lb-stage">' +
        '<button class="lb-nav lb-prev">‹ 上一张</button>' +
        '<img class="lb-img" src="' + escapeHtml(item.url) + '" alt="' + escapeHtml(item.name) + '">' +
        '<button class="lb-nav lb-next">下一张 ›</button>' +
      '</div>' +
      '<div class="lb-footer">' +
        '<span class="lb-index">// 第 ' + String(idx + 1).padStart(3, '0') + ' / 共 ' + String(total).padStart(3, '0') + ' //</span>' +
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
  lb.querySelector('.lb-meta').innerHTML = formatSize(item.size) + ' \xB7 ' + formatDate(item.uploadedAt) +
    (item.moderationStatus === 'PENDING' ? ' <span class="lb-mod-status">// 状态: 审核中</span>' : '') +
    (item.moderationStatus === 'NEED_REVIEW' ? ' <span class="lb-mod-status">// 状态: 等待人工复审</span>' : '');
  lb.querySelector('.lb-index').textContent = '// 第 ' + String(lbCurrentIndex + 1).padStart(3, '0') + ' / 共 ' + String(imageList.length).padStart(3, '0') + ' //';

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
  btnGrid.textContent = '⊞ 网格';

  var btnList = document.createElement('button');
  btnList.className = 'view-btn';
  btnList.dataset.view = 'list';
  btnList.textContent = '≡ 列表';

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
      '<div class="sp-footer">// 按 ? 切换面板 //</div>' +
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
      '<div class="auth-subtitle">// 需要身份验证 //</div>' +
      '<div class="auth-tabs">' +
        '<button class="auth-tab active" data-tab="login">[ 登录 ]</button>' +
        '<button class="auth-tab" data-tab="register">[ 注册 ]</button>' +
      '</div>' +
      '<form id="authForm">' +
        '<input class="auth-input" name="username" placeholder="用户名" autocomplete="username" spellcheck="false" maxlength="20">' +
        '<input class="auth-input" type="password" name="password" placeholder="密码" autocomplete="current-password">' +
        '<input class="auth-input hidden" type="password" name="confirm" placeholder="确认密码" autocomplete="new-password">' +
        '<div class="auth-error hidden"></div>' +
        '<button type="submit" class="auth-submit">[ 验证 ]</button>' +
      '</form>' +
      '<div class="auth-guest-divider">// 或 //</div>' +
      '<button id="guestModeBtn" class="auth-guest-btn">&gt;&gt; 游客模式 [ 无需账号 ]</button>' +
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
  form.querySelector('.auth-submit').textContent = '[ 验证 ]';
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
        submitBtn.textContent = '[ 注册 ]';
      } else {
        confirmInput.classList.add('hidden');
        submitBtn.textContent = '[ 验证 ]';
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
      showAuthErr('// 请输入用户名 //');
      return;
    }

    if (_authTab === 'register') {
      if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
        showAuthErr('// 用户名: 3-20个字符, 字母数字下划线 //');
        return;
      }
      if (!password || password.length < 6) {
        showAuthErr('// 密码: 最少6个字符 //');
        return;
      }
      if (password !== form.confirm.value) {
        showAuthErr('// 两次密码不一致 //');
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
          showAuthErr(err.message || '// 注册失败 //');
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
            showAuthErr(json.msg || '// 验证失败 //');
          }
        })
        .catch(function () {
          showAuthErr('// 连接断开 // 重试?');
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

  var guestBtn = modal.querySelector('#guestModeBtn');
  if (guestBtn) {
    guestBtn.addEventListener('click', function () {
      hideAuthModal();
      enterGuestMode();
    });
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
  var oldModBadge = document.getElementById('modBadge');
  if (oldModBadge) oldModBadge.remove();

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
    loginPrompt.textContent = '// 未登录 //';
    loginPrompt.addEventListener('click', function () {
      showAuthModal();
    });
    hudRight.appendChild(loginPrompt);
  }
}

function logout() {
  clearSession();
  sessionStorage.removeItem('neon_img_guest_uploads');
  location.reload();
}

// ---------- 游客模式 ----------

function enterGuestMode() {
  guestMode = true;

  // 恢复之前的游客上传记录
  try {
    var saved = sessionStorage.getItem('neon_img_guest_uploads');
    guestUploads = saved ? JSON.parse(saved) : [];
  } catch (e) {
    guestUploads = [];
  }

  // 显示主界面
  showMainView();
  document.getElementById('dropzone').style.display = '';

  // HUD 游客标识
  var hudRight = document.querySelector('.hud-right');
  if (hudRight) {
    var oldBadge = document.getElementById('guestBadge');
    if (oldBadge) oldBadge.remove();
    var badge = document.createElement('span');
    badge.id = 'guestBadge';
    badge.className = 'hud-guest';
    badge.innerHTML = '// 游客模式 // <button id="exitGuestBtn">[ 退出 ]</button>';
    hudRight.appendChild(badge);
    document.getElementById('exitGuestBtn').addEventListener('click', function () {
      exitGuestMode();
    });
  }

  // 游客提示横幅
  var banner = document.createElement('div');
  banner.id = 'guestBanner';
  banner.textContent = '// 游客模式 // 30天保留 // 单文件最大10MB // 单次最多3张';
  var main = document.querySelector('main');
  var uplink = document.getElementById('dropzone');
  if (main && uplink) {
    main.insertBefore(banner, uplink);
  }

  // 恢复游客画廊
  var guestGallery = document.getElementById('guestGallery');
  if (!guestGallery) {
    guestGallery = document.createElement('div');
    guestGallery.id = 'guestGallery';
    var gallerySection = document.querySelector('.gallery');
    if (gallerySection && gallerySection.parentNode) {
      gallerySection.parentNode.insertBefore(guestGallery, gallerySection.nextSibling);
    }
  }
  renderGuestGallery();

  // 隐藏登录用户的图库
  gallery.style.display = 'none';
  var sectionHeader = document.querySelector('.section-header');
  if (sectionHeader) sectionHeader.style.display = 'none';
  var galleryControls = document.querySelector('.gallery-controls');
  if (galleryControls) galleryControls.style.display = 'none';
  var trashBtn = document.getElementById('trashBtn');
  if (trashBtn) trashBtn.style.display = 'none';

  toast('已进入游客模式 // 30天保留 // 匿名上传', 'info');
}

function exitGuestMode() {
  guestMode = false;
  guestUploads = [];
  sessionStorage.removeItem('neon_img_guest_uploads');

  var badge = document.getElementById('guestBadge');
  if (badge) badge.remove();
  var banner = document.getElementById('guestBanner');
  if (banner) banner.remove();
  var guestGallery = document.getElementById('guestGallery');
  if (guestGallery) guestGallery.remove();

  gallery.style.display = '';
  var sectionHeader = document.querySelector('.section-header');
  if (sectionHeader) sectionHeader.style.display = '';
  var galleryControls = document.querySelector('.gallery-controls');
  if (galleryControls) galleryControls.style.display = '';
  var trashBtn = document.getElementById('trashBtn');
  if (trashBtn) trashBtn.style.display = '';

  showAuthModal();
}

function guestUploadFiles(files) {
  if (!files || files.length === 0) return;

  var GUEST_FORMATS = ['.jpg', '.jpeg', '.png', '.webp'];
  var MAX_SIZE = 10 * 1024 * 1024;
  var MAX_BATCH = 3;

  for (var i = 0; i < files.length; i++) {
    if (files[i].size > MAX_SIZE) {
      toast('错误: 文件过大 // 游客限制 10MB', 'error');
      return;
    }
    var ext = '.' + files[i].name.split('.').pop().toLowerCase();
    if (GUEST_FORMATS.indexOf(ext) === -1) {
      toast('错误: 格式不支持 // 游客仅支持 PNG JPG WEBP', 'error');
      return;
    }
  }

  if (files.length > MAX_BATCH) {
    toast('错误: 游客批量限制 // 单次最多 3 张', 'error');
    return;
  }

  var fd = new FormData();
  for (var i = 0; i < files.length; i++) {
    fd.append('files', files[i]);
  }

  var prog = document.createElement('div');
  prog.className = 'upload-progress';
  prog.innerHTML =
    '<div class="upload-progress-text">// 游客上传中... ' + progressText(0) + '</div>' +
    '<div class="upload-progress-track">' +
      '<div class="upload-progress-fill" style="width:0%"></div>' +
    '</div>';
  dropzone.appendChild(prog);

  var xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/guest/upload');

  xhr.upload.onprogress = function (e) {
    if (e.lengthComputable) {
      var pct = Math.round(e.loaded / e.total * 100);
      prog.querySelector('.upload-progress-text').textContent =
        '// 游客上传中... ' + progressText(pct);
      prog.querySelector('.upload-progress-fill').style.width = pct + '%';
    }
  };

  xhr.onload = function () {
    try {
      var json = JSON.parse(xhr.responseText);
      if (json.code === 0) {
        dropzone.classList.add('flash-success');
        setTimeout(function () { dropzone.classList.remove('flash-success'); }, 600);
        var items = json.data || [];
        for (var i = 0; i < items.length; i++) {
          guestUploads.push(items[i]);
        }
        try {
          sessionStorage.setItem('neon_img_guest_uploads', JSON.stringify(guestUploads));
        } catch (e) {}
        renderGuestGallery();
        toast('上传成功 // +' + items.length + ' 张 // 游客模式');
      } else {
        toast(json.msg || '游客上传失败', 'error');
      }
    } catch (e) {
      toast('响应解析错误', 'error');
    }
    setTimeout(function () { prog.remove(); }, 1000);
  };

  xhr.onerror = function () {
    toast('连接断开 // 重试?', 'error');
    prog.remove();
  };

  xhr.send(fd);
}

function renderGuestCard(item) {
  var now = new Date();
  var expiresAt = new Date(item.expiresAt);
  var daysLeft = Math.max(0, Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24)));
  var ext = item.name.split('.').pop().toUpperCase();

  var card = document.createElement('div');
  card.className = 'card';
  card.dataset.id = item.id;
  card._item = item;

  card.innerHTML =
    '<div class="preview">' +
      '<img src="' + escapeHtml(item.thumbUrl || item.url) + '" alt="' + escapeHtml(item.name) + '" loading="lazy">' +
    '</div>' +
    '<span class="badge-id">游客</span>' +
    '<span class="badge-ext">.' + escapeHtml(ext) + '</span>' +
    '<div class="info">' +
      '<div class="info-row">' +
        '<span class="meta">' + formatSize(item.size) + '</span>' +
        '<button class="btn-overlay" data-act="url">URL</button>' +
        '<button class="btn-overlay" data-act="md">MD</button>' +
        '<button class="btn-overlay" data-act="html">&lt;/&gt;</button>' +
      '</div>' +
      '<div class="info-row" style="margin-top:4px">' +
        '<button class="btn btn-danger" data-act="guestDel" style="width:100%">DEL</button>' +
      '</div>' +
      '<div class="guest-expires">有效期剩余: ' + daysLeft + ' 天</div>' +
    '</div>';

  return card;
}

function renderGuestGallery() {
  var guestGallery = document.getElementById('guestGallery');
  if (!guestGallery) return;
  guestGallery.innerHTML = '';
  if (guestUploads.length === 0) {
    guestGallery.innerHTML = '<div class="empty">// 暂无游客上传 //</div>';
    return;
  }
  for (var i = guestUploads.length - 1; i >= 0; i--) {
    guestGallery.appendChild(renderGuestCard(guestUploads[i]));
  }
}

function guestDeleteImage(id, token, cardEl) {
  fetch('/api/guest/image/' + id + '?guestToken=' + encodeURIComponent(token), {
    method: 'DELETE'
  })
    .then(function (res) { return res.json(); })
    .then(function (json) {
      if (json.code === 0) {
        toast('已删除 // 游客数据已移除');
        if (cardEl) cardEl.remove();
        guestUploads = guestUploads.filter(function (x) { return x.id !== id; });
        try {
          sessionStorage.setItem('neon_img_guest_uploads', JSON.stringify(guestUploads));
        } catch (e) {}
        if (guestUploads.length === 0) renderGuestGallery();
      } else {
        toast(json.msg || '删除失败 // TOKEN 无效', 'error');
      }
    })
    .catch(function () {
      toast('删除失败 // 连接断开', 'error');
    });
}

// ---------- 用户面板 ----------

function buildUserPanel() {
  var panel = document.createElement('div');
  panel.id = 'userPanel';
  panel.className = 'user-panel hidden';
  panel.innerHTML =
    '<div class="up-section">' +
      '<div class="up-label">// 用户名 //</div>' +
      '<div class="up-value">' + escapeHtml(getUsername()) + '</div>' +
    '</div>' +
    '<div class="up-section">' +
      '<div class="up-label">// 数据看板 //</div>' +
      '<div class="stats-grid" id="statsGrid">' +
        '<div class="stat-item">' +
          '<div class="stat-num" id="statImages">--</div>' +
          '<div class="stat-label">图片总数</div>' +
        '</div>' +
        '<div class="stat-item">' +
          '<div class="stat-num" id="statSize">--</div>' +
          '<div class="stat-label">存储用量</div>' +
        '</div>' +
        '<div class="stat-item">' +
          '<div class="stat-num" id="statMonth">--</div>' +
          '<div class="stat-label">本月上传</div>' +
        '</div>' +
        '<div class="stat-item">' +
          '<div class="stat-num" id="statTrash">--</div>' +
          '<div class="stat-label">回收站</div>' +
        '</div>' +
      '</div>' +
      '<div class="stats-chart" id="statsChart">' +
        '<svg id="statsSvg" viewBox="0 0 280 80" class="stats-svg"></svg>' +
      '</div>' +
    '</div>' +
    '<div class="up-section">' +
      '<div class="up-label">// API TOKEN //</div>' +
      '<div class="up-row">' +
        '<code class="up-token" id="apiTokenDisplay"></code>' +
        '<button class="btn up-copy-btn" id="copyApiToken">[ 复制 ]</button>' +
      '</div>' +
      '<div class="up-row">' +
        '<button class="btn btn-danger up-reset-btn" id="resetApiTokenBtn">[ 重置 TOKEN ]</button>' +
      '</div>' +
    '</div>' +
    '<button class="up-close" id="upClose">// 关闭面板 //</button>';
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
    if (tokenDisplay) tokenDisplay.textContent = token || '// 无 TOKEN //';
    loadStats();
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
        toast('API TOKEN 已复制', 'copied');
      }).catch(function () {
        toast('复制失败', 'error');
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
          toast('// API TOKEN 已重置 //', 'success');
        } else if (json.code === 401) {
          handleUnauth();
        } else {
          toast(json.msg, 'error');
        }
      })
      .catch(function () {
        toast('连接断开', 'error');
      });
  });

  document.addEventListener('click', function (e) {
    if (panel.classList.contains('hidden')) return;
    if (!panel.contains(e.target) && e.target !== document.getElementById('hudUser')) {
      panel.classList.add('hidden');
    }
  });
}

// ---------- 数据看板 ----------

function loadStats() {
  fetch('/api/stats/me', { headers: getAuthHeader() })
    .then(function (res) { return res.json(); })
    .then(function (json) {
      if (json.code === 401) return;
      var d = json.data;
      var imgsEl = document.getElementById('statImages');
      var sizeEl = document.getElementById('statSize');
      var monthEl = document.getElementById('statMonth');
      var trashEl = document.getElementById('statTrash');

      if (imgsEl) imgsEl.textContent = d.totalImages;
      if (sizeEl) sizeEl.textContent = formatSize(d.totalSize);
      if (monthEl) monthEl.textContent = d.monthImages;
      if (trashEl) trashEl.textContent = d.trashCount;

      var svg = document.getElementById('statsSvg');
      if (svg) renderStatsSVG(svg, d.daily);
    })
    .catch(function () {});
}

function renderStatsSVG(svg, daily) {
  if (!daily || daily.length === 0) {
    svg.innerHTML = '<text x="140" y="44" text-anchor="middle" fill="var(--text-mute)" font-size="10" font-family="var(--font-mono)">// 暂无数据 //</text>';
    return;
  }

  var maxCount = 1;
  daily.forEach(function (d) { if (d.count > maxCount) maxCount = d.count; });

  var W = 280, H = 80;
  var padL = 26, padR = 8, padT = 10, padB = 16;
  var plotW = W - padL - padR;
  var plotH = H - padT - padB;
  var stepX = plotW / Math.max(daily.length - 1, 1);

  var points = daily.map(function (d, i) {
    var x = padL + i * stepX;
    var y = padT + plotH - (d.count / maxCount * plotH);
    return { x: x, y: y, count: d.count, date: d.date };
  });

  var pathD = points.map(function (p, i) {
    return (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1);
  }).join(' ');

  var labels = points.map(function (p, i) {
    var showLabel = (i % Math.ceil(daily.length / 4) === 0) || i === daily.length - 1;
    if (!showLabel) return '';
    var d = p.date.split('-');
    return '<text x="' + p.x.toFixed(1) + '" y="' + (H - 2) + '" text-anchor="middle" fill="var(--text-mute)" font-size="7" font-family="var(--font-mono)">' + (parseInt(d[1], 10) || '') + '/' + (parseInt(d[2], 10) || '') + '</text>';
  }).join('');

  var topLabel = '<text x="' + padL + '" y="' + (padT - 2) + '" text-anchor="start" fill="var(--text-mute)" font-size="7" font-family="var(--font-mono)">' + maxCount + '</text>';

  svg.innerHTML =
    '<line x1="' + padL + '" y1="' + padT + '" x2="' + (W - padR) + '" y2="' + padT + '" stroke="var(--grid-line)" stroke-width="0.5" opacity="0.5"/>' +
    '<line x1="' + padL + '" y1="' + padT + '" x2="' + padL + '" y2="' + (H - padB) + '" stroke="var(--grid-line)" stroke-width="0.5" opacity="0.5"/>' +
    topLabel +
    labels +
    '<path d="' + pathD + '" fill="none" stroke="var(--neon-cyan)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.8"/>' +
    points.map(function (p) {
      return '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="2" fill="var(--neon-cyan)" opacity="0.9"/>';
    }).join('');
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
      '<h3 class="section-title">◤ 回收站 ◢</h3>' +
      '<div class="trash-actions">' +
        '<button id="purgeAllBtn" class="btn btn-danger">[ 清空 ]</button>' +
        '<a href="#" class="btn">[ ← 返回图库 ]</a>' +
      '</div>' +
    '</div>' +
    '<div id="trashList" class="trash-list"></div>' +
    '<p id="trashEmpty" class="empty hidden">回收站为空</p>';
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
  document.title = '◤ NEON.IMG ◢ // 图床服务';
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
  document.title = '◤ 回收站 ◢ // NEON.IMG';
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
      toast('加载回收站失败', 'error');
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
      '<div class="trash-meta">' + formatSize(item.size) + ' // 已删除: ' + formatDate(item.deletedAt) + '</div>' +
      '<div class="trash-expires' + (item.daysLeft <= 3 ? ' warning' : '') + '">剩余 ' + item.daysLeft + ' 天</div>' +
    '</div>' +
    '<div class="trash-btns">' +
      '<button class="btn" data-act="restore" data-id="' + item.id + '">[ 恢复 ]</button>' +
      '<button class="btn btn-danger" data-act="purge" data-id="' + item.id + '">[ 永久删除 ]</button>' +
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
        toast('已恢复到图库');
        loadTrash();
        loadList();
      } else if (json.code === 401) {
        handleUnauth();
      } else {
        toast(json.msg, 'error');
      }
    })
    .catch(function () {
      toast('恢复失败', 'error');
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
        toast('[ 已永久删除 ]');
        loadTrash();
        updateTrashBadge();
      } else if (json.code === 401) {
        handleUnauth();
      } else {
        toast(json.msg, 'error');
      }
    })
    .catch(function () {
      toast('永久删除失败', 'error');
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
      toast('[ 已清空回收站 ]');
      pendingPurgeAll = false;
      _modalSubmitting = false;
      modal.classList.add('hidden');
      loadTrash();
      updateTrashBadge();
    })
    .catch(function () {
      toast('清空回收站失败', 'error');
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
        '<span>◤ 管理终端 ◢</span>' +
        '<button class="admin-close">[ × 关闭 ]</button>' +
      '</div>' +
      '<div class="admin-tabs">' +
        '<button class="admin-tab-btn active" data-tab="users">[ 用户管理 ]</button>' +
        '<button class="admin-tab-btn" data-tab="moderation">[ 审核复审 ]</button>' +
        '<button class="admin-tab-btn" data-tab="stats">[ 数据看板 ]</button>' +
      '</div>' +
      '<div class="admin-stats" id="adminStats">// 加载中...</div>' +
      '<div id="adminUserList" class="admin-user-list"></div>' +
      '<div id="moderationList" class="admin-user-list hidden"></div>' +
      '<div id="adminStatsPanel" class="admin-stats-panel hidden"></div>' +
      '<div class="admin-footer">// 管理员: ' + escapeHtml(getUsername()) + ' //</div>' +
    '</div>';
  return panel;
}

var _adminTab = 'users';

function switchAdminTab(tab) {
  _adminTab = tab;
  var userList = document.getElementById('adminUserList');
  var modList = document.getElementById('moderationList');
  var statsPanel = document.getElementById('adminStatsPanel');
  var tabs = document.querySelectorAll('#adminPanel .admin-tab-btn');

  tabs.forEach(function (t) {
    t.classList.remove('active');
    if (t.dataset.tab === tab) t.classList.add('active');
  });

  if (tab === 'users') {
    if (userList) userList.classList.remove('hidden');
    if (modList) modList.classList.add('hidden');
    if (statsPanel) statsPanel.classList.add('hidden');
  } else if (tab === 'moderation') {
    if (userList) userList.classList.add('hidden');
    if (modList) modList.classList.remove('hidden');
    if (statsPanel) statsPanel.classList.add('hidden');
    loadModerationList();
  } else if (tab === 'stats') {
    if (userList) userList.classList.add('hidden');
    if (modList) modList.classList.add('hidden');
    if (statsPanel) statsPanel.classList.remove('hidden');
    loadAdminStats();
  }
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

  // Tab 切换
  panel.querySelectorAll('.admin-tab-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      switchAdminTab(btn.dataset.tab);
    });
  });

  // User list purge 按钮
  panel.querySelector('#adminUserList').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-act="purge-user"]');
    if (!btn) return;
    var userId = btn.dataset.id;
    var username = btn.dataset.username;
    askPurgeUser(userId, username);
  });

  // Moderation list 操作按钮
  panel.querySelector('#moderationList').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    var act = btn.dataset.act;
    var imageId = btn.dataset.id;
    if (act === 'mod-pass') {
      modApprove(imageId);
    } else if (act === 'mod-reject') {
      var reason = prompt('// 拒绝原因（可选）:');
      if (reason === null) return; // 取消
      modReject(imageId, reason);
    }
  });
}

function loadAdminPanel() {
  fetch('/api/admin/users', { headers: getAuthHeader() })
    .then(function (res) { return res.json(); })
    .then(function (json) {
      if (json.code === 401) { handleUnauth(); return; }
      if (json.code === 403) {
        toast('无权访问 // 仅管理员', 'error');
        var ap = document.getElementById('adminPanel');
        if (ap) { ap.classList.add('hidden'); }
        document.body.style.overflow = '';
        return;
      }
      var users = json.data || [];
      renderAdminUserList(users);
    })
    .catch(function () {
      toast('加载用户列表失败', 'error');
    });
}

function renderAdminUserList(users) {
  var list = document.getElementById('adminUserList');
  var stats = document.getElementById('adminStats');
  if (!list || !stats) return;

  var totalImages = 0;
  users.forEach(function (u) { totalImages += u.imageCount; });

  stats.textContent = '// 总用户数: ' + users.length + ' // 总图片数: ' + totalImages + ' //';

  list.innerHTML = '';
  var currentUser = getUsername();
  users.forEach(function (u) {
    var row = document.createElement('div');
    row.className = 'admin-user-row';
    var tag = u.isAdmin ? ' <span class="admin-tag">[管理员]</span>' : '';
    var isSelf = u.username === currentUser;
    var showPurge = !u.isAdmin && !isSelf;
    var purgeBtn = showPurge
      ? '<button class="btn btn-danger admin-purge-btn" data-act="purge-user" data-id="' + u.id + '" data-username="' + escapeHtml(u.username) + '">[ 删除用户 ]</button>'
      : '';
    row.innerHTML =
      '<span class="admin-username">' + escapeHtml(u.username) + tag + '</span>' +
      '<span class="admin-meta">' +
        '注册时间: ' + formatDate(u.createdAt) +
        ' // 图片: ' + u.imageCount +
        ' // 回收站: ' + u.trashCount +
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
  modal.querySelector('.modal-header').textContent = '! 警告: 删除用户';
  modal.querySelector('.modal-body').textContent = '将删除用户 [' + username + '] 及其全部数据包，此操作不可逆，确认继续？';
  modalOk.textContent = '[ 删除用户 ]';
  modalCancel.textContent = '[ 取消 ]';
  modal.classList.remove('hidden');
}

// ---------- 审核复审 ----------

function loadModerationList() {
  fetch('/api/admin/moderation', { headers: getAuthHeader() })
    .then(function (res) { return res.json(); })
    .then(function (json) {
      if (json.code === 401) { handleUnauth(); return; }
      if (json.code === 403) {
        toast('无权访问 // 仅管理员', 'error');
        return;
      }
      renderModerationList(json.data || []);
    })
    .catch(function () {
      toast('加载审核列表失败', 'error');
    });
}

function renderModerationList(items) {
  var list = document.getElementById('moderationList');
  var stats = document.getElementById('adminStats');
  if (!list || !stats) return;

  stats.textContent = '// 待复审: ' + items.length + ' 项 //';

  list.innerHTML = '';
  if (items.length === 0) {
    list.innerHTML = '<div class="mod-empty">无待审核内容</div>';
    return;
  }

  items.forEach(function (item) {
    var row = document.createElement('div');
    row.className = 'mod-row';
    row.innerHTML =
      '<img class="mod-thumb" src="' + escapeHtml(item.thumbUrl || item.url) + '" alt="' + escapeHtml(item.name) + '" loading="lazy">' +
      '<div class="mod-info">' +
        '<div class="mod-name" title="' + escapeHtml(item.name) + '">' + escapeHtml(item.name) + '</div>' +
        '<div class="mod-meta">' +
          '// 上传者: ' + escapeHtml(item.uploader || '未知') + ' //' +
          ' // 评分: ' + (item.score != null ? item.score : '未知') +
          (item.tags && item.tags.length ? ' // 标签: ' + item.tags.join(', ') : '') +
          '<br>' + formatDate(item.uploadedAt) +
        '</div>' +
      '</div>' +
      '<div class="mod-btns">' +
        '<button class="btn" data-act="mod-pass" data-id="' + item.id + '">[ 通过 ]</button>' +
        '<button class="btn btn-danger" data-act="mod-reject" data-id="' + item.id + '">[ 拒绝 ]</button>' +
      '</div>';
    list.appendChild(row);
  });
}

function modApprove(imageId) {
  fetch('/api/admin/moderation/' + imageId + '/pass', {
    method: 'POST',
    headers: getAuthHeader()
  })
    .then(function (res) { return res.json(); })
    .then(function (json) {
      if (json.code === 401) { handleUnauth(); return; }
      if (json.code === 0) {
        toast('审核: 已通过');
        loadModerationList();
        updateModBadge();
      } else {
        toast(json.msg || '审核操作失败', 'error');
      }
    })
    .catch(function () {
      toast('审核操作失败', 'error');
    });
}

function modReject(imageId, reason) {
  fetch('/api/admin/moderation/' + imageId + '/reject', {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, getAuthHeader()),
    body: JSON.stringify({ reason: reason || '' })
  })
    .then(function (res) { return res.json(); })
    .then(function (json) {
      if (json.code === 401) { handleUnauth(); return; }
      if (json.code === 0) {
        toast('审核: 已拒绝');
        loadModerationList();
        updateModBadge();
      } else {
        toast(json.msg || '审核操作失败', 'error');
      }
    })
    .catch(function () {
      toast('审核操作失败', 'error');
    });
}

function updateModBadge() {
  if (!isAdmin()) return;
  fetch('/api/admin/moderation', { headers: getAuthHeader() })
    .then(function (res) { return res.json(); })
    .then(function (json) {
      if (json.code === 401) return;
      var badge = document.getElementById('modBadge');
      var count = (json.data || []).length;
      if (count > 0) {
        if (!badge) {
          badge = document.createElement('span');
          badge.id = 'modBadge';
          badge.className = 'mod-badge';
          var adminBtn = document.getElementById('adminBtn');
          if (adminBtn && adminBtn.parentNode) {
            adminBtn.parentNode.style.position = 'relative';
            adminBtn.parentNode.appendChild(badge);
          }
        }
        badge.textContent = count;
      } else {
        if (badge) badge.remove();
      }
    })
    .catch(function () {});
}

function loadAdminStats() {
  fetch('/api/admin/stats', { headers: getAuthHeader() })
    .then(function (res) { return res.json(); })
    .then(function (json) {
      if (json.code === 401) { handleUnauth(); return; }
      var d = json.data;
      var panel = document.getElementById('adminStatsPanel');
      if (!panel) return;
      panel.innerHTML =
        '<div class="astats-grid">' +
          '<div class="astat-item">' +
            '<div class="astat-num">' + d.totalUsers + '</div>' +
            '<div class="astat-label">用户数</div>' +
          '</div>' +
          '<div class="astat-item">' +
            '<div class="astat-num">' + d.totalImages + '</div>' +
            '<div class="astat-label">图片数</div>' +
          '</div>' +
          '<div class="astat-item">' +
            '<div class="astat-num">' + formatSize(d.totalSize) + '</div>' +
            '<div class="astat-label">存储量</div>' +
          '</div>' +
          '<div class="astat-item">' +
            '<div class="astat-num">' + d.todayUploads + '</div>' +
            '<div class="astat-label">今日上传</div>' +
          '</div>' +
          '<div class="astat-item">' +
            '<div class="astat-num">' + d.guestUploads + '</div>' +
            '<div class="astat-label">游客上传</div>' +
          '</div>' +
          '<div class="astat-item">' +
            '<div class="astat-num" style="color:' + (d.pendingReview > 0 ? 'var(--neon-yellow)' : 'var(--neon-cyan)') + '">' + d.pendingReview + '</div>' +
            '<div class="astat-label">待审核</div>' +
          '</div>' +
        '</div>';
    })
    .catch(function () {});
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
