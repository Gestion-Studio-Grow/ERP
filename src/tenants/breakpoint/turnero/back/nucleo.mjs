// NÚCLEO DEL TURNERO — Break Point Pádel.
//
// El dominio es el motor del club (public/previews/breakpoint/club/motor.mjs): disponibilidad, precio, seña,
// cancelación, lista de espera y vencimientos salen de ahí. Este archivo NO repite reglas: orquesta el canal
// online (clientes con cuenta, límites anti-acaparamiento, código de seña), la conciliación de comprobantes por
// WhatsApp y la sincronización en vivo con el backoffice.
//
// Doble reserva (lección DB-4): toda escritura sobre la agenda pasa por funciones SINCRÓNICAS de este módulo
// (validar + insertar sin un `await` en el medio), y Node corre una sola a la vez: el event loop es el punto de
// serialización. En producción, con base de datos, la exclusión la impone la base (constraint EXCLUDE o
// transacción serializable — Gate 2), no la app.
import { randomInt } from "node:crypto";
import * as M from "../../../../../public/previews/breakpoint/club/motor.mjs";
import { leerComprobante, conciliar, enmascarar, mismoTel } from "./conciliacion.mjs";
import { normalizarCelular, normalizarEmail, hashClave, verificarClave, problemaDeClave, GOOGLE_DEMO } from "./auth.mjs";

const OFFSET_AR = -3 * 3600000; // Argentina no tiene horario de verano
const pad = (n) => String(n).padStart(2, "0");

