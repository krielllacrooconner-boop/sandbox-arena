// =====================================================================
//  OBJETOS DEL MUNDO (props): muros, cubos, torres, blancos...
//  - estáticos: sólidos (el jugador choca y puede subirse)
//  - dinámicos: caen, rebotan y se empujan con explosiones
//  Tienen vida opcional (hp) y duración opcional.
// =====================================================================
import { THREE } from './three.js';
import { state } from './state.js';
import { CONFIG } from './config.js';
import * as col from './colliders.js';
import { burst } from './fx.js';

export const props = new Map();
let nextId = 1;
const GEO = {};
const MATS = new Map();
const respawns = [];
const _tmp = new THREE.Vector3();

function geo(shape) {
    if (!GEO[shape]) {
        if (shape === 'sphere') GEO[shape] = new THREE.SphereGeometry(0.5, 14, 10);
        else if (shape === 'cylinder') GEO[shape] = new THREE.CylinderGeometry(0.5, 0.5, 1, 16);
        else GEO[shape] = new THREE.BoxGeometry(1, 1, 1);
    }
    return GEO[shape];
}

function mat(kind, color) {
    const key = kind + '|' + color;
    let m = MATS.get(key);
    if (!m) {
        if (kind === 'neon') m = new THREE.MeshBasicMaterial({ color });
        else if (kind === 'glass') m = new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.4, depthWrite: false });
        else m = new THREE.MeshLambertMaterial({ color });
        MATS.set(key, m);
    }
    return m;
}

/**
 * o = { shape, size:[x,y,z], pos:[x,y,z] (centro), color, material, dynamic, expireAt (ms, 0=nunca),
 *       hp (0=indestructible), bounce, owner, target, respawn }
 */
export function spawnProp(o) {
    if (!state.scene) return null;
    if (props.size >= CONFIG.maxProps) evictOldest();

    const [sx, sy, sz] = o.size;
    const mesh = new THREE.Mesh(geo(o.shape), mat(o.material || 'solid', o.color || '#94a3b8'));
    mesh.position.set(o.pos[0], o.pos[1], o.pos[2]);
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    state.scene.add(mesh);

    const id = 'p' + (nextId++);
    const prop = {
        id, mesh, pos: mesh.position, shape: o.shape,
        sx, sy, sz, hx: sx / 2, hy: sy / 2, hz: sz / 2,
        vel: new THREE.Vector3(),
        dynamic: !!o.dynamic,
        hp: o.hp || 0, maxHp: o.hp || 0,
        bounce: o.bounce ?? 0.3,
        owner: o.owner || 'me',
        expireAt: o.expireAt || 0,
        target: !!o.target,
        respawn: o.respawn || null,
        color: o.color || '#94a3b8'
    };
    props.set(id, prop);
    col.addBox(id, o.pos[0], o.pos[1], o.pos[2], prop.hx, prop.hy, prop.hz, !prop.dynamic, prop);
    return prop;
}

function evictOldest() {
    for (const p of props.values()) {
        if (!p.target) { removeProp(p); return; }
    }
}

export function removeProp(p) {
    if (!props.has(p.id)) return;
    if (state.scene) state.scene.remove(p.mesh);
    col.removeBox(p.id);
    props.delete(p.id);
}

export function destroyProp(p) {
    burst(p.pos, p.color, 26, 5 + Math.max(p.sx, p.sy, p.sz), 0.8, 10);
    if (p.respawn) respawns.push({ at: performance.now() + 4000, opts: { ...p.respawn, respawn: p.respawn } });
    removeProp(p);
}

export function damageProp(p, amount) {
    if (p.maxHp <= 0 || amount <= 0) return;
    p.hp -= amount;
    if (p.hp <= 0) destroyProp(p);
}

export function impulseProp(p, ix, iy, iz) {
    if (!p.dynamic) return;
    const mass = Math.max(0.4, Math.cbrt(p.sx * p.sy * p.sz));
    p.vel.x += ix / mass;
    p.vel.y += iy / mass;
    p.vel.z += iz / mass;
    const s = p.vel.length();
    if (s > 60) p.vel.multiplyScalar(60 / s);
}

/** Borra los objetos de un dueño ('me' = local). Los blancos del mundo no se borran. */
export function removePropsByOwner(owner) {
    for (const p of [...props.values()]) {
        if (p.owner === owner && !p.target) removeProp(p);
    }
}

export function removeAllProps() {
    for (const p of [...props.values()]) {
        if (!p.target) removeProp(p);
    }
}

export function updateProps(dt, now) {
    for (let i = respawns.length - 1; i >= 0; i--) {
        if (now >= respawns[i].at) {
            spawnProp(respawns[i].opts);
            respawns.splice(i, 1);
        }
    }

    const lim = CONFIG.worldHalf - 0.5;
    for (const p of props.values()) {
        if (p.expireAt && now >= p.expireAt) {
            burst(p.pos, p.color, 8, 2, 0.5, 4);
            removeProp(p);
            continue;
        }
        if (!p.dynamic) continue;

        p.vel.y -= 24 * dt;
        p.pos.x += p.vel.x * dt;
        p.pos.y += p.vel.y * dt;
        p.pos.z += p.vel.z * dt;

        // paredes: reutiliza la colisión de sólidos con la posición de los "pies"
        _tmp.set(p.pos.x, p.pos.y - p.hy, p.pos.z);
        col.collideSolids(_tmp, p.vel, Math.max(p.hx, p.hz) * 0.9, p.sy);
        p.pos.x = _tmp.x;
        p.pos.z = _tmp.z;

        // suelo
        const g = col.groundHeightAt(p.pos.x, p.pos.z, p.pos.y - p.hy, Math.min(p.hx, p.hz) * 0.8);
        if (p.pos.y - p.hy <= g) {
            p.pos.y = g + p.hy;
            if (p.vel.y < 0) {
                p.vel.y = -p.vel.y * p.bounce;
                if (Math.abs(p.vel.y) < 1.5) p.vel.y = 0;
            }
            const f = Math.pow(0.03, dt);
            p.vel.x *= f;
            p.vel.z *= f;
        }

        p.pos.x = Math.max(-lim, Math.min(lim, p.pos.x));
        p.pos.z = Math.max(-lim, Math.min(lim, p.pos.z));
        if (p.pos.y < -40) { removeProp(p); continue; }
        col.moveBox(p.id, p.pos.x, p.pos.y, p.pos.z);
    }
}

/** Blancos de práctica y cajas para empujar. */
export function spawnWorldTargets() {
    const targetSpec = (x, z) => ({
        shape: 'cylinder', size: [1.3, 2.2, 1.3], pos: [x, 1.1, z], color: '#f97316',
        material: 'solid', dynamic: false, hp: 60, owner: 'world', target: true
    });
    [[-8, -10], [-4, -13], [0, -16], [4, -13], [8, -10]].forEach(([x, z]) => {
        const o = targetSpec(x, z);
        o.respawn = { ...o };
        spawnProp(o);
    });
    [[-5, 8], [5, 8], [0, 11]].forEach(([x, z]) => {
        spawnProp({
            shape: 'box', size: [1.2, 1.2, 1.2], pos: [x, 0.6, z], color: '#38bdf8',
            material: 'solid', dynamic: true, bounce: 0.25, owner: 'world', target: true
        });
    });
}
