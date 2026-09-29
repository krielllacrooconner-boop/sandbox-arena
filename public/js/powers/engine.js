// =====================================================================
//  MOTOR DE PODERES
//  Ejecuta un poder YA SANEADO (sanitizeSpec) recorriendo sus acciones.
//  Cada acción del schema tiene su función en HANDLERS. Para sumar una capacidad nueva:
//    1) declarala en schema.js (ACTIONS)   2) escribí su handler acá con el mismo nombre.
//
//  ctx (contexto de una ejecución):
//    aim     -> { origin, dir, target, normal, selfPos, camDir, scale } (foto del momento del disparo)
//    remote  -> true si el poder lo lanzó OTRO jugador (solo efectos de mundo, nunca sobre tu estado)
//    owner   -> 'me' | id del jugador remoto (dueño de lo que se crea)
//    at/normal/prop -> punto de impacto cuando estamos dentro de un onHit
//    budget  -> tope de acciones por lanzamiento (evita bombas de rendimiento)
// =====================================================================
import { THREE } from '../three.js';
import { state, player } from '../state.js';
import { CONFIG, DEFAULTS, WORLD } from '../config.js';
import { clamp, rand } from '../util.js';
import * as col from '../colliders.js';
import { spawnProp, props, damageProp, impulseProp, removePropsByOwner, removeAllProps } from '../props.js';
import { burst, beam, ring, flash } from '../fx.js';
import { spawnProjectile, clearProjectiles } from '../projectiles.js';
import { sfx } from '../audio.js';
import { addBuff, clearBuffs } from '../buffs.js';
import { setLocalColor } from '../avatars.js';

// items.js se registra acá (evita un import circular)
export const hooks = { clearItems: () => {} };

const MAX_ACTIONS_PER_CAST = 220;
const MAX_TIMERS = 500;

// ---------------------------------------------------------------------
//  Temporizador propio (se actualiza con el bucle del juego)
// ---------------------------------------------------------------------
const timers = [];

export function later(ms, fn) {
    if (ms <= 0) { fn(); return; }
    if (timers.length >= MAX_TIMERS) return;
    timers.push({ at: performance.now() + ms, fn });
}

export function pendingTimers() { return timers.length; }

/** Cancela poderes que están a mitad de ejecución (tormentas, ráfagas, secuencias con wait). */
export function cancelTimers() { timers.length = 0; }

// ---------------------------------------------------------------------
//  Ambiente (cielo / niebla / luz) con transición suave
// ---------------------------------------------------------------------
const envTarget = { sky: new THREE.Color(WORLD.skyColor), fog: WORLD.fogDensity, ambient: WORLD.ambient };
let envUntil = 0;

function resetEnv() {
    envTarget.sky.set(WORLD.skyColor);
    envTarget.fog = WORLD.fogDensity;
    envTarget.ambient = WORLD.ambient;
    envUntil = 0;
}

function updateEnv(dt) {
    const s = state.scene;
    if (!s || !s.background) return;
    const k = 1 - Math.exp(-2.5 * dt);
    s.background.lerp(envTarget.sky, k);
    if (s.fog) {
        s.fog.color.copy(s.background);
        s.fog.density += (envTarget.fog - s.fog.density) * k;
    }
    if (state.ambient) state.ambient.intensity += (envTarget.ambient - state.ambient.intensity) * k;
}

export function updateEngine(now, dt = 0.016) {
    if (timers.length) {
        const due = [];
        for (let i = timers.length - 1; i >= 0; i--) {
            if (now >= timers[i].at) { due.push(timers[i]); timers.splice(i, 1); }
        }
        due.sort((a, b) => a.at - b.at);
        for (const t of due) {
            try { t.fn(); } catch (e) { console.warn('timer de poder falló:', e); }
        }
    }
    if (envUntil && now >= envUntil) resetEnv();
    updateEnv(dt);
}

// ---------------------------------------------------------------------
//  API pública
// ---------------------------------------------------------------------
/**
 * Ejecuta las acciones de un poder.
 * opts = { remote:boolean, owner:string }
 */
