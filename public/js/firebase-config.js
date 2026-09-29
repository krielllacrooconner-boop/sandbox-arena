// =====================================================================
//  CONFIGURACIÓN DE FIREBASE
//  Pegá acá tu firebaseConfig real (Consola de Firebase -> Configuración del proyecto -> Tus apps -> Web).
//  Mientras diga "demo", el juego funciona en modo local (sin multijugador).
//  Además hay que habilitar "Authentication -> Anonymous" y crear la base Firestore.
// =====================================================================
export const firebaseConfig = {
    apiKey: 'demo',
    authDomain: 'demo.firebaseapp.com',
    projectId: 'demo',
    storageBucket: 'demo.appspot.com',
    messagingSenderId: '123456789',
    appId: '1:123456789:web:demo'
};

export const APP_ID = 'ai-sandbox-arena';
