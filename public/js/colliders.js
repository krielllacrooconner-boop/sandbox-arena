// =====================================================================
//  COLISIONES (matemática pura, sin Three.js)
//  Todo objeto del mundo (pilares, muros, cubos...) es una caja alineada a los ejes.
//  - "solid": el jugador choca con ella y puede subirse encima.
//  - todas sirven para los rayos y proyectiles.
// =====================================================================
import { WORLD, DEFAULTS } from './config.js';

const boxes = new Map();

export function addBox(id, cx, cy, cz, hx, hy, hz, solid = true, ref = null) {
    boxes.set(id, { id, cx, cy, cz, hx, hy, hz, solid, ref, minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 });
    moveBox(id, cx, cy, cz);
}

export function moveBox(id, cx, cy, cz) {
    const b = boxes.get(id);
    if (!b) return;
    b.cx = cx; b.cy = cy; b.cz = cz;
    b.minX = cx - b.hx; b.maxX = cx + b.hx;
    b.minY = cy - b.hy; b.maxY = cy + b.hy;
    b.minZ = cz - b.hz; b.maxZ = cz + b.hz;
}

export function removeBox(id) { boxes.delete(id); }
export function clearBoxes() { boxes.clear(); }
export function boxCount() { return boxes.size; }

/** Altura del suelo bajo (x, z) para alguien cuyos pies están en y. Incluye la plataforma y las cajas sólidas. */
export function groundHeightAt(x, z, y, radius = DEFAULTS.playerRadius) {
    let h = 0;
    if (x * x + z * z <= WORLD.platformRadius * WORLD.platformRadius) h = WORLD.platformHeight;
    const step = DEFAULTS.stepHeight;
    for (const b of boxes.values()) {
        if (!b.solid) continue;
        if (x + radius <= b.minX || x - radius >= b.maxX || z + radius <= b.minZ || z - radius >= b.maxZ) continue;
        if (y >= b.maxY - step && b.maxY > h) h = b.maxY;
    }
    return h;
}

/** Empuja la posición fuera de las cajas sólidas (paredes). Modifica pos y vel. */
export function collideSolids(pos, vel, radius = DEFAULTS.playerRadius, height = DEFAULTS.playerHeight) {
    const step = DEFAULTS.stepHeight;
    for (let iter = 0; iter < 2; iter++) {
        for (const b of boxes.values()) {
            if (!b.solid) continue;
            if (pos.y >= b.maxY - step) continue;      // se puede caminar encima
            if (pos.y + height <= b.minY) continue;    // está por encima de la cabeza
            const ex = b.hx + radius;
            const ez = b.hz + radius;
            const dx = pos.x - b.cx;
            const dz = pos.z - b.cz;
            if (Math.abs(dx) >= ex || Math.abs(dz) >= ez) continue;
            const penX = ex - Math.abs(dx);
            const penZ = ez - Math.abs(dz);
            if (penX < penZ) {
                pos.x = b.cx + (dx >= 0 ? ex : -ex);
                if (vel) vel.x = 0;
            } else {
                pos.z = b.cz + (dz >= 0 ? ez : -ez);
                if (vel) vel.z = 0;
            }
        }
    }
}

/**
 * Rayo contra el mundo (suelo, plataforma y cajas). Devuelve el impacto más cercano o null:
 * { t, x, y, z, nx, ny, nz, kind: 'ground'|'platform'|'prop'|'static', box }
 * Si el origen está dentro de una caja, esa caja se ignora (evita quedarse trabado).
 */
export function raycast(ox, oy, oz, dx, dy, dz, maxDist = 200) {
    let best = null;
    let bestT = maxDist;

    if (dy < -1e-9) {
        const tg = -oy / dy;
        if (tg > 1e-6 && tg < bestT) {
            best = { t: tg, nx: 0, ny: 1, nz: 0, kind: 'ground', box: null };
            bestT = tg;
        }
        const tp = (WORLD.platformHeight - oy) / dy;
        if (tp > 1e-6 && tp < bestT) {
            const px = ox + dx * tp;
            const pz = oz + dz * tp;
            if (px * px + pz * pz <= WORLD.platformRadius * WORLD.platformRadius) {
                best = { t: tp, nx: 0, ny: 1, nz: 0, kind: 'platform', box: null };
                bestT = tp;
            }
        }
    }

    for (const b of boxes.values()) {
        let tmin = -Infinity;
        let tmax = Infinity;
        let nx = 0, ny = 0, nz = 0;
        let miss = false;

        // eje X
        if (Math.abs(dx) < 1e-9) {
            if (ox < b.minX || ox > b.maxX) miss = true;
        } else {
            let t1 = (b.minX - ox) / dx;
            let t2 = (b.maxX - ox) / dx;
            if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
            if (t1 > tmin) { tmin = t1; nx = dx > 0 ? -1 : 1; ny = 0; nz = 0; }
            if (t2 < tmax) tmax = t2;
        }
        // eje Y
        if (!miss) {
            if (Math.abs(dy) < 1e-9) {
                if (oy < b.minY || oy > b.maxY) miss = true;
            } else {
                let t1 = (b.minY - oy) / dy;
                let t2 = (b.maxY - oy) / dy;
                if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
                if (t1 > tmin) { tmin = t1; nx = 0; ny = dy > 0 ? -1 : 1; nz = 0; }
                if (t2 < tmax) tmax = t2;
            }
        }
        // eje Z
        if (!miss) {
            if (Math.abs(dz) < 1e-9) {
                if (oz < b.minZ || oz > b.maxZ) miss = true;
            } else {
                let t1 = (b.minZ - oz) / dz;
                let t2 = (b.maxZ - oz) / dz;
                if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
                if (t1 > tmin) { tmin = t1; nx = 0; ny = 0; nz = dz > 0 ? -1 : 1; }
                if (t2 < tmax) tmax = t2;
            }
        }
        if (miss || tmax < 0 || tmin > tmax) continue;
        if (tmin < 0) continue;                 // origen dentro de la caja
        if (tmin < bestT) {
            best = { t: tmin, nx, ny, nz, kind: b.ref ? 'prop' : 'static', box: b };
            bestT = tmin;
        }
    }

    if (best) {
        best.x = ox + dx * best.t;
        best.y = oy + dy * best.t;
        best.z = oz + dz * best.t;
    }
    return best;
}
