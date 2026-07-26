import { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, Check, X, GripVertical, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Archive, RotateCcw, Edit2, Minus, Sun, Hexagon, BookOpen, Flame, Snowflake, Share2, Download, Copy, Inbox, Upload, AlertTriangle, Trash2, Filter, Smartphone, MoreVertical, Home } from 'lucide-react';
import { encodeCamisetaToPng, generateCamisetaSVG, decodeImageToCamiseta, encodeCamisetaToJSON, decodeJSONToCamiseta } from './codec/index.js';
import { elegirEco, silenciarEco, citaVigente } from './ecos/index.js';
import { TEXTOS } from './ecos/textos.js';
import { construirICS, entregarCita, proximaCita, DURACION, aInputLocal, deInputLocal } from './cita.js';

const STATE_KEY = 'juego-camisetas:state:v1';
const INSTALL_KEY = 'juego-camisetas:install-ack:v1';
// v7: respaldos automáticos. PRE_V7 congela el estado crudo la primera vez
// que corre la migración v7 (una sola vez, nunca se sobrescribe).
// IMPORT_BACKUP guarda lo que había antes de cada import manual.
const BACKUP_PRE_V7_KEY = 'juego-camisetas:state:pre-v7';
const BACKUP_PRE_V8_KEY = 'juego-camisetas:state:pre-v8';
const IMPORT_BACKUP_KEY = 'juego-camisetas:state:import-backup';
const DAY = 86400000;

// ── v8: el clóset es un mueble ───────────────────────────────────────────
// Cinco ganchos fijos (no configurables, a propósito: en el momento en que
// sea un ajuste alguien lo sube a veinte) y cerros ilimitados. Cada camiseta
// está en exactamente un sitio.
const GANCHOS = 5;
const CERRO_SIN_DOBLAR = 'sin-doblar';
const cerroSistema = () => ({ id: CERRO_SIN_DOBLAR, nombre: 'sin doblar', orden: 0, esDelSistema: true });
const PUESTA = () => ({ tipo: 'puesta' });
const AL_SIN_DOBLAR = () => ({ tipo: 'cerro', cerroId: CERRO_SIN_DOBLAR });
const estaPuesta = (c) => c?.ubicacion?.tipo === 'puesta';
const enGancho = (c, i) => c?.ubicacion?.tipo === 'gancho' && c.ubicacion.posicion === i;
const enCerro = (c, id) => c?.ubicacion?.tipo === 'cerro' && c.ubicacion.cerroId === id;
const mismaUbicacion = (a, b) => !!a && !!b && a.tipo === b.tipo &&
  a.posicion === b.posicion && a.cerroId === b.cerroId;

// ¿Está corriendo ya instalada (desde el ícono del home), no en el navegador?
function isStandalone() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true   // iOS Safari
  );
}

const emptyState = () => ({
  user_id: 'local', version: 9, created_at: new Date().toISOString(),
  camisetas: [], sesiones: [], eventos: [], movimientos: [], visitas: [],
  cerros: [cerroSistema()], ecos: { silencios: {} },
});

async function loadState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // v7: antes de migrar por primera vez, congelar el estado crudo tal
      // cual estaba. Si la migración algún día resulta tener un bug, el
      // original sigue intacto en este key.
      try {
        if ((parsed.version || 0) < 7 && !localStorage.getItem(BACKUP_PRE_V7_KEY)) {
          localStorage.setItem(BACKUP_PRE_V7_KEY, raw);
        }
        // v8: mismo seguro antes de repartir las camisetas por el mueble.
        if ((parsed.version || 0) < 8 && !localStorage.getItem(BACKUP_PRE_V8_KEY)) {
          localStorage.setItem(BACKUP_PRE_V8_KEY, raw);
        }
      } catch {}
      const s = migrate(parsed);
      registrarVisita(s);
      return s;
    }
  } catch (e) {
    console.error('loadState error:', e);
  }
  const s = emptyState();
  registrarVisita(s);
  return s;
}

// v7: registro de aperturas. Se guardan TODAS (el patrón de hora del día
// distingue al jefe del hacedor), con dos economías: precisión al minuto
// (el segundo no aporta) y filtro de ráfaga (cerrar/reabrir en <10 min es
// una sola entrada conceptual). Devuelve true si registró.
function registrarVisita(s) {
  if (!s.visitas) s.visitas = [];
  const ultima = s.visitas[s.visitas.length - 1]?.ts;
  if (ultima && (Date.now() - new Date(ultima).getTime()) < 10 * 60 * 1000) return false;
  s.visitas.push({ ts: nowISO().slice(0, 16) + 'Z' });
  return true;
}
async function saveState(state) {
  try {
    const { _saveError, ...clean } = state;
    localStorage.setItem(STATE_KEY, JSON.stringify(clean));
    return true;
  } catch (e) {
    console.error('saveState error:', e);
    return false;
  }
}
function migrate(s) {
  if (!s.eventos) s.eventos = [];
  if (!s.sesiones) s.sesiones = [];
  if (!s.movimientos) s.movimientos = [];
  if (!s.user_id) s.user_id = 'local';
  const tipoMap = {
    rapida: { forma: 'facil', tonos: [] },
    habito: { forma: 'recurrente', tonos: [] },
    profunda: { forma: 'dificil', tonos: ['profunda'] },
    fisica: { forma: 'dificil', tonos: ['fisica'] },
    emocional: { forma: 'dificil', tonos: ['emocional'] },
    creativa: { forma: 'dificil', tonos: ['creativa'] },
    estrategica: { forma: 'dificil', tonos: ['estrategica'] },
  };
  const pd = { dificil: 3, facil: 1, recurrente: 2 };
  s.camisetas?.forEach(cam => {
    // v4: campos de propiedad/origen para preparar mercado
    if (!cam.creador_id) cam.creador_id = s.user_id;
    if (!cam.origen) cam.origen = 'propia';
    if (cam.origen_camiseta_id === undefined) cam.origen_camiseta_id = null;
    if (cam.precio === undefined) cam.precio = null;
    cam.misiones?.forEach(m => {
      if (!m.forma) {
        const mapped = tipoMap[m.tipo] || { forma: 'dificil', tonos: [] };
        m.forma = mapped.forma; m.tonos = mapped.tonos;
      }
      if (!m.tonos) m.tonos = [];
      if (m.puntos_base == null) m.puntos_base = pd[m.forma] || 1;
      if (!m.completions) m.completions = [];
      // v4: autoría de la misión
      if (!m.autor_id) m.autor_id = s.user_id;
      if (m.asignada_por === undefined) m.asignada_por = null;
    });
    cam.milestones?.forEach(ms => {
      if (ms.regalo === undefined) ms.regalo = '';
      if (ms.regalo_cobrado_at === undefined) ms.regalo_cobrado_at = null;
    });
  });
  // v4: si no hay movimientos pero hay completions históricas, generar retroactivamente
  if (s.version < 4 && s.movimientos.length === 0) {
    s.camisetas?.forEach(cam => {
      cam.misiones?.forEach(m => {
        const monto = m.puntos_base; // snapshot conservador, sin multiplicador histórico
        if (m.completed_at) {
          s.movimientos.push({
            id: Math.random().toString(36).slice(2, 11),
            ts: m.completed_at,
            tipo: 'mision_completada',
            cam_id: cam.id, mision_id: m.id,
            monto,
          });
        }
        m.completions?.forEach(c => {
          s.movimientos.push({
            id: Math.random().toString(36).slice(2, 11),
            ts: c,
            tipo: 'mision_completada',
            cam_id: cam.id, mision_id: m.id,
            monto,
          });
        });
      });
    });
  }
  // v5: corrige eventos de cierre cuyo tipo quedó como 'diaria'/'semanal'/
  // 'mensual' debido al bug del spread en logSesion. Renombra a 'sesion_*'
  // para que el EventoItem switch, el filtro y el acordeón los reconozcan.
  if (s.version < 5) {
    s.eventos?.forEach(e => {
      if (e.tipo === 'diaria' || e.tipo === 'semanal' || e.tipo === 'mensual') {
        e.tipo = `sesion_${e.tipo}`;
      }
    });
  }
  // v6: rename forma values to use difficulty-aligned names.
  //   rapida → facil (era "una vez, fácil/poco peso")
  //   unica → dificil (era "una vez, importante/peso real")
  //   recurrente queda como recurrente
  if (s.version < 6) {
    s.camisetas?.forEach(cam => {
      cam.misiones?.forEach(m => {
        if (m.forma === 'rapida') m.forma = 'facil';
        else if (m.forma === 'unica') m.forma = 'dificil';
      });
    });
  }
  // v7 — capa de escritura para el eco (aditiva, cero lectura):
  //   · s.visitas[]: registro de aperturas del app
  //   · un evento 'snapshot' (baseline: true) por camiseta existente:
  //     congela los textos de HOY como historia consultable aunque se
  //     editen mañana. baseline = "así estaba en la migración", no
  //     "escrito ese día" — el eco no debe fabricar recuerdos falsos.
  //   · sesiones viejas en eventos: resolver caliente/fria a nombre
  //     mientras la camiseta todavía exista para hacer el lookup.
  if (s.version < 7) {
    if (!s.visitas) s.visitas = [];
    const ts = nowISO();
    s.camisetas?.forEach(cam => {
      s.eventos.push({
        id: uid(), ts, baseline: true, tipo: 'snapshot',
        cam_id: cam.id, nombre: cam.nombre, emoji: cam.emoji,
        esencia: cam.esencia ?? '', arco: cam.arco ?? null,
        misiones: (cam.misiones || []).map(m => ({
          id: m.id, nombre: m.nombre, forma: m.forma, tonos: m.tonos || [],
          puntos_base: m.puntos_base, estado: m.estado ?? (m.completed_at ? 'hecha' : 'activa'),
        })),
        milestones: (cam.milestones || []).map(ms => ({
          id: ms.id, nombre: ms.nombre, descripcion: ms.descripcion ?? '',
          regalo: ms.regalo ?? '', estado: ms.estado,
        })),
      });
    });
    s.eventos?.forEach(e => {
      if (!e.tipo?.startsWith('sesion_')) return;
      if (e.caliente && e.caliente_nombre === undefined) {
        e.caliente_nombre = s.camisetas?.find(c => c.id === e.caliente)?.nombre ?? null;
      }
      if (e.fria && e.fria_nombre === undefined) {
        e.fria_nombre = s.camisetas?.find(c => c.id === e.fria)?.nombre ?? null;
      }
    });
  }
  // v8 — el clóset deja de ser una lista y pasa a ser un mueble:
  //   · s.cerros[]: montones con nombre. Uno del sistema, 'sin doblar',
  //     que no se borra ni se renombra.
  //   · cada camiseta gana ubicacion: puesta | gancho(0..4) | cerro(id).
  // Va sin candado de versión y a propósito: no asume nada, valida lo que
  // encuentra y solo escribe lo que falta o quedó inválido. Correrla dos
  // veces no mueve una sola camiseta. Al salir de aquí ninguna camiseta
  // puede quedar sin ubicación.
  if (!Array.isArray(s.cerros)) s.cerros = [];
  if (!s.cerros.some(c => c.id === CERRO_SIN_DOBLAR)) s.cerros.unshift(cerroSistema());
  s.cerros.forEach((c, i) => {
    if (typeof c.orden !== 'number') c.orden = i;
    if (typeof c.esDelSistema !== 'boolean') c.esDelSistema = c.id === CERRO_SIN_DOBLAR;
    if (c.id === CERRO_SIN_DOBLAR) c.esDelSistema = true;
  });
  {
    const idsCerro = new Set(s.cerros.map(c => c.id));
    const ganchoTomado = new Set();
    s.camisetas?.forEach(cam => {
      const u = cam.ubicacion;
      let valida = false;
      if (u?.tipo === 'puesta') valida = true;
      else if (u?.tipo === 'gancho' && Number.isInteger(u.posicion) &&
               u.posicion >= 0 && u.posicion < GANCHOS && !ganchoTomado.has(u.posicion)) {
        ganchoTomado.add(u.posicion); valida = true;
      } else if (u?.tipo === 'cerro' && idsCerro.has(u.cerroId)) valida = true;
      // Primera corrida: lo que está archivado cae al cerro sin doblar, lo
      // puesto sigue puesto, los cinco ganchos arrancan vacíos. Las donadas
      // ya no están en el array, así que no se tocan.
      if (!valida) cam.ubicacion = cam.archived_at ? AL_SIN_DOBLAR() : PUESTA();
    });
  }
  // v9 — el eco necesita recordar qué ya dijo:
  //   · s.ecos.silencios[clave] = ts del descarte. Nada más.
  // No lleva respaldo pre-v9 como v7 y v8 porque no reescribe un solo dato
  // existente: crea una llave vacía. Un respaldo aquí sería una tercera
  // copia del estado completo en localStorage a cambio de nada.
  // Las citas NO viven en una tabla propia: se escriben como evento
  // 'cita_agendada' en la historia, que es donde va lo que el jefe decide.
  if (!s.ecos || typeof s.ecos !== 'object') s.ecos = {};
  if (!s.ecos.silencios || typeof s.ecos.silencios !== 'object') s.ecos.silencios = {};
  s.version = 9;
  return s;
}

// Escribe un evento en la historia. Módulo, no closure: lo usan tanto los
// handlers de App como aplicarMovida.
const pushEvento = (s, ev) => { s.eventos.push({ id: uid(), ts: nowISO(), ...ev }); };

// Una ubicación que existe de verdad. Un gancho fuera de rango o un cerro
// borrado no dejan a la camiseta en el aire: caen al cerro sin doblar.
function normalizarUbicacion(s, u) {
  if (u?.tipo === 'puesta') return PUESTA();
  if (u?.tipo === 'gancho' && Number.isInteger(u.posicion) && u.posicion >= 0 && u.posicion < GANCHOS) {
    return { tipo: 'gancho', posicion: u.posicion };
  }
  if (u?.tipo === 'cerro' && s.cerros?.some(c => c.id === u.cerroId)) {
    return { tipo: 'cerro', cerroId: u.cerroId };
  }
  return AL_SIN_DOBLAR();
}

// El único camino por el que una camiseta cambia de sitio. Guardar a mano,
// arrastrar y lavar la ropa pasan todos por aquí: un solo camino, no dos.
function aplicarMovida(s, camId, destino, opts = {}) {
  const c = s.camisetas.find(x => x.id === camId);
  if (!c) return false;
  const antes = c.ubicacion;
  const dest = normalizarUbicacion(s, destino);
  if (mismaUbicacion(antes, dest)) return false;
  // En un gancho no caben dos. Si la que llega venía de otro gancho, los dos
  // se intercambian —eso es reordenar los ganchos entre sí—; si venía de
  // fuera, la que estaba baja al cerro sin doblar.
  if (dest.tipo === 'gancho') {
    const ocupante = s.camisetas.find(x => x.id !== camId && enGancho(x, dest.posicion));
    if (ocupante) {
      const destinoOcupante = antes?.tipo === 'gancho' ? { ...antes } : AL_SIN_DOBLAR();
      ocupante.ubicacion = normalizarUbicacion(s, destinoOcupante);
      ocupante.archived_at = ocupante.archived_at || nowISO();
    }
  }
  c.ubicacion = dest;
  // archived_at deja de gobernar el estado —lo gobierna ubicacion— pero se
  // mantiene fiel a lo que siempre significó: cuándo dejó de estar puesta.
  c.archived_at = dest.tipo === 'puesta' ? null : (c.archived_at || nowISO());
  if (opts.evento !== false) {
    const eraPuesta = antes?.tipo === 'puesta';
    const esPuesta = dest.tipo === 'puesta';
    if (eraPuesta && !esPuesta) pushEvento(s, { tipo: 'camiseta_retirada', cam_id: c.id, nombre: c.nombre });
    else if (!eraPuesta && esPuesta) pushEvento(s, { tipo: 'camiseta_recuperada', cam_id: c.id, nombre: c.nombre });
    // Mover de un gancho a un cerro es acomodar el clóset, no cambiar de
    // identidad. Eso no deja rastro en la historia.
  }
  return true;
}

const uid = () => Math.random().toString(36).slice(2, 11);
const nowISO = () => new Date().toISOString();

const FORMAS = [
  { id: 'dificil',    label: 'difícil',    hint: 'una vez, importante', puntosBase: 3, glyph: '◇' },
  { id: 'facil',      label: 'fácil',      hint: 'minutos, simple',     puntosBase: 1, glyph: '·' },
  { id: 'recurrente', label: 'recurrente', hint: 'hábito que vuelve',   puntosBase: 2, glyph: '⟳' },
];
// Los colores son los que el codec ya le pinta a cada tono en la camiseta
// (TONO_COLORS en src/codec/index.js). Una misión física es magenta acá y
// magenta en la prenda: el app y la obra hablan el mismo idioma de color.
// 'estratégica' no tiene color en el codec; toma el naranja de los motivos.
const TONOS = [
  { id: 'profunda',    label: 'profunda',    color: '#8900FD' },
  { id: 'fisica',      label: 'física',      color: '#DA1895' },
  { id: 'emocional',   label: 'emocional',   color: '#0DEDF7' },
  { id: 'creativa',    label: 'creativa',    color: '#F4FF01' },
  { id: 'estrategica', label: 'estratégica', color: '#FF9E01' },
];
const colorTono = (id) => TONOS.find(t => t.id === id)?.color || 'var(--ink-faint)';
const SUGERENCIAS_EMOJI = ['🧭','⚓','🎭','🌱','🪶','🔥','🗺️','🦴','🪞','🎯','🪐','🪨','🌊','🏛️','📜','🜃'];

