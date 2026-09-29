// =====================================================================
//  TERMINAL
//  Flujo de una orden en lenguaje natural:
//    1) reglas locales (instantáneo, gratis, offline)         -> powers/local-rules.js
//    2) si no la entiende (o es "floja": trae detalles extra) -> IA en el servidor (/api/power)
//    3) lo que devuelva se VALIDA con sanitizeSpec() antes de ejecutarse
//    4) se ejecuta con el motor (o se guarda como ítem) y se avisa a todos
// =====================================================================
import { $ } from './util.js';
import { state, keys, player } from './state.js';
import { CONFIG } from './config.js';
import { addLog, clearLogs, updateLockHint } from './hud.js';
import { requestLock } from './lock.js';
import { bus } from './bus.js';
import { otherPlayers } from './avatars.js';
import { normalizeText } from './colors.js';
import * as col from './colliders.js';
import { toggleSound } from './audio.js';
import { matchLocal } from './powers/local-rules.js';
import { sanitizeSpec } from './powers/schema.js';
import { applyPower } from './powers/apply.js';
import { listItems } from './powers/items.js';
import { pendingTimers } from './powers/engine.js';

// ---------------------------------------------------------------------
//  Abrir / cerrar
// ---------------------------------------------------------------------
export function openTerminal() {
    if (state.terminalOpen) return;
    state.terminalOpen = true;
    for (const k in keys) keys[k] = false;
    if (document.pointerLockElement) document.exitPointerLock();
    $('terminal-container').classList.remove('hidden');
    $('message-feed').classList.add('hidden');
    $('hotbar-wrap').classList.add('hidden');
    updateLockHint();
    const input = $('terminal-input');
    input.value = '';
    input.focus();
    const logs = $('terminal-logs');
    logs.scrollTop = logs.scrollHeight;
}

export function closeTerminal(relock) {
    if (!state.terminalOpen) return;
    state.terminalOpen = false;
    $('terminal-input').blur();
    $('terminal-container').classList.add('hidden');
    $('message-feed').classList.remove('hidden');
    $('hotbar-wrap').classList.remove('hidden');
    updateLockHint();
    if (relock) requestLock();
}

export function setupTerminalUI() {
    $('terminal-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const text = $('terminal-input').value.trim();
        $('terminal-input').value = '';
        closeTerminal(true);
        if (text) handleTerminalInput(text);
    });
}

// ---------------------------------------------------------------------
//  IA (servidor)
// ---------------------------------------------------------------------
const llmCache = new Map();     // texto normalizado -> poder crudo (evita repetir llamadas)
let llmBusy = false;

/** Pregunta al servidor si tiene IA configurada. Se llama una vez al iniciar. */
export async function checkLLM() {
    if (CONFIG.llmMode === 'local') { state.llmAvailable = false; return; }
    try {
        const res = await fetch(CONFIG.llmEndpoint.replace(/\/power$/, '/health'), { cache: 'no-store' });
        const data = await res.json();
        state.llmAvailable = !!(data && data.llm);
        addLog(state.llmAvailable
            ? [{ text: `[IA] Conectada (${data.llm}). Pedí lo que quieras: "dame una espada de fuego", "hazme invisible"…`, cls: 'text-fuchsia-300' }]
            : [{ text: '[IA] El servidor no tiene IA configurada: funcionan solo las órdenes conocidas (ver /help).', cls: 'text-slate-400' }]);
    } catch (e) {
        state.llmAvailable = false;
        addLog([{ text: '[IA] Sin servidor de IA (¿abriste la página con "npm start"?). Funcionan las órdenes conocidas.', cls: 'text-slate-400' }]);
    }
}

