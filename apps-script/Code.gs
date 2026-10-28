/**
 * 晚餐分享 — Google Apps Script 後端
 *
 * 使用方式：在 Google 試算表選「擴充功能 → Apps Script」，把本檔全部內容貼到 Code.gs，
 * 修改下方 LEADER_PASSWORD，再「部署 → 新增部署作業 → 網頁應用程式」。詳見 SETUP.md。
 *
 * 本檔同時被網站的「展示模式」直接載入執行（api.js），所以最上層不可呼叫任何
 * Apps Script 服務（SpreadsheetApp 等只能寫在函式裡）。
 */

// ★ 小組長密碼：只改 Apps Script 裡那一份，GitHub 上的這份保持原樣（GitHub 是公開的）
var LEADER_PASSWORD = '請改成你的密碼';
var PASSWORD_PLACEHOLDER = '請改成你的密碼';

var SCHEMA = {
  people:   ['id', 'name', 'role', 'active', 'createdAt'],
  sessions: ['id', 'date', 'title', 'verse', 'questions', 'attendees', 'published', 'hidden', 'current', 'createdAt'],
  answers:  ['sessionId', 'personId', 'answers', 'updatedAt', 'token']
};
var JSON_FIELDS = { questions: 1, attendees: 1, published: 1, hidden: 1, answers: 1 };
var BOOL_FIELDS = { active: 1, current: 1 };

// 第一次使用時自動建立的聚會（啟發4）
var DEFAULT_TEMPLATE = {
  title: '啟發4 如何得著信心',
  verse: '看哪，我站在門外叩門，若有聽見我聲音就開門的，我要進到他那裡去，我與他，他與我一同坐席。（啟示錄 3:20）',
  questions: [
    {
      id: 'q1', text: '你做過最勇敢的事是什麼？', max: 2,
      options: ['跟喜歡的人告白', '一個人出國，或到陌生的城市生活', '換工作、轉換跑道或創業',
        '高空彈跳、潛水、滑翔傘之類的挑戰', '在很多人面前演講或表演', '為別人挺身而出，說出真話',
        '撐過病痛、手術或人生低潮', '主動道歉，或原諒傷害過我的人', '好像還沒有，還在等那一刻',
        '每天好好活著，就挺勇敢的']
    },
    {
      id: 'q2', text: '對於「和神建立關係」這個說法，你有什麼想法？', max: 2,
      options: ['很難想像，神真的會想認識我嗎？', '好像有可能，但不知道從哪裡開始',
        '神比較像遙遠的存在，不太跟人互動', '我比較相信看得見、有證據的東西',
        '聽起來很溫暖，像朋友或家人一樣', '我已經和神有關係，正在經歷中',
        '我想多了解聖經怎麼說', '以前沒想過這個問題']
    },
    {
      id: 'q3', text: '你對信靠上帝有什麼感想？', max: 2,
      options: ['想信靠，但怕失去對人生的掌控', '我習慣靠自己，不太依靠別人', '遇到困難時，會想向神求助',
        '像坐椅子一樣，要先坐下去才知道撐不撐得住', '需要更多證據，才能放心信靠',
        '看到別人生命改變，讓我很好奇', '我曾經經歷過神的幫助或信實', '我願意試著禱告看看']
    },
    {
      id: 'next', text: '今晚之後，我的下一步', max: 0, leaderOnly: true,
      options: ['想再來參加下次聚會', '想多認識耶穌和聖經', '希望有人為我禱告', '想自己讀讀聖經看看',
        '今晚我跟著做了決志禱告', '先這樣就好，謝謝']
    }
  ]
};

/* ---------------- 主要邏輯（與儲存方式無關） ---------------- */

