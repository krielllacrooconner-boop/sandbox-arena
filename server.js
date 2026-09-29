// =====================================================================
//  SERVIDOR
//  - Sirve el juego (carpeta /public) como archivos estáticos.
//  - Expone la API que arma los poderes nuevos con IA:
//      GET  /api/health  -> le dice al cliente si hay IA configurada
//      POST /api/power   -> { prompt: "dame una pistola láser" } -> { power: {...} } | { unsupported, suggestion } | error
//  El multijugador (posiciones, chat, poderes lanzados) sigue yendo por Firebase
//  directo desde el navegador (public/js/network.js) — este servidor no lo toca.
// =====================================================================
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getProvider, getModel, askModel, extractJson } from './server/llm.js';
import { sanitizeSpec } from './public/js/powers/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Carga un archivo .env si existe (sin dependencias extra). No pisa variables
// que ya estén puestas en el entorno (ej. si las exportaste a mano).
(function loadDotEnv() {
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) return;
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
        const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
        if (!m) continue;
        const key = m[1];
        if (process.env[key] !== undefined) continue;
        let val = m[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
        }
        process.env[key] = val;
    }
})();

const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------
//  Antiabuso simple: límite de pedidos por IP (no hace falta nada externo)
// ---------------------------------------------------------------------
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const hits = new Map(); // ip -> [timestamps]

function rateLimited(ip) {
    const now = Date.now();
    const arr = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
    arr.push(now);
    hits.set(ip, arr);
    return arr.length > MAX_PER_WINDOW;
}
setInterval(() => {
    const now = Date.now();
    for (const [ip, arr] of hits) {
        const alive = arr.filter((t) => now - t < WINDOW_MS);
        if (alive.length) hits.set(ip, alive); else hits.delete(ip);
    }
}, WINDOW_MS).unref();

// ---------------------------------------------------------------------
//  Salud: le dice al cliente si hay una IA configurada y cuál
// ---------------------------------------------------------------------
app.get('/api/health', (req, res) => {
    const provider = getProvider(process.env);
    res.json({ ok: true, llm: provider ? `${provider}:${getModel(process.env)}` : null });
});

// ---------------------------------------------------------------------
//  Generación de poderes
// ---------------------------------------------------------------------
app.post('/api/power', async (req, res) => {
    const ip = req.ip || req.socket.remoteAddress || 'anon';
    if (rateLimited(ip)) return res.status(429).json({ error: 'Demasiados pedidos, esperá un poco.' });

    const prompt = req.body && typeof req.body.prompt === 'string' ? req.body.prompt.trim() : '';
    if (!prompt) return res.status(400).json({ error: 'Falta "prompt".' });
    if (prompt.length > 300) return res.status(400).json({ error: 'Pedido demasiado largo (máx 300 caracteres).' });

    if (!getProvider(process.env)) {
        return res.status(503).json({ error: 'El servidor no tiene una API key de IA configurada (ANTHROPIC_API_KEY o GEMINI_API_KEY).' });
    }

    try {
        const text = await askModel(prompt, process.env, { timeoutMs: 25000 });
        const json = extractJson(text);
        if (!json) return res.status(502).json({ error: 'La IA no devolvió JSON válido.', debug: { rawText: text ? text.slice(0, 500) : null } });

        if (json.unsupported) {
            return res.json({ unsupported: String(json.unsupported).slice(0, 200), suggestion: String(json.suggestion || '').slice(0, 200) });
        }

        // Se valida server-side también (defensa en profundidad); el cliente lo vuelve a validar igual.
        const check = sanitizeSpec(json);
        if (check.unsupported) return res.json({ unsupported: check.unsupported, suggestion: check.suggestion || '' });
        if (!check.ok) return res.status(502).json({ error: 'La IA devolvió un poder inválido: ' + check.errors.slice(0, 2).join('; ') });

        res.json({ power: json });
    } catch (e) {
        const status = e && e.status && Number.isInteger(e.status) ? e.status : 500;
        console.error('[api/power]', status, e && e.message, e && e.detail);
        // Debug temporal: le mando al navegador el motivo real para diagnosticar más rápido.
        const debug = { providerStatus: status, providerMessage: (e && e.message) || null, providerDetail: (e && e.detail) || null };
        if (status === 401 || status === 403) return res.status(503).json({ error: 'La API key de IA configurada no es válida.', debug });
        if (status === 404) return res.status(502).json({ error: 'El modelo de IA configurado ya no existe (puede haber sido dado de baja por el proveedor). Revisá LLM_MODEL o actualizá el server.', debug });
        if (status === 429) return res.status(429).json({ error: 'El proveedor de IA está saturado, esperá un poco.', debug });
        if (status === 504) return res.status(504).json({ error: 'La IA tardó demasiado en responder.', debug });
        res.status(500).json({ error: 'Error consultando a la IA.', debug });
    }
});

// Cualquier otra ruta no-API: servir index.html (útil si en el futuro hay rutas del lado cliente)
app.get(/^(?!\/api\/).*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    const provider = getProvider(process.env);
    console.log(`AI Sandbox Arena escuchando en http://localhost:${PORT}`);
    console.log(provider ? `IA: ${provider} (${getModel(process.env)})` : 'IA: no configurada (definí ANTHROPIC_API_KEY o GEMINI_API_KEY en el entorno)');
});
