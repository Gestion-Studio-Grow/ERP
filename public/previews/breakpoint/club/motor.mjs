// MOTOR DEL CLUB — Break Point Pádel (demo del flujo, ADR-028 · demo pública a costo cero).
//
// Reingeniería de la gestión de canchas de los referentes europeos (Playtomic Manager, MATCHi, Syltek,
// Doinsport), adaptada al club argentino: seña por transferencia o Mercado Pago, aviso por WhatsApp,
// lluvia en cancha descubierta, cortes de luz y caja con efectivo. El detalle y el porqué de cada regla
// viven en docs/tenants/breakpoint/REINGENIERIA.md.
//
// Reglas de este archivo:
//   · Puro: no toca el DOM, la red ni el disco. Lo usan el backoffice (index.html) y los tests de Node.
//   · Sin persistencia: el estado vive en memoria (DEMO → VENTA → INVERSIÓN: antes de la venta no se guarda nada).
//   · El tiempo es { fecha: "AAAA-MM-DD", min: minutos desde las 00:00 }. Un turno que cruza la
//     medianoche se modela con `cierre` > 1440 (el club cierra a la 01:00 → 1500).
//   · Toda operación devuelve { ok: true, ... } o { ok: false, motivo } en criollo, nunca tira excepción
//     por una regla de negocio: la recepcionista tiene que leer qué pasó, no un error técnico.

export const MEDIOS = Object.freeze({
  efectivo: "Efectivo",
  mercadopago: "Mercado Pago (QR)",
  transferencia: "Transferencia",
  debito: "Débito / crédito",
  monedero: "Saldo a favor",
});

export const ESTADOS = Object.freeze({
  reservada: "Reservada",
  en_cancha: "En cancha",
  finalizada: "Finalizada",
  cancelada: "Cancelada",
  no_show: "No vino",
  suspendida: "Suspendida",
});

export const TIPOS = Object.freeze({
  turno: "Turno",
  fijo: "Turno fijo",
  clase: "Clase",
  abierto: "Partido abierto",
  torneo: "Torneo",
});

/** Estados que ocupan la cancha (los demás liberan el hueco). */
const OCUPA = new Set(["reservada", "en_cancha", "finalizada"]);

// ───────────────────────── utilidades de tiempo ─────────────────────────

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

