// =====================================================================
//  INTÉRPRETE LOCAL (sin IA): texto -> poder, con reglas de palabras clave.
//  Cubre lo común y funciona offline. Lo que no entienda pasa a la IA
//  (si el servidor tiene API key). Devuelve:
//    { raw, loose }     un poder crudo (aún sin sanitizar). loose=true si sobraron palabras con
//                       contenido ("pistola DE HIELO"): conviene preguntarle a la IA primero
//                       y usar este resultado solo como plan B.
//    { error }          entendió la intención pero falta un dato
//    null               no entendió
// =====================================================================
import { normalizeText, extractColor, COLOR_MAP } from '../colors.js';
import { T } from './templates.js';

function modifiers(t) {
    const color = extractColor(t);
    const numMatch = t.match(/\b(\d{1,3})\b/);
    let sizeMul = 1;
    if (/\b(gigante|enorm\w*|gran(de|des)?|masiv\w*)\b/.test(t)) sizeMul = 2;
    else if (/\b(peque\w*|mini\w*|chic\w*|diminut\w*)\b/.test(t)) sizeMul = 0.5;
    return { color: color ? color.hex : null, colorName: color ? color.name : null, n: numMatch ? parseInt(numMatch[1], 10) : null, sizeMul };
}


// Palabras que no cambian el pedido (relleno, cantidades, tamaños...)
const FILLER = new Set((
    'dame dar darme quiero quisiera necesito hazme haz hace hacer ponme pon crea crear creame invoca invocar ' +
    'construye construir constru genera generar lanza lanzar usar uso tener tenga pueda quiero ' +
    'me mi mis un una unos unas el la los las lo le de del al con y e en a por para que se ' +
    'favor porfa pls please ahora mismo ya aca aqui ahi ' +
    'gran grande grandes enorme enormes gigante gigantes pequeno pequena pequenos pequenas chico chica mini ' +
    'bloque bloques cubo cubos caja cajas metro metros ' +
    'poder poderes item items objeto objetos arma armas super muy mas bien algo cosa lluvia'
).split(/\s+/));

