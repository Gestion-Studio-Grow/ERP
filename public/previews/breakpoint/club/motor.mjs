// MOTOR DEL CLUB — Break Point Pádel (demo del flujo, ADR-028 · demo pública a costo cero).
//
// Reingeniería de la gestión de canchas de los referentes europeos (Playtomic Manager, MATCHi, Syltek,
// Doinsport), adaptada al club argentino y, en esta segunda vuelta, a cómo trabaja Break Point de verdad
// (pedido del club del 14/10): la cancha y el buffet son DOS cuentas separadas, hay cuenta corriente por
// cliente con autorización del dueño, las faltas se cobran enteras, la caja corre de 12 a 12, todo lo que
// mueve plata sensible pide PIN, y los proveedores se cargan por remito. Detalle y porqué:
// docs/tenants/breakpoint/REINGENIERIA.md.
//
// Reglas de este archivo:
//   · Puro: no toca el DOM, la red ni el disco. Lo usan el backoffice (index.html) y los tests de Node.
//   · Sin persistencia propia: el estado vive en memoria. La jornada real lo guarda en el navegador de la compu del
//     club (app.mjs, con serializarEstado/hidratarEstado); nunca en un servidor (DEMO → VENTA → INVERSIÓN).
//   · El tiempo es { fecha: "AAAA-MM-DD", min: minutos desde las 00:00 }. Lo que pasa después de medianoche
//     se modela con min > 1440 sobre el día que abrió (el club cierra a la 01:00 → 1500).
//   · Toda operación devuelve { ok: true, ... } o { ok: false, motivo } en criollo, nunca tira excepción
//     por una regla de negocio: quien atiende tiene que leer qué pasó, no un error técnico.

export const MEDIOS = Object.freeze({
  efectivo: "Efectivo",
  mercadopago: "Mercado Pago (QR)",
  transferencia: "Transferencia",
  debito: "Débito / crédito",
  monedero: "Créditos del cliente",
});
const MEDIOS_DE_CAJA = ["efectivo", "mercadopago", "transferencia", "debito"];

export const ESTADOS = Object.freeze({
  reservada: "Reservada",
  en_cancha: "En cancha",
  finalizada: "Cancha cerrada",
  cancelada: "Cancelada",
  no_show: "Falta",
  suspendida: "Suspendida",
});

export const TIPOS = Object.freeze({
  turno: "Turno",
  fijo: "Turno fijo",
  clase: "Clase",
  abierto: "Partido abierto",
  torneo: "Torneo",
});

export const ROLES = Object.freeze({ duenio: "Dueño/a", recepcion: "Recepción" });

/**
 * Largo del PIN por rol (decisión del dueño, 18/10/2026: «son 4 dígitos para los dueños y 2 para los empleados»).
 * Lo nuevo (alta, PIN inicial, cambio, «PIN nuevo») se valida con este largo. Lo ya guardado se acepta tal cual:
 * los dueños del piloto tienen PIN de 2 y siguen entrando; al entrar la app les pide elegir uno de 4
 * (`pinDesactualizado`). Cualquier rol que no sea dueño usa el de recepción.
 */
export const LARGO_PIN = Object.freeze({ duenio: 4, recepcion: 2 });
/** El largo que tenían todos los PIN antes (lo que puede haber guardado un dueño del piloto). */
export const LARGO_PIN_VIEJO = 2;
export const largoPin = (rol) => (rol === "duenio" ? LARGO_PIN.duenio : LARGO_PIN.recepcion);

/**
 * Qué puede hacer cada rol. Recepción opera el día (agenda, cobros, buffet, remitos y egresos en efectivo);
 * el pago a proveedores, sus cuentas corrientes, la configuración y las autorizaciones son del dueño.
 */
export const PERMISOS = Object.freeze({
  recepcion: Object.freeze(["agenda", "cobrar", "buffet", "clientes", "remito", "egreso", "cerrarCaja", "solicitarCC"]),
  duenio: Object.freeze([
    "agenda", "cobrar", "buffet", "clientes", "remito", "egreso", "cerrarCaja", "solicitarCC",
    "pagarProveedor", "verProveedores", "autorizarCC", "configurar", "usuarios", "metricas", "contenido", "stock",
  ]),
});

/** Estados que ocupan la cancha (los demás liberan el hueco). */
const OCUPA = new Set(["reservada", "en_cancha", "finalizada"]);

// ───────────────────────── utilidades ─────────────────────────

export function hhmm(min) {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function aMinutos(texto) {
  const [h, m] = String(texto).split(":").map(Number);
  return h * 60 + (m || 0);
}

/** 0 = domingo … 6 = sábado. La fecha se interpreta como día civil (sin zona horaria). */
export function diaSemana(fecha) {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

export const NOMBRE_DIA = Object.freeze(["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"]);

export function sumarDias(fecha, dias) {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** Minutos entre `ahora` y el inicio del turno (negativo si ya empezó). */
export function minutosHasta(ahora, fecha, min) {
  const [a1, m1, d1] = ahora.fecha.split("-").map(Number);
  const [a2, m2, d2] = fecha.split("-").map(Number);
  const dias = (Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000;
  return dias * 1440 + min - ahora.min;
}

const solapa = (a0, a1, b0, b1) => a0 < b1 && b0 < a1;

export function pesos(n) {
  const v = Math.round(n);
  return (v < 0 ? "-$ " : "$ ") + Math.abs(v).toLocaleString("es-AR");
}

const redondear100 = (n) => Math.round(n / 100) * 100;

let secuencia = 0;
let origenIds = "";
const nuevoId = (prefijo) => `${origenIds}${prefijo}${(++secuencia).toString(36)}`;

/** Por dónde va el contador de ids (va en la foto de la demo entre pestañas). */
export const secuenciaIds = () => secuencia;
/** Sigue el contador desde `n` (nunca lo baja): la pestaña que toma la posta no repite ids de la demo que recibió. */
export function retomarSecuencia(n) {
  secuencia = Math.max(secuencia, Math.round(Number(n)) || 0);
}

/**
 * Marca los ids que crea ESTE proceso (ej. "b-" en el backoffice conectado): dos procesos que comparten agenda
 * (el back del turnero y el backoffice) nunca generan el mismo id aunque sus contadores coincidan.
 */
export function prefijoIds(prefijo = "") {
  origenIds = String(prefijo).replace(/[^a-z0-9-]/gi, "");
}

function registrar(estado, texto, ahora) {
  estado.log.unshift({ fecha: ahora?.fecha ?? null, min: ahora?.min ?? null, texto });
  if (estado.log.length > 300) estado.log.length = 300;
}

const sello = (ahora) => ({ fecha: ahora?.fecha ?? null, min: ahora?.min ?? null });

// ───────────────────────── estado del club ─────────────────────────

export function crearEstado({ config, canchas, clientes = [], productos = [], usuarios = [], proveedores = [] }) {
  return {
    config: structuredClone(config),
    canchas: structuredClone(canchas),
    clientes: structuredClone(clientes).map(normalizarCliente),
    productos: structuredClone(productos),
    usuarios: structuredClone(usuarios),
    proveedores: structuredClone(proveedores),
    solicitudesAcceso: [],
    novedades: [], // pedidos de autorización para el dueño (cuenta corriente)
    difusiones: [], // novedades del club armadas para mandar por WhatsApp
    pedidos: [], // pedidos de la tienda (se encargan por la web, se retiran y pagan en el club)
    reservas: [],
    cuentas: [], // cuentas de consumo (buffet): separadas de la cancha
    fijos: [],
    bloqueos: [],
    espera: [],
    remitos: [],
    pagosProveedor: [],
    contenido: [],
    caja: { fondo: 0, movimientos: [], cierres: [] },
    luces: Object.fromEntries(canchas.map((c) => [c.id, false])),
    clima: { lluvia: null },
    log: [],
  };
}

// ───────────────────────── jornada real (se guarda en el dispositivo) ─────────────────────────

export const VERSION_ESTADO = 1;

/**
 * El club en blanco para una jornada real: canchas, productos, usuarios y proveedores de Break Point, sin
 * turnos, clientes ni caja. El alias de cobro arranca vacío: lo carga el dueño en Ajustes (nunca el ficticio).
 */
export function crearClubReal(hoy) {
  secuencia = 0;
  const config = structuredClone(CONFIG_DEMO);
  // En el mostrador se abre la cancha a quien llega sin ficha sin pedirle seña (queda «debe» si no pagó).
  config.politica.senaSinCliente = false;
  // Productos de Break Point con sus precios de referencia, sin stock inventado ni códigos de barra de ejemplo:
  // el stock se controla desde el primer conteo (Stock → ajustar).
  const productos = PRODUCTOS_DEMO.map((p) => ({ ...p, stock: p.alquiler ? p.stock : null, codigoExterno: "" }));
  const e = crearEstado({ config: { ...config, modo: "real", configurado: false, cobro: { alias: "" } }, canchas: CANCHAS_DEMO, productos, usuarios: USUARIOS_REALES, proveedores: [] });
  registrar(e, "Arrancó la jornada real.", { fecha: hoy, min: null });
  return e;
}

/** La foto que se guarda: el estado y por dónde va el contador de ids (así no se repiten al volver). */
export function serializarEstado(estado) {
  return { v: VERSION_ESTADO, estado: structuredClone(estado), secuencia: secuencia };
}

const esLista = (x) => Array.isArray(x);
const esObjeto = (x) => x != null && typeof x === "object" && !Array.isArray(x);

/** Vuelve a armar el estado desde una foto guardada. Nunca tira: si la foto no sirve, dice por qué. */
export function hidratarEstado(foto) {
  try {
    if (!esObjeto(foto)) return { ok: false, motivo: "el archivo está vacío o no es de Break Point" };
    if (foto.v !== VERSION_ESTADO) return { ok: false, motivo: "es de otra versión del sistema" };
    const e = foto.estado;
    if (!esObjeto(e) || !esObjeto(e.config) || !esObjeto(e.caja)) return { ok: false, motivo: "le faltan datos del club" };
    for (const k of ["canchas", "usuarios", "productos", "reservas", "cuentas", "clientes"]) if (!esLista(e[k])) return { ok: false, motivo: `le falta «${k}»` };
    if (!esLista(e.caja.movimientos)) return { ok: false, motivo: "le falta la caja" };
    const idMalo = ["canchas", "usuarios", "productos", "reservas", "cuentas", "clientes"].flatMap((k) => e[k]).some((x) => !esObjeto(x) || !/^[\w-]{1,60}$/.test(String(x.id ?? "")));
    if (idMalo) return { ok: false, motivo: "tiene datos que no son de Break Point" };
    const estado = structuredClone(e);
    for (const k of ["proveedores", "solicitudesAcceso", "novedades", "pedidos", "difusiones", "fijos", "bloqueos", "espera", "remitos", "pagosProveedor", "contenido", "log"]) if (!esLista(estado[k])) estado[k] = [];
    estado.caja.cierres = esLista(estado.caja.cierres) ? estado.caja.cierres : [];
    estado.luces = esObjeto(estado.luces) ? estado.luces : Object.fromEntries(estado.canchas.map((c) => [c.id, false]));
    estado.clima = esObjeto(estado.clima) ? estado.clima : { lluvia: null };
    for (const k of ["pedidos", "novedades", "difusiones", "solicitudesAcceso", "contenido"]) estado[k] = estado[k].filter((x) => esObjeto(x) && /^[\w-]{1,60}$/.test(String(x.id ?? "")));
    estado.clientes = estado.clientes.map(normalizarCliente);
    // `archivo` (resumen de los días archivados) es opcional: un estado viejo no lo tiene y sigue igual.
    if ("archivo" in estado) {
      if (!esObjeto(estado.archivo)) delete estado.archivo;
      else estado.archivo = normalizarArchivo(estado.archivo);
    }
    retomarSecuencia(foto.secuencia);
    return { ok: true, estado };
  } catch {
    return { ok: false, motivo: "no se pudo leer" };
  }
}

const esFecha = (x) => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x);
const fechaONull = (x) => (esFecha(x) ? x : null);
const entero = (x) => (Number.isFinite(x) ? Math.round(x) : 0);

/**
 * El resumen de lo archivado, sano: cada renglón que no se entiende se descarta (sin rechazar la foto) y los números
 * que no son números quedan en 0. Así un `archivo` tocado a mano no rompe la Configuración ni la seña web.
 */
function normalizarArchivo(a) {
  const dias = (esLista(a.dias) ? a.dias : []).filter((f) => esObjeto(f) && esFecha(f.dia))
    .map((f) => ({ ...fila0(f.dia), ...Object.fromEntries(Object.keys(fila0(f.dia)).filter((k) => k !== "dia").map((k) => [k, entero(f[k])])) }));
  const clientes = Object.fromEntries(Object.entries(esObjeto(a.clientes) ? a.clientes : {})
    .filter(([id, x]) => /^[\w-]{1,60}$/.test(id) && esObjeto(x))
    .map(([id, x]) => [id, { jugados: Math.max(0, entero(x.jugados)), ultima: esFecha(x.ultima) ? x.ultima : "" }]));
  const anexos = (esLista(a.anexos) ? a.anexos : []).filter((x) => esObjeto(x) && esFecha(x.hasta)).map((x) => ({
    desde: fechaONull(x.desde), hasta: x.hasta, fecha: fechaONull(x.fecha), min: Number.isFinite(x.min) ? x.min : null,
    por: typeof x.por === "string" ? x.por.slice(0, 60) : null,
    conteos: Object.fromEntries(Object.entries(esObjeto(x.conteos) ? x.conteos : {}).filter(([, n]) => Number.isFinite(n)).map(([k, n]) => [k, Math.max(0, Math.round(n))])),
  }));
  const codigos = (lista, re) => [...new Set((esLista(lista) ? lista : []).filter((c) => typeof c === "string" && re.test(c)))];
  const c = esObjeto(a.codigos) ? a.codigos : {};
  return {
    ...a, hasta: fechaONull(a.hasta), dias, clientes, anexos,
    codigos: { pedidos: codigos(c.pedidos, /^T-[A-Z0-9]{4}$/), refs: codigos(c.refs, /^BP-[A-Z0-9]{4}$/) },
  };
}

function normalizarCliente(c) {
  return {
    nivel: "", tel: "", strikes: 0, monedero: 0, deuda: 0, activo: true, movCC: [],
    ...c,
    cc: { habilitada: false, limite: 0, ...(c.cc ?? {}) },
    fiados: [...(c.fiados ?? [])], // fiados puntuales aprobados por un dueño (se usan una vez)
  };
}

export const cancha = (estado, id) => estado.canchas.find((c) => c.id === id);
export const cliente = (estado, id) => estado.clientes.find((c) => c.id === id);
export const reserva = (estado, id) => estado.reservas.find((r) => r.id === id);
export const producto = (estado, id) => estado.productos.find((p) => p.id === id);
export const cuenta = (estado, id) => estado.cuentas.find((c) => c.id === id);
export const proveedor = (estado, id) => estado.proveedores.find((p) => p.id === id);
export const usuario = (estado, id) => estado.usuarios.find((u) => u.id === id);

// ───────────────────────── el PIN guardado con hash (21/10/2026) ─────────────────────────
//
// En la foto del club el PIN no va en claro: va `h1:<hex>` = PBKDF2-SHA256(PIN, sal del club, VUELTAS_PIN) y
// `pinLargo` (para saber si un dueño tiene todavía el viejo de 2). La sal es UNA por club (`estado.salPin`): así
// buscar de quién es un PIN sigue siendo un solo cálculo. Un PIN viejo en claro se acepta igual (`pinCoincide`) y se
// pasa a hash al cambiarlo o cuando la jornada real abre la foto (`pasarPinesAHash`, lo llama el almacén del ERP). Ojo: con 4 números hay 10.000 PIN posibles; el hash
// lento (~30 ms) frena mirar la foto y leerlo, no a quien tenga la foto y tiempo. Lo que de verdad cuida al PIN es que
// la foto no salga del club y el tope de intentos.
// SHA-256 y PBKDF2 propios, sincrónicos y sin dependencias (el motor corre igual en el navegador y en Node).
const K = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
function sha256(bytes) {
  const l = bytes.length, n = (((l + 9) >> 6) + 1) << 6, m = new Uint8Array(n); m.set(bytes); m[l] = 0x80;
  const dv = new DataView(m.buffer); dv.setUint32(n - 4, l * 8); dv.setUint32(n - 8, Math.floor(l / 0x20000000));
  const h = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]), w = new Uint32Array(64);
  for (let o = 0; o < n; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) { const a = w[i-15], b = w[i-2]; w[i] = (((a>>>7)|(a<<25))^((a>>>18)|(a<<14))^(a>>>3)) + w[i-7] + (((b>>>17)|(b<<15))^((b>>>19)|(b<<13))^(b>>>10)) + w[i-16]; }
    let [A,B,C,D,E,F,G,H] = h;
    for (let i = 0; i < 64; i++) { const t1 = (H + (((E>>>6)|(E<<26))^((E>>>11)|(E<<21))^((E>>>25)|(E<<7))) + ((E&F)^(~E&G)) + K[i] + w[i]) | 0; const t2 = ((((A>>>2)|(A<<30))^((A>>>13)|(A<<19))^((A>>>22)|(A<<10))) + ((A&B)^(A&C)^(B&C))) | 0; H=G;G=F;F=E;E=(D+t1)|0;D=C;C=B;B=A;A=(t1+t2)|0; }
    h[0]+=A;h[1]+=B;h[2]+=C;h[3]+=D;h[4]+=E;h[5]+=F;h[6]+=G;h[7]+=H;
  }
  const out = new Uint8Array(32); const ov = new DataView(out.buffer); for (let i = 0; i < 8; i++) ov.setUint32(i * 4, h[i]); return out;
}

