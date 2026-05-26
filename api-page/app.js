

const BASE_URL = 'https://api.lumi-base.my.id';

async function loadSettings() {
  var FALLBACK = {
    name: 'Lumi Base', version: '1.0.0', author: 'Altheric Official',
    description: 'Open REST API by Altheric Official — no authentication required.',
    baseUrl: BASE_URL,
    banner: BASE_URL + '/image/191851aefde677526f000487a23d4f8a.gif',
    categories: [{
      name: 'Search',
      items: [{ name: 'Pinterest', desc: 'Search images on Pinterest', path: '/search/pinterest?q=' }]
    }]
  };

  var cfg = FALLBACK;

  try {
    var urls = [
      window.location.origin + '/settings.json',
      BASE_URL + '/settings.json'
    ];
    var fetched = false;
    for (var i = 0; i < urls.length; i++) {
      try {
        var r = await fetch(urls[i], { cache: 'no-store' });
        if (r.ok) {
          var data = await r.json();
          if (data && data.name) {
            cfg = data;
            if (cfg.banner && cfg.banner.startsWith('/')) {
              cfg.banner = BASE_URL + cfg.banner;
            }
            fetched = true;
            break;
          }
        }
      } catch(e) {  }
    }
  } catch(e) {  }

  applySettings(cfg);
}

function applySettings(cfg) {
  const [firstName, ...rest] = (cfg.name || 'Lumi Base').split(' ');
  document.getElementById('hd-logo').innerHTML =
    `${firstName} <em>${rest.join(' ') || 'Base'}</em>`;
  document.getElementById('hd-version').textContent = `v${cfg.version || '1.0.0'}`;
  document.getElementById('hd-desc').textContent = cfg.description || '';
  document.getElementById('hd-baseurl').textContent = cfg.baseUrl || BASE_URL;

  const bannerEl = document.getElementById('hd-banner');
  if (cfg.banner) {
    bannerEl.src = cfg.banner;
    bannerEl.onerror = () => { bannerEl.style.display = 'none'; };
  }

  document.title = `${cfg.name || 'Lumi Base'} · API`;
  buildFolders(cfg.categories || [], cfg.baseUrl || BASE_URL);
}

function buildFolders(categories, baseUrl) {
  const folderRoot  = document.getElementById('folder-root');
  const panelsRoot  = document.getElementById('panels-root');
  folderRoot.innerHTML  = '';
  panelsRoot.innerHTML  = '';

  categories.forEach((cat, ci) => {
    const catId = `cat${ci}`;
    const count = cat.items?.length || 0;

    const folder = document.createElement('div');
    folder.className = 'folder';
    folder.id = `folder-${catId}`;

    const tab = document.createElement('div');
    tab.className = 'folder-tab';
    tab.innerHTML = `
      <span class="folder-icon">📁</span>
      <span class="folder-name">${cat.name}</span>
      <span class="folder-count">${count} endpoint${count !== 1 ? 's' : ''}</span>
      <span class="folder-arrow">▶</span>`;
    tab.onclick = () => folder.classList.toggle('open');
    folder.appendChild(tab);

    const content = document.createElement('div');
    content.className = 'folder-content';

    (cat.items || []).forEach((item, ii) => {
      const epId = `${catId}-ep${ii}`;
      const row = document.createElement('div');
      row.className = 'ep-row';
      row.id = `eprow-${epId}`;
      row.innerHTML = `
        <div class="tree-vert"></div>
        <div class="tree-horiz"></div>
        <span class="ep-method${item.method === 'POST' ? ' ep-method-post' : ''}">${item.method || 'GET'}</span>
        <span class="ep-name">${item.name}<span class="ep-desc-inline">${item.desc ? ' — ' + item.desc : ''}</span></span>
        <span class="ep-copy" id="copy-${epId}" title="Copy URL" onclick="copyEndpoint(event,'${epId}','${baseUrl}${item.path}')"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2H3.5A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5"/></svg></span>`;
      row.onclick = (e) => {
        if (e.target.classList.contains('ep-copy')) return;
        toggleDetail(epId);
      };
      content.appendChild(row);

      buildPanel(panelsRoot, epId, item, baseUrl, cat.name);
      if (!window._modalMeta) window._modalMeta = {};
      var _pathBase2 = item.path.split('?')[0];
      var _qs2 = item.path.includes('?') ? item.path.split('?')[1] : '';
      var _params2 = _qs2 ? _qs2.split('&').map(function(p){return{key:p.split('=')[0],val:p.split('=')[1]||''};}) : [];
      window._modalMeta[epId] = { pathBase: _pathBase2, params: _params2, name: item.name, method: item.method || 'GET' };
    });

    folder.appendChild(content);
    folderRoot.appendChild(folder);
  });
}

