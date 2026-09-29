// =====================================================================
//  ESQUEMA DE PODERES  (módulo puro: se usa en el navegador y en el servidor)
//
//  Un "poder" es DATOS (JSON), no código. Se compone de acciones primitivas.
//  Este archivo es la única fuente de verdad: valida, limita y documenta.
//  Para agregar una capacidad nueva al juego:
//    1) declara la acción acá en ACTIONS,
//    2) impleméntala en engine.js (función con el mismo nombre en HANDLERS).
//  El prompt de la IA se genera solo desde ACTIONS (describeSchema()).
// =====================================================================
import { toHex } from '../colors.js';

export const SFX = ['none', 'laser', 'boom', 'zap', 'pop', 'whoosh', 'magic'];
export const ITEM_MODELS = ['gun', 'wand', 'launcher', 'orb', 'sword', 'block'];
export const LIMITS = { maxActions: 40, maxDepth: 3 };

// --- descriptores de campos ---
const N = (min, max, def) => ({ t: 'num', min, max, def });
const I = (min, max, def) => ({ t: 'int', min, max, def });
const B = (def) => ({ t: 'bool', def });
const C = (def) => ({ t: 'color', def });
const E = (values, def) => ({ t: 'enum', values, def });
const V3 = (min, max, def) => ({ t: 'vec3', min, max, def });
const S = (max, def) => ({ t: 'str', max, def });
const A = () => ({ t: 'actions' });

export const ACTIONS = {
    hitscan: {
        doc: 'Rayo instantaneo desde la mira (laser, bala, rayo). "sky" cae desde el cielo sobre el punto apuntado (area = radio aleatorio alrededor). spread en grados. pierce atraviesa objetos. onHit se ejecuta en cada impacto.',
        fields: {
            range: N(1, 200, 80), damage: N(0, 100, 10), force: N(-40, 40, 6),
            width: N(0.01, 0.8, 0.05), count: I(1, 24, 1), spread: N(0, 35, 0),
            origin: E(['eye', 'sky'], 'eye'), area: N(0, 30, 0),
            color: C('#22d3ee'), pierce: B(false), sfx: E(SFX, 'laser'), onHit: A()
        }
    },
    projectile: {
        doc: 'Proyectil fisico (bola de fuego, cohete, granada, meteoro). speed en m/s, life en ms. "sky" los hace caer desde arriba (area = radio). Por defecto explota (onHit) al chocar; con fuse=true NO explota al chocar sino al terminar su life (rebota si bounce>0, si no se pega a la superficie). stagger = ms entre proyectiles de una rafaga.',
        fields: {
            speed: N(1, 120, 40), gravity: N(-30, 60, 0), size: N(0.05, 3, 0.25), life: N(200, 10000, 3000),
            shape: E(['sphere', 'cube'], 'sphere'), color: C('#f97316'),
            bounce: N(0, 0.95, 0), fuse: B(false), count: I(1, 30, 1), spread: N(0, 45, 0),
            origin: E(['eye', 'sky'], 'eye'), area: N(0, 30, 0), stagger: N(0, 1500, 0),
            damage: N(0, 100, 10), force: N(-40, 40, 6), trail: B(true),
            sfx: E(SFX, 'whoosh'), onHit: A()
        }
    },
    explosion: {
        doc: 'Explosion o implosion (force negativa atrae). Empuja objetos y a ti mismo, rompe objetos con vida.',
        fields: {
            radius: N(0.5, 20, 4), damage: N(0, 150, 20), force: N(-60, 60, 18),
            color: C('#f97316'), at: E(['ctx', 'self', 'aim'], 'ctx'), sfx: E(SFX, 'boom')
        }
    },
    spawn: {
        doc: 'Crea objetos solidos (muros, torres, escaleras, cubos). size=[ancho,alto,profundo] en metros de CADA objeto. pattern define la forma (wall = pared de count bloques, tower = pila vertical, ring = circulo alrededor, stairs = escalera rellena caminable, grid = piso, scatter = al azar). spacing = separacion relativa (1 = pegados). life en ms (0=permanente). hp>0 los hace destructibles. dynamic = caen, ruedan y se empujan. at: aim=donde apuntas, front=delante tuyo, self=alrededor tuyo, sky=caen del cielo, ctx=donde impacto un disparo. snap=alinear a grilla (para construir).',
        fields: {
            shape: E(['box', 'sphere', 'cylinder'], 'box'), size: V3(0.1, 20, [1, 1, 1]),
            count: I(1, 60, 1),
            pattern: E(['single', 'line', 'wall', 'ring', 'tower', 'grid', 'stairs', 'scatter'], 'single'),
            spacing: N(0.5, 6, 1), color: C('#94a3b8'),
            material: E(['solid', 'glass', 'neon'], 'solid'),
            physics: E(['static', 'dynamic'], 'static'),
            life: N(0, 600000, 0), hp: N(0, 500, 0), bounce: N(0, 0.95, 0.3),
            at: E(['ctx', 'aim', 'front', 'self', 'sky'], 'aim'), snap: B(false), sfx: E(SFX, 'pop')
        }
    },
    buff: {
        doc: 'Modifica al jugador durante duration ms: velocidad, salto, gravedad (negativa = flotar hacia arriba), vuelo, tamano.',
        fields: {
            duration: N(1000, 180000, 30000), speedMul: N(0.1, 8, 1), jumpMul: N(0.1, 8, 1),
            gravityMul: N(-2, 3, 1), fly: B(false), scale: N(0.25, 5, 1), sfx: E(SFX, 'magic')
        }
    },
    teleport: {
        doc: 'Teletransporta al jugador. aim/forward = hacia donde mira (hasta distance metros).',
        fields: {
            to: E(['aim', 'forward', 'up', 'spawn', 'random'], 'forward'),
            distance: N(1, 120, 15), keepVelocity: B(false), sfx: E(SFX, 'zap')
        }
    },
    launch: {
        doc: 'Impulso instantaneo al jugador (dash, salto potente, jetpack). forward va hacia donde mira.',
        fields: { forward: N(-60, 80, 0), up: N(-40, 60, 0), sfx: E(SFX, 'whoosh') }
    },
    fx: {
        doc: 'Solo efecto visual: burst (chispas), ring (onda), flash (destello).',
        fields: {
            kind: E(['burst', 'ring', 'flash'], 'burst'), color: C('#ffffff'), count: I(1, 200, 40),
            size: N(0.3, 20, 3), at: E(['ctx', 'self', 'aim'], 'self'), sfx: E(SFX, 'none')
        }
    },
    env: {
        doc: 'Cambia el ambiente (color del cielo/niebla, luz) durante duration ms. Ej: noche, dia, atardecer.',
        fields: {
            sky: C('#0b1220'), fog: N(0, 0.08, 0.012), ambient: N(0, 3, 0.95),
            duration: N(1000, 300000, 30000), sfx: E(SFX, 'none')
        }
    },
    color: {
        doc: 'Cambia el color del personaje del jugador.',
        fields: { hex: C('#3b82f6') }
    },
    wait: {
        doc: 'Pausa la secuencia ms milisegundos antes de las acciones siguientes.',
        fields: { ms: N(0, 5000, 500) }
    },
    repeat: {
        doc: 'Repite sub-acciones times veces, una cada every ms (rafagas, tormentas).',
        fields: { times: I(1, 20, 3), every: N(30, 3000, 200), actions: A() }
    },
    clear: {
        doc: 'Borra cosas: props (objetos creados por ti), buffs (efectos), items (inventario) o all.',
        fields: { what: E(['props', 'buffs', 'items', 'all'], 'props') }
    },
    reset: {
        doc: 'Reinicia al jugador: posicion inicial, color original, sin efectos ni cambios de ambiente.',
        fields: {}
    }
};

