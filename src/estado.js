// ── El estado ────────────────────────────────────────────────────────────
//
// Todo lo que sabe qué es un estado válido y cómo llega a serlo: las llaves
// de localStorage, la forma vacía, las migraciones y el único camino por el
// que una camiseta cambia de sitio. Salió de App.jsx sin un cambio de
// comportamiento, por una razón concreta: las migraciones son lo que decide
// si los datos de alguien sobreviven a una versión nueva, y dentro de un
// archivo con JSX no se pueden correr desde Node. Aquí sí — ver
// tests/estado.test.mjs.
//
// Regla que no cambia por haberse mudado: las migraciones son acumulativas.
// Se suma un paso, no se reescriben los anteriores.

export const STATE_KEY = 'juego-camisetas:state:v1';
export const INSTALL_KEY = 'juego-camisetas:install-ack:v1';
// v7: respaldos automáticos. PRE_V7 congela el estado crudo la primera vez
// que corre la migración v7 (una sola vez, nunca se sobrescribe).
// IMPORT_BACKUP guarda lo que había antes de cada import manual.
export const BACKUP_PRE_V7_KEY = 'juego-camisetas:state:pre-v7';
export const BACKUP_PRE_V8_KEY = 'juego-camisetas:state:pre-v8';
export const BACKUP_PRE_V10_KEY = 'juego-camisetas:state:pre-v10';
export const IMPORT_BACKUP_KEY = 'juego-camisetas:state:import-backup';
export const DAY = 86400000;

// ── v8: el clóset es un mueble ───────────────────────────────────────────
// Cinco ganchos fijos (no configurables, a propósito: en el momento en que
// sea un ajuste alguien lo sube a veinte) y cerros ilimitados. Cada camiseta
// está en exactamente un sitio.
export const GANCHOS = 5;
export const CERRO_SIN_DOBLAR = 'sin-doblar';
export const cerroSistema = () => ({ id: CERRO_SIN_DOBLAR, nombre: 'sin doblar', orden: 0, esDelSistema: true });
export const PUESTA = () => ({ tipo: 'puesta' });
export const AL_SIN_DOBLAR = () => ({ tipo: 'cerro', cerroId: CERRO_SIN_DOBLAR });
export const estaPuesta = (c) => c?.ubicacion?.tipo === 'puesta';
export const enGancho = (c, i) => c?.ubicacion?.tipo === 'gancho' && c.ubicacion.posicion === i;
export const enCerro = (c, id) => c?.ubicacion?.tipo === 'cerro' && c.ubicacion.cerroId === id;
// La ropa sin doblar vive al fondo del montón, no encima de los cerros que
// uno se tomó el trabajo de nombrar. El del sistema siempre va de último.
export const ordenarCerros = (cerros) => [...(cerros || [])].sort((a, b) =>
  (a.esDelSistema ? 1 : 0) - (b.esDelSistema ? 1 : 0) || (a.orden ?? 0) - (b.orden ?? 0));
export const mismaUbicacion = (a, b) => !!a && !!b && a.tipo === b.tipo &&
  a.posicion === b.posicion && a.cerroId === b.cerroId;

// ¿Está corriendo ya instalada (desde el ícono del home), no en el navegador?
export function isStandalone() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true   // iOS Safari
  );
}

export const emptyState = () => ({
  user_id: 'local', version: 10, created_at: new Date().toISOString(),
  camisetas: [], sesiones: [], eventos: [], movimientos: [], visitas: [],
  cerros: [cerroSistema()], ecos: { silencios: {} },
});

