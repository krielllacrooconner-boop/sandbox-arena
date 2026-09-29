// Colores y utilidades de texto (módulo puro: sirve en el navegador y en el servidor).
export const COLOR_MAP = {
    rojo: '#ef4444', roja: '#ef4444', red: '#ef4444',
    azul: '#3b82f6', blue: '#3b82f6',
    verde: '#10b981', green: '#10b981',
    amarillo: '#facc15', amarilla: '#facc15', yellow: '#facc15',
    naranja: '#f97316', anaranjado: '#f97316', orange: '#f97316',
    violeta: '#8b5cf6', morado: '#8b5cf6', morada: '#8b5cf6', purpura: '#8b5cf6', purple: '#8b5cf6',
    lila: '#c084fc',
    rosa: '#ec4899', rosado: '#ec4899', rosada: '#ec4899', pink: '#ec4899',
    fucsia: '#d946ef',
    celeste: '#38bdf8',
    cian: '#06b6d4', cyan: '#06b6d4',
    turquesa: '#14b8a6',
    blanco: '#f8fafc', blanca: '#f8fafc', white: '#f8fafc',
    negro: '#111827', negra: '#111827', black: '#111827',
    gris: '#94a3b8', gray: '#94a3b8', grey: '#94a3b8',
    marron: '#92400e', brown: '#92400e',
    dorado: '#fbbf24', dorada: '#fbbf24', oro: '#fbbf24', gold: '#fbbf24',
    plateado: '#cbd5e1', plateada: '#cbd5e1', plata: '#cbd5e1', silver: '#cbd5e1'
};

export function normalizeText(s) {
    return String(s)
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // sin tildes
        .replace(/[^a-z0-9#\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// Devuelve { hex, name } o null
export function extractColor(t) {
    const hex = t.match(/#([0-9a-f]{6}|[0-9a-f]{3})\b/);
    if (hex) {
        let h = hex[1];
        if (h.length === 3) h = h.split('').map((c) => c + c).join('');
        return { hex: '#' + h, name: '#' + h };
    }
    const words = t.split(' ');
    for (let i = 0; i < words.length; i++) {
        if (COLOR_MAP[words[i]]) return { hex: COLOR_MAP[words[i]], name: words[i] };
    }
    return null;
}

// Convierte "#f00", "#ff0000", "rojo", "red" -> "#rrggbb" (o el valor por defecto)
export function toHex(v, def) {
    if (typeof v !== 'string') return def;
    const s = v.trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(s)) return s;
    if (/^#[0-9a-f]{3}$/.test(s)) return '#' + s.slice(1).split('').map((c) => c + c).join('');
    const n = normalizeText(s);
    return COLOR_MAP[n] || def;
}