// Catálogo curado por Dumpa. Estas son las camisetas pre-establecidas que un nuevo
// usuario puede "comprar" para empezar a jugar sin tener que construir desde cero.
// Las dos primeras (Mi primera camiseta y Curiosidad) son gratis: el regalo de bienvenida.
const CATALOGO = [
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

function multiplicador(m) {
  const now = Date.now();
  if (m.forma === 'recurrente') {
    const r = m.completions.filter(c => now - new Date(c).getTime() < 30 * DAY).length;
    if (r === 0) return 1.2;
    if (r <= 3) return 1;
    if (r <= 7) return 0.7;
    return 0.5;
  }
  const desde = m.estado === 'hecha' ? null : new Date(m.created_at).getTime();
  if (!desde) return 1;
  const dias = (now - desde) / DAY;
  if (dias < 7) return 1;
  if (dias < 14) return 1.5;
  if (dias < 21) return 2;
  return 3;
}
function puntos(m) { return Math.round(m.puntos_base * multiplicador(m) * 10) / 10; }
function estadoDeMision(m) {
  if (m.forma === 'recurrente') {
    const u = m.completions[m.completions.length - 1];
    if (!u) return 'activa';
    return (Date.now() - new Date(u).getTime() < DAY) ? 'hecha-hoy' : 'activa';
  }
  return m.estado;
}
// Una misión está "en juego" si vive en los buckets activos (CamisetaDetail,
// SesionDiaria, cuenta de la card en CamisetasView). Las recurrentes nunca
// desaparecen del bucket activo al completarse: siguen visibles ahí, sólo
// que con el visual de "hecha hoy" (check + tachado), porque hacer una
// recurrente no significa que dejó de existir — significa que ya tocó hoy.
function enJuego(m) {
  if (m.estado === 'archivada') return false;
  if (m.forma === 'recurrente') return true;
  return m.estado === 'activa';
}
function completionsEsteMes(m) {
  const l = Date.now() - 30 * DAY;
  return m.completions.filter(c => new Date(c).getTime() > l).length;
}
function completionsHoy(m) {
  const today = new Date().toDateString();
  return m.completions.filter(c => new Date(c).toDateString() === today).length;
}

// ----- helpers ledger -----
function puntosDelDia(movimientos, fecha) {
  const dStr = fecha.toDateString();
  return (movimientos || [])
    .filter(m => m.tipo === 'mision_completada' && new Date(m.ts).toDateString() === dStr)
    .reduce((a, m) => a + m.monto, 0);
}
function puntosCamiseta(movimientos, camId) {
  return (movimientos || [])
    .filter(m => m.cam_id === camId && m.tipo === 'mision_completada')
    .reduce((a, m) => a + m.monto, 0);
}
function puntosCamisetaDia(movimientos, camId, fecha) {
  const dStr = fecha.toDateString();
  return (movimientos || [])
    .filter(m => m.cam_id === camId && m.tipo === 'mision_completada' && new Date(m.ts).toDateString() === dStr)
    .reduce((a, m) => a + m.monto, 0);
}
function round1(n) { return Math.round(n * 10) / 10; }
function puntosTotales(movimientos) {
  return (movimientos || []).reduce((a, m) => a + m.monto, 0);
}

export default function App() {
  const [state, setState] = useState(null);
  const [tab, setTab] = useState('hoy');
  const [openCam, setOpenCam] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showCatalogo, setShowCatalogo] = useState(false);
  const [previewCat, setPreviewCat] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [sesion, setSesion] = useState(null);
  const [showNota, setShowNota] = useState(false);  // hoja de nota rápida (global)
  // Hoja de cita: { cadencia, origen: 'cierre' | 'eco', eco? }. La abre el
  // final de un check-in o el eco; es la misma hoja en los dos casos.
  const [pedirCita, setPedirCita] = useState(null);

  // Instructivo de instalación: se muestra de primeras si NO está instalada
  // y el usuario no lo ha cerrado antes. Una vez abierta desde el ícono
  // (standalone), isStandalone() es true y nunca vuelve a aparecer.
  const [installAck, setInstallAck] = useState(() => {
    if (isStandalone()) return true;
    try { return localStorage.getItem(INSTALL_KEY) === '1'; } catch { return false; }
  });
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const ackInstall = () => {
    try { localStorage.setItem(INSTALL_KEY, '1'); } catch {}
    setInstallAck(true);
  };
  useEffect(() => {
    const onPrompt = (e) => { e.preventDefault(); setDeferredPrompt(e); };
    const onInstalled = () => ackInstall();
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  useEffect(() => { loadState().then(setState); }, []);
  // v7: registrar cuando el app "vuelve" sin recargar (la PWA puede quedar
  // viva en background días, sobre todo en iOS: reabrir desde el ícono sin
  // cold start no pasa por loadState). El filtro de 10 min en
  // registrarVisita evita duplicados; si no registró, devolvemos prev para
  // no disparar un ciclo de guardado inútil.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      setState(prev => {
        if (!prev) return prev;
        const n = structuredClone(prev);
        return registrarVisita(n) ? n : prev;
      });
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);
  useEffect(() => {
    if (!state) return;
    saveState(state).then(ok => {
      if (!ok && !state._saveError) setState(s => ({ ...s, _saveError: true }));
    });
  }, [state]);

  const update = (mut) => setState(prev => { const n = structuredClone(prev); mut(n); return n; });
  const pushEv = pushEvento;
  const pushMov = (s, mov) => { s.movimientos.push({ id: uid(), ts: nowISO(), ...mov }); };

  const addCamiseta = (data) => update(s => {
    const id = uid();
    s.camisetas.push({ id, ...data, creador_id: s.user_id, origen: 'propia', origen_camiseta_id: null, precio: null, created_at: nowISO(), archived_at: null, ubicacion: PUESTA(), misiones: [], milestones: [] });
    pushEv(s, { tipo: 'camiseta_creada', cam_id: id, nombre: data.nombre, emoji: data.emoji, esencia: data.esencia ?? '', arco: data.arco ?? null });
  });
  const recibirCamiseta = (molde) => {
    // molde is the decoded camiseta object from decodeImageToCamiseta (mode='molde').
    // Estado se transmite en cero: misiones empiezan activas sin completions,
    // milestones pendientes. Preservamos creador_id original y atamos origen_camiseta_id
    // al id del molde recibido para trazar la procedencia.
    let newId = null;
    update(s => {
      const camId = uid();
      newId = camId;
      const creadorOriginal = molde.creador_id || 'desconocido';
      s.camisetas.push({
        id: camId,
        nombre: molde.nombre,
        emoji: molde.emoji || '👕',
        esencia: molde.esencia || '',
        arco: molde.arco,
        creador_id: creadorOriginal,
        origen: 'recibida',
        origen_camiseta_id: molde.id || null,
        precio: null,
        created_at: nowISO(),
        archived_at: null,
        ubicacion: PUESTA(),
        misiones: (molde.misiones || []).map(m => ({
          id: uid(),
          nombre: m.nombre,
          forma: m.forma,
          tonos: m.tonos || [],
          puntos_base: m.puntos_base || 1,
          estado: 'activa',
          created_at: nowISO(),
          completed_at: null,
          archived_at: null,
          completions: [],
          autor_id: creadorOriginal,
          asignada_por: creadorOriginal,
        })),
        milestones: (molde.milestones || []).map(ms => ({
          id: uid(),
          nombre: ms.nombre,
          descripcion: ms.descripcion || '',
          regalo: ms.regalo || '',
          estado: 'pendiente',
          created_at: nowISO(),
          achieved_at: null,
          regalo_cobrado_at: null,
        })),
      });
      pushEv(s, { tipo: 'camiseta_recibida', cam_id: camId, nombre: molde.nombre, emoji: molde.emoji, creador: creadorOriginal });
    });
    return newId;
  };
  const comprarCamiseta = (catalogoId) => {
    const cat = CATALOGO.find(c => c.id === catalogoId);
    if (!cat) return false;
    let ok = false;
    update(s => {
      const total = puntosTotales(s.movimientos);
      if (total < cat.precio) return; // sin fondos, no hace nada
      const camId = uid();
      const cam = {
        id: camId,
        nombre: cat.nombre, emoji: cat.emoji, esencia: cat.esencia, arco: cat.arco,
        creador_id: cat.creador_id, origen: 'comprada', origen_camiseta_id: cat.id, precio: cat.precio,
        created_at: nowISO(), archived_at: null, ubicacion: PUESTA(),
        misiones: [], milestones: [],
      };
      cat.misiones.forEach(m => {
        cam.misiones.push({
          id: uid(), nombre: m.nombre, forma: m.forma, tonos: m.tonos || [], puntos_base: m.puntos_base,
          estado: 'activa', created_at: nowISO(),
          completed_at: null, archived_at: null, completions: [],
          autor_id: cat.creador_id, asignada_por: cat.creador_id,
        });
      });
      (cat.milestones || []).forEach(ms => {
        cam.milestones.push({
          id: uid(), nombre: ms.nombre, descripcion: ms.descripcion || '', regalo: ms.regalo || '',
          estado: 'pendiente', created_at: nowISO(), achieved_at: null, regalo_cobrado_at: null,
        });
      });
      s.camisetas.push(cam);
      if (cat.precio > 0) {
        pushMov(s, { tipo: 'compra_camiseta', cam_id: camId, monto: -cat.precio });
      }
      pushEv(s, { tipo: 'camiseta_comprada', cam_id: camId, nombre: cat.nombre, emoji: cat.emoji, precio: cat.precio });
      ok = camId;
    });
    return ok;
  };
  // Guardar en el clóset = mandarla al cerro sin doblar. Ponérsela = sacarla.
  // Las dos son la misma movida de siempre, con otro nombre.
  const moverCamiseta = (id, destino) => update(s => { aplicarMovida(s, id, destino); });
  const archiveCamiseta = (id) => update(s => { aplicarMovida(s, id, AL_SIN_DOBLAR()); });
  const reviveCamiseta = (id) => update(s => { aplicarMovida(s, id, PUESTA()); });

  // Lavar la ropa. Todas las puestas al cerro sin doblar, sin excepciones,
  // sin confirmación y sin deshacer. Cada camiseta hace exactamente la misma
  // transición que si la guardaras a mano —el mismo aplicarMovida—, pero la
  // historia recibe un solo evento con los ids en vez de diecinueve.
  const lavarLaRopa = () => update(s => {
    const puestas = s.camisetas.filter(estaPuesta);
    if (puestas.length === 0) return;
    const ids = puestas.map(c => c.id);
    const nombres = puestas.map(c => c.nombre);
    ids.forEach(id => aplicarMovida(s, id, AL_SIN_DOBLAR(), { evento: false }));
    // nombres junto a los ids por la misma razón que en v7: el id deja de
    // resolver si la camiseta se dona después.
    pushEv(s, { tipo: 'lavada', fecha: nowISO(), camisetas: ids, nombres });
  });

  const crearCerro = (nombre) => update(s => {
    const n = (nombre || '').trim();
    if (!n) return;
    const orden = s.cerros.reduce((mx, c) => Math.max(mx, c.orden ?? 0), 0) + 1;
    s.cerros.push({ id: uid(), nombre: n, orden, esDelSistema: false });
  });
  const renombrarCerro = (id, nombre) => update(s => {
    const c = s.cerros.find(x => x.id === id);
    const n = (nombre || '').trim();
    if (!c || c.esDelSistema || !n) return;
    c.nombre = n;
  });
  // Borrar un cerro devuelve sus camisetas al cerro sin doblar. No se pierde nada.
  const borrarCerro = (id) => update(s => {
    const c = s.cerros.find(x => x.id === id);
    if (!c || c.esDelSistema) return;
    s.camisetas.forEach(cam => { if (enCerro(cam, id)) aplicarMovida(s, cam.id, AL_SIN_DOBLAR(), { evento: false }); });
    s.cerros = s.cerros.filter(x => x.id !== id);
  });
  // Donar: la camiseta sale de tu set de verdad (no al closet). Los movimientos
  // de puntos quedan intactos, así que conservas lo que ganaste, y el diario
  // guarda el registro. La copia limpia se comparte aparte, vía ShareSheet (molde).
  const donarCamiseta = (id, dedicatoria) => update(s => { aplicarDonacion(s, id, dedicatoria); });

  // Donar un cerro entero. El cerro ya es la selección, así que no hay
  // selección múltiple que construir. Cada camiseta se va por el mismo
  // camino que si la donaras sola —un solo camino, no dos—, sin dedicatoria
  // y sin compartir: un cerro no se le manda a nadie, se suelta. El cerro
  // vacío desaparece con él; el del sistema se queda, vacío.
  const donarCerro = (cerroId) => update(s => {
    const k = s.cerros.find(x => x.id === cerroId);
    if (!k) return;
    const ids = s.camisetas.filter(c => enCerro(c, cerroId)).map(c => c.id);
    if (ids.length === 0) return;
    ids.forEach(id => aplicarDonacion(s, id, ''));
    if (!k.esDelSistema) s.cerros = s.cerros.filter(x => x.id !== cerroId);
  });
  const editCamiseta = (id, data) => update(s => {
    const c = s.camisetas.find(c => c.id === id);
    if (!c) return;
    // v7: snapshot ANTES del assign — lo que cambia deja rastro.
    const antes = { nombre: c.nombre, emoji: c.emoji, esencia: c.esencia ?? '', arco: c.arco ?? null };
    Object.assign(c, data);
    pushEv(s, { tipo: 'camiseta_editada', cam_id: id, nombre: c.nombre, antes });
  });
  const addMision = (camId, data) => update(s => {
    const c = s.camisetas.find(c => c.id === camId);
    if (!c) return;
    const pb = data.puntos_base ?? FORMAS.find(f => f.id === data.forma)?.puntosBase ?? 1;
    const id = uid();
    c.misiones.push({
      id, nombre: data.nombre, forma: data.forma || 'dificil', tonos: data.tonos || [],
      puntos_base: pb, estado: 'activa', created_at: nowISO(),
      completed_at: null, archived_at: null, completions: [],
      autor_id: s.user_id, asignada_por: null,
    });
    pushEv(s, { tipo: 'mision_creada', cam_id: camId, mision_id: id, nombre: data.nombre });
  });
  const editMision = (camId, misId, data) => update(s => {
    const m = s.camisetas.find(c => c.id === camId)?.misiones.find(m => m.id === misId);
    if (!m) return;
    // v7: snapshot ANTES del assign.
    const antes = { nombre: m.nombre, forma: m.forma, tonos: [...(m.tonos || [])], puntos_base: m.puntos_base };
    Object.assign(m, data);
    pushEv(s, { tipo: 'mision_editada', cam_id: camId, mision_id: misId, nombre: m.nombre, antes });
  });
  const toggleMision = (camId, misId) => update(s => {
    const c = s.camisetas.find(c => c.id === camId);
    const m = c?.misiones.find(m => m.id === misId);
    if (!m) return;
    if (m.forma === 'recurrente') {
      // Las recurrentes son pulsos, no toggles. Cada tap = +1 completion.
      // No hay 'deshacer' (asumimos que la frecuencia de taps accidentales
      // es baja; si pasa, queda registrado y la vida sigue). Esto soporta
      // el caso de misiones que se hacen muchas veces en un día —
      // por ejemplo "saltar el obstáculo".
      m.completions.push(nowISO());
      const monto = puntos(m);
      pushMov(s, { tipo: 'mision_completada', cam_id: camId, mision_id: misId, monto });
      pushEv(s, { tipo: 'mision_completada', cam_id: camId, mision_id: misId, nombre: m.nombre, puntos: monto });
    } else {
      if (m.estado === 'activa') {
        m.estado = 'hecha'; m.completed_at = nowISO();
        const monto = puntos(m);
        pushMov(s, { tipo: 'mision_completada', cam_id: camId, mision_id: misId, monto });
        pushEv(s, { tipo: 'mision_completada', cam_id: camId, mision_id: misId, nombre: m.nombre, puntos: monto });
      } else if (m.estado === 'hecha') {
        m.estado = 'activa'; m.completed_at = null;
        // eliminar el movimiento de completar
        for (let i = s.movimientos.length - 1; i >= 0; i--) {
          if (s.movimientos[i].mision_id === misId && s.movimientos[i].tipo === 'mision_completada') {
            s.movimientos.splice(i, 1); break;
          }
        }
        // v7: el diario registra el deshacer en vez de fingir que no pasó.
        // El evento mision_completada previo queda; este lo compensa.
        pushEv(s, { tipo: 'mision_descompletada', cam_id: camId, mision_id: misId, nombre: m.nombre });
      }
    }
  });
  const archiveMision = (camId, misId) => update(s => {
    const m = s.camisetas.find(c => c.id === camId)?.misiones.find(m => m.id === misId);
    if (m) { m.estado = 'archivada'; m.archived_at = nowISO(); pushEv(s, { tipo: 'mision_archivada', cam_id: camId, mision_id: misId, nombre: m.nombre }); }
  });
  const reviveMision = (camId, misId) => update(s => {
    const m = s.camisetas.find(c => c.id === camId)?.misiones.find(m => m.id === misId);
    if (!m) return;
    // v7: revivir borra completed_at — el evento conserva lo que había.
    pushEv(s, { tipo: 'mision_revivida', cam_id: camId, mision_id: misId, nombre: m.nombre, antes: { estado: m.estado, completed_at: m.completed_at ?? null } });
    m.estado = 'activa'; m.archived_at = null; m.completed_at = null;
  });
  const deleteMision = (camId, misId) => update(s => {
    const c = s.camisetas.find(c => c.id === camId);
    if (!c) return;
    const m = c.misiones.find(m => m.id === misId);
    c.misiones = c.misiones.filter(m => m.id !== misId);
    // El ledger es historia: los puntos ya ganados se conservan; solo desaparece la misión.
    // v7: borrar destruía completions[]; el snapshot las conserva en el diario.
    if (m) pushEv(s, { tipo: 'mision_borrada', cam_id: camId, mision_id: misId, nombre: m.nombre,
      snapshot: { forma: m.forma, tonos: m.tonos || [], puntos_base: m.puntos_base, estado: m.estado,
        created_at: m.created_at ?? null, completed_at: m.completed_at ?? null, completions: [...(m.completions || [])] } });
  });
  const ajustarDif = (camId, misId, d) => update(s => {
    const m = s.camisetas.find(c => c.id === camId)?.misiones.find(m => m.id === misId);
    if (!m) return;
    const de = m.puntos_base || 1;
    m.puntos_base = Math.max(1, Math.min(10, de + d));
    // v7: el cambio de dificultad era mudo; ahora deja rastro.
    if (m.puntos_base !== de) pushEv(s, { tipo: 'mision_ajustada', cam_id: camId, mision_id: misId, nombre: m.nombre, de, a: m.puntos_base });
  });
  const cambiarForma = (camId, misId, forma) => update(s => {
    const m = s.camisetas.find(c => c.id === camId)?.misiones.find(m => m.id === misId);
    if (!m) return;
    const de = m.forma;
    m.forma = forma;
    if (forma === 'recurrente' && m.estado === 'hecha') {
      m.estado = 'activa'; m.completed_at = null;
      // v7: este reset también era mudo.
      pushEv(s, { tipo: 'mision_descompletada', cam_id: camId, mision_id: misId, nombre: m.nombre, causa: 'cambio_forma' });
    }
    if (de !== forma) pushEv(s, { tipo: 'mision_forma', cam_id: camId, mision_id: misId, nombre: m.nombre, de, a: forma });
  });
  const addMilestone = (camId, data) => update(s => {
    const c = s.camisetas.find(c => c.id === camId);
    if (c) {
      const id = uid();
      c.milestones.push({ id, ...data, estado: 'pendiente', created_at: nowISO(), achieved_at: null });
      pushEv(s, { tipo: 'milestone_creado', cam_id: camId, ms_id: id, nombre: data.nombre, descripcion: data.descripcion ?? '', regalo: data.regalo ?? '' });
    }
  });
  const toggleMilestone = (camId, msId) => update(s => {
    const ms = s.camisetas.find(c => c.id === camId)?.milestones.find(m => m.id === msId);
    if (!ms) return;
    if (ms.estado === 'pendiente') { ms.estado = 'logrado'; ms.achieved_at = nowISO(); pushEv(s, { tipo: 'milestone_logrado', cam_id: camId, ms_id: msId, nombre: ms.nombre, regalo: ms.regalo }); }
    else if (ms.estado === 'logrado') { ms.estado = 'pendiente'; ms.achieved_at = null; pushEv(s, { tipo: 'milestone_deslogrado', cam_id: camId, ms_id: msId, nombre: ms.nombre }); }
  });
  const cobrarMilestone = (camId, msId) => update(s => {
    const ms = s.camisetas.find(c => c.id === camId)?.milestones.find(m => m.id === msId);
    if (!ms || !ms.regalo || ms.regalo_cobrado_at) return;
    ms.regalo_cobrado_at = nowISO();
    pushEv(s, { tipo: 'milestone_cobrado', cam_id: camId, ms_id: msId, nombre: ms.nombre, regalo: ms.regalo });
  });
  const editMilestone = (camId, msId, data) => update(s => {
    const ms = s.camisetas.find(c => c.id === camId)?.milestones.find(m => m.id === msId);
    if (!ms) return;
    // v7: snapshot ANTES del assign — el regalo reescrito no se pierde.
    const antes = { nombre: ms.nombre, descripcion: ms.descripcion ?? '', regalo: ms.regalo ?? '' };
    Object.assign(ms, data);
    pushEv(s, { tipo: 'milestone_editado', cam_id: camId, ms_id: msId, nombre: ms.nombre, antes });
  });
  // Restar una completion de una misión recurrente. Pensado para deshacer
  // un tap accidental. Saca la última completion y elimina el último movimiento
  // mision_completada asociado a esa misión (los movimientos viejos quedan
  // intactos). Si no hay completions o la misión no es recurrente, no hace nada.
  const undoUltimaCompletion = (camId, misId) => update(s => {
    const c = s.camisetas.find(c => c.id === camId);
    const m = c?.misiones.find(m => m.id === misId);
    if (!m || m.forma !== 'recurrente' || !m.completions?.length) return;
    m.completions.pop();
    for (let i = s.movimientos.length - 1; i >= 0; i--) {
      if (s.movimientos[i].mision_id === misId && s.movimientos[i].tipo === 'mision_completada') {
        s.movimientos.splice(i, 1);
        break;
      }
    }
    // v7: el deshacer queda registrado (compensa el mision_completada previo).
    pushEv(s, { tipo: 'mision_descompletada', cam_id: camId, mision_id: misId, nombre: m.nombre, causa: 'undo' });
  });
  // Move a camiseta up/down in the persistent order. dir = -1 (up) | +1 (down).
  // We move within the full s.camisetas array so it works whether the camiseta
  // is active or archived; UI lists filter on top.
  const reorderCamiseta = (camId, dir) => update(s => {
    const idx = s.camisetas.findIndex(c => c.id === camId);
    if (idx === -1) return;
    const target = idx + dir;
    if (target < 0 || target >= s.camisetas.length) return;
    const [moved] = s.camisetas.splice(idx, 1);
    s.camisetas.splice(target, 0, moved);
  });
  const logSesion = (data) => update(s => {
    const id = uid();
    s.sesiones.push({ id, date: nowISO(), ...data });
    // Note: ...data goes FIRST so the explicit fields below (especially tipo)
    // win over data.tipo ('diaria'/'semanal'/'mensual'). Putting the spread
    // last was the original bug — it left e.tipo as 'diaria' instead of
    // 'sesion_diaria', breaking the EventoItem switch + cierres filter +
    // accordion. The v5 migration fixes legacy events on load.
    // v7: snapshot de nombres al escribir — el cam_id deja de resolver si
    // la camiseta se dona o borra después.
    const nom = (camId) => s.camisetas.find(c => c.id === camId)?.nombre ?? null;
    const extra = {};
    if (data.caliente) extra.caliente_nombre = nom(data.caliente);
    if (data.fria) extra.fria_nombre = nom(data.fria);
    pushEv(s, { ...data, ...extra, tipo: `sesion_${data.tipo}`, sesion_id: id, notas: data.notas });
  });

  // Nota rápida: capturar un pensamiento suelto sin hacer un check-in completo.
  // Va directo a "la historia" como evento 'nota'. No es una sesión.
  const tomarNota = (texto) => {
    const t = (texto || '').trim();
    if (!t) return;
    update(s => { pushEv(s, { tipo: 'nota', texto: t }); });
  };

  // La cita queda en la historia como lo que es: una decisión del jefe. Se
  // guarda para qué fecha y con qué nombre; nunca si se cumplió, porque un
  // .ics no vuelve y porque faltar no produce nada.
  const agendarCita = ({ cadencia, para, titulo }) => update(s => {
    pushEv(s, { tipo: 'cita_agendada', cadencia, para, titulo });
  });
  const descartarEco = (eco) => update(s => silenciarEco(s, eco));

  if (!state) return <Loading />;
  const camsActivas = state.camisetas.filter(estaPuesta);
  const puntosUser = puntosTotales(state.movimientos);

  // Instructivo de instalación: lo primero que ve un usuario nuevo.
  // Se salta si ya está instalada (standalone) o si ya lo cerró antes.
  if (!installAck && !isStandalone()) {
    return <Frame><InstallGate
      deferredPrompt={deferredPrompt}
      onInstall={async () => {
        if (!deferredPrompt) return;
        try {
          deferredPrompt.prompt();
          await deferredPrompt.userChoice;
        } catch {}
        setDeferredPrompt(null);
      }}
      onContinue={ackInstall}
    /></Frame>;
  }

  // Bienvenida: primera vez sin camisetas y sin haber decidido aún
  if (state.camisetas.length === 0 && !showCreate && !showCatalogo && !showImport) {
    return <Frame><Welcome onCatalogo={() => setShowCatalogo(true)} onCrear={() => setShowCreate(true)} onImport={() => setShowImport(true)} /></Frame>;
  }
  if (showImport) {
    return <Frame><ImportSheet
      onClose={() => setShowImport(false)}
      onImport={(molde) => {
        const id = recibirCamiseta(molde);
        setShowImport(false);
        if (id) setOpenCam(id);
      }} /></Frame>;
  }
  // Catálogo (lista de camisetas pre-establecidas)
  if (showCatalogo && !previewCat) {
    return <Frame><Catalogo
      catalogo={CATALOGO}
      camisetas={state.camisetas}
      puntos={puntosUser}
      onPreview={(id) => setPreviewCat(id)}
      onClose={() => setShowCatalogo(false)}
      onCrearPropia={() => { setShowCatalogo(false); setShowCreate(true); }}
    /></Frame>;
  }
  // Preview de una camiseta del catálogo
  if (showCatalogo && previewCat) {
    const cat = CATALOGO.find(c => c.id === previewCat);
    return <Frame><CatalogoPreview
      cat={cat}
      puntos={puntosUser}
      yaTenida={state.camisetas.some(c => c.origen_camiseta_id === cat.id && estaPuesta(c))}
      onBack={() => setPreviewCat(null)}
      onComprar={() => {
        const newId = comprarCamiseta(cat.id);
        if (newId) {
          setPreviewCat(null);
          setShowCatalogo(false);
          setOpenCam(newId);
        }
      }} /></Frame>;
  }
  if (showCreate) return <Frame><CreateCamiseta onDone={(d) => { addCamiseta(d); setShowCreate(false); }} onCancel={() => setShowCreate(false)} canCancel={state.camisetas.length > 0} /></Frame>;
  if (openCam) {
    const cam = state.camisetas.find(c => c.id === openCam);
    if (!cam) { setOpenCam(null); return null; }
    return <Frame><CamisetaDetail cam={cam} movimientos={state.movimientos} onBack={() => setOpenCam(null)}
      onAddMision={(m) => addMision(cam.id, m)}
      onEditMision={(id, d) => editMision(cam.id, id, d)}
      onToggle={(id) => toggleMision(cam.id, id)}
      onUndo={(id) => undoUltimaCompletion(cam.id, id)}
      onArchive={(id) => archiveMision(cam.id, id)}
      onRevive={(id) => reviveMision(cam.id, id)}
      onDelete={(id) => { const mm = cam.misiones.find(x => x.id === id); if (window.confirm('¿Borrar "' + (mm ? mm.nombre : '') + '"? Se elimina del todo. Los puntos ya ganados se quedan.')) deleteMision(cam.id, id); }}
      onAddMilestone={(m) => addMilestone(cam.id, m)}
      onToggleMilestone={(id) => toggleMilestone(cam.id, id)}
      onCobrarMilestone={(id) => cobrarMilestone(cam.id, id)}
      onEditMilestone={(id, d) => editMilestone(cam.id, id, d)}
      onEditCam={(d) => editCamiseta(cam.id, d)}
      onReviveCam={() => reviveCamiseta(cam.id)}
      onArchiveCam={() => { archiveCamiseta(cam.id); setOpenCam(null); }}
      onDonateCam={(dedicatoria) => { donarCamiseta(cam.id, dedicatoria); setOpenCam(null); }} /></Frame>;
  }
  if (sesion === 'diaria') return <Frame><SesionDiaria cams={camsActivas} onToggle={toggleMision} onArchive={archiveMision}
    onClose={(n) => { if (n) logSesion({ tipo: 'diaria', notas: n }); setSesion(null); }} /></Frame>;
  // Cerrar un check-in largo o mensual desemboca en la cita del siguiente.
  // Salirse por la X no: abandonar no es cerrar, y hasta ahora la X dejaba
  // una sesión registrada con notas vacías —lo que además le habría tapado
  // la boca al eco por una semana sin que nadie cerrara nada.
  const cerrarSesion = (tipo) => (p) => {
    setSesion(null);
    if (!p) return;
    const { completa, ...datos } = p;
    logSesion({ tipo, ...datos });
    if (completa) setPedirCita({ cadencia: tipo, origen: 'cierre' });
  };
  if (sesion === 'semanal') return <Frame><SesionSemanal cams={camsActivas}
    onArchiveMision={archiveMision} onEditMision={editMision} onAddMision={addMision}
    onAjustarDificultad={ajustarDif} onCambiarForma={cambiarForma}
    onClose={cerrarSesion('semanal')} /></Frame>;
  if (sesion === 'mensual') return <Frame><SesionMensual cams={state.camisetas}
    onArchiveCam={archiveCamiseta} onReviveCam={reviveCamiseta} onDonateCam={donarCamiseta}
    onCreateCam={() => { setSesion(null); setShowCreate(true); }}
    onClose={cerrarSesion('mensual')} /></Frame>;

  // El eco se calcula una vez por estado y se muestra donde el usuario
  // realmente entra: la pantalla del hacedor. En el Diario no serviría de
  // nada — quien ya llegó al Diario no necesita que lo llamen.
  const eco = tab === 'hoy' ? elegirEco(state) : null;

  return (<Frame><Header puntos={puntosUser} warn={state._saveError} />
    <main className="px-5 pb-32 pt-2 max-w-2xl mx-auto">
      {eco && <EcoBanner eco={eco}
        onAccion={() => {
          if (eco.accion.tipo === 'cita') {
            setPedirCita({ cadencia: eco.accion.cadencia, origen: 'eco', eco });
          } else {
            // Abrirlo ya es la respuesta del día: si lo dejas a medias, el
            // eco no vuelve a insistir esta tarde. Mañana es otra clave.
            descartarEco(eco);
            setSesion(eco.accion.cadencia);
          }
        }}
        onDescartar={() => descartarEco(eco)} />}
      {tab === 'hoy' && <HoyView cams={camsActivas} movimientos={state.movimientos} onToggle={toggleMision} onUndo={undoUltimaCompletion} onOpen={setOpenCam} />}
      {tab === 'camisetas' && <CamisetasView cams={state.camisetas} cerros={state.cerros} movimientos={state.movimientos} onOpen={setOpenCam} onCreate={() => setShowCreate(true)} onOpenCatalogo={() => setShowCatalogo(true)} onImport={() => setShowImport(true)} onReorder={reorderCamiseta} onMover={moverCamiseta} onLavar={lavarLaRopa} onCrearCerro={crearCerro} onRenombrarCerro={renombrarCerro} onBorrarCerro={borrarCerro} onDonarCerro={donarCerro} />}
      {tab === 'diario' && <DiarioView state={state} onStart={setSesion}
        onAgendar={(cadencia) => setPedirCita({ cadencia, origen: 'diario' })} />}
    </main>
    <QuickNoteButton onClick={() => setShowNota(true)} />
    <TabBar tab={tab} setTab={setTab} />
    {showNota && <QuickNoteSheet onClose={() => setShowNota(false)} onSave={(t) => { tomarNota(t); setShowNota(false); }} />}
    {pedirCita && <CitaSheet
      cadencia={pedirCita.cadencia}
      origen={pedirCita.origen}
      onAgendar={(datos) => {
        agendarCita({ cadencia: pedirCita.cadencia, ...datos });
        if (pedirCita.eco) descartarEco(pedirCita.eco);
        setPedirCita(null);
      }}
      onClose={() => {
        // Cerrar la hoja también es una respuesta: el eco ya dijo lo suyo y
        // se calla hasta la próxima ocasión. Preguntar mañana lo mismo es
        // lo que convierte un recordatorio en una plaga.
        if (pedirCita.eco) descartarEco(pedirCita.eco);
        setPedirCita(null);
      }} />}
  </Frame>);
}

// Botón flotante de nota rápida — siempre disponible, encima del TabBar.
function QuickNoteButton({ onClick }) {
  return (
    <button onClick={onClick} aria-label="Tomar una nota"
      className="fixed right-5 ring-ink flex items-center gap-2 ff-mono text-xs px-4 py-3 shadow-lg"
      style={{ bottom: '6.5rem', zIndex: 40, background: 'var(--ink)', color: 'var(--bg)', borderRadius: '999px' }}>
      <Edit2 size={15} strokeWidth={1.8} />
      <span>nota</span>
    </button>
  );
}

// Hoja de nota rápida — captura un pensamiento suelto sin abrir un check-in.
function QuickNoteSheet({ onClose, onSave }) {
  const [texto, setTexto] = useState('');
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto fade-up"
      style={{ background: 'rgba(28, 24, 19, 0.55)' }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md my-auto max-h-[90vh] overflow-y-auto"
        style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}>
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--line-soft)' }}>
          <span className="smallcaps" style={{ color: 'var(--ink-faint)' }}>Una nota</span>
          <button onClick={onClose} className="ring-ink p-1" aria-label="Cerrar"><X size={16} style={{ color: 'var(--ink-faint)' }} /></button>
        </div>
        <div className="px-5 py-4">
          <p className="ff-serif italic text-sm mb-3" style={{ color: 'var(--ink-soft)' }}>
            Un pensamiento, sin más. Queda en tu diario.
          </p>
          <textarea value={texto} onChange={e => setTexto(e.target.value)} autoFocus rows={4}
            placeholder="…" className="w-full ff-serif text-base p-3 mb-3 ring-ink resize-none"
            style={{ border: '1px solid var(--line)', background: 'var(--bg-card)' }} />
          <button onClick={() => onSave(texto)} disabled={!texto.trim()}
            className="w-full ring-ink ff-serif text-base py-3 px-4"
            style={{ background: 'var(--ink)', color: 'var(--bg)', opacity: texto.trim() ? 1 : 0.5 }}>
            Guardar nota
          </button>
        </div>
      </div>
    </div>
  );
}

// ── El eco ───────────────────────────────────────────────────────────────
//
// La voz del jefe, arriba de la casa del hacedor. Uno a la vez, sin
// contadores, sin números rojos, sin insistir. Se cierra y se va.
//
// A propósito no lleva encabezado que diga de quién es la voz: el
// vocabulario todavía no está decidido y una palabra puesta hoy en la UI
// pesa más que la misma palabra puesta en un documento. Si mañana se decide,
// va en textos.js y no aquí.
function EcoBanner({ eco, onAccion, onDescartar }) {
  return (
    <div className="mb-7 p-4 fade-up" style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--line-soft)',
      borderLeft: `2px solid ${eco.tono}`,
    }}>
      <div className="flex items-start gap-3">
        <span className="ff-mono text-xs mt-1" style={{ color: eco.tono }}>❯</span>
        <div className="flex-1">
          <p className="ff-serif text-lg leading-snug mb-1" style={{ color: 'var(--ink)' }}>{eco.titulo}</p>
          <p className="ff-serif italic text-sm" style={{ color: 'var(--ink-soft)' }}>{eco.cuerpo}</p>
          <div className="flex items-center gap-3 mt-4">
            <button onClick={onAccion} className="ring-ink boton-neon ff-mono text-xs py-1.5 px-3">
              {eco.accion.etiqueta}
            </button>
            <button onClick={onDescartar} className="ring-ink ff-mono text-xs py-1.5 px-1"
              style={{ color: 'var(--ink-faint)' }}>{eco.descartar}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── La hoja de la cita ───────────────────────────────────────────────────
