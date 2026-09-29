// Avatares: jugador local y jugadores remotos (con interpolación).
import { THREE } from './three.js';
import { state } from './state.js';
import { CONFIG } from './config.js';
import { safeNum } from './util.js';
import { disableShadows } from './world.js';
import { setAvatarColor } from './hud.js';

export const otherPlayers = new Map();
const SHARED = {};
const safeColor = (c) => (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)) ? c : '#10b981';

export const profile = { dirty: true };   // network.js lo lee para saber si hay que reenviar tu perfil

export function initAvatars() {
    SHARED.bodyGeo = new THREE.BoxGeometry(0.8, 1.4, 0.5);
    SHARED.headGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    SHARED.visorGeo = new THREE.BoxGeometry(0.4, 0.15, 0.2);
    SHARED.headMat = new THREE.MeshLambertMaterial({ color: 0xf8fafc });
    SHARED.visorLocalMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4 });
    SHARED.visorRemoteMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });

    const avatar = buildAvatar(state.selectedColor, SHARED.visorLocalMat);
    state.playerGroup = avatar.group;
    state.playerBodyMat = avatar.bodyMat;

    // Punto donde se dibuja el ítem equipado en tercera persona (mano derecha)
    const hand = new THREE.Group();
    hand.position.set(0.55, 0.95, -0.35);
    avatar.group.add(hand);
    state.handAnchor = hand;

    state.scene.add(avatar.group);
}

function buildAvatar(color, visorMat) {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(color) });

    const body = new THREE.Mesh(SHARED.bodyGeo, bodyMat);
    body.position.y = 0.7;
    const head = new THREE.Mesh(SHARED.headGeo, SHARED.headMat);
    head.position.y = 1.65;
    const visor = new THREE.Mesh(SHARED.visorGeo, visorMat);
    visor.position.set(0, 1.68, -0.22);

    [body, head, visor].forEach(disableShadows);
    group.add(body, head, visor);
    return { group, bodyMat };
}

export function setLocalColor(hex) {
    state.selectedColor = hex;
    if (state.playerBodyMat) state.playerBodyMat.color.set(hex);
    setAvatarColor(hex);
    profile.dirty = true;
}

function makeNameSprite(name) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(0, 0, 256, 64);
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, 256, 64);
    ctx.font = 'bold 28px sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.fillText(name, 128, 42, 236);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(material);
    sprite.position.y = 2.4;
    sprite.scale.set(2, 0.5, 1);
    return sprite;
}

export function createRemotePlayer(id, data) {
    const color = safeColor(data.color);
    const name = String(data.username || 'Jugador').slice(0, 15);
    const avatar = buildAvatar(color, SHARED.visorRemoteMat);
    const sprite = makeNameSprite(name);
    avatar.group.add(sprite);
    avatar.group.position.set(safeNum(data.x), safeNum(data.y), safeNum(data.z));
    avatar.group.rotation.y = safeNum(data.rotationY);
    state.scene.add(avatar.group);

    const rp = {
        group: avatar.group,
        bodyMat: avatar.bodyMat,
        sprite, name, color,
        targetPos: avatar.group.position.clone(),
        targetRotY: avatar.group.rotation.y,
        targetScale: 1,
        lastUpdate: performance.now()
    };
    otherPlayers.set(id, rp);
    return rp;
}

export function applyRemoteData(rp, data, now) {
    rp.targetPos.set(safeNum(data.x), safeNum(data.y), safeNum(data.z));
    rp.targetRotY = safeNum(data.rotationY);
    rp.targetScale = Math.max(0.25, Math.min(6, safeNum(data.scale, 1) || 1));
    rp.lastUpdate = now;

    if (data.color && data.color !== rp.color) {
        rp.color = data.color;
        rp.bodyMat.color.set(safeColor(data.color));
    }
    // Teletransporte grande: sin interpolar
    if (rp.group.position.distanceToSquared(rp.targetPos) > 625) {
        rp.group.position.copy(rp.targetPos);
    }
}

export function removeRemotePlayer(id) {
    const rp = otherPlayers.get(id);
    if (!rp) return;
    state.scene.remove(rp.group);
    rp.bodyMat.dispose();
    rp.sprite.material.map.dispose();
    rp.sprite.material.dispose();
    otherPlayers.delete(id);
}

export function updateRemotePlayers(dt, nowMs) {
    const k = 1 - Math.exp(-CONFIG.remoteLerp * dt);
    let removed = false;
    for (const [id, rp] of otherPlayers) {
        if (nowMs - rp.lastUpdate > CONFIG.remoteStaleMs) {
            removeRemotePlayer(id);
            removed = true;
            continue;
        }
        rp.group.position.lerp(rp.targetPos, k);

        // Rotación por el camino más corto
        let diff = rp.targetRotY - rp.group.rotation.y;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        rp.group.rotation.y += diff * k;

        const s = rp.group.scale.x + (rp.targetScale - rp.group.scale.x) * k;
        rp.group.scale.setScalar(s);
    }
    return removed;
}
