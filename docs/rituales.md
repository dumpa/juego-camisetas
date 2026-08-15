# Los rituales — por qué están diseñados así

Documento de doctrina para el Juego de las Camisetas. Explica **qué pretende cada ritual y por qué**, no cómo se implementa.

## Cómo usar este documento

- Es **doctrina, no especificación**. Si una decisión de implementación contradice algo de aquí, el documento gana o se pregunta antes de codificar.
- Si aparece una funcionalidad que suena razonable pero viola una de las negativas de la sección 7, **la funcionalidad está mal**, no la negativa. Esas reglas se escribieron porque la solución obvia las rompe.
- Relación con `docs/brief.md`: el brief manda sobre vocabulario, reglas duras y restricciones técnicas; este documento manda sobre el propósito de los rituales. Donde se contradigan, preguntar.
- **Ojo con un nombre ambiguo:** "el observador del observador" es aquí el tercer ritual del app. El autor también tiene una app personal separada con ese mismo nombre (check-in por proyecto, Cloudflare + Notion). No son la misma cosa y nada de aquella va aquí.

---

## 1. La tesis

Las tres cadencias **no son tres frecuencias, son tres posiciones del yo**. La frecuencia es consecuencia, no diseño.

- **El hacedor** — el que trabaja. Vuelve al app porque hay trabajo esperándolo.
- **El jefe** — el que organiza el trabajo del hacedor. Es el *organize* de CORD.
- **El observador** — el que mira al jefe. No mira el trabajo: mira los instrumentos con que el jefe mide el trabajo.

Todo lo que sigue cuelga de ahí. Si algo se lee como un capricho ("¿por qué el diario no se agenda?"), la respuesta está siempre en cuál de los tres está sentado en la silla.

Consecuencia inmediata y central: **al hacedor lo convoca el trabajo; al jefe no lo convoca nadie.** Al jefe solo lo puede citar una versión anterior de sí mismo. Por eso existe la cita, y por eso el ritual diario no la lleva.

## 2. Vocabulario

La palabra **check-in se jubila**. No es cosmético: obligaba a que la sesión se justificara sola. Cada ritual se llama como lo que se hace en él.

| Posición | Ritual | Cadencia |
|---|---|---|
| Hacedor → jefe | **Escoger la ropa de mañana** | diaria |
| Jefe | **El costurero** (coser, remendar) | ~semanal |
| Observador | **El observador del observador** | ~mensual |

Prohibidas en la UI: *mentor*, *testigo*, *vigilar*. También *racha*, *puntaje de desempeño*, *cumplimiento*.

## 3. Escoger la ropa de mañana

### Qué pretende

**El cambio de turno.** El hacedor entrega el día y el jefe deja puesto lo de mañana. Antes de este rediseño, el ritual diario solo anotaba puntos — es decir, le pedía al usuario que fuera la base de datos de algo que el app ya sabía. No aportaba nada.

Lo que sí faltaba: **nadie dejaba el trabajo listo para el hacedor de mañana.** Lo dejaba el costurero, hasta con siete días de anticipación. Demasiado grueso. El cierre del día es la pasada fina.

No se escogen misiones. Escoger misiones es engorroso y además le quitaría el oficio al costurero. **Se escoge qué vas a vestir, no qué vas a hacer.** La idea de fondo: puedes tener muchas camisetas puestas a la vez, pero un día solo cabe en dos o tres. La identidad se acumula; el día no.

### Por qué son dos pasos y no uno

1. **¿Qué camisetas no voy a vestir mañana?** — lista de lo que traes puesto. X manda al clóset.
2. **¿Cuáles voy a vestir mañana?** — lista del clóset. Botón "ponérmelas".

Partirlo es **deliberado y no negociable**. No es ineficiencia: son dos momentos de reflexión distintos, y sus universos son distintos (lo que traes puesto vs. lo que está en el clóset). Es la analogía de hacer maleta: primero saco lo que no llevo, después meto lo que llevo; hacerlo todo a la vez enreda. Este ritual **no está optimizado para la rapidez, está diseñado como una conversación con uno mismo.**