//
// La misma hoja para los tres caminos: al cerrar un check-in, desde el eco y
// desde el Diario. Escoge cuándo, escribe cómo se va a llamar, y sale al
// calendario del teléfono. Ahí se acaba: el app no vuelve a saber de ella.
function CitaSheet({ cadencia, origen, onAgendar, onClose }) {
  const porDefecto = TEXTOS.cita.nombrePorDefecto[cadencia] || 'Check-in';
  const [cuando, setCuando] = useState(() => aInputLocal(proximaCita(cadencia)));
  const [nombre, setNombre] = useState(porDefecto);
  const [estado, setEstado] = useState('');   // '' | 'enviando' | 'error'
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const fecha = deInputLocal(cuando);
  const atajo = (dias) => {
    const d = new Date();
    d.setDate(d.getDate() + dias);
    d.setMinutes(Math.round(d.getMinutes() / 15) * 15, 0, 0);
    setCuando(aInputLocal(d));
  };

  const poner = async () => {
    if (!fecha || estado === 'enviando') return;
    const titulo = nombre.trim() || porDefecto;
    setEstado('enviando');
    try {
      const ics = construirICS({
        titulo,
        descripcion: TEXTOS.cita.descripcion[cadencia] || '',
        inicio: fecha,
        minutos: DURACION[cadencia] ?? 15,
      });
      const r = await entregarCita(ics, `cita-${cadencia}.ics`);
      if (r === 'cancelada') { setEstado(''); return; }
      onAgendar({ para: fecha.toISOString(), titulo });
    } catch (e) {
      console.error('cita:', e);
      setEstado('error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto fade-up"
      style={{ background: 'rgba(10, 10, 10, 0.72)' }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md my-auto max-h-[90vh] overflow-y-auto"
        style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}>
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--line-soft)' }}>
          <span className="smallcaps" style={{ color: 'var(--ink-faint)' }}>{porDefecto}</span>
          <button onClick={onClose} className="ring-ink p-1" aria-label="Cerrar"><X size={16} style={{ color: 'var(--ink-faint)' }} /></button>
        </div>
        <div className="px-5 py-5">
          <h2 className="display text-2xl mb-1">{TEXTOS.cita.titulo}</h2>
          <p className="ff-serif italic text-sm mb-6" style={{ color: 'var(--ink-soft)' }}>
            {origen === 'cierre' ? TEXTOS.cita.entradaCierre : TEXTOS.cita.entradaEco}
          </p>

          <label className="smallcaps block mb-2" style={{ color: 'var(--ink-faint)' }}>{TEXTOS.cita.etiquetaCuando}</label>
          <input type="datetime-local" value={cuando} onChange={e => setCuando(e.target.value)}
            className="w-full ff-mono text-sm p-3 mb-3 ring-ink"
            style={{ border: '1px solid var(--line)', background: 'var(--bg-card)', colorScheme: 'dark' }} />
          <div className="flex flex-wrap gap-1.5 mb-6">
            {TEXTOS.cita.atajos.map(a => (
              <button key={a.label} onClick={() => atajo(a.dias)}
                className="ring-ink ff-mono text-xs py-1 px-2"
                style={{ color: 'var(--ink-soft)', border: '1px solid var(--line)' }}>{a.label}</button>
            ))}
          </div>

          <label className="smallcaps block mb-2" style={{ color: 'var(--ink-faint)' }}>{TEXTOS.cita.etiquetaNombre}</label>
          <input value={nombre} onChange={e => setNombre(e.target.value)} maxLength={80}
            className="w-full ff-serif text-base pb-2 mb-2 ring-ink"
            style={{ borderBottom: '1px solid var(--line)' }} />
          <p className="ff-serif italic text-xs mb-6" style={{ color: 'var(--ink-faint)' }}>{TEXTOS.cita.ayudaNombre}</p>

          <button onClick={poner} disabled={!fecha || estado === 'enviando'}
            className="w-full ring-ink ff-serif text-base py-3 px-4"
            style={{ background: 'var(--ink)', color: 'var(--bg)', opacity: fecha && estado !== 'enviando' ? 1 : 0.5 }}>
            {TEXTOS.cita.accion}
          </button>
          {estado === 'error' && (
            <p className="ff-mono text-xs mt-3" style={{ color: 'var(--accent)' }}>
              no se pudo entregar al calendario
            </p>
          )}
          <button onClick={onClose} className="w-full ring-ink ff-mono text-xs py-3 mt-1"
            style={{ color: 'var(--ink-faint)' }}>{TEXTOS.cita.descartar}</button>
        </div>
      </div>
    </div>
  );
}

function Frame({ children }) {
  return (
    <div className="min-h-screen w-full" style={{ background: 'var(--bg)', color: 'var(--ink)' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Chakra+Petch:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500&family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap');
        /* La paleta no se inventó aquí: son los colores que el codec ya usa
           para dibujar las camisetas (src/codec/index.js). Los cuatro tonos,
           los motivos, el trazo y el papel. El app es el negativo de la obra:
           lo que allá es papel, acá es tinta. */
        :root {
          --void: #0a0a0a; --papel: #F0E5D0;
          --magenta: #DA1895;   /* tono física   */
          --cian:    #0DEDF7;   /* tono emocional */
          --acido:   #F4FF01;   /* tono creativa  */
          --violeta: #8900FD;   /* tono profunda  */
          --lima:    #37FF14; --naranja: #FF9E01; --rojo: #F3144D;
          --violeta-luz: #B571FF;   /* el violeta puro es muy oscuro sobre negro */

          --bg: #0a0a0a; --bg-card: #15111F;
          --ink: #F0E5D0; --ink-soft: #B9AE99; --ink-faint: #7B7490;
          --line: #3B3350; --line-soft: #241E33;
          --accent: #F3144D; --accent-soft: #DA1895;
          --ocean: #0DEDF7; --moss: #37FF14; --gold: #F4FF01; --warm: #FF9E01;
        }
        body { font-family: 'Chakra Petch', system-ui, sans-serif; }
        .ff-serif { font-family: 'Chakra Petch', system-ui, sans-serif; }
        .ff-mono { font-family: 'Space Mono', ui-monospace, monospace; }
        /* La firma: aberración cromática. Es literalmente el mismo gesto que
           el codec le hace a la silueta de la camiseta —una copia cian
           desplazada y una magenta al otro lado— aplicado a los titulares. */
        .display {
          font-family: 'Chakra Petch', system-ui, sans-serif;
          font-weight: 700; letter-spacing: -0.01em; line-height: 1.05;
          text-shadow: 1.5px 0 rgba(13,237,247,0.85), -1.5px 1px rgba(218,24,149,0.85);
        }
        .smallcaps { font-family: 'Space Mono', ui-monospace, monospace;
          text-transform: uppercase; letter-spacing: 0.22em; font-size: 0.68rem; font-weight: 700; }
        /* Trama de tubo: líneas de barrido y un halo violeta arriba. Sustituye
           al grano de papel, que era de la otra vida del app. */
        .grain::before {
          content: ''; position: fixed; inset: 0; pointer-events: none; z-index: 100;
          background:
            repeating-linear-gradient(to bottom, rgba(240,229,208,0.035) 0 1px, transparent 1px 3px),
            radial-gradient(120% 70% at 50% -10%, rgba(137,0,253,0.20), transparent 62%),
            radial-gradient(100% 60% at 50% 110%, rgba(13,237,247,0.07), transparent 60%);
        }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        .fade-up { animation: fadeUp 0.4s ease both; }
        .fade-up-d1 { animation: fadeUp 0.4s ease both 0.08s; opacity: 0; }
        .fade-up-d2 { animation: fadeUp 0.4s ease both 0.16s; opacity: 0; }
        .fade-up-d3 { animation: fadeUp 0.4s ease both 0.24s; opacity: 0; }
        .ring-ink:focus-visible { outline: 2px solid var(--cian); outline-offset: 2px; }
        .check-ani { transition: all 0.25s cubic-bezier(.34,1.6,.6,1); }
        .hr-deco { background-image: radial-gradient(circle, var(--line) 1px, transparent 1.5px); background-size: 8px 8px; background-repeat: repeat-x; background-position: center; height: 8px; }
        .boton-neon { color: var(--cian); border: 1px solid var(--cian); background: transparent;
          transition: background 0.18s ease, box-shadow 0.18s ease; }
        .boton-neon:active { background: rgba(13,237,247,0.12); box-shadow: 0 0 26px -6px var(--cian); }
        .aberracion-caja { box-shadow: 3px 0 0 -1px var(--magenta), -3px 0 0 -1px var(--cian), 0 10px 30px rgba(0,0,0,0.75); }
        textarea, input, select { background: transparent; color: var(--ink); caret-color: var(--cian); }
        input::placeholder, textarea::placeholder { color: var(--ink-faint); opacity: 1; }
        ::selection { background: var(--magenta); color: var(--void); }
        details summary::-webkit-details-marker { display: none; }
        @media (prefers-reduced-motion: reduce) {
          .fade-up, .fade-up-d1, .fade-up-d2, .fade-up-d3 { animation: none; opacity: 1; }
          .check-ani { transition: none; }
        }
      `}</style>
      <div className="grain" />
      {children}
    </div>
  );
}

function Loading() { return <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0a0a' }}><span className="ff-mono text-sm" style={{ color: '#7B7490', letterSpacing: '0.2em' }}>cargando…</span></div>; }

function Header({ puntos, warn }) {
  return (<header className="px-5 pt-6 pb-3 max-w-2xl mx-auto">
    {warn && (
      <div className="ff-mono text-xs mb-3 py-2 px-3 fade-up" style={{ background: 'var(--accent)', color: 'var(--bg)' }}>
        No se está guardando. Exporta tus datos desde Diario · respaldo para no perderlos.
      </div>
    )}
    <div className="flex items-baseline justify-between">
      <h1 className="display text-2xl">El juego</h1>
      <div className="flex items-baseline gap-3">
        {puntos > 0 && <span className="ff-mono text-xs" style={{ color: 'var(--gold)' }}>{round1(puntos)} pts</span>}
        <span className="ff-mono text-xs" style={{ color: 'var(--ink-faint)' }}>
          {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })}
        </span>
      </div>
    </div>
  </header>);
}

function TabBar({ tab, setTab }) {
  const tabs = [
    { id: 'hoy', label: 'Hoy', icon: Sun },
    { id: 'camisetas', label: 'Camisetas', icon: Hexagon },
    { id: 'diario', label: 'Diario', icon: BookOpen },
  ];
  return (<nav className="fixed bottom-0 left-0 right-0 px-5 pt-3 pb-6 backdrop-blur-sm" style={{ background: 'rgba(10, 10, 10, 0.88)', borderTop: '1px solid var(--line)' }}>
    <div className="max-w-2xl mx-auto flex items-center justify-around">
      {tabs.map(({ id, label, icon: Icon }) => (
        <button key={id} onClick={() => setTab(id)} className="flex flex-col items-center gap-1 py-1 px-4 ring-ink rounded">
          <Icon size={18} strokeWidth={1.6} style={{ color: tab === id ? 'var(--ink)' : 'var(--ink-faint)' }} />
          <span className="smallcaps" style={{ color: tab === id ? 'var(--ink)' : 'var(--ink-faint)' }}>{label}</span>
        </button>
      ))}
    </div>
  </nav>);
}

function InstallGate({ deferredPrompt, onInstall, onContinue }) {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const isIOS = /iphone|ipad|ipod/i.test(ua) ||
    (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /android/i.test(ua);

  // Pasos por plataforma. Cada paso: { icon, texto }.
  let pasos;
  if (isIOS) {
    pasos = [
      { icon: <Share2 size={18} strokeWidth={1.6} />, texto: <>Toca el botón <strong>Compartir</strong> en la barra de Safari (el cuadro con la flecha hacia arriba).</> },
      { icon: <Plus size={18} strokeWidth={1.6} />, texto: <>Elige <strong>«Añadir a pantalla de inicio»</strong>.</> },
      { icon: <Check size={18} strokeWidth={1.6} />, texto: <>Confirma con <strong>«Añadir»</strong>.</> },
    ];
  } else if (isAndroid) {
    pasos = [
      { icon: <MoreVertical size={18} strokeWidth={1.6} />, texto: <>Toca el menú <strong>⋮</strong> arriba a la derecha del navegador.</> },
      { icon: <Download size={18} strokeWidth={1.6} />, texto: <>Elige <strong>«Instalar app»</strong> o <strong>«Añadir a pantalla principal»</strong>.</> },
      { icon: <Check size={18} strokeWidth={1.6} />, texto: <>Confirma <strong>«Instalar»</strong>.</> },
    ];
  } else {
    pasos = [
      { icon: <Download size={18} strokeWidth={1.6} />, texto: <>En el menú del navegador busca <strong>«Instalar»</strong> o <strong>«Añadir a pantalla de inicio»</strong>.</> },
      { icon: <Check size={18} strokeWidth={1.6} />, texto: <>Confirma para crear el ícono.</> },
    ];
  }

  return (<div className="min-h-screen flex flex-col justify-center items-center px-8 max-w-xl mx-auto text-center fade-up">
    <div className="smallcaps mb-6" style={{ color: 'var(--ink-faint)' }}>Antes de empezar</div>
    <Smartphone size={40} strokeWidth={1.3} className="mb-5" style={{ color: 'var(--ink-soft)' }} />
    <h1 className="display text-4xl md:text-5xl leading-[1.05] mb-4">
      Ponla en tu pantalla de inicio
    </h1>
    <p className="ff-serif text-base mb-10 max-w-md" style={{ color: 'var(--ink-soft)' }}>
      El juego vive mejor como app: a pantalla completa, sin la barra del navegador, lista de un toque. Instálala antes de jugar.
    </p>

    {deferredPrompt && (
      <button onClick={onInstall}
        className="ff-serif text-base px-8 py-3 mb-6 ring-ink flex items-center gap-2"
        style={{ background: 'var(--ink)', color: 'var(--bg)' }}>
        <Download size={16} /> Instalar app
      </button>
    )}

    <div className="w-full max-w-sm text-left mb-10">
      {pasos.map((p, i) => (
        <div key={i} className="flex items-start gap-3 mb-4">
          <span className="ff-mono text-xs mt-0.5 shrink-0 w-5 text-center" style={{ color: 'var(--ink-faint)' }}>{i + 1}</span>
          <span className="shrink-0 mt-0.5" style={{ color: 'var(--ink-soft)' }}>{p.icon}</span>
          <span className="ff-serif text-sm" style={{ color: 'var(--ink-soft)' }}>{p.texto}</span>
        </div>
      ))}
    </div>

    <div className="flex items-center gap-2 mb-10 ff-serif text-base italic px-4" style={{ color: 'var(--ink)' }}>
      <Home size={16} strokeWidth={1.6} style={{ color: 'var(--accent)' }} />
      <span>Luego cierra esta ventana y ábrela desde el ícono nuevo.</span>
    </div>

    <button onClick={onContinue} className="ff-serif text-base px-8 py-3 mb-2 ring-ink"
      style={{ border: '1px solid var(--line)', color: 'var(--ink)' }}>
      Ya la instalé · entrar
    </button>
    <button onClick={onContinue} className="ff-mono text-xs ring-ink py-2 px-3" style={{ color: 'var(--ink-faint)' }}>
      o seguir en el navegador
    </button>
  </div>);
}

function Welcome({ onCatalogo, onCrear, onImport }) {
  return (<div className="min-h-screen flex flex-col justify-center items-center px-8 max-w-xl mx-auto text-center">
    <div className="fade-up smallcaps mb-6" style={{ color: 'var(--ink-faint)' }}>El juego de las camisetas</div>
    <h1 className="fade-up-d1 display text-5xl md:text-6xl leading-[1.05] mb-4">
      Bienvenido.
    </h1>
    <p className="fade-up-d2 ff-serif text-lg italic mb-2 max-w-md" style={{ color: 'var(--ink-soft)' }}>
      Una camiseta no se elige: se reconoce.
    </p>
    <p className="fade-up-d2 ff-serif text-base mb-12 max-w-md" style={{ color: 'var(--ink-soft)' }}>
      Empieza por elegir una que ya llevas puesta sin saberlo. La primera es un regalo.
    </p>
    <button onClick={onCatalogo} className="fade-up-d3 ff-serif text-base px-8 py-3 mb-3 ring-ink" style={{ background: 'var(--ink)', color: 'var(--bg)' }}>
      Ver camisetas disponibles
    </button>
    <button onClick={onCrear} className="fade-up-d3 ff-mono text-xs ring-ink py-2 px-3" style={{ color: 'var(--ink-faint)' }}>
      o construir la mía propia
    </button>
    <button onClick={onImport} className="fade-up-d3 ff-mono text-xs ring-ink py-2 px-3 mt-1 flex items-center gap-1.5" style={{ color: 'var(--ink-faint)' }}>
      <Inbox size={12} /><span>o recibir una de alguien</span>
    </button>
    <div className="fade-up-d3 ff-mono text-xs mt-16" style={{ color: 'var(--ink-faint)' }}>v0.5 · prototipo</div>
  </div>);
}

function Catalogo({ catalogo, camisetas, puntos, onPreview, onClose, onCrearPropia }) {
  return (<div className="min-h-screen px-5 pt-6 pb-20 max-w-2xl mx-auto fade-up">
    <div className="flex items-center justify-between mb-6">
      <button onClick={onClose} className="ring-ink ff-mono text-xs p-2 -ml-2" style={{ color: 'var(--ink-faint)' }}>← cerrar</button>
      <span className="ff-mono text-xs" style={{ color: 'var(--gold)' }}>{round1(puntos)} pts</span>
    </div>
    <h1 className="display text-4xl mb-2">Camisetas disponibles</h1>
    <p className="ff-serif italic text-base mb-8" style={{ color: 'var(--ink-soft)' }}>
      Cada una viene con sus misiones. Pruébala antes de inventar las tuyas.
    </p>
    <div className="space-y-3 mb-10">
      {catalogo.map(cat => {
        const ya = camisetas.some(c => c.origen_camiseta_id === cat.id && estaPuesta(c));
        const puedePagar = puntos >= cat.precio;
        return (<button key={cat.id} onClick={() => onPreview(cat.id)}
          className="block w-full text-left p-5 ring-ink"
          style={{
            background: ya ? 'transparent' : 'var(--bg-card)',
            border: '1px solid ' + (ya ? 'var(--line-soft)' : 'var(--line)'),
            opacity: ya ? 0.6 : 1,
          }}>
          <div className="flex items-start gap-4">
            <span className="text-4xl">{cat.emoji}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 mb-1">
                <h3 className="ff-serif text-2xl">{cat.nombre}</h3>
                {ya && <span className="ff-mono text-xs" style={{ color: 'var(--ink-faint)' }}>· puesta</span>}
              </div>
              <p className="ff-serif italic text-sm mb-2" style={{ color: 'var(--ink-soft)' }}>{cat.esencia}</p>
              <div className="ff-mono text-xs" style={{ color: 'var(--ink-faint)' }}>
                {cat.misiones.length} misiones · {cat.precio === 0 ? 'gratis' : <span style={{ color: puedePagar || ya ? 'var(--gold)' : 'var(--accent)' }}>{cat.precio} pts</span>}
              </div>
            </div>
            <ChevronRight size={20} strokeWidth={1.4} style={{ color: 'var(--ink-faint)' }} />
          </div>
        </button>);
      })}
    </div>
    <div className="hr-deco mb-6" />
    <button onClick={onCrearPropia} className="ff-mono text-xs ring-ink py-2 px-3" style={{ color: 'var(--ink-faint)' }}>
      o construir la mía propia →
    </button>
  </div>);
}

function CatalogoPreview({ cat, puntos, yaTenida, onBack, onComprar }) {
  const puedePagar = puntos >= cat.precio;
  return (<div className="min-h-screen px-5 pt-6 pb-20 max-w-2xl mx-auto fade-up">
    <button onClick={onBack} className="ring-ink mb-6 flex items-center gap-1 ff-mono text-xs" style={{ color: 'var(--ink-faint)' }}>
      <ChevronLeft size={14} /> catálogo
    </button>
    <div className="text-6xl mb-3">{cat.emoji}</div>
    <h1 className="display text-4xl md:text-5xl mb-2">{cat.nombre}</h1>
    <p className="ff-serif italic text-lg leading-snug mb-8 max-w-lg" style={{ color: 'var(--ink-soft)' }}>{cat.esencia}</p>
    <div className="hr-deco mb-6" />
    <h2 className="smallcaps mb-4" style={{ color: 'var(--ink-faint)' }}>Misiones que vienen incluidas</h2>
    <div className="space-y-2 mb-8">
      {cat.misiones.map((m, i) => (
        <div key={i} className="flex items-start gap-3 py-1">
          <span className="ff-mono text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>{FORMAS.find(f => f.id === m.forma)?.glyph}</span>
          <span className="flex-1 ff-serif text-base">{m.nombre}
            <span className="ff-mono text-xs ml-2" style={{ color: 'var(--ink-faint)' }}>
              {m.forma}{m.tonos?.map(t => (
                <span key={t}> · <span style={{ color: colorTono(t) }}>{TONOS.find(x => x.id === t)?.label}</span></span>
              ))}
            </span>
          </span>
          <span className="ff-mono text-xs mt-1" style={{ color: 'var(--gold)' }}>+{m.puntos_base}</span>
        </div>
      ))}
    </div>
    {cat.milestones?.length > 0 && (<>
      <div className="hr-deco mb-6" />
      <h2 className="smallcaps mb-4" style={{ color: 'var(--ink-faint)' }}>Milestones que puedes lograr</h2>
      <div className="space-y-2 mb-8">
        {cat.milestones.map((ms, i) => (
          <div key={i} className="flex items-start gap-3 py-1">
            <span className="ff-serif text-base flex-1">{ms.nombre}</span>
            {ms.regalo && <span className="ff-mono text-xs mt-1" style={{ color: 'var(--gold)' }}>🎁 {ms.regalo}</span>}
          </div>
        ))}
      </div>
    </>)}
    <div className="hr-deco mb-6" />
    {yaTenida ? (
      <p className="ff-serif italic text-base" style={{ color: 'var(--ink-faint)' }}>
        Ya la llevas puesta.
      </p>
    ) : (<>
      <div className="flex items-baseline justify-between mb-4">
        <span className="ff-serif text-lg">
          {cat.precio === 0 ? 'gratis' : <>cuesta <span style={{ color: 'var(--gold)' }}>{cat.precio} pts</span></>}
        </span>
        {cat.precio > 0 && <span className="ff-mono text-xs" style={{ color: 'var(--ink-faint)' }}>
          tienes {round1(puntos)} pts
        </span>}
      </div>
      <button onClick={onComprar} disabled={!puedePagar}
        className="ff-serif px-6 py-3 ring-ink disabled:opacity-30"
        style={{ background: 'var(--ink)', color: 'var(--bg)' }}>
        {cat.precio === 0 ? 'ponérmela ·' : (puedePagar ? 'comprarla ·' : 'aún no tienes suficiente')}
      </button>
    </>)}
  </div>);
}

function CreateCamiseta({ onDone, onCancel, canCancel }) {
  const [step, setStep] = useState(0);
  const [nombre, setNombre] = useState('');
  const [emoji, setEmoji] = useState('');
  const [esencia, setEsencia] = useState('');
  const [arcoDe, setArcoDe] = useState('');
  const [arcoA, setArcoA] = useState('');
  const next = () => setStep(s => s + 1);
  const back = () => step === 0 ? (canCancel && onCancel?.()) : setStep(s => s - 1);
  const submit = () => onDone({
    nombre: nombre.trim(), emoji: emoji.trim() || '◇',
    esencia: esencia.trim(),
    arco: (arcoDe.trim() && arcoA.trim()) ? { de: arcoDe.trim(), a: arcoA.trim() } : null,
  });
  return (<div className="min-h-screen flex flex-col px-6 pt-6 pb-10 max-w-xl mx-auto">
    <div className="flex items-center justify-between mb-12">
      <button onClick={back} className="ff-mono text-xs ring-ink p-2 -ml-2" style={{ color: 'var(--ink-faint)' }}>
        {step === 0 ? (canCancel ? '← cancelar' : '') : '← atrás'}
      </button>
      <span className="ff-mono text-xs" style={{ color: 'var(--ink-faint)' }}>{step + 1} / 4</span>
    </div>
    {step === 0 && (<div className="fade-up flex-1 flex flex-col">
      <div className="smallcaps mb-4" style={{ color: 'var(--ink-faint)' }}>Paso uno</div>
      <h2 className="display text-3xl md:text-4xl mb-2">¿Cómo se llama?</h2>
      <p className="ff-serif text-sm italic mb-8" style={{ color: 'var(--ink-soft)' }}>Una palabra. Lo que dirías si alguien preguntara <em>"¿de qué vas hoy?"</em></p>
      <input autoFocus value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Capitán, Padre, Animal, Maestro…" className="ff-serif text-2xl pb-2 ring-ink" style={{ borderBottom: '1px solid var(--line)' }} />
      <div className="flex-1" />
      <button onClick={next} disabled={!nombre.trim()} className="self-end mt-8 ff-serif px-6 py-2 ring-ink disabled:opacity-30" style={{ border: '1px solid var(--ink)' }}>siguiente →</button>
    </div>)}
    {step === 1 && (<div className="fade-up flex-1 flex flex-col">
      <div className="smallcaps mb-4" style={{ color: 'var(--ink-faint)' }}>Paso dos</div>
      <h2 className="display text-3xl md:text-4xl mb-2">Un símbolo.</h2>
      <p className="ff-serif text-sm italic mb-8" style={{ color: 'var(--ink-soft)' }}>Lo que verás cada vez que la abras.</p>
      <div className="grid grid-cols-8 gap-2 mb-6">
        {SUGERENCIAS_EMOJI.map(e => (
          <button key={e} onClick={() => setEmoji(e)} className="aspect-square text-2xl rounded transition-all" style={{
            background: emoji === e ? 'var(--ink)' : 'var(--bg-card)',
            border: '1px solid ' + (emoji === e ? 'var(--ink)' : 'var(--line)'),
          }}>{e}</button>
        ))}
      </div>
      <input value={emoji} onChange={e => setEmoji(e.target.value)} placeholder="…o el tuyo" className="ff-serif text-xl text-center pb-2 ring-ink" style={{ borderBottom: '1px solid var(--line)' }} />
      <div className="flex-1" />
      <button onClick={next} className="self-end mt-8 ff-serif px-6 py-2 ring-ink" style={{ border: '1px solid var(--ink)' }}>siguiente →</button>
    </div>)}
    {step === 2 && (<div className="fade-up flex-1 flex flex-col">
      <div className="smallcaps mb-4" style={{ color: 'var(--ink-faint)' }}>Paso tres</div>
      <h2 className="display text-3xl md:text-4xl mb-2">¿Qué se activa cuando te la pones?</h2>
      <p className="ff-serif text-sm italic mb-8" style={{ color: 'var(--ink-soft)' }}>Una o dos líneas. La versión de ti que aparece.</p>
      <textarea value={esencia} onChange={e => setEsencia(e.target.value)} autoFocus rows={4} placeholder="Es la versión de mí que…" className="ff-serif text-lg p-3 ring-ink resize-none" style={{ border: '1px solid var(--line)', borderRadius: 2, background: 'var(--bg-card)' }} />
      <div className="flex-1" />
      <button onClick={next} className="self-end mt-8 ff-serif px-6 py-2 ring-ink" style={{ border: '1px solid var(--ink)' }}>siguiente →</button>
    </div>)}
    {step === 3 && (<div className="fade-up flex-1 flex flex-col">
      <div className="smallcaps mb-4" style={{ color: 'var(--ink-faint)' }}>Paso cuatro · opcional</div>
      <h2 className="display text-3xl md:text-4xl mb-2">¿Hay un arco?</h2>
      <p className="ff-serif text-sm italic mb-8" style={{ color: 'var(--ink-soft)' }}>De dónde sale, a dónde apunta. Puedes dejarlo vacío.</p>
      <div className="flex items-center gap-3 mb-3">
        <span className="ff-mono text-xs w-8" style={{ color: 'var(--ink-faint)' }}>de</span>
        <input value={arcoDe} onChange={e => setArcoDe(e.target.value)} placeholder="Day Skipper" className="ff-serif text-lg flex-1 pb-1 ring-ink" style={{ borderBottom: '1px solid var(--line)' }} />
      </div>
      <div className="flex items-center gap-3">
        <span className="ff-mono text-xs w-8" style={{ color: 'var(--ink-faint)' }}>a</span>
        <input value={arcoA} onChange={e => setArcoA(e.target.value)} placeholder="Yachtmaster Offshore" className="ff-serif text-lg flex-1 pb-1 ring-ink" style={{ borderBottom: '1px solid var(--line)' }} />
      </div>
      <div className="flex-1" />
      <div className="flex justify-between items-center mt-8">
        <div className="ff-mono text-xs" style={{ color: 'var(--ink-faint)' }}>
          <span className="text-2xl ff-serif">{emoji || '◇'}</span>{' '}{nombre}
        </div>
        <button onClick={submit} className="ff-serif px-6 py-2 ring-ink" style={{ background: 'var(--ink)', color: 'var(--bg)' }}>ponérmela ·</button>
      </div>
    </div>)}
  </div>);
}

function EditCamiseta({ cam, onSave, onCancel }) {
  const [nombre, setNombre] = useState(cam.nombre || '');
  const [emoji, setEmoji] = useState(cam.emoji || '');
  const [esencia, setEsencia] = useState(cam.esencia || '');
  const [arcoDe, setArcoDe] = useState(cam.arco?.de || '');
  const [arcoA, setArcoA] = useState(cam.arco?.a || '');

  const submit = () => onSave({
    nombre: nombre.trim() || cam.nombre,
    emoji: emoji.trim() || '◇',
    esencia: esencia.trim(),
    arco: (arcoDe.trim() && arcoA.trim()) ? { de: arcoDe.trim(), a: arcoA.trim() } : null,
  });

  return (<div className="px-6 pt-6 pb-32 max-w-xl mx-auto fade-up">
    <div className="flex items-center justify-between mb-10">
      <button onClick={onCancel} className="ff-mono text-xs ring-ink p-2 -ml-2" style={{ color: 'var(--ink-faint)' }}>← cancelar</button>
      <span className="smallcaps" style={{ color: 'var(--ink-faint)' }}>Editar camiseta</span>
    </div>

    <div className="mb-6">
      <div className="smallcaps mb-2" style={{ color: 'var(--ink-faint)' }}>nombre</div>
      <input value={nombre} onChange={e => setNombre(e.target.value)} autoFocus
        className="w-full ff-serif text-2xl pb-2 ring-ink"
        style={{ borderBottom: '1px solid var(--line)' }} />
    </div>

    <div className="mb-6">
      <div className="smallcaps mb-2" style={{ color: 'var(--ink-faint)' }}>símbolo</div>
      <div className="grid grid-cols-8 gap-2 mb-3">
        {SUGERENCIAS_EMOJI.map(e => (
          <button key={e} onClick={() => setEmoji(e)}
            className="aspect-square text-xl rounded transition-all"
            style={{
              background: emoji === e ? 'var(--ink)' : 'var(--bg-card)',
              border: '1px solid ' + (emoji === e ? 'var(--ink)' : 'var(--line)'),
            }}>{e}</button>
        ))}
      </div>
      <input value={emoji} onChange={e => setEmoji(e.target.value)}
        placeholder="…o el tuyo"
        className="ff-serif text-lg text-center pb-1 ring-ink w-full"
        style={{ borderBottom: '1px solid var(--line)' }} />
    </div>

    <div className="mb-6">
      <div className="smallcaps mb-2" style={{ color: 'var(--ink-faint)' }}>esencia</div>
      <textarea value={esencia} onChange={e => setEsencia(e.target.value)} rows={3}
        placeholder="qué se activa al ponértela"
        className="w-full ff-serif text-base p-3 ring-ink resize-none italic"
        style={{ border: '1px solid var(--line)', background: 'var(--bg-card)' }} />
    </div>

    <div className="mb-8">
      <div className="smallcaps mb-2" style={{ color: 'var(--ink-faint)' }}>arco <span className="lowercase tracking-normal opacity-60">(opcional)</span></div>
      <div className="flex items-center gap-3 mb-3">
        <span className="ff-mono text-xs w-8" style={{ color: 'var(--ink-faint)' }}>de</span>
        <input value={arcoDe} onChange={e => setArcoDe(e.target.value)}
          className="ff-serif flex-1 pb-1 ring-ink"
          style={{ borderBottom: '1px solid var(--line)' }} />
      </div>
      <div className="flex items-center gap-3">
        <span className="ff-mono text-xs w-8" style={{ color: 'var(--ink-faint)' }}>a</span>
        <input value={arcoA} onChange={e => setArcoA(e.target.value)}
          className="ff-serif flex-1 pb-1 ring-ink"
          style={{ borderBottom: '1px solid var(--line)' }} />
      </div>
    </div>

    <div className="flex justify-between items-center">
      <div className="ff-mono text-xs" style={{ color: 'var(--ink-faint)' }}>
        <span className="text-2xl ff-serif">{emoji || '◇'}</span>{' '}{nombre}
      </div>
      <button onClick={submit} className="ff-serif px-6 py-2 ring-ink"
        style={{ background: 'var(--ink)', color: 'var(--bg)' }}>guardar</button>
    </div>
  </div>);
}

function HoyView({ cams, movimientos, onToggle, onUndo, onOpen }) {
  const today = new Date();
  const todayStr = today.toDateString();
  let hechasHoy = 0;
  cams.forEach(c => c.misiones.forEach(m => {
    if (m.completed_at && new Date(m.completed_at).toDateString() === todayStr) hechasHoy++;
    m.completions?.forEach(c => { if (new Date(c).toDateString() === todayStr) hechasHoy++; });
  }));
  const puntosHoy = puntosDelDia(movimientos, today);
  const conActivas = cams.filter(c => c.misiones.some(m => m.estado !== 'archivada'));
  const sinActivas = cams.filter(c => !c.misiones.some(m => m.estado !== 'archivada'));
  return (<div className="fade-up">
    <div className="flex items-baseline justify-between mb-6">
      <p className="ff-serif italic text-lg" style={{ color: 'var(--ink-soft)' }}>
        {hechasHoy === 0 ? 'Empieza por una.' : `${hechasHoy} ${hechasHoy === 1 ? 'hecha' : 'hechas'} hoy.`}
      </p>
      {puntosHoy > 0 && <span className="ff-mono text-xs" style={{ color: 'var(--gold)' }}>+{round1(puntosHoy)}</span>}
    </div>
    {conActivas.length === 0 && sinActivas.length === 0 && (<div className="py-12 text-center">
      <p className="ff-serif italic text-lg mb-2" style={{ color: 'var(--ink-soft)' }}>Día limpio. Sin misiones puestas.</p>
      <p className="ff-serif text-sm" style={{ color: 'var(--ink-faint)' }}>Entra en una camiseta y siembra alguna.</p>
    </div>)}
    {conActivas.map(cam => <CamisetaCardHoy key={cam.id} cam={cam} onToggle={onToggle} onUndo={onUndo} onOpen={onOpen} />)}
    {sinActivas.length > 0 && (<>
      <div className="hr-deco my-8" />
      <div className="smallcaps mb-3" style={{ color: 'var(--ink-faint)' }}>sin misiones</div>
      <div className="space-y-1">
        {sinActivas.map(cam => (
          <button key={cam.id} onClick={() => onOpen(cam.id)} className="block w-full text-left py-2 ff-serif ring-ink" style={{ color: 'var(--ink-soft)' }}>
            <span className="text-xl mr-2">{cam.emoji}</span>{cam.nombre}
            <span className="ff-mono text-xs ml-2" style={{ color: 'var(--ink-faint)' }}>→ poner una misión</span>
          </button>
        ))}
      </div>
    </>)}
  </div>);
}

function CamisetaCardHoy({ cam, onToggle, onUndo, onOpen }) {
  const visibles = cam.misiones.filter(m => m.estado !== 'archivada');
  if (visibles.length === 0) return null;
  return (<div className="mb-8">
    <button onClick={() => onOpen(cam.id)} className="flex items-baseline gap-3 mb-3 ring-ink text-left">
      <span className="text-2xl">{cam.emoji}</span>
      <h3 className="ff-serif text-xl">{cam.nombre}</h3>
      {cam.arco && <span className="ff-mono text-xs ml-1" style={{ color: 'var(--ink-faint)' }}>{cam.arco.de} → {cam.arco.a}</span>}
    </button>
    <div className="space-y-1 pl-1">
      {visibles.map(m => <MisionRow key={m.id} m={m} onToggle={() => onToggle(cam.id, m.id)} onUndo={() => onUndo(cam.id, m.id)} />)}
    </div>
  </div>);
}

function MisionRow({ m, onToggle, onUndo }) {
  const est = estadoDeMision(m);
  // Non-recurrentes: 'hecha' es estado terminal con check verde + tachado.
  // Recurrentes con completion hoy: tick verde, nombre legible (sin tachar) —
  // sigue viva y se puede volver a tocar.
  const hecha = m.forma !== 'recurrente' && (est === 'hecha' || est === 'hecha-hoy');
  const hoy = m.forma === 'recurrente' ? completionsHoy(m) : 0;
  const tickHoy = hoy > 0;
  const showCheck = hecha || tickHoy;
  const mult = multiplicador(m);
  const formaGlyph = FORMAS.find(f => f.id === m.forma)?.glyph;
  const p = puntos(m);
  const tonosStr = m.tonos?.map(t => TONOS.find(x => x.id === t)?.label).filter(Boolean).join(' · ');
  return (<div className="flex items-start gap-1 group">
    <button onClick={onToggle} className="flex items-start gap-3 py-2 text-left flex-1 ring-ink check-ani">
      <span className="flex-shrink-0 mt-1.5 w-4 h-4 rounded-sm flex items-center justify-center check-ani" style={{
        border: '1px solid ' + (showCheck ? 'var(--moss)' : 'var(--line)'),
        background: showCheck ? 'var(--moss)' : 'transparent',
      }}>{showCheck && <Check size={11} strokeWidth={3} color="var(--bg)" />}</span>
      <span className="flex-1 ff-serif text-base" style={{
        color: hecha ? 'var(--ink-faint)' : 'var(--ink)',
        textDecoration: hecha ? 'line-through' : 'none', textDecorationThickness: '0.5px',
      }}>{m.nombre}
        <span className="ff-mono text-xs ml-2" style={{ color: 'var(--ink-faint)' }}>{formaGlyph}{tonosStr && ' · ' + tonosStr}</span>
        {hoy > 0 && <span className="ff-mono text-xs ml-1" style={{ color: 'var(--gold)' }}>· {hoy}× hoy</span>}
      </span>
      <span className="ff-mono text-xs mt-1.5" style={{ color: mult > 1.4 ? 'var(--warm)' : mult < 0.9 ? 'var(--ink-faint)' : 'var(--gold)' }}>+{p}</span>
    </button>
    {tickHoy && onUndo && (
      <button onClick={onUndo} className="ring-ink p-2 self-center opacity-50"
        aria-label="Restar una completion de hoy">
        <Minus size={14} style={{ color: 'var(--ink-faint)' }} />
      </button>
    )}
  </div>);
}

// Donar es una sola cosa, pase por donde pase: la camiseta sale del array y
// el evento conserva sus textos. Lo usan el ritual de una y el de un cerro.
function aplicarDonacion(s, camId, dedicatoria) {
  const c = s.camisetas.find(x => x.id === camId);
  if (!c) return false;
  const ded = (dedicatoria || '').trim();
  pushEvento(s, { tipo: 'camiseta_donada', cam_id: camId, nombre: c.nombre, emoji: c.emoji,
    dedicatoria: ded || undefined,
    snapshot: { esencia: c.esencia ?? '', arco: c.arco ?? null,
      misiones: (c.misiones || []).map(m => ({ id: m.id, nombre: m.nombre, forma: m.forma, estado: m.estado, completions: [...(m.completions || [])] })),
      milestones: (c.milestones || []).map(ms => ({ id: ms.id, nombre: ms.nombre, regalo: ms.regalo ?? '', estado: ms.estado })) } });
  s.camisetas = s.camisetas.filter(x => x.id !== camId);
  return true;
}

// Despedirse de un cerro entero. Mismo peso que despedirse de una: un último
// vistazo a lo que hay dentro y un gesto sostenido. Lo que no lleva es la
// opción de mandárselo a alguien —un cerro no se le manda a nadie, se suelta.
function DespedidaCerro({ cerro, dentro, onDonar, onCancel }) {
  return (<div className="fade-up" style={{ border: '1px solid var(--accent)', borderRadius: 2, padding: 16 }}>
    <div className="flex items-baseline justify-between mb-3">
      <span className="smallcaps" style={{ color: 'var(--accent)' }}>Soltar el cerro</span>
      <button onClick={onCancel} className="ring-ink p-1" style={{ color: 'var(--ink-faint)' }} aria-label="Cancelar"><X size={16} /></button>
    </div>
    <p className="ff-serif italic mb-4" style={{ color: 'var(--ink-soft)' }}>
      Un último vistazo a «{cerro.nombre}». Estas {dentro.length === 1 ? 'es la camiseta' : `son las ${dentro.length} camisetas`} que estás soltando:
    </p>
    <div className="grid gap-1 mb-5" style={{ maxHeight: '40vh', overflowY: 'auto' }}>
      {dentro.map(c => (
        <div key={c.id} className="flex items-baseline gap-2 ff-serif">
          <span>{c.emoji}</span><span className="flex-1">{c.nombre}</span>
          {c.esencia && <span className="ff-mono text-xs truncate" style={{ color: 'var(--ink-faint)', maxWidth: '45%' }}>{c.esencia}</span>}
        </div>
      ))}
    </div>
    <p className="ff-serif text-sm mb-4" style={{ color: 'var(--ink-soft)' }}>
      Salen de tu clóset y no vuelven. Conservas los puntos que ganaste con ellas y la historia guarda por dónde pasaron.
    </p>
    <HoldToRelease label={`soltar ${dentro.length === 1 ? 'la camiseta' : 'las ' + dentro.length}`} onComplete={onDonar} duration={2000} />
  </div>);
}

// ── El mueble ────────────────────────────────────────────────────────────
// El clóset dejó de ser una lista. Tres superficies: lo que llevas puesto,
// cinco ganchos y los cerros. No son tres formas de ordenar: son tres formas
// de decir cuánto te importa una camiseta ahora mismo.

// Arrastrar con el dedo. El drag-and-drop nativo de HTML no existe en iOS y
// este clóset vive en un iPhone, así que va con pointer events desde un
// agarradero propio (touch-action: none) para no pelear con el scroll. Las
// zonas donde se puede soltar se marcan con data-drop.
function useArrastre(onSoltar, onTap) {
  const [drag, setDrag] = useState(null);     // { cam, x, y, movido }
  const [zona, setZona] = useState(null);
  const st = useRef({});

  // Autoscroll: el mueble no cabe en una pantalla. Sin esto no hay forma de
  // llevar la camiseta 19 hasta un gancho. Va por intervalo y no por evento
  // porque el dedo puede quedarse quieto en el borde.
  useEffect(() => {
    if (!drag) return;
    const id = setInterval(() => { if (st.current.dir) window.scrollBy(0, st.current.dir * 12); }, 16);
    return () => clearInterval(id);
  }, [!!drag]);

  useEffect(() => {
    if (!drag) return;
    const mover = (e) => {
      const x = e.clientX, y = e.clientY;
      const movido = Math.hypot(x - st.current.x0, y - st.current.y0) > 6;
      const el = document.elementFromPoint(x, y)?.closest?.('[data-drop]');
      st.current.zona = movido ? (el?.dataset?.drop ?? null) : null;
      st.current.movido = movido;
      st.current.dir = !movido ? 0 : y < 100 ? -1 : y > window.innerHeight - 100 ? 1 : 0;
      setZona(st.current.zona);
      setDrag(d => d && { ...d, x, y, movido });
    };
    const soltar = () => {
      const { movido, zona: z, cam } = st.current;
      st.current.dir = 0;
      setDrag(null); setZona(null);
      // Soltar sin haber movido el dedo es un toque en el agarradero: en vez
      // de arrastrar, se abre la lista de sitios. Misma intención, otra mano.
      if (!movido) { onTap?.(cam); return; }
      if (z) onSoltar(cam, z);
    };
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
    window.addEventListener('pointercancel', soltar);
    return () => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
      window.removeEventListener('pointercancel', soltar);
    };
  }, [drag?.cam?.id]);

  const agarrar = (e, cam) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    st.current = { x0: e.clientX, y0: e.clientY, cam, zona: null, movido: false, dir: 0 };
    setDrag({ cam, x: e.clientX, y: e.clientY, movido: false });
  };

  const fantasma = drag && drag.movido ? (
    <div className="fixed pointer-events-none ff-serif flex items-center gap-2 px-3 py-2 aberracion-caja"
      style={{
        left: drag.x, top: drag.y, transform: 'translate(-50%, -50%) rotate(-2deg)',
        zIndex: 200, background: 'var(--bg-card)', border: '1px solid var(--cian)', borderRadius: 2,
      }}>
      <span className="text-xl">{drag.cam.emoji}</span>
      <span className="text-base">{drag.cam.nombre}</span>
    </div>
  ) : null;

  return { agarrar, fantasma, zona, arrastrando: drag?.movido ? drag.cam.id : null };
}

function Agarradero({ onPointerDown, label }) {
  return (
    <button onPointerDown={onPointerDown}
      className="ring-ink px-2 flex items-center justify-center"
      style={{ touchAction: 'none', color: 'var(--ink-faint)', cursor: 'grab' }}
      aria-label={label}>
      <GripVertical size={16} strokeWidth={1.5} />
    </button>
  );
}

// La lista de sitios, para cuando arrastrar no es cómodo o no es posible.
function MoverSheet({ cam, cerros, cams, onMover, onClose }) {
  const ocupante = (i) => cams.find(c => c.id !== cam.id && enGancho(c, i));
  const ir = (u) => { onMover(cam.id, u); onClose(); };
  return (<div className="fixed inset-0 flex items-end justify-center" style={{ zIndex: 150, background: 'rgba(4,2,10,0.72)' }} onClick={onClose}>
    <div className="w-full max-w-xl p-5 fade-up" style={{ background: 'var(--bg)', borderTop: '1px solid var(--cian)', maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
      <div className="flex items-baseline justify-between mb-4">
        <span className="ff-serif text-lg">{cam.emoji} {cam.nombre}</span>
        <button onClick={onClose} className="ring-ink p-1" style={{ color: 'var(--ink-faint)' }} aria-label="Cerrar"><X size={16} /></button>
      </div>
      <div className="grid gap-1">
        {!estaPuesta(cam) && (
          <button onClick={() => ir(PUESTA())} className="text-left ring-ink py-2 px-3 ff-serif"
            style={{ border: '1px solid var(--line-soft)' }}>ponérmela</button>
        )}
        {Array.from({ length: GANCHOS }, (_, i) => {
          const oc = ocupante(i);
          if (enGancho(cam, i)) return null;
          return (<button key={i} onClick={() => ir({ tipo: 'gancho', posicion: i })}
            className="text-left ring-ink py-2 px-3 ff-serif flex items-baseline gap-2"
            style={{ border: '1px solid var(--line-soft)' }}>
            <span>gancho {i + 1}</span>
            <span className="ff-mono text-xs" style={{ color: 'var(--ink-faint)' }}>
              {oc ? `· ocupado por ${oc.nombre}` : '· libre'}
            </span>
          </button>);
        })}
        {cerros.map(k => enCerro(cam, k.id) ? null : (
          <button key={k.id} onClick={() => ir({ tipo: 'cerro', cerroId: k.id })}
            className="text-left ring-ink py-2 px-3 ff-serif flex items-baseline gap-2"
            style={{ border: '1px solid var(--line-soft)' }}>
            <span>{k.nombre}</span>
            <span className="ff-mono text-xs" style={{ color: 'var(--ink-faint)' }}>
              · {cams.filter(c => enCerro(c, k.id)).length}
            </span>
          </button>
        ))}
      </div>
    </div>
  </div>);
}

function FilaCamiseta({ cam, agarrar, onOpen, atenuada }) {
  return (<div className="flex items-stretch" style={{
    background: 'var(--bg-card)', border: '1px solid var(--line-soft)', borderRadius: 2,
    opacity: atenuada ? 0.35 : 1,
  }}>
    <Agarradero onPointerDown={e => agarrar(e, cam)} label={`Mover ${cam.nombre}`} />
    <button onClick={() => onOpen(cam.id)} className="text-left ring-ink flex-1 py-2 pr-3">
      <div className="flex items-center gap-3">
        <span className="text-xl">{cam.emoji}</span>
        <span className="ff-serif text-base flex-1">{cam.nombre}</span>
        <ChevronRight size={16} strokeWidth={1.4} style={{ color: 'var(--ink-faint)' }} />
      </div>
    </button>
  </div>);
}

function CamisetasView({ cams, cerros, movimientos, onOpen, onCreate, onOpenCatalogo, onImport,
                        onReorder, onMover, onLavar, onCrearCerro, onRenombrarCerro, onBorrarCerro, onDonarCerro }) {
  // Los cerros arrancan abiertos: un cerro sirve para saber qué hay dentro.
  // Se cierran cuando estorban, no al revés.
  const [cerrados, setCerrados] = useState(() => new Set());
  const [creandoCerro, setCreandoCerro] = useState(false);
  const [nombreCerro, setNombreCerro] = useState('');
  const [renombrando, setRenombrando] = useState(null);
  const [borrando, setBorrando] = useState(null);
  const [donando, setDonando] = useState(null);
  const [moviendo, setMoviendo] = useState(null);

  const { agarrar, fantasma, zona, arrastrando } = useArrastre(
    (cam, destino) => {
      const [tipo, arg] = destino.split(':');
      if (tipo === 'puesta') onMover(cam.id, PUESTA());
      else if (tipo === 'gancho') onMover(cam.id, { tipo: 'gancho', posicion: Number(arg) });
      else if (tipo === 'cerro') onMover(cam.id, { tipo: 'cerro', cerroId: arg });
    },
    (cam) => setMoviendo(cam.id),
  );

  const puestas = cams.filter(estaPuesta);
  const ordenados = [...cerros].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  const toggleCerro = (id) => setCerrados(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const marco = (clave) => zona === clave
    ? { borderColor: 'var(--cian)', boxShadow: '0 0 0 1px var(--magenta), 0 0 18px -4px var(--cian)' }
    : { borderColor: 'var(--line-soft)' };

  const camMoviendo = moviendo ? cams.find(c => c.id === moviendo) : null;

  return (<div className="fade-up">
    {fantasma}
    {camMoviendo && <MoverSheet cam={camMoviendo} cerros={ordenados} cams={cams}
      onMover={onMover} onClose={() => setMoviendo(null)} />}

    <div className="flex items-baseline justify-between mb-6">
      <p className="ff-serif italic text-lg" style={{ color: 'var(--ink-soft)' }}>Tu clóset.</p>
      <div className="flex gap-1">
        <button onClick={onOpenCatalogo} className="ring-ink ff-mono text-xs py-1 px-2" style={{ color: 'var(--ink-faint)', border: '1px solid var(--line)' }}>catálogo</button>
        <button onClick={onImport} className="ring-ink p-2" style={{ color: 'var(--ink-soft)' }} aria-label="Recibir camiseta"><Inbox size={20} strokeWidth={1.5} /></button>
        <button onClick={onCreate} className="ring-ink p-2" style={{ color: 'var(--ink-soft)' }} aria-label="Crear camiseta"><Plus size={20} strokeWidth={1.5} /></button>
      </div>
    </div>

    {/* ── Puestas ── van arriba: son las importantes. Sin límite, a propósito;
        la salida no es un tope, es lavar la ropa. */}
    <div className="flex items-baseline justify-between mb-3">
      <span className="smallcaps" style={{ color: 'var(--magenta)' }}>Puestas</span>
      <span className="ff-mono text-xs" style={{ color: 'var(--ink-faint)' }}>{puestas.length}</span>
    </div>
    <div data-drop="puesta" className="grid gap-3"
      style={{ border: '1px solid', borderRadius: 2, padding: puestas.length ? 0 : 16,
               ...(zona === 'puesta' ? { borderColor: 'var(--cian)', boxShadow: '0 0 18px -4px var(--cian)' } : { borderColor: 'transparent' }) }}>
      {puestas.length === 0 && (
        <p className="ff-serif italic" style={{ color: 'var(--ink-faint)' }}>
          No llevas nada puesto. Baja algo de un gancho o de un cerro.
        </p>
      )}
      {puestas.map((cam, i) => {
        const act = cam.misiones.filter(m => enJuego(m)).length;
        const hechasTot = cam.misiones.reduce((acc, m) => acc + (m.completed_at ? 1 : 0) + (m.completions?.length || 0), 0);
        const puntosTot = puntosCamiseta(movimientos, cam.id);
        return (<div key={cam.id} className="flex" style={{
          background: 'var(--bg-card)', border: '1px solid var(--line-soft)', borderRadius: 2,
          opacity: arrastrando === cam.id ? 0.35 : 1,
        }}>
          <div className="flex flex-col items-center justify-center border-r" style={{ borderColor: 'var(--line-soft)' }}>
            {puestas.length > 1 && (
              <button onClick={() => onReorder(cam.id, -1)} disabled={i === 0}
                className="ring-ink p-1.5 disabled:opacity-20" style={{ color: 'var(--ink-faint)' }} aria-label="Subir camiseta">
                <ChevronUp size={16} strokeWidth={1.5} />
              </button>
            )}
            <Agarradero onPointerDown={e => agarrar(e, cam)} label={`Mover ${cam.nombre}`} />
            {puestas.length > 1 && (
              <button onClick={() => onReorder(cam.id, +1)} disabled={i === puestas.length - 1}
                className="ring-ink p-1.5 disabled:opacity-20" style={{ color: 'var(--ink-faint)' }} aria-label="Bajar camiseta">
                <ChevronDown size={16} strokeWidth={1.5} />
              </button>
            )}
          </div>
          <button onClick={() => onOpen(cam.id)} className="text-left p-5 ring-ink flex-1">
            <div className="flex items-start gap-4">
              <span className="text-3xl">{cam.emoji}</span>
              <div className="flex-1 min-w-0">
                <h3 className="ff-serif text-2xl mb-1">{cam.nombre}</h3>
                {cam.arco && <div className="ff-mono text-xs mb-2" style={{ color: 'var(--ink-faint)' }}>{cam.arco.de} → {cam.arco.a}</div>}
                {cam.esencia && <p className="ff-serif italic text-sm leading-snug" style={{ color: 'var(--ink-soft)' }}>{cam.esencia}</p>}
                <div className="ff-mono text-xs mt-3" style={{ color: 'var(--ink-faint)' }}>
                  {act} activas · {hechasTot} hechas
                  {puntosTot > 0 && <> · <span style={{ color: 'var(--gold)' }}>{round1(puntosTot)} pts</span></>}
                </div>
              </div>
              <ChevronRight size={20} strokeWidth={1.4} style={{ color: 'var(--ink-faint)' }} />
            </div>
          </button>
        </div>);
      })}
    </div>

    {/* Lavar la ropa. Al final de la lista, que es donde llega el agobio.
        Sin confirmación y sin deshacer: no destruye nada, y preguntarle
        "¿estás seguro?" a alguien agobiado es insufrible. */}
    {puestas.length > 0 && (
      <button onClick={onLavar} className="w-full ring-ink ff-mono text-sm py-4 mt-4 mb-12 boton-neon"
        style={{ letterSpacing: '0.18em' }}>
        LAVAR LA ROPA
      </button>
    )}

    {/* ── Ganchos ── cinco, fijos. Un gancho libre es información, así que
        se dibuja vacío en vez de desaparecer. */}
    <div className="smallcaps mb-3" style={{ color: 'var(--cian)' }}>Ganchos</div>
    <div className="grid gap-2 mb-12">
      {Array.from({ length: GANCHOS }, (_, i) => {
        const cam = cams.find(c => enGancho(c, i));
        return (<div key={i} data-drop={`gancho:${i}`}
          style={{ border: cam ? '1px solid' : '1px dashed', borderRadius: 2,
                   background: cam ? 'var(--bg-card)' : 'transparent', ...marco(`gancho:${i}`) }}>
          {cam ? (
            <div className="flex items-stretch" style={{ opacity: arrastrando === cam.id ? 0.35 : 1 }}>
              <Agarradero onPointerDown={e => agarrar(e, cam)} label={`Mover ${cam.nombre}`} />
              <button onClick={() => onOpen(cam.id)} className="text-left ring-ink flex-1 py-3 pr-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{cam.emoji}</span>
                  <span className="ff-serif text-lg flex-1">{cam.nombre}</span>
                  <ChevronRight size={16} strokeWidth={1.4} style={{ color: 'var(--ink-faint)' }} />
                </div>
              </button>
            </div>
          ) : (
            <div className="py-4 px-4 ff-mono text-xs" style={{ color: 'var(--ink-faint)' }}>gancho libre</div>
          )}
        </div>);
      })}
    </div>

    {/* ── Cerros ── montones con nombre. Por dentro no se ordenan. */}
    <div className="flex items-baseline justify-between mb-3">
      <span className="smallcaps" style={{ color: 'var(--violeta-luz)' }}>Cerros</span>
      {!creandoCerro && (
        <button onClick={() => { setCreandoCerro(true); setNombreCerro(''); }}
          className="ring-ink ff-mono text-xs py-1 px-2" style={{ color: 'var(--ink-faint)', border: '1px solid var(--line)' }}>
          nuevo cerro
        </button>
      )}
    </div>
    {creandoCerro && (
      <div className="flex gap-2 mb-3 fade-up">
        <input value={nombreCerro} onChange={e => setNombreCerro(e.target.value)} autoFocus
          placeholder="nombre del cerro"
          onKeyDown={e => { if (e.key === 'Enter' && nombreCerro.trim()) { onCrearCerro(nombreCerro); setCreandoCerro(false); } if (e.key === 'Escape') setCreandoCerro(false); }}
          className="flex-1 ff-serif text-lg pb-1 ring-ink" style={{ borderBottom: '1px solid var(--line)' }} />
        <button onClick={() => { if (nombreCerro.trim()) onCrearCerro(nombreCerro); setCreandoCerro(false); }}
          className="ring-ink ff-mono text-xs px-3" style={{ border: '1px solid var(--cian)', color: 'var(--cian)' }}>crear</button>
        <button onClick={() => setCreandoCerro(false)} className="ring-ink p-1" style={{ color: 'var(--ink-faint)' }}><X size={16} /></button>
      </div>
    )}
    <div className="grid gap-2 pb-8">
      {ordenados.map(k => {
        const dentro = cams.filter(c => enCerro(c, k.id));
        const abierto = !cerrados.has(k.id);
        return (<div key={k.id} data-drop={`cerro:${k.id}`}
          style={{ border: '1px solid', borderRadius: 2, background: 'var(--bg-card)', ...marco(`cerro:${k.id}`) }}>
          {renombrando === k.id ? (
            <div className="flex gap-2 p-3">
              <input defaultValue={k.nombre} autoFocus
                onKeyDown={e => { if (e.key === 'Enter') { onRenombrarCerro(k.id, e.target.value); setRenombrando(null); } if (e.key === 'Escape') setRenombrando(null); }}
                onBlur={e => { onRenombrarCerro(k.id, e.target.value); setRenombrando(null); }}
                className="flex-1 ff-serif text-lg pb-1 ring-ink" style={{ borderBottom: '1px solid var(--line)' }} />
            </div>
          ) : (
            <div className="flex items-center">
              <button onClick={() => toggleCerro(k.id)} className="text-left ring-ink flex-1 py-3 px-4">
                <div className="flex items-baseline gap-2">
                  <span className="ff-serif text-lg">{k.nombre}</span>
                  <span className="ff-mono text-xs" style={{ color: 'var(--ink-faint)' }}>{dentro.length}</span>
                  {/* Cerrado, la tira de emojis dice qué hay sin abrirlo. */}
                  {!abierto && <span className="flex-1 truncate text-sm">{dentro.map(c => c.emoji).join(' ')}</span>}
                  {abierto ? <ChevronUp size={16} strokeWidth={1.4} className="ml-auto" style={{ color: 'var(--ink-faint)' }} />
                           : <ChevronDown size={16} strokeWidth={1.4} className="ml-auto" style={{ color: 'var(--ink-faint)' }} />}
                </div>
              </button>
              {!k.esDelSistema && (borrando === k.id ? (
                <div className="flex items-center gap-2 pr-3 fade-up">
                  <span className="ff-mono text-xs" style={{ color: 'var(--ink-faint)' }}>¿borrar?</span>
                  <button onClick={() => { onBorrarCerro(k.id); setBorrando(null); }} className="ring-ink ff-mono text-xs px-2 py-0.5" style={{ color: 'var(--accent)', border: '1px solid var(--accent)' }}>sí</button>
                  <button onClick={() => setBorrando(null)} className="ring-ink ff-mono text-xs px-2 py-0.5" style={{ color: 'var(--ink-faint)' }}>no</button>
                </div>
              ) : (
                <div className="flex items-center pr-2">
                  <button onClick={() => setRenombrando(k.id)} className="ring-ink p-2" style={{ color: 'var(--ink-faint)' }} aria-label={`Renombrar ${k.nombre}`}><Edit2 size={14} strokeWidth={1.5} /></button>
                  <button onClick={() => setBorrando(k.id)} className="ring-ink p-2" style={{ color: 'var(--ink-faint)' }} aria-label={`Borrar ${k.nombre}`}><Trash2 size={14} strokeWidth={1.5} /></button>
                </div>
              ))}
            </div>
          )}
          {abierto && (
            <div className="px-3 pb-3">
              {dentro.length === 0
                ? <p className="ff-serif italic text-sm" style={{ color: 'var(--ink-faint)' }}>Vacío.</p>
                : (<>
                    <div className="grid gap-1">
                      {dentro.map(cam => <FilaCamiseta key={cam.id} cam={cam} agarrar={agarrar}
                        onOpen={onOpen} atenuada={arrastrando === cam.id} />)}
                    </div>
                    {/* Donar el cerro entero. El cerro ya es la selección: no
                        hace falta escoger camiseta por camiseta. */}
                    {donando === k.id ? (
                      <div className="mt-3">
                        <DespedidaCerro cerro={k} dentro={dentro}
                          onDonar={() => { onDonarCerro(k.id); setDonando(null); }}
                          onCancel={() => setDonando(null)} />
                      </div>
                    ) : (
                      <button onClick={() => setDonando(k.id)}
                        className="ring-ink ff-mono text-xs mt-3 py-1 px-2"
                        style={{ color: 'var(--ink-faint)', border: '1px solid var(--line-soft)' }}>
                        donar el cerro
                      </button>
                    )}
                  </>)}
            </div>
          )}
        </div>);
      })}
    </div>
  </div>);
}

// El ritual de despedida (donar v2). Tres movimientos: un último vistazo,
// un gesto deliberado (no un tap), y una línea opcional que viaja con la copia.
// Soltar una camiseta = soltar una identidad que vestiste. Esto lo honra.
function DespedidaRitual({ cam, movimientos, onDedicatoria, onShare, onDonate, onCancel }) {
  const [fase, setFase] = useState('vistazo');  // vistazo | dedicatoria | soltar
  const [dedicatoria, setDedicatoria] = useState('');
  const [previewSrc, setPreviewSrc] = useState(null);
  const setDed = (v) => { const t = v.slice(0, 140); setDedicatoria(t); if (onDedicatoria) onDedicatoria(t); };

  // Imagen de la camiseta para la pantalla final (último vistazo / compartir).
  // v4: generateCamisetaSVG es async (el framing 0x08 comprime con CompressionStream).
  // Guard `vivo` para no pintar un resultado viejo si cam cambia / se desmonta.
  useEffect(() => {
    let vivo = true;
    let url = null;
    generateCamisetaSVG(cam, { mode: 'molde' })
      .then(raw => {
        if (!vivo) return;
        const blob = new Blob([raw], { type: 'image/svg+xml' });
        url = URL.createObjectURL(blob);
        setPreviewSrc(url);
      })
      .catch(() => { /* sin preview si falla */ });
    return () => { vivo = false; if (url) URL.revokeObjectURL(url); };
  }, [cam]);

  // Movimiento 1 — la vida de esta camiseta (los datos ya existen).
  const vida = useMemo(() => {
    const dias = cam.created_at
      ? Math.max(1, Math.round((Date.now() - new Date(cam.created_at).getTime()) / 86400000))
      : null;
    const completadas = (movimientos || []).filter(m => m.cam_id === cam.id && m.tipo === 'mision_completada').length;
    const pts = round1(puntosCamiseta(movimientos, cam.id));
    const milestonesLogrados = (cam.milestones || []).filter(ms => ms.logrado_at || ms.completed_at || ms.estado === 'logrado');
    return { dias, completadas, pts, milestonesLogrados };
  }, [cam, movimientos]);

  return (<div className="fade-up max-w-md">
    {fase === 'vistazo' && (<>
      <div className="text-4xl mb-3">{cam.emoji}</div>
      <p className="ff-serif text-lg mb-1" style={{ color: 'var(--ink)' }}>
        La vida de <strong>{cam.nombre}</strong>
      </p>
      <p className="ff-serif text-sm mb-4" style={{ color: 'var(--ink-soft)' }}>
        {vida.dias != null && <>La vestiste {vida.dias} {vida.dias === 1 ? 'día' : 'días'}. </>}
        {vida.completadas > 0 && <>{vida.completadas} {vida.completadas === 1 ? 'misión cumplida' : 'misiones cumplidas'}. </>}
        {vida.pts > 0 && <>{vida.pts} puntos. </>}
        {cam.arco?.a && <>Llegaste a {cam.arco.a}.</>}
      </p>
      {vida.milestonesLogrados.length > 0 && (
        <div className="mb-4 ff-mono text-xs" style={{ color: 'var(--gold)' }}>
          {vida.milestonesLogrados.slice(0, 2).map((ms, i) => <div key={i}>◆ {ms.nombre}</div>)}
        </div>
      )}
      <p className="ff-serif italic text-base mb-2" style={{ color: 'var(--ink-soft)' }}>La usaste hasta aprender lo que tenía que enseñarte.</p>
      <p className="ff-serif italic text-base mb-2" style={{ color: 'var(--ink-soft)' }}>Ahora la doblas.</p>
      <p className="ff-serif italic text-base mb-6" style={{ color: 'var(--ink-soft)' }}>No la tiras: alguien empieza donde tú lo dejaste.</p>
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => setFase('dedicatoria')} className="ff-serif text-base ring-ink px-5 py-2"
          style={{ background: 'var(--ink)', color: 'var(--bg)' }}>despedirla →</button>
        <button onClick={onCancel} className="ff-mono text-xs ring-ink px-3 py-1" style={{ color: 'var(--ink-faint)' }}>cancelar</button>
      </div>
    </>)}

    {fase === 'dedicatoria' && (<>
      <p className="ff-serif text-lg mb-1" style={{ color: 'var(--ink)' }}>Despídete de ella.</p>
      <p className="ff-serif text-sm mb-4" style={{ color: 'var(--ink-soft)' }}>
        Escríbele algo a la camiseta antes de soltarla. Una despedida. Tu historia no viaja —eso es privado—, pero esta línea sí: queda en la prenda, y quien la reciba también podrá leerla. (Puedes dejarlo vacío.)
      </p>
      <textarea value={dedicatoria} onChange={e => setDed(e.target.value)} autoFocus rows={2}
        placeholder="Lo que quieras decirle…" className="w-full ff-serif text-base p-3 mb-2 ring-ink resize-none italic"
        style={{ border: '1px solid var(--line)', background: 'var(--bg-card)' }} />
      <p className="ff-mono text-xs mb-5" style={{ color: 'var(--ink-faint)' }}>{dedicatoria.length}/140</p>
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={onShare} className="ff-mono text-xs ring-ink px-3 py-1.5 flex items-center gap-1.5"
          style={{ color: 'var(--ink-soft)', border: '1px solid var(--line)' }}>
          <Share2 size={12} /><span>compartir copia</span>
        </button>
        <button onClick={() => setFase('soltar')} className="ff-serif text-base ring-ink px-5 py-2"
          style={{ background: 'var(--ink)', color: 'var(--bg)' }}>continuar →</button>
        <button onClick={() => setFase('vistazo')} className="ff-mono text-xs ring-ink px-3 py-1" style={{ color: 'var(--ink-faint)' }}>← atrás</button>
      </div>
    </>)}

    {fase === 'soltar' && (<>
      <p className="ff-serif text-lg mb-1" style={{ color: 'var(--ink)' }}>Una última vez.</p>
      <p className="ff-serif text-sm mb-4" style={{ color: 'var(--ink-soft)' }}>
        Mírala una vez más. Si quieres, envíasela a quien siga —esta es la última oportunidad—. Luego, suéltala.
      </p>
      {previewSrc && (
        <div className="mb-4" style={{ border: '1px solid var(--line)', maxWidth: '240px', margin: '0 auto 1rem' }}>
          <img src={previewSrc} alt={`Diseño de ${cam.nombre}`} style={{ width: '100%', height: 'auto', display: 'block' }} />
        </div>
      )}
      <button onClick={onShare} className="w-full ring-ink ff-mono text-xs px-3 py-2.5 mb-5 flex items-center justify-center gap-1.5"
        style={{ color: 'var(--ink-soft)', border: '1px solid var(--line)' }}>
        <Share2 size={13} /><span>compartir la imagen</span>
      </button>
      <HoldToRelease label="mantener para soltar" onComplete={() => onDonate(dedicatoria)} />
      <button onClick={() => setFase('dedicatoria')} className="ff-mono text-xs ring-ink px-3 py-1 mt-5" style={{ color: 'var(--ink-faint)' }}>← atrás</button>
    </>)}
  </div>);
}

// Movimiento 2 — el gesto. Mantener presionado ~1.5s; la barra se llena.
// Un clic rápido no se siente como soltar algo.
function HoldToRelease({ label, onComplete, duration = 1500 }) {
  const [progress, setProgress] = useState(0);
  const raf = useRef(null);
  const start = useRef(null);
  const done = useRef(false);

  const tick = (t) => {
    if (start.current == null) start.current = t;
    const p = Math.min(1, (t - start.current) / duration);
    setProgress(p);
    if (p >= 1) {
      if (!done.current) { done.current = true; onComplete(); }
      return;
    }
    raf.current = requestAnimationFrame(tick);
  };
  const begin = () => {
    if (done.current) return;
    start.current = null;
    raf.current = requestAnimationFrame(tick);
  };
  const cancel = () => {
    if (done.current) return;
    if (raf.current) cancelAnimationFrame(raf.current);
    start.current = null;
    setProgress(0);
  };
  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current); }, []);

  return (
    <button
      onMouseDown={begin} onMouseUp={cancel} onMouseLeave={cancel}
      onTouchStart={(e) => { e.preventDefault(); begin(); }} onTouchEnd={cancel}
      className="relative w-full ring-ink overflow-hidden select-none"
      style={{ border: '1px solid var(--accent)', height: '3rem', background: 'transparent' }}>
      <div className="absolute inset-0" style={{ width: `${progress * 100}%`, background: 'var(--accent)', transition: progress === 0 ? 'width 0.2s ease' : 'none' }} />
      <span className="relative ff-mono text-xs" style={{ color: progress > 0.5 ? 'var(--bg)' : 'var(--accent)' }}>
        {progress >= 1 ? 'soltando…' : label}
      </span>
    </button>
  );
}

function CamisetaDetail({ cam, movimientos, onBack, onAddMision, onEditMision, onToggle, onUndo, onArchive, onRevive, onDelete, onAddMilestone, onToggleMilestone, onCobrarMilestone, onEditMilestone, onEditCam, onReviveCam, onArchiveCam, onDonateCam }) {
  const [adding, setAdding] = useState(false);
  const [addingMs, setAddingMs] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editingMs, setEditingMs] = useState(null);
  const [editingCam, setEditingCam] = useState(false);
  const [confirmRetiro, setConfirmRetiro] = useState(false);
  const [confirmDonar, setConfirmDonar] = useState(false);  // abre el ritual de despedida
  const [sharing, setSharing] = useState(false);
  const [donateDed, setDonateDed] = useState('');  // dedicatoria del ritual, viaja con la copia compartida
  const activas = cam.misiones.filter(m => enJuego(m));
  const hechas = cam.misiones.filter(m => m.estado === 'hecha' && m.forma !== 'recurrente');
  const archivadas = cam.misiones.filter(m => m.estado === 'archivada');

  // Auto-cancela el confirmar después de 4s
  useEffect(() => {
    if (!confirmRetiro) return;
    const t = setTimeout(() => setConfirmRetiro(false), 4000);
    return () => clearTimeout(t);
  }, [confirmRetiro]);

  if (editingCam) {
    return <EditCamiseta cam={cam}
      onSave={(d) => { onEditCam(d); setEditingCam(false); }}
      onCancel={() => setEditingCam(false)} />;
  }

  return (<div className="px-5 pt-6 pb-32 max-w-2xl mx-auto fade-up">
    <button onClick={onBack} className="ring-ink mb-6 flex items-center gap-1 ff-mono text-xs" style={{ color: 'var(--ink-faint)' }}>
      <ChevronLeft size={14} /> mazo
    </button>
    <div className="flex items-start justify-between mb-2">
      <div className="text-5xl">{cam.emoji}</div>
      <div className="flex gap-2 mt-3">
        <button onClick={() => setSharing(true)} className="ring-ink ff-mono text-xs py-1 px-2 flex items-center gap-1.5"
          style={{ color: 'var(--ink-faint)', border: '1px solid var(--line)' }} aria-label="Compartir camiseta">
          <Share2 size={12} /><span>compartir</span>
        </button>
        <button onClick={() => setEditingCam(true)} className="ring-ink ff-mono text-xs py-1 px-2"
          style={{ color: 'var(--ink-faint)', border: '1px solid var(--line)' }}>editar</button>
      </div>
    </div>
    <h1 className="display text-4xl md:text-5xl mb-2">
      {cam.nombre}
      {!estaPuesta(cam) && <span className="ff-mono text-xs ml-3 align-middle" style={{ color: 'var(--ink-faint)' }}>en el clóset</span>}
    </h1>
    {cam.arco && (<div className="ff-mono text-xs mb-3" style={{ color: 'var(--ink-soft)' }}>
      {cam.arco.de} <span style={{ color: 'var(--ink-faint)' }}>→</span> {cam.arco.a}
    </div>)}
    {cam.esencia && <p className="ff-serif italic text-lg leading-snug mb-8 max-w-lg" style={{ color: 'var(--ink-soft)' }}>{cam.esencia}</p>}
    <div className="hr-deco mb-6" />
    <div className="flex items-baseline justify-between mb-4">
      <h2 className="smallcaps" style={{ color: 'var(--ink-faint)' }}>Misiones</h2>
      <button onClick={() => setAdding(true)} className="ff-mono text-xs ring-ink py-1 px-2" style={{ color: 'var(--ink-soft)' }}>+ misión</button>
    </div>
    {adding && <MisionForm onSave={(m) => { onAddMision(m); setAdding(false); }} onCancel={() => setAdding(false)} />}
    <div className="space-y-1 mb-6">
      {activas.length === 0 && !adding && <p className="ff-serif italic text-sm py-3" style={{ color: 'var(--ink-faint)' }}>Sin misiones. Pon una.</p>}
      {activas.map(m => editing === m.id ? (
        <MisionForm key={m.id} initial={m} onSave={(d) => { onEditMision(m.id, d); setEditing(null); }} onCancel={() => setEditing(null)} />
      ) : (
        <MisionRowDetail key={m.id} m={m} onToggle={() => onToggle(m.id)} onUndo={() => onUndo(m.id)} onArchive={() => onArchive(m.id)} onDelete={() => onDelete(m.id)} onEdit={() => setEditing(m.id)} />
      ))}
    </div>
    {hechas.length > 0 && (<>
      <div className="smallcaps mb-3" style={{ color: 'var(--ink-faint)' }}>hechas</div>
      <div className="space-y-1 mb-6">
        {hechas.map(m => editing === m.id ? (
          <MisionForm key={m.id} initial={m} onSave={(d) => { onEditMision(m.id, d); setEditing(null); }} onCancel={() => setEditing(null)} />
        ) : (
          <MisionRowDetail key={m.id} m={m} onToggle={() => onToggle(m.id)} onArchive={() => onArchive(m.id)} onDelete={() => onDelete(m.id)} onEdit={() => setEditing(m.id)} />
        ))}
      </div>
    </>)}
    {archivadas.length > 0 && (<details className="mb-6">
      <summary className="smallcaps cursor-pointer" style={{ color: 'var(--ink-faint)' }}>{archivadas.length} archivadas</summary>
      <div className="space-y-1 mt-2">
        {archivadas.map(m => (
          <div key={m.id} className="flex items-center justify-between py-1">
            <span className="ff-serif text-sm" style={{ color: 'var(--ink-faint)' }}>{m.nombre}</span>
            <button onClick={() => onRevive(m.id)} className="ring-ink p-1" title="recuperar">
              <RotateCcw size={12} style={{ color: 'var(--ink-faint)' }} />
            </button>
          </div>
        ))}
      </div>
    </details>)}
    <div className="hr-deco mb-6" />
    <div className="flex items-baseline justify-between mb-4">
      <h2 className="smallcaps" style={{ color: 'var(--ink-faint)' }}>Milestones</h2>
      <button onClick={() => setAddingMs(true)} className="ff-mono text-xs ring-ink py-1 px-2" style={{ color: 'var(--ink-soft)' }}>+ milestone</button>
    </div>
    {addingMs && <AddMilestone onSave={(m) => { onAddMilestone(m); setAddingMs(false); }} onCancel={() => setAddingMs(false)} />}
    <div className="space-y-2 mb-10">
      {cam.milestones.length === 0 && !addingMs && <p className="ff-serif italic text-sm py-1" style={{ color: 'var(--ink-faint)' }}>Sin hitos mayores definidos.</p>}
      {cam.milestones.map(ms => {
        const logrado = ms.estado === 'logrado';
        const tieneRegalo = ms.regalo && ms.regalo.trim();
        const cobrado = !!ms.regalo_cobrado_at;
        const porCobrar = logrado && tieneRegalo && !cobrado;
        if (editingMs === ms.id) {
          return <MilestoneForm key={ms.id} initial={ms} submitLabel="guardar"
            onSave={(d) => { onEditMilestone(ms.id, d); setEditingMs(null); }}
            onCancel={() => setEditingMs(null)} />;
        }
        return (
          <div key={ms.id} className="py-1 group">
            <div className="flex items-start gap-3">
              <button onClick={() => onToggleMilestone(ms.id)} className="flex-shrink-0 mt-1.5 ring-ink check-ani">
                <span className="block w-4 h-4 rotate-45 check-ani" style={{
                  border: '1px solid ' + (logrado ? 'var(--gold)' : 'var(--line)'),
                  background: logrado ? 'var(--gold)' : 'transparent',
                }} />
              </button>
              <div className="flex-1 ff-serif" style={{ color: logrado ? 'var(--ink-soft)' : 'var(--ink)' }}>
                {ms.nombre}
                {ms.descripcion && <span className="block ff-mono text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>{ms.descripcion}</span>}
                {tieneRegalo && (
                  <span className="block ff-serif italic text-sm mt-1" style={{ color: cobrado ? 'var(--ink-faint)' : 'var(--gold)' }}>
                    {cobrado ? '✓ ' : '🎁 '}{ms.regalo}
                    {cobrado && <span className="ff-mono text-xs ml-2" style={{ color: 'var(--ink-faint)' }}>cobrado</span>}
                  </span>
                )}
              </div>
              {porCobrar && (
                <button onClick={() => onCobrarMilestone(ms.id)}
                  className="ring-ink ff-mono text-xs py-1 px-2 fade-up"
                  style={{ background: 'var(--gold)', color: 'var(--bg)' }}>
                  cobrar
                </button>
              )}
              {!cobrado && (
                <button onClick={() => setEditingMs(ms.id)}
                  className="ring-ink ff-mono text-xs py-1 px-2"
                  style={{ color: 'var(--ink-faint)' }} aria-label="Editar milestone">
                  <Edit2 size={12} strokeWidth={1.5} />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
    <div className="pt-6 border-t" style={{ borderColor: 'var(--line-soft)' }}>
      {confirmDonar ? (
        <DespedidaRitual cam={cam} movimientos={movimientos}
          onDedicatoria={setDonateDed}
          onShare={() => setSharing(true)}
          onDonate={(ded) => onDonateCam(ded)}
          onCancel={() => setConfirmDonar(false)} />
      ) : estaPuesta(cam) ? (
        confirmRetiro ? (
          <div className="flex items-center gap-3 fade-up">
            <span className="ff-serif italic text-sm" style={{ color: 'var(--ink-soft)' }}>¿«{cam.nombre}» al closet?</span>
            <button onClick={() => { onArchiveCam(); }} className="ff-mono text-xs ring-ink px-3 py-1"
              style={{ background: 'var(--accent)', color: 'var(--bg)' }}>sí, al closet</button>
            <button onClick={() => setConfirmRetiro(false)} className="ff-mono text-xs ring-ink px-3 py-1"
              style={{ color: 'var(--ink-faint)' }}>no</button>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <button onClick={() => setConfirmRetiro(true)} className="ff-mono text-xs ring-ink py-2"
              style={{ color: 'var(--ink-faint)' }}>guardar en el closet</button>
            <button onClick={() => setConfirmDonar(true)} className="ff-mono text-xs ring-ink py-2"
              style={{ color: 'var(--ink-faint)' }}>donar</button>
          </div>
        )
      ) : (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="ff-serif italic text-sm" style={{ color: 'var(--ink-faint)' }}>esta camiseta vive en el closet</span>
          <button onClick={onReviveCam} className="ff-mono text-xs ring-ink py-1 px-3"
            style={{ color: 'var(--moss)', border: '1px solid var(--moss)' }}>al mazo</button>
          <button onClick={() => setConfirmDonar(true)} className="ff-mono text-xs ring-ink py-1 px-3"
            style={{ color: 'var(--ink-faint)' }}>donar</button>
        </div>
      )}
    </div>
    {sharing && <ShareSheet cam={donateDed ? { ...cam, dedicatoria: donateDed } : cam} onClose={() => setSharing(false)} />}
  </div>);
}

function ShareSheet({ cam, onClose }) {
  const [busy, setBusy] = useState(null);     // 'share' | 'download' | 'copy' | null
  const [msg, setMsg] = useState(null);       // { kind: 'ok'|'err', text }
  const [showText, setShowText] = useState(false);  // fallback de texto desplegado
  const [imgFailed, setImgFailed] = useState(false); // la imagen falló por tamaño u otro

  // Preview as <img src=blob>. Loading SVG via <img> sandboxes any embedded
  // <script> (no execution), so we don't need to trust strings the codec
  // interpolates into the SVG. The PNG export uses the same SVG via canvas,
  // so what you see is what you send.
  // v4: generateCamisetaSVG es async → previewSrc pasa de useMemo a estado.
  // `previewFailed` distingue "aún cargando" (null) de "falló de verdad", para
  // no parpadear el mensaje de error en el frame pendiente cada vez que abre.
  const [previewSrc, setPreviewSrc] = useState(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  useEffect(() => {
    let vivo = true;
    let url = null;
    setPreviewFailed(false);
    generateCamisetaSVG(cam)
      .then(raw => {
        if (!vivo) return;
        const blob = new Blob([raw], { type: 'image/svg+xml' });
        url = URL.createObjectURL(blob);
        setPreviewSrc(url);
      })
      .catch(e => { console.error('preview SVG failed:', e); if (vivo) setPreviewFailed(true); });
    return () => { vivo = false; if (url) URL.revokeObjectURL(url); };
  }, [cam]);

  const slug = (cam.nombre || 'camiseta').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const filename = `${slug || 'camiseta'}.png`;

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const canCopy = typeof navigator !== 'undefined' && navigator.clipboard?.write && typeof ClipboardItem !== 'undefined';

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 3000);
    return () => clearTimeout(t);
  }, [msg]);

  // ESC to close
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  async function getBlob() {
    return await encodeCamisetaToPng(cam, { mode: 'molde' });
  }

  // Fallback de texto (JSON solo-molde). Adicional a la imagen, no la reemplaza.
  const moldeJSON = useMemo(() => {
    try { return encodeCamisetaToJSON(cam); }
    catch (e) { console.error('molde JSON failed:', e); return null; }
  }, [cam]);

  // Si la imagen falla por tamaño (capacidad del codec), abrimos el fallback.
  function handleImgError(e) {
    const tooBig = /demasiado grande|capacidad|payload/i.test(e?.message || '');
    if (tooBig) {
      setImgFailed(true);
      setShowText(true);
      setMsg({ kind: 'err', text: 'La camiseta es muy grande para la imagen. Usá el texto.' });
    } else {
      setMsg({ kind: 'err', text: e.message || 'no se pudo generar la imagen' });
    }
  }

  async function doShareText() {
    if (!moldeJSON) return;
    setBusy('share-text');
    try {
      // Solo viaja el JSON limpio. Quien recibe lo pega tal cual en
      // Recibir → "pegar texto"; el decoder acepta el molde sin recortes.
      const text = moldeJSON;
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({ title: cam.nombre, text });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setMsg({ kind: 'ok', text: 'molde copiado — pégalo donde quieras' });
        return;
      } else {
        throw new Error('Tu sistema no permite compartir ni copiar texto.');
      }
      setMsg({ kind: 'ok', text: 'compartida como texto' });
    } catch (e) {
      if (e.name !== 'AbortError') setMsg({ kind: 'err', text: e.message || 'no se pudo compartir el texto' });
    } finally {
      setBusy(null);
    }
  }

  async function doCopyText() {
    if (!moldeJSON) return;
    setBusy('copy-text');
    try {
      await navigator.clipboard.writeText(moldeJSON);
      setMsg({ kind: 'ok', text: 'molde copiado al portapapeles' });
    } catch (e) {
      setMsg({ kind: 'err', text: e.message || 'no se pudo copiar el texto' });
    } finally {
      setBusy(null);
    }
  }

  async function doShare() {
    setBusy('share');
    try {
      const blob = await getBlob();
      const file = new File([blob], filename, { type: 'image/png' });
      const data = { files: [file], title: cam.nombre, text: `«${cam.nombre}» — del juego de las camisetas` };
      if (navigator.canShare && !navigator.canShare(data)) {
        throw new Error('Este sistema no permite compartir archivos. Usá descargar.');
      }
      await navigator.share(data);
      setMsg({ kind: 'ok', text: 'compartida' });
    } catch (e) {
      if (e.name !== 'AbortError') {
        handleImgError(e);
      }
    } finally {
      setBusy(null);
    }
  }

  async function doDownload() {
    setBusy('download');
    try {
      const blob = await getBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMsg({ kind: 'ok', text: 'descargada' });
    } catch (e) {
      handleImgError(e);
    } finally {
      setBusy(null);
    }
  }

  async function doCopy() {
    setBusy('copy');
    try {
      const blob = await getBlob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setMsg({ kind: 'ok', text: 'copiada al portapapeles' });
    } catch (e) {
      handleImgError(e);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto fade-up"
      style={{ background: 'rgba(28, 24, 19, 0.55)' }}
      onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md my-auto max-h-[90vh] overflow-y-auto"
        style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}>
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--line-soft)' }}>
          <span className="smallcaps" style={{ color: 'var(--ink-faint)' }}>Compartir el diseño</span>
          <button onClick={onClose} className="ring-ink p-1" aria-label="Cerrar">
            <X size={16} style={{ color: 'var(--ink-faint)' }} />
          </button>
        </div>
        <div className="px-5 py-4">
          <p className="ff-serif italic text-sm mb-4 leading-snug" style={{ color: 'var(--ink-soft)' }}>
            Solo viaja el diseño. Tu progreso se queda contigo.
          </p>
          {previewSrc ? (
            <div className="mb-5" style={{ border: '1px solid var(--line)', maxWidth: '320px', margin: '0 auto' }}>
              <img src={previewSrc} alt={`Diseño de ${cam.nombre}`}
                style={{ width: '100%', height: 'auto', display: 'block' }} />
            </div>
          ) : previewFailed ? (
            <p className="ff-mono text-xs mb-4" style={{ color: 'var(--accent)' }}>No se pudo generar la imagen.</p>
          ) : (
            <p className="ff-mono text-xs mb-4" style={{ color: 'var(--ink-faint)' }}>generando preview…</p>
          )}
          <div className="space-y-2">
            {canShare && (
              <button onClick={doShare} disabled={!!busy}
                className="w-full ring-ink ff-mono text-xs py-3 px-4 flex items-center justify-center gap-2"
                style={{ background: 'var(--ink)', color: 'var(--bg)', opacity: busy ? 0.6 : 1 }}>
                <Share2 size={14} />
                <span>{busy === 'share' ? 'generando…' : 'compartir'}</span>
              </button>
            )}
            <button onClick={doDownload} disabled={!!busy}
              className="w-full ring-ink ff-mono text-xs py-3 px-4 flex items-center justify-center gap-2"
              style={{ border: '1px solid var(--line)', color: 'var(--ink)', opacity: busy ? 0.6 : 1 }}>
              <Download size={14} />
              <span>{busy === 'download' ? 'generando…' : 'descargar PNG'}</span>
            </button>
            {canCopy && (
              <button onClick={doCopy} disabled={!!busy}
                className="w-full ring-ink ff-mono text-xs py-3 px-4 flex items-center justify-center gap-2"
                style={{ border: '1px solid var(--line)', color: 'var(--ink)', opacity: busy ? 0.6 : 1 }}>
                <Copy size={14} />
                <span>{busy === 'copy' ? 'generando…' : 'copiar imagen'}</span>
              </button>
            )}
          </div>

          {/* Fallback de texto — adicional a la imagen. Para cuando la imagen
              falla por tamaño, o cuando se prefiere pegar el molde como texto. */}
          {moldeJSON && (
            <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--line-soft)' }}>
              {imgFailed && (
                <p className="ff-mono text-xs mb-2" style={{ color: 'var(--accent)' }}>
                  Esta camiseta no cabe en la imagen. Compartila como texto:
                </p>
              )}
              {!showText ? (
                <button onClick={() => setShowText(true)}
                  className="w-full ring-ink ff-mono text-xs py-2 px-4 flex items-center justify-center gap-2"
                  style={{ color: 'var(--ink-faint)' }}>
                  <span>¿la imagen falla? compartir como texto</span>
                </button>
              ) : (
                <div className="fade-up">
                  <p className="ff-serif italic text-xs mb-2" style={{ color: 'var(--ink-soft)' }}>
                    Texto plano del molde. Pegalo por WhatsApp, mail o notas; quien lo reciba lo importa con “pegar texto”.
                  </p>
                  <textarea readOnly value={moldeJSON} rows={5}
                    onFocus={(e) => e.target.select()}
                    className="w-full ff-mono text-xs p-2 mb-2 resize-none"
                    style={{ border: '1px solid var(--line)', background: 'var(--bg-card)', color: 'var(--ink-soft)' }} />
                  <div className="space-y-2">
                    <button onClick={doShareText} disabled={!!busy}
                      className="w-full ring-ink ff-mono text-xs py-2.5 px-4 flex items-center justify-center gap-2"
                      style={{ background: 'var(--ink)', color: 'var(--bg)', opacity: busy ? 0.6 : 1 }}>
                      <Share2 size={14} />
                      <span>{busy === 'share-text' ? 'preparando…' : 'compartir texto'}</span>
                    </button>
                    <button onClick={doCopyText} disabled={!!busy}
                      className="w-full ring-ink ff-mono text-xs py-2.5 px-4 flex items-center justify-center gap-2"
                      style={{ border: '1px solid var(--line)', color: 'var(--ink)', opacity: busy ? 0.6 : 1 }}>
                      <Copy size={14} />
                      <span>{busy === 'copy-text' ? 'copiando…' : 'copiar texto'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {msg && (
            <p className="ff-mono text-xs mt-3 fade-up text-center"
              style={{ color: msg.kind === 'err' ? 'var(--accent)' : 'var(--moss)' }}>
              {msg.text}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ImportSheet({ onClose, onImport }) {
  const [phase, setPhase] = useState('pick');  // pick | loading | preview | error | text
  const [decoded, setDecoded] = useState(null);
  const [error, setError] = useState(null);
  const [previewSrc, setPreviewSrc] = useState(null);
  const [pasted, setPasted] = useState('');
  const inputRef = useRef(null);

  // Cleanup blob URL on unmount or change
  useEffect(() => () => { if (previewSrc) URL.revokeObjectURL(previewSrc); }, [previewSrc]);

  // Importar desde texto pegado (fallback JSON). Adicional a la imagen.
  // v4: async porque el preview usa generateCamisetaSVG (async).
  async function handleText() {
    setError(null);
    try {
      const result = decodeJSONToCamiseta(pasted);
      if (result.mode !== 'molde') {
        throw new Error('Ese texto no es una camiseta para compartir.');
      }
      try {
        const raw = await generateCamisetaSVG(result.camiseta);
        const blob = new Blob([raw], { type: 'image/svg+xml' });
        setPreviewSrc(URL.createObjectURL(blob));
      } catch (_) { /* preview best-effort */ }
      setDecoded(result.camiseta);
      setPhase('preview');
    } catch (e) {
      setError(e.message || 'No se pudo leer el texto.');
      setPhase('error');
    }
  }

  async function handleFile(file) {
    if (!file) return;
    setPhase('loading');
    setError(null);
    try {
      const result = await decodeImageToCamiseta(file);
      if (result.mode !== 'molde') {
        throw new Error('Esta imagen contiene un backup personal, no una camiseta para compartir. Solo se pueden importar moldes (modo molde).');
      }
      // Generate a preview SVG from the decoded data — this should match the
      // original sender's design closely (same seed: id + nombre).
      // v4: generateCamisetaSVG es async.
      try {
        const raw = await generateCamisetaSVG(result.camiseta);
        const blob = new Blob([raw], { type: 'image/svg+xml' });
        setPreviewSrc(URL.createObjectURL(blob));
      } catch (_) { /* preview is best-effort */ }
      setDecoded(result.camiseta);
      setPhase('preview');
    } catch (e) {
      // Heurística simple: las fotos de cámara son JPEG > 500KB con EXIF.
      // Los PNG del codec rondan 100-180KB; los JPEGs comprimidos por
      // WhatsApp suelen estar bajo 300KB. Si el archivo se ve a foto de
      // cámara, damos un mensaje específico — el decoder por cámara aún
      // no funciona (perspectiva + moiré).
      const looksLikeCamera = file.type === 'image/jpeg' && file.size > 500_000;
      if (looksLikeCamera) {
        setError('Parece una foto tomada con la cámara. Por ahora solo se puede importar la imagen original que te compartieron (por WhatsApp, mail, etc.), no fotos de pantalla. La lectura por cámara va a llegar más adelante.');
      } else {
        setError(e.message || 'No se pudo leer la imagen.');
      }
      setPhase('error');
    }
  }

  function reset() {
    if (previewSrc) URL.revokeObjectURL(previewSrc);
    setPreviewSrc(null);
    setDecoded(null);
    setError(null);
    setPasted('');
    setPhase('pick');
    if (inputRef.current) inputRef.current.value = '';
  }

  return (<div className="min-h-screen px-5 pt-6 pb-20 max-w-2xl mx-auto fade-up">
    <div className="flex items-center justify-between mb-6">
      <button onClick={onClose} className="ring-ink ff-mono text-xs p-2 -ml-2" style={{ color: 'var(--ink-faint)' }}>← cerrar</button>
      <span className="smallcaps" style={{ color: 'var(--ink-faint)' }}>Recibir camiseta</span>
    </div>

    {phase === 'pick' && (<>
      <h1 className="display text-4xl mb-2">¿Te llegó una?</h1>
      <p className="ff-serif italic text-base mb-8" style={{ color: 'var(--ink-soft)' }}>
        Toda imagen de camiseta esconde su diseño dentro. Cárgala y la leemos.
      </p>
      <label className="block ring-ink cursor-pointer p-8 text-center"
        style={{ border: '2px dashed var(--line)', background: 'var(--bg-card)' }}>
        <input ref={inputRef} type="file" accept="image/png,image/jpeg" className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])} />
        <Upload size={28} strokeWidth={1.5} className="mx-auto mb-3" style={{ color: 'var(--ink-soft)' }} />
        <div className="ff-serif text-base mb-1" style={{ color: 'var(--ink)' }}>Elegir imagen recibida</div>
        <div className="ff-mono text-xs" style={{ color: 'var(--ink-faint)' }}>La que te compartieron — no una foto de pantalla</div>
      </label>
      <p className="ff-mono text-xs mt-6" style={{ color: 'var(--ink-faint)' }}>
        Solo viaja el diseño. Las misiones empiezan en cero — el camino lo haces tú.
      </p>
      <button onClick={() => { setError(null); setPhase('text'); }}
        className="w-full ring-ink ff-mono text-xs py-2.5 px-4 mt-4 flex items-center justify-center gap-2"
        style={{ border: '1px solid var(--line)', color: 'var(--ink-soft)' }}>
        <Inbox size={14} />
        <span>¿te la pasaron como texto? pegar texto</span>
      </button>
    </>)}

    {phase === 'text' && (<>
      <h1 className="display text-4xl mb-2">Pegar el texto</h1>
      <p className="ff-serif italic text-base mb-6" style={{ color: 'var(--ink-soft)' }}>
        Si la camiseta no cupo en una imagen, te la pasaron como texto. Pegalo acá completo.
      </p>
      <textarea value={pasted} onChange={(e) => setPasted(e.target.value)} autoFocus rows={8}
        placeholder="Pegá aquí el molde en texto…"
        className="w-full ff-mono text-xs p-3 mb-4 resize-none ring-ink"
        style={{ border: '1px solid var(--line)', background: 'var(--bg-card)', color: 'var(--ink)' }} />
      <div className="space-y-2">
        <button onClick={handleText} disabled={!pasted.trim()}
          className="w-full ring-ink ff-serif text-base py-3 px-4"
          style={{ background: 'var(--ink)', color: 'var(--bg)', opacity: pasted.trim() ? 1 : 0.5 }}>
          Leer el texto
        </button>
        <button onClick={() => { setPasted(''); setPhase('pick'); }}
          className="w-full ring-ink ff-mono text-xs py-2 px-4"
          style={{ color: 'var(--ink-faint)' }}>
          ← volver a imagen
        </button>
      </div>
    </>)}

    {phase === 'loading' && (<div className="text-center py-16">
      <div className="ff-serif italic text-base mb-2" style={{ color: 'var(--ink-soft)' }}>Leyendo la camiseta…</div>
      <div className="ff-mono text-xs" style={{ color: 'var(--ink-faint)' }}>Decodificando el halftone</div>
    </div>)}

    {phase === 'preview' && decoded && (<>
      <div className="smallcaps mb-2" style={{ color: 'var(--ink-faint)' }}>Encontramos esto</div>
      <div className="flex items-baseline gap-3 mb-1">
        <span className="text-4xl">{decoded.emoji || '👕'}</span>
        <h1 className="display text-3xl">{decoded.nombre}</h1>
      </div>
      {decoded.creador_id && (
        <p className="ff-mono text-xs mb-4" style={{ color: 'var(--ink-faint)' }}>creada por @{decoded.creador_id}</p>
      )}
      {decoded.esencia && (
        <p className="ff-serif italic text-base mb-4" style={{ color: 'var(--ink-soft)' }}>{decoded.esencia}</p>
      )}
      {decoded.dedicatoria && (
        <div className="mb-4 py-3 px-4" style={{ borderLeft: '2px solid var(--accent-soft)', background: 'var(--bg-card)' }}>
          <p className="ff-mono text-xs mb-1" style={{ color: 'var(--ink-faint)' }}>de quien la llevó antes:</p>
          <p className="ff-serif italic text-base" style={{ color: 'var(--ink)' }}>«{decoded.dedicatoria}»</p>
        </div>
      )}
      {decoded.arco?.de && decoded.arco?.a && (
        <p className="ff-mono text-xs mb-4" style={{ color: 'var(--ink-faint)' }}>
          {decoded.arco.de} <span style={{ color: 'var(--gold)' }}>→</span> {decoded.arco.a}
        </p>
      )}
      <div className="ff-mono text-xs mb-5 flex gap-3" style={{ color: 'var(--ink-faint)' }}>
        <span>{decoded.misiones?.length || 0} misiones</span>
        {(decoded.milestones?.length || 0) > 0 && <span>·</span>}
        {(decoded.milestones?.length || 0) > 0 && <span>{decoded.milestones.length} hitos</span>}
      </div>
      {previewSrc && (
        <div className="mb-5" style={{ border: '1px solid var(--line)', maxWidth: '280px', margin: '0 auto 1.25rem' }}>
          <img src={previewSrc} alt={`Diseño de ${decoded.nombre}`} style={{ width: '100%', height: 'auto', display: 'block' }} />
        </div>
      )}
      <div className="space-y-2 mb-3">
        <button onClick={() => onImport(decoded)}
          className="w-full ring-ink ff-serif text-base py-3 px-4"
          style={{ background: 'var(--ink)', color: 'var(--bg)' }}>
          Agregarla a mi colección
        </button>
        <button onClick={reset}
          className="w-full ring-ink ff-mono text-xs py-2 px-4"
          style={{ color: 'var(--ink-faint)' }}>
          probar con otra imagen
        </button>
      </div>
      <p className="ff-mono text-xs text-center mt-4" style={{ color: 'var(--ink-faint)' }}>
        Empieza con las misiones activas y los hitos pendientes. Tu progreso es tuyo desde cero.
      </p>
    </>)}

    {phase === 'error' && (<div className="py-8">
      <div className="flex items-start gap-3 mb-4">
        <AlertTriangle size={24} style={{ color: 'var(--accent)' }} className="flex-shrink-0 mt-1" />
        <div>
          <div className="ff-serif italic text-base mb-1" style={{ color: 'var(--ink)' }}>No pudimos leer esta imagen</div>
          <div className="ff-mono text-xs" style={{ color: 'var(--ink-soft)' }}>{error}</div>
        </div>
      </div>
      <p className="ff-mono text-xs mb-6" style={{ color: 'var(--ink-faint)' }}>
        Suele pasar si: la imagen fue recortada, se le bajó la calidad demasiado, o no es una camiseta del juego. Probá con la original (no un screenshot).
      </p>
      <button onClick={reset}
        className="w-full ring-ink ff-mono text-xs py-3 px-4"
        style={{ border: '1px solid var(--line)', color: 'var(--ink)' }}>
        elegir otra imagen
      </button>
    </div>)}
  </div>);
}

function MisionRowDetail({ m, onToggle, onUndo, onArchive, onDelete, onEdit }) {
  const est = estadoDeMision(m);
  const hecha = m.forma !== 'recurrente' && (est === 'hecha' || est === 'hecha-hoy');
  const hoy = m.forma === 'recurrente' ? completionsHoy(m) : 0;
  const tickHoy = hoy > 0;
  const showCheck = hecha || tickHoy;
  const mult = multiplicador(m);
  const formaGlyph = FORMAS.find(f => f.id === m.forma)?.glyph;
  const p = puntos(m);
  const tonosStr = m.tonos?.map(t => TONOS.find(x => x.id === t)?.label).filter(Boolean).join(' · ');
  const mes = m.forma === 'recurrente' ? completionsEsteMes(m) : 0;
  return (<div className="flex items-start gap-2 py-1 group">
    <button onClick={onToggle} className="flex items-start gap-2 flex-1 text-left ring-ink py-0.5">
      <span className="flex-shrink-0 mt-1.5 w-4 h-4 rounded-sm flex items-center justify-center check-ani block" style={{
        border: '1px solid ' + (showCheck ? 'var(--moss)' : 'var(--line)'),
        background: showCheck ? 'var(--moss)' : 'transparent',
      }}>{showCheck && <Check size={11} strokeWidth={3} color="var(--bg)" />}</span>
      <span className="flex-1 ff-serif" style={{
        color: hecha ? 'var(--ink-faint)' : 'var(--ink)',
        textDecoration: hecha ? 'line-through' : 'none',
      }}>{m.nombre}
        <span className="ff-mono text-xs ml-2" style={{ color: 'var(--ink-faint)' }}>{formaGlyph}{tonosStr && ' · ' + tonosStr}</span>
        {hoy > 0 && (
          <span className="ff-mono text-xs ml-1" style={{ color: 'var(--gold)' }}>· {hoy}× hoy</span>
        )}
        {mes > 0 && (
          <span className="ff-mono text-xs ml-1" style={{ color: 'var(--ink-faint)' }}>· {mes}×/30d</span>
        )}
      </span>
      <span className="ff-mono text-xs mt-1.5" style={{ color: mult > 1.4 ? 'var(--warm)' : mult < 0.9 ? 'var(--ink-faint)' : 'var(--gold)' }}>+{p}</span>
    </button>
    <button onClick={onEdit} className="opacity-40 group-hover:opacity-100 ring-ink p-1 transition-opacity">
      <Edit2 size={12} style={{ color: 'var(--ink-faint)' }} />
    </button>
    {tickHoy && onUndo && (
      <button onClick={onUndo} className="opacity-40 group-hover:opacity-100 ring-ink p-1 transition-opacity"
        aria-label="Restar una completion de hoy">
        <Minus size={12} style={{ color: 'var(--ink-faint)' }} />
      </button>
    )}
    <button onClick={onArchive} className="opacity-40 group-hover:opacity-100 ring-ink p-1 transition-opacity">
      <Archive size={12} style={{ color: 'var(--ink-faint)' }} />
    </button>
    {onDelete && (
      <button onClick={onDelete} className="opacity-40 group-hover:opacity-100 ring-ink p-1 transition-opacity" aria-label="Borrar misión">
        <Trash2 size={12} style={{ color: 'var(--accent)' }} />
      </button>
    )}
  </div>);
}

function MisionForm({ initial, onSave, onCancel }) {
  const [nombre, setNombre] = useState(initial?.nombre || '');
  const [forma, setForma] = useState(initial?.forma || 'dificil');
  const [tonos, setTonos] = useState(initial?.tonos || []);
  const [puntosBase, setPuntosBase] = useState(initial?.puntos_base ?? (FORMAS.find(f => f.id === (initial?.forma || 'dificil'))?.puntosBase || 1));
  const toggleTono = (t) => setTonos(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  const submit = () => { if (!nombre.trim()) return; onSave({ nombre: nombre.trim(), forma, tonos, puntos_base: puntosBase }); };
  return (<div className="p-3 mb-3 fade-up" style={{ background: 'var(--bg-card)', border: '1px solid var(--line)' }}>
    <input autoFocus value={nombre} onChange={e => setNombre(e.target.value)} placeholder="¿Qué misión nace?" className="w-full ff-serif text-base pb-1 mb-3 ring-ink" style={{ borderBottom: '1px solid var(--line)' }} onKeyDown={e => { if (e.key === 'Enter' && nombre.trim()) submit(); }} />
    <div className="smallcaps mb-2" style={{ color: 'var(--ink-faint)' }}>forma</div>
    <div className="flex flex-wrap gap-1 mb-3">
      {FORMAS.map(f => (
        <button key={f.id} onClick={() => { setForma(f.id); setPuntosBase(f.puntosBase); }} className="ff-mono text-xs px-2 py-1 ring-ink" style={{
          background: forma === f.id ? 'var(--ink)' : 'transparent',
          color: forma === f.id ? 'var(--bg)' : 'var(--ink-soft)',
          border: '1px solid ' + (forma === f.id ? 'var(--ink)' : 'var(--line)'),
        }}>{f.glyph} {f.label}</button>
      ))}
    </div>
    <div className="smallcaps mb-2" style={{ color: 'var(--ink-faint)' }}>tono <span className="lowercase tracking-normal opacity-60">(opcional, varios)</span></div>
    <div className="flex flex-wrap gap-1 mb-3">
      {TONOS.map(t => (
        <button key={t.id} onClick={() => toggleTono(t.id)} className="ff-mono text-xs px-2 py-1 ring-ink" style={{
          background: tonos.includes(t.id) ? t.color : 'transparent',
          color: tonos.includes(t.id) ? 'var(--void)' : 'var(--ink-soft)',
          border: '1px solid ' + (tonos.includes(t.id) ? t.color : 'var(--line)'),
        }}>{t.label}</button>
      ))}
    </div>
    <div className="flex items-center gap-3 mb-3">
      <span className="smallcaps" style={{ color: 'var(--ink-faint)' }}>dificultad</span>
      <button onClick={() => setPuntosBase(Math.max(1, puntosBase - 1))} className="ring-ink w-7 h-7 flex items-center justify-center" style={{ border: '1px solid var(--line)' }}><Minus size={12} /></button>
      <span className="ff-mono text-sm" style={{ color: 'var(--gold)' }}>+{puntosBase}</span>
      <button onClick={() => setPuntosBase(Math.min(10, puntosBase + 1))} className="ring-ink w-7 h-7 flex items-center justify-center" style={{ border: '1px solid var(--line)' }}><Plus size={12} /></button>
    </div>
    <div className="flex items-center justify-between">
      <span className="ff-mono text-xs italic" style={{ color: 'var(--ink-faint)' }}>{FORMAS.find(f => f.id === forma)?.hint}</span>
      <div className="flex gap-2">
        <button onClick={onCancel} className="ring-ink ff-mono text-xs px-2 py-1" style={{ color: 'var(--ink-faint)' }}>cancelar</button>
        <button onClick={submit} disabled={!nombre.trim()} className="ring-ink ff-mono text-xs px-3 py-1 disabled:opacity-30" style={{ background: 'var(--ink)', color: 'var(--bg)' }}>{initial ? 'guardar' : 'añadir'}</button>
      </div>
    </div>
  </div>);
}

function MilestoneForm({ initial, onSave, onCancel, submitLabel }) {
  const [nombre, setNombre] = useState(initial?.nombre || '');
  const [descripcion, setDescripcion] = useState(initial?.descripcion || '');
  const [regalo, setRegalo] = useState(initial?.regalo || '');
  return (<div className="p-3 mb-3 fade-up" style={{ background: 'var(--bg-card)', border: '1px solid var(--line)' }}>
    <input autoFocus value={nombre} onChange={e => setNombre(e.target.value)} placeholder="hito" className="w-full ff-serif text-base pb-1 mb-2 ring-ink" style={{ borderBottom: '1px solid var(--line)' }} />
    <input value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="contexto (opcional)" className="w-full ff-mono text-xs pb-1 mb-3 ring-ink" style={{ borderBottom: '1px solid var(--line)', color: 'var(--ink-soft)' }} />
    <div className="smallcaps mb-1" style={{ color: 'var(--ink-faint)' }}>regalo al lograrlo <span className="lowercase tracking-normal opacity-60">(opcional)</span></div>
    <input value={regalo} onChange={e => setRegalo(e.target.value)} placeholder="lo que cobrarás al llegar…" className="w-full ff-serif italic text-sm pb-1 mb-3 ring-ink" style={{ borderBottom: '1px solid var(--line)', color: 'var(--gold)' }} />
    <div className="flex justify-end gap-2">
      <button onClick={onCancel} className="ring-ink ff-mono text-xs px-2 py-1" style={{ color: 'var(--ink-faint)' }}>cancelar</button>
      <button onClick={() => nombre.trim() && onSave({ nombre: nombre.trim(), descripcion: descripcion.trim(), regalo: regalo.trim() })} disabled={!nombre.trim()} className="ring-ink ff-mono text-xs px-3 py-1 disabled:opacity-30" style={{ background: 'var(--ink)', color: 'var(--bg)' }}>{submitLabel || 'añadir'}</button>
    </div>
  </div>);
}

function AddMilestone({ onSave, onCancel }) {
  return <MilestoneForm onSave={onSave} onCancel={onCancel} submitLabel="añadir" />;
}

function DiarioView({ state, onStart, onAgendar }) {
  const ult = (tipo) => state.sesiones.filter(s => s.tipo === tipo).slice(-1)[0];
  const fmt = (iso) => iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '—';
  const cards = [
    { tipo: 'diaria',  titulo: 'Cierre del día',           cita: 'Lo que se hizo, lo que se nombra.',         ayuda: 'Marca qué misiones cumpliste hoy.',                                          tiempo: '1–2 min',   last: ult('diaria') },
    { tipo: 'semanal', titulo: 'Cierre de semana',         cita: 'Las misiones se podan. Otras nacen.',       ayuda: 'Ajusta la dificultad de tus misiones, archiva las que ya no van y añade nuevas.', tiempo: '5–10 min',  last: ult('semanal') },
    { tipo: 'mensual', titulo: 'El observador del observador', cita: 'No las misiones: el juego mismo.',     ayuda: 'Observa cómo te observas: qué vale la pena medir y cómo lo estás midiendo.',  tiempo: '15–25 min', last: ult('mensual') },
  ];
  return (<div className="fade-up">
    <p className="ff-serif italic text-lg mb-6" style={{ color: 'var(--ink-soft)' }}>El juego se construye aquí. La reflexión es parte del hacer.</p>
    <Heatmap state={state} />
    <div className="space-y-3 mb-10">
      {cards.map(c => {
        // El diario solo agenda lo que se agenda: la semana y el mes. El
        // cierre del día no tiene cita porque el hacedor vuelve por trabajo,
        // no por alarma, y un evento diario se vuelve ruido en cuatro días.
        const agendable = c.tipo !== 'diaria';
        const cita = agendable ? citaVigente(state, c.tipo) : null;
        return (
        <div key={c.tipo} style={{ background: 'var(--bg-card)', border: '1px solid var(--line-soft)' }}>
          <button onClick={() => onStart(c.tipo)} className="block w-full text-left p-4 pb-2 ring-ink">
            <div className="flex items-baseline justify-between mb-1">
              <h3 className="ff-serif text-xl">{c.titulo}</h3>
              <span className="ff-mono text-xs" style={{ color: 'var(--ink-faint)' }}>{c.tiempo}</span>
            </div>
            <p className="ff-serif italic text-sm mb-1" style={{ color: 'var(--ink-soft)' }}>{c.cita}</p>
            <p className="ff-serif text-sm" style={{ color: 'var(--ink-soft)' }}>{c.ayuda}</p>
          </button>
          <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-1">
            <span className="ff-mono text-xs" style={{ color: 'var(--ink-faint)' }}>última · {fmt(c.last?.date)}</span>
            {agendable && (cita ? (
              <button onClick={() => onAgendar(c.tipo)} className="ring-ink ff-mono text-xs"
                style={{ color: 'var(--ocean)' }}>
                {TEXTOS.proxima} · {fmt(cita.para)} {new Date(cita.para).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
              </button>
            ) : (
              <button onClick={() => onAgendar(c.tipo)} className="ring-ink boton-neon ff-mono text-xs py-1 px-2">
                {TEXTOS.ponerHora}
              </button>
            ))}
          </div>
        </div>);
      })}
    </div>
    <div className="hr-deco mb-6" />
    <h2 className="smallcaps mb-4" style={{ color: 'var(--ink-faint)' }}>la historia</h2>
    <Historia state={state} />
    <div className="hr-deco mt-10 mb-6" />
    <BackupTools state={state} />
  </div>);
}

function BackupTools({ state }) {
  const [estado, setEstado] = useState(''); // '' | 'copiado' | 'importado' | 'error'
  const exportar = async () => {
    const { _storageOk, _saveError, ...clean } = state;
    const json = JSON.stringify(clean, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      setEstado('copiado');
      setTimeout(() => setEstado(''), 3000);
    } catch (e) {
      // fallback: descargar
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `juego-camisetas-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setEstado('copiado');
      setTimeout(() => setEstado(''), 3000);
    }
  };
  const importar = async () => {
    try {
      const txt = prompt('Pega aquí el JSON exportado:');
      if (!txt) return;
      const parsed = JSON.parse(txt);
      if (!parsed.camisetas) throw new Error('formato inválido');
      // v7: respaldar lo que hay antes de pisarlo. Un pegado equivocado
      // deja de ser pérdida total silenciosa.
      const actual = localStorage.getItem(STATE_KEY);
      if (actual) localStorage.setItem(IMPORT_BACKUP_KEY, actual);
      // reemplazar storage directamente y recargar
      localStorage.setItem(STATE_KEY, JSON.stringify(parsed));
      setEstado('importado');
      setTimeout(() => window.location.reload(), 1000);
    } catch (e) {
      console.error(e);
      setEstado('error');
      setTimeout(() => setEstado(''), 3000);
    }
  };
  return (<div className="mb-6">
    <h2 className="smallcaps mb-3" style={{ color: 'var(--ink-faint)' }}>respaldo</h2>
    <p className="ff-serif italic text-sm mb-3" style={{ color: 'var(--ink-soft)' }}>
      Exporta el estado del juego como respaldo. Si pierdes los datos al reabrir, puedes pegar lo exportado aquí.
    </p>
    <div className="flex flex-wrap gap-2">
      <button onClick={exportar} className="ring-ink ff-mono text-xs py-1 px-3" style={{ color: 'var(--ink-soft)', border: '1px solid var(--line)' }}>
        exportar al portapapeles
      </button>
      <button onClick={importar} className="ring-ink ff-mono text-xs py-1 px-3" style={{ color: 'var(--ink-soft)', border: '1px solid var(--line)' }}>
        importar desde JSON
      </button>
      {estado === 'copiado' && <span className="ff-mono text-xs self-center" style={{ color: 'var(--moss)' }}>✓ copiado</span>}
      {estado === 'importado' && <span className="ff-mono text-xs self-center" style={{ color: 'var(--moss)' }}>✓ importado, recargando…</span>}
      {estado === 'error' && <span className="ff-mono text-xs self-center" style={{ color: 'var(--accent)' }}>✗ error en el formato</span>}
    </div>
  </div>);
}

function Heatmap({ state }) {
  const [rango, setRango] = useState(7);
  const cams = state.camisetas.filter(estaPuesta);
  if (cams.length === 0) return null;

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dias = [];
  for (let i = rango - 1; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i); dias.push(d);
  }

  const data = cams.map(cam => {
    const ptsPorDia = dias.map(d => puntosCamisetaDia(state.movimientos, cam.id, d));
    let ultima = null;
    cam.misiones.forEach(m => {
      if (m.completed_at) { const t = new Date(m.completed_at).getTime(); if (!ultima || t > ultima) ultima = t; }
      m.completions?.forEach(c => { const t = new Date(c).getTime(); if (!ultima || t > ultima) ultima = t; });
    });
    const diasDesde = ultima ? Math.floor((Date.now() - ultima) / DAY) : null;
    const totalPeriodo = ptsPorDia.reduce((a,b) => a+b, 0);
    return { cam, ptsPorDia, diasDesde, totalPeriodo };
  });

  const max = Math.max(1, ...data.flatMap(d => d.ptsPorDia));
  const totalGlobal = round1(data.reduce((a, d) => a + d.totalPeriodo, 0));
  const frias = data.filter(d => d.diasDesde !== null && d.diasDesde >= 14);
  const nuncaUsadas = data.filter(d => d.diasDesde === null);

  // Layout SVG
  const labelWidth = rango === 7 ? 110 : 95;
  const cellGap = 2;
  const rowHeight = 22;
  const cellWidth = rango === 7 ? 28 : 9;
  const gridWidth = rango * cellWidth + (rango - 1) * cellGap;
  const totalColX = labelWidth + gridWidth + 6;
  const svgWidth = totalColX + 28;
  const svgHeight = data.length * (rowHeight + 4) + 20;

  // Color: interpolación de #EBE2D0 (bg-card) → #A07E2B (gold)
  const cellColor = (p) => {
    if (p === 0) return 'rgba(28,24,19,0.04)';
    const t = Math.min(1, p / max);
    const r = Math.round(235 + (160 - 235) * t);
    const g = Math.round(226 + (126 - 226) * t);
    const b = Math.round(208 + (43 - 208) * t);
    return `rgb(${r},${g},${b})`;
  };

  const dowChars = ['D','L','M','X','J','V','S'];

  return (<div className="mb-10 fade-up">
    <div className="flex items-baseline justify-between mb-4">
      <div className="flex gap-1">
        {[7, 30].map(r => (
          <button key={r} onClick={() => setRango(r)} className="ff-mono text-xs px-2 py-1 ring-ink" style={{
            background: rango === r ? 'var(--ink)' : 'transparent',
            color: rango === r ? 'var(--bg)' : 'var(--ink-faint)',
            border: '1px solid ' + (rango === r ? 'var(--ink)' : 'var(--line)'),
          }}>{r} días</button>
        ))}
      </div>
      {totalGlobal > 0 && <span className="ff-mono text-sm" style={{ color: 'var(--gold)' }}>+{totalGlobal}</span>}
    </div>

    <div className="overflow-x-auto -mx-1 px-1">
      <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} width="100%" style={{ maxWidth: svgWidth + 'px', display: 'block', minWidth: rango === 30 ? '340px' : 'auto' }}>
        {data.map((d, rowIdx) => {
          const y = rowIdx * (rowHeight + 4);
          const esTibia = d.diasDesde !== null && d.diasDesde >= 7 && d.diasDesde < 14;
          const esFria = d.diasDesde !== null && d.diasDesde >= 14;
          const nunca = d.diasDesde === null;
          const nombreColor = (esFria || nunca) ? '#7B7490' : '#B9AE99';
          const dotColor = esFria || nunca ? '#8B2D1C' : esTibia ? '#C77A3A' : null;
          return (<g key={d.cam.id}>
            <text x="0" y={y + rowHeight * 0.7} fontSize="13" fontFamily="Chakra Petch, system-ui, sans-serif">
              <tspan fill="#F0E5D0">{d.cam.emoji}</tspan>
              <tspan dx="6" fill={nombreColor}>{d.cam.nombre}</tspan>
            </text>
            {dotColor && <circle cx={labelWidth - 8} cy={y + rowHeight * 0.5} r="2.5" fill={dotColor} />}
            {d.ptsPorDia.map((p, colIdx) => (
              <rect key={colIdx}
                x={labelWidth + colIdx * (cellWidth + cellGap)} y={y}
                width={cellWidth} height={rowHeight}
                fill={cellColor(p)} rx="1" />
            ))}
            {d.totalPeriodo > 0 && (
              <text x={totalColX} y={y + rowHeight * 0.7} fontSize="10" fill="#7B7490" fontFamily="Space Mono, monospace">
                {round1(d.totalPeriodo)}
              </text>
            )}
          </g>);
        })}

        {rango === 7 && dias.map((d, i) => {
          const isToday = d.toDateString() === new Date().toDateString();
          return (<text key={i}
            x={labelWidth + i * (cellWidth + cellGap) + cellWidth / 2}
            y={data.length * (rowHeight + 4) + 12}
            fontSize="10" textAnchor="middle"
            fill={isToday ? '#F0E5D0' : '#7B7490'}
            fontFamily="Space Mono, monospace"
            fontWeight={isToday ? '500' : '400'}>{dowChars[d.getDay()]}</text>);
        })}
        {rango === 30 && dias.map((d, i) => {
          if (i % 7 !== 0 && i !== dias.length - 1) return null;
          return (<text key={i}
            x={labelWidth + i * (cellWidth + cellGap) + cellWidth / 2}
            y={data.length * (rowHeight + 4) + 12}
            fontSize="9" textAnchor="middle" fill="#7B7490"
            fontFamily="Space Mono, monospace">{d.getDate()}</text>);
        })}
      </svg>
    </div>

    {(frias.length > 0 || nuncaUsadas.length > 0) && (
      <div className="mt-3 ff-serif italic text-sm" style={{ color: 'var(--ink-soft)' }}>
        {frias.length === 1 && (
          <p>«{frias[0].cam.nombre}» lleva {frias[0].diasDesde} días sin tocarse. ¿Sigue viva?</p>
        )}
        {frias.length > 1 && (
          <p>{frias.length} camisetas dormidas más de dos semanas. Quizás sea hora de podar el mazo.</p>
        )}
        {nuncaUsadas.length > 0 && frias.length === 0 && (
          <p>{nuncaUsadas.length === 1
            ? <>«{nuncaUsadas[0].cam.nombre}» aún no se ha tocado. Empieza por algo.</>
            : <>{nuncaUsadas.length} camisetas vacías esperando.</>}</p>
        )}
      </div>
    )}

    <div className="hr-deco mt-8 mb-8" />
  </div>);
}

