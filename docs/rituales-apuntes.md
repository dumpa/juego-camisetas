# Los rituales — apuntes abiertos

Escrito el 25 de agosto de 2026, después de un ejercicio de análisis de un
respaldo. **Lo que quedó no fueron conclusiones sobre el usuario, sino siete
propiedades de la herramienta** que conviene tener a la vista al mirar los
rituales.

## Cómo usar este documento

**No es doctrina, no es especificación y no es una lista de arreglos.** Son
apuntes: cosas que valdría la pena mirar con calma antes de creerles. Ninguna
está resuelta.

- La doctrina está en `rituales.md`; dónde vive cada cosa, en
  `rituales-construido.md`. **Si algo de aquí contradice a esos dos, ganan
  ellos.**
- Marca de procedencia al lado de cada apunte:
  - **`código`** — se verifica leyendo el fuente, sin datos.
  - **`lectura`** — interpretación, discutible.
- Cada apunte cierra con **Sin resolver**.

---

## Corrección de partida: los rituales no tienen datos

Este documento nació de analizar `camisetas-08-15-26.json`, y la primera
versión estaba mal de raíz. Las fechas:

```
2026-08-15   fase0 rituales                          ← el respaldo es de este día
2026-08-16   Los tres rituales en su forma nueva
2026-08-16   src/observador/, src/ecos/
2026-08-20   costurero (revisión)
```

**El respaldo es del día en que arrancaron los rituales.** Las 42 sesiones que
contiene son check-ins del sistema anterior — la palabra que `rituales.md` §2
jubila explícitamente. No hay una sola sesión de *escoger la ropa*, del
*costurero* ni del *observador del observador* en ningún dato existente.

De ahí dos consecuencias para cualquiera que retome esto:

1. **Nada en este documento puede juzgar si un ritual «funciona».** No hay con
   qué. Las preguntas de uso —¿se hace?, ¿cada cuánto?, ¿se abandona?— están
   fuera de alcance y lo van a estar durante semanas.
2. **Sí se puede mirar el código contra sí mismo**, que es lo que queda. Todo
   lo que sigue se verifica leyendo el fuente; donde aparece un número del
   respaldo es como prueba de una propiedad del modelo de datos, nunca como
   medida de conducta.

El proyecto lleva desarrollo casi diario desde mayo. Cualquier análisis que
cruce una frontera de versión está sumando peras con manzanas — es la misma
trampa que ya está escrita en `rituales-construido.md` §3, y este documento la
pisó entera antes de esta corrección.

---

# Parte 1 · Siete propiedades de la herramienta

Todas verificables sin datos de uso.

## 01 · Hay dos registros del mismo hecho, y no cuentan lo mismo
`código`

Completar una misión escribe en dos sitios con alcances distintos:

| Registro | Qué recoge |
|---|---|
| `misiones[].completions[]` | **solo** las recurrentes — un ISO por vez |
| `misiones[].completed_at` | **solo** las de una vez — la fecha de cierre |
| `movimientos[]` | **las dos**, con `cam_id` y `monto` |

Cualquier lectura que use `completions[]` como si fuera «lo hecho» subcuenta
por completo las misiones de una vez, y por lo tanto vuelve invisible a
cualquier camiseta hecha sobre todo de ellas.

`misionesCompletadas()` en `src/observador/index.js` **hace bien esto**:
`(m.completions||[]).length + (m.completed_at ? 1 : 0)`. Vale la pena dejarlo
anotado porque es el sitio donde era más fácil equivocarse, y el análisis que
originó este documento se equivocó ahí dos veces seguidas antes de mirar el
código.

**Sin resolver**

- ¿Hay otros sitios que lean `completions[]` a secas? No se auditó el árbol
  completo.
- ¿Convendría una función única «veces que se hizo» y que nadie toque los
  arreglos directamente?

## 02 · `monto` lleva el multiplicador adentro
`código`