function buildPanel(root, epId, item, baseUrl, catName) {
  const pathBase = item.path.split('?')[0];
  const queryStr = item.path.includes('?') ? item.path.split('?')[1] : '';
  const params = queryStr
    ? queryStr.split('&').map(p => ({ key: p.split('=')[0], val: p.split('=')[1] || '' }))
    : [];
  const method = item.method || 'GET';

  const panel = document.createElement('div');
  panel.className = 'detail-panel';
  panel.id = `detail-${epId}`;

  const pathDisplay = pathBase +
    (params.length ? '?' + params.map(p => `<span class="pq">${p.key}=</span><span class="pq">{${p.key}}</span>`).join('&') : '');

  const requestBlock = method === 'POST'
    ? '<div class="code-block">'
      + '<span class="ck">POST</span>&nbsp;<span class="cb">' + baseUrl + '</span><span class="cv">' + pathBase + '</span><br>'
      + '<span style="color:var(--muted);font-size:11px">Content-Type: application/json</span><br><br>'
      + '<span class="cs">// single base64</span><br>'
      + '<span class="cn">{ &quot;base64&quot;: &quot;data:image/png;base64,...&quot; }</span><br><br>'
      + '<span class="cs">// single url</span><br>'
      + '<span class="cn">{ &quot;url&quot;: &quot;https://example.com/photo.jpg&quot; }</span><br><br>'
      + '<span class="cs">// multiple url</span><br>'
      + '<span class="cn">{ &quot;urls&quot;: [&quot;https://...&quot;, &quot;https://...&quot;] }</span><br><br>'
      + '<span class="cs">// multiple base64</span><br>'
      + '<span class="cn">{ &quot;files&quot;: [{ &quot;base64&quot;: &quot;...&quot;, &quot;filename&quot;: &quot;a.png&quot; }] }</span>'
      + '</div>'
    : '<div class="code-block">'
      + '<span class="ck">GET</span>&nbsp;<span class="cb">' + baseUrl + '</span><span class="cv">' + pathBase + '</span>'
      + (params.length ? '<span class="cb">?' + params.map(function(p){ return '<span class="cs">' + p.key + '</span>=<span class="cn">{value}</span>'; }).join('&amp;') + '</span>' : '')
      + '</div>'

  panel.innerHTML =
    '<div class="panel-title">'
    + '<span class="pt-method' + (method === 'POST' ? ' pt-method-post' : '') + '">' + method + '</span>'
    + '<span class="pt-path">' + pathDisplay + '</span>'
    + '<span class="pt-name">' + item.name + '</span>'
    + '</div>'
    + '<div class="panel-tabs">'
    + '<div class="ptab active" onclick="switchTab(\'' + epId + '\',\'params\')">Parameters</div>'
    + '<div class="ptab" onclick="switchTab(\'' + epId + '\',\'request\')">Request</div>'
    + '<div class="ptab" onclick="switchTab(\'' + epId + '\',\'tester\')">Try It</div>'
    + '</div>'
    + '<div class="tab-pane active" id="tab-' + epId + '-params">'
    + (method === 'POST' ? buildPostParamsTable() : buildParamsTable(params))
    + '</div>'
    + '<div class="tab-pane" id="tab-' + epId + '-request">'
    + requestBlock
    + '</div>'
    + '<div class="tab-pane" id="tab-' + epId + '-tester"></div>';

  root.appendChild(panel);
  var _tp = panel.querySelector('[id="tab-' + epId + '-tester"]');
  if (_tp) _tp.appendChild(buildTester(epId, pathBase, params, item.name, method));
}

