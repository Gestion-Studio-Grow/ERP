// ============================================================================
// LA CONFIGURACIÓN DEL CLUB — jornada y respaldo, usuarios y PIN, avisos, reglas, link y go-live. PURO.
// ============================================================================
//
// La consola y la pantalla de Ajustes del sistema de hoy (public/previews/breakpoint/club/app.mjs: `vistaConsola`,
// `tarjetaJornada`, `seccionArchivo`, `vistaAjustes`, `linkParaClientes` y sus acciones), para el dueño:
//   · JORNADA: cómo va lo guardado, «Descargar respaldo» (el sobre v1 de siempre), «Restaurar desde un archivo» (el
//     sobre v1 o el paquete `respaldo-y-archivo`, `respaldoDesdeArchivo` del motor; con la FECHA del respaldo y el
//     aviso de que reemplaza lo de ahora) y «Archivar días cerrados» (el contrato del almacén: `prepararArchivo` →
//     una descarga → elegir ese archivo → `confirmar`);
//   · USUARIOS Y ACCESOS: PIN inicial de los dueños, alta (el PIN se ve UNA vez), PIN nuevo, sacar acceso y cambiar
//     el mío. Nunca se muestra un PIN ajeno salvo el recién generado (va en `pinNuevo`, no en el aviso);
//   · AVISOS POR WHATSAPP: el celular de cada dueño, el WhatsApp del club y el alias para la seña;
//   · REGLAS, PRECIOS Y HORARIOS: la política, el bloqueo, las tarifas valle/pico, el fondo de caja y el horario por
//     día. Todo se valida ANTES de llamar al motor y se aplica entero o nada;
//   · LINK PARA CLIENTES: el turnero en modo pedido con el WhatsApp, las tarifas y la tienda de este club;
//   · LIMPIEZA PARA EL GO-LIVE: lo pendiente que la frena y, antes de limpiar, el respaldo descargado y ELEGIDO de
//     vuelta (se compara con el estado de ahora: no se repite el B1 del vanilla, que limpiaba sin saber si la
//     descarga había llegado);
//   · EMPEZAR OTRA JORNADA EN BLANCO (sólo la jornada real, un dueño): el mismo resguardo que la limpieza — el
//     respaldo de ahora descargado y ELEGIDO de vuelta — y recién ahí `almacen.empezarEnBlanco` (que además deja una
//     copia en este equipo). Regla del Gate (B1): nada se borra ni se reemplaza sin una copia FUERA del navegador que
//     el dueño eligió y el sistema verificó.
//
// Lo sensible (accesos, restaurar, limpiar, archivar) vuelve a pedir el PIN de quien opera, como el vanilla, y no
// se deshace. Ese PIN cuenta en EL tope del equipo (el del bloqueo, SEC-5): cada operación dice qué pasó con él
// (`pin: "bueno" | "malo" | null` y `duenio`, `evaluarPinDeQuienOpera`) y la pantalla la corre con `conTopeDePin`
// (tope-de-pin.ts): trabado no corre; malo suma; sólo un acierto de un dueño lo vuelve a cero. Lo que el motor no valida (la política, las tarifas, el alias, los contactos) lo controla esta capa con
// el permiso `configurar` del motor. Tests: configuracion-core.test.ts.
//
// PEDIDOS AL MOTOR / ALMACÉN (lo que acá se resuelve con lo que hay, sin inventar reglas nuevas):
//   · los contactos viven en `config.contactos` ({ [usuarioId]: celular, club: celular }): el motor no los conoce
//     (el vanilla los guardaba aparte en el navegador). Falta `ajustarContactos`, `ajustarTarifa` y `ajustarAlias`
//     con auth, y que `ajustarPolitica` pida auth;
//   · restaurar ya es del almacén (`almacen.restaurar`, terminales ee249978): copia lo de antes, reemplaza, revisa al
//     operador y guarda en el acto. Acá sólo se lee el archivo (`leerRespaldo`) y se dice el motivo (`motivoDeRestaurar`).
//
// PRIMERA VEZ (la consola de arranque del vanilla, `vistaConsola`): con la jornada real sin configurar
// (`config.configurado === false`) los dueños arman su PIN por `almacen.arranque` (sin auth), uno entra con el suyo y
// carga lo opcional por `ejecutar` (avisos, recepción, precios y fondo), y «Abrir el club» (`abrirElClub`) la cierra.

import { pinCoincide,
  LIMITES_BLOQUEO,
  LIMITES_POLITICA,
  NOMBRE_DIA,
  ROLES,
  VERSION_ESTADO,
  ajustarBloqueo,
  ajustarFondo,
  ajustarHorario,
  ajustarPolitica,
  altaUsuario,
  cambiarMiPin,
  definirPinInicial,
  diaParaArchivar,
  hhmm,
  hidratarEstado,
  huellaRespaldo,
  limpiarParaGoLive,
  pendientesGoLive,
  pesos,
  puede,
  regenerarPin,
  respaldoDesdeArchivo,
  USUARIOS_DEMO,
  revocarAcceso,
  secuenciaIds,
  terminarConfiguracion,
  usuario as usuarioDe,
  verificarFirma,
  largoPin,
  pinAceptadoPara,
  pinValidoPara,
} from "@/lib/club/motor.mjs";
import type { Ahora, Auth, ConfigClub, EstadoClub, Fecha, ReglaEditable, Rol, Usuario } from "@/lib/club/motor.mjs";
import type { Almacen, ArchivoPreparado, Desenlace, EstadoDelGuardado, ResultadoDeRestaurar, ResultadoDelArchivo } from "./almacen";
import type { DesenlaceConPin, ResultadoDelPin } from "./tope-de-pin";
import { leerMonto } from "./montos-core";
import { NOTA_CELULAR_RARO, enlaceWhatsApp } from "./whatsapp-core";

const dos = (n: number) => String(n).padStart(2, "0");
export const ddmm = (f: Fecha) => `${Number(f.slice(8))}/${Number(f.slice(5, 7))}`;
/** «2.345 KB», como el vanilla (redondeo para arriba). */
export const kb = (caracteres: number) => `${Math.ceil(Math.max(0, caracteres) / 1024).toLocaleString("es-AR")} KB`;
const no = (mensaje: string): Desenlace => ({ ok: false, mensaje });
/**
 * El PIN es del largo del rol (dueño 4, recepción 2: `largoPin` del motor). El de quien opera se acepta como esté
 * guardado (un dueño del piloto puede tener el viejo de 2: `pinAceptadoPara`); todo PIN nuevo va con el largo del rol.
 * Esto es sólo la forma (para no gastar al motor ni decir «incorrecto» a un PIN a medias): el motor verifica.
 */
const rolDeQuienOpera = (estado: EstadoClub, auth: Auth): Rol => (auth.usuarioId ? usuarioDe(estado, auth.usuarioId)?.rol : null) ?? "duenio";
const numerosDelPin = (rol: Rol) => `${largoPin(rol)} números`;

/** Qué pasó con el PIN de quien opera, para el tope del equipo (`conTopeDePin`, tope-de-pin.ts). */
export interface PinEvaluado {
  /** "bueno" o "malo"; null = no se llegó a evaluar (vacío, a medias, nadie adentro, otro control antes): no cuenta. */
  pin: ResultadoDelPin;
  /** El acierto es de un dueño con su PIN de 4: sólo ése vuelve el contador a cero. */
  duenio: boolean;
}

const SIN_EVALUAR: PinEvaluado = Object.freeze({ pin: null, duenio: false });

/**
 * El PIN de quien opera como FIRMA (`verificarFirma`), sin tocar nada. Lo que no tiene la forma de su rol no se evalúa.
 * El PIN viejo de 2 de un dueño es SU PIN (no suma un fallo), pero no firma, así que tampoco limpia (como el vanilla).
 */
