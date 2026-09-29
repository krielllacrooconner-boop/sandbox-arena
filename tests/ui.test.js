// Prueba de integración con DOM simulado (jsdom): login -> terminal -> ítems -> disparo -> IA.
import { clock } from './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const THREE = globalThis.THREE;

// ---- DOM: el index.html real, sin scripts externos ----
let html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
html = html.replace(/<script[\s\S]*?<\/script>/g, '');
const dom = new JSDOM(html, { url: 'http://localhost:3000/', pretendToBeVisual: true });
const { window } = dom;
globalThis.window = window;
globalThis.document = window.document;
globalThis.HTMLElement = window.HTMLElement;
try { globalThis.navigator = window.navigator; } catch (e) { /* Node ya define navigator */ }

// ---- WebGL falso ----
let renders = 0;
THREE.WebGLRenderer = class {
    constructor() { this.domElement = document.createElement('canvas'); }
    setSize() {} setPixelRatio() {}
    render() { renders++; }
};

// ---- requestAnimationFrame manual ----
let rafCb = null;
globalThis.requestAnimationFrame = (cb) => { rafCb = cb; return 1; };
async function frames(n, stepMs = 16) {
    for (let i = 0; i < n; i++) { clock.t += stepMs; const cb = rafCb; rafCb = null; if (cb) cb(clock.t); }
}

// ---- fetch falso: servidor de IA simulado ----
const llm = { available: true, reply: null, calls: [] };
globalThis.fetch = async (url, opts) => {
    if (String(url).endsWith('/health')) return { ok: true, status: 200, json: async () => ({ ok: true, llm: llm.available ? 'mock-ia' : null }) };
    llm.calls.push(JSON.parse(opts.body).prompt);
    const r = llm.reply;
    return { ok: r.status === undefined || r.status < 400, status: r.status || 200, json: async () => r.body };
};

document.exitPointerLock = () => {};   // jsdom no lo implementa
const $ = (id) => document.getElementById(id);
const built = () => [...props.props.values()].filter((p) => !p.target).length;
const key = (code, type = 'keydown') => window.dispatchEvent(new window.KeyboardEvent(type, { code, key: code, bubbles: true }));
const logs = () => $('terminal-logs').textContent;

async function say(text) {
    key('KeyT');
    $('terminal-input').value = text;
    $('terminal-form').dispatchEvent(new window.Event('submit', { cancelable: true, bubbles: true }));
    clock.t += 700;                       // pasa el antispam de 500 ms
    await new Promise((r) => setTimeout(r, 10));   // deja resolver promesas (fetch simulado)
    await frames(2);
}

// ---- cargar el juego ----
await import('../public/js/main.js');
const S = await import('../public/js/state.js');
const items = await import('../public/js/powers/items.js');
const props = await import('../public/js/props.js');
const fx = await import('../public/js/fx.js');
const proj = await import('../public/js/projectiles.js');

test('login: arranca el mundo, muestra la UI y dibuja la hotbar vacía', async () => {
    $('username-input').value = 'Kriell';
    document.querySelector('.color-btn[data-color="#ef4444"]').click();
    $('login-form').dispatchEvent(new window.Event('submit', { cancelable: true, bubbles: true }));
    await new Promise((r) => setTimeout(r, 20));

    assert.equal(S.state.gameStarted, true);
    assert.ok($('registration-modal').classList.contains('hidden'));
    assert.ok(!$('game-ui').classList.contains('hidden'));
    assert.equal(S.state.username, 'Kriell');
    assert.equal(S.state.selectedColor, '#ef4444');
    assert.equal($('hotbar').children.length, 9);
    assert.ok(S.state.scene && S.state.camera && S.state.renderer);
    await frames(5);
    assert.ok(renders >= 5, 'el bucle de render corre');
    assert.ok([...props.props.values()].filter((p) => p.target).length === 8, 'blancos del mundo creados');
});

test('sin Firebase configurado el juego queda en modo local (no se rompe)', async () => {
    await new Promise((r) => setTimeout(r, 50));
    assert.match($('net-status').textContent, /Offline/);
});

test('la IA se detecta al iniciar', async () => {
    assert.equal(S.state.llmAvailable, true);
    assert.match(logs(), /IA\] Conectada \(mock-ia\)/);
});

test('"dame una pistola láser": reglas locales (sin llamar a la IA) y aparece el ítem', async () => {
    await say('dame una pistola laser');
    assert.equal(llm.calls.length, 0, 'no debería usar la IA');
    assert.equal($('hotbar').children[0].textContent.includes('🔫'), true);
    assert.ok(!$('item-tag').classList.contains('hidden'));
    assert.match($('item-tag').textContent, /Pistola láser/);
    assert.ok(!$('crosshair').classList.contains('hidden'), 'la mira aparece al equipar');
    assert.equal(S.state.hasItem, true);
    assert.ok(state3rdPersonMeshInHand(), 'el modelo está en la mano del avatar (3ª persona)');
    assert.match(logs(), /Obtuvo 🔫 Pistola láser/);
});
function state3rdPersonMeshInHand() { return S.state.handAnchor.children.length === 1; }

