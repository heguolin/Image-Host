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

// ---------- 工具 ----------

function toast(msg, type) {
  type = type || 'success';
  var prefixMap = { success: '[ SUCCESS ]', error: '[ ERROR ]', info: '[ INFO ]' };
  var prefix = prefixMap[type] || '[ INFO ]';
  var el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = prefix + ' ' + msg;
  toastWrap.appendChild(el);
  setTimeout(function () { el.remove(); }, 3000);
}

function copy(text) {
  navigator.clipboard.writeText(text).then(function () {
    toast('COPIED TO CLIPBOARD');
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
  var card = document.createElement('div');
  card.className = 'card';
  card.dataset.id = item.id;
  card._item = item;

  card.innerHTML =
    '<div class="preview">' +
      '<img src="' + escapeHtml(item.url) + '" alt="' + escapeHtml(item.name) + '" loading="lazy">' +
    '</div>' +
    '<span class="badge-id">#' + String(index + 1).padStart(3, '0') + '</span>' +
    '<span class="badge-ext">.' + escapeHtml(ext) + '</span>' +
    '<div class="info">' +
      '<div class="name" title="' + escapeHtml(item.name) + '">' + escapeHtml(item.name) + '</div>' +
      '<div class="meta">' + formatSize(item.size) + '</div>' +
      '<div class="btns">' +
        '<button class="btn" data-act="url">URL</button>' +
        '<button class="btn" data-act="md">MD</button>' +
        '<button class="btn" data-act="html">HTML</button>' +
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
}

// ---------- API ----------

function loadList() {
  fetch('/api/list')
    .then(function (res) { return res.json(); })
    .then(function (json) {
      rerender(json.data || []);
    })
    .catch(function () {
      toast('LOAD LIST FAILED', 'error');
    });
}

function uploadFiles(files) {
  if (!files || files.length === 0) return;
  var fd = new FormData();
  for (var i = 0; i < files.length; i++) {
    fd.append('files', files[i]);
  }
  toast('UPLINK IN PROGRESS... (' + files.length + ')', 'info');
  fetch('/api/upload', { method: 'POST', body: fd })
    .then(function (res) { return res.json(); })
    .then(function (json) {
      if (json.code === 0) {
        toast('DATA PACKET RECEIVED');
        loadList();
      } else {
        toast(json.msg || 'UPLOAD FAILED', 'error');
      }
    })
    .catch(function () {
      toast('CONNECTION LOST // RETRY?', 'error');
    });
}

// ---------- 删除模态框 ----------

function askDelete(id, card) {
  pendingDelete = { id: id, card: card };
  modal.classList.remove('hidden');
}

function doDelete() {
  if (!pendingDelete) return;
  var id = pendingDelete.id;
  fetch('/api/image/' + id, { method: 'DELETE' })
    .then(function (res) { return res.json(); })
    .then(function (json) {
      if (json.code === 0) {
        toast('DATA PURGED');
        loadList();
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
    });
}

function cancelDelete() {
  pendingDelete = null;
  modal.classList.add('hidden');
}

modalOk.addEventListener('click', doDelete);
modalCancel.addEventListener('click', cancelDelete);

// ---------- 事件委托：卡片按钮 ----------

gallery.addEventListener('click', function (e) {
  var btn = e.target.closest('[data-act]');
  if (!btn) return;
  var act = btn.dataset.act;
  var card = btn.closest('.card');
  var id = card.dataset.id;

  var item = card._item;
  if (act === 'url') {
    copy(item.url);
  } else if (act === 'md') {
    copy('![' + item.name + '](' + item.url + ')');
  } else if (act === 'html') {
    copy('<img src="' + item.url + '" alt="' + item.name + '">');
  } else if (act === 'del') {
    askDelete(id, card);
  }
});

// ---------- 拖拽上传 ----------

dropzone.addEventListener('click', function () {
  fileInput.click();
});

fileInput.addEventListener('change', function (e) {
  uploadFiles(e.target.files);
});

['dragenter', 'dragover'].forEach(function (ev) {
  dropzone.addEventListener(ev, function (e) {
    e.preventDefault();
    dropzone.classList.add('hover');
  });
});

['dragleave', 'drop'].forEach(function (ev) {
  dropzone.addEventListener(ev, function (e) {
    e.preventDefault();
    dropzone.classList.remove('hover');
  });
});

dropzone.addEventListener('drop', function (e) {
  uploadFiles(e.dataTransfer.files);
});

// ---------- 粘贴上传 ----------

document.addEventListener('paste', function (e) {
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

// ---------- 启动 ----------

loadList();
