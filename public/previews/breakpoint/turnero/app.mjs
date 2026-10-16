// TURNERO WEB — Break Point Pádel. Front vanilla, separado del back (contrato: docs/tenants/breakpoint/TURNERO-API.md).
// Sin framework a propósito: el presupuesto es < 60 KB de JS comprimido y LCP < 1,5 s en 4G.
// El back se elige con ?api=… o <meta name="turnero-api">; en localhost, el puerto 8787. En cualquier otro host
// (la demo pública a costo cero, sin servidor) corre el adaptador local: el mismo núcleo, dentro del navegador.

const $ = (s, r = document) => r.querySelector(s);
const qs = new URLSearchParams(location.search);
const ES_LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const MODO_DEMO = $('meta[name="turnero-modo"]')?.content === "demo";
const API = (() => {
  // ?api= sólo en desarrollo local: en un host público, un link armado podría mandar la contraseña del jugador a
  // otro servidor. En producción manda <meta name="turnero-api">. El modo local (sin servidor) sólo con la marca
  // explícita de demo: así nunca alguien "reserva" en su navegador creyendo que reservó en el club.
  const q = qs.get("api");
  if (q && /^(local|https?:\/\/[\w.:[\]-]+)$/.test(q) && (ES_LOCAL || (q === "local" && MODO_DEMO))) return q;
  const meta = $('meta[name="turnero-api"]')?.content;
  if (meta) return meta;
  if (ES_LOCAL) return `${location.protocol}//${location.hostname}:8787`;
  return MODO_DEMO ? "local" : "";
})().replace(/\/$/, "");
let LOCAL = null; // adaptador local (local.mjs): sólo se descarga si hace falta
// Modo «pedido por WhatsApp» (/turnero?modo=pedido&wa=549…): para el día de prueba en el club. El celular del jugador
// no llega a la PC del club (la sync es entre pestañas del MISMO navegador), así que no se promete nada que no pase:
// horarios y precios de referencia, y el turno se pide por WhatsApp; el club lo confirma. Sólo en la demo (MODO_DEMO).
const MODO_PEDIDO = MODO_DEMO && qs.get("modo") === "pedido";
/** Número del club para WhatsApp (?wa=): sólo dígitos, de 8 a 15. Si no sirve, WhatsApp abre sin destinatario. */
const WA = (() => { const n = String(qs.get("wa") ?? "").replace(/[\s+().-]/g, ""); return /^\d{8,15}$/.test(n) ? n : ""; })();
const linkWa = (texto) => `https://wa.me/${WA}?text=${encodeURIComponent(texto)}`;
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES_LARGOS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const pesos = (n) => `$${Math.round(n).toLocaleString("es-AR")}`;
const hhmm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fechaLarga = (f) => { const [a, m, d] = f.split("-").map(Number); return `${DIAS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]} ${d} ${MESES[m - 1]}`; };
/** Inicio del turno en epoch (hora argentina, UTC−3, sin horario de verano). */
const inicioEpoch = (fecha, min) => { const [a, m, d] = fecha.split("-").map(Number); return Date.UTC(a, m - 1, d) + (min + 180) * 60000; };
const durTexto = (m) => ({ 60: "1 h", 90: "1 h 30", 120: "2 h" })[m] ?? `${m} min`;
const TEXTO_TARDE = "la seña queda retenida y vuelve como crédito sólo si alguien toma el turno";
const quieto = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

const S = { config: null, fecha: null, duracion: 90, techadas: false, usuario: null, reservas: [], slots: [], cache: new Map(), pendiente: null, elegido: null, pagoId: null, timer: null };

