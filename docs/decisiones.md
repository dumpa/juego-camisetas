# Decisiones

Lo que ya se pensó y se cerró, con su razón. **No es una lista de reglas** (eso está en `docs/brief.md`): es el registro de por qué las cosas quedaron como quedaron.

Para qué sirve: casi todo lo de aquí tiene una alternativa que parece mejor a primera vista. Si vas a proponer una de esas alternativas, lee primero la razón. Reabrir una decisión es válido —varias de estas cambiaron— pero con argumento nuevo, no por no haberla visto.

Las fechas son de cuando se cerró la decisión.

---

## El concepto

- **La camiseta no es la identidad** (15 ago 2026). Es una herramienta para acercarse a ella: ponérsela significa que hoy esa identidad tiene atención, quitársela significa que hoy no es ahí donde va la concentración. Esta distinción es la que resuelve que "puesta" pueda ser una variable diaria sin que eso sea renunciar a nada, y la que define la única salida real de una identidad: donar o archivar. Texto completo en `docs/brief.md`.
- **Evidencia que la motivó:** el autor llegó a tener 19 camisetas puestas al tiempo. No eran 19 identidades en juego — era que quitárselas se sentía como renunciar, así que no se las quitaba.

## El clóset

- **5 ganchos fijos, no configurables** (25 jul 2026). El límite es parte del mueble; hacerlo configurable convierte el clóset en una preferencia.
- **Las camisetas puestas no se limitan** (25 jul 2026). Número ilimitado a propósito: si el usuario se siente agobiado, lava la ropa. La restricción vive en el gesto de liberación, no en un tope.
- **Cerros ilimitados con nombre**, más un cerro del sistema "sin doblar" donde cae la ropa lavada. Va de último en el orden, no de primero.
- **Orden de la pantalla:** puestas → lavar la ropa → ganchos → cerros. Las puestas van arriba porque son las importantes.
- **Los cerros dejan ver qué hay dentro.** Un montón opaco es un cajón donde se pierden cosas.
- **Mover entre cerros y ganchos no escribe evento.** Solo entrar y salir de "puesta" es historia; lo demás es acomodar muebles.
- **Gancho a gancho intercambia**; desde fuera, el gancho ocupado desaloja su camiseta al cerro sin doblar.
- **Arrastre por agarradero con pointer events**, y tocar el agarradero abre una lista de destinos (25 jul 2026). Razón: el drag-and-drop nativo no existe en iOS.
- **Doblar es una vista entera (`DoblarView`), no una ventana flotante** (26 jul 2026). Tiene su ruta, su scroll y su TabBar, como el detalle de camiseta. Además de leerse mejor, elimina de raíz la clase de bug de `position: fixed` descrita en `docs/brief.md`.
- **Un solo camino para doblar:** el agarradero del clóset y el botón del detalle llevan a la misma vista.
- **"+ cerro nuevo" crea el cerro y mueve la camiseta en una sola movida**, para no dejar cerros vacíos.
- **Después de doblar se sale de la ficha** de la camiseta.

## Lavar la ropa

- **Lava todas las puestas sin excepción, sin confirmación previa y sin deshacer** (25 jul 2026). Es un botón de pánico: pedir confirmación le quita justamente lo que sirve.
- **Deja su propio evento (`lavada`) en la historia**, con los nombres además de los ids. No se infiere de fechas de archivado.
- **Es liberación, no mantenimiento.** Que exista no lo vuelve parte de la rutina.
- **No hay botón de "doblar la ropa" en bloque** (26 jul 2026). Lavar no tiene decisiones; doblar son puras decisiones. Un doblado masivo sería un modo de clasificar — el juego de organizar que este app tiene que evitar. Si algún día se hace, va dentro del ritual mensual, donde revisar ya es lo que se está haciendo.

## Donar

- **El ritual de despedida no se toca.** Es lo que hace que archivar una identidad no sea borrar un registro.
- **En la donación masiva se quita la opción de enviarle la ropa a alguien** (25 jul 2026), porque pueden ser demasiadas.
- **Donar un cerro sí lleva ritual, pero sin envío:** el cerro simplemente desaparece.
- **El observador no es donde se dona** (15 ago 2026). Donar ya se puede desde cualquier camiseta; un ritual mensual que solo despide no está mirando al jefe, está sacando basura. **Construido así:** el ritual mensual ya no archiva ni dona, y con eso queda **un solo camino para donar** — el ritual de despedida desde el detalle. El `confirm()` del navegador que se lo saltaba desapareció con la pantalla vieja.

## La cita

