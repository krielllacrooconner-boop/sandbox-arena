// Teclado, ratón, rueda y Pointer Lock.
import { state, player, keys } from './state.js';
import { toggleCameraMode } from './camera.js';
import { openTerminal, closeTerminal } from './terminal.js';
import { requestLock } from './lock.js';
import { updateLockHint } from './hud.js';
import { selectSlot, cycleSlot, pressFire } from './powers/items.js';

const mouseSensitivity = 0.0022;

export function setupInputListeners() {
    const canvas = state.renderer.domElement;

    canvas.addEventListener('click', () => {
        if (state.terminalOpen) closeTerminal(false);
        requestLock();
    });

    document.addEventListener('pointerlockchange', () => {
        state.isPointerLocked = (document.pointerLockElement === canvas);
        if (state.isPointerLocked && state.terminalOpen) closeTerminal(false);
        if (!state.isPointerLocked) pressFire(false);
        updateLockHint();
    });

    document.addEventListener('mousemove', (e) => {
        if (!state.isPointerLocked) return;
        // Algunos navegadores tiran saltos enormes de vez en cuando: los descartamos
        if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;

        player.rotationY -= e.movementX * mouseSensitivity;
        player.pitchX -= e.movementY * mouseSensitivity;
        const maxPitch = Math.PI / 2.2;
        player.pitchX = Math.max(-maxPitch, Math.min(maxPitch, player.pitchX));
    });

    // Disparo: solo con el ratón ya capturado (el primer clic solo captura)
    document.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || !state.isPointerLocked || state.terminalOpen) return;
        pressFire(true);
    });
    document.addEventListener('mouseup', (e) => {
        if (e.button === 0) pressFire(false);
    });

    // Rueda: cambia de ítem
    document.addEventListener('wheel', (e) => {
        if (!state.isPointerLocked || state.terminalOpen) return;
        cycleSlot(e.deltaY > 0 ? 1 : -1);
    }, { passive: true });

    window.addEventListener('keydown', (e) => {
        if (state.terminalOpen) {
            if (e.key === 'Escape') {
                e.preventDefault();
                closeTerminal(false);
            }
            return;
        }

        // Abrir terminal con T o Enter (con o sin ratón capturado)
        if (e.code === 'KeyT' || e.code === 'Enter') {
            e.preventDefault();
            openTerminal();
            return;
        }

        if (e.code === 'KeyV' && !e.repeat) toggleCameraMode();
        if (e.code === 'KeyQ' && !e.repeat) selectSlot(-1);                       // guardar ítem
        if (/^Digit[1-9]$/.test(e.code) && !e.repeat) selectSlot(parseInt(e.code.slice(5), 10) - 1);
        if (e.code === 'Space') e.preventDefault();
        keys[e.code] = true;
    });

    window.addEventListener('keyup', (e) => {
        keys[e.code] = false;
    });

    // Evita teclas "pegadas" al cambiar de ventana
    window.addEventListener('blur', () => {
        for (const k in keys) keys[k] = false;
        pressFire(false);
    });
}
