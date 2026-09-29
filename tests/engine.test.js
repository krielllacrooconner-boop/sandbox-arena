import { setupWorld, resetPlayer, aimForward, runFrames, THREE } from './world.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { castPower, updateEngine, hooks, pendingTimers } from '../public/js/powers/engine.js';
import { sanitizeSpec } from '../public/js/powers/schema.js';
import { T } from '../public/js/powers/templates.js';
import { props, spawnProp, updateProps, removePropsByOwner } from '../public/js/props.js';
import { updateProjectiles, projectileCount } from '../public/js/projectiles.js';
import { updateFx, fxCounts } from '../public/js/fx.js';
import { stats, updateBuffs } from '../public/js/buffs.js';
import { player, state } from '../public/js/state.js';
import * as col from '../public/js/colliders.js';

setupWorld();
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const spec = (raw) => { const r = sanitizeSpec(raw); assert.ok(r.ok, JSON.stringify(r.errors)); return r.spec; };
const world = [
    (dt, now) => updateEngine(now, dt), (dt, now) => updateProps(dt, now),
    (dt, now) => updateProjectiles(dt, now), (dt) => updateFx(dt)
];
const cube = (x, y, z, extra = {}) => spawnProp({ shape: 'box', size: [1, 1, 1], pos: [x, y, z], color: '#38bdf8', dynamic: true, owner: 'world', ...extra });

test.beforeEach(() => { resetPlayer(); });

test('todas las plantillas pasan el sanitizador y se ejecutan sin errores', async () => {
    for (const [name, build] of Object.entries(T)) {
        resetPlayer();
        const s = spec(build());
        assert.doesNotThrow(() => castPower(s, aimForward(15)), name);
        await runFrames(1.5, world);
    }
});

test('pistola láser: destruye un blanco con vida tras varios disparos', async () => {
    const t = spawnProp({ shape: 'cylinder', size: [1.3, 2.2, 1.3], pos: [0, 1.1, -12], color: '#f97316', hp: 60, owner: 'world', target: true });
    const gun = spec(T.laserGun());
    const aim = aimForward(12);
    aim.dir = V(0, 0.0, -1); aim.origin = V(0, 1.1, -0.5);
    for (let i = 0; i < 6; i++) castPower(gun, aim);
    assert.ok(!props.has(t.id), 'el blanco debería estar destruido');
});

test('francotirador con pierce atraviesa dos objetos', () => {
    const a = spawnProp({ shape: 'box', size: [2, 2, 2], pos: [0, 1.1, -8], color: '#fff', hp: 50, owner: 'world' });
    const b = spawnProp({ shape: 'box', size: [2, 2, 2], pos: [0, 1.1, -14], color: '#fff', hp: 50, owner: 'world' });
    const aim = aimForward(20); aim.origin = V(0, 1.1, -0.5);
    castPower(spec(T.sniper()), aim);   // 70 de daño > 50 de vida
    assert.ok(!props.has(a.id) && !props.has(b.id), 'ambos objetos deberían romperse');
});

test('lanzacohetes: explota contra un muro, empuja cubos dinámicos', async () => {
    col.addBox('muro', 0, 3, -20, 10, 3, 0.5, true, null);
    const c = cube(0, 0.5, -18);
    const start = c.pos.clone();
    const aim = aimForward(20); aim.origin = V(0, 1.1, -0.5); aim.target = V(0, 1.1, -19.5);
    castPower(spec(T.rocketLauncher()), aim);
    assert.equal(projectileCount(), 1);
    await runFrames(2, world);
    assert.equal(projectileCount(), 0, 'el cohete ya explotó');
    assert.ok(c.pos.distanceTo(start) > 1.5, 'el cubo debería haber salido despedido');
    col.removeBox('muro');
});

test('salto de cohete: la explosión cerca de tus pies te empuja hacia arriba', () => {
    player.position.set(0, 0, -10);
    castPower(spec({ name: 'boom', mode: 'instant', actions: [{ do: 'explosion', radius: 5, force: 24, at: 'aim' }] }),
        { ...aimForward(1), target: V(0, 0, -10.8), normal: V(0, 1, 0), selfPos: V(0, 0, -10), origin: V(0, 1, -10), dir: V(0, -1, 0), camDir: V(0, 0, -1), scale: 1 });
    assert.ok(player.velocity.y > 6, `vy=${player.velocity.y.toFixed(1)}`);
    assert.equal(player.isGrounded, false);
});

test('granada: rebota y explota recién a los ~2 s (no al chocar)', async () => {
    const c = cube(0, 0.5, -9);
    const aim = aimForward(10); aim.origin = V(0, 1.1, -0.5); aim.dir = V(0, 0.3, -1).normalize(); aim.target = V(0, 4, -12);
    castPower(spec(T.grenade()), aim);
    await runFrames(1.0, world);
    assert.equal(projectileCount(), 1, 'sigue en vuelo/rebotando a 1 s');
    await runFrames(1.6, world);
    assert.equal(projectileCount(), 0, 'ya explotó');
});