function buildParamsTable(params) {
  if (!params.length) return '<p style="font-size:12px;color:var(--muted);font-family:\'DM Sans\',sans-serif;">No parameters required.</p>';
  const rows = params.map(p => `
    <tr>
      <td class="pn">${p.key}</td>
      <td class="pt">string</td>
      <td><span class="req-tag">required</span></td>
      <td style="font-family:'DM Sans',sans-serif;font-size:12px;color:var(--muted);">${p.key} value</td>
    </tr>`).join('');
  return `
    <div class="table-scroll">
    <table class="params-table">
      <thead><tr><th>Param</th><th>Type</th><th>Status</th><th>Description</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </div>`;
}

function buildPostParamsTable() {
  var td = 'font-family:sans-serif;font-size:12px;color:var(--muted)';
  return '<div class="table-scroll"><table class="params-table"><thead><tr><th>Field</th><th>Type</th><th>Description</th></tr></thead><tbody>'
    + '<tr><td class="pn">base64</td><td class="pt">string</td><td style="' + td + '">Data URI base64 (single)</td></tr>'
    + '<tr><td class="pn">files</td><td class="pt">array</td><td style="' + td + '">Array {base64, filename} (multiple)</td></tr>'
    + '<tr><td class="pn">url</td><td class="pt">string</td><td style="' + td + '">URL file rehost (single)</td></tr>'
    + '<tr><td class="pn">urls</td><td class="pt">array</td><td style="' + td + '">Array URL rehost (multiple)</td></tr>'
    + '<tr><td class="pn">filename</td><td class="pt">string</td><td style="' + td + '">Nama file custom (opsional)</td></tr>'
    + '</tbody></table></div>';
}

function buildTester(epId, pathBase, params, name, method) {
  method = method || 'GET';
  var wrap = document.createElement('div');
  wrap.className = 'tester';

  var hd = document.createElement('div');
  hd.className = 'tester-hd';
  hd.textContent = 'Live Tester — ' + name;
  wrap.appendChild(hd);

  var inputs = {};

  if (method === 'POST') {
    var fieldWrap = document.createElement('div');
    fieldWrap.className = 'tester-row';
    fieldWrap.style.flexDirection = 'column';
    fieldWrap.style.gap = '6px';

    var lbl = document.createElement('span');
    lbl.className = 'param-field-label';
    lbl.textContent = 'JSON Body';
    lbl.style.marginBottom = '4px';

    var ta = document.createElement('textarea');
    ta.className = 'param-field-input';
    ta.rows = 6;
    ta.style.width = '100%';
    ta.style.resize = 'vertical';
    ta.style.fontFamily = 'monospace';
    ta.style.fontSize = '12px';
    ta.placeholder = '{ "url": "https://example.com/photo.jpg" }';
    inputs['__body__'] = ta;

    fieldWrap.appendChild(lbl);
    fieldWrap.appendChild(ta);
    wrap.appendChild(fieldWrap);

    var runRow = document.createElement('div');
    runRow.className = 'tester-row';
    var btn = document.createElement('button');
    btn.className = 't-btn';
    btn.textContent = 'Run';
    var stat = document.createElement('div');
    stat.className = 'run-status';
    stat.style.display = 'none';
    var res = document.createElement('div');
    res.className = 'generic-result';
    btn.addEventListener('click', function() {
      runPostDirect(pathBase, ta, btn, stat, res);
    });
    runRow.appendChild(btn);
    wrap.appendChild(runRow);
    wrap.appendChild(stat);
    wrap.appendChild(res);
    return wrap;
  }

  var fieldWrap = document.createElement('div');
  fieldWrap.className = params.length ? 'param-fields' : 'tester-row';
  params.forEach(function(p) {
    var row = document.createElement('div');
    row.className = 'param-field-row';
    var lbl = document.createElement('span');
    lbl.className = 'param-field-label';
    lbl.textContent = p.key;
    var inp = document.createElement('input');
    inp.className = 'param-field-input';
    inp.type = 'text';
    inp.placeholder = p.key + '...';
    inp.autocomplete = 'off';
    inputs[p.key] = inp;
    row.appendChild(lbl);
    row.appendChild(inp);
    fieldWrap.appendChild(row);
  });
  wrap.appendChild(fieldWrap);

  var runRow = document.createElement('div');
  runRow.className = params.length ? 'param-run-row' : 'tester-row';

  var btn = document.createElement('button');
  btn.className = 't-btn';
  btn.textContent = 'Run';

  var stat = document.createElement('div');
  stat.className = 'run-status';
  stat.style.display = 'none';

  var res = document.createElement('div');
  res.className = 'generic-result';

  btn.addEventListener('click', function() {
    runGenericDirect(pathBase, params, inputs, btn, stat, res);
  });

  runRow.appendChild(btn);
  wrap.appendChild(runRow);
  wrap.appendChild(stat);
  wrap.appendChild(res);

  return wrap;
}

