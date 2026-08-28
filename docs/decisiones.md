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
- **Una sola puerta para las tres formas de tener una camiseta** (17 ago 2026). Son tres y son hermanas —crearla, comprarla, recibirla—, pero en el header del clóset habían quedado como `catálogo` más dos íconos mudos de 20px: crear, que es la que más se usa una vez jugando, era la más chiquita y la más fácil de confundir. La alternativa obvia era ascender crear a botón principal y dejar las otras dos de segundas; se descartó porque no son de segundas. Ahora un botón «+ nueva camiseta» abre una hoja con las tres al mismo nivel y todas nombradas con su verbo, y «catálogo» —que nombraba un lugar, no una acción— pasó a ser «comprarla». **El orden dentro de la hoja no es el de la bienvenida y es a propósito:** allá comprar va primero, porque quien llega no tiene puntos ni sabe todavía qué es una camiseta y el catálogo se lo enseña.

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
- **La temperatura admite varias calientes y varias frías** (16 ago 2026). Obligar a escoger una sola era pedirle al usuario que resumiera de más. Una camiseta no puede estar en las dos listas: entrar a una la saca de la otra. Las sesiones viejas guardaban un id suelto y se siguen leyendo así.
- **Se retira "¿hacia dónde va este trabajo?"** (16 ago 2026) y entra un banco de preguntas concretas, una por semana. Razón del autor: con muchas identidades y muchas camisetas encima no se sabe a cuál trabajo se refiere, y una pregunta que hay que descifrar antes de contestarla no se contesta.
- **El observador muestra TODAS las preguntas difíciles, no una por mes** (16 ago 2026). Es la sesión que se agenda para sentarse un rato; mostrar una sola convertía media hora reservada en tres minutos. Lo que las hace soportables no es que sean pocas: es que **se pueden pasar**, y contestar ninguna es una sesión válida. Sin esa salida, doce preguntas son un formulario. Se puede terminar a mitad de camino sin perder lo ya escrito.
- **Sigue siendo UN solo hallazgo calculado** (16 ago 2026). Lo que se abrió es el banco de preguntas, no el tablero: las comprobaciones sobre datos siguen presentándose de a una.
- **"Lavar la ropa" vive solo en el clóset** (15 ago 2026). No entra al paso 1 del ritual diario: sería un atajo para las 19 justo donde el ritual pide mirarlas una por una. El botón de pánico se busca; no se ofrece dentro de la reflexión.
- **Al día siguiente no se evalúa lo que se escogió.** Es una propuesta, no un contrato.
- **El observador guarda qué comprobación mostró** (15 ago 2026), en la sesión mensual (`hallazgo`). La del mes pasado pierde la mitad de su fuerza al mes siguiente, pero no queda descalificada: si sigue siendo con diferencia lo más gordo que pasa, vuelve — y que vuelva también es información.
- **Qué datos puede mirar el observador** (15 ago 2026): tono de las misiones, duración activa antes de archivar, gastada vs. abandonada, tasa de creación vs. juego, deriva del promedio de puntos. **Qué no:** rachas, días activos, curvas de actividad. Y se presenta una sola comprobación por sesión, convertida en pregunta — nunca un tablero.

## El respaldo

- **El respaldo es vista propia, no un bloque al fondo del Diario** (16 ago 2026). Sin backend, el archivo que sale de ahí es lo único que hay entre el usuario y perderlo todo; el navegador puede desalojar `localStorage` sin avisar. Antes exportaba al portapapeles —que se pierde con el siguiente copiar— e importaba por un `prompt()` donde había que pegar mil líneas: en un teléfono, impracticable.
- **Sale como archivo por el share sheet**, entra por selector de archivo, y pegar queda de segunda opción.
- **Se muestra qué trae el archivo antes de pisar nada.** Restaurar es el único gesto que borra todo de una.
- **Un respaldo de una versión más nueva se rechaza.** `migrate` solo sabe subir; bajar sería inventar, y lo que inventaría es el juego entero de alguien.
- **Hay una puerta en la bienvenida** («ya tengo un respaldo»). Quien llega de un teléfono nuevo no tiene camisetas, así que la bienvenida le ganaba el turno y la única salida era rearmar el clóset a mano.
- **La historia del Diario se pliega en semanas** (17 ago 2026). Crece sin techo y la puerta del respaldo vive debajo de ella, así que con el uso el respaldo se hundía a mil scrolls — el respaldo dejaba de ser visible por el mismo motivo por el que se le dio vista propia. Al llegar se abren **las semanas que hagan falta para juntar tres días con eventos**, no "la última semana": si hoy es lunes eso sería un solo día. Hay «ver todo» y «contraer todo», y contraer contrae también lo reciente — plegarlo entero es una salida válida, no un estado prohibido.
- **No hay eco de "hace rato no respaldas"** (16 ago 2026). Eso cuenta ausencias del usuario, que es justo lo prohibido. El camino se hace fácil y visible; el app no insiste.

## El vistazo a los datos

