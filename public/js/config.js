// Constantes ajustables del juego. Todo lo "tuneable" vive acá.
export const CONFIG = {
    // Red
    syncIntervalMs: 100,        // 10 Hz para la posición de los jugadores
    heartbeatMs: 4000,          // latido si estás quieto
    remoteLerp: 14,             // suavizado de jugadores remotos
    remoteStaleMs: 15000,       // sin novedades -> se quita del mundo
    relayCasts: true,           // enviar tus poderes a los demás jugadores (Firestore)
    castRelayMinIntervalMs: 250,
    remoteKnockback: true,      // las explosiones de otros te empujan

    // Render
    maxPixelRatio: 1.5,
    antialias: true,
    worldHalf: 50,              // el mundo es de 100 x 100

    // Poderes
    llmEndpoint: '/api/power',
    llmMode: 'auto',            // 'auto' = reglas locales primero, IA si no entiende | 'local' | 'ia'
    llmTimeoutMs: 30000,
    maxProps: 300,
    maxProjectiles: 80,
    sound: true
};

export const DEFAULTS = {
    speed: 8.0,
    runMultiplier: 1.8,
    jumpForce: 9.0,
    gravity: 24.0,
    flySpeed: 9.0,
    playerHeight: 1.8,
    playerRadius: 0.35,
    stepHeight: 0.55,
    eyeHeight: 1.65
};

export const WORLD = {
    platformRadius: 6,
    platformHeight: 0.4,
    pillars: [[-15, -15], [15, -15], [-15, 15], [15, 15], [0, -25]],
    pillarHalf: 0.75,
    pillarHeight: 6,
    skyColor: 0x0b1220,
    fogDensity: 0.012,
    ambient: 0.95,
    spawn: [0, 1.2, 0]
};
