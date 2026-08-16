# Partner por camiseta — plan

Estado: **v1 construida el 16 de agosto de 2026; el resto sigue en diseño.**

## Lo que YA está (v1)

Deliberadamente más chica que el plan de abajo, para poder probarla sin construir maquinaria:

- Campo `partner: { activo, nombre, tipo: null }` en la camiseta (migración v11).
- Sección «con quién la revisas» en `EditCamiseta`.
- Botón «revisar con [nombre]» en la ficha, visible solo si hay partner: abre el share sheet con un mensaje fijo — *«Quisiera revisar contigo los avances con la camiseta X»* — y ahí se acaba. El destinatario se escoge en WhatsApp.

## Lo que NO está, y es a propósito

- **Ningún eco** de recordatorio. Todavía no se sabe si el recordatorio hace falta o estorba; se decide después de usarlo.
- **Ningún evento ni sesión.** El app no registra que mandaste el mensaje.
- **Ningún reporte de avances.** Es la pieza más delicada del plan (ver el final de este documento) y no se construye hasta saber cómo se siente lo demás.

Lo que sigue es el plan completo, tal como se pensó antes de construir la v1. Sirve para no volver a razonarlo desde cero.

## Lo que se pidió

Cada camiseta puede tener un "partner": una persona. Por ahora es una variable binaria (¿tiene o no?), con espacio para más adelante ponerle un tipo. El partner es solo para el usuario — el app no necesita saber quién es, y si se guarda un nombre es solo para que el propio eco lo pueda usar. **No va en el codec**: no viaja cuando la camiseta se comparte (export a PNG/JSON, modo `molde`). Se usa únicamente para: (1) los check-ins normales del app, y (2) un eco semanal que le recuerde al usuario hacer check-in con esa persona sobre esa camiseta.

## Cómo encaja en lo que ya existe

Miré el código antes de proponer nada, porque este app ya tiene toda la maquinaria que esta idea necesita — no hay que inventar un sistema nuevo, hay que enchufarse al que ya está:

- **El codec ya protege esto por diseño, no hay que blindarlo aparte.** `encodeCamisetaToJSON` y los encoders de PNG (`src/codec/index.js`) arman el objeto que exportan campo por campo (`nombre`, `emoji`, `esencia`, `arco`, `origen`, `creador_id`, `origen_camiseta_id`, `misiones`, `milestones`) — es una lista blanca, no un spread del objeto completo. Mientras `partner` no se agregue a esa lista, es estructuralmente imposible que se filtre al compartir. Ninguna otra protección es necesaria.
- **El motor de ecos (`src/ecos/index.js`) ya es exactamente el mecanismo que se necesita** para el recordatorio semanal: una fuente es una función pura `(state, ctx) → eco | null`, se muestra un eco a la vez, y descartarlo lo silencia por su propia cadencia (no genérico). Eso es literalmente "recordatorio semanal, no insistente" ya construido.
- **`fuenteAgendar('semanal', ...)`** es el patrón más cercano a lo que hace falta: mide si ya pasó el vencimiento desde la última vez, sin contar ni reprochar días. La fuente nueva de partner es una variación de esa misma idea, pero *por camiseta* en lugar de global.
- **El sistema de `cita.js`** (agendar en el calendario del teléfono, `.ics`) es una pieza aparte, opcional — hoy solo se usa para semanal/mensual global. Si el check-in de partner también debe poder agendarse en el calendario, se reutiliza tal cual; si no, el eco puede resolverse dentro del app (como hace `fuenteCerrarDia`, que no pasa por el calendario). Ver decisión abierta más abajo.

## Modelo de datos propuesto

En cada camiseta, un campo nuevo:

```js
partner: {
  activo: boolean,       // la variable binaria que pediste
  nombre: string | null, // opcional, para personalizar el texto del eco
  tipo: null,             // reservado, sin usar todavía — el gancho para el futuro que mencionaste
}
```

`null`/ausente en camisetas viejas se trata como "sin partner" (mismo patrón que `arco: null` hoy). Migración: un paso más en `migrate()` (siguiente versión, hoy en v9) que le pone `partner: null` a toda camiseta que no lo tenga — mismo mecanismo que ya usa el resto del historial de versiones en `src/estado.js`.

**Recomendación (no es la única opción):** meter `nombre` desde ya, aunque hoy no se use en ningún lado más que el propio eco. Es un campo de texto libre, cuesta lo mismo que el binario solo, y sin él el eco solo puede decir genéricamente "check-in con tu partner" en vez de poder decir "check-in con Camila". Si prefieres arrancar solo con el binario y agregar `nombre` después, es un cambio de migración menor, no hay que rediseñar nada por eso.