`App.jsx:390` guarda `monto = puntos(m)`, y `puntos(m)` es
`puntos_base × multiplicador(m)`. Es decir: el número que queda en el historial
**no es el que puso el jefe**, es ese número por el reloj.

Se comprueba mirando los montos guardados, que no son enteros:

```
1.4 = base 2 × 0.7        4.9 = base 7 × 0.7        3.5 = base 7 × 0.5
```

`verDerivaDePuntos` promedia ese `monto` y su texto remata con *«Nadie audita
eso sino tú»*. Pero una parte del movimiento del promedio la produce el
multiplicador: cerrar misiones viejas (×3) sube el promedio; encadenar hábitos
(×0,5) lo baja. Las dos cosas pasan sin que nadie toque un puntaje.

En `estado.js:162` los dos números ya aparecen distinguidos —*«snapshot
conservador, sin multiplicador histórico»*— así que la distinción existe en el
proyecto, solo que no en este camino.

**Sin resolver**

- ¿La comprobación quiere hablar del jefe o del reloj? Puede que incluir el
  multiplicador sea justo lo que se quiere.
- Si se quisiera separar, haría falta guardar también `base` en el movimiento.
  Es un campo nuevo en un registro histórico: hay que decidir si se migra o si
  solo aplica hacia adelante.

## 03 · El multiplicador supone que marcar es completo
`código` `lectura`

`multiplicador()` sube una misión de una vez a ×1,5 / ×2 / ×3 según los días
desde que se creó, mientras no esté `hecha`. La regla se cumple exactamente.

Lo que la regla **significa** es «creada hace 21+ días y sin marcar». Lo que se
**lee** en pantalla es «llevas 21 días sin hacer esto». Las dos coinciden solo
si marcar es completo. Si no lo es, el montón de ×3 mezcla dos cosas que el
sistema no puede separar: lo que falta y lo que ya se hizo sin cerrar.

No es un defecto del código. Es un supuesto, y conviene que esté escrito.

**Sin resolver**

- ¿Importa? Puede que un ×3 falso sea barato: se cierra y ya.
- Si importara, ¿dónde iría una barrida de cierre sin que se lea como
  «ponte al día»? El costurero es el candidato obvio y también el que más
  riesgo tiene de volverse contabilidad.

## 04 · Una camiseta sin recurrentes solo deja rastro a saltos
`código` `lectura`

Llamémoslo **el motor**: una misión recurrente viva es lo que permite que
ponerse una camiseta deje marca ese día. Sin ninguna, la camiseta solo escribe
historial cuando se cierra una misión de una vez — que puede ser cada varias
semanas, o nunca si el trabajo avanza sin cerrar nada.

Consecuencia en `calcularSeñales()`:

```
sinMisiones   falso mientras haya cualquier misión en juego, aunque
              ninguna se pueda marcar hoy
dormida       14 días desde el último movimiento; para una camiseta sin
              motor eso parpadea, no describe
```

Si esto mereciera una tercera señal, el costurero sería el sitio: es donde se
escribe el juego, y hablaría de la camiseta y no de la asistencia, que es lo
que piden las negativas de `rituales.md` §7.

> **Choca con el 05.** Si tener cosas a la vista ya es una función válida,
> «sin motor» no es un defecto que señalar sino un modo de uso. Los dos no se
> pueden aceptar a la vez sin decidir antes cuál de las dos cosas es.

**Sin resolver**

- ¿«Sin motor» es un problema o una forma legítima de camiseta?
- Una señal más en el costurero es una señal más que ignorar. ¿Cuántas aguanta
  esa pantalla?

## 05 · La camiseta de repisa no está modelada
`lectura`

Una camiseta puede estar cumpliendo su función solo con tener cosas a la
vista, sin que se juegue nada. Si eso es un modo de uso legítimo, hoy hay tres
piezas que lo tratan como falla:

