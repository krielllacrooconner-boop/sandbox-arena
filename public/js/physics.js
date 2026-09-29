// Físicas del jugador: movimiento, salto, gravedad, vuelo y colisiones.
import { state, player, keys } from './state.js';
import { CONFIG, DEFAULTS } from './config.js';
import { stats, updateBuffs } from './buffs.js';
import * as col from './colliders.js';
import { updateCamera } from './camera.js';

export function updatePhysics(dt, now) {
    updateBuffs(now);

    const vel = player.velocity;
    const pos = player.position;
    const flying = stats.fly;

    // Tamaño (efecto gigante / diminuto), suavizado
    state.scaleCur += (stats.scale - state.scaleCur) * (1 - Math.exp(-6 * dt));
    state.playerGroup.scale.setScalar(state.scaleCur);

    // Dirección deseada según WASD
    let mx = 0, mz = 0;
    if (keys['KeyW']) mz -= 1;
    if (keys['KeyS']) mz += 1;
    if (keys['KeyA']) mx -= 1;
    if (keys['KeyD']) mx += 1;

    const running = keys['ShiftLeft'] || keys['ShiftRight'];
    const targetSpeed = DEFAULTS.speed * stats.speedMul * (running ? DEFAULTS.runMultiplier : 1.0);

    let tx = 0, tz = 0;
    const len = Math.hypot(mx, mz);
    if (len > 0) {
        mx /= len; mz /= len;
        const sin = Math.sin(player.rotationY);
        const cos = Math.cos(player.rotationY);
        // Adelante = (-sin, -cos); derecha = (cos, -sin)
        tx = (mx * cos + mz * sin) * targetSpeed;
        tz = (-mx * sin + mz * cos) * targetSpeed;
    }

    // Aceleración suave e independiente de los FPS
    // Si vas mucho más rápido que tu velocidad normal (dash, explosión, jetpack) la inercia dura más
    const hSpeed = Math.hypot(vel.x, vel.z);
    const impulsed = hSpeed > Math.max(targetSpeed, DEFAULTS.speed) * 1.35;
    const accelRate = (player.isGrounded || flying ? 18 : 10) * (impulsed ? 0.14 : 1);
    const accel = 1 - Math.exp(-accelRate * dt);
    vel.x += (tx - vel.x) * accel;
    vel.z += (tz - vel.z) * accel;

    const gravity = flying ? 0 : DEFAULTS.gravity * stats.gravityMul;
    if (flying) {
        let vy = 0;
        if (keys['Space']) vy += DEFAULTS.flySpeed;
        if (keys['KeyC']) vy -= DEFAULTS.flySpeed;
        vel.y += (vy - vel.y) * (1 - Math.exp(-8 * dt));
    } else {
        if (keys['Space'] && player.isGrounded) {
            vel.y = DEFAULTS.jumpForce * stats.jumpMul;
            player.isGrounded = false;
        }
        vel.y -= gravity * dt;
    }

    // Límite de velocidad (explosiones y jetpack)
    const sp = vel.length();
    if (sp > 60) vel.multiplyScalar(60 / sp);

    pos.x += vel.x * dt;
    pos.y += vel.y * dt;
    pos.z += vel.z * dt;

    // Límites del mundo
    const lim = CONFIG.worldHalf - 1;
    pos.x = Math.max(-lim, Math.min(lim, pos.x));
    pos.z = Math.max(-lim, Math.min(lim, pos.z));
    if (pos.y > 150) { pos.y = 150; if (vel.y > 0) vel.y = 0; }

    col.collideSolids(pos, vel, DEFAULTS.playerRadius, DEFAULTS.playerHeight * state.scaleCur);

    // Suelo (plataforma, piso o la cima de un objeto sólido)
    const groundY = col.groundHeightAt(pos.x, pos.z, pos.y);
    if (pos.y <= groundY) {
        pos.y = groundY;
        if (vel.y < 0) vel.y = 0;
        player.isGrounded = true;
    } else {
        player.isGrounded = false;
    }

    state.playerGroup.position.copy(pos);
    state.playerGroup.rotation.y = player.rotationY;

    updateCamera();
}