// ───────────── API ─────────────
async function api(ruta, { metodo = "GET", cuerpo, idem } = {}) {
  if (LOCAL) {
    try { return await LOCAL.api(ruta, { metodo, cuerpo }); }
    catch { return { status: 0, ok: false, motivo: "La demo no pudo procesar eso en este navegador. Probá recargar la página." }; }
  }
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 10000);
  try {
    const r = await fetch(API + ruta, {
      method: metodo, credentials: "include", signal: ctl.signal,
      headers: cuerpo ? { "Content-Type": "application/json", ...(idem && { "Idempotency-Key": idem }) } : undefined,
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    const datos = await r.json().catch(() => ({}));
    return { status: r.status, ...datos };
  } catch {
    return { status: 0, ok: false, motivo: "Sin conexión con el club. Revisá tu internet y probá de nuevo." };
  } finally { clearTimeout(t); }
}

// ───────────── avisos ─────────────
let tAviso;
function aviso(texto) {
  const el = $("#aviso");
  el.textContent = texto;
  el.classList.add("on");
  clearTimeout(tAviso);
  tAviso = setTimeout(() => el.classList.remove("on"), 4200);
}
const abrir = (id) => { const d = $(id); if (!d.open) d.showModal(); };
const cerrar = (id) => { const d = $(id); if (d.open) d.close(); };

// ───────────── días y filtros ─────────────
function pintarDias() {
  const hoy = S.config.dias[0].fecha;
  $("#dias").innerHTML = S.config.dias.map(({ fecha, dia }) => {
    const n = Number(fecha.slice(8));
    // WCAG 2.5.3 (el nombre contiene lo visible): sin aria-label; lo visible ("jue 15") + el mes, oculto para la vista.
    return `<button type="button" class="dia" data-fecha="${fecha}" aria-pressed="${fecha === S.fecha}"><span class="dia-sem">${fecha === hoy ? "hoy" : DIAS[dia]}</span> <span class="dia-num">${n}</span><span class="sr"> de ${MESES_LARGOS[Number(fecha.slice(5, 7)) - 1]}</span></button>`;
  }).join("");
}

function elegirDia(fecha) {
  S.fecha = fecha;
  for (const b of document.querySelectorAll("#dias .dia")) b.setAttribute("aria-pressed", String(b.dataset.fecha === fecha));
  $(`#dias .dia[data-fecha="${fecha}"]`)?.scrollIntoView({ block: "nearest", inline: "center", behavior: quieto() ? "auto" : "smooth" });
  cargarSlots();
}

// ───────────── grilla ─────────────
const clave = () => `${S.fecha}|${S.duracion}|${S.techadas ? 1 : 0}`;
const FRANJAS = [["manana", "Mañana", 0, 720], ["tarde", "Tarde", 720, 1080], ["noche", "Noche", 1080, 2000]];

function htmlSlot(s) {
  // Mismo criterio (WCAG 2.5.3): el nombre es el texto visible; el fin del turno y las pausas van ocultos para la vista.
  return `<button type="button" class="slot" data-inicio="${s.inicio}" data-cancha="${esc(s.canchaId)}" data-pico="${s.pico ? 1 : 0}"><span class="slot-hora">${hhmm(s.inicio)}</span><span class="sr"> a ${hhmm(s.fin)}, </span><span class="slot-cancha">${esc(s.cancha)}</span><span class="slot-tags">${s.techada ? '<span class="sr">, </span><span class="tag tag-techada">Techada</span>' : ""}${s.pico ? '<span class="sr">, </span><span class="tag tag-pico">Pico</span>' : ""}</span><span class="sr">, </span><span class="slot-precio">${s.desde ? "desde " : ""}${pesos(s.precio)}</span></button>`;
}

/** El turno con foco de teclado (si hay): al repintar se le devuelve el foco a él o al vecino más cercano (D23). */
function slotEnfocado() {
  const b = document.activeElement?.closest?.("#grilla .slot");
  return b ? { inicio: Number(b.dataset.inicio), cancha: b.dataset.cancha } : null;
}
function devolverFocoSlot(foco) {
  if (!foco) return;
  const todos = [...$("#grilla").querySelectorAll(".slot")];
  const mismo = todos.find((b) => Number(b.dataset.inicio) === foco.inicio && b.dataset.cancha === foco.cancha);
  const vecino = mismo ?? todos.sort((a, b) => Math.abs(a.dataset.inicio - foco.inicio) - Math.abs(b.dataset.inicio - foco.inicio))[0];
  (vecino ?? $("#t-dias") ?? $("#grilla")).focus?.({ preventScroll: Boolean(mismo) });
}

function pintarGrilla(slots, { animar = false, foco = slotEnfocado() } = {}) {
  if (MODO_PEDIDO) slots = porHorario(slots);
  const g = $("#grilla");
  const antes = new Set(S.slots.map((s) => `${s.inicio}|${s.canchaId}`));
  const ahora = new Set(slots.map((s) => `${s.inicio}|${s.canchaId}`));
  // Lo que alguien acaba de tomar sale con animación (dolor: "lo veía libre y era mentira").
  if (animar && !quieto()) {
    const salen = [...g.querySelectorAll(".slot")].filter((b) => !ahora.has(`${b.dataset.inicio}|${b.dataset.cancha}`));
    if (salen.length) {
      salen.forEach((b) => { b.classList.add("is-saliendo"); b.disabled = true; });
      anunciar(salen.length <= 2 ? `Se ocupó ${salen.map((b) => `${hhmm(Number(b.dataset.inicio))} ${S.slots.find((x) => String(x.inicio) === b.dataset.inicio && x.canchaId === b.dataset.cancha)?.cancha ?? ""}`).join(" y ")}.` : `Se ocuparon ${salen.length} turnos.`);
      setTimeout(() => pintarGrilla(slots, { foco }), 320);
      S.slots = S.slots.filter((s) => ahora.has(`${s.inicio}|${s.canchaId}`));
      return;
    }
  }
  S.slots = slots;
  g.setAttribute("aria-busy", "false");
  if (!slots.length) {
    g.innerHTML = `<p class="vacio">No quedan canchas libres ${S.techadas ? "techadas " : ""}para ese día y duración. Probá otro día u otra duración, o anotate y te avisamos.</p>`;
    $("#espera").hidden = false;
    if (foco) $("#btn-espera").focus();
    return;
  }
  $("#espera").hidden = !$("#form-cel"); // si está cargando el celular, un repintado en vivo no se lo saca
  g.innerHTML = FRANJAS.map(([id, nombre, d, h]) => {
    const del = slots.filter((s) => s.inicio >= d && s.inicio < h);
    return del.length ? `<section class="franja" data-franja="${id}"><h2>${nombre}</h2><div class="slots">${del.map(htmlSlot).join("")}</div></section>` : "";
  }).join("");
  if (animar) for (const b of g.querySelectorAll(".slot")) if (!antes.has(`${b.dataset.inicio}|${b.dataset.cancha}`)) b.classList.add("is-nuevo");
  devolverFocoSlot(foco);
}
const anunciar = (t) => { $("#anuncio").textContent = t; };

async function cargarSlots({ animar = false, forzar = false } = {}) {
  const k = clave();
  const enCache = S.cache.get(k);
  if (enCache && !forzar) pintarGrilla(enCache);
  else if (!animar) $("#grilla").setAttribute("aria-busy", "true");
  const r = await api(`/api/turnero/disponibilidad?fecha=${S.fecha}&duracion=${S.duracion}&techadas=${S.techadas ? 1 : 0}`);
  if (k !== clave()) return; // el usuario ya cambió de día
  if (!r.ok) { if (!enCache) $("#grilla").innerHTML = `<p class="vacio" role="alert">${esc(r.motivo)}</p>`; return; }
  S.cache.set(k, r.slots);
  if (r.lluvia || r.mantenimiento?.length) $("#subtitulo").textContent = r.lluvia ? "Hoy llueve: las techadas siguen jugando ☔" : `En mantenimiento: ${r.mantenimiento.join(", ")}.`;
  pintarGrilla(r.slots, { animar: animar || Boolean(enCache) });
}

/** Precarga del día siguiente cuando el navegador está libre: el cambio de día se siente instantáneo. */
function precargar() {
  const i = S.config.dias.findIndex((d) => d.fecha === S.fecha);
  const sig = S.config.dias[i + 1];
  if (!sig) return;
  const k = `${sig.fecha}|${S.duracion}|${S.techadas ? 1 : 0}`;
  if (S.cache.has(k)) return;
  (window.requestIdleCallback ?? setTimeout)(async () => {
    const r = await api(`/api/turnero/disponibilidad?fecha=${sig.fecha}&duracion=${S.duracion}&techadas=${S.techadas ? 1 : 0}`);
    if (r.ok) S.cache.set(k, r.slots);
  });
}

// ───────────── reservar ─────────────
function abrirReserva(slot) {
  S.elegido = slot;
  // D25: la política se dice ANTES de reservar, y bien: si ya estamos dentro del plazo, no se promete lo que no hay.
  const h = S.config.politica.horasCancelacionLibre;
  const tarde = Date.now() > inicioEpoch(S.fecha, slot.inicio) - h * 3600000;
  $("#res-resumen").innerHTML = `<strong>${esc(slot.cancha)}</strong>${slot.techada ? " · techada" : ""}<br>${fechaLarga(S.fecha)} · ${hhmm(slot.inicio)} a ${hhmm(slot.fin)}<br><small>${tarde ? `Arranca en menos de ${h} h: si lo cancelás, la seña queda retenida (vuelve como crédito sólo si alguien toma el turno).` : `Cancelás sin costo hasta ${h} h antes.`}</small>`;
  $("#res-precio").textContent = pesos(slot.precio);
  const pct = S.config.politica.senaPct;
  const monto = pesos(Math.round((slot.precio * pct) / 10000) * 100);
  // El back sabe si a este jugador le corresponde seña (nuevo, con faltas, con deuda); sin sesión, se asume que sí.
  $("#res-sena").textContent = S.usuario && !S.usuario.pideSena ? "Sin seña: ya sos de la casa" : `${monto} (${pct}%) por transferencia`;
  $("#res-error").textContent = "";
  $("#btn-confirmar").disabled = false;
  abrir("#dlg-reserva");
}

async function confirmarReserva(ev) {
  ev.preventDefault();
  if (!S.usuario) { S.pendiente = () => confirmarReserva(ev); cerrar("#dlg-reserva"); abrirLogin(); return; }
  const s = S.elegido;
  const btn = $("#btn-confirmar");
  btn.disabled = true;
  const jugadores = $("#res-jugadores").value.split(/,|\s+y\s+/i).map((x) => x.trim()).filter(Boolean);
  // Misma clave para el mismo turno elegido: un reintento o un doble toque no crea dos reservas.
  s.idem ??= crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  const r = await api("/api/turnero/reservas", { metodo: "POST", idem: s.idem, cuerpo: { fecha: S.fecha, inicio: s.inicio, canchaId: s.canchaId, duracion: S.duracion, jugadores } });
  btn.disabled = false;
  if (!r.ok) {
    $("#res-error").innerHTML = `${esc(r.motivo)}${r.alternativas?.length ? `<span class="alternativas">${r.alternativas.map((a) => `<button type="button" class="alt" data-inicio="${a.inicio}" data-cancha="${esc(a.canchaId)}">${hhmm(a.inicio)} · ${esc(a.cancha)}</button>`).join("")}</span>` : ""}`;
    if (r.status === 409) { S.cache.delete(clave()); cargarSlots({ animar: true, forzar: true }); }
    if (r.status === 401) { S.usuario = null; pintarUsuario(); }
    return;
  }
  cerrar("#dlg-reserva");
  $("#res-jugadores").value = "";
  if (r.creditoUsado && S.usuario) { S.usuario.credito = Math.max(0, (S.usuario.credito ?? 0) - r.creditoUsado); aviso(`Usamos ${pesos(r.creditoUsado)} de tu crédito para la seña.`); }
  upsertReserva(r.reserva);
  if (r.reserva.estado === "pendiente") abrirPago(r.reserva);
  else aviso("¡Turno firme! Te esperamos 🎾");
}

// ───────────── seña ─────────────
function abrirPago(res) {
  S.pagoId = res.id;
  const d = $("#dlg-pago");
  d.classList.remove("is-firme");
  pintarPago(res);
  abrir("#dlg-pago");
}

function pintarPago(res) {
  const firme = res.estado === "firme";
  $("#pago-estado").textContent = firme ? "¡Turno firme!" : res.estado === "cancelada" ? "Se liberó" : "Esperando seña";
  $("#t-pago").textContent = firme ? "¡Nos vemos en la cancha!" : res.estado === "cancelada" ? "Este turno se liberó" : "Mandá la seña y listo";
  $("#dlg-pago").classList.toggle("is-firme", firme);
  // Ya pagado (o liberado), los datos para transferir sobran: queda el resumen y "Listo".
  for (const el of [$("#dlg-pago .datos"), $("#dlg-pago .instr"), $("#btn-whatsapp")]) if (el) el.hidden = firme || res.estado === "cancelada";
  // D24: si el botón con foco se escondió (pasó a firme), el foco va a «Listo», no al body.
  const d = $("#dlg-pago");
  if (d.open && (!d.contains(document.activeElement) || document.activeElement.closest("[hidden]") || document.activeElement.hidden)) $("#btn-cerrar-pago").focus();
  $("#pago-monto").textContent = pesos(res.sena.falta || res.sena.monto);
  $("#pago-alias").textContent = S.config.cuentas.alias;
  $("#pago-ref").textContent = res.ref ?? "—";
  const numero = S.config.whatsapp.numero ? String(S.config.whatsapp.numero).replace(/\D/g, "") : "";
  const texto = `¡Hola! Te mando el comprobante de la seña del turno ${res.ref ?? ""} (${res.cancha}, ${fechaLarga(res.fecha)} ${hhmm(res.inicio)}).`;
  $("#btn-whatsapp").href = `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
  // D22: sin número del club, WhatsApp abriría sin destinatario. En demo se acepta (no hay número real que poner);
  // fuera de la demo el back ni siquiera arranca sin TURNERO_WHATSAPP_CLUB, y por las dudas el botón no se muestra.
  if (!numero && !S.config.demo) $("#btn-whatsapp").hidden = true;
  $("#btn-simular").hidden = !S.config.demo || firme || res.estado === "cancelada";
  clearInterval(S.timer);
  // El texto se arma una vez; por segundo sólo cambia el mm:ss (no se re-anuncia todo el párrafo).
  const linea = $(".cuenta-reg");
  if (!firme && res.venceSena && res.estado === "pendiente") {
    const auto = res.liberarSinSena === "auto";
    linea.innerHTML = `${auto ? "Te sostenemos el turno" : "Mandá la seña en los próximos"} <span id="pago-cuenta" class="num" role="timer">--:--</span> min`;
    const cuenta = $("#pago-cuenta");
    const tic = () => {
      const s = Math.max(0, Math.round((res.venceSena - Date.now()) / 1000));
      cuenta.textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
      if (!s) { clearInterval(S.timer); linea.textContent = auto ? "Se venció el plazo de la seña." : "Se pasó el plazo: mandala igual y el club la confirma."; }
    };
    tic();
    S.timer = setInterval(tic, 1000);
  } else linea.textContent = firme ? "Ya está: nos vemos en la cancha." : res.estado === "cancelada" ? (res.motivoCancelacion ?? "") : "";
}

async function simularComprobante() {
  const b = $("#btn-simular");
  b.disabled = true;
  const r = await api(`/api/turnero/reservas/${S.pagoId}/simular-comprobante`, { metodo: "POST", cuerpo: { variante: "ok" } });
  b.disabled = false;
  if (!r.ok) aviso(r.motivo ?? "No se pudo simular.");
  else if (r.resultados?.[0]?.decision === "revisar") aviso("El club lo está revisando; te avisamos por WhatsApp.");
  // La confirmación llega por el canal en vivo (mi-reserva), igual que con un WhatsApp de verdad.
}

// ───────────── mis reservas ─────────────
function upsertReserva(r) {
  const i = S.reservas.findIndex((x) => x.id === r.id);
  if (i >= 0) S.reservas[i] = r; else S.reservas.push(r);
  S.reservas.sort((a, b) => (a.fecha + hhmm(a.inicio)).localeCompare(b.fecha + hhmm(b.inicio)));
  pintarReservas();
}

const ETIQUETA = { pendiente: "Falta la seña", firme: "Firme", cancelada: "Cancelada", jugada: "Jugada", falta: "Falta", "en-cancha": "En cancha", suspendida: "Suspendida" };
function pintarReservas() {
  const ul = $("#lista-reservas");
  const proximas = S.reservas.filter((r) => r.estado === "pendiente" || r.estado === "firme").length;
  if ($("#btn-mis")) $("#btn-mis").textContent = proximas ? `Mis turnos (${proximas})` : "Mis turnos";
  const cr = S.usuario?.credito ?? 0;
  $("#credito").hidden = !cr;
  if (cr) $("#credito").textContent = `Tenés ${pesos(cr)} de crédito a favor: se usa solo en tu próxima seña.`;
  if (!S.usuario) { ul.innerHTML = `<li class="reserva-vacia">Ingresá para ver tus reservas.</li>`; return; }
  const vivas = S.reservas.filter((r) => r.estado !== "cancelada" || r.motivoCancelacion);
  if (!vivas.length) { ul.innerHTML = `<li class="reserva-vacia">Todavía no tenés reservas.</li>`; return; }
  ul.innerHTML = vivas.map((r) => {
    const activa = r.estado === "pendiente" || r.estado === "firme";
    return `<li class="reserva" tabindex="-1" data-id="${esc(r.id)}" data-estado="${esc(r.estado)}">
      <span class="reserva-cuando">${fechaLarga(r.fecha)} · ${hhmm(r.inicio)}–${hhmm(r.fin)}</span>
      <span class="reserva-cancha">${esc(r.cancha)}${r.techada ? " · techada" : ""} · ${pesos(r.precio)}</span>
      <span class="badge">${ETIQUETA[r.estado] ?? r.estado}</span>
      ${r.estado === "cancelada" && r.motivoCancelacion ? `<small>${esc(r.motivoCancelacion)}</small>` : ""}
      ${r.estado === "pendiente" ? `<button type="button" class="btn-pagar">Pagar seña</button>` : ""}
      ${activa ? `<button type="button" class="btn-invitar">Invitar</button><button type="button" class="btn-cancelar-res">Cancelar</button>` : ""}
    </li>`;
  }).join("");
}

async function cargarReservas() {
  if (!S.usuario) { S.reservas = []; pintarReservas(); return; }
  const r = await api("/api/turnero/reservas");
  if (r.ok) { S.reservas = r.reservas; pintarReservas(); }
}

async function cancelarReserva(boton, id) {
  // Doble toque en vez de confirm(): accesible, sin ventana del sistema, y evita cancelaciones sin querer.
  if (boton.dataset.seguro !== "1") {
    const r = S.reservas.find((x) => x.id === id);
    const tarde = r && Date.now() > r.cancelacionLibreHasta;
    boton.dataset.seguro = "1";
    boton.textContent = tarde ? "Es tarde: la seña queda retenida. ¿Seguro?" : "¿Seguro? Tocá de nuevo";
    aviso(tarde ? `Ojo: ya es tarde para cancelar sin costo; ${TEXTO_TARDE}. Tocá de nuevo para confirmar.` : "Tocá de nuevo para confirmar la cancelación.");
    setTimeout(() => { if (boton.isConnected) { boton.dataset.seguro = ""; boton.textContent = "Cancelar"; } }, 4000);
    return;
  }
  boton.disabled = true;
  const r = await api(`/api/turnero/reservas/${id}`, { metodo: "DELETE" });
  if (!r.ok) { boton.disabled = false; aviso(r.motivo); return; }
  upsertReserva(r.reserva);
  if (S.usuario) S.usuario.credito = r.credito ?? S.usuario.credito;
  aviso(r.devuelto ? `Cancelado. Tenés ${pesos(r.credito ?? r.devuelto)} de crédito a favor: se usa solo en tu próxima seña.` : r.enSuspenso ? `Cancelado: ${TEXTO_TARDE}.` : "Turno cancelado.");
  S.cache.delete(clave());
  cargarSlots({ animar: true, forzar: true });
}

async function invitar(id) {
  const r = S.reservas.find((x) => x.id === id);
  const texto = `¡Jugamos! ${r.cancha} en Break Point, ${fechaLarga(r.fecha)} a las ${hhmm(r.inicio)} 🎾`;
  if (navigator.share) { try { await navigator.share({ text: texto }); return; } catch { /* lo cerró */ } }
  window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
}

// ───────────── ingreso ─────────────
function abrirLogin(registro = false) {
  $("#form-login").hidden = registro;
  $("#form-registro").hidden = !registro;
  $("#login-error").textContent = "";
  abrir("#dlg-login");
  (registro ? $("#reg-nombre") : $("#login-usuario")).focus();
  if (S.config?.google.clientId && !window.google) cargarGoogle();
}

function cargarGoogle() {
  const s = document.createElement("script");
  s.src = "https://accounts.google.com/gsi/client";
  s.async = true;
  s.onload = () => window.google?.accounts.id.initialize({ client_id: S.config.google.clientId, callback: (r) => entrar("/api/auth/google", { credential: r.credential }) });
  document.head.append(s);
}

async function entrar(ruta, cuerpo) {
  const r = await api(ruta, { metodo: "POST", cuerpo });
  if (!r.ok) { $("#login-error").textContent = r.motivo ?? "No pudimos entrar."; return; }
  S.usuario = r.usuario;
  cerrar("#dlg-login");
  pintarUsuario();
  conectarVivo();
  await cargarReservas();
  aviso(`¡Hola, ${r.usuario.nombre.split(" ")[0]}!`);
  const p = S.pendiente;
  S.pendiente = null;
  if (p) { abrir("#dlg-reserva"); p(); }
}

function pintarUsuario() {
  const u = S.usuario;
  $("#btn-ingresar").hidden = Boolean(u);
  const c = $("#usuario");
  c.hidden = !u;
  if (u) {
    // D26: «Mis reservas» a un toque desde arriba (en el celu, la lista queda debajo de la grilla).
    if (!$("#btn-salir")) c.innerHTML = `<a id="btn-mis" class="btn-head" href="#mis-reservas">Mis turnos</a><button id="btn-salir" type="button" class="btn-head">Salir</button>`;
    $("#btn-salir").title = `Salir (${u.nombre})`;
  }
  if (MODO_PEDIDO) $("#btn-ingresar").hidden = true; // sin cuentas: el turno se pide por WhatsApp
  pintarReservas();
}

// ───────────── tiempo real ─────────────
let fuente = null;
function conectarVivo() {
  fuente?.close();
  const ev = LOCAL ? LOCAL.fuente("/api/turnero/eventos") : new EventSource(`${API}/api/turnero/eventos`, { withCredentials: true });
  fuente = ev;
  const estado = (on) => { const el = $("#en-vivo"); el.classList.toggle("on", on); el.classList.toggle("off", !on); el.textContent = on ? "En vivo" : "Reconectando…"; };
  // Si se cortó (túnel, 4G que va y viene), al volver se re-pide todo: lo que pasó en el medio no se pierde.
  let caido = false;
  ev.onopen = () => { estado(true); if (caido) { caido = false; S.cache.clear(); cargarSlots({ animar: true, forzar: true }); cargarReservas(); } };
  ev.onerror = () => { caido = true; estado(false); };
  ev.addEventListener("disponibilidad", (e) => {
    const d = JSON.parse(e.data);
    for (const k of S.cache.keys()) if (k.startsWith(d.fecha)) S.cache.delete(k);
    if (d.fecha === S.fecha) cargarSlots({ animar: true, forzar: true });
  });
  ev.addEventListener("mi-reserva", (e) => {
    const { reserva } = JSON.parse(e.data);
    const antes = S.reservas.find((x) => x.id === reserva.id);
    upsertReserva(reserva);
    if (S.pagoId === reserva.id && $("#dlg-pago").open) pintarPago(reserva);
    if (antes?.estado === "pendiente" && reserva.estado === "firme") aviso("¡Recibimos la seña! Tu turno quedó firme 🎾");
    if (antes && antes.estado !== "cancelada" && reserva.estado === "cancelada") aviso(`Tu turno de las ${hhmm(reserva.inicio)} se liberó: ${reserva.motivoCancelacion ?? ""}`);
  });
  ev.addEventListener("espera", (e) => { const d = JSON.parse(e.data); aviso(`¡Se liberó ${hhmm(d.inicio)} el ${fechaLarga(d.fecha)}! Te mandamos un WhatsApp.`); });
}

// ───────────── eventos de la página ─────────────
function cablear() {
  $("#dias").addEventListener("click", (e) => { const b = e.target.closest(".dia"); if (b) { elegirDia(b.dataset.fecha); precargar(); } });
  $("#duracion").addEventListener("change", (e) => { S.duracion = Number(e.target.value); cargarSlots(); });
  $("#techadas").addEventListener("change", (e) => { S.techadas = e.target.checked; cargarSlots(); });
  $("#grilla").addEventListener("click", (e) => {
    const b = e.target.closest(".slot");
    if (!b || b.disabled) return;
    const s = S.slots.find((x) => String(x.inicio) === b.dataset.inicio && x.canchaId === b.dataset.cancha);
    if (s) (MODO_PEDIDO ? abrirPedido : abrirReserva)(s);
  });
  $("#res-error").addEventListener("click", (e) => {
    const b = e.target.closest(".alt");
    if (!b) return;
    const s = S.slots.find((x) => String(x.inicio) === b.dataset.inicio && x.canchaId === b.dataset.cancha);
    if (s) abrirReserva(s);
  });
  $("#form-reserva").addEventListener("submit", confirmarReserva);
  $("#btn-cancelar-dlg").addEventListener("click", () => cerrar("#dlg-reserva"));
  $("#btn-ingresar").addEventListener("click", () => abrirLogin());
  $("#usuario").addEventListener("click", async (e) => {
    if (!e.target.closest("#btn-salir")) return; await api("/api/auth/salir", { metodo: "POST", cuerpo: {} }); S.usuario = null; S.reservas = []; pintarUsuario(); conectarVivo(); aviso("Saliste de tu cuenta."); });
  $("#btn-google").addEventListener("click", async (ev) => {
    if (S.config.google.clientId && window.google) return window.google.accounts.id.prompt();
    // D37: mientras la demo cambia de pestaña servidor el ingreso puede tardar unos segundos: que se vea que está andando.
    const b = ev.currentTarget, texto = b.innerHTML;
    if (b.disabled) return;
    b.disabled = true;
    b.setAttribute("aria-busy", "true");
    b.textContent = "Entrando…";
    try { await entrar("/api/auth/google", { cuentaDemo: 0 }); } finally { b.disabled = false; b.removeAttribute("aria-busy"); b.innerHTML = texto; }
  });
  $("#form-login").addEventListener("submit", (e) => { e.preventDefault(); entrar("/api/auth/ingresar", { usuario: $("#login-usuario").value, clave: $("#login-clave").value }); });
  $("#form-registro").addEventListener("submit", (e) => { e.preventDefault(); entrar("/api/auth/registro", { nombre: $("#reg-nombre").value, tel: $("#reg-tel").value, email: $("#reg-email").value || undefined, clave: $("#reg-clave").value }); });
  $("#btn-ir-registro").addEventListener("click", () => abrirLogin(true));
  $("#btn-ir-login").addEventListener("click", () => abrirLogin(false));
  $("#btn-copiar-alias").addEventListener("click", () => copiar($("#pago-alias").textContent, "Alias copiado"));
  $("#btn-copiar-ref").addEventListener("click", () => copiar($("#pago-ref").textContent, "Código copiado"));
  $("#btn-simular").addEventListener("click", simularComprobante);
  $("#btn-cerrar-pago").addEventListener("click", () => cerrar("#dlg-pago"));
  // D24: al cerrar la seña (con «Listo» o Esc) el foco va a la reserva en «Mis reservas», no al body.
  $("#dlg-pago").addEventListener("close", () => {
    clearInterval(S.timer);
    const li = S.pagoId && $(`#lista-reservas .reserva[data-id="${CSS.escape(S.pagoId)}"]`);
    (li || $("#t-mis")).focus();
  });
  // D26/D30: «Mis reservas» desde arriba (botón del encabezado y enlace para saltar) deja el foco en la sección.
  document.addEventListener("click", (e) => {
    if (!e.target.closest('a[href="#mis-reservas"]')) return;
    e.preventDefault();
    $("#mis-reservas").scrollIntoView({ behavior: quieto() ? "auto" : "smooth", block: "start" });
    $("#t-mis").focus({ preventScroll: true });
  });
  // D30: en la tira de días, el día con foco se ve entero, y las flechas (← →, Inicio, Fin) se mueven entre días.
  $("#dias").addEventListener("focusin", (e) => e.target.closest(".dia")?.scrollIntoView({ block: "nearest", inline: "nearest" }));
  $("#dias").addEventListener("keydown", (e) => {
    const dias = [...$("#dias").querySelectorAll(".dia")];
    const i = dias.indexOf(document.activeElement);
    if (i < 0) return;
    const j = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: dias.length - 1 }[e.key];
    if (j == null || !dias[j]) return;
    e.preventDefault();
    dias[j].focus();
  });
  $("#lista-reservas").addEventListener("click", (e) => {
    const li = e.target.closest(".reserva");
    if (!li) return;
    const id = li.dataset.id;
    if (e.target.closest(".btn-pagar")) abrirPago(S.reservas.find((x) => x.id === id));
    else if (e.target.closest(".btn-invitar")) invitar(id);
    else if (e.target.closest(".btn-cancelar-res")) cancelarReserva(e.target.closest(".btn-cancelar-res"), id);
  });
  $("#btn-espera").addEventListener("click", () => (MODO_PEDIDO ? preguntarPorWhatsApp() : anotarEspera()));
  $("#ped-cancha").addEventListener("change", () => armarPedido());
  $("#ped-nombre").addEventListener("input", armarPedido);
  $("#ped-wa").addEventListener("click", (e) => { if (!armarPedido({ validar: true })) e.preventDefault(); });
  $("#form-pedido").addEventListener("submit", (e) => { e.preventDefault(); if (armarPedido({ validar: true })) $("#ped-wa").click(); });
  // Tienda: se descarga recién cuando se abre (/turnero#tienda o el botón del encabezado).
  addEventListener("hashchange", () => { if (location.hash === "#tienda") abrirTienda(); });
  $("#btn-tienda").addEventListener("click", (e) => { e.preventDefault(); if (location.hash !== "#tienda") history.replaceState(null, "", "#tienda"); abrirTienda(); });
  // Volver a la pestaña después de transferir desde la app del banco: refresco inmediato.
  document.addEventListener("visibilitychange", () => { if (!document.hidden && S.config) { cargarSlots({ animar: true, forzar: true }); cargarReservas(); } });
}

