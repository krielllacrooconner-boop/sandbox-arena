// =====================================================================
//  ÍTEMS: armas y objetos equipables creados por poderes de modo "item".
//  - Inventario de 9 slots (teclas 1-9, rueda del ratón, Q para guardar).
//  - Clic = usar el poder del ítem (con cooldown, munición opcional y modo automático).
//  - Se dibuja un modelo 3D simple: en 1ª persona cuelga de la cámara, en 3ª de la mano del avatar.
// =====================================================================
import { THREE } from '../three.js';
import { state, CAMERA_MODES } from '../state.js';
import { renderHotbar, flashCooldown, setItemTag, updateCrosshair, addLog } from '../hud.js';
import { getAim, serializeAim } from '../aim.js';
import { castPower, hooks } from './engine.js';
import { bus } from '../bus.js';

export const SLOT_COUNT = 9;
const slots = new Array(SLOT_COUNT).fill(null);   // { spec, ammo, lastUse, mesh }
let selected = -1;
let held = false;
let recoil = 0;

// ---------------------------------------------------------------------
//  Modelos 3D (geometrías y materiales compartidos)
// ---------------------------------------------------------------------
const GEO = {};
const MAT = new Map();

const box = (x, y, z) => GEO[`b${x}${y}${z}`] || (GEO[`b${x}${y}${z}`] = new THREE.BoxGeometry(x, y, z));
const cyl = (r, l) => GEO[`c${r}${l}`] || (GEO[`c${r}${l}`] = new THREE.CylinderGeometry(r, r, l, 10));
const sph = (r) => GEO[`s${r}`] || (GEO[`s${r}`] = new THREE.SphereGeometry(r, 12, 8));

function lambert(color) {
    const k = 'l' + color;
    if (!MAT.has(k)) MAT.set(k, new THREE.MeshLambertMaterial({ color }));
    return MAT.get(k);
}
function basic(color) {
    const k = 'b' + color;
    if (!MAT.has(k)) MAT.set(k, new THREE.MeshBasicMaterial({ color }));
    return MAT.get(k);
}
const DARK = '#1f2937';

function part(geometry, material, x, y, z, rx = 0) {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    m.castShadow = false;
    m.receiveShadow = false;
    return m;
}

/** Todos los modelos apuntan hacia -Z (la boca del arma). */
function buildModel(model, color) {
    const g = new THREE.Group();
    const R = Math.PI / 2;
    switch (model) {
        case 'wand':
            g.add(part(cyl(0.025, 0.55), lambert(DARK), 0, 0, -0.2, R));
            g.add(part(sph(0.07), basic(color), 0, 0, -0.5));
            break;
        case 'launcher':
            g.add(part(cyl(0.09, 0.7), lambert(color), 0, 0, -0.25, R));
            g.add(part(cyl(0.11, 0.1), lambert(DARK), 0, 0, -0.62, R));
            g.add(part(box(0.06, 0.16, 0.08), lambert(DARK), 0, -0.13, 0.0));
            break;
        case 'orb':
            g.add(part(sph(0.13), basic(color), 0, 0, -0.2));
            g.add(part(sph(0.17), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, depthWrite: false }), 0, 0, -0.2));
            break;
        case 'sword':
            g.add(part(box(0.045, 0.045, 0.75), basic(color), 0, 0, -0.45));
            g.add(part(box(0.22, 0.05, 0.05), lambert(DARK), 0, 0, -0.08));
            g.add(part(box(0.05, 0.05, 0.16), lambert(DARK), 0, 0, 0.02));
            break;
        case 'block':
            g.add(part(box(0.22, 0.22, 0.22), lambert(color), 0, 0, -0.15));
            break;
        case 'gun':
        default:
            g.add(part(box(0.11, 0.13, 0.42), lambert(color), 0, 0, -0.1));
            g.add(part(cyl(0.032, 0.3), lambert(DARK), 0, 0.01, -0.42, R));
            g.add(part(box(0.085, 0.2, 0.09), lambert(DARK), 0, -0.15, 0.04));
            g.add(part(sph(0.03), basic(color), 0, 0.01, -0.58));
    }
    return g;
}

// ---------------------------------------------------------------------
//  Equipar / mostrar
// ---------------------------------------------------------------------
function attach(mesh) {
    if (!mesh) return;
    if (mesh.parent) mesh.parent.remove(mesh);
    if (state.cameraMode === CAMERA_MODES.FIRST_PERSON) {
        if (!state.camera) return;
        state.camera.add(mesh);
        mesh.position.set(0.26, -0.22, -0.55);
        mesh.scale.setScalar(1);
    } else {
        if (!state.handAnchor) return;
        state.handAnchor.add(mesh);
        mesh.position.set(0, 0, 0);
        mesh.scale.setScalar(1);
    }
}