Reglas que salen de ahí:
- Una camiseta **nunca aparece en los dos pasos**.
- Se puede devolver. Quitarse una y arrepentirse es parte de pensar, no un error que corregir.
- **Sin misiones en esta pantalla.** Solo nombres de camisetas, lista plana, rápida de recorrer.
- La redacción de las preguntas es **literal y liviana, a propósito** (15 ago 2026). Se pregunta qué se viste, no quién se es: una pregunta solemne le pone duelo a quitarse una camiseta, y quitársela tiene que seguir siendo barato (ver `docs/brief.md`). *Vestir* carga solo, sin subrayarlo — en español uno viste la camiseta de un equipo. **Corrige a la versión anterior de este documento**, que pedía peso en la redacción y descartaba "cuáles no me pongo" por logística; se cambió sabiendo lo que decía.

### Lavar la ropa

Sigue siendo el **botón de pánico**: quitarse 19 camisetas son 19 clics o un solo botón. Es liberación, no mantenimiento. **Vive solo en el clóset** (15 ago 2026): no entra al ritual diario. Meterlo en el paso 1 pondría un atajo para las 19 justo donde el ritual pide mirarlas una por una. Que exista no lo obliga a usarse; que nadie más lo use no es razón para quitarlo.

### El pago

Si escoger la ropa no cambia nada al día siguiente, es ceremonia. **La pantalla del hacedor abre filtrada por las camisetas del día.** Ese es el acople que justifica el ritual entero, y es lo que por fin contesta "qué me dejó el jefe" sin que el jefe escriba nada.

### Cuándo se hace

**La puerta está siempre abierta.** El ritual no se agenda, pero tampoco se encierra en una franja horaria: si alguien quiere hacer el plan en la mañana antes de arrancar, tiene que encontrarlo fácil, sin buscarlo. Nada de "vuelve después de las 6".

El acto es el mismo; lo que cambia es a qué día apunta. De noche se escoge la ropa de mañana; en la mañana se escoge la de hoy. Es el desfase clásico —mirar hoy para actuar mañana, o mirar ayer para actuar hoy— y no hay que escoger uno: **el texto de las dos preguntas se adapta al momento en que se entra**, el resto del ritual es idéntico.

Una vez hecho, está hecho para ese día. Si se hizo en la mañana, en la noche no se vuelve a pedir.

### La trampa

Al día siguiente **no se evalúa** si de verdad te pusiste lo que escogiste. Lo de mañana es una propuesta, no un contrato. Preguntar "¿lo hiciste?" es el conteo de ausencias entrando por la puerta de atrás, y es lo primero que va a proponer cualquiera que implemente esto.

## 4. El costurero

### Qué pretende

Es donde **se escribe el juego**: puntos arriba y abajo, misiones nuevas, hitos nuevos, ajustar dificultad, cambiar la forma. Su producto no es una reflexión: es que el hacedor de la semana entrante encuentre trabajo listo.

La línea con el ritual diario: **el diario escoge, el costurero escribe.** El diario saca de lo que ya existe; el costurero decide qué debería existir. Si el diario empieza a crear, el costurero se queda sin oficio y el diario deja de ser corto.

### Reglas

- Se entra escogiendo **qué camiseta revisar**, y se puede revisar otra al terminar.
- Uno escoge siempre la camiseta viva, así que **hay que mostrar cuáles no se tocan hace rato**. No forzar: que escoja informado.
- **Chulear hitos aquí es recuperación, no el camino principal.** Completar un hito abre su propio momento (compartirlo, reclamar el regalo); chulear cinco en una sesión de revisión convierte ese momento en contabilidad.
- **Se agenda.** Al cerrar, el app propone la fecha del siguiente. Ver sección 8.

### Una señal que viene del diario

Una camiseta que se escogió para mañana y **no tiene ninguna misión que hacer** es la señal más útil que produce el sistema. El diario la marca; el costurero la resuelve. Ahí no hay solapamiento entre los dos rituales.

## 5. El observador del observador

### Qué pretende

Es **la única sesión que puede desconfiar de las otras dos**. No mira el trabajo: mira los instrumentos del jefe.

Sus preguntas: ¿los puntos que me he dado eran honestos? ¿el nivel de las misiones es el que quiero? ¿voy hacia donde debería? ¿qué propósitos tengo abandonados? ¿quién quiero ser?

**No necesita donar.** Donar ya se puede desde cualquier camiseta en cualquier momento. Si el mensual solo despide camisetas, no está mirando al jefe: está sacando basura. La pregunta no es cuáles boto, es **por qué sigo con las que me quedo**.

### El material que mira

