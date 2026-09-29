// Mundo mínimo en memoria para probar el motor sin navegador.
import { clock } from './helpers.js';
import { state, player } from '../public/js/state.js';
import { WORLD } from '../public/js/config.js';
import * as col from '../public/js/colliders.js';
import { initFx } from '../public/js/fx.js';
import { removeAllProps, props } from '../public/js/props.js';
import { clearProjectiles } from '../public/js/projectiles.js';
import { clearBuffs } from '../public/js/buffs.js';
import { cancelTimers } from '../public/js/powers/engine.js';

export const THREE = globalThis.THREE;

export function setupWorld() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(WORLD.skyColor);
    scene.fog = new THREE.FogExp2(WORLD.skyColor, WORLD.fogDensity);
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 500);
    scene.add(camera);
    state.scene = scene;
    state.camera = camera;
    state.ambient = new THREE.AmbientLight(0xffffff, WORLD.ambient);
    scene.add(state.ambient);
    state.playerGroup = new THREE.Group();
    state.scaleCur = 1;
    state.baseColor = '#3b82f6';
    initFx(scene);
    col.clearBoxes();
    WORLD.pillars.forEach(([x, z], i) => col.addBox('pillar' + i, x, 3, z, WORLD.pillarHalf, 3, WORLD.pillarHalf, true, null));
    resetPlayer();
}

export function resetPlayer() {
    cancelTimers();
    removeAllProps();
    clearProjectiles();
    clearBuffs();
    player.position.set(0, 0.4, 0);
    player.velocity.set(0, 0, 0);
    player.rotationY = 0;
    player.pitchX = 0;
    player.isGrounded = true;
    state.scaleCur = 1;
    for (const p of [...props.values()]) if (!p.target) p.mesh.parent && p.mesh.parent.remove(p.mesh);
}

/** Aim mirando hacia -Z desde el jugador, con el objetivo a "dist" metros. */
export function aimForward(dist = 20, opts = {}) {
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const s = player.position;
    const dir = V(0, 0, -1);
    const target = V(s.x, s.y + 1.2, s.z - dist);
    return {
        origin: V(s.x + 0.4, s.y + 1.1, s.z - 0.5),
        dir, target, normal: opts.normal === undefined ? V(0, 0, 1) : opts.normal,
        selfPos: V(s.x, s.y, s.z), camDir: V(0, 0, -1), scale: 1
    };
}

/** Simula el paso del tiempo del juego avanzando el reloj falso. */
export async function runFrames(seconds, updaters, step = 1 / 60) {
    for (let t = 0; t < seconds; t += step) {
        clock.t += step * 1000;
        for (const u of updaters) u(step, clock.t);
    }
    return clock.t;
}
