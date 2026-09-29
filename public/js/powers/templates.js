// =====================================================================
//  PLANTILLAS: poderes ya armados con las primitivas del esquema.
//  Se usan como reglas locales (sin IA) y como ejemplos para la IA.
//  Cada plantilla devuelve un poder "crudo"; luego pasa por sanitizeSpec().
//  o = { color, n (cantidad), sizeMul }
// =====================================================================
const hex = (o, d) => (o && o.color) || d;
const num = (o, d, max = 60) => Math.max(1, Math.min(max, (o && o.n) || d));
const mul = (o) => (o && o.sizeMul) || 1;

export const T = {
    // ---------- ARMAS (items) ----------
    laserGun: (o) => ({
        name: 'Pistola láser', description: 'Dispara un rayo instantáneo.', mode: 'item',
        item: { model: 'gun', color: hex(o, '#ef4444'), icon: '🔫', cooldown: 220 },
        actions: [{
            do: 'hitscan', range: 150, damage: 12, force: 4, width: 0.05, color: hex(o, '#ef4444'), sfx: 'laser',
            onHit: [{ do: 'fx', kind: 'burst', color: hex(o, '#ef4444'), count: 14, at: 'ctx' }]
        }]
    }),
    smg: (o) => ({
        name: 'Metralleta', description: 'Ráfagas rápidas: mantén el clic.', mode: 'item',
        item: { model: 'gun', color: hex(o, '#f59e0b'), icon: '🔫', cooldown: 85, auto: true },
        actions: [{ do: 'hitscan', range: 100, damage: 6, force: 2, width: 0.03, spread: 2.5, color: hex(o, '#fbbf24'), sfx: 'zap' }]
    }),
    shotgun: (o) => ({
        name: 'Escopeta', description: 'Nueve perdigones por disparo.', mode: 'item',
        item: { model: 'gun', color: hex(o, '#a16207'), icon: '💥', cooldown: 750 },
        actions: [{ do: 'hitscan', range: 40, damage: 7, force: 3, width: 0.03, count: 9, spread: 9, color: hex(o, '#fde68a'), sfx: 'boom' }]
    }),
    sniper: (o) => ({
        name: 'Francotirador', description: 'Un tiro potente que atraviesa objetos.', mode: 'item',
        item: { model: 'gun', color: hex(o, '#64748b'), icon: '🎯', cooldown: 1300 },
        actions: [{
            do: 'hitscan', range: 200, damage: 70, force: 18, width: 0.07, pierce: true, color: hex(o, '#f8fafc'), sfx: 'laser',
            onHit: [{ do: 'fx', kind: 'ring', color: hex(o, '#f8fafc'), size: 2, at: 'ctx' }]
        }]
    }),
    rocketLauncher: (o) => ({
        name: 'Lanzacohetes', description: 'Cohete explosivo. Sirve para dar saltos de cohete.', mode: 'item',
        item: { model: 'launcher', color: hex(o, '#22c55e'), icon: '🚀', cooldown: 900 },
        actions: [{
            do: 'projectile', speed: 38, size: 0.3, gravity: 0, life: 4000, color: hex(o, '#fb923c'), trail: true, sfx: 'whoosh',
            onHit: [{ do: 'explosion', radius: 5, damage: 45, force: 24, color: hex(o, '#f97316'), at: 'ctx' }]
        }]
    }),
    grenade: (o) => ({
        name: 'Granada', description: 'Rebota y explota a los 2 segundos.', mode: 'item',
        item: { model: 'orb', color: hex(o, '#4d7c0f'), icon: '💣', cooldown: 900 },
        actions: [{
            do: 'projectile', speed: 20, gravity: 25, size: 0.25, bounce: 0.5, fuse: true, life: 2200, color: hex(o, '#84cc16'), sfx: 'whoosh',
            onHit: [{ do: 'explosion', radius: 6, damage: 50, force: 26, color: hex(o, '#f97316'), at: 'ctx' }]
        }]
    }),
    fireball: (o) => ({
        name: 'Bola de fuego', description: 'Lanza una bola de fuego que explota al impactar.', mode: 'item',
        item: { model: 'wand', color: hex(o, '#fb923c'), icon: '🔥', cooldown: 450 },
        actions: [{
            do: 'projectile', speed: 28, size: 0.55, gravity: 0, life: 3500, color: hex(o, '#fb923c'), trail: true, sfx: 'magic',
            onHit: [{ do: 'explosion', radius: 3.5, damage: 25, force: 12, color: hex(o, '#f97316'), at: 'ctx' }]
        }]
    }),
    blackHole: (o) => ({
        name: 'Agujero negro', description: 'Un orbe que atrae todo lo cercano durante unos segundos.', mode: 'item',
        item: { model: 'orb', color: hex(o, '#7c3aed'), icon: '🌀', cooldown: 5000 },
        actions: [{
            do: 'projectile', speed: 18, size: 0.5, gravity: 0, life: 2500, fuse: true, color: hex(o, '#7c3aed'), sfx: 'magic',
            onHit: [
                { do: 'fx', kind: 'ring', color: hex(o, '#7c3aed'), size: 10, at: 'ctx' },
                { do: 'repeat', times: 10, every: 250, actions: [{ do: 'explosion', radius: 14, damage: 0, force: -20, color: hex(o, '#7c3aed'), at: 'ctx', sfx: 'none' }] }
            ]
        }]
    }),
    lightningWand: (o) => ({
        name: 'Bastón de rayos', description: 'Invoca un rayo del cielo donde apuntas.', mode: 'item',
        item: { model: 'wand', color: hex(o, '#a5b4fc'), icon: '⚡', cooldown: 700 },
        actions: [{
            do: 'hitscan', origin: 'sky', range: 90, width: 0.25, damage: 40, force: 8, color: hex(o, '#c7d2fe'), sfx: 'zap',
            onHit: [{ do: 'explosion', radius: 3, damage: 20, force: 10, color: hex(o, '#a5b4fc'), at: 'ctx', sfx: 'none' }]
        }]
    }),
    blockBuilder: (o) => ({
        name: 'Constructor de bloques', description: 'Clic para colocar bloques alineados a la grilla.', mode: 'item',
        item: { model: 'block', color: hex(o, '#94a3b8'), icon: '🧱', cooldown: 140, auto: true },
        actions: [{ do: 'spawn', shape: 'box', size: [mul(o), mul(o), mul(o)], count: 1, pattern: 'single', physics: 'static', at: 'aim', snap: true, color: hex(o, '#94a3b8'), sfx: 'pop' }]
    }),
    teleportOrb: (o) => ({
        name: 'Orbe de teletransporte', description: 'Te lleva adonde apuntas (hasta 60 m).', mode: 'item',
        item: { model: 'orb', color: hex(o, '#38bdf8'), icon: '🔮', cooldown: 900 },
        actions: [{ do: 'teleport', to: 'aim', distance: 60, sfx: 'zap' }]
    }),
    dash: (o) => ({
        name: 'Botas de impulso', description: 'Un empujón rápido hacia adelante.', mode: 'item',
        item: { model: 'orb', color: hex(o, '#22d3ee'), icon: '👟', cooldown: 1500 },
        actions: [
            { do: 'fx', kind: 'ring', color: hex(o, '#22d3ee'), size: 2.5, at: 'self' },
            { do: 'launch', forward: 30, up: 3, sfx: 'whoosh' }
        ]
    }),
    jetpack: (o) => ({
        name: 'Jetpack', description: 'Mantén el clic para propulsarte.', mode: 'item',
        item: { model: 'launcher', color: hex(o, '#fbbf24'), icon: '🎒', cooldown: 110, auto: true },
        actions: [
            { do: 'fx', kind: 'burst', color: hex(o, '#fbbf24'), count: 8, size: 1, at: 'self' },
            { do: 'launch', forward: 2.5, up: 5.5, sfx: 'none' }
        ]
    }),

    // ---------- CONSTRUCCIÓN (instantáneos) ----------
    wall: (o) => ({
        name: 'Muro', description: 'Un muro delante tuyo.', mode: 'instant',
        actions: [{ do: 'spawn', shape: 'box', size: [2 * mul(o), 2 * mul(o), 0.6 * mul(o)], count: num(o, 10), pattern: 'wall', at: 'front', color: hex(o, '#94a3b8'), sfx: 'pop' }]
    }),
    iceWall: (o) => ({
        name: 'Muro de hielo', description: 'Un muro de hielo que se derrite a los 30 s.', mode: 'instant',
        actions: [{ do: 'spawn', shape: 'box', size: [2 * mul(o), 2 * mul(o), 0.6 * mul(o)], count: num(o, 10), pattern: 'wall', at: 'front', color: hex(o, '#7dd3fc'), material: 'glass', life: 30000, hp: 40, sfx: 'pop' }]
    }),
    fortress: (o) => ({
        name: 'Fortaleza', description: 'Un círculo de bloques a tu alrededor.', mode: 'instant',
        actions: [{ do: 'spawn', shape: 'box', size: [2.5 * mul(o), 3 * mul(o), 2.5 * mul(o)], count: num(o, 14), pattern: 'ring', at: 'self', color: hex(o, '#94a3b8'), sfx: 'pop' }]
    }),
    tower: (o) => ({
        name: 'Torre', description: 'Una torre de bloques donde apuntas.', mode: 'instant',
        actions: [{ do: 'spawn', shape: 'box', size: [2 * mul(o), 1.5 * mul(o), 2 * mul(o)], count: num(o, 10), pattern: 'tower', at: 'aim', color: hex(o, '#94a3b8'), sfx: 'pop' }]
    }),
    stairs: (o) => ({
        name: 'Escalera', description: 'Una escalera que se puede caminar.', mode: 'instant',
        actions: [{ do: 'spawn', shape: 'box', size: [3, 0.5, 1.2], count: num(o, 24), pattern: 'stairs', at: 'front', color: hex(o, '#94a3b8'), sfx: 'pop' }]
    }),
    bridge: (o) => ({
        name: 'Puente', description: 'Una fila de plataformas a tu altura, hacia adelante.', mode: 'instant',
        actions: [{ do: 'spawn', shape: 'box', size: [3, 0.4, 2], count: num(o, 15), pattern: 'line', at: 'self', color: hex(o, '#94a3b8'), sfx: 'pop' }]
    }),
    cubes: (o) => ({
        name: 'Cubos', description: 'Cubos que caen y ruedan.', mode: 'instant',
        actions: [{ do: 'spawn', shape: 'box', size: [mul(o), mul(o), mul(o)], count: num(o, 12), pattern: 'scatter', physics: 'dynamic', at: 'front', color: hex(o, '#f59e0b'), life: 90000, sfx: 'pop' }]
    }),
    cubeRain: (o) => ({
        name: 'Lluvia de cubos', description: 'Cubos que caen del cielo.', mode: 'instant',
        actions: [{ do: 'spawn', shape: 'box', size: [mul(o), mul(o), mul(o)], count: num(o, 24), pattern: 'scatter', physics: 'dynamic', at: 'sky', color: hex(o, '#f472b6'), life: 60000, sfx: 'whoosh' }]
    }),

    // ---------- ATAQUES / HECHIZOS (instantáneos) ----------
    meteors: (o) => ({
        name: 'Lluvia de meteoritos', description: 'Meteoros que caen del cielo alrededor de donde apuntas.', mode: 'instant',
        actions: [{
            do: 'projectile', origin: 'sky', count: num(o, 10, 20), area: 14, stagger: 250, speed: 30, gravity: 20, size: 0.7, life: 5000,
            color: hex(o, '#f97316'), trail: true, sfx: 'whoosh',
            onHit: [{ do: 'explosion', radius: 4.5, damage: 40, force: 16, color: hex(o, '#f97316'), at: 'ctx' }]
        }]
    }),
    storm: (o) => ({
        name: 'Tormenta eléctrica', description: 'Rayos que caen alrededor de donde apuntas.', mode: 'instant',
        actions: [{
            do: 'repeat', times: num(o, 14, 20), every: 220,
            actions: [{
                do: 'hitscan', origin: 'sky', area: 14, range: 90, width: 0.3, damage: 40, force: 8, color: hex(o, '#c7d2fe'), sfx: 'zap',
                onHit: [{ do: 'explosion', radius: 2.5, damage: 25, force: 8, color: hex(o, '#a5b4fc'), at: 'ctx', sfx: 'none' }]
            }]
        }]
    }),
    explosion: (o) => ({
        name: 'Explosión', description: 'Una explosión donde apuntas.', mode: 'instant',
        actions: [{ do: 'explosion', radius: 6 * mul(o), damage: 40, force: 24, color: hex(o, '#f97316'), at: 'aim' }]
    }),

    // ---------- MOVIMIENTO / ESTADO (instantáneos) ----------
    blinkUp: () => ({
        name: 'Teletransporte arriba', description: 'Sube 25 metros.', mode: 'instant',
        actions: [{ do: 'teleport', to: 'up', distance: 25 }]
    }),
    fly: () => ({
        name: 'Vuelo', description: 'Espacio sube, C baja.', mode: 'instant',
        actions: [{ do: 'fx', kind: 'ring', color: '#67e8f9', size: 3, at: 'self' }, { do: 'buff', duration: 30000, fly: true }]
    }),
    fast: () => ({
        name: 'Supervelocidad', description: 'Corres mucho más rápido.', mode: 'instant',
        actions: [{ do: 'buff', duration: 30000, speedMul: 2.75 }]
    }),
    lowGravity: () => ({
        name: 'Gravedad lunar', description: 'Saltas mucho más alto.', mode: 'instant',
        actions: [{ do: 'buff', duration: 30000, gravityMul: 0.25 }]
    }),
    invertedGravity: () => ({
        name: 'Gravedad invertida', description: 'Flotas hacia arriba por un rato.', mode: 'instant',
        actions: [{ do: 'buff', duration: 15000, gravityMul: -0.35 }]
    }),
    superJump: () => ({
        name: 'Súper salto', description: 'Saltas mucho más alto.', mode: 'instant',
        actions: [{ do: 'buff', duration: 30000, jumpMul: 2.6 }]
    }),
    giant: () => ({
        name: 'Modo gigante', description: 'Te vuelves enorme.', mode: 'instant',
        actions: [{ do: 'fx', kind: 'ring', color: '#f59e0b', size: 4, at: 'self' }, { do: 'buff', duration: 45000, scale: 3, speedMul: 1.25, jumpMul: 1.3 }]
    }),
    tiny: () => ({
        name: 'Modo diminuto', description: 'Te vuelves minúsculo.', mode: 'instant',
        actions: [{ do: 'buff', duration: 45000, scale: 0.35, speedMul: 1.2, jumpMul: 1.2 }]
    }),

    // ---------- AMBIENTE ----------
    night: () => ({
        name: 'Noche', description: 'Oscurece el mundo.', mode: 'instant',
        actions: [{ do: 'env', sky: '#02040a', fog: 0.02, ambient: 0.28, duration: 120000 }]
    }),
    day: () => ({
        name: 'Día', description: 'Cielo claro y luminoso.', mode: 'instant',
        actions: [{ do: 'env', sky: '#7dd3fc', fog: 0.006, ambient: 1.5, duration: 120000 }]
    }),
    sunset: () => ({
        name: 'Atardecer', description: 'Cielo naranja.', mode: 'instant',
        actions: [{ do: 'env', sky: '#c2410c', fog: 0.012, ambient: 1.0, duration: 120000 }]
    }),
    fog: () => ({
        name: 'Niebla', description: 'Niebla espesa.', mode: 'instant',
        actions: [{ do: 'env', sky: '#64748b', fog: 0.06, ambient: 0.9, duration: 60000 }]
    }),

    // ---------- UTILIDADES ----------
    color: (o) => ({
        name: 'Cambio de color', description: 'Cambia el color de tu personaje.', mode: 'instant',
        actions: [{ do: 'color', hex: hex(o, '#3b82f6') }]
    }),
    reset: () => ({
        name: 'Reinicio', description: 'Vuelve al inicio sin efectos.', mode: 'instant',
        actions: [{ do: 'reset' }]
    }),
    clearBuffs: () => ({
        name: 'Efectos cancelados', description: 'Quita todos tus efectos.', mode: 'instant',
        actions: [{ do: 'clear', what: 'buffs' }]
    }),
    clearProps: () => ({
        name: 'Limpieza', description: 'Borra lo que construiste.', mode: 'instant',
        actions: [{ do: 'clear', what: 'props' }]
    }),
    clearItems: () => ({
        name: 'Inventario vacío', description: 'Guarda todos tus ítems.', mode: 'instant',
        actions: [{ do: 'clear', what: 'items' }]
    })
};