Una sesión introspectiva sin material que mirar es una hoja en blanco, y las hojas en blanco no se llenan a las nueve de la noche. El material sale del registro que ya produce el uso diario.

**Sirve (habla del juego y de las identidades):**
- **Tono de las misiones completadas.** Qué proporción no tiene tono asignado — son hábitos sueltos — y qué tonos dominan cuando sí lo tienen. Es el nivel del juego que el jefe está escribiendo.
- **Duración activa antes de archivar.** En los datos reales del autor, las identidades rondan los 50–66 días: **una identidad vive unos dos meses.** Da una referencia propia para preguntar por una camiseta que lleva mucho más viva de lo que ninguna le ha durado. Es la puerta a remendar, recombinar o despedirse.
- **Gastada vs. abandonada.** Una camiseta archivada con muchas misiones se usó bien; una archivada con tres se abandonó. Distinguir esas dos muertes es trabajo de observador.
- **Tasa de creación vs. juego.** Crear identidades más rápido de lo que se juegan es un diagnóstico del jefe.
- **Deriva del promedio de puntos por misión**, global y por camiseta. Es la forma de detectar a un jefe que se infla los puntos. El dato ya está guardado.

**No sirve (habla de la asistencia del jugador):**
- Racha más larga — además suele coincidir con el arranque, así que es un monumento a un ritmo irrepetible.
- Días activos sobre días totales.
- Zonas muertas, curva de misiones por semana, cualquier gráfica de actividad en el tiempo.

El patrón por día de la semana no va aquí: es material para escoger la ropa. El conteo de sesiones por tipo solo entra si se lee como balance entre jefe y hacedor, nunca como cumplimiento.

### Forma

**Nada de tablero.** Un panel de doce gráficas convierte la introspección en navegar datos — la versión analítica del juego de organizar. El observador calcula varias comprobaciones y **presenta una sola, la que más tenga que decir esta vez, convertida en pregunta.** Es la doctrina del eco aplicada a los números.

Aquí es donde encaja la idea del parte visual (grilla de puntos, visualización mínima y suficiente): no como reporte de desempeño, sino como el material que el observador necesita para preguntar.

## 6. Reflexión y frases

Las mecánicas no distinguen a los tres rituales — los tres manipulan camisetas. **La reflexión sí.** Si las tres tienen la misma reflexión genérica, dejan de ser tres posiciones y se vuelven una sola sesión a tres velocidades.

- **Diaria:** contestable en un respiro y **sin respuesta equivocada**. "¿Qué movió el día?" ya funciona.
- **Costurero:** sobre el trabajo y su dirección.
- **Observador:** las difíciles. Las preguntas que siguen sin respuesta; las metas largas donde no se siente progreso; todo lo que no está en la lista pero podría estar; cómo te disrumpirías a ti mismo.

Dos reglas de protección:

1. **Muchos días no hay pregunta, solo una frase.** No queremos un quiz diario. Es la misma doctrina del eco: puede no decir nada.
2. **Las frases salen del manifiesto del autor, no de un banco genérico de motivación.** Un banco genérico suena a póster de oficina, que es exactamente el registro que el proyecto rechaza. El tono correcto es el suyo: "being busy is a form of laziness".

## 7. Las negativas

Prohibido, en cualquier ritual, pantalla o eco:

- **Rachas.**
- **Conteo de ausencias.** Ni de días, ni de sesiones, ni de citas. El app puede decir que hace rato no juegas de futbolista — eso habla de una identidad. Nunca que hace rato no escoges la ropa — eso te cuenta a ti.
- **Detección de citas incumplidas.** El app no rastrea si la cita se cumplió. Faltar no produce nada: ni aviso, ni marca, ni conteo.
- **Evaluar al día siguiente lo que se escogió la noche anterior.**
- **Puntaje de desempeño** mostrado como juicio.
- **Notificaciones push.**
- **Datos que salgan del dispositivo.** Offline, sin backend. El nombre de la cita ni siquiera viaja en el export.
- **Abandonar no es cerrar.** Salir por la X no registra sesión ni silencia al eco.
- **El eco devuelve tus palabras, nunca tu ausencia.** Sin número, una vez y caduca, y puede no decir nada.
- **Lógica de engagement.** Que el usuario pase más tiempo en el app no es un objetivo. Si una funcionalidad se justifica porque "así vuelve más seguido", está mal justificada.

## 8. Cómo se conectan

