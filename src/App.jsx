import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Check, X, GripVertical, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Archive, RotateCcw, Edit2, Minus, Sun, Hexagon, BookOpen, Flame, Snowflake, Share2, Download, Copy, Inbox, Upload, AlertTriangle, Trash2, Filter, Smartphone, MoreVertical, Home, ArrowLeft, BarChart2 } from 'lucide-react';
import { encodeCamisetaToPng, generateCamisetaSVG, decodeImageToCamiseta, encodeCamisetaToJSON, decodeJSONToCamiseta } from './codec/index.js';
import { elegirEco, silenciarEco, citaVigente, paraQueDia, yaEscogio, calcularSeñales, ultimaSesion } from './ecos/index.js';
import { TEXTOS } from './ecos/textos.js';
import { construirICS, entregarCita, proximaCita, DURACION, aInputLocal, deInputLocal } from './cita.js';
import { mirar, preguntaDelCosturero, PREGUNTAS_DIFICILES } from './observador/index.js';
import { TEXTOS_OBSERVADOR } from './observador/textos.js';
import { CATALOGO } from './catalogo.js';
import { analizar, etiquetaLarga } from './analisis.js';

import {
  STATE_KEY,
  INSTALL_KEY,
  IMPORT_BACKUP_KEY,
  DAY,
  GANCHOS,
  PUESTA,
  AL_SIN_DOBLAR,
  estaPuesta,
  enGancho,
  enCerro,
  ordenarCerros,
  isStandalone,
  loadState,
  registrarVisita,
  saveState,
  pushEvento,
  aplicarMovida,
  colocarEn,
  reordenarEntre,
  enJuego,
  armarRespaldo,
  revisarRespaldo,
  uid,
  nowISO,
} from './estado.js';

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
  const [doblarCam, setDoblarCam] = useState(null);   // id de la camiseta a la que le estamos buscando sitio
  const [showCreate, setShowCreate] = useState(false);
  const [showCatalogo, setShowCatalogo] = useState(false);
  const [previewCat, setPreviewCat] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [sesion, setSesion] = useState(null);
  const [showRespaldo, setShowRespaldo] = useState(false);
  const [showDatos, setShowDatos] = useState(false);   // el vistazo al archivo propio
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
    s.camisetas.push({ id, ...data, creador_id: s.user_id, origen: 'propia', origen_camiseta_id: null, precio: null, created_at: nowISO(), ubicacion: PUESTA(), misiones: [], milestones: [] });
    pushEv(s, { tipo: 'camiseta_creada', cam_id: id, nombre: data.nombre, emoji: data.emoji, esencia: data.esencia ?? '', arco: data.arco ?? null });
  });
  const recibirCamiseta = (molde, partner = null) => {
    // molde is the decoded camiseta object from decodeImageToCamiseta (mode='molde').
    // Estado se transmite en cero: misiones empiezan activas sin completions,
    // milestones pendientes. Preservamos creador_id original y atamos origen_camiseta_id
    // al id del molde recibido para trazar la procedencia.
    // El partner NO viene en el molde —el codec no lo exporta nunca— sino de
    // quien recibe, que escribe el nombre que quiera al momento de importar.
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
        partner,
        created_at: nowISO(),
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
        created_at: nowISO(), ubicacion: PUESTA(),
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
  const moverCamiseta = (id, destino, ranura = null) => update(s => { colocarEn(s, id, destino, ranura); });
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
  // Doblar en un cerro que todavía no existe: se crea y se guarda en la
  // misma movida, para no dejar un cerro vacío si algo se interrumpe.
  const doblarEnNuevoCerro = (camId, nombre) => update(s => {
    const n = (nombre || '').trim();
    if (!n) return;
    const orden = s.cerros.reduce((mx, c) => Math.max(mx, c.orden ?? 0), 0) + 1;
    const id = uid();
    s.cerros.push({ id, nombre: n, orden, esDelSistema: false });
    aplicarMovida(s, camId, { tipo: 'cerro', cerroId: id });
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
  // Donar: la camiseta sale de tu set de verdad (no al clóset). Los movimientos
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
  // El detalle de por qué esto necesita saber qué lista se está viendo está
  // en reordenarEntre (src/estado.js), junto a la prueba que lo cuida.
  const reorderCamiseta = (camId, dir, entre = null) => update(s => { reordenarEntre(s, camId, dir, entre); });
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
  // Lo que el costurero le muestra a uno para que escoja informado, sin
  // forzar. Las dos señales hablan de la camiseta, nunca del usuario: "no
  // tiene nada que hacer" y "hace rato no se juega" describen una identidad,
  // que es lo único que el app tiene permitido notar en voz alta.
  const señalesCosturero = calcularSeñales(state);
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

  // Vista propia, no capa flotante: es texto largo con su propio scroll, y
  // además evita de raíz el bug de position:fixed dentro de una vista animada.
  //
  // Va antes de la bienvenida a propósito: quien llega a restaurar todavía no
  // tiene camisetas, y la bienvenida le ganaría el turno para siempre.
  if (showRespaldo) return <Frame><RespaldoView state={state}
    onVolver={() => setShowRespaldo(false)}
    onRestaurado={() => window.location.reload()} /></Frame>;

  // El vistazo a los datos: misma forma que el respaldo —vista propia, con su
  // scroll— y también antes de la bienvenida, para que la puerta funcione
  // desde donde se abra.
  if (showDatos) return <Frame><DatosView state={state} onVolver={() => setShowDatos(false)} /></Frame>;

  // Bienvenida: primera vez sin camisetas y sin haber decidido aún
  if (state.camisetas.length === 0 && !showCreate && !showCatalogo && !showImport) {
    return <Frame><Welcome onCatalogo={() => setShowCatalogo(true)} onCrear={() => setShowCreate(true)} onImport={() => setShowImport(true)} onRespaldo={() => setShowRespaldo(true)} /></Frame>;
  }
  if (showImport) {
    return <Frame><ImportSheet
      onClose={() => setShowImport(false)}
      onImport={(molde, partner) => {
        const id = recibirCamiseta(molde, partner);
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
  // Doblar es su propia vista. Al escoger destino la camiseta ya quedó
  // guardada, así que se sale también de su ficha: quedarse mirándola es
  // quedarse mirando algo que acabas de poner en su sitio.
  if (doblarCam) {
    const cam = state.camisetas.find(c => c.id === doblarCam);
    if (!cam) { setDoblarCam(null); return null; }
    const salir = () => { setDoblarCam(null); setOpenCam(null); };
    return <Frame>
      <DoblarView cam={cam} cerros={ordenarCerros(state.cerros)} cams={state.camisetas}
        onMover={moverCamiseta} onCrearCerro={doblarEnNuevoCerro}
        onSalir={salir} />
      <TabBar tab="camisetas" setTab={(t) => { salir(); setTab(t); }} />
    </Frame>;
  }
  if (openCam) {
    const cam = state.camisetas.find(c => c.id === openCam);
    if (!cam) { setOpenCam(null); return null; }
    return <Frame><CamisetaDetail cam={cam} movimientos={state.movimientos} onBack={() => setOpenCam(null)}
      onDoblar={() => setDoblarCam(cam.id)}
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
      onDonateCam={(dedicatoria) => { donarCamiseta(cam.id, dedicatoria); setOpenCam(null); }} />
      {/* La barra de siempre, también aquí dentro. Antes la única salida de
          una camiseta era una flecha chiquita arriba a la izquierda, mientras
          los botones grandes de abajo ofrecían guardarla o donarla: el camino
          fácil era deshacerse de ella y el difícil era volver. */}
      <TabBar tab="camisetas" setTab={(t) => { setOpenCam(null); setTab(t); }} />
    </Frame>;
  }
  // Cerrar el ritual diario mueve la ropa y deja la sesión, en ese orden y en
  // el mismo gesto. La sesión guarda qué se escogió y para qué día: es el
  // material con el que después el observador puede preguntar por lo que
  // nunca sale del clóset, sin que nadie haya tenido que reportar nada.
  //
  // No lleva cita: al hacedor lo convoca el trabajo. Y salir por la X llega
  // aquí con p en null — no se mueve nada y no se registra nada.
  const cerrarRitualDiario = (p) => {
    setSesion(null);
    if (!p) return;
    update(s => {
      p.quitadas.forEach(({ id }) => aplicarMovida(s, id, AL_SIN_DOBLAR()));
      p.puestas.forEach(({ id }) => aplicarMovida(s, id, PUESTA()));
    });
    logSesion({ tipo: 'diaria', para: p.para, quitadas: p.quitadas, puestas: p.puestas, notas: p.notas });
  };

  // El ritual diario recibe el clóset entero, no solo lo puesto: el segundo
  // paso escoge justamente de lo que no está puesto.
  if (sesion === 'diaria') return <Frame><EscogerLaRopa cams={state.camisetas}
    onClose={cerrarRitualDiario} /></Frame>;
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
  // El costurero ve el clóset entero, no lo que traigo puesto hoy. Desde v10
  // "puesta" es la atención de un día: si recibiera camsActivas, solo se
  // podría coser lo que uno se puso esta mañana, que es justo al revés de
  // para qué sirve el ritual.
  if (sesion === 'semanal') return <Frame><SesionCosturero cams={state.camisetas}
    señales={señalesCosturero}
    onArchiveMision={archiveMision} onEditMision={editMision} onAddMision={addMision}
    onAjustarDificultad={ajustarDif} onCambiarForma={cambiarForma}
    onToggleMilestone={toggleMilestone}
    onClose={cerrarSesion('semanal')} /></Frame>;
  // El observador recibe el estado entero porque sus comprobaciones miran la
  // historia, no solo el clóset de hoy: cómo murieron las identidades que se
  // fueron, cuánto valía una misión hace dos meses.
  //
  // `ultimaClave` es la comprobación de la sesión pasada: la que ganó
  // entonces pierde fuerza ahora, para que esto no sea la misma conversación
  // cada treinta días.
  if (sesion === 'mensual') return <Frame><SesionObservador state={state}
    ultimaClave={ultimaSesion(state, 'mensual')?.hallazgo ?? null}
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
      {tab === 'camisetas' && <CamisetasView cams={state.camisetas} cerros={state.cerros} movimientos={state.movimientos} onOpen={setOpenCam} onCreate={() => setShowCreate(true)} onOpenCatalogo={() => setShowCatalogo(true)} onImport={() => setShowImport(true)} onReorder={reorderCamiseta} onMover={moverCamiseta} onLavar={lavarLaRopa} onCrearCerro={crearCerro} onRenombrarCerro={renombrarCerro} onBorrarCerro={borrarCerro} onDonarCerro={donarCerro} onDoblar={setDoblarCam} />}
      {tab === 'diario' && <DiarioView state={state} onStart={setSesion}
        onAgendar={(cadencia) => setPedirCita({ cadencia, origen: 'diario' })}
        onRespaldo={() => setShowRespaldo(true)}
        onDatos={() => setShowDatos(true)} />}
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
// Una capa a pantalla completa (hojas y modales).
//
// `position: fixed` se mide contra la pantalla... salvo que algún ancestro
// tenga un transform, y entonces se mide contra ESE ancestro. Nuestro
// `.fade-up` termina la animación con un transform de identidad puesto —el
// fill-mode lo deja pegado— así que toda vista animada se vuelve una trampa:
// la capa se ancla al alto de la página en vez de al alto de la pantalla y
// aparece cientos de píxeles más abajo, con media lista fuera del mundo.
// Sacarla al <body> devuelve a "fixed" su significado, y de paso la pone por
// encima de la barra de pestañas, que si no se le monta encima y se come los
// toques de la parte de abajo.
function Capa({ children }) {
  if (typeof document === 'undefined') return children;
  return createPortal(children, document.body);
}

function QuickNoteSheet({ onClose, onSave }) {
  const [texto, setTexto] = useState('');
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);
  return (
    <Capa><div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto fade-up"
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
    </div></Capa>
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
    <Capa><div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto fade-up"
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
    </div></Capa>
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
        /* El color va en el body, no solo en el contenedor de Frame: si vive
           únicamente ahí, cualquier capa montada fuera (un portal) hereda el
           negro por defecto del navegador y el texto desaparece sobre el
           fondo oscuro. */
        body { font-family: 'Chakra Petch', system-ui, sans-serif; color: var(--ink); background: var(--bg); }
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

function Welcome({ onCatalogo, onCrear, onImport, onRespaldo }) {
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
    {/* Quien vuelve —teléfono nuevo, navegador borrado— no está empezando:
        está recuperando. Si esta puerta no está aquí, la única salida es
        armar el clóset otra vez a mano. */}
    <button onClick={onRespaldo} className="fade-up-d3 ff-mono text-xs ring-ink py-2 px-3 mt-6" style={{ color: 'var(--ink-soft)', borderBottom: '1px solid var(--line)' }}>
      ya tengo un respaldo
    </button>
    <div className="fade-up-d3 ff-mono text-xs mt-14" style={{ color: 'var(--ink-faint)' }}>v0.5 · prototipo</div>
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
  const [partner, setPartner] = useState('');
  const next = () => setStep(s => s + 1);
  const back = () => step === 0 ? (canCancel && onCancel?.()) : setStep(s => s - 1);
  const submit = () => onDone({
    nombre: nombre.trim(), emoji: emoji.trim() || '◇',
    esencia: esencia.trim(),
    arco: (arcoDe.trim() && arcoA.trim()) ? { de: arcoDe.trim(), a: arcoA.trim() } : null,
    // Misma forma y misma regla que en EditCamiseta: el nombre se queda en
    // este teléfono y no viaja en el codec.
    partner: partner.trim() ? { activo: true, nombre: partner.trim(), tipo: null } : null,
  });
  return (<div className="min-h-screen flex flex-col px-6 pt-6 pb-10 max-w-xl mx-auto">
    <div className="flex items-center justify-between mb-12">
      <button onClick={back} className="ff-mono text-xs ring-ink p-2 -ml-2" style={{ color: 'var(--ink-faint)' }}>
        {step === 0 ? (canCancel ? '← cancelar' : '') : '← atrás'}
      </button>
      <span className="ff-mono text-xs" style={{ color: 'var(--ink-faint)' }}>{step + 1} / 5</span>
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
      <button onClick={next} className="self-end mt-8 ff-serif px-6 py-2 ring-ink" style={{ border: '1px solid var(--ink)' }}>siguiente →</button>
    </div>)}
    {/* El partner llega hasta aquí y no más: el app guarda un nombre para que
        el usuario sepa a quién escribirle, y nada más. No hay rol asignado,
        no se le notifica a nadie, y el nombre no sale de este teléfono. */}
    {step === 4 && (<div className="fade-up flex-1 flex flex-col">
      <div className="smallcaps mb-4" style={{ color: 'var(--ink-faint)' }}>Paso cinco · opcional</div>
      <h2 className="display text-3xl md:text-4xl mb-2">¿Con quién la revisas?</h2>
      <p className="ff-serif text-sm italic mb-8" style={{ color: 'var(--ink-soft)' }}>Un nombre, si hay alguien. Puedes dejarlo vacío.</p>
      <input value={partner} onChange={e => setPartner(e.target.value)} placeholder="un nombre"
        className="ff-serif text-lg pb-2 ring-ink" style={{ borderBottom: '1px solid var(--line)' }} />
      <p className="ff-serif text-sm mt-3" style={{ color: 'var(--ink-faint)' }}>
        Solo para ti: se queda en este teléfono y no viaja cuando compartes la camiseta. El app no sabe quién es ni le escribe.
      </p>
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
  const [partner, setPartner] = useState(cam.partner?.nombre || '');

  const submit = () => onSave({
    nombre: nombre.trim() || cam.nombre,
    emoji: emoji.trim() || '◇',
    esencia: esencia.trim(),
    arco: (arcoDe.trim() && arcoA.trim()) ? { de: arcoDe.trim(), a: arcoA.trim() } : null,
    // El nombre del partner se queda en este teléfono: no viaja en el codec
    // (que exporta por lista blanca) ni sale en ninguna URL. Compartir una
    // camiseta no debe cargarle a nadie un rol que no pidió.
    partner: partner.trim() ? { activo: true, nombre: partner.trim(), tipo: null } : null,
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

    <div className="mb-6">
      <div className="smallcaps mb-2" style={{ color: 'var(--ink-faint)' }}>con quién la revisas <span className="lowercase tracking-normal opacity-60">(opcional)</span></div>
      <input value={partner} onChange={e => setPartner(e.target.value)}
        placeholder="un nombre"
        className="w-full ff-serif text-lg pb-2 ring-ink"
        style={{ borderBottom: '1px solid var(--line)' }} />
      <p className="ff-serif text-sm mt-2" style={{ color: 'var(--ink-faint)' }}>
        Solo para ti: se queda en este teléfono y no viaja cuando compartes la camiseta. El app no sabe quién es ni le escribe.
      </p>
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
  // El evento es todo lo que queda de esta camiseta: al salir del array, lo
  // que no esté aquí no existe más. Por eso viaja created_at —sin él, cuánto
  // vivió la identidad es incalculable para siempre— y por eso las misiones
  // llevan tonos, puntos y fecha de cumplida: es el material con el que el
  // observador pregunta por el nivel del juego y por si una camiseta se gastó
  // o se abandonó. Añadir campos aquí es barato; recuperarlos después es
  // imposible.
  pushEvento(s, { tipo: 'camiseta_donada', cam_id: camId, nombre: c.nombre, emoji: c.emoji,
    dedicatoria: ded || undefined,
    snapshot: { esencia: c.esencia ?? '', arco: c.arco ?? null,
      created_at: c.created_at ?? null,
      misiones: (c.misiones || []).map(m => ({ id: m.id, nombre: m.nombre, forma: m.forma,
        tonos: [...(m.tonos || [])], puntos_base: m.puntos_base ?? null,
        estado: m.estado, completed_at: m.completed_at ?? null,
        completions: [...(m.completions || [])] })),
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
      // Dentro de una zona con orden, en qué hueco cayó el dedo: sobre qué
      // tarjeta está y de qué lado de su mitad. Sin esto, soltar entre las
      // puestas dejaba la camiseta en cualquier parte de la lista, que es lo
      // que se sentía como "no queda donde quiero".
      const tarjeta = movido ? document.elementFromPoint(x, y)?.closest?.('[data-slot]') : null;
      if (tarjeta) {
        const r = tarjeta.getBoundingClientRect();
        st.current.ranura = { id: tarjeta.dataset.slot, antes: y < r.top + r.height / 2 };
      } else {
        st.current.ranura = null;
      }
      st.current.movido = movido;
      st.current.dir = !movido ? 0 : y < 100 ? -1 : y > window.innerHeight - 100 ? 1 : 0;
      setZona(st.current.zona);
      setDrag(d => d && { ...d, x, y, movido });
    };
    const soltar = () => {
      const { movido, zona: z, cam, ranura } = st.current;
      st.current.dir = 0;
      setDrag(null); setZona(null);
      // Soltar sin haber movido el dedo es un toque en el agarradero: en vez
      // de arrastrar, se abre la lista de sitios. Misma intención, otra mano.
      if (!movido) { onTap?.(cam); return; }
      if (z) onSoltar(cam, z, ranura);
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
// Escoger dónde va una camiseta. Es una vista, no una ventana: el clóset
// entero cabe en la pantalla, se hace scroll normal y no depende de que
// `position: fixed` signifique lo que dice. Una hoja flotante aquí era
// frágil y además mentía sobre lo que estás haciendo, que es abrir el
// mueble y buscarle sitio a una prenda.
function DoblarView({ cam, cerros, cams, onMover, onCrearCerro, onSalir }) {
  const [nuevo, setNuevo] = useState(null);   // null = no está creando; string = nombre en curso
  const ocupante = (i) => cams.find(c => c.id !== cam.id && enGancho(c, i));
  const ir = (u) => { onMover(cam.id, u); onSalir(); };
  const fila = "w-full text-left ring-ink py-3 px-4 ff-serif flex items-baseline gap-2";
  const marco = { background: 'var(--bg-card)', border: '1px solid var(--line-soft)', borderRadius: 2 };
  return (<div className="px-5 pt-6 pb-32 max-w-2xl mx-auto fade-up">
    <button onClick={onSalir} className="ring-ink mb-6 flex items-center gap-1 ff-mono text-xs" style={{ color: 'var(--ink-faint)' }}>
      <ChevronLeft size={14} /> volver
    </button>

    <div className="flex items-center gap-3 mb-1">
      <span className="text-4xl">{cam.emoji}</span>
      <h2 className="display text-3xl">{cam.nombre}</h2>
    </div>
    <p className="ff-serif italic mb-8" style={{ color: 'var(--ink-soft)' }}>¿Dónde la dejas?</p>

    {!estaPuesta(cam) && (<>
      <div className="smallcaps mb-3" style={{ color: 'var(--magenta)' }}>Puesta</div>
      <button onClick={() => ir(PUESTA())} className={fila + ' mb-10'} style={marco}>
        <span className="flex-1">ponérmela</span>
        <ChevronRight size={16} strokeWidth={1.4} style={{ color: 'var(--ink-faint)' }} />
      </button>
    </>)}

    <div className="smallcaps mb-3" style={{ color: 'var(--cian)' }}>Ganchos</div>
    <div className="grid gap-2 mb-10">
      {Array.from({ length: GANCHOS }, (_, i) => {
        const oc = ocupante(i);
        const aqui = enGancho(cam, i);
        return (<button key={i} onClick={() => aqui || ir({ tipo: 'gancho', posicion: i })} disabled={aqui}
          className={fila} style={{ ...marco, borderStyle: oc || aqui ? 'solid' : 'dashed', opacity: aqui ? 0.45 : 1 }}>
          <span>gancho {i + 1}</span>
          <span className="ff-mono text-xs flex-1" style={{ color: 'var(--ink-faint)' }}>
            {aqui ? '· aquí está' : oc ? `· ocupado por ${oc.nombre}` : '· libre'}
          </span>
          {!aqui && <ChevronRight size={16} strokeWidth={1.4} style={{ color: 'var(--ink-faint)' }} />}
        </button>);
      })}
    </div>

    <div className="smallcaps mb-3" style={{ color: 'var(--violeta-luz)' }}>Cerros</div>
    <div className="grid gap-2">
      {cerros.map(k => {
        const aqui = enCerro(cam, k.id);
        return (<button key={k.id} onClick={() => aqui || ir({ tipo: 'cerro', cerroId: k.id })} disabled={aqui}
          className={fila} style={{ ...marco, opacity: aqui ? 0.45 : 1 }}>
          <span>{k.nombre}</span>
          <span className="ff-mono text-xs flex-1" style={{ color: 'var(--ink-faint)' }}>
            {aqui ? '· aquí está' : `· ${cams.filter(c => enCerro(c, k.id)).length}`}
          </span>
          {!aqui && <ChevronRight size={16} strokeWidth={1.4} style={{ color: 'var(--ink-faint)' }} />}
        </button>);
      })}
      {onCrearCerro && (nuevo === null ? (
        <button onClick={() => setNuevo('')} className="w-full text-left ring-ink py-3 px-4 ff-mono text-xs"
          style={{ border: '1px dashed var(--line)', borderRadius: 2, color: 'var(--ink-faint)' }}>+ cerro nuevo</button>
      ) : (
        <div className="flex gap-2 items-baseline fade-up">
          <input value={nuevo} onChange={e => setNuevo(e.target.value)} autoFocus placeholder="nombre del cerro"
            onKeyDown={e => { if (e.key === 'Enter' && nuevo.trim()) { onCrearCerro(cam.id, nuevo); onSalir(); } if (e.key === 'Escape') setNuevo(null); }}
            className="flex-1 ff-serif text-lg pb-1 ring-ink" style={{ borderBottom: '1px solid var(--line)' }} />
          <button onClick={() => { if (nuevo.trim()) { onCrearCerro(cam.id, nuevo); onSalir(); } }}
            className="ring-ink ff-mono text-xs px-3 py-2" style={{ border: '1px solid var(--cian)', color: 'var(--cian)' }}>crear y doblar</button>
        </div>
      ))}
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

// ── Cómo llega una camiseta al clóset ────────────────────────────────────
//
// Hay tres formas de tener una camiseta, no una principal y dos accesorias:
// crearla, comprarla, recibirla. En el header del clóset no caben tres
// nombres en un teléfono, y sin nombre las dos últimas eran íconos mudos
// (una bandeja y un "+" idénticos). Así que el header lleva una sola puerta
// y los tres verbos viven aquí, al mismo nivel y todos nombrados.
//
// El orden no es el de la bienvenida y es a propósito: allá comprar va
// primero, porque quien llega no tiene puntos ni sabe todavía qué es una
// camiseta y el catálogo le enseña. Aquí ya está jugando, y crear es lo que
// más va a hacer.
function NuevaCamisetaSheet({ puntos, onCrear, onComprar, onRecibir, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const vias = [
    { titulo: 'Crearla',   cuerpo: 'Desde cero. Tú le pones el nombre, la esencia y las misiones.', onClick: onCrear },
    { titulo: 'Comprarla', cuerpo: 'Del catálogo. Vienen con sus misiones puestas.', onClick: onComprar,
      extra: <span className="ff-mono text-xs" style={{ color: 'var(--gold)' }}>{round1(puntos)} pts</span> },
    { titulo: 'Recibirla', cuerpo: 'De alguien más, desde una imagen o un JSON.', onClick: onRecibir },
  ];

  return (
    <Capa><div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto fade-up"
      style={{ background: 'rgba(28, 24, 19, 0.55)' }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md my-auto max-h-[90vh] overflow-y-auto"
        style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}>
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--line-soft)' }}>
          <span className="smallcaps" style={{ color: 'var(--ink-faint)' }}>Una camiseta nueva</span>
          <button onClick={onClose} className="ring-ink p-1" aria-label="Cerrar"><X size={16} style={{ color: 'var(--ink-faint)' }} /></button>
        </div>
        {vias.map((v, i) => (
          <button key={v.titulo} onClick={v.onClick}
            className="block w-full text-left px-5 py-4 ring-ink"
            style={i < vias.length - 1 ? { borderBottom: '1px solid var(--line-soft)' } : undefined}>
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <span className="ff-serif text-lg" style={{ color: 'var(--ink)' }}>{v.titulo}</span>
              {v.extra}
            </div>
            <span className="ff-serif italic text-sm" style={{ color: 'var(--ink-soft)' }}>{v.cuerpo}</span>
          </button>
        ))}
      </div>
    </div></Capa>
  );
}

function CamisetasView({ cams, cerros, movimientos, onOpen, onCreate, onOpenCatalogo, onImport,
                        onReorder, onMover, onLavar, onCrearCerro, onRenombrarCerro, onBorrarCerro, onDonarCerro, onDoblar }) {
  // Los cerros arrancan abiertos: un cerro sirve para saber qué hay dentro.
  // Se cierran cuando estorban, no al revés.
  const [cerrados, setCerrados] = useState(() => new Set());
  const [creandoCerro, setCreandoCerro] = useState(false);
  const [nombreCerro, setNombreCerro] = useState('');
  const [renombrando, setRenombrando] = useState(null);
  const [borrando, setBorrando] = useState(null);
  const [donando, setDonando] = useState(null);
  const [nueva, setNueva] = useState(false);


  const { agarrar, fantasma, zona, arrastrando } = useArrastre(
    (cam, destino, ranura) => {
      const [tipo, arg] = destino.split(':');
      if (tipo === 'puesta') onMover(cam.id, PUESTA(), ranura);
      else if (tipo === 'gancho') onMover(cam.id, { tipo: 'gancho', posicion: Number(arg) });
      else if (tipo === 'cerro') onMover(cam.id, { tipo: 'cerro', cerroId: arg });
    },
    (cam) => onDoblar(cam.id),
  );

  const puestas = cams.filter(estaPuesta);
  // El orden que el usuario ve. Las flechas reordenan dentro de esto, no
  // dentro del array completo, que incluye lo que está en ganchos y cerros.
  const idsPuestas = puestas.map(c => c.id);
  const ordenados = ordenarCerros(cerros);
  const toggleCerro = (id) => setCerrados(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const marco = (clave) => zona === clave
    ? { borderColor: 'var(--cian)', boxShadow: '0 0 0 1px var(--magenta), 0 0 18px -4px var(--cian)' }
    : { borderColor: 'var(--line-soft)' };


  return (<div className="fade-up">
    {fantasma}

    {nueva && <NuevaCamisetaSheet
      puntos={puntosTotales(movimientos)}
      onCrear={() => { setNueva(false); onCreate(); }}
      onComprar={() => { setNueva(false); onOpenCatalogo(); }}
      onRecibir={() => { setNueva(false); onImport(); }}
      onClose={() => setNueva(false)} />}

    <div className="flex items-baseline justify-between mb-6">
      <p className="ff-serif italic text-lg" style={{ color: 'var(--ink-soft)' }}>Tu clóset.</p>
      <button onClick={() => setNueva(true)}
        className="ring-ink ff-serif text-base py-1.5 px-4 flex items-center gap-1.5 shrink-0"
        style={{ background: 'var(--ink)', color: 'var(--bg)' }}>
        <Plus size={16} strokeWidth={1.5} /><span>nueva camiseta</span>
      </button>
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
        return (<div key={cam.id} data-slot={cam.id} className="flex" style={{
          background: 'var(--bg-card)', border: '1px solid var(--line-soft)', borderRadius: 2,
          opacity: arrastrando === cam.id ? 0.35 : 1,
        }}>
          <div className="flex flex-col items-center justify-center border-r" style={{ borderColor: 'var(--line-soft)' }}>
            {puestas.length > 1 && (
              <button onClick={() => onReorder(cam.id, -1, idsPuestas)} disabled={i === 0}
                className="ring-ink p-1.5 disabled:opacity-20" style={{ color: 'var(--ink-faint)' }} aria-label="Subir camiseta">
                <ChevronUp size={16} strokeWidth={1.5} />
              </button>
            )}
            <Agarradero onPointerDown={e => agarrar(e, cam)} label={`Mover ${cam.nombre}`} />
            {puestas.length > 1 && (
              <button onClick={() => onReorder(cam.id, +1, idsPuestas)} disabled={i === puestas.length - 1}
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

function CamisetaDetail({ cam, movimientos, onBack, onDoblar, onAddMision, onEditMision, onToggle, onUndo, onArchive, onRevive, onDelete, onAddMilestone, onToggleMilestone, onCobrarMilestone, onEditMilestone, onEditCam, onReviveCam, onArchiveCam, onDonateCam }) {
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
      <ChevronLeft size={14} /> clóset
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
    {/* Revisar con el partner. Es un mensaje que abre el share sheet, nada
        más: el app no manda nada, no sabe a quién se lo mandas y no registra
        que lo hiciste. El destinatario lo escoges en WhatsApp.

        Deliberadamente NO comparte cómo va la camiseta. Un reporte de avances
        leído por otra persona convierte el juego en una rendición de cuentas,
        que es justo lo que la regla de no medir asistencia evita por dentro.
        Esto solo abre la conversación; lo que se cuente se cuenta hablando. */}
    {cam.partner?.activo && (
      <button onClick={() => {
        const texto = `Quisiera revisar contigo los avances con la camiseta «${cam.nombre}»`;
        if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
          navigator.share({ text: texto }).catch(() => {});
        } else {
          navigator.clipboard?.writeText(texto);
        }
      }}
        className="ring-ink ff-mono text-xs py-2 px-3 mb-4 flex items-center gap-2"
        style={{ color: 'var(--ocean)', border: '1px solid var(--ocean)' }}>
        <Share2 size={12} /><span>revisar con {cam.partner.nombre}</span>
      </button>
    )}
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
            <span className="ff-serif italic text-sm" style={{ color: 'var(--ink-soft)' }}>¿«{cam.nombre}» al clóset?</span>
            <button onClick={() => { onArchiveCam(); }} className="ff-mono text-xs ring-ink px-3 py-1"
              style={{ background: 'var(--accent)', color: 'var(--bg)' }}>sí, al clóset</button>
            <button onClick={() => setConfirmRetiro(false)} className="ff-mono text-xs ring-ink px-3 py-1"
              style={{ color: 'var(--ink-faint)' }}>no</button>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <button onClick={() => setConfirmRetiro(true)} className="ff-mono text-xs ring-ink py-2"
              style={{ color: 'var(--ink-faint)' }}>guardar en el clóset</button>
            <button onClick={() => setConfirmDonar(true)} className="ff-mono text-xs ring-ink py-2"
              style={{ color: 'var(--ink-faint)' }}>donar</button>
          </div>
        )
      ) : (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="ff-serif italic text-sm" style={{ color: 'var(--ink-faint)' }}>esta camiseta vive en el clóset</span>
          <button onClick={onReviveCam} className="ff-mono text-xs ring-ink py-1 px-3"
            style={{ color: 'var(--moss)', border: '1px solid var(--moss)' }}>ponérmela</button>
          {/* Doblar: darle un sitio. Abre la misma vista que el agarradero
              del clóset — un solo camino, no dos. */}
          {onDoblar && (
            <button onClick={onDoblar} className="ff-mono text-xs ring-ink py-1 px-3"
              style={{ color: 'var(--cian)', border: '1px solid var(--cian)' }}>doblar</button>
          )}
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
    <Capa><div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto fade-up"
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
    </div></Capa>
  );
}

function ImportSheet({ onClose, onImport }) {
  const [phase, setPhase] = useState('pick');  // pick | loading | preview | error | text
  const [decoded, setDecoded] = useState(null);
  const [error, setError] = useState(null);
  const [previewSrc, setPreviewSrc] = useState(null);
  const [pasted, setPasted] = useState('');
  const [partner, setPartner] = useState('');
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
      {/* Se pregunta aquí para que ponerle partner a una camiseta recibida no
          exija entrar después a editarla. Es anotar un nombre y nada más: no
          se sugiere ninguno —quien te pasó la camiseta no tiene por qué ser
          con quien la revisas— y el nombre no vuelve a salir de este teléfono. */}
      <div className="mb-5">
        <div className="smallcaps mb-2" style={{ color: 'var(--ink-faint)' }}>
          con quién la revisas <span className="lowercase tracking-normal opacity-60">(opcional)</span>
        </div>
        <input value={partner} onChange={e => setPartner(e.target.value)}
          placeholder="un nombre"
          className="w-full ff-serif text-lg pb-2 ring-ink"
          style={{ borderBottom: '1px solid var(--line)' }} />
        <p className="ff-serif text-sm mt-2" style={{ color: 'var(--ink-faint)' }}>
          Solo para ti: se queda en este teléfono y no viaja cuando compartes la camiseta. El app no sabe quién es ni le escribe.
        </p>
      </div>
      <div className="space-y-2 mb-3">
        <button onClick={() => onImport(decoded, partner.trim() ? { activo: true, nombre: partner.trim(), tipo: null } : null)}
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

function DiarioView({ state, onStart, onAgendar, onRespaldo, onDatos }) {
  const ult = (tipo) => state.sesiones.filter(s => s.tipo === tipo).slice(-1)[0];
  // La puerta al ritual diario está siempre abierta —nada de "vuelve después
  // de las 6"—; lo único que cambia con la hora es a qué día apunta. Si ya se
  // escogió la de ese día, la tarjeta lo dice y no lo vuelve a pedir.
  const { dia: diaObjetivo, cuando } = paraQueDia();
  const cuandoTxt = cuando === 'hoy' ? 'hoy' : 'mañana';
  const ropaLista = yaEscogio(state, diaObjetivo);
  const fmt = (iso) => iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '—';
  const cards = [
    { tipo: 'diaria',  titulo: `Escoger la ropa de ${cuandoTxt}`, cita: 'Un día cabe en dos o tres camisetas.', ayuda: 'Quítate lo que no vas a jugar y deja puesto lo que sí.',                       tiempo: '1–2 min',   last: ult('diaria') },
    { tipo: 'semanal', titulo: 'El costurero',             cita: 'Las misiones se podan. Otras nacen.',       ayuda: 'Ajusta la dificultad de tus misiones, archiva las que ya no van y añade nuevas.', tiempo: '5–10 min',  last: ult('semanal') },
    { tipo: 'mensual', titulo: 'El observador del observador', cita: 'No las misiones: el juego mismo.',     ayuda: 'Observa cómo te observas: qué vale la pena medir y cómo lo estás midiendo.',  tiempo: '15–25 min', last: ult('mensual') },
  ];
  return (<div className="fade-up">
    <p className="ff-serif italic text-lg mb-6" style={{ color: 'var(--ink-soft)' }}>El juego se construye aquí. La reflexión es parte del hacer.</p>
    <Heatmap state={state} />
    <div className="space-y-3 mb-10">
      {cards.map(c => {
        // El diario solo agenda lo que se agenda: la semana y el mes. El
        // ritual diario no tiene cita porque al hacedor lo convoca el
        // trabajo, no una alarma, y un evento diario se vuelve ruido en
        // cuatro días.
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
            <span className="ff-mono text-xs" style={{ color: 'var(--ink-faint)' }}>
              {c.tipo === 'diaria' && ropaLista
                ? `la ropa de ${cuandoTxt} ya está escogida`
                : `última · ${fmt(c.last?.date)}`}
            </span>
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
    {/* El respaldo no puede seguir escondido al fondo: sin backend, es lo
        único que hay entre el usuario y perderlo todo. Aquí solo va la
        puerta; la explicación vive en su propia vista. */}
    <button onClick={onRespaldo} className="block w-full text-left p-4 ring-ink"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--line-soft)' }}>
      <h3 className="ff-serif text-xl mb-1">Guardar una copia del juego</h3>
      <p className="ff-serif text-sm" style={{ color: 'var(--ink-soft)' }}>
        Todo esto vive solo en este teléfono. Un respaldo toma diez segundos.
      </p>
    </button>
    {/* Debajo del respaldo y no en una pestaña propia, a propósito: las dos
        puertas son lo mismo —mirar el archivo, no jugar— y ninguna de las dos
        tiene que estar a la mano mientras se juega. */}
    <button onClick={onDatos} className="flex items-center gap-3 w-full text-left p-4 mt-3 ring-ink"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--line-soft)' }}>
      <BarChart2 size={20} style={{ flex: 'none', color: 'var(--cian)' }} />
      <div>
        <h3 className="ff-serif text-xl mb-1">Echarle un vistazo a mis datos</h3>
        <p className="ff-serif text-sm" style={{ color: 'var(--ink-soft)' }}>
          Lo que se ve cuando uno mira todo junto: qué has jugado, cuándo y con qué camisetas.
        </p>
      </div>
    </button>
  </div>);
}

// ── El respaldo ──────────────────────────────────────────────────────────
//
// Vista propia y no un bloque al fondo del Diario. La razón no es estética:
// este app no tiene backend, así que el archivo que salga de aquí es lo único
// que hay entre el usuario y perderlo todo. El navegador puede desalojar
// localStorage sin avisar y nadie tiene una copia en ningún servidor.
//
// Tres cosas que cambian respecto a la versión vieja, y por qué:
//   · **Sale como archivo, no al portapapeles.** Un JSON de mil líneas en el
//     portapapeles de un teléfono es un dato que se pierde con el siguiente
//     copiar. Como archivo se manda por WhatsApp a uno mismo, se guarda en
//     Archivos, se manda por correo.
//   · **Entra por selector de archivo**, no por un prompt() donde hay que
//     pegar mil líneas. Pegar sigue existiendo abajo, para quien lo tenga en
//     un mensaje.
//   · **Se dice qué trae adentro antes de pisar nada.** Restaurar es el único
//     gesto del app que borra todo de una, y no tiene deshacer visible.
//
// Lo que NO lleva, a propósito: ningún recordatorio de "hace rato no
// respaldas". Eso cuenta ausencias del usuario, que es exactamente lo que el
// juego no hace. El camino se hace fácil; el app no insiste.
function RespaldoView({ state, onVolver, onRestaurado }) {
  const [msg, setMsg] = useState(null);        // { kind: 'ok'|'error', text }
  const [pegar, setPegar] = useState(false);
  const [texto, setTexto] = useState('');
  const [confirmar, setConfirmar] = useState(null);  // { estado, resumen, crudo }
  const fileRef = useRef(null);

  const guardado = state.camisetas.length;

  async function exportar() {
    const { json, nombre } = armarRespaldo(state);
    const blob = new Blob([json], { type: 'application/json' });
    try {
      // El camino bueno en el teléfono: el share sheet del sistema, que deja
      // mandárselo por WhatsApp a uno mismo o guardarlo en Archivos.
      const file = new File([blob], nombre, { type: 'application/json' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Respaldo del juego de las camisetas' });
        setMsg({ kind: 'ok', text: 'listo — guárdalo donde lo puedas volver a encontrar' });
        return;
      }
    } catch (e) {
      if (e.name === 'AbortError') return;   // cancelar no es un error
    }
    // En computador, descarga normal.
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = nombre; a.click();
      URL.revokeObjectURL(url);
      setMsg({ kind: 'ok', text: `descargado: ${nombre}` });
    } catch {
      setMsg({ kind: 'error', text: 'No se pudo guardar el archivo. Prueba desde el navegador en vez de la app instalada.' });
    }
  }

  const revisar = (crudo) => {
    const r = revisarRespaldo(crudo);
    if (!r.ok) { setMsg({ kind: 'error', text: r.error }); return; }
    setMsg(null);
    setConfirmar({ ...r, crudo });
  };

  const cargarArchivo = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const lector = new FileReader();
    lector.onload = () => revisar(String(lector.result || ''));
    lector.onerror = () => setMsg({ kind: 'error', text: 'No se pudo leer ese archivo.' });
    lector.readAsText(f);
    e.target.value = '';   // que se pueda escoger el mismo archivo dos veces
  };

  // Pisar el estado es lo último que pasa, y el anterior queda congelado en
  // su propia llave: un pegado equivocado deja de ser pérdida total.
  const restaurar = () => {
    try {
      const actual = localStorage.getItem(STATE_KEY);
      if (actual) localStorage.setItem(IMPORT_BACKUP_KEY, actual);
      localStorage.setItem(STATE_KEY, confirmar.crudo);
      onRestaurado();
    } catch {
      setMsg({ kind: 'error', text: 'No se pudo guardar. ¿El teléfono está sin espacio?' });
      setConfirmar(null);
    }
  };

  if (confirmar) {
    const { resumen } = confirmar;
    return (<div className="px-6 pt-8 pb-12 max-w-xl mx-auto fade-up">
      <div className="smallcaps mb-8" style={{ color: 'var(--accent)' }}>Antes de restaurar</div>
      <h1 className="display text-3xl mb-6">Esto es lo que trae el archivo.</h1>
      <div className="mb-8 space-y-2 ff-serif text-lg">
        <div>{resumen.camisetas} {resumen.camisetas === 1 ? 'camiseta' : 'camisetas'}</div>
        <div style={{ color: 'var(--ink-soft)' }}>{resumen.sesiones} {resumen.sesiones === 1 ? 'sesión' : 'sesiones'} de rituales</div>
      </div>
      <p className="ff-serif mb-2" style={{ color: 'var(--warm)' }}>
        Al restaurar, <strong>lo que tienes hoy se reemplaza</strong> por esto
        {guardado > 0 && <> — ahora mismo tienes {guardado} {guardado === 1 ? 'camiseta' : 'camisetas'}</>}.
      </p>
      <p className="ff-serif text-sm mb-8" style={{ color: 'var(--ink-faint)' }}>
        Lo de hoy no se borra del todo: queda congelado por si te arrepientes. Aun así, si no estabas seguro, exporta primero.
      </p>
      <div className="flex justify-between">
        <button onClick={() => setConfirmar(null)} className="ff-mono text-xs ring-ink px-3 py-2" style={{ color: 'var(--ink-faint)' }}>cancelar</button>
        <button onClick={restaurar} className="ff-serif px-6 py-2 ring-ink" style={{ background: 'var(--accent)', color: 'var(--bg)' }}>restaurar</button>
      </div>
    </div>);
  }

  return (<div className="px-6 pt-8 pb-32 max-w-xl mx-auto fade-up">
    <div className="flex items-center justify-between mb-8">
      <span className="smallcaps" style={{ color: 'var(--ink-faint)' }}>Respaldo</span>
      {onVolver && <button onClick={onVolver} className="ring-ink p-1" style={{ color: 'var(--ink-faint)' }} aria-label="Volver"><X size={18} /></button>}
    </div>

    <h1 className="display text-4xl mb-3">Tu juego vive solo en este teléfono.</h1>
    <p className="ff-serif mb-10" style={{ color: 'var(--ink-soft)' }}>
      No hay cuenta ni servidor: nadie más tiene una copia. Si cambias de teléfono, si borras el navegador o si el sistema hace limpieza, se va. Sacar un respaldo toma diez segundos.
    </p>

    <div className="mb-10">
      <button onClick={exportar} className="ff-serif text-lg px-6 py-3 w-full ring-ink mb-3"
        style={{ background: 'var(--ink)', color: 'var(--bg)' }}>
        guardar una copia
      </button>
      <p className="ff-serif text-sm" style={{ color: 'var(--ink-faint)' }}>
        Se crea un archivo con todo tu juego. Mándatelo por WhatsApp a ti mismo, o guárdalo donde guardes lo que no quieres perder.
      </p>
    </div>

    <div className="hr-deco mb-8" />

    <h2 className="ff-serif text-2xl mb-3">¿Ya tienes una copia?</h2>
    <p className="ff-serif text-sm mb-4" style={{ color: 'var(--ink-soft)' }}>
      Búscala donde la hayas guardado. Es un archivo que se llama algo como <span className="ff-mono">camisetas-2026-08-16</span>.
    </p>
    <input ref={fileRef} type="file" accept="application/json,.json,text/plain" onChange={cargarArchivo} className="hidden" />
    <button onClick={() => fileRef.current?.click()} className="ff-serif px-5 py-3 w-full ring-ink mb-3"
      style={{ border: '1px solid var(--ink)' }}>
      buscar el archivo
    </button>

    {!pegar ? (
      <button onClick={() => setPegar(true)} className="ff-mono text-xs ring-ink" style={{ color: 'var(--ink-faint)' }}>
        o pegar el texto
      </button>
    ) : (
      <div className="fade-up">
        <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={5} autoFocus
          placeholder="pega aquí el contenido del respaldo…"
          className="w-full ff-mono text-xs p-3 ring-ink resize-none mb-2"
          style={{ border: '1px solid var(--line)', background: 'var(--bg-card)' }} />
        <button onClick={() => revisar(texto)} disabled={!texto.trim()}
          className="ff-mono text-xs ring-ink px-3 py-2 disabled:opacity-30"
          style={{ border: '1px solid var(--line)', color: 'var(--ink-soft)' }}>revisar lo pegado</button>
      </div>
    )}

    {msg && (
      <p className="ff-serif mt-6" style={{ color: msg.kind === 'ok' ? 'var(--moss)' : 'var(--accent)' }}>{msg.text}</p>
    )}
  </div>);
}

// ── El vistazo a los datos ───────────────────────────────────────────────
//
// El mini-análisis de uso real, que empezó como un artifact suelto hecho a
// mano sobre un backup de agosto y aquí se calcula en vivo. Las cuentas están
// en `src/analisis.js`; esto solo dibuja.
//
// Por qué es una vista propia y no una pestaña: mirar el archivo es un gesto
// distinto de jugar. No hay nada que hacer aquí, no hay ningún botón que
// cambie el estado, y el juego nunca trae al usuario a esta pantalla — se
// entra a propósito, desde la puerta del respaldo, y se sale con la flecha.
//
// Aquí adentro —y SOLO aquí adentro— viven la racha y el porcentaje de días
// activos. Es una excepción consciente a la regla dura de `docs/brief.md`, y
// está anotada con su fecha y su razón en `docs/decisiones.md`. La regla
// sigue mandando en todo lo demás: ningún eco, ningún ritual y ninguna
// pantalla del juego cuenta días seguidos ni ausencias, y nada de aquí sale
// a buscar al usuario.
//
// Los números no se ven bonitos con la paleta del artifact original (crema
// claro) porque esa no es la paleta de este app: los colores salen del codec,
// como todo lo demás. Los tonos son los mismos que la prenda.

// Negrita de juguete: los insights vienen con *lo importante* marcado con
// asteriscos. Se parte en trozos en vez de meter HTML en un string, porque
// ahí adentro hay nombres que escribió el usuario.
function TextoConFuerza({ texto }) {
  return texto.split('*').map((trozo, i) => (
    i % 2 ? <b key={i} style={{ color: 'var(--ink)', fontWeight: 600 }}>{trozo}</b> : <span key={i}>{trozo}</span>
  ));
}

function Tarjeta({ titulo, desc, children }) {
  return (<div className="mb-4 p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--line-soft)' }}>
    <h2 className="ff-serif text-base mb-1" style={{ fontWeight: 600 }}>{titulo}</h2>
    {desc && <p className="ff-mono text-xs mb-4" style={{ color: 'var(--ink-faint)' }}>{desc}</p>}
    {children}
  </div>);
}

// Barras verticales. `destacar` son los índices que muestran su número
// encima; los demás lo sueltan al tocarlos, para que la fila de cifras no
// tape la forma de la curva.
function Columnas({ datos, todasConCifra = false, destacar = [], minAncho = 0 }) {
  const [tocada, setTocada] = useState(null);
  const max = Math.max(1, ...datos.map(d => d.n));
  return (<div style={{ overflowX: 'auto' }}>
    <div className="flex items-end gap-1 relative" style={{ height: 160, paddingTop: 20, minWidth: minAncho || undefined }}>
      {/* La base se dibuja al ras de donde nacen las barras. El offset no es
          mágico: es exactamente el alto de la fila de etiquetas (12 + 6). */}
      <span style={{ position: 'absolute', left: 0, right: 0, bottom: 18, height: 1, background: 'var(--line)' }} />
      {datos.map((d, i) => {
        const mostrar = todasConCifra || tocada === i || destacar.includes(i);
        const alto = d.n === 0 ? 0 : Math.max((d.n / max) * 100, 3);
        return (<button key={d.label + i} onClick={() => setTocada(tocada === i ? null : i)}
          className="flex-1 flex flex-col items-center justify-end ring-ink"
          style={{ height: '100%', minWidth: 14, background: 'none', border: 'none', padding: 0 }}
          aria-label={`${d.label}: ${d.n}`}>
          <span className="ff-mono" style={{ fontSize: 10, height: 13, color: 'var(--ink-soft)' }}>
            {mostrar ? d.n : ''}
          </span>
          <span style={{
            width: '100%', maxWidth: 22, height: `${alto}%`,
            background: tocada === i ? 'var(--cian)' : 'var(--violeta-luz)',
            boxShadow: tocada === i ? '0 0 18px -4px var(--cian)' : 'none',
          }} />
          <span className="ff-mono" style={{
            fontSize: 9, height: 12, lineHeight: '12px', marginTop: 6, whiteSpace: 'nowrap',
            color: tocada === i ? 'var(--cian)' : 'var(--ink-faint)',
          }}>{d.label}</span>
        </button>);
      })}
    </div>
  </div>);
}

// Barras horizontales. El nombre de la camiseta lo escribió el usuario y
// puede ser largo: se recorta con puntos suspensivos y no se envuelve, para
// que todas las filas midan lo mismo y las barras sigan comparables.
function BarrasH({ datos, sufijo = '' }) {
  const max = Math.max(1, ...datos.map(d => d.n));
  return (<div className="flex flex-col gap-2">
    {datos.map((d, i) => (
      <div key={d.nombre + i} className="grid items-center gap-2" style={{ gridTemplateColumns: 'minmax(0,7.5rem) 1fr auto' }}>
        <span className="ff-serif text-right" style={{
          fontSize: 13, color: 'var(--ink-soft)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{d.nombre}</span>
        <span style={{ height: 14 }}>
          <span style={{
            display: 'block', height: 14,
            width: `${Math.max((d.n / max) * 100, 2)}%`,
            background: d.color || 'var(--violeta-luz)',
          }} />
        </span>
        <span className="ff-mono" style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{d.n}{sufijo}</span>
      </div>
    ))}
  </div>);
}

function DatosView({ state, onVolver }) {
  // El análisis se calcula una vez por entrada a la vista. No hay nada aquí
  // que modifique el estado, así que no hay por qué recalcularlo.
  const a = useMemo(() => analizar(state), [state]);

  const tablas = [
    ['Por semana', 'Semana', 'Misiones', a.semanal.map(s => [s.label, s.n])],
    ['Por día de la semana', 'Día', 'Misiones', a.porDiaSemana.map(d => [d.label, d.n])],
    ['Por tono', 'Tono', 'Misiones', [...a.tonos.map(t => [t.label, t.n]), ['sin tono', a.sinTono]]],
    ['Camisetas más jugadas', 'Camiseta', 'Misiones', a.topCams.map(c => [c.nombre, c.n])],
    ['Antes de la despedida', 'Camiseta', 'Días', a.duracion.map(d => [d.nombre, `${d.dias} d`])],
  ].filter(([, , , filas]) => filas.length);

  const pctSinTono = a.completadas ? Math.round((a.sinTono / a.completadas) * 100) : 0;
  // La semana más alta y la última llevan su cifra puesta: son las dos que
  // uno busca sin tener que tocar nada.
  const picoSemana = a.semanal.reduce((mejor, s, i) => (s.n > a.semanal[mejor].n ? i : mejor), 0);

  return (<div className="px-6 pt-8 pb-32 max-w-2xl mx-auto fade-up">
    <div className="flex items-center gap-3 mb-8">
      <button onClick={onVolver} className="ring-ink p-1" style={{ color: 'var(--ink-faint)' }} aria-label="Volver al juego">
        <ArrowLeft size={20} />
      </button>
      <span className="smallcaps" style={{ color: 'var(--ink-faint)' }}>Tus datos</span>
    </div>

    <h1 className="display text-4xl mb-3">Cómo has jugado de verdad.</h1>
    <p className="ff-serif mb-8" style={{ color: 'var(--ink-soft)' }}>
      {etiquetaLarga(a.periodo.desde)} → {etiquetaLarga(a.periodo.hasta)} · {a.periodo.dias} {a.periodo.dias === 1 ? 'día' : 'días'}.
      Sale de lo que ya está guardado en este teléfono.
    </p>

    {a.completadas === 0 ? (
      // Sin nada marcado no hay análisis, y llenar la pantalla de ceros sería
      // peor que decirlo. Nada de "llevas X días sin": esto describe el
      // archivo, no al usuario.
      <p className="ff-serif text-lg" style={{ color: 'var(--ink-soft)' }}>
        Todavía no hay misiones marcadas, así que no hay nada que mirar. Vuelve cuando el archivo tenga algo adentro.
      </p>
    ) : (<>

    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
      {a.tiles.map(t => (
        <div key={t.label} className="p-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--line-soft)' }}>
          <div className="ff-mono mb-1" style={{ fontSize: 10.5, lineHeight: 1.3, color: 'var(--ink-faint)' }}>{t.label}</div>
          <div className="ff-serif" style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.01em' }}>
            {t.value}
            {t.sub && <span className="ff-mono ml-1" style={{ fontSize: 11, fontWeight: 400, color: 'var(--ink-soft)' }}>{t.sub}</span>}
          </div>
        </div>
      ))}
    </div>

    <Tarjeta titulo="Misiones completadas por semana" desc="Cada barra es una semana de lunes a domingo. Toca una para ver el número.">
      <Columnas datos={a.semanal} destacar={[picoSemana, a.semanal.length - 1]}
        minAncho={Math.max(0, a.semanal.length * 26)} />
    </Tarjeta>

    <div className="grid sm:grid-cols-2 gap-4">
      <Tarjeta titulo="Por día de la semana" desc="Suma de todo el período">
        <Columnas datos={a.porDiaSemana} todasConCifra />
      </Tarjeta>
      <Tarjeta titulo="Tono de las misiones completadas"
        desc={`${a.sinTono} de ${a.completadas} (${pctSinTono}%) no tienen tono asignado — son hábitos simples, tipo rutina`}>
        {a.tonos.length ? (<>
          <div className="flex flex-wrap gap-x-4 gap-y-2 mb-4">
            {a.tonos.map(t => (
              <span key={t.id} className="ff-mono flex items-center gap-1.5" style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
                <span style={{ width: 9, height: 9, background: t.color, flex: 'none' }} />{t.label}
              </span>
            ))}
          </div>
          <BarrasH datos={a.tonos.map(t => ({ nombre: t.label, n: t.n, color: t.color }))} />
        </>) : (
          <p className="ff-serif text-sm" style={{ color: 'var(--ink-faint)' }}>Ninguna de las misiones que has completado tiene tono.</p>
        )}
      </Tarjeta>
    </div>

    {a.topCams.length > 0 && (
      <Tarjeta titulo="Camisetas más jugadas" desc="Por misiones completadas, estén todavía en el clóset o ya te hayas despedido de ellas">
        <BarrasH datos={a.topCams} />
      </Tarjeta>
    )}

    {a.duracion.length > 0 && (
      <Tarjeta titulo="Cuánto duraron antes de la despedida" desc="Días entre que la creaste y que la donaste">
        <BarrasH datos={a.duracion.map(d => ({ nombre: d.nombre, n: d.dias }))} sufijo=" d" />
      </Tarjeta>
    )}

    {a.insights.length > 0 && (
      <Tarjeta titulo="Lo que salta a la vista">
        <ul className="m-0 p-0" style={{ listStyle: 'none' }}>
          {a.insights.map((t, i) => (
            <li key={i} className="ff-serif relative mb-3" style={{ paddingLeft: 18, fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink-soft)' }}>
              <span className="ff-mono absolute" style={{ left: 0, color: 'var(--cian)' }}>❯</span>
              <TextoConFuerza texto={t} />
            </li>
          ))}
        </ul>
      </Tarjeta>
    )}

    {tablas.length > 0 && (
      <details className="mb-4">
        <summary className="ff-mono text-xs ring-ink cursor-pointer" style={{ color: 'var(--ink-faint)' }}>ver todo en tabla</summary>
        <table className="w-full mt-3" style={{ borderCollapse: 'collapse', fontSize: 12 }}>
          <tbody>
            {tablas.map(([titulo, colA, colB, filas]) => (
              <Fragment key={titulo}>
                <tr><th colSpan={2} className="ff-serif text-left" style={{ padding: '14px 8px 5px', fontWeight: 600 }}>{titulo}</th></tr>
                <tr>
                  <th className="ff-mono text-left" style={{ padding: '5px 8px', fontWeight: 400, color: 'var(--ink-faint)', borderBottom: '1px solid var(--line-soft)' }}>{colA}</th>
                  <th className="ff-mono text-left" style={{ padding: '5px 8px', fontWeight: 400, color: 'var(--ink-faint)', borderBottom: '1px solid var(--line-soft)' }}>{colB}</th>
                </tr>
                {filas.map(([n, v], i) => (
                  <tr key={i}>
                    <td className="ff-serif" style={{ padding: '5px 8px', borderBottom: '1px solid var(--line-soft)' }}>{n}</td>
                    <td className="ff-mono" style={{ padding: '5px 8px', borderBottom: '1px solid var(--line-soft)', fontVariantNumeric: 'tabular-nums' }}>{v}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </details>
    )}

    </>)}

    <div className="hr-deco mt-8 mb-4" />
    <p className="ff-mono" style={{ fontSize: 11, lineHeight: 1.6, color: 'var(--ink-faint)' }}>
      Esto se calcula aquí mismo, cada vez que abres la pantalla. No se guarda, no se envía y nadie más lo ve.
      {a.sesiones.total > 0 && <> Sesiones de cierre: {a.sesiones.total} ({a.sesiones.diaria} diarias, {a.sesiones.semanal} semanales, {a.sesiones.mensual} mensuales).</>}
      {a.camisetas.creadas > 0 && <> Camisetas: {a.camisetas.creadas} creadas en total, {a.camisetas.activas} en el clóset / {a.camisetas.donadas} donadas.</>}
    </p>

    <button onClick={onVolver} className="ff-mono text-xs ring-ink mt-8 flex items-center gap-2" style={{ color: 'var(--ink-faint)' }}>
      <ArrowLeft size={14} /> volver al juego
    </button>
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
          <p>{frias.length} camisetas dormidas más de dos semanas. Quizás sea hora de podar el clóset.</p>
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

// La historia crece sin techo y debajo de ella vive la puerta del respaldo,
// que sin backend es lo único que hay entre el usuario y perderlo todo. Así
// que la historia se pliega: los últimos días a la vista, lo demás en semanas
// que se abren si se quieren. Semana de lunes a domingo.
const DIAS_A_LA_VISTA = 3;
function inicioDeSemana(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));   // getDay(): domingo = 0
  return x;
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
  // null = todavía nadie tocó nada, vale el default. Un Set = lo que el usuario abrió.
  const [abiertas, setAbiertas] = useState(null);

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

  // Los días, repartidos en semanas. `filtered` viene del más nuevo al más
  // viejo y Object.entries conserva ese orden, así que las semanas salen ya
  // ordenadas sin tener que ordenarlas.
  const semanas = [];
  Object.entries(grupos).forEach(([day, evs]) => {
    const inicio = inicioDeSemana(new Date(evs[0].ts));
    const key = inicio.toDateString();
    let s = semanas.find(w => w.key === key);
    if (!s) { s = { key, inicio, dias: [] }; semanas.push(s); }
    s.dias.push([day, evs]);
  });

  // Al llegar se abren las semanas que hagan falta para juntar unos pocos
  // días con algo dentro — casi siempre una sola. No se cuenta por semanas
  // sino por días con eventos, porque una semana puede tener uno solo y
  // entonces "los últimos días" no sería nada.
  const abiertasPorDefecto = new Set();
  let diasALaVista = 0;
  for (const s of semanas) {
    if (diasALaVista >= DIAS_A_LA_VISTA) break;
    abiertasPorDefecto.add(s.key);
    diasALaVista += s.dias.length;
  }
  const abiertasAhora = abiertas ?? abiertasPorDefecto;
  const toggleSemana = (key) => {
    const n = new Set(abiertasAhora);
    n.has(key) ? n.delete(key) : n.add(key);
    setAbiertas(n);
  };
  const todasAbiertas = semanas.length > 0 && semanas.every(s => abiertasAhora.has(s.key));

  const etiquetaSemana = (s) => {
    if (s.key === inicioDeSemana(new Date()).toDateString()) return 'esta semana';
    if (s.key === inicioDeSemana(new Date(Date.now() - 7 * DAY)).toDateString()) return 'la semana pasada';
    const fin = new Date(s.inicio);
    fin.setDate(fin.getDate() + 6);
    const mes = (d) => d.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '');
    return mes(s.inicio) === mes(fin)
      ? `${s.inicio.getDate()}–${fin.getDate()} de ${mes(fin)}`
      : `${s.inicio.getDate()} de ${mes(s.inicio)} – ${fin.getDate()} de ${mes(fin)}`;
  };

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
    ) : (<>
      {semanas.length > 1 && (
        <div className="flex justify-end mb-2">
          <button onClick={() => setAbiertas(todasAbiertas ? new Set() : new Set(semanas.map(s => s.key)))}
            className="ring-ink ff-mono text-xs py-1 px-2" style={{ color: 'var(--ink-faint)' }}>
            {todasAbiertas ? 'contraer todo' : 'ver todo'}
          </button>
        </div>
      )}
      <div>
        {semanas.map(s => {
          const abierta = abiertasAhora.has(s.key);
          const nEventos = s.dias.reduce((a, [, evs]) => a + evs.length, 0);
          return (<div key={s.key} style={{ borderTop: '1px solid var(--line-soft)' }}>
            <button onClick={() => toggleSemana(s.key)} aria-expanded={abierta}
              className="flex items-center gap-2 w-full text-left ring-ink py-2">
              {abierta
                ? <ChevronDown size={12} style={{ color: 'var(--ink-faint)' }} />
                : <ChevronRight size={12} style={{ color: 'var(--ink-faint)' }} />}
              <span className="smallcaps" style={{ color: abierta ? 'var(--ink-soft)' : 'var(--ink-faint)' }}>
                {etiquetaSemana(s)}
              </span>
              <span className="flex-1" />
              <span className="ff-mono text-xs" style={{ color: 'var(--ink-faint)' }}>{nEventos}</span>
            </button>
            {abierta && (
              <div className="space-y-6 mb-5 mt-1">
                {s.dias.map(([day, evs]) => {
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
        })}
      </div>
    </>)}
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
      text = <>al clóset <em>{e.nombre}</em></>; break;
    case 'camiseta_recuperada':
      glyph = '◇'; color = 'var(--moss)';
      text = <>te pusiste de nuevo <strong>{e.nombre}</strong></>; break;
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
    case 'sesion_diaria': {
      // Las entradas viejas no traen ropa escogida: son de cuando el ritual
      // diario era otra cosa. Se leen como lo que fueron, sin inventarles
      // nada — igual que pasó al jubilar la palabra "mazo".
      glyph = '☾'; color = 'var(--ocean)';
      const q = (e.quitadas || []).length, pz = (e.puestas || []).length;
      text = (q || pz || e.para)
        ? <>ropa escogida{pz > 0 && <> · se puso <strong>{e.puestas.map(c => c.nombre).join(', ')}</strong></>}{q > 0 && <> · se quitó <em>{e.quitadas.map(c => c.nombre).join(', ')}</em></>}</>
        : <strong>cierre del día</strong>;
      break;
    }
    case 'sesion_semanal':
      glyph = '☾'; color = 'var(--ocean)';
      text = <strong>el costurero</strong>; break;
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
  // Desde hoy la temperatura admite varias camisetas y viaja con el nombre
  // congelado. Las entradas viejas guardaban una sola, como id suelto: se
  // siguen leyendo tal cual, igual que se hizo al jubilar la palabra "mazo".
  const temperatura = (plural, singular) => {
    if (Array.isArray(e[plural])) return e[plural];
    const id = e[singular];
    if (!id) return [];
    const c = lookupCam(id);
    return [{ id, nombre: c?.nombre ?? e[`${singular}_nombre`] ?? '—', emoji: c?.emoji }];
  };
  const calientes = temperatura('calientes', 'caliente');
  const frias = temperatura('frias', 'fria');
  const hasContent = (e.notas && e.notas !== '·') || calientes.length > 0 || frias.length > 0;
  const expandable = isCierre && hasContent;
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
        {calientes.length > 0 && (
          <div className="ff-mono text-xs flex items-center gap-2 mt-1" style={{ color: 'var(--ink-faint)' }}>
            <Flame size={12} strokeWidth={1.5} style={{ color: 'var(--accent)' }} />
            <span>{calientes.length === 1 ? 'caliente' : 'calientes'} · {calientes.map(c => `${c.emoji || ''} ${c.nombre}`.trim()).join(' · ')}</span>
          </div>
        )}
        {frias.length > 0 && (
          <div className="ff-mono text-xs flex items-center gap-2 mt-1" style={{ color: 'var(--ink-faint)' }}>
            <Snowflake size={12} strokeWidth={1.5} style={{ color: 'var(--ocean)' }} />
            <span>{frias.length === 1 ? 'fría' : 'frías'} · {frias.map(c => `${c.emoji || ''} ${c.nombre}`.trim()).join(' · ')}</span>
          </div>
        )}
      </div>
    )}
  </div>);
}

// ── Escoger la ropa ──────────────────────────────────────────────────────
//
// El ritual diario. Dos preguntas en dos pantallas, y eso no se colapsa en
// una: son dos momentos de reflexión con universos distintos —lo que traes
// puesto y lo que está en el clóset—. No está optimizado para la rapidez;
// está hecho para que uno se oiga pensar.
//
// Lo que NO hace, y cada una tiene su razón:
//   · No se escogen misiones. Eso es oficio del costurero, y escogerlas una
//     por una es engorroso. Aquí solo nombres, lista plana.
//   · No se marca nada cumplido. El app ya lo sabe; pedírselo al usuario era
//     volverlo la base de datos de algo que el juego ya tiene.
//   · No aparece "lavar la ropa". El botón de pánico vive en el clóset: un
//     atajo para quitarse las diecinueve, puesto justo donde el ritual pide
//     mirarlas una por una, es exactamente lo que sobra.
//   · No se evalúa lo de ayer. Lo escogido es una propuesta, no un contrato.
//
// Nada se mueve mientras se escoge: todo se aplica al cerrar, de una sola
// movida. Si se aplicara sobre la marcha, salir por la X dejaría el clóset
// revuelto y sin ninguna sesión que lo explique — y abandonar no es cerrar.
function EscogerLaRopa({ cams, onClose }) {
  // Se congela al entrar: si alguien abre el ritual a las 17:59 y lo cierra
  // a las 18:01, las preguntas no pueden cambiarle de día a mitad de camino.
  const [{ dia, cuando }] = useState(() => paraQueDia());
  const [paso, setPaso] = useState(0);
  const [quitadas, setQuitadas] = useState([]);   // de lo puesto, lo que sale
  const [puestas, setPuestas] = useState([]);     // del clóset, lo que entra
  const [notas, setNotas] = useState('');

  // El acto es el mismo en la mañana y en la noche; lo único que cambia es
  // esta palabra, y con ella el día al que apunta.
  const cuandoTxt = cuando === 'hoy' ? 'hoy' : 'mañana';

  const traigoPuesto = cams.filter(estaPuesta);
  const enElCloset = cams.filter(c => !estaPuesta(c));
  // Una camiseta nunca aparece en los dos pasos, y sale gratis: como todavía
  // no se ha movido nada, la que me estoy quitando sigue contando como puesta
  // y por lo tanto no aparece en la lista del clóset.

  const alternar = (lista, set, id) =>
    set(lista.includes(id) ? lista.filter(x => x !== id) : [...lista, id]);

  // Los nombres viajan junto a los ids: dentro de un año el id de una
  // camiseta donada no resuelve, y esta sesión sigue teniendo que poder
  // contar qué se escogió ese día.
  const conNombre = (ids) => ids
    .map(id => cams.find(c => c.id === id))
    .filter(Boolean)
    .map(c => ({ id: c.id, nombre: c.nombre }));

  const cerrar = () => onClose({
    para: dia,
    quitadas: conNombre(quitadas),
    puestas: conNombre(puestas),
    notas: notas.trim(),
  });

  return (<div className="px-6 pt-8 pb-12 max-w-xl mx-auto fade-up">
    <div className="flex items-center justify-between mb-2">
      <span className="smallcaps" style={{ color: 'var(--ink-faint)' }}>La ropa de {cuandoTxt}</span>
      <button onClick={() => onClose(null)} className="ring-ink p-1" style={{ color: 'var(--ink-faint)' }} aria-label="Salir"><X size={18} /></button>
    </div>
    <div className="ff-mono text-xs mb-10" style={{ color: 'var(--ink-faint)' }}>{paso + 1} / 2</div>

    {paso === 0 && (<div className="fade-up">
      <h1 className="display text-4xl mb-2">¿Qué camisetas no voy a vestir {cuandoTxt}?</h1>
      <p className="ff-serif italic mb-8" style={{ color: 'var(--ink-soft)' }}>
        Van al clóset. Quitárselas no es dejar de ser eso: es decir dónde no va la concentración.
      </p>
      {traigoPuesto.length === 0 && (
        <p className="ff-serif italic mb-8" style={{ color: 'var(--ink-faint)' }}>No traes ninguna puesta. Sigue.</p>
      )}
      <div className="mb-8">
        {traigoPuesto.map(c => {
          const sale = quitadas.includes(c.id);
          return (
            <div key={c.id} className="flex items-center gap-3 py-2" style={{ borderBottom: '1px solid var(--line-soft)' }}>
              <span className="text-xl" style={{ opacity: sale ? 0.35 : 1 }}>{c.emoji}</span>
              <span className="flex-1 ff-serif text-lg" style={{
                color: sale ? 'var(--ink-faint)' : 'var(--ink)',
                textDecoration: sale ? 'line-through' : 'none',
              }}>{c.nombre}</span>
              {/* Devolverla es parte de pensar, no corregir un error: el mismo
                  botón la saca y la trae. */}
              <button onClick={() => alternar(quitadas, setQuitadas, c.id)}
                className="ring-ink ff-mono text-xs py-1 px-2"
                style={sale
                  ? { color: 'var(--ink-soft)', border: '1px solid var(--line)' }
                  : { color: 'var(--ink-faint)', border: '1px solid var(--line-soft)' }}
                aria-label={sale ? `Volver a ponerse ${c.nombre}` : `Quitarse ${c.nombre}`}>
                {sale ? 'devolver' : <X size={14} />}
              </button>
            </div>
          );
        })}
      </div>
      <div className="flex justify-end">
        <button onClick={() => setPaso(1)} className="ff-serif px-5 py-2 ring-ink" style={{ border: '1px solid var(--ink)' }}>siguiente →</button>
      </div>
    </div>)}

    {paso === 1 && (<div className="fade-up">
      <h1 className="display text-4xl mb-2">¿Cuáles voy a vestir {cuandoTxt}?</h1>
      <p className="ff-serif italic mb-8" style={{ color: 'var(--ink-soft)' }}>
        Que {cuandoTxt} sea un gran día. Escoge a qué camisetas les vas a enfocar tu atención.
      </p>
      {enElCloset.length === 0 && (
        <p className="ff-serif italic mb-8" style={{ color: 'var(--ink-faint)' }}>El clóset está vacío.</p>
      )}
      <div className="mb-8">
        {enElCloset.map(c => {
          const entra = puestas.includes(c.id);
          return (
            <button key={c.id} onClick={() => alternar(puestas, setPuestas, c.id)}
              className="flex items-center gap-3 py-2 w-full text-left ring-ink"
              style={{ borderBottom: '1px solid var(--line-soft)' }}>
              <span className="w-4 h-4 rounded-sm border flex items-center justify-center check-ani" style={{
                borderColor: entra ? 'var(--moss)' : 'var(--line)',
                background: entra ? 'var(--moss)' : 'transparent',
              }}>{entra && <Check size={10} strokeWidth={3} color="var(--bg)" />}</span>
              <span className="text-xl">{c.emoji}</span>
              <span className="flex-1 ff-serif text-lg" style={{ color: entra ? 'var(--ink)' : 'var(--ink-soft)' }}>{c.nombre}</span>
            </button>
          );
        })}
      </div>

      <div className="hr-deco mb-6" />
      {/* La reflexión del diario: contestable en un respiro y sin respuesta
          equivocada. No es un quiz y no exige que haya pasado nada. */}
      <label className="smallcaps block mb-3" style={{ color: 'var(--ink-faint)' }}>¿Qué movió el día?</label>
      <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={3} placeholder="Una línea. La que importe." className="w-full ff-serif text-base p-3 ring-ink resize-none italic" style={{ border: '1px solid var(--line)', background: 'var(--bg-card)' }} />

      <div className="flex justify-between mt-8">
        <button onClick={() => setPaso(0)} className="ff-mono text-xs ring-ink px-3 py-2" style={{ color: 'var(--ink-faint)' }}>← atrás</button>
        <button onClick={cerrar} className="ff-serif px-6 py-2 ring-ink" style={{ background: 'var(--ink)', color: 'var(--bg)' }}>
          {puestas.length > 0 ? 'ponérmelas' : 'dejar lista la ropa'}
        </button>
      </div>
    </div>)}
  </div>);
}

// ── El costurero ─────────────────────────────────────────────────────────
//
// El ritual semanal. Aquí se escribe el juego: misiones nuevas, dificultad
// arriba y abajo, lo que ya cumplió su ciclo. Su producto no es una
// reflexión — es que el hacedor de la semana entrante encuentre trabajo
// listo.
//
// La línea con el ritual diario: **el diario escoge, el costurero escribe.**
// El diario saca de lo que ya existe; el costurero decide qué debería
// existir. Si el diario empezara a crear, el costurero se quedaría sin
// oficio y el diario dejaría de ser corto.
//
// Antes esto era un carrusel: N pasos, uno por camiseta, en el orden en que
// estuvieran. Con veinte camisetas eso es un trámite, y un trámite se
// abandona a la mitad. Ahora se entra escogiendo cuál revisar y al terminar
// se puede revisar otra. Uno siempre escoge la camiseta viva, así que la
// lista muestra cuáles no se tocan hace rato y cuáles se quedaron sin nada
// que hacer — sin forzar a nadie: que escoja informado. La lista va en dos
// grupos, lo puesto hoy primero y el clóset debajo, porque reconocer el
// propio día es más barato que leer veinte nombres en desorden.
function SesionCosturero({ cams, señales, onArchiveMision, onEditMision, onAddMision,
                           onAjustarDificultad, onCambiarForma, onToggleMilestone, onClose }) {
  const [paso, setPaso] = useState('escoger');   // escoger | revisar | cerrar
  const [camId, setCamId] = useState(null);
  const [revisadas, setRevisadas] = useState([]);
  const [nuevas, setNuevas] = useState({});
  const [calientes, setCalientes] = useState([]);
  const [frias, setFrias] = useState([]);
  const [notas, setNotas] = useState('');
  // Una pregunta del banco, la misma toda la semana. Contestarla es opcional:
  // el costurero es donde se escribe el juego, no un cuestionario.
  const [pregunta] = useState(() => preguntaDelCosturero());

  const cam = cams.find(c => c.id === camId) || null;

  // Las misiones escritas aquí se siembran al cerrar, no al teclearlas: si se
  // sale por la X no queda media camiseta escrita a medias.
  const sembrar = () => {
    Object.entries(nuevas).forEach(([id, lista]) => {
      (lista || []).forEach(m => {
        if (m?.nombre?.trim()) onAddMision(id, {
          nombre: m.nombre.trim(), forma: m.forma || 'dificil',
          tonos: m.tonos || [], puntos_base: m.puntos_base,
        });
      });
    });
  };
  const terminar = () => {
    sembrar();
    const conNombre = (ids) => ids
      .map(id => cams.find(c => c.id === id))
      .filter(Boolean)
      .map(c => ({ id: c.id, nombre: c.nombre, emoji: c.emoji }));
    onClose({
      notas: notas.trim(),
      pregunta: pregunta.titulo,
      // Nombres congelados al escribir: el id de una camiseta donada deja de
      // resolver, y esta sesión tiene que poder contarse dentro de un año.
      calientes: conNombre(calientes),
      frias: conNombre(frias),
      completa: true,
    });
  };

  const abrir = (id) => { setCamId(id); setPaso('revisar'); };
  const volverALaLista = () => {
    setRevisadas(revisadas.includes(camId) ? revisadas : [...revisadas, camId]);
    setCamId(null);
    setPaso('escoger');
  };

  return (<div className="px-6 pt-8 pb-12 max-w-xl mx-auto fade-up">
    <div className="flex items-center justify-between mb-8">
      <span className="smallcaps" style={{ color: 'var(--ink-faint)' }}>El costurero</span>
      <button onClick={() => onClose(null)} className="ring-ink p-1" style={{ color: 'var(--ink-faint)' }} aria-label="Salir"><X size={18} /></button>
    </div>

    {paso === 'escoger' && (<div className="fade-up">
      <h1 className="display text-4xl mb-2">¿Qué camiseta vas a remendar?</h1>
      <p className="ff-serif italic mb-8" style={{ color: 'var(--ink-soft)' }}>
        Una a la vez. Al terminar puedes seguir con otra.
      </p>
      {cams.length === 0 && (
        <p className="ff-serif italic mb-8" style={{ color: 'var(--ink-faint)' }}>Todavía no hay camisetas que coser.</p>
      )}
      {/* Dos grupos, no una lista plana: lo primero que uno reconoce al entrar
          es lo que trae puesto hoy, y por ahí arranca a coser. Pero el resto
          del clóset queda justo abajo, visible y a un clic — el costurero
          tiene que poder verlo entero (la frontera de v10 en
          docs/rituales-construido.md: ya se rompió una vez por mostrar solo
          lo puesto), así que este segundo grupo no se pliega ni se esconde
          detrás de un paso. Es orden, no filtro. */}
      <div className="mb-8">
        {[
          { titulo: 'lo que traigo puesto', lista: cams.filter(estaPuesta) },
          { titulo: 'en el clóset', lista: cams.filter(c => !estaPuesta(c)) },
        ].filter(g => g.lista.length > 0).map(g => (
          <div key={g.titulo} className="mb-6">
            <span className="smallcaps block mb-1" style={{ color: 'var(--ink-faint)' }}>{g.titulo}</span>
            {g.lista.map(c => {
              const s = señales[c.id] || {};
              const ya = revisadas.includes(c.id);
              return (
                <button key={c.id} onClick={() => abrir(c.id)}
                  className="flex items-center gap-3 py-3 w-full text-left ring-ink"
                  style={{ borderBottom: '1px solid var(--line-soft)' }}>
                  <span className="text-xl" style={{ opacity: ya ? 0.4 : 1 }}>{c.emoji}</span>
                  <span className="flex-1">
                    <span className="ff-serif text-lg block" style={{ color: ya ? 'var(--ink-faint)' : 'var(--ink)' }}>{c.nombre}</span>
                    {/* Las señales hablan de la camiseta, nunca del usuario. "Sin
                        misiones" es la más útil que produce el sistema: el diario
                        la marca, el costurero la resuelve. */}
                    {!ya && s.sinMisiones && (
                      <span className="ff-mono text-xs" style={{ color: 'var(--accent)' }}>sin misiones que hacer</span>
                    )}
                    {!ya && !s.sinMisiones && s.dormida && (
                      <span className="ff-mono text-xs" style={{ color: 'var(--ink-faint)' }}>hace rato no se juega</span>
                    )}
                    {ya && <span className="ff-mono text-xs" style={{ color: 'var(--moss)' }}>revisada</span>}
                  </span>
                  <ChevronRight size={16} style={{ color: 'var(--ink-faint)' }} />
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <button onClick={() => setPaso('cerrar')} className="ff-serif px-5 py-2 ring-ink" style={{ border: '1px solid var(--ink)' }}>
          {revisadas.length > 0 ? 'terminar →' : 'no coso hoy →'}
        </button>
      </div>
    </div>)}

    {paso === 'revisar' && cam && (() => {
      const activas = cam.misiones.filter(m => enJuego(m));
      const pendientes = (cam.milestones || []).filter(ms => ms.estado === 'pendiente');
      const drafts = nuevas[cam.id] || [];
      const setDrafts = (lista) => setNuevas({ ...nuevas, [cam.id]: lista });
      const updateDraft = (i, patch) => setDrafts(drafts.map((d, j) => j === i ? { ...d, ...patch } : d));
      const removeDraft = (i) => setDrafts(drafts.filter((_, j) => j !== i));
      const visibles = drafts.length === 0 ? [{ nombre: '', forma: 'dificil', tonos: [] }] : drafts;
      const ultimaTieneNombre = visibles[visibles.length - 1]?.nombre?.trim();
      return (<div className="fade-up">
        <div className="text-4xl mb-2">{cam.emoji}</div>
        <h2 className="display text-3xl mb-2">{cam.nombre}</h2>
        <p className="ff-serif italic mb-6" style={{ color: 'var(--ink-soft)' }}>Cada misión: ¿sigue viva, le subes o le bajas la dificultad, o ya cumplió su ciclo?</p>
        <div className="space-y-2 mb-6">
          {activas.length === 0 && <p className="ff-serif italic text-sm" style={{ color: 'var(--ink-faint)' }}>Sin misiones activas. Escríbele una abajo.</p>}
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
          <button onClick={() => { const base = drafts.length === 0 ? visibles : drafts; setDrafts([...base, { nombre: '', forma: 'dificil', tonos: [] }]); }}
            className="ring-ink ff-mono text-xs py-1 px-3 mb-3 flex items-center gap-1"
            style={{ color: 'var(--accent)', border: '1px solid var(--accent-soft)' }}>
            <Plus size={12} /> añadir otra
          </button>
        )}

        {/* Los hitos van al final y plegados: chulear uno aquí es recuperar el
            que se te pasó, no el camino principal. Completar un hito tiene su
            propio momento —compartirlo, cobrar el regalo—, y chulear cinco de
            corrido convierte ese momento en contabilidad. */}
        {pendientes.length > 0 && (<details className="mt-6">
          <summary className="smallcaps cursor-pointer" style={{ color: 'var(--ink-faint)' }}>¿se te pasó algún hito?</summary>
          <div className="mt-3 space-y-1">
            {pendientes.map(ms => (
              <div key={ms.id} className="flex items-center gap-3 py-1">
                <span className="flex-1 ff-serif text-sm" style={{ color: 'var(--ink-soft)' }}>{ms.nombre}</span>
                <button onClick={() => onToggleMilestone(cam.id, ms.id)}
                  className="ring-ink ff-mono text-xs px-2 py-1"
                  style={{ color: 'var(--gold)', border: '1px solid var(--line)' }}>alcanzado</button>
              </div>
            ))}
          </div>
        </details>)}

        <div className="flex justify-between mt-8">
          <button onClick={volverALaLista} className="ff-mono text-xs ring-ink px-3 py-2" style={{ color: 'var(--ink-faint)' }}>← otra camiseta</button>
          <button onClick={() => { volverALaLista(); }} className="ff-serif px-5 py-2 ring-ink" style={{ border: '1px solid var(--ink)' }}>listo con esta →</button>
        </div>
      </div>);
    })()}

    {paso === 'cerrar' && (<div className="fade-up">
      <h2 className="display text-3xl mb-2">La temperatura.</h2>
      <p className="ff-serif italic mb-8" style={{ color: 'var(--ink-soft)' }}>¿Cuáles estuvieron calientes esta semana? ¿Cuáles frías? Pueden ser varias, o ninguna.</p>
      <ChipsCam label="calientes" icon={Flame} cams={cams} valores={calientes}
        onToggle={(id) => {
          // Una camiseta no puede estar caliente y fría la misma semana: si
          // entra a una lista, sale de la otra.
          setFrias(frias.filter(x => x !== id));
          setCalientes(calientes.includes(id) ? calientes.filter(x => x !== id) : [...calientes, id]);
        }} accent="var(--accent)" />
      <ChipsCam label="frías" icon={Snowflake} cams={cams} valores={frias}
        onToggle={(id) => {
          setCalientes(calientes.filter(x => x !== id));
          setFrias(frias.includes(id) ? frias.filter(x => x !== id) : [...frias, id]);
        }} accent="var(--ocean)" />
      <div className="hr-deco mb-5" />
      {/* "¿Hacia dónde va este trabajo?" se retiró: con veinte camisetas
          encima nadie sabe a cuál trabajo se refiere, y una pregunta que hay
          que descifrar antes de contestarla no se contesta. El banco es
          concreto y la misma pregunta dura toda la semana. */}
      <label className="smallcaps block mb-3" style={{ color: 'var(--ink-faint)' }}>{pregunta.titulo}</label>
      {pregunta.ayuda && (
        <p className="ff-serif italic text-sm mb-3" style={{ color: 'var(--ink-faint)' }}>{pregunta.ayuda}</p>
      )}
      <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={4} placeholder="…" className="w-full ff-serif text-base p-3 ring-ink resize-none italic" style={{ border: '1px solid var(--line)', background: 'var(--bg-card)' }} />
      <div className="flex justify-between mt-8">
        <button onClick={() => setPaso('escoger')} className="ff-mono text-xs ring-ink px-3 py-2" style={{ color: 'var(--ink-faint)' }}>← atrás</button>
        <button onClick={terminar} className="ff-serif px-6 py-2 ring-ink" style={{ background: 'var(--ink)', color: 'var(--bg)' }}>cerrar el costurero</button>
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

// Selección múltiple: una semana puede tener varias calientes y varias frías,
// y obligar a escoger una sola era pedirle al usuario que resumiera de más.
// `valores` es una lista de ids; tocar una chip la mete o la saca.
function ChipsCam({ label, icon: Icon, cams, valores, onToggle, accent }) {
  return (<div className="mb-6">
    <label className="smallcaps mb-3 flex items-center gap-2" style={{ color: 'var(--ink-faint)' }}>
      {Icon && <Icon size={12} strokeWidth={1.5} />}{label}
    </label>
    <div className="flex flex-wrap gap-2">
      {cams.map(c => {
        const puesta = valores.includes(c.id);
        return (
          <button key={c.id} onClick={() => onToggle(c.id)} className="ff-serif px-3 py-1.5 ring-ink" style={{
            background: puesta ? accent : 'transparent',
            color: puesta ? 'var(--bg)' : 'var(--ink)',
            border: '1px solid ' + (puesta ? accent : 'var(--line)'),
          }}><span className="mr-1">{c.emoji}</span>{c.nombre}</button>
        );
      })}
    </div>
  </div>);
}

function NavButtons({ onBack, onNext }) {
  return (<div className="flex justify-between mt-8">
    {onBack ? <button onClick={onBack} className="ff-mono text-xs ring-ink px-3 py-2" style={{ color: 'var(--ink-faint)' }}>← atrás</button> : <div />}
    <button onClick={onNext} className="ff-serif px-5 py-2 ring-ink" style={{ border: '1px solid var(--ink)' }}>siguiente →</button>
  </div>);
}

// ── El observador del observador ─────────────────────────────────────────
//
// El ritual mensual. La única sesión que puede desconfiar de las otras dos:
// no mira el trabajo, mira los instrumentos con que el jefe mide el trabajo.
//
// Dos pantallas y nada más:
//   1. Un hallazgo, uno solo, convertido en pregunta. Los cálculos viven en
//      `src/observador/`; aquí solo se muestra el que ganó.
//   2. La pregunta difícil del mes, la que no cabe en ninguna otra silla.
//
// Lo que se fue de aquí, y por qué:
//   · **Archivar y donar.** Donar ya se puede desde cualquier camiseta en
//     cualquier momento. Un ritual mensual que solo despide no está mirando
//     al jefe: está sacando basura. Además, el camino de acá era un
//     `confirm()` del navegador que se saltaba el ritual de despedida.
//   · **El tablero.** Nunca existió y no va a existir: doce gráficas
//     convierten la introspección en navegar datos, que es la versión
//     analítica del juego de organizar.
function SesionObservador({ state, ultimaClave, onClose }) {
  // Se calcula una vez al entrar. Si se recalculara en cada render, contestar
  // la pregunta podría cambiar la pregunta.
  const [hallazgo] = useState(() => mirar(state, { ultimaClave }));
  const [paso, setPaso] = useState(0);
  const [respuesta, setRespuesta] = useState('');
  const [respuestas, setRespuestas] = useState({});   // titulo -> texto

  // El hallazgo, si lo hay, y después todas las difíciles. No una por mes:
  // esta es la sesión que se agenda para sentarse un rato, y mostrar una sola
  // convertía media hora reservada en tres minutos.
  const pantallas = [
    ...(hallazgo ? [{ tipo: 'hallazgo' }] : []),
    ...PREGUNTAS_DIFICILES.map(p => ({ tipo: 'dificil', p })),
  ];
  const actual = pantallas[paso];
  const ultima = paso === pantallas.length - 1;

  const terminar = (respuestasFinales) => {
    const rs = respuestasFinales || respuestas;
    const contestadas = Object.entries(rs)
      .map(([pregunta, texto]) => ({ pregunta, respuesta: texto.trim() }))
      .filter(r => r.respuesta);
    onClose({
      completa: true,
      hallazgo: hallazgo?.clave ?? null,
      respuestas: contestadas,
      // La nota de la historia son sus palabras, sin resumir ni interpretar.
      notas: contestadas.map(r => `${r.pregunta} → ${r.respuesta}`).join(' · '),
    });
  };

  // Guardar lo escrito y seguir. Pasar es exactamente lo mismo sin guardar:
  // contestar ninguna es una sesión válida, y sin esa salida doce preguntas
  // serían un formulario.
  const avanzar = (guardando) => {
    const rs = guardando && respuesta.trim()
      ? { ...respuestas, [actual.p.titulo]: respuesta }
      : respuestas;
    if (guardando) setRespuestas(rs);
    setRespuesta('');
    if (ultima) terminar(rs); else setPaso(paso + 1);
  };

  return (<div className="px-6 pt-8 pb-12 max-w-xl mx-auto fade-up">
    <div className="flex items-center justify-between mb-2">
      <span className="smallcaps" style={{ color: 'var(--ink-faint)' }}>{TEXTOS_OBSERVADOR.titulo}</span>
      <button onClick={() => onClose(null)} className="ring-ink p-1" style={{ color: 'var(--ink-faint)' }} aria-label="Salir"><X size={18} /></button>
    </div>
    <div className="ff-mono text-xs mb-10" style={{ color: 'var(--ink-faint)' }}>{paso + 1} / {pantallas.length}</div>

    {actual?.tipo === 'hallazgo' && (<div className="fade-up" key="hallazgo">
      <div className="smallcaps mb-3" style={{ color: 'var(--violeta-luz)' }}>{TEXTOS_OBSERVADOR.etiquetaHallazgo}</div>
      <h1 className="display text-3xl mb-3">{hallazgo.pregunta}</h1>
      <p className="ff-serif mb-8" style={{ color: 'var(--ink-soft)' }}>{hallazgo.cuerpo}</p>
      <p className="ff-serif italic text-sm mb-3" style={{ color: 'var(--ink-faint)' }}>{TEXTOS_OBSERVADOR.respuestaLibre}</p>
      <textarea value={respuesta} onChange={e => setRespuesta(e.target.value)} rows={4} autoFocus placeholder="…" className="w-full ff-serif text-base p-3 ring-ink resize-none italic" style={{ border: '1px solid var(--line)', background: 'var(--bg-card)' }} />
      <div className="flex justify-between items-center mt-8">
        <button onClick={() => { const t = respuesta.trim(); setRespuestas(t ? { ...respuestas, [hallazgo.pregunta]: respuesta } : respuestas); setRespuesta(''); setPaso(paso + 1); }}
          className="ff-mono text-xs ring-ink px-3 py-2" style={{ color: 'var(--ink-faint)' }}>pasar →</button>
        <button onClick={() => { const t = respuesta.trim(); setRespuestas(t ? { ...respuestas, [hallazgo.pregunta]: respuesta } : respuestas); setRespuesta(''); setPaso(paso + 1); }}
          className="ff-serif px-5 py-2 ring-ink" style={{ border: '1px solid var(--ink)' }}>siguiente →</button>
      </div>
    </div>)}

    {actual?.tipo === 'dificil' && (<div className="fade-up" key={actual.p.titulo}>
      {paso === 0 && !hallazgo && (
        // Sin material no se fabrica un hallazgo. Se dice y se sigue.
        <p className="ff-serif italic mb-8" style={{ color: 'var(--ink-faint)' }}>{TEXTOS_OBSERVADOR.sinMaterial.cuerpo}</p>
      )}
      <h1 className="display text-3xl mb-3">{actual.p.titulo}</h1>
      <p className="ff-serif italic mb-8" style={{ color: 'var(--ink-soft)' }}>{actual.p.ayuda}</p>
      <textarea value={respuesta} onChange={e => setRespuesta(e.target.value)} rows={5} autoFocus placeholder="(opcional)" className="w-full ff-serif text-base p-3 ring-ink resize-none italic" style={{ border: '1px solid var(--line)', background: 'var(--bg-card)' }} />
      <div className="flex justify-between items-center mt-8">
        <button onClick={() => avanzar(false)} className="ff-mono text-xs ring-ink px-3 py-2" style={{ color: 'var(--ink-faint)' }}>
          {ultima ? 'cerrar sin contestar' : 'pasar →'}
        </button>
        <button onClick={() => avanzar(true)} className="ff-serif px-5 py-2 ring-ink"
          style={ultima ? { background: 'var(--ink)', color: 'var(--bg)' } : { border: '1px solid var(--ink)' }}>
          {ultima ? TEXTOS_OBSERVADOR.cerrar : 'siguiente →'}
        </button>
      </div>
      {/* Salir a mitad de camino sin perder lo ya escrito. La sesión es larga
          a propósito, pero larga no puede querer decir todo o nada. */}
      {paso > 0 && (
        <div className="mt-8 text-center">
          <button onClick={() => terminar()} className="ff-mono text-xs ring-ink" style={{ color: 'var(--ink-faint)' }}>
            terminar aquí
          </button>
        </div>
      )}
    </div>)}
  </div>);
}
