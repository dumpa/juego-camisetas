# Los rituales — cómo quedaron construidos

Estado a **16 de agosto de 2026**, esquema **v10**.

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
| Estado, migraciones, `aplicarMovida`, `enJuego` | `src/estado.js` | Lo único que sabe qué es un estado válido |
| Ecos, `paraQueDia`, `yaEscogio`, `calcularSeñales` | `src/ecos/` | Lo que el app se atreve a decir en voz alta |
| Comprobaciones del mensual | `src/observador/` | Cinco funciones puras + sus textos |
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
sesiones[] += { id, date, tipo: 'semanal', notas, caliente, fria, }
```

Sin cambios de forma respecto a la versión anterior. Lo que cambió es el
camino: se entra escogiendo qué camiseta remendar y las misiones nuevas se
siembran **al cerrar**, no al teclearlas.

### El observador (mensual)

```js
sesiones[] += {
  id, date, tipo: 'mensual',
  hallazgo: 'derivaDePuntos',    // cuál comprobación salió, o null
  pregunta: '¿En qué meta larga…?',
  honesto: '…',                  // la respuesta a la difícil
  notas: 'pregunta → respuesta · pregunta → respuesta',
}
```

`hallazgo` existe para una sola cosa: que la comprobación del mes pasado pierda
fuerza el mes siguiente.

---

## 3. Las trampas

Cinco cosas que parecen inocentes y no lo son.

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

`npm test` — 39 casos, sin dependencias, solo el runner de Node.

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

**Al tocar el modelo de datos hay que sumarle un caso a `estado.test.mjs`** que
pruebe que no se pierde nada. Es más barato que descubrirlo en el teléfono.

---

## 5. Lo que no está construido

- El **partner por camiseta** y el reporte al partner (`docs/partner-checkins.md`).
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
