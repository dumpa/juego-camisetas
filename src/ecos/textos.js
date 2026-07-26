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
      semanal: 'Cierre de semana',
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