/** Devuelve { raw } | { unsupported, suggestion } | { error }. */
async function askLLM(text) {
    const key = normalizeText(text);
    if (llmCache.has(key)) return { raw: llmCache.get(key), cached: true };

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), CONFIG.llmTimeoutMs);
    try {
        const res = await fetch(CONFIG.llmEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: text }),
            signal: ctrl.signal
        });
        let data = null;
        try { data = await res.json(); } catch (e) { /* respuesta no JSON */ }

        if (!res.ok) {
            if (res.status === 503) return { error: 'La IA no está configurada en el servidor (falta la API key).', fatal: true };
            if (res.status === 429) return { error: 'Muchos pedidos seguidos a la IA. Esperá unos segundos.' };
            return { error: (data && data.error) || `La IA respondió con error (${res.status}).` };
        }
        if (data && data.unsupported) return { unsupported: data.unsupported, suggestion: data.suggestion || '' };
        if (data && data.power) {
            llmCache.set(key, data.power);
            if (llmCache.size > 60) llmCache.delete(llmCache.keys().next().value);
            return { raw: data.power };
        }
        return { error: 'La IA no devolvió un poder válido.' };
    } catch (e) {
        if (e && e.name === 'AbortError') return { error: 'La IA tardó demasiado en responder.' };
        return { error: 'No se pudo contactar a la IA.', fatal: true };
    } finally {
        clearTimeout(timer);
    }
}

// ---------------------------------------------------------------------
//  Órdenes
// ---------------------------------------------------------------------
let lastCommandAt = 0;

function say(text, cls = 'text-slate-300') { addLog([{ text, cls }]); }

/** Valida y ejecuta un poder crudo. Devuelve el texto del resultado, o null si no se pudo. */
function runRaw(raw, source) {
    const r = sanitizeSpec(raw);
    if (r.unsupported) {
        say(`[IA] No se puede hacer eso: ${r.unsupported}`, 'text-amber-300');
        if (r.suggestion) say(`[IA] Sugerencia: ${r.suggestion}`, 'text-slate-400');
        return null;
    }
    if (!r.ok) {
        say(`[Terminal] El poder no es válido (${r.errors.slice(0, 2).join('; ')}).`, 'text-red-400');
        return null;
    }
    const result = applyPower(r.spec);
    if (source === 'ia') {
        say(`[IA] ${r.spec.name}${r.spec.description ? ': ' + r.spec.description : ''}`, 'text-fuchsia-300');
    }
    return result;
}

export async function handleTerminalInput(text) {
    if (text.startsWith('/')) { handleSlashCommand(text); return; }

    // Antispam básico
    const nowMs = performance.now();
    if (nowMs - lastCommandAt < 500) return;
    lastCommandAt = nowMs;

    addLog([
        { text: '> ', cls: 'text-emerald-400 font-bold' },
        { text: `[${state.username}]: ${text}`, cls: 'text-cyan-300 font-bold' }
    ]);

    const mode = CONFIG.llmMode;   // 'auto' | 'local' | 'ia'
    const local = mode === 'ia' ? null : matchLocal(text);

    if (local && local.error) { say(`[Terminal] ${local.error}`, 'text-red-400'); return; }

    // Entendido sin dudas -> directo
    if (local && local.raw && !local.loose) {
        const result = runRaw(local.raw, 'local');
        if (result) bus.broadcastMessage(state.username, text, result);
        return;
    }

    // ¿Vale la pena preguntarle a la IA?
    const canAsk = mode !== 'local' && state.llmAvailable !== false;
    if (!canAsk) {
        if (local && local.raw) {   // sin IA: mejor una versión estándar que nada
            say('[Terminal] Sin IA disponible: uso la versión estándar de ese poder.', 'text-slate-400');
            const result = runRaw(local.raw, 'local');
            if (result) bus.broadcastMessage(state.username, text, result);
        } else {
            say('[Terminal] No entendí esa orden. Escribe /help para ver ejemplos.', 'text-red-400');
        }
        return;
    }

    if (llmBusy) { say('[IA] Todavía estoy pensando en tu pedido anterior…', 'text-amber-300'); return; }
    llmBusy = true;
    say('[IA] Pensando…', 'text-fuchsia-300');
    let ai;
    try { ai = await askLLM(text); } finally { llmBusy = false; }

    if (ai.fatal) state.llmAvailable = false;

    if (ai.raw) {
        const result = runRaw(ai.raw, 'ia');
        if (result) bus.broadcastMessage(state.username, text, result + ' 🤖');
        return;
    }
    if (ai.unsupported) {
        say(`[IA] No se puede hacer eso: ${ai.unsupported}`, 'text-amber-300');
        if (ai.suggestion) say(`[IA] Sugerencia: ${ai.suggestion}`, 'text-slate-400');
        return;
    }

    // La IA falló: si había una versión local aproximada, se usa
    say(`[IA] ${ai.error}`, 'text-red-400');
    if (local && local.raw) {
        say('[Terminal] Uso la versión estándar.', 'text-slate-400');
        const result = runRaw(local.raw, 'local');
        if (result) bus.broadcastMessage(state.username, text, result);
    }
}

