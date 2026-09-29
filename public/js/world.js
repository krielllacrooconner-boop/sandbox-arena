// Escena, renderer, luces, suelo, plataforma y pilares.
import { THREE } from './three.js';
import { state } from './state.js';
import { CONFIG, WORLD } from './config.js';
import { $ } from './util.js';
import * as col from './colliders.js';

export function disableShadows(obj) {
    // Sistema de sombras eliminado por completo (priorizamos FPS)
    obj.castShadow = false;
    obj.receiveShadow = false;
}

export function initWorld() {
    const container = $('canvas-container');

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(WORLD.skyColor);
    scene.fog = new THREE.FogExp2(WORLD.skyColor, WORLD.fogDensity);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500);
    scene.add(camera);   // necesario para que los ítems en primera persona (hijos de la cámara) se dibujen

    const renderer = new THREE.WebGLRenderer({
        antialias: CONFIG.antialias,
        powerPreference: 'high-performance'
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, CONFIG.maxPixelRatio));
    renderer.domElement.style.display = 'block';
    container.appendChild(renderer.domElement);

    // Iluminación clara y barata: ambiente fuerte + una luz direccional (sin sombras)
    const ambient = new THREE.AmbientLight(0xffffff, WORLD.ambient);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xffffff, 0.55);
    sun.position.set(30, 50, 20);
    disableShadows(sun);
    scene.add(sun);

    // Suelo + cuadrícula
    const size = CONFIG.worldHalf * 2;
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(size, size),
        new THREE.MeshLambertMaterial({ color: 0x1e293b })
    );
    floor.rotation.x = -Math.PI / 2;
    disableShadows(floor);
    scene.add(floor);

    const grid = new THREE.GridHelper(size, 50, 0x06b6d4, 0x334155);
    grid.position.y = 0.02;
    scene.add(grid);

    // Plataforma central
    const platform = new THREE.Mesh(
        new THREE.CylinderGeometry(WORLD.platformRadius, WORLD.platformRadius, WORLD.platformHeight, 32),
        new THREE.MeshLambertMaterial({ color: 0x334155 })
    );
    platform.position.set(0, WORLD.platformHeight / 2, 0);
    disableShadows(platform);
    scene.add(platform);

    // Pilares decorativos (geometría y materiales compartidos)
    const pillarGeo = new THREE.BoxGeometry(WORLD.pillarHalf * 2, WORLD.pillarHeight, WORLD.pillarHalf * 2);
    const pillarMat = new THREE.MeshLambertMaterial({ color: 0x475569 });
    const ringGeo = new THREE.TorusGeometry(1.2, 0.08, 8, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4 });
    WORLD.pillars.forEach(([x, z], i) => {
        const pillar = new THREE.Mesh(pillarGeo, pillarMat);
        pillar.position.set(x, WORLD.pillarHeight / 2, z);
        disableShadows(pillar);
        scene.add(pillar);

        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = Math.PI / 2;
        ring.position.set(x, 0.1, z);
        disableShadows(ring);
        scene.add(ring);

        col.addBox('pillar' + i, x, WORLD.pillarHeight / 2, z, WORLD.pillarHalf, WORLD.pillarHeight / 2, WORLD.pillarHalf, true, null);
    });

    state.scene = scene;
    state.camera = camera;
    state.renderer = renderer;
    state.ambient = ambient;
    return scene;
}

export function onWindowResize() {
    const { camera, renderer } = state;
    if (!camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}