var _modalOpen = false;

function openModal(id) {
  var meta = window._modalMeta && window._modalMeta[id];
  if (!meta) return;

  var backdrop = document.getElementById('global-modal-backdrop');
  var header   = document.getElementById('global-modal-header');
  var body     = document.getElementById('global-modal-body');

  var panel = document.getElementById('detail-' + id);
  var titleEl = panel ? panel.querySelector('.panel-title') : null;
  header.innerHTML = (titleEl ? titleEl.innerHTML : '') +
    '<button class="modal-close" onclick="closeModal()">✕</button>';

  body.innerHTML = '';

  var tabBar = document.createElement('div');
  tabBar.className = 'panel-tabs';
  var tabNames = ['Parameters', 'Request', 'Try It'];
  var paneEls = [];

  tabNames.forEach(function(name, i) {
    var tab = document.createElement('div');
    tab.className = 'ptab' + (i === 0 ? ' active' : '');
    tab.textContent = name;
    tabBar.appendChild(tab);

    var pane = document.createElement('div');
    pane.className = 'tab-pane' + (i === 0 ? ' active' : '');
    paneEls.push(pane);
  });

  tabBar.querySelectorAll('.ptab');
  var allTabs = tabBar.querySelectorAll ? null : null;
  tabBar.addEventListener('click', function(e) {
    var clicked = e.target.closest('.ptab');
    if (!clicked) return;
    var tabs = Array.from(tabBar.querySelectorAll('.ptab'));
    var idx = tabs.indexOf(clicked);
    tabs.forEach(function(t) { t.classList.remove('active'); });
    paneEls.forEach(function(p) { p.classList.remove('active'); });
    clicked.classList.add('active');
    if (paneEls[idx]) paneEls[idx].classList.add('active');
  });

  body.appendChild(tabBar);
  paneEls.forEach(function(p) { body.appendChild(p); });

  var sourcePanel = document.getElementById('detail-' + id);

  var paramsPane = paneEls[0];
  var reqPane    = paneEls[1];
  var tryPane    = paneEls[2];

  if (sourcePanel) {
    var srcParams = sourcePanel.querySelector('[id^="tab-"][id$="-params"]');
    var srcReq    = sourcePanel.querySelector('[id^="tab-"][id$="-request"]');
    if (srcParams) paramsPane.innerHTML = srcParams.innerHTML;
    if (srcReq)    reqPane.innerHTML    = srcReq.innerHTML;
  }

  tryPane.appendChild(buildTester(id, meta.pathBase, meta.params, meta.name, meta.method));

  document.querySelectorAll('.ep-row').forEach(function(r) { r.classList.remove('active'); });
  var row = document.getElementById('eprow-' + id);
  if (row) row.classList.add('active');

  backdrop.classList.add('open');
  document.body.style.overflow = 'hidden';
  _modalOpen = true;
}