/** Palabras del pedido que la regla NO explica (sin contar colores, números ni relleno). */
function leftoverWords(t, matched, re) {
    const explained = new Set(matched.split(' '));
    return t.split(' ').filter((w) => {
        if (!w || explained.has(w) || FILLER.has(w)) return false;
        if (COLOR_MAP[w] || /^#?[0-9a-f]{3,6}$/.test(w) && /\d/.test(w)) return false;
        if (/^\d+$/.test(w)) return false;
        return !re.test(w);   // palabras sueltas que la propia regla reconoce (p. ej. "laser" en "pistola laser")
    });
}

// Orden IMPORTANTE: lo más específico primero.
const RULES = [
    [/\b(gravedad normal|velocidad normal|modo normal|sin efectos|quitar efectos|cancelar|cancela)\b/, () => T.clearBuffs()],
    [/\b(reinici\w*|reset\w*|resete\w*|restaura\w*|respawn\w*|volver a empezar|desde cero)\b/, () => T.reset()],
    [/\b(borra\w*|elimina\w*|limpia\w*|destruye\w*|quita\w*)\b.*\b(todo|bloques|cubos|muros?|paredes?|objetos|construccion\w*|lo que (cree|construi|hice))\b/, () => T.clearProps()],
    [/\b(sin armas|guarda\w* (las )?armas|vaciar inventario|inventario vacio)\b/, () => T.clearItems()],

    // --- ítems ---
    [/\b(jetpack|mochila|propulsor\w*)\b/, (o) => T.jetpack(o)],
    [/\b(escopeta|shotgun)\b/, (o) => T.shotgun(o)],
    [/\b(metralleta|ametralladora|smg|subfusil|automatica)\b/, (o) => T.smg(o)],
    [/\b(francotirador|sniper|rifle)\b/, (o) => T.sniper(o)],
    [/\b(lanzacohetes|bazuca|bazooka|cohetes?|rpg|misil\w*)\b/, (o) => T.rocketLauncher(o)],
    [/\b(granada\w*|bomba\w*)\b/, (o) => T.grenade(o)],
    [/\b(agujero negro|black hole)\b/, (o) => T.blackHole(o)],
    [/\b(bola de fuego|bolas de fuego|fireball|lanzallamas)\b/, (o) => T.fireball(o)],
    [/\b(pistola\w*|laser|blaster|revolver|arma)\b/, (o) => T.laserGun(o)],
    [/\b(baston de rayos|varita de rayos|rayos?|relampago\w*)\b.*\b(baston|varita|item|objeto)\b|\b(baston|varita)\b.*\b(rayos?|relampago\w*)\b/, (o) => T.lightningWand(o)],
    [/\b(dash|embestida|impulso|botas)\b/, (o) => T.dash(o)],
    [/\b(teletransport\w*|teleport\w*|blink|orbe)\b/, (o, t) => (/\b(arriba|cielo|subir|sube)\b/.test(t) ? T.blinkUp() : T.teleportOrb(o))],

    // --- construcción / ataques ---
    [/\blluvia de (cubos|cajas)\b/, (o) => T.cubeRain(o)],
    [/\b(meteor\w*|asteroid\w*|lluvia de (fuego|rocas|piedras))\b/, (o) => T.meteors(o)],
    [/\b(tormenta|tormentas)\b/, (o) => T.storm(o)],
    [/\b(muro de hielo|pared de hielo|hielo)\b/, (o) => T.iceWall(o)],
    [/\b(fortaleza|castillo|refugio|fuerte)\b/, (o) => T.fortress(o)],
    [/\b(escalera\w*|rampa\w*)\b/, (o) => T.stairs(o)],
    [/\b(puente\w*|plataforma\w*)\b/, (o) => T.bridge(o)],
    [/\b(torre\w*|pilar\w*|columna\w*)\b/, (o) => T.tower(o)],
    [/\b(muro\w*|pared\w*|barricada\w*|escudo\w*)\b/, (o) => T.wall(o)],
    [/\b(constructor|bloques|ladrillos?|construir)\b/, (o) => T.blockBuilder(o)],
    [/\b(cubos?|cajas?)\b/, (o) => T.cubes(o)],
    [/\b(explota\w*|explosion\w*|boom|detona\w*)\b/, (o) => T.explosion(o)],

    // --- estado del jugador ---
    [/\b(gravedad (invertida|inversa|negativa)|antigravedad)\b/, () => T.invertedGravity()],
    [/\b(volar|volando|vuelo|vuela|vuelame|volador\w*|fly\w*|levita\w*|flota\w*)\b/, () => T.fly()],
    [/\b(super ?salto|salto (alto|doble|potente)|saltar mas|salta mas alto)\b/, () => T.superJump()],
    [/\b(rapid\w*|veloz|veloc\w*|speed\w*|fast|turbo|corre mas|correr mas)\b/, () => T.fast()],
    [/\b(gigante|enorme|titan\w*)\b/, () => T.giant()],
    [/\b(enano|pequeno|diminuto|hormiga|chiquito)\b/, () => T.tiny()],

    // --- ambiente ---
    [/\b(atardecer|ocaso|sunset)\b/, () => T.sunset()],
    [/\b(niebla|neblina)\b/, () => T.fog()],
    [/\b(noche|oscur\w*|anochece\w*)\b/, () => T.night()],
    [/\b(dia|amanece\w*|soleado|luz del dia)\b/, () => T.day()]
];

export function matchLocal(input) {
    const t = normalizeText(input);
    if (!t) return null;
    const mods = modifiers(t);

    // Cambiar color (antes de todo lo demás si hay intención explícita)
    const colorIntent = /\b(color|colores|colorea\w*|pint\w*|tine)\b/.test(t) || (mods.color && /\bcambi\w*\b/.test(t));
    if (colorIntent && !/\b(pistola|arma|laser|escopeta|muro|pared|cubos?|bloques?)\b/.test(t)) {
        if (!mods.color) return { error: 'Indica un color. Ej: "cambiar color rojo" o "cambiar color #ff8800".' };
        return { raw: T.color(mods) };
    }

    for (const [re, build] of RULES) {
        const m = re.exec(t);
        if (m) {
            const extra = leftoverWords(t, m[0], re);
            return { raw: build(mods, t), loose: extra.length > 0, extra };
        }
    }

    // "hazme rojo", "ponme azul"
    if (mods.color && /\b(hazme|ponme|quiero ser|convierteme|transformame)\b/.test(t)) {
        return { raw: T.color(mods) };
    }

    if (/\b(gravedad|gravity)\b/.test(t)) {
        if (/\b(baja|bajar|bajo|poca|poco|menos|menor|reduc\w*|lunar|luna|moon|low|ligera|liviana|liviano)\b/.test(t)) return { raw: T.lowGravity() };
        return { error: 'No entendí qué hacer con la gravedad. Prueba "gravedad baja", "gravedad invertida" o "gravedad normal".' };
    }
    if (/\b(lunar|luna|moon)\b/.test(t)) return { raw: T.lowGravity() };

    return null;
}