async function copiar(texto, ok) {
  try { await navigator.clipboard.writeText(texto); aviso(ok); } catch { aviso(texto); }
}

async function anotarEspera() {
  if (!S.usuario) { S.pendiente = anotarEspera; abrirLogin(); return; }
  const dia = S.config.dias.find((d) => d.fecha === S.fecha);
  const r = await api("/api/turnero/espera", { metodo: "POST", cuerpo: { fecha: S.fecha, desde: dia.abre, hasta: dia.cierra - S.duracion, duracion: S.duracion, techadas: S.techadas } });
  if (r.ok) { aviso("¡Listo! Si se libera un turno ese día, te avisamos por WhatsApp."); return; }
  if (/celular/i.test(r.motivo ?? "")) return pedirCelular();
  aviso(r.motivo);
}

/** Entró con Google (no da el celular): se lo pedimos ahí mismo, con un campo de verdad (no un prompt()). */
function pedirCelular() {
  const caja = $("#espera");
  if ($("#form-cel")) return $("#esp-tel").focus();
  const f = document.createElement("form");
  f.id = "form-cel";
  f.className = "campo";
  f.innerHTML = `<label for="esp-tel">¿A qué celular te avisamos por WhatsApp?</label><input id="esp-tel" type="tel" inputmode="tel" autocomplete="tel" placeholder="11 6187 0066" required><p id="esp-err" class="error" role="alert"></p><button type="submit" class="btn btn-pri">Guardar y anotarme</button>`;
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const c = await api("/api/auth/celular", { metodo: "POST", cuerpo: { tel: $("#esp-tel").value } });
    if (!c.ok) { $("#esp-err").textContent = c.motivo; return; }
    S.usuario = c.usuario;
    f.remove();
    anotarEspera();
  });
  caja.append(f);
  $("#esp-tel").focus();
}

