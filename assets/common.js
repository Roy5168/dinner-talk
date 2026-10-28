// 三個頁面共用的小工具
(function () {
  // h('div.card', {onclick: fn}, child, ...)：建立元素
  function h(tag, attrs) {
    var parts = tag.split('.');
    var el = document.createElement(parts[0] || 'div');
    if (parts.length > 1) el.className = parts.slice(1).join(' ');
    var kids = Array.prototype.slice.call(arguments, 2);
    // 第二個參數不是屬性物件時當成子元素（包含數字 0，不能用 truthy 判斷）
    if (attrs != null && (typeof attrs !== 'object' || attrs.nodeType || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className += (el.className ? ' ' : '') + v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k in el && k !== 'list') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    });
    append(el, kids);
    return el;
  }
  function append(el, kids) {
    kids.forEach(function (k) {
      if (k == null || k === false) return;
      if (Array.isArray(k)) return append(el, k);
      el.appendChild(k.nodeType ? k : document.createTextNode(String(k)));
    });
  }

  var toastEl, toastTimer;
  function toast(msg, isErr) {
    if (!toastEl) { toastEl = h('div.toast'); document.body.appendChild(toastEl); }
    toastEl.textContent = msg;
    toastEl.classList.toggle('err', !!isErr);
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, isErr ? 4200 : 2200);
  }

  // 定時檢查版本號，有變動才抓完整資料（省 Apps Script 配額）
  function poll(onChange, interval) {
    var last = null, timer = null, stopped = false;
    function tick() {
      API.call('state').then(function (r) {
        if (r.version !== last) { last = r.version; return onChange(); }
      }).catch(function (err) {
        // 第一次就連不上時，讓頁面自己抓一次，好把錯誤顯示出來而不是一直停在「載入中」
        if (last === null) return onChange();
      })
        .then(function () {
          if (!stopped) timer = setTimeout(tick, document.hidden ? interval * 3 : interval);
        });
    }
    tick();
    return {
      refresh: function () { clearTimeout(timer); last = null; tick(); },
      stop: function () { stopped = true; clearTimeout(timer); }
    };
  }

  function fmtDate(d) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || '');
    if (!m) return d || '';
    var w = '日一二三四五六'[new Date(+m[1], m[2] - 1, +m[3]).getDay()];
    return (+m[2]) + ' 月 ' + (+m[3]) + ' 日（' + w + '）';
  }

  function memberUrl() {
    var u = new URL('./', location.href);
    if (API.demo && new URLSearchParams(location.search).has('demo')) u.search = '?demo';
    return u.href;
  }

  // 晚餐桌插圖：蠟燭、兩碗冒煙的飯、茶杯
  function scene() {
    var svg = '<svg class="scene" viewBox="0 0 360 150" role="img" aria-label="晚餐桌上的蠟燭與碗">' +
      '<defs><radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffd58a" stop-opacity=".75"/><stop offset="1" stop-color="#ffd58a" stop-opacity="0"/></radialGradient></defs>' +
      '<ellipse cx="180" cy="62" rx="70" ry="52" fill="url(#glow)"/>' +
      '<rect x="18" y="118" width="324" height="8" rx="4" fill="#8b5a3c"/>' +
      '<rect x="40" y="126" width="10" height="20" rx="3" fill="#6f4529"/><rect x="310" y="126" width="10" height="20" rx="3" fill="#6f4529"/>' +
      '<rect x="168" y="62" width="24" height="56" rx="5" fill="#fff4de" stroke="#e7cfa6"/>' +
      '<path d="M180 62 v-6" stroke="#5e3a25" stroke-width="2"/>' +
      '<path class="flame" d="M180 30 C 188 42, 187 52, 180 56 C 173 52, 172 42, 180 30 Z" fill="#f2a93b"/>' +
      '<path class="flame" d="M180 40 C 184 46, 184 51, 180 54 C 176 51, 176 46, 180 40 Z" fill="#ffe08a"/>' +
      '<g class="steam" fill="none" stroke="#c9b49c" stroke-width="2" stroke-linecap="round">' +
      '<path d="M84 84 q-6 -8 0 -16 q6 -8 0 -16"/><path d="M98 86 q-6 -8 0 -16 q6 -8 0 -16"/><path d="M262 84 q-6 -8 0 -16 q6 -8 0 -16"/></g>' +
      '<path d="M60 96 h64 a32 22 0 0 1 -64 0 z" fill="#d98a3a"/><ellipse cx="92" cy="96" rx="32" ry="5" fill="#f6e7cf"/>' +
      '<path d="M236 96 h64 a32 22 0 0 1 -64 0 z" fill="#6d7b4b"/><ellipse cx="268" cy="96" rx="32" ry="5" fill="#f6e7cf"/>' +
      '<rect x="128" y="96" width="22" height="22" rx="4" fill="#b9573a"/><path d="M150 102 q8 0 8 6 q0 6 -8 6" fill="none" stroke="#b9573a" stroke-width="3"/>' +
      '<path d="M206 118 l18 -36" stroke="#8b5a3c" stroke-width="2.5" stroke-linecap="round"/><path d="M213 118 l16 -34" stroke="#8b5a3c" stroke-width="2.5" stroke-linecap="round"/>' +
      '</svg>';
    var d = document.createElement('div');
    d.innerHTML = svg;
    return d.firstChild;
  }

  // 一題的統計長條＋文字分享。opts.admin=true 時顯示姓名與隱藏按鈕
  function renderResult(q, agg, opts) {
    opts = opts || {};
    var total = Math.max(1, agg.respondents);
    var rows = agg.options.slice();
    if (agg.other) rows.push({ label: '其他（自己說）', n: agg.other });
    if (opts.sort) rows.sort(function (a, b) { return b.n - a.n; });
    var bars = h('div.bars', rows.map(function (r) {
      return h('div.bar-row' + (r.n ? '' : '.zero'),
        h('div.label', h('span', r.label), h('b', r.n + ' 人')),
        h('div.bar-track', h('div.bar-fill', { style: 'width:' + Math.round(r.n / total * 100) + '%' })));
    }));
    var texts = agg.texts || [];
    var quotes = texts.length ? h('div.quotes', texts.map(function (t) {
      var who = null;
      if (opts.admin) {
        who = h('div.who',
          h('span', t.name + (t.role === '新朋友' ? '（新朋友）' : '') + ' · ' + (t.kind === 'note' ? '想多說' : '其他')),
          opts.onHide && !q.leaderOnly ? h('button.btn.ghost.small', { onclick: function () { opts.onHide(t); } }, t.hidden ? '取消隱藏' : '不要公開') : null);
      } else if (t.kind === 'note') {
        who = h('div.who', h('span', '想多說一點'));
      }
      return h('div.quote' + (t.kind === 'note' ? '.note' : '') + (t.hidden ? '.is-hidden' : ''), h('div', t.text), who);
    })) : null;
    return h('div', h('p.faint', '共 ' + agg.respondents + ' 人回答'), bars, quotes);
  }

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function demoBanner(extra) {
    if (!API.demo) return null;
    return h('div.banner', h('span', '展示模式：資料只存在這台裝置的瀏覽器，尚未連上 Google 試算表。'), extra || null);
  }

  window.UI = { h: h, toast: toast, poll: poll, fmtDate: fmtDate, memberUrl: memberUrl, scene: scene, renderResult: renderResult, esc: esc, demoBanner: demoBanner };
})();
