// Calcula desde dónde y hacia dónde apunta el jugador (mira, boca del arma, punto de impacto).
import { THREE } from './three.js';
import { state, player, CAMERA_MODES } from './state.js';
import * as col from './colliders.js';

const _camPos = new THREE.Vector3();
const _camDir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();

/**
 * Devuelve { origin, dir, target, normal|null, selfPos, camDir }
 *  - origin: boca del arma
 *  - target: punto del mundo bajo la mira (o un punto lejano si no hay nada)
 *  - dir: de la boca del arma hacia el target (así los disparos dan justo en la mira)
 */
export function getAim() {
    const cam = state.camera;
    cam.updateMatrixWorld(true);
    cam.getWorldPosition(_camPos);
    cam.getWorldDirection(_camDir);
    _right.setFromMatrixColumn(cam.matrixWorld, 0);
    _up.setFromMatrixColumn(cam.matrixWorld, 1);

    const scale = state.scaleCur || 1;
    const selfPos = player.position.clone();
    const fp = state.cameraMode === CAMERA_MODES.FIRST_PERSON;

    // Punto bajo la mira: en 3ª persona el rayo empieza pasando al jugador para no chocar con lo que hay detrás de la cámara
    let startDist = 0.2;
    if (!fp) startDist = _camPos.distanceTo(new THREE.Vector3(selfPos.x, selfPos.y + 1.4 * scale, selfPos.z));
    const sx = _camPos.x + _camDir.x * startDist;
    const sy = _camPos.y + _camDir.y * startDist;
    const sz = _camPos.z + _camDir.z * startDist;
    const hit = col.raycast(sx, sy, sz, _camDir.x, _camDir.y, _camDir.z, 300);

    const target = hit
        ? new THREE.Vector3(hit.x, hit.y, hit.z)
        : new THREE.Vector3(sx + _camDir.x * 150, sy + _camDir.y * 150, sz + _camDir.z * 150);
    const normal = hit ? new THREE.Vector3(hit.nx, hit.ny, hit.nz) : null;

    // Boca del arma
    const origin = new THREE.Vector3();
    if (fp) {
        origin.copy(_camPos)
            .addScaledVector(_camDir, 0.7)
            .addScaledVector(_right, 0.25)
            .addScaledVector(_up, -0.18);
    } else {
        const yaw = player.rotationY;
        const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
        const rx = Math.cos(yaw), rz = -Math.sin(yaw);
        origin.set(
            selfPos.x + (rx * 0.5 + fx * 0.6) * scale,
            selfPos.y + 1.1 * scale,
            selfPos.z + (rz * 0.5 + fz * 0.6) * scale
        );
    }

    const dir = target.clone().sub(origin);
    if (dir.lengthSq() < 0.25 || dir.dot(_camDir) < 0) dir.copy(_camDir);
    dir.normalize();

    return { origin, dir, target, normal, selfPos, camDir: _camDir.clone(), scale };
}

const r2 = (v) => Math.round(v * 100) / 100;
const num = (v) => (typeof v === 'number' && isFinite(v)) ? v : 0;

/** Versión mínima y segura para mandar por red. */
export function serializeAim(a) {
    return {
        o: [r2(a.origin.x), r2(a.origin.y), r2(a.origin.z)],
        d: [r2(a.dir.x), r2(a.dir.y), r2(a.dir.z)],
        t: [r2(a.target.x), r2(a.target.y), r2(a.target.z)],
        n: a.normal ? [r2(a.normal.x), r2(a.normal.y), r2(a.normal.z)] : null,
        s: [r2(a.selfPos.x), r2(a.selfPos.y), r2(a.selfPos.z)],
        c: [r2(a.camDir.x), r2(a.camDir.y), r2(a.camDir.z)],
        k: r2(a.scale || 1)
    };
}

/** Reconstruye un aim desde datos de red (que NO son de fiar: se sanean los números). */
export function deserializeAim(d) {
    const v = (arr) => new THREE.Vector3(num(arr && arr[0]), num(arr && arr[1]), num(arr && arr[2]));
    const dir = v(d && d.d);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
    dir.normalize();
    const cam = v(d && d.c);
    if (cam.lengthSq() < 1e-6) cam.copy(dir);
    cam.normalize();
    return {
        origin: v(d && d.o), dir, target: v(d && d.t),
        normal: (d && Array.isArray(d.n)) ? v(d.n).normalize() : null,
        selfPos: v(d && d.s), camDir: cam,
        scale: Math.max(0.25, Math.min(6, num(d && d.k) || 1))
    };
}