// ───────────── modo pedido por WhatsApp ─────────────
/**
 * En modo pedido la disponibilidad es de referencia: un turno por horario (no uno por cancha, que en el celular
 * son cientos de botones). La cancha se elige en el diálogo; «cualquiera» es lo más común.
 */
function porHorario(slots) {
  if (slots.some((s) => s.opciones)) return slots; // ya agrupados (repintado después de una animación)
  const grupos = new Map();
  for (const s of slots) (grupos.get(s.inicio) ?? grupos.set(s.inicio, []).get(s.inicio)).push(s);
  return [...grupos.values()].map((ops) => {
    const min = Math.min(...ops.map((x) => x.precio));
    return { ...ops[0], cancha: ops.length === 1 ? ops[0].cancha : `${ops.length} canchas`, techada: ops.some((x) => x.techada), pico: ops.some((x) => x.pico), precio: min, desde: ops.some((x) => x.precio !== min), opciones: ops };
  });
}

function abrirPedido(slot) {
  S.elegido = slot;
  const ops = slot.opciones ?? [slot];
  $("#ped-cancha").innerHTML = (ops.length > 1 ? `<option value="">Cualquier cancha</option>` : "") + ops.map((o) => `<option value="${esc(o.canchaId)}">${esc(o.cancha)}${o.techada ? " · techada" : ""} · ${pesos(o.precio)}</option>`).join("");
  $("#ped-error").textContent = "";
  $("#ped-nombre").removeAttribute("aria-invalid");
  $("#ped-sin-wa").hidden = Boolean(WA);
  armarPedido();
  abrir("#dlg-pedido");
}