function Historia({ state }) {
  const cams = state.camisetas;
  const lookupCam = (id) => cams.find(c => c.id === id);
  // Single-select category filter — tap a chip to focus that bucket, tap again
  // (or 'todos') to clear. Default = show everything.
  const CATS = [
    { id: 'cierres',    label: 'cierres',   match: (e) => e.tipo.startsWith('sesion_') || e.tipo === 'cita_agendada' },
    { id: 'notas',      label: 'notas',     match: (e) => e.tipo === 'nota' },
    { id: 'camisetas',  label: 'camisetas', match: (e) => e.tipo.startsWith('camiseta_') },
    { id: 'misiones',   label: 'misiones',  match: (e) => e.tipo.startsWith('mision_') },
    { id: 'milestones', label: 'hitos',     match: (e) => e.tipo.startsWith('milestone_') },
  ];
  const [filter, setFilter] = useState(null);

  const allEvents = (state.eventos || []).filter(e => !TIPOS_SILENCIOSOS.has(e.tipo)).reverse();
  if (allEvents.length === 0) return <p className="ff-serif italic text-sm" style={{ color: 'var(--ink-faint)' }}>Aún no hay nada que contar. La historia empieza con la primera misión.</p>;

  const filtered = filter
    ? allEvents.filter(e => {
        const cat = CATS.find(c => c.match(e));
        return cat && cat.id === filter;
      })
    : allEvents;

  const grupos = {};
  filtered.forEach(e => {
    const key = new Date(e.ts).toDateString();
    if (!grupos[key]) grupos[key] = [];
    grupos[key].push(e);
  });
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - DAY).toDateString();
  return (<div>
    <div className="flex flex-wrap gap-1.5 mb-5">
      <button onClick={() => setFilter(null)}
        className="ring-ink ff-mono text-xs py-1 px-2"
        style={{
          background: filter === null ? 'var(--ink)' : 'transparent',
          color: filter === null ? 'var(--bg)' : 'var(--ink-faint)',
          border: '1px solid ' + (filter === null ? 'var(--ink)' : 'var(--line)'),
        }}>todos</button>
      {CATS.map(c => (
        <button key={c.id} onClick={() => setFilter(filter === c.id ? null : c.id)}
          className="ring-ink ff-mono text-xs py-1 px-2"
          style={{
            background: filter === c.id ? 'var(--ink)' : 'transparent',
            color: filter === c.id ? 'var(--bg)' : 'var(--ink-faint)',
            border: '1px solid ' + (filter === c.id ? 'var(--ink)' : 'var(--line)'),
          }}>{c.label}</button>
      ))}
    </div>
    {filtered.length === 0 ? (
      <p className="ff-serif italic text-sm" style={{ color: 'var(--ink-faint)' }}>Nada en esta categoría todavía.</p>
    ) : (
      <div className="space-y-6">
        {Object.entries(grupos).map(([day, evs]) => {
          const date = new Date(evs[0].ts);
          let label;
          if (day === today) label = 'hoy';
          else if (day === yesterday) label = 'ayer';
          else label = date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' });
          return (<div key={day}>
            <div className="ff-mono text-xs mb-2" style={{ color: 'var(--ink-faint)' }}>{label}</div>
            <div className="space-y-1.5 pl-1" style={{ borderLeft: '1px solid var(--line-soft)' }}>
              {evs.map(e => <EventoItem key={e.id} e={e} cam={e.cam_id ? lookupCam(e.cam_id) : null} lookupCam={lookupCam} />)}
            </div>
          </div>);
        })}
      </div>
    )}
  </div>);
}