// Sinonimos que un modelo de lenguaje podria usar
const ALIASES = {
    laser: 'hitscan', raycast: 'hitscan', shoot: 'hitscan', beam: 'hitscan',
    bullet: 'projectile', missile: 'projectile', fireball: 'projectile', throw: 'projectile',
    explode: 'explosion', blast: 'explosion',
    build: 'spawn', create: 'spawn', summon: 'spawn', place: 'spawn',
    blink: 'teleport', tp: 'teleport',
    boost: 'launch', dash: 'launch', impulse: 'launch',
    effect: 'fx', particles: 'fx', vfx: 'fx',
    environment: 'env', ambient: 'env', weather: 'env',
    delay: 'wait', sleep: 'wait', loop: 'repeat',
    remove: 'clear', delete: 'clear', cleanup: 'clear',
    respawn: 'reset', restart: 'reset',
    recolor: 'color', paint: 'color'
};

// --- sanitizadores ---
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));

function cleanStr(v, max, def) {
    if (typeof v !== 'string') return def;
    const s = v.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, max);
    return s || def;
}

function sanitizeValue(d, v) {
    switch (d.t) {
        case 'num':
        case 'int': {
            const n = typeof v === 'string' ? parseFloat(v) : v;
            if (typeof n !== 'number' || !isFinite(n)) return d.def;
            const c = clampN(n, d.min, d.max);
            return d.t === 'int' ? Math.round(c) : c;
        }
        case 'bool':
            if (typeof v === 'boolean') return v;
            if (v === 'true') return true;
            if (v === 'false') return false;
            return d.def;
        case 'color':
            return toHex(v, d.def);
        case 'enum': {
            const s = typeof v === 'string' ? v.toLowerCase() : '';
            return d.values.includes(s) ? s : d.def;
        }
        case 'vec3': {
            let arr = null;
            if (typeof v === 'number') arr = [v, v, v];
            else if (Array.isArray(v) && v.length) arr = v.slice(0, 3);
            else if (v && typeof v === 'object') arr = [v.x, v.y, v.z];
            if (!arr) return d.def.slice();
            const out = [];
            for (let i = 0; i < 3; i++) {
                const raw = arr[i] !== undefined ? arr[i] : arr[arr.length - 1];
                const n = typeof raw === 'string' ? parseFloat(raw) : raw;
                out.push(typeof n === 'number' && isFinite(n) ? clampN(n, d.min, d.max) : d.def[i]);
            }
            return out;
        }
        case 'str':
            return cleanStr(v, d.max, d.def);
    }
    return d.def;
}