function detach(mesh) {
    if (mesh && mesh.parent) mesh.parent.remove(mesh);
}

function refresh() {
    state.hasItem = selected >= 0 && !!slots[selected];
    updateCrosshair();
    const it = state.hasItem ? slots[selected] : null;
    setItemTag(it ? `${it.spec.item.icon} ${it.spec.name}${isFinite(it.ammo) ? ' · ' + it.ammo : ''}` : '');
    renderHotbar(slots.map((s) => (s ? { spec: s.spec, ammo: s.ammo } : null)), selected);
}

/** Selecciona un slot (i = -1 guarda el ítem en la mochila). Repetir el mismo slot lo guarda. */
export function selectSlot(i, toggle = true) {
    if (selected >= 0 && slots[selected]) detach(slots[selected].mesh);
    if (i < 0 || i >= SLOT_COUNT || !slots[i] || (toggle && i === selected)) {
        selected = -1;
    } else {
        selected = i;
        attach(slots[i].mesh);
    }
    refresh();
}

export function cycleSlot(dir) {
    const filled = [];
    for (let i = 0; i < SLOT_COUNT; i++) if (slots[i]) filled.push(i);
    if (!filled.length) return;
    const pos = filled.indexOf(selected);
    const next = pos < 0 ? (dir > 0 ? 0 : filled.length - 1) : (pos + (dir > 0 ? 1 : -1) + filled.length) % filled.length;
    selectSlot(filled[next], false);
}

/** Cuando cambia la cámara (1ª/3ª persona) el modelo cambia de padre. */
export function onCameraModeChange() {
    if (selected >= 0 && slots[selected]) attach(slots[selected].mesh);
    updateCrosshair();
}

// ---------------------------------------------------------------------
//  Inventario
// ---------------------------------------------------------------------
/** Agrega un ítem (spec.mode === 'item'). Si ya tenés uno igual, recarga su munición. */
export function giveItem(spec) {
    let idx = slots.findIndex((s) => s && s.spec.name === spec.name);
    if (idx < 0) idx = slots.findIndex((s) => !s);
    if (idx < 0) idx = selected >= 0 ? selected : SLOT_COUNT - 1;   // lleno: reemplaza el seleccionado

    if (slots[idx]) detach(slots[idx].mesh);
    slots[idx] = {
        spec,
        ammo: spec.item.ammo > 0 ? spec.item.ammo : Infinity,
        lastUse: 0,
        mesh: buildModel(spec.item.model, spec.item.color)
    };
    selectSlot(idx, false);
    return idx;
}

function removeItem(i, reason) {
    const it = slots[i];
    if (!it) return;
    detach(it.mesh);
    slots[i] = null;
    if (selected === i) selected = -1;
    if (reason) addLog([{ text: `[Ítem] ${it.spec.name}: ${reason}.`, cls: 'text-slate-400' }]);
    refresh();
}

export function clearItems() {
    for (let i = 0; i < SLOT_COUNT; i++) if (slots[i]) detach(slots[i].mesh);
    slots.fill(null);
    selected = -1;
    held = false;
    refresh();
}

export function listItems() {
    return slots.map((s, i) => (s ? `${i + 1}: ${s.spec.item.icon} ${s.spec.name}` : null)).filter(Boolean);
}

export function selectedItem() {
    return selected >= 0 ? slots[selected] : null;
}

// ---------------------------------------------------------------------
//  Disparo
// ---------------------------------------------------------------------
function tryFire(now) {
    const it = selected >= 0 ? slots[selected] : null;
    if (!it) return false;
    if (now - it.lastUse < it.spec.item.cooldown) return false;
    it.lastUse = now;

    const aim = getAim();
    castPower(it.spec, aim, { owner: 'me' });
    bus.relayCast(it.spec, serializeAim(aim));

    flashCooldown(selected, it.spec.item.cooldown);
    recoil = 1;

    if (isFinite(it.ammo)) {
        it.ammo--;
        if (it.ammo <= 0) removeItem(selected, 'sin munición');
        else refresh();
    }
    return true;
}

/** Botón de disparo apretado / soltado. */
export function pressFire(down) {
    held = down;
    if (down) tryFire(performance.now());
}

/** Se llama en cada frame: disparo automático mientras se mantiene el clic + retroceso del modelo. */
export function updateItems(dt, now) {
    if (held && selected >= 0 && slots[selected] && slots[selected].spec.item.auto) tryFire(now);

    const it = selected >= 0 ? slots[selected] : null;
    if (it && it.mesh) {
        recoil = Math.max(0, recoil - dt * 7);
        const fp = state.cameraMode === CAMERA_MODES.FIRST_PERSON;
        it.mesh.position.z = (fp ? -0.55 : 0) + recoil * 0.08;
    }
}

hooks.clearItems = clearItems;
