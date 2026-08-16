# Los rituales — cómo quedaron construidos

Estado a **16 de agosto de 2026**, esquema **v11**.

Este documento es el puente entre la doctrina y el código: dice **dónde vive
cada cosa y qué forma tiene el dato**, para no tener que releer 3.900 líneas de
`App.jsx` antes de tocar un ritual.

**No es doctrina.** El *por qué* está en `docs/rituales.md` (qué pretende cada
ritual) y en `docs/decisiones.md` (qué se cerró y con qué razón). Si algo de
aquí contradice a esos dos, **gana la doctrina y esto está desactualizado**.
Tampoco es un plan: el plan y la historia viven en Notion.

---

## 1. El mapa

| Pieza | Dónde | Qué es |
|---|---|---|
| Estado, migraciones, `aplicarMovida`, `colocarEn`, `reordenarEntre`, `enJuego`, respaldo | `src/estado.js` | Lo único que sabe qué es un estado válido |
| Ecos, `paraQueDia`, `yaEscogio`, `calcularSeñales` | `src/ecos/` | Lo que el app se atreve a decir en voz alta |
| Comprobaciones del mensual y los dos bancos de preguntas | `src/observador/` | Cinco funciones puras + sus textos |
| `EscogerLaRopa`, `SesionCosturero`, `SesionObservador` | `src/App.jsx` | Las tres pantallas |
| Pruebas | `tests/*.test.mjs` | `npm test` |

Los tres módulos de lógica (`estado`, `ecos`, `observador`) están fuera de
`App.jsx` **para poder correrlos desde Node**. No es orden por el orden: las
migraciones y las reglas de "qué puede notar el app" son justo lo que no se
puede verificar mirando la pantalla.

---

## 2. Qué produce cada ritual

Lo importante de esta sección: **es lo que va a leer el observador dentro de
un año**. Todo lo que no quede aquí, no existió.

### Escoger la ropa (diario)

```js
sesiones[] += {
  id, date, tipo: 'diaria',
  para: '2026-08-16',                       // el día que se escogió
  quitadas: [{ id, nombre }],               // nombre congelado al escribir
  puestas:  [{ id, nombre }],
  notas: 'el día se fue en el mar',
}
```

Además, `aplicarMovida` deja `camiseta_retirada` / `camiseta_recuperada` por
cada movida, como cualquier otra.

Los nombres viajan junto a los ids **a propósito**: dentro de un año el id de
una camiseta donada no resuelve, y la sesión tiene que seguir pudiendo contar
qué se escogió ese día. Mismo patrón que `caliente_nombre`.

`para` es lo que hace que el ritual esté hecho *para un día* y no *en un día*:
si se hizo de noche apuntando a mañana, en la mañana no se vuelve a pedir.

### El costurero (semanal)

```js
sesiones[] += {
  id, date, tipo: 'semanal',
  calientes: [{ id, nombre, emoji }],   // varias, no una
  frias:     [{ id, nombre, emoji }],
  pregunta: '¿Qué le falta a tu día?',  // la del banco, esa semana
  notas: '…',                            // la respuesta, opcional
}
```

Las sesiones de antes del 16 de agosto guardan `caliente`/`fria` como un id
suelto más `caliente_nombre`. **La Historia lee las dos formas**; no se
migraron, porque las sesiones son historia y la historia no se reescribe.

Se entra escogiendo qué camiseta remendar y las misiones nuevas se siembran
**al cerrar**, no al teclearlas.

### El observador (mensual)

```js
sesiones[] += {
  id, date, tipo: 'mensual',
  hallazgo: 'derivaDePuntos',    // cuál comprobación salió, o null
  respuestas: [{ pregunta, respuesta }],   // solo las contestadas
  notas: 'pregunta → respuesta · pregunta → respuesta',
}
```

`hallazgo` existe para una sola cosa: que la comprobación del mes pasado pierda
fuerza el mes siguiente.

Las preguntas **salen todas** (una por pantalla) y todas se pueden pasar: las
pasadas no quedan en `respuestas`. Contestar ninguna es una sesión válida, y
se puede terminar a mitad de camino sin perder lo escrito.

---

## 3. Las trampas

Siete cosas que parecen inocentes y no lo son.

**El respaldo es lo único que hay.** Sin backend, si `localStorage` se desaloja
no queda nada en ninguna parte. De ahí que `RespaldoView` sea vista propia, que
tenga puerta en la bienvenida —quien llega a restaurar todavía no tiene
camisetas, y la bienvenida le ganaba el turno— y que restaurar muestre qué trae
el archivo antes de pisar nada.

