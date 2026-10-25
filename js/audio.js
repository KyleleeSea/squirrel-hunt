// Tiny WebAudio synth for game cues.
let ctx = null;
function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, dur, { type = 'sine', vol = 0.18, slide = null, delay = 0 } = {}) {
  try {
    const c = ac();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    const t0 = c.currentTime + delay;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(c.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  } catch { /* audio not available */ }
}

export const sfx = {
  unlock() { try { ac(); } catch {} },
  chirp() { tone(880, 0.12, { slide: 1320 }); tone(1320, 0.14, { delay: 0.12, slide: 1760 }); },
  whistle() { tone(620, 0.35, { slide: 980, vol: 0.14 }); tone(980, 0.25, { delay: 0.3, slide: 1400, vol: 0.12 }); },
  tick() { tone(1100, 0.06, { type: 'square', vol: 0.05 }); },
  found() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, { delay: i * 0.11, vol: 0.16 })); },
  win() { [392, 523, 659, 784].forEach((f, i) => tone(f, 0.3, { delay: i * 0.13, vol: 0.16 })); },
  miss() { tone(160, 0.14, { type: 'square', vol: 0.08, slide: 90 }); },
  thump() { tone(70, 0.16, { vol: 0.25, slide: 45 }); },
  jump() { tone(420, 0.1, { slide: 700, vol: 0.06 }); },
};