/** Epoch (ms) → tiempo del motor { fecha, min } en hora argentina. */
export function aMotor(ms) {
  const d = new Date(ms + OFFSET_AR);
  return { fecha: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`, min: d.getUTCHours() * 60 + d.getUTCMinutes() };
}
/** Tiempo del motor → epoch (ms). min puede pasar de 1440 (después de medianoche). */
export function aEpoch({ fecha, min }) {
  const [a, m, d] = fecha.split("-").map(Number);
  return Date.UTC(a, m - 1, d) + min * 60000 - OFFSET_AR;
}

const solapa = (a1, a2, b1, b2) => a1 < b2 && b1 < a2;
const DURACIONES = [60, 90, 120];
const LETRAS_REF = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin 0/O ni 1/I: se dictan por teléfono sin confusión

/**
 * Crea el turnero. Todo inyectable para los tests: reloj, estado inicial, canal de WhatsApp, lector y cuentas
 * del club. Sin persistencia: el estado vive en memoria (demo a costo cero).
 */
export function crearTurnero({
  reloj = () => Date.now(),
  estado,
  canal,
  lector,
  cuentasClub = { alias: ["bp.demo.ficticio"], cbu: [], cvu: ["0000000000000000000000"] },
  diasVista = 14,
  limites = { pendientes: 2, activas: 4 },
  urlTurnero = "",
} = {}) {
  const ahora = () => aMotor(reloj());
  // La demo del club arma "hoy" alrededor de las 19:10 (así cada eventualidad queda a la vista en el backoffice).
  const E = estado ?? M.generarDemo(ahora().fecha);
  const usuarios = new Map(); // id → usuario
  const revisiones = []; // bandeja "a revisar" de comprobantes
  const usados = { operaciones: new Set(), huellas: new Set() };
  const mensajesVistos = new Set(); // Meta reintenta webhooks: cada mensaje se procesa una sola vez
  const ofertasEspera = new Map(); // tel → { esperaId, canchaId, inicio, vence }
  const oyentes = new Set(); // { canal, enviar(tipo, datos) }
  let version = 0;
  let secUsuario = 0;

  // ───────────── eventos en vivo (SSE) ─────────────
  function emitir(canal, tipo, datos) {
    for (const o of oyentes) if (o.canal === canal) { try { o.enviar(tipo, datos); } catch { oyentes.delete(o); } }
  }
  function cambioReserva(r, motivo) {
    version++;
    emitir("publico", "disponibilidad", { fecha: r.fecha, canchaId: r.canchaId, version });
    emitir("staff", "reserva", { reserva: r, motivo, version });
    if (r.webUsuarioId) emitir(`usuario:${r.webUsuarioId}`, "mi-reserva", { reserva: publica(r), motivo });
  }
  const suscribir = (canal, enviar) => { const o = { canal, enviar }; oyentes.add(o); return () => oyentes.delete(o); };

  // ───────────── usuarios del turnero ─────────────
  const buscarUsuario = (pred) => { for (const u of usuarios.values()) if (pred(u)) return u; return null; };
  const perfil = (u) => u && { id: u.id, nombre: u.nombre, email: u.email, tel: u.tel ? `••• ${u.tel.slice(-4)}` : null, tieneCelular: Boolean(u.tel), google: Boolean(u.googleSub), pideSena: u.clienteId ? M.requiereSenaWeb(E, u.clienteId) : true };

  /** Vincula al usuario con su ficha de cliente del club (por celular) o le crea una. */
  function vincularCliente(u) {
    if (u.clienteId && M.cliente(E, u.clienteId)) return;
    const existente = u.tel ? E.clientes.find((c) => c.activo !== false && mismoTel(c.tel, u.tel)) : null;
    if (existente) { u.clienteId = existente.id; return; }
    const r = M.altaCliente(E, { nombre: u.nombre, tel: u.tel ?? "" }, ahora());
    if (r.ok) u.clienteId = r.cliente?.id ?? E.clientes[E.clientes.length - 1].id;
  }

  async function registrar({ nombre, tel, email, clave }) {
    const n = String(nombre ?? "").trim().replace(/\s+/g, " ");
    if (n.length < 2 || n.length > 60) return { ok: false, motivo: "Contanos tu nombre." };
    const cel = normalizarCelular(tel);
    if (!cel) return { ok: false, motivo: "Revisá el celular: código de área + número, sin 0 ni 15 (ej. 11 6187 0066)." };
    const mail = email ? normalizarEmail(email) : null;
    if (email && !mail) return { ok: false, motivo: "Revisá el mail." };
    const p = problemaDeClave(clave);
    if (p) return { ok: false, motivo: p };
    if (buscarUsuario((u) => u.tel === cel || (mail && u.email === mail))) return { ok: false, motivo: "Ya hay una cuenta con ese celular o mail. Probá ingresar." };
    const u = { id: `w${++secUsuario}`, nombre: n, tel: cel, email: mail, claveHash: await hashClave(clave), googleSub: null, clienteId: null };
    usuarios.set(u.id, u);
    vincularCliente(u);
    return { ok: true, usuario: u };
  }

  async function ingresar({ usuario, clave }) {
    const cel = normalizarCelular(usuario), mail = normalizarEmail(usuario);
    const u = buscarUsuario((x) => (cel && x.tel === cel) || (mail && x.email === mail));
    const ok = await verificarClave(clave, u?.claveHash ?? null); // se verifica igual si no existe (mismo tiempo)
    if (!ok) return { ok: false, motivo: "El usuario o la contraseña no coinciden." };
    return { ok: true, usuario: u };
  }

  function ingresarConGoogle(perfilGoogle) {
    let u = buscarUsuario((x) => x.googleSub === perfilGoogle.sub) ?? (perfilGoogle.email ? buscarUsuario((x) => x.email === perfilGoogle.email) : null);
    if (!u) {
      u = { id: `w${++secUsuario}`, nombre: perfilGoogle.nombre, tel: null, email: perfilGoogle.email, claveHash: null, googleSub: perfilGoogle.sub, clienteId: null };
      usuarios.set(u.id, u);
    } else u.googleSub ??= perfilGoogle.sub;
    vincularCliente(u);
    return { ok: true, usuario: u };
  }
  const ingresarGoogleDemo = (i = 0) => ingresarConGoogle(GOOGLE_DEMO[i] ?? GOOGLE_DEMO[0]);

  /** El celular hace falta para conciliar por WhatsApp (Google no lo da). */
  function cargarCelular(usuarioId, tel) {
    const u = usuarios.get(usuarioId);
    const cel = normalizarCelular(tel);
    if (!u) return { ok: false, motivo: "Ingresá de nuevo." };
    if (!cel) return { ok: false, motivo: "Revisá el celular: código de área + número (ej. 11 6187 0066)." };
    if (buscarUsuario((x) => x.tel === cel && x.id !== u.id)) return { ok: false, motivo: "Ese celular ya está en otra cuenta." };
    u.tel = cel;
    const cl = u.clienteId ? M.cliente(E, u.clienteId) : null;
    if (cl && !cl.tel) cl.tel = cel;
    return { ok: true, usuario: u };
  }

  // ───────────── disponibilidad (pública: nunca nombres ni datos de nadie) ─────────────
  function dias() {
    const hoy = ahora().fecha;
    return Array.from({ length: diasVista }, (_, i) => {
      const fecha = M.sumarDias(hoy, i);
      const h = M.horarioDe(E, fecha);
      return { fecha, dia: M.diaSemana(fecha), abre: h.abre, cierra: h.cierra, feriado: (E.config.feriados ?? []).includes(fecha) };
    });
  }

  function validarConsulta({ fecha, duracion }) {
    const hoy = ahora().fecha;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha))) return "Elegí un día.";
    if (fecha < hoy || fecha > M.sumarDias(hoy, diasVista - 1)) return `Se reserva desde hoy y hasta ${diasVista} días.`;
    if (!DURACIONES.includes(Number(duracion))) return "Elegí 1 h, 1 h 30 o 2 h.";
    return null;
  }

  function disponibilidad({ fecha, duracion = 90, techadas = false }) {
    const err = validarConsulta({ fecha, duracion });
    if (err) return { ok: false, motivo: err };
    const dur = Number(duracion);
    M.materializarFijos(E, fecha); // los fijos ocupan aunque nadie haya abierto el backoffice ese día
    const t = ahora();
    const desde = fecha === t.fecha ? Math.ceil((t.min + 15) / E.config.paso) * E.config.paso : undefined; // 15' de margen para llegar
    const slots = [];
    for (const c of E.canchas) {
      if (techadas && !c.cubierta) continue;
      for (const inicio of M.huecosLibres(E, fecha, c.id, dur, desde)) {
        slots.push({ inicio, fin: inicio + dur, canchaId: c.id, cancha: c.nombre, techada: Boolean(c.cubierta), pico: M.franjaDe(E, fecha, inicio) === "pico", precio: M.precioTurno(E, { fecha, inicio, duracion: dur, canchaId: c.id }) });
      }
    }
    slots.sort((a, b) => a.inicio - b.inicio || a.canchaId.localeCompare(b.canchaId));
    const lluvia = E.clima?.lluvia ? true : false;
    return { ok: true, fecha, duracion: dur, slots, version, lluvia, mantenimiento: E.canchas.filter((c) => c.estado === "mantenimiento").map((c) => c.nombre) };
  }

  // ───────────── reservas del cliente ─────────────
  const estadoPublico = (r) => (r.estado === "reservada" ? (r.sena.monto > 0 && !r.sena.pagada ? "pendiente" : "firme") : r.estado === "en_cancha" ? "en-cancha" : r.estado === "finalizada" ? "jugada" : r.estado === "no_show" ? "falta" : r.estado === "suspendida" ? "suspendida" : "cancelada");

  function publica(r) {
    const c = M.cancha(E, r.canchaId);
    const pagado = M.cobrado(r);
    const horasLibre = E.config.politica.horasCancelacionLibre;
    return {
      id: r.id, fecha: r.fecha, inicio: r.inicio, fin: r.inicio + r.duracion, duracion: r.duracion,
      canchaId: r.canchaId, cancha: c?.nombre ?? r.canchaId, techada: Boolean(c?.cubierta),
      precio: r.precio, pagado, saldo: M.saldo(r), estado: estadoPublico(r),
      sena: { monto: r.sena.monto, pagada: r.sena.pagada, falta: Math.max(0, r.sena.monto - pagado) },
      venceSena: r.venceSena && !r.sena.pagada ? aEpoch(r.venceSena) : null,
      senaVencida: Boolean(r.senaVencida && !r.sena.pagada), liberarSinSena: E.config.politica.liberarSinSena ?? "manual",
      ref: r.ref ?? null, jugadores: r.jugadores.map((j) => j.nombre),
      cancelacionLibreHasta: aEpoch({ fecha: r.fecha, min: r.inicio - horasLibre * 60 }),
      motivoCancelacion: r.motivoCancelacion ?? null,
      conciliacion: r.conciliacion ? { nivel: r.conciliacion.nivel } : null,
    };
  }

  const nuevaRef = () => { let s; do { s = "BP-" + Array.from({ length: 4 }, () => LETRAS_REF[randomInt(LETRAS_REF.length)]).join(""); } while (E.reservas.some((r) => r.ref === s)); return s; };

  /** Alternativas cercanas cuando el turno elegido ya no está (dolor: "elegí, pagué y no había"). */
  function alternativas(fecha, inicio, duracion) {
    const d = disponibilidad({ fecha, duracion });
    if (!d.ok) return [];
    return d.slots.slice().sort((a, b) => Math.abs(a.inicio - inicio) - Math.abs(b.inicio - inicio)).slice(0, 3);
  }

  /** SINCRÓNICA a propósito (DB-4): validar e insertar sin ceder el event loop. */
  function reservar(usuarioId, { fecha, inicio, canchaId, duracion = 90, jugadores = [] }) {
    const u = usuarios.get(usuarioId);
    if (!u) return { ok: false, codigo: 401, motivo: "Ingresá para reservar." };
    const err = validarConsulta({ fecha, duracion });
    if (err) return { ok: false, codigo: 400, motivo: err };
    const ini = Number(inicio), dur = Number(duracion);
    if (!Number.isInteger(ini)) return { ok: false, codigo: 400, motivo: "Elegí un horario." };
    const t = ahora();
    if (fecha === t.fecha && ini < t.min + 15) return { ok: false, codigo: 409, motivo: "Ese horario ya pasó o arranca en menos de 15 minutos. Llamanos y vemos.", alternativas: alternativas(fecha, ini, dur) };
    vincularCliente(u);
    const mias = E.reservas.filter((r) => r.webUsuarioId === u.id && r.estado === "reservada");
    if (mias.filter((r) => r.sena.monto > 0 && !r.sena.pagada).length >= limites.pendientes) return { ok: false, codigo: 429, motivo: "Tenés turnos esperando la seña. Mandá esos comprobantes antes de reservar otro." };
    if (mias.length >= limites.activas) return { ok: false, codigo: 429, motivo: `Podés tener hasta ${limites.activas} turnos por delante. Si necesitás más, escribinos.` };
    M.materializarFijos(E, fecha);
    const nombres = (Array.isArray(jugadores) ? jugadores : []).map((j) => String(j ?? "").trim().slice(0, 40)).filter(Boolean).slice(0, 3);
    const res = M.crearReserva(E, {
      canchaId, fecha, inicio: ini, duracion: dur, tipo: "turno", clienteId: u.clienteId, titular: u.nombre,
      jugadores: [{ nombre: u.nombre, clienteId: u.clienteId }, ...nombres], origen: "web",
      conSena: M.requiereSenaWeb(E, u.clienteId), plazoSenaMin: E.config.politica.minutosParaSenar ?? 60,
    }, t);
    // Nunca se devuelve el motivo del motor tal cual: "Se pisa con <nombre>" expondría a otro cliente.
    if (!res.ok) return { ok: false, codigo: 409, motivo: /^Se pisa|bloqueada/.test(res.motivo) ? "Ese turno se acaba de ocupar 😕 Te dejamos los más cercanos." : res.motivo, alternativas: alternativas(fecha, ini, dur) };
    const r = res.reserva;
    r.webUsuarioId = u.id;
    if (r.sena.monto > 0) r.ref = nuevaRef();
    cambioReserva(r, "nueva");
    return { ok: true, reserva: publica(r) };
  }

  const misReservas = (usuarioId) => E.reservas
    .filter((r) => r.webUsuarioId === usuarioId && (r.fecha >= M.sumarDias(ahora().fecha, -7)))
    .sort((a, b) => (a.fecha + pad(a.inicio)).localeCompare(b.fecha + pad(b.inicio)))
    .map(publica);

  function cancelarReserva(usuarioId, id) {
    const r = M.reserva(E, id);
    if (!r || r.webUsuarioId !== usuarioId) return { ok: false, codigo: 404, motivo: "No encontramos ese turno." };
    const res = M.cancelar(E, id, { motivo: "Cancela el cliente (online)" }, ahora());
    if (!res.ok) return { ok: false, codigo: 409, motivo: res.motivo };
    cambioReserva(r, "cancelada");
    avisarEspera(res.ofertas);
    return { ok: true, reserva: publica(r), aTiempo: res.aTiempo, devuelto: res.devuelto, enSuspenso: res.enSuspenso };
  }

  function anotarEnEspera(usuarioId, { fecha, desde, hasta, duracion = 90, techadas = false }) {
    const u = usuarios.get(usuarioId);
    if (!u) return { ok: false, codigo: 401, motivo: "Ingresá para anotarte." };
    const err = validarConsulta({ fecha, duracion });
    if (err) return { ok: false, codigo: 400, motivo: err };
    if (!u.tel) return { ok: false, codigo: 400, motivo: "Cargá tu celular: te avisamos por WhatsApp cuando se libere." };
    const d = Number(desde), h = Number(hasta);
    if (!(Number.isInteger(d) && Number.isInteger(h) && d <= h)) return { ok: false, codigo: 400, motivo: "Elegí desde qué hora y hasta qué hora te sirve." };
    if (E.espera.filter((e) => e.webUsuarioId === u.id).length >= 3) return { ok: false, codigo: 429, motivo: "Ya estás en 3 listas de espera." };
    vincularCliente(u);
    const e = M.anotarEspera(E, { clienteId: u.clienteId, titular: u.nombre, tel: u.tel, fecha, desde: d, hasta: h, duracion: Number(duracion), soloCubierta: Boolean(techadas) }, ahora());
    e.webUsuarioId = u.id;
    emitir("staff", "espera", { espera: e });
    return { ok: true };
  }

  /** Se liberó un hueco: WhatsApp a los de la lista de espera (el primero que dice SÍ se lo lleva). */
  function avisarEspera(ofertas = []) {
    const t = reloj();
    for (const o of ofertas) {
      if (!o.tel) continue;
      ofertasEspera.set(o.tel, { esperaId: o.id, canchaId: o.canchaId, inicio: o.inicio, vence: t + 20 * 60000 });
      canal.enviar(o.tel, `${o.mensaje}${urlTurnero ? ` También lo podés tomar acá: ${urlTurnero}` : ""}`);
      if (o.webUsuarioId) emitir(`usuario:${o.webUsuarioId}`, "espera", { fecha: o.fecha, inicio: o.inicio, canchaId: o.canchaId });
    }
  }

  // ───────────── seña por WhatsApp: comprobantes y conciliación ─────────────
  function pendientesDeSena() {
    return E.reservas.filter((r) => r.estado === "reservada" && r.sena.monto > 0 && !r.sena.pagada).map((r) => {
      const u = r.webUsuarioId ? usuarios.get(r.webUsuarioId) : null;
      const cl = r.clienteId ? M.cliente(E, r.clienteId) : null;
      return { reservaId: r.id, ref: r.ref ?? null, senaPendiente: r.sena.monto - M.cobrado(r), saldo: M.saldo(r), tel: u?.tel ?? cl?.tel ?? "", creadaFecha: r.creada?.fecha ?? null };
    });
  }

  function aplicarPago(reservaId, monto, comprobante) {
    const r = M.reserva(E, reservaId);
    if (!r) return { ok: false, motivo: "Ese turno ya no existe." };
    if (r.estado !== "reservada") return { ok: false, motivo: "Ese turno ya no está reservado (se canceló o venció)." };
    const res = M.registrarPago(E, reservaId, { medio: "transferencia", monto, concepto: `Seña ${r.titular} por WhatsApp (op. ${enmascarar(comprobante.operacion)})` }, ahora());
    if (!res.ok) return res;
    r.conciliacion = { nivel: "comprobante", operacion: enmascarar(comprobante.operacion), cuando: reloj() };
    if (r.sena.pagada) delete r.venceSena;
    cambioReserva(r, r.sena.pagada ? "sena-confirmada" : "sena-parcial");
    return { ok: true, reserva: r };
  }

  function marcarUsado(c, firma) {
    if (c.operacion) usados.operaciones.add(c.operacion);
    usados.huellas.add(firma);
  }

  function aRevisar({ tel, comprobante, motivo, sugerida = null, reservaId = null, firma, tipo = "comprobante" }) {
    const rev = {
      id: `rv${revisiones.length + 1}`, tipo, cuando: reloj(), tel: tel ? `••• ${String(tel).slice(-4)}` : "•••", telCompleto: tel,
      monto: comprobante?.monto ?? null, fecha: comprobante?.fecha ?? null, operacion: enmascarar(comprobante?.operacion),
      ref: comprobante?.ref ?? null, motivo, sugerida, reservaId, estado: "pendiente", comprobante, firma,
    };
    revisiones.unshift(rev);
    emitir("staff", "revision", { revision: revisionPublica(rev) });
    return rev;
  }
  const revisionPublica = ({ telCompleto, comprobante, firma, ...r }) => r;

  /** Un mensaje que entró por el webhook (ya con la firma verificada). */
  async function procesarMensaje(m) {
    if (!m.id || mensajesVistos.has(m.id)) return { ok: true, duplicado: true };
    mensajesVistos.add(m.id);
    if (mensajesVistos.size > 5000) mensajesVistos.delete(mensajesVistos.values().next().value);
    const tel = m.de;
    if (m.ignorado) { await canal.enviar(tel, "¡Hola! Por acá recibimos los comprobantes de seña (foto o texto de la transferencia). Para reservar, entrá al turnero 🎾"); return { ok: true, decision: "ignorado" }; }

    // ¿Responde "SÍ" a una oferta de la lista de espera?
    const oferta = ofertasEspera.get(tel) ?? [...ofertasEspera.entries()].find(([k]) => mismoTel(k, tel))?.[1];
    if (oferta && !m.mediaId && /^\s*s[ií](?![a-záéíóúñ])/i.test(m.texto ?? "")) {
      for (const [k, v] of ofertasEspera) if (v === oferta) ofertasEspera.delete(k);
      if (reloj() > oferta.vence) { await canal.enviar(tel, "Uh, esa oferta ya venció. Fijate en el turnero si queda algo 🙏"); return { ok: true, decision: "oferta-vencida" }; }
      const res = M.asignarDesdeEspera(E, oferta.esperaId, { canchaId: oferta.canchaId, inicio: oferta.inicio }, ahora());
      if (!res.ok) { await canal.enviar(tel, `Uh, se ocupó antes: ${res.motivo}`); return { ok: true, decision: "oferta-perdida" }; }
      const u = buscarUsuario((x) => mismoTel(x.tel, tel));
      if (u) res.reserva.webUsuarioId = u.id;
      if (res.reserva.sena.monto > 0) res.reserva.ref = nuevaRef();
      cambioReserva(res.reserva, "desde-espera");
      await canal.enviar(tel, `¡Listo! Te reservamos ${M.cancha(E, res.reserva.canchaId).nombre} a las ${M.hhmm(res.reserva.inicio)}.${res.reserva.sena.monto ? ` Para dejarlo firme mandá la seña de ${M.pesos(res.reserva.sena.monto)} con el código ${res.reserva.ref}.` : ""}`);
      return { ok: true, decision: "espera-asignada", reservaId: res.reserva.id };
    }

    const { texto, confianzaOcr } = await lector.leer(m);
    const c = leerComprobante(texto, { confianzaOcr });
    const d = conciliar({ comprobante: c, remitenteTel: tel, pendientes: pendientesDeSena(), club: cuentasClub, usados, hoy: ahora().fecha });
    // Lo único que queda en el log: decisión, monto y operación enmascarada. Nunca el comprobante.
    E.log.unshift({ ...ahora(), texto: `WhatsApp ${tel ? `••• ${String(tel).slice(-4)}` : ""}: comprobante ${c.monto != null ? M.pesos(c.monto) : "sin monto"} op. ${enmascarar(c.operacion)} → ${d.decision}.` });

    if (d.decision === "confirmar" || d.decision === "parcial") {
      const ap = aplicarPago(d.reservaId, d.aplicar, c);
      if (!ap.ok) { aRevisar({ tel, comprobante: c, motivo: ap.motivo, reservaId: d.reservaId, firma: d.huella }); await canal.enviar(tel, "Recibimos tu comprobante. Lo revisa alguien del club y te confirmamos en un rato 🙌"); return { ok: true, decision: "revisar", motivo: ap.motivo }; }
      marcarUsado(c, d.huella);
      const r = ap.reserva, cn = M.cancha(E, r.canchaId).nombre;
      if (d.excedente > 0) aRevisar({ tel, comprobante: c, motivo: `Pagó ${M.pesos(d.excedente)} de más: devolver o dejar como crédito.`, reservaId: r.id, firma: d.huella, tipo: "excedente" });
      await canal.enviar(tel, d.decision === "confirmar"
        ? `¡Listo, ${r.titular.split(" ")[0]}! Recibimos la seña y tu turno quedó firme: ${cn}, ${r.fecha.slice(8)}/${r.fecha.slice(5, 7)} a las ${M.hhmm(r.inicio)}. ¡Nos vemos en la cancha! 🎾`
        : `Recibimos ${M.pesos(d.aplicar)}. Para dejar firme el turno faltan ${M.pesos(d.falta)}. Mandanos ese comprobante también 🙏`);
      return { ok: true, decision: d.decision, reservaId: r.id };
    }
    if (d.decision === "revisar") {
      aRevisar({ tel, comprobante: c, motivo: d.motivo, sugerida: d.sugerida, reservaId: d.reservaId ?? null, firma: d.huella });
      await canal.enviar(tel, "Recibimos tu comprobante. Lo revisa alguien del club y te confirmamos en un rato 🙌");
      return { ok: true, decision: "revisar", motivo: d.motivo };
    }
    await canal.enviar(tel, `No pudimos tomar ese comprobante: ${d.motivo} Si creés que es un error, escribinos y lo vemos.`);
    emitir("staff", "comprobante-rechazado", { motivo: d.motivo, monto: c.monto, operacion: enmascarar(c.operacion) });
    return { ok: true, decision: "rechazar", motivo: d.motivo };
  }

  /** El staff resuelve un comprobante de la bandeja: lo aplica a un turno o lo rechaza. */
  async function resolverRevision(id, { aprobar, reservaId }) {
    const rev = revisiones.find((x) => x.id === id);
    if (!rev || rev.estado !== "pendiente") return { ok: false, codigo: 404, motivo: "Ese comprobante ya se resolvió." };
    if (rev.tipo === "excedente") { rev.estado = aprobar ? "resuelta" : "descartada"; emitir("staff", "revision", { revision: revisionPublica(rev) }); return { ok: true }; }
    if (!aprobar) {
      rev.estado = "rechazada";
      await canal.enviar(rev.telCompleto, "Revisamos tu comprobante y no lo pudimos tomar. Escribinos y lo vemos juntos 🙏");
      emitir("staff", "revision", { revision: revisionPublica(rev) });
      return { ok: true };
    }
    const destino = reservaId ?? rev.reservaId ?? rev.sugerida;
    if (!destino || rev.monto == null) return { ok: false, codigo: 400, motivo: "Elegí a qué turno va." };
    if ((rev.comprobante?.operacion && usados.operaciones.has(rev.comprobante.operacion)) || usados.huellas.has(rev.firma)) return { ok: false, codigo: 409, motivo: "Ese comprobante ya se usó." };
    const r = M.reserva(E, destino);
    const ap = aplicarPago(destino, Math.min(Math.round(rev.monto), r ? M.saldo(r) : 0), rev.comprobante ?? {});
    if (!ap.ok) return { ok: false, codigo: 409, motivo: ap.motivo };
    marcarUsado(rev.comprobante ?? {}, rev.firma);
    rev.estado = "aprobada";
    rev.reservaId = destino;
    await canal.enviar(rev.telCompleto, ap.reserva.sena.pagada ? `¡Listo! Tu turno de las ${M.hhmm(ap.reserva.inicio)} quedó firme 🎾` : "Recibimos tu pago. Todavía falta una parte de la seña 🙏");
    emitir("staff", "revision", { revision: revisionPublica(rev) });
    return { ok: true };
  }

  // ───────────── reloj del club: vencimientos ─────────────
  function tick() {
    const t = reloj();
    for (const [k, v] of ofertasEspera) if (t > v.vence) ofertasEspera.delete(k);
    const vencidas = M.vencerSenas(E, ahora());
    for (const { reserva: r, ofertas, liberada } of vencidas) {
      cambioReserva(r, liberada ? "sena-vencida" : "sena-demorada");
      const u = r.webUsuarioId ? usuarios.get(r.webUsuarioId) : null;
      if (u?.tel) canal.enviar(u.tel, liberada
        ? `Tu reserva de las ${M.hhmm(r.inicio)} se liberó porque no llegó la seña a tiempo. Si todavía la querés, fijate en el turnero 🙏`
        : `¡Hola! Todavía no nos llegó la seña del turno de las ${M.hhmm(r.inicio)} (código ${r.ref}). Mandanos el comprobante por acá así no lo tenemos que liberar 🙏`);
      avisarEspera(ofertas);
    }
    return vencidas.length;
  }

  // ───────────── backoffice conectado (staff) ─────────────
  /**
   * Lo que cambió en el backoffice. Reservas: upsert por id, rechazando cualquier cosa que pise otro turno activo
   * (puede haberse vendido online en el medio). Bloqueos, canchas, fijos y clima: los manda el backoffice entero.
   */
  function sincronizar({ reservas = [], bloqueos, canchas, fijos, clima, politica, puesto = null } = {}) {
    const aplicadas = [], rechazadas = [];
    const fechas = new Set();
    if (Array.isArray(canchas) && canchas.every((c) => c && typeof c.id === "string")) E.canchas = canchas;
    if (Array.isArray(bloqueos)) { E.bloqueos = bloqueos.filter((b) => b && typeof b.fecha === "string"); for (const b of E.bloqueos) fechas.add(b.fecha); }
    if (Array.isArray(fijos)) E.fijos = fijos;
    if (clima && typeof clima === "object") E.clima = clima;
    if (politica && typeof politica === "object") for (const [k, v] of Object.entries(politica)) if (k in E.config.politica) E.config.politica[k] = v;
    for (const inc of Array.isArray(reservas) ? reservas.slice(0, 500) : []) {
      if (!inc || typeof inc.id !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(String(inc.fecha)) || !Number.isFinite(inc.inicio) || !Number.isFinite(inc.duracion) || !M.cancha(E, inc.canchaId)) { rechazadas.push({ id: inc?.id ?? null, motivo: "Datos incompletos." }); continue; }
      const previa = M.reserva(E, inc.id);
      const ocupa = ["reservada", "en_cancha", "finalizada"].includes(inc.estado);
      if (ocupa) {
        const choque = M.ocupantes(E, inc.fecha, inc.canchaId, inc.id).reservas.find((r) => solapa(inc.inicio, inc.inicio + inc.duracion, r.inicio, r.inicio + r.duracion));
        if (choque) { rechazadas.push({ id: inc.id, motivo: `Se pisa con un turno de ${choque.origen === "web" ? "la web" : "otro puesto"} (${M.hhmm(choque.inicio)}).`, actual: previa ?? null }); continue; }
      }
      const r = previa ? Object.assign(previa, inc, { webUsuarioId: previa.webUsuarioId ?? inc.webUsuarioId, ref: previa.ref ?? inc.ref }) : { ...inc };
      if (r.sena?.pagada) delete r.venceSena;
      if (!previa) E.reservas.push(r);
      fechas.add(r.fecha);
      aplicadas.push(r.id);
      version++;
      if (r.webUsuarioId) emitir(`usuario:${r.webUsuarioId}`, "mi-reserva", { reserva: publica(r), motivo: "club" });
    }
    if (aplicadas.length || fechas.size) {
      for (const fecha of fechas) emitir("publico", "disponibilidad", { fecha, version });
      // Los otros puestos del club (otra compu de recepción) reciben lo mismo; el que lo mandó lo ignora por `puesto`.
      emitir("staff", "sync", {
        puesto, version, reservas: aplicadas.map((id) => M.reserva(E, id)),
        ...(Array.isArray(bloqueos) && { bloqueos: E.bloqueos }), ...(Array.isArray(canchas) && { canchas: E.canchas }),
        ...(Array.isArray(fijos) && { fijos: E.fijos }), ...(clima && { clima: E.clima }), ...(politica && { politica: E.config.politica }),
      });
    }
    return { ok: true, aplicadas, rechazadas, version };
  }

  return {
    estado: E, ahora, reloj, version: () => version,
    // auth
    registrar, ingresar, ingresarConGoogle, ingresarGoogleDemo, cargarCelular, usuario: (id) => usuarios.get(id) ?? null, perfil,
    // cliente
    dias, disponibilidad, reservar, misReservas, cancelarReserva, anotarEnEspera, publica,
    // whatsapp
    procesarMensaje, resolverRevision, revisiones: () => revisiones.map(revisionPublica),
    // reloj
    tick,
    // staff
    sincronizar, snapshot: () => structuredClone(E),
    suscribir,
    config: () => ({
      club: E.config.nombre,
      dias: dias(),
      duraciones: DURACIONES,
      politica: { horasCancelacionLibre: E.config.politica.horasCancelacionLibre, senaPct: E.config.politica.senaPct, minutosParaSenar: E.config.politica.minutosParaSenar ?? 60, liberarSinSena: E.config.politica.liberarSinSena ?? "manual" },
      cuentas: { alias: cuentasClub.alias[0] ?? null, cvu: cuentasClub.cvu?.[0] ?? null, titular: "Break Point Pádel (DEMO — cuenta ficticia)" },
      canchas: E.canchas.map((c) => ({ id: c.id, nombre: c.nombre, techada: Boolean(c.cubierta) })),
    }),
  };
}