function hmacSha256(clave, msg) {
  const k = new Uint8Array(64);
  k.set(clave.length > 64 ? sha256(clave) : clave);
  const i = new Uint8Array(64 + msg.length), o = new Uint8Array(96);
  for (let j = 0; j < 64; j++) { i[j] = k[j] ^ 0x36; o[j] = k[j] ^ 0x5c; }
  i.set(msg, 64);
  o.set(sha256(i), 64);
  return sha256(o);
}
function pbkdf2Sha256(clave, sal, vueltas) {
  const s = new Uint8Array(sal.length + 4);
  s.set(sal);
  s[sal.length + 3] = 1;
  let u = hmacSha256(clave, s);
  const t = u.slice();
  for (let n = 1; n < vueltas; n++) { u = hmacSha256(clave, u); for (let j = 0; j < 32; j++) t[j] ^= u[j]; }
  return t;
}
const PREFIJO_PIN = "h1:";
export const VUELTAS_PIN = 2000;
/** ¿Lo guardado es un PIN con hash (y no el PIN en claro de antes)? */
export const esPinConHash = (p) => typeof p === "string" && p.startsWith(PREFIJO_PIN);
/** El hash de un PIN con la sal del club: lo que queda guardado (y la clave del código de aprobación). */
export function hashPin(pin, sal) {
  const te = new TextEncoder();
  return PREFIJO_PIN + [...pbkdf2Sha256(te.encode(String(pin ?? "").trim()), te.encode(String(sal)), VUELTAS_PIN)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function salDelClub(estado) {
  if (!estado.salPin) {
    const b = globalThis.crypto?.getRandomValues ? globalThis.crypto.getRandomValues(new Uint8Array(16)) : Uint8Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
    estado.salPin = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  }
  return estado.salPin;
}
/** Guarda el PIN de un usuario con hash (nunca en claro). */
function guardarPin(estado, u, pin) {
  const limpio = String(pin ?? "").trim();
  u.pin = hashPin(limpio, salDelClub(estado));
  u.pinLargo = limpio.length;
}
/** ¿Este PIN es el de este usuario? Con hash o, si todavía lo tiene en claro (lo de antes), comparando el texto. */
export function pinCoincide(estado, u, pin) {
  const p = String(pin ?? "").trim();
  if (!u?.pin || !p) return false;
  if (!esPinConHash(u.pin)) return u.pin === p;
  return !!estado.salPin && hashPin(p, estado.salPin) === u.pin;
}
/** Cuántos números tiene el PIN guardado de un usuario (0 = no tiene). */
export const largoDelPinGuardado = (u) => (!u?.pin ? 0 : esPinConHash(u.pin) ? Number(u.pinLargo) || 0 : u.pin.length);
/** SÓLO DEMO: el PIN de ejemplo de un usuario de la demo (el guardado puede tener hash). "" si no es de la demo. */
export const pinDeEjemplo = (u) => USUARIOS_DEMO.find((d) => d.id === u?.id)?.pin ?? (u?.pin && !esPinConHash(u.pin) ? u.pin : "");
/** Pasa a hash los PIN que todavía estén en claro (lo hace `hidratarEstado` al abrir una foto). Devuelve cuántos. */
export function pasarPinesAHash(estado) {
  let n = 0;
  for (const u of estado.usuarios ?? []) if (u.pin && !esPinConHash(u.pin)) { guardarPin(estado, u, u.pin); n++; }
  return n;
}

// ───────────────────────── usuarios, PIN y permisos ─────────────────────────

export function puede(estado, usuarioId, accion) {
  const u = usuario(estado, usuarioId);
  return !!u && u.activo !== false && (PERMISOS[u.rol] ?? []).includes(accion);
}

/** ¿Este PIN es el de este usuario? */
export function verificarPin(estado, usuarioId, pin) {
  const u = usuario(estado, usuarioId);
  if (!u || u.activo === false) return { ok: false, motivo: "Ese usuario no tiene acceso." };
  if (!u.pin) return { ok: false, motivo: "Ese usuario todavía no tiene PIN: que un dueño le dé un «PIN nuevo» en Configuración → Usuarios." };
  if (!pinCoincide(estado, u, pin)) return { ok: false, motivo: "PIN incorrecto." };
  return { ok: true, usuario: u };
}

/** Lo que se le dice a un dueño que FIRMA con el PIN viejo de 2 sin haberlo cambiado todavía. */
export const MOTIVO_PIN_VIEJO = `Ese es tu PIN viejo: entrá a la compu con él y elegí uno de ${LARGO_PIN.duenio}.`;

/**
 * ¿Este PIN FIRMA? Como `verificarPin`, pero un dueño con el PIN viejo de 2 (`pinDesactualizado`) no firma nada
 * (descuentos, aprobaciones, caja, accesos): con ese PIN sólo entra, y al entrar se le pide el de 4. Entrar y cambiar
 * el PIN siguen con `verificarPin` (si no, el dueño del piloto se quedaría afuera).
 */
export function verificarFirma(estado, usuarioId, pin) {
  const v = verificarPin(estado, usuarioId, pin);
  if (v.ok && pinDesactualizado(estado, usuarioId)) return { ok: false, motivo: MOTIVO_PIN_VIEJO, pinViejo: true };
  return v;
}

/** Permiso + (si se pide) PIN. Lo usan todas las operaciones sensibles: el PIN tiene que FIRMAR (`verificarFirma`). */
function autorizar(estado, { usuarioId, pin } = {}, accion, conPin) {
  const u = usuario(estado, usuarioId);
  if (!u || u.activo === false) return { ok: false, motivo: "Elegí quién está usando el sistema." };
  if (!puede(estado, usuarioId, accion)) return { ok: false, motivo: `${u.nombre} no tiene permiso para esto.` };
  if (conPin) return verificarFirma(estado, usuarioId, pin);
  return { ok: true, usuario: u };
}

/** Busca a quién pertenece un PIN (cambio rápido de usuario en el mostrador). */
export function usuarioPorPin(estado, pin) {
  if (!String(pin ?? "").trim()) return null;
  const p = String(pin ?? "").trim();
  const conHash = estado.salPin ? hashPin(p, estado.salPin) : null;
  const u = estado.usuarios.find((x) => x.activo !== false && x.pin && (esPinConHash(x.pin) ? x.pin === conHash : x.pin === p));
  return u ? { ok: true, usuario: u } : { ok: false, motivo: "PIN incorrecto." };
}

/** Como `usuarioPorPin`, para FIRMAR (p. ej. el descuento): el PIN viejo de 2 de un dueño no firma. */
export function firmaPorPin(estado, pin) {
  const r = usuarioPorPin(estado, pin);
  if (r?.ok && pinDesactualizado(estado, r.usuario.id)) return { ok: false, motivo: MOTIVO_PIN_VIEJO, pinViejo: true, usuario: r.usuario };
  return r;
}

/**
 * Tope de intentos de PIN, uno solo para toda la compu (decisión del Gate, 18/10/2026): la pantalla bloqueada,
 * «¿Quién usa el sistema?», el descuento y la aprobación en la misma compu cuentan juntos. 5 PIN mal → espera, y cada
 * tanda espera más (30 s, 2 min, 10 min). La app lo guarda en `bp-intentos`, así sobrevive a recargar.
 * Un acierto de RECEPCIÓN no borra los fallos (si no, alguien de recepción probaría 4 PIN del dueño, pondría el suyo y
 * volvería a empezar): los borra un acierto de un dueño, o 8 horas sin fallos.
 */
export const TOPE_INTENTOS_PIN = 5;
export const ESPERAS_PIN_S = Object.freeze([30, 120, 600]);
const OLVIDO_FALLOS_MS = 8 * 60 * 60 * 1000;
export function intentosPin(guardado) {
  const t = guardado && typeof guardado === "object" ? guardado : {};
  const n = (x) => (Number.isFinite(Number(x)) && Number(x) > 0 ? Number(x) : 0);
  return { fallos: n(t.fallos), esperaHasta: n(t.esperaHasta), tandas: n(t.tandas), ultimoFallo: n(t.ultimoFallo) };
}
/** Cuántos ms falta esperar para poder probar otro PIN (0 = se puede). */
export const esperaPin = (t, ahoraMs) => Math.max(0, intentosPin(t).esperaHasta - ahoraMs);
/**
 * Anota un intento (ya hecho: no se llama durante la espera). `duenio`: si el que acertó es dueño. Devuelve el estado
 * nuevo (no toca el que recibe).
 */
export function anotarIntentoPin(t, { ok, duenio = false }, ahoraMs) {
  let x = intentosPin(t);
  if (ok) return duenio ? intentosPin() : x;
  if (x.ultimoFallo && ahoraMs - x.ultimoFallo >= OLVIDO_FALLOS_MS) x = intentosPin();
  if (x.fallos >= TOPE_INTENTOS_PIN && ahoraMs >= x.esperaHasta) x.fallos = 0; // ya esperó: arranca otra tanda
  x.fallos += 1;
  x.ultimoFallo = ahoraMs;
  if (x.fallos >= TOPE_INTENTOS_PIN) {
    x.tandas += 1;
    x.esperaHasta = ahoraMs + ESPERAS_PIN_S[Math.min(x.tandas, ESPERAS_PIN_S.length) - 1] * 1000;
  }
  return x;
}

/**
 * ¿Ese PIN nuevo se adivina fácil? Devuelve el motivo, o "" si sirve. Vale para el que elige cada uno (consola,
 * «Cambiar mi PIN», el paso del PIN viejo) y para el que genera el sistema.
 *  - Nunca un PIN de ejemplo de la demo (1111, 2222, 33, 44: están a la vista en `?demo=1`).
 *  - Nunca todos los números iguales (0000, 1111…; en 2: 00, 11…).
 *  - Con 4 números (dueños), nunca una escalera de a uno: 0123, 1234…6789 y 9876…3210.
 * Con 2 números (recepción) NO se filtran escaleras: hay sólo 100 combinaciones y sacando las 10 dobles quedan 90
 * (81 sin cero adelante para las generadas); sacar también 12, 23, 21… dejaría muy pocas para un club con varios
 * turnos de recepción, y un PIN de 2 se adivina igual en pocos intentos (lo que lo cuida es el tope de intentos).
 */
export function pinFacil(rol, pin) {
  const p = String(pin ?? "").trim();
  if (USUARIOS_DEMO.some((u) => u.pin === p)) return "Ese es un PIN de ejemplo de la demo: elegí otro.";
  if (/^(\d)\1+$/.test(p)) return "Con todos los números iguales se adivina fácil: elegí otro.";
  if (largoPin(rol) >= 4 && p.length >= 4) {
    const d = [...p].map(Number);
    const paso = d[1] - d[0];
    if (Math.abs(paso) === 1 && d.every((x, i) => i === 0 || x - d[i - 1] === paso)) return "Una escalera (como 1234 o 4321) se adivina fácil: elegí otro.";
  }
  return "";
}

/** Un PIN al azar del largo del rol que no repite ningún otro activo ni es fácil (sin cero adelante: 10–99 o 1000–9999). */
function pinLibre(estado, rol) {
  // Los PIN en claro se descartan de una; los que tienen hash, probando cada candidato (`pinEnUso`, un cálculo).
  const usados = new Set(estado.usuarios.filter((u) => u.activo !== false && u.pin && !esPinConHash(u.pin)).map((u) => u.pin));
  const largo = largoPin(rol);
  const libres = [];
  for (let n = 10 ** (largo - 1); n < 10 ** largo; n++) if (!usados.has(String(n)) && !pinFacil(rol, String(n))) libres.push(String(n));
  const azar = () => (globalThis.crypto?.getRandomValues ? globalThis.crypto.getRandomValues(new Uint32Array(1))[0] : Math.floor(Math.random() * 2 ** 32));
  for (let intento = 0; intento < 40 && libres.length; intento++) {
    const i = azar() % libres.length;
    const pin = libres[i];
    if (!pinEnUso(estado, pin, null)) return pin;
    libres.splice(i, 1);
  }
  return null;
}

/** Alguien nuevo pide acceso desde el mostrador; queda pendiente hasta que un dueño lo otorgue. */
export function solicitarAcceso(estado, nombre, ahora) {
  const limpio = String(nombre ?? "").trim();
  if (!limpio) return { ok: false, motivo: "Escribí tu nombre." };
  if (estado.solicitudesAcceso.some((s) => s.estado === "pendiente" && s.nombre.toLowerCase() === limpio.toLowerCase()))
    return { ok: false, motivo: "Ya hay un pedido de acceso con ese nombre esperando al dueño." };
  const s = { id: nuevoId("sa"), nombre: limpio, estado: "pendiente", ...sello(ahora) };
  estado.solicitudesAcceso.push(s);
  registrar(estado, `${limpio} pidió acceso al sistema.`, ahora);
  return { ok: true, solicitud: s };
}

/**
 * El dueño otorga el acceso: elige el rol y el sistema genera un PIN del largo del rol (dueño 4, recepción 2) que
 * no repite ningún otro activo. El PIN se muestra UNA vez para entregárselo a la persona (acceso dinámico: se revoca o se
 * regenera cuando haga falta).
 */
export function otorgarAcceso(estado, solicitudId, { rol }, auth, ahora) {
  const a = autorizar(estado, auth, "usuarios", true);
  if (!a.ok) return a;
  const s = estado.solicitudesAcceso.find((x) => x.id === solicitudId && x.estado === "pendiente");
  if (!s) return { ok: false, motivo: "Ese pedido ya no está pendiente." };
  if (!ROLES[rol]) return { ok: false, motivo: "Elegí el rol." };
  const pin = pinLibre(estado, rol);
  if (!pin) return { ok: false, motivo: "No quedan PIN libres: revocá accesos que no se usen." };
  const u = { id: nuevoId("u"), nombre: s.nombre, rol, pin: "", activo: true };
  guardarPin(estado, u, pin);
  estado.usuarios.push(u);
  s.estado = "otorgada";
  s.usuarioId = u.id;
  registrar(estado, `${a.usuario.nombre} dio acceso a ${u.nombre} (${ROLES[rol]}).`, ahora);
  return { ok: true, usuario: u, pin };
}

export function rechazarAcceso(estado, solicitudId, auth, ahora) {
  const a = autorizar(estado, auth, "usuarios", false);
  if (!a.ok) return a;
  const s = estado.solicitudesAcceso.find((x) => x.id === solicitudId && x.estado === "pendiente");
  if (!s) return { ok: false, motivo: "Ese pedido ya no está pendiente." };
  s.estado = "rechazada";
  registrar(estado, `${a.usuario.nombre} rechazó el pedido de acceso de ${s.nombre}.`, ahora);
  return { ok: true };
}

export function revocarAcceso(estado, usuarioObjetivoId, auth, ahora) {
  const a = autorizar(estado, auth, "usuarios", true);
  if (!a.ok) return a;
  const u = usuario(estado, usuarioObjetivoId);
  if (!u || u.activo === false) return { ok: false, motivo: "Ese usuario ya no tiene acceso." };
  if (u.id === a.usuario.id) return { ok: false, motivo: "No podés sacarte el acceso a vos mismo." };
  if (u.rol === "duenio" && estado.usuarios.filter((x) => x.activo !== false && x.rol === "duenio").length <= 1)
    return { ok: false, motivo: "Tiene que quedar al menos un dueño con acceso." };
  u.activo = false;
  registrar(estado, `${a.usuario.nombre} le sacó el acceso a ${u.nombre}.`, ahora);
  return { ok: true };
}

export function regenerarPin(estado, usuarioObjetivoId, auth, ahora) {
  const a = autorizar(estado, auth, "usuarios", true);
  if (!a.ok) return a;
  const u = usuario(estado, usuarioObjetivoId);
  if (!u || u.activo === false) return { ok: false, motivo: "Ese usuario no tiene acceso." };
  const viejo = { pin: u.pin, pinLargo: u.pinLargo };
  u.pin = "";
  const pin = pinLibre(estado, u.rol);
  if (!pin) { Object.assign(u, viejo); return { ok: false, motivo: "No quedan PIN libres." }; }
  guardarPin(estado, u, pin);
  registrar(estado, `${a.usuario.nombre} generó un PIN nuevo para ${u.nombre}.`, ahora);
  return { ok: true, pin };
}

/** ¿El PIN tiene el largo de ese rol? (sólo números). Vale para todo PIN nuevo. */
export const pinValidoPara = (rol, pin) => new RegExp(`^\\d{${largoPin(rol)}}$`).test(String(pin ?? "").trim());
/**
 * ¿Se puede intentar entrar con esto? El largo del rol o, para un dueño, el viejo de 2 (los PIN del piloto). Lo usa
 * el celular del dueño, que no tiene la jornada y no sabe si ese dueño ya cambió el suyo.
 */
export const pinAceptadoPara = (rol, pin) => pinValidoPara(rol, pin) || (rol === "duenio" && new RegExp(`^\\d{${LARGO_PIN_VIEJO}}$`).test(String(pin ?? "").trim()));
/** Qué se le dice a quien pone un PIN del largo equivocado. */
export const textoLargoPin = (rol, nuevo = false) => (rol === "duenio" ? `El PIN ${nuevo ? "nuevo " : ""}de dueño son ${LARGO_PIN.duenio} números.` : `El PIN ${nuevo ? "nuevo " : ""}son ${LARGO_PIN.recepcion} números.`);
/**
 * ¿Ese usuario tiene guardado un PIN del largo viejo? (dueños del piloto con 2). Entra igual, nunca se lo deja
 * afuera; la app le pide elegir uno de 4 antes de seguir. El PIN viejo no se muestra en ningún lado.
 */
export function pinDesactualizado(estado, usuarioId) {
  const u = usuario(estado, usuarioId);
  return !!u && u.activo !== false && !!u.pin && largoDelPinGuardado(u) !== largoPin(u.rol);
}
function pinEnUso(estado, pin, salvo) {
  const p = String(pin).trim();
  const conHash = estado.salPin ? hashPin(p, estado.salPin) : null;
  return estado.usuarios.some((u) => u.activo !== false && u.id !== salvo && u.pin && (esPinConHash(u.pin) ? u.pin === conHash : u.pin === p));
}

/** Un dueño da de alta a alguien directamente (sin pedido previo). El PIN lo genera el sistema y se ve una vez. */
export function altaUsuario(estado, { nombre, rol = "recepcion" }, auth, ahora) {
  const a = autorizar(estado, auth, "usuarios", true);
  if (!a.ok) return a;
  const limpio = String(nombre ?? "").trim().slice(0, 40);
  if (!limpio) return { ok: false, motivo: "Escribí el nombre." };
  if (!ROLES[rol]) return { ok: false, motivo: "Elegí el rol." };
  if (estado.usuarios.some((u) => u.activo !== false && u.nombre.toLowerCase() === limpio.toLowerCase())) return { ok: false, motivo: `Ya hay un usuario ${limpio}.` };
  const pin = pinLibre(estado, rol);
  if (!pin) return { ok: false, motivo: "No quedan PIN libres: sacá accesos que no se usen." };
  const u = { id: nuevoId("u"), nombre: limpio, rol, pin: "", activo: true };
  guardarPin(estado, u, pin);
  estado.usuarios.push(u);
  registrar(estado, `${a.usuario.nombre} dio de alta a ${u.nombre} (${ROLES[rol]}).`, ahora);
  return { ok: true, usuario: u, pin };
}

/**
 * Primer arranque (consola de configuración): cada dueño arma SU PIN. Sólo para un usuario que todavía no tiene
 * PIN; después se cambia con `cambiarMiPin` (sabiendo el actual) o un dueño le genera uno nuevo.
 */
export function definirPinInicial(estado, usuarioId, pin, ahora) {
  const u = usuario(estado, usuarioId);
  if (!u || u.activo === false) return { ok: false, motivo: "Ese usuario no tiene acceso." };
  if (u.pin) return { ok: false, motivo: `${u.nombre} ya tiene PIN.` };
  if (!pinValidoPara(u.rol, pin)) return { ok: false, motivo: textoLargoPin(u.rol) };
  if (pinFacil(u.rol, pin)) return { ok: false, motivo: pinFacil(u.rol, pin) };
  if (pinEnUso(estado, pin, u.id)) return { ok: false, motivo: "Ese PIN ya lo usa otra persona: elegí otro." };
  guardarPin(estado, u, pin);
  registrar(estado, `${u.nombre} armó su PIN.`, ahora);
  return { ok: true };
}

/**
 * Cada uno cambia su PIN sabiendo el actual. El nuevo va con el largo de su rol; el actual se acepta como esté
 * guardado (así un dueño con el PIN viejo de 2 pasa al de 4 sin perder nada).
 */
export function cambiarMiPin(estado, { usuarioId, pin }, nuevo, ahora) {
  const v = verificarPin(estado, usuarioId, pin);
  if (!v.ok) return v;
  if (!pinValidoPara(v.usuario.rol, nuevo)) return { ok: false, motivo: textoLargoPin(v.usuario.rol, true) };
  if (pinFacil(v.usuario.rol, nuevo)) return { ok: false, motivo: pinFacil(v.usuario.rol, nuevo) };
  if (pinEnUso(estado, nuevo, usuarioId)) return { ok: false, motivo: "Ese PIN ya lo usa otra persona: elegí otro." };
  guardarPin(estado, v.usuario, nuevo);
  registrar(estado, `${v.usuario.nombre} cambió su PIN.`, ahora);
  return { ok: true };
}

/**
 * Limpieza para el go-live: después de la prueba, se borra lo TRANSACCIONAL ya resuelto (turnos jugados, cuentas de
 * cargos cerradas, caja cerrada,
 * pedidos, créditos pendientes, difusiones, registro) y se conserva lo MAESTRO y los turnos por jugar con su seña.
 * Si hay plata o decisiones pendientes (pendientesGoLive), no limpia: dice qué resolver. Lo MAESTRO (canchas, horarios, precios, productos,
 * usuarios y accesos, clientes, proveedores, turnos fijos, contenido). Los SALDOS (cuenta corriente, créditos, fiados
 * y faltas de los clientes; remitos y pagos que forman la deuda con proveedores) se conservan si `conservarSaldos`
 * (por defecto: es plata real).
 * Sólo un dueño con su PIN. La app descarga un respaldo antes.
 */
/**
 * Lo que tiene plata o una decisión pendiente y NO se puede borrar en la limpieza: hay que resolverlo antes (cobrar,
 * pasar a cuenta corriente, devolver, marcar la falta, cerrar la caja). Lista en criollo, vacía si está todo en orden.
 */
export function pendientesGoLive(estado, ahora) {
  const out = [];
  const abiertas = estado.cuentas.filter((c) => c.estado === "abierta" && (saldoCuenta(c) > 0 || c.items.some((i) => i.alquiler && !i.devuelto)));
  if (abiertas.length) out.push(`Cuentas de cargos abiertas: ${abiertas.map((c) => `${c.titular} (${pesos(Math.max(0, saldoCuenta(c)))})`).join(", ")}. Cobralas o pasalas a cuenta corriente.`);
  const enJuego = estado.reservas.filter((r) => r.estado === "en_cancha");
  if (enJuego.length) out.push(`Canchas en juego: ${enJuego.map((r) => `${r.titular} ${hhmm(r.inicio)}`).join(", ")}. Cerralas primero.`);
  const sinResolver = estado.reservas.filter((r) => r.estado === "reservada" && ahora && minutosHasta(ahora, r.fecha, r.inicio) + r.duracion <= 0);
  if (sinResolver.length) out.push(`Turnos que ya pasaron sin abrir ni marcar la falta: ${sinResolver.map((r) => `${r.titular} ${r.fecha.slice(8)}/${r.fecha.slice(5, 7)} ${hhmm(r.inicio)}`).join(", ")}.`);
  const devolver = estado.reservas.filter((r) => r.devolucionPendiente > 0);
  if (devolver.length) out.push(`Plata para devolver: ${devolver.map((r) => `${r.titular} ${pesos(r.devolucionPendiente)}`).join(", ")}.`);
  const faltas = estado.reservas.filter((r) => r.deudaSinFicha > 0);
  if (faltas.length) out.push(`Faltas sin cobrar (sin ficha): ${faltas.map((r) => `${r.titular} ${pesos(r.deudaSinFicha)}`).join(", ")}.`);
  const cajas = cajasConMovimientosSinCerrar(estado);
  if (cajas.length) out.push(`Cajas sin cerrar: ${cajas.map((d) => `${d.slice(8)}/${d.slice(5, 7)}`).join(", ")}. Cerralas antes de limpiar.`);
  return out;
}

/** Lo que pasa al go-live: turnos que todavía no se jugaron (con su seña) y señas en suspenso de huecos por venir. */
const quedaParaElGoLive = (r, ahora) => (ahora ? r.fecha >= ahora.fecha : true) && (r.estado === "reservada" || (r.estado === "cancelada" && r.senaEnSuspenso));

export function limpiarParaGoLive(estado, { conservarSaldos = true, conservarStock = true } = {}, auth, ahora) {
  const a = autorizar(estado, auth, "configurar", true);
  if (!a.ok) return a;
  const pendientes = pendientesGoLive(estado, ahora);
  if (pendientes.length) return { ok: false, motivo: `Antes de limpiar hay que resolver: ${pendientes.join(" ")}`, pendientes };
  const quedan = estado.reservas.filter((r) => quedaParaElGoLive(r, ahora));
  const cuenta = { turnos: estado.reservas.length - quedan.length, cuentas: estado.cuentas.length, movimientos: estado.caja.movimientos.length, pedidos: (estado.pedidos ?? []).length, quedan: quedan.length };
  estado.reservas = quedan;
  estado.cuentas = [];
  estado.caja = { fondo: estado.caja.fondo, movimientos: [], cierres: [] };
  estado.novedades = [];
  estado.pedidos = [];
  estado.difusiones = [];
  // Lo que se le debe a un proveedor sale de sus remitos y pagos: con los saldos se conservan.
  if (!conservarSaldos) { estado.remitos = []; estado.pagosProveedor = []; }
  estado.espera = [];
  estado.solicitudesAcceso = (estado.solicitudesAcceso ?? []).filter((x) => x.estado === "pendiente");
  estado.bloqueos = (estado.bloqueos ?? []).filter((b) => !ahora?.fecha || (b.fecha ?? "") >= ahora.fecha);
  // «Esta semana no vienen» ya cargado para fechas por venir se respeta; lo viejo se limpia.
  for (const f of estado.fijos ?? []) f.excepciones = (f.excepciones ?? []).filter((d) => !ahora?.fecha || d >= ahora.fecha);
  for (const c of Object.keys(estado.luces)) estado.luces[c] = false;
  for (const p of estado.productos) { p.prestados = 0; if (!conservarStock && !p.alquiler && !p.plato) p.stock = null; }
  if (!conservarSaldos) for (const c of estado.clientes) { c.deuda = 0; c.movCC = []; c.monedero = 0; c.fiados = []; c.strikes = 0; }
  estado.log = [];
  delete estado.archivo; // el resumen de lo archivado era de la prueba: el día 1 arranca sin historia
  estado.config.goLive = { fecha: ahora?.fecha ?? null, por: a.usuario.nombre, conservarSaldos };
  registrar(estado, `${a.usuario.nombre} hizo la limpieza para el go-live: quedaron ${cuenta.quedan} turnos por jugar (con su seña); se borraron ${cuenta.turnos} turnos, ${cuenta.cuentas} cuentas, ${cuenta.movimientos} movimientos de caja y ${cuenta.pedidos} pedidos${conservarSaldos ? "; los saldos de los clientes se conservaron" : "; los saldos de los clientes quedaron en cero"}.`, ahora);
  return { ok: true, borrado: cuenta };
}

/** Cierra la consola del primer arranque: hace falta al menos un dueño con PIN. */
export function terminarConfiguracion(estado, ahora) {
  if (!estado.usuarios.some((u) => u.rol === "duenio" && u.activo !== false && u.pin)) return { ok: false, motivo: "Falta que al menos un dueño arme su PIN." };
  estado.config.configurado = true;
  registrar(estado, "Se terminó la configuración inicial del club.", ahora);
  return { ok: true };
}

// ───────────────────────── horarios por día ─────────────────────────

/** Horario del club para esa fecha (cada día de la semana tiene el suyo). */
export function horarioDe(estado, fecha) {
  const h = estado.config.horarios?.[diaSemana(fecha)];
  return h ?? { abre: estado.config.apertura, cierra: estado.config.cierre };
}

/** El dueño cambia el rango horario de un día de la semana. Avisa qué turnos ya reservados quedan afuera. */
export function ajustarHorario(estado, dia, { abre, cierra }, auth, ahora) {
  const a = autorizar(estado, auth, "configurar", false);
  if (!a.ok) return a;
  const { paso } = estado.config;
  const A = Math.round(Number(abre)), C = Math.round(Number(cierra));
  if (!(dia >= 0 && dia <= 6)) return { ok: false, motivo: "Elegí el día." };
  if (!Number.isFinite(A) || !Number.isFinite(C) || A < 0 || C > 26 * 60 || A >= C) return { ok: false, motivo: "El horario de cierre tiene que ser después del de apertura (hasta las 02:00)." };
  if (A % paso || C % paso) return { ok: false, motivo: `Los horarios van cada ${paso} minutos.` };
  estado.config.horarios[dia] = { abre: A, cierra: C };
  const afuera = estado.reservas.filter((r) => r.estado === "reservada" && diaSemana(r.fecha) === dia && (!ahora || r.fecha >= ahora.fecha) && (r.inicio < A || r.inicio + r.duracion > C));
  registrar(estado, `${a.usuario.nombre} cambió el horario de los ${NOMBRE_DIA[dia].toLowerCase()}: ${hhmm(A)} a ${hhmm(C)}.`, ahora);
  return { ok: true, afuera };
}

// ───────────────────────── tarifas ─────────────────────────

/**
 * Precio de un turno: se integra minuto a minuto contra las franjas (un turno de 17:00 a 18:30 cobra
 * 30 min de valle y 60 de pico). Fines de semana y feriados son todo pico. Redondeo a $100.
 * (Sin descuentos de socio: en Break Point son todos clientes.)
 */
export function precioTurno(estado, { fecha, inicio, duracion, canchaId }) {
  const { tarifas, feriados = [] } = estado.config;
  const findeOFeriado = [0, 6].includes(diaSemana(fecha)) || feriados.includes(fecha);
  const pico = tarifas.find((t) => t.pico) ?? tarifas[tarifas.length - 1];
  const c = cancha(estado, canchaId);
  let total = 0;
  for (let m = inicio; m < inicio + duracion; m++) {
    const franja = findeOFeriado ? pico : tarifas.find((t) => m >= t.desde && m < t.hasta) ?? pico;
    total += franja.precioHora / 60;
  }
  if (c?.recargoPct) total *= 1 + c.recargoPct / 100;
  return redondear100(total);
}

export function franjaDe(estado, fecha, min) {
  const findeOFeriado = [0, 6].includes(diaSemana(fecha)) || (estado.config.feriados ?? []).includes(fecha);
  if (findeOFeriado) return "pico";
  const f = estado.config.tarifas.find((t) => min >= t.desde && min < t.hasta);
  return f?.pico ? "pico" : "valle";
}

// ───────────────────────── disponibilidad ─────────────────────────

export function ocupantes(estado, fecha, canchaId, ignorarId) {
  const reservas = estado.reservas.filter((r) => r.fecha === fecha && r.canchaId === canchaId && r.id !== ignorarId && OCUPA.has(r.estado));
  const bloqueos = estado.bloqueos.filter((b) => b.fecha === fecha && (b.canchaId === canchaId || b.canchaId === "*"));
  return { reservas, bloqueos };
}

/** ¿Se puede ocupar este hueco? Devuelve el primer motivo en criollo si no. */
export function validarHueco(estado, { canchaId, fecha, inicio, duracion }, ignorarId) {
  const { paso } = estado.config;
  const { abre, cierra } = horarioDe(estado, fecha);
  const c = cancha(estado, canchaId);
  if (!c) return { ok: false, motivo: "Esa cancha no existe." };
  if (c.estado === "mantenimiento") return { ok: false, motivo: `${c.nombre} está en mantenimiento${c.motivoMantenimiento ? ` (${c.motivoMantenimiento})` : ""}.` };
  if (!(duracion > 0)) return { ok: false, motivo: "La duración tiene que ser mayor a cero." };
  if (inicio < abre || inicio + duracion > cierra) return { ok: false, motivo: `Ese día el club abre de ${hhmm(abre)} a ${hhmm(cierra)}.` };
  if (inicio % paso !== 0) return { ok: false, motivo: `Los turnos arrancan cada ${paso} minutos.` };
  const { reservas, bloqueos } = ocupantes(estado, fecha, canchaId, ignorarId);
  const choque = reservas.find((r) => solapa(inicio, inicio + duracion, r.inicio, r.inicio + r.duracion));
  if (choque) return { ok: false, motivo: `Se pisa con ${choque.titular} (${hhmm(choque.inicio)}–${hhmm(choque.inicio + choque.duracion)}).` };
  const bloqueo = bloqueos.find((b) => solapa(inicio, inicio + duracion, b.desde, b.hasta));
  if (bloqueo) return { ok: false, motivo: `${c.nombre} está bloqueada: ${bloqueo.motivo}.` };
  return { ok: true };
}

/** Huecos libres de una cancha para una duración, alineados a la grilla. */
export function huecosLibres(estado, fecha, canchaId, duracion, desde) {
  const out = [];
  const { paso } = estado.config;
  const { abre, cierra } = horarioDe(estado, fecha);
  const inicio0 = Math.ceil(Math.max(desde ?? abre, abre) / paso) * paso;
  for (let m = inicio0; m + duracion <= cierra; m += paso) {
    if (validarHueco(estado, { canchaId, fecha, inicio: m, duracion }).ok) out.push(m);
  }
  return out;
}

// ───────────────────────── clientes (ABM) y cuenta corriente ─────────────────────────

export function buscarClientes(estado, texto, { inactivos = false } = {}) {
  const q = String(texto ?? "").trim().toLowerCase();
  const base = estado.clientes.filter((c) => inactivos || c.activo !== false);
  if (!q) return base;
  const digitos = q.replace(/\D/g, "");
  return base.filter((c) => c.nombre.toLowerCase().includes(q) || (digitos && c.tel.replace(/\D/g, "").includes(digitos)));
}

export function altaCliente(estado, { nombre, tel = "", nivel = "" }, ahora) {
  const limpio = String(nombre ?? "").trim();
  if (!limpio) return { ok: false, motivo: "Falta el nombre del cliente." };
  const telLimpio = String(tel ?? "").trim();
  if (telLimpio && estado.clientes.some((c) => c.activo !== false && c.tel.replace(/\D/g, "") === telLimpio.replace(/\D/g, "")))
    return { ok: false, motivo: "Ya hay un cliente con ese teléfono." };
  const c = normalizarCliente({ id: nuevoId("cl"), nombre: limpio, tel: telLimpio, nivel });
  estado.clientes.push(c);
  registrar(estado, `Alta de cliente: ${limpio}.`, ahora);
  return { ok: true, cliente: c };
}

export function editarCliente(estado, clienteId, { nombre, tel, nivel }, ahora) {
  const c = cliente(estado, clienteId);
  if (!c) return { ok: false, motivo: "No encuentro al cliente." };
  if (nombre != null && !String(nombre).trim()) return { ok: false, motivo: "El nombre no puede quedar vacío." };
  if (nombre != null) c.nombre = String(nombre).trim();
  if (tel != null) c.tel = String(tel).trim();
  if (nivel != null) c.nivel = String(nivel).trim();
  registrar(estado, `Se editó la ficha de ${c.nombre}.`, ahora);
  return { ok: true, cliente: c };
}

export function bajaCliente(estado, clienteId, ahora) {
  const c = cliente(estado, clienteId);
  if (!c) return { ok: false, motivo: "No encuentro al cliente." };
  if (c.deuda > 0) return { ok: false, motivo: `${c.nombre} debe ${pesos(c.deuda)}: primero saldá la cuenta.` };
  if (estado.cuentas.some((x) => x.clienteId === clienteId && x.estado === "abierta")) return { ok: false, motivo: `${c.nombre} tiene cargos abiertos en el buffet.` };
  c.activo = false;
  registrar(estado, `Baja de cliente: ${c.nombre}.`, ahora);
  return { ok: true };
}

/** Movimiento de cuenta corriente. Positivo = el cliente debe más; negativo = pagó. */
function movimientoCC(estado, c, importe, concepto, ahora) {
  c.deuda += importe;
  c.movCC.push({ ...sello(ahora), concepto, importe, saldo: c.deuda });
}

/**
 * ¿Se le puede sumar este importe a la cuenta corriente? Sí si la tiene habilitada y le da el límite, o si un dueño
 * le aprobó un fiado puntual que lo cubre (`fiado`: se usa una sola vez, ver `usarFiado`).
 */
export function puedeACuenta(c, importe) {
  if (!c) return { ok: false, motivo: "Para sumar a la cuenta hace falta la ficha del cliente." };
  const fiado = (c.fiados ?? []).find((x) => !x.usado && x.monto >= importe);
  if (c.cc.habilitada && c.deuda + importe <= c.cc.limite) return { ok: true };
  if (fiado) return { ok: true, fiado };
  if (!c.cc.habilitada) return { ok: false, motivo: `${c.nombre} no tiene cuenta corriente habilitada: pedí la autorización al dueño.` };
  return { ok: false, motivo: `Supera el límite de ${c.nombre} (${pesos(c.cc.limite)}; ya debe ${pesos(c.deuda)}).` };
}

/** Si lo que pasó a la cuenta corriente entró por un fiado aprobado, se descuenta de ese fiado (queda lo que sobra). */
function usarFiado(p, importe) {
  if (!p?.fiado) return;
  p.fiado.monto = Math.max(0, p.fiado.monto - Math.round(Number(importe) || p.fiado.monto));
  if (p.fiado.monto === 0) p.fiado.usado = true;
}

/** Estado de cuenta del cliente, del más viejo al más nuevo, con saldo corrido. */
export function estadoDeCuenta(estado, clienteId) {
  const c = cliente(estado, clienteId);
  if (!c) return { ok: false, motivo: "No encuentro al cliente." };
  return { ok: true, movimientos: c.movCC.slice(), saldo: c.deuda, cc: { ...c.cc }, creditos: c.monedero };
}

/**
 * Recepción pide crédito para un cliente; lo autoriza un dueño (novedad). Dos tipos: «cc» habilita la cuenta
 * corriente hasta un límite; «fiado» deja pasar UNA vez a la cuenta corriente un monto puntual (la cuenta de hoy).
 */
export function solicitarCredito(estado, { clienteId, tipo = "cc", monto, cuentaId = null, nota = "" }, auth, ahora) {
  const a = autorizar(estado, auth, "solicitarCC", false);
  if (!a.ok) return a;
  const c = cliente(estado, clienteId);
  if (!c) return { ok: false, motivo: "Para pedir crédito hace falta la ficha del cliente (nombre y celular)." };
  if (!["cc", "fiado"].includes(tipo)) return { ok: false, motivo: "Elegí qué se pide." };
  const L = Math.round(Number(monto));
  if (!(L > 0)) return { ok: false, motivo: tipo === "cc" ? "Poné hasta cuánto le fiamos." : "Poné cuánto se fía." };
  if (estado.novedades.some((n) => n.estado === "pendiente" && n.clienteId === clienteId)) return { ok: false, motivo: "Ya hay un pedido para este cliente esperando al dueño." };
  const n = { id: nuevoId("n"), tipo, clienteId, cuentaId, limite: L, monto: L, nota: String(nota ?? "").slice(0, 120), pidio: a.usuario.nombre, estado: "pendiente", intentos: 0, ...sello(ahora) };
  estado.novedades.push(n);
  registrar(estado, `${a.usuario.nombre} pidió ${tipo === "cc" ? `cuenta corriente para ${c.nombre} hasta` : `fiarle a ${c.nombre}`} ${pesos(L)}.`, ahora);
  return { ok: true, novedad: n };
}

/** Atajo de siempre: pedir que se habilite la cuenta corriente. */
export function solicitarCC(estado, clienteId, { limite, nota = "" }, auth, ahora) {
  return solicitarCredito(estado, { clienteId, tipo: "cc", monto: limite, nota }, auth, ahora);
}

function aplicarCredito(estado, n, c, monto, quien, ahora, porCodigo = false) {
  if (n.tipo === "fiado") {
    c.fiados = c.fiados ?? [];
    c.fiados.push({ monto, novedadId: n.id, aprobo: quien, usado: false, ...sello(ahora) });
  } else {
    c.cc = { ...c.cc, habilitada: true, limite: monto };
  }
  n.estado = "aprobada";
  n.limiteAprobado = monto;
  n.resolvio = quien;
  n.porCodigo = porCodigo;
  registrar(estado, `${quien} ${n.tipo === "fiado" ? `aprobó fiarle ${pesos(monto)} a ${c.nombre}` : `habilitó la cuenta corriente de ${c.nombre} hasta ${pesos(monto)}`}${porCodigo ? " (código por WhatsApp)" : ""}.`, ahora);
}

/** El dueño resuelve el pedido en el sistema (con su usuario). */
export function resolverCredito(estado, novedadId, { aprobar, monto, limite }, auth, ahora) {
  // Si viene un PIN, se verifica (la confirmación «con tu PIN» no puede aceptar cualquiera).
  const a = autorizar(estado, auth, "autorizarCC", auth?.pin != null);
  if (!a.ok) return a;
  const n = estado.novedades.find((x) => x.id === novedadId && x.estado === "pendiente");
  if (!n) return { ok: false, motivo: "Ese pedido ya se resolvió." };
  const c = cliente(estado, n.clienteId);
  if (!c) return { ok: false, motivo: "No encuentro al cliente." };
  if (aprobar) {
    const L = Math.round(Number(monto ?? limite ?? n.monto ?? n.limite));
    if (!(L > 0)) return { ok: false, motivo: "Poné el monto." };
    aplicarCredito(estado, n, c, L, a.usuario.nombre, ahora);
  } else {
    n.estado = "rechazada";
    n.resolvio = a.usuario.nombre;
    registrar(estado, `${a.usuario.nombre} rechazó el crédito de ${c.nombre}.`, ahora);
  }
  return { ok: true };
}

export function resolverCC(estado, novedadId, { aprobar, limite }, auth, ahora) {
  return resolverCredito(estado, novedadId, { aprobar, monto: limite }, auth, ahora);
}

/** FNV-1a de 32 bits: chico, sin dependencias y igual en cualquier navegador. */
function fnv1a(texto) {
  let h = 0x811c9dc5;
  for (const ch of texto) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/**
 * Código de aprobación por WhatsApp (sin servidor): lo calcula el celular del dueño con SU PIN y los datos del
 * pedido, y la PC del club lo verifica con el PIN de cada dueño. Prueba que quien sabe el PIN de un dueño aprobó
 * ESTE pedido por ESTE monto. Es tan fuerte como el PIN del dueño (4 dígitos; 2 si todavía tiene el del piloto):
 * por eso hay tope de intentos por pedido. Funciona igual con cualquier largo: el PIN entra como texto al hash.
 */
export function codigoAprobacion({ pin, sal, novedadId, clienteId, monto, fecha }) {
  // La clave es el PIN con hash si el club tiene sal (`s` en el link del pedido): el celular lo calcula con el PIN
  // tipeado y el club con el que tiene guardado. Sin sal (un club que nunca pasó sus PIN a hash), el PIN como antes.
  const p = String(pin ?? "").trim();
  const clave = esPinConHash(p) ? p : sal ? hashPin(p, sal) : p;
  const base = `${clave}|${novedadId}|${clienteId}|${Math.round(Number(monto))}|${fecha ?? ""}`;
  let out = "";
  for (const sal of ["bp-a", "bp-b"]) {
    let h = fnv1a(`${sal}|${base}`);
    for (let k = 0; k < 3; k++) { out += LETRAS_REF[h % LETRAS_REF.length]; h = Math.floor(h / LETRAS_REF.length); }
  }
  return `${out.slice(0, 3)}-${out.slice(3)}`;
}

const normalizarCodigo = (c) => String(c ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const minutoAbsoluto = (t) => (t?.fecha ? Math.round(Date.parse(`${t.fecha}T00:00:00Z`) / 60000) + (t.min ?? 0) : 0);

/** Recepción tipea el código que le mandó el dueño: si coincide con el de algún dueño activo, queda aprobado. */
export function aprobarPorCodigo(estado, novedadId, { codigo, monto }, auth, ahora) {
  const a = autorizar(estado, auth, "solicitarCC", false);
  if (!a.ok) return a;
  const n = estado.novedades.find((x) => x.id === novedadId && x.estado === "pendiente");
  if (!n) return { ok: false, motivo: "Ese pedido ya se resolvió." };
  if (n.bloqueadoHasta && minutoAbsoluto(ahora) < minutoAbsoluto(n.bloqueadoHasta)) return { ok: false, motivo: `Demasiados códigos mal: probá de nuevo a las ${hhmm(n.bloqueadoHasta.min)} o que el dueño lo apruebe en el sistema.` };
  const c = cliente(estado, n.clienteId);
  const m = Math.round(Number(monto ?? n.monto));
  const tipeado = normalizarCodigo(codigo);
  if (tipeado.length !== 6) return { ok: false, motivo: "El código tiene 6 letras y números (ej. ABC-DEF)." };
  const duenio = estado.usuarios.find((u) => u.rol === "duenio" && u.activo !== false && u.pin && normalizarCodigo(codigoAprobacion({ pin: u.pin, sal: estado.salPin, novedadId: n.id, clienteId: n.clienteId, monto: m, fecha: n.fecha })) === tipeado);
  if (!duenio) {
    n.intentos = (n.intentos ?? 0) + 1;
    if (n.intentos >= 5) {
      n.intentos = 0;
      n.bloqueadoHasta = { fecha: ahora?.fecha ?? null, min: (ahora?.min ?? 0) + 30 };
      return { ok: false, motivo: "Cinco códigos mal: este pedido queda trabado 30 minutos. Que el dueño lo apruebe en el sistema." };
    }
    return { ok: false, motivo: `Ese código no sirve para este pedido y este monto (${n.intentos} de 5). Fijate el monto que aprobó el dueño.` };
  }
  aplicarCredito(estado, n, c, m, duenio.nombre, ahora, true);
  return { ok: true, aprobo: duenio.nombre, monto: m };
}

/** Lo que el link de WhatsApp lleva para que el celular del dueño calcule el código sin tener el estado. */
export function datosAprobacion(estado, novedadId) {
  const n = estado.novedades.find((x) => x.id === novedadId);
  if (!n) return null;
  return { id: n.id, c: n.clienteId, n: cliente(estado, n.clienteId)?.nombre ?? "", m: n.monto ?? n.limite, t: n.tipo ?? "cc", p: n.pidio, f: n.fecha ?? "", ...(estado.salPin ? { s: estado.salPin } : {}) };
}

/** El dueño ajusta o corta la cuenta corriente directamente. */
export function configurarCC(estado, clienteId, { habilitada, limite }, auth, ahora) {
  const a = autorizar(estado, auth, "autorizarCC", false);
  if (!a.ok) return a;
  const c = cliente(estado, clienteId);
  if (!c) return { ok: false, motivo: "No encuentro al cliente." };
  const L = Math.round(Number(limite ?? c.cc.limite));
  if (habilitada && !(L > 0)) return { ok: false, motivo: "Poné el límite." };
  c.cc = { habilitada: !!habilitada, limite: habilitada ? L : c.cc.limite };
  registrar(estado, `${a.usuario.nombre} ${habilitada ? `dejó la cuenta corriente de ${c.nombre} en ${pesos(L)}` : `cortó la cuenta corriente de ${c.nombre}`}.`, ahora);
  return { ok: true };
}

/** El cliente paga su cuenta corriente (todo o una parte). */
export function cobrarDeuda(estado, clienteId, { medio, monto } = {}, ahora) {
  const c = cliente(estado, clienteId);
  if (!c) return { ok: false, motivo: "No encuentro al cliente." };
  if (!(c.deuda > 0)) return { ok: false, motivo: `${c.nombre} no debe nada.` };
  if (!MEDIOS_DE_CAJA.includes(medio)) return { ok: false, motivo: "Elegí cómo paga (efectivo, Mercado Pago, transferencia o tarjeta)." };
  const importe = monto == null ? c.deuda : Math.round(Number(monto));
  if (!(importe > 0)) return { ok: false, motivo: "El monto tiene que ser mayor a cero." };
  if (importe > c.deuda) return { ok: false, motivo: `Debe ${pesos(c.deuda)}: no se puede cobrar de más.` };
  movimientoCaja(estado, { tipo: "ingreso", medio, monto: importe, concepto: `Cuenta corriente de ${c.nombre}` }, ahora);
  movimientoCC(estado, c, -importe, `Pago (${MEDIOS[medio]})`, ahora);
  registrar(estado, `${c.nombre} pagó ${pesos(importe)} de su cuenta (${MEDIOS[medio]}).`, ahora);
  return { ok: true, monto: importe, saldo: c.deuda };
}

// ───────────────────────── reservas (la cuenta de la CANCHA) ─────────────────────────

/** ¿Este cliente tiene que dejar seña? Reincidentes, clientes con deuda y turnos sin ficha. Clases y fijos no. */
export function requiereSena(estado, clienteId, tipo) {
  const { politica } = estado.config;
  if (tipo === "clase" || tipo === "fijo") return false;
  const cl = clienteId ? cliente(estado, clienteId) : null;
  if (!cl) return politica.senaSinCliente;
  if (cl.strikes >= politica.strikesParaSena) return true;
  if (cl.deuda > 0 && !cl.cc.habilitada) return true;
  return politica.senaSiempre;
}

/**
 * Seña para reservas ONLINE (turnero web). Online no hay nadie mirando a la cara, así que la seña se pide salvo
 * a quien ya es de confianza: `senaWeb` = "siempre" | "nuevos" (pide a quien jugó menos de `turnosConfianza`
 * turnos o tiene faltas) | "politica" (igual que el mostrador). Las reglas del mostrador mandan siempre.
 */
export function requiereSenaWeb(estado, clienteId) {
  const { politica } = estado.config;
  const modo = politica.senaWeb ?? "nuevos";
  if (requiereSena(estado, clienteId, "turno")) return true;
  if (modo === "politica") return false;
  if (modo === "siempre") return true;
  const cl = clienteId ? cliente(estado, clienteId) : null;
  if (!cl || cl.strikes > 0) return true;
  // Los turnos ya archivados también cuentan (archivarDiasCerrados deja cuántos jugó cada uno).
  const jugados = estado.reservas.filter((r) => r.clienteId === cl.id && r.estado === "finalizada").length + (estado.archivo?.clientes?.[cl.id]?.jugados ?? 0);
  return jugados < (politica.turnosConfianza ?? 3);
}

/**
 * Turnos online cuya seña no llegó a tiempo. Con `liberarSinSena: "manual"` (por defecto) el turno NO se cae solo:
 * queda marcado `senaVencida` y aparece en la bandeja para que el club decida (una transferencia puede demorar).
 * Con "auto" se libera y se ofrece a la lista de espera. Cada turno se informa una sola vez.
 */
export function vencerSenas(estado, ahora) {
  const out = [];
  const auto = estado.config.politica.liberarSinSena === "auto";
  for (const r of estado.reservas) {
    if (r.estado !== "reservada" || !r.venceSena || r.sena.pagada || !(r.sena.monto > 0) || r.senaVencida) continue;
    if (minutosHasta(ahora, r.venceSena.fecha, r.venceSena.min) > 0) continue;
    if (!auto) {
      r.senaVencida = true;
      registrar(estado, `Venció el plazo de la seña de ${r.titular} (${hhmm(r.inicio)}): el club decide si lo libera.`, ahora);
      out.push({ reserva: r, liberada: false, ofertas: [] });
      continue;
    }
    const res = cancelar(estado, r.id, { porClub: true, motivo: "Venció el plazo de la seña" }, ahora);
    if (res.ok) out.push({ reserva: r, liberada: true, ofertas: res.ofertas });
  }
  return out;
}

const LETRAS_REF = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin 0/O ni 1/I: se dictan por teléfono sin confusión

/**
 * Código de la seña (BP-XXXX) para el concepto de la transferencia: así el comprobante se ata solo al turno,
 * venga de la web o del mostrador. No es un secreto (nada se confirma sólo por el código en modo real).
 */
export function nuevaRefPago(estado, azar = Math.random) {
  let s;
  do s = "BP-" + Array.from({ length: 4 }, () => LETRAS_REF[Math.floor(azar() * LETRAS_REF.length)]).join("");
  while (estado.reservas.some((r) => r.ref === s) || codigoArchivado(estado, "refs", s));
  return s;
}

export function crearReserva(estado, datos, ahora) {
  const {
    canchaId, fecha, inicio, duracion = estado.config.duracionTurno, tipo = "turno", clienteId = null,
    titular, jugadores, origen = "mostrador", notas = "", fijoId = null, precio: precioFijo,
    conSena, plazoSenaMin = 0,
  } = datos;
  const cl = clienteId ? cliente(estado, clienteId) : null;
  const nombre = String(titular ?? cl?.nombre ?? "").trim();
  if (!nombre) return { ok: false, motivo: "¿A nombre de quién va el turno?" };
  // Desde el mostrador se puede cargar un turno que ya está en juego (se olvidaron de cargarlo) mientras no terminó;
  // desde la web, sólo lo que todavía no empezó.
  if (ahora) {
    const falta = minutosHasta(ahora, fecha, inicio);
    if (origen === "web" ? falta < -estado.config.paso : falta + duracion <= 0) return { ok: false, motivo: "Ese horario ya pasó." };
  }
  const v = validarHueco(estado, { canchaId, fecha, inicio, duracion });
  if (!v.ok) return v;

  const precio = precioFijo ?? precioTurno(estado, { fecha, inicio, duracion, canchaId });
  const pideSena = conSena ?? requiereSena(estado, clienteId, tipo);
  const senaMonto = pideSena ? redondear100((precio * estado.config.politica.senaPct) / 100) : 0;
  const lista = (jugadores?.length ? jugadores : [nombre]).slice(0, 4).map((j) => (typeof j === "string" ? { nombre: j } : { ...j }));
  if (cl && !lista[0].clienteId && lista[0].nombre === nombre) lista[0].clienteId = cl.id;
  const r = {
    id: nuevoId("r"),
    canchaId, fecha, inicio, duracion, tipo, clienteId, titular: nombre, origen, notas, fijoId,
    jugadores: lista,
    precio,
    sena: { monto: senaMonto, pagada: false },
    pagos: [],
    estado: "reservada",
    checkIn: null,
    creada: ahora ? { ...ahora } : null,
    senaEnSuspenso: false,
  };
  if (senaMonto > 0) r.ref = nuevaRefPago(estado);
  // Seña con plazo (reservas online): si no llega a tiempo, el turno se libera solo (vencerSenas).
  if (senaMonto > 0 && plazoSenaMin > 0 && ahora) {
    const hastaTurno = minutosHasta(ahora, fecha, inicio);
    const plazo = Math.max(5, Math.min(plazoSenaMin, hastaTurno));
    r.venceSena = { fecha: ahora.fecha, min: ahora.min + plazo };
  }
  estado.reservas.push(r);
  const liberadas = liberarSenasPorRelleno(estado, r, ahora);
  registrar(estado, `Turno ${hhmm(inicio)} en ${cancha(estado, canchaId).nombre} para ${nombre}.`, ahora);
  return { ok: true, reserva: r, liberadas };
}

/** Seña protegida por relleno: si el hueco de una cancelación tardía se vuelve a vender, la seña vuelve como crédito. */
function liberarSenasPorRelleno(estado, nueva, ahora) {
  const out = [];
  for (const r of estado.reservas) {
    if (!r.senaEnSuspenso || r.fecha !== nueva.fecha || r.canchaId !== nueva.canchaId) continue;
    if (nueva.inicio <= r.inicio && nueva.inicio + nueva.duracion >= r.inicio + r.duracion) {
      r.senaEnSuspenso = false;
      const retenida = cobrado(r);
      const cl = r.clienteId ? cliente(estado, r.clienteId) : null;
      if (cl && retenida > 0) {
        cl.monedero += retenida;
        out.push({ cliente: cl.nombre, monto: retenida });
        registrar(estado, `Se rellenó el hueco de ${cl.nombre}: ${pesos(retenida)} vuelven como crédito.`, ahora);
      }
    }
  }
  return out;
}

export const cobrado = (r) => r.pagos.reduce((s, p) => s + p.monto, 0);
export const totalReserva = (r) => r.precio;
export const saldo = (r) => totalReserva(r) - cobrado(r);

/** Divide el total en partes que suman exacto (el resto va a las primeras). */
export function dividir(total, n) {
  const partes = Math.max(1, n);
  const base = Math.floor(total / partes / 10) * 10;
  const out = Array(partes).fill(base);
  let resto = total - base * partes;
  for (let i = 0; resto > 0; i = (i + 1) % partes) {
    const paso = Math.min(10, resto);
    out[i] += paso;
    resto -= paso;
  }
  return out;
}

function movimientoCaja(estado, { tipo, medio, monto, concepto, reservaId = null, usuario: quien = null }, ahora) {
  const mov = { id: nuevoId("m"), tipo, medio, monto, concepto, reservaId, usuario: quien, ...sello(ahora), ...(ahora && { caja: cajaAbierta(estado, ahora) }) };
  estado.caja.movimientos.push(mov);
  return mov;
}

function cobrarConCreditos(estado, clienteId, importe) {
  const cl = clienteId ? cliente(estado, clienteId) : null;
  if (!cl || cl.monedero < importe) return { ok: false, motivo: "No le alcanzan los créditos." };
  cl.monedero -= importe;
  return { ok: true };
}

/** Cobro de la CANCHA (seña, turno, la parte de cada jugador). Los consumos van en su propia cuenta. */
export function registrarPago(estado, reservaId, { medio, monto, jugador = null, concepto, auth = null }, ahora) {
  const r = reserva(estado, reservaId);
  if (!r) return { ok: false, motivo: "No encuentro el turno." };
  if (!["reservada", "en_cancha"].includes(r.estado)) return { ok: false, motivo: "La cancha de ese turno ya está cerrada: no se le cobra más." };
  if (auth) { const a = autorizar(estado, auth, "cobrar", false); if (!a.ok) return a; }
  if (!MEDIOS[medio]) return { ok: false, motivo: "Elegí cómo paga." };
  const importe = Math.round(Number(monto));
  if (!(importe > 0)) return { ok: false, motivo: "El monto tiene que ser mayor a cero." };
  if (importe > saldo(r)) return { ok: false, motivo: `Está cobrando de más: a la cancha le quedan ${pesos(saldo(r))}.` };
  if (medio === "monedero") {
    const quien = jugador != null ? r.jugadores[jugador]?.clienteId : r.clienteId;
    const c = cobrarConCreditos(estado, quien ?? r.clienteId, importe);
    if (!c.ok) return c;
  }
  const esSena = !r.sena.pagada && r.sena.monto > 0 && r.estado === "reservada";
  r.pagos.push({ medio, monto: importe, jugador, ...sello(ahora) });
  if (esSena && cobrado(r) >= r.sena.monto) r.sena.pagada = true;
  if (medio !== "monedero") movimientoCaja(estado, { tipo: "ingreso", medio, monto: importe, concepto: concepto ?? `${esSena ? "Seña" : "Cancha"} ${r.titular}`, reservaId }, ahora);
  // Un pago sin jugador elegido (la seña) es del titular, si juega: así no vuelve a pagar su parte.
  const quienPago = jugador != null ? jugador : indiceTitular(r);
  if (quienPago >= 0 && r.jugadores[quienPago]) r.jugadores[quienPago].pagado = (r.jugadores[quienPago].pagado ?? 0) + importe;
  registrar(estado, `Cobro de cancha ${pesos(importe)} (${MEDIOS[medio]}) — ${r.titular}.`, ahora);
  return { ok: true, saldo: saldo(r) };
}

/** El titular entre los jugadores (por su ficha o por su nombre); -1 si no juega (ej. un partido abierto). */
function indiceTitular(r) {
  const i = r.clienteId ? r.jugadores.findIndex((j) => j.clienteId === r.clienteId) : -1;
  return i >= 0 ? i : r.jugadores.findIndex((j) => j.nombre === r.titular);
}

/** Reparte `monto` en proporción a `pesos`, en pesos enteros que suman exacto (resto mayor). */
function repartir(monto, pesos) {
  const suma = pesos.reduce((s, x) => s + x, 0);
  if (!(monto > 0) || !(suma > 0)) return pesos.map(() => 0);
  const crudo = pesos.map((x) => (monto * x) / suma), base = crudo.map(Math.floor);
  let falta = monto - base.reduce((s, x) => s + x, 0);
  for (const i of crudo.map((x, i) => i).sort((a, b) => (crudo[b] - base[b]) - (crudo[a] - base[a]))) { if (falta <= 0) break; base[i]++; falta--; }
  return base;
}

/**
 * Partes de la cancha por jugador. Cada uno debe su cuota menos lo que ya pagó; lo que alguien pagó de más (o se
 * cobró sin elegir jugador) baja lo que deben los demás, en proporción. Si alguien está «a cargo de» otro jugador,
 * su parte la paga ese otro (la suya más la del que invita).
 * Quien pagó su parte (`saldado`, o la pagó otro: `pagadoPor`) sale del reparto: si no, con una seña mayor que la
 * cuota, el que ya pagó volvía a deber en la vuelta siguiente y el turno nunca cerraba (B3 del Gate).
 * Si queda saldo y todos están saldados (subió el precio después), se reparte otra vez entre los que juegan.
 */
export function partesCancha(r) {
  const cuota = dividir(totalReserva(r), Math.max(1, r.jugadores.length));
  const cerrado = (j) => j.pagadoPor != null || j.saldado === true;
  const debe = r.jugadores.map((j, i) => (cerrado(j) ? 0 : Math.max(0, cuota[i] - (j.pagado ?? 0))));
  const pago = (j, i) => cerrado(j) || debe[i] === 0;
  const resta = Math.max(0, saldo(r));
  const abiertos = r.jugadores.map((j) => (cerrado(j) ? 0 : 1));
  const propios = r.jugadores.map((j) => (j.pagadoPor != null ? 0 : 1));
  const pesos = debe.some((x) => x > 0) ? debe : abiertos.some((x) => x > 0) ? abiertos : propios.some((x) => x > 0) ? propios : r.jugadores.map(() => 1);
  const propia = repartir(resta, pesos);
  const pagador = (i) => {
    const k = r.jugadores[i]?.aCargoDe;
    return k != null && k !== i && r.jugadores[k] && !pago(r.jugadores[k], k) && !pago(r.jugadores[i], i) ? k : i;
  };
  const aPagar = r.jugadores.map(() => 0);
  propia.forEach((m, i) => { aPagar[pagador(i)] += m; });
  return r.jugadores.map((j, i) => ({ propia: propia[i], aPagar: aPagar[i], aCargoDe: pagador(i) !== i ? pagador(i) : null, pago: pago(j, i) && propia[i] === 0 }));
}

/** La parte de la cancha de un jugador pasa a cargo de otro (null: vuelve a pagar la suya). */
export function asignarCargoCancha(estado, reservaId, deIdx, aIdx, ahora) {
  const r = reserva(estado, reservaId);
  if (!r) return { ok: false, motivo: "No encuentro el turno." };
  const de = r.jugadores[deIdx];
  if (!de) return { ok: false, motivo: "Elegí el jugador." };
  const partes = partesCancha(r);
  if (partes[deIdx].pago) return { ok: false, motivo: `${de.nombre} ya pagó su parte.` };
  if (aIdx == null || aIdx === "" || Number(aIdx) === Number(deIdx)) {
    delete de.aCargoDe;
    registrar(estado, `${de.nombre} paga su propia parte de la cancha.`, ahora);
    return { ok: true };
  }
  const k = Number(aIdx);
  const a = r.jugadores[k];
  if (!a) return { ok: false, motivo: "Elegí quién paga." };
  if (partes[k].pago) return { ok: false, motivo: `${a.nombre} ya pagó: cobrale aparte o elegí a otro.` };
  if (partes[k].aCargoDe != null) return { ok: false, motivo: `${a.nombre} ya está a cargo de ${r.jugadores[a.aCargoDe]?.nombre ?? "otro"}.` };
  if (partes.some((x, i) => i !== Number(deIdx) && x.aCargoDe === Number(deIdx))) return { ok: false, motivo: `${de.nombre} ya paga la parte de otro: no puede pasar a cargo de nadie.` };
  de.aCargoDe = k;
  registrar(estado, `La parte de cancha de ${de.nombre} queda a cargo de ${a.nombre}.`, ahora);
  return { ok: true };
}

/** Cobra la parte de un jugador (con las de los que tiene a cargo) y marca pagados a todos. */
export function cobrarParte(estado, reservaId, idx, { medio, auth = null }, ahora) {
  const r = reserva(estado, reservaId);
  if (!r) return { ok: false, motivo: "No encuentro el turno." };
  const partes = partesCancha(r);
  const p = partes[idx];
  if (!p || !(p.aPagar > 0)) return { ok: false, motivo: "Ese jugador no tiene nada para pagar de la cancha." };
  const cubiertos = partes.map((x, i) => (x.aCargoDe === idx ? i : -1)).filter((i) => i >= 0);
  const quien = r.jugadores[idx].nombre;
  const concepto = cubiertos.length ? `Cancha ${r.titular} — ${quien} paga también por ${cubiertos.map((i) => r.jugadores[i].nombre).join(", ")}` : undefined;
  const res = registrarPago(estado, reservaId, { medio, monto: p.aPagar, jugador: idx, auth, ...(concepto && { concepto }) }, ahora);
  if (!res.ok) return res;
  r.jugadores[idx].saldado = true;
  for (const i of cubiertos) r.jugadores[i].pagadoPor = idx;
  return { ...res, monto: p.aPagar, cubiertos: cubiertos.map((i) => r.jugadores[i].nombre) };
}

export function sumarJugador(estado, reservaId, nombre, clienteId = null) {
  const r = reserva(estado, reservaId);
  if (!r) return { ok: false, motivo: "No encuentro el turno." };
  const c = clienteId ? cliente(estado, clienteId) : null;
  const limpio = String(c?.nombre ?? nombre ?? "").trim();
  if (!limpio) return { ok: false, motivo: "Escribí el nombre del jugador." };
  if (r.jugadores.length >= 4) return { ok: false, motivo: "Ya están los cuatro." };
  r.jugadores.push({ nombre: limpio, clienteId: c?.id ?? null });
  return { ok: true };
}

// ───────────────────────── cuentas de consumo (buffet) ─────────────────────────

export const totalCuenta = (c) => c.items.reduce((s, i) => s + i.cant * i.precioUnit, 0);
export const cobradoCuenta = (c) => c.pagos.reduce((s, p) => s + p.monto, 0);
export const saldoCuenta = (c) => totalCuenta(c) - cobradoCuenta(c);

/**
 * Abre (o reusa) la cuenta de consumo de alguien. Un cliente con ficha tiene UNA cuenta abierta a la vez:
 * lo que consume queda abierto a su nombre aunque cierre la cancha, y se cobra cuando se va (o va a su
 * cuenta corriente). Sin ficha, la cuenta se identifica por el turno y el jugador.
 */
export function abrirCuenta(estado, { clienteId = null, titular, reservaId = null, jugadorIdx = null }, ahora) {
  const c = clienteId ? cliente(estado, clienteId) : null;
  const nombre = String(c?.nombre ?? titular ?? "").trim();
  if (!nombre) return { ok: false, motivo: "¿A nombre de quién abrimos la cuenta?" };
  const ya = estado.cuentas.find((x) => x.estado === "abierta" && (clienteId ? x.clienteId === clienteId : !x.clienteId && x.reservaId === reservaId && x.jugadorIdx === jugadorIdx && x.titular === nombre));
  if (ya) {
    if (reservaId && !ya.reservaId) { ya.reservaId = reservaId; ya.jugadorIdx = jugadorIdx; }
    return { ok: true, cuenta: ya, reusada: true };
  }
  const nueva = { id: nuevoId("cta"), clienteId, titular: nombre, reservaId, jugadorIdx, items: [], pagos: [], estado: "abierta", abierta: sello(ahora) };
  estado.cuentas.push(nueva);
  registrar(estado, `Se abrió la cuenta de cargos de ${nombre}.`, ahora);
  return { ok: true, cuenta: nueva };
}

export function cargarEnCuenta(estado, cuentaId, productoId, cant = 1, ahora) {
  const cta = cuenta(estado, cuentaId);
  if (!cta || cta.estado !== "abierta") return { ok: false, motivo: "Esa cuenta no está abierta." };
  const p = producto(estado, productoId);
  if (!p || p.activo === false) return { ok: false, motivo: "No encuentro el producto." };
  const n = Math.round(Number(cant));
  if (!(n > 0)) return { ok: false, motivo: "La cantidad tiene que ser mayor a cero." };
  if (p.stock != null && p.stock < n) return { ok: false, motivo: `No queda stock de ${p.nombre} (quedan ${p.stock}).` };
  if (p.stock != null) p.stock -= n;
  if (p.alquiler) p.prestados = (p.prestados ?? 0) + n;
  const item = { productoId, nombre: p.nombre, cant: n, precioUnit: p.precio, alquiler: !!p.alquiler, plato: !!p.plato, devuelto: false, ...sello(ahora) };
  cta.items.push(item);
  registrar(estado, `${n} × ${p.nombre} a la cuenta de ${cta.titular}.`, ahora);
  return { ok: true, item, cuenta: cta };
}

export function pagarCuenta(estado, cuentaId, { medio, monto }, ahora) {
  const cta = cuenta(estado, cuentaId);
  if (!cta || cta.estado !== "abierta") return { ok: false, motivo: "Esa cuenta no está abierta." };
  if (!MEDIOS[medio]) return { ok: false, motivo: "Elegí cómo paga." };
  const importe = Math.round(Number(monto ?? saldoCuenta(cta)));
  if (!(importe > 0)) return { ok: false, motivo: "El monto tiene que ser mayor a cero." };
  if (importe > saldoCuenta(cta)) return { ok: false, motivo: `Está cobrando de más: la cuenta debe ${pesos(saldoCuenta(cta))}.` };
  if (medio === "monedero") {
    const c = cobrarConCreditos(estado, cta.clienteId, importe);
    if (!c.ok) return c;
  } else {
    movimientoCaja(estado, { tipo: "ingreso", medio, monto: importe, concepto: `Buffet ${cta.titular}` }, ahora);
  }
  cta.pagos.push({ medio, monto: importe, ...sello(ahora) });
  registrar(estado, `Cobro de cargos ${pesos(importe)} (${MEDIOS[medio]}) — ${cta.titular}.`, ahora);
  return { ok: true, saldo: saldoCuenta(cta) };
}

/**
 * Producto para un jugador del turno, con las DOS opciones del mostrador:
 *  · "cuenta": va a la cuenta de consumo de ese jugador (queda abierta);
 *  · "cobrar": se carga y se cobra en el acto.
 */
export function consumoJugador(estado, reservaId, jugadorIdx, productoId, cant, { modo = "cuenta", medio } = {}, ahora) {
  const r = reserva(estado, reservaId);
  if (!r) return { ok: false, motivo: "No encuentro el turno." };
  const j = r.jugadores[jugadorIdx];
  if (!j) return { ok: false, motivo: "Elegí el jugador." };
  if (modo === "cobrar" && !MEDIOS[medio]) return { ok: false, motivo: "Elegí cómo paga." };
  const p = producto(estado, productoId);
  if (!p || p.activo === false) return { ok: false, motivo: "No encuentro el producto." };
  if (p.stock != null && p.stock < Math.round(Number(cant))) return { ok: false, motivo: `No queda stock de ${p.nombre} (quedan ${p.stock}).` };
  const abierta = abrirCuenta(estado, { clienteId: j.clienteId ?? null, titular: j.nombre, reservaId, jugadorIdx }, ahora);
  if (!abierta.ok) return abierta;
  const carga = cargarEnCuenta(estado, abierta.cuenta.id, productoId, cant, ahora);
  if (!carga.ok) return carga;
  if (modo === "cobrar") {
    const pago = pagarCuenta(estado, abierta.cuenta.id, { medio, monto: carga.item.cant * carga.item.precioUnit }, ahora);
    if (!pago.ok) return pago;
    // Cobrado en el acto y sin nada alquilado en uso: no queda una cuenta abierta en cero dando vueltas.
    const cta = abierta.cuenta;
    if (saldoCuenta(cta) === 0 && !cta.items.some((i) => i.alquiler && !i.devuelto)) cerrarCuenta(estado, cta.id, {}, ahora);
  }
  return { ok: true, cuenta: abierta.cuenta };
}

/**
 * Suma o resta unidades de un cargo ya cargado (uno de más, uno de menos, se equivocaron de producto). Lo que
 * vuelve, vuelve al stock. Nunca deja la cuenta por debajo de lo que ya se pagó.
 */
export function ajustarCargo(estado, cuentaId, itemIdx, delta, ahora, auth = null) {
  if (auth) { const a = autorizar(estado, auth, "buffet", false); if (!a.ok) return a; }
  const cta = cuenta(estado, cuentaId);
  if (!cta || cta.estado !== "abierta") return { ok: false, motivo: "Esa cuenta no está abierta." };
  const item = cta.items[itemIdx];
  if (!item) return { ok: false, motivo: "No encuentro ese cargo." };
  const d = Math.round(Number(delta));
  if (!d) return { ok: false, motivo: "Decí cuánto sumar o restar." };
  const nueva = item.cant + d;
  if (nueva < 0) return { ok: false, motivo: `No se pueden sacar más de ${item.cant}.` };
  if (totalCuenta(cta) + d * item.precioUnit < cobradoCuenta(cta)) return { ok: false, motivo: `Ya se pagaron ${pesos(cobradoCuenta(cta))} de esta cuenta: no puede quedar en menos.` };
  const p = item.productoId ? producto(estado, item.productoId) : null;
  if (item.manual && d > 0) return { ok: false, motivo: "Un cargo manual no se multiplica: cargá otro." };
  if (p && p.stock != null && !(item.alquiler && item.devuelto)) {
    if (d > 0 && p.stock < d) return { ok: false, motivo: `No queda stock de ${p.nombre} (quedan ${p.stock}).` };
    p.stock -= d;
    if (item.alquiler) p.prestados = Math.max(0, (p.prestados ?? 0) + d);
  }
  item.cant = nueva;
  if (nueva === 0) cta.items.splice(itemIdx, 1);
  registrar(estado, `${d > 0 ? "Se sumó" : "Se restó"} ${Math.abs(d)} × ${item.nombre} en la cuenta de ${cta.titular}.`, ahora);
  return { ok: true, cuenta: cta };
}

/**
 * Pasa un cargo (o parte de sus unidades) a la cuenta de otra persona: la mesa compleja se reparte como
 * quieran, cargo por cargo. Lo que ya está pagado en la cuenta de origen no puede quedar sin respaldo.
 */
export function transferirCargo(estado, deCuentaId, itemIdx, aCuentaId, cant, ahora, auth = null) {
  if (auth) { const a = autorizar(estado, auth, "buffet", false); if (!a.ok) return a; }
  const de = cuenta(estado, deCuentaId);
  const a = cuenta(estado, aCuentaId);
  if (!de || de.estado !== "abierta" || !a || a.estado !== "abierta") return { ok: false, motivo: "Las dos cuentas tienen que estar abiertas." };
  if (de.id === a.id) return { ok: false, motivo: "Elegí otra cuenta." };
  const item = de.items[itemIdx];
  if (!item) return { ok: false, motivo: "No encuentro ese cargo." };
  if (item.precioUnit < 0) return { ok: false, motivo: "Un descuento queda en la cuenta donde lo autorizó el dueño: no se pasa a otra." };
  const n = cant == null || cant === "" ? item.cant : Math.round(Number(cant));
  if (!(n > 0) || n > item.cant) return { ok: false, motivo: `Se pueden pasar de 1 a ${item.cant}.` };
  if (totalCuenta(de) - n * item.precioUnit < cobradoCuenta(de)) return { ok: false, motivo: `De la cuenta de ${de.titular} ya se pagaron ${pesos(cobradoCuenta(de))}: ese cargo no se puede pasar.` };
  if (totalCuenta(a) + n * item.precioUnit < Math.max(0, cobradoCuenta(a))) return { ok: false, motivo: `La cuenta de ${a.titular} quedaría por debajo de lo que ya pagó.` };
  const movido = { ...item, cant: n, transferidoDe: de.titular };
  if (n === item.cant) de.items.splice(itemIdx, 1); else item.cant -= n;
  a.items.push(movido);
  registrar(estado, `${n} × ${item.nombre} pasó de la cuenta de ${de.titular} a la de ${a.titular}.`, ahora);
  return { ok: true };
}

/**
 * Cargo manual para la excepción (mesa compleja, un precio especial, algo que no está en la lista). Un monto
 * negativo es un descuento: sólo el dueño, con su PIN, y nunca deja la cuenta por debajo de lo pagado.
 */
export function cargoManual(estado, cuentaId, { concepto, monto }, auth, ahora) {
  const cta = cuenta(estado, cuentaId);
  if (!cta || cta.estado !== "abierta") return { ok: false, motivo: "Esa cuenta no está abierta." };
  const texto = String(concepto ?? "").trim().slice(0, 60);
  if (!texto) return { ok: false, motivo: "Escribí el concepto del cargo." };
  const m = Math.round(Number(monto));
  if (!m) return { ok: false, motivo: "Poné el monto." };
  const a = autorizar(estado, auth, m < 0 ? "configurar" : "cobrar", m < 0);
  if (!a.ok) return m < 0 && a.motivo?.includes("permiso") ? { ok: false, motivo: "Un descuento lo autoriza el dueño con su PIN." } : a;
  if (totalCuenta(cta) + m < Math.max(0, cobradoCuenta(cta))) return { ok: false, motivo: "El descuento deja la cuenta por debajo de lo que ya se pagó." };
  const item = { productoId: null, nombre: texto, cant: 1, precioUnit: m, manual: true, alquiler: false, plato: false, devuelto: false, por: a.usuario?.nombre ?? null, ...sello(ahora) };
  cta.items.push(item);
  registrar(estado, `Cargo manual a ${cta.titular}: ${texto} ${pesos(m)}${a.usuario ? ` (${a.usuario.nombre})` : ""}.`, ahora);
  return { ok: true, item };
}

/** Compatibilidad: consumo a la cuenta del titular del turno (o del jugador indicado). */
export function agregarConsumo(estado, reservaId, productoId, cant = 1, ahora, jugadorIdx = 0) {
  return consumoJugador(estado, reservaId, jugadorIdx, productoId, cant, { modo: "cuenta" }, ahora);
}

function devolverAlquileresDeCuenta(estado, cta) {
  for (const i of cta.items) {
    if (!i.alquiler || i.devuelto) continue;
    const p = producto(estado, i.productoId);
    if (p) { p.stock += i.cant; p.prestados = Math.max(0, (p.prestados ?? 0) - i.cant); }
    i.devuelto = true;
  }
}

/** Lo alquilado para un turno vuelve al stock cuando termina el juego (aunque la cuenta siga abierta). */
function devolverAlquileresDelTurno(estado, r) {
  for (const cta of estado.cuentas.filter((x) => x.reservaId === r.id)) devolverAlquileresDeCuenta(estado, cta);
}

/**
 * Cerrar la cuenta de cargos: cobrada, o el saldo a la cuenta corriente del cliente. Si paga los cargos de otros
 * («a cargo de»), con `aCuenta` los de ellos van a SU cuenta corriente y esas cuentas se cierran con la suya; una
 * cuenta que paga otro no se cierra sola con saldo (se cobra con la del que paga).
 */
export function cerrarCuenta(estado, cuentaId, { aCuenta = false } = {}, ahora) {
  const cta = cuenta(estado, cuentaId);
  if (!cta || cta.estado !== "abierta") return { ok: false, motivo: "Esa cuenta ya está cerrada." };
  const pagador = pagadorDe(estado, cta);
  if (pagador && saldoCuenta(cta) > 0) return { ok: false, motivo: `Los cargos de ${cta.titular} los paga ${pagador.titular}: cobralos con la cuenta de ${pagador.titular}.` };
  const deps = dependientes(estado, cta);
  const debeDeps = deps.reduce((s, x) => s + Math.max(0, saldoCuenta(x)), 0);
  const debe = saldoCuenta(cta);
  if ((debe > 0 || debeDeps > 0) && !aCuenta) return { ok: false, motivo: `La cuenta de ${cta.titular} debe ${pesos(debe + debeDeps)}${debeDeps ? " (con lo que paga de otros)" : ""}: cobrala o sumala a su cuenta corriente.` };
  const total = Math.max(0, debe) + debeDeps;
  let p = null;
  const c = cta.clienteId ? cliente(estado, cta.clienteId) : null;
  if (total > 0) {
    p = puedeACuenta(c, total);
    if (!p.ok) return p;
  }
  if (debe > 0) { movimientoCC(estado, c, debe, `Cargos del buffet${p.fiado ? ` (fiado aprobado por ${p.fiado.aprobo})` : ""}`, ahora); cta.aCuentaCorriente = debe; }
  for (const x of deps) {
    const d = saldoCuenta(x);
    if (d > 0) { movimientoCC(estado, c, d, `Cargos de ${x.titular} (a su cargo)`, ahora); x.aCuentaCorriente = d; x.aCuentaCorrienteDe = c.id; }
    devolverAlquileresDeCuenta(estado, x);
    x.estado = "cerrada";
    x.cerrada = sello(ahora);
  }
  usarFiado(p, total);
  devolverAlquileresDeCuenta(estado, cta);
  cta.estado = "cerrada";
  cta.cerrada = sello(ahora);
  registrar(estado, `Se cerró la cuenta de cargos de ${cta.titular}${total > 0 ? ` (${pesos(total)} a cuenta corriente)` : ""}${deps.length ? ` con la de ${deps.map((x) => x.titular).join(", ")}` : ""}.`, ahora);
  return { ok: true };
}

// ───────────────────────── la cuenta del turno: cancha + cargos en un solo lugar ─────────────────────────

/**
 * La cuenta de cargos abierta de un jugador del turno (por su ficha; sin ficha, por el turno y su lugar). Con la
 * cancha ya cerrada, sólo la que se abrió en ESE turno: un cliente que después juega otro no mezcla las mesas.
 */
export function cuentaDeJugador(estado, r, idx) {
  const j = r?.jugadores[idx];
  if (!j) return null;
  const abierto = ["reservada", "en_cancha"].includes(r.estado);
  return estado.cuentas.find((x) => x.estado === "abierta" && (abierto || x.reservaId === r.id) && ((j.clienteId && x.clienteId === j.clienteId) || (!j.clienteId && x.reservaId === r.id && x.jugadorIdx === idx))) ?? null;
}

/** Quién paga los cargos de esta cuenta («a cargo de»), si su cuenta sigue abierta. */
function pagadorDe(estado, cta) {
  const a = cta.aCargoDe ? cuenta(estado, cta.aCargoDe) : null;
  return a && a.estado === "abierta" ? a : null;
}
const dependientes = (estado, cta) => estado.cuentas.filter((x) => x.estado === "abierta" && x.aCargoDe === cta.id && x.id !== cta.id);
/** Lo que debe una cuenta que paga lo suyo: su saldo y el de las cuentas a su cargo. */
const deudaDe = (estado, cta) => Math.max(0, saldoCuenta(cta)) + dependientes(estado, cta).reduce((s, x) => s + Math.max(0, saldoCuenta(x)), 0);
const esCuentaDeMostrador = (cta) => cta.titular === "Mostrador" || String(cta.reservaId ?? "").startsWith("mostrador-") || String(cta.reservaId ?? "").startsWith("tienda-");

/** Los cargos de una cuenta pasan a cargo de otra (null: vuelve a pagar los suyos). No se mueven: siguen a su nombre. */
export function asignarCargoCargos(estado, cuentaId, aCuentaId, ahora) {
  const de = cuenta(estado, cuentaId);
  if (!de || de.estado !== "abierta") return { ok: false, motivo: "Esa cuenta no está abierta." };
  if (aCuentaId == null || aCuentaId === "" || aCuentaId === cuentaId) {
    delete de.aCargoDe;
    registrar(estado, `${de.titular} paga sus propios cargos.`, ahora);
    return { ok: true };
  }
  const a = cuenta(estado, aCuentaId);
  if (!a || a.estado !== "abierta" || esCuentaDeMostrador(a)) return { ok: false, motivo: "Elegí la cuenta abierta de quien paga." };
  if (pagadorDe(estado, a)) return { ok: false, motivo: `Los cargos de ${a.titular} ya los paga ${pagadorDe(estado, a).titular}: elegí a otro.` };
  if (dependientes(estado, de).length) return { ok: false, motivo: `${de.titular} ya paga los cargos de otro: no puede pasar a cargo de nadie.` };
  de.aCargoDe = a.id;
  registrar(estado, `Los cargos de ${de.titular} quedan a cargo de ${a.titular}.`, ahora);
  return { ok: true };
}

const turnoAbierto = (r) => ["reservada", "en_cancha"].includes(r.estado);

/** Todas las cuentas abiertas de la mesa del turno: las de los jugadores y las que se abrieron para ese turno. */
function cuentasDeLaMesa(estado, r) {
  const ids = new Set();
  const out = [];
  r.jugadores.forEach((j, i) => { const c = cuentaDeJugador(estado, r, i); if (c && !ids.has(c.id)) { ids.add(c.id); out.push(c); } });
  for (const c of estado.cuentas) if (c.estado === "abierta" && c.reservaId === r.id && !ids.has(c.id)) { ids.add(c.id); out.push(c); }
  return out;
}

/**
 * La cuenta del turno en un solo lugar: la cancha (con las partes y «a cargo de») y los cargos de cada jugador,
 * con lo que paga cada uno si se le cobra todo junto, y los totales. Sirve también con la cancha ya cerrada (la mesa).
 */
export function cuentaDelTurno(estado, reservaId) {
  const r = reserva(estado, reservaId);
  if (!r) return { ok: false, motivo: "No encuentro el turno." };
  const abierto = turnoAbierto(r);
  const partes = partesCancha(r);
  const saldoCancha = abierto ? Math.max(0, saldo(r)) : 0;
  const cuentas = r.jugadores.map((_, i) => cuentaDeJugador(estado, r, i));
  const jugadores = r.jugadores.map((j, i) => {
    const cta = cuentas[i];
    const pagador = cta ? pagadorDe(estado, cta) : null;
    const deps = cta ? dependientes(estado, cta) : [];
    const propios = cta ? Math.max(0, saldoCuenta(cta)) : 0;
    const deOtros = deps.reduce((s, x) => s + Math.max(0, saldoCuenta(x)), 0);
    const canchaAPagar = abierto ? partes[i].aPagar : 0;
    const cargosAPagar = pagador ? 0 : propios + deOtros;
    return {
      idx: i, nombre: j.nombre, clienteId: j.clienteId ?? null,
      cancha: { ...partes[i], aPagar: canchaAPagar },
      cuenta: cta,
      cargos: { total: cta ? totalCuenta(cta) : 0, saldo: propios, aCargoDe: pagador?.id ?? null, aCargoDeNombre: pagador?.titular ?? null, deOtros, aSuCargo: deps.map((x) => x.titular) },
      aPagar: canchaAPagar + cargosAPagar,
    };
  });
  // Lo que se cobra acá es exactamente lo que se muestra: cada cuenta de la mesa que no paga otro, con lo que tiene
  // a su cargo (aunque venga de otra mesa). Lo de la mesa que paga alguien de afuera se muestra aparte.
  const mesa = cuentasDeLaMesa(estado, r);
  const pagadoras = mesa.filter((c) => !pagadorDe(estado, c));
  const deOtraMesa = mesa.filter((c) => pagadorDe(estado, c) && !mesa.includes(pagadorDe(estado, c))).map((c) => ({ titular: c.titular, saldo: Math.max(0, saldoCuenta(c)), paga: pagadorDe(estado, c).titular }));
  const cargos = pagadoras.reduce((s, c) => s + deudaDe(estado, c), 0);
  return {
    ok: true, reserva: r, abierto, jugadores, mesa, deOtraMesa,
    totales: { cancha: saldoCancha, cargos, pendiente: saldoCancha + cargos, totalCargos: mesa.reduce((s, c) => s + totalCuenta(c), 0) },
    mesaAbierta: !abierto && (mesa.length > 0 || Boolean(r.mesaSigue)),
  };
}

function validarMedio(medio, { monedero = true } = {}) {
  if (!MEDIOS[medio] || (!monedero && medio === "monedero")) return { ok: false, motivo: monedero ? "Elegí cómo paga." : "Con créditos se cobra jugador por jugador: elegí efectivo, Mercado Pago, transferencia o tarjeta." };
  return { ok: true };
}

/** Cierra la cuenta si quedó en cero y no tiene nada alquilado en uso (si sigue cargando, se abre otra sola). */
function cerrarSiQuedoEnCero(estado, cta, ahora) {
  if (cta.estado === "abierta" && saldoCuenta(cta) === 0 && !cta.items.some((i) => i.alquiler && !i.devuelto)) cerrarCuenta(estado, cta.id, {}, ahora);
}

/** Cobra los cargos de una cuenta y los de las cuentas a su cargo, todo junto, con un medio. */
export function cobrarCuentaYSusCargos(estado, cuentaId, { medio, auth = null }, ahora) {
  if (auth) { const a = autorizar(estado, auth, "buffet", false); if (!a.ok) return a; }
  const v = validarMedio(medio);
  if (!v.ok) return v;
  const cta = cuenta(estado, cuentaId);
  if (!cta || cta.estado !== "abierta") return { ok: false, motivo: "Esa cuenta no está abierta." };
  const lista = [cta, ...dependientes(estado, cta)].filter((x) => saldoCuenta(x) > 0);
  const total = lista.reduce((s, x) => s + saldoCuenta(x), 0);
  if (!(total > 0)) return { ok: false, motivo: "No hay cargos para cobrar." };
  if (medio === "monedero") { const c = cobrarConCreditos(estado, cta.clienteId, total); if (!c.ok) return c; }
  for (const x of lista) {
    const monto = saldoCuenta(x);
    const paga = x.id === cta.id ? "" : ` (paga ${cta.titular})`;
    if (medio !== "monedero") movimientoCaja(estado, { tipo: "ingreso", medio, monto, concepto: `Buffet ${x.titular}${paga}` }, ahora);
    x.pagos.push({ medio, monto, ...(x.id !== cta.id && { pagadoPor: cta.id }), ...sello(ahora) });
  }
  registrar(estado, `Cobro de cargos ${pesos(total)} (${MEDIOS[medio]}) — ${cta.titular}${lista.length > 1 ? `, con los de ${lista.filter((x) => x !== cta).map((x) => x.titular).join(", ")}` : ""}.`, ahora);
  const cubiertas = lista.filter((x) => x !== cta).map((x) => x.titular);
  for (const x of lista.slice().reverse()) cerrarSiQuedoEnCero(estado, x, ahora);
  return { ok: true, monto: total, cubiertas };
}

/** Cobra a un jugador todo lo suyo: su parte de la cancha (con la de los que invita) y sus cargos (con los que paga). */
export function cobrarJugador(estado, reservaId, idx, { medio, auth = null }, ahora) {
  if (auth) { const a = autorizar(estado, auth, "cobrar", false); if (!a.ok) return a; }
  const v = validarMedio(medio);
  if (!v.ok) return v;
  const t = cuentaDelTurno(estado, reservaId);
  if (!t.ok) return t;
  const j = t.jugadores[idx];
  if (!j) return { ok: false, motivo: "Elegí el jugador." };
  if (j.cargos.aCargoDe && j.cancha.aPagar === 0) return { ok: false, motivo: `Lo de ${j.nombre} lo paga ${j.cargos.aCargoDeNombre}: cobrale a ${j.cargos.aCargoDeNombre}.` };
  const cancha = j.cancha.aPagar;
  const cargos = j.cargos.aCargoDe ? 0 : j.cargos.saldo + j.cargos.deOtros;
  if (!(cancha + cargos > 0)) return { ok: false, motivo: `${j.nombre} no tiene nada para pagar.` };
  if (medio === "monedero") {
    const c = j.clienteId ? cliente(estado, j.clienteId) : null;
    if (!c || c.monedero < cancha + cargos) return { ok: false, motivo: "No le alcanzan los créditos." };
  }
  let cubiertos = [];
  if (cancha > 0) {
    const res = cobrarParte(estado, reservaId, idx, { medio }, ahora);
    if (!res.ok) return res;
    cubiertos = res.cubiertos;
  }
  if (cargos > 0) {
    const res = cobrarCuentaYSusCargos(estado, j.cuenta.id, { medio }, ahora);
    if (!res.ok) return { ...res, cancha };
    cubiertos = [...new Set([...cubiertos, ...res.cubiertas])];
  }
  return { ok: true, cancha, cargos, total: cancha + cargos, cubiertos };
}

/** Cobra todo el turno de una (cancha y cargos de la mesa) con un solo medio. */
export function cobrarTodoElTurno(estado, reservaId, { medio, auth = null }, ahora) {
  if (auth) { const a = autorizar(estado, auth, "cobrar", false); if (!a.ok) return a; }
  const v = validarMedio(medio, { monedero: false });
  if (!v.ok) return v;
  const t = cuentaDelTurno(estado, reservaId);
  if (!t.ok) return t;
  if (!(t.totales.pendiente > 0)) return { ok: false, motivo: "El turno no debe nada." };
  const r = t.reserva;
  let cancha = 0;
  for (let vuelta = 0; vuelta < r.jugadores.length + 1 && turnoAbierto(r) && saldo(r) > 0; vuelta++) {
    const i = partesCancha(r).findIndex((x) => x.aPagar > 0);
    if (i < 0) break;
    const res = cobrarParte(estado, reservaId, i, { medio }, ahora);
    if (!res.ok) return res;
    cancha += res.monto;
  }
  // Si queda saldo de cancha (ej. se extendió después de que todos pagaron su parte), se cobra entero acá.
  if (turnoAbierto(r) && saldo(r) > 0) { const m = saldo(r); const res = registrarPago(estado, reservaId, { medio, monto: m }, ahora); if (!res.ok) return res; cancha += m; }
  let cargos = 0;
  for (const c of cuentasDeLaMesa(estado, r).filter((x) => !pagadorDe(estado, x))) {
    if (c.estado !== "abierta" || !(deudaDe(estado, c) > 0)) continue;
    const res = cobrarCuentaYSusCargos(estado, c.id, { medio }, ahora);
    if (!res.ok) return res;
    cargos += res.monto;
  }
  const queda = cuentaDelTurno(estado, reservaId).totales.pendiente;
  if (queda > 0) return { ok: false, motivo: `Se cobraron ${pesos(cancha + cargos)} pero quedan ${pesos(queda)}: revisá la cuenta del turno.`, cobrado: cancha + cargos };
  return { ok: true, cancha, cargos, total: cancha + cargos };
}

/**
 * Se termina el turno pero la mesa sigue: cobra lo que falte de la CANCHA y la cierra (luz apagada, cancha libre
 * para el turno siguiente). Los cargos quedan abiertos: siguen cargando y se cierran después.
 */
export function cerrarCanchaYSeguir(estado, reservaId, { medio, auth = null } = {}, ahora) {
  if (auth) { const a = autorizar(estado, auth, "cobrar", false); if (!a.ok) return a; }
  const r = reserva(estado, reservaId);
  if (!r) return { ok: false, motivo: "No encuentro el turno." };
  if (!turnoAbierto(r)) return { ok: false, motivo: "Esa cancha ya está cerrada." };
  let cobrado = 0;
  if (saldo(r) > 0) {
    const v = validarMedio(medio, { monedero: false });
    if (!v.ok) return v;
    for (let vuelta = 0; vuelta < r.jugadores.length + 1 && saldo(r) > 0; vuelta++) {
      const i = partesCancha(r).findIndex((x) => x.aPagar > 0);
      if (i < 0) break;
      const res = cobrarParte(estado, reservaId, i, { medio }, ahora);
      if (!res.ok) return res;
      cobrado += res.monto;
    }
    if (saldo(r) > 0) { const m = saldo(r); const res = registrarPago(estado, reservaId, { medio, monto: m }, ahora); if (!res.ok) return res; cobrado += m; }
  }
  const fin = finalizar(estado, reservaId, {}, ahora);
  if (!fin.ok) return fin;
  // La mesa sigue AUNQUE esté en cero (todos al día): es para seguir cargando lo que pidan. Queda en Buffet → Mesas
  // hasta que alguien la cierre (cerrarCargosDelTurno).
  r.mesaSigue = true;
  return { ok: true, cobradoCancha: cobrado, cuentasAbiertas: cuentasDeLaMesa(estado, r) };
}

/** Cierra los cargos de la mesa del turno: cobrados con un medio, o a la cuenta corriente de cada uno. */
export function cerrarCargosDelTurno(estado, reservaId, { medio, auth = null, aCuenta = false } = {}, ahora) {
  if (auth) { const a = autorizar(estado, auth, "cobrar", false); if (!a.ok) return a; }
  const r = reserva(estado, reservaId);
  if (!r) return { ok: false, motivo: "No encuentro el turno." };
  const mesa = cuentasDeLaMesa(estado, r);
  if (!mesa.length) {
    if (!r.mesaSigue) return { ok: false, motivo: "La mesa no tiene cargos abiertos." };
    delete r.mesaSigue;
    registrar(estado, `Mesa de ${r.titular} cerrada (sin cargos).`, ahora);
    return { ok: true, cobrado: 0, aCuentaCorriente: 0, cerradas: 0 };
  }
  // Las cuentas que paga alguien de otra mesa quedan abiertas: se cobran con la cuenta del que paga.
  const pagadoras = mesa.filter((x) => !pagadorDe(estado, x));
  const deEstaMesa = mesa.filter((x) => !pagadorDe(estado, x) || mesa.includes(pagadorDe(estado, x)));
  if (aCuenta) {
    for (const c of pagadoras) {
      const total = Math.max(0, saldoCuenta(c)) + dependientes(estado, c).reduce((s, x) => s + Math.max(0, saldoCuenta(x)), 0);
      if (total > 0) { const p = puedeACuenta(c.clienteId ? cliente(estado, c.clienteId) : null, total); if (!p.ok) return { ...p, motivo: `${c.titular}: ${p.motivo}` }; }
    }
    let aCC = 0;
    for (const c of pagadoras) {
      aCC += Math.max(0, saldoCuenta(c)) + dependientes(estado, c).reduce((s, x) => s + Math.max(0, saldoCuenta(x)), 0);
      const res = cerrarCuenta(estado, c.id, { aCuenta: true }, ahora);
      if (!res.ok) return res;
    }
    delete r.mesaSigue; // recién cuando el cierre salió: si falla, la mesa sigue marcada
    return { ok: true, cobrado: 0, aCuentaCorriente: aCC, cerradas: mesa.length };
  }
  const v = validarMedio(medio, { monedero: false });
  if (!v.ok) return v;
  let cobrado = 0;
  for (const c of pagadoras) {
    const total = Math.max(0, saldoCuenta(c)) + dependientes(estado, c).reduce((s, x) => s + Math.max(0, saldoCuenta(x)), 0);
    if (total > 0) { const res = cobrarCuentaYSusCargos(estado, c.id, { medio }, ahora); if (!res.ok) return res; cobrado += res.monto; }
  }
  for (const c of deEstaMesa) if (c.estado === "abierta") { devolverAlquileresDeCuenta(estado, c); const res = cerrarCuenta(estado, c.id, {}, ahora); if (!res.ok) return res; }
  delete r.mesaSigue;
  return { ok: true, cobrado, aCuentaCorriente: 0, cerradas: deEstaMesa.length };
}

/** Las mesas que siguen cargando con la cancha ya cerrada (para el Buffet), de la más vieja a la más nueva. */
export function mesasAbiertas(estado) {
  const out = [];
  for (const r of estado.reservas) {
    if (turnoAbierto(r)) continue;
    const mesa = cuentasDeLaMesa(estado, r);
    if (!mesa.length && !r.mesaSigue) continue;
    out.push({ reserva: r, cuentas: mesa, saldo: mesa.reduce((s, c) => s + Math.max(0, saldoCuenta(c)), 0) });
  }
  return out.sort((a, b) => (a.reserva.fecha + String(a.reserva.inicio).padStart(5, "0")).localeCompare(b.reserva.fecha + String(b.reserva.inicio).padStart(5, "0")));
}

/** Venta rápida de mostrador sin cuenta: se carga, se cobra y se cierra en el acto. */
export function ventaMostrador(estado, items, medio, ahora) {
  if (!items.length) return { ok: false, motivo: "No hay nada cargado." };
  if (!MEDIOS_DE_CAJA.includes(medio)) return { ok: false, motivo: "Elegí cómo paga (efectivo, Mercado Pago, transferencia o tarjeta)." };
  for (const { productoId, cant } of items) {
    const p = producto(estado, productoId);
    if (!p) return { ok: false, motivo: "No encuentro un producto." };
    if (p.alquiler) return { ok: false, motivo: `${p.nombre} es de alquiler: va a la cuenta de un jugador.` };
    if (p.stock != null && p.stock < cant) return { ok: false, motivo: `No alcanza el stock de ${p.nombre}.` };
  }
  const { cuenta: cta } = abrirCuenta(estado, { titular: "Mostrador", reservaId: `mostrador-${secuencia + 1}` }, ahora);
  for (const { productoId, cant } of items) cargarEnCuenta(estado, cta.id, productoId, cant, ahora);
  const total = totalCuenta(cta);
  pagarCuenta(estado, cta.id, { medio, monto: total }, ahora);
  cerrarCuenta(estado, cta.id, {}, ahora);
  return { ok: true, total };
}

export const cuentasAbiertas = (estado) => estado.cuentas.filter((c) => c.estado === "abierta");

// ───────────────────────── ciclo del turno ─────────────────────────

/**
 * Abrir la cancha (empieza el juego). La anticipación es configurable: `minutosAntesParaEntrar = null`
 * es sin límite (el club la abre cuando quiere). Nunca con la cancha ocupada ni con el horario vencido.
 */
export function checkIn(estado, id, ahora) {
  const r = reserva(estado, id);
  if (!r) return { ok: false, motivo: "No encuentro el turno." };
  if (r.estado !== "reservada") return { ok: false, motivo: `El turno está ${ESTADOS[r.estado].toLowerCase()}.` };
  if (r.sena.monto > 0 && !r.sena.pagada) return { ok: false, motivo: "Falta la seña: cobrala antes de abrir la cancha." };
  if (ahora) {
    const falta = minutosHasta(ahora, r.fecha, r.inicio);
    const limite = estado.config.politica.minutosAntesParaEntrar;
    if (limite != null && falta > limite) return { ok: false, motivo: `Todavía es temprano: la cancha se abre desde ${limite} min antes del turno.` };
    if (falta + r.duracion <= 0) return { ok: false, motivo: "El horario de ese turno ya terminó." };
  }
  const ocupada = estado.reservas.find((x) => x.id !== r.id && x.fecha === r.fecha && x.canchaId === r.canchaId && x.estado === "en_cancha");
  if (ocupada) return { ok: false, motivo: `${cancha(estado, r.canchaId).nombre} sigue ocupada por ${ocupada.titular}: cerrá esa cancha primero.` };
  r.estado = "en_cancha";
  r.checkIn = ahora ? { ...ahora } : null;
  estado.luces[r.canchaId] = true;
  registrar(estado, `Se abrió ${cancha(estado, r.canchaId).nombre} para ${r.titular}.`, ahora);
  return { ok: true };
}

/**
 * Cerrar la CANCHA (termina el juego). Cierra sólo la cuenta de la cancha: lo que queda se cobra o se
 * suma a la cuenta corriente del titular (si la tiene habilitada y le da el límite). Los consumos del
 * buffet NO se cierran acá: siguen abiertos en la cuenta de cada jugador. Lo alquilado vuelve al stock.
 */
export function finalizar(estado, id, { aCuenta = false } = {}, ahora) {
  const r = reserva(estado, id);
  if (!r) return { ok: false, motivo: "No encuentro el turno." };
  if (!["reservada", "en_cancha"].includes(r.estado)) return { ok: false, motivo: "Esa cancha ya está cerrada." };
  const debe = saldo(r);
  if (debe > 0 && !aCuenta) return { ok: false, motivo: `A la cancha le quedan ${pesos(debe)}: cobralo o sumalo a la cuenta corriente.`, saldo: debe };
  if (debe > 0) {
    const c = r.clienteId ? cliente(estado, r.clienteId) : null;
    const p = puedeACuenta(c, debe);
    if (!p.ok) return p;
    movimientoCC(estado, c, debe, `Cancha ${r.fecha.slice(8)}/${r.fecha.slice(5, 7)} ${hhmm(r.inicio)}${p.fiado ? ` (fiado aprobado por ${p.fiado.aprobo})` : ""}`, ahora);
    usarFiado(p, debe);
    r.aCuentaCorriente = debe;
  }
  devolverAlquileresDelTurno(estado, r);
  r.estado = "finalizada";
  r.cierre = ahora ? { ...ahora } : null;
  estado.luces[r.canchaId] = false;
  const abiertas = estado.cuentas.filter((x) => x.reservaId === r.id && x.estado === "abierta" && saldoCuenta(x) > 0);
  registrar(estado, `Se cerró ${cancha(estado, r.canchaId).nombre} (${r.titular})${debe > 0 ? `, ${pesos(debe)} a cuenta corriente` : ""}.`, ahora);
  return { ok: true, cuentasAbiertas: abiertas };
}

/**
 * Falta (no vino): se cobra el turno ENTERO. A quién: al titular, o repartido en el grupo (los jugadores
 * con ficha; la parte de los que no tienen ficha queda a cargo del titular). Lo pagado (la seña) se
 * descuenta. El cargo va a la cuenta corriente aunque no esté habilitada: es una deuda, no un fiado.
 */
export function marcarNoShow(estado, id, { cobrarA = "titular", auth = null } = {}, ahora) {
  const r = reserva(estado, id);
  if (!r) return { ok: false, motivo: "No encuentro el turno." };
  // Perdonar una falta lo decide un dueño (validado acá, no sólo en pantalla).
  if (cobrarA === "nadie") { const a = autorizar(estado, auth ?? {}, "configurar", false); if (!a.ok) return { ok: false, motivo: "Una falta sin cargo la decide un dueño." }; }
  if (r.estado !== "reservada") return { ok: false, motivo: "Sólo un turno reservado puede quedar como falta." };
  if (ahora && minutosHasta(ahora, r.fecha, r.inicio) > -estado.config.politica.toleranciaMin)
    return { ok: false, motivo: `Todavía está dentro de la tolerancia: la falta se marca a los ${estado.config.politica.toleranciaMin} min del inicio.` };
  devolverAlquileresDelTurno(estado, r);
  r.estado = "no_show";
  const titular = r.clienteId ? cliente(estado, r.clienteId) : null;
  if (titular) titular.strikes += 1;
  const importe = Math.max(0, saldo(r));
  const cargos = [];
  const concepto = `Falta ${r.fecha.slice(8)}/${r.fecha.slice(5, 7)} ${hhmm(r.inicio)}`;
  if (importe > 0 && cobrarA !== "nadie") {
    const enGrupo = cobrarA === "grupo";
    const partes = enGrupo ? dividir(importe, r.jugadores.length) : [importe];
    const destinos = enGrupo ? r.jugadores.map((j, i) => (i === 0 ? j.clienteId ?? r.clienteId : j.clienteId)) : [r.clienteId];
    let aCargoDelTitular = 0;
    partes.forEach((monto, i) => {
      const c = destinos[i] ? cliente(estado, destinos[i]) : null;
      if (c && c !== titular) { movimientoCC(estado, c, monto, concepto, ahora); cargos.push({ nombre: c.nombre, monto }); }
      else aCargoDelTitular += monto; // su parte, o la de quien no tiene ficha
    });
    if (aCargoDelTitular > 0) {
      if (titular) { movimientoCC(estado, titular, aCargoDelTitular, concepto, ahora); cargos.push({ nombre: titular.nombre, monto: aCargoDelTitular }); }
      else { r.deudaSinFicha = aCargoDelTitular; cargos.push({ nombre: r.titular, monto: aCargoDelTitular, sinFicha: true }); }
    }
  }
  r.faltaCobrada = cargos.reduce((s, c) => s + c.monto, 0);
  registrar(estado, `Falta de ${r.titular}: ${cargos.length ? cargos.map((c) => `${c.nombre} ${pesos(c.monto)}`).join(", ") : "sin cargo"}.`, ahora);
  return { ok: true, cargos, ofertas: ofertasEspera(estado, r.fecha, r.canchaId, r.inicio, r.duracion) };
}

/**
 * Cancelación: con más de `horasCancelacionLibre` de aviso (o si cancela el club) lo pagado vuelve como
 * crédito; con menos, la seña queda en suspenso y se libera sola si el hueco se vuelve a vender.
 */
export function cancelar(estado, id, { porClub = false, motivo = "" } = {}, ahora) {
  const r = reserva(estado, id);
  if (!r) return { ok: false, motivo: "No encuentro el turno." };
  if (r.estado !== "reservada") return { ok: false, motivo: "Sólo se cancela un turno que todavía no empezó." };
  const horas = ahora ? minutosHasta(ahora, r.fecha, r.inicio) / 60 : Infinity;
  const aTiempo = porClub || horas >= estado.config.politica.horasCancelacionLibre;
  const pagado = cobrado(r);
  const cl = r.clienteId ? cliente(estado, r.clienteId) : null;
  devolverAlquileresDelTurno(estado, r);
  r.estado = "cancelada";
  r.motivoCancelacion = motivo || (porClub ? "Cancela el club" : "Cancela el cliente");
  let devuelto = 0;
  let devolverEnMano = 0;
  if (pagado > 0 && aTiempo && cl) { cl.monedero += pagado; devuelto = pagado; }
  else if (pagado > 0 && aTiempo) { r.devolucionPendiente = pagado; devolverEnMano = pagado; }
  else if (pagado > 0 && !aTiempo) r.senaEnSuspenso = true;
  registrar(estado, `Canceló ${r.titular} (${hhmm(r.inicio)}). ${devuelto ? `${pesos(devuelto)} como crédito.` : devolverEnMano ? `Hay que devolverle ${pesos(devolverEnMano)} (no tiene ficha).` : r.senaEnSuspenso ? "Seña en suspenso hasta que se vuelva a vender el hueco." : ""}`, ahora);
  return { ok: true, aTiempo, devuelto, devolverEnMano, enSuspenso: r.senaEnSuspenso, ofertas: ofertasEspera(estado, r.fecha, r.canchaId, r.inicio, r.duracion) };
}

/** Se devolvió en mano (o por transferencia) lo que se le debía a alguien sin ficha. Sale de caja. */
export function marcarDevuelto(estado, reservaId, medio, ahora) {
  const r = reserva(estado, reservaId);
  if (!r || !(r.devolucionPendiente > 0)) return { ok: false, motivo: "No hay nada para devolver en ese turno." };
  if (!MEDIOS_DE_CAJA.includes(medio)) return { ok: false, motivo: "Elegí cómo se devolvió." };
  const monto = r.devolucionPendiente;
  movimientoCaja(estado, { tipo: "egreso", medio, monto, concepto: `Devolución a ${r.titular}`, reservaId }, ahora);
  r.devolucionPendiente = 0;
  registrar(estado, `Se devolvieron ${pesos(monto)} a ${r.titular} (${MEDIOS[medio]}).`, ahora);
  return { ok: true, monto };
}

/** Cobro de una falta a alguien sin ficha (se presentó otro día y pagó). */
export function cobrarFaltaSinFicha(estado, reservaId, medio, ahora) {
  const r = reserva(estado, reservaId);
  if (!r || !(r.deudaSinFicha > 0)) return { ok: false, motivo: "Ese turno no tiene una falta para cobrar." };
  if (!MEDIOS_DE_CAJA.includes(medio)) return { ok: false, motivo: "Elegí cómo paga." };
  const monto = r.deudaSinFicha;
  movimientoCaja(estado, { tipo: "ingreso", medio, monto, concepto: `Falta de ${r.titular}`, reservaId }, ahora);
  r.deudaSinFicha = 0;
  registrar(estado, `Se cobró la falta de ${r.titular}: ${pesos(monto)}.`, ahora);
  return { ok: true, monto };
}

export function mover(estado, id, { canchaId, inicio }, ahora) {
  const r = reserva(estado, id);
  if (!r) return { ok: false, motivo: "No encuentro el turno." };
  if (!["reservada", "en_cancha"].includes(r.estado)) return { ok: false, motivo: "Esa cancha ya está cerrada." };
  const destino = { canchaId: canchaId ?? r.canchaId, fecha: r.fecha, inicio: inicio ?? r.inicio, duracion: r.duracion };
  // Las reglas del diálogo «Mover», también acá (no sólo en la pantalla): jugando, sólo otra cancha a la misma hora;
  // reservado, nunca a una hora en la que ya habría terminado.
  if (r.estado === "en_cancha" && destino.inicio !== r.inicio) return { ok: false, motivo: "Están jugando: sólo se puede pasar a otra cancha, a la misma hora." };
  if (r.estado === "reservada" && ahora && minutosHasta(ahora, r.fecha, destino.inicio) + r.duracion <= 0) return { ok: false, motivo: "Esa hora ya pasó." };
  const v = validarHueco(estado, destino, r.id);
  if (!v.ok) return v;
  const antes = cancha(estado, r.canchaId).nombre;
  if (r.estado === "en_cancha") { estado.luces[r.canchaId] = false; estado.luces[destino.canchaId] = true; }
  r.canchaId = destino.canchaId;
  r.inicio = destino.inicio;
  registrar(estado, `${r.titular}: de ${antes} a ${cancha(estado, r.canchaId).nombre} ${hhmm(r.inicio)}.`, ahora);
  return { ok: true };
}

export function extender(estado, id, minutos, ahora) {
  const r = reserva(estado, id);
  if (!r) return { ok: false, motivo: "No encuentro el turno." };
  if (!["reservada", "en_cancha"].includes(r.estado)) return { ok: false, motivo: "Esa cancha ya está cerrada." };
  // Un turno reservado que ya terminó sin jugarse no se alarga (en cancha sí: se quedan más tiempo).
  if (r.estado === "reservada" && ahora && minutosHasta(ahora, r.fecha, r.inicio + r.duracion) <= 0) return { ok: false, motivo: "Ese turno ya terminó: no se puede alargar." };
  const v = validarHueco(estado, { canchaId: r.canchaId, fecha: r.fecha, inicio: r.inicio + r.duracion, duracion: minutos });
  if (!v.ok) return { ok: false, motivo: `No se puede extender: ${v.motivo}` };
  const extra = precioTurno(estado, { fecha: r.fecha, inicio: r.inicio + r.duracion, duracion: minutos, canchaId: r.canchaId });
  r.duracion += minutos;
  r.precio += extra;
  registrar(estado, `${r.titular} extendió ${minutos} min (+${pesos(extra)}).`, ahora);
  return { ok: true, extra };
}

/** Interrupción (corte de luz, lesión, lluvia en juego): se reconoce como crédito sólo el tiempo no jugado. */
export function interrumpir(estado, id, motivo, ahora) {
  const r = reserva(estado, id);
  if (!r) return { ok: false, motivo: "No encuentro el turno." };
  if (r.estado !== "en_cancha") return { ok: false, motivo: "Sólo se interrumpe un turno que está en cancha." };
  if (r.interrumpido) return { ok: false, motivo: "Este turno ya se interrumpió: cobrá lo jugado y cerrá la cancha." };
  const jugados = Math.max(0, Math.min(r.duracion, minutosHasta({ fecha: r.fecha, min: r.inicio }, ahora.fecha, ahora.min)));
  if (jugados === 0) return { ok: false, motivo: "Todavía no empezaron a jugar: cancelá el turno como 'cancela el club'." };
  const noJugados = r.duracion - jugados;
  const credito = redondear100((r.precio * noJugados) / r.duracion);
  const cl = r.clienteId ? cliente(estado, r.clienteId) : null;
  const pagado = cobrado(r);
  r.precio -= credito;
  const excedente = Math.max(0, pagado - totalReserva(r));
  if (excedente > 0 && cl) cl.monedero += excedente;
  else if (excedente > 0) r.devolucionPendiente = (r.devolucionPendiente ?? 0) + excedente;
  r.interrumpido = true;
  r.notas = `${r.notas ? r.notas + " · " : ""}Interrumpido: ${motivo} (${noJugados} min sin jugar)`;
  r.duracion = jugados;
  registrar(estado, `Interrupción en ${cancha(estado, r.canchaId).nombre} (${motivo}): ${pesos(credito)} reconocidos a ${r.titular}.`, ahora);
  return { ok: true, credito, noJugados };
}

// ───────────────────────── mantenimiento y lluvia ─────────────────────────

/** Poner o sacar una cancha de mantenimiento (desde "Mantenimiento y lluvia", no desde la agenda). */
export function configurarMantenimiento(estado, canchaId, { activo, motivo = "" }, ahora) {
  const c = cancha(estado, canchaId);
  if (!c) return { ok: false, motivo: "Esa cancha no existe." };
  if (activo && !String(motivo).trim()) return { ok: false, motivo: "Poné el motivo del mantenimiento." };
  c.estado = activo ? "mantenimiento" : "ok";
  c.motivoMantenimiento = activo ? String(motivo).trim() : "";
  registrar(estado, `${c.nombre}: ${activo ? `en mantenimiento (${c.motivoMantenimiento})` : "habilitada"}.`, ahora);
  return { ok: true };
}

/** Techada o descubierta: es dato del club (lo cambia el dueño). Con todas techadas no hay plan lluvia que mostrar. */
export function configurarTecho(estado, canchaId, cubierta, ahora) {
  const c = cancha(estado, canchaId);
  if (!c) return { ok: false, motivo: "Esa cancha no existe." };
  if (Boolean(c.cubierta) === Boolean(cubierta)) return { ok: true };
  c.cubierta = Boolean(cubierta);
  registrar(estado, `${c.nombre}: ${c.cubierta ? "techada" : "descubierta"}.`, ahora);
  return { ok: true };
}

/** ¿El club tiene alguna cancha descubierta? Si no, el plan lluvia y el filtro «sólo techadas» sobran. */
export const hayDescubiertas = (estado) => estado.canchas.some((c) => !c.cubierta);

/**
 * Plan lluvia: cada turno en cancha descubierta dentro de la ventana pasa a una techada libre en el mismo
 * horario; si no hay, se suspende (antes de empezar: lo pagado vuelve como crédito o queda para devolver;
 * jugando: la regla del corte, sólo el tiempo no jugado).
 */
export function planLluvia(estado, fecha, desde, hasta, ahora) {
  const descubiertas = estado.canchas.filter((c) => !c.cubierta).map((c) => c.id);
  const cubiertas = estado.canchas.filter((c) => c.cubierta && c.estado !== "mantenimiento").map((c) => c.id);
  const afectadas = estado.reservas
    .filter((r) => r.fecha === fecha && descubiertas.includes(r.canchaId) && ["reservada", "en_cancha"].includes(r.estado) && solapa(r.inicio, r.inicio + r.duracion, desde, hasta))
    // Un turno reservado que ya terminó sin jugarse no es de la lluvia (es una falta o algo para cerrar a mano).
    .filter((r) => !(r.estado === "reservada" && ahora && minutosHasta(ahora, r.fecha, r.inicio + r.duracion) <= 0))
    .sort((a, b) => a.inicio - b.inicio);
  const resultado = [];
  for (const r of afectadas) {
    const destino = cubiertas.find((id) => validarHueco(estado, { canchaId: id, fecha, inicio: r.inicio, duracion: r.duracion }, r.id).ok);
    // Sólo cuenta como movido si `mover` lo movió de verdad; si no, sigue por el corte o la suspensión.
    if (destino && mover(estado, r.id, { canchaId: destino }, ahora).ok) {
      resultado.push({ reservaId: r.id, titular: r.titular, accion: "movido", cancha: cancha(estado, destino).nombre });
      continue;
    }
    if (r.estado === "en_cancha" && !r.interrumpido && minutosHasta({ fecha: r.fecha, min: r.inicio }, ahora.fecha, ahora.min) > 0) {
      const corte = interrumpir(estado, r.id, "lluvia", ahora);
      if (corte.ok) { resultado.push({ reservaId: r.id, titular: r.titular, accion: "cortado", credito: corte.credito, noJugados: corte.noJugados }); continue; }
    }
    const pagado = cobrado(r);
    const cl = r.clienteId ? cliente(estado, r.clienteId) : null;
    if (pagado > 0 && cl) cl.monedero += pagado;
    else if (pagado > 0) r.devolucionPendiente = pagado;
    devolverAlquileresDelTurno(estado, r);
    if (r.estado === "en_cancha") estado.luces[r.canchaId] = false;
    r.estado = "suspendida";
    r.motivoCancelacion = "Lluvia";
    resultado.push({ reservaId: r.id, titular: r.titular, accion: "suspendido", credito: cl ? pagado : 0, devolverEnMano: cl ? 0 : pagado });
  }
  estado.clima.lluvia = { fecha, desde, hasta };
  registrar(estado, `Plan lluvia ${hhmm(desde)}–${hhmm(hasta)}: ${resultado.length} turno(s) resueltos.`, ahora);
  return { ok: true, resultado };
}

export function bloquear(estado, { canchaId, fecha, desde, hasta, motivo }, ahora) {
  const choques = estado.reservas.filter((r) => r.fecha === fecha && (canchaId === "*" || r.canchaId === canchaId) && ["reservada", "en_cancha"].includes(r.estado) && solapa(r.inicio, r.inicio + r.duracion, desde, hasta));
  if (choques.length) return { ok: false, motivo: `Hay ${choques.length} turno(s) en ese rango: movelos primero.`, choques };
  if (!(hasta > desde)) return { ok: false, motivo: "El 'hasta' tiene que ser después del 'desde'." };
  const b = { id: nuevoId("b"), canchaId, fecha, desde, hasta, motivo };
  estado.bloqueos.push(b);
  registrar(estado, `Bloqueo ${canchaId === "*" ? "de todo el club" : cancha(estado, canchaId).nombre} ${hhmm(desde)}–${hhmm(hasta)}: ${motivo}.`, ahora);
  return { ok: true, bloqueo: b };
}

export function quitarBloqueo(estado, bloqueoId, ahora) {
  const b = estado.bloqueos.find((x) => x.id === bloqueoId);
  if (!b) return { ok: false, motivo: "Ese bloqueo ya no está." };
  estado.bloqueos = estado.bloqueos.filter((x) => x.id !== bloqueoId);
  registrar(estado, `Se quitó un bloqueo (${b.motivo}).`, ahora);
  return { ok: true };
}

// ───────────────────────── turnos fijos ─────────────────────────

export function crearFijo(estado, { clienteId, canchaId, dia, inicio, duracion = estado.config.duracionTurno, titular }) {
  const f = { id: nuevoId("f"), clienteId, canchaId, dia, inicio, duracion, titular: titular ?? cliente(estado, clienteId)?.nombre, excepciones: [] };
  estado.fijos.push(f);
  return f;
}

/** Baja a la grilla los turnos fijos del día (idempotente). Un fijo que choca no pisa: avisa. */
export function materializarFijos(estado, fecha) {
  const dia = diaSemana(fecha);
  const conflictos = [];
  for (const f of estado.fijos) {
    if (f.dia !== dia || f.excepciones.includes(fecha)) continue;
    if (estado.reservas.some((r) => r.fijoId === f.id && r.fecha === fecha)) continue;
    const res = crearReserva(estado, { canchaId: f.canchaId, fecha, inicio: f.inicio, duracion: f.duracion, tipo: "fijo", clienteId: f.clienteId, titular: f.titular, fijoId: f.id, origen: "fijo" });
    if (!res.ok) conflictos.push({ fijo: f, motivo: res.motivo });
  }
  return conflictos;
}

/** "Esta semana no venimos": libera un día sin dar de baja el fijo. */
export function liberarFijo(estado, fijoId, fecha, ahora) {
  const f = estado.fijos.find((x) => x.id === fijoId);
  if (!f) return { ok: false, motivo: "No encuentro el turno fijo." };
  if (!f.excepciones.includes(fecha)) f.excepciones.push(fecha);
  const r = estado.reservas.find((x) => x.fijoId === fijoId && x.fecha === fecha && x.estado === "reservada");
  if (r) return cancelar(estado, r.id, { motivo: "Libera el turno fijo de esta semana" }, ahora);
  return { ok: true };
}

// ───────────────────────── lista de espera ─────────────────────────

export function anotarEspera(estado, { clienteId, titular, tel, fecha, desde, hasta, duracion = estado.config.duracionTurno, soloCubierta = false }, ahora) {
  const e = { id: nuevoId("e"), clienteId, titular, tel, fecha, desde, hasta, duracion, soloCubierta, creado: ahora ? { ...ahora } : null };
  estado.espera.push(e);
  return e;
}

export function ofertasEspera(estado, fecha, canchaId, inicio, duracion) {
  const c = cancha(estado, canchaId);
  return estado.espera
    .filter((e) => e.fecha === fecha && inicio >= e.desde && inicio <= e.hasta && e.duracion <= duracion && (!e.soloCubierta || c?.cubierta))
    .map((e) => ({ ...e, canchaId, inicio, mensaje: mensajeWhatsApp("espera", { nombre: e.titular, cancha: c.nombre, hora: hhmm(inicio), fecha }) }));
}

export function asignarDesdeEspera(estado, esperaId, { canchaId, inicio }, ahora) {
  const e = estado.espera.find((x) => x.id === esperaId);
  if (!e) return { ok: false, motivo: "Ya no está en la lista de espera." };
  const res = crearReserva(estado, { canchaId, fecha: e.fecha, inicio, duracion: e.duracion, clienteId: e.clienteId, titular: e.titular, origen: "lista de espera" }, ahora);
  if (res.ok) estado.espera = estado.espera.filter((x) => x.id !== esperaId);
  return res;
}

// ───────────────────────── caja (de 12 a 12) ─────────────────────────

/** Día de caja: la caja corre de `corteCaja` (12:00) a `corteCaja` del día siguiente. */
export function diaDeCaja(estado, fecha, min) {
  const corte = estado.config.corteCaja ?? 0;
  if (min >= 1440) return diaDeCaja(estado, sumarDias(fecha, 1), min - 1440);
  return min < corte ? sumarDias(fecha, -1) : fecha;
}

export function egresoCaja(estado, { monto, concepto, usuarioId, pin }, ahora) {
  const a = autorizar(estado, { usuarioId, pin }, "egreso", true);
  if (!a.ok) return a;
  const importe = Math.round(Number(monto));
  if (!(importe > 0)) return { ok: false, motivo: "El monto tiene que ser mayor a cero." };
  if (!String(concepto ?? "").trim()) return { ok: false, motivo: "Poné el concepto del egreso." };
  movimientoCaja(estado, { tipo: "egreso", medio: "efectivo", monto: importe, concepto: String(concepto).trim(), usuario: a.usuario.nombre }, ahora);
  registrar(estado, `Egreso de caja ${pesos(importe)} (${String(concepto).trim()}) — ${a.usuario.nombre}.`, ahora);
  return { ok: true };
}

/** ¿Ya se cerró la caja de ese día? (Una caja se cierra una sola vez.) */
export const cajaCerrada = (estado, dia) => estado.caja.cierres.some((c) => c.dia === dia);
/**
 * La caja donde entra lo que se cobra ahora: la del día (de 12 a 12) o, si ya se cerró, la siguiente. Así una venta
 * después del cierre no cambia una caja ya contada.
 */
export function cajaAbierta(estado, ahora) {
  let dia = diaDeCaja(estado, ahora.fecha, ahora.min);
  while (cajaCerrada(estado, dia)) dia = sumarDias(dia, 1);
  return dia;
}
export function resumenCaja(estado, dia) {
  const movs = estado.caja.movimientos.filter((m) => !dia || (m.caja ?? (m.fecha && diaDeCaja(estado, m.fecha, m.min ?? 0))) === dia);
  const porMedio = Object.fromEntries(MEDIOS_DE_CAJA.map((k) => [k, 0]));
  let ingresos = 0, egresos = 0;
  for (const m of movs) {
    const signo = m.tipo === "ingreso" ? 1 : -1;
    porMedio[m.medio] = (porMedio[m.medio] ?? 0) + signo * m.monto;
    if (m.tipo === "ingreso") ingresos += m.monto; else egresos += m.monto;
  }
  const efectivoEsperado = estado.caja.fondo + porMedio.efectivo;
  return { dia, porMedio, ingresos, egresos, neto: ingresos - egresos, efectivoEsperado, movimientos: movs.length, lista: movs };
}

/** Cierre de la caja diaria (de 12 a 12): pide PIN; lo contado contra lo esperado, con diferencia explícita. */
/**
 * Cajas de días anteriores que tuvieron movimientos y nadie cerró (ej. lo cobrado a la mañana, antes del corte de
 * las 12, es de la caja del día anterior): se avisan y se pueden cerrar después.
 */
export function cajasSinCerrar(estado, ahora) {
  const hoy = diaDeCaja(estado, ahora.fecha, ahora.min);
  return cajasConMovimientosSinCerrar(estado).filter((d) => d < hoy);
}
/** Toda caja con movimientos que nadie cerró (también la de hoy y la siguiente, si hoy ya se cerró). */
export function cajasConMovimientosSinCerrar(estado) {
  const dias = new Set(estado.caja.movimientos.map((m) => m.caja ?? (m.fecha && diaDeCaja(estado, m.fecha, m.min ?? 0))).filter(Boolean));
  return [...dias].filter((d) => !cajaCerrada(estado, d)).sort();
}

export function cerrarCaja(estado, { contado, usuarioId, pin, dia: diaPedido = null }, ahora) {
  const a = autorizar(estado, { usuarioId, pin }, "cerrarCaja", true);
  if (!a.ok) return a;
  let dia = cajaAbierta(estado, ahora);
  if (diaPedido) {
    if (!cajasConMovimientosSinCerrar(estado).includes(diaPedido)) return { ok: false, motivo: "Esa caja ya está cerrada o no tiene movimientos." };
    dia = diaPedido;
  } else if (dia !== diaDeCaja(estado, ahora.fecha, ahora.min)) return { ok: false, motivo: "Esta caja ya está cerrada. Lo que se cobre desde ahora entra en la caja siguiente." };
  const r = resumenCaja(estado, dia);
  const n = Math.round(Number(contado));
  if (contado === "" || contado == null || !(n >= 0)) return { ok: false, motivo: "Contá el efectivo del cajón y cargalo." };
  const cierre = { dia, responsable: a.usuario.nombre, ...sello(ahora), esperado: r.efectivoEsperado, contado: n, diferencia: n - r.efectivoEsperado, ingresos: r.ingresos, egresos: r.egresos };
  estado.caja.cierres.push(cierre);
  registrar(estado, `Cierre de caja del ${dia.slice(8)}/${dia.slice(5, 7)} por ${a.usuario.nombre}: diferencia ${pesos(cierre.diferencia)}.`, ahora);
  return { ok: true, cierre };
}

// ───────────────────────── archivo de días cerrados (la jornada real no se llena) ─────────────────────────
//
// Un mes de club lleno pesa ~2,9 MB y el navegador guarda ~5 MB: lo ya cerrado se pasa a un ANEXO (un archivo que el
// dueño se queda) y en el estado queda un resumen chico por día. Lo vivo nunca se archiva.

/** Lo que queda siempre a mano sin archivar: los últimos 21 días (el Tablero mira 7; las audiencias, 30 por el resumen). */
export const DIAS_SIN_ARCHIVAR = 21;
/** Nunca se archiva la última semana: el Tablero, el mapa de calor y la venta de 7 días la leen entera. */
const DIAS_MINIMOS_SIN_ARCHIVAR = 7;

/** Hasta qué día de caja se propone archivar: lo que tenga más de `dias` días (por defecto 21). */
export function diaParaArchivar(estado, ahora, dias = DIAS_SIN_ARCHIVAR) {
  const n = Math.max(DIAS_MINIMOS_SIN_ARCHIVAR, Math.round(Number(dias)) || DIAS_SIN_ARCHIVAR);
  return sumarDias(diaDeCaja(estado, ahora.fecha, ahora.min), -n);
}

const fila0 = (dia) => ({ dia, turnos: 0, faltas: 0, cancelados: 0, vendidoCanchas: 0, cobradoCanchas: 0, cobradoCuentas: 0, monedero: 0, ingresosCaja: 0, egresosCaja: 0, movimientos: 0, cuentas: 0, pedidos: 0 });

/**
 * Suma al resumen por día lo de estas listas (las del estado o las de un anexo). Los turnos van por su fecha; lo
 * cobrado, por el día de caja del cobro (`diaDeCaja`); los movimientos, por su caja.
 */
function sumarAlResumen(dias, { reservas = [], cuentas = [], movimientos = [], pedidos = [] }, corte) {
  const conCorte = { config: { corteCaja: corte } };
  const dia = (t) => (t?.fecha ? diaDeCaja(conCorte, t.fecha, t.min ?? 0) : "sin-fecha");
  const fila = (d) => { if (!dias.has(d)) dias.set(d, fila0(d)); return dias.get(d); };
  for (const r of reservas) {
    const f = fila(r.fecha ?? "sin-fecha");
    if (r.estado === "finalizada") { f.turnos++; f.vendidoCanchas += r.precio ?? 0; }
    if (r.estado === "no_show") f.faltas++;
    if (r.estado === "cancelada" || r.estado === "suspendida") f.cancelados++;
    for (const p of r.pagos ?? []) { const x = fila(dia(p)); if (p.medio === "monedero") x.monedero += p.monto; else x.cobradoCanchas += p.monto; }
  }
  for (const c of cuentas) {
    fila(dia(c.cerrada)).cuentas++;
    for (const p of c.pagos ?? []) { const x = fila(dia(p)); if (p.medio === "monedero") x.monedero += p.monto; else x.cobradoCuentas += p.monto; }
  }
  for (const m of movimientos) {
    const x = fila(m.caja ?? dia(m));
    x.movimientos++;
    if (m.tipo === "ingreso") x.ingresosCaja += m.monto; else x.egresosCaja += m.monto;
  }
  for (const pd of pedidos) fila(dia(pd.cobrado ?? pd)).pedidos++;
  return dias;
}

/**
 * La plata por día: lo cobrado de canchas y de cargos (sin créditos: es lo que entra a la caja), lo pagado con
 * créditos y lo que entró y salió de la caja. Recibe el estado o un anexo (`anexo-jornada`): sirve para el resumen
 * y para comprobar al centavo que archivar no pierde ni duplica plata (estado = podado + anexo, día por día).
 */
export function plataPorDia(datos) {
  const corte = datos?.config?.corteCaja ?? datos?.corteCaja ?? 0;
  const movimientos = datos?.caja?.movimientos ?? datos?.movimientos ?? [];
  const dias = sumarAlResumen(new Map(), { reservas: datos?.reservas ?? [], cuentas: datos?.cuentas ?? [], movimientos }, corte);
  return Object.fromEntries([...dias.values()].sort((a, b) => a.dia.localeCompare(b.dia)).map((f) => [f.dia, { canchas: f.cobradoCanchas, cuentas: f.cobradoCuentas, monedero: f.monedero, ingresos: f.ingresosCaja, egresos: f.egresosCaja }]));
}

/** ¿Ese código de pedido (T-XXXX) o de seña (BP-XXXX) ya salió en un archivo? */
function codigoArchivado(estado, tipo, codigo) {
  const lista = estado.archivo?.codigos?.[tipo];
  return Array.isArray(lista) && lista.includes(codigo);
}

/**
 * Huella del anexo (dos pasadas de FNV-1a, 16 caracteres hex): prueba que el archivo que el dueño eligió es el MISMO
 * que se va a archivar. No entran `generado` ni `por` (cambian con el minuto y con quién lo hace).
 */
export function huellaAnexo(anexo) {
  if (!esObjeto(anexo)) return "";
  const resto = { ...anexo };
  delete resto.generado;
  delete resto.por;
  const texto = JSON.stringify(resto);
  return ["bp-anexo-a", "bp-anexo-b"].map((sal) => fnv1a(`${sal}|${texto}`).toString(16).padStart(8, "0")).join("");
}

/** Huella del respaldo completo que va en el archivo para archivar (un peso tocado o un turno de menos la cambian). */
export function huellaRespaldo(respaldo) {
  if (!esObjeto(respaldo)) return "";
  const texto = JSON.stringify(respaldo);
  return ["bp-resp-a", "bp-resp-b"].map((sal) => fnv1a(`${sal}|${texto}`).toString(16).padStart(8, "0")).join("");
}

/**
 * El archivo único que se descarga para archivar (una sola descarga: el navegador suele bloquear la segunda del mismo
 * clic): el respaldo completo de antes de archivar (`respaldo`, el sobre v1 de siempre) y el anexo de los días que
 * salen (`anexo`), con su huella y sus conteos para verificarlo después.
 */
export function paqueteParaArchivar(respaldo, res) {
  return {
    v: 1, tipo: "respaldo-y-archivo", club: res.anexo.club ?? "", hasta: res.anexo.hasta, conteos: res.conteos,
    huella: huellaAnexo(res.anexo), huellaRespaldo: huellaRespaldo(respaldo), respaldo, anexo: res.anexo,
  };
}

/**
 * Paso 2 de archivar: ¿el archivo que eligió el dueño es el que se descargó para ESTE archivado? Compara el día, los
 * conteos y la huella del anexo con lo que se va a archivar ahora (`res`, recalculado). `huellaDescargada` es la del
 * paso 1: sirve para decir si el archivo es el bueno pero algo cambió en el medio (hay que descargar de nuevo).
 */
export function verificarPaqueteArchivo(paquete, res, huellaDescargada = null) {
  if (!esObjeto(paquete) || paquete.tipo !== "respaldo-y-archivo" || !esObjeto(paquete.anexo) || !esObjeto(paquete.respaldo))
    return { ok: false, motivo: "Ese no es el archivo para archivar: elegí el «breakpoint-respaldo-y-archivo-….json» que se descargó.", causa: "otro" };
  const huella = huellaAnexo(paquete.anexo);
  if (huella !== paquete.huella || paquete.respaldo.v !== VERSION_ESTADO || !esObjeto(paquete.respaldo.estado))
    return { ok: false, motivo: "Ese archivo está incompleto o dañado: descargalo de nuevo.", causa: "danado" };
  // El respaldo de adentro también tiene que servir para «Restaurar»: intacto (su huella), se abre y, archivado hasta el
  // mismo día, da exactamente el anexo del archivo (si alguien lo tocó o es de otra jornada, no coincide).
  if (huellaRespaldo(paquete.respaldo) !== paquete.huellaRespaldo)
    return { ok: false, motivo: "Ese archivo está incompleto o dañado (su respaldo no está entero): descargalo de nuevo.", causa: "danado" };
  const h = hidratarEstado(paquete.respaldo);
  const desdeRespaldo = h.ok ? archivarDiasCerrados(h.estado, paquete.anexo.hasta) : null;
  if (!desdeRespaldo?.ok || desdeRespaldo.vacio || huellaAnexo(desdeRespaldo.anexo) !== huella)
    return { ok: false, motivo: "Ese archivo está incompleto o dañado (su respaldo no coincide con los días archivados): descargalo de nuevo.", causa: "danado" };
  const igual = res?.ok && !res.vacio && paquete.anexo.hasta === res.anexo.hasta && huella === huellaAnexo(res.anexo) &&
    JSON.stringify(paquete.conteos) === JSON.stringify(res.conteos);
  if (igual) return { ok: true, huella };
  if (huellaDescargada && huella === huellaDescargada)
    return { ok: false, motivo: "Cambió algo desde que descargaste (se cobró o se cerró algo de esos días): descargá el archivo de nuevo y elegí el nuevo.", causa: "cambio" };
  return { ok: false, motivo: "Ese archivo es de otro archivado: elegí el último que descargaste.", causa: "otro" };
}

/**
 * «Restaurar desde un archivo»: acepta el respaldo de siempre (sobre v1) o el archivo para archivar (restaura su
 * `respaldo`, la jornada de antes de archivar). El anexo solo NO es un respaldo: se explica.
 */
export function respaldoDesdeArchivo(datos) {
  if (esObjeto(datos) && datos.tipo === "anexo-jornada")
    return { ok: false, motivo: "Ese es el archivo de los días archivados (la historia de esos días), no un respaldo de la jornada. Para restaurar elegí un «breakpoint-jornada-….json» o un «breakpoint-respaldo-y-archivo-….json»." };
  if (esObjeto(datos) && datos.tipo === "respaldo-y-archivo") {
    if (!esObjeto(datos.respaldo)) return { ok: false, motivo: "A ese archivo le falta el respaldo: elegí otro." };
    return { ok: true, foto: datos.respaldo, antesDeArchivar: true };
  }
  return { ok: true, foto: datos, antesDeArchivar: false };
}

/**
 * Archiva los días cerrados hasta `hastaDia` (inclusive). PURA: no toca `estado`; devuelve una copia podada y el
 * anexo con todo lo que salió. Sólo sale lo TERMINADO de días cuya caja está CERRADA:
 *   · turnos finalizados, cancelados o con falta (y suspendidos sin plata), sin devolución ni falta por cobrar, sin
 *     seña en suspenso, con todos sus cobros en cajas cerradas y sin cuentas de cargos que se queden;
 *   · cuentas de cargos cerradas, con todos sus pagos en cajas cerradas;
 *   · los movimientos de las cajas cerradas (los `cierres` se quedan: son chicos y la conciliación los usa);
 *   · pedidos de la tienda entregados, cancelados o a cuenta (con su cuenta archivada); pedidos de crédito ya
 *     resueltos; difusiones viejas (la última se queda); el registro, la lista de espera y los bloqueos de esos días;
 *   · de cada cliente, los movimientos viejos de la cuenta corriente (queda una línea «saldo anterior» con el mismo
 *     saldo) y los fiados ya usados.
 * NO toca lo maestro (clientes y sus saldos, productos, usuarios, canchas, proveedores con sus remitos y pagos,
 * fijos, config, contenido) ni nada vivo. Un cobro hecho después de cerrar su caja entró en la caja siguiente
 * (`cajaAbierta`): esa también tiene que estar cerrada.
 * En el estado queda `archivo` = { hasta, dias: [resumen por día], clientes: { id: { jugados, ultima } }, anexos }:
 * con eso la seña web («turnos de confianza») y las audiencias de las novedades siguen viendo lo archivado.
 * Idempotente: archivar otra vez lo mismo no cambia nada (`vacio: true`). Con `ahora`, nunca archiva la última semana.
 */
export function archivarDiasCerrados(estado, hastaDia, { ahora = null, por = null } = {}) {
  const hasta = String(hastaDia ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hasta)) return { ok: false, motivo: "Elegí hasta qué día archivar." };
  if (ahora && hasta > sumarDias(diaDeCaja(estado, ahora.fecha, ahora.min), -DIAS_MINIMOS_SIN_ARCHIVAR))
    return { ok: false, motivo: "La última semana no se archiva: el Tablero y las ventas de 7 días la usan." };
  const e = structuredClone(estado);
  const corte = e.config.corteCaja ?? 0;
  const dCaja = (t) => (t?.fecha ? diaDeCaja(e, t.fecha, t.min ?? 0) : null);
  const cierres = new Map(e.caja.cierres.map((c) => [c.dia, c]));
  const cerradaHasta = (d) => !!d && d <= hasta && cierres.has(d);
  // La caja donde entró un cobro: la de su día o, si esa ya estaba cerrada cuando se cobró, la siguiente. En el
  // mismo minuto del cierre no se sabe cuál: se piden las dos cerradas.
  // Se sigue la cadena de cierres como `cajaAbierta`: si esa noche se cerró también la caja siguiente antes del cobro,
  // el cobro entró en la otra (cierro D a las 22, vendo a las 23 → D+1, cierro D+1 a las 23:30, vendo a las 23:45 → D+2).
  const cajasDe = (t) => {
    let d = dCaja(t);
    if (!d) return [null];
    const tp = minutoAbsoluto(t);
    const out = [];
    for (let i = 0; i < 400; i++) {
      const c = cierres.get(d);
      if (!c) return [...out, d];
      const tc = minutoAbsoluto(c);
      if (tp < tc) return [...out, d];
      if (tp === tc) out.push(d);
      d = sumarDias(d, 1);
    }
    return [...out, d];
  };
  const pagoListo = (p) => (p.medio === "monedero" ? !!dCaja(p) && dCaja(p) <= hasta : cajasDe(p).every(cerradaHasta));
  const movListo = (m) => cerradaHasta(m.caja ?? dCaja(m));
  const hasta0 = (t) => !!t?.fecha && t.fecha <= hasta;

  // Cuentas de cargos: cerradas, con la plata en cajas cerradas y sin un pedido de crédito esperando por ellas.
  const pedidaPorCredito = new Set(e.novedades.filter((n) => n.estado === "pendiente" && n.cuentaId).map((n) => n.cuentaId));
  const cuentaLista = (c) => c.estado === "cerrada" && !!dCaja(c.cerrada) && dCaja(c.cerrada) <= hasta && (c.pagos ?? []).every(pagoListo) && !pedidaPorCredito.has(c.id);
  const ctaSale = new Set(e.cuentas.filter(cuentaLista).map((c) => c.id));
  // Una cuenta que se queda ata a su turno (la mesa del turno la busca por `reservaId`).
  const atadas = new Set(e.cuentas.filter((c) => !ctaSale.has(c.id) && c.reservaId).map((c) => c.reservaId));
  const movsPorTurno = new Map();
  for (const m of e.caja.movimientos) if (m.reservaId) movsPorTurno.set(m.reservaId, [...(movsPorTurno.get(m.reservaId) ?? []), m]);
  // Nota del Gate (M9, a propósito sin cambiar): un turno suspendido CON plata nunca se archiva. Es conservador (la
  // devolución o el crédito se resuelven a mano) y ocupa poco.
  const terminado = (r) => ["finalizada", "cancelada", "no_show"].includes(r.estado) || (r.estado === "suspendida" && cobrado(r) === 0);
  const turnoListo = (r) => terminado(r) && !!r.fecha && r.fecha <= hasta && !(r.devolucionPendiente > 0) && !(r.deudaSinFicha > 0) && !r.senaEnSuspenso &&
    (r.pagos ?? []).every(pagoListo) && (movsPorTurno.get(r.id) ?? []).every(movListo) && !atadas.has(r.id) && (!r.cierre?.fecha || dCaja(r.cierre) <= hasta);
  const pedidoListo = (pd) => (pd.estado === "cancelado" && hasta0(pd)) || (pd.estado === "entregado" && !!pd.cobrado && cajasDe(pd.cobrado).every(cerradaHasta)) || (pd.estado === "a_cuenta" && ctaSale.has(pd.cuentaId));
  const ultimaDifusion = e.difusiones[0]?.id;

  const partir = (lista, sale) => { const fuera = [], queda = []; for (const x of lista ?? []) (sale(x) ? fuera : queda).push(x); return [fuera, queda]; };
  const [reservas, reservasQuedan] = partir(e.reservas, turnoListo);
  const [cuentas, cuentasQuedan] = partir(e.cuentas, (c) => ctaSale.has(c.id));
  const [movimientos, movsQuedan] = partir(e.caja.movimientos, movListo);
  const [pedidos, pedidosQuedan] = partir(e.pedidos, pedidoListo);
  const [novedades, novedadesQuedan] = partir(e.novedades, (n) => n.estado !== "pendiente" && hasta0(n));
  const [difusiones, difusionesQuedan] = partir(e.difusiones, (d) => d.id !== ultimaDifusion && hasta0(d));
  const [solicitudesAcceso, solicitudesQuedan] = partir(e.solicitudesAcceso, (s) => s.estado !== "pendiente" && hasta0(s));
  const [espera, esperaQueda] = partir(e.espera, (x) => !!x.fecha && x.fecha <= hasta);
  const [bloqueos, bloqueosQuedan] = partir(e.bloqueos, (b) => !!b.fecha && b.fecha <= hasta);
  const [log, logQueda] = partir(e.log, hasta0);

  // Cuenta corriente: los movimientos viejos (los primeros, hasta `hasta`) se resumen en un «saldo anterior» con la
  // misma suma y el mismo saldo; los fiados ya usados salen. La deuda del cliente no se toca.
  const movCC = [], fiados = [];
  for (const c of e.clientes) {
    const movs = c.movCC ?? [];
    let k = 0;
    while (k < movs.length && hasta0(movs[k])) k++;
    const reales = movs.slice(0, k).filter((m) => !m.saldoAnterior);
    if (reales.length) {
      const importe = movs.slice(0, k).reduce((s, m) => s + m.importe, 0);
      const saldoAl = movs[k - 1].saldo;
      const linea = { fecha: hasta, min: null, concepto: `Saldo anterior (hasta el ${hasta.slice(8)}/${hasta.slice(5, 7)}, en el archivo)`, importe, saldo: saldoAl, saldoAnterior: true };
      c.movCC = [...(importe !== 0 || saldoAl !== 0 ? [linea] : []), ...movs.slice(k)];
      movCC.push({ clienteId: c.id, nombre: c.nombre, movimientos: reales });
    }
    const [usados, vivos] = partir(c.fiados, (f) => f.usado && hasta0(f));
    if (usados.length) { c.fiados = vivos; fiados.push({ clienteId: c.id, nombre: c.nombre, fiados: usados }); }
  }

  const listas = { reservas, cuentas, movimientos, pedidos, novedades, difusiones, solicitudesAcceso, espera, bloqueos, log };
  const conteos = Object.fromEntries(Object.entries(listas).map(([k, v]) => [k, v.length]));
  conteos.movCC = movCC.reduce((s, x) => s + x.movimientos.length, 0);
  conteos.fiados = fiados.reduce((s, x) => s + x.fiados.length, 0);
  const vacio = Object.values(conteos).every((n) => n === 0);

  const resumen = [...sumarAlResumen(new Map(), { reservas, cuentas, movimientos, pedidos }, corte).values()].filter((f) => f.dia !== "sin-fecha").sort((a, b) => a.dia.localeCompare(b.dia));
  const desde = [resumen[0]?.dia, ...[...Object.values(listas).flat(), ...movCC.flatMap((x) => x.movimientos)].map((x) => x.fecha).filter(Boolean)].filter(Boolean).sort()[0] ?? null;
  const idsClientes = new Set([...reservas.flatMap((r) => [r.clienteId, ...(r.jugadores ?? []).map((j) => j.clienteId)]), ...cuentas.map((c) => c.clienteId), ...novedades.map((n) => n.clienteId), ...movCC.map((x) => x.clienteId), ...fiados.map((x) => x.clienteId)].filter(Boolean));
  const anexo = {
    v: 1, tipo: "anexo-jornada", club: e.config.nombre ?? "", desde, hasta, generado: ahora ? sello(ahora) : null, por: por ?? null, corteCaja: corte,
    resumen,
    cierres: e.caja.cierres.filter((c) => resumen.some((f) => f.dia === c.dia)).map((c) => ({ ...c })),
    clientes: e.clientes.filter((c) => idsClientes.has(c.id)).map((c) => ({ id: c.id, nombre: c.nombre })),
    canchas: e.canchas.map((c) => ({ id: c.id, nombre: c.nombre })),
    ...listas, movCC, fiados,
  };
  if (vacio) return { ok: true, vacio: true, estado: e, anexo, conteos };

  e.reservas = reservasQuedan;
  e.cuentas = cuentasQuedan;
  e.caja.movimientos = movsQuedan;
  e.pedidos = pedidosQuedan;
  e.novedades = novedadesQuedan;
  e.difusiones = difusionesQuedan;
  e.solicitudesAcceso = solicitudesQuedan;
  e.espera = esperaQueda;
  e.bloqueos = bloqueosQuedan;
  e.log = logQueda;

  // El resumen que queda en el estado: por día (se suma si un día ya tenía algo archivado) y por cliente.
  const previo = esObjeto(e.archivo) ? e.archivo : {};
  const dias = new Map((esLista(previo.dias) ? previo.dias : []).map((f) => [f.dia, { ...fila0(f.dia), ...f }]));
  for (const f of resumen) {
    const x = dias.get(f.dia) ?? fila0(f.dia);
    for (const k of Object.keys(f)) if (k !== "dia") x[k] = (x[k] ?? 0) + f[k];
    dias.set(f.dia, x);
  }
  const clientes = { ...(esObjeto(previo.clientes) ? previo.clientes : {}) };
  for (const r of reservas) {
    if (r.estado !== "finalizada") continue;
    if (r.clienteId) clientes[r.clienteId] = { jugados: (clientes[r.clienteId]?.jugados ?? 0) + 1, ultima: clientes[r.clienteId]?.ultima ?? "" };
    for (const id of new Set([r.clienteId, ...(r.jugadores ?? []).map((j) => j.clienteId)].filter(Boolean))) {
      const c = clientes[id] ?? { jugados: 0, ultima: "" };
      if (r.fecha > (c.ultima ?? "")) c.ultima = r.fecha;
      clientes[id] = c;
    }
  }
  // Los códigos de los pedidos (T-XXXX) y de las señas (BP-XXXX) que se fueron: un código nuevo no los repite y un
  // WhatsApp de un pedido ya entregado no se vuelve a cargar.
  const codigosPrevios = esObjeto(previo.codigos) ? previo.codigos : {};
  const juntar = (viejos, nuevos) => [...new Set([...(esLista(viejos) ? viejos : []), ...nuevos.filter(Boolean)])];
  e.archivo = {
    hasta: previo.hasta && previo.hasta > hasta ? previo.hasta : hasta,
    dias: [...dias.values()].sort((a, b) => a.dia.localeCompare(b.dia)),
    clientes,
    anexos: [...(esLista(previo.anexos) ? previo.anexos : []), { desde, hasta, ...sello(ahora), por: por ?? null, conteos }],
    codigos: { pedidos: juntar(codigosPrevios.pedidos, pedidos.map((x) => x.codigo)), refs: juntar(codigosPrevios.refs, reservas.map((r) => r.ref)) },
  };
  if (ahora) registrar(e, `${por ?? "Un dueño"} archivó lo cerrado hasta el ${hasta.slice(8)}/${hasta.slice(5, 7)}: ${conteos.reservas} turnos, ${conteos.cuentas} cuentas de cargos y ${conteos.movimientos} movimientos de caja (quedaron en el archivo descargado).`, ahora);
  return { ok: true, vacio: false, estado: e, anexo, conteos };
}

// ───────────────────────── productos, stock y lector ─────────────────────────

export function buscarProductos(estado, texto, { soloVendibles = false } = {}) {
  const q = String(texto ?? "").trim().toLowerCase();
  return estado.productos.filter((p) => p.activo !== false && (!soloVendibles || p.stock == null || p.stock > 0) &&
    (!q || p.nombre.toLowerCase().includes(q) || p.categoria.toLowerCase().includes(q) || String(p.codigo ?? "").toLowerCase().includes(q) || String(p.codigoExterno ?? "").includes(q)));
}

/** Lo que devuelve el lector (código de barras o etiqueta RF): el producto, o qué pasó. */
export function productoPorCodigo(estado, codigo) {
  const c = String(codigo ?? "").trim();
  if (!c) return { ok: false, motivo: "No llegó ningún código." };
  const p = estado.productos.find((x) => x.activo !== false && (mismoCodigo(c, x.codigo) || mismoCodigo(c, x.codigoExterno)));
  return p ? { ok: true, producto: p } : { ok: false, motivo: `El código ${c} no está cargado en ningún producto.` };
}

// Los códigos se comparan sin distinguir mayúsculas (el interno se tipea a mano: «bp-001» es «BP-001»). Un código
// (interno o de fabricación) no puede repetirse en otro producto, ni cruzado entre los dos campos.
const mismoCodigo = (a, b) => String(a ?? "").trim() !== "" && String(a ?? "").trim().toUpperCase() === String(b ?? "").trim().toUpperCase();
function codigoUsado(estado, codigo, salvoId = null) {
  return estado.productos.some((x) => x.id !== salvoId && (mismoCodigo(codigo, x.codigo) || mismoCodigo(codigo, x.codigoExterno)));
}
export function altaProducto(estado, { nombre, categoria, precio, costo = 0, stock = 0, minimo = 0, codigo = "", codigoExterno = "", plato = false }, auth, ahora) {
  const a = autorizar(estado, auth, "stock", false);
  if (!a.ok) return a;
  const limpio = String(nombre ?? "").trim();
  if (!limpio) return { ok: false, motivo: "Falta el nombre del producto." };
  if (!(Number(precio) > 0)) return { ok: false, motivo: "Poné el precio de venta." };
  if (codigoUsado(estado, codigo) || codigoUsado(estado, codigoExterno)) return { ok: false, motivo: "Ese código ya está en otro producto." };
  if (mismoCodigo(codigo, codigoExterno)) return { ok: false, motivo: "El código interno y el de fabricación no pueden ser el mismo." };
  const p = { id: nuevoId("p"), nombre: limpio, categoria: String(categoria || (plato ? "Cocina" : "Varios")), precio: Math.round(Number(precio)), costo: Math.round(Number(costo) || 0), stock: plato ? null : Math.round(Number(stock) || 0), minimo: plato ? 0 : Math.round(Number(minimo) || 0), codigo: String(codigo || "").trim(), codigoExterno: String(codigoExterno || "").trim(), plato: !!plato, activo: true };
  estado.productos.push(p);
  registrar(estado, `Alta de producto: ${p.nombre}.`, ahora);
  return { ok: true, producto: p };
}

export function editarProducto(estado, productoId, cambios, auth, ahora) {
  const a = autorizar(estado, auth, "stock", false);
  if (!a.ok) return a;
  const p = producto(estado, productoId);
  if (!p) return { ok: false, motivo: "No encuentro el producto." };
  if (cambios.precio != null && !(Number(cambios.precio) > 0)) return { ok: false, motivo: "El precio tiene que ser mayor a cero." };
  if (cambios.costo != null && !(Number(cambios.costo) >= 0)) return { ok: false, motivo: "El costo no puede ser negativo." };
  const codigos = {};
  for (const k of ["codigo", "codigoExterno"]) {
    if (cambios[k] == null) continue;
    const c = String(cambios[k]).trim();
    if (codigoUsado(estado, c, p.id)) return { ok: false, motivo: "Ese código ya está en otro producto." };
    if (c && mismoCodigo(c, k === "codigo" ? cambios.codigoExterno ?? p.codigoExterno : cambios.codigo ?? p.codigo)) return { ok: false, motivo: "El código interno y el de fabricación no pueden ser el mismo." };
    codigos[k] = c;
  }
  for (const k of ["precio", "costo", "minimo"]) if (cambios[k] != null) p[k] = Math.round(Number(cambios[k]));
  if (cambios.nombre != null && String(cambios.nombre).trim()) p.nombre = String(cambios.nombre).trim();
  Object.assign(p, codigos);
  registrar(estado, `Se editó el producto ${p.nombre}.`, ahora);
  return { ok: true };
}

/**
 * Ajuste de inventario (conteo): el dueño carga cuántas hay. `null` = sin controlar stock (se vende sin tope y no
 * avisa reposición), que es como arranca la jornada real hasta el primer conteo.
 */
export function ajustarStock(estado, productoId, cantidad, auth, ahora) {
  const a = autorizar(estado, auth, "stock", false);
  if (!a.ok) return a;
  const p = producto(estado, productoId);
  if (!p) return { ok: false, motivo: "No encuentro el producto." };
  if (p.plato) return { ok: false, motivo: "Los platos no llevan stock." };
  const sinControl = cantidad === null || cantidad === "";
  const n = Math.round(Number(cantidad));
  if (!sinControl && !(n >= 0)) return { ok: false, motivo: "Poné cuántas hay (0 o más)." };
  const antes = p.stock;
  p.stock = sinControl ? null : n;
  registrar(estado, `${a.usuario.nombre} ajustó el stock de ${p.nombre}: ${antes ?? "sin controlar"} → ${p.stock ?? "sin controlar"}.`, ahora);
  return { ok: true };
}

/** Dar de baja (o volver a activar) un producto: no se borra, deja de venderse. */
export function bajaProducto(estado, productoId, auth, ahora, activo = false) {
  const a = autorizar(estado, auth, "stock", false);
  if (!a.ok) return a;
  const p = producto(estado, productoId);
  if (!p) return { ok: false, motivo: "No encuentro el producto." };
  p.activo = activo;
  registrar(estado, `${a.usuario.nombre} ${activo ? "volvió a activar" : "dio de baja"} ${p.nombre}.`, ahora);
  return { ok: true };
}

/** El cambio que queda en el cajón al abrir (fondo de caja). Lo carga un dueño. */
export function ajustarFondo(estado, monto, auth, ahora) {
  const a = autorizar(estado, auth, "configurar", false);
  if (!a.ok) return a;
  const n = Math.round(Number(monto));
  if (monto === "" || monto == null || !(n >= 0)) return { ok: false, motivo: "Poné cuánto cambio hay en el cajón (0 o más)." };
  estado.caja.fondo = n;
  registrar(estado, `${a.usuario.nombre} dejó el fondo de caja en ${pesos(n)}.`, ahora);
  return { ok: true };
}

// ───────────────────────── proveedores (remitos y pagos) ─────────────────────────

export function altaProveedor(estado, { nombre, cuit = "", tel = "", rubro = "" }, auth, ahora) {
  const a = autorizar(estado, auth, "verProveedores", false);
  if (!a.ok) return a;
  const limpio = String(nombre ?? "").trim();
  if (!limpio) return { ok: false, motivo: "Falta el nombre del proveedor." };
  if (estado.proveedores.some((p) => p.activo !== false && p.nombre.toLowerCase() === limpio.toLowerCase())) return { ok: false, motivo: "Ya hay un proveedor con ese nombre." };
  const p = { id: nuevoId("pv"), nombre: limpio, cuit: String(cuit).trim(), tel: String(tel).trim(), rubro: String(rubro).trim(), activo: true };
  estado.proveedores.push(p);
  registrar(estado, `Alta de proveedor: ${limpio}.`, ahora);
  return { ok: true, proveedor: p };
}

export function editarProveedor(estado, proveedorId, cambios, auth, ahora) {
  const a = autorizar(estado, auth, "verProveedores", false);
  if (!a.ok) return a;
  const p = proveedor(estado, proveedorId);
  if (!p) return { ok: false, motivo: "No encuentro el proveedor." };
  for (const k of ["nombre", "cuit", "tel", "rubro"]) if (cambios[k] != null) p[k] = String(cambios[k]).trim();
  if (!p.nombre) return { ok: false, motivo: "El nombre no puede quedar vacío." };
  registrar(estado, `Se editó el proveedor ${p.nombre}.`, ahora);
  return { ok: true };
}

/**
 * Remito: entra mercadería. Suma stock, actualiza el costo y genera la deuda con el proveedor. Lo puede
 * cargar recepción (es lo único de proveedores que hace recepción, junto con el egreso en efectivo).
 */
export function registrarRemito(estado, { proveedorId, numero, items }, auth, ahora) {
  const a = autorizar(estado, auth, "remito", false);
  if (!a.ok) return a;
  const pv = proveedor(estado, proveedorId);
  if (!pv) return { ok: false, motivo: "Elegí el proveedor." };
  const num = String(numero ?? "").trim();
  if (!num) return { ok: false, motivo: "Poné el número de remito." };
  if (estado.remitos.some((r) => r.proveedorId === proveedorId && r.numero === num)) return { ok: false, motivo: `El remito ${num} de ${pv.nombre} ya está cargado.` };
  const lineas = (items ?? []).filter((i) => Number(i.cant) > 0);
  if (!lineas.length) return { ok: false, motivo: "El remito no tiene productos." };
  for (const i of lineas) {
    const p = producto(estado, i.productoId);
    if (!p) return { ok: false, motivo: "Hay un producto que no existe." };
    if (p.stock == null) return { ok: false, motivo: `${p.nombre} no lleva stock.` };
  }
  let total = 0;
  const detalle = lineas.map((i) => {
    const p = producto(estado, i.productoId);
    const cant = Math.round(Number(i.cant));
    const costo = Math.round(Number(i.costo ?? p.costo));
    p.stock += cant;
    p.costo = costo;
    total += cant * costo;
    return { productoId: p.id, nombre: p.nombre, cant, costo };
  });
  const rem = { id: nuevoId("rm"), proveedorId, numero: num, items: detalle, total, cargo: a.usuario.nombre, ...sello(ahora) };
  estado.remitos.push(rem);
  registrar(estado, `${a.usuario.nombre} cargó el remito ${num} de ${pv.nombre}: ${pesos(total)}.`, ahora);
  return { ok: true, remito: rem };
}

/** Cuenta corriente con el proveedor: remitos (le debemos) menos pagos. Sólo la ven los dueños. */
export function ccProveedor(estado, proveedorId, auth) {
  const a = autorizar(estado, auth, "verProveedores", false);
  if (!a.ok) return a;
  const pv = proveedor(estado, proveedorId);
  if (!pv) return { ok: false, motivo: "No encuentro el proveedor." };
  const movs = [
    ...estado.remitos.filter((r) => r.proveedorId === proveedorId).map((r) => ({ fecha: r.fecha, min: r.min, concepto: `Remito ${r.numero}`, debe: r.total, haber: 0 })),
    ...estado.pagosProveedor.filter((p) => p.proveedorId === proveedorId).map((p) => ({ fecha: p.fecha, min: p.min, concepto: `Pago (${MEDIOS[p.medio]})${p.pago ? ` — ${p.pago}` : ""}`, debe: 0, haber: p.monto })),
  ].sort((x, y) => (x.fecha === y.fecha ? (x.min ?? 0) - (y.min ?? 0) : x.fecha < y.fecha ? -1 : 1));
  let s = 0;
  for (const m of movs) { s += m.debe - m.haber; m.saldo = s; }
  return { ok: true, proveedor: pv, movimientos: movs, saldo: s };
}

export const deudaConProveedor = (estado, proveedorId) =>
  estado.remitos.filter((r) => r.proveedorId === proveedorId).reduce((s, r) => s + r.total, 0) -
  estado.pagosProveedor.filter((p) => p.proveedorId === proveedorId).reduce((s, p) => s + p.monto, 0);

/** Pago a proveedor: sólo dueños, con PIN; por transferencia o en efectivo (el efectivo sale de la caja). */
export function pagarProveedor(estado, { proveedorId, medio, monto }, auth, ahora) {
  const a = autorizar(estado, auth, "pagarProveedor", true);
  if (!a.ok) return a;
  const pv = proveedor(estado, proveedorId);
  if (!pv) return { ok: false, motivo: "Elegí el proveedor." };
  if (!["efectivo", "transferencia"].includes(medio)) return { ok: false, motivo: "A proveedores se les paga en efectivo o por transferencia." };
  const importe = Math.round(Number(monto));
  if (!(importe > 0)) return { ok: false, motivo: "El monto tiene que ser mayor a cero." };
  const debe = deudaConProveedor(estado, proveedorId);
  if (importe > debe) return { ok: false, motivo: `A ${pv.nombre} le debemos ${pesos(debe)}: no se puede pagar de más.` };
  estado.pagosProveedor.push({ id: nuevoId("pp"), proveedorId, medio, monto: importe, pago: a.usuario.nombre, ...sello(ahora) });
  movimientoCaja(estado, { tipo: "egreso", medio, monto: importe, concepto: `Pago a ${pv.nombre}`, usuario: a.usuario.nombre }, ahora);
  registrar(estado, `${a.usuario.nombre} pagó ${pesos(importe)} a ${pv.nombre} (${MEDIOS[medio]}).`, ahora);
  return { ok: true, saldo: deudaConProveedor(estado, proveedorId) };
}

// ───────────────────────── métricas de cocina (platos) ─────────────────────────

/** Venta de platos: unidades, facturado, margen y promedio por día, para el dueño. */
export function metricasPlatos(estado, { desde, hasta }) {
  const porPlato = new Map();
  const dias = new Set();
  for (const cta of estado.cuentas) {
    for (const i of cta.items) {
      if (!i.plato || !i.fecha) continue;
      const d = diaDeCaja(estado, i.fecha, i.min ?? 0);
      if ((desde && d < desde) || (hasta && d > hasta)) continue;
      dias.add(d);
      const p = producto(estado, i.productoId);
      const x = porPlato.get(i.productoId) ?? { productoId: i.productoId, plato: i.nombre, unidades: 0, facturado: 0, costo: 0 };
      x.unidades += i.cant;
      x.facturado += i.cant * i.precioUnit;
      x.costo += i.cant * (p?.costo ?? 0);
      porPlato.set(i.productoId, x);
    }
  }
  const n = Math.max(1, dias.size);
  const filas = [...porPlato.values()].map((x) => ({ ...x, margen: x.facturado - x.costo, porDia: x.unidades / n })).sort((a, b) => b.facturado - a.facturado);
  const total = filas.reduce((s, x) => s + x.facturado, 0);
  return { filas: filas.map((x) => ({ ...x, participacion: total ? x.facturado / total : 0 })), total, dias: dias.size };
}

/** Precio sugerido desde el costo y el % sobre costo, redondeado a $50 como se cobra en el mostrador. */
export function precioDesdeMarkup(costo, markupPct) {
  const c = Number(costo), m = Number(markupPct);
  if (!(c > 0) || !Number.isFinite(m) || m <= -100) return null;
  return Math.max(50, Math.round((c * (1 + m / 100)) / 50) * 50);
}

/**
 * Pricing y revenue por producto: margen y markup de lista, y lo vendido en el período (unidades, facturado,
 * costo y ganancia bruta). Todo lo cargado a cuentas (incluida la venta de mostrador) cuenta como venta.
 */
export function rentabilidad(estado, { desde, hasta } = {}) {
  const ventas = new Map();
  for (const cta of estado.cuentas) {
    for (const i of cta.items) {
      if (!i.productoId || !i.fecha) continue;
      const d = diaDeCaja(estado, i.fecha, i.min ?? 0);
      if ((desde && d < desde) || (hasta && d > hasta)) continue;
      const v = ventas.get(i.productoId) ?? { unidades: 0, facturado: 0 };
      v.unidades += i.cant;
      v.facturado += i.cant * i.precioUnit;
      ventas.set(i.productoId, v);
    }
  }
  const filas = estado.productos.filter((p) => p.activo !== false).map((p) => {
    const v = ventas.get(p.id) ?? { unidades: 0, facturado: 0 };
    const costoVendido = v.unidades * (p.costo ?? 0);
    return {
      productoId: p.id, nombre: p.nombre, categoria: p.categoria, codigo: p.codigo ?? "", codigoExterno: p.codigoExterno ?? "",
      precio: p.precio, costo: p.costo ?? 0,
      margen: p.precio - (p.costo ?? 0),
      margenPct: p.precio > 0 ? (p.precio - (p.costo ?? 0)) / p.precio : 0,
      markupPct: p.costo > 0 ? (p.precio - p.costo) / p.costo : null,
      unidades: v.unidades, facturado: v.facturado, costoVendido, ganancia: v.facturado - costoVendido,
    };
  });
  const facturado = filas.reduce((s, f) => s + f.facturado, 0);
  const ganancia = filas.reduce((s, f) => s + f.ganancia, 0);
  return { filas, facturado, ganancia, margenPct: facturado ? ganancia / facturado : 0 };
}

// ───────────────────────── plataforma de contenido ─────────────────────────

// ───────────────────────── novedades del club por difusión (WhatsApp) ─────────────────────────

export const TIPOS_NOVEDAD = Object.freeze({ novedad: "Novedad del club", promo: "Promo", torneo: "Torneo", turnos: "Turnos libres" });
export const AUDIENCIAS = Object.freeze({
  todos: "Todos los clientes con celular",
  activos: "Los que jugaron en los últimos 30 días",
  recuperar: "Los que no vienen hace más de 30 días",
  cuentaCorriente: "Los que tienen cuenta corriente",
});

/** Último día que jugó cada cliente (como titular o como jugador con ficha). */
function ultimaVez(estado) {
  const out = new Map();
  for (const r of estado.reservas) {
    if (!["finalizada", "en_cancha"].includes(r.estado)) continue;
    const ids = new Set([r.clienteId, ...r.jugadores.map((j) => j.clienteId)].filter(Boolean));
    for (const id of ids) if (!out.has(id) || out.get(id) < r.fecha) out.set(id, r.fecha);
  }
  // Lo archivado (archivarDiasCerrados) guarda el último día que jugó cada uno.
  for (const [id, x] of Object.entries(estado.archivo?.clientes ?? {})) if (x?.ultima && (!out.has(id) || out.get(id) < x.ultima)) out.set(id, x.ultima);
  return out;
}

/** A quiénes les llega: clientes activos, con celular, que no pidieron la baja de las novedades. */
export function destinatarios(estado, audiencia, ahora) {
  const ultima = ultimaVez(estado);
  const hace30 = sumarDias(ahora.fecha, -30);
  return estado.clientes
    .filter((c) => c.activo !== false && c.aceptaNovedades !== false && String(c.tel ?? "").replace(/\D/g, "").length >= 8)
    .filter((c) => {
      if (audiencia === "activos") return (ultima.get(c.id) ?? "") >= hace30;
      if (audiencia === "recuperar") return ultima.has(c.id) && ultima.get(c.id) < hace30;
      if (audiencia === "cuentaCorriente") return c.cc?.habilitada;
      return true;
    })
    .map((c) => ({ clienteId: c.id, nombre: c.nombre, tel: String(c.tel).replace(/\D/g, "") }));
}

/** El mensaje como le llega a cada uno (con su nombre), con la baja al final como corresponde. */
export function mensajeDifusion(d, nombre = "") {
  const hola = nombre ? `¡Hola ${String(nombre).split(" ")[0]}! ` : "¡Hola! ";
  const cuerpo = [`*${d.titulo}*`, d.texto].filter(Boolean).join("\n");
  return `${hola}${cuerpo}\n\n— Break Point Pádel\n(Si no querés recibir más novedades, respondé BAJA.)`;
}

/** Arma una novedad para mandar por difusión. No manda nada: el envío es desde el WhatsApp del club. */
export function crearDifusion(estado, { tipo = "novedad", titulo, texto = "", audiencia = "todos" }, auth, ahora) {
  const a = autorizar(estado, auth, "contenido", false);
  if (!a.ok) return a;
  estado.difusiones ??= [];
  const t = String(titulo ?? "").trim().slice(0, 80);
  if (!t) return { ok: false, motivo: "Poné el título de la novedad." };
  if (!TIPOS_NOVEDAD[tipo]) return { ok: false, motivo: "Elegí el tipo." };
  if (!AUDIENCIAS[audiencia]) return { ok: false, motivo: "Elegí a quiénes les llega." };
  const lista = destinatarios(estado, audiencia, ahora);
  const d = { id: nuevoId("df"), tipo, titulo: t, texto: String(texto ?? "").trim().slice(0, 900), audiencia, destinatarios: lista.map((x) => x.clienteId), enviados: [], autor: a.usuario.nombre, ...sello(ahora) };
  estado.difusiones.unshift(d);
  registrar(estado, `${a.usuario.nombre} armó la novedad «${t}» para ${lista.length} cliente(s).`, ahora);
  return { ok: true, difusion: d, destinatarios: lista };
}

/** Se mandó a uno (desde el link de WhatsApp): queda anotado para no mandarle dos veces. */
export function marcarEnviado(estado, difusionId, clienteId) {
  const d = (estado.difusiones ?? []).find((x) => x.id === difusionId);
  if (!d) return { ok: false, motivo: "No encuentro la novedad." };
  if (!d.enviados.includes(clienteId)) d.enviados.push(clienteId);
  return { ok: true, faltan: d.destinatarios.filter((id) => !d.enviados.includes(id)).length };
}

/** El cliente respondió BAJA (o se lo saca a mano): no le llegan más novedades. */
export function bajaNovedades(estado, clienteId, ahora, volver = false) {
  const c = cliente(estado, clienteId);
  if (!c) return { ok: false, motivo: "No encuentro al cliente." };
  c.aceptaNovedades = volver;
  registrar(estado, volver ? `${c.nombre} vuelve a recibir novedades.` : `${c.nombre} pidió no recibir más novedades.`, ahora);
  return { ok: true };
}

/** Los contactos para armar la lista de difusión en WhatsApp Business (CSV: nombre, celular). */
export function contactosCSV(lista) {
  const campo = (x) => `"${String(x ?? "").replace(/"/g, '""')}"`;
  return ["Nombre,Celular", ...lista.map((x) => `${campo(x.nombre)},${campo("+" + x.tel)}`)].join("\r\n");
}

// ───────────────────────── tienda (encargos por la web, se retiran y pagan en el club) ─────────────────────────

/** Lo que se ve en la tienda: productos marcados para la tienda, activos y con stock. Sin costos ni códigos. */
export function catalogoTienda(estado) {
  return estado.productos
    .filter((p) => p.tienda && p.activo !== false && !p.alquiler && !p.plato && (p.stock == null || p.stock > 0))
    .map((p) => ({ id: p.id, nombre: p.nombre, categoria: p.categoria, precio: p.precio, pocas: p.stock != null && p.stock <= Math.max(2, p.minimo ?? 0) }));
}

export function nuevoCodigoPedido(estado, azar = Math.random) {
  let s;
  do s = "T-" + Array.from({ length: 4 }, () => LETRAS_REF[Math.floor(azar() * LETRAS_REF.length)]).join("");
  while ((estado.pedidos ?? []).some((x) => x.codigo === s) || codigoArchivado(estado, "pedidos", s));
  return s;
}

const listaPedido = (items) => items.map((i) => `${i.cant} × ${i.nombre} ${pesos(i.cant * i.precioUnit)}`).join(" · ");

/**
 * El cliente encarga desde la web. No descuenta stock (se descuenta al entregar, que es cuando se cobra) y no
 * mueve caja: el pedido queda pendiente para que el club lo prepare. Devuelve el mensaje para WhatsApp.
 */
export function crearPedidoTienda(estado, { items, nombre, tel = "", origen = "web" }, ahora) {
  estado.pedidos ??= [];
  const quien = String(nombre ?? "").trim().slice(0, 60);
  if (!quien) return { ok: false, motivo: "Poné tu nombre para el pedido." };
  const lineas = [];
  for (const { productoId, cant } of items ?? []) {
    const p = producto(estado, productoId);
    const n = Math.round(Number(cant));
    if (!p || !p.tienda || p.activo === false || p.alquiler || p.plato) return { ok: false, motivo: "Hay un producto que no está en la tienda." };
    if (!(n > 0)) continue;
    if (p.stock != null && p.stock < n) return { ok: false, motivo: `De ${p.nombre} quedan ${p.stock}.` };
    lineas.push({ productoId: p.id, nombre: p.nombre, cant: n, precioUnit: p.precio });
  }
  if (!lineas.length) return { ok: false, motivo: "El pedido está vacío." };
  const total = lineas.reduce((s, i) => s + i.cant * i.precioUnit, 0);
  const pedido = { id: nuevoId("pd"), codigo: nuevoCodigoPedido(estado), items: lineas, total, nombre: quien, tel: String(tel ?? "").trim().slice(0, 30), origen, estado: "pendiente", ...sello(ahora) };
  estado.pedidos.push(pedido);
  registrar(estado, `Pedido de la tienda ${pedido.codigo} de ${quien}: ${pesos(total)}.`, ahora);
  return { ok: true, pedido, mensaje: mensajeWhatsApp("pedidoTienda", { lista: listaPedido(lineas), total: pesos(total), nombre: quien, tel: pedido.tel, codigo: pedido.codigo }) };
}

/**
 * El club pega el mensaje de WhatsApp que mandó el cliente desde la tienda (con el celular del cliente no hay
 * conexión con la compu del club): se leen los productos, el nombre y el código, y queda como pedido pendiente.
 */
export function pedidoDesdeWhatsApp(estado, texto, ahora) {
  const t = String(texto ?? "");
  const items = [];
  for (const m of t.matchAll(/(\d+)\s*[×x]\s*([^$·\n]+?)\s*\$/g)) {
    const nombre = m[2].trim().toLowerCase();
    const p = estado.productos.find((x) => x.nombre.toLowerCase() === nombre);
    if (!p) return { ok: false, motivo: `No encuentro «${m[2].trim()}» en los productos de la tienda.` };
    items.push({ productoId: p.id, cant: Number(m[1]) });
  }
  if (!items.length) return { ok: false, motivo: "No encontré productos en el mensaje: pegalo entero, como llegó." };
  const quien = t.match(/Soy ([^(.\n]+?)\s*(?:\(([^)]*)\))?\.\s/);
  const codigo = t.match(/Pedido (T-[A-Z0-9]{4})/)?.[1] ?? null;
  if (codigo && (estado.pedidos ?? []).some((x) => x.codigo === codigo)) return { ok: false, motivo: `El pedido ${codigo} ya está cargado.` };
  if (codigo && codigoArchivado(estado, "pedidos", codigo)) return { ok: false, motivo: `El pedido ${codigo} ya se había cargado: está en los días archivados.` };
  const res = crearPedidoTienda(estado, { items, nombre: quien?.[1]?.trim() || "Cliente de WhatsApp", tel: quien?.[2] ?? "", origen: "whatsapp" }, ahora);
  if (res.ok && codigo) res.pedido.codigo = codigo;
  return res;
}

export const pedidosPendientes = (estado) => (estado.pedidos ?? []).filter((x) => x.estado === "pendiente");
const pedido = (estado, id) => (estado.pedidos ?? []).find((x) => x.id === id);

function validarStockPedido(estado, pd) {
  for (const i of pd.items) {
    const p = producto(estado, i.productoId);
    if (!p || p.activo === false) return { ok: false, motivo: `${i.nombre} ya no está a la venta.` };
    if (p.stock != null && p.stock < i.cant) return { ok: false, motivo: `No alcanza el stock de ${p.nombre} (quedan ${p.stock}).` };
  }
  return { ok: true };
}

/** Se entrega y se cobra en el mostrador: descuenta stock y entra a la caja, al precio de hoy. */
export function entregarPedido(estado, pedidoId, { medio, auth = null }, ahora) {
  if (auth) { const a = autorizar(estado, auth, "buffet", false); if (!a.ok) return a; }
  const pd = pedido(estado, pedidoId);
  if (!pd || pd.estado !== "pendiente") return { ok: false, motivo: "Ese pedido ya se resolvió." };
  if (!MEDIOS_DE_CAJA.includes(medio)) return { ok: false, motivo: "Elegí cómo paga (efectivo, Mercado Pago, transferencia o tarjeta)." };
  const v = validarStockPedido(estado, pd);
  if (!v.ok) return v;
  const { cuenta: cta } = abrirCuenta(estado, { titular: `Tienda ${pd.codigo} · ${pd.nombre}`, reservaId: `tienda-${pd.id}` }, ahora);
  for (const i of pd.items) cargarEnCuenta(estado, cta.id, i.productoId, i.cant, ahora);
  const total = totalCuenta(cta);
  pagarCuenta(estado, cta.id, { medio, monto: total }, ahora);
  cerrarCuenta(estado, cta.id, {}, ahora);
  pd.estado = "entregado";
  pd.cobrado = { medio, monto: total, ...sello(ahora) };
  registrar(estado, `Se entregó el pedido ${pd.codigo} de ${pd.nombre} (${pesos(total)}, ${MEDIOS[medio]}).`, ahora);
  return { ok: true, total };
}

/** Se lo lleva y queda en la cuenta de cargos de un cliente (se cobra con lo demás). */
export function cargarPedidoACuenta(estado, pedidoId, clienteId, ahora) {
  const pd = pedido(estado, pedidoId);
  if (!pd || pd.estado !== "pendiente") return { ok: false, motivo: "Ese pedido ya se resolvió." };
  const c = cliente(estado, clienteId);
  if (!c) return { ok: false, motivo: "Elegí el cliente." };
  const v = validarStockPedido(estado, pd);
  if (!v.ok) return v;
  const { cuenta: cta } = abrirCuenta(estado, { clienteId: c.id }, ahora);
  for (const i of pd.items) cargarEnCuenta(estado, cta.id, i.productoId, i.cant, ahora);
  pd.estado = "a_cuenta";
  pd.cuentaId = cta.id;
  registrar(estado, `El pedido ${pd.codigo} quedó en la cuenta de ${c.nombre}.`, ahora);
  return { ok: true, cuenta: cta };
}

export function cancelarPedido(estado, pedidoId, ahora) {
  const pd = pedido(estado, pedidoId);
  if (!pd || pd.estado !== "pendiente") return { ok: false, motivo: "Ese pedido ya se resolvió." };
  pd.estado = "cancelado";
  registrar(estado, `Se canceló el pedido ${pd.codigo} de ${pd.nombre}.`, ahora);
  return { ok: true };
}

export const CANALES = Object.freeze({ post: "Instagram · post", reel: "Instagram · reel", historia: "Instagram · historia", whatsapp: "WhatsApp · difusión" });
export const ESTADOS_CONTENIDO = Object.freeze({ idea: "Idea", programado: "Programado", publicado: "Publicado" });

export function agregarContenido(estado, { fecha, hora = "19:00", canal = "post", titulo, texto = "", estado: est = "idea" }, auth) {
  const a = autorizar(estado, auth, "contenido", false);
  if (!a.ok) return a;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha ?? ""))) return { ok: false, motivo: "Elegí la fecha." };
  if (!String(titulo ?? "").trim()) return { ok: false, motivo: "Poné de qué se trata la publicación." };
  if (!CANALES[canal]) return { ok: false, motivo: "Elegí el canal." };
  if (!ESTADOS_CONTENIDO[est]) return { ok: false, motivo: "Estado inválido." };
  const c = { id: nuevoId("ct"), fecha, hora, canal, titulo: String(titulo).trim(), texto: String(texto), estado: est, autor: a.usuario.nombre };
  estado.contenido.push(c);
  return { ok: true, contenido: c };
}