export function evaluarPinDeQuienOpera(estado: EstadoClub, auth: Auth, pin: string): PinEvaluado {
  if (!auth.usuarioId) return SIN_EVALUAR;
  const limpio = String(pin ?? "").trim();
  if (!pinAceptadoPara(rolDeQuienOpera(estado, auth), limpio)) return SIN_EVALUAR;
  const f = verificarFirma(estado, auth.usuarioId, limpio);
  if (f.ok) return { pin: "bueno", duenio: f.usuario.rol === "duenio" };
  return { pin: "pinViejo" in f ? "bueno" : "malo", duenio: false };
}

/** El permiso de configurar del motor (dueños). */
const configura = (estado: EstadoClub, auth: Auth) => !!auth.usuarioId && puede(estado, auth.usuarioId, "configurar");

// ───────────── la jornada: lo guardado ─────────────

export interface VistaGuardado {
  titulo: string;
  detalle: string;
  /** ¿Hay que archivar ya? (lo guardado pasa del tope de aviso o no entró). */
  lleno: boolean;
  /** ¿Algo anda mal con el guardado? (para pintarlo de rojo). */
  mal: boolean;
}

export function vistaDelGuardado(g: EstadoDelGuardado, modo: "demo" | "real"): VistaGuardado {
  if (modo === "demo") {
    return { titulo: "Demo", detalle: "Son datos de ejemplo: lo que toques queda sólo en este equipo, para vos. El respaldo y el archivado funcionan igual, para probarlos.", lleno: false, mal: false };
  }
  const donde = g.enEsteEquipo ? "en este equipo" : "en el sistema (y una copia en este equipo)";
  const guardado =
    g.guardado === "sin-almacenamiento"
      ? "⚠ Este navegador no deja guardar: descargá un respaldo ya."
      : g.guardado === "reintentando"
        ? "⚠ No se pudo guardar: se está reintentando. Descargá un respaldo por las dudas."
        : `Se guarda solo ${donde}.${g.bytes > 0 ? ` Ocupa ${kb(g.bytes)} de unos 5.000 KB que guarda el navegador.` : ""}`;
  const jornada = g.jornada === "otra-pestania" ? " Está abierta en otra pestaña: acá sólo se mira." : g.jornada === "ilegible" ? " Lo guardado no se pudo leer: avisá a soporte." : "";
  return { titulo: "Jornada real", detalle: `${guardado}${jornada}`, lleno: g.lleno, mal: g.lleno || g.guardado !== "guardado" || g.jornada === "ilegible" };
}

// ───────────── nombres y fecha de los archivos ─────────────

