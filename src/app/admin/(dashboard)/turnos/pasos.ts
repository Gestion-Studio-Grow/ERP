// QUÉ OFRECE LA AGENDA CUANDO NO HAY NADA QUE MOSTRAR — y el atajo "dar un turno".
//
// Antes cada pantalla vacía decía una línea ("No hay profesionales activos.", "No hay turnos ese
// día.") y ahí terminaba: la recepción no sabía qué hacer y el profesional de un negocio sin
// agenda quedaba en un callejón. Acá se decide, puro y con test, qué se dice y a dónde lleva el
// botón. Las páginas sólo lo dibujan (PasoVacio.tsx).
//
// Client-safe: sin Prisma ni servidor. Lo importan también componentes cliente.

export type Accion = { href: string; etiqueta: string };
export type PasoVacio = { titulo: string; descripcion: string; accion: Accion | null };

const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** ¿Es un "YYYY-MM-DD" de calendario que existe? ("2026-02-31" no.) */
export function esFechaDeCalendario(s: unknown): s is string {
  if (typeof s !== "string" || !FORMATO_FECHA.test(s)) return false;
  const d = new Date(`${s}T12:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Lo que además puede traer «Dar turno» (reingeniería CH, Tanda 2): de un hueco o «Atender ahora». */
export type ExtraDelAlta = {
  /** La profesional del hueco tocado (id). */
  profesional?: string | null;
  /** La hora de pared del hueco, «HH:MM» (en la zona del negocio). */
  hora?: string | null;
  /** «Atender ahora»: hoy, la franja de ahora y sólo las libres ahora. */
  ahora?: boolean;
};

const FORMATO_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** ¿Es una hora de pared «HH:MM» válida? */
export function esHoraDePared(s: unknown): s is string {
  return typeof s === "string" && FORMATO_HORA.test(s);
}

/**
 * El link que abre "Nuevo turno" ya desplegado en la lista, con la fecha puesta si viene. Ahorra
 * los dos toques de "Lista" → "+ Nuevo turno" y el de elegir la fecha. Con `extra`, además la
 * profesional y la hora del hueco tocado, o «Atender ahora» (que no lleva fecha: es hoy).
 */
export function hrefNuevoTurno(fecha?: string | null, cliente?: string | null, extra?: ExtraDelAlta): string {
  const ahora = extra?.ahora === true;
  let href = !ahora && esFechaDeCalendario(fecha) ? `/admin/turnos/lista?nuevo=1&fecha=${fecha}` : "/admin/turnos/lista?nuevo=1";
  if (esIdDeFicha(cliente)) href += `&cliente=${cliente}`;
  if (ahora) return `${href}&ahora=1`;
  const profesional = extra?.profesional;
  const hora = extra?.hora;
  if (esIdDeFicha(profesional)) href += `&profesional=${profesional}`;
  if (esHoraDePared(hora)) href += `&hora=${hora}`;
  return href;
}

/** Tocar un hueco de la agenda (celda vacía): «Dar turno» con la profesional, el día y la hora puestos. */
export function hrefTurnoEnHueco(fecha: string, profesionalId: string, hora: string): string {
  return hrefNuevoTurno(fecha, null, { profesional: profesionalId, hora });
}

/** «Atender ahora» (la clienta está en el mostrador): hoy, la franja de ahora, sólo las libres. */
export function hrefAtenderAhora(cliente?: string | null): string {
  return hrefNuevoTurno(null, cliente, { ahora: true });
}

/**
 * Lo que «Dar turno» lee de la URL además de la fecha y la clienta: la profesional y la hora del
 * hueco, o «ahora». Sólo con el alta abierta (`nuevo=1`). Un id o una hora rara no se precargan;
 * con «ahora» la profesional y la hora se ignoran (las decide el reloj).
 */
export function leerHuecoDelAlta(sp: {
  nuevo?: string | string[] | null;
  profesional?: string | string[] | null;
  hora?: string | string[] | null;
  ahora?: string | string[] | null;
}): { profesional: string; hora: string; ahora: boolean } {
  const uno = (v: string | string[] | null | undefined) => (Array.isArray(v) ? v[0] : (v ?? undefined));
  if (uno(sp.nuevo) !== "1") return { profesional: "", hora: "", ahora: false };
  if (uno(sp.ahora) === "1") return { profesional: "", hora: "", ahora: true };
  const profesional = uno(sp.profesional);
  const hora = uno(sp.hora);
  return { profesional: esIdDeFicha(profesional) ? profesional : "", hora: esHoraDePared(hora) ? hora : "", ahora: false };
}

const FORMATO_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** ¿Parece el id de una ficha? (letras, números, guion; nada que rompa la URL.) */
export function esIdDeFicha(s: unknown): s is string {
  return typeof s === "string" && FORMATO_ID.test(s);
}

/**
 * "Darle un turno" desde la ficha llega con ?cliente=<id>: el alta arranca con ESA clienta
 * elegida (nombre, teléfono y "de la zona", como si la hubieran buscado en "Clienta"). Sólo
 * con el alta abierta; un id raro no se precarga. Que la ficha exista y sea de este negocio lo
 * decide el formulario contra las fichas que ya le pasa el servidor (getFichasParaAlta): un id
 * ajeno simplemente no aparece y el alta queda vacía, como siempre.
 */
export function leerClienteDelAlta(sp: { nuevo?: string | string[]; cliente?: string | string[] }): string {
  const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const cliente = uno(sp.cliente);
  return uno(sp.nuevo) === "1" && esIdDeFicha(cliente) ? cliente : "";
}

/**
 * Lo que la lista lee de la URL para abrir el alta. Una fecha inventada ("2026-02-31") no se
 * precarga. Una pasada tampoco: el alta NO la rechaza (createManualAppointment sólo valida la
 * ventana de trabajo del profesional), así que un link viejo o un día pasado en la URL dejaría
 * un turno nuevo en el pasado sin que nadie lo note. Queda vacía y la recepción la elige.
 */
export function leerNuevoTurno(
  sp: { nuevo?: string | string[]; fecha?: string | string[] },
  hoy: string,
): { abrir: boolean; fecha: string } {
  const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const abrir = uno(sp.nuevo) === "1";
  const fecha = uno(sp.fecha);
  return { abrir, fecha: abrir && esFechaDeCalendario(fecha) && fecha >= hoy ? fecha : "" };
}

/** La agenda de un día (hoy, sin parámetro). */
export function hrefAgendaDelDia(dia: string, hoy: string): string {
  return dia === hoy || !esFechaDeCalendario(dia) ? "/admin/turnos" : `/admin/turnos?date=${dia}`;
}

/**
 * A dónde va «Dar turno» al terminar: la agenda del día del turno; con «Atender ahora», la agenda
 * de hoy con ESE turno abierto y su hoja de cobro (`?turno=<id>&hoja=terminar`, CH-019).
 */
export function hrefAlTerminarElAlta(fin: { dia: string; turnoId: string | null; ahora: boolean }, hoy: string): string {
  if (fin.ahora && esIdDeFicha(fin.turnoId)) return `/admin/turnos?turno=${fin.turnoId}&hoja=terminar`;
  return hrefAgendaDelDia(fin.dia, hoy);
}

/**
 * La agenda sin profesionales. Tres personas distintas llegan acá y cada una tiene otro paso:
 *   · el profesional: su usuario no está atado a ninguna profesional activa (le pasa, por
 *     ejemplo, al que se dio de alta como profesional en un negocio sin agenda). No puede
 *     arreglarlo él: se le dice a quién pedírselo;
 *   · quien puede abrir el Catálogo: se la lleva a cargar a quién atiende;
 *   · la recepción: tampoco lo carga ella, se le dice quién.
 */
export function vacioSinProfesionales({
  esProfesional,
  puedeCargarCatalogo,
}: {
  esProfesional: boolean;
  puedeCargarCatalogo: boolean;
}): PasoVacio {
  if (esProfesional) {
    return {
      titulo: "Tu usuario no tiene agenda",
      descripcion:
        "No está atado a ninguna profesional activa, así que no hay turnos para mostrarte. Pedile a quien administra el negocio que te asigne en el Catálogo.",
      accion: null,
    };
  }
  if (puedeCargarCatalogo) {
    return {
      titulo: "Todavía no hay profesionales",
      descripcion: "Para dar turnos, cargá en el Catálogo quién atiende, qué servicios hace y en qué box.",
      accion: { href: "/admin/catalogo", etiqueta: "Cargar profesionales" },
    };
  }
  return {
    titulo: "Todavía no hay profesionales",
    descripcion: "Para dar turnos hace falta cargar quién atiende. Lo hace la dueña o el dueño desde el Catálogo.",
    accion: null,
  };
}

/**
 * Un día sin turnos. Si el día ya pasó no se ofrece "dar un turno": el alta no lo impediría, pero
 * un turno nuevo en el pasado es casi siempre un error, y el link tampoco precarga esa fecha
 * (`leerNuevoTurno`). Se ofrece volver a hoy. Quien no gestiona la agenda (el profesional) no da
 * turnos.
 */
export function vacioDiaSinTurnos({
  fecha,
  hoy,
  puedeDarTurno,
}: {
  fecha: string;
  hoy: string;
  puedeDarTurno: boolean;
}): PasoVacio {
  const pasado = fecha < hoy;
  if (pasado) {
    return {
      titulo: "Ese día no hubo turnos",
      descripcion: "No quedó ningún turno cargado para ese día.",
      accion: { href: "/admin/turnos", etiqueta: "Ir a hoy" },
    };
  }
  return {
    titulo: fecha === hoy ? "Hoy no hay turnos" : "No hay turnos ese día",
    descripcion: puedeDarTurno
      ? "Si alguien pide un turno para ese día, se lo das desde acá y aparece en la agenda."
      : "Cuando te den un turno para ese día, aparece acá.",
    accion: puedeDarTurno ? { href: hrefNuevoTurno(fecha), etiqueta: "Dar un turno" } : null,
  };
}

/** "Mañana: confirmar" sin turnos: lo útil es mirar el día o darle uno a quien llame. */
export function vacioManana({ dia }: { dia: string }): PasoVacio {
  return {
    titulo: "Mañana no hay turnos para confirmar",
    descripcion: "No hay turnos reservados ni confirmados para mañana. Si alguien llama, se lo das desde acá.",
    accion: { href: hrefNuevoTurno(dia), etiqueta: "Dar un turno para mañana" },
  };
}

/**
 * Recordatorios sin servicios activos: cada servicio lleva su recordatorio, así que el paso es
 * cargarlos. El botón al Catálogo sólo para quien lo puede abrir.
 */
export function vacioSinServicios({ abreCatalogo }: { abreCatalogo: boolean }): PasoVacio {
  return {
    titulo: "Todavía no hay servicios activos",
    descripcion: abreCatalogo
      ? "Cada servicio lleva su recordatorio. Cargalos en el Catálogo y volvé para elegir cuándo se avisa."
      : "Cada servicio lleva su recordatorio. Los carga la dueña o el dueño desde el Catálogo.",
    accion: abreCatalogo ? { href: "/admin/catalogo", etiqueta: "Cargar servicios" } : null,
  };
}
