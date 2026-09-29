// Efectos visuales baratos: partículas (un solo Points), rayos, ondas y destellos.
import { THREE } from './three.js';

const N = 700;
let scene = null;
let points = null;
let pos, base, col, vel, life, maxLife, grav;
let head = 0;
let alive = 0;
const timed = [];
const tmpColor = new THREE.Color();
let beamGeo, ringGeo, flashGeo;

export function initFx(sceneRef) {
    scene = sceneRef;
    pos = new Float32Array(N * 3);
    base = new Float32Array(N * 3);
    col = new Float32Array(N * 3);
    vel = new Float32Array(N * 3);
    life = new Float32Array(N);
    maxLife = new Float32Array(N).fill(1);
    grav = new Float32Array(N);
    for (let i = 0; i < N; i++) pos[i * 3 + 1] = -9999;

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.PointsMaterial({
        size: 0.3, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    points = new THREE.Points(g, m);
    points.frustumCulled = false;
    scene.add(points);

    beamGeo = new THREE.BoxGeometry(1, 1, 1);
    ringGeo = new THREE.RingGeometry(0.85, 1, 28);
    flashGeo = new THREE.SphereGeometry(1, 12, 8);
}

/** Ráfaga de partículas. p = {x,y,z} */
export function burst(p, color, count = 20, speed = 4, lifeSec = 0.6, gravity = 6) {
    if (!points) return;
    tmpColor.set(color);
    for (let n = 0; n < count; n++) {
        const i = head;
        head = (head + 1) % N;
        const k = i * 3;
        pos[k] = p.x; pos[k + 1] = p.y; pos[k + 2] = p.z;

        // dirección aleatoria uniforme en la esfera
        const u = Math.random() * 2 - 1;
        const th = Math.random() * Math.PI * 2;
        const s = Math.sqrt(1 - u * u);
        const sp = speed * (0.35 + Math.random() * 0.65);
        vel[k] = s * Math.cos(th) * sp;
        vel[k + 1] = u * sp;
        vel[k + 2] = s * Math.sin(th) * sp;

        base[k] = tmpColor.r; base[k + 1] = tmpColor.g; base[k + 2] = tmpColor.b;
        col[k] = tmpColor.r; col[k + 1] = tmpColor.g; col[k + 2] = tmpColor.b;
        life[i] = lifeSec * (0.6 + Math.random() * 0.4);
        maxLife[i] = life[i];
        grav[i] = gravity;
    }
    alive = Math.min(N, alive + count);
    points.geometry.attributes.position.needsUpdate = true;
    points.geometry.attributes.color.needsUpdate = true;
}

function addTimed(mesh, dur, update) {
    if (!scene || timed.length > 80) {
        // demasiados efectos: se descarta este
        if (mesh.material) mesh.material.dispose();
        return;
    }
    scene.add(mesh);
    timed.push({
        t: 0, dur, mesh, update,
        done() {
            scene.remove(mesh);
            if (mesh.material) mesh.material.dispose();
        }
    });
}

/** Rayo (láser/relámpago) entre dos puntos. */
export function beam(from, to, color, width = 0.05, dur = 0.14) {
    if (!scene) return;
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 0.01) return;
    const mat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending
    });
    const mesh = new THREE.Mesh(beamGeo, mat);
    mesh.position.set((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
    mesh.lookAt(to.x, to.y, to.z);
    mesh.scale.set(width, width, len);
    addTimed(mesh, dur, (f) => {
        mat.opacity = 1 - f;
        const w = width * (1 - f * 0.6);
        mesh.scale.x = w;
        mesh.scale.y = w;
    });
}

/** Onda expansiva plana en el suelo. */
export function ring(p, color, radius = 4, dur = 0.5) {
    if (!scene) return;
    const mat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending
    });
    const mesh = new THREE.Mesh(ringGeo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(p.x, p.y + 0.06, p.z);
    mesh.scale.setScalar(0.2);
    addTimed(mesh, dur, (f) => {
        mesh.scale.setScalar(0.2 + radius * f);
        mat.opacity = 0.9 * (1 - f);
    });
}

/** Destello esférico. */
export function flash(p, color, radius = 3, dur = 0.3) {
    if (!scene) return;
    const mat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending
    });
    const mesh = new THREE.Mesh(flashGeo, mat);
    mesh.position.set(p.x, p.y, p.z);
    mesh.scale.setScalar(0.3);
    addTimed(mesh, dur, (f) => {
        mesh.scale.setScalar(radius * (0.3 + 0.7 * f));
        mat.opacity = 0.8 * (1 - f);
    });
}

export function updateFx(dt) {
    if (points && alive > 0) {
        let n = 0;
        for (let i = 0; i < N; i++) {
            if (life[i] <= 0) continue;
            life[i] -= dt;
            const k = i * 3;
            if (life[i] <= 0) {
                pos[k + 1] = -9999;
                col[k] = col[k + 1] = col[k + 2] = 0;
                continue;
            }
            vel[k + 1] -= grav[i] * dt;
            pos[k] += vel[k] * dt;
            pos[k + 1] += vel[k + 1] * dt;
            pos[k + 2] += vel[k + 2] * dt;
            const f = life[i] / maxLife[i];
            col[k] = base[k] * f;
            col[k + 1] = base[k + 1] * f;
            col[k + 2] = base[k + 2] * f;
            n++;
        }
        alive = n;
        points.geometry.attributes.position.needsUpdate = true;
        points.geometry.attributes.color.needsUpdate = true;
    }

    for (let i = timed.length - 1; i >= 0; i--) {
        const e = timed[i];
        e.t += dt;
        const f = e.t / e.dur;
        if (f >= 1) {
            e.done();
            timed.splice(i, 1);
        } else {
            e.update(f);
        }
    }
}

export function fxCounts() { return { particles: alive, timed: timed.length }; }