/** «2026-10-17-0040»: el día y la hora de este equipo. */
export function sufijoDeArchivo(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}-${dos(d.getHours())}${dos(d.getMinutes())}`;
}
export const nombreDelRespaldo = (ms: number) => `breakpoint-jornada-${sufijoDeArchivo(ms)}.json`;
export const nombreDelArchivoParaArchivar = (ms: number) => `breakpoint-respaldo-y-archivo-${sufijoDeArchivo(ms)}.json`;
export const nombreDelRespaldoAntesDeLimpiar = (ms: number) => `breakpoint-jornada-antes-golive-${sufijoDeArchivo(ms)}.json`;
export const nombreDelRespaldoAntesDeBlanco = (ms: number) => `breakpoint-jornada-antes-de-blanco-${sufijoDeArchivo(ms)}.json`;

const DIAS_LARGOS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;

/** «sábado 17/10/2026 a las 00:40» (hora de este equipo), o null si no es una fecha. */
export function cuandoSeGuardo(ms: unknown): string | null {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return null;
  const d = new Date(ms);
  return `${DIAS_LARGOS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} a las ${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

/** El respaldo de siempre (sobre v1: `{ v, estado, secuencia, usuario, guardado }`), como texto para descargar. */
export function textoDelRespaldo(estado: EstadoClub, usuarioId: string | null, guardadoMs: number): string {
  return JSON.stringify({ v: VERSION_ESTADO, estado, secuencia: secuenciaIds(), usuario: usuarioId, guardado: guardadoMs });
}

// ───────────── restaurar ─────────────

export interface RespaldoParaRestaurar {
  /** El sobre v1 que se va a restaurar. */
  foto: unknown;
  /** Vino de un archivo para archivar: es la jornada de ANTES de archivar. */
  antesDeArchivar: boolean;
  /** «sábado 17/10/2026 a las 00:40», o null si el archivo no lo dice. */
  cuando: string | null;
  club: string;
  turnos: number;
  clientes: number;
  usuarios: number;
}

/** PIN de ejemplo de los dueños de la demo (están a la vista en la demo pública). */
const PINES_DE_DUENIO_DE_LA_DEMO = USUARIOS_DEMO.filter((u) => u.rol === "duenio").map((u) => u.pin);
/** ¿Algún dueño activo tiene un PIN de ejemplo de la demo? (= es la demo, o algo armado con ella). Con hash o en claro. */
const conPinesDeLaDemo = (e: Pick<EstadoClub, "usuarios" | "salPin">) =>
  e.usuarios.some((u) => u.rol === "duenio" && u.activo !== false && PINES_DE_DUENIO_DE_LA_DEMO.some((p) => pinCoincide(e as EstadoClub, u, p)));

/**
 * Lee el archivo elegido para restaurar (sin tocar nada): acepta el respaldo de siempre o el archivo para archivar;
 * el anexo solo no (lo explica el motor). Dice de cuándo es y qué trae.
 *
 * `actual` (la jornada de ahora): si el respaldo es de OTRO club (`config.nombre` distinto, y los dos lo dicen) o es la
 * DEMO (dueños con los PIN de ejemplo, sobre una jornada que no los tiene), no se restaura. El nombre lo pone el motor al armar el club y nadie lo cambia: es lo único del sobre v1 que dice de qué
 * negocio es (el formato no lleva el negocio; ver el ensayo del pase, PASE-AL-ERP.md).
 */
export function leerRespaldo(texto: string, actual?: Pick<EstadoClub, "config" | "usuarios"> | null): { ok: true; respaldo: RespaldoParaRestaurar } | { ok: false; mensaje: string } {
  let datos: unknown;
  try {
    datos = JSON.parse(texto);
  } catch {
    return { ok: false, mensaje: "Ese archivo no es un respaldo del club (no se puede leer)." };
  }
  const r = respaldoDesdeArchivo(datos);
  if (!r.ok) return { ok: false, mensaje: r.motivo };
  const h = hidratarEstado(r.foto);
  if (!h.ok) return { ok: false, mensaje: `Ese archivo no sirve: ${h.motivo}.` };
  // El respaldo de adentro del archivo para archivar trae su `guardado` (desde terminales ee249978); si es de antes y
  // no lo trae, vale cuándo se preparó el archivado.
  let cuando = cuandoSeGuardo((r.foto as { guardado?: unknown }).guardado);
  const generado = r.antesDeArchivar ? (datos as { anexo?: { generado?: { fecha?: unknown; min?: unknown } | null } }).anexo?.generado : null;
  if (!cuando && generado && typeof generado.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(generado.fecha)) {
    const f = generado.fecha;
    cuando = `${Number(f.slice(8))}/${Number(f.slice(5, 7))}/${f.slice(0, 4)}${typeof generado.min === "number" ? ` a las ${hhmm(generado.min)}` : ""} (cuando se preparó el archivado)`;
  }
  const e = h.estado;
  const deEste = actual?.config.nombre?.trim() ?? "";
  const deAhi = e.config.nombre?.trim() ?? "";
  if (deEste && deAhi && deEste !== deAhi) return { ok: false, mensaje: `Ese respaldo es de «${deAhi}», no de «${deEste}»: no se restaura. Elegí un respaldo de este club.` };
  // La demo: sus dueños tienen los PIN de ejemplo que están a la vista en la demo pública (un dueño real no puede
  // elegirlos: `pinFacil`). Restaurarla sobre una jornada de verdad dejaría entrar a cualquiera con esos PIN.
  if (actual && !conPinesDeLaDemo(actual) && conPinesDeLaDemo(e))
    return { ok: false, mensaje: "Ese es un respaldo de la demo (datos y PIN de ejemplo): no se restaura sobre la jornada de verdad. Elegí un respaldo de este club." };
  return {
    ok: true,
    respaldo: {
      foto: r.foto,
      antesDeArchivar: r.antesDeArchivar,
      cuando,
      club: e.config.nombre ?? "",
      turnos: e.reservas.length,
      clientes: e.clientes.filter((c) => c.activo !== false).length,
      usuarios: e.usuarios.filter((u) => u.activo !== false).length,
    },
  };
}

/**
 * ¿Quien opera es un dueño con ESTE PIN? (lo que el vanilla pedía en cada ventana sensible). Es una FIRMA
 * (`verificarFirma`): con el PIN viejo de 2 el dueño entra, pero no limpia ni empieza en blanco.
 */
export function pinDeDuenio(estado: EstadoClub, auth: Auth, pin: string, quien: string): ({ ok: true; usuario: Usuario; auth: Auth } | { ok: false; mensaje: string }) & PinEvaluado {
  const p = evaluarPinDeQuienOpera(estado, auth, pin);
  if (!auth.usuarioId) return { ok: false, mensaje: "Entrá con tu PIN para operar.", ...p };
  const limpio = pin.trim();
  const rol = rolDeQuienOpera(estado, auth);
  if (!pinAceptadoPara(rol, limpio)) return { ok: false, mensaje: `Poné tu PIN (${numerosDelPin(rol)}).`, ...p };
  const v = verificarFirma(estado, auth.usuarioId, limpio);
  if (!v.ok) return { ok: false, mensaje: v.motivo, ...p };
  if (v.usuario.rol !== "duenio") return { ok: false, mensaje: `${quien} lo hace un dueño.`, ...p };
  return { ok: true, usuario: v.usuario, auth: { usuarioId: auth.usuarioId, pin: limpio }, ...p };
}

/**
 * El paso 1 (descargar) de la limpieza y de empezar en blanco: un dueño con ESTE PIN (`pinDeDuenio`), como desenlace
 * para correr con `conTopeDePin`; `usuarioId` es el dueño, si salió.
 */
export type DuenioConPin = DesenlaceConPin & { usuarioId?: string };

export function duenioConPin(estado: EstadoClub, auth: Auth, pin: string, quien: string): DuenioConPin {
  const p = pinDeDuenio(estado, auth, pin, quien);
  return p.ok ? { ok: true, mensaje: "", pin: p.pin, duenio: p.duenio, usuarioId: p.usuario.id } : { ok: false, mensaje: p.mensaje, pin: p.pin, duenio: p.duenio };
}

/** Lo que se le dice al dueño si `almacen.restaurar` no restauró (por qué, en criollo). */
export function motivoDeRestaurar(r: Extract<ResultadoDeRestaurar, { ok: false }>): string {
  if (r.causa === "sin-lugar") return "No hay lugar para guardar una copia de lo de ahora: archivá o descargá y borrá copias antes de restaurar. No se tocó nada.";
  return r.motivo;
}

/**
 * El aviso después de restaurar: el del almacén alcanza (null); si era la jornada de ANTES de archivar, se suma qué
 * hacer si se vuelve a llenar.
 */
export function avisoDeRestaurado(antesDeArchivar: boolean): string | null {
  return antesDeArchivar
    ? "Listo: se restauró la jornada de antes de archivar (lo de antes quedó copiado en este equipo). Si avisa que se llena, archivá de nuevo."
    : null;
}

// ───────────── archivar días cerrados ─────────────

export interface VistaArchivo {
  /** Hasta qué día se propone archivar (más de 3 semanas). */
  hasta: Fecha;
  /** Una línea por día archivado, del más nuevo al más viejo: fecha, turnos y lo cobrado. */
  dias: { dia: Fecha; texto: string }[];
  /** El último archivado: hasta cuándo, cuándo y quién. */
  ultimo: string | null;
  firma: string;
}

export function armarArchivo(estado: EstadoClub, ahora: Ahora): VistaArchivo {
  const hasta = diaParaArchivar(estado, ahora);
  const dias = [...(estado.archivo?.dias ?? [])].reverse().map((f) => ({
    dia: f.dia,
    texto: `${ddmm(f.dia)} · ${f.turnos} ${f.turnos === 1 ? "turno" : "turnos"} · cobrado ${pesos(f.cobradoCanchas + f.cobradoCuentas)}`,
  }));
  const u = estado.archivo?.anexos?.at(-1);
  const ultimo = u ? `Último archivo: hasta el ${ddmm(u.hasta)}${u.fecha ? `, hecho el ${ddmm(u.fecha)}` : ""}${u.por ? ` por ${u.por}` : ""} (${u.conteos?.reservas ?? 0} turnos).` : null;
  return { hasta, dias, ultimo, firma: `${hasta}|${dias.length}|${ultimo ?? ""}|${dias[0]?.texto ?? ""}` };
}

/**
 * El auth para archivar, restaurar y lo de Usuarios: quien opera con el PIN que tipeó. Es una FIRMA: el PIN viejo de 2
 * de un dueño se frena acá (`verificarFirma`), porque el almacén, al archivar y restaurar, controla con `verificarPin`
 * (el motor no valida quién archiva). Un PIN mal sigue de largo: lo dice el que firma (almacén o motor).
 */
export function authParaArchivar(estado: EstadoClub, auth: Auth, pin: string): ({ ok: true; auth: Auth } | { ok: false; mensaje: string }) & PinEvaluado {
  const p = evaluarPinDeQuienOpera(estado, auth, pin);
  if (!auth.usuarioId) return { ok: false, mensaje: "Entrá con tu PIN para operar.", ...p };
  const rol = rolDeQuienOpera(estado, auth);
  const limpio = pin.trim();
  if (!pinAceptadoPara(rol, limpio)) return { ok: false, mensaje: `Poné tu PIN (${numerosDelPin(rol)}).`, ...p };
  const f = verificarFirma(estado, auth.usuarioId, limpio);
  if (!f.ok && "pinViejo" in f) return { ok: false, mensaje: f.motivo, ...p };
  return { ok: true, auth: { usuarioId: auth.usuarioId, pin: limpio }, ...p };
}

/**
 * Restaurar un respaldo con el PIN de quien opera, para correr con `conTopeDePin`: el formato y el PIN viejo se frenan
 * acá (`authParaArchivar`); el resto lo controla `almacen.restaurar` (rol OWNER + PIN de un dueño). Dice qué pasó con
 * el PIN aunque el almacén diga que no por otra cosa.
 */
export function restaurarConPin(almacen: Pick<Almacen, "estado" | "auth" | "restaurar">, respaldo: unknown, pin: string): DesenlaceConPin {
  const a = authParaArchivar(almacen.estado(), almacen.auth(), pin);
  const p = { pin: a.pin, duenio: a.duenio };
  if (!a.ok) return { ok: false, mensaje: a.mensaje, ...p };
  const r = almacen.restaurar(respaldo, { auth: a.auth });
  return r.ok ? { ok: true, mensaje: "", ...p } : { ok: false, mensaje: motivoDeRestaurar(r), ...p };
}

/** El paso 1 del archivado con el PIN de quien opera (como `restaurarConPin`); `resultado` es lo de `prepararArchivo`. */
export type ArchivoConPin = DesenlaceConPin & { resultado?: ResultadoDelArchivo | ArchivoPreparado };

export function prepararArchivoConPin(almacen: Pick<Almacen, "estado" | "auth" | "prepararArchivo">, pin: string): ArchivoConPin {
  const a = authParaArchivar(almacen.estado(), almacen.auth(), pin);
  const p = { pin: a.pin, duenio: a.duenio };
  if (!a.ok) return { ok: false, mensaje: a.mensaje, ...p };
  const resultado = almacen.prepararArchivo({ auth: a.auth });
  return resultado.ok ? { ok: true, mensaje: "", resultado, ...p } : { ok: false, mensaje: resultado.motivo, resultado, ...p };
}

/** Qué hace la pantalla con lo que devolvió `confirmar` (paso 2). */
export type DespuesDeConfirmar = { tipo: "ignorar" } | { tipo: "volver"; motivo: string } | { tipo: "error"; motivo: string } | { tipo: "listo"; mensaje: string };

export function despuesDeConfirmar(r: ResultadoDelArchivo, nombre: string): DespuesDeConfirmar {
  if (!r.ok) {
    // Doble clic (o ya se confirmó): en silencio. Cambió algo de esos días: hay que descargar de nuevo (paso 1).
    if (r.causa === "repetido") return { tipo: "ignorar" };
    if (r.causa === "cambio") return { tipo: "volver", motivo: r.motivo };
    return { tipo: "error", motivo: r.motivo };
  }
  const c = r.conteos;
  return {
    tipo: "listo",
    mensaje: `Archivo verificado: achicado. Quedó archivado hasta el ${ddmm(r.hasta)}: ${c.reservas} turnos, ${c.cuentas} cuentas y ${c.movimientos} movimientos de caja (${kb(r.bytesAntes)} → ${kb(r.bytesDespues)}). Guardá ${nombre} en un lugar privado: tiene los datos de los clientes.`,
  };
}

// ───────────── usuarios y accesos ─────────────

const PUEDE: Record<Rol, string> = {
  duenio: "Todo: pagos a proveedores, cuentas corrientes, accesos y configuración",
  recepcion: "Agenda, cobros, buffet, remitos, egreso en efectivo y cierre de caja",
};

export interface FilaUsuario {
  id: string;
  nombre: string;
  rol: Rol;
  rolTexto: string;
  puede: string;
  tienePin: boolean;
  esVos: boolean;
  /** No a uno mismo ni al último dueño (lo mismo controla el motor). */
  puedeSacar: boolean;
}

export interface VistaUsuarios {
  filas: FilaUsuario[];
  /** Dueños que todavía no armaron su PIN (Roberto y Majo al arrancar la jornada real). */
  duenosSinPin: { id: string; nombre: string }[];
  /** Pedidos de acceso esperando: se dan desde el Tablero. */
  pedidosDeAcceso: number;
  firma: string;
}

export function armarUsuarios(estado: EstadoClub, operadorId: string | null): VistaUsuarios {
  const activos = estado.usuarios.filter((u) => u.activo !== false);
  const duenos = activos.filter((u) => u.rol === "duenio").length;
  const filas = activos.map((u) => ({
    id: u.id,
    nombre: u.nombre,
    rol: u.rol,
    rolTexto: ROLES[u.rol] ?? u.rol,
    puede: PUEDE[u.rol] ?? "",
    tienePin: !!u.pin,
    esVos: u.id === operadorId,
    puedeSacar: u.id !== operadorId && !(u.rol === "duenio" && duenos <= 1),
  }));
  const duenosSinPin = activos.filter((u) => u.rol === "duenio" && !u.pin).map((u) => ({ id: u.id, nombre: u.nombre }));
  const pedidosDeAcceso = estado.solicitudesAcceso.filter((s) => s.estado === "pendiente").length;
  // Sin PIN en la firma: lo que cambia la vista es si tiene o no.
  const firma = JSON.stringify([operadorId, pedidosDeAcceso, filas.map((f) => [f.id, f.nombre, f.rol, f.tienePin])]);
  return { filas, duenosSinPin, pedidosDeAcceso, firma };
}

// ───────────── primera vez: la consola de arranque ─────────────

export interface DuenioDelArranque {
  id: string;
  nombre: string;
  /** El primer nombre: «Entrar como Roberto». */
  corto: string;
  tienePin: boolean;
}

export interface VistaArranque {
  /** Los dueños (Roberto y Majo en la jornada real) y si ya armaron su PIN. */
  duenos: DuenioDelArranque[];
  /** ¿Se puede abrir el club? Lo mismo que pide el motor: al menos un dueño con PIN. */
  puedeAbrir: boolean;
  /** Lo opcional, para la lista de quien entró: ¿cargó algún celular o el alias? */
  avisos: boolean;
  /** Quiénes de recepción tienen acceso. */
  recepcion: string[];
  /** «valle $ 18.000 y pico $ 24.000» (por hora). */
  precios: string;
  fondo: string;
  firma: string;
}

/** Lo que muestra «Primera vez: armá el club» (como la consola del vanilla). Nunca lleva un PIN. */
export function armarArranque(estado: EstadoClub): VistaArranque {
  const activos = estado.usuarios.filter((u) => u.activo !== false);
  const duenos = activos.filter((u) => u.rol === "duenio").map((u) => ({ id: u.id, nombre: u.nombre, corto: u.nombre.split(" ")[0], tienePin: !!u.pin }));
  const avisos = Object.keys(contactosDe(estado)).length > 0 || !!estado.config.cobro?.alias;
  const recepcion = activos.filter((u) => u.rol === "recepcion").map((u) => u.nombre);
  const precios = estado.config.tarifas.map((t) => `${t.nombre.toLowerCase()} ${pesos(t.precioHora)}`).join(" y ");
  const fondo = pesos(estado.caja.fondo ?? 0);
  const puedeAbrir = duenos.some((d) => d.tienePin);
  return { duenos, puedeAbrir, avisos, recepcion, precios, fondo, firma: JSON.stringify([duenos, avisos, recepcion, precios, fondo]) };
}

/**
 * «Abrir el club»: termina la configuración inicial (el motor pide al menos un dueño con PIN). Sin auth corre por
 * `almacen.arranque`; con quien entró, por `ejecutar`, y entonces tiene que ser un dueño.
 */
export function abrirElClub(estado: EstadoClub, ahora: Ahora, auth: Auth = {}): Desenlace {
  if (estado.config.configurado !== false) return no("El club ya está abierto.");
  if (auth.usuarioId && !configura(estado, auth)) return no("El club lo abre un dueño.");
  const r = terminarConfiguracion(estado, ahora);
  return r.ok ? { ok: true, mensaje: "Listo: el club quedó abierto. La pantalla se bloquea: entrá con tu PIN." } : no(r.motivo);
}

// ───────────── avisos por WhatsApp ─────────────

export type ConfigConContactos = ConfigClub & { contactos?: Record<string, string> };

/** Los celulares cargados: `{ [usuarioId del dueño]: celular, club: celular }` (sólo dígitos). */
export function contactosDe(estado: EstadoClub): Record<string, string> {
  const c = (estado.config as ConfigConContactos).contactos;
  return c && typeof c === "object" ? c : {};
}

/** El celular de un dueño (para mandarle el pedido de crédito por WhatsApp), o "". */
export const celularDelDuenio = (estado: EstadoClub, usuarioId: string) => contactosDe(estado)[usuarioId] ?? "";

/** Si el número cargado no sirve para abrir el chat directo, por qué (lo mismo que dice el botón de WhatsApp). */
export function notaDelCelular(tel: string): string | null {
  if (!tel.trim()) return null;
  return enlaceWhatsApp(tel, "", "real").nota === NOTA_CELULAR_RARO ? "No parece un celular argentino: WhatsApp abriría para elegir el chat. Revisalo (ej.: 11 2345-6789)." : null;
}

/** Alias de CBU/CVU: de 6 a 20 letras, números, puntos o guiones. */
const ALIAS = /^[a-z0-9.-]{6,20}$/i;

// ───────────── reglas, precios y horarios ─────────────

export const REGLAS: readonly { clave: ReglaEditable; etiqueta: string; ayuda?: string }[] = [
  { clave: "horasCancelacionLibre", etiqueta: "Cancelar sin perder la seña hasta (horas antes)" },
  { clave: "senaPct", etiqueta: "Seña (% del turno)" },
  { clave: "strikesParaSena", etiqueta: "Faltas para pedir seña siempre" },
  { clave: "toleranciaMin", etiqueta: "Tolerancia de llegada antes de la falta (minutos)" },
  { clave: "minutosAntesParaEntrar", etiqueta: "Abrir la cancha hasta (minutos antes)", ayuda: "Vacío = sin límite." },
];

export interface ValoresReglas {
  politica: Record<ReglaEditable, string>;
  bloqueoMin: string;
  /** El precio por hora de cada tarifa, en el orden de `config.tarifas`. */
  tarifas: string[];
  fondo: string;
}

/** Lo que muestra el formulario de reglas (como texto, para editar). */
export function valoresDeReglas(estado: EstadoClub): ValoresReglas {
  const p = estado.config.politica;
  return {
    politica: Object.fromEntries(REGLAS.map((r) => [r.clave, p[r.clave] == null ? "" : String(p[r.clave])])) as Record<ReglaEditable, string>,
    bloqueoMin: String(estado.config.bloqueoMin ?? 5),
    tarifas: estado.config.tarifas.map((t) => String(t.precioHora)),
    fondo: String(estado.caja.fondo ?? 0),
  };
}

export const etiquetaTarifa = (t: { nombre: string; desde: number; hasta: number }) => `Precio por hora ${t.nombre.toLowerCase()} (${hhmm(t.desde)} a ${hhmm(t.hasta)})`;

/** Las horas para elegir, cada `paso` minutos (la madrugada con «+1», como el vanilla). */
export function opcionesDeHora(desde: number, hasta: number, paso: number): { valor: number; etiqueta: string }[] {
  const out: { valor: number; etiqueta: string }[] = [];
  for (let m = desde; m <= hasta; m += paso) out.push({ valor: m, etiqueta: `${hhmm(m)}${m >= 1440 ? " (+1)" : ""}` });
  return out;
}
export const ABRE_DESDE = 0;
export const ABRE_HASTA = 23 * 60;
export const CIERRA_DESDE = 9 * 60;
export const CIERRA_HASTA = 26 * 60;
/** Lunes primero, domingo al final (como el vanilla). */
export const DIAS_DE_LA_SEMANA = [1, 2, 3, 4, 5, 6, 0] as const;
export const nombreDelDia = (d: number) => NOMBRE_DIA[d] ?? "";

// ───────────── link para clientes ─────────────

/**
 * El link del turnero para los clientes (`/turnero?modo=pedido…`) con el WhatsApp del club, las tarifas y la tienda
 * de ESTE club: el celular del cliente no se conecta con el club, así que lo que ve sale del link (como el vanilla).
 * `origen` es la dirección del club (la del sitio, donde vive `/turnero`).
 */
export function linkParaClientes(estado: EstadoClub, origen: string): string {
  const q = new URLSearchParams({ modo: "pedido" });
  const club = (contactosDe(estado).club ?? "").replace(/\D/g, "");
  if (club) q.set("wa", club);
  q.set("tar", estado.config.tarifas.map((t) => `${t.desde}-${t.hasta}-${t.precioHora}`).join(","));
  const cat = estado.productos.filter((p) => p.tienda && p.activo !== false && !p.alquiler && !p.plato && p.stock !== 0).map((p) => `${p.id}:${p.precio}`);
  if (cat.length) q.set("cat", cat.join(","));
  return `${origen.replace(/\/+$/, "")}/turnero?${q.toString()}`;
}

// ───────────── limpieza para el go-live ─────────────

export interface VistaGoLive {
  /** Lo que la frena (en criollo, del motor). Vacío = se puede. */
  pendientes: string[];
  /** «hecha el 20/10 por Majo», si ya se hizo. */
  hecha: string | null;
  firma: string;
}

export function armarGoLive(estado: EstadoClub, ahora: Ahora): VistaGoLive {
  const pendientes = pendientesGoLive(estado, ahora);
  const g = estado.config.goLive;
  const hecha = g ? `hecha${g.fecha ? ` el ${ddmm(g.fecha)}` : ""}${g.por ? ` por ${g.por}` : ""}` : null;
  return { pendientes, hecha, firma: JSON.stringify([pendientes, hecha]) };
}

/**
 * El respaldo de ahora para descargar ANTES de algo que no se deshace (la limpieza del go-live, empezar en blanco):
 * UNA descarga, y después el dueño elige ese archivo (`verificarRespaldoElegido`).
 */
export interface RespaldoParaVerificar {
  texto: string;
  /** Huella del estado de ese momento: el archivo elegido tiene que ser éste. */
  huella: string;
  nombre: string;
}
export type RespaldoAntesDeLimpiar = RespaldoParaVerificar;

function respaldoParaVerificar(estado: EstadoClub, usuarioId: string | null, ms: number, nombre: string): RespaldoParaVerificar {
  return { texto: textoDelRespaldo(estado, usuarioId, ms), huella: huellaRespaldo(estado), nombre };
}

/** Paso 1 de la limpieza: el respaldo completo de ahora para descargar (UNA descarga). */
export const respaldoAntesDeLimpiar = (estado: EstadoClub, usuarioId: string | null, ms: number) =>
  respaldoParaVerificar(estado, usuarioId, ms, nombreDelRespaldoAntesDeLimpiar(ms));
/** Paso 1 de empezar en blanco: lo mismo, con su nombre. */
export const respaldoAntesDeBlanco = (estado: EstadoClub, usuarioId: string | null, ms: number) =>
  respaldoParaVerificar(estado, usuarioId, ms, nombreDelRespaldoAntesDeBlanco(ms));

/** Para qué se pide el respaldo, en los mensajes: quién lo hace, qué no se hace sin él y cómo se llama el archivo. */
export interface ParaQue {
  /** «La limpieza» / «Empezar en blanco». */
  que: string;
  /** «La limpieza la hace un dueño.» / «Empezar en blanco lo hace un dueño.» */
  soloDuenio: string;
  /** «no se limpia nada» / «no se empieza nada». */
  sinEso: string;
  /** El nombre del archivo que se bajó, con «…» en la fecha. */
  archivo: string;
}
export const PARA_LIMPIAR: ParaQue = { que: "La limpieza", soloDuenio: "La limpieza la hace un dueño.", sinEso: "no se limpia nada", archivo: "breakpoint-jornada-antes-golive-….json" };
export const PARA_BLANCO: ParaQue = { que: "Empezar en blanco", soloDuenio: "Empezar en blanco lo hace un dueño.", sinEso: "no se empieza nada", archivo: "breakpoint-jornada-antes-de-blanco-….json" };

export type VerificacionDelRespaldo = { ok: true } | { ok: false; causa: "otro" | "danado" | "cambio"; motivo: string };

/**
 * Paso 2: ¿el archivo elegido es el respaldo de la jornada TAL COMO ESTÁ AHORA? Si es el que se descargó pero algo
 * cambió en el medio (se cobró, se cargó un turno), hay que descargar de nuevo: si no, la limpieza (o la jornada en
 * blanco) se llevaría algo que no quedó en el respaldo.
 */
export function verificarRespaldoElegido(estado: EstadoClub, textoElegido: string, huellaDescargada: string, para: ParaQue = PARA_LIMPIAR): VerificacionDelRespaldo {
  let elegido: { v?: unknown; estado?: unknown } | null;
  try {
    elegido = JSON.parse(textoElegido) as { v?: unknown; estado?: unknown } | null;
  } catch {
    return { ok: false, causa: "danado", motivo: "Ese archivo está incompleto o dañado (no se puede leer): descargá el respaldo de nuevo y elegí el nuevo." };
  }
  if (!elegido || typeof elegido !== "object" || elegido.v !== VERSION_ESTADO || !elegido.estado || typeof elegido.estado !== "object")
    return { ok: false, causa: "otro", motivo: `Ese no es el respaldo que se descargó recién: elegí el «${para.archivo}».` };
  const huella = huellaRespaldo(elegido.estado);
  if (huella === huellaRespaldo(estado)) {
    // Tiene que servir para «Restaurar» si hace falta volver atrás.
    if (!hidratarEstado(elegido).ok) return { ok: false, causa: "danado", motivo: "Ese respaldo no se puede restaurar: descargalo de nuevo." };
    return { ok: true };
  }
  if (huella === huellaDescargada) return CAMBIO_DESDE_EL_RESPALDO;
  return NO_ES_EL_ULTIMO;
}

const CAMBIO_DESDE_EL_RESPALDO: VerificacionDelRespaldo = {
  ok: false,
  causa: "cambio",
  motivo: "Cambió algo desde que descargaste el respaldo (se cobró o se cargó algo): descargalo de nuevo y elegí el nuevo.",
};
const NO_ES_EL_ULTIMO: VerificacionDelRespaldo = { ok: false, causa: "otro", motivo: "Ese archivo no es el respaldo que descargaste recién: elegí el último que bajaste." };

/**
 * Paso 2, en la pantalla: el archivo elegido es un respaldo que se puede restaurar → su HUELLA (lo que lleva el comando
 * «golive»: el archivo es el club entero y no viaja en la cola ni en la foto). Que la huella sea la de la jornada de
 * ahora lo mira el comando al correr (`limpiarPorHuella`), también al re-aplicarse sobre la base.
 */
export function huellaDelElegido(textoElegido: string, para: ParaQue = PARA_LIMPIAR): { ok: true; huella: string } | { ok: false; causa: "otro" | "danado"; motivo: string } {
  let elegido: { v?: unknown; estado?: unknown } | null;
  try {
    elegido = JSON.parse(textoElegido) as { v?: unknown; estado?: unknown } | null;
  } catch {
    return { ok: false, causa: "danado", motivo: "Ese archivo está incompleto o dañado (no se puede leer): descargá el respaldo de nuevo y elegí el nuevo." };
  }
  if (!elegido || typeof elegido !== "object" || elegido.v !== VERSION_ESTADO || !elegido.estado || typeof elegido.estado !== "object")
    return { ok: false, causa: "otro", motivo: `Ese no es el respaldo que se descargó recién: elegí el «${para.archivo}».` };
  if (!hidratarEstado(elegido).ok) return { ok: false, causa: "danado", motivo: "Ese respaldo no se puede restaurar: descargalo de nuevo." };
  return { ok: true, huella: huellaRespaldo(elegido.estado) };
}

/** Lo que trae la pantalla para algo que no se deshace: el PIN de quien opera y el respaldo de los dos pasos. */
export interface RespaldoDeDosPasos {
  pin: string;
  /** El respaldo descargado en el paso 1 (null: todavía no se descargó). */
  descargado: Pick<RespaldoParaVerificar, "huella" | "nombre"> | null;
  /** El texto del archivo elegido en el paso 2 (null: no se eligió). */
  textoElegido: string | null;
}

type DosPasosListos = { ok: true; auth: Auth; descargado: Pick<RespaldoParaVerificar, "huella" | "nombre">; textoElegido: string };

/**
 * Lo común a la limpieza y a empezar en blanco, ANTES de tocar nada: el puesto del dueño, quien opera es un dueño con
 * ESTE PIN y los dos pasos hechos (descargado y elegido). Que el archivo sea la jornada de ahora lo dice
 * `verificarRespaldoElegido`.
 */
function duenioConLosDosPasos(estado: EstadoClub, pedido: RespaldoDeDosPasos, auth: Auth, rolPanel: string, para: ParaQue): (DosPasosListos | { ok: false; mensaje: string }) & PinEvaluado {
  if (rolPanel !== "OWNER") return { ok: false, mensaje: para.soloDuenio, ...SIN_EVALUAR };
  const d = pinDeDuenio(estado, auth, pedido.pin, para.que);
  const p = { pin: d.pin, duenio: d.duenio };
  if (!d.ok) return { ok: false, mensaje: d.mensaje, ...p };
  if (!pedido.descargado) return { ok: false, mensaje: "Primero descargá el respaldo (paso 1).", ...p };
  if (pedido.textoElegido == null) return { ok: false, mensaje: `Elegí el respaldo que descargaste (paso 2): sin eso ${para.sinEso}.`, ...p };
  return { ok: true, auth: d.auth, descargado: pedido.descargado, textoElegido: pedido.textoElegido, ...p };
}

export interface PedidoDeLimpieza extends RespaldoDeDosPasos {
  conservarSaldos: boolean;
  conservarStock: boolean;
}

export type DesenlaceLimpieza = DesenlaceConPin & { causa?: "otro" | "danado" | "cambio" };

/** Paso 2 de la limpieza: verifica el respaldo elegido contra el estado de ahora y recién ahí limpia. Dice qué pasó con el PIN. */
export function limpiarConRespaldo(estado: EstadoClub, pedido: PedidoDeLimpieza, ahora: Ahora, auth: Auth, rolPanel: string): DesenlaceLimpieza {
  return limpiar(estado, pedido, ahora, auth, rolPanel, (texto, descargada) => verificarRespaldoElegido(estado, texto, descargada, PARA_LIMPIAR));
}

/**
 * La limpieza como comando («golive», comandos-core.ts): con la huella del respaldo elegido (`huellaDelElegido`) en vez
 * del archivo, y el rol del panel en el pedido (el comando corre sin el almacén). Lo demás, igual que `limpiarConRespaldo`.
 */
export interface PedidoDeLimpiezaPorHuella extends Omit<PedidoDeLimpieza, "textoElegido"> {
  huellaElegida: string | null;
  rol: string;
}

export function limpiarPorHuella(estado: EstadoClub, pedido: PedidoDeLimpiezaPorHuella, ahora: Ahora, auth: Auth): DesenlaceLimpieza {
  const { huellaElegida, rol, ...resto } = pedido;
  return limpiar(estado, { ...resto, textoElegido: huellaElegida }, ahora, auth, rol, (huella, descargada) =>
    huella === huellaRespaldo(estado) ? { ok: true } : huella === descargada ? CAMBIO_DESDE_EL_RESPALDO : NO_ES_EL_ULTIMO,
  );
}

function limpiar(estado: EstadoClub, pedido: PedidoDeLimpieza, ahora: Ahora, auth: Auth, rolPanel: string, verificar: (elegido: string, huellaDescargada: string) => VerificacionDelRespaldo): DesenlaceLimpieza {
  const d = duenioConLosDosPasos(estado, pedido, auth, rolPanel, PARA_LIMPIAR);
  const p = { pin: d.pin, duenio: d.duenio };
  if (!d.ok) return { ...no(d.mensaje), ...p };
  const pendientes = pendientesGoLive(estado, ahora);
  if (pendientes.length) return { ...no(`Antes de limpiar hay que resolver: ${pendientes.join(" ")}`), ...p };
  const v = verificar(d.textoElegido, d.descargado.huella);
  if (!v.ok) return { ok: false, mensaje: v.motivo, causa: v.causa, ...p };
  const r = limpiarParaGoLive(estado, { conservarSaldos: pedido.conservarSaldos, conservarStock: pedido.conservarStock }, d.auth, ahora);
  if (!r.ok) return { ...no(r.motivo), ...p };
  const b = r.borrado;
  return {
    ...p,
    ok: true,
    mensaje: `Respaldo verificado: limpieza hecha. Se borraron ${b.turnos} turnos, ${b.cuentas} cuentas y ${b.movimientos} movimientos de caja; quedaron ${b.quedan} turnos por jugar (con su seña)${pedido.conservarSaldos ? "" : " y los saldos en cero"}. Guardá ${d.descargado.nombre} en un lugar privado.`,
  };
}

// ───────────── empezar otra jornada en blanco ─────────────

/** Lo que dice la pantalla antes de empezar en blanco (qué pasa, en criollo). */
export const QUE_PASA_EN_BLANCO = "Se empieza de cero: hay que volver a armar los PIN. Lo de ahora queda en el respaldo que bajaste y en una copia en esta compu.";

export type AutorizacionEnBlanco = ({ ok: true; auth: Auth } | { ok: false; mensaje: string; causa?: "otro" | "danado" | "cambio" }) & PinEvaluado;

/**
 * Paso 2 de «Empezar otra jornada en blanco»: un dueño (puesto y PIN) con el respaldo de AHORA descargado y elegido de
 * vuelta. Devuelve el auth para `almacen.empezarEnBlanco`, que la pantalla llama en el mismo momento (sin nada en el
 * medio que pueda cambiar la jornada) y que vuelve a controlar el puesto y el PIN. Con `causa: "cambio"`, la
 * pantalla vuelve al paso 1.
 */
export function autorizarEnBlanco(estado: EstadoClub, pedido: RespaldoDeDosPasos, auth: Auth, rolPanel: string): AutorizacionEnBlanco {
  // Que sea la jornada real lo controla el almacén (por el reloj con el que se armó): la demo dice que no.
  const d = duenioConLosDosPasos(estado, pedido, auth, rolPanel, PARA_BLANCO);
  const p = { pin: d.pin, duenio: d.duenio };
  if (!d.ok) return { ok: false, mensaje: d.mensaje, ...p };
  const v = verificarRespaldoElegido(estado, d.textoElegido, d.descargado.huella, PARA_BLANCO);
  if (!v.ok) return { ok: false, mensaje: v.motivo, causa: v.causa, ...p };
  return { ok: true, auth: d.auth, ...p };
}

/**
 * Paso 2 de «Empezar en blanco» con el tope: autoriza (`autorizarEnBlanco`) y, en el mismo momento, `empezarEnBlanco`
 * del almacén. Para correr con `conTopeDePin`; `causa: "cambio"` = volver al paso 1.
 */
export function empezarEnBlancoConPin(almacen: Pick<Almacen, "estado" | "auth" | "rol" | "empezarEnBlanco">, pedido: RespaldoDeDosPasos): DesenlaceConPin & { causa?: "otro" | "danado" | "cambio" } {
  const v = autorizarEnBlanco(almacen.estado(), pedido, almacen.auth(), almacen.rol());
  const p = { pin: v.pin, duenio: v.duenio };
  if (!v.ok) return { ok: false, mensaje: v.mensaje, causa: v.causa, ...p };
  const r = almacen.empezarEnBlanco({ auth: v.auth });
  return r.ok ? { ok: true, mensaje: "", ...p } : { ok: false, mensaje: motivoDeEnBlanco(r), ...p };
}

/** Lo que se le dice al dueño si `almacen.empezarEnBlanco` no empezó (por qué, en criollo). */
export function motivoDeEnBlanco(r: Extract<ResultadoDeRestaurar, { ok: false }>): string {
  if (r.causa === "sin-lugar") return "No hay lugar para guardar una copia en esta compu: archivá días cerrados antes. No se tocó nada.";
  return r.motivo;
}

/** El aviso después de empezar en blanco: dónde quedó lo de antes y qué sigue. */
export const avisoDeEnBlanco = (nombre: string) =>
  `Listo: empezó una jornada nueva en blanco. Lo de antes quedó en ${nombre} (guardalo en un lugar privado) y en una copia en esta compu. Cada dueño vuelve a armar su PIN.`;

// ───────────── las acciones de la solapa ─────────────

export type AccionConfig =
  | { tipo: "pinInicial"; usuarioId: string; pin: string; repetido: string }
  | { tipo: "alta"; nombre: string; rol: Rol; pin: string }
  | { tipo: "pinNuevo"; usuarioId: string; pin: string }
  | { tipo: "sacarAcceso"; usuarioId: string; pin: string }
  | { tipo: "cambiarMiPin"; actual: string; nuevo: string; repetido: string }
  | { tipo: "avisos"; celulares: Record<string, string>; club: string; alias: string }
  | ({ tipo: "reglas" } & ValoresReglas)
  | { tipo: "horarios"; dias: { dia: number; abre: number; cierra: number }[] };

/**
 * Con un PIN generado, va APARTE del mensaje (el aviso no lo muestra ni lo anuncia): la pantalla lo muestra una vez.
 * `pin`/`duenio`: qué pasó con el PIN de quien opera (null en lo que no lo pide), para el tope del equipo.
 */
export type DesenlaceConfig = DesenlaceConPin & {
  pinNuevo?: { nombre: string; rol: string; pin: string };
};

/** ¿La acción se deshace con el aviso? Lo de accesos y PIN, no (como el vanilla: lleva PIN). */
export const esDeshacible = (a: AccionConfig) => a.tipo === "avisos" || a.tipo === "reglas" || a.tipo === "horarios";

/**
 * ¿La acción pide el PIN de quien opera? (alta, PIN nuevo, sacar acceso, cambiar mi PIN). Ésas corren con el tope del
 * equipo; el PIN inicial de un dueño (lo arma, no lo prueba), los avisos, las reglas y los horarios, no: una espera
 * por PIN mal no traba lo que no lleva PIN.
 */
export const llevaPinDeQuienOpera = (a: AccionConfig) => a.tipo === "alta" || a.tipo === "pinNuevo" || a.tipo === "sacarAcceso" || a.tipo === "cambiarMiPin";

/** El auth con el PIN que tipeó quien opera (formato revisado antes de llamar al motor). */
function conPin(estado: EstadoClub, auth: Auth, pin: string): { ok: true; auth: Auth } | { ok: false; mensaje: string } {
  return authParaArchivar(estado, auth, pin);
}

/** Corre una acción de la solapa. Lo que pide el PIN de quien opera dice qué pasó con él (`pin`, `duenio`). */
export function ejecutarConfiguracion(estado: EstadoClub, accion: AccionConfig, ahora: Ahora, auth: Auth): DesenlaceConfig {
  const d = ejecutar(estado, accion, ahora, auth);
  return { ...d, pin: d.pin ?? null, duenio: d.duenio ?? false };
}

type DesenlaceSinTope = Desenlace & Partial<PinEvaluado> & Pick<DesenlaceConfig, "pinNuevo">;

function ejecutar(estado: EstadoClub, accion: AccionConfig, ahora: Ahora, auth: Auth): DesenlaceSinTope {
  switch (accion.tipo) {
    case "pinInicial": {
      const u = usuarioDe(estado, accion.usuarioId);
      if (!u || u.activo === false) return no("Ese usuario ya no tiene acceso.");
      const pin = accion.pin.trim();
      if (!pinValidoPara(u.rol, pin)) return no(`El PIN de ${u.nombre} son ${numerosDelPin(u.rol)}.`);
      if (pin !== accion.repetido.trim()) return no("Los dos PIN no coinciden: escribilo igual las dos veces.");
      const r = definirPinInicial(estado, u.id, pin, ahora);
      return r.ok ? { ok: true, mensaje: `PIN de ${u.nombre} guardado. No se lo digas a nadie.` } : no(r.motivo);
    }
    case "alta": {
      const nombre = accion.nombre.trim();
      if (!nombre) return no("Escribí el nombre de la persona.");
      if (!ROLES[accion.rol]) return no("Elegí qué puede hacer.");
      const p = evaluarPinDeQuienOpera(estado, auth, accion.pin);
      const a = conPin(estado, auth, accion.pin);
      if (!a.ok) return { ...no(a.mensaje), ...p };
      const r = altaUsuario(estado, { nombre, rol: accion.rol }, a.auth, ahora);
      if (!r.ok) return { ...no(r.motivo), ...p };
      return {
        ...p,
        ok: true,
        mensaje: `${r.usuario.nombre} ya tiene acceso (${ROLES[r.usuario.rol]}). Su PIN está a la vista en Usuarios: se muestra una sola vez.`,
        pinNuevo: { nombre: r.usuario.nombre, rol: ROLES[r.usuario.rol], pin: r.pin },
      };
    }
    case "pinNuevo": {
      const u = usuarioDe(estado, accion.usuarioId);
      const p = evaluarPinDeQuienOpera(estado, auth, accion.pin);
      const a = conPin(estado, auth, accion.pin);
      if (!a.ok) return { ...no(a.mensaje), ...p };
      const r = regenerarPin(estado, accion.usuarioId, a.auth, ahora);
      if (!r.ok) return { ...no(r.motivo), ...p };
      const nombre = u?.nombre ?? "";
      return { ...p, ok: true, mensaje: `PIN nuevo para ${nombre}: está a la vista en Usuarios, se muestra una sola vez.`, pinNuevo: { nombre, rol: u ? ROLES[u.rol] : "", pin: r.pin } };
    }
    case "sacarAcceso": {
      const u = usuarioDe(estado, accion.usuarioId);
      const p = evaluarPinDeQuienOpera(estado, auth, accion.pin);
      const a = conPin(estado, auth, accion.pin);
      if (!a.ok) return { ...no(a.mensaje), ...p };
      const r = revocarAcceso(estado, accion.usuarioId, a.auth, ahora);
      return r.ok ? { ok: true, mensaje: `Listo: ${u?.nombre ?? "esa persona"} ya no tiene acceso.`, ...p } : { ...no(r.motivo), ...p };
    }
    case "cambiarMiPin": {
      if (!auth.usuarioId) return no("Entrá con tu PIN para operar.");
      const actual = accion.actual.trim();
      const nuevo = accion.nuevo.trim();
      const rol = rolDeQuienOpera(estado, auth);
      if (!pinAceptadoPara(rol, actual)) return no(`Poné tu PIN actual (${numerosDelPin(rol)}).`);
      if (!pinValidoPara(rol, nuevo)) return no(`El PIN nuevo son ${numerosDelPin(rol)}.`);
      if (nuevo !== accion.repetido.trim()) return no("Los dos PIN nuevos no coinciden: escribilo igual las dos veces.");
      if (nuevo === actual) return no("El PIN nuevo es igual al de ahora: elegí otro.");
      // Antes del motor: después, el PIN de quien opera ya es el nuevo.
      const p = evaluarPinDeQuienOpera(estado, auth, actual);
      const r = cambiarMiPin(estado, { usuarioId: auth.usuarioId, pin: actual }, nuevo, ahora);
      return r.ok ? { ok: true, mensaje: "Tu PIN cambió. Desde ahora entrás con el nuevo.", ...p } : { ...no(r.motivo), ...p };
    }
    case "avisos": {
      if (!configura(estado, auth)) return no("Los avisos los carga un dueño.");
      const duenos = estado.usuarios.filter((u) => u.rol === "duenio" && u.activo !== false);
      const limpios: Record<string, string> = {};
      const campos = [...duenos.map((u) => ({ id: u.id, nombre: `el celular de ${u.nombre}`, crudo: accion.celulares[u.id] ?? "" })), { id: "club", nombre: "el WhatsApp del club", crudo: accion.club }];
      for (const { id, nombre, crudo } of campos) {
        const limpio = crudo.replace(/\D/g, "");
        if (limpio && (limpio.length < 8 || limpio.length > 15)) return no(`Revisá ${nombre}: no parece un celular (con código de área, ej.: 11 2345-6789).`);
        if (limpio) limpios[id] = limpio;
      }
      const alias = accion.alias.trim();
      if (alias && !ALIAS.test(alias)) return no("El alias va de 6 a 20 letras, números, puntos o guiones (ej.: club.breakpoint).");
      (estado.config as ConfigConContactos).contactos = limpios;
      estado.config.cobro = { ...(estado.config.cobro ?? {}), alias };
      return { ok: true, mensaje: "Avisos guardados: celulares y alias para la seña." };
    }
    case "reglas": {
      if (!configura(estado, auth)) return no("Las reglas y los precios los cambia un dueño.");
      // Todo se revisa ANTES de tocar nada: se aplica entero o nada.
      for (const r of REGLAS) {
        const crudo = (accion.politica[r.clave] ?? "").trim();
        if (r.clave === "minutosAntesParaEntrar" && crudo === "") continue;
        const v = Number(crudo.replace(",", "."));
        const [min, max] = LIMITES_POLITICA[r.clave];
        if (crudo === "" || !Number.isInteger(v) || v < min || v > max) return no(`«${r.etiqueta}»: tiene que ser un número entero entre ${min} y ${max}.`);
      }
      const bloqueo = Number(accion.bloqueoMin.trim());
      if (accion.bloqueoMin.trim() === "" || !Number.isInteger(bloqueo) || bloqueo < LIMITES_BLOQUEO[0] || bloqueo > LIMITES_BLOQUEO[1])
        return no(`«Bloquear la pantalla tras»: entre ${LIMITES_BLOQUEO[0]} y ${LIMITES_BLOQUEO[1]} minutos.`);
      const tarifas = estado.config.tarifas;
      if (accion.tarifas.length !== tarifas.length) return no("Cambiaron las tarifas mientras editabas: volvé a abrir la solapa.");
      const precios = accion.tarifas.map(leerMonto);
      for (let i = 0; i < tarifas.length; i++) if (!(precios[i] >= 0)) return no(`Poné el precio por hora ${tarifas[i].nombre.toLowerCase()} (0 o más).`);
      const fondo = leerMonto(accion.fondo);
      if (!(fondo >= 0)) return no("Poné cuánto cambio queda en el cajón (0 o más).");
      for (const r of REGLAS) {
        const res = ajustarPolitica(estado, r.clave, accion.politica[r.clave].trim());
        if (!res.ok) return no(res.motivo);
      }
      const b = ajustarBloqueo(estado, bloqueo, auth);
      if (!b.ok) return no(b.motivo);
      precios.forEach((p, i) => (tarifas[i].precioHora = p));
      if (fondo !== estado.caja.fondo) {
        const f = ajustarFondo(estado, fondo, auth, ahora);
        if (!f.ok) return no(f.motivo);
      }
      return { ok: true, mensaje: "Reglas y precios guardados. Los precios valen para los turnos nuevos." };
    }
    case "horarios": {
      if (!configura(estado, auth)) return no("Los horarios los cambia un dueño.");
      const paso = estado.config.paso;
      for (const d of accion.dias) {
        if (!(d.abre < d.cierra)) return no(`Los ${nombreDelDia(d.dia).toLowerCase()}: el cierre tiene que ser después de la apertura.`);
        if (d.cierra > CIERRA_HASTA) return no(`Los ${nombreDelDia(d.dia).toLowerCase()}: se cierra hasta las 02:00.`);
        if (d.abre % paso || d.cierra % paso) return no(`Los horarios van cada ${paso} minutos.`);
      }
      let afuera = 0;
      let cambiados = 0;
      for (const d of accion.dias) {
        const h = estado.config.horarios[d.dia];
        if (h && h.abre === d.abre && h.cierra === d.cierra) continue;
        const r = ajustarHorario(estado, d.dia, { abre: d.abre, cierra: d.cierra }, auth, ahora);
        if (!r.ok) return no(r.motivo);
        cambiados++;
        afuera += r.afuera.length;
      }
      if (!cambiados) return { ok: true, mensaje: "No cambiaste ningún horario." };
      return { ok: true, mensaje: `Horarios guardados.${afuera ? ` Ojo: ${afuera} ${afuera === 1 ? "turno reservado queda" : "turnos reservados quedan"} fuera del horario nuevo.` : ""}` };
    }
  }
}
