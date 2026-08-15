# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es esto

PWA "El juego de las camisetas" (v0.5) — sistema de productividad personal gamificado. React + Vite + Tailwind, sin backend: todo el estado vive en `localStorage` del navegador. Export/import manual en JSON o PNG (ver codec) es la única forma de mover datos entre dispositivos.

## Documentos de doctrina (`docs/`)

Este archivo dice cómo está hecho el repo. **Por qué está hecho así vive en `docs/`, y hay que leerlo antes de tocar producto:**

- **`docs/brief.md`** — las reglas duras (nada de rachas, el app no cuenta ausencias, nada sale del dispositivo), el vocabulario y las restricciones técnicas que parecen simplificables y no lo son. Leerlo antes de tocar ecos, cierres, textos o cualquier cosa que le hable al usuario.
- **`docs/rituales.md`** — qué pretende cada uno de los tres rituales (diario, semanal, mensual) y por qué. Están en rediseño: el código de hoy es la versión anterior.
- **`docs/decisiones.md`** — qué ya se pensó y se cerró, con fecha y razón. Consultarlo antes de proponer un cambio de comportamiento: casi todo lo de ahí tiene una alternativa que parece mejor a primera vista y ya fue descartada.
- **`docs/vision.md`** — de dónde viene la idea y por qué el modelo de datos es como es.
- **`docs/partner-checkins.md`** — plan de una función no construida.

Si una funcionalidad razonable choca con una regla de `docs/brief.md`, la funcionalidad está mal, no la regla.

## Comandos

```bash
npm install
npm run dev       # localhost:5173
npm run build     # → dist/
npm run preview
npm test          # node --test sobre tests/*.test.mjs (Node 22+)
```

No hay linter configurado. Los tests corren sin dependencias, solo con el runner de Node.

## Arquitectura

- **`src/estado.js`** — la capa de estado: llaves de localStorage, `emptyState`/`loadState`/`saveState`, `migrate()` y `aplicarMovida()` (el único camino por el que una camiseta cambia de sitio). Vive fuera de `App.jsx` para que las migraciones se puedan correr desde Node; es lo que prueba `tests/estado.test.mjs`.
- **`src/App.jsx`** (~3700 líneas) — el resto de la app: ~40 componentes y los handlers, en un solo archivo. No hay Error Boundary.
- **`src/codec/index.js`** — codec propio para exportar una "camiseta" como imagen PNG (datos ocultos en la silueta de la camiseta, con Reed-Solomon) o JSON. Dos modos: `molde` (compartir diseño entre usuarios) y `snapshot` (sync personal entre dispositivos). Formatos legacy 0x04/0x05 se siguen leyendo para siempre; el encoder actual solo emite 0x08.
- **`src/ecos/`** — motor de "ecos": mensajes contextuales que el app le muestra al usuario según el estado (no son notificaciones ni rachas). `index.js` tiene las fuentes (funciones puras `(state, ctx) -> eco | null`), `textos.js` los textos. También vive ahí `calcularSeñales`, lo que el costurero muestra de cada camiseta, porque obedece la misma regla: el app habla de identidades, nunca de asistencia.
- **`src/observador/`** — las comprobaciones del ritual mensual, mismo patrón que los ecos: funciones puras que devuelven un hallazgo o null, se calculan todas y **se presenta una sola**, convertida en pregunta. Nunca un tablero. La lista de lo que puede y no puede mirar está en `docs/rituales.md` §5 y la protege `tests/observador.test.mjs`.
- **`src/cita.js`** — genera archivos `.ics` para que el usuario agende rituales en su calendario del teléfono. Deliberadamente sin recurrencia ni seguimiento (ver comentario al inicio del archivo).
- **`src/sw.js`** — service worker: network-first para HTML, cache-first para assets.

## Modelo de datos clave

El estado (`STATE_KEY` en localStorage, `version: 10`) tiene `camisetas` (cada una con `misiones`, `milestones`, ubicación en el clóset), `sesiones`, `eventos`, `movimientos`, `visitas`, `cerros`. El "clóset" es un mueble con 5 `GANCHOS` fijos (a propósito, no configurable) + `cerros` (pilas) ilimitados; cada camiseta está en exactamente una ubicación (`puesta`, `gancho`, o `cerro`).

Migraciones (`migrate()` en `src/estado.js`) son acumulativas por versión — al tocar el modelo de datos, sumar un paso de migración ahí, no romper los anteriores, y sumarle un caso a `tests/estado.test.mjs` que pruebe que no se pierde nada. Antes de migrar de v7, v8 y v10 el app congela un backup crudo en `localStorage` (`state:pre-v7`, `state:pre-v8`, `state:pre-v10`) — nunca sobrescribir esas keys. Solo llevan respaldo los pasos que reescriben o borran datos existentes; los que solo añaden campos, no.

Desde v10 **`puesta` significa la atención de un día**, no una identidad activa: lo escoge el ritual diario. El evento `frontera_puesta_diaria` marca cuándo cambió ese significado — cualquier cálculo que cruce esa fecha está leyendo dos cosas distintas bajo el mismo nombre. La camiseta ya no tiene `archived_at` (la misión sí).

## Archivos que no son la fuente de verdad

`src/AppBackup.jsx` y `src/codec/indexBackup.js` son versiones viejas guardadas dentro del repo, no se importan desde ningún lado activo. No editar pensando que son el código real.