export function editarContenido(estado, contenidoId, cambios, auth) {
  const a = autorizar(estado, auth, "contenido", false);
  if (!a.ok) return a;
  const c = estado.contenido.find((x) => x.id === contenidoId);
  if (!c) return { ok: false, motivo: "Esa publicación ya no está." };
  if (cambios.canal != null && !CANALES[cambios.canal]) return { ok: false, motivo: "Elegí el canal." };
  if (cambios.estado != null && !ESTADOS_CONTENIDO[cambios.estado]) return { ok: false, motivo: "Estado inválido." };
  if (cambios.titulo != null && !String(cambios.titulo).trim()) return { ok: false, motivo: "El título no puede quedar vacío." };
  for (const k of ["fecha", "hora", "canal", "titulo", "texto", "estado"]) if (cambios[k] != null) c[k] = k === "titulo" ? String(cambios[k]).trim() : cambios[k];
  return { ok: true };
}

export function borrarContenido(estado, contenidoId, auth) {
  const a = autorizar(estado, auth, "contenido", false);
  if (!a.ok) return a;
  const antes = estado.contenido.length;
  estado.contenido = estado.contenido.filter((x) => x.id !== contenidoId);
  return antes === estado.contenido.length ? { ok: false, motivo: "Esa publicación ya no está." } : { ok: true };
}

