// 與後端溝通。正式模式呼叫 Google Apps Script；展示模式直接在瀏覽器執行同一份 Code.gs，資料存在 localStorage。
(function () {
  var cfg = window.APP_CONFIG || {};
  var qs = new URLSearchParams(location.search);
  var demo = !cfg.API_URL || qs.has('demo');
  var DEMO_KEY = 'dinnertalk-demo-v1';
  var handle = null;

  function demoData() {
    var raw = null;
    try { raw = localStorage.getItem(DEMO_KEY); } catch (e) { /* 無痕模式等 */ }
    if (raw) return JSON.parse(raw);
    var now = new Date().toISOString();
    var names = [['雅婷', '組員'], ['志明', '組員'], ['佳蓉', '組員'], ['冠宇', '組員'], ['阿凱', '新朋友'], ['Amy', '新朋友']];
    return {
      version: 1,
      people: names.map(function (n, i) { return { id: 'demo' + i, name: n[0], role: n[1], active: true, createdAt: now }; }),
      sessions: [], answers: []
    };
  }
  var memory = null;
  function load() { memory = memory || demoData(); return memory; }
  function save() {
    try { localStorage.setItem(DEMO_KEY, JSON.stringify(memory)); } catch (e) { /* 存不了就只留在記憶體 */ }
  }
  // 其他分頁（模擬其他人的手機）寫入時同步
  window.addEventListener('storage', function (e) { if (e.key === DEMO_KEY) memory = null; });

  var demoStore = {
    password: '1234',
    read: function (name) { return JSON.parse(JSON.stringify(load()[name])); },
    write: function (name, rows) { load()[name] = JSON.parse(JSON.stringify(rows)); save(); },
    getVersion: function () { return load().version; },
    bump: function () { load().version++; save(); },
    lock: function (fn) { memory = null; return fn(); }
  };

  function loadHandler() {
    if (handle) return Promise.resolve(handle);
    return fetch('apps-script/Code.gs', { cache: 'no-store' }).then(function (r) { return r.text(); }).then(function (src) {
      handle = new Function(src + '\n;return handle_;')();
      return handle;
    }).catch(function () {
      // 直接雙擊開檔（file://）時瀏覽器禁止 fetch 本機檔案，改用 <script> 載入
      return new Promise(function (resolve, reject) {
        var tag = document.createElement('script');
        tag.src = 'apps-script/Code.gs';
        tag.onload = function () { handle = window.handle_; resolve(handle); };
        tag.onerror = function () { reject(new Error('載入展示程式失敗')); };
        document.head.appendChild(tag);
      });
    });
  }

  function call(action, params) {
    var p;
    if (demo) {
      p = loadHandler().then(function (h) {
        memory = null;
        return JSON.parse(JSON.stringify(h(action, params || {}, demoStore)));
      });
    } else {
      // 不設定任何自訂 header，避免觸發 Apps Script 無法回應的 CORS 預檢
      p = fetch(cfg.API_URL, { method: 'POST', body: JSON.stringify({ action: action, params: params || {} }) })
        .then(function (r) { return r.json(); });
    }
    return p.then(function (res) {
      if (!res || !res.ok) throw new Error((res && res.error) || '連線失敗');
      return res;
    });
  }

  // 展示模式專用：替還沒作答的人隨機填答，方便預覽統計畫面
  function demoFill() {
    return call('current').then(function (res) {
      var s = res.session;
      if (!s) return;
      var samples = ['小時候第一次自己搭公車去外婆家', '辭職去澳洲打工度假一年', '想知道禱告真的有人聽嗎？',
        '我覺得要先認識才談得上信任', '最近工作很累，有點想找個依靠', '朋友信主後變了很多，讓我好奇'];
      var jobs = s.attendees.filter(function (a) { return s.answeredIds.indexOf(a.id) < 0; }).map(function (a, i) {
        var answers = {};
        s.questions.forEach(function (q, j) {
          var pick = q.options.slice().sort(function () { return Math.random() - 0.5; }).slice(0, 1 + (Math.random() < 0.4 ? 1 : 0));
          answers[q.id] = { choices: pick, other: (i + j) % 4 === 0 ? samples[(i + j) % samples.length] : '', note: (i + j) % 5 === 2 ? samples[(i * 2 + j) % samples.length] : '' };
        });
        return function () { return call('submit', { sessionId: s.id, personId: a.id, answers: answers }); };
      });
      return jobs.reduce(function (p, job) { return p.then(job); }, Promise.resolve());
    });
  }

  function demoReset() {
    try { localStorage.removeItem(DEMO_KEY); } catch (e) { /* 忽略 */ }
    memory = null;
  }

  window.API = { call: call, demo: demo, demoFill: demoFill, demoReset: demoReset };
})();