**La cita.** Un ritual sin hora es un deseo. Solo se agendan el costurero y el observador: al hacedor lo llama el trabajo. Evento único no recurrente, reagendado al cerrar cada sesión — es un compromiso, no una configuración. `.ics` generado en el cliente con `VALARM`; en iOS se sirve por el service worker (ver restricción técnica en el brief; no "simplificar" eso a una descarga).

**El eco.** Una sola voz a la vez. Devuelve material propio del usuario. El eco del día abre el ritual diario y no exige que haya nada cumplido.

Distinguir **la puerta del eco**: la puerta al ritual diario está siempre disponible; el eco es la voz que invita, y esa sí habla una vez y caduca. El eco puede asomarse en dos momentos —al abrir en la mañana y al caer la tarde— pero **no habla dos veces el mismo día**: si ya invitó, o si el ritual ya se hizo, se calla. Descartarlo apaga solo ese día. Y el texto no puede decir "cierra el día" en la mañana; cada momento tiene su frase.

**El circuito.** El ritual diario produce, sin que nadie escriba nada, el material que el observador necesita: qué te pusiste, qué escogiste una sola vez, qué nunca sacaste del clóset. El costurero consume las señales que marca el diario. Los tres se alimentan; ninguno le pide al usuario que reporte.

## 9. Hilos abiertos

Decisiones **no tomadas**. No resolverlas por cuenta propia al implementar.

1. **"Puesta" pasa a ser una variable diaria.** Antes era un estado durable. Consecuencia sin resolver: la camiseta abandonada **hay que calcularla desde el historial de elecciones**, no desde el estado — y ya no desde `archived_at`, que se elimina (ver `docs/decisiones.md`). Decisión del autor: se mejora después, no bloquea.
2. El criterio de selección del eco: qué fragmento propio merece volver.
3. Dónde vive el doblado en bloque. Argumento actual: dentro del observador, donde revisar ya es lo que se está haciendo. Nunca como botón suelto de "doblar la ropa" — lavar no tiene decisiones y doblar son puras decisiones, y eso sería un modo de clasificar.
4. El banco de preguntas y frases por cadencia: sin escribir.

## Apéndice — qué existe hoy

Estado aproximado a agosto 2026; **verificar contra el repo antes de tocar nada.**

- Esquema v10. `visitas[]` registra todas las aperturas. Los eventos de camiseta registran entrar y salir de "puesta"; mover entre cerros y ganchos no escribe evento.
- Sesiones: diaria, semanal y mensual, registradas por `logSesion` con tipo y fecha. La diaria guarda además `para` (el día que se escogió), `quitadas` y `puestas`, con nombre congelado. `ultimaSesion(state, tipo)` y `yaEscogio(state, dia)` en `src/ecos/index.js`.
- Clóset v8: 5 ganchos fijos, cerros ilimitados con nombre, cerro del sistema "sin doblar", botón "lavar la ropa", vista `DoblarView`.
- El costurero se entra escogiendo qué camiseta remendar, con dos señales por camiseta (`calcularSeñales` en `src/ecos/index.js`): *sin misiones que hacer* y *hace rato no se juega*. Son booleanos a propósito — un número de días aquí sería una racha con otro nombre. Ve el clóset entero, no lo que está puesto hoy.
- El observador calcula cinco comprobaciones (`src/observador/`) y presenta una sola, la que más tenga que decir, convertida en pregunta; la del mes pasado pierde fuerza pero no queda vetada. Sin material suficiente no inventa: lo dice y pasa a la pregunta difícil del mes. Ya no archiva ni dona.
- Ecos v1: motor con fuentes puras, una voz a la vez, ecos de agendar semanal, agendar mensual y escoger la ropa. El del ritual diario se asoma en la mañana y al caer la tarde con textos distintos, y su clave es el **día que se está escogiendo**, no el del calendario: la invitación es una por decisión.
- Cita: `src/cita.js`, `.ics` en el cliente, ruta `/cita.ics` servida por el service worker para iOS.
- Cualquier capa nueva a pantalla completa va como vista propia, no como `position: fixed` dentro de una vista animada (ver bug de `.fade-up` documentado en el proyecto).
- Tests: `npm test` corre el round-trip del codec y el del estado (`tests/estado.test.mjs`, que prueba que exportar → importar → migrar no pierda nada). El del codec estuvo roto y se arregló el 15 ago 2026.