function handle_(action, p, store) {
  p = p || {};
  try {
    var fn = PUBLIC_[action];
    if (fn) return ok_(fn(p, store));
    fn = ADMIN_[action];
    if (!fn) throw new Error('未知的操作：' + action);
    checkPassword_(p.pw, store);
    var res = fn(p, store);
    // 每次往返 Apps Script 都要一兩秒，所以寫入後直接附上最新後台資料，省掉前端再問一次
    if (action !== 'admin') res.admin = ADMIN_.admin({ sessionId: res.id || p.viewId }, store);   // 新建聚會時直接顯示新的那場
    return ok_(res);
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
}

var PUBLIC_ = {
  state: function (p, store) {
    return { version: store.getVersion() };
  },
  current: function (p, store) {
    ensureSeed_(store);
    var s = currentSession_(store);
    return { session: s ? publicView_(s, store) : null, version: store.getVersion() };
  },
  myAnswer: function (p, store) {
    var a = store.read('answers').filter(function (r) {
      return r.sessionId === p.sessionId && r.personId === p.personId;
    })[0];
    // 只有當初作答的那支手機（持有 token）讀得到，避免別人點你的名字偷看
    var mine = a && a.token && a.token === p.token;
    return { answers: mine ? a.answers : null, taken: !!a && !mine };
  },
  submit: function (p, store) {
    return store.lock(function () {
      var s = currentSession_(store);
      if (!s || s.id !== p.sessionId) throw new Error('這場聚會已結束，請重新整理頁面');
      if (s.attendees.indexOf(p.personId) < 0) throw new Error('名單上找不到你，請告訴小組長');
      var clean = sanitizeAnswers_(s, p.answers || {});
      var rows = store.read('answers');
      var row = rows.filter(function (r) { return r.sessionId === s.id && r.personId === p.personId; })[0];
      if (!row) { row = { sessionId: s.id, personId: p.personId, token: uid_() + uid_() }; rows.push(row); }
      else if (row.token && row.token !== p.token) throw new Error('這個名字已經有人作答了。如果是你本人，請用原本那支手機；或請小組長協助');
      if (!row.token) row.token = uid_() + uid_();   // 組長解除鎖定後，由新手機接手
      row.answers = clean;
      row.updatedAt = new Date().toISOString();
      store.write('answers', rows);
      store.bump();
      return { saved: true, token: row.token, session: publicView_(s, store), version: store.getVersion() };
    });
  }
};

var ADMIN_ = {
  login: function () { return { loggedIn: true }; },

  admin: function (p, store) {
    ensureSeed_(store);
    var people = store.read('people');
    var sessions = store.read('sessions');
    var answers = store.read('answers');
    var cur = sessions.filter(function (s) { return s.current; })[0];
    var sel = sessions.filter(function (s) { return s.id === p.sessionId; })[0] || cur || sessions[sessions.length - 1];
    var list = sessions.map(function (s) {
      return {
        id: s.id, date: s.date, title: s.title, current: s.current, attendeeCount: s.attendees.length,
        answeredCount: answers.filter(function (a) { return a.sessionId === s.id && hasContent_(a.answers); }).length
      };
    }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    return {
      people: people, sessions: list, version: store.getVersion(),
      session: sel ? adminView_(sel, store, people, answers) : null
    };
  },

  savePerson: function (p, store) {
    return store.lock(function () {
      var name = String(p.name || '').trim();
      if (!name) throw new Error('請輸入名字');
      var people = store.read('people');
      var person = p.id ? people.filter(function (x) { return x.id === p.id; })[0] : null;
      var isNew = !person;
      if (!person) {
        person = { id: uid_(), active: true, createdAt: new Date().toISOString() };
        people.push(person);
      }
      person.name = name.slice(0, 30);
      person.role = p.role === '新朋友' ? '新朋友' : '組員';
      if (p.active !== undefined) person.active = !!p.active;
      store.write('people', people);
      // 新增的人預設加入本次聚會（否則作答頁看不到名字）；addToSession: false 表示不要
      var target = p.addToSession || (isNew && p.addToSession !== false ? 'current' : null);
      if (target) {
        var sessions = store.read('sessions');
        var s = sessions.filter(function (x) { return target === 'current' ? x.current : x.id === target; })[0];
        if (s && s.attendees.indexOf(person.id) < 0) { s.attendees.push(person.id); store.write('sessions', sessions); }
      }
      store.bump();
      return { person: person };
    });
  },

  saveSession: function (p, store) {
    return store.lock(function () {
      var input = p.session || {};
      var sessions = store.read('sessions');
      var s = input.id ? sessions.filter(function (x) { return x.id === input.id; })[0] : null;
      if (!s) {
        s = { id: uid_(), published: [], hidden: [], current: false, createdAt: new Date().toISOString() };
        sessions.push(s);
      }
      s.date = String(input.date || '').slice(0, 10);
      s.title = String(input.title || '').trim().slice(0, 60) || '未命名的聚會';
      s.verse = String(input.verse || '').trim().slice(0, 300);
      s.questions = cleanQuestions_(input.questions || []);
      s.attendees = (input.attendees || []).map(String);
      var qids = s.questions.map(function (q) { return q.id; });
      s.published = s.published.filter(function (id) { return qids.indexOf(id) >= 0; });
      if (input.makeCurrent || sessions.length === 1) setCurrentIn_(sessions, s.id);
      store.write('sessions', sessions);
      store.bump();
      return { id: s.id };
    });
  },

  setCurrent: function (p, store) {
    return store.lock(function () {
      var sessions = store.read('sessions');
      setCurrentIn_(sessions, p.id);
      store.write('sessions', sessions);
      store.bump();
      return {};
    });
  },

  setPublished: function (p, store) {
    return updateSession_(store, p.id, function (s) {
      s.published = s.published.filter(function (id) { return id !== p.qid; });
      var q = s.questions.filter(function (x) { return x.id === p.qid; })[0];
      if (p.on && q && !q.leaderOnly) s.published.push(p.qid);   // 陣列順序＝公開順序
    });
  },

  setHidden: function (p, store) {
    return updateSession_(store, p.id, function (s) {
      s.hidden = s.hidden.filter(function (k) { return k !== p.key; });
      if (p.on) s.hidden.push(p.key);
    });
  },

  // 有人換手機或清了瀏覽器資料時，讓他可以重新作答（保留原答案）
  unlockAnswer: function (p, store) {
    return store.lock(function () {
      var rows = store.read('answers');
      rows.forEach(function (r) { if (r.sessionId === p.sessionId && r.personId === p.personId) r.token = ''; });
      store.write('answers', rows);
      return {};
    });
  },

  deleteSession: function (p, store) {
    return store.lock(function () {
      var sessions = store.read('sessions').filter(function (s) { return s.id !== p.id; });
      store.write('sessions', sessions);
      store.write('answers', store.read('answers').filter(function (a) { return a.sessionId !== p.id; }));
      store.bump();
      return {};
    });
  }
};

function ok_(data) { data.ok = true; return data; }

function checkPassword_(pw, store) {
  var real = store.password || LEADER_PASSWORD;
  if (real === PASSWORD_PLACEHOLDER) throw new Error('尚未設定密碼：請在 Apps Script 的 Code.gs 修改 LEADER_PASSWORD 並重新部署');
  if (String(pw || '') !== real) throw new Error('密碼不正確');
}

function uid_() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function currentSession_(store) {
  return store.read('sessions').filter(function (s) { return s.current; })[0] || null;
}

function setCurrentIn_(sessions, id) {
  sessions.forEach(function (s) { s.current = s.id === id; });
}

function updateSession_(store, id, mutate) {
  return store.lock(function () {
    var sessions = store.read('sessions');
    var s = sessions.filter(function (x) { return x.id === id; })[0];
    if (!s) throw new Error('找不到這場聚會');
    mutate(s);
    store.write('sessions', sessions);
    store.bump();
    return {};
  });
}

function ensureSeed_(store) {
  if (store.read('sessions').length) return;
  store.lock(function () {
    var sessions = store.read('sessions');
    if (sessions.length) return;
    var people = store.read('people').filter(function (x) { return x.active; });
    sessions.push({
      id: uid_(), date: todayStr_(), title: DEFAULT_TEMPLATE.title, verse: DEFAULT_TEMPLATE.verse,
      questions: JSON.parse(JSON.stringify(DEFAULT_TEMPLATE.questions)),
      attendees: people.map(function (x) { return x.id; }),
      published: [], hidden: [], current: true, createdAt: new Date().toISOString()
    });
    store.write('sessions', sessions);
    store.bump();
  });
}

function todayStr_() {
  var d = new Date(Date.now() + 8 * 3600 * 1000);   // 台灣時間
  return d.toISOString().slice(0, 10);
}

function cleanQuestions_(qs) {
  var seen = {};
  return qs.map(function (q, i) {
    var id = String(q.id || '') || ('q' + uid_());
    if (seen[id]) id = 'q' + uid_();
    seen[id] = 1;
    var opts = (q.options || []).map(function (o) { return String(o).trim().slice(0, 80); })
      .filter(function (o, j, arr) { return o && arr.indexOf(o) === j; });
    return {
      id: id, text: String(q.text || '').trim().slice(0, 200) || ('第 ' + (i + 1) + ' 題'),
      options: opts, max: Math.max(0, Math.min(10, parseInt(q.max, 10) || 0)), leaderOnly: !!q.leaderOnly
    };
  });
}

function sanitizeAnswers_(s, raw) {
  var out = {};
  s.questions.forEach(function (q) {
    var r = raw[q.id];
    if (!r) return;
    var choices = (r.choices || []).map(String).filter(function (c, i, arr) {
      return q.options.indexOf(c) >= 0 && arr.indexOf(c) === i;
    });
    if (q.max) choices = choices.slice(0, q.max);
    out[q.id] = {
      choices: choices,
      other: String(r.other || '').trim().slice(0, 300),
      note: String(r.note || '').trim().slice(0, 500)
    };
  });
  return out;
}

function hasContent_(ans) {
  if (!ans) return false;
  return Object.keys(ans).some(function (k) {
    var r = ans[k];
    return r && ((r.choices && r.choices.length) || r.other || r.note);
  });
}

function indexBy_(rows) {
  var m = {};
  rows.forEach(function (r) { m[r.id] = r; });
  return m;
}

// 統計一題：各選項人數＋「其他」與「想多說」文字
function aggregate_(q, answers, people) {
  var counts = {};
  q.options.forEach(function (o) { counts[o] = 0; });
  var other = 0, respondents = 0, texts = [];
  answers.forEach(function (a) {
    var r = a.answers && a.answers[q.id];
    if (!r) return;
    var any = false;
    (r.choices || []).forEach(function (c) { counts[c] = (counts[c] || 0) + 1; any = true; });
    var person = people[a.personId] || {};
    if (r.other) {
      other++; any = true;
      texts.push({ kind: 'other', text: r.other, key: a.personId + ':' + q.id + ':other', name: person.name || '', role: person.role || '' });
    }
    if (r.note) {
      any = true;
      texts.push({ kind: 'note', text: r.note, key: a.personId + ':' + q.id + ':note', name: person.name || '', role: person.role || '' });
    }
    if (any) respondents++;
  });
  return {
    options: Object.keys(counts).map(function (k) { return { label: k, n: counts[k] }; }),
    other: other, respondents: respondents, texts: texts
  };
}

function hash_(str) {
  var h = 2166136261;
  for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h * 16777619) >>> 0; }
  return h;
}

