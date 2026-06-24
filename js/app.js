/* ============================================================
   ПРИЛОЖЕНИЕ «Прана» — контроллер
   Хеш-роутинг, экраны, генератор тренировки, плеер и ссылки.
   ============================================================ */
(function () {
  const { MUSCLES, LEVELS, STATES, ASANAS, BREATHING, TIPS } = window.YOGA;
  const { CHARACTERS, buildFigure, animateFigure, buildMuscleMap } = window.YOGA_CHARS;

  const app = document.getElementById('app');
  const asanaById  = id => ASANAS.find(a => a.id === id);
  const breathById = id => BREATHING.find(b => b.id === id);

  /* ----- Состояние интерфейса ----- */
  let currentChar = localStorage.getItem('prana.char') || 'woman';
  let asanaLevel  = 'green';
  let breathState = 'relaxing';
  let voiceOn     = localStorage.getItem('prana.voice') === '1';
  let teardown    = null; // функция очистки текущего экрана (таймеры/анимации)

  /* ----- Голос наставника (Web Speech API) ----- */
  const hasSpeech = 'speechSynthesis' in window;
  let ruVoice = null;
  function pickVoice() {
    if (!hasSpeech) return;
    const vs = speechSynthesis.getVoices();
    ruVoice = vs.find(v => /ru[-_]/i.test(v.lang) || /russian/i.test(v.name)) || null;
  }
  if (hasSpeech) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
  function speak(text) {
    if (!voiceOn || !hasSpeech || !text) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(text).replace(/[^\p{L}\p{N}\s.,!?—-]/gu, '').trim());
    u.lang = 'ru-RU'; if (ruVoice) u.voice = ruVoice;
    u.rate = 0.95; u.pitch = 1;
    speechSynthesis.speak(u);
  }
  function stopSpeak() { if (hasSpeech) speechSynthesis.cancel(); }

  /* Универсальные напоминания наставника */
  const REMINDERS = [
    'Опусти плечи от ушей 🌿', 'Дыши ровно и глубоко', 'Мягко подкрути таз',
    'Удлиняй позвоночник вверх', 'Останься в осознанности', 'Расслабь лицо и челюсть',
    'Не задерживай дыхание', 'Распредели вес равномерно',
  ];

  /* ----- Утилиты ----- */
  const fmt = s => Math.floor(s / 60) + ':' + String(Math.max(0, s % 60)).padStart(2, '0');
  const cycleLen = b => b.pattern.inhale + b.pattern.hold + b.pattern.exhale + b.pattern.holdOut;
  function itemDur(it) {
    if (it.d) return it.d; // явная длительность (генератор растягивает удержания)
    if (it.t === 'a') { const a = asanaById(it.id); return a ? a.duration : 30; }
    const b = breathById(it.id); return b ? Math.max(cycleLen(b) * b.rounds, 30) : 60;
  }
  function clearScreen() { if (teardown) { teardown(); teardown = null; } }

  /* URL-safe кодирование плана */
  function enc(obj) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(obj)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function dec(str) {
    try {
      str = str.replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(decodeURIComponent(escape(atob(str))));
    } catch (e) { return null; }
  }

  /* =========================================================
     ДЫХАТЕЛЬНЫЙ ДВИЖОК (анимация шара + фазы)
     ========================================================= */
  function startBreath(pattern, orbEl, onTick, isPaused) {
    const phases = [];
    if (pattern.inhale)  phases.push(['Вдох',     pattern.inhale,  'grow']);
    if (pattern.hold)    phases.push(['Задержка', pattern.hold,    'top']);
    if (pattern.exhale)  phases.push(['Выдох',    pattern.exhale,  'shrink']);
    if (pattern.holdOut) phases.push(['Пауза',    pattern.holdOut, 'bottom']);
    const cyc = phases.reduce((s, p) => s + p[1], 0) || 1;
    const MIN = 0.55, MAX = 1.4;
    let raf, stopped = false, virtual = 0, last = performance.now();

    function frame(now) {
      if (stopped) return;
      const dt = (now - last) / 1000; last = now;
      if (!(isPaused && isPaused())) virtual += dt;
      const round = Math.floor(virtual / cyc) + 1;
      let tc = virtual % cyc, acc = 0, ph = phases[0], into = 0;
      for (const p of phases) { if (tc < acc + p[1]) { ph = p; into = tc - acc; break; } acc += p[1]; }
      let scale = MIN;
      if (ph[2] === 'grow')   scale = MIN + (MAX - MIN) * (into / ph[1]);
      else if (ph[2] === 'shrink') scale = MAX - (MAX - MIN) * (into / ph[1]);
      else if (ph[2] === 'top') scale = MAX;
      if (orbEl) orbEl.style.transform = 'scale(' + scale.toFixed(3) + ')';
      onTick && onTick(ph[0], Math.ceil(ph[1] - into), round);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => { stopped = true; cancelAnimationFrame(raf); };
  }

  /* =========================================================
     ЭКРАН: АСАНЫ — список
     ========================================================= */
  function renderAsanaList() {
    const tabs = Object.entries(LEVELS).map(([k, l]) =>
      `<button class="level-tab ${l.dot} ${k === asanaLevel ? 'active' : ''}" data-level="${k}">
        <span class="dot ${l.dot}"></span>${l.name}</button>`).join('');
    const list = ASANAS.filter(a => a.level === asanaLevel);
    const cards = list.map(a => `
      <div class="card" data-go="#/asanas/${a.id}">
        <span class="level-stripe ${LEVELS[a.level].dot}"></span>
        <div class="card-fig">${buildFigure(a.pose, currentChar)}</div>
        <h3>${a.name}</h3>
        <div class="sanskrit">${a.sanskrit} · ${a.translation}</div>
      </div>`).join('');

    app.innerHTML = `<div class="fade-in">
      <div class="screen-head">
        <div class="kicker">Раздел 1</div>
        <h1>Асаны</h1>
        <p class="muted">Выбери уровень и асану — наставник покажет позу, мышцы и смысл.</p>
      </div>
      <div class="level-tabs">${tabs}</div>
      <div class="card-grid">${cards}</div>
    </div>`;

    app.querySelectorAll('.level-tab').forEach(t =>
      t.onclick = () => { asanaLevel = t.dataset.level; renderAsanaList(); });
  }

  /* =========================================================
     ЭКРАН: АСАНА — детально
     ========================================================= */
  function renderAsanaDetail(id) {
    const a = asanaById(id);
    if (!a) return renderAsanaList();
    const L = LEVELS[a.level];
    const charChips = Object.entries(CHARACTERS).map(([k, c]) =>
      `<button class="char-chip ${k === currentChar ? 'active' : ''}" data-char="${k}">${c.emoji} ${c.name}</button>`).join('');
    const muscleChips = a.muscles.map(m =>
      `<span class="muscle-chip" data-muscle="${m}">${MUSCLES[m]}</span>`).join('');
    const variations = a.variations.map(v => `<li>${v}</li>`).join('');
    const cues = a.cues.map(c => `<li>${c}</li>`).join('');

    app.innerHTML = `<div class="fade-in">
      <div class="back-link" data-go="#/asanas">← Все асаны</div>
      <div class="detail">
        <div class="stage">
          ${a.photo ? `<div class="stage-tabs">
            <button class="stage-tab active" data-view="char">✏️ Персонаж</button>
            <button class="stage-tab" data-view="photo">📷 Фото</button>
          </div>` : ''}
          <div class="figure-wrap" id="figure-box">${buildFigure(a.pose, currentChar)}</div>
          ${a.photo ? `<img class="asana-photo" id="asana-photo" src="${a.photo}" alt="${a.name} — фото" hidden>` : ''}
          <div class="char-row" id="char-row">${charChips}</div>
        </div>
        <div class="info">
          <span class="badge ${L.dot}">${L.emoji} ${L.name}</span>
          <h1>${a.name}</h1>
          <div class="sanskrit">${a.sanskrit} · ${a.translation}</div>

          <div class="section-block">
            <h4>Что даёт это состояние</h4>
            <p>${a.state}</p>
          </div>

          <div class="section-block">
            <h4>Задействованные мышцы</h4>
            <div class="detail" style="grid-template-columns: 130px 1fr; gap:18px; align-items:center;">
              <div class="muscle-map" id="muscle-map-box">${buildMuscleMap(a.muscles)}</div>
              <div class="muscle-chips">${muscleChips}</div>
            </div>
          </div>

          <div class="section-block">
            <h4>Вариации</h4>
            <ul class="variations" style="display:block; padding-left:18px;">${variations}</ul>
          </div>

          <div class="section-block">
            <h4>Влияние на состояние</h4>
            <div class="source">
              <div class="src vedas"><b>По ведам</b>${a.vedas}</div>
              <div class="src patanjali"><b>По Патанджали</b>${a.patanjali}</div>
            </div>
          </div>

          <div class="section-block">
            <h4>Наставник напоминает</h4>
            <ul class="cues">${cues}</ul>
          </div>

          <button class="btn block" data-go="#/generator">Собрать тренировку с этой асаной →</button>
        </div>
      </div>
    </div>`;

    // плавный вход в позу при открытии
    animateFigure(document.getElementById('figure-box'), a.pose, currentChar);
    // переключение персонажа — заново «входим» в позу новым персонажем
    app.querySelectorAll('.char-chip').forEach(ch => ch.onclick = () => {
      currentChar = ch.dataset.char; localStorage.setItem('prana.char', currentChar);
      updateHeaderChar();
      animateFigure(document.getElementById('figure-box'), a.pose, currentChar);
      app.querySelectorAll('.char-chip').forEach(x => x.classList.toggle('active', x.dataset.char === currentChar));
    });
    // переключатель «Персонаж / Фото»
    if (a.photo) {
      const figBox = document.getElementById('figure-box');
      const photoEl = document.getElementById('asana-photo');
      const charRow = document.getElementById('char-row');
      app.querySelectorAll('.stage-tab').forEach(tab => tab.onclick = () => {
        const photo = tab.dataset.view === 'photo';
        photoEl.hidden = !photo;
        figBox.hidden = photo;
        charRow.hidden = photo;
        app.querySelectorAll('.stage-tab').forEach(x => x.classList.toggle('active', x === tab));
      });
    }

    // подсветка мышц при наведении на чип
    const mapBox = document.getElementById('muscle-map-box');
    app.querySelectorAll('.muscle-chip').forEach(chip => {
      chip.onmouseenter = () => { mapBox.innerHTML = buildMuscleMap([chip.dataset.muscle]); chip.classList.add('hot'); };
      chip.onmouseleave = () => { mapBox.innerHTML = buildMuscleMap(a.muscles); chip.classList.remove('hot'); };
    });
  }

  /* =========================================================
     ЭКРАН: ДЫХАНИЕ — список
     ========================================================= */
  function renderBreathList() {
    const tabs = Object.entries(STATES).map(([k, s]) =>
      `<button class="level-tab ${s.color} ${k === breathState ? 'active' : ''}" data-state="${k}">
        <span class="dot ${s.color}"></span>${s.emoji} ${s.name}</button>`).join('');
    const list = BREATHING.filter(b => b.state === breathState);
    const cards = list.map(b => `
      <div class="card" data-go="#/breath/${b.id}">
        <span class="level-stripe ${STATES[b.state].color}"></span>
        <div class="card-fig" style="height:90px; font-size:3rem; align-items:center;">${STATES[b.state].emoji}</div>
        <h3>${b.name}</h3>
        <div class="sanskrit">${b.sanskrit}${b.translation ? ' · ' + b.translation : ''}</div>
      </div>`).join('');

    app.innerHTML = `<div class="fade-in">
      <div class="screen-head">
        <div class="kicker">Раздел 2</div>
        <h1>Дыхательные практики</h1>
        <p class="muted">Выбери практику по состоянию, которое хочешь получить.</p>
      </div>
      <div class="level-tabs">${tabs}</div>
      <div class="card-grid">${cards}</div>
    </div>`;

    app.querySelectorAll('.level-tab').forEach(t =>
      t.onclick = () => { breathState = t.dataset.state; renderBreathList(); });
  }

  /* =========================================================
     ЭКРАН: ДЫХАНИЕ — детально (с анимацией)
     ========================================================= */
  function renderBreathDetail(id) {
    const b = breathById(id);
    if (!b) return renderBreathList();
    const S = STATES[b.state];
    const cues = b.cues.map(c => `<li>${c}</li>`).join('');

    app.innerHTML = `<div class="fade-in">
      <div class="back-link" data-go="#/breath">← Все практики</div>
      <div class="detail">
        <div class="stage">
          <div class="breath-stage">
            <div class="breath-orb-wrap">
              <div class="ring"></div>
              <div class="breath-orb ${b.state}" id="orb"></div>
            </div>
            <div class="breath-meta">
              <div class="breath-phase" id="phase">Готова?</div>
              <div class="breath-count" id="count">${b.rounds}</div>
              <div class="muted" id="rounds-label">кругов в практике</div>
            </div>
            <button class="btn" id="breath-toggle">Начать практику</button>
          </div>
        </div>
        <div class="info">
          <span class="badge ${S.color}">${S.emoji} ${S.name}</span>
          <h1>${b.name}</h1>
          <div class="sanskrit">${b.sanskrit}${b.translation ? ' · ' + b.translation : ''}</div>
          <div class="section-block"><h4>Как это работает</h4><p>${b.description}</p></div>
          <div class="section-block"><h4>Эффект</h4><p>${b.effect}</p></div>
          <div class="section-block"><h4>Ритм</h4>
            <p class="muted">Вдох ${b.pattern.inhale}с${b.pattern.hold ? ' · задержка ' + b.pattern.hold + 'с' : ''} · выдох ${b.pattern.exhale}с${b.pattern.holdOut ? ' · пауза ' + b.pattern.holdOut + 'с' : ''} · ${b.rounds} кругов</p>
          </div>
          <div class="section-block"><h4>Наставник напоминает</h4><ul class="cues">${cues}</ul></div>
        </div>
      </div>
    </div>`;

    const orb = document.getElementById('orb');
    const phaseEl = document.getElementById('phase');
    const countEl = document.getElementById('count');
    const roundsLabel = document.getElementById('rounds-label');
    const btn = document.getElementById('breath-toggle');
    let stop = null;

    let lastPhase = '';
    btn.onclick = () => {
      if (stop) { stop(); stop = null; stopSpeak(); orb.style.transform = ''; phaseEl.textContent = 'Пауза'; btn.textContent = 'Продолжить'; return; }
      btn.textContent = 'Остановить';
      roundsLabel.textContent = 'круг практики';
      lastPhase = '';
      stop = startBreath(b.pattern, orb, (phase, sec, round) => {
        phaseEl.textContent = phase;
        countEl.textContent = round > b.rounds ? '✓' : sec;
        if (phase !== lastPhase) { lastPhase = phase; speak(phase); } // озвучиваем смену фазы
        if (round > b.rounds) { stop(); stop = null; phaseEl.textContent = 'Намасте 🙏'; countEl.textContent = '✓'; btn.textContent = 'Повторить'; orb.style.transform = ''; speak('Намасте'); }
      }, () => false);
    };
    teardown = () => { if (stop) stop(); stopSpeak(); };
  }

  /* =========================================================
     ГЕНЕРАТОР ТРЕНИРОВКИ
     ========================================================= */
  const RANK = { green: 1, yellow: 2, purple: 3 };
  const ENERGY = { tadasana: 2, balasana: 0, marjaryasana: 1, setubandha: 1, savasana: 0,
    sukhasana: 0, uttanasana: 1, vajrasana: 0, baddhakonasana: 1, vrksasana: 2,
    virabhadrasana2: 3, virabhadrasana1: 3, anjaneyasana: 2, paschimottanasana: 1,
    ustrasana: 2, ardhachandrasana: 2, parsvakonasana: 2, utkatasana: 3, trikonasana: 2,
    bhujangasana: 2, adhomukha: 2, navasana: 3, bakasana: 3, urdhvadhanu: 3, pigeon: 1,
    sirsasana: 2, chaturanga: 3, sarvangasana: 1, natarajasana: 2, hanumanasana: 2,
    dandasana: 1, apanasana: 0, suptamatsyendrasana: 0, dhanurasana: 2, shalabhasana: 2,
    ardhamatsyendrasana: 1, padmasana: 0, handstand: 3, pinchamayurasana: 3,
    anandabalasana: 0, sphinx: 1, puppy: 1,
    prasarita: 1, virabhadrasana3: 3, garudasana: 2, parighasana: 1,
    vasisthasana: 3,
    malasana: 1, suptapadangusthasana: 0, mandukasana: 0,
    parivrttatrikonasana: 2, viparitavirabhadrasana: 2, gomukhasana: 1,
    lizard: 2, threelegged: 2, parivrttalunge: 2,
    utthitapadangusthasana: 2,
    suptabaddhakonasana: 0, ardhautanasana: 1, virasana: 0,
    matsyasana: 1, purvottanasana: 2, ananthasayana: 1,
    halasana: 1, tittibhasana: 3,
    parivrttasukhasana: 0, parsvasukhasana: 0, januforward: 1,
    urdhvahastasana: 1, parsvottanasana: 2, parsvakonasana2: 0,
    kurmasana: 2,
    viparitakarani: 0, suptavirasana: 0, malasanasquat: 1,
    parsvabirddog: 2, parighasana2: 2, tolasana: 3, visvamitrasana: 3,
    makarasana: 0, ardhaapanasana: 0, skandasana: 2, bharadvajasana: 1,
    krounchasana: 2, astavakrasana: 3, mayurasana: 3,
    upavisthakonasana: 1, marichyasana: 1,
    agnistambhasana: 1, parsvabakasana: 3, bhujapidasana: 3,
    galavasana: 3, viparitadandasana: 2,
    jatharaparivartanasana: 0, matsyakridasana: 0, akarnadhanurasana: 2,
    pasasana: 2, ashtachandrasana: 3, kapotasana: 2,
    ekapadabakasana: 3, vrschikasana: 3,
    utkatakonasana: 3, parivrttaardhachandrasana: 2, ekapadarajakapotmermaid: 2,
    urdhvaprasarita: 2, forearmplank: 2, svargadvijasana: 3, camatkarasana: 2 };
  const OPEN_BREATH = { relaxing: 'full-breath', balancing: 'nadi-shodhana', energizing: 'kapalabhati' };

  let genCfg = { duration: 20, intensity: 'green', state: 'balancing' };

  function generateWorkout(cfg) {
    const total = cfg.duration * 60;
    const open = { t: 'b', id: OPEN_BREATH[cfg.state] };
    let pool = ASANAS.filter(a => RANK[a.level] <= RANK[cfg.intensity] && a.id !== 'savasana');
    pool = pool.slice().sort((a, b) => {
      const ea = ENERGY[a.id] ?? 2, eb = ENERGY[b.id] ?? 2;
      if (cfg.state === 'relaxing') return ea - eb;
      if (cfg.state === 'energizing') return eb - ea;
      return Math.abs(ea - 1.8) - Math.abs(eb - 1.8);
    });

    const savDur = cfg.duration >= 20 ? 150 : 90;
    const midBreath = cfg.state !== 'energizing' && cfg.duration >= 20;
    const midDur = midBreath ? itemDur({ t: 'b', id: 'bhramari' }) : 0;
    let budget = Math.max(60, total - itemDur(open) - savDur - midDur);
    const poolDur = pool.reduce((s, a) => s + a.duration, 0) || 60;

    const items = [open];
    let addedMid = false;
    const pushMid = () => { if (midBreath && !addedMid) { items.push({ t: 'b', id: 'bhramari' }); addedMid = true; } };

    if (poolDur >= budget) {
      // короткая сессия: один неполный круг без повторов
      let b = budget;
      for (const a of pool) {
        if (a.duration > b + 25) continue;
        items.push({ t: 'a', id: a.id }); b -= a.duration;
      }
      pushMid();
    } else {
      // несколько кругов (как во флоу), но не больше 3 — остаток времени уходит в удлинение удержаний
      const rounds = Math.min(3, Math.max(1, Math.round(budget / poolDur)));
      const factor = Math.min(2, Math.max(1, budget / (rounds * poolDur)));
      for (let r = 0; r < rounds; r++) {
        pool.forEach(a => items.push({ t: 'a', id: a.id, d: Math.round(a.duration * factor) }));
        if (r === 0 && rounds > 1) pushMid();
      }
      pushMid();
    }
    items.push({ t: 'a', id: 'savasana' });
    return { c: [cfg.duration, cfg.intensity, cfg.state], i: items };
  }

  function renderGenerator() {
    const durOpts = [10, 20, 30, 45];
    const durRow = durOpts.map(d =>
      `<div class="choice ${d === genCfg.duration ? 'active' : ''}" data-dur="${d}">
        <span class="ch-emoji">⏱</span>${d} мин</div>`).join('');
    const intRow = Object.entries(LEVELS).map(([k, l]) =>
      `<div class="choice ${l.dot} ${k === genCfg.intensity ? 'active' : ''}" data-int="${k}">
        <span class="ch-emoji">${l.emoji}</span>${l.name}</div>`).join('');
    const stateRow = Object.entries(STATES).map(([k, s]) =>
      `<div class="choice ${s.color} ${k === genCfg.state ? 'active' : ''}" data-state="${k}">
        <span class="ch-emoji">${s.emoji}</span>${s.name}</div>`).join('');

    app.innerHTML = `<div class="fade-in">
      <div class="screen-head">
        <div class="kicker">Раздел 3</div>
        <h1>Собери свою тренировку</h1>
        <p class="muted">Под твоё время, интенсивность и желаемое состояние. Дыхательные практики добавим автоматически.</p>
      </div>
      <div class="gen-form">
        <div class="field"><label>Продолжительность</label><div class="choice-row" id="dur-row">${durRow}</div></div>
        <div class="field"><label>Интенсивность</label><div class="choice-row" id="int-row">${intRow}</div></div>
        <div class="field"><label>Состояние</label><div class="choice-row" id="state-row">${stateRow}</div></div>
        <button class="btn block" id="gen-btn">Собрать тренировку ✨</button>
      </div>
      <div id="gen-result"></div>
    </div>`;

    const pick = (sel, attr, key) => app.querySelectorAll(sel).forEach(el => el.onclick = () => {
      const v = el.dataset[attr]; genCfg[key] = attr === 'dur' ? +v : v;
      app.querySelectorAll(sel).forEach(x => x.classList.remove('active'));
      el.classList.add('active');
    });
    pick('#dur-row .choice', 'dur', 'duration');
    pick('#int-row .choice', 'int', 'intensity');
    pick('#state-row .choice', 'state', 'state');
    document.getElementById('gen-btn').onclick = () => showPlan(generateWorkout(genCfg));
  }

  function planSummary(plan) {
    const totalSec = plan.i.reduce((s, it) => s + itemDur(it), 0);
    const nA = plan.i.filter(x => x.t === 'a').length;
    const nB = plan.i.filter(x => x.t === 'b').length;
    return { totalSec, nA, nB };
  }

  function showPlan(plan) {
    const { totalSec, nA, nB } = planSummary(plan);
    const [dur, intensity, state] = plan.c;
    const rows = plan.i.map((it, idx) => {
      const isA = it.t === 'a';
      const obj = isA ? asanaById(it.id) : breathById(it.id);
      const fig = isA ? buildFigure(obj.pose, currentChar) : `<div style="font-size:1.8rem">${STATES[obj.state].emoji}</div>`;
      const sub = isA ? obj.translation : (obj.translation || obj.sanskrit);
      return `<div class="plan-item">
        <span class="pi-num">${idx + 1}</span>
        <div class="pi-fig">${fig}</div>
        <div class="pi-main"><b>${obj.name}</b><span class="muted">${isA ? '🧘 асана' : '🌬 дыхание'} · ${sub}</span></div>
        <span class="pi-dur">${fmt(itemDur(it))}</span>
      </div>`;
    }).join('');

    const defaultStart = new Date(Date.now() + 10 * 60000);
    const result = document.getElementById('gen-result');
    result.innerHTML = `<div class="fade-in" style="margin-top:28px">
      <h2>Твоя тренировка готова</h2>
      <div class="plan-summary">
        <span>🕒 ~${Math.round(totalSec / 60)} мин</span>
        <span>🧘 ${nA} асан</span>
        <span>🌬 ${nB} практик дыхания</span>
        <span>${STATES[state].emoji} ${STATES[state].name.toLowerCase()}</span>
      </div>
      <div class="plan-list">${rows}</div>
      <button class="btn block" id="start-now">Начать сейчас ▶</button>

      <div class="share-box">
        <h3>Позвать друга 🤝</h3>
        <p class="muted">Выбери время старта — пришли ссылку другу, и вы начнёте практику одновременно, каждый у себя.</p>
        <div class="share-row" style="margin-bottom:12px">
          <input type="datetime-local" id="start-time" value="${toLocalInput(defaultStart)}" />
          <button class="btn" id="make-link">Создать ссылку</button>
        </div>
        <div class="share-row" id="link-row" hidden>
          <input type="text" id="share-link" readonly />
          <button class="btn ghost" id="copy-link">Копировать</button>
        </div>
        <div id="share-extra"></div>
      </div>
    </div>`;

    document.getElementById('start-now').onclick = () => { clearScreen(); playWorkout(plan, app); };
    document.getElementById('make-link').onclick = () => {
      const t = new Date(document.getElementById('start-time').value).getTime();
      const base = location.origin === 'null'
        ? location.href.split('#')[0]
        : location.origin + location.pathname;
      const url = base + '#/shared?w=' + enc(plan) + '&t=' + t;
      document.getElementById('link-row').hidden = false;
      const inp = document.getElementById('share-link');
      inp.value = url;
      const startStr = new Date(t).toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'long' });
      document.getElementById('share-extra').innerHTML =
        `<p class="muted" style="margin-top:12px">Старт: <b>${startStr}</b>. Друг откроет ссылку — увидит обратный отсчёт до общего старта.</p>
         <div class="share-row">
           <a class="btn ghost" target="_blank" href="https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent('Давай вместе на йогу в ' + startStr + ' 🧘')}">Telegram</a>
           <a class="btn ghost" target="_blank" href="https://wa.me/?text=${encodeURIComponent('Давай вместе на йогу в ' + startStr + ' 🧘 ' + url)}">WhatsApp</a>
         </div>`;
    };
    document.getElementById('copy-link').onclick = async () => {
      const inp = document.getElementById('share-link');
      try { await navigator.clipboard.writeText(inp.value); }
      catch (e) { inp.select(); document.execCommand('copy'); }
      document.getElementById('copy-link').textContent = 'Скопировано ✓';
    };
    result.scrollIntoView({ behavior: 'smooth' });
  }

  function toLocalInput(d) {
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /* =========================================================
     ПЛЕЕР ТРЕНИРОВКИ
     ========================================================= */
  function playWorkout(plan, mount) {
    const items = plan.i.map(it => ({ ...it, dur: itemDur(it) }));
    const totalSec = items.reduce((s, it) => s + it.dur, 0);
    let idx = 0, remaining = 0, elapsed = 0, paused = false;
    let tick = null, breathStop = null, cueTimer = null;

    mount.innerHTML = `<div class="fade-in">
      <div class="back-link" data-go="#/generator">← К генератору</div>
      <div class="player-progress"><div id="pp-bar"></div></div>
      <div class="player">
        <div class="stage">
          <div class="figure-wrap" id="pl-fig"></div>
          <div class="muscle-map" id="pl-map"></div>
        </div>
        <div>
          <span class="badge purple" id="pl-step"></span>
          <h1 id="pl-name" style="margin-top:10px"></h1>
          <div class="sanskrit" id="pl-sub"></div>
          <div class="player-timer" id="pl-timer"></div>
          <div class="player-cue" id="pl-cue"></div>
          <div class="player-controls">
            <button class="btn ghost" id="pl-prev">⏮ Назад</button>
            <button class="btn" id="pl-toggle">⏸ Пауза</button>
            <button class="btn ghost" id="pl-next">Дальше ⏭</button>
          </div>
          <p class="muted" id="pl-next-label" style="margin-top:14px"></p>
        </div>
      </div>
    </div>`;

    const $ = id => document.getElementById(id);
    const stopBreath = () => { if (breathStop) { breathStop(); breathStop = null; } };
    const stopAll = () => { clearInterval(tick); clearInterval(cueTimer); stopBreath(); stopSpeak(); };

    function setCueRotator(cues, speakCues) {
      let c = 0;
      $('pl-cue').textContent = '🧘 ' + cues[0];
      clearInterval(cueTimer);
      cueTimer = setInterval(() => {
        if (paused) return;
        c = (c + 1) % cues.length;
        $('pl-cue').textContent = '🧘 ' + cues[c];
        if (speakCues) speak(cues[c]); // голос наставника проговаривает подсказку
      }, 6000);
    }

    function runItem() {
      stopBreath();
      const it = items[idx];
      remaining = it.dur;
      $('pp-bar').style.width = (elapsed / totalSec * 100) + '%';
      $('pl-step').textContent = `Шаг ${idx + 1} из ${items.length} · ${it.t === 'a' ? 'асана' : 'дыхание'}`;
      const nextIt = items[idx + 1];
      $('pl-next-label').textContent = nextIt
        ? 'Далее: ' + (nextIt.t === 'a' ? asanaById(nextIt.id).name : breathById(nextIt.id).name)
        : 'Это завершающая практика 🙏';

      if (it.t === 'a') {
        const a = asanaById(it.id);
        animateFigure($('pl-fig'), a.pose, currentChar);
        $('pl-map').innerHTML = buildMuscleMap(a.muscles);
        $('pl-map').style.display = '';
        $('pl-name').textContent = a.name;
        $('pl-sub').textContent = a.sanskrit + ' · ' + a.translation;
        $('pl-timer').textContent = fmt(remaining);
        speak(a.name + '. ' + a.translation);
        setCueRotator([...a.cues, ...REMINDERS], true);
      } else {
        const b = breathById(it.id);
        $('pl-fig').innerHTML = `<div class="breath-orb-wrap"><div class="ring"></div><div class="breath-orb ${b.state}" id="pl-orb"></div></div>`;
        $('pl-map').style.display = 'none';
        $('pl-name').textContent = b.name;
        $('pl-sub').textContent = b.sanskrit + (b.translation ? ' · ' + b.translation : '');
        setCueRotator([...b.cues, 'Останься в осознанности', 'Дыши только через нос'], false);
        speak(b.name);
        let lastPhase = '';
        breathStop = startBreath(b.pattern, $('pl-orb'), (phase, sec) => {
          $('pl-timer').textContent = phase + ' · ' + sec;
          if (phase !== lastPhase) { lastPhase = phase; speak(phase); } // голос ведёт дыхание
        }, () => paused);
      }
    }

    function next() { if (idx < items.length - 1) { idx++; runItem(); } else finish(); }
    function prev() { if (idx > 0) { idx--; runItem(); } }
    function finish() {
      stopAll();
      speak('Намасте. Практика завершена.');
      $('pp-bar').style.width = '100%';
      mount.querySelector('.player').innerHTML = `<div class="empty" style="grid-column:1/-1">
        <div style="font-size:4rem">🙏</div>
        <h1>Намасте</h1>
        <p class="muted">Практика завершена. Побудь немного в этом состоянии покоя.</p>
        <div class="player-controls" style="justify-content:center">
          <button class="btn" id="pl-again">Повторить</button>
          <button class="btn ghost" data-go="#/generator">Новая тренировка</button>
        </div></div>`;
      const again = document.getElementById('pl-again');
      if (again) again.onclick = () => { clearScreen(); playWorkout(plan, mount); };
    }

    tick = setInterval(() => {
      if (paused) return;
      remaining--; elapsed++;
      $('pp-bar').style.width = Math.min(100, elapsed / totalSec * 100) + '%';
      if (items[idx].t === 'a') $('pl-timer').textContent = fmt(Math.max(0, remaining));
      if (remaining <= 0) next();
    }, 1000);

    $('pl-toggle').onclick = () => { paused = !paused; $('pl-toggle').textContent = paused ? '▶ Продолжить' : '⏸ Пауза'; };
    $('pl-next').onclick = () => { elapsed += Math.max(0, remaining); next(); };
    $('pl-prev').onclick = prev;

    runItem();
    teardown = stopAll;
  }

  /* =========================================================
     ЭКРАН: ОБЩАЯ ТРЕНИРОВКА С ДРУГОМ (обратный отсчёт)
     ========================================================= */
  function renderShared(query) {
    const params = new URLSearchParams(query || '');
    const plan = dec(params.get('w') || '');
    const t = +params.get('t');
    if (!plan) { app.innerHTML = `<div class="empty"><h1>Ссылка не читается 😕</h1><p class="muted">Попроси друга прислать ссылку заново.</p><button class="btn" data-go="#/generator">Собрать свою тренировку</button></div>`; return; }
    const { totalSec, nA, nB } = planSummary(plan);
    const [dur, intensity, state] = plan.c;
    const startStr = new Date(t).toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'long' });

    app.innerHTML = `<div class="fade-in" style="text-align:center">
      <div class="screen-head"><div class="kicker">Совместная практика</div>
        <h1>Друг зовёт на йогу 🤝</h1>
        <p class="muted">Начинаете одновременно в <b>${startStr}</b>. Каждый у себя, но вместе.</p>
      </div>
      <div class="share-box" style="max-width:520px;margin:0 auto;text-align:center">
        <div class="plan-summary" style="justify-content:center">
          <span>🕒 ~${Math.round(totalSec / 60)} мин</span><span>🧘 ${nA} асан</span>
          <span>🌬 ${nB} дыхания</span><span>${STATES[state].emoji} ${STATES[state].name.toLowerCase()}</span>
        </div>
        <div style="margin:24px 0">
          <div class="muted">До общего старта</div>
          <div class="countdown" id="cd">—</div>
        </div>
        <button class="btn block" id="join-now">Начать сейчас, не дожидаясь</button>
      </div>
    </div>`;

    document.getElementById('join-now').onclick = () => { clearScreen(); playWorkout(plan, app); };
    const cd = document.getElementById('cd');
    const upd = () => {
      const left = Math.round((t - Date.now()) / 1000);
      if (isNaN(t)) { cd.textContent = 'старт в любой момент'; return; }
      if (left <= 0) { clearInterval(timer); clearScreen(); playWorkout(plan, app); return; }
      const h = Math.floor(left / 3600), m = Math.floor((left % 3600) / 60), s = left % 60;
      cd.textContent = (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    };
    upd();
    const timer = setInterval(upd, 1000);
    teardown = () => clearInterval(timer);
  }

  /* =========================================================
     ЭКРАН: СОВЕТЫ · ЦИТАТЫ · ФАКТЫ
     ========================================================= */
  function renderTips() {
    const typeLabel = { quote: 'цитата', fact: 'интересный факт', tip: 'рекомендация' };
    const cards = TIPS.map(t => {
      if (t.type === 'quote') {
        return `<div class="tip-card quote"><div class="tip-type quote">${typeLabel.quote}</div>«${t.text}»<div class="tip-author">— ${t.author}</div></div>`;
      }
      return `<div class="tip-card ${t.type}"><div class="tip-type ${t.type}">${typeLabel[t.type]}</div>${t.text}</div>`;
    }).join('');
    app.innerHTML = `<div class="fade-in">
      <div class="screen-head"><div class="kicker">Раздел 4</div>
        <h1>Советы, цитаты и факты</h1>
        <p class="muted">Мудрость традиции и практические рекомендации для практикующих.</p>
      </div>
      <div class="tips-grid">${cards}</div>
    </div>`;
  }

  /* =========================================================
     РОУТЕР
     ========================================================= */
  function setActiveNav(route) {
    document.querySelectorAll('#main-nav a').forEach(a =>
      a.classList.toggle('active', a.dataset.route === route));
  }

  function router() {
    clearScreen();
    const hash = location.hash.replace(/^#\//, '') || 'asanas';
    const [path, query] = hash.split('?');
    const parts = path.split('/');
    const route = parts[0] || 'asanas';
    setActiveNav(['asanas', 'breath', 'generator', 'tips'].includes(route) ? route : '');
    window.scrollTo(0, 0);

    if (route === 'asanas')        parts[1] ? renderAsanaDetail(parts[1]) : renderAsanaList();
    else if (route === 'breath')   parts[1] ? renderBreathDetail(parts[1]) : renderBreathList();
    else if (route === 'generator') renderGenerator();
    else if (route === 'tips')     renderTips();
    else if (route === 'shared')   renderShared(query);
    else renderAsanaList();
  }

  /* =========================================================
     ВЫБОР ПЕРСОНАЖА (модалка) + общая навигация
     ========================================================= */
  function updateHeaderChar() {
    document.getElementById('char-pick-emoji').textContent = CHARACTERS[currentChar].emoji;
  }
  function buildCharModal() {
    const grid = document.getElementById('char-grid');
    grid.innerHTML = Object.entries(CHARACTERS).map(([k, c]) =>
      `<div class="char-card ${k === currentChar ? 'active' : ''}" data-char="${k}">
        <div class="cc-emoji">${c.emoji}</div><div class="cc-name">${c.name}</div></div>`).join('');
    grid.querySelectorAll('.char-card').forEach(card => card.onclick = () => {
      currentChar = card.dataset.char; localStorage.setItem('prana.char', currentChar);
      grid.querySelectorAll('.char-card').forEach(x => x.classList.toggle('active', x.dataset.char === currentChar));
      updateHeaderChar(); router(); // перерисуем экран с новым персонажем
    });
  }

  function updateVoiceIcon() {
    const btn = document.getElementById('voice-pick');
    document.getElementById('voice-pick-icon').textContent = voiceOn ? '🔊' : '🔈';
    btn.classList.toggle('on', voiceOn);
    btn.title = voiceOn ? 'Голос наставника: вкл' : 'Голос наставника: выкл';
  }

  function init() {
    updateHeaderChar();
    buildCharModal();
    const modal = document.getElementById('char-modal');
    document.getElementById('char-pick').onclick = () => modal.hidden = false;
    document.getElementById('char-close').onclick = () => modal.hidden = true;
    modal.onclick = e => { if (e.target === modal) modal.hidden = true; };

    // переключатель голоса наставника
    const voiceBtn = document.getElementById('voice-pick');
    if (!hasSpeech) { voiceBtn.style.display = 'none'; }
    else {
      updateVoiceIcon();
      voiceBtn.onclick = () => {
        voiceOn = !voiceOn; localStorage.setItem('prana.voice', voiceOn ? '1' : '0');
        updateVoiceIcon();
        if (voiceOn) speak('Голос наставника включён'); else stopSpeak();
      };
    }

    // делегирование переходов по data-go
    document.body.addEventListener('click', e => {
      const el = e.target.closest('[data-go]');
      if (el) { e.preventDefault(); location.hash = el.dataset.go; }
    });

    window.addEventListener('hashchange', router);
    router();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
