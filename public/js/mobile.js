// =====================================================================
//  CONTROLES TÁCTILES (celular)
//  Se activa solo si en el menú se eligió "Celular". Reutiliza la misma
//  infraestructura que el teclado/mouse (keys{}, player.rotationY/pitchX,
//  pressFire, selectSlot, toggleCameraMode) para no duplicar lógica de juego.
// =====================================================================
import { $ } from './util.js';
import { state, player, keys } from './state.js';
import { toggleCameraMode } from './camera.js';
import { openTerminal } from './terminal.js';
import { selectSlot, pressFire } from './powers/items.js';

const JOY_RADIUS = 48;       // debe ser ~ la mitad del tamaño visual del joystick (w-28 = 112px)
const LOOK_SENS = 0.0062;    // sensibilidad de la cámara al arrastrar (ajustada para dedo, no mouse)

function touchById(list, id) {
    for (let i = 0; i < list.length; i++) if (list[i].identifier === id) return list[i];
    return null;
}

// ---------------------------------------------------------------------
//  Joystick de movimiento (abajo a la izquierda)
// ---------------------------------------------------------------------
function setupJoystick() {
    const base = $('joy-base');
    const knob = $('joy-knob');
    if (!base || !knob) return;

    let touchId = null;
    let cx = 0, cy = 0;

    function setKnob(dx, dy) {
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
    }

    function updateFromPoint(clientX, clientY) {
        let dx = clientX - cx;
        let dy = clientY - cy;
        const dist = Math.hypot(dx, dy);
        const clamped = Math.min(dist, JOY_RADIUS);
        const angle = Math.atan2(dy, dx);
        const kx = Math.cos(angle) * clamped;
        const ky = Math.sin(angle) * clamped;
        setKnob(kx, ky);
        state.analogMove.mx = kx / JOY_RADIUS;
        state.analogMove.mz = ky / JOY_RADIUS;
    }

    function start(e) {
        if (touchId !== null) return;
        const t = e.changedTouches[0];
        touchId = t.identifier;
        const rect = base.getBoundingClientRect();
        cx = rect.left + rect.width / 2;
        cy = rect.top + rect.height / 2;
        updateFromPoint(t.clientX, t.clientY);
        e.preventDefault();
    }
    function move(e) {
        if (touchId === null) return;
        const t = touchById(e.touches, touchId);
        if (!t) return;
        updateFromPoint(t.clientX, t.clientY);
        e.preventDefault();
    }
    function end(e) {
        if (touchId === null) return;
        const t = touchById(e.changedTouches, touchId);
        if (!t) return;
        touchId = null;
        setKnob(0, 0);
        state.analogMove.mx = 0;
        state.analogMove.mz = 0;
    }

    base.addEventListener('touchstart', start, { passive: false });
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);
}

// ---------------------------------------------------------------------
//  Mirar: arrastrar en cualquier parte de la pantalla rota la cámara
//  (reemplaza al Pointer Lock + mousemove que se usa en PC)
// ---------------------------------------------------------------------
function setupLookArea() {
    const area = $('look-area');
    if (!area) return;

    let touchId = null, lastX = 0, lastY = 0;
    const maxPitch = Math.PI / 2.2;

    function start(e) {
        if (touchId !== null) return;
        if (state.terminalOpen) return;
        const t = e.changedTouches[0];
        touchId = t.identifier;
        lastX = t.clientX;
        lastY = t.clientY;
    }
    function move(e) {
        if (touchId === null) return;
        const t = touchById(e.touches, touchId);
        if (!t) return;
        const dx = t.clientX - lastX;
        const dy = t.clientY - lastY;
        lastX = t.clientX;
        lastY = t.clientY;
        player.rotationY -= dx * LOOK_SENS;
        player.pitchX -= dy * LOOK_SENS;
        player.pitchX = Math.max(-maxPitch, Math.min(maxPitch, player.pitchX));
        e.preventDefault();
    }
    function end(e) {
        if (touchId === null) return;
        const t = touchById(e.changedTouches, touchId);
        if (t) touchId = null;
    }

    area.addEventListener('touchstart', start, { passive: false });
    area.addEventListener('touchmove', move, { passive: false });
    area.addEventListener('touchend', end);
    area.addEventListener('touchcancel', end);
}

// ---------------------------------------------------------------------
//  Botones: disparar / saltar / bajar (mantener presionado = key virtual),
//  cámara / correr / terminal / guardar (un toque = acción)
// ---------------------------------------------------------------------
function holdButton(id, onDown, onUp) {
    const btn = $(id);
    if (!btn) return;
    const down = (e) => { e.preventDefault(); onDown(); };
    const up = (e) => { e.preventDefault(); onUp(); };
    btn.addEventListener('touchstart', down, { passive: false });
    btn.addEventListener('touchend', up, { passive: false });
    btn.addEventListener('touchcancel', up, { passive: false });
}

function tapButton(id, onTap) {
    const btn = $(id);
    if (!btn) return;
    btn.addEventListener('click', (e) => { e.preventDefault(); onTap(); });
}

function setupButtons() {
    holdButton('btn-fire', () => pressFire(true), () => pressFire(false));
    holdButton('btn-jump', () => { keys['Space'] = true; }, () => { keys['Space'] = false; });
    holdButton('btn-down', () => { keys['KeyC'] = true; }, () => { keys['KeyC'] = false; });

    tapButton('btn-cam', () => toggleCameraMode());
    tapButton('btn-terminal', () => openTerminal());
    tapButton('btn-unequip', () => selectSlot(-1));

    const runBtn = $('btn-run');
    if (runBtn) {
        runBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const active = !keys['ShiftLeft'];
            keys['ShiftLeft'] = active;
            runBtn.classList.toggle('active', active);
        });
    }
}

export function setupMobileControls() {
    document.body.classList.add('is-mobile');
    setupJoystick();
    setupLookArea();
    setupButtons();
}
