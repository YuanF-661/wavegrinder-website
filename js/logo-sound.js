// Wave Grinder 网站的声音互动（首页 logo + 作品列表）
// 电脑：鼠标悬停 → 出声；移开后淡出。手机：按住 → 出声；松手后淡出。
//
// 首页 logo：每次随机组合和弦（7 种 × 不同根音）+ 音色（6 种）+ 细节层（海浪、风铃、低音、空气声），
//           logo 摆动、声波纹扩散，logo 下方画出实时波形。
// 作品列表：每个作品有自己的一小段声音（颂钵 / 龙舟鼓 / 鬼屋氛围），标题旁画出同色波形。
// 同一时间只有一个在发声。所有声音都在浏览器里实时合成，不需要音频文件。
//
// 小方块：logo 出声时，右边出现一个小方块。离开 / 松开 logo 后，在声音消失前点方块，
//         pad 会接着响下去；方块上不同位置弹出不同的短音（左低右高、上亮下柔），
//         这些音都取自这次和弦配套的五声音阶，所以怎么点都和谐。
//         按住方块（或按住拖动）进入演奏模式：围绕手指的位置自动弹奏，手指移动就跟着变调，
//         按得越久声音越空灵（长混响和回声慢慢叠高），松开后慢慢退回。
// 推子：logo 和方块上方各有一条细细的音量推子（Pad / Notes），摸上去才展开、显示数值。
//       左右拖动调音量；手指往上或往下移开，拖动会变得更精细；连点两下回到 0 dB。
// 波形下方两个按钮，都是交叉淡入淡出：
//   Change sound：和弦不变，只换音色；
//   Change key：音色不变，换到一个"近关系调"（新的五声音阶和原来至少有 4 个音相同），所以总是和谐的。
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
  const GRACE = 1.5;         // 离开 / 松开 logo 后，还有几秒可以点方块把声音接上
  const KEEP = 3;            // 每点一下方块，pad 至少再延续几秒
  const SWAP_IN = 1.6;       // 换音色时，新声音淡入几秒
  const SWAP_OUT = 2.4;      // 换音色时，旧声音淡出几秒
  const COLUMNS = 8;         // 方块从左到右分成几个音
  const HOLD_DELAY = 0.35;   // 在方块上按住多久进入演奏模式（秒）；按住后拖动会立刻进入
  const ETHER_TIME = 6;      // 演奏模式下，大约几秒叠到最空灵
  const TAP_LEVEL = 0.5;     // 方块短音的整体音量（1 = 和 pad 差不多响；调小 = 更退后、只做点缀）
  const TONE_DARK = 800;     // 短音一开始的低通滤波（Hz）：闷一些、柔一些
  const TONE_BRIGHT = 7000;  // 连续弹奏后最亮能到多少（Hz）
  const BRIGHT_TIME = 8;     // 按住演奏时，大约几秒从最闷变到最亮
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
  // scale：方块上能弹的音（五声音阶，和这个和弦不会有半音冲突）
  const CHORDS = [
    { name: 'maj9', tones: [0, 7, 16, 23, 26], scale: [0, 2, 4, 7, 9] },
    { name: 'm9', tones: [0, 7, 15, 22, 26], scale: [0, 2, 3, 7, 10] },
    { name: 'm11', tones: [0, 7, 10, 15, 17], scale: [0, 3, 5, 7, 10] },
    { name: 'maj7♯11', tones: [0, 7, 16, 18, 23], scale: [0, 2, 4, 7, 11] },
    { name: '6/9', tones: [0, 7, 14, 16, 21], scale: [0, 2, 4, 7, 9] },
    { name: 'sus2', tones: [0, 7, 14, 19, 24], scale: [0, 2, 5, 7, 9] },
    { name: 'quartal', tones: [0, 5, 10, 15, 20], scale: [0, 3, 5, 8, 10] },
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
    { name: 'Shimmer', level: 3.4, build: shimmer, look: { style: 'dots', light: '#4A3B8C', dark: '#C7B8F5' } },
    { name: 'Tape', level: 4.4, build: tape, look: { style: 'ribbon', light: '#6B4A3A', dark: '#E3C2A6' } },
    { name: 'Music box', level: 3.0, build: musicBox, look: { style: 'stems', light: '#2E5E7E', dark: '#A6D2EE' } },
    { name: 'Cello', level: 4.0, build: cello, look: { style: 'scribble', light: '#3F3A2A', dark: '#D8CFA8' } },
  ];
  const DEFAULT_LOOK = { style: 'smooth', light: '#572525', dark: '#89C3B7' }; // 用自己的音频文件时

  // 方块上弹出的短音，跟着这次 pad 的音色走（顺序和 PATCHES 对应）
  // partials：[频率倍数, 音量, 衰减倍数]；cut：滤波截止（几倍基频）；sweep：拨弦式的滤波扫动
  // level：已测量平衡过，单独弹奏时比 pad 略响一点
  const NOTE_TONES = [
    { name: 'Bell', wave: 'sine', partials: [[1, 1], [2, 0.22, 0.5], [3, 0.07, 0.3]], decay: 2.4, cut: 6, level: 0.35 },
    { name: 'Glass bell', wave: 'sine', partials: [[1, 1]], fm: 3.5, fmIndex: 1.1, decay: 2.8, cut: 10, level: 0.34 },
    { name: 'Kalimba', wave: 'sine', partials: [[1, 1], [5.4, 0.1, 0.08], [2, 0.12, 0.4]], decay: 1.5, cut: 8, level: 0.43 },
    { name: 'Pizzicato', wave: 'sawtooth', partials: [[1, 1]], decay: 0.9, cut: 1.6, sweep: 8, level: 0.52 },
    { name: 'Felt', wave: 'triangle', partials: [[1, 1], [2, 0.15, 0.6]], decay: 1.9, cut: 4, level: 0.46 },
    { name: 'Reed', wave: 'square', partials: [[1, 0.7], [2, 0.3, 0.8]], decay: 1, cut: 2.5, attack: 0.02, level: 0.45 },
    { name: 'Crystal', wave: 'sine', partials: [[1, 1], [2, 0.2, 0.6], [4, 0.12, 0.3]], decay: 3, cut: 10, level: 0.33 },
    { name: 'Tape keys', wave: 'triangle', partials: [[1, 1], [2, 0.1, 0.5]], decay: 1.6, cut: 3, level: 0.46 },
    { name: 'Music box', wave: 'sine', partials: [[1, 1], [3, 0.18, 0.25], [6.2, 0.06, 0.1]], decay: 2.2, cut: 10, level: 0.38 },
    { name: 'Harp', wave: 'sawtooth', partials: [[1, 1]], decay: 1.8, cut: 2.2, sweep: 6, level: 0.8 },
  ];

  // 两个推子的位置（0–1，0.75 = 0 dB），上次调过的话从浏览器里读出来
  const FADERS = { pad: { label: 'Pad', value: 0.75 }, notes: { label: 'Notes', value: 0.75 } };
  const faderGain = (value) => (value / 0.75) ** 2;
  try {
    const saved = JSON.parse(localStorage.getItem('wg-faders') || '{}');
    ['pad', 'notes'].forEach((k) => {
      if (typeof saved[k] === 'number') FADERS[k].value = Math.min(1, Math.max(0, saved[k]));
    });
  } catch (err) { /* 读不到就用默认值 */ }

  // ── 状态 ──────────────────────────────────────────────────
  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx, master, reverb, echo, echoFeedback, analyser, noiseBuf, fileBuf;
  let tapIn, tapBus, tapVerb, etherBus;
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
    echoFeedback = gainNode(0.38);
    echo.connect(darken).connect(echoFeedback).connect(echo);
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
    if (t.kind === 'logo' && tapMode && padVoice && voices.includes(padVoice)) {
      // 正在用方块延续：回到 logo 时接着这一段，不换和弦
      current = padVoice;
      tapMode = false;
      reviveVoice(current);
    } else {
      while (voices.length >= MAX_VOICES) killVoice(voices[0]);
      if (t.kind === 'logo') current = fileBuf ? fileVoice() : createVoice();
      else current = workVoice(t.kind);
      voices.push(current);
      fadeVoice(current, 1, current.fadeIn ?? FADE_IN);
    }
    look = current.look;
    if (t.kind === 'logo') {
      // 每次的摆动和声波纹速度略有不同；声波纹换成这个音色的颜色
      t.el.style.setProperty('--sway-dur', rand(3.4, 5.2).toFixed(2) + 's');
      t.el.style.setProperty('--ripple-dur', rand(3.2, 4.8).toFixed(2) + 's');
      t.el.style.setProperty('--voice-color', lookColor());
      padOpen(current);
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
    v.fader = track(v, gainNode(1));          // 推子（logo 的声音跟着 Pad 推子）
    v.out.connect(v.fader);
    v.fader.connect(master);
    const reverbSend = track(v, gainNode(reverbAmount));
    v.fader.connect(reverbSend).connect(reverb);
    v.bus = track(v, gainNode(level));        // 音色输出
    v.bus.connect(v.out);
    v.echoSend = track(v, gainNode(1));
    v.echoSend.connect(echo);
    return v;
  }

  // ── logo 的声音 = 随机和弦 + 随机音色 + 随机细节层 ───────────
  // opts（换音色 / 换调时用）：root、chord（和弦序号）、patch（音色序号）指定了就用指定的，否则随机
  function createVoice(opts = {}) {
    const ci = opts.chord ?? pickIndex(CHORDS.length, lastChord);
    const pi = opts.patch ?? (force ? force.patch : pickIndex(PATCHES.length, lastPatch));
    lastChord = ci;
    lastPatch = pi;
    const chord = CHORDS[ci];
    const patch = PATCHES[pi];
    const root = opts.root ?? ROOT_LOW + Math.floor(Math.random() * (ROOT_HIGH - ROOT_LOW + 1));

    // label 不显示，调试时可查看
    const v = baseVoice(patch.level, patch.look, `${NOTE_NAMES[root % 12]} ${chord.name} · ${patch.name}`);
    v.freqs = chord.tones.map((t) => mtof(root + t));
    v.root = root;            // 方块上的短音用到
    v.chord = ci;
    v.scale = chord.scale;
    v.patch = pi;
    v.fader.gain.value = faderGain(FADERS.pad.value);

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
    v.killTimer = setTimeout(() => killVoice(v), (fade + 0.4) * 1000);
  }

  // 淡出途中被接上（点了方块）：音量回升，琴音、风铃这些循环重新开始
  function reviveVoice(v, seconds = 0.5) {
    if (v.alive || !voices.includes(v)) return;
    clearTimeout(v.killTimer);
    v.alive = true;
    fadeVoice(v, 1, seconds);
    (v.loops || []).forEach((restart) => restart());
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
    (v.loops = v.loops || []).push(() => v.timers.push(setTimeout(tick, rand(0.1, minGap) * 1000)));
  }

  // 一个短音：快速起音 + 自然衰减（琴音、风铃）
  function pluck(v, freq, peak, decay, type, echoAmount, pulse = 0.45) {
    notePulse(pulse);
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

  // 微光：和弦音的高八度泛音各自缓慢涨落，像手指摩擦玻璃杯沿
  function shimmer(v) {
    const hp = filter(v, 'highpass', 300);
    hp.connect(v.bus);
    v.freqs.forEach((f) => {
      [2, 3, 4].forEach((mult, j) => {
        const base = 0.012 / (j + 1);
        const g = track(v, gainNode(base));
        g.connect(panTo(v, rand(-0.7, 0.7), hp, 0.3));
        lfo(v, rand(0.05, 0.18), base, g.gain); // 音量在 0 到 2 倍之间慢慢起伏
        osc(v, 'sine', f * mult, rand(-3, 3), g);
      });
    });
  }

  // 磁带：失谐的锯齿波 + 低通，整体音高轻轻摇晃（wow），底下一层很轻的磁带嘶声
  function tape(v) {
    const lp = filter(v, 'lowpass', rand(800, 1200), 0.6);
    lp.connect(v.bus);
    const wow = ctx.createOscillator();
    wow.frequency.value = rand(0.25, 0.45);
    const wowDepth = track(v, gainNode(rand(6, 10))); // 摇晃幅度（音分）
    wow.connect(wowDepth);
    wow.start();
    v.sources.push(wow);
    v.freqs.forEach((f, i) => {
      const g = track(v, gainNode(0.02));
      g.connect(panTo(v, spread(i, v.freqs.length), lp, 0.15));
      [-7, 7].forEach((d) => wowDepth.connect(osc(v, 'sawtooth', f, d, g).detune));
    });
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer();
    noise.loop = true;
    const hissBand = filter(v, 'bandpass', 3500, 0.5);
    const hiss = track(v, gainNode(0.006));
    noise.connect(hissBand).connect(hiss).connect(v.bus);
    noise.start();
    v.sources.push(noise);
  }

  // 八音盒：很轻的铺底 + 沿和弦往上走的琶音（偶尔空一拍），带回声
  function musicBox(v) {
    const lp = filter(v, 'lowpass', 900);
    lp.connect(v.bus);
    v.freqs.slice(0, 2).forEach((f) => {
      const g = track(v, gainNode(0.025));
      g.connect(lp);
      osc(v, 'sine', f, 0, g);
    });
    const notes = v.freqs.map((f) => { let x = f * 4; while (x > 2400) x /= 2; return x; }).sort((a, b) => a - b);
    let step = 0;
    every(v, 0.26, 0.34, 0.3, () => {
      if (Math.random() < 0.15) return;
      pluck(v, notes[step++ % notes.length], rand(0.03, 0.05), rand(1.4, 2.2), 'sine', 0.55, 0.3);
    });
  }

  // 大提琴：低八度的根音和五度 + 中音区，锯齿波经过缓慢开合的带通，像弓在弦上来回
  function cello(v) {
    const bp = filter(v, 'bandpass', rand(350, 500), 1.2);
    const lp = filter(v, 'lowpass', 1400);
    bp.connect(lp).connect(v.bus);
    lfo(v, rand(0.08, 0.15), 180, bp.frequency);
    const low = [v.freqs[0] / 2, v.freqs[1] / 2, v.freqs[0], v.freqs[2]];
    low.forEach((f, i) => {
      const g = track(v, gainNode(0.05));
      g.connect(panTo(v, spread(i, low.length) * 0.6, bp, 0.1));
      lfo(v, rand(0.1, 0.25), 0.02, g.gain);
      [-6, 6].forEach((d) => lfo(v, rand(4.5, 5.5), 5, osc(v, 'sawtooth', f, d, g).detune));
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

  // ── 小方块：延续 pad，并弹出和谐的短音 ────────────────────────
  const padEl = document.querySelector('.tap-pad');
  const logoT = triggers.find((t) => t.kind === 'logo');
  let padVoice = null;   // 方块正在延续的 pad 声音
  let tapMode = false;   // logo 已经松开，pad 正靠点方块延续
  let padTimer = 0;
  let padHover = false;  // 电脑：鼠标停在方块上时，方块不收起
  let hold = null;       // 正按在方块上的那根手指 / 鼠标（演奏模式用）

  // 方块的声音通道：短音 → 普通混响 + 回声；另有一条"空灵"通道：
  // 约 8 秒、慢慢涌起的长混响，平时关着，演奏模式下逐渐打开
  function ensureTapBus() {
    if (tapBus) return;
    // 所有短音先经过一个低通滤波：一开始约 800 Hz，弹得越久越亮（toneOpen / toneNudge）
    tapIn = ctx.createBiquadFilter();
    tapIn.type = 'lowpass';
    tapIn.frequency.value = TONE_DARK;
    tapIn.Q.value = 0.6;
    tapBus = gainNode(TAP_LEVEL * faderGain(FADERS.notes.value));
    tapIn.connect(tapBus);
    tapBus.connect(master);
    tapVerb = gainNode(0.55);
    tapBus.connect(tapVerb).connect(reverb);
    tapBus.connect(gainNode(0.3)).connect(echo);
    etherBus = gainNode(0);
    const big = ctx.createConvolver();
    big.buffer = impulse(8, 0.35, 2);
    const hp = filter({ nodes: [] }, 'highpass', 320);
    etherBus.connect(big).connect(hp).connect(gainNode(0.75)).connect(master);
    tapBus.connect(etherBus);
  }

  // 平滑地把某个参数推向目标值（tc：时间常数，越大越慢）
  function glide(param, value, tc) {
    const t = ctx.currentTime;
    if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(t);
    else { param.cancelScheduledValues(t); param.setValueAtTime(param.value, t); }
    param.setTargetAtTime(value, t, tc);
  }

  // 低通滤波的开合：按指数曲线走，听起来是均匀地变亮 / 变暗
  function toneRamp(freq, seconds) {
    const p = tapIn.frequency;
    const t = ctx.currentTime;
    if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t);
    else { p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); }
    p.exponentialRampToValueAtTime(freq, t + seconds);
  }
  // 按住演奏：慢慢变亮；松手：慢慢退回闷的状态
  const toneOpen = () => toneRamp(TONE_BRIGHT, BRIGHT_TIME);
  const toneClose = () => toneRamp(TONE_DARK, 3);
  // 单点：每点一下亮一点，几秒不点又慢慢暗回去，所以连续点也会越来越亮
  function toneNudge() {
    const p = tapIn.frequency;
    const up = Math.min(TONE_BRIGHT, Math.max(p.value, TONE_DARK) * 1.22);
    toneRamp(up, 0.08);
    p.exponentialRampToValueAtTime(TONE_DARK, ctx.currentTime + 0.08 + 4);
  }

  // 越来越空灵：长混响打开，普通混响加多，回声的尾巴拉长
  function etherUp() {
    ensureTapBus();
    glide(etherBus.gain, 1, ETHER_TIME / 3);
    glide(tapVerb.gain, 1.3, ETHER_TIME / 3);
    glide(echoFeedback.gain, 0.56, ETHER_TIME / 2.5);
  }
  function etherDown() {
    if (!etherBus) return;
    glide(etherBus.gain, 0, 1.2);
    glide(tapVerb.gain, 0.55, 1.2);
    glide(echoFeedback.gain, 0.38, 1);
  }

  const padIsOpen = () => !!padEl && padEl.classList.contains('is-open');
  const rowEl = padEl && padEl.parentElement; // .mark-row：logo + 方块 + 两个推子
  const heroMarkEl = rowEl && rowEl.parentElement; // .hero-mark：再加上波形和换音色按钮
  // 方块和推子一起出现、变淡、收起
  // .hero-mark 也带上同样的状态：手机上靠它把整块放大到占满一行
  const padClass = (name, on) => [padEl, rowEl, rowEl && rowEl.parentElement].forEach((el) => el && el.classList.toggle(name, on));

  function padOpen(v) {
    if (!padEl || !v.scale) return;
    padVoice = v;
    if (!v.etherSend) {
      // pad 自己也送一份进"空灵"长混响（只有演奏模式打开时才听得到）
      ensureTapBus();
      v.etherSend = track(v, gainNode(0.6));
      v.fader.connect(v.etherSend).connect(etherBus);
    }
    clearTimeout(padTimer);
    heroMarkEl.style.setProperty('--voice-color', lookColor()); // 方块、推子、换音色按钮都跟着这个颜色
    padClass('is-open', true);
    padClass('is-fading', false);
  }

  // pad 开始淡出：方块变淡，GRACE 秒内没点就收起
  function padGrace() {
    if (!padIsOpen()) return;
    clearTimeout(padTimer);
    padClass('is-fading', true);
    padTimer = setTimeout(() => { if (!padHover) padClose(); }, GRACE * 1000);
  }

  // 方块收起；soundscape 由方块延续着的话，让它淡出
  function padClose() {
    if (!padEl) return;
    endHold();
    clearTimeout(padTimer);
    if (tapMode) {
      tapMode = false;
      if (padVoice) releaseVoice(padVoice);
      if (activeT !== logoT) logoEl.classList.remove('is-active');
    }
    padClass('is-open', false);
    padClass('is-fading', false);
  }

  // 点完方块 KEEP 秒都没再点：pad 开始淡出，再给一次 GRACE 秒的机会
  function padRest() {
    tapMode = false;
    if (padVoice) releaseVoice(padVoice);
    if (activeT !== logoT) logoEl.classList.remove('is-active');
    padGrace();
  }

  // 手指在方块上的位置（0–1）；拖到方块外面时贴在边上
  function padPos(e) {
    const r = padEl.getBoundingClientRect();
    return {
      x: Math.min(0.999, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  }

  // 碰到方块或推子：让 pad 接着响（声音已经消失的话重新起一段）
  function padEngage() {
    if (!padIsOpen() || !ctx || ctx.state !== 'running') return null;
    let v = padVoice;
    if (!v || !voices.includes(v)) {
      // 声音已经完全消失（电脑上鼠标一直停在方块上）：重新起一段
      while (voices.length >= MAX_VOICES) killVoice(voices[0]);
      v = createVoice();
      voices.push(v);
      fadeVoice(v, 1, 0.6);
      padOpen(v);
    } else {
      reviveVoice(v);
    }
    look = v.look;
    logoEl.style.setProperty('--voice-color', lookColor());
    showWave(logoT);
    if (activeT !== logoT) {
      tapMode = true;
      logoEl.classList.add('is-active');   // logo 跟着继续摆动、泛声波纹
      padClass('is-fading', false);
      clearTimeout(padTimer);
      padTimer = setTimeout(padRest, KEEP * 1000);
    }
    return v;
  }

  function padTap(e) {
    const v = padEngage();
    if (!v) return false;
    e.preventDefault();
    const { x, y } = padPos(e);
    ensureTapBus();
    if (!(hold && hold.flowing)) toneNudge();
    playNote(v, colAt(x), y);
    tapDot(x, y);
    padEl.classList.add('is-used', 'is-hit');
    setTimeout(() => padEl.classList.remove('is-hit'), 70);
    return true;
  }

  // 点到的位置泛起一圈涟漪（演奏模式里的自动音符用小一号的）
  function tapDot(x, y, small = false) {
    const dot = document.createElement('span');
    dot.className = small ? 'tap-dot is-small' : 'tap-dot';
    dot.style.left = `${x * 100}%`;
    dot.style.top = `${y * 100}%`;
    padEl.appendChild(dot);
    setTimeout(() => dot.remove(), 1000);
  }

  // ── 演奏模式：按住 HOLD_DELAY 秒，或按住拖动 ──
  function padDown(e) {
    if (!padTap(e)) return;
    if (hold) return; // 已经有一根手指在演奏，其他手指只是单点
    if (tapMode) clearTimeout(padTimer); // 按着的时候 pad 一直延续
    const { x, y } = padPos(e);
    hold = { id: e.pointerId, x, y, sx: e.clientX, sy: e.clientY, col: colAt(x), walk: 0, flowing: false, timer: 0 };
    hold.wait = setTimeout(startFlow, HOLD_DELAY * 1000);
    try { padEl.setPointerCapture(e.pointerId); } catch (err) { /* 不支持就算了 */ }
  }

  function padMove(e) {
    if (!hold || e.pointerId !== hold.id) return;
    const { x, y } = padPos(e);
    hold.x = x;
    hold.y = y;
    if (!hold.flowing) {
      // 还没到判定时间，但手指已经拖开一段：直接进入演奏
      if (Math.hypot(e.clientX - hold.sx, e.clientY - hold.sy) > 14) startFlow();
      return;
    }
    moveFinger();
    const col = colAt(x);
    if (col !== hold.col) {
      // 手指滑到新的音上：马上弹它，像拨过琴弦
      hold.col = col;
      hold.walk = 0;
      clearTimeout(hold.timer);
      flowStep(true);
    }
  }

  function padUp(e) {
    if (!hold || e.pointerId !== hold.id) return;
    endHold();
    if (tapMode) {
      clearTimeout(padTimer);
      padTimer = setTimeout(padRest, KEEP * 1000);
    }
  }

  function startFlow() {
    if (!hold || hold.flowing) return;
    clearTimeout(hold.wait);
    hold.flowing = true;
    hold.start = performance.now();
    hold.col = colAt(hold.x);
    padEl.classList.add('is-flowing');
    hold.finger = document.createElement('span');
    hold.finger.className = 'tap-finger';
    padEl.appendChild(hold.finger);
    moveFinger();
    etherUp();
    toneOpen();
    hold.timer = setTimeout(() => flowStep(false), 160);
  }

  function endHold() {
    if (!hold) return;
    clearTimeout(hold.wait);
    clearTimeout(hold.timer);
    if (hold.flowing) {
      etherDown();
      toneClose();
      padEl.classList.remove('is-flowing');
      padEl.style.setProperty('--ether', 0);
      const f = hold.finger;
      f.classList.add('is-gone');
      setTimeout(() => f.remove(), 500);
    }
    hold = null;
  }

  function moveFinger() {
    hold.finger.style.left = `${hold.x * 100}%`;
    hold.finger.style.top = `${hold.y * 100}%`;
  }

  // 自动弹奏：在手指附近来回游走（最多偏开 2 个音），手指越靠上弹得越快、越亮
  function flowStep(atFinger) {
    if (!hold || !hold.flowing) return;
    const v = padVoice;
    if (!v || !voices.includes(v)) return;
    const ether = Math.min(1, (performance.now() - hold.start) / (ETHER_TIME * 1000));
    if (!atFinger) {
      hold.walk += Math.random() < 0.5 ? -1 : 1;
      if (Math.abs(hold.walk) > 2) hold.walk -= 2 * Math.sign(hold.walk);
    }
    const col = Math.min(COLUMNS - 1, Math.max(0, hold.col + hold.walk));
    playNote(v, col, hold.y, ether, atFinger ? 1 : rand(0.6, 0.9));
    tapDot((col + 0.5) / COLUMNS, hold.y, true);
    padEl.style.setProperty('--ether', ether.toFixed(2));
    const gap = (0.18 + 0.26 * hold.y) * (1 + 0.35 * ether) * rand(0.85, 1.2);
    hold.timer = setTimeout(() => flowStep(false), gap * 1000);
  }

  const colAt = (x) => Math.min(COLUMNS - 1, Math.floor(x * COLUMNS));

  // 左低右高：COLUMNS 个音，从根音往上两个八度起，沿五声音阶排列
  function playNote(v, col, y, ether = 0, velocity = 1) {
    const s = v.scale;
    const midi = v.root + 24 + s[col % s.length] + 12 * Math.floor(col / s.length);
    tapNote(mtof(midi), 1 - y, v.patch, ((col + 0.5) / COLUMNS - 0.5) * 1.2, ether, velocity);
  }

  // 一个短音。bright：0 = 方块最下面（柔、长），1 = 最上面（亮、短）
  // ether：0–1，越空灵：余音越长、直接声越轻，并多一层高八度的泛光
  function tapNote(freq, bright, patch, pan, ether = 0, velocity = 1) {
    ensureTapBus();
    notePulse(0.6 + 0.4 * velocity);
    const tone = NOTE_TONES[patch] || NOTE_TONES[0];
    const t = ctx.currentTime;
    const decay = tone.decay * (1.3 - 0.6 * bright) * (1 + 1.2 * ether);
    const cutMul = 0.6 + 0.9 * bright;
    const attack = (tone.attack || 0.005) + 0.03 * ether;
    const end = t + attack + decay * 1.6 + 0.05;
    const nodes = [];

    const out = gainNode(tone.level * velocity * (1 - 0.3 * ether) * rand(0.85, 1));
    nodes.push(out);
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      out.connect(p).connect(tapIn);
      nodes.push(p);
    } else {
      out.connect(tapIn);
    }
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.7;
    const cut = Math.min(freq * tone.cut * cutMul, 14000);
    if (tone.sweep) {
      lp.frequency.setValueAtTime(Math.min(freq * tone.sweep * cutMul, 16000), t);
      lp.frequency.exponentialRampToValueAtTime(cut, t + 0.25);
    } else {
      lp.frequency.value = cut;
    }
    lp.connect(out);
    nodes.push(lp);

    const partials = ether > 0.1 ? [...tone.partials, [2, 0.35 * ether, 1.6]] : tone.partials;
    const oscs = partials.map(([ratio, gain, dScale = 1], i) => {
      const o = ctx.createOscillator();
      o.type = i ? 'sine' : tone.wave;
      o.frequency.value = freq * ratio;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(gain, t + attack);
      env.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay * dScale);
      o.connect(env).connect(lp);
      o.start(t);
      o.stop(end);
      nodes.push(o, env);
      return o;
    });
    if (tone.fm) {
      // 玻璃铃：调频，起音时泛音多，随后变纯
      const mod = ctx.createOscillator();
      mod.frequency.value = freq * tone.fm;
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(freq * tone.fmIndex * (0.5 + bright), t);
      depth.gain.exponentialRampToValueAtTime(freq * 0.02, t + decay * 0.5);
      mod.connect(depth).connect(oscs[0].frequency);
      mod.start(t);
      mod.stop(end);
      nodes.push(mod, depth);
    }
    setTimeout(() => nodes.forEach((n) => n.disconnect()), (end - t + 0.3) * 1000);
  }

  // ── 推子：Pad（logo 的声音）和 Notes（方块的短音）各一条 ──────────
  // value 0–1；0.75 = 0 dB（原始音量），1 ≈ +5 dB，0 = 静音。位置会记在这台设备的浏览器里。
  const faderEls = [...document.querySelectorAll('.fader')];
  faderEls.forEach((el) => {
    const f = FADERS[el.dataset.fader];
    if (!f) return;
    f.el = el;
    f.valueEl = el.querySelector('.fader-value');
    renderFader(f);
    el.addEventListener('pointerdown', (e) => faderDown(f, e));
    el.addEventListener('pointermove', (e) => faderMove(f, e));
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((type) => el.addEventListener(type, (e) => faderUp(f, e)));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  function applyFader(f) {
    const g = faderGain(f.value);
    if (!ctx) return;
    if (f === FADERS.pad) voices.forEach((v) => { if (v.scale) glide(v.fader.gain, g, 0.03); });
    else if (tapBus) glide(tapBus.gain, TAP_LEVEL * g, 0.03);
  }

  function renderFader(f) {
    if (!f.el) return;
    f.el.style.setProperty('--val', f.value.toFixed(4));
    const g = faderGain(f.value);
    const db = g < 0.003 ? '−∞' : `${g >= 1 ? '+' : '−'}${Math.abs(20 * Math.log10(g)).toFixed(1)}`;
    f.valueEl.textContent = `${f.label} ${db} dB${f.fine && f.fine < 0.75 ? ' · fine' : ''}`;
  }

  function faderDown(f, e) {
    if (!padEngage()) return;
    e.preventDefault();
    const now = performance.now();
    if (now - (f.lastDown || 0) < 300) {
      // 连点两下：回到 0 dB
      f.value = 0.75;
      applyFader(f);
      saveFaders();
    }
    f.lastDown = now;
    if (tapMode) clearTimeout(padTimer); // 按着推子时 pad 一直延续
    const r = f.el.querySelector('.fader-track').getBoundingClientRect();
    f.drag = { id: e.pointerId, x: e.clientX, y0: e.clientY, w: Math.max(180, r.width) }; // 推子很短时（手机上的 logo）也不会太灵敏
    f.fine = 1;
    f.el.classList.add('is-active');
    renderFader(f);
    try { f.el.setPointerCapture(e.pointerId); } catch (err) { /* 不支持就算了 */ }
  }

  // 相对拖动（按下时不会跳）：手指离推子越远（上下方向），同样的移动距离改变越小，方便微调
  function faderMove(f, e) {
    if (!f.drag || e.pointerId !== f.drag.id) return;
    const dy = Math.abs(e.clientY - f.drag.y0);
    f.fine = dy < 20 ? 1 : Math.max(0.1, 1 / (1 + (dy - 20) / 30));
    f.value = Math.min(1, Math.max(0, f.value + ((e.clientX - f.drag.x) / f.drag.w) * f.fine));
    f.drag.x = e.clientX;
    applyFader(f);
    renderFader(f);
  }

  function faderUp(f, e) {
    if (!f.drag || e.pointerId !== f.drag.id) return;
    f.drag = null;
    f.fine = 1;
    f.el.classList.remove('is-active');
    renderFader(f);
    saveFaders();
    if (tapMode) {
      clearTimeout(padTimer);
      padTimer = setTimeout(padRest, KEEP * 1000);
    }
  }

  function saveFaders() {
    try { localStorage.setItem('wg-faders', JSON.stringify({ pad: FADERS.pad.value, notes: FADERS.notes.value })); } catch (err) { /* 隐私模式等：不记也没关系 */ }
  }

  // ── 换音色 / 换调：交叉淡入淡出 ──────────────────────────────
  const actionEls = [...document.querySelectorAll('[data-sound-action]')];

  // 近关系调：新的五声音阶和现在的至少有 4 个音相同（上 / 下五度、关系大小调等），根音必须变
  function relatedKey(v) {
    const pcs = (root, scale) => new Set(scale.map((x) => (root + x) % 12));
    const cur = pcs(v.root, v.scale);
    const pickFrom = (need) => {
      const out = [];
      CHORDS.forEach((chord, ci) => {
        for (let r = ROOT_LOW; r < ROOT_LOW + 12; r++) {
          if (r % 12 === v.root % 12) continue;
          let common = 0;
          pcs(r, chord.scale).forEach((p) => { if (cur.has(p)) common++; });
          if (common >= need) out.push({ root: r, chord: ci });
        }
      });
      return out;
    };
    const options = pickFrom(4);
    return pick(options.length ? options : pickFrom(3));
  }

  // mode：'sound' = 和弦不变、换音色；'key' = 音色不变、换到近关系调
  function swapVoice(mode = 'sound') {
    const old = padEngage();
    if (!old || old.root == null) return;
    while (voices.length >= MAX_VOICES) killVoice(voices[0] === old ? voices[1] : voices[0]);
    const v = mode === 'key'
      ? createVoice({ ...relatedKey(old), patch: old.patch })
      : createVoice({ root: old.root, chord: old.chord, patch: pickIndex(PATCHES.length, old.patch) });
    voices.push(v);
    fadeVoice(v, 1, SWAP_IN);
    old.fadeOut = SWAP_OUT;
    releaseVoice(old);
    if (current === old) current = v;   // logo 还被按着 / 悬停着
    padOpen(v);                         // 方块、推子换颜色；短音换成新音色 / 新音阶
    look = v.look;
    logoEl.style.setProperty('--voice-color', lookColor());
    react.range = {};                   // logo 的动态按新声音重新校准
    showWave(logoT);
    const btn = actionEls.find((el) => el.dataset.soundAction === mode);
    if (btn) {
      btn.classList.remove('is-spun');
      void btn.offsetWidth;             // 重新触发图标动画
      btn.classList.add('is-spun');
    }
  }

  actionEls.forEach((el) => {
    const run = () => {
      swapVoice(el.dataset.soundAction);
      if (tapMode) { clearTimeout(padTimer); padTimer = setTimeout(padRest, KEEP * 1000); }
    };
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse') e.preventDefault(); // 手机上不要先触发别的手势
      run();
    });
    // 键盘（Tab 到按钮上按 Enter / 空格）会触发一个没有指针的 click
    el.addEventListener('click', (e) => { e.preventDefault(); if (e.detail === 0) run(); });
  });

  if (padEl) {
    padEl.addEventListener('pointerdown', padDown);
    padEl.addEventListener('pointermove', padMove);
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((type) => padEl.addEventListener(type, padUp));
    padEl.addEventListener('contextmenu', (e) => e.preventDefault());
    [padEl, ...faderEls, ...document.querySelectorAll('[data-sound-action]')].forEach((el) => {
      el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') padHover = true; });
      el.addEventListener('pointerleave', (e) => {
        if (e.pointerType !== 'mouse') return;
        padHover = false;
        if (padIsOpen() && !tapMode && activeT !== logoT) {
          clearTimeout(padTimer);
          padTimer = setTimeout(padClose, 600);
        }
      });
    });
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

  // swell：混响慢慢涌起的时间（秒），0 = 立刻
  function impulse(seconds, swell = 0, curve = 3) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    const rise = swell * ctx.sampleRate;
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const env = Math.pow(1 - i / len, curve) * (rise ? 1 - Math.exp(-i / rise) : 1);
        d[i] = (Math.random() * 2 - 1) * env;
      }
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
    if (t.kind === 'logo') stopReact();
  }

  // ── logo 跟着声音动 ────────────────────────────────────────
  // 每帧读一次频谱：低频 → logo 轻轻放大；高频 → 光晕；中频（整体响度）→ 声波纹变粗。
  // 各频段用"自适应范围"：按最近几秒的最低 / 最高值换算成 0–1，所以很平稳的 pad 也能看出呼吸。
  // 每个音符（方块的短音、pad 里的琴音和风铃）发出时，从 logo 里荡出一圈（notePulse）。
  const react = { bass: 0, air: 0, lv: 0, kick: 0, raw: null, on: false, range: {} };
  let freqData = null;

  function reactLogo() {
    freqData = freqData || new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(freqData);
    const hz = ctx.sampleRate / analyser.fftSize;
    const band = (lo, hi) => {
      const a = Math.max(1, Math.round(lo / hz));
      const b = Math.max(a + 1, Math.round(hi / hz));
      let sum = 0;
      for (let i = a; i < b; i++) sum += freqData[i];
      return sum / (b - a) / 255;
    };
    const raw = { bass: band(40, 250), mid: band(250, 2000), air: band(2000, 8000) };
    react.raw = raw;
    // 自适应：范围慢慢收拢，遇到更大 / 更小的值马上撑开；最少留 0.05 的宽度，免得把底噪放大
    const adapt = (k) => {
      const r = react.range[k] || (react.range[k] = { lo: raw[k], hi: raw[k] + 0.05 });
      r.lo = Math.min(raw[k], r.lo + 0.0015);
      r.hi = Math.max(raw[k], r.hi - 0.0015);
      const span = Math.max(0.05, r.hi - r.lo);
      return Math.min(1, Math.max(0, (raw[k] - r.lo) / span));
    };
    // 起音快、回落慢，动起来像在呼吸，不会抖
    const follow = (prev, target, att, rel) => prev + (target - prev) * (target > prev ? att : rel);
    react.bass = follow(react.bass, adapt('bass'), 0.3, 0.06);
    react.air = follow(react.air, adapt('air'), 0.35, 0.07);
    react.lv = follow(react.lv, adapt('mid'), 0.35, 0.07);
    react.kick *= 0.88;
    logoEl.classList.add('is-reactive');
    logoEl.style.setProperty('--bass', react.bass.toFixed(3));
    // 有声音时始终有一点光晕；音符一响，光晕闪亮一下
    logoEl.style.setProperty('--air', Math.min(1, 0.25 + 0.5 * react.air + react.kick).toFixed(3));
    logoEl.style.setProperty('--lv', react.lv.toFixed(3));
    react.on = true;
  }

  // 一个音符发出：logo 里荡出一圈，光晕闪一下。strength 0–1（风铃、琴音小一些，方块的音大一些）
  function notePulse(strength) {
    if (!react.on || reduceMotion.matches || drawT !== logoT) return;
    react.kick = Math.max(react.kick, 0.5 * strength);
    const t = performance.now();
    if (t - (react.lastPulse || 0) < 180 || logoEl.querySelectorAll('.pulse').length >= 6) return; // 音符很密时不刷屏
    react.lastPulse = t;
    const ring = document.createElement('span');
    ring.className = 'pulse';
    ring.style.setProperty('--s', strength.toFixed(2));
    logoEl.insertBefore(ring, logoEl.querySelector('.mark'));
    setTimeout(() => ring.remove(), 1200);
  }

  function stopReact() {
    if (!react.on) return;
    react.on = false;
    react.bass = react.air = react.lv = react.kick = 0;
    react.range = {};
    logoEl.classList.remove('is-reactive');
    ['--bass', '--air', '--lv'].forEach((k) => logoEl.style.removeProperty(k));
  }

  function drawFrame(now) {
    rafId = 0;
    const t = drawT;
    if (!t || !t.g2d) return;
    const g2d = t.g2d;
    // 波形区域变大 / 变小时（手机上放大），画布跟着换尺寸，线条才不会被拉糊
    const cw = Math.round(t.canvas.clientWidth * dpr);
    const ch = Math.round(t.canvas.clientHeight * dpr);
    if (cw && ch && (cw !== t.canvas.width || ch !== t.canvas.height)) {
      t.canvas.width = cw;
      t.canvas.height = ch;
    }
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
    if (!silent && t.kind === 'logo' && !reduceMotion.matches) reactLogo();

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
    // Shimmer：沿着波形的一串光点，越响点越大
    dots(c, at, W, H) {
      const pts = at();
      const count = Math.max(10, Math.min(60, Math.floor(W / (6 * dpr))));
      const stride = pts.length / count;
      for (let b = 0; b < count; b++) {
        const y = pts[Math.floor(b * stride)];
        c.globalAlpha = 0.5 + 0.5 * Math.min(1, Math.abs(y) / (H * 0.3));
        c.beginPath();
        c.arc((b + 0.5) * (W / count), H / 2 - y, (1 + (Math.abs(y) / H) * 5) * dpr, 0, Math.PI * 2);
        c.fill();
      }
    },
    // Tape：一条半透明的带子（波形和它压扁的倒影之间填满）
    ribbon(c, at, W, H) {
      const pts = at();
      const x = (k) => (k * W) / (pts.length - 1);
      c.globalAlpha = 0.28;
      c.beginPath();
      pts.forEach((y, k) => (k ? c.lineTo(x(k), H / 2 - y) : c.moveTo(0, H / 2 - y)));
      for (let k = pts.length - 1; k >= 0; k--) c.lineTo(x(k), H / 2 + pts[k] * 0.5);
      c.closePath();
      c.fill();
      c.globalAlpha = 1;
      c.lineWidth = 1.6 * dpr;
      line(c, pts, W, H);
    },
    // Music box：一根根小音针，顶端一个圆点
    stems(c, at, W, H) {
      const pts = at();
      const count = Math.max(8, Math.min(40, Math.floor(W / (9 * dpr))));
      const stride = pts.length / count;
      c.lineWidth = 1.2 * dpr;
      for (let b = 0; b < count; b++) {
        const xx = (b + 0.5) * (W / count);
        const y = pts[Math.floor(b * stride)];
        c.beginPath();
        c.moveTo(xx, H / 2);
        c.lineTo(xx, H / 2 - y);
        c.stroke();
        c.beginPath();
        c.arc(xx, H / 2 - y, 2 * dpr, 0, Math.PI * 2);
        c.fill();
      }
    },
    // Cello：两笔手绘感的线，轻轻抖动，像铅笔描了两遍
    scribble(c, at, W, H) {
      const pts = at();
      const time = performance.now() / 180;
      c.lineWidth = 1.4 * dpr;
      [0, 1].forEach((pass) => {
        c.globalAlpha = pass ? 0.45 : 1;
        c.beginPath();
        pts.forEach((y, k) => {
          const jitter = Math.sin(k * 7.3 + pass * 2.1 + time) * 1.6 * dpr + pass * 2 * dpr;
          const xx = (k * W) / (pts.length - 1);
          if (k) c.lineTo(xx, H / 2 - y + jitter); else c.moveTo(xx, H / 2 - y + jitter);
        });
        c.stroke();
      });
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
    if (t.kind !== 'logo') padClose();
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
    if (t.kind === 'logo') padGrace();
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
  document.addEventListener('visibilitychange', () => { if (document.hidden) { deactivate(activeT); padClose(); } });

  // 调试用（网址加 ?sound-debug 才会出现）：逐个试听
  if (location.search.includes('sound-debug')) {
    window.wgSound = {
      patches: PATCHES.map((p) => p.name),
      works: Object.keys(WORKS),
      play(patch, textures = true) { force = { patch, textures }; deactivate(activeT); activate(logoT); },
      playWork(kind) { force = null; deactivate(activeT); activate(triggers.find((t) => t.kind === kind)); },
      stop() { force = null; deactivate(activeT); },
      setLevel(patch, level) { PATCHES[patch].level = level; },
      setWorkLevel(kind, level) { WORKS[kind].level = level; },
      now: () => ((current || padVoice) ? (current || padVoice).label : ''),
      // 按 x、y（0–1）在方块上弹一个音；meter(ms)：这段时间里的峰值和平均响度
      tap(x, y, ether = 0) { const v = current || padVoice; if (v && v.scale) playNote(v, colAt(x), y, ether); },
      async meter(ms = 1000) {
        const buf = new Float32Array(analyser.fftSize);
        let peak = 0; let sum = 0; let n = 0;
        const endAt = performance.now() + ms;
        while (performance.now() < endAt) {
          analyser.getFloatTimeDomainData(buf);
          for (let i = 0; i < buf.length; i++) { peak = Math.max(peak, Math.abs(buf[i])); sum += buf[i] * buf[i]; n++; }
          await new Promise((r) => setTimeout(r, 40));
        }
        return { peak: +peak.toFixed(3), rms: +Math.sqrt(sum / n).toFixed(4) };
      },
      bands: () => react.raw && { raw: react.raw, bass: +react.bass.toFixed(2), air: +react.air.toFixed(2), lv: +react.lv.toFixed(2) },
      swap: (mode = 'sound') => swapVoice(mode),
      faders: () => ({ pad: +FADERS.pad.value.toFixed(3), notes: +FADERS.notes.value.toFixed(3) }),
      state: () => ({ tone: tapIn ? Math.round(tapIn.frequency.value) : 0, tapMode, flowing: !!(hold && hold.flowing), ether: etherBus ? +etherBus.gain.value.toFixed(2) : 0, padOpen: padIsOpen(), voices: voices.length, alive: voices.map((v) => v.alive) }),
    };
  }
})();