test('agujero negro: atrae cubos hacia el punto durante varios segundos', async () => {
    col.addBox('muro2', 0, 3, -15, 10, 3, 0.5, true, null);
    const c = cube(8, 0.5, -12);
    const aim = aimForward(15); aim.origin = V(0, 1.1, -0.5); aim.target = V(0, 1.1, -14.4);
    const before = Math.hypot(c.pos.x - 0, c.pos.z + 14);
    castPower(spec(T.blackHole()), aim);
    await runFrames(6, world);
    const after = Math.hypot(c.pos.x - 0, c.pos.z + 14);
    assert.ok(after < before - 2, `antes ${before.toFixed(1)} después ${after.toFixed(1)}`);
    col.removeBox('muro2');
});

test('construcción: muro, torre, escalera (caminable), puente y fortaleza', () => {
    castPower(spec(T.wall({ n: 10 })), aimForward(10, { normal: V(0, 1, 0) }));
    assert.equal(props.size, 10);
    resetPlayer();

    castPower(spec(T.tower({ n: 6 })), { ...aimForward(10), target: V(0, 0, -10), normal: V(0, 1, 0) });
    const ys = [...props.values()].map((p) => p.pos.y).sort((a, b) => a - b);
    assert.equal(ys.length, 6);
    assert.ok(ys[5] - ys[0] > 6, 'la torre sube');
    resetPlayer();

    castPower(spec(T.stairs({ n: 12 })), aimForward(5));
    // se puede subir: cada escalón mide 0.5 y stepHeight es 0.55
    const tops = [...props.values()].map((p) => p.pos.y + p.hy).sort((a, b) => a - b);
    for (let i = 1; i < tops.length; i++) assert.ok(tops[i] - tops[i - 1] <= 0.55 + 1e-6);
    resetPlayer();

    castPower(spec(T.bridge({ n: 8 })), aimForward(5));
    assert.equal(props.size, 8);
    const tp = [...props.values()][0];
    assert.ok(Math.abs(tp.pos.y + tp.hy - player.position.y) < 0.01, 'la cima del puente está a la altura de tus pies');
    resetPlayer();

    castPower(spec(T.fortress({ n: 14 })), aimForward(5));
    assert.equal(props.size, 14);
});

test('constructor de bloques: se alinea a la grilla, no duplica y no te encierra', () => {
    const builder = spec(T.blockBuilder());
    const aimFloor = { ...aimForward(4), target: V(3.3, 0, -6.7), normal: V(0, 1, 0) };
    castPower(builder, aimFloor);
    castPower(builder, aimFloor);              // mismo lugar: no se duplica
    assert.equal(props.size, 1);
    const p = [...props.values()][0];
    assert.equal(p.pos.x % 1, 0.5 % 1 === 0 ? 0 : 0.5);   // centro en x.5
    assert.equal(p.pos.y, 0.5);

    // apuntar a tus propios pies: el bloque quedaría encima tuyo -> no se coloca
    player.position.set(0.2, 0, 0.2);
    castPower(builder, { ...aimForward(1), target: V(0.2, 0, 0.2), normal: V(0, 1, 0), selfPos: V(0.2, 0, 0.2) });
    assert.equal(props.size, 1);
});

test('buffs: vuelo y súper salto se activan y expiran', () => {
    castPower(spec(T.fly()), aimForward(5));
    assert.equal(stats.fly, true);
    castPower(spec(T.superJump()), aimForward(5));
    assert.ok(stats.jumpMul > 2);
    updateBuffs(performance.now() + 31000);
    assert.equal(stats.fly, false);
    assert.equal(stats.jumpMul, 1);
});

test('gigante: escala > 1, y reiniciar limpia todo', () => {
    castPower(spec(T.giant()), aimForward(5));
    assert.ok(stats.scale >= 3);
    castPower(spec(T.reset()), aimForward(5));
    assert.equal(stats.scale, 1);
});

test('teletransporte: hacia arriba, y hacia adelante frena antes de una pared', () => {
    castPower(spec(T.blinkUp()), aimForward(5));
    assert.ok(player.position.y > 20);
    resetPlayer();
    col.addBox('muro3', 0, 3, -10, 6, 3, 0.5, true, null);
    castPower(spec({ name: 'tp', mode: 'instant', actions: [{ do: 'teleport', to: 'forward', distance: 40 }] }), aimForward(40));
    assert.ok(player.position.z > -10 && player.position.z < -8, `z=${player.position.z.toFixed(2)}`);
    col.removeBox('muro3');
});

test('dash y jetpack empujan al jugador con tope', () => {
    castPower(spec(T.dash()), aimForward(5));
    assert.ok(Math.abs(player.velocity.z) > 25, 'dash hacia adelante');
    resetPlayer();
    for (let i = 0; i < 40; i++) castPower(spec(T.jetpack()), aimForward(5));
    assert.ok(player.velocity.y <= 16.01, `vy=${player.velocity.y}`);
    assert.ok(Math.hypot(player.velocity.x, player.velocity.z) <= 16.01);
});

