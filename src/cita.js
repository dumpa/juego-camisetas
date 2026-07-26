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

// ── Entrega ──────────────────────────────────────────────────────────────
//
// Devuelve 'entregada' | 'cancelada'. Tres caminos, y el orden importa según
// el teléfono que tengas en la mano.

const CACHE_CITAS = 'juego-camisetas-citas';
const RUTA_CITA = '/cita.ics';

// iPadOS moderno se presenta como Macintosh; los puntos táctiles lo delatan.
const esIOS = () => {
  const ua = navigator.userAgent || '';
  return /iP(hone|od|ad)/.test(ua) ||
    (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1);
};

// El camino de iOS. Safari no abre el calendario desde un blob: ni desde un
// data:; necesita navegar a una URL que responda con Content-Type
// text/calendar. Como no hay backend, el service worker fabrica esa
// respuesta: el app deja el .ics en una caché y pide la ruta. Nada sale a la
// red — /cita.ics no existe en el servidor y no hace falta que exista.
//
// Va por iframe y no por navegación de la pestaña: si el documento de arriba
// se va, el PWA se recarga y pierdes el paso en el que ibas.
async function porServiceWorker(ics) {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return false;
  if (typeof caches === 'undefined') return false;
  try {
    const cache = await caches.open(CACHE_CITAS);
    await cache.put(RUTA_CITA, new Response(ics, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        // inline y no attachment: attachment le dice a iOS "guarda esto en
        // Archivos", que es exactamente el paseo que queremos evitar.
        'Content-Disposition': 'inline; filename="cita.ics"',
      },
    }));
    const marco = document.createElement('iframe');
    marco.style.display = 'none';
    marco.src = RUTA_CITA;
    document.body.appendChild(marco);
    setTimeout(() => marco.remove(), 20000);
    return true;
  } catch (e) {
    console.error('cita/sw:', e);
    return false;
  }
}

export async function entregarCita(ics, nombreArchivo = 'cita.ics') {
  if (esIOS() && await porServiceWorker(ics)) return 'entregada';

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });

  // Android: el share sheet deja escoger Google Calendar y funciona bien.
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

  // Escritorio: descargar el .ics es el gesto normal y el sistema lo abre.
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
