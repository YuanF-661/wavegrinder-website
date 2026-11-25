// Wave Grinder 首页 logo 互动
// 电脑：鼠标悬停 → logo 摆动 + 声波纹 + 环境音；移开后淡出
// 手机：按住 → 同样效果；松手后淡出
//
// 浏览器规定：访客在页面上点击 / 轻触 / 按键之前，网页不能发声。
// 所以视觉效果随时可用，声音在访客第一次与页面互动后才会出现，提示文字会说明。

(() => {
  const el = document.querySelector('.sound-mark');
  const hint = document.querySelector('.sound-hint');
  if (!el || !hint) return;

  // ── 可调设置 ──────────────────────────────────────────────
  // 想用自己录制的声音：把文件放进 audio/ 文件夹，并在这里填路径，例如 'audio/logo-ambient.mp3'
  // 留空 = 使用下面内置的合成环境音（D 大调 pad + 海浪般的噪声）
  const AMBIENT_FILE = '';
  const VOLUME = 0.22;      // 总音量 0–1
  const FADE_IN = 1.2;      // 淡入秒数
  const FADE_OUT = 1.8;     // 淡出秒数
  // ─────────────────────────────────────────────────────────

  const canHover = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const TEXT = {
    idle: canHover ? '♪ Hover to listen' : '♪ Press and hold to listen',
    locked: canHover ? '♪ Click to turn on sound' : '♪ Tap once to turn on sound, then hold',
    playing: '♪ Listening',
  };
  const setHint = (key) => { hint.textContent = TEXT[key]; };
  setHint('idle');

  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx, master, reverb, noiseBuf, fileBuf;
  let voice = null;    // 当前正在发声的一组节点
  let active = false;  // 是否正处于悬停 / 按住状态
  let playing = false; // 这次悬停 / 按住是否已经出声

  // ── 音频引擎 ──────────────────────────────────────────────
  function setup() {
    if (ctx || !AC) return;
    ctx = new AC();
    el.dataset.audio = ctx.state;
    ctx.onstatechange = () => { el.dataset.audio = ctx.state; };

    master = ctx.createGain();
    master.gain.value = 0;
    const limiter = ctx.createDynamicsCompressor();
    master.connect(limiter).connect(ctx.destination);

    reverb = ctx.createConvolver();
    reverb.buffer = impulse(3.2);
    const wet = ctx.createGain();
    wet.gain.value = 0.7;
    reverb.connect(wet).connect(master);

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

  // 声音刚解锁时，如果访客正悬停 / 按住着 logo，马上开始播放
  function onReady() {
    if (active && !playing && startSound()) {
      playing = true;
      setHint('playing');
    }
  }
  ['pointerdown', 'touchend', 'keydown', 'click'].forEach((type) =>
    addEventListener(type, unlock, { capture: true, passive: true }));

  function startSound() {
    if (!ctx || ctx.state !== 'running') return false;
    if (voice) {
      clearTimeout(voice.stopTimer); // 淡出途中又回来了：继续用同一组声音
      voice.stopTimer = null;
    } else {
      voice = fileBuf ? fileVoice() : synthVoice();
    }
    ramp(VOLUME, FADE_IN);
    return true;
  }

  function stopSound() {
    if (!voice) return;
    ramp(0, FADE_OUT);
    const v = voice;
    v.stopTimer = setTimeout(() => {
      v.stop();
      if (voice === v) voice = null;
    }, (FADE_OUT + 0.3) * 1000);
  }

  function ramp(value, seconds) {
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(value, t + seconds);
  }

  // 内置环境音：D 大调加九音的柔和 pad，每个音各自缓慢呼吸；再叠一层像海浪起伏的滤波噪声
  function synthVoice() {
    const t = ctx.currentTime;
    const sources = [];

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 900;
    lowpass.Q.value = 0.4;
    lowpass.connect(master);
    lowpass.connect(reverb);
    lfo(0.06, 450, lowpass.frequency, sources); // 音色缓慢明暗变化

    [146.83, 220.0, 329.63, 369.99, 440.0].forEach((freq, i) => { // D3 A3 E4 F#4 A4
      const g = ctx.createGain();
      g.gain.value = 0.05;
      g.connect(lowpass);
      lfo(0.08 + i * 0.037, 0.03, g.gain, sources);
      [['sine', -5], ['triangle', 6]].forEach(([type, cents]) => {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = freq;
        o.detune.value = cents;
        o.connect(g);
        o.start(t);
        sources.push(o);
      });
    });

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer();
    noise.loop = true;
    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = 450;
    bandpass.Q.value = 0.6;
    const swell = ctx.createGain();
    swell.gain.value = 0.035;
    lfo(0.11, 0.03, swell.gain, sources); // 约 9 秒一次的起伏，像浪
    noise.connect(bandpass).connect(swell);
    swell.connect(master);
    swell.connect(reverb);
    noise.start(t);
    sources.push(noise);

    return {
      stop() {
        sources.forEach((s) => { try { s.stop(); } catch (e) { /* already stopped */ } });
        lowpass.disconnect();
        swell.disconnect();
      },
    };
  }

  function fileVoice() {
    const s = ctx.createBufferSource();
    s.buffer = fileBuf;
    s.loop = true;
    s.connect(master);
    s.start();
    return { stop() { try { s.stop(); } catch (e) { /* already stopped */ } s.disconnect(); } };
  }

  function lfo(rate, depth, param, sources) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = rate;
    g.gain.value = depth;
    o.connect(g).connect(param);
    o.start();
    sources.push(o);
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

  // ── 交互 ──────────────────────────────────────────────────
  function activate() {
    if (active) return;
    active = true;
    el.classList.add('is-active');
    el.setAttribute('aria-pressed', 'true');
    playing = startSound();
    setHint(playing ? 'playing' : 'locked');
  }

  function deactivate() {
    if (!active) return;
    active = false;
    playing = false;
    el.classList.remove('is-active');
    el.setAttribute('aria-pressed', 'false');
    if (ctx) stopSound();
    setHint('idle');
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
    active ? deactivate() : activate();
  });
  el.addEventListener('blur', deactivate);

  // 切到别的标签页时停止
  document.addEventListener('visibilitychange', () => { if (document.hidden) deactivate(); });
})();
