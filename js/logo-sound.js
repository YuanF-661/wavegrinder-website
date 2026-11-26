// Wave Grinder 网站的声音互动（首页 logo + 作品列表）
// 电脑：鼠标悬停 → 出声；移开后淡出。手机：按住 → 出声；松手后淡出。
//
// 首页 logo：每次随机组合和弦（7 种 × 不同根音）+ 音色（6 种）+ 细节层（海浪、风铃、低音、空气声），
//           logo 摆动、声波纹扩散，logo 下方画出实时波形。
// 作品列表：每个作品有自己的一小段声音（颂钵 / 龙舟鼓 / 鬼屋氛围），标题旁画出同色波形。
// 同一时间只有一个在发声。所有声音都在浏览器里实时合成，不需要音频文件。
//
// 浏览器规定：访客在页面上点击 / 轻触 / 按键之前，网页不能发声。
// 所以视觉效果随时可用，声音在访客第一次与页面互动后才会出现，提示文字会说明。

(() => {
  // 能发声的元素：首页 logo，以及作品列表里带 data-sound 的每一项
  const logoEl = document.querySelector('.sound-mark');
  const hint = document.querySelector('.sound-hint');
  const triggers = [];
  if (logoEl && hint) {
    triggers.push({ el: logoEl, ui: hint.parentElement, canvas: document.querySelector('.sound-wave'), kind: 'logo' });
  }
  document.querySelectorAll('[data-sound]').forEach((item) => {
    const ui = item.querySelector('.work-sound');
    triggers.push({
      el: item, ui, kind: item.dataset.sound,
      canvas: ui && ui.querySelector('canvas'),
      note: ui && ui.querySelector('.work-note'),
    });
  });
  if (!triggers.length) return;
  const statusEl = logoEl || document.documentElement;

  // ── 可调设置 ──────────────────────────────────────────────
  // 想改用自己录制的声音：把文件放进 audio/ 文件夹，并在这里填路径，例如 'audio/logo-ambient.mp3'
  // 留空 = 使用下面的随机合成环境音
  const AMBIENT_FILE = '';
  const VOLUME = 0.22;       // 总音量 0–1
  const FADE_IN = 1.4;       // 淡入秒数
  const FADE_OUT = 2.4;      // 淡出秒数
  const MAX_VOICES = 3;      // 同时存在的声音上限（快速反复悬停时，旧的在淡出）
  // ─────────────────────────────────────────────────────────

  const canHover = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const TEXT = {
    idle: canHover ? '♪ Hover to listen' : '♪ Press and hold to listen',
    locked: canHover ? '♪ Click to turn on sound' : '♪ Tap once to turn on sound, then hold',
    workLocked: canHover ? '♪ click for sound' : '♪ tap, then hold',
  };
  const setHint = (text) => { if (hint) hint.textContent = text; };
  setHint(TEXT.idle);

  // ── 和声素材 ──────────────────────────────────────────────
  // tones：相对根音的半音数，都是开放排列（音与音之间留有空间），听起来更松弛
  const CHORDS = [
    { name: 'maj9', tones: [0, 7, 16, 23, 26] },
    { name: 'm9', tones: [0, 7, 15, 22, 26] },
    { name: 'm11', tones: [0, 7, 10, 15, 17] },
    { name: 'maj7♯11', tones: [0, 7, 16, 18, 23] },
    { name: '6/9', tones: [0, 7, 14, 16, 21] },
    { name: 'sus2', tones: [0, 7, 14, 19, 24] },
    { name: 'quartal', tones: [0, 5, 10, 15, 20] },
  ];
  const ROOT_LOW = 43;  // G2
  const ROOT_HIGH = 52; // E3
  const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

  // level：各音色的音量补偿，让每种音色听起来差不多一样响
  // look：波形的画法和颜色（light = 浅色模式，画在绿底上；dark = 深色模式，画在酒红底上）
  const PATCHES = [
    { name: 'Warm pad', level: 0.9, build: warmPad, look: { style: 'smooth', light: '#8C3A1E', dark: '#F0A38A' } },
    { name: 'Glass', level: 2.0, build: glass, look: { style: 'mirror', light: '#2F3E6B', dark: '#A9B8F0' } },
    { name: 'Choir', level: 2.2, build: choir, look: { style: 'layers', light: '#5B2A4F', dark: '#E8A6C4' } },
    { name: 'Strings', level: 2.0, build: strings, look: { style: 'strands', light: '#7A4E0E', dark: '#E9B872' } },
    { name: 'Felt keys', level: 2.2, build: feltKeys, look: { style: 'bars', light: '#1F5F57', dark: '#9FE0D2' } },
    { name: 'Organ', level: 3.6, build: organ, look: { style: 'steps', light: '#3D5A26', dark: '#BFD9A0' } },
  ];
  const DEFAULT_LOOK = { style: 'smooth', light: '#572525', dark: '#89C3B7' }; // 用自己的音频文件时

  // ── 状态 ──────────────────────────────────────────────────
  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx, master, reverb, echo, analyser, noiseBuf, fileBuf;
  const voices = [];   // 正在发声的声音（包括淡出中的）
  let current = null;  // 这次悬停 / 按住对应的声音
  let activeT = null;  // 正被悬停 / 按住的元素（logo 或某个作品）
  let drawT = null;    // 正在画波形的元素
  let playing = false; // 这次悬停 / 按住是否已经出声
  let lastChord = -1;
  let lastPatch = -1;
  let force = null;    // 仅调试用：指定音色

  // ── 工具函数 ──────────────────────────────────────────────
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
  const spread = (i, n) => (n > 1 ? -0.6 + (1.2 * i) / (n - 1) : 0);
  const pickIndex = (n, avoid) => {
    let i;
    do { i = Math.floor(Math.random() * n); } while (n > 1 && i === avoid);
    return i;
  };
  const gainNode = (value) => {
    const g = ctx.createGain();
    g.gain.value = value;
    return g;
  };

  // ── 音频引擎 ──────────────────────────────────────────────
  function setup() {
    if (ctx || !AC) return;
    ctx = new AC();
    statusEl.dataset.audio = ctx.state;
    ctx.onstatechange = () => { statusEl.dataset.audio = ctx.state; };

    master = gainNode(VOLUME);
    const limiter = ctx.createDynamicsCompressor();
    analyser = ctx.createAnalyser(); // 读取正在播放的声音，用来画波形
    analyser.fftSize = 2048;
    master.connect(limiter).connect(analyser).connect(ctx.destination);

    // 混响：约 3.5 秒的柔和空间
    reverb = ctx.createConvolver();
    reverb.buffer = impulse(3.5);
    const wet = gainNode(0.8);
    reverb.connect(wet).connect(master);

    // 回声：用在琴音和风铃上，每次回声都更暗一点
    echo = ctx.createDelay(2);
    echo.delayTime.value = 0.43;
    const darken = ctx.createBiquadFilter();
    darken.type = 'lowpass';
    darken.frequency.value = 2200;
    const feedback = gainNode(0.38);
    echo.connect(darken).connect(feedback).connect(echo);
    const echoOut = gainNode(0.6);
    darken.connect(echoOut);
    echoOut.connect(master);
    echoOut.connect(reverb);

    if (AMBIENT_FILE) {
      fetch(AMBIENT_FILE)
        .then((r) => r.arrayBuffer())
        .then((b) => ctx.decodeAudioData(b))
        .then((b) => { fileBuf = b; })
        .catch(() => {}); // 文件读不到就继续用合成音
    }
    loadWorkAudio();
  }

  // 第一次点击 / 轻触 / 按键时解锁声音（页面任何位置都可以）
  function unlock() {
    setup();
    if (!ctx) return;
    if (ctx.state === 'running') return onReady();
    const silent = ctx.createBufferSource(); // iOS 需要在手势里播放一下才会真正解锁
    silent.buffer = ctx.createBuffer(1, 1, 22050);
    silent.connect(ctx.destination);
    silent.start();
    ctx.resume().then(onReady).catch(() => {});
  }
  ['pointerdown', 'touchend', 'keydown', 'click'].forEach((type) =>
    addEventListener(type, unlock, { capture: true, passive: true }));

  // 声音刚解锁时，如果访客正悬停 / 按住着某个元素，马上开始播放
  function onReady() {
    if (!activeT || (activeT.kind !== 'logo' && !hasAudio(activeT))) return;
    if (!playing && startSound(activeT)) {
      playing = true;
      if (activeT.note) activeT.note.textContent = '♪';
    }
  }

  function startSound(t) {
    if (!ctx || ctx.state !== 'running') return false;
    if (t.kind !== 'logo' && !(WORKS[t.kind] && WORKS[t.kind].buffer)) return false; // 录音还没下载好
    while (voices.length >= MAX_VOICES) killVoice(voices[0]);
    if (t.kind === 'logo') current = fileBuf ? fileVoice() : createVoice();
    else current = workVoice(t.kind);
    voices.push(current);
    fadeVoice(current, 1, current.fadeIn ?? FADE_IN);
    look = current.look;
    if (t.kind === 'logo') {
      // 每次的摆动和声波纹速度略有不同；声波纹换成这个音色的颜色
      t.el.style.setProperty('--sway-dur', rand(3.4, 5.2).toFixed(2) + 's');
      t.el.style.setProperty('--ripple-dur', rand(3.2, 4.8).toFixed(2) + 's');
      t.el.style.setProperty('--voice-color', lookColor());
    }
    showWave(t);
    return true;
  }

  function stopSound() {
    if (!current) return;
    releaseVoice(current);
    current = null;
  }

  // 每个"声音"共用的骨架：音量淡入淡出、混响、回声
  function baseVoice(level, voiceLook, label, reverbAmount = rand(0.45, 0.85)) {
    const v = { label, look: voiceLook, sources: [], nodes: [], timers: [], alive: true };
    v.out = track(v, gainNode(0));            // 整个声音的淡入淡出
    v.out.connect(master);
    const reverbSend = track(v, gainNode(reverbAmount));
    v.out.connect(reverbSend).connect(reverb);
    v.bus = track(v, gainNode(level));        // 音色输出
    v.bus.connect(v.out);
    v.echoSend = track(v, gainNode(1));
    v.echoSend.connect(echo);
    return v;
  }

  // ── logo 的声音 = 随机和弦 + 随机音色 + 随机细节层 ───────────
  function createVoice() {
    const ci = pickIndex(CHORDS.length, lastChord);
    const pi = force ? force.patch : pickIndex(PATCHES.length, lastPatch);
    lastChord = ci;
    lastPatch = pi;
    const chord = CHORDS[ci];
    const patch = PATCHES[pi];
    const root = ROOT_LOW + Math.floor(Math.random() * (ROOT_HIGH - ROOT_LOW + 1));

    // label 不显示，调试时可查看
    const v = baseVoice(patch.level, patch.look, `${NOTE_NAMES[root % 12]} ${chord.name} · ${patch.name}`);
    v.freqs = chord.tones.map((t) => mtof(root + t));

    patch.build(v);

    const textures = force ? force.textures : true;
    if (textures) {
      if (Math.random() < 0.55) waves(v);
      if (Math.random() < 0.6 && patch.build !== feltKeys) chimes(v);
      if (Math.random() < 0.45) sub(v);
      if (Math.random() < 0.3) air(v);
    }
    return v;
  }

  function fileVoice() {
    const v = { sources: [], nodes: [], timers: [], alive: true, label: AMBIENT_FILE, look: DEFAULT_LOOK };
    v.out = track(v, gainNode(0));
    v.out.connect(master);
    const s = ctx.createBufferSource();
    s.buffer = fileBuf;
    s.loop = true;
    s.connect(v.out);
    s.start();
    v.sources.push(s);
    return v;
  }

  function track(v, node) {
    v.nodes.push(node);
    return node;
  }

  function fadeVoice(v, value, seconds) {
    const t = ctx.currentTime;
    const g = v.out.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(value, t + seconds);
  }

  // 正常结束：慢慢淡出后清理
  function releaseVoice(v) {
    if (!v.alive) return;
    v.alive = false;
    v.timers.forEach(clearTimeout);
    const fade = v.fadeOut ?? FADE_OUT;
    fadeVoice(v, 0, fade);
    setTimeout(() => killVoice(v), (fade + 0.4) * 1000);
  }

  // 立即清理（0.1 秒快速淡出，避免爆音）
  function killVoice(v) {
    const i = voices.indexOf(v);
    if (i < 0) return;
    voices.splice(i, 1);
    v.alive = false;
    v.timers.forEach(clearTimeout);
    fadeVoice(v, 0, 0.08);
    const when = ctx.currentTime + 0.1;
    v.sources.forEach((s) => { try { s.stop(when); } catch (e) { /* already stopped */ } });
    setTimeout(() => v.nodes.forEach((n) => n.disconnect()), 300);
  }

  // ── 合成积木 ──────────────────────────────────────────────
  function osc(v, type, freq, detune, dest) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    o.connect(dest);
    o.start();
    v.sources.push(o);
    return o;
  }

  // 低频振荡器：让某个参数缓慢起伏（音量呼吸、音色明暗、声像漂移……）
  function lfo(v, rate, depth, param) {
    const o = ctx.createOscillator();
    o.frequency.value = rate;
    const g = track(v, gainNode(depth));
    o.connect(g).connect(param);
    o.start(ctx.currentTime + rand(0, 0.5));
    v.sources.push(o);
  }

  function filter(v, type, freq, q = 0.5) {
    const f = track(v, ctx.createBiquadFilter());
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  // 声像：把声音放在左右某个位置，并可缓慢漂移
  function panTo(v, position, dest, drift = 0) {
    if (!ctx.createStereoPanner) return dest;
    const p = track(v, ctx.createStereoPanner());
    p.pan.value = position;
    p.connect(dest);
    if (drift) lfo(v, rand(0.03, 0.08), drift, p.pan);
    return p;
  }

  // 每隔一段随机时间做一件事（只要这个声音还在）
  function every(v, minGap, maxGap, firstDelay, fn) {
    const tick = () => {
      if (!v.alive) return;
      fn();
      v.timers.push(setTimeout(tick, rand(minGap, maxGap) * 1000));
    };
    v.timers.push(setTimeout(tick, firstDelay * 1000));
  }

  // 一个短音：快速起音 + 自然衰减（琴音、风铃）
  function pluck(v, freq, peak, decay, type, echoAmount) {
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.min(freq * 3, 9000);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(peak, t + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    const send = ctx.createGain();
    send.gain.value = echoAmount;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    o.connect(lp).connect(env);
    if (pan) {
      pan.pan.value = rand(-0.7, 0.7);
      env.connect(pan).connect(v.bus);
    } else {
      env.connect(v.bus);
    }
    env.connect(send).connect(v.echoSend);
    o.start(t);
    o.stop(t + decay + 0.05);
    o.onended = () => [o, lp, env, send, pan].forEach((n) => n && n.disconnect());
  }

  // ── 6 种音色 ──────────────────────────────────────────────
  // 温暖铺底：正弦 + 三角波轻微失谐，滤波器缓慢开合
  function warmPad(v) {
    const lp = filter(v, 'lowpass', rand(700, 1100), 0.4);
    lp.connect(v.bus);
    lfo(v, rand(0.04, 0.08), 400, lp.frequency);
    v.freqs.forEach((f, i) => {
      const g = track(v, gainNode(0.05));
      g.connect(panTo(v, spread(i, v.freqs.length), lp, 0.2));
      lfo(v, rand(0.07, 0.2), 0.03, g.gain);
      osc(v, 'sine', f, -5, g);
      osc(v, 'triangle', f, 6, g);
    });
  }

  // 玻璃：高八度的 FM 音色，泛音缓慢闪烁，透亮
  function glass(v) {
    const hp = filter(v, 'highpass', 180);
    hp.connect(v.bus);
    v.freqs.forEach((f, i) => {
      const g = track(v, gainNode(0.035));
      g.connect(panTo(v, spread(i, v.freqs.length), hp, 0.35));
      lfo(v, rand(0.1, 0.3), 0.025, g.gain);
      const carrier = osc(v, 'sine', f * 2, rand(-4, 4), g);
      const depth = track(v, gainNode(f * rand(0.3, 0.7)));
      depth.connect(carrier.frequency);
      lfo(v, rand(0.05, 0.12), f * 0.3, depth.gain);
      osc(v, 'sine', f * 2 * pick([1, 2, 3]), 0, depth);
    });
  }

  // 人声：锯齿波经过"啊"的共振峰，带轻微颤音
  function choir(v) {
    const formant1 = filter(v, 'bandpass', rand(650, 800), 3);
    const formant2 = filter(v, 'bandpass', rand(1050, 1250), 4);
    const lp = filter(v, 'lowpass', 2200);
    const mix = track(v, gainNode(1));
    mix.connect(formant1).connect(lp);
    mix.connect(formant2).connect(lp);
    lp.connect(v.bus);
    v.freqs.forEach((f, i) => {
      const g = track(v, gainNode(0.06));
      g.connect(panTo(v, spread(i, v.freqs.length), mix, 0.15));
      lfo(v, rand(0.08, 0.18), 0.03, g.gain);
      [-9, 9].forEach((d) => {
        const o = osc(v, 'sawtooth', f, d, g);
        lfo(v, rand(4.2, 5.2), 4, o.detune);
      });
    });
  }

  // 弦乐：每个音三把轻微失谐的"琴"，柔和滤波
  function strings(v) {
    const lp = filter(v, 'lowpass', rand(1000, 1600), 0.7);
    lp.connect(v.bus);
    lfo(v, rand(0.05, 0.1), 350, lp.frequency);
    v.freqs.forEach((f, i) => {
      const g = track(v, gainNode(0.022));
      g.connect(panTo(v, spread(i, v.freqs.length), lp, 0.25));
      lfo(v, rand(0.06, 0.15), 0.012, g.gain);
      [-11, 0, 11].forEach((d) => osc(v, 'sawtooth', f, d + rand(-2, 2), g));
    });
  }

  // 毛毡钢琴：很轻的铺底 + 随机弹奏和弦里的音，带回声
  function feltKeys(v) {
    const lp = filter(v, 'lowpass', 700);
    lp.connect(v.bus);
    v.freqs.slice(0, 3).forEach((f) => {
      const g = track(v, gainNode(0.03));
      g.connect(lp);
      osc(v, 'sine', f, 0, g);
    });
    const notes = v.freqs.map((f) => f * 2);
    every(v, 0.35, 1.1, 0.25, () => pluck(v, pick(notes), rand(0.05, 0.09), rand(1.6, 2.8), 'triangle', 0.5));
  }

  // 风琴：方波 + 高八度正弦，缓慢的音量颤动
  function organ(v) {
    const lp = filter(v, 'lowpass', 750);
    const tremolo = track(v, gainNode(0.8));
    lp.connect(tremolo).connect(v.bus);
    lfo(v, rand(0.25, 0.5), 0.2, tremolo.gain);
    v.freqs.forEach((f, i) => {
      const p = panTo(v, spread(i, v.freqs.length), lp, 0.1);
      const g1 = track(v, gainNode(0.018));
      g1.connect(p);
      osc(v, 'square', f, rand(-3, 3), g1);
      const g2 = track(v, gainNode(0.012));
      g2.connect(p);
      osc(v, 'sine', f * 2, 0, g2);
    });
  }

  // ── 细节层 ────────────────────────────────────────────────
  // 海浪：滤波噪声，约 7–12 秒起伏一次，在左右之间缓慢移动
  function waves(v) {
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer();
    noise.loop = true;
    const bp = filter(v, 'bandpass', rand(350, 600), 0.6);
    const swell = track(v, gainNode(0.035));
    lfo(v, rand(0.08, 0.14), 0.03, swell.gain);
    noise.connect(bp).connect(swell).connect(panTo(v, 0, v.out, 0.5));
    noise.start();
    v.sources.push(noise);
  }

  // 风铃：偶尔响起的高音，取自当前和弦，带回声
  function chimes(v) {
    every(v, 0.9, 2.8, rand(0.5, 1.4), () => {
      let f = pick(v.freqs) * 4;
      while (f > 1900) f /= 2;
      pluck(v, f, rand(0.015, 0.03), rand(2.5, 4), 'sine', 0.7);
    });
  }

  // 低音：根音上一层很轻的正弦，让声音更有包裹感
  function sub(v) {
    const g = track(v, gainNode(0.035));
    g.connect(v.out);
    lfo(v, rand(0.05, 0.1), 0.015, g.gain);
    osc(v, 'sine', v.freqs[0], 0, g);
  }

  // 空气声：极轻的高频噪声，像房间里的空气
  function air(v) {
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer();
    noise.loop = true;
    const hp = filter(v, 'highpass', 5500);
    const g = track(v, gainNode(0.006));
    noise.connect(hp).connect(g).connect(v.out);
    noise.start();
    v.sources.push(noise);
  }

  // ── 作品的声音（悬停作品时播放） ──────────────────────────────
  // file：作品的录音片段，例如 'audio/waves-of-intuition.mp3'（建议 15–30 秒、能无缝循环）。
  //       留空 = 暂时没有声音：悬停时只显示同色的动态波形（不代表真实声音）。
  // look：波形的画法和颜色，和网页上作品编号的颜色一致。level：音量补偿。
  const WORKS = {
    waves: {
      file: '', level: 1, fadeIn: 0.6, fadeOut: 2,
      label: 'Waves of Intuition', look: { style: 'mirror', light: '#2F3E6B', dark: '#A9B8F0' },
    },
    dragon: {
      file: '', level: 1, fadeIn: 0.3, fadeOut: 1.2,
      label: 'Dragon Boat Soundscape', look: { style: 'bars', light: '#8C3A1E', dark: '#F0A38A' },
    },
    playhouse: {
      file: '', level: 1, fadeIn: 0.8, fadeOut: 2,
      label: 'Playhouse of the Dead', look: { style: 'layers', light: '#5B2A4F', dark: '#E8A6C4' },
    },
  };
  const hasAudio = (t) => t.kind !== 'logo' && !!(WORKS[t.kind] && WORKS[t.kind].file);

  // 声音解锁后，提前把作品录音下载好
  function loadWorkAudio() {
    Object.values(WORKS).forEach((w) => {
      if (!w.file || w.buffer || w.loading) return;
      w.loading = true;
      fetch(w.file)
        .then((r) => r.arrayBuffer())
        .then((b) => ctx.decodeAudioData(b))
        .then((b) => { w.buffer = b; if (activeT && WORKS[activeT.kind] === w) onReady(); })
        .catch(() => { w.loading = false; });
    });
  }

  function workVoice(kind) {
    const w = WORKS[kind];
    const v = baseVoice(w.level, w.look, w.label, 0.25);
    v.fadeIn = w.fadeIn;
    v.fadeOut = w.fadeOut;
    const s = ctx.createBufferSource();
    s.buffer = w.buffer;
    s.loop = true;
    s.connect(v.bus);
    s.start();
    v.sources.push(s);
    return v;
  }

  function impulse(seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    return buf;
  }

  function noiseBuffer() {
    if (noiseBuf) return noiseBuf;
    const len = ctx.sampleRate * 2;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }

  // ── 实时波形 ──────────────────────────────────────────────
  // 画在正在发声的元素自己的 canvas 上（logo 下方，或作品标题旁边）
  const darkScheme = matchMedia('(prefers-color-scheme: dark)');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const POINTS = 120;          // 波形上的点数
  let look = DEFAULT_LOOK;     // 当前音色的画法和颜色
  let samples = null;
  let rafId = 0;
  let lastFrame = 0;
  let smoothPeak = 0;
  let silentLevel = 0;      // 无声占位波形的大小（0–1，悬停时渐大，离开时渐小）
  let dpr = 1;

  const lookColor = () => (darkScheme.matches ? look.dark : look.light);

  // silent = true：作品还没有录音，画一条同色的动态波形占位（不读取真实声音）
  function showWave(t, silent = false) {
    if (drawT && drawT !== t) hideWave(drawT);
    drawT = t;
    t.silent = silent;
    if (!t.ui || !t.canvas || (!silent && !analyser)) return;
    t.ui.classList.add('is-playing');
    t.g2d = t.g2d || t.canvas.getContext('2d');
    const r = t.canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    t.canvas.width = Math.max(1, Math.round(r.width * dpr));
    t.canvas.height = Math.max(1, Math.round(r.height * dpr));
    if (!silent) samples = samples || new Float32Array(analyser.fftSize);
    if (!rafId) rafId = requestAnimationFrame(drawFrame);
  }

  function hideWave(t) {
    if (t.ui) t.ui.classList.remove('is-playing');
    if (t.g2d) t.g2d.clearRect(0, 0, t.canvas.width, t.canvas.height);
    t.el.style.removeProperty('--voice-color');
  }

  function drawFrame(now) {
    rafId = 0;
    const t = drawT;
    if (!t || !t.g2d) return;
    const g2d = t.g2d;
    const W = t.canvas.width;
    const H = t.canvas.height;

    // 什么时候收起波形、换回提示：
    //   有声音 → 访客离开、声音也完全淡出之后；无声占位 → 访客离开、波形缩小到看不见之后
    const silent = t.silent;
    if (silent) silentLevel += ((activeT === t ? 1 : 0) - silentLevel) * 0.08;
    const finished = silent ? activeT !== t && silentLevel < 0.02 : !activeT && voices.length === 0;
    if (finished) {
      hideWave(t);
      drawT = null;
      smoothPeak = 0;
      silentLevel = 0;
      return;
    }
    rafId = requestAnimationFrame(drawFrame);
    if (reduceMotion.matches && now - lastFrame < 160) return; // 减少动态效果时，每秒只更新几次
    lastFrame = now;

    const at = silent ? silentWave(now / 1000, H) : liveWave(H);

    g2d.clearRect(0, 0, W, H);
    const color = lookColor();
    g2d.strokeStyle = color;
    g2d.fillStyle = color;
    g2d.lineJoin = 'round';
    g2d.lineCap = 'round';
    (STYLES[look.style] || STYLES.smooth)(g2d, at, W, H, color);
    g2d.globalAlpha = 1;
    g2d.shadowBlur = 0;
  }

  // 真实声音的波形
  function liveWave(H) {
    analyser.getFloatTimeDomainData(samples);
    // 从一个"向上穿过 0"的位置开始画，波形会稳定一些，不会左右乱跳
    const span = 768; // 每帧显示约 16 毫秒的声音
    let start = 0;
    for (let i = 1; i < span; i++) {
      if (samples[i - 1] < 0 && samples[i] >= 0) { start = i; break; }
    }
    let peak = 0;
    for (let i = start; i < start + span; i++) peak = Math.max(peak, Math.abs(samples[i]));
    // 自动放大：声音很轻也能看清；淡出时波形会跟着变小
    smoothPeak = Math.max(peak, smoothPeak * 0.97);
    const scale = (H * 0.42) / Math.max(smoothPeak, 0.06);
    const limit = H * 0.48;
    // 把采样压缩成 POINTS 个点：每个点取附近几个采样的平均值，线条更顺
    const bucket = Math.max(1, Math.floor((span - 32) / POINTS));
    return (offset = 0) => {
      const pts = new Array(POINTS);
      for (let k = 0; k < POINTS; k++) {
        const i0 = start + offset + Math.floor((k * (span - 32)) / (POINTS - 1));
        let sum = 0;
        for (let j = 0; j < bucket; j++) sum += samples[i0 + j];
        const y = (sum / bucket) * scale;
        pts[k] = Math.max(-limit, Math.min(limit, y));
      }
      return pts;
    };
  }

  // 无声占位：几条正弦波叠加、缓慢流动；龙舟（竖条画法）会跟着 120 BPM 的节拍跳动
  function silentWave(time, H) {
    const pulse = look.style === 'bars' ? 0.35 + 0.65 * Math.exp(-((time % 0.5) / 0.12)) : 1;
    const breathe = 0.75 + 0.25 * Math.sin(time * 0.9);
    const amp = H * 0.4 * silentLevel * pulse * breathe;
    return (offset = 0) => {
      const pts = new Array(POINTS);
      for (let k = 0; k < POINTS; k++) {
        const x = (k + offset * 0.4) / POINTS;
        pts[k] = amp * (0.55 * Math.sin(2 * Math.PI * x * 2.2 + time * 2.1)
          + 0.3 * Math.sin(2 * Math.PI * x * 5.3 - time * 3.4)
          + 0.15 * Math.sin(2 * Math.PI * x * 11 + time * 5));
      }
      return pts;
    };
  }

  function line(c, pts, W, H, dy = 0) {
    c.beginPath();
    pts.forEach((y, k) => {
      const x = (k * W) / (pts.length - 1);
      if (k) c.lineTo(x, H / 2 - y + dy); else c.moveTo(x, H / 2 - y + dy);
    });
    c.stroke();
  }

  // 6 种画法，对应 6 种音色
  const STYLES = {
    // Warm pad：粗而柔和的线，带光晕
    smooth(c, at, W, H, color) {
      c.lineWidth = 2.5 * dpr;
      c.shadowColor = color;
      c.shadowBlur = 10 * dpr;
      line(c, at(), W, H);
    },
    // Glass：细线 + 淡淡的倒影
    mirror(c, at, W, H) {
      const pts = at();
      c.lineWidth = 1.4 * dpr;
      line(c, pts, W, H);
      c.globalAlpha = 0.32;
      line(c, pts.map((y) => -y), W, H);
    },
    // Choir：三层叠在一起，像几个声部
    layers(c, at, W, H) {
      const pts = at();
      [[1, 0, 2.2, 1], [0.7, -5, 1.4, 0.55], [0.5, 5, 1, 0.35]].forEach(([amp, dy, lw, alpha]) => {
        c.globalAlpha = alpha;
        c.lineWidth = lw * dpr;
        line(c, pts.map((y) => y * amp), W, H, dy * dpr);
      });
    },
    // Strings：三根平行的细线，像琴弦
    strands(c, at, W, H) {
      [0, 10, 20].forEach((offset, i) => {
        c.globalAlpha = 1 - i * 0.28;
        c.lineWidth = 1.2 * dpr;
        line(c, at(offset), W, H, (i - 1) * 3.5 * dpr);
      });
    },
    // Felt keys：竖条，像一下下敲击
    bars(c, at, W, H) {
      const pts = at();
      // 竖条之间留出间隙（画布小时竖条少一些），安静时只剩一排小点，不会连成一条线
      const count = Math.max(8, Math.min(pts.length / 2, Math.floor(W / (5 * dpr))));
      const stride = pts.length / count;
      c.lineWidth = 2 * dpr;
      c.beginPath();
      for (let b = 0; b < count; b++) {
        const x = (b + 0.5) * (W / count);
        const h = Math.max(Math.abs(pts[Math.floor(b * stride)]), 0.8 * dpr);
        c.moveTo(x, H / 2 - h);
        c.lineTo(x, H / 2 + h);
      }
      c.stroke();
    },
    // Organ：阶梯状的方波线
    steps(c, at, W, H) {
      const pts = at().filter((_, k) => k % 4 === 0);
      const q = H / 10;
      const stepX = W / (pts.length - 1);
      c.lineWidth = 2 * dpr;
      c.lineJoin = 'miter';
      c.lineCap = 'square';
      c.beginPath();
      let prev = H / 2 - Math.round(pts[0] / q) * q;
      c.moveTo(0, prev);
      pts.forEach((y, k) => {
        const x = k * stepX;
        const yy = H / 2 - Math.round(y / q) * q;
        c.lineTo(x, prev);
        c.lineTo(x, yy);
        prev = yy;
      });
      c.lineTo(W, prev);
      c.stroke();
    },
  };

  // 切换浅色 / 深色模式时，logo 声波纹的颜色跟着换
  darkScheme.addEventListener?.('change', () => {
    if (drawT && drawT.kind === 'logo') drawT.el.style.setProperty('--voice-color', lookColor());
  });

  // ── 交互 ──────────────────────────────────────────────────
  function activate(t) {
    if (activeT === t) return;
    if (activeT) deactivate(activeT); // 同一时间只有一个在发声
    activeT = t;
    t.el.classList.add('is-active');
    if (t.kind === 'logo') t.el.setAttribute('aria-pressed', 'true');
    // 作品还没有录音：只显示同色的动态波形，不发声
    if (t.kind !== 'logo' && !hasAudio(t)) {
      playing = false;
      look = WORKS[t.kind] ? WORKS[t.kind].look : DEFAULT_LOOK;
      showWave(t, true);
      return;
    }
    playing = startSound(t);
    if (!playing) {
      if (t.kind === 'logo') setHint(TEXT.locked);
      else if (t.note) t.note.textContent = TEXT.workLocked;
    }
  }

  function deactivate(t) {
    if (!t || activeT !== t) return;
    activeT = null;
    playing = false;
    t.el.classList.remove('is-active');
    if (t.kind === 'logo') {
      t.el.setAttribute('aria-pressed', 'false');
      setHint(TEXT.idle);
    } else if (t.note) {
      t.note.textContent = '♪';
    }
    if (ctx) stopSound();
  }

  triggers.forEach((t) => {
    const { el } = t;
    // 鼠标：悬停开始，移开结束
    el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') activate(t); });
    el.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') deactivate(t); });
    // 手指 / 触控笔：按住开始，松手结束（手指滑动去滚动页面也会结束）
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      unlock();
      activate(t);
    });
    ['pointerup', 'pointercancel'].forEach((type) =>
      el.addEventListener(type, (e) => { if (e.pointerType !== 'mouse') deactivate(t); }));
    el.addEventListener('contextmenu', (e) => e.preventDefault()); // 屏蔽 Android 长按菜单
    // 键盘：Tab 到这里后按 Enter / 空格 开关
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      unlock();
      if (activeT === t) deactivate(t); else activate(t);
    });
    el.addEventListener('blur', () => deactivate(t));
  });

  // 切到别的标签页时停止
  document.addEventListener('visibilitychange', () => { if (document.hidden) deactivate(activeT); });

  // 调试用（网址加 ?sound-debug 才会出现）：逐个试听
  if (location.search.includes('sound-debug')) {
    const logoT = triggers.find((t) => t.kind === 'logo');
    window.wgSound = {
      patches: PATCHES.map((p) => p.name),
      works: Object.keys(WORKS),
      play(patch, textures = true) { force = { patch, textures }; deactivate(activeT); activate(logoT); },
      playWork(kind) { force = null; deactivate(activeT); activate(triggers.find((t) => t.kind === kind)); },
      stop() { force = null; deactivate(activeT); },
      setLevel(patch, level) { PATCHES[patch].level = level; },
      setWorkLevel(kind, level) { WORKS[kind].level = level; },
      now: () => (current ? current.label : ''),
    };
  }
})();