// 給組員與投影畫面：只有已公開的題目才有結果，而且不含姓名
function publicView_(s, store) {
  var people = indexBy_(store.read('people'));
  var answers = store.read('answers').filter(function (a) { return a.sessionId === s.id; });
  var results = {};
  s.published.forEach(function (qid) {
    var q = s.questions.filter(function (x) { return x.id === qid; })[0];
    if (!q || q.leaderOnly) return;
    var agg = aggregate_(q, answers, people);
    agg.texts = agg.texts
      .filter(function (t) { return s.hidden.indexOf(t.key) < 0; })
      .sort(function (a, b) { return hash_(a.key + s.id) - hash_(b.key + s.id); })   // 打亂順序，避免從先後猜出是誰
      .map(function (t) { return { kind: t.kind, text: t.text }; });
    results[qid] = agg;
  });
  return {
    id: s.id, date: s.date, title: s.title, verse: s.verse, questions: s.questions, published: s.published,
    attendees: s.attendees.map(function (id) { return people[id]; }).filter(Boolean)
      .map(function (x) { return { id: x.id, name: x.name, role: x.role }; }),
    answeredIds: answers.filter(function (a) { return hasContent_(a.answers); }).map(function (a) { return a.personId; }),
    results: results
  };
}

// 給小組長：所有題目、含姓名與隱藏狀態
function adminView_(s, store, peopleRows, allAnswers) {
  var people = indexBy_(peopleRows);
  var answers = allAnswers.filter(function (a) { return a.sessionId === s.id; });
  var results = {};
  s.questions.forEach(function (q) {
    var agg = aggregate_(q, answers, people);
    agg.texts.forEach(function (t) { t.hidden = s.hidden.indexOf(t.key) >= 0; });
    results[q.id] = agg;
  });
  return {
    id: s.id, date: s.date, title: s.title, verse: s.verse, current: s.current, questions: s.questions,
    attendees: s.attendees, published: s.published, hidden: s.hidden, results: results,
    answers: answers.map(function (a) {
      var person = people[a.personId] || {};
      return { personId: a.personId, name: person.name || '（已刪除）', role: person.role || '', answers: a.answers, updatedAt: a.updatedAt };
    })
  };
}

