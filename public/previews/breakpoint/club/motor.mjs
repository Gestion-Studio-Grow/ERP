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
//   · Sin persistencia: el estado vive en memoria (DEMO → VENTA → INVERSIÓN: antes de la venta no se guarda nada).
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

function normalizarCliente(c) {
  return {
    nivel: "", tel: "", strikes: 0, monedero: 0, deuda: 0, activo: true, movCC: [],
    ...c,
    cc: { habilitada: false, limite: 0, ...(c.cc ?? {}) },
  };
}

export const cancha = (estado, id) => estado.canchas.find((c) => c.id === id);
export const cliente = (estado, id) => estado.clientes.find((c) => c.id === id);
export const reserva = (estado, id) => estado.reservas.find((r) => r.id === id);
export const producto = (estado, id) => estado.productos.find((p) => p.id === id);
export const cuenta = (estado, id) => estado.cuentas.find((c) => c.id === id);
export const proveedor = (estado, id) => estado.proveedores.find((p) => p.id === id);
export const usuario = (estado, id) => estado.usuarios.find((u) => u.id === id);

// ───────────────────────── usuarios, PIN y permisos ─────────────────────────

export function puede(estado, usuarioId, accion) {
  const u = usuario(estado, usuarioId);
  return !!u && u.activo !== false && (PERMISOS[u.rol] ?? []).includes(accion);
}

/** ¿Este PIN es el de este usuario? */
export function verificarPin(estado, usuarioId, pin) {
  const u = usuario(estado, usuarioId);
  if (!u || u.activo === false) return { ok: false, motivo: "Ese usuario no tiene acceso." };
  if (String(pin ?? "").trim() !== u.pin) return { ok: false, motivo: "PIN incorrecto." };
  return { ok: true, usuario: u };
}

/** Permiso + (si se pide) PIN. Lo usan todas las operaciones sensibles. */
function autorizar(estado, { usuarioId, pin } = {}, accion, conPin) {
  const u = usuario(estado, usuarioId);
  if (!u || u.activo === false) return { ok: false, motivo: "Elegí quién está usando el sistema." };
  if (!puede(estado, usuarioId, accion)) return { ok: false, motivo: `${u.nombre} no tiene permiso para esto.` };
  if (conPin) return verificarPin(estado, usuarioId, pin);
  return { ok: true, usuario: u };
}

/** Busca a quién pertenece un PIN (cambio rápido de usuario en el mostrador). */
export function usuarioPorPin(estado, pin) {
  const u = estado.usuarios.find((x) => x.activo !== false && x.pin === String(pin ?? "").trim());
  return u ? { ok: true, usuario: u } : { ok: false, motivo: "PIN incorrecto." };
}