export function contenidoDelMes(estado, anio, mes) {
  const pref = `${anio}-${String(mes).padStart(2, "0")}-`;
  return estado.contenido.filter((c) => c.fecha.startsWith(pref)).sort((a, b) => (a.fecha + a.hora < b.fecha + b.hora ? -1 : 1));
}

// ───────────────────────── WhatsApp ─────────────────────────

export function mensajeWhatsApp(tipo, d) {
  const club = "Break Point Pádel";
  switch (tipo) {
    case "confirmacion":
      return `¡Hola ${d.nombre}! Te confirmamos el turno en ${club}: ${d.cancha}, ${d.fecha} a las ${d.hora}.${d.sena ? ` Para dejarlo firme falta la seña de ${d.sena}${d.alias ? `: transferí al alias ${d.alias}${d.ref ? ` y poné el código ${d.ref} en el concepto` : ""} y mandanos el comprobante por acá.` : " (transferencia o Mercado Pago)."}` : ""} ¡Nos vemos en la cancha! 🎾`;
    case "recordatorio":
      return `¡Hola ${d.nombre}! Te esperamos hoy a las ${d.hora} en ${d.cancha}. Si no llegan, avisanos así le damos la cancha a otro grupo. ¡Gracias!`;
    case "espera":
      return `¡Hola ${d.nombre}! Se liberó un turno: ${d.cancha} a las ${d.hora} (${d.fecha}). ¿Lo querés? Respondé SÍ y te lo reservamos.`;
    case "lluvia_movido":
      return `¡Hola ${d.nombre}! Por la lluvia pasamos tu turno de las ${d.hora} a ${d.cancha} (techada). Mismo horario, mismo precio. ¡Los esperamos!`;
    case "lluvia_suspendido":
      return d.credito
        ? `¡Hola ${d.nombre}! Por la lluvia suspendimos tu turno de las ${d.hora}. Te dejamos ${d.credito} de crédito para cuando quieras volver. ¡Disculpá!`
        : `¡Hola ${d.nombre}! Por la lluvia suspendimos tu turno de las ${d.hora}. No se te cobra nada; avisanos y te lo reprogramamos sin cargo. ¡Disculpá!`;
    case "lluvia_devolucion":
      return `¡Hola ${d.nombre}! Por la lluvia suspendimos tu turno de las ${d.hora}. Te devolvemos los ${d.monto} que habías pagado: ¿te lo pasamos por transferencia o lo retirás en el club? ¡Disculpá!`;
    case "falta":
      return `¡Hola ${d.nombre}! Hoy no llegaron al turno de las ${d.hora}. Como avisamos, la falta se cobra entera: te quedó ${d.monto} en tu cuenta. Lo podés pasar por transferencia o Mercado Pago. ¡Gracias!`;
    case "deuda":
      return `¡Hola ${d.nombre}! Tu cuenta en el club tiene un saldo de ${d.monto}. Lo podés pasar por transferencia o Mercado Pago cuando puedas. ¡Gracias!`;
    case "aprobacion":
      return `Hola ${d.duenio}, soy ${d.pidio} del club. ${d.tipo === "fiado" ? `${d.cliente} pide fiar ${d.monto}` : `${d.cliente} pide cuenta corriente hasta ${d.monto}`}. Si lo aprobás, abrí este link, poné tu PIN y mandame el código: ${d.link}`;
    case "aprobado":
      return `Aprobado: ${d.cliente} ${d.monto}. Código ${d.codigo}`;
    case "pedidoTienda":
      return `Hola ${club}, quiero encargar para retirar en el club: ${d.lista}. Total ${d.total}. Soy ${d.nombre}${d.tel ? ` (${d.tel})` : ""}. Pedido ${d.codigo}.`;
    case "pedidoListo":
      return `¡Hola ${d.nombre}! Tu pedido ${d.codigo} ya está listo para retirar en ${club}: ${d.lista}. Total ${d.total}, se paga al retirar. ¡Te esperamos!`;
    case "reposicion":
      return `Hola, te escribo de ${club}. Necesitamos reponer: ${d.lista}. ¿Me pasás precio y cuándo lo podés traer?`;
    default:
      return d.texto ?? "";
  }
}