// ---------------------------------------------------------------------
//  Comandos con /
// ---------------------------------------------------------------------
function handleSlashCommand(text) {
    const parts = text.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();

    switch (cmd) {
        case '/help':
            say('[Ayuda] Escribí lo que quieras en lenguaje natural:', 'text-amber-300');
            say(' · Armas: "dame una pistola láser", escopeta, francotirador, lanzacohetes, granada, bola de fuego, agujero negro…', 'text-emerald-400');
            say(' · Construir: "muro", "torre de 15 bloques", "escalera", "puente", "fortaleza", "constructor de bloques"', 'text-emerald-400');
            say(' · Hechizos: "lluvia de meteoritos", "tormenta eléctrica", "explosión", "lluvia de cubos"', 'text-emerald-400');
            say(' · Tú: "hazme volar / rápido / gigante / diminuto", "gravedad baja", "súper salto", "cambiar color rojo"', 'text-emerald-400');
            say(' · Mundo: "que sea de noche", "atardecer", "niebla" · limpiar: "borra todo", "reiniciar"', 'text-emerald-400');
            say(state.llmAvailable
                ? ' · IA activa: pedí cualquier cosa ("dame una espada de fuego", "hazme invisible"…)'
                : ' · (Con IA en el servidor podés pedir cosas nuevas; ver README)', 'text-fuchsia-300');
            say(' · Ítems: teclas 1-9 o rueda para elegir, clic para usar, Q para guardar', 'text-slate-400');
            say(' · /items · /players · /tp x z · /sound · /json {poder} · /clear', 'text-slate-400');
            break;

        case '/clear':
            clearLogs();
            break;

        case '/players': {
            const names = [state.username + ' (vos)'];
            otherPlayers.forEach((rp) => names.push(rp.name));
            say(`[Sistema] Jugadores (${names.length}): ${names.join(', ')}`, 'text-emerald-400');
            break;
        }

        case '/items': {
            const l = listItems();
            say(l.length ? `[Ítems] ${l.join(' · ')}` : '[Ítems] No tenés ítems. Pedí uno: "dame una pistola láser".', 'text-emerald-400');
            break;
        }

        case '/sound':
            say(`[Sistema] Sonido ${toggleSound() ? 'activado' : 'desactivado'}.`, 'text-emerald-400');
            break;

        case '/tp': {
            if (parts.length >= 3 && isFinite(parseFloat(parts[1])) && isFinite(parseFloat(parts[2]))) {
                const lim = CONFIG.worldHalf - 1;
                const x = Math.max(-lim, Math.min(lim, parseFloat(parts[1])));
                const z = Math.max(-lim, Math.min(lim, parseFloat(parts[2])));
                player.position.set(x, col.groundHeightAt(x, z, 1000) + 0.5, z);
                player.velocity.set(0, 0, 0);
                say(`[Sistema] Teletransportado a (${x}, ${z})`, 'text-emerald-400');
            } else {
                say('[Sistema] Uso correcto: /tp [x] [z]', 'text-red-400');
            }
            break;
        }

        case '/json': {
            // Herramienta para probar poderes a mano: /json {"name":"Test","actions":[{"do":"explosion"}]}
            const src = text.slice(5).trim();
            try {
                const result = runRaw(JSON.parse(src), 'json');
                if (result) bus.broadcastMessage(state.username, '/json', result);
            } catch (e) {
                say('[Sistema] JSON inválido. Ej: /json {"name":"Boom","actions":[{"do":"explosion","radius":8,"at":"aim"}]}', 'text-red-400');
            }
            break;
        }

        case '/debug':
            say(`[Debug] timers=${pendingTimers()} ia=${state.llmAvailable} modo=${CONFIG.llmMode}`, 'text-slate-400');
            break;

        default:
            say(`[Sistema] Comando desconocido: ${cmd}. Escribe /help.`, 'text-red-400');
    }
}
