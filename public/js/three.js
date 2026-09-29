// Punto único de acceso a Three.js (r128 se carga por CDN como global THREE).
export const THREE = globalThis.THREE;
if (!THREE) {
    throw new Error('Three.js no está cargado. Revisa el <script> del CDN en index.html.');
}
