# Brief — la doctrina del juego

Las reglas que no se negocian. Si una decisión de implementación choca con algo de aquí, **la decisión está mal**, no la regla. Cuando algo no esté cubierto, preguntar antes de codificar.

Es la traducción al repo del brief permanente que vivía en Notion ("🤖 Para Claude — Camisetas v1"). A partir de ahora **este archivo es la fuente de verdad**; lo de Notion queda como historia.

## El mapa de documentos

| Archivo | Qué manda | Cuándo leerlo |
|---|---|---|
| `CLAUDE.md` (raíz) | Cómo está hecho el repo: comandos, arquitectura, trampas técnicas | Siempre — se carga solo |
| `docs/brief.md` | **Esto.** Las reglas duras, el vocabulario, las restricciones que no se simplifican | Antes de tocar rituales, ecos, textos o cualquier cosa que le hable al usuario |
| `docs/decisiones.md` | Lo ya decidido y por qué, con fecha | Antes de proponer cambiar un comportamiento existente |
| `docs/vision.md` | Por qué el modelo de datos es como es, de dónde viene la idea | Antes de tocar el modelo de puntuación, `forma`/`tonos`, milestones o el catálogo |
| `docs/rituales.md` | Qué pretende cada uno de los tres rituales y por qué | Antes de tocar los cierres diario, semanal o mensual |
| `docs/partner-checkins.md` | Plan de una función **no construida** | Solo si se va a construir el partner |

Si dos documentos se contradicen, gana el más específico (`rituales.md` sobre los rituales, `vision.md` sobre el modelo) y se avisa de la contradicción para arreglarla.

## Qué es este juego

No es un app de tareas ni de hábitos. Es un juego de **identidades**: la pregunta que responde no es "¿qué tengo que hacer hoy?" sino "¿qué camiseta quiero usar hoy?".

Debajo hay una tesis de dos personajes que hay que entender para no romper nada:

- **El jefe** organiza el trabajo (*organize* y *review* de CORD): arma las camisetas, escribe las misiones, ajusta los puntos.
- **El hacedor** trabaja (*capture* y *do*): entra a ver qué misión le dejó el jefe.
- **El observador** mira al jefe: no audita el trabajo, audita los instrumentos con que el jefe mide el trabajo.

Son la misma persona en tres momentos. Casi toda la doctrina de abajo se deduce de ahí. Detalle completo en `docs/rituales.md`.

## La camiseta no es la identidad

Distinción de fondo, y la que más fácil se rompe al implementar. **La camiseta es una herramienta para acercarse a una identidad, no la identidad misma.** Las identidades ya están ahí, se remiendan, y pasan por momentos más activos y menos activos. Ponerse una camiseta significa que hoy esa identidad tiene atención — que hoy se juega con esa actitud. Quitársela **no** es dejar de ser eso: es decir que hoy la concentración va en otra parte.

De ahí salen tres estados y una sola puerta de salida:

- **Puesta** — hoy tiene atención.
- **En el clóset** (gancho o cerro) — la identidad está en la vida de la persona, hoy sin atención.
- **Donada o archivada** — la identidad se fue. Es la única salida real, y por eso es la única con ritual de despedida.

Lo que se sigue de esto:

- Quitarse una camiseta es un gesto barato y sin duelo. Nada en la UI puede hacer que se sienta como renunciar — si se siente así, la gente deja de quitárselas y termina cargando el clóset encima.
- Por eso "puesta" puede cambiar a diario sin que se pierda nada, y por eso lavar la ropa no es violento: limpia atención, no identidades.
- Una camiseta abandonada no es la que te quitaste: **es la que conservas y a la que nunca le das atención.**
- Ninguna palabra de la UI equipara la camiseta con el ser. Nada de "deja de ser", "quién eres" ni "ya no eres". Se habla de atención, de juego, de a qué se le pone el foco hoy.

## Las reglas duras

**Nada de rachas.** Ni contadores de días seguidos, ni "llevas X días sin", ni porcentajes de cumplimiento, ni nada que mida asistencia. Es la regla que más veces va a parecer razonable romper.

**El app nunca cuenta ausencias.** Puede decir que hace rato no juegas de futbolista —eso habla de una identidad—; nunca que hace rato no entras, no cierras el día o no hiciste el ritual. Faltar no produce nada: ni aviso, ni marca, ni conteo.

**La reflexión no se convierte en rendimiento.** Ningún cierre exige que haya algo cumplido para valer. Un día sin nada marcado puede ser el que más tenga que decir.

**Abandonar no es cerrar.** Salir de un ritual por la X no registra sesión, no cuenta como hecho y no silencia al eco.

**Un eco a la vez, y el eco devuelve palabras propias, nunca ausencias.** Habla una vez, caduca, y puede no decir nada. Descartarlo silencia esa cadencia, no todas.

**La cita es un compromiso, no una configuración.** Evento único sin recurrencia, reagendado al cerrar cada ritual. El app **no rastrea si se cumplió**.

**Nada sale del dispositivo.** Sin backend, sin cuentas, sin analítica, sin notificaciones push. Todo en `localStorage`. Lo único que sale lo saca el usuario a mano (export JSON/PNG, share sheet), y siempre por decisión explícita suya en el momento.

