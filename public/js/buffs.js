// Efectos temporales sobre el jugador (vuelo, velocidad, gravedad, tamaño...).
import { setBuffsTag, addLog } from './hud.js';

export const stats = { speedMul: 1, jumpMul: 1, gravityMul: 1, fly: false, scale: 1 };
const buffs = new Map();
let lastHud = 0;
let hudText = '';

function recompute() {
    let speedMul = 1, jumpMul = 1, gravityMul = 1, scale = 1, fly = false;
    for (const b of buffs.values()) {
        speedMul *= b.speedMul;
        jumpMul *= b.jumpMul;
        gravityMul *= b.gravityMul;
        scale *= b.scale;
        if (b.fly) fly = true;
    }
    stats.speedMul = Math.max(0.1, Math.min(8, speedMul));
    stats.jumpMul = Math.max(0.1, Math.min(8, jumpMul));
    stats.gravityMul = Math.max(-2, Math.min(3, gravityMul));
    stats.scale = Math.max(0.25, Math.min(6, scale));
    stats.fly = fly;
}

export function addBuff(name, mods, durationMs, now = performance.now()) {
    buffs.set(name, {
        until: now + durationMs,
        speedMul: mods.speedMul ?? 1,
        jumpMul: mods.jumpMul ?? 1,
        gravityMul: mods.gravityMul ?? 1,
        scale: mods.scale ?? 1,
        fly: !!mods.fly
    });
    recompute();
}

export function clearBuffs() {
    buffs.clear();
    recompute();
    hudText = '';
    setBuffsTag('');
}

export function activeBuffCount() { return buffs.size; }

export function updateBuffs(now) {
    let changed = false;
    for (const [name, b] of buffs) {
        if (now >= b.until) {
            buffs.delete(name);
            changed = true;
            addLog([{ text: `[Sistema] Terminó: ${name}.`, cls: 'text-slate-400' }]);
        }
    }
    if (changed) recompute();

    if (now - lastHud > 250) {
        lastHud = now;
        const parts = [];
        for (const [name, b] of buffs) parts.push(`${name} ${Math.ceil((b.until - now) / 1000)}s`);
        const text = parts.join(' · ');
        if (text !== hudText) {
            hudText = text;
            setBuffsTag(text);
        }
    }
}
