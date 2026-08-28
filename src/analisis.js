// ── El mini-análisis de uso real ─────────────────────────────────────────
//
// Todo el cálculo del vistazo a los datos, en funciones puras. Vive fuera de
// App.jsx por la misma razón que `estado.js`: son cuentas sobre el modelo de
// datos, no una pantalla, y desde Node se pueden probar (ver
// tests/analisis.test.mjs). La vista de arriba solo dibuja lo que sale de
// aquí.
//
// De dónde salen los números, que no es obvio:
//
//   · **Las completadas se cuentan en `movimientos`, no en las misiones.**
//     Una recurrente acumula un movimiento por cada tap y su misión solo
//     guarda la lista de fechas; deshacer una completada BORRA el movimiento
//     pero deja el evento. `movimientos` con `tipo: 'mision_completada'` es
//     el único registro que queda exacto después de un deshacer.
//   · **Las camisetas donadas siguen contando.** Salen de `s.camisetas` pero
//     sus movimientos se quedan, y el evento `camiseta_donada` conserva el
//     nombre, el `created_at` y las misiones con sus tonos. Sin leer ese
//     evento, media historia del juego desaparecería del análisis justo
//     cuando más larga es.
//   · **Los días se cortan en hora local**, no en UTC. El día del usuario es
//     el que él vivió; cortar en UTC mueve al día siguiente todo lo que se
//     marcó de noche.
//
// Ojo con la frontera: desde v10 "puesta" quiere decir la atención de un día
// y antes quería decir identidad activa (evento `frontera_puesta_diaria`).
// Por eso aquí NO se calcula nada a partir de `ubicacion`: todo sale de
// completadas, sesiones y donaciones, que significan lo mismo a los dos lados
// de esa frontera.

export const DIA_MS = 86400000;

// Los puntos llevan multiplicador, así que la suma acumula decimales de coma
// flotante. El app entero los muestra con un decimal (`round1` en App.jsx);
// aquí se hace igual, o el tile dice 748.3999999999979.
const round1 = (n) => Math.round(n * 10) / 10;

const DIAS_SEMANA = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

// Los tonos con el mismo color que les pinta el codec en la prenda. Se
// repiten aquí y no se importan de App.jsx para que el módulo siga
// corriendo en Node sin arrastrar JSX.
export const TONOS_ANALISIS = [
  { id: 'profunda',    label: 'profunda',    color: '#B571FF' },
  { id: 'emocional',   label: 'emocional',   color: '#0DEDF7' },
  { id: 'estrategica', label: 'estratégica', color: '#FF9E01' },
  { id: 'fisica',      label: 'física',      color: '#DA1895' },
  { id: 'creativa',    label: 'creativa',    color: '#F4FF01' },
];

// ── Fechas ───────────────────────────────────────────────────────────────

