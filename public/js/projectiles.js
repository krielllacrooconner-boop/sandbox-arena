// =====================================================================
//  PROYECTILES FÍSICOS (cohetes, granadas, bolas de fuego, meteoros...)
//  - Vuelan con gravedad opcional y chocan contra el mundo con raycast (no atraviesan paredes finas).
//  - Sin fuse: explotan (onHit) al primer impacto.
//  - Con fuse: NO explotan al chocar, sino al terminar su vida. Rebotan si bounce > 0; si no, se pegan.
// =====================================================================
import { THREE } from './three.js';
import { state } from './state.js';
import { CONFIG } from './config.js';
import * as col from './colliders.js';
import { burst } from './fx.js';
import { damageProp, impulseProp } from './props.js';

const list = [];
const GEO = {};
const MATS = new Map();

function geo(shape) {
    if (!GEO[shape]) GEO[shape] = shape === 'cube' ? new THREE.BoxGeometry(1, 1, 1) : new THREE.SphereGeometry(0.5, 12, 8);
    return GEO[shape];
}
function mat(color) {
    let m = MATS.get(color);
    if (!m) { m = new THREE.MeshBasicMaterial({ color }); MATS.set(color, m); }
    return m;
}

/**
 * o = { pos:{x,y,z}, vel:{x,y,z}, gravity, size, life(ms), shape, color, bounce, fuse, trail,
 *       damage, force, onHit({point, normal, prop}) }
 */
export function spawnProjectile(o) {
    if (!state.scene) return null;
    if (list.length >= CONFIG.maxProjectiles) removeAt(0);

    const mesh = new THREE.Mesh(geo(o.shape), mat(o.color));
    mesh.scale.setScalar(o.size * 2);   // las geometrías miden 1 (diámetro); size es el radio
    mesh.position.set(o.pos.x, o.pos.y, o.pos.z);
    state.scene.add(mesh);

    const p = {
        mesh,
        pos: mesh.position,
        vel: new THREE.Vector3(o.vel.x, o.vel.y, o.vel.z),
        gravity: o.gravity || 0,
        radius: Math.max(0.05, o.size),
        dieAt: performance.now() + o.life,
        color: o.color,
        bounce: o.bounce || 0,
        fuse: !!o.fuse,
        trail: !!o.trail,
        damage: o.damage || 0,
        force: o.force || 0,
        onHit: o.onHit || null,
        alive: true
    };
    list.push(p);
    return p;
}

function removeAt(i) {
    const p = list[i];
    if (!p) return;
    if (state.scene) state.scene.remove(p.mesh);
    p.alive = false;
    list.splice(i, 1);
}

export function clearProjectiles() {
    for (let i = list.length - 1; i >= 0; i--) removeAt(i);
}

export function projectileCount() { return list.length; }

function detonate(p, point, normal, prop) {
    if (!p.alive) return;
    if (prop) {
        damageProp(prop, p.damage);
        const s = p.vel.length();
        if (s > 1e-6 && p.force) impulseProp(prop, (p.vel.x / s) * p.force, (p.vel.y / s) * p.force, (p.vel.z / s) * p.force);
    }
    p.alive = false;
    if (p.onHit) {
        try { p.onHit({ point, normal, prop: prop || null }); } catch (e) { console.warn('onHit falló:', e); }
    }
}

export function updateProjectiles(dt, now) {
    const lim = CONFIG.worldHalf + 12;

    for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        if (!p.alive) { removeAt(i); continue; }

        // Fin de vida
        if (now >= p.dieAt) {
            if (p.fuse) {
                detonate(p, { x: p.pos.x, y: p.pos.y, z: p.pos.z }, { x: 0, y: 1, z: 0 }, null);
            } else {
                burst(p.pos, p.color, 6, 2, 0.4, 2);   // se apaga sin explotar
            }
            removeAt(i);
            continue;
        }

        p.vel.y -= p.gravity * dt;

        const sx = p.vel.x * dt, sy = p.vel.y * dt, sz = p.vel.z * dt;
        const len = Math.sqrt(sx * sx + sy * sy + sz * sz);
        let moved = true;

        if (len > 1e-6) {
            const dx = sx / len, dy = sy / len, dz = sz / len;
            const hit = col.raycast(p.pos.x, p.pos.y, p.pos.z, dx, dy, dz, len + p.radius);
            if (hit) {
                const point = { x: hit.x, y: hit.y, z: hit.z };
                const normal = { x: hit.nx, y: hit.ny, z: hit.nz };
                const prop = hit.box && hit.box.ref ? hit.box.ref : null;

                if (!p.fuse) {
                    detonate(p, point, normal, prop);
                    removeAt(i);
                    continue;
                }

                // Con mecha: rebota o se pega
                p.pos.set(hit.x + hit.nx * p.radius, hit.y + hit.ny * p.radius, hit.z + hit.nz * p.radius);
                const vn = p.vel.x * hit.nx + p.vel.y * hit.ny + p.vel.z * hit.nz;
                if (p.bounce > 0 && Math.abs(vn) > 1.2) {
                    p.vel.x -= (1 + p.bounce) * vn * hit.nx;
                    p.vel.y -= (1 + p.bounce) * vn * hit.ny;
                    p.vel.z -= (1 + p.bounce) * vn * hit.nz;
                    p.vel.x *= 0.88; p.vel.z *= 0.88;   // rozamiento
                } else {
                    p.vel.set(0, 0, 0);                  // se pega / queda quieto
                }
                if (prop) damageProp(prop, p.damage * 0.25);
                moved = false;
            }
        }

        if (moved) {
            p.pos.x += sx; p.pos.y += sy; p.pos.z += sz;
        }

        if (p.trail && moved) burst(p.pos, p.color, 1, 0.5, 0.35, 0);

        // Fuera del mundo
        if (Math.abs(p.pos.x) > lim || Math.abs(p.pos.z) > lim || p.pos.y < -10 || p.pos.y > 250) {
            removeAt(i);
        }
    }
}