## El check-in en sí — qué se guarda

Hoy `state.sesiones` ya guarda check-ins con `{ id, date, tipo, notas }`, donde `tipo` es `'diaria' | 'semanal' | 'mensual'` — sin referencia a una camiseta puntual, son check-ins del juego entero. Un check-in de partner es distinto: es *de una camiseta específica*. Dos formas de guardarlo, sin inventar una estructura nueva:

- Extender `sesiones` con `cam_id` opcional y `tipo: 'partner'` — reutiliza el arreglo que ya existe y el mismo patrón de evento espejo (`pushEvento` ya emite `sesion_semanal`, etc.; se agregaría `sesion_partner` o similar, ya con `cam_id`).
- O tratarlo como un evento suelto (`partner_checkin`) sin sesión asociada, si no hace falta que aparezca en el Diario junto a los demás cierres.

Mi recomendación es la primera: se integra al Diario/Historia gratis (ya filtra por `tipo.startsWith('sesion_')`), y permite calcular "cuándo fue el último check-in con el partner de *esta* camiseta" con la misma lógica que ya usa `ultimaSesion`, solo agregando el filtro por `cam_id`.

## El eco semanal — cómo se dispara

Una fuente nueva, `fuentePartnerCheckin`, que se agrega al arreglo `FUENTES` de `src/ecos/index.js`:

1. Recorre las camisetas con `partner?.activo` (probablemente solo las no archivadas — otra decisión abierta).
2. Para cada una, calcula si está vencida: sin check-in de partner registrado en los últimos 7 días (mismo criterio "vencido, no contado" que `fuenteAgendar`).
3. Si hay más de una vencida, se muestra solo una — el motor ya obliga a esto ("un eco a la vez" es una regla del sistema, no un límite técnico a resolver). Elegir la más vencida es lo más simple y consistente con el resto del motor.
4. `clave: partner:${camisetaId}` — así el silencio es por camiseta, no global: descartar el recordatorio de una camiseta no apaga el de otra.
5. El texto (en `textos.js`, junto a `TEXTOS.agendar` y `TEXTOS.cerrarDia`) usa `partner.nombre` si existe, si no cae a una frase genérica. Debe seguir el mismo tono que ya tiene el resto de `textos.js`: no cuenta días, no reprocha, el jefe da instrucción, no aviso.

## Dónde vive en la UI

`EditCamiseta` (`src/App.jsx`, línea ~1675) ya tiene el patrón exacto que hace falta: una sección "arco (opcional)" con dos inputs. Una sección "partner (opcional)" al lado — un toggle + un input de nombre que solo aparece si el toggle está activo — es el mismo patrón, no uno nuevo. `submit()` en ese componente ya arma el objeto a guardar campo por campo, así que agregar `partner` ahí es directo.

## Decisiones abiertas (mi recomendación en cada una, no bloqueante)

1. **¿El check-in de partner se agenda también en el calendario del teléfono (como semanal/mensual), o se resuelve dentro del app (como el cierre del día)?**
   Recomiendo dentro del app: es más liviano, no depende de "cómo se va a llamar en tu calendario" ni de compartir nada fuera del dispositivo, y encaja con que dijiste que el partner es información que "cada usuario de camiseta ya sabe" — no necesita salir a un evento de calendario con un nombre.
2. **¿Solo camisetas activas (puestas/en el clóset) participan, o también las archivadas?**
   Recomiendo solo activas — una camiseta archivada ya no se está jugando, un recordatorio sobre ella sería ruido.
3. **¿`nombre` del partner desde ya, o binario puro por ahora?**
   Recomiendo `nombre` desde ya (ver arriba) — costo marginal bajo, valor real en el texto del eco.
4. **Formato exacto de `tipo` a futuro** — no hace falta decidirlo ahora; dejar el campo reservado (`tipo: null`) es suficiente para no migrar dos veces.

## Qué NO cambia con esto

- El codec no se toca. No hace falta agregar ninguna exclusión explícita — ya funciona por lista blanca.
- El sistema de `cita.js`/ICS no se toca si se elige la opción "dentro del app" (punto 1).
- No se crea ningún array de estado nuevo si se reutiliza `sesiones` con `cam_id` (recomendado).

## Reporte para el partner (vía WhatsApp)

Extensión de lo de arriba: además del recordatorio de check-in, poder mandarle al partner un resumen de texto simple de cómo va la camiseta.

### El mecanismo ya existe, no hay que inventarlo

