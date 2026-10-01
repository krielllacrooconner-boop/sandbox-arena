import { THREE } from './three.js';
import { WORLD } from './config.js';

export const CAMERA_MODES = { FIRST_PERSON: 0, THIRD_PERSON: 1 };

// Estado compartido y mutable (una sola instancia para todo el juego).
export const state = {
    scene: null,
    camera: null,
    renderer: null,
    ambient: null,

    playerGroup: null,
    playerBodyMat: null,
    handAnchor: null,
    scaleCur: 1,

    username: 'Jugador',
    selectedColor: '#3b82f6',
    baseColor: '#3b82f6',

    device: null,   // 'pc' | 'mobile', elegido en el menú antes de entrar
    analogMove: { mx: 0, mz: 0 },   // joystick táctil (reemplaza a WASD en celular)

    cameraMode: CAMERA_MODES.THIRD_PERSON,
    isPointerLocked: false,
    terminalOpen: false,
    gameStarted: false,
    hasItem: false,

    localPlayerId: null,
    networkReady: false,
    llmAvailable: false
};

export const player = {
    position: new THREE.Vector3(...WORLD.spawn),
    velocity: new THREE.Vector3(0, 0, 0),
    rotationY: 0,
    pitchX: 0,
    isGrounded: false
};

export const keys = {};