export function linkWhatsApp(tel, texto) {
  const numero = String(tel ?? "").replace(/\D/g, "");
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

// ───────────────────────── eventualidades (la bandeja) ─────────────────────────

/**
 * Lo que hay que resolver AHORA, ordenado por urgencia. `paraDuenio: true` marca lo que sólo puede
 * resolver un dueño (autorizaciones); la pantalla lo muestra según quién esté usando el sistema.
 */
export function alertas(estado, ahora) {
  const out = [];
  const { politica } = estado.config;
  // Pasada la 01:00, lo que sigue en cancha desde el día anterior también se avisa (y no es «luz sin juego»).
  const ayer = sumarDias(ahora.fecha, -1);
  const hoy = estado.reservas.filter((r) => r.fecha === ahora.fecha || (r.fecha === ayer && r.estado === "en_cancha"));
  for (const r of hoy) {
    const falta = minutosHasta(ahora, r.fecha, r.inicio);
    const fin = falta + r.duracion;
    const nombreCancha = cancha(estado, r.canchaId)?.nombre ?? "";
    const titular = r.clienteId ? cliente(estado, r.clienteId) : null;
    const marcaRoja = titular?.deuda > 0 ? ` ⚠ Debe ${pesos(titular.deuda)} de antes.` : "";
    // Una reserva online dentro de su plazo de seña todavía no es urgente: el jugador está transfiriendo.
    const enPlazo = r.venceSena && minutosHasta(ahora, r.venceSena.fecha, r.venceSena.min) > 0;
    if (r.estado === "reservada" && r.sena.monto > 0 && !r.sena.pagada && !enPlazo && falta > 0 && falta <= politica.minutosAvisoSena)
      out.push({ nivel: "alta", tipo: "sena", reservaId: r.id, texto: `${r.titular} (${hhmm(r.inicio)}, ${nombreCancha}) no pagó la seña.`, accion: "Pedir seña o liberar" });
    if (r.estado === "reservada" && falta < 0 && -falta >= politica.toleranciaMin && fin > 0)
      out.push({ nivel: "alta", tipo: "no_show", reservaId: r.id, texto: `${r.titular} no llegó: van ${-falta} min del turno de las ${hhmm(r.inicio)} (${nombreCancha}). La falta se cobra entera.`, accion: "Llamar o marcar la falta" });
    if (r.estado === "reservada" && falta > 0 && falta <= 15)
      out.push({ nivel: "info", tipo: "llega", reservaId: r.id, texto: `${r.titular} entra en ${falta} min a ${nombreCancha}.${marcaRoja}`, accion: "Recibir" });
    if (r.estado === "en_cancha" && fin <= 0)
      out.push({ nivel: saldo(r) > 0 ? "alta" : "media", tipo: "cerrar", reservaId: r.id, texto: saldo(r) > 0 ? `${r.titular} terminó y la cancha debe ${pesos(saldo(r))}.${marcaRoja}` : `${r.titular} terminó: cerrá la cancha y apagá la luz.`, accion: saldo(r) > 0 ? "Cobrar o sumar a cuenta" : "Cerrar cancha" });
    if (r.estado === "en_cancha" && fin > 0 && fin <= 10)
      out.push({ nivel: "info", tipo: "termina", reservaId: r.id, texto: `${r.titular} termina en ${fin} min (${nombreCancha}).`, accion: "Ofrecer extender" });
    if (r.devolucionPendiente > 0)
      out.push({ nivel: "media", tipo: "devolucion", reservaId: r.id, texto: `Hay que devolverle ${pesos(r.devolucionPendiente)} a ${r.titular} (no tiene ficha).`, accion: "Registrar la devolución" });
    if (r.deudaSinFicha > 0)
      out.push({ nivel: "media", tipo: "falta_sin_ficha", reservaId: r.id, texto: `${r.titular} debe la falta de las ${hhmm(r.inicio)}: ${pesos(r.deudaSinFicha)} (no tiene ficha).`, accion: "Cobrar la falta" });
  }
  for (const c of estado.canchas) {
    if (!estado.luces[c.id]) continue;
    if (!hoy.some((r) => r.canchaId === c.id && r.estado === "en_cancha")) out.push({ nivel: "media", tipo: "luz", canchaId: c.id, texto: `Luz prendida en ${c.nombre} sin juego.`, accion: "Apagar" });
  }
  for (const c of estado.canchas.filter((x) => x.estado === "mantenimiento")) {
    const n = hoy.filter((r) => r.canchaId === c.id && r.estado === "reservada" && minutosHasta(ahora, r.fecha, r.inicio) > 0).length;
    if (n) out.push({ nivel: "alta", tipo: "mantenimiento", canchaId: c.id, texto: `${c.nombre} está en mantenimiento y tiene ${n} turno(s) por delante.`, accion: "Reubicar" });
  }
  const lluvia = estado.clima.pronostico;
  if (lluvia && lluvia.fecha === ahora.fecha && !estado.clima.lluvia) {
    const descubiertas = new Set(estado.canchas.filter((c) => !c.cubierta).map((c) => c.id));
    const n = hoy.filter((r) => descubiertas.has(r.canchaId) && ["reservada", "en_cancha"].includes(r.estado) && solapa(r.inicio, r.inicio + r.duracion, lluvia.desde, lluvia.hasta)).length;
    if (n) out.push({ nivel: "alta", tipo: "lluvia", texto: `Anuncian lluvia ${hhmm(lluvia.desde)}–${hhmm(lluvia.hasta)}: ${n} turno(s) en cancha descubierta.`, accion: "Activar plan lluvia" });
  }
  for (const e of estado.espera.filter((x) => x.fecha === ahora.fecha)) {
    for (const c of estado.canchas) {
      const libres = huecosLibres(estado, e.fecha, c.id, e.duracion, Math.max(e.desde, ahora.min)).filter((m) => m <= e.hasta);
      if (libres.length && (!e.soloCubierta || c.cubierta)) {
        out.push({ nivel: "media", tipo: "espera", esperaId: e.id, canchaId: c.id, inicio: libres[0], texto: `Hay lugar para ${e.titular} (lista de espera): ${c.nombre} ${hhmm(libres[0])}.`, accion: "Ofrecer por WhatsApp" });
        break;
      }
    }
  }
  for (const p of estado.productos) {
    if (p.activo !== false && !p.alquiler && p.stock != null && p.stock <= p.minimo)
      out.push({ nivel: p.stock === 0 ? "alta" : "media", tipo: "stock", productoId: p.id, texto: `${p.nombre}: quedan ${p.stock} (mínimo ${p.minimo}).`, accion: "Ver stock" });
  }
  for (const n of estado.novedades.filter((x) => x.estado === "pendiente")) {
    const c = cliente(estado, n.clienteId);
    out.push({ nivel: "media", tipo: "autorizacion", novedadId: n.id, paraDuenio: true, texto: n.tipo === "fiado" ? `${n.pidio} pide fiarle ${pesos(n.monto)} a ${c?.nombre}.` : `${n.pidio} pide cuenta corriente para ${c?.nombre} hasta ${pesos(n.limite)}.`, accion: "Autorizar o rechazar" });
  }
  for (const pd of (estado.pedidos ?? []).filter((x) => x.estado === "pendiente"))
    out.push({ nivel: "media", tipo: "pedido", pedidoId: pd.id, texto: `Pedido de la tienda ${pd.codigo} de ${pd.nombre}: ${pesos(pd.total)} para retirar.`, accion: "Ver pedido" });
  for (const s of estado.solicitudesAcceso.filter((x) => x.estado === "pendiente"))
    out.push({ nivel: "media", tipo: "acceso", solicitudId: s.id, paraDuenio: true, texto: `${s.nombre} pidió acceso al sistema.`, accion: "Dar acceso" });
  const peso = { alta: 0, media: 1, info: 2 };
  return out.sort((a, b) => peso[a.nivel] - peso[b.nivel]);
}

// ───────────────────────── tablero del dueño ─────────────────────────

export function kpis(estado, fecha, ahora) {
  const { abre, cierra } = horarioDe(estado, fecha);
  const canchasActivas = estado.canchas.filter((c) => c.estado !== "mantenimiento");
  const delDia = estado.reservas.filter((r) => r.fecha === fecha);
  const ocupan = delDia.filter((r) => OCUPA.has(r.estado));
  const minutosDisponibles = canchasActivas.length * (cierra - abre);
  const minutosOcupados = ocupan.reduce((s, r) => s + r.duracion, 0);
  const porFranja = { valle: { ocupado: 0, total: 0 }, pico: { ocupado: 0, total: 0 } };
  for (let m = abre; m < cierra; m += 30) {
    const f = franjaDe(estado, fecha, m);
    porFranja[f].total += canchasActivas.length * 30;
    for (const r of ocupan) if (m >= r.inicio && m < r.inicio + r.duracion) porFranja[f].ocupado += 30;
  }
  const vendido = ocupan.reduce((s, r) => s + totalReserva(r), 0);
  const cobradoTotal = delDia.reduce((s, r) => s + cobrado(r), 0);
  const yaEmpezo = (r) => !ahora || fecha < ahora.fecha || (fecha === ahora.fecha && r.inicio <= ahora.min);
  const porCobrar = delDia.filter((r) => r.estado === "en_cancha" || (r.estado === "reservada" && yaEmpezo(r))).reduce((s, r) => s + Math.max(0, saldo(r)), 0);
  const dia = ahora ? cajaAbierta(estado, ahora) : fecha; // la misma caja que muestra Caja
  const caja = resumenCaja(estado, dia);
  const stockValorizado = estado.productos.reduce((s, p) => s + (p.stock == null ? 0 : p.costo * (p.stock + (p.prestados ?? 0))), 0);
  let buffet = 0;
  for (const cta of estado.cuentas) for (const i of cta.items) if (i.fecha && diaDeCaja(estado, i.fecha, i.min ?? 0) === dia) buffet += i.cant * i.precioUnit;
  const abiertas = cuentasAbiertas(estado);
  return {
    ocupacion: minutosDisponibles ? minutosOcupados / minutosDisponibles : 0,
    ocupacionValle: porFranja.valle.total ? porFranja.valle.ocupado / porFranja.valle.total : 0,
    ocupacionPico: porFranja.pico.total ? porFranja.pico.ocupado / porFranja.pico.total : 0,
    turnos: ocupan.length,
    vendido,
    cobrado: cobradoTotal,
    porCobrar,
    ticketPromedio: ocupan.length ? Math.round(vendido / ocupan.length) : 0,
    buffet,
    cuentasAbiertas: abiertas.length,
    cuentasAbiertasSaldo: abiertas.reduce((s, c) => s + saldoCuenta(c), 0),
    faltas: delDia.filter((r) => r.estado === "no_show").length,
    cancelados: delDia.filter((r) => r.estado === "cancelada").length,
    caja,
    stockValorizado,
    deudaClientes: estado.clientes.reduce((s, c) => s + c.deuda, 0),
    creditos: estado.clientes.reduce((s, c) => s + c.monedero, 0),
    deudaProveedores: estado.proveedores.reduce((s, p) => s + Math.max(0, deudaConProveedor(estado, p.id)), 0),
  };
}

/** Matriz de ocupación día × hora (0..1) para el mapa de calor del dueño. */
export function mapaDeCalor(estado, fechas) {
  const abre = Math.min(...fechas.map((f) => horarioDe(estado, f).abre));
  const cierra = Math.max(...fechas.map((f) => horarioDe(estado, f).cierra));
  const horas = [];
  for (let h = abre; h < cierra; h += 60) horas.push(h);
  const n = estado.canchas.filter((c) => c.estado !== "mantenimiento").length || 1;
  const filas = fechas.map((fecha) => {
    const ocupan = estado.reservas.filter((r) => r.fecha === fecha && OCUPA.has(r.estado));
    return {
      fecha,
      valores: horas.map((h) => {
        let ocupado = 0;
        for (const r of ocupan) ocupado += Math.max(0, Math.min(h + 60, r.inicio + r.duracion) - Math.max(h, r.inicio));
        return Math.min(1, ocupado / (60 * n));
      }),
    };
  });
  return { horas, filas };
}

// ───────────────────────── reglas editables ─────────────────────────

/** Minutos sin uso hasta bloquear la pantalla (0 = sólo al apagarse o esconderse la pantalla). */
export const LIMITES_BLOQUEO = Object.freeze([0, 60]);
export function ajustarBloqueo(estado, minutos, auth) {
  const a = autorizar(estado, auth, "configurar", false);
  if (!a.ok) return a;
  const v = Math.round(Number(minutos));
  if (!Number.isFinite(v) || v < LIMITES_BLOQUEO[0] || v > LIMITES_BLOQUEO[1]) return { ok: false, motivo: `Entre ${LIMITES_BLOQUEO[0]} y ${LIMITES_BLOQUEO[1]} minutos.` };
  estado.config.bloqueoMin = v;
  return { ok: true, valor: v };
}

/** Límites de las reglas que el dueño edita en vivo. `minutosAntesParaEntrar` vacío = sin límite. */
export const LIMITES_POLITICA = Object.freeze({
  horasCancelacionLibre: [0, 72],
  senaPct: [0, 100],
  strikesParaSena: [1, 10],
  toleranciaMin: [0, 60],
  minutosAntesParaEntrar: [0, 240],
});

export function ajustarPolitica(estado, clave, valor) {
  const lim = LIMITES_POLITICA[clave];
  if (!lim) return { ok: false, motivo: "Esa regla no existe." };
  if (clave === "minutosAntesParaEntrar" && (valor === "" || valor == null)) { estado.config.politica[clave] = null; return { ok: true, valor: null }; }
  const v = Math.round(Number(valor));
  if (!Number.isFinite(v) || v < lim[0] || v > lim[1]) return { ok: false, motivo: `Tiene que ser entre ${lim[0]} y ${lim[1]}.` };
  estado.config.politica[clave] = v;
  return { ok: true, valor: v };
}

// ───────────────────────── datos de demo ─────────────────────────

const H = (hh, mm = 0) => hh * 60 + mm;

/** Configuración de ejemplo (precios y horarios provisionales a confirmar con el club). */
export const CONFIG_DEMO = Object.freeze({
  nombre: "Break Point Pádel",
  apertura: H(8),
  cierre: H(25), // 01:00
  // Por día de la semana (0 = domingo). Editable desde la agenda.
  horarios: [
    { abre: H(9), cierra: H(23) },
    { abre: H(8), cierra: H(25) }, { abre: H(8), cierra: H(25) }, { abre: H(8), cierra: H(25) },
    { abre: H(8), cierra: H(25) }, { abre: H(8), cierra: H(25) },
    { abre: H(9), cierra: H(25) },
  ],
  corteCaja: H(12), // la caja diaria corre de 12 a 12
  bloqueoMin: 5, // minutos sin uso hasta pedir el PIN otra vez (0 = sólo al apagar/esconder la pantalla)
  cobro: { alias: "bp.demo.ficticio" }, // DEMO: alias ficticio rotulado; el real lo carga el dueño post-venta
  paso: 30,
  duracionTurno: 90,
  feriados: [],
  tarifas: [
    { nombre: "Valle", desde: H(8), hasta: H(17), precioHora: 20000 },
    { nombre: "Pico", desde: H(17), hasta: H(26), precioHora: 28000, pico: true },
  ],
  politica: {
    horasCancelacionLibre: 12,
    senaPct: 50,
    senaSiempre: false,
    senaSinCliente: true,
    strikesParaSena: 2,
    toleranciaMin: 15,
    minutosAvisoSena: 180,
    senaWeb: "nuevos", // turnero online: seña a quien todavía no es de confianza
    turnosConfianza: 3,
    minutosParaSenar: 60, // plazo para mandar la seña de una reserva online
    liberarSinSena: "manual", // "manual": vencida la seña decide el club (bandeja) · "auto": se libera sola
    unaCanchaPorHorario: false, // turnero: ¿un jugador puede tener dos canchas a la misma hora? (lo decide el club)
    minutosAntesParaEntrar: null, // sin límite: se abre la cancha cuando el club quiere
  },
});

export const CANCHAS_DEMO = Object.freeze([
  { id: "c1", nombre: "Cancha 1", cubierta: true, panoramica: true, estado: "ok", camara: "cam-c1" },
  { id: "c2", nombre: "Cancha 2", cubierta: true, panoramica: true, estado: "ok", camara: "cam-c2" },
  { id: "c3", nombre: "Cancha 3", cubierta: true, panoramica: true, estado: "ok", camara: "cam-c3" },
  { id: "c4", nombre: "Cancha 4", cubierta: true, panoramica: true, estado: "ok", camara: "cam-c4" },
]);

/**
 * Los dueños de Break Point para la jornada real. Arrancan SIN PIN: cada uno arma el suyo en la consola de
 * configuración. Recepción la dan de alta ellos (Configuración → Usuarios y accesos).
 */
export const USUARIOS_REALES = Object.freeze([
  { id: "u-rober", nombre: "Roberto Ronco", rol: "duenio", pin: "", activo: true },
  { id: "u-majo", nombre: "Majo Gimenez", rol: "duenio", pin: "", activo: true },
]);

/** Usuarios de demo. Los PIN son de ejemplo y se muestran en pantalla a propósito (es una demo). */
export const USUARIOS_DEMO = Object.freeze([
  { id: "u-rober", nombre: "Rober", rol: "duenio", pin: "1111", activo: true },
  { id: "u-majo", nombre: "Majo", rol: "duenio", pin: "2222", activo: true },
  { id: "u-lu", nombre: "Lu (recepción tarde)", rol: "recepcion", pin: "33", activo: true },
  { id: "u-caro", nombre: "Caro (recepción mañana)", rol: "recepcion", pin: "44", activo: true },
]);

export const PROVEEDORES_DEMO = Object.freeze([
  { id: "pv1", nombre: "Distribuidora Ezeiza Bebidas", cuit: "30-00000000-1", tel: "", rubro: "Bebidas", activo: true },
  { id: "pv2", nombre: "Pádel Sur Insumos", cuit: "30-00000000-2", tel: "", rubro: "Pelotas y accesorios", activo: true },
  { id: "pv3", nombre: "Carnicería Don Tito", cuit: "20-00000000-3", tel: "", rubro: "Cocina", activo: true },
  { id: "pv4", nombre: "Panadería La Espiga", cuit: "20-00000000-4", tel: "", rubro: "Cocina", activo: true },
]);

const NOMBRES = [
  "Lucas Fernández", "Sofía Gómez", "Martín Ríos", "Valentina Paz", "Nicolás Herrera", "Camila Sosa",
  "Federico Luna", "Julieta Acosta", "Tomás Medina", "Agustina Romero", "Matías Benítez", "Florencia Díaz",
  "Gonzalo Vera", "Micaela Ortiz", "Diego Castro", "Carolina Molina", "Pablo Suárez", "Lucía Torres",
  "Ezequiel Rojas", "Daniela Navarro", "Santiago Aguirre", "Rocío Giménez", "Facundo Ledesma", "Paula Ibáñez",
];

// Códigos de ejemplo (formato EAN-13 con prefijo 779 de Argentina; ficticios).
export const PRODUCTOS_DEMO = Object.freeze([
  { id: "p1", tienda: true, nombre: "Tubo de pelotas (3)", categoria: "Pelotas", precio: 12000, costo: 7800, stock: 18, minimo: 10, codigo: "BP-001", codigoExterno: "7790000000011" },
  { id: "p2", tienda: true, nombre: "Agua 500 ml", categoria: "Bebidas", precio: 2000, costo: 700, stock: 42, minimo: 24, codigo: "BP-002", codigoExterno: "7790000000028" },
  { id: "p3", tienda: true, nombre: "Bebida isotónica", categoria: "Bebidas", precio: 3500, costo: 1500, stock: 9, minimo: 12, codigo: "BP-003", codigoExterno: "7790000000035" },
  { id: "p9", tienda: true, nombre: "Cerveza lata 473 ml", categoria: "Bebidas", precio: 3800, costo: 1700, stock: 48, minimo: 24, codigo: "BP-004", codigoExterno: "7790000000097" },
  { id: "p10", tienda: true, nombre: "Gaseosa 500 ml", categoria: "Bebidas", precio: 2800, costo: 1100, stock: 30, minimo: 18, codigo: "BP-005", codigoExterno: "7790000000103" },
  { id: "p4", tienda: true, nombre: "Overgrip", categoria: "Accesorios", precio: 4500, costo: 2100, stock: 30, minimo: 10, codigo: "BP-006", codigoExterno: "7790000000042" },
  { id: "p5", tienda: true, nombre: "Muñequera", categoria: "Accesorios", precio: 6000, costo: 2800, stock: 4, minimo: 6, codigo: "BP-007", codigoExterno: "7790000000059" },
  { id: "p6", nombre: "Alquiler de pala", categoria: "Alquiler", precio: 5000, costo: 0, stock: 8, minimo: 0, alquiler: true, codigo: "BP-008", codigoExterno: "" },
  { id: "p7", tienda: true, nombre: "Pala Break Point (shop)", categoria: "Shop", precio: 185000, costo: 118000, stock: 3, minimo: 2, codigo: "BP-009", codigoExterno: "7790000000073" },
  { id: "p8", tienda: true, nombre: "Remera técnica del club", categoria: "Shop", precio: 28000, costo: 13500, stock: 0, minimo: 5, codigo: "BP-010", codigoExterno: "7790000000080" },
  // Cocina (Delicias): los platos no llevan stock; se miden por venta.
  { id: "k-mila", nombre: "Milanesa napolitana con papas", categoria: "Cocina", precio: 14500, costo: 6200, stock: null, minimo: 0, plato: true, codigo: "BP-011", codigoExterno: "" },
  { id: "k-hamb", nombre: "Hamburguesa Break con papas", categoria: "Cocina", precio: 12000, costo: 4800, stock: null, minimo: 0, plato: true, codigo: "BP-012", codigoExterno: "" },
  { id: "k-tost", nombre: "Tostado jamón y queso", categoria: "Cocina", precio: 6500, costo: 2300, stock: null, minimo: 0, plato: true, codigo: "BP-013", codigoExterno: "" },
  { id: "k-empa", nombre: "Empanada de carne", categoria: "Cocina", precio: 2200, costo: 800, stock: null, minimo: 0, plato: true, codigo: "BP-014", codigoExterno: "" },
  { id: "k-cesar", nombre: "Ensalada César", categoria: "Cocina", precio: 9800, costo: 3900, stock: null, minimo: 0, plato: true, codigo: "BP-015", codigoExterno: "" },
  { id: "k-pica", nombre: "Picada para 4", categoria: "Cocina", precio: 21000, costo: 9500, stock: null, minimo: 0, plato: true, codigo: "BP-016", codigoExterno: "" },
]);

/** Generador pseudoaleatorio con semilla: la demo se ve igual cada vez que se abre el mismo día. */
function azar(semilla) {
  let s = semilla >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/**
 * Arma un club con vida: una semana de historia (ocupación, buffet, remitos) y un día de hoy con las
 * eventualidades a la vista.
 */
export function generarDemo(hoy, ahoraMin = H(19, 10)) {
  secuencia = 0;
  const rnd = azar(hoy.split("-").reduce((s, x) => s * 31 + Number(x), 7));
  const clientes = NOMBRES.map((nombre, i) => ({
    id: `k${i + 1}`, nombre, tel: `5491100000${String(i + 1).padStart(3, "0")}`, // ficticio a propósito
    strikes: i === 5 ? 2 : i === 11 ? 1 : 0, monedero: i === 2 ? 15000 : 0,
    nivel: ["3ra", "4ta", "5ta", "6ta", "7ma"][i % 5],
    cc: [0, 2, 9, 16].includes(i) ? { habilitada: true, limite: i === 9 ? 50000 : 100000 } : { habilitada: false, limite: 0 },
  }));
  const e = crearEstado({ config: CONFIG_DEMO, canchas: CANCHAS_DEMO, clientes, productos: PRODUCTOS_DEMO, usuarios: USUARIOS_DEMO, proveedores: PROVEEDORES_DEMO });
  e.caja.fondo = 30000;
  const ahora = { fecha: hoy, min: ahoraMin };
  const elegir = () => clientes[Math.floor(rnd() * clientes.length)];
  const medios = ["efectivo", "mercadopago", "transferencia", "debito"];
  const platos = PRODUCTOS_DEMO.filter((p) => p.plato);
  const dueno = { usuarioId: "u-rober", pin: "1111" };
  const recep = { usuarioId: "u-lu" };

  crearFijo(e, { clienteId: "k1", canchaId: "c1", dia: diaSemana(hoy), inicio: H(20, 30) });
  crearFijo(e, { clienteId: "k4", canchaId: "c2", dia: diaSemana(hoy), inicio: H(22, 30) });
  crearFijo(e, { clienteId: "k7", canchaId: "c3", dia: (diaSemana(hoy) + 1) % 7, inicio: H(19) });

  const cerrarDemo = (r, fin, partes) => {
    r.estado = "finalizada";
    for (const parte of dividir(saldo(r), partes)) {
      const medio = medios[Math.floor(rnd() * 4)];
      r.pagos.push({ medio, monto: parte, ...fin });
      e.caja.movimientos.push({ id: nuevoId("m"), tipo: "ingreso", medio, monto: parte, concepto: `Cancha ${r.titular}`, reservaId: r.id, ...fin });
    }
  };

  // Historia: los 6 días anteriores, cerrados y cobrados, con consumos de buffet (para métricas de platos).
  for (let d = -6; d <= 0; d++) {
    const fecha = sumarDias(hoy, d);
    const { abre, cierra } = horarioDe(e, fecha);
    materializarFijos(e, fecha);
    const finde = [0, 6].includes(diaSemana(fecha));
    for (const c of e.canchas) {
      for (let m = abre; m + 90 <= cierra; m += 90) {
        const prob = finde ? 0.78 : m >= H(17) ? 0.9 : m < H(11) ? 0.25 : 0.4;
        if (d === 0 && m + 90 > ahoraMin - 90 && m < ahoraMin + 330) continue; // hoy se arma a mano abajo
        const fijo = e.reservas.find((r) => r.fecha === fecha && r.canchaId === c.id && r.inicio === m && r.fijoId);
        if (!fijo && rnd() > prob) continue;
        const r = fijo ?? crearReserva(e, { canchaId: c.id, fecha, inicio: m, clienteId: elegir().id, origen: rnd() > 0.5 ? "whatsapp" : "web" }).reserva;
        if (!r || d === 0 && m + 90 > ahoraMin) continue;
        const fin = { fecha, min: m + 90 };
        // Consumos del buffet de los jugadores (platos y bebidas).
        if (rnd() > 0.35) {
          const { cuenta: cta } = abrirCuenta(e, { clienteId: r.clienteId, titular: r.titular, reservaId: r.id, jugadorIdx: 0 }, fin);
          if (rnd() > 0.3) cta.items.push(itemDemo(e, "p2", 1 + Math.floor(rnd() * 3), fin));
          if (rnd() > 0.5) cta.items.push(itemDemo(e, "p9", 1 + Math.floor(rnd() * 3), fin));
          if (rnd() > 0.45) { const pl = platos[Math.floor(rnd() * platos.length)]; cta.items.push(itemDemo(e, pl.id, 1 + Math.floor(rnd() * 2), fin)); }
          const tot = totalCuenta(cta);
          if (tot > 0) { cta.pagos.push({ medio: medios[Math.floor(rnd() * 4)], monto: tot, ...fin }); e.caja.movimientos.push({ id: nuevoId("m"), tipo: "ingreso", medio: cta.pagos[0].medio, monto: tot, concepto: `Buffet ${cta.titular}`, ...fin }); }
          cta.estado = "cerrada";
        }
        if (rnd() > 0.97 && !r.fijoId) { r.estado = "no_show"; continue; }
        cerrarDemo(r, fin, rnd() > 0.5 ? 4 : 1);
      }
    }
    // Los fijos de días pasados que no caen en la grilla de 90' también se jugaron y se cobraron.
    if (d < 0) for (const r of e.reservas.filter((x) => x.fecha === fecha && x.estado === "reservada")) cerrarDemo(r, { fecha, min: r.inicio + r.duracion }, 1);
  }

  // Proveedores: remitos de la semana y algún pago parcial (deuda viva con cada uno).
  const remitoDemo = (proveedorId, numero, items, dias, min) => {
    const res = registrarRemito(e, { proveedorId, numero, items }, recep, { fecha: sumarDias(hoy, dias), min });
    for (const i of items) producto(e, i.productoId).stock -= Number(i.cant); // la historia no infla el stock de hoy
    return res;
  };
  remitoDemo("pv1", "0001-00004512", [{ productoId: "p2", cant: 48, costo: 700 }, { productoId: "p9", cant: 48, costo: 1700 }, { productoId: "p10", cant: 24, costo: 1100 }], -5, H(10, 30));
  remitoDemo("pv2", "0003-00000871", [{ productoId: "p1", cant: 24, costo: 7800 }, { productoId: "p4", cant: 20, costo: 2100 }], -3, H(16));
  remitoDemo("pv1", "0001-00004580", [{ productoId: "p3", cant: 24, costo: 1500 }], -1, H(11));
  e.pagosProveedor.push({ id: nuevoId("pp"), proveedorId: "pv1", medio: "transferencia", monto: 100000, pago: "Rober", fecha: sumarDias(hoy, -2), min: H(18) });

  // HOY — escenario armado para que cada eventualidad aparezca.
  const turno = (canchaId, inicio, clienteId, extra = {}) => crearReserva(e, { canchaId, fecha: hoy, inicio, clienteId, origen: "whatsapp", ...extra }, { fecha: hoy, min: inicio - 600 }).reserva;
  materializarFijos(e, hoy);
  const t = (min) => ({ fecha: hoy, min });

  // 1) Termina ahora; la cancha debe la mitad. Martín tiene cuenta corriente; su consumo quedó abierto.
  const r1 = turno("c1", H(17, 30), "k3", { jugadores: [{ nombre: "Martín Ríos", clienteId: "k3" }, { nombre: "Sofía Gómez", clienteId: "k2" }, { nombre: "Tomás Medina", clienteId: "k9" }, { nombre: "Lucía Torres", clienteId: "k18" }] });
  r1.estado = "en_cancha"; r1.checkIn = t(H(17, 28)); e.luces.c1 = true;
  registrarPago(e, r1.id, { medio: "mercadopago", monto: 21000, jugador: 0 }, t(H(17, 30)));
  consumoJugador(e, r1.id, 0, "p2", 2, { modo: "cuenta" }, t(H(18)));
  consumoJugador(e, r1.id, 0, "p3", 2, { modo: "cuenta" }, t(H(18, 40)));
  consumoJugador(e, r1.id, 1, "p2", 1, { modo: "cobrar", medio: "efectivo" }, t(H(18, 5)));
  // 2) En juego, cancha paga; las palas alquiladas van a la cuenta de Julieta.
  const r2 = turno("c2", H(18, 30), "k8", { jugadores: [{ nombre: "Julieta Acosta", clienteId: "k8" }, "Camila Sosa", "Rocío Giménez", "Paula Ibáñez"] });
  registrarPago(e, r2.id, { medio: "transferencia", monto: totalReserva(r2) }, t(H(18, 25)));
  r2.estado = "en_cancha"; r2.checkIn = t(H(18, 27)); e.luces.c2 = true;
  consumoJugador(e, r2.id, 0, "p6", 2, { modo: "cuenta" }, t(H(18, 28)));
  // 3) No llegó: van 40 minutos (cliente con 2 faltas; la seña está paga, la falta se cobra entera).
  const r3 = turno("c3", H(18, 30), "k6");
  registrarPago(e, r3.id, { medio: "transferencia", monto: r3.sena.monto }, t(H(14)));
  // 4) Entra en 20 minutos, sin seña (grupo nuevo de mostrador).
  turno("c4", H(19, 30), null, { titular: "Grupo de Bruno (nuevo)", origen: "mostrador" });
  e.luces.c3 = true; // 5) luz prendida de más
  // 6) Más tarde.
  turno("c4", H(21), "k10");
  turno("c4", H(22, 30), "k13");
  turno("c3", H(20, 30), "k15", { tipo: "clase", titular: "Clase 4ta — Profe Ezequiel" });
  turno("c1", H(22), "k17");
  turno("c3", H(22), "k21", { tipo: "abierto", titular: "Partido abierto 5ta (3/4)", jugadores: ["Santiago Aguirre", "Gonzalo Vera", "Facundo Ledesma"] });
  turno("c1", H(23, 30), "k19");
  e.clima.pronostico = { fecha: hoy, desde: H(20, 45), hasta: H(23, 59) };
  anotarEspera(e, { clienteId: "k20", titular: "Daniela Navarro", tel: clientes[19].tel, fecha: hoy, desde: H(21), hasta: H(23, 30), soloCubierta: true }, ahora);

  // Buffet abierto a nivel cliente (sin turno): Federico come en Delicias y paga cuando se va.
  const { cuenta: fede } = abrirCuenta(e, { clienteId: "k7" }, t(H(18, 50)));
  cargarEnCuenta(e, fede.id, "k-mila", 1, t(H(18, 55)));
  cargarEnCuenta(e, fede.id, "p9", 2, t(H(18, 55)));

  // Cuenta corriente con historia: Agustina debe dos cosas viejas.
  const agus = cliente(e, "k10");
  agus.movCC.push({ fecha: sumarDias(hoy, -6), min: H(21, 30), concepto: "Cancha (sumada a cuenta)", importe: 14000, saldo: 14000 });
  agus.movCC.push({ fecha: sumarDias(hoy, -2), min: H(22, 40), concepto: "Cargos del buffet", importe: 7000, saldo: 21000 });
  agus.deuda = 21000;

  // Novedades para el dueño: un pedido de cuenta corriente y uno de acceso.
  solicitarCC(e, "k8", { limite: 60000, nota: "Juega 3 veces por semana" }, recep, t(H(17)));
  solicitarAcceso(e, "Juli (recepción finde)", t(H(16, 30)));

  // Caja de hoy: un egreso con PIN (hielo).
  egresoCaja(e, { monto: 6500, concepto: "Hielo para el bar", usuarioId: "u-lu", pin: "33" }, t(H(16, 40)));

  // Plataforma de contenido: el mes armado.
  const [anio, mes] = hoy.split("-");
  const diaMes = (n) => `${anio}-${mes}-${String(n).padStart(2, "0")}`;
  const hoyNum = Number(hoy.slice(8));
  const pubs = [
    [hoyNum - 3, "18:00", "post", "Resultados del torneo relámpago", "Fotos de los ganadores + agradecimiento a los que vinieron.", "publicado"],
    [hoyNum - 1, "12:30", "historia", "Menú del día en Delicias", "Milanesa napolitana con papas $14.500.", "publicado"],
    [hoyNum, "19:00", "whatsapp", "Turnos libres de valle", "Mañana de 10 a 16 hay canchas: 2x1 en la segunda hora.", "programado"],
    [hoyNum + 2, "20:00", "reel", "Clase de bandeja con el Profe Ezequiel", "Reel de 30 segundos; música en tendencia.", "programado"],
    [hoyNum + 4, "11:00", "post", "Inscripción Circuito Padel Sur", "Categorías 4ta a 7ma. Cupos limitados.", "idea"],
    [hoyNum + 7, "19:30", "historia", "Sorteo de pala Break Point", "Seguinos + etiquetá a tu compañero.", "idea"],
  ];
  for (const [n, hora, canal, titulo, texto, est] of pubs) {
    if (n >= 1 && n <= 28) agregarContenido(e, { fecha: diaMes(n), hora, canal, titulo, texto, estado: est }, dueno);
  }

  e.log.length = 0;
  registrar(e, "Arrancó el turno tarde de recepción (Lu).", t(H(16)));
  return e;
}

function itemDemo(e, productoId, cant, cuando) {
  const p = producto(e, productoId);
  return { productoId, nombre: p.nombre, cant, precioUnit: p.precio, alquiler: false, plato: !!p.plato, devuelto: false, fecha: cuando.fecha, min: cuando.min };
}