function closeModal() {
  var backdrop = document.getElementById('global-modal-backdrop');
  backdrop.classList.remove('open');
  document.body.style.overflow = '';
  document.querySelectorAll('.ep-row').forEach(function(r) { r.classList.remove('active'); });
  _modalOpen = false;
}

function toggleDetail(id) {
  if (_modalOpen) {
    closeModal();
    return;
  }
  openModal(id);
}

function switchTab(epId, tabName) {
  const panel = document.getElementById('detail-' + epId);
  const order = ['params','request','tester'];
  panel.querySelectorAll('.ptab').forEach(t => t.classList.remove('active'));
  panel.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  const idx = order.indexOf(tabName);
  const tabs = panel.querySelectorAll('.ptab');
  if (tabs[idx]) tabs[idx].classList.add('active');
  const pane = document.getElementById('tab-' + epId + '-' + tabName);
  if (pane) pane.classList.add('active');
}

const ICON_COPY = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2H3.5A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5"/></svg>`;
const ICON_CHECK = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="2.5 8.5 6 12 13.5 4"/></svg>`;

function copyEndpoint(e, id, url) {
  e.stopPropagation();
  navigator.clipboard.writeText(url).then(() => {
    const btn = document.getElementById('copy-' + id);
    btn.innerHTML = ICON_CHECK;
    btn.classList.add('copied');
    setTimeout(() => { btn.innerHTML = ICON_COPY; btn.classList.remove('copied'); }, 1800);
  });
}

async function runPostDirect(pathBase, ta, btn, stat, res) {
  var COPY_ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2H3.5A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5"/></svg>Copy';
  function setStatus(cls, msg) {
    stat.style.display = 'flex';
    stat.className = 'run-status ' + cls;
    stat.textContent = msg;
    if (cls === 'ok' || cls === 'fail') {
      var copyBtn = document.createElement('button');
      copyBtn.className = 'copy-result-btn';
      copyBtn.innerHTML = COPY_ICON;
      copyBtn.onclick = function() {
        navigator.clipboard.writeText(res.textContent || '').then(function() {
          copyBtn.textContent = '✓ Copied';
          copyBtn.classList.add('copied');
          setTimeout(function() { copyBtn.innerHTML = COPY_ICON; copyBtn.classList.remove('copied'); }, 1800);
        });
      };
      stat.appendChild(copyBtn);
    }
  }
  var bodyStr = ta.value.trim();
  if (!bodyStr) { setStatus('fail', '✖ JSON body kosong'); return; }
  var bodyObj;
  try { bodyObj = JSON.parse(bodyStr); } catch(e) { setStatus('fail', '✖ JSON tidak valid: ' + e.message); return; }
  btn.disabled = true;
  btn.innerHTML = '<span class="ldots"><span></span><span></span><span></span></span>';
  setStatus('loading', 'Fetching...');
  res.style.display = 'none';
  res.textContent = '';
  try {
    var url = 'https://api.lumi-base.my.id' + pathBase;
    var r = await fetch(url, { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(bodyObj) });
    var raw = await r.text();
    try {
      var json = JSON.parse(raw);
      setStatus(r.ok ? 'ok' : 'fail', r.ok ? '✓ ' + r.status + ' OK' + (json.total != null ? ' — ' + json.total + ' file' : '') : '✖ HTTP ' + r.status + (json.message ? ' — ' + json.message : ''));
      res.style.display = 'block';
      res.className = 'generic-result show' + (r.ok ? '' : ' err');
      res.textContent = JSON.stringify(json, null, 2);
    } catch(e) {
      setStatus(r.ok ? 'ok' : 'fail', r.ok ? '✓ ' + r.status : '✖ HTTP ' + r.status);
      res.style.display = 'block';
      res.className = 'generic-result show' + (r.ok ? '' : ' err');
      res.textContent = raw.slice(0, 1000);
    }
  } catch(err) {
    setStatus('fail', '✖ ' + err.message);
    res.style.display = 'block';
    res.className = 'generic-result show err';
    res.textContent = err.message;
  }
  btn.disabled = false;
  btn.textContent = 'Run';
}

async function runGenericDirect(pathBase, params, inputs, btn, stat, res) {
  var COPY_ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2H3.5A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5"/></svg>Copy';

  function setStatus(cls, msg) {
    stat.style.display = 'flex';
    stat.className = 'run-status ' + cls;
    stat.textContent = msg;
    if (cls === 'ok' || cls === 'fail') {
      var copyBtn = document.createElement('button');
      copyBtn.className = 'copy-result-btn';
      copyBtn.innerHTML = COPY_ICON;
      copyBtn.onclick = function() {
        navigator.clipboard.writeText(res.textContent || '').then(function() {
          copyBtn.textContent = '✓ Copied';
          copyBtn.classList.add('copied');
          setTimeout(function() { copyBtn.innerHTML = COPY_ICON; copyBtn.classList.remove('copied'); }, 1800);
        });
      };
      stat.appendChild(copyBtn);
    }
  }

  var url = 'https://api.lumi-base.my.id' + pathBase;
  if (params && params.length) {
    var pairs = params.map(function(p) {
      var val = inputs[p.key] ? inputs[p.key].value.trim() : '';
      return p.key + '=' + encodeURIComponent(val);
    });
    url += '?' + pairs.join('&');
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="ldots"><span></span><span></span><span></span></span>';
  setStatus('loading', 'Fetching...');
  res.style.display = 'none';
  res.textContent = '';

  try {
    var r = await fetch(url, { cache: 'no-store', headers: { 'Accept': 'application/json' } });
    var raw = await r.text();
    try {
      var json = JSON.parse(raw);
      setStatus(r.ok ? 'ok' : 'fail',
        r.ok ? '✓ ' + r.status + ' OK' + (json.total != null ? ' — ' + json.total + ' hasil' : '')
              : '✖ HTTP ' + r.status + (json.message ? ' — ' + json.message : ''));
      res.style.display = 'block';
      res.className = 'generic-result show' + (r.ok ? '' : ' err');
      res.textContent = JSON.stringify(json, null, 2);
    } catch(e) {
      setStatus(r.ok ? 'ok' : 'fail', r.ok ? '✓ ' + r.status : '✖ HTTP ' + r.status);
      res.style.display = 'block';
      res.className = 'generic-result show' + (r.ok ? '' : ' err');
      res.textContent = raw.slice(0, 1000);
    }
  } catch(err) {
    setStatus('fail', '✖ ' + err.message);
    res.style.display = 'block';
    res.className = 'generic-result show err';
    res.textContent = err.message;
  }

  btn.disabled = false;
  btn.textContent = 'Run';
}

async function runGeneric(epId, pathBase, paramKeys) {

  function el(id) { return document.getElementById(id); }

  function setStatus(cls, msg) {
    var stat = el('gstat-' + epId);
    if (!stat) return;
    stat.style.display = 'flex';
    stat.className = 'run-status ' + cls;
    stat.textContent = msg;
    if (cls === 'ok' || cls === 'fail') {
      var copyBtn = document.createElement('button');
      copyBtn.className = 'copy-result-btn';
      copyBtn.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2H3.5A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5"/></svg>Copy';
      copyBtn.onclick = function() {
        var r = el('gres-' + epId);
        if (!r || !r.textContent) return;
        navigator.clipboard.writeText(r.textContent).then(function() {
          copyBtn.textContent = '✓ Copied';
          copyBtn.classList.add('copied');
          setTimeout(function() {
            copyBtn.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2H3.5A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5"/></svg>Copy';
            copyBtn.classList.remove('copied');
          }, 1800);
        });
      };
      stat.appendChild(copyBtn);
    }
  }

  function showResult(text, isErr) {
    var res = el('gres-' + epId);
    if (!res) return;
    res.style.display = 'block';
    res.className = 'generic-result show' + (isErr ? ' err' : '');
    res.textContent = text;
  }

  var url = 'https://api.lumi-base.my.id' + pathBase;
  if (paramKeys && paramKeys.length) {
    var pairs = [];
    for (var i = 0; i < paramKeys.length; i++) {
      var k = paramKeys[i];
      var inp = el('gf-' + epId + '-' + k);
      pairs.push(k + '=' + encodeURIComponent(inp ? inp.value.trim() : ''));
    }
    url += '?' + pairs.join('&');
  }

  var btn = el('gbtn-' + epId);
  var res = el('gres-' + epId);
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="ldots"><span></span><span></span><span></span></span>'; }
  setStatus('loading', 'Fetching...');
  if (res) { res.style.display = 'none'; res.textContent = ''; }

  try {
    var r = await fetch(url, { cache: 'no-store', headers: { 'Accept': 'application/json' } });
    var raw = await r.text();
    try {
      var json = JSON.parse(raw);
      setStatus(r.ok ? 'ok' : 'fail',
        r.ok ? '✓ ' + r.status + ' OK' + (json.total != null ? ' — ' + json.total + ' hasil' : '')
              : '✖ HTTP ' + r.status + (json.message ? ' — ' + json.message : ''));
      showResult(JSON.stringify(json, null, 2), !r.ok);
    } catch(e) {
      setStatus(r.ok ? 'ok' : 'fail', r.ok ? '✓ ' + r.status : '✖ HTTP ' + r.status);
      showResult(raw.slice(0, 1000), !r.ok);
    }
  } catch(err) {
    setStatus('fail', '✖ ' + err.message);
    showResult(err.message, true);
  }

  var btn2 = el('gbtn-' + epId);
  if (btn2) { btn2.disabled = false; btn2.textContent = 'Run'; }
}



document.getElementById('global-modal-backdrop').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && _modalOpen) closeModal();
});

document.querySelectorAll('.tdot').forEach(function(dot) {
  dot.addEventListener('click', function() {
    var theme = dot.dataset.theme;
    document.documentElement.dataset.theme = theme;
    document.querySelectorAll('.tdot').forEach(function(d) { d.classList.remove('active'); });
    dot.classList.add('active');
    localStorage.setItem('lb-theme', theme);
  });
});

(function() {
  var saved = localStorage.getItem('lb-theme');
  if (saved) {
    document.documentElement.dataset.theme = saved;
    document.querySelectorAll('.tdot').forEach(function(d) {
      d.classList.toggle('active', d.dataset.theme === saved);
    });
  }
})();

loadSettings();

(function() {
  var canvas, ctx, particles, animId, active = false;
  var W, H, scrollY = 0, targetScroll = 0;
  var COUNT = 120;

  function Particle(init) {
    this.x  = (Math.random() - 0.5) * 2;
    this.y  = (Math.random() - 0.5) * 2;
    this.z  = init ? Math.random() : 1;
    this.vx = (Math.random() - 0.5) * 0.0008;
    this.vy = (Math.random() - 0.5) * 0.0008;
    this.vz = -(0.002 + Math.random() * 0.003);
    this.hue = 240 + Math.random() * 60;
    this.size = 0.5 + Math.random() * 1.5;
  }

  function resetP(p) {
    p.x  = (Math.random() - 0.5) * 2;
    p.y  = (Math.random() - 0.5) * 2;
    p.z  = 1;
    p.vx = (Math.random() - 0.5) * 0.0008;
    p.vy = (Math.random() - 0.5) * 0.0008;
    p.vz = -(0.002 + Math.random() * 0.003);
    p.hue  = 240 + Math.random() * 60;
    p.size = 0.5 + Math.random() * 1.5;
  }

  function project(p, zoom) {
    var fov = 1.2 + zoom;
    var z = Math.max(p.z, 0.01);
    var sc = fov / z;
    return { sx: (p.x * sc + 1) * W / 2, sy: (p.y * sc + 1) * H / 2, sc: sc, a: Math.min(1, (1 - p.z) * 1.4) };
  }

  function draw() {
    if (!active) return;
    animId = requestAnimationFrame(draw);
    scrollY += (targetScroll - scrollY) * 0.06;
    var zoom = scrollY * 0.0008;

    ctx.clearRect(0, 0, W, H);
    var grad = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, Math.max(W, H) * 0.75);
    grad.addColorStop(0, 'rgba(20,10,40,.65)');
    grad.addColorStop(1, 'rgba(5,5,15,.98)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    for (var i = 0; i < particles.length; i++) {
      var pi = project(particles[i], zoom);
      for (var j = i + 1; j < particles.length; j++) {
        var pj = project(particles[j], zoom);
        var dx = pi.sx - pj.sx, dy = pi.sy - pj.sy;
        var dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 85) {
          ctx.strokeStyle = 'rgba(124,58,237,' + (0.15 * (1 - dist/85) * pi.a * pj.a) + ')';
          ctx.lineWidth = 0.4;
          ctx.beginPath(); ctx.moveTo(pi.sx, pi.sy); ctx.lineTo(pj.sx, pj.sy); ctx.stroke();
        }
      }
    }

    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      p.x += p.vx; p.y += p.vy; p.z += p.vz;
      if (p.z <= 0 || p.z > 1) { resetP(p); continue; }
      var pr = project(p, zoom);
      if (pr.sx < -60 || pr.sx > W+60 || pr.sy < -60 || pr.sy > H+60) { resetP(p); continue; }

      var r = p.size * pr.sc * 0.5;
      var grd = ctx.createRadialGradient(pr.sx, pr.sy, 0, pr.sx, pr.sy, r * 3.5);
      grd.addColorStop(0, 'hsla(' + p.hue + ',90%,72%,' + pr.a + ')');
      grd.addColorStop(0.4, 'hsla(' + p.hue + ',80%,60%,' + (pr.a * 0.35) + ')');
      grd.addColorStop(1, 'transparent');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(pr.sx, pr.sy, r * 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'hsla(' + p.hue + ',100%,88%,' + Math.min(1, pr.a * 1.6) + ')';
      ctx.beginPath(); ctx.arc(pr.sx, pr.sy, Math.max(0.6, r * 0.45), 0, Math.PI * 2); ctx.fill();
    }
  }

  function resize() { if (canvas) { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; } }

  function scrollHandler() { targetScroll = window.scrollY; }

  function init() {
    canvas = document.getElementById('threed-canvas');
    if (!canvas || active) return;
    ctx = canvas.getContext('2d');
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
    particles = [];
    for (var i = 0; i < COUNT; i++) particles.push(new Particle(true));
    window.addEventListener('resize', resize);
    window.addEventListener('scroll', scrollHandler);
    active = true;
    draw();
  }

  function destroy() {
    active = false;
    if (animId) cancelAnimationFrame(animId);
    window.removeEventListener('resize', resize);
    window.removeEventListener('scroll', scrollHandler);
    if (canvas && ctx) ctx.clearRect(0, 0, W, H);
  }

  var observer = new MutationObserver(function(muts) {
    muts.forEach(function(m) {
      if (m.attributeName === 'data-theme') {
        if (document.documentElement.dataset.theme === 'threed') { init(); }
        else { destroy(); }
      }
    });
  });
  observer.observe(document.documentElement, { attributes: true });

  if (document.documentElement.dataset.theme === 'threed') init();
})();
