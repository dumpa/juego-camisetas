// ── Lo que el observador pregunta ────────────────────────────────────────
//
// El observador no mira el trabajo: mira los instrumentos con que el jefe
// mide el trabajo. Por eso ninguna de estas frases felicita, ninguna alarma y
// ninguna dice qué hacer. Todas terminan en pregunta y todas se pueden
// contestar con "sí, y está bien así".
//
// Reglas al escribir aquí, además de las de `src/ecos/textos.js`:
//   · Se enseña el número que se calculó, sin adjetivos. "Dos de cada tres"
//     es material; "preocupante" es un juicio, y el juicio le toca a él.
//   · Nada de asistencia. Ninguna de estas frases puede hablar de días que
//     entraste, cerraste o faltaste: solo de camisetas, misiones y puntos.
//   · La pregunta es de verdad abierta. Si solo tiene una respuesta correcta,
//     no es una pregunta: es un regaño con signo de interrogación.

export const HALLAZGOS = {
  // El nivel del juego que el jefe está escribiendo.
  tonoDeLasMisiones: {
    pregunta: '¿El juego se te volvió una lista de pendientes?',
    cuerpo: (m) => `${m.sinTono} de cada ${m.total} misiones que completaste no tienen tono. Son hábitos sueltos, y los hábitos sueltos no necesitan camiseta.`,
  },
  tonoDominante: {
    pregunta: (m) => `Casi todo lo que juegas es ${m.tono}. ¿Es eso lo que querías?`,
    cuerpo: (m) => `${m.cuantas} de ${m.total} misiones completadas llevan ese tono. Los otros cuatro están casi sin usar.`,
  },

  // Una identidad dura lo que dura. La referencia es la del propio usuario.
  identidadLarga: {
    pregunta: (m) => `«${m.nombre}» lleva más viva que cualquiera que hayas tenido. ¿Sigue siendo la misma?`,
    cuerpo: (m) => `Tus identidades han durado alrededor de ${m.tipico} días. Esta va en ${m.dias}. Puede que se haya quedado, o puede que ya sea otra cosa y merezca remendarse o recombinarse.`,
  },

  // Las dos muertes de una camiseta, que no son la misma.
  gastadaVsAbandonada: {
    pregunta: '¿Las últimas camisetas que soltaste se gastaron o se abandonaron?',
    cuerpo: (m) => `Las últimas que dejaste ir llevaban ${m.misiones} misiones entre todas. Una camiseta que se usó bien deja rastro; una que se abandonó, casi ninguno.`,
  },

  // Un diagnóstico del jefe, no del hacedor.
  creacionVsJuego: {
    pregunta: '¿Estás armando camisetas más rápido de lo que las juegas?',
    cuerpo: (m) => `De las ${m.creadas} que armaste últimamente, ${m.sinJugar} no se han jugado nunca. Armarlas es la parte divertida.`,
  },

  // El jefe que se infla los puntos. El dato ya estaba guardado.
  derivaDePuntos: {
    pregunta: (m) => m.subio
      ? '¿Los puntos que te estás dando siguen queriendo decir lo mismo?'
      : '¿Le estás bajando el precio a tu propio trabajo?',
    cuerpo: (m) => `Lo que vale una misión tuya pasó de ${m.antes} a ${m.ahora} puntos en promedio. Nadie audita eso sino tú.`,
  },
};

// Las difíciles. No se calculan: se rotan, estables dentro del mismo mes.
//
// Son las que no caben en ninguna otra silla. El diario no las puede hacer
// —no se contesta en un respiro— y el costurero tampoco —no son sobre el
// trabajo, son sobre para qué—.
export const PREGUNTAS_DIFICILES = [
  { titulo: '¿Qué pregunta llevas meses sin contestar?',
    ayuda: 'No la que no sabes responder: la que no te has sentado a responder.' },
  { titulo: '¿En qué meta larga no sientes que avanzas?',
    ayuda: 'Y si es así hace rato, ¿sigue siendo tuya?' },
  { titulo: '¿Qué no está en el clóset y podría estar?',
    ayuda: 'Algo que ya estás viviendo sin nombre todavía.' },
  { titulo: '¿Cómo te disrumpirías a ti mismo?',
    ayuda: 'Si alguien quisiera dejarte obsoleto, ¿por dónde empezaría?' },
  { titulo: '¿Qué estás sosteniendo solo porque ya lo empezaste?',
    ayuda: 'Terminar no siempre es la virtud.' },
  { titulo: '¿Quién quieres ser el año entrante?',
    ayuda: 'Y qué de lo que tienes puesto te lleva para allá.' },
];

export const TEXTOS_OBSERVADOR = {
  titulo: 'El observador del observador',
  entrada: 'Esta es la única sesión que puede desconfiar de las otras dos. No mira tu trabajo: mira con qué lo estás midiendo.',
  sinMaterial: {
    titulo: 'Todavía no hay con qué mirarte.',
    cuerpo: 'El material de esta sesión lo produce el uso: misiones completadas, camisetas que van y vienen. Vuelve cuando el juego lleve más rodaje.',
  },
  etiquetaHallazgo: 'lo que dicen tus datos',
  etiquetaRespuesta: 'tu respuesta',
  respuestaLibre: 'Sin respuesta correcta. También vale "sí, y está bien así".',
  cerrar: 'cerrar el mes',
};