export function castPower(spec, aim, opts = {}) {
    const ctx = {
        aim,
        remote: !!opts.remote,
        owner: opts.owner || 'me',
        at: null, normal: null, prop: null,
        name: spec.name || 'Poder',
        buffCounter: { n: 0 },
        budget: { left: MAX_ACTIONS_PER_CAST }
    };
    runActions(spec.actions, ctx, 0);
}

/** Borra todo lo que creó el jugador local y restablece el ambiente. */
export function clearEverything() {
    cancelTimers();
    removeAllProps();
    clearBuffs();
    clearProjectiles();
    hooks.clearItems();
    resetEnv();
}

function runActions(list, ctx, from) {
    for (let i = from; i < list.length; i++) {
        if (ctx.budget.left-- <= 0) return;
        const a = list[i];
        if (a.do === 'wait') {
            // el resto de la secuencia continúa después de la pausa
            later(a.ms, () => runActions(list, ctx, i + 1));
            return;
        }
        const h = HANDLERS[a.do];
        if (!h) continue;
        try { h(a, ctx); } catch (e) { console.warn(`acción "${a.do}" falló:`, e); }
    }
}

// ---------------------------------------------------------------------
//  Utilidades
// ---------------------------------------------------------------------
const P = (x, y, z) => ({ x, y, z });
const vol = (ctx, v = 1) => (ctx.remote ? v * 0.5 : v);

/** Punto de referencia: ctx (impacto), self (jugador) o aim (bajo la mira). */
function pickPoint(at, ctx) {
    const aim = ctx.aim;
    if (at === 'self') {
        return { x: aim.selfPos.x, y: aim.selfPos.y + 0.9 * (aim.scale || 1), z: aim.selfPos.z, n: null };
    }
    if (at === 'ctx' && ctx.at) return { x: ctx.at.x, y: ctx.at.y, z: ctx.at.z, n: ctx.normal };
    return { x: aim.target.x, y: aim.target.y, z: aim.target.z, n: aim.normal };
}

