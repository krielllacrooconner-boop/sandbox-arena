import { state } from './state.js';

export function requestLock() {
    const r = state.renderer;
    if (!r || document.pointerLockElement) return;
    try {
        const p = r.domElement.requestPointerLock();
        if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (e) { /* ignorar */ }
}