export function sumarDias(fecha, dias) {
  const [a, m, d] = fecha.split("-").map(Number);
  const t = new Date(Date.UTC(a, m - 1, d + dias));
  return t.toISOString().slice(0, 10);
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
const nuevoId = (prefijo) => `${prefijo}${(++secuencia).toString(36)}`;

function registrar(estado, texto, ahora) {
  estado.log.unshift({ fecha: ahora?.fecha ?? null, min: ahora?.min ?? null, texto });
  if (estado.log.length > 200) estado.log.length = 200;
}

// ───────────────────────── estado del club ─────────────────────────

export function crearEstado({ config, canchas, clientes = [], productos = [] }) {
  return {
    config: structuredClone(config),
    canchas: structuredClone(canchas),
    clientes: structuredClone(clientes),
    productos: structuredClone(productos),
    reservas: [],
    fijos: [],
    bloqueos: [],
    espera: [],
    caja: { abierta: true, responsable: "Recepción", fondo: 0, movimientos: [], cierres: [] },
    luces: Object.fromEntries(canchas.map((c) => [c.id, false])),
    clima: { lluvia: null }, // { fecha, desde, hasta } cuando hay alerta de lluvia
    avisos: [],
    log: [],
  };
}

export const cancha = (estado, id) => estado.canchas.find((c) => c.id === id);
export const cliente = (estado, id) => estado.clientes.find((c) => c.id === id);
export const reserva = (estado, id) => estado.reservas.find((r) => r.id === id);
export const producto = (estado, id) => estado.productos.find((p) => p.id === id);

export function buscarClientes(estado, texto) {
  const q = texto.trim().toLowerCase();
  if (!q) return [];
  return estado.clientes.filter((c) => c.nombre.toLowerCase().includes(q) || c.tel.replace(/\D/g, "").includes(q.replace(/\D/g, "") || "§"));
}

export function altaCliente(estado, { nombre, tel = "", socio = false }) {
  const limpio = nombre.trim();
  if (!limpio) return { ok: false, motivo: "Falta el nombre del cliente." };
  const c = { id: nuevoId("cl"), nombre: limpio, tel, socio, strikes: 0, monedero: 0, deuda: 0, nivel: "" };
  estado.clientes.push(c);
  return { ok: true, cliente: c };
}

// ───────────────────────── tarifas ─────────────────────────

/**
 * Precio de un turno: se integra minuto a minuto contra las franjas (un turno de 17:00 a 18:30 cobra
 * 30 min de valle y 60 de pico, como hace la grilla de precios dinámicos de los sistemas europeos).
 * Fines de semana y feriados son todo pico. Socio: descuento. Redondeo a $100 (nadie da vuelto de $37).
 */
export function precioTurno(estado, { fecha, inicio, duracion, canchaId }, clienteId) {
  const { tarifas, descuentoSocioPct, feriados = [] } = estado.config;
  const findeOFeriado = [0, 6].includes(diaSemana(fecha)) || feriados.includes(fecha);
  const pico = tarifas.find((t) => t.pico) ?? tarifas[tarifas.length - 1];
  const c = cancha(estado, canchaId);
  let total = 0;
  for (let m = inicio; m < inicio + duracion; m++) {
    const franja = findeOFeriado ? pico : tarifas.find((t) => m >= t.desde && m < t.hasta) ?? pico;
    total += franja.precioHora / 60;
  }
  if (c?.recargoPct) total *= 1 + c.recargoPct / 100;
  const cl = clienteId ? cliente(estado, clienteId) : null;
  if (cl?.socio) total *= 1 - descuentoSocioPct / 100;
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
  const reservas = estado.reservas.filter(
    (r) => r.fecha === fecha && r.canchaId === canchaId && r.id !== ignorarId && OCUPA.has(r.estado),
  );
  const bloqueos = estado.bloqueos.filter((b) => b.fecha === fecha && (b.canchaId === canchaId || b.canchaId === "*"));
  return { reservas, bloqueos };
}

/** ¿Se puede ocupar este hueco? Devuelve el primer motivo en criollo si no. */
export function validarHueco(estado, { canchaId, fecha, inicio, duracion }, ignorarId) {
  const { apertura, cierre, paso } = estado.config;
  const c = cancha(estado, canchaId);
  if (!c) return { ok: false, motivo: "Esa cancha no existe." };
  if (c.estado === "mantenimiento") return { ok: false, motivo: `${c.nombre} está en mantenimiento.` };
  if (!(duracion > 0)) return { ok: false, motivo: "La duración tiene que ser mayor a cero." };
  if (inicio < apertura || inicio + duracion > cierre)
    return { ok: false, motivo: `El club abre de ${hhmm(apertura)} a ${hhmm(cierre)}.` };
  if (inicio % paso !== 0) return { ok: false, motivo: `Los turnos arrancan cada ${paso} minutos.` };
  const { reservas, bloqueos } = ocupantes(estado, fecha, canchaId, ignorarId);
  const choque = reservas.find((r) => solapa(inicio, inicio + duracion, r.inicio, r.inicio + r.duracion));
  if (choque) return { ok: false, motivo: `Se pisa con ${choque.titular} (${hhmm(choque.inicio)}–${hhmm(choque.inicio + choque.duracion)}).` };
  const bloqueo = bloqueos.find((b) => solapa(inicio, inicio + duracion, b.desde, b.hasta));
  if (bloqueo) return { ok: false, motivo: `${c.nombre} está bloqueada: ${bloqueo.motivo}.` };
  return { ok: true };
}

/** Huecos libres de una cancha para una duración, alineados a la grilla. */
export function huecosLibres(estado, fecha, canchaId, duracion, desde = estado.config.apertura) {
  const out = [];
  const { paso, cierre } = estado.config;
  const inicio0 = Math.ceil(desde / paso) * paso;
  for (let m = inicio0; m + duracion <= cierre; m += paso) {
    if (validarHueco(estado, { canchaId, fecha, inicio: m, duracion }).ok) out.push(m);
  }
  return out;
}

// ───────────────────────── reservas ─────────────────────────

/** ¿Este cliente tiene que dejar seña? Política: reincidentes de no-show, partidos abiertos y torneos. */
export function requiereSena(estado, clienteId, tipo) {
  const { politica } = estado.config;
  if (tipo === "clase" || tipo === "fijo") return false;
  const cl = clienteId ? cliente(estado, clienteId) : null;
  if (!cl) return politica.senaSinCliente;
  if (cl.strikes >= politica.strikesParaSena) return true;
  if (cl.deuda > 0) return true;
  return politica.senaSiempre;
}

export function crearReserva(estado, datos, ahora) {
  const {
    canchaId, fecha, inicio, duracion = estado.config.duracionTurno, tipo = "turno", clienteId = null,
    titular, jugadores, origen = "mostrador", notas = "", fijoId = null, precio: precioFijo,
  } = datos;
  const cl = clienteId ? cliente(estado, clienteId) : null;
  const nombre = (titular ?? cl?.nombre ?? "").trim();
  if (!nombre) return { ok: false, motivo: "¿A nombre de quién va el turno?" };
  if (ahora && minutosHasta(ahora, fecha, inicio) < -estado.config.paso)
    return { ok: false, motivo: "Ese horario ya pasó." };
  const v = validarHueco(estado, { canchaId, fecha, inicio, duracion });
  if (!v.ok) return v;

  const precio = precioFijo ?? precioTurno(estado, { fecha, inicio, duracion, canchaId }, clienteId);
  const senaMonto = requiereSena(estado, clienteId, tipo) ? redondear100((precio * estado.config.politica.senaPct) / 100) : 0;
  const r = {
    id: nuevoId("r"),
    canchaId, fecha, inicio, duracion, tipo, clienteId, titular: nombre, origen, notas, fijoId,
    jugadores: (jugadores?.length ? jugadores : [nombre]).slice(0, 4).map((j) => (typeof j === "string" ? { nombre: j } : j)),
    precio,
    sena: { monto: senaMonto, pagada: false },
    consumos: [],
    pagos: [],
    estado: "reservada",
    checkIn: null,
    creada: ahora ? { ...ahora } : null,
    senaEnSuspenso: false,
  };
  estado.reservas.push(r);

  // Seña protegida por relleno: si este turno ocupa el hueco de una cancelación tardía, la seña retenida
  // de aquel cliente vuelve como saldo a favor (el club no perdió nada, el cliente no pierde nada).
  const liberadas = liberarSenasPorRelleno(estado, r, ahora);
  registrar(estado, `Turno ${hhmm(inicio)} en ${cancha(estado, canchaId).nombre} para ${nombre}.`, ahora);
  return { ok: true, reserva: r, liberadas };
}

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
        registrar(estado, `Se rellenó el hueco de ${cl.nombre}: ${pesos(retenida)} vuelven a su saldo a favor.`, ahora);
      }
    }
  }
  return out;
}

// ───────────────────────── plata de la reserva ─────────────────────────

export const totalConsumos = (r) => r.consumos.reduce((s, c) => s + c.cant * c.precioUnit, 0);
export const cobrado = (r) => r.pagos.reduce((s, p) => s + p.monto, 0);
export const totalReserva = (r) => r.precio + totalConsumos(r);
export const saldo = (r) => totalReserva(r) - cobrado(r);

/** Divide el total entre los jugadores en partes que suman exacto (el resto va a los primeros). */
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

function movimientoCaja(estado, { tipo, medio, monto, concepto, reservaId = null }, ahora) {
  const mov = { id: nuevoId("m"), tipo, medio, monto, concepto, reservaId, fecha: ahora?.fecha ?? null, min: ahora?.min ?? null };
  estado.caja.movimientos.push(mov);
  return mov;
}