**Nada de lógica de engagement.** Que el usuario pase más tiempo en el app no es un objetivo y nunca es justificación de una funcionalidad. Si el argumento a favor de algo es "así vuelve más seguido", el argumento está mal.

**Cuidado con el juego de organizar.** El riesgo permanente de este app es volverse un juguete de clasificar en vez de un juego de hacer. Toda función que agregue modos de ordenar, etiquetar o clasificar tiene que justificarse contra esto. Por eso *lavar la ropa* existe (no tiene decisiones) y *doblar en bloque* no (son puras decisiones).

**Ninguna función es obligatoria.** Nada bloquea, nada exige un paso previo, nada se dispara solo si expone datos del usuario a otra persona.

## Vocabulario

- La palabra **check-in se jubila**. Los tres rituales se llaman por lo que se hace en ellos: *escoger la ropa de mañana* (diario), *el costurero* (semanal), *el observador del observador* (mensual).
- Prohibidas en la UI: **mentor**, **testigo**, **vigilar**, **racha**, **cumplimiento**, **desempeño**.
- Jubiladas: **mazo** (es el *clóset*), **al mazo** (es *ponérmela*).
- Se escribe **clóset**, con tilde.
- Nadie tiene rol asignado en la UI. El app no sabe quién es el mentor de nadie: eso lo sabe cada quien y se resuelve por WhatsApp, fuera del app.
- Los textos del jefe dan instrucción, no aviso. No cuentan días y no reprochan. El tono vive en `src/ecos/textos.js`; cualquier frase nueva se escribe contra las que ya están.

## Restricciones técnicas que no se pueden "simplificar"

Cada una de estas parece innecesariamente complicada y tiene una razón. **No las reemplaces por la versión obvia.**

- **El `.ics` se sirve desde el service worker** (ruta `/cita.ics`, caché propia exenta de la limpieza de `activate`, iframe oculto solo en iOS). No es capricho: iOS exige navegar a una URL con `Content-Type: text/calendar` y rechaza `blob:` y `data:`. Convertirlo en una descarga rompe el iPhone, que es el dispositivo real del usuario. Sin `RRULE`, sin link de Google Calendar (el nombre del evento no puede salir en una URL).
- **Cualquier capa a pantalla completa va como vista propia o envuelta en `<Capa>`** (portal a `document.body`). Razón: `.fade-up` termina con un transform de identidad pegado por `animation-fill-mode: both`, y un transform de identidad crea bloque contenedor, así que un `position: fixed` dentro de una vista animada se mide contra el alto de la página, no de la pantalla. Consecuencia encadenada: los estilos de los que dependen los portales (`color`, `background`) tienen que vivir en la regla `body`, no en el contenedor de `Frame`.
- **El codec exporta por lista blanca**, campo por campo, nunca por spread. Un campo nuevo en una camiseta no se filtra al compartir a menos que alguien lo agregue explícitamente a esa lista. Antes de agregar un campo ahí, preguntar.
- **Los formatos legacy del codec se siguen leyendo para siempre.** El encoder emite solo el actual, pero el decoder no pierde compatibilidad hacia atrás.
- **Las migraciones son acumulativas.** Se suma un paso, no se reescriben los anteriores. Los respaldos crudos `state:pre-v7` y `state:pre-v8` **nunca se sobrescriben ni se borran**.
- **La paleta y las tipografías se derivan del codec** (`src/codec/index.js`): fondo `#0a0a0a`, texto `#F0E5D0`, los cuatro tonos como acentos, Space Mono + Chakra Petch, aberración cromática como firma. Dirección estética: ochentero / neón / cyberpunk / cryptoart. Explícitamente **no** crema + serif.
- **Sin drag nativo.** El arrastre va por agarradero con pointer events, y tocar el agarradero abre una lista de destinos, porque el DnD nativo no existe en iOS.

## Cómo trabajar con el autor

- **Avisar antes de correr un comando que pueda mostrar secretos** (llaves, tokens, contraseñas). Él confía en que se le advierta.
- **Quitar antes que añadir.** Si algo se ve mal, lo probable es que sobre código, no que falte. Un síntoma de "se está cargando algo que no va" se arregla eliminando.
- **Soluciones cortas para problemas cortos.** Si un detalle chico va a costar mucho código, explicar por qué antes de escribirlo.
- **Referirse a los temas por nombre, no por número.**
- No darle vueltas a cosas sencillas. Un botón no debería costar una conversación larga.
- Empezar con el mínimo e ir añadiendo: es mejor añadir que quitar.

## Estado

- Esquema `version: 9`. Construido: el clóset (5 ganchos + cerros), lavar la ropa, donar y donar en masa, el motor de ecos, la cita `.ics`, los tres cierres en su forma vieja.
- **Los tres rituales están en rediseño** (ver `docs/rituales.md`): el cierre diario pasa a ser *escoger la ropa de mañana*. Lo que hay hoy en el código es la versión anterior.
- No construido: el partner por camiseta, el reporte al partner, el criterio de selección del eco, el onboarding, el manifiesto.
- `src/AppBackup.jsx` y `src/codec/indexBackup.js` no son la fuente de verdad. Los tests (`npm test`) pasan: round-trip del codec y del estado.