/** Resumen, precio de referencia y link de WhatsApp del turno elegido. Con `validar`, exige el nombre. */
function armarPedido({ validar = false } = {}) {
  const s = S.elegido;
  if (!s) return false;
  const ops = s.opciones ?? [s];
  const elegida = ops.find((o) => o.canchaId === $("#ped-cancha").value) ?? (ops.length === 1 ? ops[0] : null);
  // «Cualquier cancha»: el precio puede cambiar de una cancha a otra (techada, pico): se muestra el rango.
  const precios = (elegida ? [elegida] : ops).map((x) => x.precio);
  const min = Math.min(...precios), max = Math.max(...precios);
  const precio = min === max ? pesos(min) : `${pesos(min)} a ${pesos(max)}`;
  const cancha = elegida ? `la ${elegida.cancha}${elegida.techada ? " (techada)" : ""}` : "cualquier cancha";
  $("#ped-resumen").innerHTML = `<strong>${elegida ? esc(elegida.cancha) : "Cualquier cancha"}</strong>${elegida?.techada ? " · techada" : ""}<br>${fechaLarga(S.fecha)} · ${hhmm(s.inicio)} a ${hhmm(s.fin)} (${durTexto(S.duracion)})`;
  $("#ped-precio").textContent = precio;
  const nombre = $("#ped-nombre").value.trim();
  $("#ped-wa").href = linkWa(`Hola Break Point, quiero el turno del ${fechaLarga(S.fecha)} a las ${hhmm(s.inicio)} (${durTexto(S.duracion)}) en ${cancha}. Precio de referencia: ${precio}.${nombre ? ` Soy ${nombre}.` : ""}`);
  if (!validar) return true;
  const falta = !nombre;
  $("#ped-error").textContent = falta ? "Poné tu nombre así el club sabe quién pide." : "";
  if (falta) { $("#ped-nombre").setAttribute("aria-invalid", "true"); $("#ped-nombre").focus(); } else $("#ped-nombre").removeAttribute("aria-invalid");
  return !falta;
}

