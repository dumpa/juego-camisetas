// ── Todo lo que el jefe dice ─────────────────────────────────────────────
//
// Este archivo existe para que reescribir la voz no obligue a tocar la
// lógica. Cambiar aquí no rompe nada: el motor solo pide strings.
//
// Tres reglas al escribir en este archivo:
//   · No se cuentan días ni ausencias. "Llevas doce días sin cerrar la
//     semana" es exactamente el reproche que el juego no hace (regla 6).
//   · No se pregunta por qué. El hueco se ve y se queda callado.
//   · Es el jefe hablándole al hacedor, no el app hablándole al usuario.
//     La diferencia se oye: el jefe da instrucciones, el app da avisos.

// Las variantes se rotan de forma estable dentro de una misma ocasión: la
// frase no cambia si abres el app tres veces seguidas, cambia de una semana
// a la otra. Que no parezca una máquina diciendo lo mismo, ni una máquina
// intentando parecer viva.
export const TEXTOS = {
  agendar: {
    semanal: [
      { titulo: 'El cierre de semana no tiene hora.',
        cuerpo: 'Ponle una y deja que el teléfono se acuerde por ti.' },
      { titulo: 'Dejé la semana sin cita.',
        cuerpo: 'Escoge el día. Lo demás lo hago yo.' },
      { titulo: 'Falta poner la hora del cierre.',
        cuerpo: 'Un ritual sin hora es un deseo.' },
    ],
    mensual: [
      { titulo: 'Hace falta mirar el juego mismo.',
        cuerpo: 'No las misiones: cómo estás jugando. Ponle fecha.' },
      { titulo: 'El observador también necesita cita.',
        cuerpo: 'Media hora, una vez, en el calendario.' },
    ],
    accion: 'ponerle hora',
    descartar: 'ahora no',
  },

  // El ritual diario no tiene cita en el calendario y sí tiene eco. La
  // diferencia no es un descuido: una alarma diaria se vuelve papel tapiz en
  // cuatro días y de paso te enseña a ignorar las otras. El eco, en cambio,
  // te encuentra dentro del app, que es donde ya estabas.
  //
  // Sale haya o no haya misiones marcadas, y esa es la corrección importante:
  // el ritual no termina en la lista, termina en la ropa escogida y en una
  // línea. Un día sin nada marcado puede tener mucho que contestar ahí —y a
  // veces es el que más—. Condicionar el eco a lo cumplido habría convertido
  // la reflexión en premio por rendimiento, que es la gamificación por la
  // puerta de atrás.
  //
  // Dos juegos de frases porque son dos momentos distintos del mismo acto:
  // en la mañana se escoge la ropa de hoy y el día está por delante; al caer
  // la tarde se escoge la de mañana y lo que se hace es entregar el turno. Un
  // texto que diga "cierra el día" a las ocho de la mañana está mintiendo.
  //
  // Ninguna de las dos cuenta nada ni celebra nada: nombran el gesto y se
  // callan (regla 6). Y ninguna dice "quién vas a ser": se viste una
  // camiseta, no se deja de ser algo.
  escogerLaRopa: {
    hoy: [
      { titulo: '¿Qué te vas a poner hoy?',
        cuerpo: 'El día cabe en dos o tres camisetas. Escógelas antes de arrancar.' },
      { titulo: 'La ropa de hoy está sin escoger.',
        cuerpo: 'Un minuto ahora te ahorra el día entero decidiendo.' },
      { titulo: 'Hoy todavía no tiene ropa.',
        cuerpo: 'Mira lo que traes puesto y quédate con lo que vas a jugar.' },
    ],
    manana: [
      { titulo: '¿Qué te vas a poner mañana?',
        cuerpo: 'Déjalo escogido y mañana el trabajo ya está esperándote.' },
      { titulo: 'Deja la ropa lista.',
        cuerpo: 'Lo que escojas hoy es lo que vas a encontrar abierto mañana.' },
      { titulo: 'Se acaba el día.',
        cuerpo: 'Quítate lo que ya no juega y deja puesto lo de mañana.' },
    ],
    // La etiqueta del botón también cambia con el momento: en la mañana se
    // escoge para el día que empieza, en la noche para el que viene.
    accion: {
      hoy: 'escoger la ropa de hoy',
      manana: 'escoger la ropa de mañana',
    },
    descartar: 'ahora no',
  },

  cita: {
    titulo: 'La próxima cita.',
    // Lo que se ve arriba de la hoja según de dónde venga.
    entradaCierre: 'Acabas de cerrar. ¿Cuándo vuelves?',
    entradaEco: 'Escoge cuándo y el teléfono se encarga del resto.',
    etiquetaCuando: 'cuándo',
    etiquetaNombre: 'cómo se va a llamar en tu calendario',
    ayudaNombre: 'Este nombre no sale del teléfono.',
    accion: 'poner en el calendario',
    descartar: 'ahora no',
    // Nombres por defecto del evento. El usuario los puede pisar.
    nombrePorDefecto: {
      semanal: 'El costurero',
      mensual: 'El observador del observador',
    },
    // Va en el cuerpo del evento del calendario, no en el app.
    descripcion: {
      semanal: 'Las misiones se podan. Otras nacen.',
      mensual: 'No las misiones: el juego mismo.',
    },
    // Chips de atajo. desplazamiento en días.
    atajos: [
      { label: 'mañana', dias: 1 },
      { label: 'en 3 días', dias: 3 },
      { label: 'en una semana', dias: 7 },
      { label: 'en un mes', dias: 30 },
    ],
    confirmacion: 'queda en tu calendario',
  },

  // Lo que se lee en el Diario junto a cada cadencia cuando ya hay cita.
  proxima: 'próxima',
  ponerHora: 'ponerle hora',
};

// Escoge una variante de forma estable: la misma semilla devuelve la misma
// frase siempre. La semilla es la ocasión (el año-semana, el año-mes), no
// el azar ni el reloj.
export function variante(lista, semilla = '') {
  if (!Array.isArray(lista) || lista.length === 0) return null;
  let h = 0;
  for (let i = 0; i < semilla.length; i++) h = (h * 31 + semilla.charCodeAt(i)) | 0;
  return lista[Math.abs(h) % lista.length];
}