- **El mini-análisis de uso real se construye dentro del app** (28 ago 2026). Existía como artifact suelto, calculado a mano sobre el backup del 13 de agosto; ahora se calcula en vivo desde `localStorage` en `src/analisis.js` y se dibuja en `DatosView`. No sale nada del dispositivo: son cuentas sobre el archivo que ya está en el teléfono.
- **Es vista propia y se entra a propósito, desde la puerta del respaldo.** No es una pestaña. Mirar el archivo es un gesto distinto de jugar, no hay un solo botón aquí que cambie el estado, y **el juego nunca trae al usuario a esta pantalla**: ni un eco, ni un ritual, ni un aviso llevan hasta acá. Se entra por la puerta y se sale por la flecha.
- **Aquí adentro —y solo aquí— viven la racha y el porcentaje de días activos.** Es una excepción consciente y acotada a la regla dura de `docs/brief.md` («nada de rachas», «el app nunca cuenta ausencias»), decidida por el autor el 28 ago 2026 con la regla a la vista. El razonamiento: la regla existe para que **el app** no le mida la asistencia al usuario ni se la eche en cara; un archivo que el usuario abre a propósito para mirar sus propios datos no le está reprochando nada a nadie. **La regla sigue mandando en todo lo demás**, y esa es la parte que no se negocia: ningún eco, ningún ritual, ninguna pantalla del juego y ningún texto que le hable al usuario puede contar días seguidos ni ausencias. Si esto alguna vez se filtra fuera de `DatosView` —a un eco, al Diario, a un cierre—, se revierte.
- **Las completadas se cuentan desde `movimientos`, no desde los eventos.** El análisis original contó 471 mirando los eventos `mision_completada`, que nunca se borran; el número real es 384. Un deshacer elimina el movimiento pero deja el evento, así que contar eventos infla el total con trabajo que el usuario deshizo. Además `movimientos` es de donde el resto del app saca los puntos: dos números distintos para lo mismo, en la misma app, es peor que un número menos halagador.
- **La gráfica de "cuánto duró antes de la despedida" solo lee `camiseta_donada`.** El análisis original la sacaba de `archived_at` de la camiseta, y ese campo lo borró v10 justo porque no significaba lo que parecía: lo estampaba `aplicarMovida` cada vez que una camiseta salía de "puesta", así que medía la última vez que te la quitaste, no cuánto vivió la identidad. Reconstruirla desde el respaldo `state:pre-v10` sería resucitar esa mala lectura. Consecuencia aceptada: **la tarjeta está vacía hasta que haya donaciones con `snapshot.created_at`**, y por eso se esconde sola cuando no hay datos. Las 16 donaciones viejas no lo tienen.
- **Los días se cortan en hora local**, no en UTC: lo que se marcó a las once de la noche pertenece al día que el usuario vivió. Cortar en UTC movería la racha, los días activos y la gráfica semanal de un usuario en América sin que nadie lo note.
- **Sin misiones marcadas no se dibuja nada**, y el texto describe el archivo («todavía no hay nada que mirar»), no al usuario. Nada de "llevas X días sin".

## Datos, codec y privacidad

- **Los mensajes personales no viajan en el codec** (14 jul 2026). Se escriben por WhatsApp, aparte. Compartir una camiseta no debe cargarle a nadie un rol que no pidió.
- **El app no sabe quién es el mentor de nadie.** El usuario elige el destinatario en WhatsApp: cada uno sabe.
- **El codec exporta por lista blanca**, campo por campo. Un campo nuevo no se filtra solo.
- **Los formatos legacy se leen para siempre.**
- **Las migraciones son acumulativas** y los respaldos crudos `state:pre-v7` / `state:pre-v8` nunca se sobrescriben.
- **El significado de `puesta` cambia con el rediseño del ritual diario.** Antes: identidad activa, duraba meses. Después: atención de un día. La migración v10 ya no depende de que alguien anote la fecha a mano: **escribe un evento `frontera_puesta_diaria`** en la historia de cada usuario, con su propio `ts`. Cualquier cálculo que cruce esa frontera lee dos cosas distintas bajo el mismo nombre y ahora tiene cómo saberlo. No afecta la duración de una identidad, que se mide de creación a archivo.
- **`archived_at` de la camiseta se elimina** (15 ago 2026). Hoy `aplicarMovida` lo estampa cada vez que una camiseta sale de "puesta" y lo pone en `null` cada vez que vuelve; con la atención diaria eso se reescribiría todas las noches y lavar la ropa lo estamparía en 19 camisetas de un golpe. El campo ya no tiene oficio: quitarse una camiseta no es archivarla, y la muerte de una identidad vive en el evento `camiseta_donada`, no en un campo de una camiseta que ya salió del array. Como reescribe un campo existente, esta sí lleva respaldo crudo `state:pre-v10`. **No confundir con el `archived_at` de una misión**, que se queda tal cual.
- **Cada camiseta puede tener un partner** (16 ago 2026, esquema v11). Un nombre, opcional, que **se queda en el teléfono**: no viaja en el codec —que exporta por lista blanca— ni sale en ninguna URL. Compartir una camiseta no debe cargarle a nadie un rol que no pidió.
- **El partner se pregunta al crear y al importar, no solo al editar** (17 ago 2026). Era un campo que solo existía en el formulario de edición, así que la única forma de tener partner era crear la camiseta y después acordarse de volver a entrar a editarla. Ahora el asistente de creación tiene un quinto paso opcional, y la hoja de importar pregunta antes de agregarla. **En la importación el nombre lo pone quien recibe, nunca el molde**: el codec no exporta el partner, y el decoder ignora un `partner` escrito a mano en un JSON — si no, quien te comparte una camiseta te estaría eligiendo con quién revisarla. Lo protege `tests/estado.test.mjs`. **Y no se sugiere ningún nombre**: quien te pasó la camiseta no tiene por qué ser con quien la revisas, así que el campo va vacío y el usuario escribe a quien quiera.
- **El check-in con el partner es un mensaje, no un evento** (16 ago 2026). Abre el share sheet con «Quisiera revisar contigo los avances con la camiseta X» y ahí se acaba: el app no manda nada, no sabe a quién se lo mandaste y **no registra que lo hiciste**. El destinatario se escoge en WhatsApp. Sin ecos, sin citas, sin reporte de avances — ver `docs/partner-checkins.md` para lo que quedó pendiente y por qué el reporte es lo más delicado de todo el plan.
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