// v7: eventos de la capa de escritura que todavía no tienen voz en la UI.
// Se registran para el eco; la historia no los muestra (release invisible).
const TIPOS_SILENCIOSOS = new Set([
  'snapshot', 'mision_descompletada', 'mision_ajustada', 'mision_forma',
  'mision_revivida', 'milestone_deslogrado',
]);

function EventoItem({ e, cam, lookupCam }) {
  const [expanded, setExpanded] = useState(false);
  const hora = new Date(e.ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  let glyph, color, text;
  switch (e.tipo) {
    case 'camiseta_creada':
      glyph = '◇'; color = 'var(--accent)';
      text = <>nace <strong>{e.emoji} {e.nombre}</strong></>; break;
    case 'camiseta_comprada':
      glyph = '◇'; color = 'var(--gold)';
      text = <>te pones <strong>{e.emoji} {e.nombre}</strong>{e.precio > 0 && <span className="ff-mono text-xs ml-2" style={{ color: 'var(--gold)' }}>−{e.precio} pts</span>}</>; break;
    case 'camiseta_recibida':
      glyph = '◇'; color = 'var(--ocean)';
      text = <>recibes <strong>{e.emoji} {e.nombre}</strong>{e.creador && e.creador !== 'desconocido' && <span className="ff-mono text-xs ml-2" style={{ color: 'var(--ink-faint)' }}>de @{e.creador}</span>}</>; break;
    case 'camiseta_retirada':
      glyph = '◇'; color = 'var(--ink-faint)';
      text = <>al closet <em>{e.nombre}</em></>; break;
    case 'camiseta_recuperada':
      glyph = '◇'; color = 'var(--moss)';
      text = <>vuelve al mazo <strong>{e.nombre}</strong></>; break;
    case 'camiseta_donada':
      glyph = '◇'; color = 'var(--ink-faint)';
      text = <>donada <em>{e.emoji} {e.nombre}</em> <span className="ff-mono text-xs ml-1" style={{ color: 'var(--ink-faint)' }}>· a otra percha</span>{e.dedicatoria && <span className="ff-serif italic ml-1" style={{ color: 'var(--ink-soft)' }}> · «{e.dedicatoria}»</span>}</>; break;
    case 'camiseta_editada':
      glyph = '~'; color = 'var(--ink-faint)';
      text = <>editada <em>{e.nombre}</em></>; break;
    case 'mision_creada':
      glyph = '+'; color = 'var(--ink-soft)';
      text = <>+ <span style={{ color: 'var(--ink)' }}>{e.nombre}</span>{cam && <span style={{ color: 'var(--ink-faint)' }}> · {cam.emoji}</span>}</>; break;
    case 'mision_completada':
      glyph = '✓'; color = 'var(--moss)';
      text = <><span style={{ color: 'var(--ink)' }}>{e.nombre}</span>{cam && <span style={{ color: 'var(--ink-faint)' }}> · {cam.emoji}</span>}{e.puntos && <span style={{ color: 'var(--gold)' }} className="ml-2">+{e.puntos}</span>}</>; break;
    case 'mision_archivada':
      glyph = '×'; color = 'var(--ink-faint)';
      text = <>archivada <em>{e.nombre}</em></>; break;
    case 'mision_editada':
      glyph = '~'; color = 'var(--ink-faint)';
      text = <>editada <em>{e.nombre}</em></>; break;
    case 'milestone_creado':
      glyph = '◆'; color = 'var(--gold)';
      text = <>milestone · {e.nombre}</>; break;
    case 'milestone_logrado':
      glyph = '◆'; color = 'var(--gold)';
      text = <><strong>milestone logrado</strong> · {e.nombre}{e.regalo && <span className="italic ml-2" style={{ color: 'var(--gold)' }}>· 🎁 {e.regalo}</span>}</>; break;
    case 'milestone_cobrado':
      glyph = '🎁'; color = 'var(--gold)';
      text = <><strong>cobrado</strong> · <em>{e.regalo}</em></>; break;
    case 'milestone_editado':
      glyph = '~'; color = 'var(--ink-faint)';
      text = <>milestone editado · <em>{e.nombre}</em></>; break;
    case 'sesion_diaria':
      glyph = '☾'; color = 'var(--ocean)';
      text = <strong>cierre del día</strong>; break;
    case 'sesion_semanal':
      glyph = '☾'; color = 'var(--ocean)';
      text = <strong>cierre de semana</strong>; break;
    case 'sesion_mensual':
      glyph = '☾'; color = 'var(--accent)';
      text = <strong>observador del observador</strong>; break;
    case 'lavada':
      // Los nombres sí, porque son cosas que él escribió. El intervalo no:
      // "hace tres semanas lavaste" es exactamente la vigilancia prohibida.
      glyph = '≈'; color = 'var(--ocean)';
      text = <>lavaste la ropa{Array.isArray(e.nombres) && e.nombres.length > 0 &&
        <span className="ff-serif italic ml-1" style={{ color: 'var(--ink-soft)' }}>· {e.nombres.join(', ')}</span>}</>; break;
    case 'cita_agendada': {
      // La fecha para la que se puso, sí: es lo que él decidió. Si se cumplió
      // o no, no aparece aquí ni en ninguna parte — el app no lo sabe.
      const cuando = new Date(e.para);
      const legible = isNaN(cuando.getTime()) ? null
        : cuando.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }) +
          ' · ' + cuando.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
      glyph = '◷'; color = 'var(--ocean)';
      text = <>cita puesta <strong>{e.titulo}</strong>{legible &&
        <span className="ff-mono text-xs ml-2" style={{ color: 'var(--ink-faint)' }}>{legible}</span>}</>;
      break;
    }
    case 'nota':
      glyph = '✎'; color = 'var(--ink-soft)';
      text = <span style={{ color: 'var(--ink-soft)' }} className="italic">{e.texto}</span>; break;
    default:
      glyph = '·'; color = 'var(--ink-faint)'; text = e.tipo;
  }

  const isCierre = e.tipo.startsWith('sesion_');
  const hasContent = e.notas && e.notas !== '·' || e.caliente || e.fria;
  const expandable = isCierre && hasContent;
  const caliente = e.caliente ? lookupCam(e.caliente) : null;
  const fria = e.fria ? lookupCam(e.fria) : null;
  // Truncated single-line preview for collapsed cierre rows — gives the
  // reader something to scan without forcing a tap on every entry.
  const notasPreview = e.notas && e.notas !== '·'
    ? (e.notas.length > 60 ? e.notas.slice(0, 60).trimEnd() + '…' : e.notas)
    : null;

  return (<div>
    <div className="flex items-start gap-2 ff-serif text-sm pl-3 -ml-px" style={{ borderLeft: '2px solid ' + color }}>
      <span className="ff-mono text-xs" style={{ color: 'var(--ink-faint)' }}>{hora}</span>
      <span className="ff-mono text-xs" style={{ color }}>{glyph}</span>
      {expandable ? (
        <button onClick={() => setExpanded(!expanded)}
          className="flex-1 text-left ring-ink"
          style={{ color: 'var(--ink-soft)' }}>
          {text}
          {!expanded && notasPreview && (
            <span className="italic ml-1" style={{ color: 'var(--ink-soft)' }}>— "{notasPreview}"</span>
          )}
          <span className="ff-mono text-xs ml-2" style={{ color: 'var(--ink-faint)' }}>{expanded ? '▾' : '▸'}</span>
        </button>
      ) : (
        <span className="flex-1" style={{ color: 'var(--ink-soft)' }}>{text}</span>
      )}
    </div>
    {expandable && expanded && (
      <div className="ml-8 mt-1 mb-2 p-3 fade-up" style={{ background: 'var(--bg-card)', border: '1px solid var(--line-soft)' }}>
        {e.notas && e.notas !== '·' && (
          <p className="ff-serif italic text-sm mb-2 whitespace-pre-wrap" style={{ color: 'var(--ink)' }}>"{e.notas}"</p>
        )}
        {caliente && (
          <div className="ff-mono text-xs flex items-center gap-2 mt-1" style={{ color: 'var(--ink-faint)' }}>
            <Flame size={12} strokeWidth={1.5} style={{ color: 'var(--accent)' }} />
            <span>caliente · {caliente.emoji} {caliente.nombre}</span>
          </div>
        )}
        {fria && (
          <div className="ff-mono text-xs flex items-center gap-2 mt-1" style={{ color: 'var(--ink-faint)' }}>
            <Snowflake size={12} strokeWidth={1.5} style={{ color: 'var(--ocean)' }} />
            <span>fría · {fria.emoji} {fria.nombre}</span>
          </div>
        )}
      </div>
    )}
  </div>);
}

