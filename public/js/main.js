// =====================================================================
//  PUNTO DE ENTRADA: registro, arranque del mundo y bucle principal.
// =====================================================================
import { $ } from './util.js';
import { state } from './state.js';
import { initWorld, onWindowResize } from './world.js';
import { initAvatars, updateRemotePlayers } from './avatars.js';
import { initFx, updateFx } from './fx.js';
import { spawnWorldTargets, updateProps } from './props.js';
import { updateProjectiles } from './projectiles.js';
import { updatePhysics } from './physics.js';
import { updateEngine } from './powers/engine.js';
import { updateItems, selectSlot } from './powers/items.js';
import { setupInputListeners } from './input.js';
import { setupMobileControls } from './mobile.js';
import { setupTerminalUI, checkLLM } from './terminal.js';
import { connectNetwork, syncLocalPlayer, onPlayersChanged } from './network.js';
import { addLog, setNetStatus, setUserInfo, setFps, updateLockHint, setCameraTag } from './hud.js';

let lastFrame = 0;
let fpsFrames = 0;
let fpsLast = 0;

function animate(now) {
    requestAnimationFrame(animate);

    const dt = lastFrame ? Math.min((now - lastFrame) / 1000, 0.05) : 0.016;
    lastFrame = now;

    fpsFrames++;
    if (now - fpsLast >= 500) {
        setFps(Math.round(fpsFrames * 1000 / (now - fpsLast)));
        fpsFrames = 0;
        fpsLast = now;
    }

    // Orden importa: la cámara se actualiza en updatePhysics y los disparos leen la cámara
    updatePhysics(dt, now);
    updateItems(dt, now);
    updateProps(dt, now);
    updateProjectiles(dt, now);
    updateEngine(now, dt);
    updateFx(dt);
    if (updateRemotePlayers(dt, now)) onPlayersChanged();
    syncLocalPlayer(now);

    state.renderer.render(state.scene, state.camera);
}

function startGame() {
    initWorld();
    initAvatars();
    initFx(state.scene);
    spawnWorldTargets();
    setupInputListeners();
    setupTerminalUI();
    if (state.device === 'mobile') {
        setupMobileControls();
        $('mobile-controls').classList.remove('hidden');
        const guide = $('controls-guide');
        if (guide) guide.classList.add('hidden');
    }
    window.addEventListener('resize', onWindowResize);
    setCameraTag();
    selectSlot(-1);          // dibuja la hotbar vacía
    updateLockHint();
    setNetStatus('connecting');
    connectNetwork();        // en segundo plano
    checkLLM();              // ¿el servidor tiene IA?
    requestAnimationFrame(animate);
}

function chooseDevice(device) {
    if (state.device) return;   // ya se eligió, no hacer nada si clickean de nuevo
    state.device = device;
    if (device === 'mobile') document.body.classList.add('is-mobile');
    $('device-select-modal').classList.add('hidden');
    $('registration-modal').classList.remove('hidden');
    $('username-input').focus();
}

function setupDeviceSelectFlow() {
    $('device-pc').addEventListener('click', () => chooseDevice('pc'));
    $('device-mobile').addEventListener('click', () => chooseDevice('mobile'));
}

function setupRegistrationFlow() {
    const colorBtns = document.querySelectorAll('.color-btn');
    colorBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
            colorBtns.forEach((b) => b.classList.replace('border-white', 'border-transparent'));
            btn.classList.replace('border-transparent', 'border-white');
            state.selectedColor = btn.getAttribute('data-color');
        });
    });

    $('login-form').addEventListener('submit', (e) => {
        e.preventDefault();
        if (state.gameStarted) return;
        const name = $('username-input').value.trim().slice(0, 15);
        if (!name) return;

        state.gameStarted = true;
        state.username = name;
        state.baseColor = state.selectedColor;
        setUserInfo(name, state.selectedColor);
        $('registration-modal').classList.add('hidden');
        $('game-ui').classList.remove('hidden');

        // Si algo falla al arrancar, se muestra en pantalla en vez de quedar en negro
        try {
            startGame();
        } catch (err) {
            console.error(err);
            addLog([{ text: `[Error] ${err.message}`, cls: 'text-red-400' }]);
        }
    });
}

// Errores inesperados visibles en el juego (sin abrir la consola)
let shownErrors = 0;
window.addEventListener('error', (ev) => {
    if (shownErrors++ < 3) addLog([{ text: `[Error] ${ev.message}`, cls: 'text-red-400' }]);
});

function setupMenus() {
    setupDeviceSelectFlow();
    setupRegistrationFlow();
}

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', setupMenus);
} else {
    setupMenus();
}
