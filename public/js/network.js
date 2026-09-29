// =====================================================================
//  RED (Firebase Firestore) - todo lo que habla con el servidor de tiempo real.
//  El resto del juego solo usa bus.js, así cambiar a Socket.io/Colyseus más adelante
//  significa reescribir ESTE archivo y nada más.
//
//  Colecciones (bajo artifacts/{APP_ID}/public/data/):
//    players  -> un documento por jugador (posición 10 Hz, color, escala)
//    messages -> mensajes globales "[usuario] orden -> resultado"
//    casts    -> poderes lanzados (los demás los ven; se borran solos a los 10 s)
// =====================================================================
import { state, player } from './state.js';
import { CONFIG } from './config.js';
import { bus } from './bus.js';
import { setNetStatus, addLog, showGlobalMessage } from './hud.js';
import { otherPlayers, createRemotePlayer, applyRemoteData, removeRemotePlayer, profile } from './avatars.js';
import { round2 } from './util.js';
import { sanitizeSpec } from './powers/schema.js';
import { castPower } from './powers/engine.js';
import { deserializeAim } from './aim.js';
import { firebaseConfig as localConfig, APP_ID } from './firebase-config.js';

const FB = 'https://www.gstatic.com/firebasejs/11.6.1/';

let fs = null;          // módulo firebase-firestore
let db = null;
let auth = null;
let appId = APP_ID;

const shownMessageIds = new Set();
const lastCastFrom = new Map();
let lastSyncTime = 0;
let lastHeartbeat = 0;
let lastCastSent = 0;
const sent = { x: 1e9, y: 1e9, z: 1e9, r: 1e9, s: 1e9 };

const playersCol = () => fs.collection(db, 'artifacts', appId, 'public', 'data', 'players');
const playerDoc = (id) => fs.doc(db, 'artifacts', appId, 'public', 'data', 'players', id);
const messagesCol = () => fs.collection(db, 'artifacts', appId, 'public', 'data', 'messages');
const castsCol = () => fs.collection(db, 'artifacts', appId, 'public', 'data', 'casts');

export function playerCount() { return otherPlayers.size + 1; }

function refreshStatus() {
    if (state.networkReady) setNetStatus('online', playerCount());
}

function goOffline(reason) {
    state.localPlayerId = 'local_' + Math.random().toString(36).substring(2, 9);
    state.networkReady = false;
    setNetStatus('offline');
    addLog([{ text: `[Red] ${reason} Jugando en modo local.`, cls: 'text-red-400' }]);
}

export async function connectNetwork() {
    try {
        const [appM, authM, fsM] = await Promise.all([
            import(FB + 'firebase-app.js'),
            import(FB + 'firebase-auth.js'),
            import(FB + 'firebase-firestore.js')
        ]);
        fs = fsM;

        // Entornos que inyectan su propia configuración tienen prioridad
        /* global __firebase_config, __app_id, __initial_auth_token */
        const cfg = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : localConfig;
        if (typeof __app_id !== 'undefined') appId = __app_id;

        const app = appM.initializeApp(cfg);
        auth = authM.getAuth(app);
        db = fs.getFirestore(app);

        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            await authM.signInWithCustomToken(auth, __initial_auth_token);
        } else {
            await authM.signInAnonymously(auth);
        }
        const user = auth.currentUser;
        state.localPlayerId = user ? user.uid : 'player_' + Math.random().toString(36).substring(2, 9);
        state.networkReady = true;
        profile.dirty = true;

        listenToPlayers();
        listenToMessages();
        listenToCasts();
        installBus();
        setNetStatus('online', playerCount());

        // Al cerrar la pestaña intentamos borrar nuestro documento (best-effort)
        window.addEventListener('pagehide', () => {
            try { fs.deleteDoc(playerDoc(state.localPlayerId)); } catch (e) { /* ignorar */ }
        });
    } catch (err) {
        console.warn('Sin conexión a la red, modo local:', err);
        goOffline('No se pudo conectar a Firebase (revisa firebase-config.js).');
    }
}

// ---------------------------------------------------------------------
//  Jugadores
// ---------------------------------------------------------------------
export function syncLocalPlayer(now) {
    if (!state.networkReady || !state.localPlayerId) return;
    if (now - lastSyncTime < CONFIG.syncIntervalMs) return;
    lastSyncTime = now;

    const p = player.position;
    const changed =
        profile.dirty ||
        Math.abs(p.x - sent.x) > 0.02 ||
        Math.abs(p.y - sent.y) > 0.02 ||
        Math.abs(p.z - sent.z) > 0.02 ||
        Math.abs(player.rotationY - sent.r) > 0.02 ||
        Math.abs(state.scaleCur - sent.s) > 0.02;

    // Si no te moviste, solo mandamos un "latido" cada tanto (ahorra escrituras)
    if (!changed && now - lastHeartbeat < CONFIG.heartbeatMs) return;

    sent.x = p.x; sent.y = p.y; sent.z = p.z; sent.r = player.rotationY; sent.s = state.scaleCur;
    lastHeartbeat = now;
    profile.dirty = false;

    fs.setDoc(playerDoc(state.localPlayerId), {
        username: state.username,
        color: state.selectedColor,
        x: round2(p.x), y: round2(p.y), z: round2(p.z),
        rotationY: round2(player.rotationY),
        scale: round2(state.scaleCur),
        lastSeen: fs.serverTimestamp()
    }, { merge: true }).catch((err) => console.error('Error al sincronizar jugador:', err));
}

