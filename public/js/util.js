export const $ = (id) => (typeof document !== 'undefined' ? document.getElementById(id) : null);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const rand = (a, b) => a + Math.random() * (b - a);
export const safeNum = (v, d = 0) => (typeof v === 'number' && isFinite(v)) ? v : d;
export const round2 = (v) => Math.round(v * 100) / 100;