function SesionDiaria({ cams, onToggle, onArchive, onClose }) {
  const [notas, setNotas] = useState('');
  const [confirmArchive, setConfirmArchive] = useState(null);
  const today = new Date().toDateString();
  const activas = cams.flatMap(c => c.misiones.filter(m => enJuego(m)).map(m => ({ ...m, cam: c })));
  // 'ya marcadas hoy' es solo para no-recurrentes: las recurrentes hechas hoy
  // se quedan en 'vivas' con el check tachado y no se duplican aquí.
  const hechasHoy = cams.flatMap(c => c.misiones.filter(m => {
    if (m.forma === 'recurrente') return false;
    if (m.completed_at && new Date(m.completed_at).toDateString() === today) return true;
    return false;
  }).map(m => ({ ...m, cam: c })));
  return (<div className="px-6 pt-8 pb-12 max-w-xl mx-auto fade-up">
    <div className="flex items-center justify-between mb-10">
      <span className="smallcaps" style={{ color: 'var(--ink-faint)' }}>Cierre del día</span>
      <button onClick={() => onClose(null)} className="ring-ink p-1" style={{ color: 'var(--ink-faint)' }}><X size={18} /></button>
    </div>
    <h1 className="display text-4xl mb-2">Lo que se hizo.</h1>
    <p className="ff-serif italic mb-8" style={{ color: 'var(--ink-soft)' }}>Marca lo cumplido. Sin culpa por lo no marcado.</p>
    {activas.length === 0 && hechasHoy.length === 0 && <p className="ff-serif italic mb-6" style={{ color: 'var(--ink-faint)' }}>No hay misiones activas. Ve a una camiseta y siembra alguna.</p>}
    {hechasHoy.length > 0 && (<>
      <div className="smallcaps mb-3" style={{ color: 'var(--ink-faint)' }}>ya marcadas hoy</div>
      <div className="space-y-1 mb-5">
        {hechasHoy.map(m => (
          <div key={m.id} className="ff-serif text-sm flex items-center gap-2" style={{ color: 'var(--ink-faint)' }}>
            <Check size={12} strokeWidth={2.5} color="var(--moss)" />
            <span style={{ textDecoration: 'line-through' }}>{m.nombre}</span>
            <span className="ff-mono text-xs">{m.cam.emoji}</span>
          </div>
        ))}
      </div>
    </>)}
    {activas.length > 0 && (<>
      <div className="smallcaps mb-3" style={{ color: 'var(--ink-faint)' }}>vivas</div>
      <div className="space-y-1 mb-8">
        {activas.map(m => {
          const hoy = m.forma === 'recurrente' ? completionsHoy(m) : 0;
          const tickHoy = hoy > 0;
          return (
          <div key={m.id} className="flex items-start gap-2 py-1" style={{ borderBottom: '1px solid var(--line-soft)' }}>
            <button onClick={() => onToggle(m.cam.id, m.id)} className="flex items-start gap-3 py-1 text-left flex-1 ring-ink">
              <span className="w-4 h-4 mt-1.5 rounded-sm border flex items-center justify-center check-ani" style={{
                borderColor: tickHoy ? 'var(--moss)' : 'var(--line)',
                background: tickHoy ? 'var(--moss)' : 'transparent',
              }}>{tickHoy && <Check size={10} strokeWidth={3} color="var(--bg)" />}</span>
              <span className="flex-1 ff-serif">
                <span className="text-base mr-2">{m.cam.emoji}</span>{m.nombre}
                {hoy > 0 && (
                  <span className="ff-mono text-xs ml-2" style={{ color: 'var(--gold)' }}>· {hoy}× hoy</span>
                )}
              </span>
              <span className="ff-mono text-xs mt-1.5" style={{ color: 'var(--gold)' }}>+{puntos(m)}</span>
            </button>
            {confirmArchive === m.id ? (
              <div className="flex items-center gap-1 fade-up">
                <button onClick={() => { onArchive(m.cam.id, m.id); setConfirmArchive(null); }}
                  className="ring-ink ff-mono text-xs py-1 px-2"
                  style={{ background: 'var(--accent)', color: 'var(--bg)' }}>archivar</button>
                <button onClick={() => setConfirmArchive(null)}
                  className="ring-ink ff-mono text-xs py-1 px-2"
                  style={{ color: 'var(--ink-faint)' }}>no</button>
              </div>
            ) : (
              <button onClick={() => setConfirmArchive(m.id)}
                className="ring-ink p-1.5 mt-0.5"
                style={{ color: 'var(--ink-faint)' }} aria-label="Archivar misión">
                <Trash2 size={14} strokeWidth={1.5} />
              </button>
            )}
          </div>
        );})}
      </div>
    </>)}
    <div className="hr-deco mb-6" />
    <label className="smallcaps block mb-3" style={{ color: 'var(--ink-faint)' }}>¿Qué movió el día?</label>
    <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={3} placeholder="Una línea. La que importe." className="w-full ff-serif text-base p-3 ring-ink resize-none italic" style={{ border: '1px solid var(--line)', background: 'var(--bg-card)' }} />
    <div className="flex justify-end gap-3 mt-8">
      <button onClick={() => onClose(null)} className="ff-mono text-xs ring-ink px-3 py-2" style={{ color: 'var(--ink-faint)' }}>salir</button>
      <button onClick={() => onClose(notas.trim() || '·')} className="ff-serif px-6 py-2 ring-ink" style={{ background: 'var(--ink)', color: 'var(--bg)' }}>cerrar el día</button>
    </div>
  </div>);
}

