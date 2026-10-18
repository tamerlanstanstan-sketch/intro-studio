(function () {
  /* если библиотека 3D не загрузилась, текст и переходы всё равно работают */
  if (!window.THREE) {
    var deep = function () {
      return new Proxy(function () {}, {
        get: function (t, k) { return k === 'then' ? undefined : deep(); },
        apply: function () { return deep(); }, construct: function () { return deep(); }, set: function () { return true; }
      });
    };
    var Col = function (h) { this.r = 0; this.g = 0; this.b = 0; if (typeof h === 'number') { this.r = ((h >> 16) & 255) / 255; this.g = ((h >> 8) & 255) / 255; this.b = (h & 255) / 255; } };
    Col.prototype.copy = function (c) { this.r = c.r; this.g = c.g; this.b = c.b; return this; };
    Col.prototype.clone = function () { return new Col().copy(this); };
    Col.prototype.lerp = function (c, a) { this.r += (c.r - this.r) * a; this.g += (c.g - this.g) * a; this.b += (c.b - this.b) * a; return this; };
    Col.prototype.getHexString = function () {
      var h = function (v) { var x = Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16); return x.length < 2 ? '0' + x : x; };
      return h(this.r) + h(this.g) + h(this.b);
    };
    var base = { Color: Col, WebGLRenderer: function () { throw new Error('three.js unavailable'); } };
    window.THREE = new Proxy(base, { get: function (t, k) { return k in t ? t[k] : deep(); } });
  }
  var stage = document.getElementById('stage');
  var D = 4.4, N = 4, T = D * N;
  var accents = [0x1fd1c1, 0xffb347, 0xff6b5e, 0x9ad0ff].map(function (h) { return new THREE.Color(h); });
  var backs = [0x061317, 0x171007, 0x190908, 0x08111c].map(function (h) { return new THREE.Color(h); });

  /* текст: разбиваем на слова и буквы */
  function split(el) {
    var txt = el.textContent; el.textContent = '';
    var i = 0;
    txt.split(' ').forEach(function (w, wi, arr) {
      var ws = document.createElement('span'); ws.className = 'word';
      Array.from(w).forEach(function (c) {
        var s = document.createElement('span'); s.className = 'ch'; s.style.setProperty('--i', i++); s.textContent = c; ws.appendChild(s);
      });
      el.appendChild(ws);
      if (wi < arr.length - 1) { el.appendChild(document.createTextNode(' ')); i++; }
    });
  }
  document.querySelectorAll('[data-split]').forEach(split);
  var scenes = Array.prototype.slice.call(document.querySelectorAll('.scene'));

  /* 3D */
  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gl'), antialias: true, alpha: false });
  } catch (e) {
    var fb = document.createElement('div'); fb.className = 'fallback';
    fb.textContent = 'Не удалось запустить 3D в этом браузере. Текст и переходы продолжат работать.';
    stage.appendChild(fb); renderer = null;
  }
  var scene3 = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 50);
  camera.position.set(0, 0, 7.5);
  scene3.background = backs[0].clone();
  scene3.fog = new THREE.Fog(0x061317, 8, 16);
  scene3.add(new THREE.AmbientLight(0xffffff, 0.35));
  var l1 = new THREE.PointLight(0xffffff, 2.2, 30); l1.position.set(4, 3, 5); scene3.add(l1);
  var l2 = new THREE.PointLight(0xffffff, 1.6, 30); l2.position.set(-5, -2, 3); scene3.add(l2);

  var solid = new THREE.MeshStandardMaterial({ color: 0x1a232d, metalness: 0.85, roughness: 0.28, flatShading: true });
  var wire = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.5 });
  var glow = new THREE.MeshBasicMaterial({ color: 0xffffff });

  var root = new THREE.Group(); scene3.add(root);
  var groups = [];
  function mk() { var g = new THREE.Group(); root.add(g); groups.push(g); return g; }

  /* сцена 0: ико-сфера с орбитами */
  var g0 = mk();
  g0.add(new THREE.Mesh(new THREE.IcosahedronGeometry(1.25, 1), solid));
  var w0 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.32, 1), wire); g0.add(w0);
  var orbit0 = new THREE.Group(); g0.add(orbit0);
  for (var a = 0; a < 3; a++) {
    var s = new THREE.Mesh(new THREE.SphereGeometry(0.14, 20, 20), glow);
    var ang = a / 3 * Math.PI * 2; s.position.set(Math.cos(ang) * 2.1, Math.sin(ang * 2) * 0.4, Math.sin(ang) * 2.1); orbit0.add(s);
  }
  /* сцена 1: кольцо кубов вокруг шара */
  var g1 = mk();
  g1.add(new THREE.Mesh(new THREE.SphereGeometry(0.75, 40, 40), solid));
  g1.add(new THREE.Mesh(new THREE.SphereGeometry(0.82, 18, 14), wire));
  var cubes = [];
  for (var c = 0; c < 14; c++) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), c % 2 ? solid : wire);
    g1.add(m); cubes.push(m);
  }
  /* сцена 2: торус-узел и октаэдры */
  var g2 = mk();
  g2.add(new THREE.Mesh(new THREE.TorusKnotGeometry(0.95, 0.3, 180, 20), solid));
  var wk = new THREE.Mesh(new THREE.TorusKnotGeometry(0.95, 0.34, 90, 10), wire); g2.add(wk);
  var octs = [];
  for (var o = 0; o < 2; o++) { var om = new THREE.Mesh(new THREE.OctahedronGeometry(0.32), o ? wire : solid); g2.add(om); octs.push(om); }
  /* сцена 3: три кольца вокруг ядра */
  var g3 = mk();
  var rings = [];
  [1.6, 1.25, 0.9].forEach(function (r, i) {
    var rm = new THREE.Mesh(new THREE.TorusGeometry(r, 0.045, 16, 120), glow); g3.add(rm); rings.push(rm);
  });
  g3.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), solid));
  g3.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.56, 0), wire));

  /* частицы */
  var pc = 450, pp = new Float32Array(pc * 3);
  for (var p = 0; p < pc; p++) { pp[p*3] = (Math.random()-.5)*18; pp[p*3+1] = (Math.random()-.5)*10; pp[p*3+2] = (Math.random()-.5)*12 - 2; }
  var pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
  var pm = new THREE.PointsMaterial({ color: 0xffffff, size: 0.04, transparent: true, opacity: 0.7 });
  var points = new THREE.Points(pg, pm); scene3.add(points);

  function layout() {
    var w = stage.clientWidth, h = stage.clientHeight;
    if (!renderer) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    var wide = w / h > 1.1;
    root.position.set(wide ? 2.2 : 0, wide ? 0 : 1.35, 0);
    root.scale.setScalar(wide ? 1 : 0.7);
  }
  if (window.ResizeObserver) new ResizeObserver(layout).observe(stage); else window.addEventListener('resize', layout);
  layout();

  function ease(x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }
  function wf(local) { return Math.min(ease((local + 0.3) / 1.1), ease((D + 0.3 - local) / 1.1)); }

  var time = 0, paused = false, last = performance.now(), curIdx = -1, curState = '';
  var sweep = document.getElementById('sweep');
  var bars = document.querySelectorAll('.bars b');
  var tmp = new THREE.Color(), tmp2 = new THREE.Color();

  function setText(idx, local) {
    var state = local < D - 0.8 ? 'in' : 'out';
    if (idx !== curIdx || state !== curState) {
      scenes.forEach(function (el, i) {
        el.classList.toggle('in', i === idx && state === 'in');
        el.classList.toggle('out', i === idx && state === 'out');
      });
      if (idx !== curIdx) { sweep.classList.remove('go'); void sweep.offsetWidth; sweep.classList.add('go'); }
      curIdx = idx; curState = state;
    }
  }

  /* запись в видеофайл: 3D-кадр и текст собираются на отдельном холсте */
  var glCanvas = document.getElementById('gl');
  var dlBtn = document.getElementById('download');
  var downloadsNS = null, recording = false, recElapsed = 0, rec = null;
  var COPY = [
    { k: 'Добро пожаловать', t: 'Твой канал', big: true },
    { k: 'О чём мы', t: 'Идеи. Истории. Эмоции.' },
    { k: 'Каждую неделю', t: 'Новое видео по пятницам' },
    { k: 'Не пропусти', t: 'Подписывайся', big: true, s: 'Твой канал' }
  ];
  function rgba(col, a) {
    return 'rgba(' + Math.round(col.r * 255) + ',' + Math.round(col.g * 255) + ',' + Math.round(col.b * 255) + ',' + a + ')';
  }
  function layLines(ctx, text, font, spacing, maxW) {
    ctx.font = font;
    var space = ctx.measureText(' ').width + spacing;
    var lines = [[]], x = 0;
    text.split(' ').forEach(function (w) {
      var chars = Array.from(w), ww = 0;
      var ws = chars.map(function (c) { var cw = ctx.measureText(c).width + spacing; ww += cw; return cw; });
      if (lines[lines.length - 1].length && x + ww > maxW) { lines.push([]); x = 0; }
      var cur = lines[lines.length - 1], sx = x;
      chars.forEach(function (c, i) { cur.push({ ch: c, x: sx }); sx += ws[i]; });
      x = sx + space;
    });
    return lines;
  }
  function mkLayout(ctx, W, H) {
    var wide = W / H > 1.1, u = W / 100;
    var cfg = wide
      ? { k: 1.7 * u, t: 5.4 * u, tb: 7 * u, s: 1.9 * u, gap: 2.2 * u, left: 6 * u, maxW: W * 0.49 }
      : { k: 3.2 * u, t: 8.6 * u, tb: 10.5 * u, s: 3.6 * u, gap: 3 * u, left: 7 * u, maxW: 86 * u };
    var items = COPY.map(function (c) {
      var ts = c.big ? cfg.tb : cfg.t;
      var kf = '500 ' + cfg.k + 'px Onest, system-ui, sans-serif';
      var tf = '700 ' + ts + 'px Unbounded, "Arial Black", sans-serif';
      var sf = '400 ' + cfg.s + 'px Onest, system-ui, sans-serif';
      var kl = layLines(ctx, c.k.toUpperCase(), kf, cfg.k * 0.22, cfg.maxW);
      var tl = layLines(ctx, c.t, tf, 0, cfg.maxW);
      var kh = cfg.k * 1.3 * kl.length, th = tl.length * ts * 1.05;
      var sh = c.s ? cfg.gap + cfg.s * 1.4 : 0;
      var total = kh + cfg.gap + th + sh;
      var top = wide ? (H - total) / 2 : H - 12 * u - total;
      return { kf: kf, tf: tf, sf: sf, kl: kl, tl: tl, ts: ts, kh: kh, th: th, top: top, cfg: cfg, s: c.s, left: cfg.left };
    });
    return { items: items, u: u };
  }
  function drawLines(c, lines, x0, y0, lh, font, color, local) {
    c.font = font; c.fillStyle = color; c.textBaseline = 'middle';
    var sz = parseFloat(font.split(' ')[1]), n = 0;
    lines.forEach(function (line, li) {
      line.forEach(function (ch) {
        var pin = ease((local - n * 0.032) / 0.8);
        var po = ease((local - (D - 0.8) - n * 0.012) / 0.5);
        n++;
        var a = pin * (1 - po);
        if (a <= 0.01) return;
        c.globalAlpha = a;
        c.fillText(ch.ch, x0 + ch.x, y0 + li * lh + lh / 2 + ((1 - pin) * 0.7 - po * 0.7) * sz);
      });
    });
    c.globalAlpha = 1;
  }
  function recFrame(idx, local, accent, back) {
    var c = rec.ctx, W = rec.W, H = rec.H, L = rec.layout, it = L.items[idx], u = L.u;
    c.globalAlpha = 1;
    c.fillStyle = '#' + back.getHexString(); c.fillRect(0, 0, W, H);
    if (renderer) c.drawImage(glCanvas, 0, 0, W, H);
    var vg = c.createRadialGradient(W * 0.7, H * 0.5, H * 0.3, W * 0.7, H * 0.5, W * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)');
    c.fillStyle = vg; c.fillRect(0, 0, W, H);
    if (local < 1) {
      var sx = (-0.4 + 1.5 * ease(local)) * W;
      var sg = c.createLinearGradient(sx, 0, sx + W * 0.5, 0);
      sg.addColorStop(0, rgba(accent, 0)); sg.addColorStop(0.5, rgba(accent, 0.3 * (1 - local))); sg.addColorStop(1, rgba(accent, 0));
      c.fillStyle = sg; c.fillRect(0, 0, W, H);
    }
    var y = it.top;
    drawLines(c, it.kl, it.left, y, it.cfg.k * 1.3, it.kf, rgba(accent, 1), local);
    y += it.kh + it.cfg.gap;
    drawLines(c, it.tl, it.left, y, it.ts * 1.05, it.tf, '#eef3f7', local);
    if (it.s) {
      y += it.th + it.cfg.gap;
      var pin = ease((local - 0.3) / 0.7), a = pin * (1 - ease((local - (D - 0.8)) / 0.3));
      c.globalAlpha = a; c.font = it.sf; c.fillStyle = '#8a99a8'; c.textBaseline = 'middle';
      c.fillText(it.s, it.left, y + it.cfg.s * 0.7 + (1 - pin) * 14);
      c.globalAlpha = 1;
    }
    var bw = (W - 12 * u - 18) / 4;
    for (var b = 0; b < 4; b++) {
      var bx = 6 * u + b * (bw + 6), by = H - 3.2 * u - 3, f = b < idx ? 1 : b > idx ? 0 : local / D;
      c.fillStyle = 'rgba(255,255,255,.14)'; c.fillRect(bx, by, bw, 3);
      c.fillStyle = rgba(accent, 1); c.fillRect(bx, by, bw * f, 3);
    }
  }
  var pending = null, lastIdx = 0, lastLocal = 0;
  async function loadFonts() {
    try { await document.fonts.load('700 40px Unbounded'); await document.fonts.load('500 20px Onest'); await document.fonts.load('400 20px Onest'); } catch (e) {}
  }
  function recSize() {
    var wide = stage.clientWidth / stage.clientHeight > 1.1;
    return wide ? [1280, 720] : [864, 1080];
  }
  async function saveFile(file) {
    dlBtn.disabled = true;
    try {
      await downloadsNS.save({ filename: file.name, data: file.blob });
      pending = null; dlBtn.textContent = 'Скачать';
    } catch (e) {
      pending = file;
      dlBtn.textContent = e && e.code === 'declined' ? 'Сохранить файл' : 'Не удалось, повторить';
    }
    dlBtn.disabled = false;
  }
  async function saveStill() {
    dlBtn.disabled = true; dlBtn.textContent = 'Готовлю файл…';
    await loadFonts();
    var s = recSize(), cv = document.createElement('canvas'); cv.width = s[0]; cv.height = s[1];
    var ctx = cv.getContext('2d');
    rec = { ctx: ctx, W: s[0], H: s[1], layout: mkLayout(ctx, s[0], s[1]) };
    recFrame(lastIdx, Math.min(lastLocal, D - 1.2), tmp, tmp2);
    cv.toBlob(function (b) {
      if (!b) { dlBtn.disabled = false; dlBtn.textContent = 'Не удалось, повторить'; return; }
      saveFile({ blob: b, name: 'intro.png' });
    }, 'image/png');
  }
  async function startRecord() {
    var types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    var mime = window.MediaRecorder && types.filter(function (m) { return MediaRecorder.isTypeSupported(m); })[0];
    var cv = document.createElement('canvas');
    if (!mime || !cv.captureStream) { await saveStill(); return; }
    dlBtn.disabled = true; dlBtn.textContent = 'Запись 0%';
    await loadFonts();
    var s = recSize(); cv.width = s[0]; cv.height = s[1];
    var ctx = cv.getContext('2d');
    var mr = new MediaRecorder(cv.captureStream(30), { mimeType: mime, videoBitsPerSecond: 8000000 });
    var chunks = [];
    mr.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    mr.onstop = function () {
      var ext = mime.indexOf('mp4') === 0 ? 'mp4' : 'webm';
      pending = { blob: new Blob(chunks, { type: mime.split(';')[0] }), name: 'intro.' + ext };
      dlBtn.disabled = false; dlBtn.textContent = 'Сохранить видео';
    };
    rec = { ctx: ctx, W: s[0], H: s[1], layout: mkLayout(ctx, s[0], s[1]), mr: mr };
    time = 0; curIdx = -1; paused = false; recElapsed = 0; recording = true;
    mr.start(250);
  }
  dlBtn.addEventListener('click', function () {
    if (recording) return;
    if (pending) { saveFile(pending); return; }
    startRecord();
  });
  /* обычная загрузка файла через ссылку: работает на любом хостинге */
  downloadsNS = {
    save: function (o) {
      return new Promise(function (resolve) {
        var a = document.createElement('a'), u = URL.createObjectURL(o.data);
        a.href = u; a.download = o.filename; a.style.display = 'none'; document.body.appendChild(a); a.click();
        setTimeout(function () { URL.revokeObjectURL(u); a.parentNode && a.parentNode.removeChild(a); }, 4000);
        resolve({ status: 'saved' });
      });
    }
  };
  dlBtn.hidden = false;

  function frame(now) {
    var dt = Math.min((now - last) / 1000, 0.05); last = now;
    if (!paused) time = (time + dt) % T;
    var t = time, idx = Math.floor(t / D) % N, local = t - idx * D;

    /* цвет: плавно переходит к следующей сцене в конце слота */
    var k = local > D - 0.9 ? ease((local - (D - 0.9)) / 0.9) : 0;
    var nxt = (idx + 1) % N;
    tmp.copy(accents[idx]).lerp(accents[nxt], k);
    tmp2.copy(backs[idx]).lerp(backs[nxt], k);
    var hex = '#' + tmp.getHexString();
    stage.style.setProperty('--accent', hex);
    stage.style.background = '#' + tmp2.getHexString();
    document.documentElement.style.setProperty('--accent', hex);
    setText(idx, local);

    for (var b = 0; b < N; b++) {
      var f = b < idx ? 1 : b > idx ? 0 : local / D;
      bars[b].style.width = (f * 100).toFixed(1) + '%';
    }

    if (renderer) {
      scene3.background.copy(tmp2); scene3.fog.color.copy(tmp2);
      wire.color.copy(tmp); glow.color.copy(tmp); pm.color.copy(tmp);
      l1.color.copy(tmp); l2.color.copy(accents[nxt]);

      groups.forEach(function (g, i) {
        var w = Math.max(wf(t - i * D), wf(t - i * D - T), wf(t - i * D + T));
        g.visible = w > 0.01;
        g.scale.setScalar(Math.max(w, 0.0001));
        g.rotation.y = t * (0.5 + i * 0.12) + (1 - w) * 3.2;
        g.rotation.x = Math.sin(t * 0.6 + i) * 0.25;
      });
      orbit0.rotation.y = -t * 1.3;
      w0.rotation.y = t * 0.3;
      cubes.forEach(function (m, i) {
        var an = i / cubes.length * Math.PI * 2 + t * 0.7;
        m.position.set(Math.cos(an) * 1.75, Math.sin(t * 1.4 + i) * 0.35, Math.sin(an) * 1.75);
        m.rotation.set(t + i, t * 0.8, 0);
      });
      wk.rotation.z = t * 0.4;
      octs.forEach(function (m, i) {
        var an = t * 1.1 + i * Math.PI;
        m.position.set(Math.cos(an) * 1.9, Math.sin(an * 1.3) * 0.8, Math.sin(an) * 1.9);
        m.rotation.set(t * 2, t, 0);
      });
      rings.forEach(function (r, i) {
        r.rotation.x = t * (0.9 + i * 0.4) + i; r.rotation.y = t * (0.5 + i * 0.3);
      });
      var pulse = local < 0.7 ? 1 - ease(local / 0.7) : 0;
      camera.fov = 45 - 7 * pulse; camera.updateProjectionMatrix();
      points.rotation.y = t * 0.03 + pulse * 0.6; pm.size = 0.04 + 0.05 * pulse;
      camera.position.x = Math.sin(t * 0.4) * 0.5;
      camera.position.y = Math.cos(t * 0.3) * 0.3;
      camera.position.z = 7.5 - Math.sin(t / T * Math.PI * 2) * 0.5;
      camera.lookAt(0, 0, 0);
      renderer.render(scene3, camera);
    }
    lastIdx = idx; lastLocal = local;
    if (recording && rec) {
      recFrame(idx, local, tmp, tmp2);
      recElapsed += dt;
      dlBtn.textContent = 'Запись ' + Math.min(99, Math.round(recElapsed / T * 100)) + '%';
      if (recElapsed >= T) { recording = false; rec.mr.stop(); }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  document.getElementById('replay').addEventListener('click', function () { if (recording) return; time = 0; curIdx = -1; });
})();
