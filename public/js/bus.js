// Puente entre módulos que no deben depender de Firebase (facilita los tests y el cambio a Socket.io).
// network.js reemplaza estas funciones cuando conecta.
import { showGlobalMessage } from './hud.js';

export const bus = {
    // Enviar un poder a los demás jugadores
    relayCast: (spec, aim) => {},
    // Mensaje global "[usuario] comando → resultado"
    broadcastMessage: (username, command, result) => {
        showGlobalMessage({ username, command, result });
    }
};
