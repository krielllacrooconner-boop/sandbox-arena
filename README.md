# AI Sandbox Arena

Sandbox 3D multijugador (Three.js). Lo más importante: podés **pedir poderes nuevos escribiéndolos**
("dame una pistola láser", "hazme una pistola de hielo", "construye una fortaleza") y una IA en el
servidor los inventa combinando piezas del motor del juego. Todo lo demás (moverte, cámara, sombras
apagadas para FPS, sincronización de red) sigue como antes.

## Cómo se genera un poder nuevo

1. Escribís algo en la terminal del juego (`T` o `Enter`).
2. Primero se prueba con **reglas locales** (`public/js/powers/local-rules.js`, sin IA, gratis e
   instantáneo) — cubre todas las armas/hechizos ya conocidos y sus sinónimos en español.
3. Si no matchea ninguna regla (o el pedido trae detalles extra, tipo "pistola láser pero verde y
   más rápida"), se le pregunta a la **IA del servidor** (`POST /api/power`).
4. La IA devuelve un JSON con "acciones primitivas" (disparo, proyectil, explosión, invocar objeto,
   buff temporal, teletransporte, etc. — la lista completa está en `public/js/powers/schema.js`).
5. Ese JSON se **valida y recorta** (`sanitizeSpec`) antes de ejecutarse, así la IA nunca puede
   romper el juego (poner valores absurdos, inventar campos, etc). Si el pedido es imposible
   ("invocá un dragón que me siga"), la IA responde que no se puede y sugiere una alternativa.
6. El poder ya validado se ejecuta con el motor (`public/js/powers/engine.js`) y, si es un arma, se
   guarda en el inventario (teclas 1-9).

Sin API key configurada, el juego funciona igual pero solo con las órdenes conocidas (no rompe nada,
simplemente no hay generación libre).

## Instalación y arranque

```bash
npm install
npm start
```

Abrí `http://localhost:3000`.

## Activar la IA (poderes libres)

Necesitás una API key de **Anthropic (Claude)** o **Google (Gemini)**. Con cualquiera de las dos
alcanza — si están las dos, usa Anthropic.

```bash
# Linux/Mac
export ANTHROPIC_API_KEY="tu-key-de-anthropic"
npm start

# o con Gemini
export GEMINI_API_KEY="tu-key-de-gemini"
npm start
```

En Windows (PowerShell): `$env:ANTHROPIC_API_KEY="tu-key"` antes de `npm start`.

Variables opcionales:
- `LLM_MODEL` — pisa el modelo por defecto (`claude-haiku-4-5-20251001` o `gemini-2.5-flash`).
  Para más creatividad con más costo: `claude-sonnet-5`.
- `PORT` — puerto del servidor (por defecto 3000).

**Nunca subas tu API key a un repositorio público.** Si vas a versionarlo con git, poné estas
variables en un `.env` (no incluido acá, no hace falta ninguna librería: alcanza con exportarlas
antes de `npm start`, o usar `dotenv -e .env -- npm start` si preferís un archivo).

## Multijugador (Firebase)

El multijugador en tiempo real (ver a otros jugadores, chat global, poderes lanzados por otros) sigue
yendo directo del navegador a Firebase, en `public/js/firebase-config.js`. Mientras diga `apiKey: 'demo'`
el juego anda igual pero en modo solo-local (no ves a otros jugadores). Para activarlo: creá un
proyecto en Firebase, habilitá **Authentication → Anonymous** y **Firestore**, y pegá tu config real
ahí. Esto es independiente del servidor de IA — no hace falta tocar `server.js` para esto.

## Estructura

```
server.js                  # Express: sirve /public y expone /api/power, /api/health
server/llm.js               # cliente HTTP a Claude o Gemini (sin dependencias)
server/prompt.js            # arma el prompt del sistema a partir del esquema del juego
public/index.html
public/js/
  powers/schema.js          # esquema de "acciones primitivas" + validación/sanitizado
  powers/templates.js       # ~35 poderes ya armados (pistola láser, muro, vuelo, etc.)
  powers/local-rules.js     # frases en español -> plantilla, sin IA
  powers/engine.js          # ejecuta un poder ya validado
  powers/items.js           # inventario/hotbar de armas
  terminal.js                # conecta las 3 capas de arriba con la terminal del juego
  network.js                # Firebase (posiciones, chat, poderes de otros jugadores)
  ...resto de módulos del juego (física, colisiones, avatares, efectos, audio)
tests/                      # node --test — 33 pruebas del motor de poderes y la terminal
```

## Tests

```bash
npm test
```

## Deploy

Cualquier hosting Node sirve (Render, Railway, un VPS con PM2). Solo necesitás:
1. `npm install && npm start`.
2. Configurar `ANTHROPIC_API_KEY` o `GEMINI_API_KEY` como variable de entorno en el hosting.
3. (Opcional) Configurar Firebase real para multijugador entre gente en distintas máquinas.

Si más adelante migrás la red de Firebase a Socket.io/Colyseus (recomendado si la cuota de
Firestore te queda chica a 10Hz por jugador), el único archivo que hay que reescribir es
`public/js/network.js` — el resto del juego habla con él a través de `public/js/bus.js` y no sabe
nada de Firebase.
