// Punto único para "usar" un poder ya saneado: decide si se ejecuta ahora o se guarda como ítem.
import { CONFIG } from '../config.js';
import { getAim, serializeAim } from '../aim.js';
import { bus } from '../bus.js';
import { castPower } from './engine.js';
import { giveItem, SLOT_COUNT } from './items.js';

/** Devuelve un texto corto con lo que pasó (para el mensaje global). */
export function applyPower(spec) {
    if (spec.mode === 'item') {
        const idx = giveItem(spec);
        const it = spec.item;
        const extra = [];
        if (it.ammo > 0) extra.push(`${it.ammo} de munición`);
        if (it.auto) extra.push('automática');
        return `Obtuvo ${it.icon} ${spec.name} (slot ${Math.min(idx + 1, SLOT_COUNT)}${extra.length ? ', ' + extra.join(', ') : ''})`;
    }

    const aim = getAim();
    castPower(spec, aim, { owner: 'me' });
    if (CONFIG.relayCasts) bus.relayCast(spec, serializeAim(aim));
    return `Usó ${spec.name}`;
}
