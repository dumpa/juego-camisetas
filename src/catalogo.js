// El catálogo: las camisetas pre-establecidas que un usuario puede "comprar"
// para empezar a jugar sin construir desde cero. Este archivo es el único sitio
// donde se edita. Al comprar, `comprarCamiseta()` en App.jsx COPIA el contenido
// a una camiseta nueva del usuario: editar aquí no toca las camisetas que ya
// alguien compró, ni les llega el cambio después.
//
// Reglas al editar:
// - El `id` (con su sufijo de versión) queda guardado en `origen_camiseta_id` de
//   cada camiseta comprada, y es lo que hace que el catálogo diga "ya la tienes".
//   Cambiar el `id` rompe ese vínculo. Si una camiseta cambia tanto que ya es
//   otra cosa, súbele la versión (-v1 → -v2) a propósito: es una entrada nueva.
// - `precio: 0` = regalo de bienvenida. `arco: null` si no tiene arco.
// - `forma`: 'facil' | 'dificil' | 'recurrente'.
// - `tonos`: ids de TONOS en App.jsx — 'fisica' | 'emocional' | 'creativa' | 'estrategica'.
//   (van sin tilde: 'estrategica'). Lista vacía = sin tono.
// - `puntos_base`: el número crudo; el multiplicador lo pone el juego, no el catálogo.
// - `milestones`: cada uno con `nombre` y `regalo` (texto libre, el regalo lo cobra
//   el usuario en el mundo real). Puede ir vacío.
export const CATALOGO = [
  {
    id: 'mi-primera-camiseta-v1',
    nombre: 'Mi primera camiseta',
    emoji: '👕',
    esencia: 'Aprende a jugar, jugando.',
    arco: { de: 'espectador', a: 'jugador' },
    precio: 0,
    creador_id: 'dumpa',
    misiones: [
      { nombre: 'Tiende tu cama',                        forma: 'recurrente', tonos: [],                          puntos_base: 2 },
      { nombre: 'Lava un plato (u ordena un cajón)',     forma: 'facil',      tonos: [],                          puntos_base: 1 },
      { nombre: 'Cierra tu día',                         forma: 'recurrente', tonos: [],                          puntos_base: 2 },
      { nombre: 'Dile a alguien "te quiero"',            forma: 'dificil',    tonos: ['emocional'],               puntos_base: 3 },
      { nombre: 'Crea tu primera camiseta',              forma: 'dificil',    tonos: ['creativa'],                puntos_base: 3 },
      { nombre: 'Invita a alguien a crear la suya',      forma: 'dificil',    tonos: ['emocional','estrategica'], puntos_base: 3 },
    ],
    milestones: [
      { nombre: 'Tendiste la cama toda la semana', regalo: 'Cómprate un chocolate (o regálate un paseo) 🍫' },
      { nombre: 'Llegaste a 3 camisetas',          regalo: 'Ve a cine 🎬' },
    ],
  },
  {
    id: 'curiosidad-v1',
    nombre: 'Curiosidad',
    emoji: '🌱',
    esencia: 'Con la curiosidad descubro el mundo.',
    arco: null,
    precio: 0,
    creador_id: 'dumpa',
    misiones: [
      { nombre: 'Saltar sobre algo',                       forma: 'facil',     tonos: ['fisica'],            puntos_base: 1 },
      { nombre: 'Pasar por debajo de algo',                forma: 'facil',     tonos: ['fisica'],            puntos_base: 1 },
      { nombre: 'Encontrar un portal',                     forma: 'dificil',      tonos: ['creativa','emocional'], puntos_base: 3 },
      { nombre: 'Meterse a un río o lago',                 forma: 'dificil',      tonos: ['fisica','emocional'], puntos_base: 3 },
      { nombre: 'Probar algo que nunca has probado',       forma: 'dificil',      tonos: ['creativa'],          puntos_base: 2 },
      { nombre: 'Una cita con la curiosidad',              forma: 'recurrente', tonos: ['emocional','creativa'], puntos_base: 2 },
    ],
    milestones: [],
  },
  {
    id: 'creatividad-v1',
    nombre: 'Creatividad',
    emoji: '🔥',
    esencia: 'Con la creatividad cambio el mundo.',
    arco: null,
    precio: 15,
    creador_id: 'dumpa',
    misiones: [
      { nombre: 'Hacer algo y dárselo a alguien',          forma: 'dificil',      tonos: ['creativa','emocional'], puntos_base: 3 },
      { nombre: 'Combinar dos cosas que no van juntas',    forma: 'facil',     tonos: ['creativa'],          puntos_base: 1 },
      { nombre: 'Crear algo efímero (menos de un día)',    forma: 'dificil',      tonos: ['creativa'],          puntos_base: 2 },
      { nombre: 'Cambiar algo de tu entorno',              forma: 'facil',     tonos: ['creativa'],          puntos_base: 1 },
      { nombre: 'Solución absurda primero',                forma: 'recurrente', tonos: ['creativa','estrategica'], puntos_base: 2 },
      { nombre: 'Hacer algo sin ninguna utilidad',         forma: 'recurrente', tonos: ['creativa'],          puntos_base: 2 },
    ],
    milestones: [],
  },
  {
    id: 'sueno-v1',
    nombre: 'Sueño',
    emoji: '🌙',
    esencia: 'Consciente con el sueño.',
    arco: { de: 'Acostarse', a: 'Descanso real' },
    precio: 100,
    creador_id: 'dumpa',
    misiones: [
      { nombre: 'Dejar el celular fuera del cuarto',     forma: 'recurrente', tonos: [],                       puntos_base: 2 },
      { nombre: 'La cama solo para dormir',              forma: 'recurrente', tonos: [],                       puntos_base: 2 },
      { nombre: 'Dejar pantallas una hora antes',        forma: 'recurrente', tonos: [],                       puntos_base: 2 },
      { nombre: 'Definir horario de sueño',              forma: 'facil',      tonos: ['estrategica'],          puntos_base: 1 },
      { nombre: 'No tomar café después de las 5pm',      forma: 'recurrente', tonos: ['fisica','estrategica'], puntos_base: 2 },
      { nombre: 'Hacer los 10k pasos',                   forma: 'recurrente', tonos: ['fisica'],               puntos_base: 2 },
    ],
    milestones: [
      { nombre: '8 horas de buen sueño', regalo: 'Gelato 🍧' },
    ],
  },
];