/** Dirección aleatoria dentro de un cono de "deg" grados alrededor de d. */
function jitter(d, deg) {
    const v = new THREE.Vector3(d.x, d.y, d.z);
    if (v.lengthSq() < 1e-9) v.set(0, 0, -1);
    v.normalize();
    if (deg <= 0) return v;
    const th = (deg * Math.PI / 180) * Math.sqrt(Math.random());
    const ph = Math.random() * Math.PI * 2;
    const up = Math.abs(v.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const u = new THREE.Vector3().crossVectors(v, up).normalize();
    const w = new THREE.Vector3().crossVectors(v, u);
    return v.multiplyScalar(Math.cos(th))
        .addScaledVector(u, Math.sin(th) * Math.cos(ph))
        .addScaledVector(w, Math.sin(th) * Math.sin(ph))
        .normalize();
}

/** Punto aleatorio en un disco de radio r. */
function inDisk(r) {
    const a = Math.random() * Math.PI * 2;
    const d = Math.sqrt(Math.random()) * r;
    return [Math.cos(a) * d, Math.sin(a) * d];
}

function withHit(ctx, hit) {
    return { ...ctx, at: hit.point, normal: hit.normal || null, prop: hit.prop || null };
}

// ---------------------------------------------------------------------
//  HANDLERS
// ---------------------------------------------------------------------
const HANDLERS = {
    // ---------- disparos ----------
    hitscan(a, ctx) {
        const aim = ctx.aim;
        sfx(a.sfx, vol(ctx));
        let hitCallbacks = 14;   // tope de onHit por disparo (escopetas con onHit, etc.)

        for (let n = 0; n < a.count; n++) {
            let o, d;
            if (a.origin === 'sky') {
                const c = ctx.at || aim.target;
                const [dx, dz] = inDisk(a.area);
                o = P(c.x + dx, c.y + 45, c.z + dz);
                d = jitter(P(0, -1, 0), a.spread);
            } else if (ctx.at) {
                // dentro de un onHit: sale desde el impacto (esquirlas, rebotes, cadenas)
                const nrm = ctx.normal || aim.dir;
                o = P(ctx.at.x + nrm.x * 0.15, ctx.at.y + nrm.y * 0.15, ctx.at.z + nrm.z * 0.15);
                d = jitter(nrm, Math.max(a.spread, 1));
            } else {
                o = aim.origin;
                d = jitter(aim.dir, a.spread);
            }

            // Traza (con pierce atraviesa objetos; el suelo y los pilares siempre frenan)
            const hits = [];
            let ox = o.x, oy = o.y, oz = o.z, left = a.range;
            let end = P(o.x + d.x * a.range, o.y + d.y * a.range, o.z + d.z * a.range);
            for (let k = 0; k < (a.pierce ? 8 : 1) && left > 0; k++) {
                const h = col.raycast(ox, oy, oz, d.x, d.y, d.z, left);
                if (!h) break;
                hits.push(h);
                end = P(h.x, h.y, h.z);
                if (!a.pierce || h.kind !== 'prop') break;
                ox = h.x + d.x * 0.02; oy = h.y + d.y * 0.02; oz = h.z + d.z * 0.02;
                left -= h.t + 0.02;
            }

            beam(o, end, a.color, a.width, a.origin === 'sky' ? 0.28 : 0.14);

            for (const h of hits) {
                const prop = h.box && h.box.ref ? h.box.ref : null;
                if (prop) {
                    damageProp(prop, a.damage);
                    if (a.force) impulseProp(prop, d.x * a.force, d.y * a.force, d.z * a.force);
                }
                burst(P(h.x, h.y, h.z), a.color, 5, 3, 0.3, 4);
                if (a.onHit.length && hitCallbacks-- > 0) {
                    runActions(a.onHit, withHit(ctx, { point: P(h.x, h.y, h.z), normal: P(h.nx, h.ny, h.nz), prop }), 0);
                }
            }
        }
    },

    projectile(a, ctx) {
        const aim = ctx.aim;
        sfx(a.sfx, vol(ctx));

        const launch = () => {
            let pos, dir;
            if (a.origin === 'sky') {
                const c = ctx.at || aim.target;
                const [dx, dz] = inDisk(a.area);
                dir = new THREE.Vector3(rand(-0.3, 0.3), -1, rand(-0.3, 0.3)).normalize();
                const tx = c.x + dx, tz = c.z + dz;
                pos = P(tx - dir.x * 45, c.y + 45, tz - dir.z * 45);
            } else if (ctx.at) {
                const nrm = ctx.normal || aim.dir;
                pos = P(ctx.at.x + nrm.x * 0.35, ctx.at.y + nrm.y * 0.35, ctx.at.z + nrm.z * 0.35);
                dir = jitter(nrm, Math.max(a.spread, 1));
            } else {
                pos = P(aim.origin.x, aim.origin.y, aim.origin.z);
                dir = jitter(aim.dir, a.spread);
            }
            spawnProjectile({
                pos, vel: P(dir.x * a.speed, dir.y * a.speed, dir.z * a.speed),
                gravity: a.gravity, size: a.size, life: a.life, shape: a.shape, color: a.color,
                bounce: a.bounce, fuse: a.fuse, trail: a.trail, damage: a.damage, force: a.force,
                onHit: (hit) => {
                    burst(hit.point, a.color, 8, 3, 0.4, 6);
                    if (a.onHit.length) runActions(a.onHit, withHit(ctx, hit), 0);
                }
            });
        };

        for (let n = 0; n < a.count; n++) later(n * a.stagger, launch);
    },

    explosion(a, ctx) {
        const p = pickPoint(a.at, ctx);
        const c = P(p.x, p.y, p.z);
        if (p.n && a.at !== 'self') { c.x += p.n.x * 0.15; c.y += p.n.y * 0.15; c.z += p.n.z * 0.15; }

        // Visual
        flash(c, a.color, a.radius * 0.7, 0.35);
        ring(c, a.color, a.radius * 1.1, 0.5);
        burst(c, a.color, clamp(Math.round(10 + a.radius * 7), 10, 70), 2 + a.radius * 1.4, 0.9, 8);
        sfx(a.sfx, vol(ctx, clamp(0.5 + a.radius / 10, 0.5, 1.6)));

        // Objetos del mundo
        for (const pr of [...props.values()]) {
            const dx = pr.pos.x - c.x, dy = pr.pos.y - c.y, dz = pr.pos.z - c.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            const d = dist - Math.max(pr.hx, pr.hy, pr.hz) * 0.6;
            if (d >= a.radius) continue;
            const f = 1 - Math.max(0, d) / a.radius;

            damageProp(pr, a.damage * f);
            if (!pr.dynamic || !a.force) continue;
            let ix = dist > 0.01 ? dx / dist : 0;
            let iy = dist > 0.01 ? dy / dist : 1;
            let iz = dist > 0.01 ? dz / dist : 0;

            if (a.force < 0) {
                // Implosión: la velocidad tiende a una velocidad objetivo hacia el centro (más lenta cuanto más cerca),
                // así los objetos convergen y se acomodan en vez de pasarse de largo.
                if (dist < 0.6) { pr.vel.multiplyScalar(0.6); continue; }
                const vt = Math.min(-a.force * f * 0.5, dist * 2.5);
                pr.vel.x += (-ix * vt - pr.vel.x) * 0.5;
                pr.vel.y += (-iy * vt - pr.vel.y) * 0.5;
                pr.vel.z += (-iz * vt - pr.vel.z) * 0.5;
                continue;
            }

            iy += 0.35;   // los objetos saltan un poco
            const l = Math.sqrt(ix * ix + iy * iy + iz * iz) || 1;
            const m = a.force * f / l;
            impulseProp(pr, ix * m, iy * m, iz * m);
        }

        // Empuje sobre el jugador local
        if (!ctx.remote || CONFIG.remoteKnockback) knockback(c, a.radius, a.force);
    },

    // ---------- construcción ----------
    spawn: spawnAction,

    // ---------- estado del jugador (solo el que lanza el poder) ----------
    buff(a, ctx) {
        if (ctx.remote) return;
        const n = ctx.buffCounter.n++;
        const name = n ? `${ctx.name} ${n + 1}` : ctx.name;
        addBuff(name, { speedMul: a.speedMul, jumpMul: a.jumpMul, gravityMul: a.gravityMul, fly: a.fly, scale: a.scale }, a.duration);
        if (a.fly) player.isGrounded = false;
        sfx(a.sfx);
    },

    teleport(a, ctx) {
        if (ctx.remote) return;
        const aim = ctx.aim;
        const s = state.scaleCur || 1;
        const eyeH = DEFAULTS.eyeHeight * s;
        const from = P(player.position.x, player.position.y, player.position.z);
        let dest;

        if (a.to === 'up') {
            dest = P(from.x, Math.min(140, from.y + a.distance), from.z);
        } else if (a.to === 'spawn') {
            dest = P(WORLD.spawn[0], WORLD.spawn[1], WORLD.spawn[2]);
        } else if (a.to === 'random') {
            const lim = CONFIG.worldHalf - 6;
            const x = rand(-lim, lim), z = rand(-lim, lim);
            dest = P(x, col.groundHeightAt(x, z, 500) + 0.2, z);
        } else {
            // aim / forward: hacia donde mirás, frenando antes de una pared
            const cd = aim.camDir;
            const eye = P(from.x, from.y + eyeH, from.z);
            const hit = col.raycast(eye.x, eye.y, eye.z, cd.x, cd.y, cd.z, a.distance);
            const t = hit ? Math.max(0, hit.t - 0.7) : a.distance;
            dest = P(eye.x + cd.x * t, eye.y + cd.y * t - eyeH, eye.z + cd.z * t);
        }

        const lim = CONFIG.worldHalf - 1;
        dest.x = clamp(dest.x, -lim, lim);
        dest.z = clamp(dest.z, -lim, lim);
        dest.y = Math.max(dest.y, col.groundHeightAt(dest.x, dest.z, dest.y + DEFAULTS.stepHeight));

        ring(from, '#67e8f9', 2.5, 0.4);
        player.position.set(dest.x, dest.y, dest.z);
        if (!a.keepVelocity) player.velocity.set(0, 0, 0);
        player.isGrounded = false;
        burst(P(dest.x, dest.y + 0.9 * s, dest.z), '#67e8f9', 24, 4, 0.6, 2);
        sfx(a.sfx);
    },

    launch(a, ctx) {
        if (ctx.remote) return;
        const cd = ctx.aim.camDir;
        let hx = cd.x, hz = cd.z;
        const hl = Math.hypot(hx, hz);
        if (hl < 0.05) { hx = -Math.sin(player.rotationY); hz = -Math.cos(player.rotationY); }
        else { hx /= hl; hz /= hl; }

        const v = player.velocity;
        if (a.forward) {
            v.x += hx * a.forward;
            v.z += hz * a.forward;
            // tope: los impulsos repetidos (jetpack) no se acumulan sin límite
            const cap = Math.max(Math.abs(a.forward), 16);
            const h = Math.hypot(v.x, v.z);
            if (h > cap) { v.x *= cap / h; v.z *= cap / h; }
        }
        if (a.up) {
            if (a.up > 0) v.y = Math.max(v.y, Math.min(v.y + a.up, Math.max(a.up, 16)));
            else v.y += a.up;
            player.isGrounded = false;
        }
        sfx(a.sfx);
    },

    // ---------- efectos ----------
    fx(a, ctx) {
        const p = pickPoint(a.at, ctx);
        if (a.kind === 'burst') {
            burst(p, a.color, a.count, 2 + a.size * 1.2, 0.8, 5);
        } else if (a.kind === 'ring') {
            const y = a.at === 'self' ? ctx.aim.selfPos.y : p.y;
            ring(P(p.x, y, p.z), a.color, a.size, 0.55);
        } else {
            flash(p, a.color, a.size * 0.6, 0.3);
        }
        sfx(a.sfx, vol(ctx));
    },

    env(a, ctx) {
        if (ctx.remote) return;
        envTarget.sky.set(a.sky);
        envTarget.fog = a.fog;
        envTarget.ambient = a.ambient;
        envUntil = performance.now() + a.duration;
        sfx(a.sfx);
    },

    color(a, ctx) {
        if (ctx.remote) return;
        setLocalColor(a.hex);
    },

    repeat(a, ctx) {
        for (let k = 0; k < a.times; k++) {
            later(k * a.every, () => runActions(a.actions, ctx, 0));
        }
    },

    clear(a, ctx) {
        if (ctx.remote) return;
        if (a.what === 'props' || a.what === 'all') removePropsByOwner('me');
        if (a.what === 'buffs' || a.what === 'all') clearBuffs();
        if (a.what === 'items' || a.what === 'all') hooks.clearItems();
        if (a.what === 'all') { clearProjectiles(); resetEnv(); cancelTimers(); }
    },

    reset(a, ctx) {
        if (ctx.remote) return;
        cancelTimers();
        clearProjectiles();
        clearBuffs();
        resetEnv();
        player.position.set(WORLD.spawn[0], WORLD.spawn[1], WORLD.spawn[2]);
        player.velocity.set(0, 0, 0);
        player.rotationY = 0;
        player.pitchX = 0;
        setLocalColor(state.baseColor);
    }
};

// ---------------------------------------------------------------------
//  Empuje de explosiones sobre el jugador local
// ---------------------------------------------------------------------
function knockback(c, radius, force) {
    if (!force) return;
    const s = state.scaleCur || 1;
    const px = player.position.x, py = player.position.y + 0.9 * s, pz = player.position.z;
    const dx = px - c.x, dy = py - c.y, dz = pz - c.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const reach = radius + 0.5;
    if (dist >= reach) return;
    const f = 1 - dist / reach;

    let ix = dist > 0.05 ? dx / dist : 0;
    let iy = dist > 0.05 ? dy / dist : 1;
    let iz = dist > 0.05 ? dz / dist : 0;

    if (force < 0) {
        // Implosión: te atrae hacia el centro sin lanzarte al otro lado
        if (dist < 0.8) { player.velocity.multiplyScalar(0.85); return; }
        const vt = Math.min(-force * f * 0.5, dist * 2.5);
        player.velocity.x += (-ix * vt - player.velocity.x) * 0.35;
        player.velocity.y += (-iy * vt - player.velocity.y) * 0.35;
        player.velocity.z += (-iz * vt - player.velocity.z) * 0.35;
        return;
    }

    iy += 0.35;   // pequeño impulso hacia arriba: permite saltos de cohete
    const l = Math.sqrt(ix * ix + iy * iy + iz * iz) || 1;
    const m = force * f * 0.9 / l;
    player.velocity.x += ix * m;
    player.velocity.y += iy * m;
    player.velocity.z += iz * m;
    if (iy * m > 1) player.isGrounded = false;
}

// ---------------------------------------------------------------------
//  spawn: construir cosas (muros, torres, escaleras, cubos...)
// ---------------------------------------------------------------------
function overlapsPlayer(cx, cy, cz, wx, wy, wz) {
    const r = DEFAULTS.playerRadius + 0.02;
    const h = DEFAULTS.playerHeight * (state.scaleCur || 1);
    const p = player.position;
    return Math.abs(cx - p.x) < wx / 2 + r &&
        Math.abs(cz - p.z) < wz / 2 + r &&
        (cy + wy / 2) > p.y + 0.05 &&
        (cy - wy / 2) < p.y + h;
}

function duplicateStatic(cx, cy, cz, wx, wy, wz) {
    for (const pr of props.values()) {
        if (pr.dynamic) continue;
        if (Math.abs(pr.pos.x - cx) < 0.05 && Math.abs(pr.pos.y - cy) < 0.05 && Math.abs(pr.pos.z - cz) < 0.05 &&
            Math.abs(pr.sx - wx) < 0.05 && Math.abs(pr.sy - wy) < 0.05 && Math.abs(pr.sz - wz) < 0.05) return true;
    }
    return false;
}

/** Devuelve la lista de elementos { u, v, w, h } (u = derecha, v = arriba, w = adelante, h = alto opcional). */
function layout(a, count, sx, sy, sz) {
    const out = [];
    const sp = a.spacing;
    switch (a.pattern) {
        case 'wall': {
            const rows = Math.max(1, Math.round(Math.sqrt(count / 2)));
            const cols = Math.ceil(count / rows);
            for (let i = 0; i < count; i++) {
                out.push({ u: ((i % cols) - (cols - 1) / 2) * sx * sp, v: Math.floor(i / cols) * sy, w: 0 });
            }
            break;
        }
        case 'line':
            for (let i = 0; i < count; i++) out.push({ u: 0, v: 0, w: i * sz * sp });
            break;
        case 'tower':
            for (let i = 0; i < count; i++) out.push({ u: 0, v: i * sy, w: 0 });
            break;
        case 'ring': {
            const R = Math.max(2.5, (count * Math.max(sx, sz) * sp) / (Math.PI * 2));
            for (let i = 0; i < count; i++) {
                const ang = (i / count) * Math.PI * 2;
                out.push({ u: Math.cos(ang) * R, v: 0, w: Math.sin(ang) * R });
            }
            break;
        }
        case 'grid': {
            const cols = Math.ceil(Math.sqrt(count));
            const rows = Math.ceil(count / cols);
            for (let i = 0; i < count; i++) {
                out.push({ u: ((i % cols) - (cols - 1) / 2) * sx * sp, v: 0, w: (Math.floor(i / cols) - (rows - 1) / 2) * sz * sp });
            }
            break;
        }
        case 'stairs':
            for (let i = 0; i < count; i++) {
                const h = Math.min(40, sy * (i + 1));
                out.push({ u: 0, v: (h - sy) / 2, w: i * sz * sp, h });
            }
            break;
        case 'scatter': {
            const R = Math.max(3, sp * 1.2 * Math.sqrt(count) * Math.max(sx, sz));
            for (let i = 0; i < count; i++) {
                const [u, w] = inDisk(R);
                out.push({ u, v: 0, w });
            }
            break;
        }
        default:
            out.push({ u: 0, v: 0, w: 0 });
    }
    return out;
}

function spawnAction(a, ctx) {
    const aim = ctx.aim;
    const [sx, sy, sz] = a.size;
    const count = a.pattern === 'single' ? 1 : a.count;

    // Dirección cardinal hacia donde mira quien lanza (las cajas no rotan: van alineadas a los ejes)
    let fx = aim.camDir.x, fz = aim.camDir.z;
    if (Math.hypot(fx, fz) < 0.05) { fx = aim.dir.x; fz = aim.dir.z; }
    const F = Math.abs(fx) > Math.abs(fz) ? [Math.sign(fx), 0] : [0, Math.sign(fz) || -1];
    const R = [-F[1], F[0]];   // derecha

    // Tamaño real en el mundo (si mira hacia los lados, ancho y profundidad se intercambian)
    const wx = Math.abs(R[0]) * sx + Math.abs(F[0]) * sz;
    const wz = Math.abs(R[1]) * sx + Math.abs(F[1]) * sz;
    const depth = sz;   // profundidad a lo largo de F

    // ---- centro del primer elemento ----
    const self = aim.selfPos;
    let c;
    if (a.at === 'aim' || a.at === 'ctx') {
        const p = pickPoint(a.at, ctx);
        const n = p.n;
        if (a.snap) {
            const q = n ? P(p.x + n.x * 0.02, p.y + n.y * 0.02, p.z + n.z * 0.02) : P(p.x, p.y + 0.02, p.z);
            c = P((Math.floor(q.x / wx) + 0.5) * wx, (Math.floor(q.y / sy) + 0.5) * sy, (Math.floor(q.z / wz) + 0.5) * wz);
        } else if (n && Math.abs(n.y) < 0.5) {
            c = P(p.x + n.x * wx / 2, p.y, p.z + n.z * wz / 2);      // contra una pared
        } else {
            c = P(p.x, p.y + (n && n.y < -0.5 ? -sy / 2 : sy / 2), p.z);
        }
    } else if (a.at === 'sky') {
        const p = pickPoint('aim', ctx);
        c = P(p.x, p.y + 30, p.z);
    } else {
        // front / self: delante de quien lanza
        const ahead = 1.5 + depth / 2;
        const bx = (a.at === 'self' && a.pattern === 'ring') ? self.x : self.x + F[0] * ahead;
        const bz = (a.at === 'self' && a.pattern === 'ring') ? self.z : self.z + F[1] * ahead;
        // se apoya sobre el suelo real (plataforma, piso o la cima de algo sólido) bajo ese punto
        const floorY = col.groundHeightAt(bx, bz, self.y + DEFAULTS.stepHeight);
        c = P(bx, floorY + sy / 2, bz);
        if (a.at === 'self' && a.pattern === 'line') c.y = self.y - sy / 2;   // puente: la cima queda a la altura de tus pies
    }

    // ---- crear elementos ----
    const now = performance.now();
    const lim = CONFIG.worldHalf - 0.5;
    const dynamic = a.physics === 'dynamic';
    const items = layout(a, count, sx, sy, sz);
    let created = 0, first = null;

    for (const it of items) {
        const h = it.h || sy;
        const x = clamp(c.x + R[0] * it.u + F[0] * it.w, -lim, lim);
        const z = clamp(c.z + R[1] * it.u + F[1] * it.w, -lim, lim);
        let y = c.y + it.v + (a.at === 'sky' ? rand(0, 14) : 0);
        if (y - h / 2 < 0 && a.at !== 'sky') y = h / 2;   // nunca bajo el piso

        if (!dynamic && !ctx.remote && overlapsPlayer(x, y, z, wx, h, wz)) continue;
        if (a.snap && !dynamic && duplicateStatic(x, y, z, wx, h, wz)) continue;

        spawnProp({
            shape: a.shape, size: [wx, h, wz], pos: [x, y, z],
            color: a.color, material: a.material, dynamic,
            expireAt: a.life ? now + a.life : 0, hp: a.hp, bounce: a.bounce, owner: ctx.owner
        });
        created++;
        if (!first) first = P(x, y, z);
    }

    if (first) {
        burst(first, a.color, 10, 3, 0.5, 4);
        sfx(a.sfx, vol(ctx));
    }
    return created;
}
