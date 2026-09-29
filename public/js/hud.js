// Todo lo que toca el DOM del HUD (logs, hotbar, estado de red, etc.).
import { $ } from './util.js';
import { state, CAMERA_MODES } from './state.js';

export function addLog(segments) {
    if (typeof document === 'undefined') return;
    if (typeof segments === 'string') segments = [{ text: segments, cls: 'text-slate-300' }];

    const build = () => {
        const line = document.createElement('div');
        segments.forEach((s) => {
            const span = document.createElement('span');
            span.className = s.cls || 'text-slate-300';
            span.textContent = s.text;   // textContent: nada de HTML inyectado por otros jugadores
            line.appendChild(span);
        });
        return line;
    };

    const logs = $('terminal-logs');
    if (logs) {
        logs.appendChild(build());
        while (logs.childElementCount > 150) logs.removeChild(logs.firstChild);
        logs.scrollTop = logs.scrollHeight;
    }

    const feed = $('message-feed');
    if (feed) {
        const feedLine = build();
        feedLine.className = 'feed-line';
        feed.appendChild(feedLine);
        while (feed.childElementCount > 6) feed.removeChild(feed.firstChild);
        setTimeout(() => feedLine.remove(), 9000);
    }
}

export function clearLogs() {
    const logs = $('terminal-logs');
    if (logs) logs.replaceChildren();
}

export function showGlobalMessage(m) {
    const name = String(m.username || 'Jugador').slice(0, 15);
    const command = String(m.command || '').slice(0, 120);
    const result = String(m.result || '').slice(0, 120);
    addLog([
        { text: '[Global] ', cls: 'text-emerald-400' },
        { text: `[${name}] `, cls: 'text-cyan-300 font-bold' },
        { text: `${command} `, cls: 'text-slate-300' },
        { text: `→ ${result}`, cls: 'text-amber-300' }
    ]);
}

export function setNetStatus(kind, playerCount = 1) {
    const el = $('net-status');
    if (!el) return;
    if (kind === 'connecting') {
        el.textContent = 'Conectando…';
        el.className = 'text-amber-400';
    } else if (kind === 'online') {
        el.textContent = `Online · ${playerCount} jugador${playerCount === 1 ? '' : 'es'}`;
        el.className = 'text-emerald-400';
    } else {
        el.textContent = 'Offline (local)';
        el.className = 'text-red-400';
    }
}

export function setFps(n) {
    const el = $('fps-counter');
    if (el) el.innerText = n;
}

export function setUserInfo(name, color) {
    const n = $('ui-username');
    if (n) n.innerText = name;
    const a = $('ui-avatar');
    if (a) a.style.backgroundColor = color;
}

export function setAvatarColor(color) {
    const a = $('ui-avatar');
    if (a) a.style.backgroundColor = color;
}

export function setBuffsTag(text) {
    const el = $('effects-tag');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('hidden', !text);
}

export function setCameraTag() {
    const tag = $('camera-mode-tag');
    if (!tag) return;
    if (state.cameraMode === CAMERA_MODES.FIRST_PERSON) {
        tag.innerText = '1ª Persona [V]';
        tag.className = 'text-cyan-400';
    } else {
        tag.innerText = '3ª Persona [V]';
        tag.className = 'text-emerald-400';
    }
}

export function updateCrosshair() {
    const c = $('crosshair');
    if (!c) return;
    const show = state.cameraMode === CAMERA_MODES.FIRST_PERSON || state.hasItem;
    c.classList.toggle('hidden', !show);
}

export function updateLockHint() {
    const el = $('lock-hint');
    if (el) el.classList.toggle('hidden', state.isPointerLocked || state.terminalOpen);
}

export function setItemTag(text) {
    const el = $('item-tag');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('hidden', !text);
}

// slots: array de 9 con { spec, ammo } | null
export function renderHotbar(slots, selected) {
    const bar = $('hotbar');
    if (!bar || typeof document === 'undefined') return;
    bar.replaceChildren();
    slots.forEach((it, i) => {
        const d = document.createElement('div');
        d.className = 'slot' + (i === selected ? ' selected' : '');
        d.dataset.slot = String(i);

        const key = document.createElement('span');
        key.className = 'slot-key';
        key.textContent = String(i + 1);
        d.appendChild(key);

        if (it) {
            const icon = document.createElement('span');
            icon.textContent = it.spec.item.icon;
            d.appendChild(icon);
            if (isFinite(it.ammo)) {
                const am = document.createElement('span');
                am.className = 'slot-ammo';
                am.textContent = String(it.ammo);
                d.appendChild(am);
            }
            const cd = document.createElement('div');
            cd.className = 'slot-cd';
            d.appendChild(cd);
            d.title = it.spec.name + (it.spec.description ? ' — ' + it.spec.description : '');
        }
        bar.appendChild(d);
    });
}

export function flashCooldown(index, ms) {
    const bar = $('hotbar');
    if (!bar || ms < 200) return;   // los cooldowns cortos no necesitan animación
    const slot = bar.children[index];
    const cd = slot && slot.querySelector('.slot-cd');
    if (!cd) return;
    cd.style.transition = 'none';
    cd.style.height = '100%';
    void cd.offsetHeight;
    cd.style.transition = `height ${ms}ms linear`;
    cd.style.height = '0';
}