- **Solo se agendan el ritual semanal y el mensual** (14 jul 2026). El diario no: al hacedor lo convoca el trabajo, y un evento diario se vuelve ruido que se aprende a ignorar.
- **Evento único, sin recurrencia, reagendado al cerrar cada ritual.** Es un compromiso, no una configuración.
- **El app no rastrea si la cita se cumplió.** Faltar no produce nada.
- **El nombre del evento es libre y nunca sale del dispositivo.** Por eso no hay link de Google Calendar: pondría el nombre en una URL.
- **`.ics` generado en el cliente con `VALARM` a −10 min.** Duración 15 min (semanal) y 30 min (mensual); la fecha propuesta es la misma hora del día redondeada al cuarto.
- **En iOS se sirve por el service worker** (26 jul 2026). Probado en iPhone: funciona, con dos toques de diálogos del sistema que no se pueden quitar desde el app. Ver la restricción completa en `docs/brief.md` — no "simplificar" a una descarga.

## Los ecos

- **Un eco a la vez.** Es regla del sistema, no un límite técnico por resolver.
- **Vive arriba de la pantalla Hoy**, no en el Diario (26 jul 2026).
- **Sin encabezado que nombre la voz**, mientras el vocabulario de roles siga sin decidirse.
- **Una cita futura apaga el eco de agendar; una cita vencida lo devuelve.**
- **Descartar silencia por cadencia, no globalmente:** 7 días el semanal, 21 el mensual. Vencimientos de 7 y 28 días.
- **Rodaje mínimo antes de hablar:** 7 y 21 días de vida del app, y al menos una camiseta puesta. Un app recién instalado no tiene nada que devolver.
- **Orden de las fuentes: de lo raro a lo frecuente** (agendar mensual antes que cerrar el día).
- **El eco del día no exige que haya misiones cumplidas** (corrección del 26 jul 2026). La reflexión del cierre es lo importante, y un día sin nada marcado puede ser el que más tenga que decir. La condición existió y estaba mal.
- **El eco del día también aparece en la mañana** (15 ago 2026), pero habla una sola vez al día: si ya invitó, o si el ritual ya se hizo, se calla. La clave lleva la fecha para que descartarlo apague solo ese día.
- **Abandonar por la X no cuenta como cerrar** (26 jul 2026) y por lo tanto no le tapa la boca al eco.

## Los rituales

Detalle completo en `docs/rituales.md`. Aquí solo lo que se cerró y cuándo.

- **Se jubila la palabra "check-in"** (15 ago 2026). Cada ritual se llama por lo que se hace en él.
- **El ritual diario escoge camisetas, no misiones** (15 ago 2026). Escoger misiones es engorroso y además le quitaría el oficio al costurero. El diario escoge; el costurero escribe.
- **La escogencia va en dos pasos** —cuáles no visto, cuáles sí— **y eso no se colapsa en uno** (15 ago 2026). Son dos momentos de reflexión con universos distintos. El ritual no está optimizado para la rapidez.
- **Las dos preguntas del diario son literales: "¿qué camisetas no voy a vestir mañana?" y "¿cuáles voy a vestir mañana?"** (15 ago 2026; en la mañana, *hoy*). Cierra el hilo de la redacción. Se descartaron dos versiones y conviene saber por qué antes de reabrirlo: *"quién no voy a ser"* equipara la camiseta con el ser, justo lo que el brief prohíbe; *"a qué le voy a poner atención"* lo arregla pero suena importante, y la solemnidad le pone duelo a un gesto que tiene que ser barato. **Vestir** es literal y liviano, y en español ya carga lo suficiente: uno viste la camiseta de un equipo. Esto corrige la regla de `rituales.md` que pedía peso en la redacción.
- **El ritual semanal se llama "el costurero"** (15 ago 2026). Provisional y barato de cambiar: es una palabra de UI, no una estructura. Reemplaza a "el taller" y a "taller de costura".
- **El costurero se entra escogiendo qué camiseta remendar** (15 ago 2026), y al terminar se puede seguir con otra. Antes era un carrusel de N pasos, uno por camiseta en el orden en que estuvieran: con veinte camisetas eso es un trámite, y un trámite se abandona a la mitad.
- **Las señales del costurero no llevan número** (15 ago 2026). "Sin misiones que hacer" y "hace rato no se juega" son booleanos: un contador de días sería una racha con otro nombre. Y una camiseta recién creada nunca sale dormida — no ha tenido cuándo jugarse, y decirlo sería un reproche por existir.
- **El costurero ve el clóset entero, no lo puesto** (15 ago 2026). Consecuencia directa de v10: si mirara solo lo puesto, solo se podría coser lo que uno se puso esa mañana.
- **"Lavar la ropa" vive solo en el clóset** (15 ago 2026). No entra al paso 1 del ritual diario: sería un atajo para las 19 justo donde el ritual pide mirarlas una por una. El botón de pánico se busca; no se ofrece dentro de la reflexión.
- **Al día siguiente no se evalúa lo que se escogió.** Es una propuesta, no un contrato.
- **El observador guarda qué comprobación mostró** (15 ago 2026), en la sesión mensual (`hallazgo`). La del mes pasado pierde la mitad de su fuerza al mes siguiente, pero no queda descalificada: si sigue siendo con diferencia lo más gordo que pasa, vuelve — y que vuelva también es información.
- **Qué datos puede mirar el observador** (15 ago 2026): tono de las misiones, duración activa antes de archivar, gastada vs. abandonada, tasa de creación vs. juego, deriva del promedio de puntos. **Qué no:** rachas, días activos, curvas de actividad. Y se presenta una sola comprobación por sesión, convertida en pregunta — nunca un tablero.