/** Sin horarios libres con esos filtros: en vez de una lista de espera que acá no existe, se le pregunta al club. */
function preguntarPorWhatsApp() {
  window.open(linkWa(`Hola Break Point, ¿tienen algún turno el ${fechaLarga(S.fecha)} (${durTexto(S.duracion)})${S.techadas ? " en cancha techada" : ""}?`), "_blank", "noopener");
}

/** Lo que cambia en la página en modo pedido: sin ingreso, sin «Mis turnos», sin «en vivo» ni promesas que no pasan. */
function prepararModoPedido() {
  document.body.dataset.modo = "pedido";
  const vivo = $("#en-vivo");
  vivo.classList.remove("on", "off");
  vivo.classList.add("pedido");
  vivo.textContent = "Pedido por WhatsApp";
  $("#cinta").textContent = "Horarios y precios de referencia: el club te confirma por WhatsApp";
  $("#subtitulo").textContent = "Horarios y precios de referencia · la disponibilidad te la confirma el club.";
  for (const el of [$("#btn-ingresar"), $("#usuario"), $("#mis-reservas"), $(".saltar"), $("#btn-google"), $("#btn-simular")]) if (el) el.hidden = true;
  $("#como-pasos").innerHTML = "<li><b>Elegí</b> el día, el horario y la duración.</li><li><b>Pedilo por WhatsApp</b> con tu nombre: el mensaje sale armado.</li><li><b>El club te confirma</b> y te pasa el alias para la seña.</li>";
  $("#espera p").textContent = "No vemos canchas libres con estos filtros. Preguntale al club por WhatsApp: a veces se libera algo.";
  $("#btn-espera").textContent = "Preguntar por WhatsApp";
}