export function registrarPago(estado, reservaId, { medio, monto, jugador = null, concepto }, ahora) {
  const r = reserva(estado, reservaId);
  if (!r) return { ok: false, motivo: "No encuentro el turno." };
  if (!MEDIOS[medio]) return { ok: false, motivo: "Elegí cómo paga." };
  const importe = Math.round(Number(monto));
  if (!(importe > 0)) return { ok: false, motivo: "El monto tiene que ser mayor a cero." };
  if (importe > saldo(r)) return { ok: false, motivo: `Está cobrando de más: el saldo es ${pesos(saldo(r))}.` };
  if (medio === "monedero") {
    const cl = r.clienteId ? cliente(estado, r.clienteId) : null;
    if (!cl || cl.monedero < importe) return { ok: false, motivo: "No le alcanza el saldo a favor." };
    cl.monedero -= importe;
  }
  const esSena = !r.sena.pagada && r.sena.monto > 0 && r.estado === "reservada";
  r.pagos.push({ medio, monto: importe, jugador, fecha: ahora?.fecha ?? null, min: ahora?.min ?? null });
  if (esSena && cobrado(r) >= r.sena.monto) r.sena.pagada = true;
  if (medio !== "monedero") {
    movimientoCaja(estado, { tipo: "ingreso", medio, monto: importe, concepto: concepto ?? `${esSena ? "Seña" : "Turno"} ${r.titular}`, reservaId }, ahora);
  }
  if (jugador != null && r.jugadores[jugador]) r.jugadores[jugador].pagado = (r.jugadores[jugador].pagado ?? 0) + importe;
  registrar(estado, `Cobro ${pesos(importe)} (${MEDIOS[medio]}) — ${r.titular}.`, ahora);
  return { ok: true, saldo: saldo(r) };
}

export function agregarConsumo(estado, reservaId, productoId, cant = 1, ahora) {
  const p = producto(estado, productoId);
  if (!p) return { ok: false, motivo: "No encuentro el producto." };
  if (p.stock < cant) return { ok: false, motivo: `No queda stock de ${p.nombre}.` };
  const r = reservaId ? reserva(estado, reservaId) : null;
  if (reservaId && !r) return { ok: false, motivo: "No encuentro el turno." };
  p.stock -= cant;
  if (p.alquiler) p.prestados = (p.prestados ?? 0) + cant;
  if (r) {
    const ya = r.consumos.find((c) => c.productoId === productoId);
    if (ya) ya.cant += cant;
    else r.consumos.push({ productoId, nombre: p.nombre, cant, precioUnit: p.precio, alquiler: !!p.alquiler });
  }
  registrar(estado, `${cant} × ${p.nombre}${r ? ` a la cuenta de ${r.titular}` : ""}.`, ahora);
  return { ok: true };
}

/** Venta de mostrador sin turno (agua, grip, pelotas): baja stock y entra a caja en el acto. */
export function ventaMostrador(estado, items, medio, ahora) {
  if (!items.length) return { ok: false, motivo: "No hay nada cargado." };
  for (const { productoId, cant } of items) {
    const p = producto(estado, productoId);
    if (!p || p.stock < cant) return { ok: false, motivo: `No alcanza el stock de ${p?.nombre ?? "un producto"}.` };
    if (p.alquiler) return { ok: false, motivo: `${p.nombre} es de alquiler: va a la cuenta de un turno.` };
  }
  let total = 0;
  for (const { productoId, cant } of items) {
    const p = producto(estado, productoId);
    p.stock -= cant;
    total += p.precio * cant;
  }
  movimientoCaja(estado, { tipo: "ingreso", medio, monto: total, concepto: "Venta de mostrador" }, ahora);
  registrar(estado, `Venta de mostrador ${pesos(total)} (${MEDIOS[medio]}).`, ahora);
  return { ok: true, total };
}

// ───────────────────────── ciclo del turno ─────────────────────────

export function checkIn(estado, id, ahora) {
  const r = reserva(estado, id);
  if (!r) return { ok: false, motivo: "No encuentro el turno." };
  if (r.estado !== "reservada") return { ok: false, motivo: `El turno está ${ESTADOS[r.estado].toLowerCase()}.` };
  if (r.sena.monto > 0 && !r.sena.pagada) return { ok: false, motivo: "Falta la seña: cobrala antes de dar la cancha." };
  r.estado = "en_cancha";
  r.checkIn = ahora ? { ...ahora } : null;
  estado.luces[r.canchaId] = true;
  registrar(estado, `${r.titular} entró a ${cancha(estado, r.canchaId).nombre}.`, ahora);
  return { ok: true };
}

/**
 * Cerrar el turno. Si queda saldo, la recepcionista elige: cobrar ahora o dejarlo en la cuenta del
 * cliente (deuda visible, que dispara seña obligatoria la próxima vez). Lo alquilado vuelve al stock.
 */
export function finalizar(estado, id, { dejarDeuda = false } = {}, ahora) {
  const r = reserva(estado, id);
  if (!r) return { ok: false, motivo: "No encuentro el turno." };
  if (!["reservada", "en_cancha"].includes(r.estado)) return { ok: false, motivo: "Ese turno ya está cerrado." };
  const debe = saldo(r);
  if (debe > 0 && !dejarDeuda) return { ok: false, motivo: `Quedan ${pesos(debe)} sin cobrar.`, saldo: debe };
  if (debe > 0) {
    const cl = r.clienteId ? cliente(estado, r.clienteId) : null;
    if (!cl) return { ok: false, motivo: "Sin cliente cargado no se puede dejar a cuenta." };
    cl.deuda += debe;
    r.deudaDejada = debe;
  }
  devolverAlquileres(estado, r);
  r.estado = "finalizada";
  estado.luces[r.canchaId] = false;
  registrar(estado, `Cerró el turno de ${r.titular}${debe > 0 ? ` con ${pesos(debe)} a cuenta` : ""}.`, ahora);
  return { ok: true };
}

function devolverAlquileres(estado, r) {
  for (const c of r.consumos) {
    if (!c.alquiler) continue;
    const p = producto(estado, c.productoId);
    if (!p) continue;
    p.stock += c.cant;
    p.prestados = Math.max(0, (p.prestados ?? 0) - c.cant);
  }
}

export function marcarNoShow(estado, id, ahora) {
  const r = reserva(estado, id);
  if (!r) return { ok: false, motivo: "No encuentro el turno." };
  if (r.estado !== "reservada") return { ok: false, motivo: "Sólo un turno reservado puede quedar como 'no vino'." };
  r.estado = "no_show";
  const cl = r.clienteId ? cliente(estado, r.clienteId) : null;
  if (cl) cl.strikes += 1;
  registrar(estado, `${r.titular} no vino. ${cl ? `Lleva ${cl.strikes} falta(s).` : ""}`, ahora);
  return { ok: true, ofertas: ofertasEspera(estado, r.fecha, r.canchaId, r.inicio, r.duracion) };
}

