/* Аккаунты, лента, личные сообщения и модерация на Firebase (Auth + Firestore). */
(function () {
  'use strict';

  var CFG = window.FIREBASE_CONFIG || {};
  var MOD_EMAIL = String(window.MOD_EMAIL || 'tamshop.ru@gmail.com').toLowerCase();

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function noop() {}
  function linkify(node, text) {
    var re = /https?:\/\/[^\s<>"']+/g, last = 0, m;
    text = String(text);
    while ((m = re.exec(text))) {
      var url = m[0].replace(/[.,;:!?)\]]+$/, '');
      if (m.index > last) node.appendChild(document.createTextNode(text.slice(last, m.index)));
      var a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer nofollow'; a.textContent = url; node.appendChild(a);
      last = m.index + url.length; re.lastIndex = last;
    }
    if (last < text.length) node.appendChild(document.createTextNode(text.slice(last)));
    return node;
  }
  var BASE_TITLE = document.title.replace(/^\(\d+\)\s*/, '');

  /* ---------- запрещённые слова (только для постов, комментариев и имён; личные сообщения не проверяются) ---------- */
  var LAT = { a: 'а', b: 'в', c: 'с', e: 'е', h: 'н', k: 'к', m: 'м', o: 'о', p: 'р', t: 'т', x: 'х', y: 'у', u: 'и', i: 'и', r: 'р', w: 'ш', '0': 'о', '3': 'з', '6': 'б', '@': 'а', '$': 'с' };
  var RU_BAD = [
    /хуй|хуе|хуя|хуи|хую|хуё/, /пизд|пзд[еёц]/, /бляд|^(вы|на|по|за|с|об)?бля(т|ть|ти)?$/, /^(на|за|вы|съ|с|по|до|от|у|о|об|раз|рас|под|пере|при|недо)?[её]б(а|ы|у|и|е|ё|л|н|о|к|т)/,
    /муда[кч]|мудил|мудозвон/, /гандон|гондон/, /залуп/, /^(на|по|за)?хер(а|у|ом|е|ня|ню|и|ов|овый|овина)?$/, /пидор|пидар|пидр|педик|педераст/,
    /шлюх|шалав|проститутк/, /^дроч/, /говн|говён/, /^сук(а|и|у|е|ой|ам|ами|ах|ин|ины)$/, /ублюд/, /сволоч/, /^мраз(ь|и|ей|ота|отой)$/,
    /^твар(ь|и|ей|ям|ью)$/, /^идиот/, /^дебил/, /^кретин/, /^тупиц/, /придур/, /имбецил/, /^урод(ы|а|у|ом|ина|ки)?$/, /^ничтожеств/, /^скотин/, /^быдл/,
    /^гнид/, /^падл/, /^чмо$/, /^лох(и|а|у|ом|ов)?$/, /^жид(ы|ов|ам|ами|ах)?$/, /^чурк/, /^чурбан/, /черножоп/, /^хач(и|ей|ам|ами)?$/, /нигг?ер/, /^нигга/, /^пошел(на)?нах/, /^иди(на)?нах/, /^отсос/, /^сос(и|ать)$/
  ];
  var EN_BAD = /^(fuck\w*|f+u+c+k+\w*|shit\w*|bitch\w*|cunt\w*|asshole\w*|nigg\w+|faggot\w*|whore\w*|slut\w*|bastard\w*|retard\w*|motherfuck\w*|dickhead\w*|wanker\w*|blya[td]\w*|pizd\w*|suka|ebat\w*|ebal\w*|huy\w*|hui|nahui|pidor\w*|pidar\w*)$/;
  function collapse(s) { return s.replace(/(.)\1+/g, '$1'); }
  function hasBadWord(text) {
    var low = String(text || '').toLowerCase().replace(/ё/g, 'е');
    var tokens = low.split(/\s+/).filter(Boolean), cand = [], run = [];
    function flush() { if (run.length >= 3) cand.push(run.join('')); run = []; }
    tokens.forEach(function (t) {
      var core = t.replace(/[^a-zа-я0-9@$]/g, '');
      if (!core) return;
      cand.push(core);
      if (core.length === 1) run.push(core); else flush();
    });
    flush();
    /* слитное написание без пробелов: "п.и.з.д.а" -> пизда уже учтено выше через удаление знаков */
    for (var i = 0; i < cand.length; i++) {
      var w = cand[i], ru = w.replace(/[a-z0-9@$]/g, function (ch) { return LAT[ch] || ch; });
      var en = w.replace(/[103@$]/g, function (ch) { return { '1': 'i', '0': 'o', '3': 'e', '@': 'a', '$': 's' }[ch]; });
      var forms = [w, collapse(w), en, collapse(en), ru, collapse(ru)];
      for (var j = 0; j < forms.length; j++) {
        var f = forms[j].replace(/ё/g, 'е');
        if (EN_BAD.test(f)) return true;
        for (var k = 0; k < RU_BAD.length; k++) if (RU_BAD[k].test(f) || RU_BAD[k].test(f.replace(/е/g, 'ё'))) return true;
      }
    }
    return false;
  }
  var BAD_MSG = 'В тексте есть запрещённые слова: мат или оскорбления. Уберите их и попробуйте снова.';
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  var cfgFilled = !!(CFG.apiKey && CFG.projectId && String(CFG.apiKey).indexOf('ВСТАВЬТЕ') !== 0 && String(CFG.projectId).indexOf('ВСТАВЬТЕ') !== 0);
  var configured = !!(window.firebase && cfgFilled);
  var notConfMsg = cfgFilled
    ? 'Не загрузились скрипты Firebase. Проверьте интернет, отключите блокировщик рекламы и обновите страницу.'
    : 'Сайт ещё не подключён к Firebase: откройте firebase-config.js и вставьте настройки проекта (шаги в README.md).';
  var auth = null, db = null, FV = null;
  if (configured) {
    try { firebase.initializeApp(CFG); auth = firebase.auth(); db = firebase.firestore(); FV = firebase.firestore.FieldValue; }
    catch (e) { configured = false; }
  }

  var me = null;
  var S = { users: {}, verified: {}, banned: {}, posts: [], likes: [], comments: [], msgs: [], reports: [], subs: [],
    tab: 'feed', sub: 'new', saved: {}, feedLimit: 20, lastPost: 0, peer: null, open: {}, drafts: {}, seen: {}, reported: {}, dirty: false, modTried: false, dbErr: false, reportsOn: false };

  function toMs(t) { return t && t.toMillis ? t.toMillis() : (typeof t === 'number' ? t : Date.now()); }
  function when(ts) {
    var d = Date.now() - ts;
    if (d > -60000 && d < 60000) return 'только что';
    if (d >= 60000 && d < 3600000) return Math.floor(d / 60000) + ' мин назад';
    return new Date(ts).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  function mailOk() { return !!(me && me.emailVerified); }
  function isMod() { return !!(me && me.emailVerified && me.email && me.email.toLowerCase() === MOD_EMAIL); }
  function isVer(id) { return !!S.verified[id]; }
  function isBanned(id) { return !!S.banned[id]; }
  function nameOf(id) { var u = S.users[id]; return (u && u.name) || (me && id === me.uid && me.displayName) || 'Участник'; }

  function badge() {
    var s = el('span', 'vbadge'); s.setAttribute('role', 'img'); s.setAttribute('aria-label', 'Подтверждённый аккаунт'); s.title = 'Подтверждённый аккаунт';
    s.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#1d9bf0" d="M12 1.6l2.6 1.9 3.2-.2 1.1 3 2.6 1.9-1 3.1 1 3.1-2.6 1.9-1.1 3-3.2-.2L12 22.4l-2.6-1.9-3.2.2-1.1-3L2.5 15.8l1-3.1-1-3.1 2.6-1.9 1.1-3 3.2.2z"/><path fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M7.6 12.4l3 3 5.8-6.3"/></svg>';
    return s;
  }
  function avatar(id, big) {
    var n = nameOf(id).trim(), h = 0, i;
    for (i = 0; i < String(id).length; i++) h = (h * 31 + String(id).charCodeAt(i)) % 360;
    var s = el('span', 'av' + (big ? ' big' : ''), (n.charAt(0) || '?').toUpperCase());
    s.style.background = 'hsl(' + h + ',45%,38%)'; s.setAttribute('aria-hidden', 'true');
    return s;
  }
  function whoEl(id) {
    var w = el('span', 'who'); w.appendChild(avatar(id)); var nb = el('button', 'namebtn', nameOf(id)); nb.type = 'button'; nb.title = 'Открыть профиль';
    nb.addEventListener('click', function () { openProfile(id); }); w.appendChild(nb);
    if (isVer(id)) w.appendChild(badge());
    return w;
  }
  function sureClick(btn, label, fn) {
    var armed = false, orig = btn.textContent;
    btn.addEventListener('click', function () {
      if (!armed) { armed = true; btn.textContent = label; setTimeout(function () { armed = false; btn.textContent = orig; }, 3000); return; }
      fn();
    });
  }
  function authMsg(e) {
    var m = {
      'auth/email-already-in-use': 'Эта почта уже зарегистрирована. Нажмите «Войти».',
      'auth/invalid-email': 'Проверьте почту: нужен адрес вида name@mail.ru.',
      'auth/weak-password': 'Пароль слишком простой. Нужно минимум 8 символов.',
      'auth/password-does-not-meet-requirements': 'Пароль не подходит под требования проекта Firebase (например, нужны заглавная буква и цифра).',
      'auth/invalid-credential': 'Неверная почта или пароль.',
      'auth/wrong-password': 'Неверная почта или пароль.',
      'auth/user-not-found': 'Неверная почта или пароль.',
      'auth/too-many-requests': 'Слишком много попыток. Подождите немного и повторите.',
      'auth/network-request-failed': 'Нет связи с сервером. Проверьте интернет и отключите VPN или блокировщик.',
      'auth/operation-not-allowed': 'В Firebase не включён вход по почте и паролю: Authentication -> Способ входа -> Электронная почта/пароль -> Включить.',
      'auth/unauthorized-domain': 'Адрес сайта не добавлен в Firebase: Authentication -> Настройки -> Авторизованные домены -> добавьте ВАШ_ЛОГИН.github.io.',
      'auth/invalid-api-key': 'Неверный apiKey в firebase-config.js. Скопируйте настройки из консоли Firebase заново.',
      'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'Неверный apiKey в firebase-config.js. Скопируйте настройки из консоли Firebase заново.',
      'auth/configuration-not-found': 'В проекте Firebase не запущена служба Authentication: откройте Authentication и нажмите «Начать».',
      'auth/operation-not-supported-in-this-environment': 'Сайт открыт как файл с компьютера. Откройте его по адресу https:// (через GitHub Pages).',
      'auth/internal-error': 'Внутренняя ошибка Firebase. Проверьте настройки проекта и повторите.'
    };
    var code = (e && e.code) || '';
    return (m[code] || 'Не получилось зарегистрироваться или войти.') + (code ? ' (' + code + ')' : (e && e.message ? ' (' + e.message + ')' : ''));
  }
  function dbMsg(e, fallback) {
    if (e && e.code === 'permission-denied') return 'Нет прав на это действие. Подтвердите почту или проверьте, что вы не заблокированы.';
    return fallback;
  }

  /* ---------- диалоги ---------- */
  var overlay = $('overlay'), dialog = $('dialog'), lastFocus = null;
  function show(html) {
    dialog.innerHTML = html; overlay.hidden = false;
    var sh = $('f-show');
    if (sh) sh.addEventListener('change', function () {
      ['f-pw', 'f-pw2'].forEach(function (id) { var i = $(id); if (i) i.type = sh.checked ? 'text' : 'password'; });
    });
    var f = dialog.querySelector('input, button'); if (f) f.focus();
  }
  function close() { overlay.hidden = true; dialog.innerHTML = ''; if (lastFocus && lastFocus.focus) lastFocus.focus(); }
  overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !overlay.hidden) close(); });

  function openNotConfigured() {
    show('<h2 id="dlg-title">Сайт ещё не подключён к базе</h2><p id="d-msg"></p><div class="row"><button type="button" id="d-close" class="primary">Понятно</button></div>');
    $('d-msg').textContent = notConfMsg + ' Шаги описаны в файле README.md.';
    $('d-close').onclick = close;
  }
  function openRegister() {
    show('<h2 id="dlg-title">Создать аккаунт</h2><form id="reg" novalidate>' +
      '<label for="f-name">Имя<input id="f-name" maxlength="24" autocomplete="nickname"></label>' +
      '<label for="f-email">Почта<input id="f-email" type="email" autocomplete="email"></label>' +
      '<label for="f-pw">Пароль, не короче 8 символов<input id="f-pw" type="password" autocomplete="new-password"></label>' +
      '<label for="f-pw2">Повторите пароль<input id="f-pw2" type="password" autocomplete="new-password"></label>' +
      '<label class="chk" for="f-show"><input id="f-show" type="checkbox"> Показать пароль</label>' +
      '<p class="err" id="d-err" role="alert"></p>' +
      '<div class="row"><button type="button" id="d-close">Отмена</button><button type="submit" id="d-ok" class="primary">Зарегистрироваться</button></div></form>');
    $('d-close').onclick = close;
    $('reg').addEventListener('submit', async function (e) {
      e.preventDefault();
      var name = $('f-name').value.trim(), email = $('f-email').value.trim(), pw = $('f-pw').value, pw2 = $('f-pw2').value, err = $('d-err');
      err.textContent = '';
      if (name.length < 2) { err.textContent = 'Введите имя, минимум 2 символа.'; return; }
      if (hasBadWord(name)) { err.textContent = BAD_MSG; return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err.textContent = 'Проверьте почту: нужен адрес вида name@mail.ru.'; return; }
      if (pw.length < 8) { err.textContent = 'Пароль должен быть не короче 8 символов.'; return; }
      if (pw !== pw2) { err.textContent = 'Пароли не совпадают.'; return; }
      $('d-ok').disabled = true; $('d-ok').textContent = 'Создаю…';
      try {
        var cred = await auth.createUserWithEmailAndPassword(email, pw);
        try { await cred.user.updateProfile({ displayName: name }); } catch (x) {}
        try { await db.collection('users').doc(cred.user.uid).set({ name: name, createdAt: FV.serverTimestamp() }); } catch (x) { onErr(x); }
        try { await cred.user.sendEmailVerification(); } catch (x) {}
        me = auth.currentUser;
        openVerifyInfo(true);
      } catch (ex) {
        err.textContent = authMsg(ex);
        $('d-ok').disabled = false; $('d-ok').textContent = 'Зарегистрироваться';
      }
    });
  }
  function openLogin() {
    show('<h2 id="dlg-title">Вход</h2><form id="login" novalidate>' +
      '<label for="f-email">Почта<input id="f-email" type="email" autocomplete="email"></label>' +
      '<label for="f-pw">Пароль<input id="f-pw" type="password" autocomplete="current-password"></label>' +
      '<label class="chk" for="f-show"><input id="f-show" type="checkbox"> Показать пароль</label>' +
      '<p class="err" id="d-err" role="alert"></p>' +
      '<div class="row"><button type="button" id="d-close">Отмена</button><button type="submit" id="d-ok" class="primary">Войти</button></div>' +
      '<button type="button" class="linkbtn" id="d-forgot">Забыли пароль?</button></form>');
    $('d-close').onclick = close;
    $('d-forgot').onclick = async function () {
      var email = $('f-email').value.trim(), err = $('d-err');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err.textContent = 'Введите почту, и мы пришлём письмо для сброса пароля.'; return; }
      try { await auth.sendPasswordResetEmail(email); err.style.color = 'var(--muted)'; err.textContent = 'Если такой аккаунт есть, письмо уже отправлено.'; }
      catch (ex) { err.style.color = ''; err.textContent = authMsg(ex); }
    };
    $('login').addEventListener('submit', async function (e) {
      e.preventDefault();
      var email = $('f-email').value.trim(), pw = $('f-pw').value, err = $('d-err'); err.style.color = ''; err.textContent = '';
      if (!email || !pw) { err.textContent = 'Введите почту и пароль.'; return; }
      $('d-ok').disabled = true;
      try { await auth.signInWithEmailAndPassword(email, pw); close(); }
      catch (ex) { err.textContent = authMsg(ex); $('d-ok').disabled = false; }
    });
  }
  async function refreshUser() {
    if (!auth.currentUser) return;
    try { await auth.currentUser.reload(); await auth.currentUser.getIdToken(true); } catch (e) {}
    me = auth.currentUser; afterAuth();
  }
  function openVerifyInfo(justCreated) {
    show('<h2 id="dlg-title">' + (justCreated ? 'Аккаунт создан' : 'Подтвердите почту') + '</h2><p id="d-msg"></p><p class="err" id="d-err" role="alert"></p>' +
      '<div class="row"><button type="button" id="d-resend">Отправить письмо ещё раз</button><button type="button" id="d-check" class="primary">Я подтвердил(а)</button></div>' +
      '<div class="row"><button type="button" id="d-close">Закрыть</button></div>');
    $('d-msg').textContent = 'Мы отправили письмо на ' + (me && me.email) + '. Перейдите по ссылке из письма (проверьте «Спам»), затем нажмите «Я подтвердил(а)». Пока почта не подтверждена, писать посты и сообщения нельзя.';
    $('d-close').onclick = close;
    $('d-resend').onclick = async function () {
      try { await me.sendEmailVerification(); $('d-err').style.color = 'var(--muted)'; $('d-err').textContent = 'Письмо отправлено.'; }
      catch (ex) { $('d-err').style.color = ''; $('d-err').textContent = authMsg(ex); }
    };
    $('d-check').onclick = async function () {
      await refreshUser();
      if (mailOk()) close(); else { $('d-err').style.color = ''; $('d-err').textContent = 'Почта пока не подтверждена. Откройте ссылку из письма и повторите.'; }
    };
  }
  function openAccount() {
    show('<h2 id="dlg-title">Ваш аккаунт</h2><div class="who" id="d-who"></div><p id="d-note"></p>' +
      '<div class="row"><button type="button" id="d-close">Закрыть</button><button type="button" id="d-out" class="primary">Выйти</button></div>');
    var who = $('d-who'); who.appendChild(el('span', null, nameOf(me.uid))); if (isVer(me.uid)) who.appendChild(badge());
    var note = me.email + (isMod() ? '. Вы модератор.' : '.');
    if (!mailOk()) note += ' Почта не подтверждена.';
    $('d-note').textContent = note;
    $('d-close').onclick = close;
    $('d-out').onclick = async function () { try { await auth.signOut(); } catch (e) {} close(); };
    if (!mailOk()) { var b = el('button', 'linkbtn', 'Подтвердить почту'); b.type = 'button'; b.onclick = function () { openVerifyInfo(false); }; dialog.insertBefore(b, dialog.lastElementChild); }
  }

  $('btn-register').addEventListener('click', function () {
    lastFocus = this;
    if (!configured) openNotConfigured(); else if (me) openAccount(); else openRegister();
  });
  $('btn-login').addEventListener('click', function () {
    lastFocus = this;
    if (!configured) openNotConfigured(); else if (me) openAccount(); else openLogin();
  });

  function setStatus() {
    var st = $('auth-status'); st.textContent = '';
    if (!configured) st.textContent = 'Сайт ещё не подключён к базе. Лента и аккаунты заработают после настройки.';
    else if (!me) st.textContent = 'Вы не вошли. Зарегистрируйтесь или войдите, чтобы читать ленту и писать сообщения.';
    else {
      st.appendChild(el('span', null, 'Вы вошли как ' + nameOf(me.uid)));
      if (isVer(me.uid)) st.appendChild(badge());
      if (!mailOk()) st.appendChild(el('span', null, '· подтвердите почту'));
    }
  }

  /* ---------- данные ---------- */
  function onErr(e) {
    if (S.dbErr) return; S.dbErr = true;
    var box = $('setup'); box.hidden = false;
    box.textContent = 'Нет доступа к базе данных' + (e && e.code ? ' (' + e.code + ')' : '') + '. Проверьте, что в Firebase создан Firestore и опубликованы правила из файла firestore.rules (подробности в README.md).';
    if (window.console) console.error(e);
  }
  function stopSubs() { S.subs.forEach(function (u) { try { u(); } catch (e) {} }); S.subs = []; S.users = {}; S.verified = {}; S.banned = {}; S.posts = []; S.likes = []; S.comments = []; S.msgs = []; S.reports = []; S.peer = null; S.modTried = false; S.reportsOn = false; document.title = BASE_TITLE; }
  function startSubs() {
    var uid = me.uid, est = { serverTimestamps: 'estimate' };
    S.saved = lsGet('saved-' + uid, {});
    if (!postText.value) { postText.value = lsGet('draft-' + uid, ''); $('post-left').textContent = 500 - postText.value.length; }
    S.seen = lsGet('seen-' + uid, {}); S.reported = lsGet('rep-' + uid, {});
    S.subs.push(db.collection('users').onSnapshot(function (s) {
      S.users = {}; s.forEach(function (d) { var x = d.data(est); S.users[d.id] = { name: x.name, ts: x.createdAt ? toMs(x.createdAt) : 0 }; }); renderAll();
    }, onErr));
    S.subs.push(db.collection('verified').onSnapshot(function (s) {
      S.verified = {}; s.forEach(function (d) { S.verified[d.id] = 1; });
      if (isMod() && !S.verified[uid] && !S.modTried) { S.modTried = true; db.collection('verified').doc(uid).set({ ts: FV.serverTimestamp() }).catch(noop); }
      renderAll();
    }, onErr));
    S.subs.push(db.collection('banned').onSnapshot(function (s) {
      S.banned = {}; s.forEach(function (d) { S.banned[d.id] = 1; }); $('banned').hidden = !(me && S.banned[me.uid]); renderAll();
    }, onErr));
    S.subs.push(db.collection('posts').orderBy('ts', 'desc').limit(100).onSnapshot(function (s) {
      S.posts = []; s.forEach(function (d) { var x = d.data(est); S.posts.push({ id: d.id, uid: x.uid, text: x.text, ts: toMs(x.ts), edited: x.edited ? toMs(x.edited) : 0 }); }); renderFeed(); renderMod();
    }, onErr));
    S.subs.push(db.collection('likes').limit(3000).onSnapshot(function (s) {
      S.likes = []; s.forEach(function (d) { var x = d.data(); S.likes.push({ id: d.id, pid: x.pid, uid: x.uid }); }); renderFeed();
    }, onErr));
    S.subs.push(db.collection('comments').orderBy('ts', 'desc').limit(500).onSnapshot(function (s) {
      S.comments = []; s.forEach(function (d) { var x = d.data(est); S.comments.push({ id: d.id, pid: x.pid, uid: x.uid, text: x.text, ts: toMs(x.ts) }); }); renderFeed(); renderMod();
    }, onErr));
    S.subs.push(db.collection('messages').where('participants', 'array-contains', uid).limit(500).onSnapshot(function (s) {
      S.msgs = []; s.forEach(function (d) { var x = d.data(est); S.msgs.push({ id: d.id, from: x.from, to: x.to, text: x.text, ts: toMs(x.ts) }); });
      renderThread(); updateBadges();
    }, onErr));
    if (isMod()) {
      S.reportsOn = true;
      S.subs.push(db.collection('reports').limit(500).onSnapshot(function (s) {
        S.reports = []; s.forEach(function (d) { var x = d.data(); S.reports.push({ id: d.id, pid: x.pid, postUid: x.postUid, reporter: x.reporter, reason: x.reason }); }); renderMod();
      }, onErr));
    }
  }
  async function ensureProfile() {
    try {
      var r = db.collection('users').doc(me.uid), s = await r.get();
      if (!s.exists) {
        var n = String(me.displayName || (me.email || 'user').split('@')[0]).slice(0, 24); if (n.length < 2) n += '_';
        await r.set({ name: n, createdAt: FV.serverTimestamp() });
      }
    } catch (e) {}
  }

  var started = false;
  function afterAuth() {
    var on = !!(configured && me);
    $('community').hidden = !on; $('comm-lock').hidden = on;
    if (on && !started) { started = true; startSubs(); ensureProfile(); }
    if (!on && started) { started = false; stopSubs(); }
    if (on && started && isMod() && !S.reportsOn) { stopSubs(); startSubs(); } /* модератор подтвердил почту после входа */
    $('banned').hidden = !(on && me && isBanned(me.uid));
    setStatus(); renderAll();
  }
  if (configured) {
    auth.onAuthStateChanged(function (u) { me = u; afterAuth(); });
  } else {
    afterAuth();
    var box = $('setup'); box.hidden = false;
    box.textContent = notConfMsg + ' До этого работает только видео-интро.';
  }
  if (location.protocol === 'file:') {
    var fb = $('setup'); fb.hidden = false;
    fb.textContent = 'Страница открыта как файл с компьютера, поэтому вход и база не работают. Выложите сайт на GitHub Pages и откройте его по адресу https://...';
  }

  /* ---------- список аккаунтов ---------- */
  var listEl = $('acc-list'), countEl = $('acc-count'), accQ = $('acc-search');
  accQ.addEventListener('input', renderAccounts);
  function renderAccounts() {
    if (!listEl) return;
    listEl.textContent = '';
    if (!configured || !me) {
      accQ.hidden = true;
      listEl.appendChild(el('li', 'empty', configured ? 'Список аккаунтов виден после входа.' : 'Список аккаунтов появится после настройки сайта.')); countEl.textContent = ''; return;
    }
    accQ.hidden = false;
    var q = accQ.value.trim().toLowerCase();
    var ids = Object.keys(S.users).filter(function (id) { return !q || nameOf(id).toLowerCase().indexOf(q) !== -1; });
    ids.sort(function (a, b) { return (S.users[b].ts || 0) - (S.users[a].ts || 0); });
    ids = ids.slice(0, 5);
    countEl.textContent = q ? '· найдено' : '· последние 5';
    if (!ids.length) listEl.appendChild(el('li', 'empty', q ? 'Никого не найдено.' : 'Пока нет аккаунтов.'));
    ids.forEach(function (id) {
      var li = el('li'), nm = el('span', 'nm'), nbt = el('button', 'namebtn', nameOf(id)); nbt.type = 'button'; nbt.onclick = function () { openProfile(id); }; nm.appendChild(nbt); li.appendChild(nm);
      if (isVer(id)) li.appendChild(badge());
      if (isBanned(id)) li.appendChild(el('span', 'tag', 'заблокирован'));
      if (isMod()) {
        var vb = el('button', 'mini', isVer(id) ? 'Снять галочку' : 'Дать галочку'); vb.type = 'button';
        vb.onclick = function () { (isVer(id) ? db.collection('verified').doc(id).delete() : db.collection('verified').doc(id).set({ ts: FV.serverTimestamp() })).catch(noop); };
        li.appendChild(vb);
        if (id !== me.uid) {
          var bb = el('button', 'mini', isBanned(id) ? 'Разблокировать' : 'Заблокировать'); bb.type = 'button';
          bb.onclick = function () { (isBanned(id) ? db.collection('banned').doc(id).delete() : db.collection('banned').doc(id).set({ ts: FV.serverTimestamp() })).catch(noop); };
          li.appendChild(bb);
        }
      }
      listEl.appendChild(li);
    });
  }

  /* ---------- вкладки ---------- */
  function setTab(t) {
    S.tab = t;
    Array.prototype.forEach.call($('tabs').querySelectorAll('button'), function (b) { b.setAttribute('aria-selected', b.getAttribute('data-tab') === t ? 'true' : 'false'); });
    $('pane-feed').hidden = t !== 'feed'; $('pane-dm').hidden = t !== 'dm'; $('pane-mod').hidden = t !== 'mod'; $('pane-profile').hidden = t !== 'profile';
    if (t === 'profile') { renderProfileTab(); if (me) $('name-input').value = nameOf(me.uid); }
    if (t === 'dm') markSeen();
  }
  $('tabs').addEventListener('click', function (e) { var b = e.target.closest ? e.target.closest('button[data-tab]') : null; if (b) setTab(b.getAttribute('data-tab')); });

  /* ---------- лента ---------- */
  $('feed-search').addEventListener('input', function () { S.feedLimit = 20; renderFeed(); });
  $('feed-tabs').addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button[data-sub]') : null; if (!b) return;
    S.sub = b.getAttribute('data-sub'); S.feedLimit = 20;
    Array.prototype.forEach.call($('feed-tabs').querySelectorAll('button'), function (x) { x.setAttribute('aria-selected', x === b ? 'true' : 'false'); });
    S.dirty = false; renderFeed();
  });
  var postText = $('post-text');
  postText.addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !$('post-btn').disabled) { e.preventDefault(); $('post-btn').click(); } });
  postText.addEventListener('input', function () { $('post-left').textContent = 500 - postText.value.length; if (me) lsSet('draft-' + me.uid, postText.value); });
  function canPost() { return mailOk() && !isBanned(me.uid); }
  function composerState() {
    var note = $('verify-note'), can = !!me && canPost();
    if (!me) { note.hidden = true; return; }
    note.hidden = can;
    if (!mailOk()) note.textContent = 'Подтвердите почту, чтобы писать посты, ставить лайки и отправлять сообщения.';
    else if (isBanned(me.uid)) note.textContent = 'Ваш аккаунт заблокирован модератором.';
    $('post-btn').disabled = !can; postText.disabled = !can;
  }
  $('post-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    var err = $('post-err'), text = postText.value.trim(); err.textContent = '';
    if (!text) { err.textContent = 'Напишите текст поста.'; return; }
    if (hasBadWord(text)) { err.textContent = BAD_MSG; return; }
    var wait = 10000 - (Date.now() - (S.lastPost || 0));
    if (wait > 0) { err.textContent = 'Подождите ' + Math.ceil(wait / 1000) + ' сек. перед следующим постом.'; return; }
    if (S.posts.some(function (p) { return p.uid === me.uid && p.text === text && Date.now() - p.ts < 3600000; })) { err.textContent = 'Такой пост вы уже публиковали.'; return; }
    $('post-btn').disabled = true;
    try {
      await db.collection('posts').add({ uid: me.uid, text: text, ts: FV.serverTimestamp() });
      S.lastPost = Date.now(); postText.value = ''; $('post-left').textContent = '500'; lsSet('draft-' + me.uid, '');
    } catch (ex) { err.textContent = dbMsg(ex, 'Не удалось опубликовать. Попробуйте ещё раз.'); }
    composerState();
  });
  function likeId(pid) { return pid + '_' + me.uid; }
  async function toggleLike(pid) {
    var mine = S.likes.some(function (l) { return l.id === likeId(pid); });
    try {
      var ref = db.collection('likes').doc(likeId(pid));
      if (mine) await ref.delete(); else await ref.set({ pid: pid, uid: me.uid, ts: FV.serverTimestamp() });
    } catch (e) { $('post-err').textContent = dbMsg(e, 'Не удалось поставить лайк.'); }
  }
  async function deletePost(p) {
    try {
      var b = db.batch();
      if (isMod()) {
        S.comments.forEach(function (c) { if (c.pid === p.id) b.delete(db.collection('comments').doc(c.id)); });
        S.reports.forEach(function (r) { if (r.pid === p.id) b.delete(db.collection('reports').doc(r.id)); });
      }
      b.delete(db.collection('posts').doc(p.id));
      await b.commit();
    } catch (e) { $('post-err').textContent = dbMsg(e, 'Не удалось удалить пост.'); }
  }
  async function sendReport(p, reason) {
    await db.collection('reports').doc(p.id + '_' + me.uid).set({ pid: p.id, postUid: p.uid, reporter: me.uid, reason: reason, ts: FV.serverTimestamp() });
    S.reported[p.id] = 1; lsSet('rep-' + me.uid, S.reported);
  }
  function commentsFor(pid) { return S.comments.filter(function (c) { return c.pid === pid; }).sort(function (a, b) { return a.ts - b.ts; }); }
  function commentPanel(p) {
    var box = el('div', 'cm');
    commentsFor(p.id).forEach(function (c) {
      var row = el('div', 'c'), h = el('div', 'head'); h.appendChild(whoEl(c.uid)); h.appendChild(el('span', 'cmuted', when(c.ts)));
      if (c.uid === me.uid || isMod()) {
        var d = el('button', 'cbtn danger', 'Удалить'); d.type = 'button'; d.style.cssText = 'min-height:28px;padding:2px 10px;font-size:12px';
        sureClick(d, 'Точно?', function () { db.collection('comments').doc(c.id).delete().catch(function (e) { $('post-err').textContent = dbMsg(e, 'Не удалось удалить комментарий.'); }); });
        h.appendChild(d);
      }
      row.appendChild(h); row.appendChild(el('p', null, c.text)); box.appendChild(row);
    });
    if (canPost()) {
      var f = el('form'), inp = el('input'); inp.type = 'text'; inp.maxLength = 300; inp.placeholder = 'Комментарий'; inp.setAttribute('aria-label', 'Комментарий');
      inp.value = S.drafts[p.id] || ''; inp.addEventListener('input', function () { S.drafts[p.id] = inp.value; });
      var ok = el('button', 'cbtn primary', 'Отправить'); ok.type = 'submit'; f.appendChild(inp); f.appendChild(ok);
      f.addEventListener('submit', async function (e) {
        e.preventDefault(); var t = inp.value.trim(); if (!t) return;
        if (hasBadWord(t)) { $('post-err').textContent = BAD_MSG; return; }
        ok.disabled = true;
        try { await db.collection('comments').add({ pid: p.id, uid: me.uid, text: t, ts: FV.serverTimestamp() }); S.drafts[p.id] = ''; inp.value = ''; }
        catch (ex) { $('post-err').textContent = dbMsg(ex, 'Не удалось отправить комментарий.'); }
        ok.disabled = false;
      });
      box.appendChild(f);
    }
    return box;
  }
  $('feed').addEventListener('focusout', function () { if (S.dirty) { S.dirty = false; setTimeout(renderFeed, 0); } });
  function openEdit(card, acts, p) {
    acts.hidden = true;
    var box = el('div', 'rep'), ta = el('textarea'); ta.maxLength = 500; ta.rows = 3; ta.value = p.text; ta.setAttribute('aria-label', 'Текст поста'); ta.style.width = '100%';
    var err = el('p', 'cerr'), ok = el('button', 'cbtn primary', 'Сохранить'), no = el('button', 'cbtn', 'Отмена'); ok.type = 'button'; no.type = 'button';
    no.onclick = function () { box.parentNode.removeChild(box); acts.hidden = false; if (S.dirty) { S.dirty = false; renderFeed(); } };
    ok.onclick = async function () {
      var t = ta.value.trim(); err.textContent = '';
      if (!t) { err.textContent = 'Текст не может быть пустым.'; return; }
      if (hasBadWord(t)) { err.textContent = BAD_MSG; return; }
      if (t === p.text) { no.onclick(); return; }
      ok.disabled = true;
      try { await db.collection('posts').doc(p.id).update({ text: t, edited: FV.serverTimestamp() }); S.dirty = false; }
      catch (e) { ok.disabled = false; err.textContent = dbMsg(e, 'Не удалось сохранить. Если вы только что обновили сайт, опубликуйте новые правила из firestore.rules.'); }
    };
    box.appendChild(ta); box.appendChild(ok); box.appendChild(no); box.appendChild(err); card.appendChild(box); ta.focus();
  }
  function openReport(card, acts, p) {
    acts.hidden = true;
    var rep = el('div', 'rep'), sel = el('select'); sel.setAttribute('aria-label', 'Причина жалобы');
    ['Спам', 'Оскорбления', 'Опасный контент', 'Другое'].forEach(function (r) { var o = el('option', null, r); o.value = r; sel.appendChild(o); });
    var ok = el('button', 'cbtn primary', 'Отправить'), no = el('button', 'cbtn', 'Отмена'); ok.type = 'button'; no.type = 'button';
    no.onclick = function () { rep.parentNode.removeChild(rep); acts.hidden = false; };
    ok.onclick = async function () {
      ok.disabled = true;
      try { await sendReport(p, sel.value); renderFeed(); }
      catch (e) { ok.disabled = false; $('post-err').textContent = dbMsg(e, 'Не удалось отправить жалобу.'); }
    };
    rep.appendChild(sel); rep.appendChild(ok); rep.appendChild(no); card.appendChild(rep);
  }
  function renderFeed() {
    var box = $('feed'); if (!me || !configured) return;
    composerState();
    var ae = document.activeElement;
    if (ae && box.contains(ae) && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName)) { S.dirty = true; return; }
    box.textContent = '';
    if (!S.posts.length) { box.appendChild(el('p', 'cmuted', 'Лента пуста. Напишите первый пост.')); return; }
    var counts = {}, mine = {};
    S.likes.forEach(function (l) { counts[l.pid] = (counts[l.pid] || 0) + 1; if (l.uid === me.uid) mine[l.pid] = 1; });
    var list = S.posts.slice();
    if (S.sub === 'popular') {
      list = list.filter(function (p) { return counts[p.id]; });
      list.sort(function (x, y) { return (counts[y.id] - counts[x.id]) || (y.ts - x.ts); });
      if (!list.length) { box.appendChild(el('p', 'cmuted', 'Пока нет постов с лайками.')); return; }
    } else if (S.sub === 'saved') {
      list = list.filter(function (p) { return S.saved[p.id]; }).sort(function (x, y) { return y.ts - x.ts; });
      if (!list.length) { box.appendChild(el('p', 'cmuted', 'Нет сохранённых постов. Нажмите «☆ Сохранить» под постом.')); return; }
    } else list.sort(function (x, y) { return y.ts - x.ts; });
    var fq = ($('feed-search').value || '').trim().toLowerCase();
    if (fq) {
      list = list.filter(function (p) { return p.text.toLowerCase().indexOf(fq) !== -1 || nameOf(p.uid).toLowerCase().indexOf(fq) !== -1; });
      if (!list.length) { box.appendChild(el('p', 'cmuted', 'Ничего не найдено.')); return; }
    }
    var total = list.length; list = list.slice(0, S.feedLimit);
    list.forEach(function (p) {
      var card = el('article', 'post'), head = el('div', 'head');
      head.appendChild(whoEl(p.uid)); head.appendChild(el('span', 'cmuted', when(p.ts) + (p.edited ? ' · изменено' : '')));
      card.appendChild(head); card.appendChild(linkify(el('p', 'body'), p.text));
      var acts = el('div', 'acts');
      var like = el('button', 'cbtn' + (mine[p.id] ? ' on' : ''), (mine[p.id] ? '♥ ' : '♡ ') + (counts[p.id] || 0));
      like.type = 'button'; like.setAttribute('aria-pressed', mine[p.id] ? 'true' : 'false'); like.setAttribute('aria-label', 'Нравится');
      like.disabled = !canPost();
      like.addEventListener('click', function () { toggleLike(p.id); }); acts.appendChild(like);
      var sv = el('button', 'cbtn' + (S.saved[p.id] ? ' on' : ''), S.saved[p.id] ? '★ Сохранено' : '☆ Сохранить'); sv.type = 'button'; sv.setAttribute('aria-pressed', S.saved[p.id] ? 'true' : 'false');
      sv.addEventListener('click', function () { if (S.saved[p.id]) delete S.saved[p.id]; else S.saved[p.id] = 1; lsSet('saved-' + me.uid, S.saved); renderFeed(); }); acts.appendChild(sv);
      var nc = commentsFor(p.id).length;
      var cb = el('button', 'cbtn' + (S.open[p.id] ? ' on' : ''), 'Комментарии' + (nc ? ' (' + nc + ')' : '')); cb.type = 'button'; cb.setAttribute('aria-expanded', S.open[p.id] ? 'true' : 'false');
      cb.addEventListener('click', function () { S.open[p.id] = !S.open[p.id]; renderFeed(); }); acts.appendChild(cb);
      if (p.uid !== me.uid && canPost()) {
        var rb = el('button', 'cbtn', S.reported[p.id] ? 'Жалоба отправлена' : 'Пожаловаться'); rb.type = 'button';
        if (S.reported[p.id]) rb.disabled = true;
        rb.addEventListener('click', function () { openReport(card, acts, p); }); acts.appendChild(rb);
      }
      if (p.uid === me.uid && canPost()) {
        var eb = el('button', 'cbtn', 'Изменить'); eb.type = 'button';
        eb.addEventListener('click', function () { openEdit(card, acts, p); }); acts.appendChild(eb);
      }
      if (p.uid === me.uid || isMod()) {
        var del = el('button', 'cbtn danger', 'Удалить'); del.type = 'button';
        sureClick(del, 'Точно удалить?', function () { deletePost(p); }); acts.appendChild(del);
      }
      card.appendChild(acts); if (S.open[p.id]) card.appendChild(commentPanel(p)); box.appendChild(card);
    });
    if (total > list.length) {
      var more = el('button', 'cbtn', 'Показать ещё (' + (total - list.length) + ')'); more.type = 'button';
      more.onclick = function () { S.feedLimit += 20; renderFeed(); }; box.appendChild(more);
    }
  }

  /* ---------- жалобы (модератор) ---------- */
  async function dismiss(pid) {
    try { var b = db.batch(); S.reports.forEach(function (r) { if (r.pid === pid) b.delete(db.collection('reports').doc(r.id)); }); await b.commit(); }
    catch (e) { $('post-err').textContent = dbMsg(e, 'Не удалось закрыть жалобы.'); }
  }
  function renderMod() {
    var tab = $('tab-mod'); tab.hidden = !(me && isMod());
    if (!me || !isMod()) { if (S.tab === 'mod') setTab('feed'); return; }
    var groups = {};
    S.reports.forEach(function (r) { (groups[r.pid] = groups[r.pid] || []).push(r); });
    var ids = Object.keys(groups);
    $('mod-count').textContent = ids.length ? '(' + ids.length + ')' : '';
    var box = $('reports'); box.textContent = '';
    if (!ids.length) { box.appendChild(el('p', 'cmuted', 'Жалоб нет.')); return; }
    ids.forEach(function (pid) {
      var g = groups[pid], authorId = g[0].postUid, post = S.posts.filter(function (p) { return p.id === pid; })[0];
      var card = el('div', 'rgroup'), head = el('div', 'head'); head.appendChild(whoEl(authorId));
      head.appendChild(el('span', 'cmuted', 'жалоб: ' + g.length)); card.appendChild(head);
      card.appendChild(post ? el('blockquote', null, post.text) : el('p', 'cmuted', 'Пост уже удалён.'));
      var why = {}; g.forEach(function (x) { why[x.reason] = 1; });
      card.appendChild(el('p', 'cmuted', 'Причины: ' + Object.keys(why).join(', ') + '. Жаловались: ' + g.map(function (x) { return nameOf(x.reporter); }).join(', ') + '.'));
      var acts = el('div', 'acts');
      if (post) { var d = el('button', 'cbtn danger', 'Удалить пост'); d.type = 'button'; d.onclick = function () { d.disabled = true; deletePost(post); }; acts.appendChild(d); }
      if (authorId && authorId !== me.uid && !isBanned(authorId)) {
        var bn = el('button', 'cbtn danger', 'Заблокировать автора'); bn.type = 'button';
        sureClick(bn, 'Точно заблокировать?', function () { db.collection('banned').doc(authorId).set({ ts: FV.serverTimestamp() }).catch(noop); }); acts.appendChild(bn);
      }
      var x = el('button', 'cbtn', post ? 'Отклонить жалобы' : 'Закрыть'); x.type = 'button'; x.onclick = function () { x.disabled = true; dismiss(pid); };
      acts.appendChild(x); card.appendChild(acts); box.appendChild(card);
    });
  }

  /* ---------- профиль ---------- */
  function profileBlock(id) {
    var box = el('div', 'prof'), u = S.users[id] || {};
    var w = el('div', 'who'); w.appendChild(avatar(id, true)); w.appendChild(el('span', null, nameOf(id))); if (isVer(id)) w.appendChild(badge()); box.appendChild(w);
    var mine = S.posts.filter(function (p) { return p.uid === id; }).sort(function (x, y) { return y.ts - x.ts; });
    var likes = 0; S.likes.forEach(function (l) { var pid = l.pid; if (mine.some(function (p) { return p.id === pid; })) likes++; });
    var st = el('div', 'stats');
    if (u.ts) st.appendChild(el('span', null, 'На сайте с ' + new Date(u.ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })));
    st.appendChild(el('span', null, 'Постов: ' + mine.length)); st.appendChild(el('span', null, 'Лайков: ' + likes));
    if (isBanned(id)) st.appendChild(el('span', 'tag', 'заблокирован'));
    box.appendChild(st);
    if (!mine.length) box.appendChild(el('p', 'cmuted', 'Постов пока нет.'));
    mine.slice(0, 10).forEach(function (p) { var d = el('div', 'pp', p.text); d.appendChild(el('time', null, when(p.ts))); box.appendChild(d); });
    return box;
  }
  function openProfile(id) {
    if (!me) return;
    lastFocus = document.activeElement;
    show('<h2 id="dlg-title">Профиль</h2><div id="d-prof"></div><div class="row"><button type="button" id="d-close">Закрыть</button></div>');
    $('d-prof').appendChild(profileBlock(id)); $('d-close').onclick = close;
    var row = dialog.querySelector('.row');
    if (id !== me.uid) {
      var wr = el('button', 'primary', 'Написать'); wr.type = 'button';
      wr.onclick = function () { close(); S.peer = id; dmQ.value = ''; setTab('dm'); renderContacts(); renderThread(); };
      row.appendChild(wr);
    } else {
      var ed = el('button', 'primary', 'Настройки'); ed.type = 'button';
      ed.onclick = function () { close(); setTab('profile'); }; row.appendChild(ed);
    }
  }
  function renderProfileTab() {
    var box = $('my-profile'); if (!me || !box) return;
    box.textContent = ''; box.appendChild(profileBlock(me.uid));
  }
  $('name-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    var err = $('name-err'), msg = $('name-msg'), name = $('name-input').value.trim().replace(/\s+/g, ' '); err.textContent = ''; msg.textContent = '';
    if (name.length < 2 || name.length > 24) { err.textContent = 'Имя: от 2 до 24 символов.'; return; }
    if (hasBadWord(name)) { err.textContent = BAD_MSG; return; }
    if (name === nameOf(me.uid)) { msg.textContent = 'Имя не изменилось.'; return; }
    $('name-btn').disabled = true;
    try {
      await db.collection('users').doc(me.uid).update({ name: name });
      try { await me.updateProfile({ displayName: name }); } catch (x) {}
      msg.textContent = 'Имя сохранено.';
    } catch (ex) { err.textContent = dbMsg(ex, 'Не удалось сохранить имя. Попробуйте ещё раз.'); }
    $('name-btn').disabled = false;
  });

  /* ---------- личные сообщения ---------- */
  function unreadFor(peer) { return S.msgs.filter(function (m) { return m.from === peer && m.to === me.uid && m.ts > (S.seen[peer] || 0); }).length; }
  function markSeen() {
    if (!me || !S.peer || S.tab !== 'dm') return;
    var mx = 0; S.msgs.forEach(function (m) { if (m.from === S.peer && m.to === me.uid && m.ts > mx) mx = m.ts; });
    if (mx > (S.seen[S.peer] || 0)) { S.seen[S.peer] = mx; lsSet('seen-' + me.uid, S.seen); }
    updateBadges();
  }
  function updateBadges() {
    if (!me) return;
    var total = 0; Object.keys(S.users).forEach(function (p) { if (p !== me.uid) total += unreadFor(p); });
    document.title = (total ? '(' + total + ') ' : '') + BASE_TITLE;
    var c = $('dm-count'); c.textContent = ''; if (total) { c.className = 'cnt'; c.textContent = total; } else c.className = '';
    renderContacts();
  }
  var dmQ = $('dm-search');
  dmQ.addEventListener('input', renderContacts);
  function lastTs(id) { var t = 0; S.msgs.forEach(function (m) { if ((m.from === id || m.to === id) && m.ts > t) t = m.ts; }); return t; }
  function lastMsg(id) { var r = null; S.msgs.forEach(function (m) { if ((m.from === id || m.to === id) && (!r || m.ts > r.ts)) r = m; }); return r; }
  function contactBtn(id) {
    var b = el('button', 'cbtn' + (S.peer === id ? ' on' : '')); b.type = 'button'; b.setAttribute('aria-pressed', S.peer === id ? 'true' : 'false');
    b.appendChild(avatar(id)); b.appendChild(el('span', null, nameOf(id))); if (isVer(id)) b.appendChild(badge());
    var lm = lastMsg(id); if (lm) b.appendChild(el('span', 'prev', (lm.from === me.uid ? 'Вы: ' : '') + lm.text.slice(0, 28) + (lm.text.length > 28 ? '…' : '')));
    var un = unreadFor(id); if (un) b.appendChild(el('span', 'cnt', String(un)));
    b.onclick = function () { S.peer = id; $('dm-err').textContent = ''; renderContacts(); renderThread(); };
    return b;
  }
  function renderContacts() {
    var box = $('contacts'); if (!me) return; box.textContent = '';
    var q = dmQ.value.trim().toLowerCase();
    var others = Object.keys(S.users).filter(function (id) { return id !== me.uid; });
    var chats = others.filter(function (id) { return lastTs(id) > 0; }).sort(function (a, b) { return lastTs(b) - lastTs(a); });
    if (!q) {
      if (!others.length) { box.appendChild(el('p', 'cmuted', 'Пока нет других участников. Когда кто-то зарегистрируется, он появится здесь.')); return; }
      if (!chats.length) { box.appendChild(el('p', 'cmuted', 'Чатов пока нет. Найдите пользователя через поиск выше и напишите ему.')); return; }
      chats.forEach(function (id) { box.appendChild(contactBtn(id)); });
      return;
    }
    function hit(id) { return nameOf(id).toLowerCase().indexOf(q) !== -1; }
    var inChats = chats.filter(hit);
    var people = others.filter(function (id) { return hit(id) && chats.indexOf(id) === -1; }).sort(function (a, b) { return nameOf(a).localeCompare(nameOf(b), 'ru'); });
    if (!inChats.length && !people.length) { box.appendChild(el('p', 'cmuted', 'Никого не найдено.')); return; }
    if (inChats.length) { box.appendChild(el('p', 'lbl', 'Чаты')); inChats.forEach(function (id) { box.appendChild(contactBtn(id)); }); }
    if (people.length) { box.appendChild(el('p', 'lbl', 'Пользователи')); people.slice(0, 20).forEach(function (id) { box.appendChild(contactBtn(id)); }); }
  }
  function renderThread() {
    if (!me) return;
    var box = $('thread'), form = $('dm-form');
    if (!S.peer) { box.textContent = ''; box.appendChild(el('p', 'cmuted', 'Выберите собеседника.')); form.hidden = true; return; }
    form.hidden = !canPost();
    var msgs = S.msgs.filter(function (m) { return (m.from === S.peer && m.to === me.uid) || (m.from === me.uid && m.to === S.peer); });
    msgs.sort(function (a, b) { return a.ts - b.ts; });
    box.textContent = '';
    var hd = el('div', 'thead'); hd.appendChild(el('span', 'cmuted', 'Чат с ')); hd.appendChild(whoEl(S.peer)); box.appendChild(hd);
    if (!msgs.length) box.appendChild(el('p', 'cmuted', canPost() ? 'Сообщений пока нет. Напишите первым.' : 'Подтвердите почту, чтобы писать сообщения.'));
    msgs.forEach(function (m) { var d = linkify(el('div', 'msg' + (m.from === me.uid ? ' me' : '')), m.text); d.appendChild(el('time', null, when(m.ts))); box.appendChild(d); });
    box.scrollTop = box.scrollHeight;
    markSeen();
  }
  $('dm-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    var inp = $('dm-text'), err = $('dm-err'), text = inp.value.trim(); err.textContent = '';
    if (!text || !S.peer) return;
    $('dm-btn').disabled = true;
    try { await db.collection('messages').add({ from: me.uid, to: S.peer, participants: [me.uid, S.peer], text: text, ts: FV.serverTimestamp() }); inp.value = ''; }
    catch (ex) { err.textContent = dbMsg(ex, 'Не удалось отправить сообщение. Попробуйте ещё раз.'); }
    $('dm-btn').disabled = false; inp.focus();
  });

  function renderAll() {
    renderAccounts(); setStatus();
    if (me && configured) { renderFeed(); renderMod(); renderContacts(); renderThread(); updateBadges(); if (S.tab === 'profile') renderProfileTab(); }
  }
  renderAccounts();
})();