test('ambiente: la noche oscurece el cielo y se restablece al terminar', async () => {
    const base = state.scene.background.clone();
    const close = (a, b) => Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b) < 0.002;
    castPower(spec(T.night()), aimForward(5));
    await runFrames(5, world);
    assert.ok(!close(state.scene.background, base), 'el cielo cambió');
    assert.ok(state.ambient.intensity < 0.5, 'la luz bajó');
    await runFrames(130, world, 1 / 20);
    await runFrames(10, world);
    assert.ok(close(state.scene.background, base), 'volvió al cielo original');
});

test('reiniciar cancela poderes a mitad de ejecución (tormentas en cola)', async () => {
    castPower(spec(T.meteors({ n: 10 })), aimForward(15));
    await runFrames(0.3, world);
    assert.ok(pendingTimers() > 0);
    castPower(spec(T.reset()), aimForward(5));
    assert.equal(pendingTimers(), 0);
    assert.equal(projectileCount(), 0);
});

test('wait y repeat: la secuencia se ejecuta escalonada en el tiempo', async () => {
    const s = spec({
        name: 'secuencia', mode: 'instant',
        actions: [
            { do: 'spawn', shape: 'box', size: [1, 1, 1], at: 'front', color: '#ff0000' },
            { do: 'wait', ms: 300 },
            { do: 'repeat', times: 3, every: 200, actions: [{ do: 'spawn', shape: 'box', size: [1, 1, 1], at: 'sky', physics: 'dynamic' }] }
        ]
    });
    castPower(s, aimForward(10));
    assert.equal(props.size, 1, 'solo la primera acción corre de inmediato');
    await runFrames(0.35, world);     // pasó el wait -> corre el 1er repeat
    assert.equal(props.size, 2);
    await runFrames(0.55, world);
    assert.equal(props.size, 4);
});

test('tormenta y lluvia de meteoritos: impactan y limpian sus proyectiles', async () => {
    castPower(spec(T.meteors({ n: 8 })), aimForward(15));
    await runFrames(0.3, world);
    assert.ok(projectileCount() > 0);
    await runFrames(5, world);
    assert.equal(projectileCount(), 0);
    castPower(spec(T.storm({ n: 6 })), aimForward(15));
    await runFrames(3, world);
});

test('tope de seguridad: un poder que multiplica acciones no cuelga el juego', async () => {
    const s = spec({
        name: 'bomba', mode: 'instant',
        actions: [{ do: 'repeat', times: 20, every: 30, actions: [{ do: 'hitscan', count: 24, origin: 'sky', area: 30, onHit: [{ do: 'explosion', radius: 8, at: 'ctx' }, { do: 'spawn', count: 60, at: 'ctx' }] }] }]
    });
    const t0 = performance.now();
    castPower(s, aimForward(15));
    await runFrames(2, world);
    assert.ok(performance.now() - t0 < 4000, 'tardó demasiado');
    assert.ok(props.size <= 300, 'respeta maxProps');
});

test('poderes de OTRO jugador: crean cosas y empujan, pero no cambian tu estado', () => {
    const remoteAim = { ...aimForward(10), target: V(0, 0, -6), normal: V(0, 1, 0) };
    castPower(spec(T.giant()), remoteAim, { remote: true, owner: 'abc' });
    assert.equal(stats.scale, 1);
    castPower(spec(T.blinkUp()), remoteAim, { remote: true, owner: 'abc' });
    assert.ok(player.position.y < 5);
    castPower(spec(T.night()), remoteAim, { remote: true, owner: 'abc' });
    castPower(spec(T.wall({ n: 4 })), remoteAim, { remote: true, owner: 'abc' });
    assert.equal(props.size, 4);
    assert.ok([...props.values()].every((p) => p.owner === 'abc'));
    // no se borran con tu "limpiar"
    castPower(spec(T.clearProps()), aimForward(5));
    assert.equal(props.size, 4);
    // pero su explosión sí te empuja si estás cerca
    player.position.set(0, 0, -3);
    castPower(spec({ name: 'b', mode: 'instant', actions: [{ do: 'explosion', radius: 6, force: 20, at: 'aim' }] }),
        { ...remoteAim, target: V(0, 0, -4), selfPos: V(0, 0, -20) }, { remote: true, owner: 'abc' });
    assert.ok(player.velocity.length() > 3);
});

test('"limpiar" borra solo lo tuyo y vaciar inventario llama al hook', () => {
    castPower(spec(T.cubes({ n: 5 })), aimForward(8));
    cube(10, 0.5, 10, { owner: 'world', target: true });
    assert.equal(props.size, 6);
    castPower(spec(T.clearProps()), aimForward(5));
    assert.equal(props.size, 1);
    let called = false; hooks.clearItems = () => { called = true; };
    castPower(spec(T.clearItems()), aimForward(5));
    assert.ok(called);
});