export async function loadState() {
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
        // v10: el único paso del rediseño de los rituales que borra un campo
        // existente (archived_at). Los otros solo añaden, y por eso no llevan
        // respaldo. Este sí.
        if ((parsed.version || 0) < 10 && !localStorage.getItem(BACKUP_PRE_V10_KEY)) {
          localStorage.setItem(BACKUP_PRE_V10_KEY, raw);
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
export function registrarVisita(s) {
  if (!s.visitas) s.visitas = [];
  const ultima = s.visitas[s.visitas.length - 1]?.ts;
  if (ultima && (Date.now() - new Date(ultima).getTime()) < 10 * 60 * 1000) return false;
  s.visitas.push({ ts: nowISO().slice(0, 16) + 'Z' });
  return true;
}
export async function saveState(state) {
  try {
    const { _saveError, ...clean } = state;
    localStorage.setItem(STATE_KEY, JSON.stringify(clean));
    return true;
  } catch (e) {
    console.error('saveState error:', e);
    return false;
  }
}
export function migrate(s) {
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
      // Sin ubicación válida, al cerro sin doblar. Antes esto miraba
      // archived_at para decidir entre el cerro y "puesta"; desde v10 el
      // campo no existe, y de todas formas el destino correcto es el cerro:
      // "puesta" pasó a significar que hoy le estás poniendo atención, y una
      // migración no está en posición de decidir eso por nadie. Las donadas
      // ya no están en el array, así que no se tocan.
      if (!valida) cam.ubicacion = AL_SIN_DOBLAR();
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
  // v10 — "puesta" deja de ser un estado durable y pasa a ser la atención de
  // un día, que es lo que escoge el ritual diario.
  //
  // El dato no cambia de forma: una camiseta sigue estando puesta, en un
  // gancho o en un cerro. Lo que cambia es qué quiere decir, y por eso lo
  // único que hace este paso es dejar constancia de cuándo cambió. Sin esa
  // marca, un cálculo que cruce la frontera lee dos cosas distintas bajo el
  // mismo nombre y no tiene cómo saberlo.
  //
  // Y se va archived_at. Lo escribía aplicarMovida cada vez que una camiseta
  // salía de "puesta": con la atención diaria eso se reescribiría todas las
  // noches, y lavar la ropa lo estamparía en diecinueve camisetas de un
  // golpe. Quitarse una camiseta no es archivarla. Cuándo se fue una
  // identidad vive en el evento 'camiseta_donada', que es la única salida
  // real. OJO: el archived_at de una MISIÓN es otro campo y se queda.
  if (s.version < 10) {
    pushEvento(s, { tipo: 'frontera_puesta_diaria' });
    s.camisetas?.forEach(cam => { delete cam.archived_at; });
  }
  s.version = 10;
  return s;
}

// Una misión está "en juego" si vive en los buckets activos (CamisetaDetail,
// el costurero, la cuenta de la card en CamisetasView). Las recurrentes nunca
// desaparecen del bucket activo al completarse: siguen visibles ahí, sólo
// que con el visual de "hecha hoy" (check + tachado), porque hacer una
// recurrente no significa que dejó de existir — significa que ya tocó hoy.
//
// Vive aquí y no en App.jsx porque los ecos también la necesitan, y dos
// copias de esta regla se desincronizan sin que nadie lo note: la señal de
// "sin misiones que hacer" del costurero dejaría de coincidir con lo que la
// pantalla del hacedor muestra como pendiente.
export function enJuego(m) {
  if (m?.estado === 'archivada') return false;
  if (m?.forma === 'recurrente') return true;
  return m?.estado === 'activa';
}

// Escribe un evento en la historia. Módulo, no closure: lo usan tanto los
// handlers de App como aplicarMovida.
export const pushEvento = (s, ev) => { s.eventos.push({ id: uid(), ts: nowISO(), ...ev }); };

// Una ubicación que existe de verdad. Un gancho fuera de rango o un cerro
// borrado no dejan a la camiseta en el aire: caen al cerro sin doblar.
export function normalizarUbicacion(s, u) {
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
export function aplicarMovida(s, camId, destino, opts = {}) {
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
    }
  }
  c.ubicacion = dest;
  // Dónde está una camiseta lo dice ubicacion y nada más. Ya no se estampa
  // ninguna fecha al salir de "puesta": quitársela es un gesto de un día.
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

export const uid = () => Math.random().toString(36).slice(2, 11);
export const nowISO = () => new Date().toISOString();
