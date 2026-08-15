# Visión — El juego de las camisetas

Contexto de producto: por qué existe el app y por qué el modelo de datos es como es. No es documentación técnica (eso está en `CLAUDE.md`); esto es la intención detrás del diseño, para no perderla en refactors futuros.

Origen: `CONTEXTOCamisetas.md` (fuera del repo). Este documento es la parte de esa idea original que sigue viva en el código hoy, ya actualizada a como evolucionó.

## La idea

En lugar de organizar la vida con tareas o metas tradicionales, el sistema usa identidades activas ("camisetas") que representan dimensiones de la vida de una persona. Cada acción diaria es una misión; cada misión da puntos.

La pregunta que el app responde no es "¿qué tengo que hacer hoy?" sino **"¿qué camiseta quiero usar hoy?"**. El progreso no se mide solo en resultados, sino en coherencia, identidad y presencia.

Esto está implementado literalmente en el modelo del clóset: cada camiseta está en exactamente una ubicación (`puesta`, `gancho`, o `cerro`), no es una lista de tareas pendientes.

## Misión → puntos → desbloqueo

Mecánica base del doc original, viva y luego extendida en el código:
- Las misiones dan puntos (`puntos_base` × multiplicador).
- Los puntos permiten desbloquear camisetas nuevas (`precio` en el catálogo).
- Extensión que el doc original no anticipaba: modelo de mini-mercado — cada camiseta tiene `creador_id` y `origen` (`propia` vs `comprada`), pensado para que camisetas se puedan compartir/crear entre usuarios (ver el codec de export/import en `src/codec/`).

## Por qué existen `forma` y `tonos`

El doc original clasificaba las misiones en tipos: rápida, hábito, profunda, física, emocional, creativa, estratégica. Esa taxonomía es el ancestro directo de los dos campos que tiene hoy cada misión en el código:
- `forma`: `facil` (rápida), `dificil` (profunda), `recurrente` (hábito) — cuánto esfuerzo/cadencia tiene.
- `tonos`: `fisica`, `emocional`, `creativa`, `estrategica`, `profunda` — qué dimensión de la persona activa (no son excluyentes entre sí).

Si el modelo de puntuación se toca, vale la pena mantener esta distinción: `forma` mide esfuerzo, `tonos` mide dimensión.

## Milestones

El doc hablaba de 3 objetivos mensuales fijos por camiseta. En el código evolucionó a algo más libre: cada camiseta puede tener cualquier número de milestones, cada uno con un `regalo` asociado (una recompensa que el usuario mismo define, ej. "Ve a cine 🎬"). La idea de fondo se mantiene — progreso real, no solo actividad — pero sin el molde rígido de "3 por mes".

## El libro

Visión original: convertir el sistema en un libro con ejercicios, donde otras personas puedan diseñar sus propias camisetas y construir su propio juego de vida. Inspiración: estilo reflexivo tipo Derek Sivers, mezcla de filosofía, juego y sistema práctico.

Sigue en pie como proyecto aparte (carpeta `libro/`, fuera de este repo).

## Abierto / pendiente

- **Niveles y "nuevas dinámicas"**: el doc original mencionaba que los puntos permiten "subir de nivel" y "activar nuevas dinámicas", además de desbloquear camisetas. Ninguna de las dos cosas existe hoy en el código — no está claro si se descartó a propósito o quedó pendiente.
- **Camisetas emergentes**: insight del doc original — "algunas camisetas no se eligen, emergen" (ej. salir a caminar activa Atleta sin que el usuario lo decida explícitamente). No hay ninguna mecánica que detecte esto automáticamente hoy. Sigue siendo una idea de diseño válida, no descartada.

## Nota sobre el catálogo

El doc original listaba 5 camisetas activas de ejemplo (Capitán, Esposo, Millonario, Políglota, Atleta) atadas a la vida del autor. Esas nunca fueron el catálogo público del app — el catálogo real (`CATALOGO` en `src/App.jsx`) es genérico y universal ("Mi primera camiseta", Curiosidad, Creatividad, Sueño). Las camisetas personales del doc viven como datos del usuario (su propio backup), no como código.
