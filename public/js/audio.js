// Sonidos sintetizados con WebAudio (sin archivos). Se crean recién tras el primer gesto del usuario.
import { CONFIG } from './config.js';

let ctx = null;
let noiseBuf = null;

function getCtx() {
    if (!CONFIG.sound) return null;
    const AC = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return null;
    if (!ctx) {
        try { ctx = new AC(); } catch (e) { return null; }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
}

function tone(c, type, f0, f1, dur, vol) {
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
}

function noise(c, dur, vol, f0, f1) {
    if (!noiseBuf) {
        noiseBuf = c.createBuffer(1, c.sampleRate * 0.6, c.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    const filt = c.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(f0, t);
    filt.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt).connect(g).connect(c.destination);
    src.start(t);
    src.stop(t + dur + 0.02);
}

export function sfx(name, vol = 1) {
    if (!name || name === 'none') return;
    const c = getCtx();
    if (!c) return;
    const v = 0.18 * vol;
    try {
        switch (name) {
            case 'laser': tone(c, 'sawtooth', 1100, 180, 0.16, v); break;
            case 'zap': tone(c, 'square', 300, 1600, 0.12, v * 0.8); break;
            case 'pop': tone(c, 'sine', 420, 140, 0.09, v * 1.4); break;
            case 'boom': noise(c, 0.55, v * 2.2, 900, 60); tone(c, 'square', 110, 30, 0.45, v); break;
            case 'whoosh': noise(c, 0.3, v * 1.2, 3000, 300); break;
            case 'magic':
                tone(c, 'triangle', 520, 780, 0.18, v);
                setTimeout(() => { try { tone(c, 'triangle', 780, 1170, 0.2, v); } catch (e) { /* ignorar */ } }, 90);
                break;
        }
    } catch (e) { /* el audio nunca debe romper el juego */ }
}

export function toggleSound() {
    CONFIG.sound = !CONFIG.sound;
    return CONFIG.sound;
}
