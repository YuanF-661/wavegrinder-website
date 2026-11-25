// Wave Grinder 首页 logo 互动
// 电脑：鼠标悬停 → logo 摆动 + 声波纹 + 环境音；移开后淡出
// 手机：按住 → 同样效果；松手后淡出
//
// 每次触发都会随机组合：和弦（7 种 × 不同根音）+ 音色（6 种）+ 细节层（海浪、风铃、低音、空气声）
// 和弦与音色都不会和上一次重复。所有声音都在浏览器里实时合成，不需要音频文件。
// 出声时，logo 下方显示实时波形；每种音色有自己的颜色和画法，声波纹也换成同样的颜色。
//
// 浏览器规定：访客在页面上点击 / 轻触 / 按键之前，网页不能发声。
// 所以视觉效果随时可用，声音在访客第一次与页面互动后才会出现，提示文字会说明。

(() => {
  const el = document.querySelector('.sound-mark');
  const hint = document.querySelector('.sound-hint');
  const wave = document.querySelector('.sound-wave');
  if (!el || !hint) return;
  const ui = hint.parentElement;

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
  };
  const setHint = (text) => { hint.textContent = text; };
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
  let active = false;  // 是否正处于悬停 / 按住状态
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
    el.dataset.audio = ctx.state;
    ctx.onstatechange = () => { el.dataset.audio = ctx.state; };

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

  // 声音刚解锁时，如果访客正悬停 / 按住着 logo，马上开始播放
  function onReady() {
    if (active && !playing && startSound()) playing = true;
  }

  function startSound() {
    if (!ctx || ctx.state !== 'running') return false;
    while (voices.length >= MAX_VOICES) killVoice(voices[0]);
    current = fileBuf ? fileVoice() : createVoice();
    voices.push(current);
    fadeVoice(current, 1, FADE_IN);
    // 每次的摆动和声波纹速度也略有不同
    el.style.setProperty('--sway-dur', rand(3.4, 5.2).toFixed(2) + 's');
    el.style.setProperty('--ripple-dur', rand(3.2, 4.8).toFixed(2) + 's');
    // 波形和声波纹换成这个音色的颜色
    look = current.look;
    el.style.setProperty('--voice-color', lookColor());
    ui.classList.add('is-playing');
    startDrawing();
    return true;
  }

  function stopSound() {
    if (!current) return;
    releaseVoice(current);
    current = null;
  }

  // ── 一个"声音"= 随机和弦 + 随机音色 + 随机细节层 ───────────
  function createVoice(options = {}) {
    const ci = pickIndex(CHORDS.length, lastChord);
    const pi = force ? force.patch : pickIndex(PATCHES.length, lastPatch);
    lastChord = ci;
    lastPatch = pi;
    const chord = CHORDS[ci];
    const patch = PATCHES[pi];
    const root = ROOT_LOW + Math.floor(Math.random() * (ROOT_HIGH - ROOT_LOW + 1));

    const v = {
      freqs: chord.tones.map((t) => mtof(root + t)),
      label: `${NOTE_NAMES[root % 12]} ${chord.name} · ${patch.name}`, // 不显示，调试时可查看
      look: patch.look,
      sources: [], nodes: [], timers: [], alive: true,
    };
    v.out = track(v, gainNode(0));            // 整个声音的淡入淡出
    v.out.connect(master);
    const reverbSend = track(v, gainNode(rand(0.45, 0.85)));
    v.out.connect(reverbSend).connect(reverb);
    v.bus = track(v, gainNode(patch.level));  // 音色输出
    v.bus.connect(v.out);
    v.echoSend = track(v, gainNode(1));
    v.echoSend.connect(echo);

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
    fadeVoice(v, 0, FADE_OUT);
    setTimeout(() => killVoice(v), (FADE_OUT + 0.4) * 1000);
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
  const g2d = wave ? wave.getContext('2d') : null;
  const darkScheme = matchMedia('(prefers-color-scheme: dark)');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const POINTS = 120;          // 波形上的点数
  let look = DEFAULT_LOOK;     // 当前音色的画法和颜色
  let samples = null;
  let rafId = 0;
  let lastFrame = 0;
  let smoothPeak = 0;
  let dpr = 1;

  const lookColor = () => (darkScheme.matches ? look.dark : look.light);

  function startDrawing() {
    if (!g2d || !analyser || rafId) return;
    const r = wave.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    wave.width = Math.max(1, Math.round(r.width * dpr));
    wave.height = Math.max(1, Math.round(r.height * dpr));
    samples = samples || new Float32Array(analyser.fftSize);
    rafId = requestAnimationFrame(drawFrame);
  }

  function drawFrame(now) {
    rafId = 0;
    const W = wave.width;
    const H = wave.height;

    // 访客没在悬停、声音也已经完全淡出：收起波形，换回提示文字
    if (!active && voices.length === 0) {
      g2d.clearRect(0, 0, W, H);
      ui.classList.remove('is-playing');
      el.style.removeProperty('--voice-color');
      smoothPeak = 0;
      return;
    }
    rafId = requestAnimationFrame(drawFrame);
    if (reduceMotion.matches && now - lastFrame < 160) return; // 减少动态效果时，每秒只更新几次
    lastFrame = now;

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
    const at = (offset = 0) => {
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
      const step = W / pts.length;
      c.lineWidth = Math.max(2 * dpr, step * 1.1);
      c.beginPath();
      for (let k = 0; k < pts.length; k += 2) {
        const x = k * step + step;
        const h = Math.max(Math.abs(pts[k]), 1.5 * dpr);
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

  // 切换浅色 / 深色模式时，声波纹颜色跟着换
  darkScheme.addEventListener?.('change', () => {
    if (ui.classList.contains('is-playing')) el.style.setProperty('--voice-color', lookColor());
  });

  // ── 交互 ──────────────────────────────────────────────────
  function activate() {
    if (active) return;
    active = true;
    el.classList.add('is-active');
    el.setAttribute('aria-pressed', 'true');
    playing = startSound();
    if (!playing) setHint(TEXT.locked);
  }

  function deactivate() {
    if (!active) return;
    active = false;
    playing = false;
    el.classList.remove('is-active');
    el.setAttribute('aria-pressed', 'false');
    if (ctx) stopSound();
    setHint(TEXT.idle);
  }

  // 鼠标：悬停开始，移开结束
  el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') activate(); });
  el.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') deactivate(); });

  // 手指 / 触控笔：按住开始，松手结束（手指滑动去滚动页面也会结束）
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    unlock();
    activate();
  });
  ['pointerup', 'pointercancel'].forEach((type) =>
    el.addEventListener(type, (e) => { if (e.pointerType !== 'mouse') deactivate(); }));
  el.addEventListener('contextmenu', (e) => e.preventDefault()); // 屏蔽 Android 长按菜单

  // 键盘：Tab 到 logo 后按 Enter / 空格 开关
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    unlock();
    if (active) deactivate(); else activate();
  });
  el.addEventListener('blur', deactivate);

  // 切到别的标签页时停止
  document.addEventListener('visibilitychange', () => { if (document.hidden) deactivate(); });

  // 调试用（网址加 ?sound-debug 才会出现）：逐个试听音色
  if (location.search.includes('sound-debug')) {
    window.wgSound = {
      patches: PATCHES.map((p) => p.name),
      play(patch, textures = true) { force = { patch, textures }; deactivate(); activate(); },
      stop() { force = null; deactivate(); },
      setLevel(patch, level) { PATCHES[patch].level = level; },
      now: () => (current ? current.label : ''),
    };
  }
})();