/* ---------------- Google 試算表儲存層 ---------------- */

function sheetStore_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var cache = {};
  function sheetOf(name) {
    var sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      sh.getRange(1, 1, 1, SCHEMA[name].length).setValues([SCHEMA[name]]).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
    return sh;
  }
  return {
    read: function (name) {
      if (cache[name]) return JSON.parse(JSON.stringify(cache[name]));
      // 先找快取，省下讀試算表的時間；手動改試算表最多 5 分鐘後生效
      var hit = CacheService.getScriptCache().get('tbl:' + name);
      if (hit) { cache[name] = JSON.parse(hit); return JSON.parse(hit); }
      var cols = SCHEMA[name];
      var values = sheetOf(name).getDataRange().getValues().slice(1);
      var rows = values.filter(function (v) { return v[0] !== ''; }).map(function (v) {
        var o = {};
        cols.forEach(function (c, i) {
          var x = v[i];
          if (JSON_FIELDS[c]) { try { x = x === '' ? (c === 'answers' ? {} : []) : JSON.parse(x); } catch (e) { x = []; } }
          else if (BOOL_FIELDS[c]) x = x === true || String(x).toUpperCase() === 'TRUE';
          else x = String(x);
          o[c] = x;
        });
        return o;
      });
      cache[name] = rows;
      putTable_(name, rows);
      return JSON.parse(JSON.stringify(rows));
    },
    write: function (name, rows) {
      var cols = SCHEMA[name];
      var sh = sheetOf(name);
      var data = rows.map(function (o) {
        return cols.map(function (c) {
          var x = o[c];
          if (JSON_FIELDS[c]) return JSON.stringify(x == null ? [] : x);
          if (BOOL_FIELDS[c]) return x ? 'TRUE' : 'FALSE';
          return x == null ? '' : String(x);
        });
      });
      var last = sh.getLastRow();
      if (last > 1) sh.getRange(2, 1, last - 1, cols.length).clearContent();
      if (data.length) sh.getRange(2, 1, data.length, cols.length).setNumberFormat('@').setValues(data);
      cache[name] = JSON.parse(JSON.stringify(rows));
      putTable_(name, rows);
    },
    getVersion: function () {
      var v = CacheService.getScriptCache().get('version');
      if (v === null) {
        v = PropertiesService.getScriptProperties().getProperty('version') || '0';
        CacheService.getScriptCache().put('version', v, 21600);
      }
      return Number(v);
    },
    bump: function () {
      var v = String(Date.now());
      PropertiesService.getScriptProperties().setProperty('version', v);
      CacheService.getScriptCache().put('version', v, 21600);
    },
    lock: function (fn) {
      var lock = LockService.getScriptLock();
      lock.waitLock(20000);
      try { cache = {}; return fn(); } finally { lock.releaseLock(); }
    }
  };
}

function putTable_(name, rows) {
  var json = JSON.stringify(rows);
  var c = CacheService.getScriptCache();
  if (json.length < 90000) c.put('tbl:' + name, json, 300); else c.remove('tbl:' + name);   // 快取單筆上限約 100KB
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) { /* 交給 handle_ 回報錯誤 */ }
  var result = handle_(body.action, body.params, sheetStore_());
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return ContentService.createTextOutput('晚餐分享後端運作中').setMimeType(ContentService.MimeType.TEXT);
}

// 部署前可在編輯器手動執行一次，建立三張工作表並授權
function setup() {
  var store = sheetStore_();
  Object.keys(SCHEMA).forEach(function (name) { store.read(name); });
  ensureSeed_(store);
}