function SesionSemanal({ cams, onArchiveMision, onEditMision, onAddMision, onAjustarDificultad, onCambiarForma, onClose }) {
  const [step, setStep] = useState(0);
  const [nuevas, setNuevas] = useState({});
  const [caliente, setCaliente] = useState('');
  const [fria, setFria] = useState('');
  const [notas, setNotas] = useState('');
  const totalSteps = cams.length + 2;
  const finish = () => {
    Object.entries(nuevas).forEach(([camId, lista]) => {
      (lista || []).forEach(m => {
        if (m?.nombre?.trim()) onAddMision(camId, { nombre: m.nombre.trim(), forma: m.forma || 'dificil', tonos: m.tonos || [], puntos_base: m.puntos_base });
      });
    });
    onClose({ notas: notas.trim(), caliente, fria, completa: true });
  };
  return (<div className="px-6 pt-8 pb-12 max-w-xl mx-auto fade-up">
    <div className="flex items-center justify-between mb-2">
      <span className="smallcaps" style={{ color: 'var(--ink-faint)' }}>Cierre de semana</span>
      <button onClick={() => onClose(null)} className="ring-ink p-1" style={{ color: 'var(--ink-faint)' }}><X size={18} /></button>
    </div>
    <div className="ff-mono text-xs mb-10" style={{ color: 'var(--ink-faint)' }}>{step + 1} / {totalSteps}</div>
    {step < cams.length && (() => {
      const cam = cams[step];
      const activas = cam.misiones.filter(m => enJuego(m));
      const drafts = nuevas[cam.id] || [];
      const setDrafts = (lista) => setNuevas({ ...nuevas, [cam.id]: lista });
      const updateDraft = (i, patch) => setDrafts(drafts.map((d, j) => j === i ? { ...d, ...patch } : d));
      const addDraft = () => setDrafts([...drafts, { nombre: '', forma: 'dificil', tonos: [] }]);
      const removeDraft = (i) => setDrafts(drafts.filter((_, j) => j !== i));
      // Siempre mostramos al menos un campo en blanco para empezar.
      const visibles = drafts.length === 0 ? [{ nombre: '', forma: 'dificil', tonos: [] }] : drafts;
      const ultimaTieneNombre = visibles[visibles.length - 1]?.nombre?.trim();
      return (<div className="fade-up">
        <div className="text-4xl mb-2">{cam.emoji}</div>
        <h2 className="display text-3xl mb-2">{cam.nombre}</h2>
        <p className="ff-serif italic mb-6" style={{ color: 'var(--ink-soft)' }}>Cada misión: ¿sigue viva, le subes o le bajas la dificultad, o ya cumplió su ciclo?</p>
        <div className="space-y-2 mb-6">
          {activas.length === 0 && <p className="ff-serif italic text-sm" style={{ color: 'var(--ink-faint)' }}>Sin misiones activas.</p>}
          {activas.map(m => (
            <SemanalMisionRow key={m.id} m={m}
              onArchive={() => onArchiveMision(cam.id, m.id)}
              onEdit={(d) => onEditMision(cam.id, m.id, d)}
              onMas={() => onAjustarDificultad(cam.id, m.id, 1)}
              onMenos={() => onAjustarDificultad(cam.id, m.id, -1)}
              onForma={(f) => onCambiarForma(cam.id, m.id, f)} />
          ))}
        </div>
        <div className="hr-deco mb-5" />
        <label className="smallcaps block mb-3" style={{ color: 'var(--ink-faint)' }}>¿Qué nace esta semana?</label>
        {visibles.map((d, i) => (
          <div key={i} className="mb-4">
            <div className="flex items-center gap-2">
              <input value={d.nombre}
                onChange={e => {
                  const base = drafts.length === 0 ? [{ nombre: '', forma: 'dificil', tonos: [] }] : drafts.slice();
                  base[i] = { ...base[i], nombre: e.target.value };
                  setDrafts(base);
                }}
                placeholder="(opcional)" className="flex-1 ff-serif text-base pb-1 ring-ink" style={{ borderBottom: '1px solid var(--line)' }} />
              {drafts.length > 1 && (
                <button onClick={() => removeDraft(i)} className="ring-ink ff-mono text-xs p-1" style={{ color: 'var(--ink-faint)' }} aria-label="Quitar"><X size={14} /></button>
              )}
            </div>
            {d.nombre?.trim() && (<div className="flex flex-wrap gap-1 mt-2">
              {FORMAS.map(f => (
                <button key={f.id} onClick={() => updateDraft(i, { forma: f.id })} className="ff-mono text-xs px-2 py-1 ring-ink" style={{
                  background: (d.forma || 'dificil') === f.id ? 'var(--ink)' : 'transparent',
                  color: (d.forma || 'dificil') === f.id ? 'var(--bg)' : 'var(--ink-soft)',
                  border: '1px solid ' + ((d.forma || 'dificil') === f.id ? 'var(--ink)' : 'var(--line)'),
                }}>{f.glyph} {f.label}</button>
              ))}
            </div>)}
          </div>
        ))}
        {ultimaTieneNombre && (
          <button onClick={() => { if (drafts.length === 0) setDrafts(visibles); addDraft(); }}
            className="ring-ink ff-mono text-xs py-1 px-3 mb-3 flex items-center gap-1"
            style={{ color: 'var(--accent)', border: '1px solid var(--accent-soft)' }}>
            <Plus size={12} /> añadir otra
          </button>
        )}
        <NavButtons onBack={step === 0 ? null : () => setStep(step - 1)} onNext={() => setStep(step + 1)} />
      </div>);
    })()}
    {step === cams.length && (<div className="fade-up">
      <h2 className="display text-3xl mb-2">La temperatura.</h2>
      <p className="ff-serif italic mb-8" style={{ color: 'var(--ink-soft)' }}>¿Cuál camiseta estuvo caliente esta semana? ¿Cuál estuvo fría?</p>
      <ChipsCam label="caliente" icon={Flame} cams={cams} value={caliente} onChange={setCaliente} accent="var(--accent)" />
      <ChipsCam label="fría" icon={Snowflake} cams={cams} value={fria} onChange={setFria} accent="var(--ocean)" />
      <NavButtons onBack={() => setStep(step - 1)} onNext={() => setStep(step + 1)} />
    </div>)}
    {step === cams.length + 1 && (<div className="fade-up">
      <h2 className="display text-3xl mb-2">Una nota.</h2>
      <p className="ff-serif italic mb-6" style={{ color: 'var(--ink-soft)' }}>Lo que esta semana te dijo. Una frase.</p>
      <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={5} autoFocus placeholder="…" className="w-full ff-serif text-base p-3 ring-ink resize-none italic" style={{ border: '1px solid var(--line)', background: 'var(--bg-card)' }} />
      <div className="flex justify-between mt-8">
        <button onClick={() => setStep(step - 1)} className="ff-mono text-xs ring-ink px-3 py-2" style={{ color: 'var(--ink-faint)' }}>← atrás</button>
        <button onClick={finish} className="ff-serif px-6 py-2 ring-ink" style={{ background: 'var(--ink)', color: 'var(--bg)' }}>cerrar la semana</button>
      </div>
    </div>)}
  </div>);
}

