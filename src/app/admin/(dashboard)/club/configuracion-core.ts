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
//     descarga había llegado).
//
// Lo sensible (accesos, restaurar, limpiar, archivar) vuelve a pedir el PIN de quien opera, como el vanilla, y no
// se deshace. Lo que el motor no valida (la política, las tarifas, el alias, los contactos) lo controla esta capa con
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

import {
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
  revocarAcceso,
  secuenciaIds,
  terminarConfiguracion,
  usuario as usuarioDe,
  verificarPin,
} from "@/lib/club/motor.mjs";
import type { Ahora, Auth, ConfigClub, EstadoClub, Fecha, ReglaEditable, Rol, Usuario } from "@/lib/club/motor.mjs";
import type { Desenlace, EstadoDelGuardado, ResultadoDeRestaurar, ResultadoDelArchivo } from "./almacen";
import { leerMonto } from "./montos-core";
import { NOTA_CELULAR_RARO, enlaceWhatsApp } from "./whatsapp-core";

const dos = (n: number) => String(n).padStart(2, "0");
export const ddmm = (f: Fecha) => `${Number(f.slice(8))}/${Number(f.slice(5, 7))}`;
/** «2.345 KB», como el vanilla (redondeo para arriba). */
export const kb = (caracteres: number) => `${Math.ceil(Math.max(0, caracteres) / 1024).toLocaleString("es-AR")} KB`;
const no = (mensaje: string): Desenlace => ({ ok: false, mensaje });
const PIN_VALIDO = /^\d{2}$/;

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

/**
 * Lee el archivo elegido para restaurar (sin tocar nada): acepta el respaldo de siempre o el archivo para archivar;
 * el anexo solo no (lo explica el motor). Dice de cuándo es y qué trae.
 */