/**
 * Cancelación con la política del club:
 *  · Con más de `horasCancelacionLibre` de aviso, o si cancela el club → lo pagado vuelve como saldo a favor.
 *  · Con menos aviso → la seña queda RETENIDA EN SUSPENSO: si el hueco se vuelve a vender (lista de espera,
 *    mostrador, WhatsApp), se libera sola al saldo del cliente. Si no se vende, el club la conserva.
 */
export function cancelar(estado, id, { porClub = false, motivo = "" } = {}, ahora) {
  const r = reserva(estado, id);
  if (!r) return { ok: false, motivo: "No encuentro el turno." };
  if (r.estado !== "reservada") return { ok: false, motivo: "Sólo se cancela un turno que todavía no empezó." };
  const horas = ahora ? minutosHasta(ahora, r.fecha, r.inicio) / 60 : Infinity;
  const aTiempo = porClub || horas >= estado.config.politica.horasCancelacionLibre;
  const pagado = cobrado(r);
  const cl = r.clienteId ? cliente(estado, r.clienteId) : null;
  r.estado = "cancelada";
  r.motivoCancelacion = motivo || (porClub ? "Cancela el club" : "Cancela el cliente");
  let devuelto = 0;
  if (pagado > 0 && aTiempo && cl) {
    cl.monedero += pagado;
    devuelto = pagado;
  } else if (pagado > 0 && !aTiempo) {
    r.senaEnSuspenso = true;
  }
  registrar(estado, `Canceló ${r.titular} (${hhmm(r.inicio)}). ${devuelto ? `${pesos(devuelto)} a saldo a favor.` : r.senaEnSuspenso ? "Seña en suspenso hasta que se vuelva a vender el hueco." : ""}`, ahora);
  return { ok: true, aTiempo, devuelto, enSuspenso: r.senaEnSuspenso, ofertas: ofertasEspera(estado, r.fecha, r.canchaId, r.inicio, r.duracion) };
}