function sanitizeAction(raw, depth, st) {
    if (!raw || typeof raw !== 'object') return null;
    let type = String(raw.do ?? raw.type ?? raw.action ?? '').toLowerCase().trim();
    type = ALIASES[type] || type;
    const def = ACTIONS[type];
    if (!def) {
        st.errors.push(`accion desconocida: "${type || '?'}"`);
        return null;
    }
    if (st.count >= LIMITS.maxActions) {
        st.errors.push('demasiadas acciones (max ' + LIMITS.maxActions + ')');
        return null;
    }
    st.count++;
    const out = { do: type };
    for (const [key, d] of Object.entries(def.fields)) {
        if (d.t === 'actions') {
            out[key] = (depth + 1 < LIMITS.maxDepth) ? sanitizeList(raw[key], depth + 1, st) : [];
        } else {
            out[key] = sanitizeValue(d, raw[key]);
        }
    }
    return out;
}

function sanitizeList(list, depth, st) {
    if (!Array.isArray(list)) return [];
    const out = [];
    for (const a of list) {
        const s = sanitizeAction(a, depth, st);
        if (s) out.push(s);
    }
    return out;
}

const ITEM_FIELDS = {
    model: E(ITEM_MODELS, 'gun'),
    color: C('#22d3ee'),
    icon: S(4, '✨'),
    cooldown: N(30, 10000, 300),
    ammo: I(0, 999, 0),      // 0 = infinito
    auto: B(false)           // mantener clic = disparo continuo
};

/**
 * Valida y normaliza un poder crudo (p. ej. lo que devolvio la IA o llego por red).
 * Nunca lanza: devuelve { ok, spec, errors } | { ok:false, unsupported, suggestion }.
 */
export function sanitizeSpec(raw) {
    const errors = [];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return { ok: false, errors: ['el poder no es un objeto'] };
    }
    if (raw.unsupported) {
        return {
            ok: false,
            unsupported: cleanStr(String(raw.unsupported), 200, 'No se puede hacer con las acciones disponibles.'),
            suggestion: cleanStr(String(raw.suggestion || ''), 200, ''),
            errors
        };
    }

    const spec = {
        v: 1,
        name: cleanStr(raw.name, 32, 'Poder'),
        description: cleanStr(raw.description, 120, ''),
        mode: raw.mode === 'item' ? 'item' : 'instant'
    };

    if (spec.mode === 'item') {
        const it = (raw.item && typeof raw.item === 'object') ? raw.item : {};
        spec.item = {};
        for (const [k, d] of Object.entries(ITEM_FIELDS)) spec.item[k] = sanitizeValue(d, it[k]);
    }

    const st = { count: 0, errors };
    spec.actions = sanitizeList(raw.actions, 0, st);
    if (!spec.actions.length) {
        errors.push('el poder no tiene acciones validas');
        return { ok: false, errors };
    }
    return { ok: true, spec, errors };
}

/** Texto compacto con todas las acciones y sus limites (para el prompt de la IA y la documentacion). */
export function describeSchema() {
    const fmt = (d) => {
        switch (d.t) {
            case 'num': return `num ${d.min}..${d.max} =${d.def}`;
            case 'int': return `int ${d.min}..${d.max} =${d.def}`;
            case 'bool': return `bool =${d.def}`;
            case 'color': return `color "#rrggbb" =${d.def}`;
            case 'enum': return `${d.values.join('|')} =${d.def}`;
            case 'vec3': return `[x,y,z] cada uno ${d.min}..${d.max} =${JSON.stringify(d.def)}`;
            case 'actions': return 'lista de acciones';
            default: return 'texto';
        }
    };
    return Object.entries(ACTIONS).map(([name, a]) => {
        const fields = Object.entries(a.fields).map(([f, d]) => `${f}(${fmt(d)})`).join(', ');
        return `- ${name}: ${a.doc}\n    campos: ${fields || '(ninguno)'}`;
    }).join('\n');
}

export function describeItem() {
    return Object.entries(ITEM_FIELDS).map(([k, d]) => {
        const v = d.t === 'enum' ? d.values.join('|') : (d.t === 'num' || d.t === 'int') ? `${d.min}..${d.max}` : d.t;
        return `${k}(${v} =${d.def})`;
    }).join(', ');
}