## Datos, codec y privacidad

- **Los mensajes personales no viajan en el codec** (14 jul 2026). Se escriben por WhatsApp, aparte. Compartir una camiseta no debe cargarle a nadie un rol que no pidió.
- **El app no sabe quién es el mentor de nadie.** El usuario elige el destinatario en WhatsApp: cada uno sabe.
- **El codec exporta por lista blanca**, campo por campo. Un campo nuevo no se filtra solo.
- **Los formatos legacy se leen para siempre.**
- **Las migraciones son acumulativas** y los respaldos crudos `state:pre-v7` / `state:pre-v8` nunca se sobrescriben.
- **El significado de `puesta` cambia con el rediseño del ritual diario.** Antes: identidad activa, duraba meses. Después: atención de un día. La migración v10 ya no depende de que alguien anote la fecha a mano: **escribe un evento `frontera_puesta_diaria`** en la historia de cada usuario, con su propio `ts`. Cualquier cálculo que cruce esa frontera lee dos cosas distintas bajo el mismo nombre y ahora tiene cómo saberlo. No afecta la duración de una identidad, que se mide de creación a archivo.
- **`archived_at` de la camiseta se elimina** (15 ago 2026). Hoy `aplicarMovida` lo estampa cada vez que una camiseta sale de "puesta" y lo pone en `null` cada vez que vuelve; con la atención diaria eso se reescribiría todas las noches y lavar la ropa lo estamparía en 19 camisetas de un golpe. El campo ya no tiene oficio: quitarse una camiseta no es archivarla, y la muerte de una identidad vive en el evento `camiseta_donada`, no en un campo de una camiseta que ya salió del array. Como reescribe un campo existente, esta sí lleva respaldo crudo `state:pre-v10`. **No confundir con el `archived_at` de una misión**, que se queda tal cual.
- **Todas las aperturas del app se registran en `visitas[]`** (14 jul 2026), no una por día: el patrón de hora del día es lo que alimenta la distinción jefe/hacedor.

## Estética y vocabulario

- **Paleta y tipografías derivadas del codec** (25 jul 2026). La estética anterior —crema y serif— se descartó explícitamente por genérica.
- **"Mazo" jubilado en toda la app**: es el clóset, y "al mazo" es "ponérmela" (26 jul 2026). Cambió también cómo se leen entradas viejas del Diario, y se aceptó ese costo.
- **Se escribe "clóset", con tilde.**

## Documentación y método

- **Se versiona el brief (doctrina), no el plan** (25 jul 2026). El plan es una tabla de despacho.
- **La doctrina vive en el repo; el plan y la historia, en Notion** (15 ago 2026). Razón: lo que un agente debe obedecer tiene que cargarse solo y viajar en el mismo commit que el código; lo que lee el autor puede quedarse donde se lee desde el teléfono.
- **Los temas se nombran, no se numeran.**

---

## Abiertas

No decidido. No resolverlas por cuenta propia.

- **Cómo se calcula la camiseta abandonada** ahora que "puesta" es atención diaria: es la que se conserva en el clóset y nunca se escoge. Falta definir el umbral, y que no se lea como un reproche al usuario. No bloquea.
- **El criterio de selección del eco:** qué fragmento propio merece volver.
- **Dónde vive el doblado en bloque**, si se hace: dentro del observador es el argumento actual.
- **El regalo de un milestone:** lo pone quien envía la camiseta, o es un autorregalo.
- **Niveles y camisetas emergentes** (ver `docs/vision.md`): ideas del documento original que no están en el código y no se sabe si se descartaron.