`ShareSheet` (línea ~2630 de `App.jsx`) ya tiene `doShareText()`: arma un texto y llama `navigator.share({ title, text })`. En el teléfono eso abre el share sheet del sistema — WhatsApp incluido — con el texto precargado y editable antes de enviar. `cita.js` usa la misma idea (`entregarCita`) para el `.ics`. El reporte de partner es un tercer uso del mismo patrón: **texto plano, nunca imagen ni archivo**, mucho más simple que el flujo de `ShareSheet` (que además genera PNG/SVG porque su texto es un *molde* pensado para decodificarse).

### Por qué esto NO es lo mismo que "compartir" (ShareSheet)

`ShareSheet` comparte el **diseño** de la camiseta (vía codec, modo `molde`) para que *otro jugador la importe a su propio juego*. El reporte de partner comparte **datos de uso**, de solo lectura, para que el partner *vea* cómo va — no para que la importe ni la juegue. Son dos acciones con dos propósitos distintos y no deberían compartir botón ni sheet, para que nadie confunda "te mando la camiseta" con "te mando cómo me ha ido". El reporte tampoco pasa por el codec — mismo principio que el resto de este documento: no se construye a partir de `encodeCamisetaToJSON`/PNG, se arma su propio texto plano en el momento.

### Qué contenido mostrar — la parte que hay que pensar con cuidado

Este es el punto más delicado de todo el plan: es la primera pieza del app que expone datos de una persona a *otra persona real*, no solo a sí misma. Todo lo demás en `ecos/textos.js` sigue una regla explícita — no cuenta días, no reprocha, no convierte reflexión en rendimiento (regla 4, regla 6 en los comentarios existentes). Un reporte mal diseñado para el partner rompe exactamente esa regla desde afuera: un "llevas 3 misiones esta semana, la anterior fueron 12" leído por otra persona deja de ser un juego y pasa a ser una rendición de cuentas.

Propuesta concreta, en esa línea:
- **Ventana de tiempo:** desde el último check-in de partner registrado (o desde que se activó el partner, si nunca hubo uno) — reutiliza el mismo dato que ya calcula el eco del recordatorio, no hay que inventar otro corte de tiempo.
- **Contenido:** cuántas misiones se completaron en esa ventana (número simple), quizás 1–2 nombradas como ejemplo, y la esencia/arco de la camiseta como contexto de qué identidad es esta. **Nada de streaks, nada de "%", nada comparativo contra semanas anteriores** — eso es precisamente lo que convierte un reporte informativo en una herramienta de presión.
- **Nunca automático.** Se dispara solo cuando el usuario lo toca, nunca desde el eco directamente ni por cuenta propia — el eco recuerda hacer el check-in; mandar el reporte es una decisión aparte y explícita cada vez.

### Dónde vive en la UI

Junto al botón "compartir" que ya existe en `CamisetaDetail` (línea ~2479), pero como una acción visualmente distinta — solo visible si `partner?.activo` — para que no se lea como una variación del mismo botón. Un buen momento natural para sugerirlo (no forzarlo) es justo después de marcar hecho el check-in de partner: un enlace secundario tipo "avisarle" al cerrar esa acción, nunca un paso obligatorio.

### Decisiones abiertas

1. **¿Texto editable antes de enviar, o se manda tal cual?** Recomiendo editable — mismo patrón que `doShareText()` ya usa (WhatsApp precarga el texto en el compose, no lo envía solo). Da control y evita mandar algo que en el momento ya no quieras mandar.
2. **¿Se registra que se compartió un reporte?** Se puede loguear un evento (`partner_reporte_compartido`, con `cam_id`) para que quede en la Historia — igual que `entregarCita` solo sabe si el share se completó o se canceló, no si el partner lo leyó. Opcional para v1, fácil de agregar después sin romper nada.

## Cuando se construya — orden sugerido

1. Migración: `partner: null` por defecto, bump de versión.
2. `EditCamiseta`: sección partner (toggle + nombre).
3. `textos.js`: frases del eco nuevo.
4. `ecos/index.js`: `fuentePartnerCheckin`, agregarla a `FUENTES` (dónde en el orden importa — ver el comentario que ya explica la prioridad de las fuentes existentes).
5. Registro del check-in hecho: acción del eco que empuje a `sesiones`/`eventos` con `cam_id`.
6. (Opcional, después) mostrar en `CamisetaDetail` cuándo fue el último check-in con el partner, si lo hay.
7. Reporte de partner: función que arma el texto (ventana + conteo + esencia/arco) y llama `navigator.share({ text })`, botón junto a "compartir" en `CamisetaDetail`, visible solo con `partner?.activo`.
