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
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES_LARGOS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const pesos = (n) => `$${Math.round(n).toLocaleString("es-AR")}`;
const hhmm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fechaLarga = (f) => { const [a, m, d] = f.split("-").map(Number); return `${DIAS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]} ${d} ${MESES[m - 1]}`; };
const quieto = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

const S = { config: null, fecha: null, duracion: 90, techadas: false, usuario: null, reservas: [], slots: [], cache: new Map(), pendiente: null, elegido: null, pagoId: null, timer: null };

// ───────────── API ─────────────
async function api(ruta, { metodo = "GET", cuerpo, idem } = {}) {
  if (LOCAL) return LOCAL.api(ruta, { metodo, cuerpo });
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
  return `<button type="button" class="slot" data-inicio="${s.inicio}" data-cancha="${esc(s.canchaId)}" data-pico="${s.pico ? 1 : 0}"><span class="slot-hora">${hhmm(s.inicio)}</span><span class="sr"> a ${hhmm(s.fin)}, </span><span class="slot-cancha">${esc(s.cancha)}</span><span class="slot-tags">${s.techada ? '<span class="sr">, </span><span class="tag tag-techada">Techada</span>' : ""}${s.pico ? '<span class="sr">, </span><span class="tag tag-pico">Pico</span>' : ""}</span><span class="sr">, </span><span class="slot-precio">${pesos(s.precio)}</span></button>`;
}

function pintarGrilla(slots, { animar = false } = {}) {
  const g = $("#grilla");
  const antes = new Set(S.slots.map((s) => `${s.inicio}|${s.canchaId}`));
  const ahora = new Set(slots.map((s) => `${s.inicio}|${s.canchaId}`));
  // Lo que alguien acaba de tomar sale con animación (dolor: "lo veía libre y era mentira").
  if (animar && !quieto()) {
    const salen = [...g.querySelectorAll(".slot")].filter((b) => !ahora.has(`${b.dataset.inicio}|${b.dataset.cancha}`));
    if (salen.length) {
      salen.forEach((b) => { b.classList.add("is-saliendo"); b.disabled = true; });
      setTimeout(() => pintarGrilla(slots), 320);
      S.slots = S.slots.filter((s) => ahora.has(`${s.inicio}|${s.canchaId}`));
      return;
    }
  }
  S.slots = slots;
  g.setAttribute("aria-busy", "false");
  if (!slots.length) {
    g.innerHTML = `<p class="vacio">No quedan canchas libres ${S.techadas ? "techadas " : ""}para ese día y duración. Probá otro día u otra duración, o anotate y te avisamos.</p>`;
    $("#espera").hidden = false;
    return;
  }
  $("#espera").hidden = !$("#form-cel"); // si está cargando el celular, un repintado en vivo no se lo saca
  g.innerHTML = FRANJAS.map(([id, nombre, d, h]) => {
    const del = slots.filter((s) => s.inicio >= d && s.inicio < h);
    return del.length ? `<section class="franja" data-franja="${id}"><h2>${nombre}</h2><div class="slots">${del.map(htmlSlot).join("")}</div></section>` : "";
  }).join("");
  if (animar) for (const b of g.querySelectorAll(".slot")) if (!antes.has(`${b.dataset.inicio}|${b.dataset.cancha}`)) b.classList.add("is-nuevo");
}

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
  $("#res-resumen").innerHTML = `<strong>${esc(slot.cancha)}</strong>${slot.techada ? " · techada" : ""}<br>${fechaLarga(S.fecha)} · ${hhmm(slot.inicio)} a ${hhmm(slot.fin)}<br><small>Cancelás sin costo hasta ${S.config.politica.horasCancelacionLibre} h antes.</small>`;
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
  $("#pago-monto").textContent = pesos(res.sena.falta || res.sena.monto);
  $("#pago-alias").textContent = S.config.cuentas.alias;
  $("#pago-ref").textContent = res.ref ?? "—";
  const numero = S.config.whatsapp.numero ? String(S.config.whatsapp.numero).replace(/\D/g, "") : "";
  const texto = `¡Hola! Te mando el comprobante de la seña del turno ${res.ref ?? ""} (${res.cancha}, ${fechaLarga(res.fecha)} ${hhmm(res.inicio)}).`;
  $("#btn-whatsapp").href = `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
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
  if (!S.usuario) { ul.innerHTML = `<li class="reserva-vacia">Ingresá para ver tus reservas.</li>`; return; }
  const vivas = S.reservas.filter((r) => r.estado !== "cancelada" || r.motivoCancelacion);
  if (!vivas.length) { ul.innerHTML = `<li class="reserva-vacia">Todavía no tenés reservas.</li>`; return; }
  ul.innerHTML = vivas.map((r) => {
    const activa = r.estado === "pendiente" || r.estado === "firme";
    return `<li class="reserva" data-id="${esc(r.id)}" data-estado="${esc(r.estado)}">
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
    setTimeout(() => { if (boton.isConnected) { boton.dataset.seguro = ""; boton.textContent = "Cancelar"; } }, 4000);
    return;
  }
  boton.disabled = true;
  const r = await api(`/api/turnero/reservas/${id}`, { metodo: "DELETE" });
  if (!r.ok) { boton.disabled = false; aviso(r.motivo); return; }
  upsertReserva(r.reserva);
  aviso(r.devuelto ? `Cancelado. Te quedan ${pesos(r.devuelto)} de crédito en el club.` : r.enSuspenso ? "Cancelado. Si alguien toma el turno, la seña vuelve como crédito." : "Turno cancelado.");
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
    if (!$("#btn-salir")) c.innerHTML = `<span class="usuario-nombre"></span><button id="btn-salir" type="button" class="btn-head">Salir</button>`;
    c.querySelector(".usuario-nombre").textContent = u.nombre.split(" ")[0];
  }
  pintarReservas();
}