function SemanalMisionRow({ m, onArchive, onEdit, onMas, onMenos, onForma }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const mult = multiplicador(m);
  const sugerencia = mult > 1.8 ? 'lleva tiempo esperando' : mult < 0.7 ? 'se volvió rutina · ¿subir?' : null;
  if (editing) return <MisionForm initial={m} onSave={(d) => { onEdit(d); setEditing(false); setExpanded(false); }} onCancel={() => setEditing(false)} />;
  return (<div className="py-1" style={{ borderBottom: '1px solid var(--line-soft)' }}>
    <div className="flex items-start gap-2">
      <span className="flex-1 ff-serif text-base">{m.nombre}
        <span className="ff-mono text-xs ml-2" style={{ color: 'var(--ink-faint)' }}>
          {FORMAS.find(f => f.id === m.forma)?.glyph} {m.forma}
          {m.forma === 'recurrente' && <> · {completionsEsteMes(m)}×/30d</>}
        </span>
      </span>
      <span className="ff-mono text-xs mt-1" style={{ color: mult > 1.4 ? 'var(--warm)' : mult < 0.9 ? 'var(--ink-faint)' : 'var(--gold)' }}>+{puntos(m)}</span>
      <button onClick={() => setExpanded(!expanded)} className="ring-ink ff-mono text-xs py-1 px-2" style={{ color: 'var(--ink-faint)' }}>{expanded ? '·' : '…'}</button>
    </div>
    {sugerencia && !expanded && <div className="ff-mono text-xs italic ml-1 mb-1" style={{ color: 'var(--warm)' }}>{sugerencia}</div>}
    {expanded && (<div className="flex flex-wrap gap-1 mt-2 mb-2 fade-up">
      <button onClick={() => setEditing(true)} className="ring-ink ff-mono text-xs py-1 px-2" style={{ color: 'var(--ink-soft)', border: '1px solid var(--line)' }}>editar</button>
      <button onClick={onMas} className="ring-ink ff-mono text-xs py-1 px-2" style={{ color: 'var(--warm)', border: '1px solid var(--line)' }}>+ difícil</button>
      <button onClick={onMenos} className="ring-ink ff-mono text-xs py-1 px-2" style={{ color: 'var(--ink-soft)', border: '1px solid var(--line)' }}>− difícil</button>
      {FORMAS.filter(f => f.id !== m.forma).map(f => (
        <button key={f.id} onClick={() => onForma(f.id)} className="ring-ink ff-mono text-xs py-1 px-2" style={{ color: 'var(--ink-soft)', border: '1px solid var(--line)' }}>→ {f.label}</button>
      ))}
      <button onClick={onArchive} className="ring-ink ff-mono text-xs py-1 px-2" style={{ color: 'var(--accent)', border: '1px solid var(--accent-soft)' }}>archivar</button>
    </div>)}
  </div>);
}

function ChipsCam({ label, icon: Icon, cams, value, onChange, accent }) {
  return (<div className="mb-6">
    <label className="smallcaps mb-3 flex items-center gap-2" style={{ color: 'var(--ink-faint)' }}>
      {Icon && <Icon size={12} strokeWidth={1.5} />}{label}
    </label>
    <div className="flex flex-wrap gap-2">
      {cams.map(c => (
        <button key={c.id} onClick={() => onChange(value === c.id ? '' : c.id)} className="ff-serif px-3 py-1.5 ring-ink" style={{
          background: value === c.id ? accent : 'transparent',
          color: value === c.id ? 'var(--bg)' : 'var(--ink)',
          border: '1px solid ' + (value === c.id ? accent : 'var(--line)'),
        }}><span className="mr-1">{c.emoji}</span>{c.nombre}</button>
      ))}
    </div>
  </div>);
}

function NavButtons({ onBack, onNext }) {
  return (<div className="flex justify-between mt-8">
    {onBack ? <button onClick={onBack} className="ff-mono text-xs ring-ink px-3 py-2" style={{ color: 'var(--ink-faint)' }}>← atrás</button> : <div />}
    <button onClick={onNext} className="ff-serif px-5 py-2 ring-ink" style={{ border: '1px solid var(--ink)' }}>siguiente →</button>
  </div>);
}

function SesionMensual({ cams, onArchiveCam, onReviveCam, onDonateCam, onCreateCam, onClose }) {
  const [step, setStep] = useState(0);
  const [sentir, setSentir] = useState('');
  const [regla, setRegla] = useState('');
  const [falta, setFalta] = useState('');
  const [honesto, setHonesto] = useState('');   // A2: pregunta de honestidad, campo propio
  const activas = cams.filter(estaPuesta);
  const finish = () => onClose({
    completa: true,
    honesto: honesto.trim(),
    notas: [
      sentir.trim() && `Se siente: ${sentir.trim()}`,
      regla.trim() && `Regla a cambiar: ${regla.trim()}`,
      falta.trim() && `Falta camiseta: ${falta.trim()}`,
      honesto.trim() && `Honestidad: ${honesto.trim()}`,
    ].filter(Boolean).join(' · '),
  });
  return (<div className="px-6 pt-8 pb-12 max-w-xl mx-auto fade-up">
    <div className="flex items-center justify-between mb-2">
      <span className="smallcaps" style={{ color: 'var(--ink-faint)' }}>El observador del observador</span>
      <button onClick={() => onClose(null)} className="ring-ink p-1" style={{ color: 'var(--ink-faint)' }}><X size={18} /></button>
    </div>
    <div className="ff-mono text-xs mb-10" style={{ color: 'var(--ink-faint)' }}>{step + 1} / 5</div>
    {step === 0 && (<div className="fade-up">
      <h2 className="display text-3xl mb-2">El mazo.</h2>
      <p className="ff-serif italic mb-2" style={{ color: 'var(--ink-soft)' }}>¿Sigue cada camiseta siendo pertinente para ti?</p>
      <p className="ff-serif text-sm mb-6" style={{ color: 'var(--ink-soft)' }}>
        Pertinente: que todavía tiene sentido para quien eres hoy. Si alguna ya no, puedes <strong>guardarla en el closet</strong> (la recuperas cuando quieras) o <strong>donarla</strong> (sale de tu mazo y queda para otra persona; conservas tus puntos).
      </p>
      <div className="space-y-2 mb-8">
        {activas.map(c => (
          <div key={c.id} className="flex items-center gap-3 py-2">
            <span className="text-2xl">{c.emoji}</span>
            <span className="flex-1 ff-serif text-lg">{c.nombre}</span>
            <button onClick={() => { if (confirm(`¿Guardar "${c.nombre}" en el closet? La puedes recuperar después.`)) onArchiveCam(c.id); }} className="ring-ink ff-mono text-xs py-1 px-2" style={{ color: 'var(--ink-soft)', border: '1px solid var(--line)' }}>al closet</button>
            {onDonateCam && (
              <button onClick={() => { if (confirm(`¿Donar "${c.nombre}"? Sale de tu mazo para siempre y queda disponible para otra persona. Conservas tus puntos.`)) onDonateCam(c.id); }} className="ring-ink ff-mono text-xs py-1 px-2" style={{ color: 'var(--accent)', border: '1px solid var(--accent-soft)' }}>donar</button>
            )}
          </div>
        ))}
        {cams.filter(c => !estaPuesta(c)).length > 0 && (<details className="pt-4">
          <summary className="smallcaps cursor-pointer" style={{ color: 'var(--ink-faint)' }}>recuperar del closet</summary>
          <div className="mt-2 space-y-1">
            {cams.filter(c => !estaPuesta(c)).map(c => (
              <div key={c.id} className="flex items-center gap-3 py-1">
                <span>{c.emoji}</span>
                <span className="flex-1 ff-serif text-sm" style={{ color: 'var(--ink-faint)' }}>{c.nombre}</span>
                <button onClick={() => onReviveCam(c.id)} className="ring-ink ff-mono text-xs px-2 py-0.5" style={{ color: 'var(--ink-soft)' }}>recuperar</button>
              </div>
            ))}
          </div>
        </details>)}
      </div>
      <NavButtons onBack={null} onNext={() => setStep(step + 1)} />
    </div>)}
    {step === 1 && (<div className="fade-up">
      <h2 className="display text-3xl mb-2">¿Falta alguna?</h2>
      <p className="ff-serif italic mb-3" style={{ color: 'var(--ink-soft)' }}>Una identidad que ya estás viviendo sin nombre todavía.</p>
      <p className="ff-serif text-sm mb-6" style={{ color: 'var(--ink-soft)' }}>
        Mira tu vida fuera del juego: ¿hay un área que no estás observando —tu salud, una relación, el dinero, algo que quieres aprender— y que una camiseta nueva podría ayudarte a sostener?
      </p>
      <input value={falta} onChange={e => setFalta(e.target.value)} autoFocus placeholder="(opcional)" className="w-full ff-serif text-xl pb-2 mb-4 ring-ink" style={{ borderBottom: '1px solid var(--line)' }} />
      {falta.trim() && <button onClick={onCreateCam} className="ff-mono text-xs ring-ink py-1 px-3" style={{ color: 'var(--accent)', border: '1px solid var(--accent)' }}>construirla ahora →</button>}
      <NavButtons onBack={() => setStep(step - 1)} onNext={() => setStep(step + 1)} />
    </div>)}
    {step === 2 && (<div className="fade-up">
      <h2 className="display text-3xl mb-2">¿Cómo se siente jugar?</h2>
      <p className="ff-serif italic mb-6" style={{ color: 'var(--ink-soft)' }}>No las misiones: el juego mismo. ¿Vivo, mecánico, generoso, exigente?</p>
      <textarea value={sentir} onChange={e => setSentir(e.target.value)} autoFocus rows={4} placeholder="…" className="w-full ff-serif text-base p-3 ring-ink resize-none italic" style={{ border: '1px solid var(--line)', background: 'var(--bg-card)' }} />
      <NavButtons onBack={() => setStep(step - 1)} onNext={() => setStep(step + 1)} />
    </div>)}
    {step === 3 && (<div className="fade-up">
      <h2 className="display text-3xl mb-2">Una regla a cambiar.</h2>
      <p className="ff-serif italic mb-6" style={{ color: 'var(--ink-soft)' }}>Del juego, o de la vida. Lo que ya no sirve como está.</p>
      <textarea value={regla} onChange={e => setRegla(e.target.value)} autoFocus rows={4} placeholder="(opcional)" className="w-full ff-serif text-base p-3 ring-ink resize-none italic" style={{ border: '1px solid var(--line)', background: 'var(--bg-card)' }} />
      <NavButtons onBack={() => setStep(step - 1)} onNext={() => setStep(step + 1)} />
    </div>)}
    {step === 4 && (<div className="fade-up">
      <h2 className="display text-3xl mb-2">¿Estoy siendo honesto conmigo?</h2>
      <p className="ff-serif italic mb-6" style={{ color: 'var(--ink-soft)' }}>Sin maquillar el mes. Lo que sea verdad.</p>
      <textarea value={honesto} onChange={e => setHonesto(e.target.value)} autoFocus rows={4} placeholder="(opcional)" className="w-full ff-serif text-base p-3 ring-ink resize-none italic" style={{ border: '1px solid var(--line)', background: 'var(--bg-card)' }} />
      <div className="flex justify-between mt-8">
        <button onClick={() => setStep(step - 1)} className="ff-mono text-xs ring-ink px-3 py-2" style={{ color: 'var(--ink-faint)' }}>← atrás</button>
        <button onClick={finish} className="ff-serif px-6 py-2 ring-ink" style={{ background: 'var(--ink)', color: 'var(--bg)' }}>cerrar el mes</button>
      </div>
    </div>)}
  </div>);
}