```
dormida           14 días sin movimiento → se marca en el costurero
sinMisiones       ninguna misión en juego → se marca en el costurero
creacionVsJuego   «no se han jugado nunca. Armarlas es la parte divertida»
```

Y una cuarta cosa, de fondo: `dormida` se calcula desde `movimientos`, o sea
desde marcas. Es booleana y no dice días, así que **cumple la letra** de la
negativa contra el conteo de ausencias. Pero con marcado parcial puede querer
decir «se vivió sin marcarla», y el texto la nombra como conducta.

**Sin resolver**

- ¿Un modo declarado —«esta está de repisa»— es una preferencia útil o una
  configuración de más?
- Si la repisa existe, ¿queda fuera de `dormida` y `creacionVsJuego`, o solo
  del texto?
- ¿Se nota al usar la diferencia entre «no queda rastro de ella» y «hace rato
  no la juegas»?

## 06 · «Tarea» no es un concepto del app, es un mapeo del usuario
`código` `lectura`

El app tiene `forma: recurrente | facil | dificil`. No tiene «tarea». Que las
misiones de una vez sean tareas de proyecto es **cómo las usa un usuario**, no
una propiedad del sistema: una tarea es una misión, pero una misión no
necesariamente es una tarea, y otro usuario puede mapearlo distinto.

Donde eso se vuelve visible es en el texto de `tonoDeLasMisiones`:

> ¿El juego se te volvió una lista de pendientes? — Son hábitos sueltos, y los
> hábitos sueltos no necesitan camiseta.
> — `src/observador/textos.js`

La frase lleva adentro un supuesto: que una misión sin tono es una misión de
segunda. Para quien mete tareas de proyecto a propósito y le funciona, la
pregunta está contestada antes de hacerse. Y contestarla «sí, y está bien así»
no deja rastro: `hallazgo` solo le baja la fuerza el mes siguiente, y vuelve.

**Sin resolver**

- ¿Debería el app poder recordar un «sí, y está bien así» de forma durable, o
  eso ya es empezar a llevar cuentas de otra cosa?
- Si la proporción se midiera solo entre recurrentes, ¿qué queda de la
  comprobación?
- El umbral de 60% no se ha probado contra ningún corpus. ¿Es un número a ojo?

## 07 · El corpus que el observador va a leer se escribió con otras reglas
`código`

El observador es de la semana pasada. El material del que lee no:

```
misionesCompletadas()   barre camisetas[] y snapshots de donación — sin filtro de fecha
identidadesIdas()       lee eventos camiseta_donada con snapshot.created_at
verCreacionVsJuego()    camisetas[].created_at + movimientos[]
verDerivaDePuntos()     movimientos[] de las últimas dos ventanas de 30 días
```

Todo eso existe desde mayo, escrito bajo v7, v8, v9 y v10, cruzando la
frontera de `puesta` y la eliminación de `archived_at`. **El observador no
tiene arranque en frío: su primera sesión habla de la era anterior**, y no hay
en el módulo ninguna consulta a `frontera_puesta_diaria`, que es justo lo que
`rituales-construido.md` §3 dice que hay que consultar.

Caso concreto: `identidadesIdas()` solo cuenta donaciones. En v10 desapareció
`archived_at` y la salida real de una identidad quedó únicamente en
`camiseta_donada`. Para un usuario que saca camisetas de circulación dejándolas
en el clóset, esas muertes no se registran en ninguna parte — y dos de las
cinco comprobaciones dependen de tener al menos tres. Es el hilo abierto n.º 1
de `rituales.md`, ahora con su costo visible: el 40% del observador.

**Sin resolver**

- ¿Debería el observador ignorar el material anterior a la frontera, o
  aprovecharlo advirtiendo que es de otra era?
- ¿Se quiere que donar sea la única muerte? Tiene su lógica: donar es un acto,
  abandonar no.
- Con «puesta» ya diaria, ¿desde cuántos días sin escogerse se considera ida
  una camiseta? El umbral no está.

---

# Parte 2 · El circuito que todavía no está cableado