// ───────────── tiempo real ─────────────
let fuente = null;
function conectarVivo() {
  fuente?.close();
  const ev = LOCAL ? LOCAL.fuente() : new EventSource(`${API}/api/turnero/eventos`, { withCredentials: true });
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
    if (s) abrirReserva(s);
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
  $("#btn-google").addEventListener("click", () => {
    if (S.config.google.clientId && window.google) window.google.accounts.id.prompt();
    else entrar("/api/auth/google", { cuentaDemo: 0 });
  });
  $("#form-login").addEventListener("submit", (e) => { e.preventDefault(); entrar("/api/auth/ingresar", { usuario: $("#login-usuario").value, clave: $("#login-clave").value }); });
  $("#form-registro").addEventListener("submit", (e) => { e.preventDefault(); entrar("/api/auth/registro", { nombre: $("#reg-nombre").value, tel: $("#reg-tel").value, email: $("#reg-email").value || undefined, clave: $("#reg-clave").value }); });
  $("#btn-ir-registro").addEventListener("click", () => abrirLogin(true));
  $("#btn-ir-login").addEventListener("click", () => abrirLogin(false));
  $("#btn-copiar-alias").addEventListener("click", () => copiar($("#pago-alias").textContent, "Alias copiado"));
  $("#btn-copiar-ref").addEventListener("click", () => copiar($("#pago-ref").textContent, "Código copiado"));
  $("#btn-simular").addEventListener("click", simularComprobante);
  $("#btn-cerrar-pago").addEventListener("click", () => { clearInterval(S.timer); cerrar("#dlg-pago"); });
  $("#lista-reservas").addEventListener("click", (e) => {
    const li = e.target.closest(".reserva");
    if (!li) return;
    const id = li.dataset.id;
    if (e.target.closest(".btn-pagar")) abrirPago(S.reservas.find((x) => x.id === id));
    else if (e.target.closest(".btn-invitar")) invitar(id);
    else if (e.target.closest(".btn-cancelar-res")) cancelarReserva(e.target.closest(".btn-cancelar-res"), id);
  });
  $("#btn-espera").addEventListener("click", anotarEspera);
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
    $("#grilla").innerHTML = `<p class="vacio" role="alert">El turnero no está configurado todavía. Escribinos por WhatsApp y te reservamos.</p>`;
    $("#grilla").setAttribute("aria-busy", "false");
    return;
  }
  if (API === "local") LOCAL = (await import("./local.mjs")).crearLocal();
  const [cfg, yo] = await Promise.all([api("/api/turnero/config"), api("/api/auth/yo")]);
  if (!cfg.club) {
    document.body.dataset.estado = "sin-conexion";
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
  conectarVivo();
  cargarReservas();
  precargar();
}

iniciar();
