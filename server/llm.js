// Cliente de IA sin dependencias (fetch nativo). Soporta Claude (Anthropic) y Gemini (Google).
// Se elige según qué API key haya en el entorno. Los modelos se pueden cambiar con LLM_MODEL.
import { buildSystemPrompt } from './prompt.js';

const DEFAULT_MODELS = {
    anthropic: 'claude-haiku-4-5-20251001',   // rápido y barato; usar claude-sonnet-5 para más creatividad
    gemini: 'gemini-3.5-flash'
};
const MAX_TOKENS = 1600;

export function getProvider(env) {
    if (env.ANTHROPIC_API_KEY) return 'anthropic';
    if (env.GEMINI_API_KEY || env.GOOGLE_API_KEY) return 'gemini';
    return null;
}

export function getModel(env) {
    const p = getProvider(env);
    return p ? (env.LLM_MODEL || DEFAULT_MODELS[p]) : null;
}

/** Devuelve el texto crudo que respondió el modelo. Lanza Error con .status si el proveedor falla. */
export async function askModel(userPrompt, env, { fetchImpl = fetch, timeoutMs = 25000, extraUser = null } = {}) {
    const provider = getProvider(env);
    if (!provider) throw Object.assign(new Error('sin proveedor'), { status: 503 });
    const model = getModel(env);
    const system = buildSystemPrompt();

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        let res, data;
        if (provider === 'anthropic') {
            const base = env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
            const messages = [{ role: 'user', content: userPrompt }];
            if (extraUser) messages.push({ role: 'assistant', content: extraUser.assistant }, { role: 'user', content: extraUser.user });
            res = await fetchImpl(`${base}/v1/messages`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
                body: JSON.stringify({ model, max_tokens: MAX_TOKENS, system, messages }),
                signal: ctrl.signal
            });
            data = await res.json().catch(() => null);
            if (!res.ok) throw Object.assign(new Error('proveedor: ' + res.status), { status: res.status, detail: data && data.error });
            return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
        }

        // gemini
        const base = env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com';
        const key = env.GEMINI_API_KEY || env.GOOGLE_API_KEY;
        const contents = [{ role: 'user', parts: [{ text: userPrompt }] }];
        if (extraUser) contents.push({ role: 'model', parts: [{ text: extraUser.assistant }] }, { role: 'user', parts: [{ text: extraUser.user }] });
        res = await fetchImpl(`${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: system }] },
                contents,
                generationConfig: { responseMimeType: 'application/json', maxOutputTokens: MAX_TOKENS }
            }),
            signal: ctrl.signal
        });
        data = await res.json().catch(() => null);
        if (!res.ok) throw Object.assign(new Error('proveedor: ' + res.status), { status: res.status, detail: data && data.error });
        const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
        return parts.map((p) => p.text || '').join('');
    } catch (e) {
        if (e && e.name === 'AbortError') throw Object.assign(new Error('timeout'), { status: 504 });
        throw e;
    } finally {
        clearTimeout(timer);
    }
}

/** Saca el primer objeto JSON de un texto (tolera ```json ... ``` y texto alrededor). */
export function extractJson(text) {
    if (typeof text !== 'string') return null;
    const t = text.replace(/```(?:json)?/gi, '').trim();
    const a = t.indexOf('{');
    const b = t.lastIndexOf('}');
    if (a < 0 || b <= a) return null;
    try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { return null; }
}