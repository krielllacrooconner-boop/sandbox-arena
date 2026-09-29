import { THREE } from './three.js';
import { state, player, CAMERA_MODES } from './state.js';
import { DEFAULTS } from './config.js';
import { setCameraTag, updateCrosshair } from './hud.js';
import { onCameraModeChange } from './powers/items.js';

const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

export function toggleCameraMode() {
    state.cameraMode = (state.cameraMode === CAMERA_MODES.THIRD_PERSON)
        ? CAMERA_MODES.FIRST_PERSON
        : CAMERA_MODES.THIRD_PERSON;

    // En 1ª persona se oculta TODO el modelo propio (cuerpo, cabeza y visor); en 3ª vuelve a mostrarse
    state.playerGroup.visible = (state.cameraMode === CAMERA_MODES.THIRD_PERSON);
    setCameraTag();
    updateCrosshair();
    onCameraModeChange();
}

export function updateCamera() {
    const cam = state.camera;
    const pos = player.position;
    const s = state.scaleCur || 1;

    if (state.cameraMode === CAMERA_MODES.FIRST_PERSON) {
        cam.position.set(pos.x, pos.y + DEFAULTS.eyeHeight * s, pos.z);
        _euler.set(player.pitchX, player.rotationY, 0, 'YXZ');
        cam.quaternion.setFromEuler(_euler);
    } else {
        const dist = 4.5 * s;
        const height = (2.0 - Math.sin(player.pitchX) * 2) * s;

        cam.position.set(
            pos.x + Math.sin(player.rotationY) * dist,
            Math.max(0.3, pos.y + height),
            pos.z + Math.cos(player.rotationY) * dist
        );
        cam.lookAt(pos.x, pos.y + 1.4 * s, pos.z);
    }
}
