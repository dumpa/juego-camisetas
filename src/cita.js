// ── La cita ──────────────────────────────────────────────────────────────
//
// Un ritual sin hora es un deseo. Este módulo convierte una intención en un
// evento del calendario del teléfono y ahí se acaba su trabajo.
//
// Tres cosas que este archivo NO hace, y no por falta de tiempo:
//   · No hay recurrencia. La cita es un compromiso, no una configuración:
//     se vuelve a poner al cerrar cada check-in. Un RRULE convertiría el
//     ritual en un ajuste que se hace una vez y se ignora para siempre.
//   · No hay seguimiento. El app no sabe si la cita se cumplió, y no puede
//     saberlo: un .ics es un envío de una sola vía. Faltar no produce nada
//     (regla 6).
//   · Nada sale del dispositivo. El .ics se arma acá y se entrega al sistema
//     operativo. Por eso no hay link de Google Calendar: ese link llevaría
//     el nombre que el usuario escribió metido en una URL ajena.

const pad = (n) => String(n).padStart(2, '0');

// ICS pide UTC en formato básico: 20260802T190000Z
export function aFechaICS(d) {
  return (
    d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' +
    pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + '00Z'
  );
}

// RFC 5545 §3.3.11: la barra, el punto y coma, la coma y el salto de línea
// son sintaxis. Un nombre libre puede traer cualquiera de los cuatro.
const escapar = (t) => String(t)
  .replace(/\\/g, '\\\\')
  .replace(/;/g, '\\;')
  .replace(/,/g, '\\,')
  .replace(/\r?\n/g, '\\n');

// RFC 5545 §3.1: ninguna línea pasa de 75 octetos; se parte y se continúa
// con un espacio. Cuenta bytes, no caracteres — un nombre con tildes o
// emojis rompía el corte si se medía en caracteres.
const bytes = (s) => new TextEncoder().encode(s).length;
function plegar(linea) {
  if (bytes(linea) <= 75) return linea;
  const out = [];
  let actual = '';
  let limite = 75;
  for (const ch of linea) {            // itera por code points, no por unidades
    if (bytes(actual + ch) > limite) {
      out.push(actual);
      actual = ' ' + ch;               // las continuaciones abren con espacio
      limite = 75;
    } else {
      actual += ch;
    }
  }
  if (actual) out.push(actual);
  return out.join('\r\n');
}

const uidCita = () =>
  Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);

// alarmaMin: cuántos minutos antes suena el teléfono. Es la única promesa
// que el app hace y la cumple el sistema operativo, no nosotros.
export function construirICS({ titulo, descripcion = '', inicio, minutos = 15, alarmaMin = 10 }) {
  const fin = new Date(inicio.getTime() + minutos * 60000);
  const lineas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//juego de las camisetas//cita//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uidCita()}@camisetas.local`,
    `DTSTAMP:${aFechaICS(new Date())}`,
    `DTSTART:${aFechaICS(inicio)}`,
    `DTEND:${aFechaICS(fin)}`,
    `SUMMARY:${escapar(titulo)}`,
    descripcion ? `DESCRIPTION:${escapar(descripcion)}` : null,
    'TRANSP:OPAQUE',
    'BEGIN:VALARM',
    `TRIGGER:-PT${alarmaMin}M`,
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapar(titulo)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);
  return lineas.map(plegar).join('\r\n') + '\r\n';
}

// Devuelve 'entregada' | 'cancelada'. Lanza solo si no hubo forma.
//
// El share sheet primero y a propósito: en iOS instalado desde el ícono, un
// <a download> con un blob no abre el calendario —descarga a Archivos o no
// hace nada—. Compartir el .ics como archivo sí ofrece "Añadir a Calendario".
// En escritorio no hay share de archivos y ahí sí sirve la descarga.
export async function entregarCita(ics, nombreArchivo = 'cita.ics') {
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });

  try {
    const archivo = new File([blob], nombreArchivo, { type: 'text/calendar' });
    if (navigator.canShare?.({ files: [archivo] })) {
      await navigator.share({ files: [archivo] });
      return 'entregada';
    }
  } catch (e) {
    // Cancelar el share sheet no es un error: es una respuesta. No se
    // registra la cita y no se cae al fallback, que volvería a abrir algo.
    if (e?.name === 'AbortError') return 'cancelada';
  }

  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  return 'entregada';
}

// ── La fecha que se propone ──────────────────────────────────────────────
//
// A la misma hora del día en que estás cerrando, redondeada al cuarto más
// cercano. No es una corazonada sobre cuándo deberías hacerlo: es la hora
// que tú mismo escogiste hoy sin darte cuenta.
export function proximaCita(cadencia, desde = new Date()) {
  const d = new Date(desde);
  if (cadencia === 'mensual') d.setMonth(d.getMonth() + 1);
  else d.setDate(d.getDate() + 7);
  const m = d.getMinutes();
  d.setMinutes(Math.round(m / 15) * 15, 0, 0);
  return d;
}

// Cuánto dura, según lo que el propio Diario ya declara que cuesta.
export const DURACION = { semanal: 15, mensual: 30 };

// <input type="datetime-local"> quiere hora local sin zona ni segundos.
export function aInputLocal(d) {
  return (
    d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    'T' + pad(d.getHours()) + ':' + pad(d.getMinutes())
  );
}
export function deInputLocal(v) {
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