// 'YYYY-MM-DD' en hora local. toISOString() aquí sería un bug silencioso:
// una misión marcada a las 9 de la noche en Bogotá cae al día siguiente.
export function diaLocal(fechaOIso) {
  const d = fechaOIso instanceof Date ? fechaOIso : new Date(fechaOIso);
  if (Number.isNaN(d.getTime())) return null;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const aFecha = (dia) => {
  const [y, m, d] = dia.split('-').map(Number);
  return new Date(y, m - 1, d);
};

// Diferencia en días entre dos claves 'YYYY-MM-DD'. Se hace sobre fechas a
// medianoche local, así que el cambio de horario de verano no la corre.
const diasEntre = (a, b) => Math.round((aFecha(b) - aFecha(a)) / DIA_MS);

// El lunes de la semana a la que pertenece un día. Las semanas del juego
// empiezan en lunes porque el ritual semanal —el costurero— cierra el fin de
// semana; partir en domingo dejaría el cierre y su semana en buckets
// distintos.
export function lunesDe(dia) {
  const d = aFecha(dia);
  const desplazamiento = (d.getDay() + 6) % 7;   // 0 = lunes … 6 = domingo
  d.setDate(d.getDate() - desplazamiento);
  return diaLocal(d);
}

const etiquetaCorta = (dia) => {
  const d = aFecha(dia);
  return `${d.getDate()}/${d.getMonth() + 1}`;
};

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const etiquetaLarga = (dia) => {
  const d = aFecha(dia);
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
};

// ── Índices sobre el estado ──────────────────────────────────────────────

// Nombre de cada camiseta que alguna vez existió: las que están y las que ya
// se donaron. Sin la segunda mitad, el ranking de más jugadas mostraría ids
// crudos justo para las camisetas con más historia.
function nombresDeCamisetas(state) {
  const nombres = new Map();
  // Los eventos van primero y las vivas después: si una camiseta cambió de
  // nombre, el actual gana sobre el que quedó congelado en un evento viejo.
  for (const e of state.eventos || []) {
    if ((e.tipo === 'camiseta_donada' || e.tipo === 'snapshot') && e.cam_id && e.nombre) {
      nombres.set(e.cam_id, e.nombre);
    }
  }
  for (const c of state.camisetas || []) nombres.set(c.id, c.nombre);
  return nombres;
}

// Los tonos de cada misión, incluidas las de camisetas donadas. Una misión
// puede tener varios tonos o ninguno.
function tonosDeMisiones(state) {
  const tonos = new Map();
  const anotar = (misiones) => {
    for (const m of misiones || []) {
      if (m?.id) tonos.set(m.id, Array.isArray(m.tonos) ? m.tonos : []);
    }
  };
  for (const e of state.eventos || []) {
    if (e.tipo === 'snapshot') anotar(e.misiones);
    if (e.tipo === 'camiseta_donada') anotar(e.snapshot?.misiones);
  }
  for (const c of state.camisetas || []) anotar(c.misiones);
  return tonos;
}

export const completadas = (state) =>
  (state.movimientos || []).filter(m => m.tipo === 'mision_completada');

// ── Rachas y días ────────────────────────────────────────────────────────

// La racha más larga de días seguidos con al menos una misión marcada.
// Devuelve { dias, desde, hasta } o null si no hay nada marcado.
//
// Nota de doctrina: esto existe solo dentro del vistazo a los datos, que es
// una vista a la que el usuario entra a propósito a mirar su propio archivo.
// El juego nunca cuenta esto por su cuenta: ni en un eco, ni en un ritual,
// ni en la pantalla de hoy. Ver docs/decisiones.md.
export function rachaMasLarga(dias) {
  const ordenados = [...new Set(dias)].sort();
  if (!ordenados.length) return null;
  let mejor = { dias: 1, desde: ordenados[0], hasta: ordenados[0] };
  let inicio = ordenados[0], largo = 1;
  for (let i = 1; i < ordenados.length; i++) {
    if (diasEntre(ordenados[i - 1], ordenados[i]) === 1) largo++;
    else { inicio = ordenados[i]; largo = 1; }
    if (largo > mejor.dias) mejor = { dias: largo, desde: inicio, hasta: ordenados[i] };
  }
  return mejor;
}

// ── El análisis completo ─────────────────────────────────────────────────

export function analizar(state, ahora = new Date()) {
  const movs = completadas(state);
  const nombres = nombresDeCamisetas(state);
  const tonosPorMision = tonosDeMisiones(state);

  const diasConJuego = [];
  const porDia = new Map();          // 'YYYY-MM-DD' → n
  const porCam = new Map();          // cam_id → n
  const porTono = new Map();         // tono → n
  let sinTono = 0;
  let puntosGanados = 0;

  for (const m of movs) {
    const dia = diaLocal(m.ts);
    if (!dia) continue;
    diasConJuego.push(dia);
    porDia.set(dia, (porDia.get(dia) || 0) + 1);
    porCam.set(m.cam_id, (porCam.get(m.cam_id) || 0) + 1);
    puntosGanados += Number(m.monto) || 0;
    const tonos = tonosPorMision.get(m.mision_id) || [];
    if (!tonos.length) sinTono++;
    // Una misión con dos tonos suma en los dos: la barra responde "cuánto de
    // lo que hiciste tenía este tono", no "cómo se reparte el total".
    for (const t of tonos) porTono.set(t, (porTono.get(t) || 0) + 1);
  }

  // ── El período ─────────────────────────────────────────────────────────
  // Desde el primer rastro de juego, no desde `created_at` del estado: un
  // respaldo restaurado en un teléfono nuevo trae un created_at reciente y
  // el período saldría de dos semanas para una historia de un año.
  const hoy = diaLocal(ahora);
  const candidatos = [
    ...diasConJuego,
    ...(state.camisetas || []).map(c => c.created_at && diaLocal(c.created_at)),
    ...(state.eventos || []).map(e => e.ts && diaLocal(e.ts)),
    state.created_at && diaLocal(state.created_at),
  ].filter(Boolean).filter(d => d <= hoy);
  const desde = candidatos.length ? candidatos.reduce((a, b) => (a < b ? a : b)) : hoy;
  const dias = Math.max(1, diasEntre(desde, hoy) + 1);

  // ── Por semana ─────────────────────────────────────────────────────────
  // Todas las semanas del período, incluidas las de cero: una barra que
  // falta se lee como semana inexistente, no como semana sin juego.
  const porSemana = new Map();
  for (const d of diasConJuego) {
    const l = lunesDe(d);
    porSemana.set(l, (porSemana.get(l) || 0) + 1);
  }
  const semanal = [];
  {
    const cursor = aFecha(lunesDe(desde));
    const finSemana = lunesDe(hoy);
    for (let guardia = 0; guardia < 2000; guardia++) {
      const l = diaLocal(cursor);
      semanal.push({ lunes: l, label: etiquetaCorta(l), n: porSemana.get(l) || 0 });
      if (l >= finSemana) break;
      cursor.setDate(cursor.getDate() + 7);
    }
  }

  // ── Por día de la semana ───────────────────────────────────────────────
  const porDiaSemana = DIAS_SEMANA.map(label => ({ label, n: 0 }));
  for (const [dia, n] of porDia) {
    porDiaSemana[(aFecha(dia).getDay() + 6) % 7].n += n;
  }

  // ── Tonos ──────────────────────────────────────────────────────────────
  const tonos = TONOS_ANALISIS
    .map(t => ({ ...t, n: porTono.get(t.id) || 0 }))
    .filter(t => t.n > 0)
    .sort((a, b) => b.n - a.n);

  // ── Rankings ───────────────────────────────────────────────────────────
  const vivas = new Set((state.camisetas || []).map(c => c.id));
  const topCams = [...porCam.entries()]
    .map(([id, n]) => ({ id, nombre: nombres.get(id) || 'una camiseta que ya no está', n, viva: vivas.has(id) }))
    .sort((a, b) => b.n - a.n || a.nombre.localeCompare(b.nombre))
    .slice(0, 8);

  // Cuánto vivió cada identidad de la que ya te despediste. `created_at`
  // viaja dentro del evento justo para esto: la camiseta ya no está en el
  // array y sin ese campo el dato sería incalculable para siempre.
  const duracion = (state.eventos || [])
    .filter(e => e.tipo === 'camiseta_donada' && e.snapshot?.created_at)
    .map(e => {
      const nacio = diaLocal(e.snapshot.created_at);
      const murio = diaLocal(e.ts);
      if (!nacio || !murio) return null;
      return { nombre: e.nombre || 'sin nombre', dias: Math.max(0, diasEntre(nacio, murio)) };
    })
    .filter(Boolean)
    .sort((a, b) => b.dias - a.dias)
    .slice(0, 10);

  // ── Cierres ────────────────────────────────────────────────────────────
  const sesiones = { total: 0, diaria: 0, semanal: 0, mensual: 0 };
  for (const s of state.sesiones || []) {
    sesiones.total++;
    if (s.tipo in sesiones) sesiones[s.tipo]++;
  }

  // ── Camisetas ──────────────────────────────────────────────────────────
  const activas = (state.camisetas || []).length;
  const donadas = (state.eventos || []).filter(e => e.tipo === 'camiseta_donada').length;

  const diasActivos = porDia.size;
  const racha = rachaMasLarga(diasConJuego);
  const puntosBalance = (state.movimientos || []).reduce((a, m) => a + (Number(m.monto) || 0), 0);

  const resumen = {
    periodo: { desde, hasta: hoy, dias },
    completadas: movs.length,
    puntosGanados,
    puntosBalance,
    camisetas: { creadas: activas + donadas, activas, donadas },
    diasActivos,
    porcentajeActivos: Math.round((diasActivos / dias) * 100),
    racha,
    sesiones,
    semanal,
    porDiaSemana,
    tonos,
    sinTono,
    topCams,
    duracion,
  };

  return { ...resumen, tiles: tiles(resumen), insights: insights(resumen) };
}

// ── Los seis números de arriba ───────────────────────────────────────────
function tiles(r) {
  return [
    { label: 'Misiones completadas', value: String(r.completadas) },
    {
      label: 'Puntos ganados', value: String(round1(r.puntosGanados)),
      // Solo aparece si compraste camisetas del catálogo; si no, los dos
      // números son el mismo y el subtítulo sobra.
      sub: round1(r.puntosBalance) !== round1(r.puntosGanados) ? `${round1(r.puntosBalance)} sin gastar` : null,
    },
    {
      label: 'Camisetas creadas', value: String(r.camisetas.creadas),
      sub: r.camisetas.creadas ? `${r.camisetas.activas} activas` : null,
    },
    { label: 'Días activos', value: String(r.diasActivos), sub: `de ${r.periodo.dias} (${r.porcentajeActivos}%)` },
    { label: 'Racha más larga', value: r.racha ? String(r.racha.dias) : '0', sub: 'días' },
    { label: 'Sesiones de cierre', value: String(r.sesiones.total) },
  ];
}

// ── Lo que salta a la vista ──────────────────────────────────────────────
//
// Las mismas seis observaciones del análisis original, pero calculadas: el
// texto se arma del estado de hoy, no de un backup de agosto. Cada una
// devuelve null cuando no hay con qué decirla, y arriba solo se dibujan las
// que quedaron — un juego de dos semanas muestra dos frases, no seis huecos.
//
// El `*` marca lo que va en negrita. Es marcado de juguete a propósito: la
// alternativa es meter HTML en un string y renderizarlo con
// dangerouslySetInnerHTML, y aquí adentro hay nombres que escribió el
// usuario.
function insights(r) {
  const fuera = [];
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

  // 1 · la racha más larga, y con qué semanas coincide
  if (r.racha && r.racha.dias >= 3) {
    const picos = [...r.semanal].sort((a, b) => b.n - a.n).slice(0, 2).filter(s => s.n > 0);
    const coincide = picos.length === 2
      ? ` — las dos semanas más movidas de todo el período fueron esas (${picos[0].n} y ${picos[1].n} misiones)`
      : '';
    fuera.push(`*Racha de ${plural(r.racha.dias, 'día', 'días')}* desde el ${etiquetaLarga(r.racha.desde)}${coincide}.`);
  }

  // 2 · el hueco más largo, dicho sin reproche: describe la forma de la
  // gráfica, no una falta. Solo desde tres semanas seguidas en cero, que ya
  // no es "una semana rara" sino un cambio de época.
  {
    let mejor = null, inicio = 0, largo = 0;
    r.semanal.forEach((s, i) => {
      if (s.n === 0) { if (largo === 0) inicio = i; largo++; if (!mejor || largo > mejor.largo) mejor = { inicio, largo }; }
      else largo = 0;
    });
    if (mejor && mejor.largo >= 3) {
      const a = r.semanal[mejor.inicio], b = r.semanal[mejor.inicio + mejor.largo - 1];
      const despues = r.semanal.slice(mejor.inicio + mejor.largo).filter(s => s.n > 0);
      const volvio = despues.length
        ? ` Después volviste: ${despues.length === 1 ? `una semana de ${despues[0].n}` : `semanas de entre ${Math.min(...despues.map(s => s.n))} y ${Math.max(...despues.map(s => s.n))}`}.`
        : '';
      fuera.push(`*Un vacío de ${plural(mejor.largo, 'semana', 'semanas')}* entre el ${etiquetaLarga(a.lunes)} y el ${etiquetaLarga(b.lunes)}: ninguna misión marcada.${volvio}`);
    }
  }

  // 3 · el día fuerte y el flojo
  {
    const conJuego = r.porDiaSemana.filter(d => d.n > 0);
    if (conJuego.length >= 4) {
      const orden = [...r.porDiaSemana].sort((a, b) => b.n - a.n);
      const fuerte = orden[0], flojo = orden[orden.length - 1];
      if (fuerte.n > flojo.n) {
        const finde = fuerte.label === 'sáb' || fuerte.label === 'dom';
        fuera.push(`*${fuerte.label.charAt(0).toUpperCase() + fuerte.label.slice(1)} es tu día fuerte* (${fuerte.n} misiones) y *${flojo.label} el más flojo* (${flojo.n}) — patrón de ${finde ? 'fin de semana' : 'entre semana'}.`);
      }
    }
  }

  // 4 · el tono que domina lo que sí tiene tono
  if (r.tonos.length >= 2) {
    const [primero, ...resto] = r.tonos;
    const conTono = r.tonos.reduce((a, t) => a + t.n, 0);
    const pctSinTono = r.completadas ? Math.round((r.sinTono / r.completadas) * 100) : 0;
    if (primero.n > resto[0].n) {
      fuera.push(`Cuando una misión sí tiene tono, *"${primero.label}" domina* (${primero.n}) sobre ${resto.map(t => t.label).join(', ')}.` +
        (pctSinTono >= 20 ? ` El resto —${r.sinTono} de ${r.completadas} (${pctSinTono}%)— no tiene tono asignado: son hábitos simples, tipo rutina.` : ''));
    }
  }

  // 5 · las camisetas más jugadas. Si alguna del tope ya no está, se dice:
  // una camiseta con mucho juego de la que ya te despediste se gastó, que es
  // distinto de una que se quedó en el clóset sin que la tocaras.
  if (r.topCams.length >= 2 && r.topCams[0].n >= 3) {
    const tope = r.topCams[0].n;
    const empatadas = r.topCams.filter(c => c.n === tope).slice(0, 2);
    const nombresTope = empatadas.map(c => `*${c.nombre}*`).join(' y ');
    const idas = empatadas.filter(c => !c.viva);
    const nota = idas.length
      ? ` ${idas.map(c => c.nombre).join(' y ')} ya ${idas.length > 1 ? 'se fueron' : 'se fue'}: con ese juego encima, ${idas.length > 1 ? 'se gastaron' : 'se gastó'} — no ${idas.length > 1 ? 'quedaron' : 'quedó'} sin usar.`
      : '';
    fuera.push(`${nombresTope} ${empatadas.length > 1 ? 'son tus camisetas más jugadas' : 'es tu camiseta más jugada'} (${plural(tope, 'misión', 'misiones')}${empatadas.length > 1 ? ' cada una' : ''}).${nota}`);
  }

  // 6 · cuánto suele durar una identidad antes de la despedida
  if (r.duracion.length >= 3) {
    const tope = r.duracion.slice(0, 3);
    const meses = Math.round(tope[0].dias / 30);
    fuera.push(`Las camisetas que más vivieron antes de que te despidieras de ellas (${tope.map(d => d.nombre).join(', ')}) llegaron a *${plural(tope[0].dias, 'día', 'días')}*` +
      (meses >= 1 ? ` — cerca de ${plural(meses, 'mes', 'meses')}. Puede ser una referencia real de cuánto dura una identidad antes de que la retires.` : '.'));
  }

  return fuera;
}