function pinLibre(estado) {
  const usados = new Set(estado.usuarios.filter((u) => u.activo !== false).map((u) => u.pin));
  const libres = [];
  for (let n = 10; n <= 99; n++) if (!usados.has(String(n))) libres.push(String(n));
  if (!libres.length) return null;
  const azarSeguro = globalThis.crypto?.getRandomValues ? globalThis.crypto.getRandomValues(new Uint32Array(1))[0] : Math.floor(Math.random() * 2 ** 32);
  return libres[azarSeguro % libres.length];
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
 * El dueño otorga el acceso: elige el rol y el sistema genera un PIN de 2 dígitos que no repite ningún
 * otro activo. El PIN se muestra UNA vez para entregárselo a la persona (acceso dinámico: se revoca o se
 * regenera cuando haga falta).
 */
export function otorgarAcceso(estado, solicitudId, { rol }, auth, ahora) {
  const a = autorizar(estado, auth, "usuarios", true);
  if (!a.ok) return a;
  const s = estado.solicitudesAcceso.find((x) => x.id === solicitudId && x.estado === "pendiente");
  if (!s) return { ok: false, motivo: "Ese pedido ya no está pendiente." };
  if (!ROLES[rol]) return { ok: false, motivo: "Elegí el rol." };
  const pin = pinLibre(estado);
  if (!pin) return { ok: false, motivo: "No quedan PIN libres: revocá accesos que no se usen." };
  const u = { id: nuevoId("u"), nombre: s.nombre, rol, pin, activo: true };
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
  const viejo = u.pin;
  u.pin = "";
  const pin = pinLibre(estado);
  if (!pin) { u.pin = viejo; return { ok: false, motivo: "No quedan PIN libres." }; }
  u.pin = pin;
  registrar(estado, `${a.usuario.nombre} generó un PIN nuevo para ${u.nombre}.`, ahora);
  return { ok: true, pin };
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
  if (estado.cuentas.some((x) => x.clienteId === clienteId && x.estado === "abierta")) return { ok: false, motivo: `${c.nombre} tiene consumos abiertos en el buffet.` };
  c.activo = false;
  registrar(estado, `Baja de cliente: ${c.nombre}.`, ahora);
  return { ok: true };
}

/** Movimiento de cuenta corriente. Positivo = el cliente debe más; negativo = pagó. */
function movimientoCC(estado, c, importe, concepto, ahora) {
  c.deuda += importe;
  c.movCC.push({ ...sello(ahora), concepto, importe, saldo: c.deuda });
}

/** ¿Se le puede sumar este importe a la cuenta corriente? */
export function puedeACuenta(c, importe) {
  if (!c) return { ok: false, motivo: "Para sumar a la cuenta hace falta la ficha del cliente." };
  if (!c.cc.habilitada) return { ok: false, motivo: `${c.nombre} no tiene cuenta corriente habilitada: pedí la autorización al dueño.` };
  if (c.deuda + importe > c.cc.limite) return { ok: false, motivo: `Supera el límite de ${c.nombre} (${pesos(c.cc.limite)}; ya debe ${pesos(c.deuda)}).` };
  return { ok: true };
}

/** Estado de cuenta del cliente, del más viejo al más nuevo, con saldo corrido. */
export function estadoDeCuenta(estado, clienteId) {
  const c = cliente(estado, clienteId);
  if (!c) return { ok: false, motivo: "No encuentro al cliente." };
  return { ok: true, movimientos: c.movCC.slice(), saldo: c.deuda, cc: { ...c.cc }, creditos: c.monedero };
}

/** Recepción pide habilitar la cuenta corriente de un cliente; lo autoriza un dueño (novedad). */
export function solicitarCC(estado, clienteId, { limite, nota = "" }, auth, ahora) {
  const a = autorizar(estado, auth, "solicitarCC", false);
  if (!a.ok) return a;
  const c = cliente(estado, clienteId);
  if (!c) return { ok: false, motivo: "No encuentro al cliente." };
  const L = Math.round(Number(limite));
  if (!(L > 0)) return { ok: false, motivo: "Poné hasta cuánto le fiamos." };
  if (estado.novedades.some((n) => n.estado === "pendiente" && n.clienteId === clienteId)) return { ok: false, motivo: "Ya hay un pedido para este cliente esperando al dueño." };
  const n = { id: nuevoId("n"), tipo: "cc", clienteId, limite: L, nota, pidio: a.usuario.nombre, estado: "pendiente", ...sello(ahora) };
  estado.novedades.push(n);
  registrar(estado, `${a.usuario.nombre} pidió cuenta corriente para ${c.nombre} hasta ${pesos(L)}.`, ahora);
  return { ok: true, novedad: n };
}

export function resolverCC(estado, novedadId, { aprobar, limite }, auth, ahora) {
  const a = autorizar(estado, auth, "autorizarCC", false);
  if (!a.ok) return a;
  const n = estado.novedades.find((x) => x.id === novedadId && x.estado === "pendiente");
  if (!n) return { ok: false, motivo: "Ese pedido ya se resolvió." };
  const c = cliente(estado, n.clienteId);
  if (aprobar) {
    const L = Math.round(Number(limite ?? n.limite));
    if (!(L > 0)) return { ok: false, motivo: "Poné el límite." };
    c.cc = { habilitada: true, limite: L };
    n.estado = "aprobada";
    n.limiteAprobado = L;
  } else {
    n.estado = "rechazada";
  }
  n.resolvio = a.usuario.nombre;
  registrar(estado, `${a.usuario.nombre} ${aprobar ? `habilitó la cuenta corriente de ${c.nombre}` : `rechazó la cuenta corriente de ${c.nombre}`}.`, ahora);
  return { ok: true };
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
  const jugados = estado.reservas.filter((r) => r.clienteId === cl.id && r.estado === "finalizada").length;
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

export function crearReserva(estado, datos, ahora) {
  const {
    canchaId, fecha, inicio, duracion = estado.config.duracionTurno, tipo = "turno", clienteId = null,
    titular, jugadores, origen = "mostrador", notas = "", fijoId = null, precio: precioFijo,
    conSena, plazoSenaMin = 0,
  } = datos;
  const cl = clienteId ? cliente(estado, clienteId) : null;
  const nombre = String(titular ?? cl?.nombre ?? "").trim();
  if (!nombre) return { ok: false, motivo: "¿A nombre de quién va el turno?" };
  if (ahora && minutosHasta(ahora, fecha, inicio) < -estado.config.paso) return { ok: false, motivo: "Ese horario ya pasó." };
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
  const mov = { id: nuevoId("m"), tipo, medio, monto, concepto, reservaId, usuario: quien, ...sello(ahora) };
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
export function registrarPago(estado, reservaId, { medio, monto, jugador = null, concepto }, ahora) {
  const r = reserva(estado, reservaId);
  if (!r) return { ok: false, motivo: "No encuentro el turno." };
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
  if (jugador != null && r.jugadores[jugador]) r.jugadores[jugador].pagado = (r.jugadores[jugador].pagado ?? 0) + importe;
  registrar(estado, `Cobro de cancha ${pesos(importe)} (${MEDIOS[medio]}) — ${r.titular}.`, ahora);
  return { ok: true, saldo: saldo(r) };
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
  registrar(estado, `Se abrió la cuenta de consumo de ${nombre}.`, ahora);
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
  registrar(estado, `Cobro de consumos ${pesos(importe)} (${MEDIOS[medio]}) — ${cta.titular}.`, ahora);
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

/** Cerrar la cuenta de consumo: cobrada, o el saldo a la cuenta corriente del cliente. */
export function cerrarCuenta(estado, cuentaId, { aCuenta = false } = {}, ahora) {
  const cta = cuenta(estado, cuentaId);
  if (!cta || cta.estado !== "abierta") return { ok: false, motivo: "Esa cuenta ya está cerrada." };
  const debe = saldoCuenta(cta);
  if (debe > 0 && !aCuenta) return { ok: false, motivo: `La cuenta de ${cta.titular} debe ${pesos(debe)}: cobrala o sumala a su cuenta corriente.` };
  if (debe > 0) {
    const c = cta.clienteId ? cliente(estado, cta.clienteId) : null;
    const p = puedeACuenta(c, debe);
    if (!p.ok) return p;
    movimientoCC(estado, c, debe, "Consumos del buffet", ahora);
    cta.aCuentaCorriente = debe;
  }
  devolverAlquileresDeCuenta(estado, cta);
  cta.estado = "cerrada";
  cta.cerrada = sello(ahora);
  registrar(estado, `Se cerró la cuenta de consumo de ${cta.titular}${debe > 0 ? ` (${pesos(debe)} a cuenta corriente)` : ""}.`, ahora);
  return { ok: true };
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
    movimientoCC(estado, c, debe, `Cancha ${r.fecha.slice(8)}/${r.fecha.slice(5, 7)} ${hhmm(r.inicio)}`, ahora);
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
export function marcarNoShow(estado, id, { cobrarA = "titular" } = {}, ahora) {
  const r = reserva(estado, id);
  if (!r) return { ok: false, motivo: "No encuentro el turno." };
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
    .sort((a, b) => a.inicio - b.inicio);
  const resultado = [];
  for (const r of afectadas) {
    const destino = cubiertas.find((id) => validarHueco(estado, { canchaId: id, fecha, inicio: r.inicio, duracion: r.duracion }, r.id).ok);
    if (destino) {
      mover(estado, r.id, { canchaId: destino }, ahora);
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

export function resumenCaja(estado, dia) {
  const movs = estado.caja.movimientos.filter((m) => !dia || (m.fecha && diaDeCaja(estado, m.fecha, m.min ?? 0) === dia));
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
export function cerrarCaja(estado, { contado, usuarioId, pin }, ahora) {
  const a = autorizar(estado, { usuarioId, pin }, "cerrarCaja", true);
  if (!a.ok) return a;
  const dia = diaDeCaja(estado, ahora.fecha, ahora.min);
  const r = resumenCaja(estado, dia);
  const n = Math.round(Number(contado));
  if (contado === "" || contado == null || !(n >= 0)) return { ok: false, motivo: "Contá el efectivo del cajón y cargalo." };
  const cierre = { dia, responsable: a.usuario.nombre, ...sello(ahora), esperado: r.efectivoEsperado, contado: n, diferencia: n - r.efectivoEsperado, ingresos: r.ingresos, egresos: r.egresos };
  estado.caja.cierres.push(cierre);
  registrar(estado, `Cierre de caja del ${dia.slice(8)}/${dia.slice(5, 7)} por ${a.usuario.nombre}: diferencia ${pesos(cierre.diferencia)}.`, ahora);
  return { ok: true, cierre };
}

// ───────────────────────── productos, stock y lector ─────────────────────────

export function buscarProductos(estado, texto, { soloVendibles = false } = {}) {
  const q = String(texto ?? "").trim().toLowerCase();
  return estado.productos.filter((p) => p.activo !== false && (!soloVendibles || p.stock == null || p.stock > 0) &&
    (!q || p.nombre.toLowerCase().includes(q) || p.categoria.toLowerCase().includes(q) || String(p.codigo ?? "").includes(q)));
}

/** Lo que devuelve el lector (código de barras o etiqueta RF): el producto, o qué pasó. */
export function productoPorCodigo(estado, codigo) {
  const c = String(codigo ?? "").trim();
  if (!c) return { ok: false, motivo: "No llegó ningún código." };
  const p = estado.productos.find((x) => x.activo !== false && String(x.codigo ?? "") === c);
  return p ? { ok: true, producto: p } : { ok: false, motivo: `El código ${c} no está cargado en ningún producto.` };
}

export function altaProducto(estado, { nombre, categoria, precio, costo = 0, stock = 0, minimo = 0, codigo = "", plato = false }, auth, ahora) {
  const a = autorizar(estado, auth, "stock", false);
  if (!a.ok) return a;
  const limpio = String(nombre ?? "").trim();
  if (!limpio) return { ok: false, motivo: "Falta el nombre del producto." };
  if (!(Number(precio) > 0)) return { ok: false, motivo: "Poné el precio de venta." };
  if (codigo && estado.productos.some((p) => String(p.codigo) === String(codigo))) return { ok: false, motivo: "Ese código ya está en otro producto." };
  const p = { id: nuevoId("p"), nombre: limpio, categoria: String(categoria || (plato ? "Cocina" : "Varios")), precio: Math.round(Number(precio)), costo: Math.round(Number(costo) || 0), stock: plato ? null : Math.round(Number(stock) || 0), minimo: plato ? 0 : Math.round(Number(minimo) || 0), codigo: String(codigo || ""), plato: !!plato, activo: true };
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
  for (const k of ["precio", "costo", "minimo"]) if (cambios[k] != null) p[k] = Math.round(Number(cambios[k]));
  if (cambios.nombre != null && String(cambios.nombre).trim()) p.nombre = String(cambios.nombre).trim();
  if (cambios.codigo != null) {
    if (cambios.codigo && estado.productos.some((x) => x.id !== p.id && String(x.codigo) === String(cambios.codigo))) return { ok: false, motivo: "Ese código ya está en otro producto." };
    p.codigo = String(cambios.codigo);
  }
  registrar(estado, `Se editó el producto ${p.nombre}.`, ahora);
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

// ───────────────────────── plataforma de contenido ─────────────────────────

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
      return `¡Hola ${d.nombre}! Te confirmamos el turno en ${club}: ${d.cancha}, ${d.fecha} a las ${d.hora}.${d.sena ? ` Para dejarlo firme falta la seña de ${d.sena} (transferencia o Mercado Pago).` : ""} ¡Nos vemos en la cancha! 🎾`;
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
  const hoy = estado.reservas.filter((r) => r.fecha === ahora.fecha);
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
    out.push({ nivel: "media", tipo: "autorizacion", novedadId: n.id, paraDuenio: true, texto: `${n.pidio} pide cuenta corriente para ${c?.nombre} hasta ${pesos(n.limite)}.`, accion: "Autorizar o rechazar" });
  }
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
  const dia = ahora ? diaDeCaja(estado, ahora.fecha, ahora.min) : fecha;
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
    minutosAntesParaEntrar: null, // sin límite: se abre la cancha cuando el club quiere
  },
});

export const CANCHAS_DEMO = Object.freeze([
  { id: "c1", nombre: "Cancha 1", cubierta: true, panoramica: true, estado: "ok", camara: "cam-c1" },
  { id: "c2", nombre: "Cancha 2", cubierta: true, panoramica: true, estado: "ok", camara: "cam-c2" },
  { id: "c3", nombre: "Cancha 3", cubierta: true, panoramica: true, estado: "ok", camara: "cam-c3" },
  { id: "c4", nombre: "Cancha 4", cubierta: false, panoramica: true, estado: "ok", camara: "cam-c4" },
]);

/** Usuarios de demo. Los PIN son de ejemplo y se muestran en pantalla a propósito (es una demo). */
export const USUARIOS_DEMO = Object.freeze([
  { id: "u-rober", nombre: "Rober", rol: "duenio", pin: "11", activo: true },
  { id: "u-majo", nombre: "Majo", rol: "duenio", pin: "22", activo: true },
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
  { id: "p1", nombre: "Tubo de pelotas (3)", categoria: "Pelotas", precio: 12000, costo: 7800, stock: 18, minimo: 10, codigo: "7790000000011" },
  { id: "p2", nombre: "Agua 500 ml", categoria: "Bebidas", precio: 2000, costo: 700, stock: 42, minimo: 24, codigo: "7790000000028" },
  { id: "p3", nombre: "Bebida isotónica", categoria: "Bebidas", precio: 3500, costo: 1500, stock: 9, minimo: 12, codigo: "7790000000035" },
  { id: "p9", nombre: "Cerveza lata 473 ml", categoria: "Bebidas", precio: 3800, costo: 1700, stock: 48, minimo: 24, codigo: "7790000000097" },
  { id: "p10", nombre: "Gaseosa 500 ml", categoria: "Bebidas", precio: 2800, costo: 1100, stock: 30, minimo: 18, codigo: "7790000000103" },
  { id: "p4", nombre: "Overgrip", categoria: "Accesorios", precio: 4500, costo: 2100, stock: 30, minimo: 10, codigo: "7790000000042" },
  { id: "p5", nombre: "Muñequera", categoria: "Accesorios", precio: 6000, costo: 2800, stock: 4, minimo: 6, codigo: "7790000000059" },
  { id: "p6", nombre: "Alquiler de pala", categoria: "Alquiler", precio: 5000, costo: 0, stock: 8, minimo: 0, alquiler: true, codigo: "" },
  { id: "p7", nombre: "Pala Break Point (shop)", categoria: "Shop", precio: 185000, costo: 118000, stock: 3, minimo: 2, codigo: "7790000000073" },
  { id: "p8", nombre: "Remera técnica del club", categoria: "Shop", precio: 28000, costo: 13500, stock: 0, minimo: 5, codigo: "7790000000080" },
  // Cocina (Delicias): los platos no llevan stock; se miden por venta.
  { id: "k-mila", nombre: "Milanesa napolitana con papas", categoria: "Cocina", precio: 14500, costo: 6200, stock: null, minimo: 0, plato: true },
  { id: "k-hamb", nombre: "Hamburguesa Break con papas", categoria: "Cocina", precio: 12000, costo: 4800, stock: null, minimo: 0, plato: true },
  { id: "k-tost", nombre: "Tostado jamón y queso", categoria: "Cocina", precio: 6500, costo: 2300, stock: null, minimo: 0, plato: true },
  { id: "k-empa", nombre: "Empanada de carne", categoria: "Cocina", precio: 2200, costo: 800, stock: null, minimo: 0, plato: true },
  { id: "k-cesar", nombre: "Ensalada César", categoria: "Cocina", precio: 9800, costo: 3900, stock: null, minimo: 0, plato: true },
  { id: "k-pica", nombre: "Picada para 4", categoria: "Cocina", precio: 21000, costo: 9500, stock: null, minimo: 0, plato: true },
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
  const dueno = { usuarioId: "u-rober", pin: "11" };
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
  agus.movCC.push({ fecha: sumarDias(hoy, -2), min: H(22, 40), concepto: "Consumos del buffet", importe: 7000, saldo: 21000 });
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