test('disparar con el ratón capturado: crea rayo y daña un blanco', async () => {
    const target = [...props.props.values()].find((p) => p.target && p.hp > 0);
    // apuntar al blanco: jugador mira hacia -Z; blancos a z<0
    S.player.position.set(target.pos.x, 0.4, target.pos.z + 10);
    S.player.rotationY = 0; S.player.pitchX = 0;
    await frames(2);

    // sin ratón capturado el clic NO dispara
    const before = fx.fxCounts().timed;
    document.dispatchEvent(new window.MouseEvent('mousedown', { button: 0, bubbles: true }));
    document.dispatchEvent(new window.MouseEvent('mouseup', { button: 0, bubbles: true }));
    assert.equal(fx.fxCounts().timed, before);

    // capturar el ratón
    Object.defineProperty(document, 'pointerLockElement', { value: S.state.renderer.domElement, configurable: true });
    document.dispatchEvent(new window.Event('pointerlockchange'));
    assert.equal(S.state.isPointerLocked, true);

    const hp0 = target.hp;
    for (let i = 0; i < 8; i++) {
        document.dispatchEvent(new window.MouseEvent('mousedown', { button: 0, bubbles: true }));
        document.dispatchEvent(new window.MouseEvent('mouseup', { button: 0, bubbles: true }));
        clock.t += 300;                     // pasa el cooldown
        await frames(1);
    }
    assert.ok(!props.props.has(target.id) || target.hp < hp0, 'el blanco recibió daño');
});

test('teclas 1-9, Q y V: elegir, guardar ítem y cambiar de cámara (el modelo cambia de padre)', async () => {
    key('Digit1', 'keyup');
    key('Digit1');                          // ya estaba equipado: lo guarda
    assert.equal(S.state.hasItem, false);
    assert.ok($('item-tag').classList.contains('hidden'));
    key('Digit1');                          // lo vuelve a equipar
    assert.equal(S.state.hasItem, true);

    key('KeyV');                            // 1ª persona
    assert.equal(S.state.playerGroup.visible, false);
    assert.equal(S.state.camera.children.length, 1, 'el modelo cuelga de la cámara en 1ª persona');
    assert.equal(S.state.handAnchor.children.length, 0);
    key('KeyV');                            // vuelve a 3ª
    assert.equal(S.state.handAnchor.children.length, 1);
    key('KeyQ');
    assert.equal(S.state.hasItem, false);
});

test('construcción por texto: "muro" agrega objetos al mundo y avisa', async () => {
    const before = built();
    await say('construye un muro');
    assert.ok(built() > before);
    assert.match(logs(), /Usó Muro/);
});

test('reglas: "pistola de hielo" es floja -> consulta a la IA y usa SU poder', async () => {
    llm.calls.length = 0;
    llm.reply = { body: { power: {
        name: 'Pistola de hielo', description: 'Congela con hielo.', mode: 'item',
        item: { model: 'gun', color: '#7dd3fc', icon: '🧊', cooldown: 400, ammo: 30 },
        actions: [{ do: 'projectile', speed: 50, size: 0.2, color: '#7dd3fc', onHit: [{ do: 'spawn', shape: 'box', size: [2, 2, 2], material: 'glass', color: '#bae6fd', life: 8000, at: 'ctx' }] }]
    } } };
    await say('dame una pistola de hielo');
    assert.deepEqual(llm.calls, ['dame una pistola de hielo']);
    assert.match(logs(), /\[IA\] Pistola de hielo/);
    const slot = [...$('hotbar').children].find((c) => c.textContent.includes('🧊'));
    assert.ok(slot, 'el ítem de la IA aparece en la hotbar');
    assert.match(slot.textContent, /30/, 'muestra la munición');
    assert.equal(items.selectedItem().spec.name, 'Pistola de hielo');
});

test('la IA responde algo que no se puede: se muestra el motivo y la sugerencia', async () => {
    llm.reply = { body: { unsupported: 'No puedo crear personajes vivos.', suggestion: 'Prueba con un muro o una torre.' } };
    await say('invoca un dragon que me siga');
    assert.match(logs(), /No se puede hacer eso: No puedo crear personajes vivos/);
    assert.match(logs(), /Sugerencia: Prueba con un muro o una torre/);
});

test('la IA devuelve basura: se valida y NO se ejecuta nada', async () => {
    const before = built();
    llm.reply = { body: { power: { name: 'x', actions: [{ do: 'formatear_disco' }, { do: 'eval', code: 'alert(1)' }] } } };
    await say('haz algo rarísimo con delfines');
    assert.match(logs(), /El poder no es válido/);
    assert.equal(built(), before);
});

test('la IA caída (503 sin API key): mensaje claro y las órdenes locales siguen funcionando', async () => {
    llm.reply = { status: 503, body: { error: 'x' } };
    await say('hazme invisible');
    assert.match(logs(), /IA no está configurada/);
    assert.equal(S.state.llmAvailable, false, 'deja de intentar con la IA');
    llm.calls.length = 0;
    await say('hazme volar');
    assert.equal(llm.calls.length, 0);
    assert.match(logs(), /Usó Vuelo/);
});

test('/json permite probar poderes a mano y /items lista el inventario', async () => {
    await say('/json {"name":"Prueba","actions":[{"do":"explosion","radius":5,"at":"self"}]}');
    assert.match(logs(), /Usó Prueba/);
    await say('/items');
    assert.match(logs(), /Pistola de hielo/);
});

test('reiniciar limpia todo y el bucle sigue estable tras muchos frames', async () => {
    await say('borra todo');
    await say('reiniciar');
    await frames(120);
    assert.equal(proj.projectileCount(), 0);
});