/** Pasar el turno a otra cancha (o a otro horario) sin perder pagos ni consumos. */
export function mover(estado, id, { canchaId, inicio }, ahora) {
  const r = reserva(estado, id);
  if (!r) return { ok: false, motivo: "No encuentro el turno." };
  if (!["reservada", "en_cancha"].includes(r.estado)) return { ok: false, motivo: "Ese turno ya está cerrado." };
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

/** Extender el turno si el hueco siguiente está libre; suma la diferencia de precio. */
export function extender(estado, id, minutos, ahora) {
  const r = reserva(estado, id);
  if (!r) return { ok: false, motivo: "No encuentro el turno." };
  if (!["reservada", "en_cancha"].includes(r.estado)) return { ok: false, motivo: "Ese turno ya está cerrado." };
  const v = validarHueco(estado, { canchaId: r.canchaId, fecha: r.fecha, inicio: r.inicio + r.duracion, duracion: minutos });
  if (!v.ok) return { ok: false, motivo: `No se puede extender: ${v.motivo}` };
  const extra = precioTurno(estado, { fecha: r.fecha, inicio: r.inicio + r.duracion, duracion: minutos, canchaId: r.canchaId }, r.clienteId);
  r.duracion += minutos;
  r.precio += extra;
  registrar(estado, `${r.titular} extendió ${minutos} min (+${pesos(extra)}).`, ahora);
  return { ok: true, extra };
}

/**
 * Interrupción (corte de luz, lesión, cancha que se moja): se acredita en saldo a favor la parte
 * proporcional del tiempo no jugado. Es la eventualidad que ningún sistema europeo resuelve porque allá
 * no se corta la luz; acá pasa.
 */
export function interrumpir(estado, id, motivo, ahora) {
  const r = reserva(estado, id);
  if (!r) return { ok: false, motivo: "No encuentro el turno." };
  if (r.estado !== "en_cancha") return { ok: false, motivo: "Sólo se interrumpe un turno que está en cancha." };
  const jugados = Math.max(0, Math.min(r.duracion, minutosHasta({ fecha: r.fecha, min: r.inicio }, ahora.fecha, ahora.min)));
  const noJugados = r.duracion - jugados;
  const credito = redondear100((r.precio * noJugados) / r.duracion);
  const cl = r.clienteId ? cliente(estado, r.clienteId) : null;
  const pagado = cobrado(r);
  // Lo que se le reconoce: baja el precio; si ya había pagado de más, el excedente va a su saldo.
  r.precio -= credito;
  const excedente = Math.max(0, pagado - totalReserva(r));
  if (excedente > 0 && cl) cl.monedero += excedente;
  r.notas = `${r.notas ? r.notas + " · " : ""}Interrumpido: ${motivo} (${noJugados} min sin jugar)`;
  r.duracion = jugados;
  registrar(estado, `Interrupción en ${cancha(estado, r.canchaId).nombre} (${motivo}): ${pesos(credito)} reconocidos a ${r.titular}.`, ahora);
  return { ok: true, credito, noJugados };
}

// ───────────────────────── lluvia (canchas descubiertas) ─────────────────────────

/**
 * Plan lluvia: para cada turno en cancha descubierta dentro de la ventana, primero intenta pasarlo a una
 * cubierta libre en el mismo horario; si no hay, lo suspende y devuelve lo pagado a saldo a favor.
 * Devuelve el detalle para avisar a cada titular por WhatsApp.
 */
export function planLluvia(estado, fecha, desde, hasta, ahora) {
  const descubiertas = estado.canchas.filter((c) => !c.cubierta).map((c) => c.id);
  const cubiertas = estado.canchas.filter((c) => c.cubierta && c.estado !== "mantenimiento").map((c) => c.id);
  const afectadas = estado.reservas.filter(
    (r) => r.fecha === fecha && descubiertas.includes(r.canchaId) && ["reservada", "en_cancha"].includes(r.estado) && solapa(r.inicio, r.inicio + r.duracion, desde, hasta),
  ).sort((a, b) => a.inicio - b.inicio);
  const resultado = [];
  for (const r of afectadas) {
    const destino = cubiertas.find((id) => validarHueco(estado, { canchaId: id, fecha, inicio: r.inicio, duracion: r.duracion }, r.id).ok);
    if (destino) {
      mover(estado, r.id, { canchaId: destino }, ahora);
      resultado.push({ reservaId: r.id, titular: r.titular, accion: "movido", cancha: cancha(estado, destino).nombre });
    } else {
      const pagado = cobrado(r);
      const cl = r.clienteId ? cliente(estado, r.clienteId) : null;
      if (pagado > 0 && cl) cl.monedero += pagado;
      if (r.estado === "en_cancha") estado.luces[r.canchaId] = false;
      r.estado = "suspendida";
      r.motivoCancelacion = "Lluvia";
      resultado.push({ reservaId: r.id, titular: r.titular, accion: "suspendido", credito: pagado });
    }
  }
  estado.clima.lluvia = { fecha, desde, hasta };
  registrar(estado, `Plan lluvia ${hhmm(desde)}–${hhmm(hasta)}: ${resultado.length} turno(s) resueltos.`, ahora);
  return { ok: true, resultado };
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

/** Quiénes de la lista de espera aceptarían este hueco, por orden de llegada. */
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

// ───────────────────────── bloqueos ─────────────────────────

export function bloquear(estado, { canchaId, fecha, desde, hasta, motivo }, ahora) {
  const choques = estado.reservas.filter((r) => r.fecha === fecha && (canchaId === "*" || r.canchaId === canchaId) && ["reservada", "en_cancha"].includes(r.estado) && solapa(r.inicio, r.inicio + r.duracion, desde, hasta));
  if (choques.length) return { ok: false, motivo: `Hay ${choques.length} turno(s) en ese rango: movelos primero.`, choques };
  const b = { id: nuevoId("b"), canchaId, fecha, desde, hasta, motivo };
  estado.bloqueos.push(b);
  registrar(estado, `Bloqueo ${canchaId === "*" ? "de todo el club" : cancha(estado, canchaId).nombre} ${hhmm(desde)}–${hhmm(hasta)}: ${motivo}.`, ahora);
  return { ok: true, bloqueo: b };
}

// ───────────────────────── caja ─────────────────────────

export function egresoCaja(estado, { medio = "efectivo", monto, concepto }, ahora) {
  const importe = Math.round(Number(monto));
  if (!(importe > 0)) return { ok: false, motivo: "El monto tiene que ser mayor a cero." };
  if (!concepto?.trim()) return { ok: false, motivo: "Poné en qué se gastó." };
  movimientoCaja(estado, { tipo: "egreso", medio, monto: importe, concepto: concepto.trim() }, ahora);
  return { ok: true };
}

export function resumenCaja(estado, fecha) {
  const movs = estado.caja.movimientos.filter((m) => !fecha || m.fecha === fecha);
  const porMedio = Object.fromEntries(Object.keys(MEDIOS).filter((k) => k !== "monedero").map((k) => [k, 0]));
  let ingresos = 0, egresos = 0;
  for (const m of movs) {
    const signo = m.tipo === "ingreso" ? 1 : -1;
    porMedio[m.medio] = (porMedio[m.medio] ?? 0) + signo * m.monto;
    if (m.tipo === "ingreso") ingresos += m.monto; else egresos += m.monto;
  }
  const efectivoEsperado = estado.caja.fondo + porMedio.efectivo;
  return { porMedio, ingresos, egresos, neto: ingresos - egresos, efectivoEsperado, movimientos: movs.length };
}

/** Arqueo del turno de la recepcionista: lo contado contra lo esperado, con diferencia explícita. */
export function cerrarCaja(estado, { contado, responsable }, ahora) {
  const r = resumenCaja(estado, ahora?.fecha);
  const n = Math.round(Number(contado));
  if (!(n >= 0)) return { ok: false, motivo: "Contá el efectivo del cajón y cargalo." };
  const cierre = { responsable: responsable ?? estado.caja.responsable, fecha: ahora?.fecha, min: ahora?.min, esperado: r.efectivoEsperado, contado: n, diferencia: n - r.efectivoEsperado, ingresos: r.ingresos };
  estado.caja.cierres.push(cierre);
  registrar(estado, `Cierre de caja de ${cierre.responsable}: diferencia ${pesos(cierre.diferencia)}.`, ahora);
  return { ok: true, cierre };
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
        ? `¡Hola ${d.nombre}! Por la lluvia suspendimos tu turno de las ${d.hora}. Te dejamos ${d.credito} de saldo a favor para cuando quieras volver. ¡Disculpá!`
        : `¡Hola ${d.nombre}! Por la lluvia suspendimos tu turno de las ${d.hora}. No se te cobra nada; avisanos y te lo reprogramamos sin cargo. ¡Disculpá!`;
    case "deuda":
      return `¡Hola ${d.nombre}! Te quedó un saldo de ${d.monto} del último turno. Lo podés pasar por transferencia o Mercado Pago cuando puedas. ¡Gracias!`;
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

// ───────────────────────── eventualidades (la bandeja de la recepcionista) ─────────────────────────

/**
 * Lo que la recepcionista tiene que resolver AHORA, ordenado por urgencia. Es el corazón del backoffice:
 * en vez de que ella descubra el problema mirando la grilla, la grilla le avisa.
 */
export function alertas(estado, ahora) {
  const out = [];
  const { politica } = estado.config;
  const hoy = estado.reservas.filter((r) => r.fecha === ahora.fecha);
  for (const r of hoy) {
    const falta = minutosHasta(ahora, r.fecha, r.inicio);
    const fin = falta + r.duracion;
    const nombreCancha = cancha(estado, r.canchaId)?.nombre ?? "";
    if (r.estado === "reservada" && r.sena.monto > 0 && !r.sena.pagada && falta > 0 && falta <= politica.minutosAvisoSena)
      out.push({ nivel: "alta", tipo: "sena", reservaId: r.id, texto: `${r.titular} (${hhmm(r.inicio)}, ${nombreCancha}) no pagó la seña.`, accion: "Pedir seña o liberar" });
    if (r.estado === "reservada" && falta < 0 && -falta >= politica.toleranciaMin && fin > 0)
      out.push({ nivel: "alta", tipo: "no_show", reservaId: r.id, texto: `${r.titular} no llegó: van ${-falta} min del turno de las ${hhmm(r.inicio)} (${nombreCancha}).`, accion: "Llamar o marcar 'no vino'" });
    if (r.estado === "reservada" && falta > 0 && falta <= 15)
      out.push({ nivel: "info", tipo: "llega", reservaId: r.id, texto: `${r.titular} entra en ${falta} min a ${nombreCancha}.`, accion: "Recibir" });
    if (r.estado === "en_cancha" && fin <= 0)
      out.push({ nivel: saldo(r) > 0 ? "alta" : "media", tipo: "cerrar", reservaId: r.id, texto: saldo(r) > 0 ? `${r.titular} terminó y debe ${pesos(saldo(r))}.` : `${r.titular} terminó: cerrá el turno y apagá la luz.`, accion: saldo(r) > 0 ? "Cobrar antes de que se vayan" : "Cerrar turno" });
    if (r.estado === "en_cancha" && fin > 0 && fin <= 10)
      out.push({ nivel: "info", tipo: "termina", reservaId: r.id, texto: `${r.titular} termina en ${fin} min (${nombreCancha}).${saldo(r) > 0 ? ` Saldo: ${pesos(saldo(r))}.` : ""}`, accion: "Ofrecer extender" });
  }
  // Luz encendida sin nadie jugando: plata que se va por el medidor.
  for (const c of estado.canchas) {
    if (!estado.luces[c.id]) continue;
    const jugando = hoy.some((r) => r.canchaId === c.id && r.estado === "en_cancha");
    if (!jugando) out.push({ nivel: "media", tipo: "luz", canchaId: c.id, texto: `Luz prendida en ${c.nombre} sin turno en juego.`, accion: "Apagar" });
  }
  // Cancha en mantenimiento con turnos por delante.
  for (const c of estado.canchas.filter((x) => x.estado === "mantenimiento")) {
    const n = hoy.filter((r) => r.canchaId === c.id && r.estado === "reservada" && minutosHasta(ahora, r.fecha, r.inicio) > 0).length;
    if (n) out.push({ nivel: "alta", tipo: "mantenimiento", canchaId: c.id, texto: `${c.nombre} está en mantenimiento y tiene ${n} turno(s) por delante.`, accion: "Reubicar" });
  }
  // Lluvia anunciada sobre canchas descubiertas.
  const lluvia = estado.clima.pronostico;
  if (lluvia && lluvia.fecha === ahora.fecha && !estado.clima.lluvia) {
    const descubiertas = new Set(estado.canchas.filter((c) => !c.cubierta).map((c) => c.id));
    const n = hoy.filter((r) => descubiertas.has(r.canchaId) && ["reservada", "en_cancha"].includes(r.estado) && solapa(r.inicio, r.inicio + r.duracion, lluvia.desde, lluvia.hasta)).length;
    if (n) out.push({ nivel: "alta", tipo: "lluvia", texto: `Anuncian lluvia ${hhmm(lluvia.desde)}–${hhmm(lluvia.hasta)}: ${n} turno(s) en cancha descubierta.`, accion: "Activar plan lluvia" });
  }
  // Huecos que la lista de espera compraría.
  for (const e of estado.espera.filter((x) => x.fecha === ahora.fecha)) {
    for (const c of estado.canchas) {
      const libres = huecosLibres(estado, e.fecha, c.id, e.duracion, Math.max(e.desde, ahora.min)).filter((m) => m <= e.hasta);
      if (libres.length && (!e.soloCubierta || c.cubierta)) {
        out.push({ nivel: "media", tipo: "espera", esperaId: e.id, canchaId: c.id, inicio: libres[0], texto: `Hay lugar para ${e.titular} (lista de espera): ${c.nombre} ${hhmm(libres[0])}.`, accion: "Ofrecer por WhatsApp" });
        break;
      }
    }
  }
  // Stock bajo el mínimo.
  for (const p of estado.productos) {
    if (!p.alquiler && p.stock <= p.minimo)
      out.push({ nivel: p.stock === 0 ? "alta" : "media", tipo: "stock", productoId: p.id, texto: `${p.nombre}: quedan ${p.stock} (mínimo ${p.minimo}).`, accion: "Pedir reposición" });
  }
  const peso = { alta: 0, media: 1, info: 2 };
  return out.sort((a, b) => peso[a.nivel] - peso[b.nivel]);
}

// ───────────────────────── tablero del dueño ─────────────────────────

export function kpis(estado, fecha, ahora) {
  const { apertura, cierre } = estado.config;
  const canchasActivas = estado.canchas.filter((c) => c.estado !== "mantenimiento");
  const delDia = estado.reservas.filter((r) => r.fecha === fecha);
  const ocupan = delDia.filter((r) => OCUPA.has(r.estado));
  const minutosDisponibles = canchasActivas.length * (cierre - apertura);
  const minutosOcupados = ocupan.reduce((s, r) => s + r.duracion, 0);
  const porFranja = { valle: { ocupado: 0, total: 0 }, pico: { ocupado: 0, total: 0 } };
  for (let m = apertura; m < cierre; m += 30) {
    const f = franjaDe(estado, fecha, m);
    porFranja[f].total += canchasActivas.length * 30;
    for (const r of ocupan) if (m >= r.inicio && m < r.inicio + r.duracion) porFranja[f].ocupado += 30;
  }
  const facturado = ocupan.reduce((s, r) => s + totalReserva(r), 0);
  const cobradoTotal = delDia.reduce((s, r) => s + cobrado(r), 0);
  const noShows = delDia.filter((r) => r.estado === "no_show").length;
  const caja = resumenCaja(estado, fecha);
  const stockValorizado = estado.productos.reduce((s, p) => s + p.costo * (p.stock + (p.prestados ?? 0)), 0);
  const consumos = ocupan.reduce((s, r) => s + totalConsumos(r), 0);
  const proximoLibre = ahora && fecha === ahora.fecha
    ? canchasActivas.map((c) => ({ cancha: c.nombre, min: huecosLibres(estado, fecha, c.id, estado.config.duracionTurno, ahora.min)[0] })).filter((x) => x.min != null).sort((a, b) => a.min - b.min)[0] ?? null
    : null;
  return {
    ocupacion: minutosDisponibles ? minutosOcupados / minutosDisponibles : 0,
    ocupacionValle: porFranja.valle.total ? porFranja.valle.ocupado / porFranja.valle.total : 0,
    ocupacionPico: porFranja.pico.total ? porFranja.pico.ocupado / porFranja.pico.total : 0,
    turnos: ocupan.length,
    facturado,
    cobrado: cobradoTotal,
    pendiente: Math.max(0, facturado - cobradoTotal),
    ticketPromedio: ocupan.length ? Math.round(facturado / ocupan.length) : 0,
    consumos,
    noShows,
    cancelados: delDia.filter((r) => r.estado === "cancelada").length,
    caja,
    stockValorizado,
    proximoLibre,
    deudaClientes: estado.clientes.reduce((s, c) => s + c.deuda, 0),
    saldoAFavor: estado.clientes.reduce((s, c) => s + c.monedero, 0),
  };
}

/** Matriz de ocupación día × hora (0..1) para el mapa de calor del dueño. */
export function mapaDeCalor(estado, fechas) {
  const { apertura, cierre } = estado.config;
  const horas = [];
  for (let h = apertura; h < cierre; h += 60) horas.push(h);
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

// ───────────────────────── datos de demo ─────────────────────────

/** Configuración de ejemplo (precios y horarios provisionales a confirmar con el club). */
export const CONFIG_DEMO = Object.freeze({
  nombre: "Break Point Pádel",
  apertura: 8 * 60,
  cierre: 25 * 60, // 01:00
  paso: 30,
  duracionTurno: 90,
  descuentoSocioPct: 15,
  feriados: [],
  tarifas: [
    { nombre: "Valle", desde: 8 * 60, hasta: 17 * 60, precioHora: 20000 },
    { nombre: "Pico", desde: 17 * 60, hasta: 25 * 60, precioHora: 28000, pico: true },
  ],
  politica: {
    horasCancelacionLibre: 12,
    senaPct: 50,
    senaSiempre: false,
    senaSinCliente: true,
    strikesParaSena: 2,
    toleranciaMin: 15,
    minutosAvisoSena: 180,
  },
});

export const CANCHAS_DEMO = Object.freeze([
  { id: "c1", nombre: "Cancha 1", cubierta: true, panoramica: true, estado: "ok", camara: "cam-c1" },
  { id: "c2", nombre: "Cancha 2", cubierta: true, panoramica: true, estado: "ok", camara: "cam-c2" },
  { id: "c3", nombre: "Cancha 3", cubierta: true, panoramica: true, estado: "ok", camara: "cam-c3" },
  { id: "c4", nombre: "Cancha 4", cubierta: false, panoramica: true, estado: "ok", camara: "cam-c4" },
]);

const NOMBRES = [
  "Lucas Fernández", "Sofía Gómez", "Martín Ríos", "Valentina Paz", "Nicolás Herrera", "Camila Sosa",
  "Federico Luna", "Julieta Acosta", "Tomás Medina", "Agustina Romero", "Matías Benítez", "Florencia Díaz",
  "Gonzalo Vera", "Micaela Ortiz", "Diego Castro", "Carolina Molina", "Pablo Suárez", "Lucía Torres",
  "Ezequiel Rojas", "Daniela Navarro", "Santiago Aguirre", "Rocío Giménez", "Facundo Ledesma", "Paula Ibáñez",
];

export const PRODUCTOS_DEMO = Object.freeze([
  { id: "p1", nombre: "Tubo de pelotas (3)", categoria: "Pelotas", precio: 12000, costo: 7800, stock: 18, minimo: 10 },
  { id: "p2", nombre: "Agua 500 ml", categoria: "Bebidas", precio: 2000, costo: 700, stock: 42, minimo: 24 },
  { id: "p3", nombre: "Bebida isotónica", categoria: "Bebidas", precio: 3500, costo: 1500, stock: 9, minimo: 12 },
  { id: "p4", nombre: "Overgrip", categoria: "Accesorios", precio: 4500, costo: 2100, stock: 30, minimo: 10 },
  { id: "p5", nombre: "Muñequera", categoria: "Accesorios", precio: 6000, costo: 2800, stock: 4, minimo: 6 },
  { id: "p6", nombre: "Alquiler de pala", categoria: "Alquiler", precio: 5000, costo: 0, stock: 8, minimo: 0, alquiler: true },
  { id: "p7", nombre: "Pala Break Point (shop)", categoria: "Shop", precio: 185000, costo: 118000, stock: 3, minimo: 2 },
  { id: "p8", nombre: "Remera técnica del club", categoria: "Shop", precio: 28000, costo: 13500, stock: 0, minimo: 5 },
]);

/** Generador pseudoaleatorio con semilla: la demo se ve igual cada vez que se abre el mismo día. */
function azar(semilla) {
  let s = semilla >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/**
 * Arma un club con vida: una semana de historia para el mapa de calor y un día de hoy con todas las
 * eventualidades a la vista (seña pendiente, alguien que no llegó, un turno que se va debiendo, lluvia
 * anunciada sobre la descubierta, lista de espera, stock bajo, luz prendida de más).
 */
export function generarDemo(hoy, ahoraMin = 19 * 60 + 10) {
  secuencia = 0;
  const rnd = azar(hoy.split("-").reduce((s, x) => s * 31 + Number(x), 7));
  const clientes = NOMBRES.map((nombre, i) => ({
    id: `k${i + 1}`, nombre, tel: `54911${String(40000000 + Math.floor(rnd() * 9999999)).slice(0, 8)}`,
    socio: i % 3 === 0, strikes: i === 5 ? 2 : i === 11 ? 1 : 0, monedero: i === 2 ? 15000 : 0, deuda: i === 9 ? 21000 : 0,
    nivel: ["3ra", "4ta", "5ta", "6ta", "7ma"][i % 5],
  }));
  const e = crearEstado({ config: CONFIG_DEMO, canchas: CANCHAS_DEMO, clientes, productos: PRODUCTOS_DEMO });
  e.caja.fondo = 30000;
  const ahora = { fecha: hoy, min: ahoraMin };
  const elegir = () => clientes[Math.floor(rnd() * clientes.length)];
  const medios = ["efectivo", "mercadopago", "transferencia", "debito"];

  // Turnos fijos: el corazón de la recurrencia de un club de barrio.
  crearFijo(e, { clienteId: "k1", canchaId: "c1", dia: diaSemana(hoy), inicio: 20 * 60 + 30 });
  crearFijo(e, { clienteId: "k4", canchaId: "c2", dia: diaSemana(hoy), inicio: 22 * 60 + 30 });
  crearFijo(e, { clienteId: "k7", canchaId: "c3", dia: (diaSemana(hoy) + 1) % 7, inicio: 19 * 60 });

  // Historia: los 6 días anteriores, todos cerrados y cobrados (para el mapa de calor y la tendencia).
  for (let d = -6; d <= 0; d++) {
    const fecha = sumarDias(hoy, d);
    materializarFijos(e, fecha);
    const finde = [0, 6].includes(diaSemana(fecha));
    for (const c of e.canchas) {
      for (let m = e.config.apertura; m + 90 <= e.config.cierre; m += 90) {
        const pico = m >= 17 * 60;
        const prob = finde ? 0.78 : pico ? 0.9 : m < 11 * 60 ? 0.25 : 0.4;
        if (d === 0 && m + 90 > ahoraMin - 90 && m < ahoraMin + 300) continue; // hoy se arma a mano abajo
        if (rnd() > prob) continue;
        const k = elegir();
        const res = crearReserva(e, { canchaId: c.id, fecha, inicio: m, clienteId: k.id, origen: rnd() > 0.5 ? "whatsapp" : "web" });
        if (!res.ok) continue;
        const r = res.reserva;
        if (d === 0 && m + 90 > ahoraMin) continue; // los de más tarde quedan reservados
        r.estado = "en_cancha";
        if (rnd() > 0.55) agregarConsumo(e, r.id, "p2", 2);
        if (rnd() > 0.8) agregarConsumo(e, r.id, "p1", 1);
        r.estado = rnd() > 0.96 ? "no_show" : "finalizada";
        if (r.estado === "finalizada") {
          const total = totalReserva(r);
          const quien = { fecha, min: m + 90 };
          for (const parte of dividir(total, rnd() > 0.5 ? 4 : 1)) {
            r.pagos.push({ medio: medios[Math.floor(rnd() * 4)], monto: parte, fecha, min: quien.min });
            e.caja.movimientos.push({ id: nuevoId("m"), tipo: "ingreso", medio: r.pagos.at(-1).medio, monto: parte, concepto: `Turno ${r.titular}`, reservaId: r.id, fecha, min: quien.min });
          }
        }
      }
    }
  }

  // La historia no se come el stock de hoy: el depósito arranca el día como en el inventario.
  e.productos = structuredClone(PRODUCTOS_DEMO);

  // HOY — escenario armado para que cada eventualidad aparezca en la bandeja.
  const h = (hh, mm = 0) => hh * 60 + mm;
  const turno = (canchaId, inicio, clienteId, extra = {}) => crearReserva(e, { canchaId, fecha: hoy, inicio, clienteId, origen: "whatsapp", ...extra }, { fecha: hoy, min: inicio - 600 }).reserva;
  materializarFijos(e, hoy);

  // 1) Termina ahora, se está yendo con saldo (pagaron la mitad y pidieron bebidas).
  const r1 = turno("c1", h(17, 30), "k3", { jugadores: ["Martín Ríos", "Sofía Gómez", "Tomás Medina", "Lucía Torres"] });
  r1.estado = "en_cancha"; r1.checkIn = { fecha: hoy, min: h(17, 28) }; e.luces.c1 = true;
  agregarConsumo(e, r1.id, "p2", 4); agregarConsumo(e, r1.id, "p3", 2);
  registrarPago(e, r1.id, { medio: "mercadopago", monto: 21000, jugador: 0 }, { fecha: hoy, min: h(17, 30) });
  // 2) En juego, al día.
  const r2 = turno("c2", h(18, 30), "k8", { jugadores: ["Julieta Acosta", "Camila Sosa", "Rocío Giménez", "Paula Ibáñez"] });
  registrarPago(e, r2.id, { medio: "transferencia", monto: totalReserva(r2) }, { fecha: hoy, min: h(18, 25) });
  r2.estado = "en_cancha"; r2.checkIn = { fecha: hoy, min: h(18, 27) }; e.luces.c2 = true;
  agregarConsumo(e, r2.id, "p6", 2);
  // 3) No llegó: van 40 minutos (cliente con 2 faltas → tenía seña obligatoria y la pagó).
  const r3 = turno("c3", h(18, 30), "k6");
  registrarPago(e, r3.id, { medio: "transferencia", monto: r3.sena.monto }, { fecha: hoy, min: h(14) });
  // 4) Entra en 10 minutos, sin seña (cliente nuevo de mostrador, seña obligatoria por política).
  turno("c4", h(19, 30), null, { titular: "Grupo de Bruno (nuevo)", origen: "mostrador" });
  // 5) La cancha 3 tiene luz prendida de más (el turno anterior se fue y nadie apagó).
  e.luces.c3 = true;
  // 6) Más tarde: turnos reservados, uno en la descubierta para cuando anuncian lluvia.
  turno("c4", h(21), "k10");
  turno("c4", h(22, 30), "k13");
  turno("c3", h(20, 30), "k15", { tipo: "clase", titular: "Clase 4ta — Profe Ezequiel" });
  turno("c1", h(22), "k17");
  turno("c3", h(22), "k21", { tipo: "abierto", titular: "Partido abierto 5ta (3/4)", jugadores: ["Santiago Aguirre", "Gonzalo Vera", "Facundo Ledesma"] });
  turno("c1", h(23, 30), "k19");
  e.clima.pronostico = { fecha: hoy, desde: h(20, 45), hasta: h(23, 59) };
  // 7) Lista de espera: alguien quiere jugar hoy después de las 21.
  anotarEspera(e, { clienteId: "k20", titular: "Daniela Navarro", tel: clientes[19].tel, fecha: hoy, desde: h(21), hasta: h(23, 30), soloCubierta: true }, ahora);
  // 8) Caja del turno tarde: un egreso (compra de hielo).
  egresoCaja(e, { medio: "efectivo", monto: 6500, concepto: "Hielo para el bar" }, { fecha: hoy, min: h(16, 40) });

  e.log.length = 0;
  registrar(e, "Arrancó el turno tarde de recepción.", { fecha: hoy, min: h(16) });
  return e;
}