export function leerRespaldo(texto: string): { ok: true; respaldo: RespaldoParaRestaurar } | { ok: false; mensaje: string } {
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

/** ¿Quien opera es un dueño con ESTE PIN? (lo que el vanilla pedía en cada ventana sensible). */
export function pinDeDuenio(estado: EstadoClub, auth: Auth, pin: string, quien: string): { ok: true; usuario: Usuario; auth: Auth } | { ok: false; mensaje: string } {
  if (!auth.usuarioId) return { ok: false, mensaje: "Entrá con tu PIN para operar." };
  const limpio = pin.trim();
  if (!PIN_VALIDO.test(limpio)) return { ok: false, mensaje: "Poné tu PIN (2 números)." };
  const v = verificarPin(estado, auth.usuarioId, limpio);
  if (!v.ok) return { ok: false, mensaje: v.motivo };
  if (v.usuario.rol !== "duenio") return { ok: false, mensaje: `${quien} lo hace un dueño.` };
  return { ok: true, usuario: v.usuario, auth: { usuarioId: auth.usuarioId, pin: limpio } };
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

/** El auth para archivar: quien opera con el PIN que tipeó (el almacén lo vuelve a controlar). */
export function authParaArchivar(auth: Auth, pin: string): { ok: true; auth: Auth } | { ok: false; mensaje: string } {
  if (!auth.usuarioId) return { ok: false, mensaje: "Entrá con tu PIN para operar." };
  if (!PIN_VALIDO.test(pin.trim())) return { ok: false, mensaje: "Poné tu PIN (2 números)." };
  return { ok: true, auth: { usuarioId: auth.usuarioId, pin: pin.trim() } };
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

export interface RespaldoAntesDeLimpiar {
  texto: string;
  /** Huella del estado de ese momento: el archivo elegido tiene que ser éste. */
  huella: string;
  nombre: string;
}

/** Paso 1 de la limpieza: el respaldo completo de ahora para descargar (UNA descarga). */
export function respaldoAntesDeLimpiar(estado: EstadoClub, usuarioId: string | null, ms: number): RespaldoAntesDeLimpiar {
  return { texto: textoDelRespaldo(estado, usuarioId, ms), huella: huellaRespaldo(estado), nombre: nombreDelRespaldoAntesDeLimpiar(ms) };
}

export type VerificacionDelRespaldo = { ok: true } | { ok: false; causa: "otro" | "danado" | "cambio"; motivo: string };

/**
 * Paso 2: ¿el archivo elegido es el respaldo de la jornada TAL COMO ESTÁ AHORA? Si es el que se descargó pero algo
 * cambió en el medio (se cobró, se cargó un turno), hay que descargar de nuevo: si no, la limpieza borraría algo que
 * no quedó en el respaldo.
 */
export function verificarRespaldoElegido(estado: EstadoClub, textoElegido: string, huellaDescargada: string): VerificacionDelRespaldo {
  let elegido: { v?: unknown; estado?: unknown } | null;
  try {
    elegido = JSON.parse(textoElegido) as { v?: unknown; estado?: unknown } | null;
  } catch {
    return { ok: false, causa: "danado", motivo: "Ese archivo está incompleto o dañado (no se puede leer): descargá el respaldo de nuevo y elegí el nuevo." };
  }
  if (!elegido || typeof elegido !== "object" || elegido.v !== VERSION_ESTADO || !elegido.estado || typeof elegido.estado !== "object")
    return { ok: false, causa: "otro", motivo: "Ese no es el respaldo que se descargó para la limpieza: elegí el «breakpoint-jornada-antes-golive-….json»." };
  const huella = huellaRespaldo(elegido.estado);
  if (huella === huellaRespaldo(estado)) {
    // Tiene que servir para «Restaurar» si hace falta volver atrás.
    if (!hidratarEstado(elegido).ok) return { ok: false, causa: "danado", motivo: "Ese respaldo no se puede restaurar: descargalo de nuevo." };
    return { ok: true };
  }
  if (huella === huellaDescargada)
    return { ok: false, causa: "cambio", motivo: "Cambió algo desde que descargaste el respaldo (se cobró o se cargó algo): descargalo de nuevo y elegí el nuevo." };
  return { ok: false, causa: "otro", motivo: "Ese archivo no es el respaldo que descargaste recién: elegí el último que bajaste." };
}

export interface PedidoDeLimpieza {
  conservarSaldos: boolean;
  conservarStock: boolean;
  pin: string;
  /** El respaldo descargado en el paso 1 (null: todavía no se descargó). */
  descargado: Pick<RespaldoAntesDeLimpiar, "huella" | "nombre"> | null;
  /** El texto del archivo elegido en el paso 2 (null: no se eligió). */
  textoElegido: string | null;
}

export type DesenlaceLimpieza = Desenlace & { causa?: "otro" | "danado" | "cambio" };

/** Paso 2 de la limpieza: verifica el respaldo elegido contra el estado de ahora y recién ahí limpia. */
export function limpiarConRespaldo(estado: EstadoClub, pedido: PedidoDeLimpieza, ahora: Ahora, auth: Auth, rolPanel: string): DesenlaceLimpieza {
  if (rolPanel !== "OWNER") return no("La limpieza la hace un dueño.");
  const d = pinDeDuenio(estado, auth, pedido.pin, "La limpieza");
  if (!d.ok) return no(d.mensaje);
  if (!pedido.descargado) return no("Primero descargá el respaldo (paso 1).");
  if (pedido.textoElegido == null) return no("Elegí el respaldo que descargaste (paso 2): sin eso no se limpia nada.");
  const pendientes = pendientesGoLive(estado, ahora);
  if (pendientes.length) return no(`Antes de limpiar hay que resolver: ${pendientes.join(" ")}`);
  const v = verificarRespaldoElegido(estado, pedido.textoElegido, pedido.descargado.huella);
  if (!v.ok) return { ok: false, mensaje: v.motivo, causa: v.causa };
  const r = limpiarParaGoLive(estado, { conservarSaldos: pedido.conservarSaldos, conservarStock: pedido.conservarStock }, d.auth, ahora);
  if (!r.ok) return no(r.motivo);
  const b = r.borrado;
  return {
    ok: true,
    mensaje: `Respaldo verificado: limpieza hecha. Se borraron ${b.turnos} turnos, ${b.cuentas} cuentas y ${b.movimientos} movimientos de caja; quedaron ${b.quedan} turnos por jugar (con su seña)${pedido.conservarSaldos ? "" : " y los saldos en cero"}. Guardá ${pedido.descargado.nombre} en un lugar privado.`,
  };
}

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

/** Con un PIN generado, va APARTE del mensaje (el aviso no lo muestra ni lo anuncia): la pantalla lo muestra una vez. */
export interface DesenlaceConfig extends Desenlace {
  pinNuevo?: { nombre: string; rol: string; pin: string };
}

/** ¿La acción se deshace con el aviso? Lo de accesos y PIN, no (como el vanilla: lleva PIN). */
export const esDeshacible = (a: AccionConfig) => a.tipo === "avisos" || a.tipo === "reglas" || a.tipo === "horarios";

/** El auth con el PIN que tipeó quien opera (formato revisado antes de llamar al motor). */
function conPin(auth: Auth, pin: string): { ok: true; auth: Auth } | { ok: false; mensaje: string } {
  return authParaArchivar(auth, pin);
}

export function ejecutarConfiguracion(estado: EstadoClub, accion: AccionConfig, ahora: Ahora, auth: Auth): DesenlaceConfig {
  switch (accion.tipo) {
    case "pinInicial": {
      const u = usuarioDe(estado, accion.usuarioId);
      if (!u || u.activo === false) return no("Ese usuario ya no tiene acceso.");
      const pin = accion.pin.trim();
      if (!PIN_VALIDO.test(pin)) return no(`El PIN de ${u.nombre} son 2 números.`);
      if (pin !== accion.repetido.trim()) return no("Los dos PIN no coinciden: escribilo igual las dos veces.");
      const r = definirPinInicial(estado, u.id, pin, ahora);
      return r.ok ? { ok: true, mensaje: `PIN de ${u.nombre} guardado. No se lo digas a nadie.` } : no(r.motivo);
    }
    case "alta": {
      const nombre = accion.nombre.trim();
      if (!nombre) return no("Escribí el nombre de la persona.");
      if (!ROLES[accion.rol]) return no("Elegí qué puede hacer.");
      const a = conPin(auth, accion.pin);
      if (!a.ok) return no(a.mensaje);
      const r = altaUsuario(estado, { nombre, rol: accion.rol }, a.auth, ahora);
      if (!r.ok) return no(r.motivo);
      return {
        ok: true,
        mensaje: `${r.usuario.nombre} ya tiene acceso (${ROLES[r.usuario.rol]}). Su PIN está a la vista en Usuarios: se muestra una sola vez.`,
        pinNuevo: { nombre: r.usuario.nombre, rol: ROLES[r.usuario.rol], pin: r.pin },
      };
    }
    case "pinNuevo": {
      const u = usuarioDe(estado, accion.usuarioId);
      const a = conPin(auth, accion.pin);
      if (!a.ok) return no(a.mensaje);
      const r = regenerarPin(estado, accion.usuarioId, a.auth, ahora);
      if (!r.ok) return no(r.motivo);
      const nombre = u?.nombre ?? "";
      return { ok: true, mensaje: `PIN nuevo para ${nombre}: está a la vista en Usuarios, se muestra una sola vez.`, pinNuevo: { nombre, rol: u ? ROLES[u.rol] : "", pin: r.pin } };
    }
    case "sacarAcceso": {
      const u = usuarioDe(estado, accion.usuarioId);
      const a = conPin(auth, accion.pin);
      if (!a.ok) return no(a.mensaje);
      const r = revocarAcceso(estado, accion.usuarioId, a.auth, ahora);
      return r.ok ? { ok: true, mensaje: `Listo: ${u?.nombre ?? "esa persona"} ya no tiene acceso.` } : no(r.motivo);
    }
    case "cambiarMiPin": {
      if (!auth.usuarioId) return no("Entrá con tu PIN para operar.");
      const actual = accion.actual.trim();
      const nuevo = accion.nuevo.trim();
      if (!PIN_VALIDO.test(actual)) return no("Poné tu PIN actual (2 números).");
      if (!PIN_VALIDO.test(nuevo)) return no("El PIN nuevo son 2 números.");
      if (nuevo !== accion.repetido.trim()) return no("Los dos PIN nuevos no coinciden: escribilo igual las dos veces.");
      if (nuevo === actual) return no("El PIN nuevo es igual al de ahora: elegí otro.");
      const r = cambiarMiPin(estado, { usuarioId: auth.usuarioId, pin: actual }, nuevo, ahora);
      return r.ok ? { ok: true, mensaje: "Tu PIN cambió. Desde ahora entrás con el nuevo." } : no(r.motivo);
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