// ───────────── tienda (módulo aparte, carga diferida) ─────────────
let arranque = null;
async function abrirTienda() {
  await arranque;
  if (!S.config) return aviso("La tienda no está disponible en este momento.");
  const t = await import("./tienda.mjs");
  t.abrirTienda({ api, wa: WA, alCerrar: () => { if (location.hash === "#tienda") history.replaceState(null, "", location.pathname + location.search); } });
}

// ───────────── arranque ─────────────
/** Fuentes de la marca sin bloquear el render (y sin manejadores inline: la CSP no permite scripts inline). */
function cargarFuentes() {
  for (const href of [
    "https://fonts.googleapis.com/css2?family=Anton&display=swap&text=ABCDEFGHIJKLMNOPQRSTUVWXYZ%C3%81%C3%89%C3%8D%C3%93%C3%9A%C3%91%C3%9C0123456789%C2%A1!%C2%BF%3F%24.%2C%3A-%20",
    "https://fonts.googleapis.com/css2?family=Montserrat:wght@500&display=swap&text=BREAKPOINTDL",
  ]) { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = href; document.head.append(l); }
}

async function iniciar() {
  cargarFuentes();
  cablear();
  if (!API) {
    document.body.dataset.estado = "sin-conexion";
    $("#en-vivo").textContent = "Sin conexión";
    $("#grilla").innerHTML = `<p class="vacio" role="alert">El turnero no está configurado todavía. Escribinos por WhatsApp y te reservamos.</p>`;
    $("#grilla").setAttribute("aria-busy", "false");
    return;
  }
  if (MODO_PEDIDO) { prepararModoPedido(); LOCAL = (await import("./local.mjs")).crearLocalPedido(); }
  else if (API === "local") LOCAL = await (await import("./local.mjs")).crearLocal();
  const [cfg, yo] = await Promise.all([api("/api/turnero/config"), api("/api/auth/yo")]);
  if (!cfg.club) {
    document.body.dataset.estado = "sin-conexion";
    $("#en-vivo").textContent = "Sin conexión";
    $("#dias").innerHTML = "";
    $("#grilla").innerHTML = `<p class="vacio" role="alert">No pudimos conectar con el club. Probá de nuevo en un rato o escribinos por WhatsApp.</p>`;
    $("#grilla").setAttribute("aria-busy", "false");
    return;
  }
  S.config = cfg;
  S.usuario = yo.usuario ?? null;
  S.fecha = qs.get("fecha") && cfg.dias.some((d) => d.fecha === qs.get("fecha")) ? qs.get("fecha") : cfg.dias[0].fecha;
  S.duracion = Number($('#duracion input:checked')?.value ?? 90);
  pintarDias();
  pintarUsuario();
  await cargarSlots();
  document.body.dataset.estado = "listo";
  if (!MODO_PEDIDO) { conectarVivo(); cargarReservas(); }
  precargar();
}

arranque = iniciar();
if (location.hash === "#tienda") abrirTienda();