function listenToPlayers() {
    fs.onSnapshot(playersCol(), (snapshot) => {
        const now = performance.now();
        snapshot.docChanges().forEach((change) => {
            const id = change.doc.id;
            if (id === state.localPlayerId) return;
            if (change.type === 'removed') { removeRemotePlayer(id); return; }
            const data = change.doc.data();
            let rp = otherPlayers.get(id);
            if (!rp) rp = createRemotePlayer(id, data);
            applyRemoteData(rp, data, now);
        });
        refreshStatus();
    }, (error) => {
        console.error('Error en listener de jugadores:', error);
        setNetStatus('offline');
    });
}

/** Lo llama el bucle principal cuando un jugador remoto expira. */
export function onPlayersChanged() { refreshStatus(); }

// ---------------------------------------------------------------------
//  Mensajes globales
// ---------------------------------------------------------------------
async function broadcastMessage(username, command, result) {
    const payload = { username, command, result };
    const ref = fs.doc(messagesCol());
    try {
        await fs.setDoc(ref, { ...payload, playerId: state.localPlayerId, ts: fs.serverTimestamp() });
    } catch (err) {
        console.warn('No se pudo enviar el mensaje global:', err);
        if (!shownMessageIds.has(ref.id)) {
            shownMessageIds.add(ref.id);
            showGlobalMessage(payload);
        }
    }
}

function listenToMessages() {
    const joinedAt = Date.now();
    const q = fs.query(messagesCol(), fs.orderBy('ts', 'desc'), fs.limit(20));
    fs.onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type !== 'added') return;
            const id = change.doc.id;
            if (shownMessageIds.has(id)) return;
            const d = change.doc.data({ serverTimestamps: 'estimate' });
            const t = (d.ts && d.ts.toMillis) ? d.ts.toMillis() : Date.now();
            // Ignora el historial anterior a tu ingreso (salvo tus propios envíos pendientes)
            if (!change.doc.metadata.hasPendingWrites && t < joinedAt - 3000) return;
            shownMessageIds.add(id);
            if (shownMessageIds.size > 200) shownMessageIds.clear();
            showGlobalMessage(d);
        });
    }, (error) => console.warn('Error en listener de mensajes:', error));
}

// ---------------------------------------------------------------------
//  Poderes lanzados (para que los demás vean tus disparos y construcciones)
// ---------------------------------------------------------------------
function relayCast(spec, aim) {
    if (!state.networkReady || !CONFIG.relayCasts) return;
    if (otherPlayers.size === 0) return;               // nadie más: no gastamos escrituras
    const now = performance.now();
    if (now - lastCastSent < CONFIG.castRelayMinIntervalMs) return;
    lastCastSent = now;

    const ref = fs.doc(castsCol());
    fs.setDoc(ref, {
        pid: state.localPlayerId,
        name: state.username,
        spec: JSON.stringify({ name: spec.name, mode: 'instant', actions: spec.actions }),
        aim: JSON.stringify(aim),
        ts: fs.serverTimestamp()
    }).then(() => {
        setTimeout(() => { try { fs.deleteDoc(ref); } catch (e) { /* ignorar */ } }, 10000);
    }).catch((err) => console.warn('No se pudo enviar el poder:', err));
}

function listenToCasts() {
    const joinedAt = Date.now();
    const q = fs.query(castsCol(), fs.orderBy('ts', 'desc'), fs.limit(20));
    fs.onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type !== 'added') return;
            const d = change.doc.data({ serverTimestamps: 'estimate' });
            if (!d || d.pid === state.localPlayerId) return;
            if (change.doc.metadata.hasPendingWrites) return;
            const t = (d.ts && d.ts.toMillis) ? d.ts.toMillis() : Date.now();
            if (t < joinedAt - 1000 || Date.now() - t > 8000) return;   // historial viejo

            // Un mismo jugador no puede lanzar más de ~8 poderes por segundo
            const nowMs = performance.now();
            if (nowMs - (lastCastFrom.get(d.pid) || 0) < 120) return;
            lastCastFrom.set(d.pid, nowMs);

            try {
                if (typeof d.spec !== 'string' || d.spec.length > 30000) return;
                const r = sanitizeSpec(JSON.parse(d.spec));   // NUNCA se ejecuta nada sin validar
                if (!r.ok) return;
                castPower(r.spec, deserializeAim(JSON.parse(d.aim)), { remote: true, owner: String(d.pid).slice(0, 40) });
            } catch (e) {
                console.warn('Poder remoto inválido:', e);
            }
        });
    }, (error) => console.warn('Error en listener de poderes:', error));
}

function installBus() {
    bus.broadcastMessage = broadcastMessage;
    bus.relayCast = relayCast;
}