**Reordenar necesita saber qué lista se está viendo.** `reordenarEntre` recibe
los ids visibles. Sin eso movía ±1 dentro de `s.camisetas` mientras la pantalla
mostraba solo las puestas, y la flecha intercambiaba la camiseta con algo
invisible: el clic no hacía nada. Ya se escapó una vez.

**La frontera de v10.** `puesta` significa dos cosas distintas según el lado de
la frontera: antes, una identidad activa que duraba meses; después, la atención
de un día. El evento `frontera_puesta_diaria` lleva el `ts` de cuándo cambió en
el teléfono de cada usuario. **Cualquier cálculo que cruce esa fecha está
sumando peras con manzanas** y tiene que consultarlo.

**`archived_at` ya no existe en la camiseta.** Lo escribía `aplicarMovida` cada
vez que una salía de "puesta"; con la atención diaria se reescribiría todas las
noches. La muerte de una identidad vive en el evento `camiseta_donada`. **El
`archived_at` de una MISIÓN sí existe y no se toca** — son campos distintos con
el mismo nombre.

**`camsActivas` ya no quiere decir "mis camisetas".** Quiere decir "las que
tengo puestas hoy". Un ritual o una pantalla que reciba `camsActivas` cuando
necesita el clóset entero se va a comportar bien un día y raro al siguiente.
Ya pasó una vez: el costurero recibía `camsActivas` y solo dejaba coser lo que
uno se hubiera puesto esa mañana.

**Nada se aplica mientras se escoge.** Los tres rituales acumulan en estado
local y escriben al cerrar. Es lo que hace verdad que *abandonar no es cerrar*:
salir por la X no mueve una camiseta ni siembra una misión.

**Las señales y los hallazgos no llevan número de días.** `calcularSeñales`
devuelve booleanos y las comprobaciones del observador solo hablan de
camisetas, misiones y puntos. Un contador de días en cualquiera de los dos
sitios es una racha con otro nombre, y va a parecer una buena idea.

---

## 4. Lo que verifican las pruebas

`npm test` — 55 casos, sin dependencias, solo el runner de Node.

Lo que cubren no es la mecánica sino **las reglas que se rompen sin querer**:

- `estado.test.mjs` — que exportar → importar → migrar **no pierda nada**. La
  migración puede añadir campos con su valor por defecto; no puede quitar ni
  cambiar. También que migrar dos veces dé lo mismo que migrar una, y que los
  respaldos crudos `pre-v7`, `pre-v8` y `pre-v10` no se sobrescriban.
- `ecos.test.mjs` — que el eco hable una vez por decisión, que se calle cuando
  el ritual ya se hizo, y que ningún texto diga *racha*, *llevas N días*,
  *cumplimiento* ni *desempeño*.
- `observador.test.mjs` — que se devuelva **una sola** comprobación y nunca un
  tablero, que todo termine en `?`, y que sin material se calle en vez de
  inventar.
- `codec.test.mjs` — round-trip de molde y snapshot.

Dos pruebas de `estado.test.mjs` merecen mención aparte porque cuidan promesas,
no comportamiento: que **el nombre del partner nunca salga en el molde** —la
garantía la da la lista blanca del codec, y la prueba existe porque es la clase
de promesa que se rompe en silencio el día que alguien la cambie por un
spread—, y que **un respaldo de una versión más nueva se rechace**.

**Al tocar el modelo de datos hay que sumarle un caso a `estado.test.mjs`** que
pruebe que no se pierde nada. Es más barato que descubrirlo en el teléfono.

---

## 5. Lo que no está construido

- Del **partner** está la v1 (campo + mensaje por el share sheet). Falta el eco
  de recordatorio y el reporte de avances, que es la pieza más delicada de todo
  el plan: un reporte leído por otra persona convierte el juego en una
  rendición de cuentas. Ver `docs/partner-checkins.md`.
- El **criterio de selección del eco**: qué fragmento propio merece volver. Hoy
  los ecos devuelven frases escritas, no material del usuario.
- El **banco de frases del manifiesto** para el ritual diario. La doctrina pide
  que muchos días no haya pregunta, solo una frase, y que las frases salgan del
  manifiesto del autor. Hoy la pregunta del diario es siempre la misma.
- El **doblado en bloque**, si algún día se hace: dentro del observador.
- El **onboarding** y el **manifiesto**.

Y una que solo se puede cerrar con uso: **cómo se calcula la camiseta
abandonada** ahora que "puesta" es atención diaria. Es la que se conserva en el
clóset y nunca se escoge; falta el umbral, y que no se lea como un reproche.
El material para calcularla ya se está guardando desde v10.
