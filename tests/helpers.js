// Arnés de pruebas: THREE real (r128) + reloj controlable, sin navegador ni WebGL.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
globalThis.THREE = require('three');

// Reloj falso: todo el juego usa performance.now(), así el tiempo simulado es coherente.
export const clock = { t: 100000 };
Object.defineProperty(globalThis, 'performance', { value: { now: () => clock.t }, configurable: true, writable: true });