`rituales.md` §8 promete:

> El ritual diario produce, sin que nadie escriba nada, el material que el
> observador necesita: qué te pusiste, qué escogiste una sola vez, qué nunca
> sacaste del clóset.

Ese material se está guardando desde v10: `sesiones[]` con `tipo: 'diaria'`,
`para`, `puestas[]` y `quitadas[]`, con nombre congelado.

**Ninguna de las cinco comprobaciones del observador lee `sesiones[]`.** Las
cinco leen `camisetas[]`, `movimientos[]` y `eventos[]`. El circuito está
descrito en la doctrina y guardado en el estado, pero no conectado en el
módulo.

Un matiz para no leer esto como una contradicción: la única mención a
`sesiones` en `src/observador/index.js` es un comentario de la lista de
prohibiciones —*«el conteo de sesiones por tipo, salvo que se leyera como
balance entre el jefe y el hacedor»*—. Pero **contar sesiones y leer
`puestas[]`/`quitadas[]` no son la misma cosa**: lo primero mide asistencia,
lo segundo mide qué identidades se escogieron. La prohibición cubre lo primero
y deja lo segundo disponible; hoy no se usa ninguno de los dos.

Eso importa más de lo normal ahora, porque es exactamente el material que **sí
va a existir** dentro de unas semanas y el único que no arrastra la frontera:
nació con los rituales nuevos.

**Sin resolver**

- ¿Se dejó fuera a propósito —por ejemplo, porque «qué escogiste» roza la
  asistencia— o simplemente todavía no?
- «Qué nunca sacaste del clóset» es la camiseta abandonada del hilo abierto
  n.º 1. ¿Es la misma pieza vista desde otro lado?
- Una comprobación sobre elecciones diarias, ¿cómo se escribe sin que se lea
  como conteo de ausencias? Es la más delicada de las que faltan.

---

# Parte 3 · Qué convendría poder mirar cuando lleguen los datos

No es una lista de tareas: es lo que hoy no se podría reconstruir después si
nadie lo deja escrito ahora.

- **Si el diario se hace de mañana o de noche.** `para` ya lo permite deducir
  comparando con `date`. No hace falta nada nuevo; hace falta acordarse de que
  se puede.
- **Si el costurero se abre por la cita o por otro camino.** Hoy no hay cómo
  distinguirlo. La doctrina apuesta a que al jefe solo lo cita una versión
  anterior de sí mismo; si la apuesta falla, no habría cómo enterarse.
- **Cuántas veces el observador se calla.** `mirar()` devolviendo `null` no
  deja rastro. Si se callara siempre, la sesión seguiría abriéndose igual y
  nadie lo sabría.
- **Si «sí, y está bien así» es una respuesta frecuente.** Hoy las respuestas
  pasadas no quedan en `respuestas[]`, solo las contestadas. Distinguir
  «pasé» de «contesté que está bien» puede ser información distinta.

Ninguna de estas cuatro pide instrumentación nueva salvo la tercera, y esa
choca de frente con la negativa de no contar ausencias — aunque aquí la
ausencia sería del app, no del jugador.

---

## Procedencia

- **Fuente leída:** `src/observador/index.js`, `src/observador/textos.js`,
  `src/ecos/index.js`, `src/App.jsx`, `src/estado.js`, `docs/rituales.md`,
  `docs/rituales-construido.md`.
- **Historial:** `git log` — los rituales en su forma actual son del 15 al 20
  de agosto de 2026.
- **Datos:** `backup camisetas/camisetas-08-15-26.json`, usado **solo** para
  comprobar propiedades del modelo de datos (que `monto` no es entero, que
  `completions[]` no recoge las de una vez). Sus 42 sesiones son check-ins del
  sistema anterior y no dicen nada sobre estos rituales.
- **Lo que este documento no puede responder:** si los rituales funcionan, si
  se usan, o cada cuánto. No hay datos y no los va a haber por un tiempo.
