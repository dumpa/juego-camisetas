import { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, Check, X, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Archive, RotateCcw, Edit2, Minus, Sun, Hexagon, BookOpen, Flame, Snowflake, Share2, Download, Copy, Inbox, Upload, AlertTriangle, Trash2, Filter } from 'lucide-react';
import { encodeCamisetaToPng, generateCamisetaSVG, decodeImageToCamiseta } from './codec/index.js';

const STATE_KEY = 'juego-camisetas:state:v1';
const DAY = 86400000;

const emptyState = {
  user_id: 'local', version: 5, created_at: new Date().toISOString(),
  camisetas: [], sesiones: [], eventos: [], movimientos: [],
};

async function loadState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return migrate(parsed);
    }
  } catch (e) {
    console.error('loadState error:', e);
  }
  return emptyState;
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
    rapida: { forma: 'rapida', tonos: [] },
    habito: { forma: 'recurrente', tonos: [] },
    profunda: { forma: 'unica', tonos: ['profunda'] },
    fisica: { forma: 'unica', tonos: ['fisica'] },
    emocional: { forma: 'unica', tonos: ['emocional'] },
    creativa: { forma: 'unica', tonos: ['creativa'] },
    estrategica: { forma: 'unica', tonos: ['estrategica'] },
  };
  const pd = { unica: 3, rapida: 1, recurrente: 2 };
  s.camisetas?.forEach(cam => {
    // v4: campos de propiedad/origen para preparar mercado
    if (!cam.creador_id) cam.creador_id = s.user_id;
    if (!cam.origen) cam.origen = 'propia';
    if (cam.origen_camiseta_id === undefined) cam.origen_camiseta_id = null;
    if (cam.precio === undefined) cam.precio = null;
    cam.misiones?.forEach(m => {
      if (!m.forma) {
        const mapped = tipoMap[m.tipo] || { forma: 'unica', tonos: [] };
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
  s.version = 5;
  return s;
}

const uid = () => Math.random().toString(36).slice(2, 11);
const nowISO = () => new Date().toISOString();

const FORMAS = [
  { id: 'unica',      label: 'única',      hint: 'una vez y ya',      puntosBase: 3, glyph: '◇' },
  { id: 'rapida',     label: 'rápida',     hint: 'minutos, ya',       puntosBase: 1, glyph: '·' },
  { id: 'recurrente', label: 'recurrente', hint: 'hábito que vuelve', puntosBase: 2, glyph: '⟳' },
];
const TONOS = [
  { id: 'profunda',    label: 'profunda' },
  { id: 'fisica',      label: 'física' },
  { id: 'emocional',   label: 'emocional' },
  { id: 'creativa',    label: 'creativa' },
  { id: 'estrategica', label: 'estratégica' },
];
const SUGERENCIAS_EMOJI = ['🧭','⚓','🎭','🌱','🪶','🔥','🗺️','🦴','🪞','🎯','🪐','🪨','🌊','🏛️','📜','🜃'];

// Catálogo curado por Dumpa. Estas son las camisetas pre-establecidas que un nuevo
// usuario puede "comprar" para empezar a jugar sin tener que construir desde cero.
// La primera (Curiosidad) es gratis: es el regalo de bienvenida.
const CATALOGO = [
  {
    id: 'curiosidad-v1',
    nombre: 'Curiosidad',
    emoji: '🌱',
    esencia: 'Con la curiosidad descubro el mundo.',
    arco: null,
    precio: 0,
    creador_id: 'dumpa',
    misiones: [
      { nombre: 'Saltar sobre algo',                       forma: 'rapida',     tonos: ['fisica'],            puntos_base: 1 },
      { nombre: 'Pasar por debajo de algo',                forma: 'rapida',     tonos: ['fisica'],            puntos_base: 1 },
      { nombre: 'Encontrar un portal',                     forma: 'unica',      tonos: ['creativa','emocional'], puntos_base: 3 },
      { nombre: 'Meterse a un río o lago',                 forma: 'unica',      tonos: ['fisica','emocional'], puntos_base: 3 },
      { nombre: 'Probar algo que nunca has probado',       forma: 'unica',      tonos: ['creativa'],          puntos_base: 2 },
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
      { nombre: 'Hacer algo y dárselo a alguien',          forma: 'unica',      tonos: ['creativa','emocional'], puntos_base: 3 },
      { nombre: 'Combinar dos cosas que no van juntas',    forma: 'rapida',     tonos: ['creativa'],          puntos_base: 1 },
      { nombre: 'Crear algo efímero (menos de un día)',    forma: 'unica',      tonos: ['creativa'],          puntos_base: 2 },
      { nombre: 'Cambiar algo de tu entorno',              forma: 'rapida',     tonos: ['creativa'],          puntos_base: 1 },
      { nombre: 'Solución absurda primero',                forma: 'recurrente', tonos: ['creativa','estrategica'], puntos_base: 2 },
      { nombre: 'Hacer algo sin ninguna utilidad',         forma: 'recurrente', tonos: ['creativa'],          puntos_base: 2 },
    ],
    milestones: [],
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
function completionsEsteMes(m) {
  const l = Date.now() - 30 * DAY;
  return m.completions.filter(c => new Date(c).getTime() > l).length;
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

  useEffect(() => { loadState().then(setState); }, []);
  useEffect(() => {
    if (!state) return;
    saveState(state).then(ok => {
      if (!ok && !state._saveError) setState(s => ({ ...s, _saveError: true }));
    });
  }, [state]);

  const update = (mut) => setState(prev => { const n = structuredClone(prev); mut(n); return n; });
  const pushEv = (s, ev) => { s.eventos.push({ id: uid(), ts: nowISO(), ...ev }); };
  const pushMov = (s, mov) => { s.movimientos.push({ id: uid(), ts: nowISO(), ...mov }); };

  const addCamiseta = (data) => update(s => {
    const id = uid();
    s.camisetas.push({ id, ...data, creador_id: s.user_id, origen: 'propia', origen_camiseta_id: null, precio: null, created_at: nowISO(), archived_at: null, misiones: [], milestones: [] });
    pushEv(s, { tipo: 'camiseta_creada', cam_id: id, nombre: data.nombre, emoji: data.emoji });
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
        created_at: nowISO(), archived_at: null,
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
  const archiveCamiseta = (id) => update(s => {
    const c = s.camisetas.find(c => c.id === id);
    if (c) { c.archived_at = nowISO(); pushEv(s, { tipo: 'camiseta_retirada', cam_id: id, nombre: c.nombre }); }
  });
  const reviveCamiseta = (id) => update(s => {
    const c = s.camisetas.find(c => c.id === id);
    if (c) { c.archived_at = null; pushEv(s, { tipo: 'camiseta_recuperada', cam_id: id, nombre: c.nombre }); }
  });
  const editCamiseta = (id, data) => update(s => {
    const c = s.camisetas.find(c => c.id === id);
    if (!c) return;
    Object.assign(c, data);
    pushEv(s, { tipo: 'camiseta_editada', cam_id: id, nombre: c.nombre });
  });
  const addMision = (camId, data) => update(s => {
    const c = s.camisetas.find(c => c.id === camId);
    if (!c) return;
    const pb = data.puntos_base ?? FORMAS.find(f => f.id === data.forma)?.puntosBase ?? 1;
    const id = uid();
    c.misiones.push({
      id, nombre: data.nombre, forma: data.forma || 'unica', tonos: data.tonos || [],
      puntos_base: pb, estado: 'activa', created_at: nowISO(),
      completed_at: null, archived_at: null, completions: [],
      autor_id: s.user_id, asignada_por: null,
    });
    pushEv(s, { tipo: 'mision_creada', cam_id: camId, mision_id: id, nombre: data.nombre });
  });
  const editMision = (camId, misId, data) => update(s => {
    const m = s.camisetas.find(c => c.id === camId)?.misiones.find(m => m.id === misId);
    if (!m) return;
    Object.assign(m, data);
    pushEv(s, { tipo: 'mision_editada', cam_id: camId, mision_id: misId, nombre: m.nombre });
  });
  const toggleMision = (camId, misId) => update(s => {
    const c = s.camisetas.find(c => c.id === camId);
    const m = c?.misiones.find(m => m.id === misId);
    if (!m) return;
    if (m.forma === 'recurrente') {
      const u = m.completions[m.completions.length - 1];
      if (u && Date.now() - new Date(u).getTime() < DAY) {
        m.completions.pop();
        // eliminar último movimiento de esta misión
        for (let i = s.movimientos.length - 1; i >= 0; i--) {
          if (s.movimientos[i].mision_id === misId && s.movimientos[i].tipo === 'mision_completada') {
            s.movimientos.splice(i, 1); break;
          }
        }
      } else {
        m.completions.push(nowISO());
        const monto = puntos(m);
        pushMov(s, { tipo: 'mision_completada', cam_id: camId, mision_id: misId, monto });
        pushEv(s, { tipo: 'mision_completada', cam_id: camId, mision_id: misId, nombre: m.nombre, puntos: monto });
      }
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
      }
    }
  });
  const archiveMision = (camId, misId) => update(s => {
    const m = s.camisetas.find(c => c.id === camId)?.misiones.find(m => m.id === misId);
    if (m) { m.estado = 'archivada'; m.archived_at = nowISO(); pushEv(s, { tipo: 'mision_archivada', cam_id: camId, mision_id: misId, nombre: m.nombre }); }
  });
  const reviveMision = (camId, misId) => update(s => {
    const m = s.camisetas.find(c => c.id === camId)?.misiones.find(m => m.id === misId);
    if (m) { m.estado = 'activa'; m.archived_at = null; m.completed_at = null; }
  });
  const ajustarDif = (camId, misId, d) => update(s => {
    const m = s.camisetas.find(c => c.id === camId)?.misiones.find(m => m.id === misId);
    if (m) m.puntos_base = Math.max(1, Math.min(10, (m.puntos_base || 1) + d));
  });
  const cambiarForma = (camId, misId, forma) => update(s => {
    const m = s.camisetas.find(c => c.id === camId)?.misiones.find(m => m.id === misId);
    if (m) { m.forma = forma; if (forma === 'recurrente' && m.estado === 'hecha') { m.estado = 'activa'; m.completed_at = null; } }
  });
  const addMilestone = (camId, data) => update(s => {
    const c = s.camisetas.find(c => c.id === camId);
    if (c) {
      const id = uid();
      c.milestones.push({ id, ...data, estado: 'pendiente', created_at: nowISO(), achieved_at: null });
      pushEv(s, { tipo: 'milestone_creado', cam_id: camId, ms_id: id, nombre: data.nombre });
    }
  });
  const toggleMilestone = (camId, msId) => update(s => {
    const ms = s.camisetas.find(c => c.id === camId)?.milestones.find(m => m.id === msId);
    if (!ms) return;
    if (ms.estado === 'pendiente') { ms.estado = 'logrado'; ms.achieved_at = nowISO(); pushEv(s, { tipo: 'milestone_logrado', cam_id: camId, ms_id: msId, nombre: ms.nombre, regalo: ms.regalo }); }
    else if (ms.estado === 'logrado') { ms.estado = 'pendiente'; ms.achieved_at = null; }
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
    Object.assign(ms, data);
    pushEv(s, { tipo: 'milestone_editado', cam_id: camId, ms_id: msId, nombre: ms.nombre });
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
    pushEv(s, { ...data, tipo: `sesion_${data.tipo}`, sesion_id: id, notas: data.notas });
  });

  if (!state) return <Loading />;
  const camsActivas = state.camisetas.filter(c => !c.archived_at);
  const puntosUser = puntosTotales(state.movimientos);

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
      yaTenida={state.camisetas.some(c => c.origen_camiseta_id === cat.id && !c.archived_at)}
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
    return <Frame><CamisetaDetail cam={cam} onBack={() => setOpenCam(null)}
      onAddMision={(m) => addMision(cam.id, m)}
      onEditMision={(id, d) => editMision(cam.id, id, d)}
      onToggle={(id) => toggleMision(cam.id, id)}
      onArchive={(id) => archiveMision(cam.id, id)}
      onRevive={(id) => reviveMision(cam.id, id)}
      onAddMilestone={(m) => addMilestone(cam.id, m)}
      onToggleMilestone={(id) => toggleMilestone(cam.id, id)}
      onCobrarMilestone={(id) => cobrarMilestone(cam.id, id)}
      onEditMilestone={(id, d) => editMilestone(cam.id, id, d)}
      onEditCam={(d) => editCamiseta(cam.id, d)}
      onReviveCam={() => reviveCamiseta(cam.id)}
      onArchiveCam={() => { archiveCamiseta(cam.id); setOpenCam(null); }} /></Frame>;
  }
  if (sesion === 'diaria') return <Frame><SesionDiaria cams={camsActivas} onToggle={toggleMision} onArchive={archiveMision}
    onClose={(n) => { if (n) logSesion({ tipo: 'diaria', notas: n }); setSesion(null); }} /></Frame>;
  if (sesion === 'semanal') return <Frame><SesionSemanal cams={camsActivas}
    onArchiveMision={archiveMision} onEditMision={editMision} onAddMision={addMision}
    onAjustarDificultad={ajustarDif} onCambiarForma={cambiarForma}
    onClose={(p) => { logSesion({ tipo: 'semanal', ...p }); setSesion(null); }} /></Frame>;
  if (sesion === 'mensual') return <Frame><SesionMensual cams={state.camisetas}
    onArchiveCam={archiveCamiseta} onReviveCam={reviveCamiseta}
    onCreateCam={() => { setSesion(null); setShowCreate(true); }}
    onClose={(p) => { logSesion({ tipo: 'mensual', ...p }); setSesion(null); }} /></Frame>;

  return (<Frame><Header puntos={puntosUser} warn={state._saveError} />
    <main className="px-5 pb-32 pt-2 max-w-2xl mx-auto">
      {tab === 'hoy' && <HoyView cams={camsActivas} movimientos={state.movimientos} onToggle={toggleMision} onOpen={setOpenCam} />}
      {tab === 'camisetas' && <CamisetasView cams={state.camisetas} movimientos={state.movimientos} onOpen={setOpenCam} onCreate={() => setShowCreate(true)} onOpenCatalogo={() => setShowCatalogo(true)} onImport={() => setShowImport(true)} onReorder={reorderCamiseta} />}
      {tab === 'diario' && <DiarioView state={state} onStart={setSesion} />}
    </main>
    <TabBar tab={tab} setTab={setTab} />
  </Frame>);
}

function Frame({ children }) {
  return (
    <div className="min-h-screen w-full" style={{ background: 'var(--bg)', color: 'var(--ink)' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300..700&family=JetBrains+Mono:wght@400;500&display=swap');
        :root {
          --bg: #F2EBDD; --bg-card: #EBE2D0;
          --ink: #1C1813; --ink-soft: #5C5147; --ink-faint: #8A7E70;
          --line: #C9BCA6; --line-soft: #D9CFBC;
          --accent: #8B2D1C; --accent-soft: #B5614E;
          --ocean: #2D4A6B; --moss: #5C7048; --gold: #A07E2B; --warm: #C77A3A;
          --grain: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3CfeColorMatrix values='0 0 0 0 0.11, 0 0 0 0 0.09, 0 0 0 0 0.07, 0 0 0 0.08 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
        }
        body { font-family: 'Fraunces', Georgia, serif; }
        .ff-serif { font-family: 'Fraunces', Georgia, serif; }
        .ff-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
        .grain::before { content: ''; position: fixed; inset: 0; pointer-events: none; background-image: var(--grain); opacity: 0.5; mix-blend-mode: multiply; z-index: 100; }
        .display { font-variation-settings: 'opsz' 144, 'SOFT' 50; font-weight: 350; letter-spacing: -0.02em; }
        .smallcaps { text-transform: uppercase; letter-spacing: 0.16em; font-size: 0.7rem; font-weight: 500; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        .fade-up { animation: fadeUp 0.4s ease both; }
        .fade-up-d1 { animation: fadeUp 0.4s ease both 0.08s; opacity: 0; }
        .fade-up-d2 { animation: fadeUp 0.4s ease both 0.16s; opacity: 0; }
        .fade-up-d3 { animation: fadeUp 0.4s ease both 0.24s; opacity: 0; }
        .ring-ink:focus { outline: 2px solid var(--ink); outline-offset: 2px; }
        .check-ani { transition: all 0.25s cubic-bezier(.34,1.6,.6,1); }
        .hr-deco { background-image: radial-gradient(circle, var(--line) 1px, transparent 1.5px); background-size: 8px 8px; background-repeat: repeat-x; background-position: center; height: 8px; }
        textarea, input { background: transparent; }
        details summary::-webkit-details-marker { display: none; }
      `}</style>
      <div className="grain" />
      {children}
    </div>
  );
}

function Loading() { return <div className="min-h-screen flex items-center justify-center" style={{ background: '#F2EBDD' }}><span className="ff-mono text-sm" style={{ color: '#8A7E70' }}>cargando…</span></div>; }

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
  return (<nav className="fixed bottom-0 left-0 right-0 px-5 pt-3 pb-6 backdrop-blur-sm" style={{ background: 'rgba(242, 235, 221, 0.85)', borderTop: '1px solid var(--line)' }}>
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
        const ya = camisetas.some(c => c.origen_camiseta_id === cat.id && !c.archived_at);
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
              {m.forma}{m.tonos?.length ? ' · ' + m.tonos.map(t => TONOS.find(x => x.id === t)?.label).join(' · ') : ''}
            </span>
          </span>
          <span className="ff-mono text-xs mt-1" style={{ color: 'var(--gold)' }}>+{m.puntos_base}</span>
        </div>
      ))}
    </div>
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

function HoyView({ cams, movimientos, onToggle, onOpen }) {
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
    {conActivas.map(cam => <CamisetaCardHoy key={cam.id} cam={cam} onToggle={onToggle} onOpen={onOpen} />)}
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

function CamisetaCardHoy({ cam, onToggle, onOpen }) {
  const visibles = cam.misiones.filter(m => m.estado !== 'archivada');
  if (visibles.length === 0) return null;
  return (<div className="mb-8">
    <button onClick={() => onOpen(cam.id)} className="flex items-baseline gap-3 mb-3 ring-ink text-left">
      <span className="text-2xl">{cam.emoji}</span>
      <h3 className="ff-serif text-xl">{cam.nombre}</h3>
      {cam.arco && <span className="ff-mono text-xs ml-1" style={{ color: 'var(--ink-faint)' }}>{cam.arco.de} → {cam.arco.a}</span>}
    </button>
    <div className="space-y-1 pl-1">
      {visibles.map(m => <MisionRow key={m.id} m={m} onToggle={() => onToggle(cam.id, m.id)} />)}
    </div>
  </div>);
}

function MisionRow({ m, onToggle }) {
  const est = estadoDeMision(m);
  const hecha = est === 'hecha' || est === 'hecha-hoy';
  const mult = multiplicador(m);
  const formaGlyph = FORMAS.find(f => f.id === m.forma)?.glyph;
  const p = puntos(m);
  const tonosStr = m.tonos?.map(t => TONOS.find(x => x.id === t)?.label).filter(Boolean).join(' · ');
  return (<button onClick={onToggle} className="flex items-start gap-3 py-2 text-left w-full ring-ink check-ani group">
    <span className="flex-shrink-0 mt-1.5 w-4 h-4 rounded-sm flex items-center justify-center check-ani" style={{
      border: '1px solid ' + (hecha ? 'var(--moss)' : 'var(--line)'),
      background: hecha ? 'var(--moss)' : 'transparent',
    }}>{hecha && <Check size={11} strokeWidth={3} color="var(--bg)" />}</span>
    <span className="flex-1 ff-serif text-base" style={{
      color: hecha ? 'var(--ink-faint)' : 'var(--ink)',
      textDecoration: hecha ? 'line-through' : 'none', textDecorationThickness: '0.5px',
    }}>{m.nombre}
      <span className="ff-mono text-xs ml-2" style={{ color: 'var(--ink-faint)' }}>{formaGlyph}{tonosStr && ' · ' + tonosStr}</span>
    </span>
    <span className="ff-mono text-xs mt-1.5" style={{ color: mult > 1.4 ? 'var(--warm)' : mult < 0.9 ? 'var(--ink-faint)' : 'var(--gold)' }}>+{p}</span>
  </button>);
}

function CamisetasView({ cams, movimientos, onOpen, onCreate, onOpenCatalogo, onImport, onReorder }) {
  const activas = cams.filter(c => !c.archived_at);
  const archivadas = cams.filter(c => c.archived_at);
  return (<div className="fade-up">
    <div className="flex items-baseline justify-between mb-6">
      <p className="ff-serif italic text-lg" style={{ color: 'var(--ink-soft)' }}>
        Tu mazo. {activas.length} {activas.length === 1 ? 'camiseta' : 'camisetas'} en juego.
      </p>
      <div className="flex gap-1">
        <button onClick={onOpenCatalogo} className="ring-ink ff-mono text-xs py-1 px-2" style={{ color: 'var(--ink-faint)', border: '1px solid var(--line)' }}>catálogo</button>
        <button onClick={onImport} className="ring-ink p-2" style={{ color: 'var(--ink-soft)' }} aria-label="Recibir camiseta"><Inbox size={20} strokeWidth={1.5} /></button>
        <button onClick={onCreate} className="ring-ink p-2" style={{ color: 'var(--ink-soft)' }} aria-label="Crear camiseta"><Plus size={20} strokeWidth={1.5} /></button>
      </div>
    </div>
    <div className="grid gap-3">
      {activas.map((cam, i) => {
        const act = cam.misiones.filter(m => estadoDeMision(m) === 'activa').length;
        const hechasTot = cam.misiones.reduce((acc, m) => acc + (m.completed_at ? 1 : 0) + (m.completions?.length || 0), 0);
        const puntosTot = puntosCamiseta(movimientos, cam.id);
        const canUp = i > 0;
        const canDown = i < activas.length - 1;
        return (<div key={cam.id} className="flex" style={{ background: 'var(--bg-card)', border: '1px solid var(--line-soft)', borderRadius: 2 }}>
          {activas.length > 1 && (
            <div className="flex flex-col border-r" style={{ borderColor: 'var(--line-soft)' }}>
              <button onClick={() => onReorder(cam.id, -1)} disabled={!canUp}
                className="ring-ink p-1.5 disabled:opacity-20"
                style={{ color: 'var(--ink-faint)' }} aria-label="Subir camiseta">
                <ChevronUp size={16} strokeWidth={1.5} />
              </button>
              <button onClick={() => onReorder(cam.id, +1)} disabled={!canDown}
                className="ring-ink p-1.5 disabled:opacity-20"
                style={{ color: 'var(--ink-faint)' }} aria-label="Bajar camiseta">
                <ChevronDown size={16} strokeWidth={1.5} />
              </button>
            </div>
          )}
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
    {archivadas.length > 0 && (<details className="mt-10">
      <summary className="smallcaps cursor-pointer" style={{ color: 'var(--ink-faint)' }}>{archivadas.length} retiradas</summary>
      <div className="mt-3 space-y-1">
        {archivadas.map(cam => (
          <button key={cam.id} onClick={() => onOpen(cam.id)} className="block w-full text-left py-1 ff-serif ring-ink" style={{ color: 'var(--ink-faint)' }}>
            <span className="mr-2">{cam.emoji}</span>{cam.nombre}
          </button>
        ))}
      </div>
    </details>)}
  </div>);
}

function CamisetaDetail({ cam, onBack, onAddMision, onEditMision, onToggle, onArchive, onRevive, onAddMilestone, onToggleMilestone, onCobrarMilestone, onEditMilestone, onEditCam, onReviveCam, onArchiveCam }) {
  const [adding, setAdding] = useState(false);
  const [addingMs, setAddingMs] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editingMs, setEditingMs] = useState(null);
  const [editingCam, setEditingCam] = useState(false);
  const [confirmRetiro, setConfirmRetiro] = useState(false);
  const [sharing, setSharing] = useState(false);
  const activas = cam.misiones.filter(m => estadoDeMision(m) === 'activa');
  const hechas = cam.misiones.filter(m => m.estado === 'hecha' || estadoDeMision(m) === 'hecha-hoy');
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
      {cam.archived_at && <span className="ff-mono text-xs ml-3 align-middle" style={{ color: 'var(--ink-faint)' }}>retirada</span>}
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
        <MisionRowDetail key={m.id} m={m} onToggle={() => onToggle(m.id)} onArchive={() => onArchive(m.id)} onEdit={() => setEditing(m.id)} />
      ))}
    </div>
    {hechas.length > 0 && (<>
      <div className="smallcaps mb-3" style={{ color: 'var(--ink-faint)' }}>hechas</div>
      <div className="space-y-1 mb-6">
        {hechas.map(m => editing === m.id ? (
          <MisionForm key={m.id} initial={m} onSave={(d) => { onEditMision(m.id, d); setEditing(null); }} onCancel={() => setEditing(null)} />
        ) : (
          <MisionRowDetail key={m.id} m={m} onToggle={() => onToggle(m.id)} onArchive={() => onArchive(m.id)} onEdit={() => setEditing(m.id)} />
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
      {!cam.archived_at ? (
        confirmRetiro ? (
          <div className="flex items-center gap-3 fade-up">
            <span className="ff-serif italic text-sm" style={{ color: 'var(--ink-soft)' }}>¿retirar «{cam.nombre}»?</span>
            <button onClick={() => { onArchiveCam(); }} className="ff-mono text-xs ring-ink px-3 py-1"
              style={{ background: 'var(--accent)', color: 'var(--bg)' }}>sí, retirar</button>
            <button onClick={() => setConfirmRetiro(false)} className="ff-mono text-xs ring-ink px-3 py-1"
              style={{ color: 'var(--ink-faint)' }}>no</button>
          </div>
        ) : (
          <button onClick={() => setConfirmRetiro(true)} className="ff-mono text-xs ring-ink py-2"
            style={{ color: 'var(--ink-faint)' }}>retirar esta camiseta</button>
        )
      ) : (
        <div className="flex items-center gap-3">
          <span className="ff-serif italic text-sm" style={{ color: 'var(--ink-faint)' }}>esta camiseta está retirada</span>
          <button onClick={onReviveCam} className="ff-mono text-xs ring-ink py-1 px-3"
            style={{ color: 'var(--moss)', border: '1px solid var(--moss)' }}>recuperarla</button>
        </div>
      )}
    </div>
    {sharing && <ShareSheet cam={cam} onClose={() => setSharing(false)} />}
  </div>);
}

function ShareSheet({ cam, onClose }) {
  const [busy, setBusy] = useState(null);     // 'share' | 'download' | 'copy' | null
  const [msg, setMsg] = useState(null);       // { kind: 'ok'|'err', text }

  // Preview as <img src=blob>. Loading SVG via <img> sandboxes any embedded
  // <script> (no execution), so we don't need to trust strings the codec
  // interpolates into the SVG. The PNG export uses the same SVG via canvas,
  // so what you see is what you send.
  const previewSrc = useMemo(() => {
    try {
      const raw = generateCamisetaSVG(cam);
      const blob = new Blob([raw], { type: 'image/svg+xml' });
      return URL.createObjectURL(blob);
    } catch (e) {
      console.error('preview SVG failed:', e);
      return null;
    }
  }, [cam]);

  useEffect(() => () => { if (previewSrc) URL.revokeObjectURL(previewSrc); }, [previewSrc]);

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
        setMsg({ kind: 'err', text: e.message || 'no se pudo compartir' });
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
      setMsg({ kind: 'err', text: e.message || 'no se pudo descargar' });
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
      setMsg({ kind: 'err', text: e.message || 'no se pudo copiar' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 fade-up"
      style={{ background: 'rgba(28, 24, 19, 0.55)' }}
      onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md"
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
          ) : (
            <p className="ff-mono text-xs mb-4" style={{ color: 'var(--accent)' }}>No se pudo generar la imagen.</p>
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
  const [phase, setPhase] = useState('pick');  // pick | loading | preview | error
  const [decoded, setDecoded] = useState(null);
  const [error, setError] = useState(null);
  const [previewSrc, setPreviewSrc] = useState(null);
  const inputRef = useRef(null);

  // Cleanup blob URL on unmount or change
  useEffect(() => () => { if (previewSrc) URL.revokeObjectURL(previewSrc); }, [previewSrc]);

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
      try {
        const raw = generateCamisetaSVG(result.camiseta);
        const blob = new Blob([raw], { type: 'image/svg+xml' });
        setPreviewSrc(URL.createObjectURL(blob));
      } catch (_) { /* preview is best-effort */ }
      setDecoded(result.camiseta);
      setPhase('preview');
    } catch (e) {
      setError(e.message || 'No se pudo leer la imagen.');
      setPhase('error');
    }
  }

  function reset() {
    if (previewSrc) URL.revokeObjectURL(previewSrc);
    setPreviewSrc(null);
    setDecoded(null);
    setError(null);
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
        <input ref={inputRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])} />
        <Upload size={28} strokeWidth={1.5} className="mx-auto mb-3" style={{ color: 'var(--ink-soft)' }} />
        <div className="ff-serif text-base mb-1" style={{ color: 'var(--ink)' }}>Elegir imagen</div>
        <div className="ff-mono text-xs" style={{ color: 'var(--ink-faint)' }}>PNG o JPG desde tu galería</div>
      </label>
      <p className="ff-mono text-xs mt-6" style={{ color: 'var(--ink-faint)' }}>
        Solo viaja el diseño. Las misiones empiezan en cero — el camino lo haces tú.
      </p>
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

function MisionRowDetail({ m, onToggle, onArchive, onEdit }) {
  const est = estadoDeMision(m);
  const hecha = est === 'hecha' || est === 'hecha-hoy';
  const mult = multiplicador(m);
  const formaGlyph = FORMAS.find(f => f.id === m.forma)?.glyph;
  const p = puntos(m);
  const tonosStr = m.tonos?.map(t => TONOS.find(x => x.id === t)?.label).filter(Boolean).join(' · ');
  return (<div className="flex items-start gap-2 py-1 group">
    <button onClick={onToggle} className="flex-shrink-0 mt-1.5 ring-ink">
      <span className="w-4 h-4 rounded-sm flex items-center justify-center check-ani block" style={{
        border: '1px solid ' + (hecha ? 'var(--moss)' : 'var(--line)'),
        background: hecha ? 'var(--moss)' : 'transparent',
      }}>{hecha && <Check size={11} strokeWidth={3} color="var(--bg)" />}</span>
    </button>
    <span className="flex-1 ff-serif" style={{
      color: hecha ? 'var(--ink-faint)' : 'var(--ink)',
      textDecoration: hecha ? 'line-through' : 'none',
    }}>{m.nombre}
      <span className="ff-mono text-xs ml-2" style={{ color: 'var(--ink-faint)' }}>{formaGlyph}{tonosStr && ' · ' + tonosStr}</span>
      {m.forma === 'recurrente' && completionsEsteMes(m) > 0 && (
        <span className="ff-mono text-xs ml-1" style={{ color: 'var(--ink-faint)' }}>· {completionsEsteMes(m)}×/30d</span>
      )}
    </span>
    <span className="ff-mono text-xs mt-1.5" style={{ color: mult > 1.4 ? 'var(--warm)' : mult < 0.9 ? 'var(--ink-faint)' : 'var(--gold)' }}>+{p}</span>
    <button onClick={onEdit} className="opacity-40 group-hover:opacity-100 ring-ink p-1 transition-opacity">
      <Edit2 size={12} style={{ color: 'var(--ink-faint)' }} />
    </button>
    <button onClick={onArchive} className="opacity-40 group-hover:opacity-100 ring-ink p-1 transition-opacity">
      <Archive size={12} style={{ color: 'var(--ink-faint)' }} />
    </button>
  </div>);
}

function MisionForm({ initial, onSave, onCancel }) {
  const [nombre, setNombre] = useState(initial?.nombre || '');
  const [forma, setForma] = useState(initial?.forma || 'unica');
  const [tonos, setTonos] = useState(initial?.tonos || []);
  const [puntosBase, setPuntosBase] = useState(initial?.puntos_base ?? (FORMAS.find(f => f.id === (initial?.forma || 'unica'))?.puntosBase || 1));
  const toggleTono = (t) => setTonos(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  const submit = () => { if (!nombre.trim()) return; onSave({ nombre: nombre.trim(), forma, tonos, puntos_base: puntosBase }); };
  return (<div className="p-3 mb-3 fade-up" style={{ background: 'var(--bg-card)', border: '1px solid var(--line)' }}>
    <input autoFocus value={nombre} onChange={e => setNombre(e.target.value)} placeholder="¿Qué misión nace?" className="w-full ff-serif text-base pb-1 mb-3 ring-ink" style={{ borderBottom: '1px solid var(--line)' }} onKeyDown={e => { if (e.key === 'Enter' && nombre.trim()) submit(); }} />
    <div className="smallcaps mb-2" style={{ color: 'var(--ink-faint)' }}>forma</div>
    <div className="flex flex-wrap gap-1 mb-3">
      {FORMAS.map(f => (
        <button key={f.id} onClick={() => { setForma(f.id); if (!initial) setPuntosBase(f.puntosBase); }} className="ff-mono text-xs px-2 py-1 ring-ink" style={{
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
          background: tonos.includes(t.id) ? 'var(--accent)' : 'transparent',
          color: tonos.includes(t.id) ? 'var(--bg)' : 'var(--ink-soft)',
          border: '1px solid ' + (tonos.includes(t.id) ? 'var(--accent)' : 'var(--line)'),
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

function DiarioView({ state, onStart }) {
  const ult = (tipo) => state.sesiones.filter(s => s.tipo === tipo).slice(-1)[0];
  const fmt = (iso) => iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '—';
  const cards = [
    { tipo: 'diaria',  titulo: 'Cierre del día',           cita: 'Lo que se hizo, lo que se nombra.',         tiempo: '1–2 min',   last: ult('diaria') },
    { tipo: 'semanal', titulo: 'Cierre de semana',         cita: 'Las misiones se podan. Otras nacen.',       tiempo: '5–10 min',  last: ult('semanal') },
    { tipo: 'mensual', titulo: 'El observador del observador', cita: 'No las misiones: el juego mismo.',     tiempo: '15–25 min', last: ult('mensual') },
  ];
  return (<div className="fade-up">
    <p className="ff-serif italic text-lg mb-6" style={{ color: 'var(--ink-soft)' }}>El juego se construye aquí. La reflexión es parte del hacer.</p>
    <Heatmap state={state} />
    <div className="space-y-3 mb-10">
      {cards.map(c => (
        <button key={c.tipo} onClick={() => onStart(c.tipo)} className="block w-full text-left p-4 ring-ink" style={{ background: 'var(--bg-card)', border: '1px solid var(--line-soft)' }}>
          <div className="flex items-baseline justify-between mb-1">
            <h3 className="ff-serif text-xl">{c.titulo}</h3>
            <span className="ff-mono text-xs" style={{ color: 'var(--ink-faint)' }}>{c.tiempo}</span>
          </div>
          <p className="ff-serif italic text-sm mb-1" style={{ color: 'var(--ink-soft)' }}>{c.cita}</p>
          <div className="ff-mono text-xs" style={{ color: 'var(--ink-faint)' }}>última · {fmt(c.last?.date)}</div>
        </button>
      ))}
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
  const cams = state.camisetas.filter(c => !c.archived_at);
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
          const nombreColor = (esFria || nunca) ? '#8A7E70' : '#5C5147';
          const dotColor = esFria || nunca ? '#8B2D1C' : esTibia ? '#C77A3A' : null;
          return (<g key={d.cam.id}>
            <text x="0" y={y + rowHeight * 0.7} fontSize="13" fontFamily="Fraunces, Georgia, serif">
              <tspan fill="#1C1813">{d.cam.emoji}</tspan>
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
              <text x={totalColX} y={y + rowHeight * 0.7} fontSize="10" fill="#8A7E70" fontFamily="JetBrains Mono, monospace">
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
            fill={isToday ? '#1C1813' : '#8A7E70'}
            fontFamily="JetBrains Mono, monospace"
            fontWeight={isToday ? '500' : '400'}>{dowChars[d.getDay()]}</text>);
        })}
        {rango === 30 && dias.map((d, i) => {
          if (i % 7 !== 0 && i !== dias.length - 1) return null;
          return (<text key={i}
            x={labelWidth + i * (cellWidth + cellGap) + cellWidth / 2}
            y={data.length * (rowHeight + 4) + 12}
            fontSize="9" textAnchor="middle" fill="#8A7E70"
            fontFamily="JetBrains Mono, monospace">{d.getDate()}</text>);
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
    { id: 'cierres',    label: 'cierres',   match: (e) => e.tipo.startsWith('sesion_') },
    { id: 'camisetas',  label: 'camisetas', match: (e) => e.tipo.startsWith('camiseta_') },
    { id: 'misiones',   label: 'misiones',  match: (e) => e.tipo.startsWith('mision_') },
    { id: 'milestones', label: 'hitos',     match: (e) => e.tipo.startsWith('milestone_') },
  ];
  const [filter, setFilter] = useState(null);

  const allEvents = [...(state.eventos || [])].reverse();
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
      text = <>se retira <em>{e.nombre}</em></>; break;
    case 'camiseta_recuperada':
      glyph = '◇'; color = 'var(--moss)';
      text = <>vuelve <strong>{e.nombre}</strong></>; break;
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
      text = <><strong>cierre del día</strong>{e.notas && e.notas !== '·' && <span className="italic ml-1" style={{ color: 'var(--ink-soft)' }}>— "{e.notas}"</span>}</>; break;
    case 'sesion_semanal':
      glyph = '☾'; color = 'var(--ocean)';
      text = <><strong>cierre de semana</strong>{e.notas && <span className="italic ml-1" style={{ color: 'var(--ink-soft)' }}>— "{e.notas}"</span>}</>; break;
    case 'sesion_mensual':
      glyph = '☾'; color = 'var(--accent)';
      text = <><strong>observador del observador</strong>{e.notas && <span className="italic ml-1" style={{ color: 'var(--ink-soft)' }}>— "{e.notas}"</span>}</>; break;
    default:
      glyph = '·'; color = 'var(--ink-faint)'; text = e.tipo;
  }

  const isCierre = e.tipo.startsWith('sesion_');
  const hasContent = e.notas && e.notas !== '·' || e.caliente || e.fria;
  const expandable = isCierre && hasContent;
  const caliente = e.caliente ? lookupCam(e.caliente) : null;
  const fria = e.fria ? lookupCam(e.fria) : null;

  return (<div>
    <div className="flex items-start gap-2 ff-serif text-sm pl-3 -ml-px" style={{ borderLeft: '2px solid ' + color }}>
      <span className="ff-mono text-xs" style={{ color: 'var(--ink-faint)' }}>{hora}</span>
      <span className="ff-mono text-xs" style={{ color }}>{glyph}</span>
      {expandable ? (
        <button onClick={() => setExpanded(!expanded)}
          className="flex-1 text-left ring-ink"
          style={{ color: 'var(--ink-soft)' }}>
          {text}
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
  const activas = cams.flatMap(c => c.misiones.filter(m => estadoDeMision(m) === 'activa').map(m => ({ ...m, cam: c })));
  const hechasHoy = cams.flatMap(c => c.misiones.filter(m => {
    if (m.completed_at && new Date(m.completed_at).toDateString() === today) return true;
    if (m.completions?.some(x => new Date(x).toDateString() === today)) return true;
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
        {activas.map(m => (
          <div key={m.id} className="flex items-start gap-2 py-1" style={{ borderBottom: '1px solid var(--line-soft)' }}>
            <button onClick={() => onToggle(m.cam.id, m.id)} className="flex items-start gap-3 py-1 text-left flex-1 ring-ink">
              <span className="w-4 h-4 mt-1.5 rounded-sm border check-ani" style={{ borderColor: 'var(--line)' }} />
              <span className="flex-1 ff-serif">
                <span className="text-base mr-2">{m.cam.emoji}</span>{m.nombre}
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
        ))}
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
    Object.entries(nuevas).forEach(([camId, m]) => {
      if (m?.nombre?.trim()) onAddMision(camId, { nombre: m.nombre.trim(), forma: m.forma || 'unica', tonos: m.tonos || [], puntos_base: m.puntos_base });
    });
    onClose({ notas: notas.trim(), caliente, fria });
  };
  return (<div className="px-6 pt-8 pb-12 max-w-xl mx-auto fade-up">
    <div className="flex items-center justify-between mb-2">
      <span className="smallcaps" style={{ color: 'var(--ink-faint)' }}>Cierre de semana</span>
      <button onClick={() => onClose({ notas: '' })} className="ring-ink p-1" style={{ color: 'var(--ink-faint)' }}><X size={18} /></button>
    </div>
    <div className="ff-mono text-xs mb-10" style={{ color: 'var(--ink-faint)' }}>{step + 1} / {totalSteps}</div>
    {step < cams.length && (() => {
      const cam = cams[step];
      const activas = cam.misiones.filter(m => estadoDeMision(m) === 'activa');
      const nueva = nuevas[cam.id] || { nombre: '', forma: 'unica', tonos: [] };
      return (<div className="fade-up">
        <div className="text-4xl mb-2">{cam.emoji}</div>
        <h2 className="display text-3xl mb-2">{cam.nombre}</h2>
        <p className="ff-serif italic mb-6" style={{ color: 'var(--ink-soft)' }}>Cada misión: ¿sigue viva, hay que apretarla, o ya no?</p>
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
        <input value={nueva.nombre} onChange={e => setNuevas({ ...nuevas, [cam.id]: { ...nueva, nombre: e.target.value } })} placeholder="(opcional)" className="w-full ff-serif text-base pb-1 mb-3 ring-ink" style={{ borderBottom: '1px solid var(--line)' }} />
        {nueva.nombre.trim() && (<div className="flex flex-wrap gap-1 mb-3">
          {FORMAS.map(f => (
            <button key={f.id} onClick={() => setNuevas({ ...nuevas, [cam.id]: { ...nueva, forma: f.id } })} className="ff-mono text-xs px-2 py-1 ring-ink" style={{
              background: (nueva.forma || 'unica') === f.id ? 'var(--ink)' : 'transparent',
              color: (nueva.forma || 'unica') === f.id ? 'var(--bg)' : 'var(--ink-soft)',
              border: '1px solid ' + ((nueva.forma || 'unica') === f.id ? 'var(--ink)' : 'var(--line)'),
            }}>{f.glyph} {f.label}</button>
          ))}
        </div>)}
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

function SesionMensual({ cams, onArchiveCam, onReviveCam, onCreateCam, onClose }) {
  const [step, setStep] = useState(0);
  const [sentir, setSentir] = useState('');
  const [regla, setRegla] = useState('');
  const [falta, setFalta] = useState('');
  const activas = cams.filter(c => !c.archived_at);
  const finish = () => onClose({
    notas: [
      sentir.trim() && `Se siente: ${sentir.trim()}`,
      regla.trim() && `Regla a cambiar: ${regla.trim()}`,
      falta.trim() && `Falta camiseta: ${falta.trim()}`,
    ].filter(Boolean).join(' · '),
  });
  return (<div className="px-6 pt-8 pb-12 max-w-xl mx-auto fade-up">
    <div className="flex items-center justify-between mb-2">
      <span className="smallcaps" style={{ color: 'var(--ink-faint)' }}>El observador del observador</span>
      <button onClick={() => onClose({ notas: '' })} className="ring-ink p-1" style={{ color: 'var(--ink-faint)' }}><X size={18} /></button>
    </div>
    <div className="ff-mono text-xs mb-10" style={{ color: 'var(--ink-faint)' }}>{step + 1} / 4</div>
    {step === 0 && (<div className="fade-up">
      <h2 className="display text-3xl mb-2">El mazo.</h2>
      <p className="ff-serif italic mb-8" style={{ color: 'var(--ink-soft)' }}>¿Sigue cada camiseta siendo verdadera para ti? Retira sin culpa lo que ya no.</p>
      <div className="space-y-2 mb-8">
        {activas.map(c => (
          <div key={c.id} className="flex items-center gap-3 py-2">
            <span className="text-2xl">{c.emoji}</span>
            <span className="flex-1 ff-serif text-lg">{c.nombre}</span>
            <button onClick={() => { if (confirm(`¿Retirar "${c.nombre}"?`)) onArchiveCam(c.id); }} className="ring-ink ff-mono text-xs py-1 px-2" style={{ color: 'var(--ink-faint)', border: '1px solid var(--line)' }}>retirar</button>
          </div>
        ))}
        {cams.filter(c => c.archived_at).length > 0 && (<details className="pt-4">
          <summary className="smallcaps cursor-pointer" style={{ color: 'var(--ink-faint)' }}>recuperar alguna</summary>
          <div className="mt-2 space-y-1">
            {cams.filter(c => c.archived_at).map(c => (
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
      <p className="ff-serif italic mb-6" style={{ color: 'var(--ink-soft)' }}>Una identidad que ya estás viviendo sin nombre todavía.</p>
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
      <p className="ff-serif italic mb-6" style={{ color: 'var(--ink-soft)' }}>Del juego, no de la vida. Lo que ya no sirve como está.</p>
      <textarea value={regla} onChange={e => setRegla(e.target.value)} autoFocus rows={4} placeholder="(opcional)" className="w-full ff-serif text-base p-3 ring-ink resize-none italic" style={{ border: '1px solid var(--line)', background: 'var(--bg-card)' }} />
      <div className="flex justify-between mt-8">
        <button onClick={() => setStep(step - 1)} className="ff-mono text-xs ring-ink px-3 py-2" style={{ color: 'var(--ink-faint)' }}>← atrás</button>
        <button onClick={finish} className="ff-serif px-6 py-2 ring-ink" style={{ background: 'var(--ink)', color: 'var(--bg)' }}>cerrar el mes</button>
      </div>
    </div>)}
  </div>);
}
