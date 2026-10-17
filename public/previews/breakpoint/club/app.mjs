// GESTIÓN DEL CLUB — Break Point Pádel (demo del flujo). Toda la regla de negocio vive en motor.mjs;
// este archivo sólo pinta y conecta botones. En la demo el estado vive en memoria; en la jornada real (?modo=real) se
// guarda en el navegador de esa compu (guardarJornada) y nunca sale de ahí.
import * as M from "./motor.mjs";
import { morph } from "./morph.mjs";

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const pad = (n) => String(n).padStart(2, "0");
const hoyLocal = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const fechaCorta = (f) => { const [, m, d] = f.split("-"); return `${DIAS[M.diaSemana(f)]} ${Number(d)}/${Number(m)}`; };
const ddmm = (f) => `${Number(f.slice(8))}/${Number(f.slice(5, 7))}`;
// En la demo el WhatsApp abre sin número (elegís el contacto): los teléfonos de ejemplo podrían ser de alguien real.
const wa = (texto) => M.linkWhatsApp("", texto);
const ROW = 30;
const MEDIOS_CAJA = ["efectivo", "mercadopago", "transferencia", "debito"];

let E, AHORA, VISTA, HOY, USUARIO = "u-lu", TAB = "agenda";
let ALERTAS = [];
const ui = { medio: "efectivo", carrito: {}, busca: {}, producto: {}, mes: null, remito: null, pendienteCredito: null, stockModo: "inventario" };
// «Deshacer»: foto del estado antes de la acción que se está ejecutando (sólo las operativas, nunca las que piden PIN).
let PREVIO = null, UNDO = null, timerToast = null;
const DESHACIBLES = new Set(["pagar", "pagarParte", "consumo", "sumarJugador", "sumarJugadorFicha", "checkin", "finalizar", "aCuenta", "marcarFalta", "cancelar", "liberarFijo", "mover", "extender", "interrumpir", "cargarCuenta", "rapido", "pagarCuenta", "cerrarCuenta", "cobrarMostrador", "confirmarTurno", "asignarEspera", "anotarEspera", "luz", "qm", "devuelto", "cobrarFalta", "abrirCuentaCliente", "abrirCuentaLibre", "confirmarCredito", "ajustar", "pasarCargo", "cargoManual", "cobrarParte", "cobrarJugador", "cobrarTodo", "cerrarYSeguir", "cerrarCargos", "cerrarCargosCC", "entregarPedido", "cancelarPedido"]);
const SOPORTA_POPOVER = typeof HTMLElement !== "undefined" && "showPopover" in HTMLElement.prototype;
const sinMovimiento = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
// Transición nativa del navegador (View Transitions) para cambiar de pestaña o de día: 150 ms, nunca obligatoria.
function conVT(fn) {
  if (!document.startViewTransition || sinMovimiento() || document.hidden) return fn();
  const vt = document.startViewTransition(fn);
  vt.ready.catch(() => {}); vt.updateCallbackDone.catch(() => {});
  return vt;
}

const TABS = [
  { id: "agenda", nombre: "Agenda", permiso: "agenda" },
  { id: "buffet", nombre: "Buffet", permiso: "buffet" },
  { id: "caja", nombre: "Caja", permiso: "cerrarCaja" },
  { id: "clientes", nombre: "Clientes", permiso: "clientes" },
  { id: "tablero", nombre: "Tablero", permiso: "metricas" },
  { id: "proveedores", nombre: "Proveedores", permiso: "verProveedores" },
  { id: "stock", nombre: "Stock", permiso: "stock" },
  { id: "contenido", nombre: "Novedades y redes", permiso: "contenido" },
  { id: "ajustes", nombre: "Configuración", permiso: "configurar" },
];

// Pestañas según el rol: hasta 5 a la vista y el resto en «Más». El dueño arranca por su Tablero.
function pestanias() {
  const permitidas = TABS.filter((t) => puedo(t.permiso));
  const orden = permitidas.some((t) => t.id === "tablero") ? [permitidas.find((t) => t.id === "tablero"), ...permitidas.filter((t) => t.id !== "tablero")] : permitidas;
  if (orden.length <= 5 || !SOPORTA_POPOVER) return { orden, principales: orden, mas: [] };
  return { orden, principales: orden.slice(0, 5), mas: orden.slice(5) };
}

// Los 5 estilos visuales (plan en docs/tenants/breakpoint/ESTILOS.md) + el original para comparar.
const ESTILOS = [
  { id: "chapa", nombre: "Chapa", desc: "Cartel esmaltado de club: azul pleno, letra angosta, filete naranja.", muestra: ["#035BA8", "#DC6E22", "#F8F9FA"] },
  { id: "marcador", nombre: "Marcador", desc: "Gráfica de transmisión: reloj de TV y franjas. Ideal de noche.", muestra: ["#0F1216", "#DC6E22", "#4DA3F5"] },
  { id: "cesped", nombre: "Césped", desc: "La cancha: turnos pintados en azul y líneas blancas.", muestra: ["#1766C2", "#FFFFFF", "#DC6E22"] },
  { id: "bodegon", nombre: "Bodegón", desc: "La comanda de Delicias: papel, letra con serifa y sello DEBE.", muestra: ["#FBF6EC", "#2A1F14", "#A6261B"] },
  { id: "galpon", nombre: "Galpón", desc: "Chapa y naranja de seguridad, letra hiperlegible para la noche.", muestra: ["#2A2E32", "#DC6E22", "#F2F3F4"] },
  { id: "original", nombre: "Original", desc: "El diseño anterior, para comparar.", muestra: ["#FFFDF8", "#035BA8", "#DC6E22"] },
];
const estiloActual = () => document.documentElement.dataset.estilo || "original";
function elegirEstilo(id) {
  if (SOPORTA_POPOVER && $("#estilo-menu").matches(":popover-open")) $("#estilo-menu").hidePopover();
  if (id === estiloActual()) return;
  conVT(() => { window.bpAplicarEstilo?.(id); render(); });
  toast(`Estilo «${ESTILOS.find((x) => x.id === id)?.nombre ?? id}».`);
}

const yo = () => M.usuario(E, USUARIO);
const minutosBloqueo = () => E?.config?.bloqueoMin ?? 5;
const puedo = (accion) => M.puede(E, USUARIO, accion);
const auth = (pin) => ({ usuarioId: USUARIO, pin });
const esDuenio = () => yo()?.rol === "duenio";

// ───── jornada real: se guarda en ESTE dispositivo (sin servidor) ─────
// Por defecto /club es la demo. La jornada real se activa a propósito (Ajustes, con PIN de dueño, o /club?modo=real):
// arranca en blanco, se guarda sola en el navegador, vuelve bloqueada al recargar y usa el reloj real.
const CLAVE_JORNADA = "bp-jornada-v1", CLAVE_MODO = "bp-modo", CLAVE_CONTACTOS = "bp-contactos";
const lsLeer = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsGuardar = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); return true; } catch { return false; } };
// En el sitio del club (<meta name="bp-ambiente" content="real">) /club ES la gestión real; la demo para prospectos
// queda con ?demo=1 (sólo esa visita, no cambia nada guardado). Fuera del sitio (vista previa), demo salvo ?modo=real.
const Q = new URLSearchParams(location.search);
const AMBIENTE_REAL = document.querySelector('meta[name="bp-ambiente"]')?.content === "real";
const MODO_REAL = Q.get("demo") !== "1" && (Q.get("modo") === "real" || lsLeer(CLAVE_MODO) === "real" || (AMBIENTE_REAL && lsLeer(CLAVE_MODO) !== "demo"));
if (MODO_REAL) lsGuardar(CLAVE_MODO, "real"); // la compu queda en jornada real (se vuelve a la demo desde Configuración)
const guardado = { habilitado: false, cuando: null, ok: true, bytes: 0, timer: null, fuera: false, avisado: false };
const contactos = () => { try { return JSON.parse(lsLeer(CLAVE_CONTACTOS) || "{}") ?? {}; } catch { return {}; } };
const waA = (quien, texto) => M.linkWhatsApp(contactos()[quien] ?? "", texto);

function leerJornada() {
  try { return JSON.parse(lsLeer(CLAVE_JORNADA) || "null"); } catch { return null; }
}
function fotoJornada() {
  return JSON.stringify({ ...M.serializarEstado(E), usuario: USUARIO, guardado: Date.now() });
}
function guardarJornada(inmediato = false) {
  if (!MODO_REAL || !E || !guardado.habilitado || guardado.fuera) return;
  clearTimeout(guardado.timer);
  const hacer = () => {
    let txt = fotoJornada();
    let ok = lsGuardar(CLAVE_JORNADA, txt);
    if (!ok) {
      // Falta lugar: se recorta la historia vieja (el registro) y se vuelve a probar.
      E.log.length = Math.min(E.log.length, 60);
      txt = fotoJornada();
      ok = lsGuardar(CLAVE_JORNADA, txt);
    }
    guardado.ok = ok;
    if (ok) { guardado.cuando = new Date(); guardado.bytes = txt.length; guardado.avisado = false; }
    else if (!guardado.avisado) { guardado.avisado = true; toast("No se pudo guardar en esta compu. Descargá un respaldo ya (Ajustes → Jornada real).", { error: true }); }
    pintarGuardado();
  };
  if (inmediato) hacer(); else guardado.timer = setTimeout(hacer, 300);
}
function pintarGuardado() {
  const el = $("#guardado");
  if (!el) return;
  el.textContent = !guardado.ok ? "⚠ no se pudo guardar" : guardado.cuando ? `guardado ${pad(guardado.cuando.getHours())}:${pad(guardado.cuando.getMinutes())}` : "guardando…";
  el.classList.toggle("err", !guardado.ok);
}
function descargarRespaldo() {
  guardarJornada(true);
  const d = new Date();
  const nombre = `breakpoint-jornada-${hoyLocal()}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
  const url = URL.createObjectURL(new Blob([fotoJornada()], { type: "application/json" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: nombre });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast(`Respaldo descargado: ${nombre}. Guardalo (o mandátelo por WhatsApp).`);
}

// Studio de redes (imágenes y textos para Instagram/WhatsApp): se carga recién cuando se abre.
function abrirElStudio(pieza) {
  import("./studio.mjs")
    .then((m) => m.abrirStudio({
      pieza,
      alGuardar: (pub) => {
        const res = M.agregarContenido(E, { fecha: pub.fecha ?? HOY, hora: pub.hora ?? "19:00", canal: pub.canal === "historia" ? "historia" : "post", titulo: pub.titulo, texto: pub.texto ?? "", estado: "programado" }, auth());
        if (!res.ok) return toast(res.motivo, { error: true }), false;
        render();
        toast("Guardado en el calendario de Novedades y redes.");
        return true;
      },
      alCerrar: () => render(),
    }))
    .catch(() => toast("No se pudo abrir el Studio.", { error: true }));
}

/**
 * Reloj real del club. De madrugada (antes del cierre de ayer, ej. 00:30 con cierre a la 01:00) sigue siendo el
 * día que abrió: la agenda muestra esos turnos como «01:00» del día anterior, igual que el motor.
 */
function relojReal() {
  const d = new Date();
  const f = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const m = d.getHours() * 60 + d.getMinutes();
  const ayer = M.sumarDias(f, -1);
  if (E && m + 1440 < M.horarioDe(E, ayer).cierra) return { fecha: ayer, min: m + 1440 };
  return { fecha: f, min: m };
}
function latirReloj() {
  if (!MODO_REAL || !E || guardado.fuera) return;
  const t = relojReal();
  if (t.fecha === AHORA.fecha && t.min === AHORA.min) return;
  const viejo = HOY;
  AHORA = t;
  if (t.fecha !== viejo) {
    HOY = t.fecha;
    if (VISTA === viejo) VISTA = HOY;
    for (let d = 1; d <= 6; d++) M.materializarFijos(E, M.sumarDias(HOY, d));
    render();
    return toast(`Cambió el día: la agenda pasó al ${ddmm(HOY)}.`);
  }
  render();
}

function iniciar() {
  HOY = hoyLocal();
  if (MODO_REAL) {
    const foto = leerJornada();
    const h = foto ? M.hidratarEstado(foto) : null;
    E = h?.ok ? h.estado : M.crearClubReal(HOY);
    USUARIO = foto?.usuario && M.usuario(E, foto.usuario)?.activo !== false ? foto.usuario : E.usuarios.find((u) => u.activo !== false)?.id;
    AHORA = relojReal();
    HOY = AHORA.fecha;
    if (foto && !h.ok) lsGuardar(`${CLAVE_JORNADA}-ilegible-${Date.now()}`, lsLeer(CLAVE_JORNADA));
    if (foto && !h.ok) requestAnimationFrame(() => toast(`Lo guardado en esta compu no se pudo leer (${h.motivo}): arrancó en blanco (lo guardado quedó apartado en esta compu, no se borró). Si tenés un respaldo, restauralo desde Configuración.`, { error: true }));
  } else {
    E = M.generarDemo(HOY);
    AHORA = { fecha: HOY, min: 19 * 60 + 10 };
    USUARIO = "u-lu";
  }
  VISTA = HOY;
  TAB = "agenda";
  ui.mes = HOY.slice(0, 7);
  ui.busca = {};
  ui.producto = {};
  ui.remito = null;
  for (let d = 1; d <= 6; d++) M.materializarFijos(E, M.sumarDias(HOY, d));
  render();
}

// Un solo aviso a la vez. Los errores van al lado de lo que falló (dentro de la ventana abierta);
// lo que salió bien se confirma abajo a la derecha y, si se puede, con «Deshacer».
function toast(texto, { error = false, deshacer = null } = {}) {
  UNDO = deshacer;
  const boton = deshacer ? ` <button type="button" data-a="deshacer">Deshacer</button>` : "";
  const dlg = $("#dlg");
  if (dlg.open) {
    const aviso = $("#dlg-aviso", dlg);
    if (aviso) {
      aviso.innerHTML = `${esc(texto)}${boton}`;
      aviso.className = error ? "err" : "small";
      aviso.setAttribute("role", error ? "alert" : "status");
      return;
    }
  }
  const t = document.createElement("div");
  t.className = `toast${error ? " err" : ""}`;
  if (error) t.setAttribute("role", "alert");
  t.innerHTML = `<span>${esc(texto)}</span>${boton}`;
  $("#toasts").replaceChildren(t);
  clearTimeout(timerToast);
  timerToast = setTimeout(() => { t.remove(); if (UNDO === deshacer) UNDO = null; }, deshacer ? 6000 : error ? 4000 : 2500);
}

// Lo que cambió late una vez (300 ms) para que el ojo lo encuentre sin buscar.
function pulsar(id) {
  if (!id || sinMovimiento()) return;
  const el = document.querySelector(`#app [data-k="r-${CSS.escape(id)}"]`);
  if (!el) return;
  el.classList.remove("pulso"); void el.offsetWidth; el.classList.add("pulso");
  el.addEventListener("animationend", () => el.classList.remove("pulso"), { once: true });
}
function exito(okTexto, res) {
  const deshacer = PREVIO && JSON.stringify(E) !== PREVIO.json ? PREVIO.json : null;
  const v = PREVIO?.v;
  if (okTexto) toast(textoOk(okTexto, res), { deshacer });
  if (v && M.reserva(E, v)) requestAnimationFrame(() => pulsar(v));
}

const textoOk = (okTexto, res) => (typeof okTexto === "function" ? okTexto(res) : okTexto);

function hecho(res, okTexto) {
  if (!res.ok) { toast(res.motivo, { error: true }); return false; }
  render();
  exito(okTexto, res);
  return true;
}

function cerrarSiSale(res, okTexto) {
  if (!res.ok) { toast(res.motivo, { error: true }); return false; }
  cerrarDialogo();
  render();
  exito(okTexto, res);
  return true;
}

function claveFoco() {
  const a = document.activeElement;
  if (!a || a === document.body) return null;
  if (a.id) return `#${CSS.escape(a.id)}`;
  if (a.dataset?.a) return `[data-a="${CSS.escape(a.dataset.a)}"]${["v", "c", "m", "j"].map((k) => (a.dataset[k] != null ? `[data-${k}="${CSS.escape(a.dataset[k])}"]` : "")).join("")}`;
  return null;
}
function devolverFoco(clave, raiz = document) {
  if (!clave) return;
  const el = raiz.querySelector(clave);
  if (el && typeof el.focus === "function") el.focus({ preventScroll: true });
}

// ═════════════════════════════════ RENDER ═════════════════════════════════

function render() {
  const foco = claveFoco();
  const u = yo();
  $("#reloj").textContent = M.hhmm(AHORA.min);
  $("#u-nombre").textContent = u.nombre;
  $("#u-rol").textContent = M.ROLES[u.rol];
  $("#u-avatar").textContent = u.nombre.slice(0, 1).toUpperCase();
  if (!TABS.find((t) => t.id === TAB && puedo(t.permiso))) TAB = "agenda";
  if (VISTA >= HOY) M.materializarFijos(E, VISTA);
  ALERTAS = M.alertas(E, AHORA).filter((a) => !a.paraDuenio || esDuenio());
  const pendDuenio = ALERTAS.filter((a) => a.paraDuenio).length;
  const { principales, mas } = pestanias();
  const enMas = mas.find((t) => t.id === TAB);
  morph($("#tabs"), principales.map((t) => `<button type="button" data-a="tab" data-v="${t.id}" ${t.id === TAB ? 'aria-current="page"' : ""}>${t.nombre}${t.id === "tablero" && pendDuenio ? `<span class="badge" aria-label="${pendDuenio} pendientes">${pendDuenio}</span>` : ""}</button>`).join("")
    + (mas.length ? `<button type="button" class="mas" id="btn-mas" popovertarget="mas-menu" aria-haspopup="menu" ${enMas ? 'aria-current="page"' : ""}>${enMas ? enMas.nombre : "Más"} <span aria-hidden="true">▾</span></button>` : ""));
  morph($("#estilo-menu"), `<div class="mh">Estilo visual · se recuerda en este navegador</div>` + ESTILOS.map((x) => `<button type="button" role="menuitem" data-a="estilo" data-v="${x.id}" aria-current="${x.id === estiloActual()}"><span class="sw" aria-hidden="true">${x.muestra.map((c) => `<i style="background:${c}"></i>`).join("")}</span><b>${x.nombre}</b><small>${x.desc}</small></button>`).join(""));
  morph($("#mas-menu"), mas.map((t) => `<button type="button" role="menuitem" data-a="tab" data-v="${t.id}" ${t.id === TAB ? 'aria-current="page"' : ""}>${t.nombre}</button>`).join(""));
  const previo = $("#grid-wrap");
  const scroll = previo ? { top: previo.scrollTop, left: previo.scrollLeft, vista: previo.dataset.vista } : null;
  if (enConsola()) {
    morph($("#tabs"), "");
    morph($("#mas-menu"), "");
    morph($("#app"), vistaConsola());
    devolverFoco(foco);
    guardarJornada();
    return;
  }
  const vistas = { agenda: vistaAgenda, buffet: vistaBuffet, caja: vistaCaja, clientes: vistaClientes, tablero: vistaTablero, proveedores: vistaProveedores, stock: vistaStock, contenido: vistaContenido, ajustes: vistaAjustes };
  morph($("#app"), vistas[TAB]());
  const gw = $("#grid-wrap");
  if (gw) {
    if (scroll && scroll.vista === VISTA) { gw.scrollTop = scroll.top; gw.scrollLeft = scroll.left; }
    else gw.scrollTop = Math.max(0, ((AHORA.min - M.horarioDe(E, VISTA).abre) / E.config.paso) * ROW - 150);
  }
  camaras.parar();
  if (TAB === "tablero" && !MODO_REAL) camaras.arrancar();
  if ($("#dlg").open && dialogoActual) dialogoActual.refrescar?.();
  devolverFoco(foco);
  pintarAvisoDuenio();
  guardarJornada();
  puente.despues?.();
}

// Aviso fijo para los dueños: pedidos de crédito esperando su OK (en este dispositivo).
function pintarAvisoDuenio() {
  const el = $("#aviso-duenio");
  if (!el) return;
  const n = esDuenio() ? E.novedades.filter((x) => x.estado === "pendiente").length : 0;
  el.hidden = !n;
  el.innerHTML = n ? `<span>🔔 ${n === 1 ? "Un pedido de crédito espera" : `${n} pedidos de crédito esperan`} tu OK.</span> <button type="button" class="btn sm" data-a="tab" data-v="tablero">Ver y resolver</button>` : "";
}

const marcaRoja = (c) => (c?.deuda > 0 ? `<span class="marca-roja" title="Saldo deudor">⚠ debe ${M.pesos(c.deuda)}</span>` : "");

// UNA sola señal por turno, y sólo si pide acción: seña sin pagar, o se está jugando/ya se jugó y la cancha debe.
// Lo que está bien no se anuncia (menos ruido = se ve al toque lo que importa).
function senalReserva(r) {
  const s = M.saldo(r);
  if (r.estado === "reservada" && r.sena.monto > 0 && !r.sena.pagada) return `falta seña ${M.pesos(r.sena.monto)}`;
  if (r.estado !== "reservada" && s > 0 && r.estado !== "finalizada") return `debe ${M.pesos(s)}`;
  if (r.estado === "finalizada") { const t = M.cuentaDelTurno(E, r.id); if (t.ok && t.totales.cargos > 0) return `mesa ${M.pesos(t.totales.cargos)}`; }
  return "";
}

// ───────────────────────────── Agenda ─────────────────────────────

function vistaAgenda() {
  const dias = [-1, 0, 1, 2, 3, 4, 5].map((d) => M.sumarDias(HOY, d));
  const fuera = E.reservas.filter((r) => r.fecha === VISTA && ["cancelada", "no_show", "suspendida"].includes(r.estado));
  const urg = ALERTAS.filter((a) => a.nivel === "alta").length;
  const h = M.horarioDe(E, VISTA);
  const caja = M.resumenCaja(E, M.cajaAbierta(E, AHORA));
  return `
  <div class="layout">
    <section aria-labelledby="t-grilla">
      <div class="card">
        <div class="card-head">
          <h2 id="t-grilla" class="pantalla">Agenda · ${esc(fechaCorta(VISTA))}${VISTA === HOY ? " (hoy)" : ""}</h2>
          <div class="row small"><span class="muted">Horario de los ${M.NOMBRE_DIA[M.diaSemana(VISTA)].toLowerCase()}: <b class="num">${M.hhmm(h.abre)} a ${M.hhmm(h.cierra)}</b></span>${puedo("configurar") ? `<button type="button" class="btn sm" data-a="horarioDia">Cambiar horario</button>` : ""}</div>
        </div>
        <div class="days" role="group" aria-label="Elegir día">
          ${dias.map((f) => `<button type="button" data-a="dia" data-v="${f}" aria-pressed="${f === VISTA}"><small>${f === HOY ? "Hoy" : DIAS[M.diaSemana(f)]}</small><b class="num">${ddmm(f)}</b></button>`).join("")}
        </div>
        <div class="toolbar">
          <button type="button" class="btn primary" data-a="nuevo" aria-keyshortcuts="N">+ Turno</button>
          <button type="button" class="btn accent" data-a="abrirConsumo" aria-keyshortcuts="C">Abrir cuenta</button>
          <button type="button" class="btn ghost" data-a="espera">Lista de espera (${E.espera.filter((e) => e.fecha >= HOY).length})</button>
          <button type="button" class="btn ghost" data-a="mantenimiento">Mantenimiento y lluvia</button>
        </div>
        ${grilla()}
        <details class="ref"><summary>Referencias y atajos</summary><div class="legend">
          <span><i style="background:var(--royal-soft);border-color:var(--royal)"></i>Reservado</span>
          <span><i style="background:var(--orange-soft);border-color:var(--orange)"></i>Turno fijo</span>
          <span><i style="background:var(--ok-soft);border-color:var(--ok)"></i>En cancha</span>
          <span><i style="background:var(--grid-past)"></i>Cancha cerrada</span>
          <span><i style="box-shadow:0 0 0 2px var(--bad) inset"></i>Necesita atención</span>
          <span><i style="background:var(--bad);border-radius:50%;border:0"></i>Cliente con saldo deudor</span>
          <span>Clic derecho o mantener apretado un turno: acciones rápidas · <kbd>←</kbd> <kbd>→</kbd> día · <kbd>T</kbd> hoy · <kbd>?</kbd> atajos</span>
        </div></details>
        ${fuera.length ? `<details style="margin-top:10px"><summary class="small muted">Cancelados, suspendidos y faltas de este día (${fuera.length})</summary><ul class="small">${fuera.map((r) => `<li>${M.hhmm(r.inicio)} · ${esc(M.cancha(E, r.canchaId).nombre)} · ${esc(r.titular)} — ${M.ESTADOS[r.estado]}${r.motivoCancelacion ? ` (${esc(r.motivoCancelacion)})` : ""}${r.faltaCobrada ? ` · se cobró ${M.pesos(r.faltaCobrada)}` : ""}${r.senaEnSuspenso ? " · seña en suspenso" : ""}${r.devolucionPendiente ? ` · <b>devolver ${M.pesos(r.devolucionPendiente)}</b>` : ""}</li>`).join("")}</ul></details>` : ""}
      </div>
    </section>
    <aside class="stack" aria-label="Pendientes">
      <section class="card" aria-labelledby="t-bandeja">
        <div class="card-head"><h2 id="t-bandeja">Para resolver ahora</h2><span class="chip ${urg ? "bad" : "info"}">${urg ? `${urg} urgente${urg > 1 ? "s" : ""}` : ALERTAS.length}</span></div>
        <div class="inbox">
          ${ALERTAS.length ? ALERTAS.map((a, i) => `
            <div class="al ${a.nivel}">
              <span class="lvl">${a.paraDuenio ? "Para el dueño" : a.nivel === "alta" ? "Urgente" : a.nivel === "media" ? "Atender" : "Aviso"}</span>
              <p>${esc(a.texto)}</p>
              <div class="row"><button type="button" class="btn sm ${a.nivel === "alta" ? "primary" : "accent"}" data-a="alerta" data-v="${i}">${esc(a.accion)}</button></div>
            </div>`).join("") : `<p class="empty">Todo en orden. 🎾</p>`}
        </div>
      </section>
      <section class="card" aria-labelledby="t-mini-caja">
        <div class="card-head"><h2 id="t-mini-caja">Caja del día</h2><button type="button" class="btn sm" data-a="tab" data-v="caja">Ver caja</button></div>
        <dl class="kv num"><dt>Efectivo en el cajón</dt><dd>${M.pesos(caja.efectivoEsperado)}</dd><dt>Ingresos</dt><dd>${M.pesos(caja.ingresos)}</dd></dl>
        <p class="small muted" style="margin:6px 0 0">La caja corre de 12:00 a 12:00.</p>
      </section>
    </aside>
  </div>`;
}

function grilla() {
  const { paso } = E.config;
  const { abre, cierra } = M.horarioDe(E, VISTA);
  const filas = (cierra - abre) / paso;
  const top = (m) => ((m - abre) / paso) * ROW;
  const delDia = E.reservas.filter((r) => r.fecha === VISTA && ["reservada", "en_cancha", "finalizada"].includes(r.estado));
  const conAlerta = VISTA === HOY ? new Set(ALERTAS.filter((a) => a.nivel === "alta" && a.reservaId).map((a) => a.reservaId)) : new Set();
  // Un hueco ya empezado se puede cargar mientras un turno ahí no terminaría (recepción se olvidó de cargarlo).
  const pasado = (m) => M.minutosHasta(AHORA, VISTA, m) + E.config.duracionTurno <= 0;
  const n = E.canchas.length;
  const cabecera = `<div class="gh" style="grid-column:1;grid-row:1"><span class="tag">Hora</span></div>` + E.canchas.map((c, i) => `
    <div class="gh" style="grid-column:${i + 2};grid-row:1">
      <div><div class="n">${esc(c.nombre)}</div><div class="tag">${c.cubierta ? "Techada" : "Descubierta"}${c.estado === "mantenimiento" ? ` · <b class="rojo">en mantenimiento</b>` : ""}</div></div>
      <button type="button" class="luz" data-a="luz" data-v="${c.id}" aria-pressed="${!!E.luces[c.id]}" aria-label="Luz de ${esc(c.nombre)}: ${E.luces[c.id] ? "prendida, tocar para apagar" : "apagada, tocar para prender"}">💡</button>
    </div>`).join("");
  let horas = "";
  for (let m = abre; m < cierra; m += 60) horas += `<span class="num" style="top:${top(m) + 8}px">${M.hhmm(m)}</span>`;
  const columnaHora = `<div class="tcol" style="grid-column:1;grid-row:2;height:${filas * ROW}px">${horas}</div>`;
  const columnas = E.canchas.map((c, idx) => {
    let slots = "";
    for (let i = 0; i < filas; i++) {
      const m = abre + i * paso;
      slots += pasado(m)
        ? `<div class="slot pasado ${m % 60 === 0 ? "hora" : ""}" style="top:${i * ROW}px" aria-hidden="true"></div>`
        : `<button type="button" class="slot ${m % 60 === 0 ? "hora" : ""}" style="top:${i * ROW}px" data-a="nuevo" data-c="${c.id}" data-m="${m}" aria-label="${esc(c.nombre)}, ${M.hhmm(m)}, libre. Reservar">+ ${M.hhmm(m)}</button>`;
    }
    const turnos = delDia.filter((r) => r.canchaId === c.id).map((r) => {
      const hgt = (r.duracion / paso) * ROW - 3;
      const senal = senalReserva(r);
      const titular = r.clienteId ? M.cliente(E, r.clienteId) : null;
      const extra = r.tipo === "clase" || r.tipo === "abierto" ? ` · ${M.TIPOS[r.tipo].toLowerCase()}` : "";
      return `<button type="button" class="blk ${r.estado} ${r.tipo} ${conAlerta.has(r.id) ? "alerta" : ""}" style="top:${top(r.inicio) + 1}px;height:${hgt}px" data-a="ver" data-v="${r.id}" data-k="r-${r.id}" aria-haspopup="dialog" aria-label="${esc(r.titular)}${r.tipo === "fijo" ? ", turno fijo" : ""}, ${M.hhmm(r.inicio)} a ${M.hhmm(r.inicio + r.duracion)}, ${M.ESTADOS[r.estado]}, cancha debe ${M.pesos(M.saldo(r))}${titular?.deuda > 0 ? `, tiene saldo deudor de ${M.pesos(titular.deuda)}` : ""}${r.notas ? ", tiene nota" : ""}. Clic derecho o mantener apretado: acciones rápidas">
        <span class="tt">${titular?.deuda > 0 ? `<span class="alerta-pago" title="Saldo deudor"></span>` : ""}${esc(r.titular)}${r.notas ? `<span class="dot" title="Tiene nota"></span>` : ""}</span>
        <span class="meta num">${M.hhmm(r.inicio)}–${M.hhmm(r.inicio + r.duracion)} · ${r.jugadores.length}/4${extra}</span>
        ${senal && hgt > 44 ? `<span class="debe num">${senal}</span>` : ""}
      </button>`;
    }).join("");
    const bloqueos = E.bloqueos.filter((b) => b.fecha === VISTA && (b.canchaId === c.id || b.canchaId === "*")).map((b) =>
      `<div class="blk bloqueo" style="top:${top(b.desde) + 1}px;height:${((b.hasta - b.desde) / paso) * ROW - 3}px"><span class="tt">Bloqueada</span><span class="meta">${esc(b.motivo)}</span></div>`).join("");
    return `<div class="ccol ${c.estado === "mantenimiento" ? "mant" : ""}" style="grid-column:${idx + 2};grid-row:2;height:${filas * ROW}px">${slots}${bloqueos}${turnos}</div>`;
  }).join("");
  const ahoraLinea = VISTA === HOY && AHORA.min >= abre && AHORA.min <= cierra
    ? `<div style="grid-column:2 / -1;grid-row:2;position:relative;pointer-events:none;z-index:4" aria-hidden="true"><div class="now" style="top:${top(AHORA.min)}px" data-h="${M.hhmm(AHORA.min)}"></div></div>` : "";
  return `<div class="grid-wrap" id="grid-wrap" data-vista="${VISTA}"><div class="grilla" style="grid-template-columns:56px repeat(${n},minmax(140px,1fr))" role="group" aria-label="Grilla de turnos por cancha">${cabecera}${columnaHora}${columnas}${ahoraLinea}</div></div>`;
}

// ───────────────────────────── Buffet ─────────────────────────────

function tarjetaCuenta(cta) {
  const c = cta.clienteId ? M.cliente(E, cta.clienteId) : null;
  const r = cta.reservaId ? M.reserva(E, cta.reservaId) : null;
  const s = M.saldoCuenta(cta);
  return `<div class="cta">
    <div class="cta-h"><b>${esc(cta.titular)}</b><span class="row" style="gap:6px">${marcaRoja(c)}${c?.cc.habilitada ? `<span class="chip info">Cuenta corriente</span>` : ""}<b class="num">${M.pesos(s)}</b></span></div>
    <div class="small muted">${r ? `Turno ${M.hhmm(r.inicio)} · ${esc(M.cancha(E, r.canchaId)?.nombre ?? "")}` : "Cuenta abierta a nivel cliente"} · desde ${cta.abierta.min != null ? M.hhmm(cta.abierta.min) : "—"}</div>
    ${cta.items.length ? `<ul>${cta.items.map((i) => `<li class="num">${i.cant} × ${esc(i.nombre)} · ${M.pesos(i.cant * i.precioUnit)}${i.alquiler ? (i.devuelto ? " (devuelta)" : " (en uso)") : ""}</li>`).join("")}</ul>` : `<p class="small muted" style="margin:0">Sin cargos todavía.</p>`}
    ${M.cobradoCuenta(cta) ? `<div class="small">Pagado: ${M.pesos(M.cobradoCuenta(cta))}</div>` : ""}
    <div class="row"><button type="button" class="btn sm primary" data-a="verCuenta" data-v="${cta.id}">Cargar / cobrar</button></div>
  </div>`;
}

function tarjetaMesa(m) {
  const r = m.reserva;
  return `<div class="cta mesa-abierta" data-k="mesa-${r.id}">
    <div class="cta-h"><b>${esc(r.titular)}</b><b class="num">${M.pesos(m.saldo)}</b></div>
    <div class="small muted">${esc(M.cancha(E, r.canchaId)?.nombre ?? "")} · turno ${M.hhmm(r.inicio)} · cancha cerrada${r.cierre?.min != null ? ` a las ${M.hhmm(r.cierre.min)}` : ""}</div>
    <ul>${m.cuentas.map((c) => `<li class="num">${esc(c.titular)} · ${M.pesos(M.saldoCuenta(c))}</li>`).join("")}</ul>
    <div class="row"><button type="button" class="btn sm primary" data-a="verMesa" data-v="${r.id}">Ver la mesa</button></div>
  </div>`;
}
function tarjetaPedido(pd) {
  const lista = pd.items.map((i) => `${i.cant} × ${i.nombre}`).join(", ");
  const msj = M.mensajeWhatsApp("pedidoListo", { nombre: pd.nombre.split(" ")[0], codigo: pd.codigo, lista, total: M.pesos(pd.total) });
  return `<div class="cta pedido" data-k="pd-${pd.id}">
    <div class="cta-h"><b>${esc(pd.codigo)} · ${esc(pd.nombre)}</b><b class="num">${M.pesos(pd.total)}</b></div>
    <div class="small muted">${pd.tel ? esc(pd.tel) + " · " : ""}encargado ${pd.min != null ? `a las ${M.hhmm(pd.min)}` : ""}</div>
    <ul>${pd.items.map((i) => `<li class="num">${i.cant} × ${esc(i.nombre)} · ${M.pesos(i.cant * i.precioUnit)}</li>`).join("")}</ul>
    <div class="row"><button type="button" class="btn sm primary" data-a="entregarPedido" data-v="${pd.id}">Entregar y cobrar</button><button type="button" class="btn sm" data-a="pedidoACuenta" data-v="${pd.id}">A la cuenta de…</button><a class="btn sm" target="_blank" rel="noopener" href="${esc(M.linkWhatsApp(pd.tel, msj))}">Avisar que está listo</a><button type="button" class="btn sm danger" data-a="cancelarPedido" data-v="${pd.id}">Cancelar</button></div>
  </div>`;
}

function vistaBuffet() {
  const mesas = M.mesasAbiertas(E);
  const enMesa = new Set(mesas.flatMap((m) => m.cuentas.map((c) => c.id)));
  const abiertas = M.cuentasAbiertas(E).filter((c) => c.titular !== "Mostrador" && !enMesa.has(c.id));
  const pedidos = M.pedidosPendientes(E);
  const q = ui.busca.buffet ?? "";
  const lista = q ? abiertas.filter((c) => c.titular.toLowerCase().includes(q.toLowerCase())) : abiertas;
  return `<div class="stack">
    ${pedidos.length ? `<section class="card" aria-labelledby="t-pedidos">
      <div class="card-head"><h2 id="t-pedidos">Pedidos de la tienda para retirar (${pedidos.length})</h2></div>
      <div style="display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(280px,1fr))">${pedidos.map(tarjetaPedido).join("")}</div>
    </section>` : ""}
    ${mesas.length ? `<section class="card" aria-labelledby="t-mesas">
      <div class="card-head"><h2 id="t-mesas">Mesas que siguen cargando · cancha cerrada (${mesas.length})</h2></div>
      <p class="small muted" style="margin:0 0 10px">La cancha ya se cobró y quedó libre para el turno siguiente. Lo que piden ahora se suma a la mesa y se cobra cuando se van.</p>
      <div style="display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(260px,1fr))">${mesas.map(tarjetaMesa).join("")}</div>
    </section>` : ""}
    <section class="card" aria-labelledby="t-buffet">
      <div class="card-head"><h2 id="t-buffet" class="pantalla">Buffet · cuentas abiertas (${abiertas.length})</h2>
        <div class="row"><button type="button" class="btn primary" data-a="abrirConsumo">Abrir cuenta</button><button type="button" class="btn accent" data-a="mostrador">Venta rápida</button><button type="button" class="btn" data-a="pegarPedido">Pedido de la tienda por WhatsApp</button></div></div>
      <p class="small muted" style="margin:0 0 10px">Los cargos del buffet son una cuenta aparte de la cancha: quedan abiertos a nombre del cliente y se cobran cuando se va, o pasan a su cuenta corriente.</p>
      <div class="search" style="max-width:360px;margin-bottom:10px"><label class="sr" for="busca-buffet">Buscar cuenta</label><input id="busca-buffet" data-busca="buffet" placeholder="Buscar por nombre" value="${esc(q)}"></div>
      <div style="display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(260px,1fr))">${lista.map(tarjetaCuenta).join("") || `<p class="empty">No hay cuentas abiertas.</p>`}</div>
    </section>
  </div>`;
}

// ───────────────────────────── Caja ─────────────────────────────

function vistaCaja() {
  const dia = M.cajaAbierta(E, AHORA);
  const r = M.resumenCaja(E, dia);
  const hoy = M.diaDeCaja(E, AHORA.fecha, AHORA.min);
  const cierres = E.caja.cierres.filter((c) => c.dia === dia || c.dia === hoy); // si la de hoy ya cerró, se ve su cierre
  const atrasadas = M.cajasSinCerrar(E, AHORA);
  return `<div class="stack">
    ${atrasadas.map((d) => { const ra = M.resumenCaja(E, d); return `<div class="al alta" role="alert"><span class="lvl">Caja sin cerrar</span><p>La caja del <b>${esc(fechaCorta(d))}</b> (de 12:00 a 12:00) tiene ${ra.movimientos} movimiento(s) y nadie la cerró: efectivo esperado ${M.pesos(ra.efectivoEsperado)}. Pasa cuando se cobra antes de las 12.</p><div class="row"><button type="button" class="btn sm primary" data-a="cerrarCaja" data-v="${d}">Cerrar la caja del ${esc(ddmm(d))}</button></div></div>`; }).join("")}
    <section class="card" aria-labelledby="t-caja">
      <div class="card-head"><h2 id="t-caja" class="pantalla">Caja del ${esc(fechaCorta(dia))} · ${dia === hoy ? "de 12:00 a 12:00" : "abierta al cerrar la anterior"}</h2>
        <div class="row">
          ${puedo("egreso") ? `<button type="button" class="btn" data-a="egreso">Egreso en efectivo</button>` : ""}
          ${puedo("remito") ? `<button type="button" class="btn" data-a="remito">Registrar remito</button>` : ""}
          <button type="button" class="btn primary" data-a="cerrarCaja">Cerrar caja</button>
        </div></div>
      <div class="dos-cols">
        <dl class="kv num">
          ${MEDIOS_CAJA.map((k) => `<dt>${M.MEDIOS[k]}</dt><dd>${M.pesos(r.porMedio[k])}</dd>`).join("")}
          <dt>Fondo inicial</dt><dd>${M.pesos(E.caja.fondo)}</dd>
          <dt class="tot">Efectivo que tiene que haber</dt><dd class="tot">${M.pesos(r.efectivoEsperado)}</dd>
        </dl>
        ${esDuenio() ? `<label class="f" style="max-width:220px">Fondo de caja (cambio en el cajón)<input type="number" min="0" step="100" value="${E.caja.fondo}" data-a="fondo"></label>` : ""}
        <div>
          <h3>Cierres de esta caja</h3>
          ${cierres.length ? `<table class="num small"><thead><tr><th>Quién</th><th class="r">Esperado</th><th class="r">Contado</th><th class="r">Diferencia</th></tr></thead><tbody>${cierres.map((c) => `<tr><td>${esc(c.responsable)} · ${M.hhmm(c.min)}</td><td class="r">${M.pesos(c.esperado)}</td><td class="r">${M.pesos(c.contado)}</td><td class="r">${c.diferencia === 0 ? `<span class="chip ok">Cuadra</span>` : `<span class="chip ${c.diferencia < 0 ? "bad" : "warn"}">${M.pesos(c.diferencia)}</span>`}</td></tr>`).join("")}</tbody></table>` : `<p class="small muted">Todavía no se cerró. El cierre pide el PIN de quien cierra.</p>`}
        </div>
      </div>
    </section>
    <section class="card" aria-labelledby="t-movs">
      <div class="card-head"><h2 id="t-movs">Movimientos (${r.movimientos})</h2></div>
      <div class="tbl-wrap"><table class="num small"><thead><tr><th>Hora</th><th>Concepto</th><th>Medio</th><th class="r">Ingreso</th><th class="r">Egreso</th></tr></thead><tbody>
        ${r.lista.slice().reverse().map((m) => `<tr><td>${m.fecha !== dia ? `${ddmm(m.fecha)} ` : ""}${M.hhmm(m.min)}</td><td>${esc(m.concepto)}${m.usuario ? ` <span class="muted">· ${esc(m.usuario)}</span>` : ""}</td><td>${M.MEDIOS[m.medio]}</td><td class="r">${m.tipo === "ingreso" ? M.pesos(m.monto) : ""}</td><td class="r">${m.tipo === "egreso" ? M.pesos(m.monto) : ""}</td></tr>`).join("") || `<tr><td colspan="5" class="muted">Sin movimientos.</td></tr>`}
      </tbody></table></div>
    </section>
  </div>`;
}

// ───────────────────────────── Clientes ─────────────────────────────

function vistaClientes() {
  const q = ui.busca.clientes ?? "";
  const lista = M.buscarClientes(E, q).slice().sort((a, b) => (b.deuda - a.deuda) || a.nombre.localeCompare(b.nombre));
  return `<section class="card" aria-labelledby="t-clientes">
    <div class="card-head"><h2 id="t-clientes" class="pantalla">Clientes (${lista.length})</h2><button type="button" class="btn primary" data-a="altaCliente">+ Alta de cliente</button></div>
    <div class="search" style="max-width:360px;margin-bottom:10px"><label class="sr" for="busca-clientes">Buscar cliente</label><input id="busca-clientes" data-busca="clientes" placeholder="Nombre o teléfono" value="${esc(q)}"></div>
    <div class="tbl-wrap"><table class="num"><thead><tr><th>Nombre</th><th>Nivel</th><th>Cuenta corriente</th><th class="r">Saldo</th><th class="r">Créditos</th><th class="r">Faltas</th><th></th></tr></thead><tbody>
      ${lista.map((c) => `<tr>
        <td>${esc(c.nombre)}</td><td>${esc(c.nivel || "—")}</td>
        <td>${c.cc.habilitada ? `<span class="chip info">Hasta ${M.pesos(c.cc.limite)}</span>` : E.novedades.some((n) => n.estado === "pendiente" && n.clienteId === c.id) ? `<span class="chip warn">Pedida</span>` : `<span class="muted small">No</span>`}</td>
        <td class="r">${c.deuda > 0 ? `<span class="rojo">⚠ ${M.pesos(c.deuda)}</span>` : M.pesos(0)}</td>
        <td class="r">${c.monedero ? M.pesos(c.monedero) : ""}</td><td class="r">${c.strikes || ""}</td>
        <td><button type="button" class="btn sm" data-a="fichaCliente" data-v="${c.id}">Ficha</button></td>
      </tr>`).join("") || `<tr><td colspan="7" class="muted">No hay clientes con ese nombre.</td></tr>`}
    </tbody></table></div>
  </section>`;
}

// ───────────────────────────── Tablero (dueño) ─────────────────────────────

function vistaTablero() {
  const k = M.kpis(E, HOY, AHORA);
  const pct = (x) => `${Math.round(x * 100)}%`;
  const semana = Array.from({ length: 7 }, (_, i) => M.sumarDias(HOY, i - 6));
  const calor = M.mapaDeCalor(E, semana);
  const platos = M.metricasPlatos(E, { desde: M.sumarDias(HOY, -6), hasta: HOY });
  const maxMedio = Math.max(1, ...Object.values(k.caja.porMedio).map(Math.abs));
  const novedadesCC = E.novedades.filter((n) => n.estado === "pendiente");
  const accesos = E.solicitudesAcceso.filter((s) => s.estado === "pendiente");
  const enCancha = E.canchas.map((c) => {
    const r = E.reservas.find((x) => x.fecha === HOY && x.canchaId === c.id && x.estado === "en_cancha");
    const prox = E.reservas.filter((x) => x.fecha === HOY && x.canchaId === c.id && x.estado === "reservada" && x.inicio >= AHORA.min - 30).sort((a, b) => a.inicio - b.inicio)[0];
    return { c, r, prox };
  });
  return `<div class="stack">
    ${novedadesCC.length || accesos.length ? `<section class="card" aria-labelledby="t-nov">
      <div class="card-head"><h2 id="t-nov">Novedades para autorizar</h2></div>
      <div class="inbox">
        ${novedadesCC.map((n) => { const c = M.cliente(E, n.clienteId); const fiado = n.tipo === "fiado"; return `<div class="al media"><span class="lvl">${fiado ? "Fiado de hoy" : "Cuenta corriente"}</span><p><b>${esc(n.pidio)}</b> pide ${fiado ? `fiarle <b>${M.pesos(n.monto)}</b> a <b>${esc(c.nombre)}</b> (una vez, a su cuenta corriente)` : `cuenta corriente para <b>${esc(c.nombre)}</b> hasta ${M.pesos(n.limite)}`}.${n.nota ? ` «${esc(n.nota)}»` : ""} ${marcaRoja(c)}</p><div class="row"><label class="sr" for="lim-${n.id}">${fiado ? "Monto" : "Límite"}</label><input id="lim-${n.id}" type="number" min="1000" step="500" value="${n.monto ?? n.limite}" style="max-width:140px"><button type="button" class="btn sm primary" data-a="aprobarCC" data-v="${n.id}">Autorizar</button><button type="button" class="btn sm danger" data-a="rechazarCC" data-v="${n.id}">Rechazar</button></div></div>`; }).join("")}
        ${accesos.map((s) => `<div class="al media"><span class="lvl">Acceso al sistema</span><p><b>${esc(s.nombre)}</b> pidió acceso.</p><div class="row"><button type="button" class="btn sm primary" data-a="otorgar" data-v="${s.id}">Dar acceso</button><button type="button" class="btn sm danger" data-a="rechazarAcceso" data-v="${s.id}">Rechazar</button></div></div>`).join("")}
      </div>
    </section>` : ""}
    <section aria-labelledby="t-kpis">
      <h2 id="t-kpis" class="sr">Indicadores de hoy</h2>
      <div class="kpis num">
        ${kpi("Ocupación de hoy", pct(k.ocupacion), `Pico ${pct(k.ocupacionPico)} · valle ${pct(k.ocupacionValle)}`)}
        ${kpi("Canchas vendidas hoy", M.pesos(k.vendido), `${k.turnos} turnos · ticket ${M.pesos(k.ticketPromedio)}`)}
        ${kpi("Cobrado de canchas", M.pesos(k.cobrado), `Por cobrar de lo que ya se juega: ${M.pesos(k.porCobrar)}`)}
        ${kpi("Buffet del día", M.pesos(k.buffet), `${k.cuentasAbiertas} cuentas abiertas · ${M.pesos(k.cuentasAbiertasSaldo)}`)}
        ${kpi("Cuentas corrientes", M.pesos(k.deudaClientes), `Créditos emitidos ${M.pesos(k.creditos)}`)}
        ${kpi("Le debemos a proveedores", M.pesos(k.deudaProveedores), "Ver Proveedores")}
        ${kpi("Stock valorizado", M.pesos(k.stockValorizado), `Faltas hoy: ${k.faltas}`)}
      </div>
    </section>
    <div class="owner">
      ${MODO_REAL ? "" : `<section class="card span-8" aria-labelledby="t-cams">
        <div class="card-head"><h2 id="t-cams">Cámaras</h2><span class="muted small">Cada cámara muestra el turno que está en esa cancha y lo que debe</span></div>
        <div class="cams">${camaras.tiles()}</div>
        <p class="honesto">Simulación de demo. En el club se conecta la grabadora (NVR) que ya tienen: cada cámara se asocia a su cancha y se ve en vivo desde acá, sin abrir otra app.</p>
      </section>`}
      <section class="card span-4" aria-labelledby="t-torre">
        <div class="card-head"><h2 id="t-torre">Canchas ahora</h2><span class="muted small num">${M.hhmm(AHORA.min)}</span></div>
        <div class="torre">${enCancha.map(({ c, r, prox }) => {
          const p = r ? Math.min(1, Math.max(0, (AHORA.min - r.inicio) / r.duracion)) : 0;
          return `<div class="t"><b>${esc(c.nombre)}</b><div>${r ? `<div class="small"><b>${esc(r.titular)}</b> · termina ${M.hhmm(r.inicio + r.duracion)}</div><div class="bar" role="img" aria-label="Jugado ${Math.round(p * 100)}%"><i style="width:${p * 100}%"></i></div>` : `<div class="small muted">${c.estado === "mantenimiento" ? "En mantenimiento" : "Libre"}${prox ? ` · próximo ${M.hhmm(prox.inicio)} ${esc(prox.titular)}` : ""}</div>`}</div>${r ? (M.saldo(r) > 0 ? `<span class="chip warn">Debe ${M.pesos(M.saldo(r))}</span>` : `<span class="chip ok">Paga</span>`) : E.luces[c.id] ? `<span class="chip bad">Luz prendida</span>` : `<span class="chip">—</span>`}</div>`;
        }).join("")}</div>
      </section>
      ${FOTOS.length ? `<section class="card span-12 cv" aria-labelledby="t-redes">
        <div class="card-head"><h2 id="t-redes">El club en redes</h2><a class="btn sm ghost" href="https://www.instagram.com/breakpointpadel_/" target="_blank" rel="noopener">Ver Instagram</a></div>
        <div class="redes">${FOTOS.map((f) => `<figure><img src="${f.src}" width="${f.w}" height="${f.h}" alt="${esc(f.texto)}" loading="lazy" decoding="async"><figcaption>${esc(f.texto)}<small>${esc(f.fuente)}</small></figcaption></figure>`).join("")}</div>
        <p class="small muted" style="margin:10px 0 0">Tomadas de Instagram en baja resolución. Con las fotos originales del club (canchas, Delicias, shop) se arma la galería definitiva.</p>
      </section>` : ""}
      <section class="card span-7" aria-labelledby="t-calor">
        <div class="card-head"><h2 id="t-calor">Ocupación de la semana</h2><span class="muted small">Dónde sobran horas para vender</span></div>
        ${mapaCalor(calor)}
      </section>
      <section class="card span-5" aria-labelledby="t-plata">
        <div class="card-head"><h2 id="t-plata">Caja del día por medio</h2><span class="muted small num">Neto ${M.pesos(k.caja.neto)}</span></div>
        <div class="medios num">${Object.entries(k.caja.porMedio).map(([m, v]) => `<div class="m"><span>${M.MEDIOS[m]}</span><div class="bar" role="img" aria-label="${M.MEDIOS[m]}: ${M.pesos(v)}"><i style="width:${(Math.max(0, v) / maxMedio) * 100}%"></i></div><b style="text-align:right">${M.pesos(v)}</b></div>`).join("")}</div>
      </section>
      <section class="card span-12 cv" aria-labelledby="t-platos">
        <div class="card-head"><h2 id="t-platos">Venta de platos · últimos 7 días</h2><span class="muted small num">Total ${M.pesos(platos.total)} · ${platos.dias} días</span></div>
        <div class="tbl-wrap"><table class="num"><thead><tr><th>Plato</th><th class="r">Unidades</th><th class="r">Por día</th><th class="r">Facturado</th><th class="r">Margen</th><th>Participación</th></tr></thead><tbody>
          ${platos.filas.map((f) => `<tr><td>${esc(f.plato)}</td><td class="r">${f.unidades}</td><td class="r">${f.porDia.toFixed(1)}</td><td class="r">${M.pesos(f.facturado)}</td><td class="r">${M.pesos(f.margen)}</td><td style="min-width:140px"><div class="bar" role="img" aria-label="${Math.round(f.participacion * 100)}%"><i style="width:${f.participacion * 100}%"></i></div></td></tr>`).join("") || `<tr><td colspan="6" class="muted">Todavía no hay ventas de cocina.</td></tr>`}
        </tbody></table></div>
      </section>
      <section class="card span-12 cv" aria-labelledby="t-log">
        <div class="card-head"><h2 id="t-log">Qué pasó hoy</h2></div>
        <div class="log">${E.log.slice(0, 40).map((l) => `<div><span class="muted num">${l.min != null ? M.hhmm(l.min) : ""}</span> ${esc(l.texto)}</div>`).join("") || `<p class="small muted">Sin movimientos todavía.</p>`}</div>
      </section>
    </div>
  </div>`;
}

const kpi = (l, v, s) => `<div class="kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;

function mapaCalor({ horas, filas }) {
  const color = (v) => `color-mix(in oklab, var(--royal) ${Math.round(8 + v * 92)}%, var(--paper))`;
  const cols = `grid-template-columns:64px repeat(${horas.length},minmax(14px,1fr))`;
  return `<div class="tbl-wrap"><div class="heat" style="${cols};min-width:520px" role="img" aria-label="Mapa de ocupación de los últimos 7 días por hora. Detalle en la tabla de abajo.">
    <span></span>${horas.map((h) => `<span class="lab num" style="justify-content:center">${(h / 60) % 24}</span>`).join("")}
    ${filas.map((f) => `<span class="lab">${esc(fechaCorta(f.fecha))}</span>${f.valores.map((v, i) => `<span class="c" style="background:${color(v)}" title="${esc(fechaCorta(f.fecha))} ${M.hhmm(horas[i])}: ${Math.round(v * 100)}% ocupado"></span>`).join("")}`).join("")}
  </div></div>
  <div class="heat-scale" aria-hidden="true">Vacío <i style="background:${color(0)}"></i><i style="background:${color(0.33)}"></i><i style="background:${color(0.66)}"></i><i style="background:${color(1)}"></i> Lleno</div>
  <details style="margin-top:8px"><summary class="small muted">Ver como tabla</summary><div class="tbl-wrap"><table class="num small"><thead><tr><th>Día</th>${horas.map((h) => `<th class="r">${M.hhmm(h)}</th>`).join("")}</tr></thead><tbody>${filas.map((f) => `<tr><td>${esc(fechaCorta(f.fecha))}</td>${f.valores.map((v) => `<td class="r">${Math.round(v * 100)}%</td>`).join("")}</tr>`).join("")}</tbody></table></div></details>`;
}

// ───────────────────────────── Proveedores (dueño) ─────────────────────────────

function vistaProveedores() {
  return `<section class="card" aria-labelledby="t-prov">
    <div class="card-head"><h2 id="t-prov" class="pantalla">Proveedores</h2><div class="row"><button type="button" class="btn" data-a="remito">Registrar remito</button><button type="button" class="btn primary" data-a="altaProveedor">+ Alta de proveedor</button></div></div>
    <div class="tbl-wrap"><table class="num"><thead><tr><th>Proveedor</th><th>Rubro</th><th>CUIT</th><th class="r">Le debemos</th><th></th></tr></thead><tbody>
      ${E.proveedores.filter((p) => p.activo !== false).map((p) => { const d = M.deudaConProveedor(E, p.id); return `<tr><td>${esc(p.nombre)}</td><td>${esc(p.rubro)}</td><td>${esc(p.cuit)}</td><td class="r">${d > 0 ? `<b>${M.pesos(d)}</b>` : M.pesos(0)}</td><td><button type="button" class="btn sm" data-a="fichaProveedor" data-v="${p.id}">Cuenta y pagos</button></td></tr>`; }).join("")}
    </tbody></table></div>
    <p class="small muted" style="margin:10px 0 0">Recepción sólo carga remitos y egresos en efectivo. Pagar a proveedores (en efectivo o por transferencia) y ver su cuenta corriente es de Rober y Majo, con PIN.</p>
  </section>`;
}

// ───────────────────────────── Stock (dueño) ─────────────────────────────

// Pricing y revenue: la misma lista, para tocar costo, markup y precio y ver qué deja cada producto.
function tablaPrecios(lista) {
  const desde = M.sumarDias(HOY, -6);
  const rent = M.rentabilidad(E, { desde, hasta: HOY });
  const fila = new Map(rent.filas.map((f) => [f.productoId, f]));
  const pct = (x) => (x == null ? "—" : `${Math.round(x * 100)}%`);
  const filas = lista.map((p) => fila.get(p.id)).filter(Boolean);
  return `<p class="small muted" style="margin:0 0 10px">Tocá el costo, el % sobre costo o el precio: el precio de venta cambia en el acto para lo que se cargue de acá en más. Lo vendido es de los últimos 7 días (${ddmm(desde)} al ${ddmm(HOY)}).</p>
    <div class="tbl-wrap"><table class="num precios"><thead><tr><th>Producto</th><th class="r">Costo</th><th class="r">% sobre costo</th><th class="r">Precio</th><th class="r">Margen</th><th class="r">Margen %</th><th class="r">Vendidos</th><th class="r">Facturado</th><th class="r">Ganancia</th></tr></thead><tbody>
      ${filas.map((f) => `<tr><td>${esc(f.nombre)}<br><span class="small muted">${esc(f.codigo || "—")}${f.codigoExterno ? ` · ${esc(f.codigoExterno)}` : ""}</span></td>
        <td class="r"><label class="sr" for="px-c-${f.productoId}">Costo de ${esc(f.nombre)}</label><input id="px-c-${f.productoId}" type="number" min="0" step="50" value="${f.costo}" data-a="px" data-v="${f.productoId}" data-c="costo"></td>
        <td class="r"><label class="sr" for="px-m-${f.productoId}">Porcentaje sobre el costo de ${esc(f.nombre)}</label><input id="px-m-${f.productoId}" type="number" step="5" value="${f.markupPct == null ? "" : Math.round(f.markupPct * 100)}" placeholder="—" data-a="px" data-v="${f.productoId}" data-c="markup" ${f.costo > 0 ? "" : "disabled"}></td>
        <td class="r"><label class="sr" for="px-p-${f.productoId}">Precio de ${esc(f.nombre)}</label><input id="px-p-${f.productoId}" type="number" min="1" step="50" value="${f.precio}" data-a="px" data-v="${f.productoId}" data-c="precio"></td>
        <td class="r">${M.pesos(f.margen)}</td><td class="r"><span class="chip ${f.margenPct >= 0.5 ? "ok" : f.margenPct >= 0.3 ? "warn" : "bad"}">${pct(f.margenPct)}</span></td>
        <td class="r">${f.unidades}</td><td class="r">${M.pesos(f.facturado)}</td><td class="r">${M.pesos(f.ganancia)}</td></tr>`).join("") || `<tr><td colspan="9" class="muted">No hay productos con ese nombre.</td></tr>`}
    </tbody><tfoot><tr><td colspan="7"><b>Total 7 días</b> · margen ${pct(rent.margenPct)}</td><td class="r"><b>${M.pesos(rent.facturado)}</b></td><td class="r"><b>${M.pesos(rent.ganancia)}</b></td></tr></tfoot></table></div>`;
}

function vistaStock() {
  const q = ui.busca.stock ?? "";
  const precios = ui.stockModo === "precios";
  const lista = M.buscarProductos(E, q);
  const bajos = E.productos.filter((p) => p.activo !== false && !p.alquiler && p.stock != null && p.stock <= p.minimo);
  return `<section class="card" aria-labelledby="t-stock">
    <div class="card-head"><h2 id="t-stock" class="pantalla">Stock y productos</h2>
      <div class="row">${bajos.length ? `<a class="btn sm accent" target="_blank" rel="noopener" href="${esc(wa(M.mensajeWhatsApp("reposicion", { lista: bajos.map((p) => `${p.nombre} (${Math.max(p.minimo * 2 - p.stock, 1)})`).join(", ") })))}">Pedir lo que falta por WhatsApp</a>` : ""}<button type="button" class="btn" data-a="remito">Ingresar por remito</button><button type="button" class="btn primary" data-a="altaProducto">+ Producto o plato</button></div></div>
    <div class="row" style="margin-bottom:10px;justify-content:space-between">
      <div class="search" style="max-width:360px;flex:1"><label class="sr" for="busca-stock">Buscar producto</label><input id="busca-stock" data-busca="stock" placeholder="Nombre, rubro o código" value="${esc(q)}"></div>
      <div class="medio-pick" role="group" aria-label="Qué ver"><button type="button" data-a="stockModo" data-v="inventario" aria-pressed="${!precios}">Inventario</button><button type="button" data-a="stockModo" data-v="precios" aria-pressed="${precios}">Precios y rentabilidad</button></div>
    </div>
    ${precios ? tablaPrecios(lista) : `<div class="tbl-wrap"><table class="num"><thead><tr><th>Producto</th><th>Rubro</th><th>Cód. interno</th><th>Cód. fábrica</th><th class="r">Precio</th><th class="r">Costo</th><th class="r">Stock</th><th class="r">Mínimo</th><th>Estado</th><th></th></tr></thead><tbody>
      ${lista.map((p) => `<tr><td>${esc(p.nombre)}</td><td>${esc(p.categoria)}</td><td class="small">${esc(p.codigo || "—")}</td><td class="small">${esc(p.codigoExterno || "—")}</td><td class="r">${M.pesos(p.precio)}</td><td class="r">${M.pesos(p.costo)}</td>
        <td class="r">${p.stock == null ? "—" : p.stock}${p.alquiler ? ` <span class="muted small">(${p.prestados ?? 0} en uso)</span>` : ""}</td><td class="r">${p.stock == null || p.alquiler ? "—" : p.minimo}</td>
        <td>${p.plato ? `<span class="chip info">Plato</span>` : p.alquiler ? `<span class="chip info">Alquiler</span>` : p.stock === 0 ? `<span class="chip bad">Sin stock</span>` : p.stock <= p.minimo ? `<span class="chip warn">Reponer</span>` : `<span class="chip ok">OK</span>`}</td>
        <td><button type="button" class="btn sm" data-a="editarProducto" data-v="${p.id}">Editar</button></td></tr>`).join("") || `<tr><td colspan="10" class="muted">No hay productos con ese nombre.</td></tr>`}
    </tbody></table></div>`}
  </section>`;
}

// ───────────────────────────── Contenido (dueño) ─────────────────────────────

function vistaContenido() {
  const [anio, mes] = ui.mes.split("-").map(Number);
  const offset = (M.diaSemana(`${ui.mes}-01`) + 6) % 7; // la semana arranca el lunes
  const diasMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const pubs = M.contenidoDelMes(E, anio, mes);
  const nombreMes = new Date(Date.UTC(anio, mes - 1, 1)).toLocaleDateString("es-AR", { month: "long", year: "numeric", timeZone: "UTC" });
  let celdas = "";
  for (let i = 0; i < offset; i++) celdas += `<div class="dia fuera" aria-hidden="true"></div>`;
  for (let d = 1; d <= diasMes; d++) {
    const f = `${ui.mes}-${pad(d)}`;
    const delDia = pubs.filter((p) => p.fecha === f);
    celdas += `<div class="dia ${f === HOY ? "hoy" : ""}"><div class="n"><span>${d}</span><button type="button" data-a="nuevoContenido" data-v="${f}" aria-label="Agregar publicación el ${d}">+</button></div>
      ${delDia.map((p) => `<button type="button" class="pub ${p.estado}" data-a="verContenido" data-v="${p.id}" title="${esc(M.CANALES[p.canal])} · ${esc(M.ESTADOS_CONTENIDO[p.estado])}">${esc(p.hora)} <span class="t">${esc(p.titulo)}</span></button>`).join("")}
    </div>`;
  }
  const porEstado = Object.keys(M.ESTADOS_CONTENIDO).map((k) => `${M.ESTADOS_CONTENIDO[k]}: ${pubs.filter((p) => p.estado === k).length}`).join(" · ");
  return `<div class="stack">${seccionDifusion()}<section class="card" aria-labelledby="t-cont">
    <div class="card-head"><h2 id="t-cont" class="pantalla">Contenido · ${esc(nombreMes)}</h2>
      <div class="row"><button type="button" class="btn sm" data-a="mes" data-v="-1" aria-label="Mes anterior">‹</button><button type="button" class="btn sm" data-a="mes" data-v="0">Hoy</button><button type="button" class="btn sm" data-a="mes" data-v="1" aria-label="Mes siguiente">›</button><button type="button" class="btn primary" data-a="nuevoContenido" data-v="${HOY}">+ Publicación</button></div></div>
    <p class="small muted" style="margin:0 0 8px">Calendario de redes y WhatsApp del club. ${porEstado}</p>
    <div class="tbl-wrap"><div class="cal" style="min-width:560px">${["lun", "mar", "mié", "jue", "vie", "sáb", "dom"].map((d) => `<div class="dow">${d}</div>`).join("")}${celdas}</div></div>
    <div class="legend"><span><i style="background:var(--cream)"></i>Idea</span><span><i style="background:var(--royal-soft)"></i>Programado</span><span><i style="background:var(--ok-soft)"></i>Publicado</span></div>
    <div class="row" style="margin-top:10px"><button type="button" class="btn" data-a="studio">Abrir el Studio de redes (imágenes y textos)</button></div>
  </section></div>`;
}

// Novedades del club por difusión: se arma acá y se manda desde el WhatsApp del club. Sin API de WhatsApp no hay
// envío masivo automático: o se pega en una lista de difusión de WhatsApp Business, o se manda uno por uno.
function seccionDifusion() {
  const d = ui.difusion ?? { tipo: "novedad", titulo: "", texto: "", audiencia: "todos" };
  const cuantos = M.destinatarios(E, d.audiencia, AHORA).length;
  const ultima = (E.difusiones ?? [])[0];
  const enviando = ui.difusionId ? (E.difusiones ?? []).find((x) => x.id === ui.difusionId) : null;
  return `<section class="card" aria-labelledby="t-dif">
    <div class="card-head"><h2 id="t-dif" class="pantalla">Novedades del club · difusión por WhatsApp</h2></div>
    <div class="grid2">
      <label class="f">Tipo<select id="df-tipo" data-dif="tipo">${Object.entries(M.TIPOS_NOVEDAD).map(([k, v]) => `<option value="${k}" ${d.tipo === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      <label class="f">A quiénes<select id="df-aud" data-dif="audiencia">${Object.entries(M.AUDIENCIAS).map(([k, v]) => `<option value="${k}" ${d.audiencia === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      <label class="f" style="grid-column:1/-1">Título<input id="df-titulo" data-dif="titulo" maxlength="80" value="${esc(d.titulo)}" placeholder="Ej.: Torneo de categorías el sábado 25"></label>
      <label class="f" style="grid-column:1/-1">Texto<textarea id="df-texto" data-dif="texto" rows="4" maxlength="900" placeholder="Qué, cuándo, cuánto sale y cómo anotarse.">${esc(d.texto)}</textarea></label>
    </div>
    <p class="small muted" style="margin:6px 0">Le llega a <b>${cuantos}</b> cliente(s) con celular que no pidieron la baja. Así se ve:</p>
    <div class="wa">${esc(M.mensajeDifusion(d, "Juan")).replace(/\n/g, "<br>")}</div>
    <div class="row" style="margin-top:8px"><button type="button" class="btn primary" data-a="armarDifusion" ${cuantos ? "" : "disabled"}>Preparar el envío</button><button type="button" class="btn" data-a="studioNovedad">Hacer la imagen en el Studio</button></div>
    ${enviando ? listaEnvio(enviando) : ultima ? `<p class="small muted" style="margin:8px 0 0">Última: «${esc(ultima.titulo)}» · ${ultima.enviados.length} de ${ultima.destinatarios.length} enviados. <button type="button" class="btn sm ghost" data-a="verDifusion" data-v="${ultima.id}">Seguir mandando</button></p>` : ""}
  </section>`;
}
function listaEnvio(d) {
  const lista = d.destinatarios.map((id) => M.cliente(E, id)).filter(Boolean);
  return `<div class="seccion envio" aria-labelledby="t-envio" style="margin-top:10px"><h3 id="t-envio">Mandar «${esc(d.titulo)}» · ${d.enviados.length} de ${lista.length}</h3>
    <ol class="small" style="margin:0 0 8px;padding-left:18px"><li><b>Lista de difusión</b> (WhatsApp Business → Nueva difusión): descargá los contactos, agendalos y pegá el mensaje. Les llega sólo a quienes tienen agendado el número del club.</li><li><b>Uno por uno</b>: tocá cada nombre; abre WhatsApp con el mensaje listo y queda tildado.</li></ol>
    <div class="row"><button type="button" class="btn sm" data-a="copiarDifusion" data-v="${d.id}">Copiar el mensaje</button><button type="button" class="btn sm" data-a="csvDifusion" data-v="${d.id}">Descargar contactos (CSV)</button><button type="button" class="btn sm ghost" data-a="cerrarEnvio">Listo</button></div>
    <ul class="envio-lista">${lista.map((c) => { const hecho = d.enviados.includes(c.id); return `<li><a class="btn sm ${hecho ? "" : "primary"}" target="_blank" rel="noopener" data-envio="${d.id}" data-c="${c.id}" href="${esc(M.linkWhatsApp(c.tel, M.mensajeDifusion(d, c.nombre)))}">${hecho ? "✔ " : ""}${esc(c.nombre)}</a></li>`; }).join("")}</ul>
  </div>`;
}

// ───────────────────────────── Consola de configuración (primer arranque de la jornada real) ─────────────────────────────

const enConsola = () => MODO_REAL && E?.config?.configurado === false;

// Los dueños arman su PIN, se cargan los avisos y se da de alta a recepción. Recién ahí se abre el club.
function vistaConsola() {
  const duenios = E.usuarios.filter((u) => u.rol === "duenio" && u.activo !== false);
  const k = contactos();
  const listos = duenios.filter((u) => u.pin).length;
  return `<div class="stack consola">
    <section class="card" aria-labelledby="t-consola">
      <div class="card-head"><h2 id="t-consola" class="pantalla">Consola de configuración · Break Point</h2><span class="chip">Paso único antes de abrir</span></div>
      <p style="margin:0">El club arranca vacío: sin turnos, clientes ni caja. Se guarda en <b>esta compu</b>. Completá esto una vez y queda listo para usar.</p>
    </section>
    <section class="card" aria-labelledby="t-c1">
      <div class="card-head"><h2 id="t-c1">1 · Los dueños arman su PIN</h2><span class="muted small">${listos} de ${duenios.length} listos</span></div>
      <p class="small muted" style="margin:0 0 8px">2 números que sólo sepa cada uno. Con ese PIN se entra, se desbloquea la pantalla y se autorizan créditos, descuentos y accesos.</p>
      <div class="reglas">${duenios.map((u) => u.pin
        ? `<p style="margin:0"><b>${esc(u.nombre)}</b> · ✔ PIN armado</p>`
        : `<div><p style="margin:0 0 4px"><b>${esc(u.nombre)}</b></p><div class="row"><label class="f" style="max-width:130px">PIN<input id="pi-${u.id}" type="password" inputmode="numeric" autocomplete="off" maxlength="2" placeholder="••"></label><label class="f" style="max-width:130px">Repetilo<input id="pi2-${u.id}" type="password" inputmode="numeric" autocomplete="off" maxlength="2" placeholder="••"></label><button type="button" class="btn sm primary" data-a="pinInicial" data-v="${u.id}" style="align-self:flex-end">Guardar PIN</button></div></div>`).join("")}</div>
    </section>
    <section class="card" aria-labelledby="t-c2">
      <div class="card-head"><h2 id="t-c2">2 · Avisos por WhatsApp</h2><span class="muted small">Opcional · se guarda en esta compu</span></div>
      <div class="reglas">
        ${duenios.map((u) => `<label class="f">Celular de ${esc(u.nombre)} (le llegan los pedidos de crédito)<input type="tel" inputmode="tel" placeholder="549 11 …" value="${esc(k[u.id] ?? "")}" data-a="contacto" data-v="${u.id}"></label>`).join("")}
        <label class="f">WhatsApp del club (recepción)<input type="tel" inputmode="tel" placeholder="549 11 …" value="${esc(k.club ?? "")}" data-a="contacto" data-v="club"></label>
        <label class="f">Alias para la seña<input value="${esc(E.config.cobro?.alias ?? "")}" placeholder="alias.del.club" data-a="alias"></label>
      </div>
    </section>
    <section class="card" aria-labelledby="t-c3">
      <div class="card-head"><h2 id="t-c3">3 · Recepción</h2><span class="muted small">Opcional · también se hace después</span></div>
      ${usuariosRecepcion()}
      <div class="row"><label class="f" style="max-width:240px">Nombre<input id="nu-nombre" placeholder="Ej.: Lu (tarde)"></label><button type="button" class="btn sm" data-a="altaUsuarioConsola" style="align-self:flex-end">Dar de alta en recepción</button></div>
    </section>
    <section class="card" aria-labelledby="t-c4">
      <div class="card-head"><h2 id="t-c4">4 · Precios y caja</h2><span class="muted small">Revisalos antes del primer turno</span></div>
      <div class="reglas">
        ${E.config.tarifas.map((t, i) => `<label class="f">Precio por hora ${esc(t.nombre.toLowerCase())} (${M.hhmm(t.desde)}–${M.hhmm(t.hasta)})<input type="number" min="0" step="500" value="${t.precioHora}" data-a="tarifa" data-v="${i}"></label>`).join("")}
        <label class="f">Fondo de caja (cambio en el cajón)<input type="number" min="0" step="100" value="${E.caja.fondo}" data-a="fondo"></label>
      </div>
      <p class="small muted" style="margin:8px 0 0">Los precios del buffet y la tienda se revisan en Stock → «Precios y rentabilidad». El stock arranca sin controlar: cuando cuentes, cargalo en cada producto (Stock → Editar).</p>
    </section>
    <section class="card" aria-labelledby="t-c5">
      <div class="card-head"><h2 id="t-c5">5 · Listo</h2></div>
      <p class="small muted" style="margin:0 0 8px">Horarios y reglas se cambian en Configuración cuando quieras.</p>
      <button type="button" class="btn primary" data-a="terminarConsola" ${listos ? "" : "disabled"}>Abrir el club</button>
      ${listos ? "" : `<p class="small muted" style="margin:6px 0 0">Falta que al menos un dueño arme su PIN.</p>`}
    </section>
  </div>`;
}

function usuariosRecepcion() {
  const rec = E.usuarios.filter((u) => u.rol === "recepcion" && u.activo !== false);
  return rec.length ? `<ul class="small" style="margin:0 0 8px">${rec.map((u) => `<li><b>${esc(u.nombre)}</b>${ui.pinesNuevos?.[u.id] ? ` · PIN <b class="num">${esc(ui.pinesNuevos[u.id])}</b> (anotalo y dáselo: no se vuelve a mostrar)` : ""}</li>`).join("")}</ul>` : `<p class="small muted" style="margin:0 0 8px">Todavía no hay nadie en recepción.</p>`;
}

// ───────────────────────────── Ajustes (dueño) ─────────────────────────────

// El link del turnero para los clientes lleva el WhatsApp del club, las tarifas y la tienda (precios) que tiene ESTA
// compu: el celular del cliente no se conecta con la del club, así que lo que ve sale del link.
function linkParaClientes(k = contactos()) {
  const q = new URLSearchParams({ modo: "pedido" });
  if (k.club) q.set("wa", String(k.club).replace(/\D/g, ""));
  q.set("tar", E.config.tarifas.map((t) => `${t.desde}-${t.hasta}-${t.precioHora}`).join(","));
  const cat = E.productos.filter((p) => p.tienda && p.activo !== false && !p.alquiler && !p.plato && p.stock !== 0).map((p) => `${p.id}:${p.precio}`);
  if (cat.length) q.set("cat", cat.join(","));
  return `${location.origin}${location.pathname.replace(/\/club\/?$/, "")}/turnero?${q.toString()}`;
}

function tarjetaJornada() {
  const guardada = MODO_REAL ? null : leerJornada();
  const k = contactos();
  const linkClientes = linkParaClientes(k);
  return `<section class="card" aria-labelledby="t-jornada">
      <div class="card-head"><h2 id="t-jornada" class="pantalla">Jornada real</h2><span class="chip ${MODO_REAL ? "ok" : ""}">${MODO_REAL ? "Jornada real" : "Demo"}</span></div>
      ${MODO_REAL ? `<p class="small" style="margin:0 0 8px">Se guarda sola en <b>esta compu</b> (${guardado.ok ? (guardado.cuando ? `último guardado ${pad(guardado.cuando.getHours())}:${pad(guardado.cuando.getMinutes())} · ${Math.ceil(guardado.bytes / 1024)} KB` : "guardando…") : "⚠ no se pudo guardar"}). No pasa a otras compus ni celulares. Al recargar vuelve bloqueada y pide el PIN.</p>
        <ol class="small" style="margin:0 0 10px;padding-left:18px"><li>Antes de abrir: <b>PIN nuevo</b> para cada usuario (abajo). Los de ejemplo los conoce cualquiera.</li><li>Abrí sólo esta pestaña del club en esta compu.</li><li>Al cerrar el día: cerrá la caja y <b>descargá el respaldo</b>.</li></ol>
        <div class="row"><button type="button" class="btn primary" data-a="respaldo">Descargar respaldo</button>
          <label class="btn" for="restaurar">Restaurar desde un archivo</label><input id="restaurar" type="file" accept=".json,application/json" class="sr" data-a="restaurar">
          <button type="button" class="btn" data-a="jornada" data-v="demo">Volver a la demo</button>
          <button type="button" class="btn danger" data-a="jornada" data-v="blanco">Empezar otra jornada en blanco</button></div>
        <div class="seccion" style="margin-top:12px" aria-labelledby="t-golive"><h3 id="t-golive">Limpieza para el go-live${E.config.goLive ? ` <span class="chip ok">hecha el ${esc(ddmm(E.config.goLive.fecha ?? HOY))}</span>` : ""}</h3>
          <p class="small" style="margin:0">Después del día de prueba: borra turnos, cuentas de cargos, caja, pedidos, créditos pendientes y novedades enviadas. <b>Se conserva</b> lo maestro: canchas, horarios, precios, productos, usuarios y PIN, clientes y proveedores. Antes se descarga un respaldo.</p>
          <label class="row small" style="margin:6px 0"><input type="checkbox" id="gl-saldos" checked> Conservar los saldos (cuenta corriente, créditos y faltas de los clientes; deuda con proveedores)</label>
          <label class="row small" style="margin:0 0 6px"><input type="checkbox" id="gl-stock" checked> Conservar el stock contado</label>
          <button type="button" class="btn danger" data-a="goLive">Hacer la limpieza para el go-live</button></div>`
      : `<p class="small" style="margin:0 0 10px">Para el día de prueba en el local: el club arranca <b>vacío</b> (sin turnos, clientes ni caja; con las canchas, productos y usuarios de Break Point), con la hora real, y se guarda solo en esta compu. La demo de ejemplo no se toca.</p>
        <div class="row">${guardada ? `<button type="button" class="btn primary" data-a="jornada" data-v="retomar">Seguir la jornada real guardada</button>` : `<button type="button" class="btn primary" data-a="jornada" data-v="blanco">Empezar la jornada real en blanco</button>`}</div>
        ${guardada ? `<p class="small muted" style="margin:8px 0 0">En esta compu hay una jornada real guardada: desde la demo no se puede borrar. Para empezar otra, entrá a la jornada con el PIN de un dueño y usá «Empezar otra jornada en blanco».</p>` : ""}`}
    </section>
    <section class="card" aria-labelledby="t-contactos">
      <div class="card-head"><h2 id="t-contactos">Avisos por WhatsApp</h2><span class="muted small">Se guardan sólo en esta compu</span></div>
      <div class="reglas">
        ${E.usuarios.filter((u) => u.rol === "duenio" && u.activo !== false).map((u) => `<label class="f">Celular de ${esc(u.nombre)} (pedidos de crédito)<input type="tel" inputmode="tel" placeholder="549 11 …" value="${esc(k[u.id] ?? "")}" data-a="contacto" data-v="${u.id}"></label>`).join("")}
        <label class="f">WhatsApp del club (recepción)<input type="tel" inputmode="tel" placeholder="549 11 …" value="${esc(k.club ?? "")}" data-a="contacto" data-v="club"></label>
        <label class="f">Alias para la seña (va en la confirmación del turno)<input value="${esc(E.config.cobro?.alias ?? "")}" placeholder="alias.del.club" data-a="alias"></label>
      </div>
      <p class="small muted" style="margin:10px 0 6px">Sin número, el link de WhatsApp abre para elegir el chat. Números provisionales: a confirmar con el club.</p>
      <div class="row"><label class="sr" for="link-clientes">Link del turnero para mandar a los clientes</label><input id="link-clientes" readonly value="${esc(linkClientes)}" style="flex:1;min-width:220px"><button type="button" class="btn sm" data-a="copiarLink">Copiar link para clientes</button></div>
      <p class="small muted" style="margin:6px 0 0">Con ese link el cliente ve horarios, precios y la tienda, y te pide el turno o el encargo por WhatsApp. Lo cargás acá.</p>
    </section>`;
}

function vistaAjustes() {
  const P = E.config.politica;
  return `<div class="stack">
    ${tarjetaJornada()}
    <section class="card" aria-labelledby="t-reglas">
      <div class="card-head"><h2 id="t-reglas" class="pantalla">Reglas del club</h2><span class="muted small">Cambian en vivo lo que ve recepción</span></div>
      <div class="reglas">
        ${regla("horasCancelacionLibre", "Cancelar sin perder la seña hasta (horas antes)", P.horasCancelacionLibre)}
        ${regla("senaPct", "Seña (% del turno)", P.senaPct)}
        ${regla("strikesParaSena", "Faltas para pedir seña siempre", P.strikesParaSena)}
        ${regla("toleranciaMin", "Tolerancia de llegada antes de la falta (min)", P.toleranciaMin)}
        <label class="f">Bloquear la pantalla tras (min sin uso) · 0 = sólo al apagarse<input type="number" min="${M.LIMITES_BLOQUEO[0]}" max="${M.LIMITES_BLOQUEO[1]}" value="${minutosBloqueo()}" data-a="bloqueoMin"></label>
        <label class="f">Abrir la cancha hasta (min antes) · vacío = sin límite<input type="number" min="0" max="240" value="${P.minutosAntesParaEntrar ?? ""}" placeholder="Sin límite" data-a="regla" data-v="minutosAntesParaEntrar"></label>
        ${E.config.tarifas.map((t, i) => `<label class="f">Precio por hora ${esc(t.nombre.toLowerCase())} (${M.hhmm(t.desde)}–${M.hhmm(t.hasta)})<input type="number" min="0" step="500" value="${t.precioHora}" data-a="tarifa" data-v="${i}"></label>`).join("")}
      </div>
      <p class="small muted" style="margin:10px 0 0">Las faltas se cobran enteras (al titular o repartidas en el grupo). ${MODO_REAL ? "Los precios valen para los turnos nuevos." : "Precios de ejemplo, a confirmar con el club."}</p>
    </section>
    <section class="card" aria-labelledby="t-horarios">
      <div class="card-head"><h2 id="t-horarios">Horario por día</h2></div>
      <div class="tbl-wrap"><table class="num"><thead><tr><th>Día</th><th>Abre</th><th>Cierra</th><th></th></tr></thead><tbody>
        ${[1, 2, 3, 4, 5, 6, 0].map((d) => { const h = E.config.horarios[d]; return `<tr><td>${M.NOMBRE_DIA[d]}</td><td><label class="sr" for="ha-${d}">Abre</label><select id="ha-${d}">${opcionesHora(h.abre, 0, 23 * 60)}</select></td><td><label class="sr" for="hc-${d}">Cierra</label><select id="hc-${d}">${opcionesHora(h.cierra, 9 * 60, 26 * 60)}</select></td><td><button type="button" class="btn sm" data-a="guardarHorario" data-v="${d}">Guardar</button></td></tr>`; }).join("")}
      </tbody></table></div>
    </section>
    <section class="card" aria-labelledby="t-usuarios">
      <div class="card-head"><h2 id="t-usuarios">Usuarios y accesos</h2></div>
      <div class="tbl-wrap"><table><thead><tr><th>Usuario</th><th>Rol</th><th>Puede</th><th></th></tr></thead><tbody>
        ${E.usuarios.filter((u) => u.activo !== false).map((u) => `<tr><td>${esc(u.nombre)}</td><td>${M.ROLES[u.rol]}</td><td class="small muted">${u.rol === "duenio" ? "Todo: pagos a proveedores, cuentas corrientes, ajustes" : "Agenda, cobros, buffet, remitos, egreso en efectivo, cierre de caja"}</td><td><div class="row"><button type="button" class="btn sm" data-a="regenerarPin" data-v="${u.id}">PIN nuevo</button>${u.id !== USUARIO ? `<button type="button" class="btn sm danger" data-a="revocar" data-v="${u.id}">Sacar acceso</button>` : ""}</div></td></tr>`).join("")}
      </tbody></table></div>
      ${E.solicitudesAcceso.filter((s) => s.estado === "pendiente").map((s) => `<div class="al media" style="margin-top:8px"><span class="lvl">Pidió acceso</span><p><b>${esc(s.nombre)}</b></p><div class="row"><button type="button" class="btn sm primary" data-a="otorgar" data-v="${s.id}">Dar acceso</button><button type="button" class="btn sm danger" data-a="rechazarAcceso" data-v="${s.id}">Rechazar</button></div></div>`).join("")}
      <div class="row" style="margin-top:10px"><label class="f" style="max-width:220px">Nombre<input id="nu-nombre" placeholder="Ej.: Caro (mañana)"></label><label class="f" style="max-width:170px">Rol<select id="nu-rol"><option value="recepcion">Recepción</option><option value="duenio">Dueño/a</option></select></label><button type="button" class="btn sm primary" data-a="altaUsuario" style="align-self:flex-end">Dar de alta</button></div>
      <div class="row" style="margin-top:6px"><label class="f" style="max-width:150px">Tu PIN actual<input id="mp-viejo" type="password" inputmode="numeric" autocomplete="off" maxlength="2" placeholder="••"></label><label class="f" style="max-width:150px">PIN nuevo<input id="mp-nuevo" type="password" inputmode="numeric" autocomplete="off" maxlength="2" placeholder="••"></label><button type="button" class="btn sm" data-a="cambiarMiPin" style="align-self:flex-end">Cambiar mi PIN</button></div>
      <p class="small muted" style="margin:10px 0 0">El acceso es con PIN de 2 dígitos. El de alta lo genera el sistema y se ve una sola vez; cada uno puede cambiar el suyo. Lo que mueve plata sensible (egresos, cierre de caja, pagos a proveedores, accesos) vuelve a pedir el PIN.</p>
    </section>
  </div>`;
}

const regla = (k, l, v) => `<label class="f">${l}<input type="number" min="${M.LIMITES_POLITICA[k][0]}" max="${M.LIMITES_POLITICA[k][1]}" value="${v}" data-a="regla" data-v="${k}"></label>`;
const opcionesHora = (sel, desde, hasta) => { let o = ""; for (let m = desde; m <= hasta; m += E.config.paso) o += `<option value="${m}" ${m === sel ? "selected" : ""}>${M.hhmm(m)}${m >= 1440 ? " (+1)" : ""}</option>`; return o; };
const horasOpc = (sel, fecha = VISTA) => { const { abre, cierra } = M.horarioDe(E, fecha); let o = ""; for (let m = abre; m <= cierra; m += E.config.paso) o += `<option value="${m}" ${m === sel ? "selected" : ""}>${M.hhmm(m)}</option>`; return o; };
const pickMedios = (incluirCreditos = false, cl = null, soloProveedor = false) => `<div class="medio-pick" role="group" aria-label="Medio de pago">${(soloProveedor ? ["efectivo", "transferencia"] : [...MEDIOS_CAJA, ...(incluirCreditos && cl?.monedero > 0 ? ["monedero"] : [])]).map((k) => `<button type="button" data-a="medio" data-v="${k}" aria-pressed="${ui.medio === k}">${M.MEDIOS[k]}${k === "monedero" ? ` (${M.pesos(cl.monedero)})` : ""}</button>`).join("")}</div>`;
const campoPin = (id = "pin", etiqueta = "Tu PIN") => `<label class="f" style="max-width:160px">${etiqueta}<input id="${id}" type="password" inputmode="numeric" autocomplete="off" maxlength="2" placeholder="••"></label>`;

// ───────────────────────────── Cámaras (simuladas) ─────────────────────────────

// Publicaciones del club embebidas en index.html (JSON), para el tablero del dueño.
const FOTOS = (() => { try { return JSON.parse(document.getElementById("fotos-club")?.textContent || "[]"); } catch { return []; } })();
const ES_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const camaras = (() => {
  const LISTA = () => [
    ...E.canchas.map((c) => ({ id: c.camara, nombre: c.nombre, cancha: c.id })),
    { id: "cam-rec", nombre: "Recepción y caja", escena: "recepcion" },
    { id: "cam-bar", nombre: "Delicias (bar)", escena: "bar" },
    { id: "cam-est", nombre: "Estacionamiento", escena: "estacionamiento" },
  ];
  let timer = null;
  const quieto = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function tiles() {
    return LISTA().map((cam, i) => {
      const r = cam.cancha ? E.reservas.find((x) => x.fecha === HOY && x.canchaId === cam.cancha && x.estado === "en_cancha") : null;
      const pie = cam.cancha ? (r ? `${esc(r.titular)} · ${M.saldo(r) > 0 ? `debe ${M.pesos(M.saldo(r))}` : "al día"}` : E.luces[cam.cancha] ? "Sin juego · luz prendida" : "Sin juego") : "General";
      return `<button type="button" class="cam" data-a="cam" data-v="${i}" aria-label="Cámara ${esc(cam.nombre)}: ${pie}. Ampliar">
        <canvas width="320" height="200" data-cam="${i}" aria-hidden="true"></canvas>
        <span class="ov"><span class="top"><span>CAM ${pad(i + 1)} · ${esc(cam.nombre)}</span><span class="live">DEMO</span></span><span class="bot">${pie}</span></span>
      </button>`;
    }).join("");
  }
  function dibujar(cv, cam, t) {
    const g = cv.getContext("2d");
    const W = cv.width, Hh = cv.height;
    const luz = cam.cancha ? E.luces[cam.cancha] : true;
    const r = cam.cancha ? E.reservas.find((x) => x.fecha === HOY && x.canchaId === cam.cancha && x.estado === "en_cancha") : null;
    g.fillStyle = luz ? "#1b2a1f" : "#07090b";
    g.fillRect(0, 0, W, Hh);
    if (cam.cancha) {
      g.save(); g.translate(W / 2, Hh / 2);
      const cw = W * 0.78, ch = Hh * 0.62;
      g.fillStyle = luz ? "#1f5fa8" : "#0d243f"; g.fillRect(-cw / 2, -ch / 2, cw, ch);
      g.strokeStyle = luz ? "rgba(255,255,255,.85)" : "rgba(255,255,255,.25)"; g.lineWidth = 2; g.strokeRect(-cw / 2, -ch / 2, cw, ch);
      g.beginPath(); g.moveTo(0, -ch / 2); g.lineTo(0, ch / 2); g.stroke();
      g.lineWidth = 1; g.beginPath(); g.moveTo(-cw * 0.33, -ch / 2); g.lineTo(-cw * 0.33, ch / 2); g.moveTo(cw * 0.33, -ch / 2); g.lineTo(cw * 0.33, ch / 2); g.moveTo(-cw * 0.33, 0); g.lineTo(cw * 0.33, 0); g.stroke();
      g.strokeStyle = "rgba(180,220,255,.35)"; g.lineWidth = 4; g.strokeRect(-cw / 2 - 6, -ch / 2 - 6, cw + 12, ch + 12);
      if (r && luz) {
        const n = Math.max(2, r.jugadores.length);
        const pos = [[-0.3, -0.25], [-0.3, 0.25], [0.3, -0.25], [0.3, 0.25]].slice(0, n === 3 ? 4 : n);
        pos.forEach(([x, y], k) => { g.fillStyle = k < 2 ? "#ffd5a8" : "#f2f2f2"; g.beginPath(); g.arc(x * cw + Math.sin(t / 700 + k * 1.7) * cw * 0.08, y * ch + Math.cos(t / 900 + k) * ch * 0.12, 6, 0, Math.PI * 2); g.fill(); });
        g.fillStyle = "#e9ff3c"; g.beginPath(); g.arc(Math.sin(t / 380) * cw * 0.38, Math.sin(t / 530) * ch * 0.3, 2.6, 0, Math.PI * 2); g.fill();
      }
      g.restore();
    } else {
      g.fillStyle = "#2a2622"; g.fillRect(0, Hh * 0.55, W, Hh * 0.45);
      g.fillStyle = cam.escena === "estacionamiento" ? "#3a3a3a" : "#5a4632";
      if (cam.escena === "recepcion") g.fillRect(W * 0.15, Hh * 0.5, W * 0.55, Hh * 0.14);
      if (cam.escena === "bar") for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(W * (0.2 + k * 0.2), Hh * 0.72, 14, 0, Math.PI * 2); g.fill(); }
      if (cam.escena === "estacionamiento") for (let k = 0; k < 4; k++) { g.fillStyle = ["#7a1f1f", "#20406a", "#cfcfcf", "#2e2e2e"][k]; g.fillRect(W * (0.08 + k * 0.23), Hh * 0.66, W * 0.16, Hh * 0.16); }
      const x = W * (0.5 + Math.sin(t / 2500) * 0.35);
      g.fillStyle = "#d9c7b3"; g.beginPath(); g.arc(x, Hh * 0.48, 7, 0, Math.PI * 2); g.fill(); g.fillRect(x - 6, Hh * 0.5, 12, 22);
    }
    g.fillStyle = "rgba(255,255,255,.05)";
    for (let k = 0; k < 120; k++) g.fillRect(Math.random() * W, Math.random() * Hh, 1, 1);
    g.fillStyle = "rgba(255,255,255,.75)"; g.font = "10px ui-monospace,monospace";
    g.fillText(`${HOY} ${M.hhmm(AHORA.min)}:${pad(Math.floor(t / 1000) % 60)}`, 8, Math.round(Hh * 0.2));
  }
  // Sólo se dibuja lo que se ve: si las cámaras quedan fuera de pantalla o el navegador está en otra pestaña, se pausa.
  let enPantalla = true;
  const io = typeof IntersectionObserver === "function" ? new IntersectionObserver((es) => { enPantalla = es.some((e) => e.isIntersecting); }) : null;
  function frame(forzar = false) {
    if (!forzar && (!enPantalla || document.hidden)) return;
    const lista = LISTA(); const t = performance.now();
    document.querySelectorAll("canvas[data-cam]").forEach((cv) => dibujar(cv, lista[Number(cv.dataset.cam)], t));
  }
  return {
    tiles, lista: LISTA, dibujar,
    arrancar() { const c = $(".cams"); if (io && c) io.observe(c); frame(true); if (!quieto && !timer) timer = setInterval(frame, 120); },
    parar() { clearInterval(timer); timer = null; io?.disconnect(); },
  };
})();

// ═════════════════════════════════ NAVEGACIÓN ═════════════════════════════════

function irTab(id) {
  if (SOPORTA_POPOVER && $("#mas-menu").matches(":popover-open")) $("#mas-menu").hidePopover();
  if (id === TAB) return;
  TAB = id;
  cerrarDialogo();
  conVT(() => { render(); $("#app").focus({ preventScroll: true }); });
}
function irDia(fecha) {
  if (fecha === VISTA) return;
  VISTA = fecha;
  conVT(render);
}
// El turno «crece» hasta ser su ventana (View Transition con elemento compartido). Sin soporte, abre directo.
function abrirTurno(b) {
  const id = b.dataset.v;
  const d = $("#dlg");
  if (!document.startViewTransition || sinMovimiento() || !b.classList.contains("blk") || d.open) return verReserva(id);
  b.style.viewTransitionName = "turno";
  const vt = document.startViewTransition(() => {
    b.style.viewTransitionName = "";
    verReserva(id);
    d.classList.add("sin-anim");
    d.style.viewTransitionName = "turno";
  });
  vt.ready.catch(() => {}); vt.updateCallbackDone.catch(() => {});
  vt.finished.finally(() => { d.style.viewTransitionName = ""; d.classList.remove("sin-anim"); });
}

// ───── paleta de comandos (⌘K / Ctrl+K / «/»): buscar y hacer sin soltar el teclado ─────
const paleta = { items: [], activo: 0, recientes: [] };
const normalizar = (x) => String(x ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function itemsPaleta(q) {
  const nq = normalizar(q.trim());
  const coincide = (...txt) => !nq || txt.some((x) => normalizar(x).includes(nq));
  const tabs = pestanias().orden;
  const hacer = [
    { k: "a-nuevo", g: "Hacer", t: "Nuevo turno", atajo: "N", ok: puedo("agenda"), run: () => nuevoTurno({}) },
    { k: "a-consumo", g: "Hacer", t: "Abrir cuenta del buffet", atajo: "C", ok: puedo("buffet"), run: () => abrirConsumo() },
    { k: "a-venta", g: "Hacer", t: "Venta rápida de mostrador", ok: puedo("buffet"), run: () => mostrador() },
    { k: "a-egreso", g: "Hacer", t: "Egreso de caja en efectivo", ok: puedo("egreso"), run: () => egresoDialogo() },
    { k: "a-remito", g: "Hacer", t: "Registrar remito de proveedor", ok: puedo("remito"), run: () => remitoDialogo() },
    { k: "a-cierre", g: "Hacer", t: "Cerrar la caja", ok: puedo("cerrarCaja"), run: () => cierreCajaDialogo() },
    { k: "a-cliente", g: "Hacer", t: "Alta de cliente", ok: puedo("clientes"), run: () => altaClienteDialogo() },
    { k: "a-espera", g: "Hacer", t: "Lista de espera", ok: puedo("agenda"), run: () => listaEspera() },
    { k: "a-mant", g: "Hacer", t: "Mantenimiento y lluvia", ok: puedo("agenda"), run: () => mantenimientoDialogo() },
    { k: "a-hoy", g: "Ir a", t: "Agenda de hoy", atajo: "T", ok: puedo("agenda"), run: () => { irTab("agenda"); irDia(HOY); } },
    ...tabs.map((x, i) => ({ k: `t-${x.id}`, g: "Ir a", t: x.nombre, atajo: i < 9 ? String(i + 1) : "", ok: true, run: () => irTab(x.id) })),
    { k: "a-usuario", g: "Hacer", t: "Cambiar de usuario", ok: true, run: () => cambiarUsuario() },
    ...(MODO_REAL ? [] : [{ k: "a-reloj+", g: "Demo", t: "Adelantar el reloj 30 minutos", ok: true, run: () => acciones.reloj({ dataset: { v: "30" } }) },
    { k: "a-reloj-", g: "Demo", t: "Atrasar el reloj 30 minutos", ok: true, run: () => acciones.reloj({ dataset: { v: "-30" } }) }]),
    ...ESTILOS.map((x) => ({ k: `e-${x.id}`, g: "Estilo", t: `Estilo ${x.nombre}`, s: x.id === estiloActual() ? "en uso" : "", ok: true, run: () => elegirEstilo(x.id) })),
    { k: "a-atajos", g: "Ayuda", t: "Atajos de teclado", atajo: "?", ok: true, run: () => ayudaAtajos() },
  ].filter((a) => a.ok && coincide(a.t, a.g));
  const turnos = nq ? E.reservas.filter((r) => (r.fecha === VISTA || r.fecha === HOY) && ["reservada", "en_cancha", "finalizada"].includes(r.estado) && coincide(r.titular, ...r.jugadores.map((j) => j.nombre)))
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.inicio - b.inicio).slice(0, 5).map(itemTurno) : [];
  const clientes = nq && puedo("clientes") ? M.buscarClientes(E, q.trim()).slice(0, 5).map(itemCliente) : [];
  const cuentas = nq && puedo("buffet") ? M.cuentasAbiertas(E).filter((c) => c.titular !== "Mostrador" && coincide(c.titular)).slice(0, 3).map(itemCuenta) : [];
  const productos = nq ? M.buscarProductos(E, q.trim()).slice(0, 4).map(itemProducto) : [];
  const proveedores = nq && puedo("verProveedores") ? E.proveedores.filter((p) => p.activo !== false && coincide(p.nombre, p.rubro)).slice(0, 3).map(itemProveedor) : [];
  if (nq) return [...turnos, ...clientes, ...cuentas, ...productos, ...proveedores, ...hacer].slice(0, 14);
  // Sin texto: primero lo último que usaste (si todavía existe y tenés permiso), después lo de siempre.
  const recientes = paleta.recientes.map((k) => hacer.find((x) => x.k === k) ?? itemPorClave(k)).filter(Boolean).map((x) => ({ ...x, g: "Reciente" }));
  return [...recientes, ...hacer.filter((a) => !paleta.recientes.includes(a.k))];
}
const itemTurno = (r) => ({ k: `r-${r.id}`, g: "Turno", t: r.titular, s: `${r.fecha === HOY ? "hoy" : ddmm(r.fecha)} ${M.hhmm(r.inicio)} · ${M.cancha(E, r.canchaId).nombre}`, run: () => verReserva(r.id) });
const itemCliente = (c) => ({ k: `c-${c.id}`, g: "Cliente", t: c.nombre, s: c.deuda > 0 ? `debe ${M.pesos(c.deuda)}` : c.tel || "", rojo: c.deuda > 0, run: () => fichaCliente(c.id) });
const itemCuenta = (c) => ({ k: `b-${c.id}`, g: "Buffet", t: `Cuenta de ${c.titular}`, s: M.pesos(M.saldoCuenta(c)), run: () => verCuenta(c.id) });
const itemProducto = (p) => (puedo("stock")
  ? { k: `p-${p.id}`, g: "Producto", t: p.nombre, s: `${M.pesos(p.precio)}${p.stock != null ? ` · stock ${p.stock}` : ""}`, run: () => productoDialogo(p.id) }
  : { k: `p-${p.id}`, g: "Vender", t: p.nombre, s: M.pesos(p.precio), run: () => { ui.carrito = { [p.id]: 1 }; mostrador(); } });
const itemProveedor = (p) => ({ k: `v-${p.id}`, g: "Proveedor", t: p.nombre, s: M.pesos(M.deudaConProveedor(E, p.id)), run: () => fichaProveedor(p.id) });
function itemPorClave(k) {
  const id = k.slice(2);
  const r = k[0] === "r" ? M.reserva(E, id) : null;
  if (r) return ["reservada", "en_cancha", "finalizada"].includes(r.estado) ? itemTurno(r) : null;
  if (k[0] === "c" && puedo("clientes")) { const c = M.cliente(E, id); return c && c.activo !== false ? itemCliente(c) : null; }
  if (k[0] === "b" && puedo("buffet")) { const c = M.cuenta(E, id); return c?.estado === "abierta" ? itemCuenta(c) : null; }
  if (k[0] === "p") { const p = M.producto(E, id); return p && p.activo !== false ? itemProducto(p) : null; }
  if (k[0] === "v" && puedo("verProveedores")) { const p = M.proveedor(E, id); return p ? itemProveedor(p) : null; }
  return null;
}
function pintarPaleta() {
  const q = $("#cmdk-q").value;
  paleta.items = itemsPaleta(q);
  paleta.activo = Math.min(paleta.activo, Math.max(0, paleta.items.length - 1));
  $("#cmdk-l").innerHTML = paleta.items.length ? paleta.items.map((x, i) => `<li role="option" id="cmdk-o-${i}" data-a="cmd" data-v="${i}" aria-selected="${i === paleta.activo}"><span class="g">${esc(x.g)}</span><span class="t">${esc(x.t)}</span>${x.s ? `<span class="s ${x.rojo ? "rojo" : ""}">${esc(x.s)}</span>` : ""}${x.atajo ? `<kbd>${esc(x.atajo)}</kbd>` : ""}</li>`).join("") : `<li class="vacio" role="option" aria-disabled="true">No encontré nada con «${esc(q)}».</li>`;
  $("#cmdk-q").setAttribute("aria-activedescendant", paleta.items.length ? `cmdk-o-${paleta.activo}` : "");
}
function moverPaleta(paso) {
  if (!paleta.items.length) return;
  paleta.activo = (paleta.activo + paso + paleta.items.length) % paleta.items.length;
  $("#cmdk-l").querySelectorAll("li[role=option]").forEach((li, i) => li.setAttribute("aria-selected", String(i === paleta.activo)));
  $("#cmdk-q").setAttribute("aria-activedescendant", `cmdk-o-${paleta.activo}`);
  $(`#cmdk-o-${paleta.activo}`)?.scrollIntoView({ block: "nearest" });
}
function abrirPaleta() {
  const p = $("#cmdk");
  if (p.open || $("#dlg").open) return;
  $("#cmdk-q").value = "";
  paleta.activo = 0;
  pintarPaleta();
  p.showModal();
  $("#cmdk-q").focus();
}
function ejecutarPaleta(i) {
  const x = paleta.items[i];
  if (!x) return;
  $("#cmdk").close();
  paleta.recientes = [x.k, ...paleta.recientes.filter((k) => k !== x.k)].slice(0, 4);
  x.run();
}
$("#cmdk-q").addEventListener("input", () => { paleta.activo = 0; pintarPaleta(); });
$("#cmdk-q").addEventListener("keydown", (ev) => {
  if (ev.key === "ArrowDown" || ev.key === "ArrowUp") { ev.preventDefault(); moverPaleta(ev.key === "ArrowDown" ? 1 : -1); }
  else if (ev.key === "Enter") { ev.preventDefault(); ejecutarPaleta(paleta.activo); }
});
$("#cmdk").addEventListener("click", (ev) => { if (ev.target === ev.currentTarget) ev.currentTarget.close(); });

function ayudaAtajos() {
  const fila = (teclas, que) => `<tr><td>${teclas.map((k) => `<kbd>${k}</kbd>`).join(" ")}</td><td>${que}</td></tr>`;
  abrir({
    titulo: "Atajos de teclado",
    sub: "Funcionan cuando no estás escribiendo en un campo. Todo se puede hacer también con el mouse o el dedo.",
    cuerpo: `<table><tbody>
      ${fila([ES_MAC ? "⌘" : "Ctrl", "K"], "Buscar y hacer (clientes, turnos, productos, acciones)")}${fila(["/"], "Lo mismo, con una sola tecla")}
      ${fila(["N"], "Nuevo turno")}${fila(["C"], "Abrir cuenta del buffet")}${fila(["L"], "Bloquear la pantalla (anda también con una ventana abierta)")}
      ${fila(["←", "→"], "Día anterior / siguiente en la agenda")}${fila(["T"], "Volver a hoy")}
      ${fila(["1", "…", "9"], "Ir a cada pestaña")}${fila([ES_MAC ? "⌘" : "Ctrl", "Z"], "Deshacer lo último (mientras se ve el aviso)")}
      ${fila(["Clic derecho"], "Acciones rápidas sobre un turno (en el celular: mantener apretado)")}${fila(["Esc"], "Cerrar la ventana")}
    </tbody></table>`,
    pie: `<button type="button" class="btn primary" data-a="cerrar">Entendido</button>`,
  });
}

// ═════════════════════════════════ DIÁLOGOS ═════════════════════════════════

let dialogoActual = null;

function abrir({ titulo, sub = "", cuerpo, pie = "", ancho = false, alAbrir, refrescar }) {
  const d = $("#dlg");
  const foco = d.open ? claveFoco() : null;
  // Si es la MISMA ventana refrescándose, se actualiza con morph (no parpadea, no pierde lo escrito ni
  // duplica escuchas). Si es otra ventana, se arma de cero.
  const mismaVentana = d.open && refrescar && dialogoActual?.refrescar === refrescar;
  const aviso = mismaVentana ? $("#dlg-aviso", d)?.outerHTML : null;
  d.className = ancho ? "wide" : "";
  const html = `
    <div class="dlg-h"><div><h2 id="dlg-titulo">${titulo}</h2>${sub ? `<p class="small muted" style="margin:4px 0 0">${sub}</p>` : ""}</div>
      <button type="button" class="btn sm ghost" data-a="cerrar" aria-label="Cerrar">✕</button></div>
    <div class="dlg-b">${aviso ?? `<p id="dlg-aviso" class="small" role="status" aria-live="polite" style="margin:0"></p>`}${cuerpo}</div>
    ${pie ? `<div class="dlg-f">${pie}</div>` : ""}`;
  if (mismaVentana) { morph(d, html); devolverFoco(foco, d); return; }
  d.innerHTML = html;
  dialogoActual = { refrescar };
  if (!d.open) d.showModal();
  // Si algo abre una ventana mientras la pantalla está bloqueada, el bloqueo vuelve a quedar arriba de todo.
  if (bloqueo.activo) { const bl = $("#bloqueo"); bl.close(); bl.showModal(); }
  alAbrir?.(d);
  devolverFoco(foco, d);
  // Si la ventana cambió de contenido (p. ej. «Nuevo turno» → «Turno reservado ✔»), el foco no puede quedar en el body.
  if (!d.contains(document.activeElement)) (d.querySelector(".dlg-f .btn.primary") ?? d.querySelector('[data-a="cerrar"]'))?.focus();
}
function cerrarDialogo() { const d = $("#dlg"); if (d.open) d.close(); dialogoActual = null; }

// Buscador de productos con lupa, reutilizable dentro de cualquier ventana.
function buscadorProductos(clave, { soloVendibles = true } = {}) {
  const q = ui.busca[clave] ?? "";
  const res = q ? M.buscarProductos(E, q, { soloVendibles }).slice(0, 8) : [];
  const elegido = ui.producto[clave] ? M.producto(E, ui.producto[clave]) : null;
  return `<div class="search"><label class="sr" for="bp-${clave}">Buscar producto</label><input id="bp-${clave}" data-busca="${clave}" placeholder="Buscar producto o plato (o pasá el lector)" value="${esc(q)}" autocomplete="off"></div>
    <div class="sug">${res.map((p) => `<button type="button" data-a="elegirProducto" data-c="${clave}" data-v="${p.id}" aria-pressed="${ui.producto[clave] === p.id}">${esc(p.nombre)} <span class="small muted">· ${M.pesos(p.precio)}${p.stock != null ? ` · quedan ${p.stock}` : ""}</span></button>`).join("")}</div>
    ${elegido ? `<p class="small" style="margin:4px 0 0">Elegido: <b>${esc(elegido.nombre)}</b> · ${M.pesos(elegido.precio)}</p>` : ""}`;
}

// ───── usuario y PIN ─────

// Los PIN de ejemplo no quedan a la vista de cualquiera que pase por el mostrador: se muestran sólo si se piden.
// (Es una ayuda de la DEMO; con usuarios reales no existe.)
const pinesDemo = (usuarios) => MODO_REAL ? "" : `<details class="demo-pins"><summary>¿Probando la demo? Ver los PIN de ejemplo</summary><p style="margin:6px 0 0">${usuarios.map((u) => `${esc(u.nombre.split(" ")[0])} ${esc(u.pin)}`).join(" · ")}</p></details>`;
// Cambio de usuario: como el bloqueo, 5 PIN mal → 30 s de espera (2 dígitos se adivinan rápido si no hay tope).
const intentosPin = { fallos: 0, hasta: 0 };

function cambiarUsuario() {
  let elegido = USUARIO;
  abrir({
    titulo: "¿Quién usa el sistema?",
    sub: "Elegí tu usuario y poné tu PIN de 2 dígitos.",
    cuerpo: `<div class="usuarios" role="group" aria-label="Usuarios">${E.usuarios.filter((u) => u.activo !== false).map((u) => `<button type="button" data-a="elegirUsuario" data-v="${u.id}" aria-pressed="${u.id === elegido}"><span><b>${esc(u.nombre)}</b></span><span class="small muted">${M.ROLES[u.rol]}</span></button>`).join("")}</div>
      ${campoPin("pin-usuario", "PIN")}
      ${pinesDemo(E.usuarios.filter((u) => u.activo !== false))}
      <details><summary class="small">¿Sos nuevo/a? Pedí acceso</summary><div class="row" style="margin-top:8px"><label class="sr" for="nuevo-acceso">Tu nombre</label><input id="nuevo-acceso" placeholder="Tu nombre" style="max-width:220px"><button type="button" class="btn sm" data-a="pedirAcceso">Pedir acceso</button></div><p class="small muted">Le llega al dueño; cuando lo aprueba te da un PIN.</p></details>`,
    pie: `<button type="button" class="btn" data-a="cerrar">Cancelar</button><button type="button" class="btn primary" data-a="entrar">Entrar</button>`,
    alAbrir(d) {
      $("#pin-usuario", d).focus();
      acciones._elegido = () => elegido;
      acciones._setElegido = (v) => { elegido = v; d.querySelectorAll('[data-a="elegirUsuario"]').forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === v))); $("#pin-usuario", d).focus(); };
    },
  });
}

// ───── créditos: paso previo de confirmación ─────
// Pagar con créditos no sale de la caja: antes de descontarlos se muestra de quién son, cuánto se usa, qué cubre
// (la seña, la parte de un jugador o la cuenta del buffet) y con cuánto queda.
function pedirConfirmacionCredito(op) {
  const cl = op.clienteId ? M.cliente(E, op.clienteId) : null;
  if (!cl) return toast("Ese jugador no tiene ficha de cliente: no tiene créditos para usar.", { error: true });
  if (!(op.monto > 0)) return toast("El monto tiene que ser mayor a cero.", { error: true });
  if (cl.monedero < op.monto) return toast(`${cl.nombre} tiene ${M.pesos(cl.monedero)} en créditos: no alcanza para ${M.pesos(op.monto)}.`, { error: true });
  ui.pendienteCredito = op;
  dialogoActual?.refrescar?.();
  requestAnimationFrame(() => $('#dlg [data-a="confirmarCredito"]')?.focus());
}
function panelCredito(dueno) {
  const op = ui.pendienteCredito;
  if (!op || op.dueno !== dueno) return "";
  const cl = M.cliente(E, op.clienteId);
  return `<div class="confirma-credito" role="group" aria-labelledby="cc-t">
    <p id="cc-t" style="margin:0"><b>¿Usamos los créditos de ${esc(cl.nombre)}?</b></p>
    <dl class="kv num"><dt>${esc(op.que)}</dt><dd>${M.pesos(op.monto)}</dd><dt>Créditos hoy</dt><dd>${M.pesos(cl.monedero)}</dd><dt class="tot">Le quedan</dt><dd class="tot">${M.pesos(cl.monedero - op.monto)}</dd></dl>
    ${op.cubreSena ? `<p class="small" style="margin:0">Con esto queda <b>pagada la seña</b> del turno.</p>` : ""}
    <div class="row"><button type="button" class="btn primary" data-a="confirmarCredito">Sí, usar ${M.pesos(op.monto)} de créditos</button><button type="button" class="btn" data-a="anularCredito">No, elegir otro medio</button></div>
  </div>`;
}

// Cargos de una cuenta, con − / + para corregir sin borrar y rehacer.
function listaCargos(cta, { compacta = false } = {}) {
  if (!cta.items.length) return `<p class="small muted" style="margin:0">Sin cargos.</p>`;
  const abierta = cta.estado === "abierta";
  return `<ul class="cargos${compacta ? " compacta" : ""}">${cta.items.map((i, k) => `<li class="num">
      <span>${i.min != null && !compacta ? `<span class="muted small">${M.hhmm(i.min)}</span> ` : ""}${esc(i.nombre)}${i.manual ? ` <span class="chip info">manual</span>` : ""}${i.alquiler ? (i.devuelto ? " (devuelta)" : " (en uso)") : ""}${i.transferidoDe ? ` <span class="small muted">· de ${esc(i.transferidoDe)}</span>` : ""}</span>
      ${abierta ? `<span class="qty"><button type="button" data-a="ajustar" data-v="${cta.id}" data-j="${k}" data-m="-1" aria-label="Uno menos de ${esc(i.nombre)}">−</button><b>${i.cant}</b><button type="button" data-a="ajustar" data-v="${cta.id}" data-j="${k}" data-m="1" aria-label="Uno más de ${esc(i.nombre)}" ${i.manual ? "disabled" : ""}>+</button></span>` : `<b>${i.cant} ×</b>`}
      <span class="r">${M.pesos(i.cant * i.precioUnit)}</span></li>`).join("")}</ul>`;
}

// ───── turno: la cuenta de la cancha y la de cada jugador ─────

// La cuenta del turno en UN solo lugar: lo que debe cada jugador (cancha + cargos) y los totales, con los cierres:
// cobrar todo, cobrar a un jugador, cerrar la cancha y que la mesa siga cargando, y cerrar los cargos después.
function resumenTurno(r, t, cl) {
  if (!t.ok || ["cancelada", "suspendida", "no_show"].includes(r.estado)) return "";
  const { totales: T } = t;
  const abierto = t.abierto;
  const hayAlgo = T.pendiente > 0;
  const filas = t.jugadores.map((j) => {
    const quien = j.cargos.aCargoDeNombre ?? (j.cancha.aCargoDe != null ? r.jugadores[j.cancha.aCargoDe]?.nombre : null);
    const detalle = [abierto ? (j.cancha.pago ? "cancha ✔" : j.cancha.aCargoDe != null ? `cancha → ${esc(r.jugadores[j.cancha.aCargoDe]?.nombre ?? "")}` : `cancha ${M.pesos(j.cancha.aPagar)}`) : "", j.cargos.saldo ? `cargos ${M.pesos(j.cargos.saldo)}${j.cargos.aCargoDe ? ` → ${esc(j.cargos.aCargoDeNombre)}` : ""}` : "", j.cargos.deOtros ? `+ cargos de ${esc(j.cargos.aSuCargo.join(", "))} ${M.pesos(j.cargos.deOtros)}` : ""].filter(Boolean).join(" · ");
    return `<li class="fila-jug"><span><b>${esc(j.nombre)}</b><br><span class="small muted">${detalle || "nada pendiente"}</span></span>
      ${j.aPagar > 0 ? `<button type="button" class="btn sm" data-a="cobrarJugador" data-v="${r.id}" data-j="${j.idx}">Cobrar ${M.pesos(j.aPagar)}</button>` : `<span class="small muted">${quien ? `lo paga ${esc(quien)}` : "✔ al día"}</span>`}</li>`;
  }).join("");
  return `<section class="seccion cuenta-turno" aria-labelledby="ct-t">
    <h3 id="ct-t">Cuenta del turno ${abierto ? "" : `<span class="chip">Cancha cerrada · la mesa sigue</span>`}</h3>
    <dl class="kv num totales-turno" aria-label="Totales del turno"><dt>Cancha</dt><dd>${M.pesos(T.cancha)}</dd><dt>Cargos</dt><dd>${M.pesos(T.cargos)}</dd><dt class="tot">Falta cobrar</dt><dd class="tot">${M.pesos(T.pendiente)}</dd></dl>
    ${hayAlgo ? pickMedios(true, cl) : ""}
    <ul class="filas-jug">${filas}</ul>
    ${t.deOtraMesa.length ? `<p class="small muted" style="margin:0">No se cobra acá: ${t.deOtraMesa.map((x) => `los cargos de ${esc(x.titular)} (${M.pesos(x.saldo)}) los paga ${esc(x.paga)} en su mesa`).join(" · ")}.</p>` : ""}
    <div class="row">
      ${hayAlgo ? `<button type="button" class="btn primary" data-a="cobrarTodo" data-v="${r.id}">Cobrar todo ${M.pesos(T.pendiente)}</button>` : ""}
      ${abierto && r.estado === "en_cancha" ? `<button type="button" class="btn" data-a="cerrarYSeguir" data-v="${r.id}">${T.cancha > 0 ? `Cobrar la cancha ${M.pesos(T.cancha)} y cerrarla` : "Cerrar la cancha"} · la mesa sigue</button>` : ""}
      ${!abierto && t.mesa.length ? `<button type="button" class="btn" data-a="cerrarCargos" data-v="${r.id}">${T.cargos > 0 ? `Cobrar y cerrar los cargos ${M.pesos(T.cargos)}` : "Cerrar los cargos"}</button>` : ""}
      ${!abierto && T.cargos > 0 ? `<button type="button" class="btn" data-a="cerrarCargosCC" data-v="${r.id}">Cargos a cuenta corriente</button>` : ""}
    </div>
    ${abierto && r.estado === "en_cancha" ? `<p class="small muted" style="margin:0">«La mesa sigue»: se cobra la cancha y queda libre para el turno siguiente; los cargos siguen abiertos (Buffet → Mesas) y se cobran cuando se van.</p>` : ""}
  </section>`;
}

function verReserva(id) {
  ui.medio = "efectivo";
  ui.pendienteCredito = null;
  let jugadorSel = 0;
  const pintar = () => {
    const r = M.reserva(E, id);
    if (!r) return cerrarDialogo();
    const c = M.cancha(E, r.canchaId);
    const cl = r.clienteId ? M.cliente(E, r.clienteId) : null;
    const abierto = ["reservada", "en_cancha"].includes(r.estado);
    const s = M.saldo(r);
    const partes = M.partesCancha(r);
    const cuentasJug = r.jugadores.map((j, i) => E.cuentas.find((x) => x.estado === "abierta" && ((j.clienteId && x.clienteId === j.clienteId) || (!j.clienteId && x.reservaId === r.id && x.jugadorIdx === i))));
    const puedeCC = !!cl?.cc.habilitada;
    const t = M.cuentaDelTurno(E, r.id);
    abrir({
      titulo: `${esc(r.titular)} ${marcaRoja(cl)}`,
      sub: `${esc(c.nombre)} · ${esc(fechaCorta(r.fecha))} ${M.hhmm(r.inicio)}–${M.hhmm(r.inicio + r.duracion)} · ${M.TIPOS[r.tipo]} · ${M.ESTADOS[r.estado]}`,
      ancho: true,
      refrescar: pintar,
      cuerpo: `
        ${r.notas ? `<p class="small" style="margin:0">📝 ${esc(r.notas)}</p>` : ""}
        ${resumenTurno(r, t, cl)}
        <div class="dos-cols">
          <div class="seccion">
            <h3>Cuenta de la cancha <span class="num">${M.pesos(s)}</span></h3>
            <dl class="kv num"><dt>Turno (${r.duracion}′)</dt><dd>${M.pesos(r.precio)}</dd><dt>Cobrado</dt><dd>${M.pesos(-M.cobrado(r))}</dd><dt class="tot">Le queda</dt><dd class="tot">${M.pesos(s)}</dd></dl>
            ${r.sena.monto > 0 ? `<p class="small" style="margin:0">Seña ${M.pesos(r.sena.monto)}: ${r.sena.pagada ? "✔ pagada" : "<b>pendiente</b>"}</p>` : ""}
            ${cl ? `<p class="small" style="margin:0">${puedeCC ? `Cuenta corriente hasta ${M.pesos(cl.cc.limite)} · debe ${M.pesos(cl.deuda)}` : "Sin cuenta corriente habilitada"}${cl.monedero ? ` · créditos ${M.pesos(cl.monedero)}` : ""}</p>` : ""}
            ${abierto && s > 0 ? `
              <div class="row"><label class="sr" for="monto">Monto</label><input id="monto" type="number" min="1" value="${r.sena.monto > 0 && !r.sena.pagada ? r.sena.monto : s}" style="max-width:150px"><button type="button" class="btn primary" data-a="pagar" data-v="${r.id}">Cobrar cancha</button></div>
              ${r.jugadores.length > 1 ? `<div class="players partes" role="group" aria-label="Parte de la cancha de cada jugador">${r.jugadores.map((j, i) => {
                const p = partes[i];
                if (p.pago) return `<div class="player"><span>${esc(j.nombre)}</span><span class="small muted">${j.pagadoPor != null ? `✔ la pagó ${esc(r.jugadores[j.pagadoPor]?.nombre ?? "otro")}` : "✔ pagó su parte"}</span><span></span></div>`;
                const otros = r.jugadores.map((x, k) => ({ x, k })).filter(({ k }) => k !== i && !partes[k].pago && partes[k].aCargoDe == null);
                return `<div class="player"><span>${esc(j.nombre)}${p.aPagar > p.propia ? `<br><span class="small muted">paga también por ${esc(partes.map((x, k) => (x.aCargoDe === i ? r.jugadores[k].nombre : null)).filter(Boolean).join(", "))}</span>` : ""}</span>
                  <label class="sr" for="acargo-${i}">Quién paga la parte de ${esc(j.nombre)}</label><select id="acargo-${i}" class="sm" data-a="aCargo" data-v="${r.id}" data-j="${i}">${`<option value="">Paga su parte</option>`}${otros.map(({ x, k }) => `<option value="${k}" ${p.aCargoDe === k ? "selected" : ""}>A cargo de ${esc(x.nombre)}</option>`).join("")}</select>
                  ${p.aCargoDe != null ? `<span class="small muted">${M.pesos(p.propia)} → ${esc(r.jugadores[p.aCargoDe].nombre)}</span>` : `<button type="button" class="btn sm" data-a="pagarParte" data-v="${r.id}" data-j="${i}" data-m="${p.aPagar}">Cobrar ${M.pesos(p.aPagar)}</button>`}</div>`;
              }).join("")}</div>` : ""}
              ${panelCredito(`r-${r.id}`)}` : ""}
            <div class="row">
              ${r.estado === "reservada" ? `<button type="button" class="btn primary" data-a="checkin" data-v="${r.id}">Abrir cancha</button>` : ""}
              ${abierto ? `<button type="button" class="btn ${s > 0 ? "" : "primary"}" data-a="finalizar" data-v="${r.id}" ${s > 0 ? "disabled" : ""}>Cerrar cancha${s > 0 ? " (falta cobrar)" : ""}</button>` : ""}
              ${abierto && s > 0 ? `<button type="button" class="btn" data-a="aCuenta" data-v="${r.id}" ${puedeCC ? "" : "disabled"} title="${puedeCC ? "" : "Sin cuenta corriente habilitada"}">Cerrar y sumar ${M.pesos(s)} a su cuenta</button>` : ""}
            </div>
            <p class="small muted" style="margin:0">Cerrar la cancha no cierra los cargos: cada jugador sigue cargando y se cobra cuando se va.</p>
          </div>
          <div class="seccion">
            <h3>Cargos de los jugadores</h3>
            <div class="players">${r.jugadores.map((j, i) => {
              const cta = cuentasJug[i];
              const jc = j.clienteId ? M.cliente(E, j.clienteId) : null;
              const otrasCtas = cuentasJug.filter((x, k) => x && k !== i && !x.aCargoDe);
              const pagaOtro = cta?.aCargoDe ? M.cuenta(E, cta.aCargoDe) : null;
              return `<div class="player jug-cargos"><input type="radio" name="jug" id="jug-${i}" data-a="jugador" data-v="${i}" ${i === jugadorSel ? "checked" : ""}><label for="jug-${i}">${esc(j.nombre)} ${marcaRoja(jc)}<br><span class="small muted">${cta ? `Cuenta abierta: ${M.pesos(M.saldoCuenta(cta))}${pagaOtro?.estado === "abierta" ? ` → ${esc(pagaOtro.titular)}` : ""}` : "Sin cargos"}</span></label>${cta ? `<button type="button" class="btn sm" data-a="verCuenta" data-v="${cta.id}">Ver / cobrar</button>` : "<span></span>"}${cta?.items.length ? listaCargos(cta, { compacta: true }) : ""}
                ${cta && otrasCtas.length ? `<label class="sr" for="acc-${i}">Quién paga los cargos de ${esc(j.nombre)}</label><select id="acc-${i}" class="sm" data-a="aCargoCargos" data-v="${cta.id}"><option value="">Paga sus cargos</option>${otrasCtas.map((x) => `<option value="${x.id}" ${cta.aCargoDe === x.id ? "selected" : ""}>Sus cargos los paga ${esc(x.titular)}</option>`).join("")}</select>` : ""}</div>`;
            }).join("")}</div>
            ${r.estado !== "cancelada" && r.estado !== "suspendida" && r.estado !== "no_show" ? `${buscadorProductos("turno")}
              <div class="row"><label class="sr" for="cant-turno">Cantidad</label><input id="cant-turno" type="number" min="1" value="1" style="max-width:80px">
                <button type="button" class="btn" data-a="consumo" data-v="${r.id}" data-m="cuenta">Sumar a su cuenta</button>
                <button type="button" class="btn accent" data-a="consumo" data-v="${r.id}" data-m="cobrar">Cobrar ahora</button></div>
              <p class="small muted" style="margin:0">«Cobrar ahora» usa el medio elegido arriba (${M.MEDIOS[ui.medio === "monedero" ? "efectivo" : ui.medio]}).</p>` : ""}
            ${abierto && r.jugadores.length < 4 ? `<div class="row"><label class="sr" for="nuevo-jug">Jugador</label><input id="nuevo-jug" data-busca="jug" value="${esc(ui.busca.jug ?? "")}" placeholder="Sumar jugador (nombre, o buscá su ficha)" autocomplete="off" style="flex:1"><button type="button" class="btn sm" data-a="sumarJugador" data-v="${r.id}">Sumar</button></div>
              ${(ui.busca.jug ?? "").trim().length >= 2 ? `<div class="sug">${M.buscarClientes(E, ui.busca.jug).filter((c) => !r.jugadores.some((j) => j.clienteId === c.id)).slice(0, 5).map((c) => `<button type="button" data-a="sumarJugadorFicha" data-v="${r.id}" data-c="${c.id}">${esc(c.nombre)} <span class="small muted">· ficha${c.cc.habilitada ? " · cuenta corriente" : ""}${c.monedero ? ` · créditos ${M.pesos(c.monedero)}` : ""}</span></button>`).join("")}</div>` : ""}` : ""}
          </div>
        </div>
        ${abierto ? `<details><summary><b>Mover o extender</b></summary><div class="row" style="margin-top:8px"><label class="sr" for="mover-c">Cancha destino</label><select id="mover-c" style="max-width:200px">${E.canchas.filter((x) => x.id !== r.canchaId).map((x) => `<option value="${x.id}">${esc(x.nombre)}${x.cubierta ? "" : " (descubierta)"}</option>`).join("")}</select><button type="button" class="btn sm" data-a="mover" data-v="${r.id}">Pasar a esa cancha</button><button type="button" class="btn sm" data-a="extender" data-v="${r.id}">Extender 30′</button></div></details>` : ""}
      `,
      pie: abierto ? `
        <a class="btn" target="_blank" rel="noopener" href="${esc(wa(M.mensajeWhatsApp("recordatorio", { nombre: r.titular.split(" ")[0], hora: M.hhmm(r.inicio), cancha: c.nombre })))}">WhatsApp</a>
        ${r.estado === "reservada" ? `<button type="button" class="btn danger" data-a="falta" data-v="${r.id}">Falta (no vino)</button>${r.fijoId ? `<button type="button" class="btn" data-a="liberarFijo" data-v="${r.id}">Esta semana no vienen</button>` : ""}<button type="button" class="btn danger" data-a="cancelar" data-v="${r.id}">Cancelar turno</button>` : ""}
        ${r.estado === "en_cancha" && !r.interrumpido ? `<button type="button" class="btn danger" data-a="interrumpir" data-v="${r.id}">Corte de luz / se suspende</button>` : ""}`
        : `<button type="button" class="btn" data-a="cerrar">Listo</button>`,
      alAbrir() { acciones._jugador = (v) => { jugadorSel = Number(v); }; acciones._jugadorSel = () => jugadorSel; },
    });
  };
  pintar();
}

function faltaDialogo(id) {
  const r = M.reserva(E, id);
  const importe = Math.max(0, M.saldo(r));
  const conFicha = r.jugadores.filter((j, i) => (i === 0 ? j.clienteId ?? r.clienteId : j.clienteId)).length;
  abrir({
    titulo: "Falta: se cobra el turno entero",
    sub: `${esc(r.titular)} · ${M.hhmm(r.inicio)} · ${M.pesos(r.precio)}${M.cobrado(r) ? ` (ya pagó ${M.pesos(M.cobrado(r))} de seña)` : ""}`,
    cuerpo: `<p style="margin:0">Quedan <b>${M.pesos(importe)}</b> para cobrar. Va a la cuenta corriente aunque no la tenga habilitada (es una deuda, no un fiado).</p>
      <p class="small muted" style="margin:0">Repartir en el grupo: cada jugador con ficha (${conFicha} de ${r.jugadores.length}) paga su parte; la de los que no tienen ficha queda a cargo del titular.</p>`,
    pie: `<button type="button" class="btn" data-a="cerrar">Volver</button>${esDuenio() ? `<button type="button" class="btn" data-a="marcarFalta" data-v="${r.id}" data-m="nadie">Sin cargo (excepción)</button>` : ""}<button type="button" class="btn" data-a="marcarFalta" data-v="${r.id}" data-m="grupo" ${r.jugadores.length > 1 ? "" : "disabled"}>Repartir en el grupo</button><button type="button" class="btn danger" data-a="marcarFalta" data-v="${r.id}" data-m="titular">Cobrar todo al titular</button>`,
  });
}

// ───── cuenta de cargos ─────

function verCuenta(id) {
  ui.medio = "efectivo";
  ui.pendienteCredito = null;
  const pintar = () => {
    const cta = M.cuenta(E, id);
    if (!cta) return cerrarDialogo();
    const c = cta.clienteId ? M.cliente(E, cta.clienteId) : null;
    const s = M.saldoCuenta(cta);
    const abierta = cta.estado === "abierta";
    abrir({
      titulo: `Cargos de ${esc(cta.titular)} ${marcaRoja(c)}`,
      sub: abierta ? `Cuenta abierta · debe ${M.pesos(s)}` : "Cuenta cerrada",
      ancho: true,
      refrescar: pintar,
      cuerpo: `
        <div class="dos-cols">
          <div class="seccion"><h3>Detalle <span class="num">${M.pesos(M.totalCuenta(cta))}</span></h3>
            ${listaCargos(cta)}
            <dl class="kv num"><dt>Pagado</dt><dd>${M.pesos(M.cobradoCuenta(cta))}</dd><dt class="tot">Debe</dt><dd class="tot">${M.pesos(s)}</dd></dl>
          </div>
          ${abierta ? `<div class="seccion"><h3>Cargar</h3>${buscadorProductos("cuenta")}
            <div class="row"><label class="sr" for="cant-cuenta">Cantidad</label><input id="cant-cuenta" type="number" min="1" value="1" style="max-width:80px"><button type="button" class="btn primary" data-a="cargarCuenta" data-v="${cta.id}">Cargar</button></div>
            <div class="row">${E.productos.filter((p) => p.plato && p.activo !== false).slice(0, 6).map((p) => `<button type="button" class="btn sm" data-a="rapido" data-v="${cta.id}" data-c="${p.id}">+ ${esc(p.nombre.split(" con ")[0])}</button>`).join("")}</div>
          </div>` : ""}
        </div>
        ${abierta ? mesaCompleja(cta) : ""}
        ${abierta && s > 0 ? `<div class="seccion"><h3>Cobrar</h3>${pickMedios(true, c)}<div class="row"><label class="sr" for="monto-cta">Monto</label><input id="monto-cta" type="number" min="1" value="${s}" style="max-width:150px"><button type="button" class="btn primary" data-a="pagarCuenta" data-v="${cta.id}">Cobrar</button></div>${panelCredito(`c-${cta.id}`)}</div>` : ""}
        ${abierta && s > 0 ? seccionFiado(cta, c, s) : ""}`,
      pie: abierta ? `<button type="button" class="btn" data-a="cerrar">Dejar abierta</button>${s > 0 ? `<button type="button" class="btn" data-a="cerrarCuenta" data-v="${cta.id}" data-m="cuenta" ${c && M.puedeACuenta(c, s).ok ? "" : "disabled"} title="${c && M.puedeACuenta(c, s).ok ? "" : "Sin cuenta corriente ni fiado aprobado"}">Sumar ${M.pesos(s)} a su cuenta corriente</button>` : ""}<button type="button" class="btn primary" data-a="cerrarCuenta" data-v="${cta.id}" ${s > 0 ? "disabled" : ""}>Cerrar cuenta${s > 0 ? " (falta cobrar)" : ""}</button>` : `<button type="button" class="btn" data-a="cerrar">Listo</button>`,
    });
  };
  pintar();
}

// Fiar la cuenta de hoy: si el cliente no tiene cuenta corriente (o no le da el límite), recepción le pide el OK
// a un dueño. El dueño aprueba en el sistema o desde su celular (link por WhatsApp → código de 6 letras).
function seccionFiado(cta, c, s) {
  if (!c) return `<p class="small muted" style="margin:0">Para fiar hace falta la ficha del cliente (Clientes → nuevo).</p>`;
  const deOtros = E.cuentas.filter((x) => x.estado === "abierta" && x.aCargoDe === cta.id).reduce((t, x) => t + Math.max(0, M.saldoCuenta(x)), 0);
  s += deOtros;
  if (M.puedeACuenta(c, s).ok) return "";
  const n = E.novedades.find((x) => x.estado === "pendiente" && x.clienteId === c.id);
  if (n) return panelAprobacion(n);
  return `<div class="seccion"><h3>Fiar esta cuenta</h3><p class="small" style="margin:0">${esc(c.nombre)} ${c.cc.habilitada ? "no tiene margen en su cuenta corriente" : "no tiene cuenta corriente"}. Pedile el OK a Rober o a Majo para pasar ${M.pesos(s)} a su cuenta.</p>
    <div class="row"><button type="button" class="btn" data-a="pedirFiado" data-v="${cta.id}">Pedir OK para fiar ${M.pesos(s)}</button></div></div>`;
}
function linkAprobacion(n) {
  const d = M.datosAprobacion(E, n.id);
  return `${location.origin}${location.pathname}#aprobar&${new URLSearchParams(d).toString()}`;
}
function panelAprobacion(n) {
  const c = M.cliente(E, n.clienteId);
  const monto = n.monto ?? n.limite;
  const que = n.tipo === "fiado" ? `fiarle ${M.pesos(monto)} a ${c.nombre}` : `cuenta corriente para ${c.nombre} hasta ${M.pesos(monto)}`;
  const duenios = E.usuarios.filter((u) => u.rol === "duenio" && u.activo !== false);
  const link = linkAprobacion(n);
  return `<div class="seccion aprobacion" aria-labelledby="ap-${n.id}"><h3 id="ap-${n.id}">Esperando al dueño</h3>
    <p class="small" style="margin:0">${esc(n.pidio)} pidió ${esc(que)}.</p>
    ${esDuenio() ? `<div class="row"><button type="button" class="btn primary" data-a="aprobarAca" data-v="${n.id}">Aprobar ${M.pesos(monto)} (sos dueño)</button><button type="button" class="btn danger" data-a="rechazarCC" data-v="${n.id}">Rechazar</button></div>` : ""}
    <div class="row">${duenios.map((u) => `<a class="btn sm" target="_blank" rel="noopener" data-wa-aprob="${u.id}" href="${esc(waA(u.id, M.mensajeWhatsApp("aprobacion", { duenio: u.nombre, pidio: n.pidio, cliente: c.nombre, monto: M.pesos(monto), tipo: n.tipo, link })))}">Avisar a ${esc(u.nombre)} por WhatsApp</a>`).join("")}</div>
    <p class="small muted" style="margin:0">El dueño abre el link, pone su PIN y te manda un código. ${contactos()[duenios[0]?.id] ? "" : "Sin celular cargado (Ajustes), WhatsApp abre para elegir el chat."}</p>
    <div class="row"><label class="f" style="max-width:170px">Código del dueño<input id="codigo-aprob" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="7" placeholder="ABC-DEF"></label>
      <label class="f" style="max-width:150px">Monto aprobado<input id="codigo-monto" type="number" min="1" value="${monto}"></label>
      <button type="button" class="btn primary" data-a="aprobarCodigo" data-v="${n.id}" style="align-self:flex-end">Aprobar con el código</button></div>
  </div>`;
}

// El dueño abre el link de WhatsApp en su celular: pone su PIN y le sale el código para mandarle a recepción.
// Si el pedido está en ESTE dispositivo (la misma compu), se aprueba directo con su PIN.
function dialogoAprobar(d) {
  // Sólo es «este dispositivo» en la jornada real y si el pedido coincide entero (en la demo los ids se repiten).
  const local = MODO_REAL ? E.novedades.find((x) => x.id === d.id && x.clienteId === d.c && x.estado === "pendiente") : null;
  const duenios = E.usuarios.filter((u) => u.rol === "duenio" && u.activo !== false);
  let elegido = duenios[0]?.id ?? null, codigo = null;
  const que = d.t === "fiado" ? `fiarle ${M.pesos(Number(d.m))} a ${d.n}` : `cuenta corriente para ${d.n} hasta ${M.pesos(Number(d.m))}`;
  const pintar = () => abrir({
    titulo: "Pedido de crédito",
    sub: `${esc(d.p)} pide ${esc(que)}${d.f ? ` · ${esc(ddmm(d.f))}` : ""}`,
    refrescar: pintar,
    cuerpo: codigo
      ? `<p style="margin:0">Mandale este código a ${esc(d.p)}:</p><p class="codigo-aprob num" aria-live="polite">${esc(codigo.codigo)}</p>
         <p class="small muted" style="margin:0">Vale para ${esc(d.n)} por ${M.pesos(codigo.monto)}. Si el PIN que pusiste no es el tuyo, el código no va a servir.</p>`
      : `<div class="usuarios" role="group" aria-label="¿Quién aprueba?">${duenios.map((u) => `<button type="button" data-a="aprobQuien" data-v="${u.id}" aria-pressed="${u.id === elegido}"><b>${esc(u.nombre)}</b></button>`).join("")}</div>
         <div class="row"><label class="f" style="max-width:160px">Tu PIN<input id="ap-pin" type="password" inputmode="numeric" autocomplete="off" maxlength="2" placeholder="••"></label>
         <label class="f" style="max-width:160px">Monto que aprobás<input id="ap-monto" type="number" min="1" value="${esc(d.m)}"></label></div>`,
    pie: codigo
      ? `<a class="btn primary" target="_blank" rel="noopener" href="${esc(waA("club", M.mensajeWhatsApp("aprobado", { cliente: d.n, monto: M.pesos(codigo.monto), codigo: codigo.codigo })))}">Mandar el código por WhatsApp</a><button type="button" class="btn" data-a="cerrar">Listo</button>`
      : `<button type="button" class="btn danger" data-a="cerrar">Ahora no</button><button type="button" class="btn primary" data-a="aprobarLink">${local ? "Aprobar" : "Aprobar y ver el código"}</button>`,
    alAbrir(dl) { $("#ap-pin", dl)?.focus(); },
  });
  acciones.aprobQuien = (b) => { elegido = b.dataset.v; pintar(); };
  acciones.aprobarLink = () => {
    const pin = val("#ap-pin");
    const monto = Math.round(Number(val("#ap-monto")));
    if (!(monto > 0)) return toast("Poné el monto.", { error: true });
    if (!/^\d{2}$/.test(pin)) return toast("El PIN son 2 números.", { error: true });
    if (local) {
      const espera = Math.ceil((intentosPin.hasta - Date.now()) / 1000);
      if (espera > 0) return toast(`Demasiados intentos: esperá ${espera} s.`, { error: true });
      const v = M.verificarPin(E, elegido, pin);
      if (!v.ok) { intentosPin.fallos += 1; if (intentosPin.fallos >= 5) { intentosPin.fallos = 0; intentosPin.hasta = Date.now() + 30_000; } return toast(v.motivo, { error: true }); }
      intentosPin.fallos = 0;
      return cerrarSiSale(M.resolverCredito(E, d.id, { aprobar: true, monto }, { usuarioId: elegido, pin }, AHORA), `Aprobado: ${d.n} ${M.pesos(monto)}.`);
    }
    codigo = { codigo: M.codigoAprobacion({ pin, novedadId: d.id, clienteId: d.c, monto, fecha: d.f }), monto };
    pintar();
  };
  pintar();
}

// Mesa compleja: cada cargo se pasa (entero o en parte) a la cuenta de quien lo paga, y lo que no está en la
// lista se carga a mano. Un descuento (monto negativo) lo autoriza el dueño con su PIN.
function mesaCompleja(cta) {
  const otras = M.cuentasAbiertas(E).filter((x) => x.id !== cta.id && x.titular !== "Mostrador");
  return `<details class="seccion mesa"><summary><b>Mesa compleja: repartir o cargar a mano</b></summary>
    <div class="stack" style="margin-top:10px">
      ${cta.items.length ? `<div><h3 style="margin:0 0 6px">Pasar un cargo a otra cuenta</h3>
        ${otras.length ? `<div class="row"><label class="sr" for="tc-item">Cargo</label><select id="tc-item" style="flex:2;min-width:180px">${cta.items.map((i, k) => `<option value="${k}">${i.cant} × ${esc(i.nombre)} · ${M.pesos(i.cant * i.precioUnit)}</option>`).join("")}</select>
          <label class="sr" for="tc-cant">Cuántos</label><input id="tc-cant" type="number" min="1" placeholder="Todos" style="max-width:90px">
          <label class="sr" for="tc-dest">A la cuenta de</label><select id="tc-dest" style="flex:1;min-width:150px">${otras.map((x) => `<option value="${x.id}">${esc(x.titular)}</option>`).join("")}</select>
          <button type="button" class="btn" data-a="pasarCargo" data-v="${cta.id}">Pasar</button></div>
        <p class="small muted" style="margin:4px 0 0">Vacío = el cargo entero. Cada uno paga lo suyo, como quieran repartirlo.</p>`
        : `<p class="small muted" style="margin:0">No hay otra cuenta abierta. Abrí la de la otra persona con «Abrir cuenta» y volvé.</p>`}</div>` : ""}
      <div><h3 style="margin:0 0 6px">Cargo manual (excepción)</h3>
        <div class="row"><label class="sr" for="cm-con">Concepto</label><input id="cm-con" placeholder="Concepto (ej.: torta de cumpleaños)" style="flex:2;min-width:180px" maxlength="60">
          <label class="sr" for="cm-tipo">Tipo</label><select id="cm-tipo" style="max-width:130px"><option value="cargo">Cargo</option><option value="descuento">Descuento</option></select>
          <label class="sr" for="cm-mon">Monto</label><input id="cm-mon" type="number" min="1" step="50" placeholder="$" style="max-width:130px">
          <label class="sr" for="cm-pin">PIN del dueño (sólo descuentos)</label><input id="cm-pin" type="password" inputmode="numeric" autocomplete="off" maxlength="2" placeholder="PIN dueño" style="max-width:110px">
          <button type="button" class="btn" data-a="cargoManual" data-v="${cta.id}">Cargar</button></div>
        <p class="small muted" style="margin:4px 0 0">El PIN del dueño sólo hace falta para un descuento.</p></div>
    </div></details>`;
}

function abrirConsumo() {
  const pintar = () => {
    const q = ui.busca.cliCons ?? "";
    const res = q ? M.buscarClientes(E, q).slice(0, 6) : [];
    abrir({
      titulo: "Abrir cuenta de cargos",
      sub: "A nombre de un cliente (queda abierto hasta que se cobre) o de alguien sin ficha.",
      refrescar: pintar,
      cuerpo: `<div class="search"><label class="sr" for="cli-cons">Buscar cliente</label><input id="cli-cons" data-busca="cliCons" placeholder="Buscar cliente por nombre o teléfono" value="${esc(q)}" autocomplete="off"></div>
        <div class="sug">${res.map((c) => `<button type="button" data-a="abrirCuentaCliente" data-v="${c.id}">${esc(c.nombre)} ${marcaRoja(c)}</button>`).join("")}</div>
        <div class="row"><label class="sr" for="cons-libre">Nombre sin ficha</label><input id="cons-libre" placeholder="O a nombre de (ej.: Mesa 4)" style="max-width:260px"><button type="button" class="btn" data-a="abrirCuentaLibre">Abrir</button></div>`,
    });
  };
  pintar();
}

function mostrador() {
  ui.carrito = {};
  ui.medio = "efectivo";
  const pintar = () => {
    const total = Object.entries(ui.carrito).reduce((s, [id, n]) => s + M.producto(E, id).precio * n, 0);
    abrir({
      titulo: "Venta rápida",
      sub: "Se cobra en el acto. Para dejarlo a nombre de alguien, usá «Abrir cuenta».",
      refrescar: pintar,
      cuerpo: `${buscadorProductos("mostrador")}
        <div class="row"><button type="button" class="btn sm" data-a="sumarCarrito">Agregar el elegido</button></div>
        <div class="prod-list">${Object.entries(ui.carrito).map(([id, n]) => { const p = M.producto(E, id); return `<div class="prod"><span>${esc(p.nombre)}</span><span class="qty"><button type="button" data-a="qty" data-v="${id}" data-m="-1" aria-label="Uno menos de ${esc(p.nombre)}">−</button><b class="num">${n}</b><button type="button" data-a="qty" data-v="${id}" data-m="1" aria-label="Uno más de ${esc(p.nombre)}">+</button></span><span class="num">${M.pesos(p.precio * n)}</span></div>`; }).join("") || `<p class="small muted">Buscá y agregá productos.</p>`}</div>
        ${pickMedios()}<dl class="kv num"><dt class="tot">Total</dt><dd class="tot">${M.pesos(total)}</dd></dl>`,
      pie: `<button type="button" class="btn" data-a="cerrar">Cancelar</button><button type="button" class="btn primary" data-a="cobrarMostrador" ${total ? "" : "disabled"}>Cobrar ${M.pesos(total)}</button>`,
    });
  };
  pintar();
}

// ───── nuevo turno ─────

function nuevoTurno({ canchaId, inicio } = {}) {
  const f = { canchaId: canchaId ?? E.canchas[0].id, inicio: inicio ?? null, duracion: E.config.duracionTurno, clienteId: null, tipo: "turno", origen: "mostrador" };
  ui.busca.cliTurno = "";
  const pintar = () => {
    // Hoy se ofrecen también los turnos que ya empezaron y todavía no terminaron (se olvidaron de cargarlos).
    const desde = VISTA === HOY ? Math.floor((AHORA.min - f.duracion + 1) / E.config.paso) * E.config.paso + E.config.paso : undefined;
    const libres = M.huecosLibres(E, VISTA, f.canchaId, f.duracion, desde);
    // Por defecto, el próximo horario; los ya empezados quedan en la lista para cargar el que se olvidaron.
    if (f.inicio == null || !libres.includes(f.inicio)) f.inicio = (VISTA === HOY ? libres.find((m) => m >= Math.floor(AHORA.min / E.config.paso) * E.config.paso) : null) ?? libres[0] ?? null;
    const cl = f.clienteId ? M.cliente(E, f.clienteId) : null;
    const precio = f.inicio != null ? M.precioTurno(E, { fecha: VISTA, inicio: f.inicio, duracion: f.duracion, canchaId: f.canchaId }) : 0;
    const pideSena = M.requiereSena(E, f.clienteId, f.tipo);
    const q = ui.busca.cliTurno ?? "";
    const res = q && !cl ? M.buscarClientes(E, q).slice(0, 6) : [];
    abrir({
      titulo: "Nuevo turno",
      sub: esc(fechaCorta(VISTA)),
      refrescar: pintar,
      cuerpo: `
        <div class="grid2">
          <label class="f">Cancha<select id="f-cancha">${E.canchas.map((c) => `<option value="${c.id}" ${c.id === f.canchaId ? "selected" : ""}>${esc(c.nombre)}${c.cubierta ? "" : " (descubierta)"}</option>`).join("")}</select></label>
          <label class="f">Duración<select id="f-dur">${[60, 90, 120].map((d) => `<option value="${d}" ${d === f.duracion ? "selected" : ""}>${d} min</option>`).join("")}</select></label>
          <label class="f">Hora (sólo libres)<select id="f-hora">${libres.length ? libres.map((m) => `<option value="${m}" ${m === f.inicio ? "selected" : ""}>${M.hhmm(m)}</option>`).join("") : `<option value="">No hay huecos</option>`}</select></label>
          <label class="f">Tipo<select id="f-tipo">${Object.entries(M.TIPOS).filter(([k]) => k !== "fijo").map(([k, v]) => `<option value="${k}" ${k === f.tipo ? "selected" : ""}>${v}</option>`).join("")}</select></label>
          <label class="f">Llegó por<select id="f-origen">${["mostrador", "whatsapp", "teléfono", "instagram"].map((o) => `<option ${o === f.origen ? "selected" : ""}>${o}</option>`).join("")}</select></label>
        </div>
        <div>
          ${cl ? `<div class="row"><span class="chip info">${esc(cl.nombre)}</span>${marcaRoja(cl)}${cl.strikes ? `<span class="chip warn">${cl.strikes} falta(s)</span>` : ""}${cl.cc.habilitada ? `<span class="chip ok">Cuenta corriente</span>` : ""}<button type="button" class="btn sm ghost" data-a="quitarCliente">Cambiar</button></div>`
            : `<div class="search"><label class="sr" for="cli-turno">Buscar cliente</label><input id="cli-turno" data-busca="cliTurno" placeholder="Buscar cliente (nombre o teléfono)" value="${esc(q)}" autocomplete="off"></div><div class="sug">${res.map((c) => `<button type="button" data-a="elegirCliente" data-v="${c.id}">${esc(c.nombre)} ${marcaRoja(c)}</button>`).join("")}</div>
               <div class="grid2" style="margin-top:6px"><label class="f">O a nombre de (sin ficha)<input id="f-titular" placeholder="Ej.: Grupo de Bruno"></label><label class="f">Teléfono (para darlo de alta)<input id="f-tel" inputmode="tel"></label></div>`}
        </div>
        <dl class="kv num"><dt>Precio de la cancha</dt><dd>${M.pesos(precio)}</dd>${pideSena ? `<dt>Seña (${E.config.politica.senaPct}%)</dt><dd>${M.pesos(Math.round((precio * E.config.politica.senaPct) / 100 / 100) * 100)}</dd>` : ""}</dl>
        <p class="err" id="f-err" role="alert"></p>`,
      pie: `<button type="button" class="btn" data-a="cerrar">Cancelar</button><button type="button" class="btn primary" data-a="confirmarTurno">Reservar</button>`,
      alAbrir(d) {
        const leer = () => { f.canchaId = $("#f-cancha", d).value; f.duracion = Number($("#f-dur", d).value); f.inicio = $("#f-hora", d).value === "" ? null : Number($("#f-hora", d).value); f.tipo = $("#f-tipo", d).value; f.origen = $("#f-origen", d).value; };
        ["#f-cancha", "#f-dur", "#f-hora", "#f-tipo"].forEach((s) => $(s, d).addEventListener("change", () => { leer(); pintar(); }));
        $("#f-origen", d).addEventListener("change", leer);
        acciones._turno = {
          elegir(cid) { leer(); f.clienteId = cid; ui.busca.cliTurno = ""; pintar(); },
          quitar() { leer(); f.clienteId = null; pintar(); },
          confirmar() {
            leer();
            if (f.inicio == null) { $("#f-err", d).textContent = "No hay horario libre con esa cancha y duración."; return; }
            let clienteId = f.clienteId, titular;
            if (!clienteId) {
              titular = $("#f-titular", d)?.value.trim() || ui.busca.cliTurno?.trim();
              const tel = $("#f-tel", d)?.value.trim();
              if (titular && tel) { const alta = M.altaCliente(E, { nombre: titular, tel }, AHORA); if (alta.ok) clienteId = alta.cliente.id; }
            }
            const res2 = M.crearReserva(E, { canchaId: f.canchaId, fecha: VISTA, inicio: f.inicio, duracion: f.duracion, tipo: f.tipo, origen: f.origen, clienteId, titular }, AHORA);
            if (!res2.ok) { $("#f-err", d).textContent = res2.motivo; return; }
            ui.busca.cliTurno = "";
            const r = res2.reserva;
            render();
            const msj = M.mensajeWhatsApp("confirmacion", { nombre: r.titular.split(" ")[0], cancha: M.cancha(E, r.canchaId).nombre, fecha: fechaCorta(r.fecha), hora: M.hhmm(r.inicio), sena: r.sena.monto ? M.pesos(r.sena.monto) : "", alias: E.config.cobro?.alias, ref: r.ref });
            abrir({ titulo: "Turno reservado ✔", sub: `${esc(r.titular)} · ${esc(M.cancha(E, r.canchaId).nombre)} ${M.hhmm(r.inicio)}`, cuerpo: `<p class="small muted" style="margin:0">Mensaje de confirmación listo para mandar:</p><div class="wa">${esc(msj)}</div>`, pie: `<a class="btn" target="_blank" rel="noopener" href="${esc(wa(msj))}">Mandar por WhatsApp</a><button type="button" class="btn" data-a="ver" data-v="${r.id}">Abrir el turno</button><button type="button" class="btn primary" data-a="cerrar">Listo</button>` });
          },
        };
      },
    });
  };
  pintar();
}

// ───── caja ─────

function egresoDialogo() {
  abrir({
    titulo: "Egreso en efectivo",
    sub: "Sale del cajón. Pide concepto y el PIN de quien lo hace.",
    cuerpo: `<div class="grid2"><label class="f">Concepto<input id="g-c" placeholder="Ej.: hielo, artículos de limpieza"></label><label class="f">Monto<input id="g-m" type="number" min="1"></label></div>${campoPin("g-pin")}`,
    pie: `<button type="button" class="btn" data-a="cerrar">Cancelar</button><button type="button" class="btn primary" data-a="aplicarEgreso">Registrar egreso</button>`,
    alAbrir(d) { $("#g-c", d).focus(); },
  });
}

function cierreCajaDialogo(diaAtrasado = null) {
  const hoy = M.diaDeCaja(E, AHORA.fecha, AHORA.min);
  if (diaAtrasado) {
    const ra = M.resumenCaja(E, diaAtrasado);
    return abrir({
      titulo: `Cerrar la caja del ${esc(fechaCorta(diaAtrasado))}`,
      sub: "Caja anterior que quedó sin cerrar (lo cobrado antes de las 12 es de la caja del día anterior).",
      cuerpo: `<dl class="kv num">${MEDIOS_CAJA.map((k) => `<dt>${M.MEDIOS[k]}</dt><dd>${M.pesos(ra.porMedio[k])}</dd>`).join("")}<dt class="tot">Efectivo que tiene que haber</dt><dd class="tot">${M.pesos(ra.efectivoEsperado)}</dd></dl>
        <div class="grid2"><label class="f">Efectivo contado de esa caja (contalo)<input id="k-cont" type="number" min="0" value="" placeholder="Contá el efectivo"></label>${campoPin("k-pin", `PIN de ${esc(yo().nombre.split(" ")[0])}`)}</div>`,
      pie: `<button type="button" class="btn" data-a="cerrar">Cancelar</button><button type="button" class="btn primary" data-a="aplicarCierre" data-v="${diaAtrasado}">Cerrar esa caja</button>`,
    });
  }
  if (M.cajaCerrada(E, hoy)) return abrir({ titulo: "La caja de hoy ya está cerrada", cuerpo: `<p style="margin:0">Se cerró una sola vez, como corresponde. Lo que se cobre desde ahora entra en la caja del ${esc(fechaCorta(M.cajaAbierta(E, AHORA)))}.</p>`, pie: `<button type="button" class="btn primary" data-a="cerrar">Entendido</button>` });
  const dia = M.cajaAbierta(E, AHORA);
  const r = M.resumenCaja(E, dia);
  abrir({
    titulo: `Cerrar la caja del ${esc(fechaCorta(dia))}`,
    sub: "La caja diaria va de 12:00 a 12:00. Contá el efectivo del cajón; lo digital ya está registrado.",
    cuerpo: `<dl class="kv num">${MEDIOS_CAJA.map((k) => `<dt>${M.MEDIOS[k]}</dt><dd>${M.pesos(r.porMedio[k])}</dd>`).join("")}<dt>Fondo inicial</dt><dd>${M.pesos(E.caja.fondo)}</dd><dt class="tot">Efectivo que tiene que haber</dt><dd class="tot">${M.pesos(r.efectivoEsperado)}</dd></dl>
      <div class="grid2"><label class="f">Efectivo contado<input id="k-cont" type="number" min="0" value="${r.efectivoEsperado}"></label>${campoPin("k-pin", `PIN de ${esc(yo().nombre.split(" ")[0])}`)}</div>`,
    pie: `<button type="button" class="btn" data-a="cerrar">Cancelar</button><button type="button" class="btn primary" data-a="aplicarCierre">Cerrar caja</button>`,
  });
}

function remitoDialogo() {
  ui.remito = ui.remito ?? { proveedorId: E.proveedores.find((p) => p.activo !== false)?.id, numero: "", items: [] };
  const pintar = () => {
    const R = ui.remito;
    const total = R.items.reduce((s, i) => s + i.cant * i.costo, 0);
    abrir({
      titulo: "Registrar remito",
      sub: "Entra mercadería: suma stock y queda la deuda con el proveedor.",
      ancho: true,
      refrescar: pintar,
      cuerpo: `<div class="grid2">
          <label class="f">Proveedor<select id="r-prov">${E.proveedores.filter((p) => p.activo !== false).map((p) => `<option value="${p.id}" ${p.id === R.proveedorId ? "selected" : ""}>${esc(p.nombre)}</option>`).join("")}</select></label>
          <label class="f">Número de remito<input id="r-num" value="${esc(R.numero)}" placeholder="0001-00001234"></label>
        </div>
        <div class="seccion"><h3>Lector</h3>
          <label class="f" for="r-scan">Pasá el lector (código de barras o etiqueta RF): cada lectura suma 1</label>
          <input id="r-scan" placeholder="Esperando lectura…" autocomplete="off">
          <p class="small muted" style="margin:0">Preparado para lectores que escriben el código y un Enter (USB o Bluetooth, como un teclado). Para probar: escribí 7790000000028 y Enter.</p>
        </div>
        <div class="seccion"><h3>O buscalo</h3>${buscadorProductos("remito", { soloVendibles: false })}<div class="row"><button type="button" class="btn sm" data-a="remitoAgregar">Agregar al remito</button></div></div>
        ${R.items.length ? `<table class="num"><thead><tr><th>Producto</th><th class="r">Cantidad</th><th class="r">Costo unitario</th><th class="r">Subtotal</th><th></th></tr></thead><tbody>${R.items.map((i, k) => `<tr><td>${esc(M.producto(E, i.productoId).nombre)}</td><td class="r"><label class="sr" for="rc-${k}">Cantidad</label><input id="rc-${k}" type="number" min="1" value="${i.cant}" data-rem="cant" data-k="${k}" style="max-width:80px"></td><td class="r"><label class="sr" for="rk-${k}">Costo</label><input id="rk-${k}" type="number" min="0" value="${i.costo}" data-rem="costo" data-k="${k}" style="max-width:110px"></td><td class="r">${M.pesos(i.cant * i.costo)}</td><td><button type="button" class="btn sm ghost" data-a="remitoQuitar" data-v="${k}" aria-label="Quitar ${esc(M.producto(E, i.productoId).nombre)}">✕</button></td></tr>`).join("")}</tbody></table>
          <dl class="kv num"><dt class="tot">Total del remito</dt><dd class="tot">${M.pesos(total)}</dd></dl>` : `<p class="small muted">Todavía no hay productos.</p>`}`,
      pie: `<button type="button" class="btn" data-a="cerrar">Cancelar</button><button type="button" class="btn primary" data-a="guardarRemito" ${R.items.length ? "" : "disabled"}>Registrar remito</button>`,
      alAbrir(d) {
        $("#r-prov", d).addEventListener("change", (ev) => { R.proveedorId = ev.target.value; });
        $("#r-num", d).addEventListener("input", (ev) => { R.numero = ev.target.value; });
        const scan = $("#r-scan", d);
        scan.addEventListener("keydown", (ev) => {
          if (ev.key !== "Enter") return;
          ev.preventDefault();
          ev.stopPropagation();
          const res = M.productoPorCodigo(E, scan.value);
          scan.value = "";
          if (!res.ok) return toast(res.motivo, { error: true });
          sumarAlRemito(res.producto.id, 1);
          pintar();
          $("#r-scan").focus();
          toast(`+1 ${res.producto.nombre}`);
        });
        if (!R.items.length && !R.numero) $("#r-num", d).focus();
      },
    });
  };
  pintar();
}

function sumarAlRemito(productoId, cant) {
  const R = ui.remito;
  const ya = R.items.find((i) => i.productoId === productoId);
  if (ya) ya.cant += cant;
  else R.items.push({ productoId, cant, costo: M.producto(E, productoId).costo });
}

// ───── clientes ─────

function fichaCliente(id) {
  ui.medio = "efectivo";
  const pintar = () => {
    const c = M.cliente(E, id);
    if (!c || c.activo === false) return cerrarDialogo();
    const ec = M.estadoDeCuenta(E, id);
    const pedido = E.novedades.find((n) => n.estado === "pendiente" && n.clienteId === id);
    abrir({
      titulo: `${esc(c.nombre)} ${marcaRoja(c)}`,
      sub: `${c.tel ? esc(c.tel) + " · " : ""}${c.nivel ? `Nivel ${esc(c.nivel)} · ` : ""}${c.strikes} falta(s)${c.monedero ? ` · créditos ${M.pesos(c.monedero)}` : ""}`,
      ancho: true,
      refrescar: pintar,
      cuerpo: `<div class="dos-cols">
        <div class="seccion"><h3>Datos</h3>
          <div class="grid2"><label class="f">Nombre<input id="c-nom" value="${esc(c.nombre)}"></label><label class="f">Teléfono<input id="c-tel" value="${esc(c.tel)}" inputmode="tel"></label><label class="f">Nivel<input id="c-niv" value="${esc(c.nivel)}"></label></div>
          <div class="row"><button type="button" class="btn sm" data-a="guardarCliente" data-v="${c.id}">Guardar cambios</button><button type="button" class="btn sm danger" data-a="bajaCliente" data-v="${c.id}">Dar de baja</button></div>
        </div>
        <div class="seccion"><h3>Cuenta corriente ${c.cc.habilitada ? `<span class="chip info">Hasta ${M.pesos(c.cc.limite)}</span>` : `<span class="chip">No habilitada</span>`}</h3>
          ${puedo("autorizarCC") ? `<div class="row"><label class="sr" for="cc-lim">Límite</label><input id="cc-lim" type="number" min="1000" step="1000" value="${c.cc.limite || 50000}" style="max-width:140px"><button type="button" class="btn sm primary" data-a="ccGuardar" data-v="${c.id}">${c.cc.habilitada ? "Cambiar límite" : "Habilitar"}</button>${c.cc.habilitada ? `<button type="button" class="btn sm danger" data-a="ccCortar" data-v="${c.id}">Cortar</button>` : ""}</div>`
            : pedido ? panelAprobacion(pedido)
            : c.cc.habilitada ? "" : `<div class="row"><label class="sr" for="cc-pedir">Límite pedido</label><input id="cc-pedir" type="number" min="1000" step="1000" value="50000" style="max-width:140px"><label class="sr" for="cc-nota">Motivo</label><input id="cc-nota" placeholder="Motivo (opcional)" style="max-width:200px"><button type="button" class="btn sm" data-a="ccPedir" data-v="${c.id}">Pedir autorización al dueño</button></div>`}
          <h3 style="margin-top:6px">Estado de cuenta <span class="num ${c.deuda > 0 ? "rojo" : ""}">${M.pesos(c.deuda)}</span></h3>
          ${ec.movimientos.length ? `<div class="tbl-wrap"><table class="num small"><thead><tr><th>Fecha</th><th>Concepto</th><th class="r">Importe</th><th class="r">Saldo</th></tr></thead><tbody>${ec.movimientos.map((m) => `<tr><td>${m.fecha ? ddmm(m.fecha) : ""} ${m.min != null ? M.hhmm(m.min) : ""}</td><td>${esc(m.concepto)}</td><td class="r ${m.importe > 0 ? "rojo" : ""}">${M.pesos(m.importe)}</td><td class="r">${M.pesos(m.saldo)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="small muted" style="margin:0">Sin movimientos.</p>`}
          ${c.deuda > 0 ? `${pickMedios()}<div class="row"><label class="sr" for="cc-monto">Monto</label><input id="cc-monto" type="number" min="1" value="${c.deuda}" style="max-width:140px"><button type="button" class="btn primary" data-a="cobrarDeuda" data-v="${c.id}">Cobrar</button><a class="btn sm" target="_blank" rel="noopener" href="${esc(wa(M.mensajeWhatsApp("deuda", { nombre: c.nombre.split(" ")[0], monto: M.pesos(c.deuda) })))}">Recordar por WhatsApp</a></div>` : ""}
        </div></div>`,
    });
  };
  pintar();
}

function altaClienteDialogo() {
  abrir({
    titulo: "Alta de cliente",
    sub: "En Break Point todos son clientes (no hay socios ni beneficios).",
    cuerpo: `<div class="grid2"><label class="f">Nombre y apellido<input id="n-nom"></label><label class="f">Teléfono<input id="n-tel" inputmode="tel"></label><label class="f">Nivel (opcional)<input id="n-niv" placeholder="Ej.: 5ta"></label></div>`,
    pie: `<button type="button" class="btn" data-a="cerrar">Cancelar</button><button type="button" class="btn primary" data-a="guardarAltaCliente">Dar de alta</button>`,
    alAbrir(d) { $("#n-nom", d).focus(); },
  });
}

// ───── proveedores ─────

function fichaProveedor(id) {
  ui.medio = "transferencia";
  const pintar = () => {
    const cc = M.ccProveedor(E, id, auth());
    if (!cc.ok) { cerrarDialogo(); return toast(cc.motivo, { error: true }); }
    const p = cc.proveedor;
    abrir({
      titulo: esc(p.nombre),
      sub: `${esc(p.rubro)}${p.cuit ? ` · CUIT ${esc(p.cuit)}` : ""} · le debemos ${M.pesos(cc.saldo)}`,
      ancho: true,
      refrescar: pintar,
      cuerpo: `<div class="seccion"><h3>Cuenta corriente</h3>
          ${cc.movimientos.length ? `<div class="tbl-wrap"><table class="num small"><thead><tr><th>Fecha</th><th>Concepto</th><th class="r">Debe</th><th class="r">Pagado</th><th class="r">Saldo</th></tr></thead><tbody>${cc.movimientos.map((m) => `<tr><td>${ddmm(m.fecha)} ${M.hhmm(m.min)}</td><td>${esc(m.concepto)}</td><td class="r">${m.debe ? M.pesos(m.debe) : ""}</td><td class="r">${m.haber ? M.pesos(m.haber) : ""}</td><td class="r">${M.pesos(m.saldo)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="small muted">Sin movimientos.</p>`}
        </div>
        ${cc.saldo > 0 ? `<div class="seccion"><h3>Pagar</h3>${pickMedios(false, null, true)}<div class="row"><label class="f" style="max-width:160px">Monto<input id="pp-monto" type="number" min="1" value="${cc.saldo}"></label>${campoPin("pp-pin")}</div><p class="small muted" style="margin:0">El efectivo sale del cajón (queda en la caja del día); la transferencia queda registrada como egreso.</p></div>` : ""}
        <details><summary class="small">Editar datos</summary><div class="grid2" style="margin-top:8px"><label class="f">Nombre<input id="pv-nom" value="${esc(p.nombre)}"></label><label class="f">Rubro<input id="pv-rub" value="${esc(p.rubro)}"></label><label class="f">CUIT<input id="pv-cuit" value="${esc(p.cuit)}"></label><label class="f">Teléfono<input id="pv-tel" value="${esc(p.tel)}"></label></div><button type="button" class="btn sm" data-a="guardarProveedor" data-v="${p.id}" style="margin-top:8px">Guardar</button></details>`,
      pie: `<button type="button" class="btn" data-a="cerrar">Listo</button>${cc.saldo > 0 ? `<button type="button" class="btn primary" data-a="pagarProveedor" data-v="${p.id}">Registrar pago</button>` : ""}`,
    });
  };
  pintar();
}

function altaProveedorDialogo() {
  abrir({
    titulo: "Alta de proveedor",
    cuerpo: `<div class="grid2"><label class="f">Nombre<input id="np-nom"></label><label class="f">Rubro<input id="np-rub" placeholder="Bebidas, cocina, insumos…"></label><label class="f">CUIT<input id="np-cuit"></label><label class="f">Teléfono<input id="np-tel" inputmode="tel"></label></div>`,
    pie: `<button type="button" class="btn" data-a="cerrar">Cancelar</button><button type="button" class="btn primary" data-a="guardarAltaProveedor">Dar de alta</button>`,
    alAbrir(d) { $("#np-nom", d).focus(); },
  });
}

// ───── stock ─────

function productoDialogo(id) {
  const p = id ? M.producto(E, id) : null;
  abrir({
    titulo: p ? `Editar ${esc(p.nombre)}` : "Nuevo producto o plato",
    cuerpo: `<div class="grid2">
        <label class="f">Nombre<input id="pr-nom" value="${esc(p?.nombre ?? "")}"></label>
        ${p ? "" : `<label class="f">Rubro<input id="pr-cat" placeholder="Bebidas, Cocina, Shop…"></label>`}
        <label class="f">Precio de venta<input id="pr-pre" type="number" min="1" value="${p?.precio ?? ""}"></label>
        <label class="f">Costo<input id="pr-cos" type="number" min="0" value="${p?.costo ?? ""}"></label>
        ${p && p.stock === null ? "" : `<label class="f">Mínimo de stock<input id="pr-min" type="number" min="0" value="${p?.minimo ?? 0}"></label>`}
        ${p ? (p.plato ? "" : `<label class="f">Stock actual (conteo) · vacío = sin controlar<input id="pr-stk-aj" type="number" min="0" value="${p.stock ?? ""}" placeholder="Sin controlar"></label>`) : `<label class="f">Stock inicial<input id="pr-stk" type="number" min="0" value="0"></label>`}
        <label class="f">Código interno<input id="pr-cod" value="${esc(p?.codigo ?? "")}" placeholder="Ej.: BP-020"></label>
        <label class="f">Código de fábrica / externo<input id="pr-ext" value="${esc(p?.codigoExterno ?? "")}" placeholder="Pasá el lector (código de barras)" inputmode="numeric"></label>
      </div>
      ${p ? "" : `<label class="row small"><input type="checkbox" id="pr-plato"> Es un plato de cocina (no lleva stock; se mide por venta)</label>`}`,
    pie: `${p ? `<button type="button" class="btn ${p.activo === false ? "" : "danger"}" data-a="bajaProducto" data-v="${p.id}" data-m="${p.activo === false ? "1" : ""}">${p.activo === false ? "Volver a activar" : "Dar de baja"}</button>` : ""}<button type="button" class="btn" data-a="cerrar">Cancelar</button><button type="button" class="btn primary" data-a="guardarProducto" data-v="${p?.id ?? ""}">${p ? "Guardar" : "Dar de alta"}</button>`,
    alAbrir(d) { $("#pr-nom", d).focus(); },
  });
}

// ───── contenido ─────

function contenidoDialogo({ id, fecha }) {
  const c = id ? E.contenido.find((x) => x.id === id) : null;
  abrir({
    titulo: c ? "Publicación" : "Nueva publicación",
    cuerpo: `<div class="grid2">
        <label class="f">Fecha<input id="ct-fecha" type="date" value="${esc(c?.fecha ?? fecha)}"></label>
        <label class="f">Hora<input id="ct-hora" type="time" value="${esc(c?.hora ?? "19:00")}"></label>
        <label class="f">Canal<select id="ct-canal">${Object.entries(M.CANALES).map(([k, v]) => `<option value="${k}" ${k === (c?.canal ?? "post") ? "selected" : ""}>${v}</option>`).join("")}</select></label>
        <label class="f">Estado<select id="ct-estado">${Object.entries(M.ESTADOS_CONTENIDO).map(([k, v]) => `<option value="${k}" ${k === (c?.estado ?? "idea") ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      </div>
      <label class="f">De qué se trata<input id="ct-titulo" value="${esc(c?.titulo ?? "")}" placeholder="Ej.: Torneo relámpago del sábado"></label>
      <label class="f">Texto / guion<textarea id="ct-texto" rows="4" style="border:1px solid var(--line);border-radius:9px;padding:8px 10px;background:var(--paper);font:inherit;color:inherit">${esc(c?.texto ?? "")}</textarea></label>`,
    pie: `<button type="button" class="btn" data-a="cerrar">Cancelar</button>${c ? `<button type="button" class="btn danger" data-a="borrarContenido" data-v="${c.id}">Borrar</button>` : ""}<button type="button" class="btn primary" data-a="guardarContenido" data-v="${c?.id ?? ""}">Guardar</button>`,
    alAbrir(d) { $("#ct-titulo", d).focus(); },
  });
}

// ───── mantenimiento y lluvia ─────

function mantenimientoDialogo() {
  const pintar = () => {
    const p = E.clima.pronostico?.fecha === HOY ? E.clima.pronostico : { desde: Math.ceil(AHORA.min / 30) * 30, hasta: M.horarioDe(E, HOY).cierra };
    abrir({
      titulo: "Mantenimiento y lluvia",
      sub: "Estado de las canchas, bloqueos de horario y plan lluvia, en un solo lugar.",
      ancho: true,
      refrescar: pintar,
      cuerpo: `
        <div class="seccion"><h3>Canchas</h3>
          ${E.canchas.map((c) => `<div class="row" style="justify-content:space-between;border-bottom:1px solid var(--line-2);padding:6px 0"><span><b>${esc(c.nombre)}</b> · ${c.cubierta ? "techada" : "descubierta"} · ${c.estado === "mantenimiento" ? `<span class="rojo">en mantenimiento (${esc(c.motivoMantenimiento)})</span>` : "habilitada"}</span>
            ${c.estado === "mantenimiento" ? `<button type="button" class="btn sm" data-a="mantOff" data-v="${c.id}">Habilitar</button>` : `<span class="row"><label class="sr" for="mm-${c.id}">Motivo</label><input id="mm-${c.id}" placeholder="Motivo" style="max-width:180px"><button type="button" class="btn sm" data-a="mantOn" data-v="${c.id}">Poner en mantenimiento</button></span>`}</div>`).join("")}
        </div>
        <div class="seccion"><h3>Bloquear un horario (${esc(fechaCorta(VISTA))})</h3>
          <div class="grid2"><label class="f">Cancha<select id="b-c"><option value="*">Todo el club</option>${E.canchas.map((c) => `<option value="${c.id}">${esc(c.nombre)}</option>`).join("")}</select></label><label class="f">Desde<select id="b-d">${horasOpc(9 * 60)}</select></label><label class="f">Hasta<select id="b-h">${horasOpc(11 * 60)}</select></label><label class="f">Motivo<input id="b-m" value="Cambio de red"></label></div>
          <div class="row"><button type="button" class="btn sm primary" data-a="aplicarBloqueo">Bloquear</button></div>
          ${E.bloqueos.filter((b) => b.fecha >= HOY).map((b) => `<div class="row small">${esc(fechaCorta(b.fecha))} ${M.hhmm(b.desde)}–${M.hhmm(b.hasta)} · ${b.canchaId === "*" ? "todo el club" : esc(M.cancha(E, b.canchaId).nombre)} · ${esc(b.motivo)} <button type="button" class="btn sm ghost" data-a="quitarBloqueo" data-v="${b.id}">Quitar</button></div>`).join("")}
        </div>
        <div class="seccion"><h3>Plan lluvia (hoy)</h3>
          ${E.clima.pronostico?.fecha === HOY ? `<p class="small" style="margin:0">🌧️ Pronóstico de ejemplo: lluvia de ${M.hhmm(p.desde)} a ${M.hhmm(p.hasta)}.</p>` : ""}
          <p class="small muted" style="margin:0">Pasa cada turno de la descubierta a una techada libre; si no hay, lo suspende (lo pagado vuelve como crédito; si ya estaban jugando, se reconoce sólo el tiempo no jugado).</p>
          <div class="grid2"><label class="f">Desde<select id="l-desde">${horasOpc(p.desde - (p.desde % 30), HOY)}</select></label><label class="f">Hasta<select id="l-hasta">${horasOpc(Math.min(M.horarioDe(E, HOY).cierra, p.hasta - (p.hasta % 30)), HOY)}</select></label></div>
          <div class="row"><button type="button" class="btn sm primary" data-a="aplicarLluvia">Aplicar plan lluvia</button></div>
        </div>`,
      pie: `<button type="button" class="btn" data-a="cerrar">Listo</button>`,
    });
  };
  pintar();
}

function listaEspera() {
  const pintar = () => {
    const lista = E.espera.filter((e) => e.fecha >= HOY);
    abrir({
      titulo: "Lista de espera",
      sub: "Cuando alguien cancela o falta, el sistema le ofrece el hueco al primero que encaje.",
      refrescar: pintar,
      cuerpo: `${lista.length ? `<table><thead><tr><th>Quién</th><th>Día</th><th>Desde–hasta</th><th></th></tr></thead><tbody>${lista.map((e) => {
          const oferta = E.canchas.map((c) => ({ c, m: M.huecosLibres(E, e.fecha, c.id, e.duracion, Math.max(e.desde, e.fecha === HOY ? AHORA.min : 0)).find((m) => m <= e.hasta) })).find((x) => x.m != null && (!e.soloCubierta || x.c.cubierta));
          return `<tr><td>${esc(e.titular)}${e.soloCubierta ? ` <span class="chip">techada</span>` : ""}</td><td>${esc(fechaCorta(e.fecha))}</td><td class="num">${M.hhmm(e.desde)}–${M.hhmm(e.hasta)}</td><td>${oferta ? `<button type="button" class="btn sm primary" data-a="asignarEspera" data-v="${e.id}" data-c="${oferta.c.id}" data-m="${oferta.m}">Dar ${esc(oferta.c.nombre)} ${M.hhmm(oferta.m)}</button>` : `<span class="small muted">Sin hueco</span>`} <button type="button" class="btn sm ghost" data-a="sacarEspera" data-v="${e.id}">Sacar</button></td></tr>`;
        }).join("")}</tbody></table>` : `<p class="empty">Nadie esperando.</p>`}
        <h3>Anotar</h3>
        <div class="grid2"><label class="f">Nombre<input id="e-nom"></label><label class="f">Día<select id="e-dia">${[0, 1, 2, 3].map((d) => M.sumarDias(HOY, d)).map((f) => `<option value="${f}">${esc(fechaCorta(f))}</option>`).join("")}</select></label><label class="f">Desde<select id="e-desde">${horasOpc(18 * 60, HOY)}</select></label><label class="f">Hasta<select id="e-hasta">${horasOpc(23 * 60, HOY)}</select></label></div>
        <label class="row small"><input type="checkbox" id="e-techo"> Sólo cancha techada</label>`,
      pie: `<button type="button" class="btn" data-a="cerrar">Cerrar</button><button type="button" class="btn primary" data-a="anotarEspera">Anotar</button>`,
    });
  };
  pintar();
}

function horarioDiaDialogo() {
  const d = M.diaSemana(VISTA);
  const h = E.config.horarios[d];
  abrir({
    titulo: `Horario de los ${M.NOMBRE_DIA[d].toLowerCase()}`,
    sub: "Cambia la agenda de todos los días iguales a este. Avisa si hay turnos reservados que quedan afuera.",
    cuerpo: `<div class="grid2"><label class="f">Abre<select id="hd-a">${opcionesHora(h.abre, 0, 23 * 60)}</select></label><label class="f">Cierra<select id="hd-c">${opcionesHora(h.cierra, 9 * 60, 26 * 60)}</select></label></div>`,
    pie: `<button type="button" class="btn" data-a="cerrar">Cancelar</button><button type="button" class="btn primary" data-a="guardarHorarioDia" data-v="${d}">Guardar</button>`,
  });
}

function otorgarDialogo(solicitudId) {
  const s = E.solicitudesAcceso.find((x) => x.id === solicitudId);
  abrir({
    titulo: `Dar acceso a ${esc(s.nombre)}`,
    sub: "El sistema genera un PIN de 2 dígitos que no repite ningún otro. Se muestra una sola vez para que se lo des.",
    cuerpo: `<label class="f">Rol<select id="og-rol"><option value="recepcion">Recepción (agenda, cobros, buffet, remitos, egreso en efectivo)</option><option value="duenio">Dueño/a (todo)</option></select></label>${campoPin("og-pin")}`,
    pie: `<button type="button" class="btn" data-a="cerrar">Cancelar</button><button type="button" class="btn primary" data-a="confirmarOtorgar" data-v="${s.id}">Dar acceso</button>`,
  });
}

function pinPara(accion, objetivoId, titulo) {
  abrir({
    titulo,
    sub: "Confirmá con tu PIN.",
    cuerpo: campoPin("cf-pin"),
    pie: `<button type="button" class="btn" data-a="cerrar">Cancelar</button><button type="button" class="btn primary" data-a="${accion}" data-v="${objetivoId}">Confirmar</button>`,
    alAbrir(d) { $("#cf-pin", d).focus(); },
  });
}

function camaraGrande(i) {
  const cam = camaras.lista()[i];
  abrir({
    titulo: `CAM ${pad(i + 1)} · ${esc(cam.nombre)}`,
    sub: "Simulación de demo — en el club se conecta a la grabadora existente.",
    ancho: true,
    cuerpo: `<canvas class="cam-big" width="960" height="540" id="cam-big" aria-label="Vista ampliada de la cámara ${esc(cam.nombre)}"></canvas>`,
    alAbrir(d) {
      const cv = $("#cam-big", d);
      const quieto = matchMedia("(prefers-reduced-motion: reduce)").matches;
      const loop = () => { if (!d.open || !$("#cam-big", d)) return; camaras.dibujar(cv, cam, performance.now()); if (!quieto) requestAnimationFrame(loop); };
      loop();
    },
  });
}

function ofrecer(ofertas, previo = "") {
  if (!ofertas?.length) return;
  const o = ofertas[0];
  abrir({
    titulo: "Se liberó un hueco",
    sub: `${previo ? `${esc(previo)} ` : ""}${esc(M.cancha(E, o.canchaId).nombre)} ${M.hhmm(o.inicio)} — ${ofertas.length} en lista de espera lo aceptarían`,
    cuerpo: `<p class="small" style="margin:0">Primero en la lista: <b>${esc(o.titular)}</b></p><div class="wa">${esc(o.mensaje)}</div>`,
    pie: `<button type="button" class="btn" data-a="cerrar">Ahora no</button><a class="btn" target="_blank" rel="noopener" href="${esc(wa(o.mensaje))}">Mandar por WhatsApp</a><button type="button" class="btn primary" data-a="asignarEspera" data-v="${o.id}" data-c="${o.canchaId}" data-m="${o.inicio}">Dijo que sí: reservar</button>`,
  });
}

// ═════════════════════════════════ ACCIONES ═════════════════════════════════

const val = (sel) => $(sel)?.value ?? "";
const ultimoMedio = () => (ui.medio === "monedero" ? "efectivo" : ui.medio);

const acciones = {
  tab: (b) => irTab(b.dataset.v),
  dia: (b) => irDia(b.dataset.v),
  ver: (b) => abrirTurno(b),
  paleta: () => abrirPaleta(),
  estilo: (b) => elegirEstilo(b.dataset.v),
  cmd: (b) => ejecutarPaleta(Number(b.dataset.v)),
  atajos: () => ayudaAtajos(),
  deshacer: () => {
    if (!UNDO) return;
    E = JSON.parse(UNDO);
    UNDO = null;
    $("#toasts").replaceChildren();
    render();
    toast("Listo, quedó como estaba.");
  },
  qm: (b) => {
    cerrarMenuTurno();
    const id = b.dataset.v;
    const op = b.dataset.m;
    if (op === "checkin") return acciones.checkin(b);
    if (op === "finalizar") return acciones.finalizar(b);
    if (op === "falta") return faltaDialogo(id);
    verReserva(id);
    if (op === "mover") { const det = $("#dlg details"); if (det) { det.open = true; $("#mover-c")?.focus(); } }
  },
  reloj: (b) => { if (MODO_REAL) return; const { abre, cierra } = M.horarioDe(E, HOY); AHORA.min = Math.min(cierra, Math.max(abre, AHORA.min + Number(b.dataset.v))); render(); },
  tema: () => {
    const raiz = document.documentElement;
    const oscuroAhora = raiz.dataset.theme ? raiz.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    raiz.dataset.theme = oscuroAhora ? "light" : "dark";
    try { localStorage.setItem("bp-tema", raiz.dataset.theme); } catch { /* sin almacenamiento: vale para esta visita */ }
  },
  reiniciar: () => { if (MODO_REAL) return toast("En la jornada real no se reinicia. Desde Ajustes podés empezar otra en blanco.", { error: true }); if (puente.conectado) return toast("Conectado al turnero: la agenda es la del club y no se reinicia.", { error: true }); cerrarDialogo(); iniciar(); toast("Demo reiniciada."); },
  cerrar: () => cerrarDialogo(),
  luz: (b) => { E.luces[b.dataset.v] = !E.luces[b.dataset.v]; render(); },
  medio: (b) => {
    ui.medio = b.dataset.v;
    b.parentElement.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    if (ui.pendienteCredito && ui.medio !== "monedero") { ui.pendienteCredito = null; dialogoActual?.refrescar?.(); }
  },

  // bloqueo de pantalla
  bloquearYa: () => bloquear("manual"),
  desbloquear: () => desbloquear(),
  bloqueoOtro: () => { bloqueo.otro = true; bloqueo.elegido = null; pintarBloqueo(); },
  bloqueoVolver: () => { bloqueo.otro = false; pintarBloqueo(); },
  bloqueoUsuario: (b) => { bloqueo.elegido = b.dataset.v; pintarBloqueo(); },

  // usuario y accesos
  usuario: () => cambiarUsuario(),
  elegirUsuario: (b) => acciones._setElegido?.(b.dataset.v),
  entrar: () => {
    const espera = Math.ceil((intentosPin.hasta - Date.now()) / 1000);
    if (espera > 0) return toast(`Demasiados intentos: esperá ${espera} s.`, { error: true });
    const res = M.verificarPin(E, acciones._elegido?.(), val("#pin-usuario"));
    if (!res.ok) {
      if (++intentosPin.fallos >= 5) { intentosPin.fallos = 0; intentosPin.hasta = Date.now() + 30_000; return toast("Demasiados intentos: esperá 30 s.", { error: true }); }
      return toast(`${res.motivo} (${intentosPin.fallos} de 5)`, { error: true });
    }
    intentosPin.fallos = 0;
    USUARIO = res.usuario.id;
    if (res.usuario.rol === "duenio" && matchMedia("(max-width: 640px)").matches) TAB = "tablero";
    cerrarSiSale(res, `Hola, ${res.usuario.nombre.split(" ")[0]}.`);
  },
  pedirAcceso: () => cerrarSiSale(M.solicitarAcceso(E, val("#nuevo-acceso"), AHORA), "Listo: el pedido le llegó al dueño. Cuando lo apruebe te da el PIN."),
  otorgar: (b) => otorgarDialogo(b.dataset.v),
  confirmarOtorgar: (b) => {
    const res = M.otorgarAcceso(E, b.dataset.v, { rol: val("#og-rol") }, auth(val("#og-pin")), AHORA);
    if (!res.ok) return toast(res.motivo, { error: true });
    render();
    abrir({ titulo: "Acceso otorgado ✔", sub: `${esc(res.usuario.nombre)} · ${M.ROLES[res.usuario.rol]}`, cuerpo: `<p style="margin:0">Su PIN es</p><p class="pin-in num" style="margin:8px auto">${esc(res.pin)}</p><p class="small muted" style="margin:0">Dáselo en persona. No se vuelve a mostrar; si lo pierde, generá uno nuevo desde Ajustes.</p>`, pie: `<button type="button" class="btn primary" data-a="cerrar">Listo</button>` });
  },
  rechazarAcceso: (b) => hecho(M.rechazarAcceso(E, b.dataset.v, auth(), AHORA), "Pedido de acceso rechazado."),
  revocar: (b) => pinPara("confirmarRevocar", b.dataset.v, `Sacar el acceso a ${M.usuario(E, b.dataset.v).nombre}`),
  confirmarRevocar: (b) => cerrarSiSale(M.revocarAcceso(E, b.dataset.v, auth(val("#cf-pin")), AHORA), "Acceso revocado."),
  regenerarPin: (b) => pinPara("confirmarRegenerar", b.dataset.v, `PIN nuevo para ${M.usuario(E, b.dataset.v).nombre}`),
  confirmarRegenerar: (b) => {
    const res = M.regenerarPin(E, b.dataset.v, auth(val("#cf-pin")), AHORA);
    if (!res.ok) return toast(res.motivo, { error: true });
    render();
    abrir({ titulo: "PIN nuevo ✔", cuerpo: `<p class="pin-in num">${esc(res.pin)}</p><p class="small muted">Dáselo en persona; no se vuelve a mostrar.</p>`, pie: `<button type="button" class="btn primary" data-a="cerrar">Listo</button>` });
  },

  alerta: (b) => {
    const a = ALERTAS[Number(b.dataset.v)];
    if (!a) return;
    if (a.tipo === "devolucion") {
      const r = M.reserva(E, a.reservaId);
      ui.medio = "efectivo";
      return abrir({ titulo: "Devolver plata", sub: `${esc(r.titular)} · ${M.pesos(r.devolucionPendiente)}`, cuerpo: `<p class="small" style="margin:0">No tiene ficha de cliente, así que no se le pueden dejar créditos: se le devuelve. ¿Cómo?</p>${pickMedios()}`, pie: `<button type="button" class="btn" data-a="cerrar">Después</button><button type="button" class="btn primary" data-a="devuelto" data-v="${r.id}">Ya se devolvió</button>` });
    }
    if (a.tipo === "falta_sin_ficha") {
      const r = M.reserva(E, a.reservaId);
      ui.medio = "efectivo";
      return abrir({ titulo: "Cobrar la falta", sub: `${esc(r.titular)} · ${M.pesos(r.deudaSinFicha)}`, cuerpo: pickMedios(), pie: `<button type="button" class="btn" data-a="cerrar">Después</button><button type="button" class="btn primary" data-a="cobrarFalta" data-v="${r.id}">Cobrar</button>` });
    }
    if (a.reservaId) return verReserva(a.reservaId);
    if (a.tipo === "luz") { E.luces[a.canchaId] = false; render(); return toast(`Luz de ${M.cancha(E, a.canchaId).nombre} apagada.`); }
    if (a.tipo === "lluvia" || a.tipo === "mantenimiento") return mantenimientoDialogo();
    if (a.tipo === "autorizacion" || a.tipo === "acceso") { TAB = "tablero"; return render(); }
    if (a.tipo === "stock") { if (puedo("stock")) { TAB = "stock"; return render(); } return toast("Avisale al dueño: hay que reponer."); }
    if (a.tipo === "espera") {
      const e = E.espera.find((x) => x.id === a.esperaId);
      const msj = M.mensajeWhatsApp("espera", { nombre: e.titular.split(" ")[0], cancha: M.cancha(E, a.canchaId).nombre, hora: M.hhmm(a.inicio), fecha: "hoy" });
      return abrir({ titulo: "Ofrecer el hueco", sub: `${esc(e.titular)} · ${esc(M.cancha(E, a.canchaId).nombre)} ${M.hhmm(a.inicio)}`, cuerpo: `<div class="wa">${esc(msj)}</div>`, pie: `<a class="btn" target="_blank" rel="noopener" href="${esc(wa(msj))}">Mandar por WhatsApp</a><button type="button" class="btn primary" data-a="asignarEspera" data-v="${e.id}" data-c="${a.canchaId}" data-m="${a.inicio}">Dijo que sí: reservar</button>` });
    }
  },

  // agenda
  nuevo: (b) => nuevoTurno({ canchaId: b.dataset.c, inicio: b.dataset.m != null ? Number(b.dataset.m) : undefined }),
  elegirCliente: (b) => acciones._turno?.elegir(b.dataset.v),
  quitarCliente: () => acciones._turno?.quitar(),
  confirmarTurno: () => acciones._turno?.confirmar(),
  espera: () => listaEspera(),
  mantenimiento: () => mantenimientoDialogo(),
  horarioDia: () => horarioDiaDialogo(),
  guardarHorarioDia: (b) => cerrarSiSale(M.ajustarHorario(E, Number(b.dataset.v), { abre: val("#hd-a"), cierra: val("#hd-c") }, auth(), AHORA), (r) => (r.afuera.length ? `Horario guardado. Ojo: ${r.afuera.length} turno(s) reservado(s) quedan fuera del horario nuevo.` : "Horario guardado.")),
  guardarHorario: (b) => {
    const d = Number(b.dataset.v);
    hecho(M.ajustarHorario(E, d, { abre: val(`#ha-${d}`), cierra: val(`#hc-${d}`) }, auth(), AHORA), (r) => `Horario de los ${M.NOMBRE_DIA[d].toLowerCase()} guardado.${r.afuera.length ? ` ${r.afuera.length} turno(s) quedan afuera.` : ""}`);
  },

  // turno
  pagar: (b) => {
    const monto = Number(val("#monto"));
    const r = M.reserva(E, b.dataset.v);
    if (ui.medio === "monedero") {
      const cubreSena = r.sena.monto > 0 && !r.sena.pagada && r.estado === "reservada" && M.cobrado(r) + monto >= r.sena.monto;
      return pedirConfirmacionCredito({ dueno: `r-${r.id}`, tipo: "cancha", id: r.id, monto, clienteId: r.clienteId, que: cubreSena ? "Seña de la cancha" : "Cancha", cubreSena });
    }
    hecho(M.registrarPago(E, r.id, { medio: ui.medio, monto, auth: auth() }, AHORA), `Cobrado ${M.pesos(monto)} de cancha.`);
  },
  pagarParte: (b) => {
    const r = M.reserva(E, b.dataset.v);
    const j = Number(b.dataset.j);
    const monto = M.partesCancha(r)[j]?.aPagar ?? 0;
    if (ui.medio === "monedero") return pedirConfirmacionCredito({ dueno: `r-${r.id}`, tipo: "parte", id: r.id, j, monto, clienteId: r.jugadores[j]?.clienteId ?? r.clienteId, que: `Parte de ${r.jugadores[j]?.nombre ?? "el jugador"}` });
    acciones.cobrarParte(b);
  },
  cobrarParte: (b) => {
    const j = Number(b.dataset.j);
    hecho(M.cobrarParte(E, b.dataset.v, j, { medio: ui.medio, auth: auth() }, AHORA), (r) => `Cobrado ${M.pesos(r.monto)}${r.cubiertos.length ? ` (incluye la parte de ${r.cubiertos.join(", ")})` : ""}.`);
  },
  cobrarJugador: (b) => {
    const j = Number(b.dataset.j);
    const t = M.cuentaDelTurno(E, b.dataset.v);
    const x = t.jugadores?.[j];
    if (ui.medio === "monedero") return pedirConfirmacionCredito({ dueno: `r-${b.dataset.v}`, tipo: "jugador", id: b.dataset.v, j, monto: x?.aPagar ?? 0, clienteId: x?.clienteId, que: `Todo lo de ${x?.nombre ?? "el jugador"}` });
    hecho(M.cobrarJugador(E, b.dataset.v, j, { medio: ui.medio, auth: auth() }, AHORA), (r) => `Cobrado ${M.pesos(r.total)} a ${x.nombre}${r.cancha && r.cargos ? ` (cancha ${M.pesos(r.cancha)} + cargos ${M.pesos(r.cargos)})` : ""}${r.cubiertos.length ? `, con lo de ${r.cubiertos.join(", ")}` : ""}.`);
  },
  cobrarTodo: (b) => {
    const res = M.cobrarTodoElTurno(E, b.dataset.v, { medio: ui.medio, auth: auth() }, AHORA);
    if (!res.ok && res.cobrado) render(); // se cobró una parte: que la pantalla muestre lo que quedó
    hecho(res, (r) => `Cobrado todo el turno: ${M.pesos(r.total)}.`);
  },
  cerrarYSeguir: (b) => cerrarSiSale(M.cerrarCanchaYSeguir(E, b.dataset.v, { medio: ultimoMedio(), auth: auth() }, AHORA), (r) => `Cancha cerrada y libre${r.cobradoCancha ? ` (cobrados ${M.pesos(r.cobradoCancha)})` : ""}.${r.cuentasAbiertas.length ? " La mesa sigue en Buffet → Mesas." : ""}`),
  cerrarCargos: (b) => hecho(M.cerrarCargosDelTurno(E, b.dataset.v, { medio: ultimoMedio(), auth: auth() }, AHORA), (r) => `Cargos cerrados${r.cobrado ? `: cobrados ${M.pesos(r.cobrado)}` : ""}.`),
  cerrarCargosCC: (b) => hecho(M.cerrarCargosDelTurno(E, b.dataset.v, { aCuenta: true, auth: auth() }, AHORA), (r) => `${M.pesos(r.aCuentaCorriente)} a cuenta corriente. Mesa cerrada.`),
  verMesa: (b) => verReserva(b.dataset.v),
  pedirFiado: (b) => {
    const cta = M.cuenta(E, b.dataset.v);
    const deOtros = E.cuentas.filter((x) => x.estado === "abierta" && x.aCargoDe === cta.id).reduce((t, x) => t + Math.max(0, M.saldoCuenta(x)), 0);
    const res = M.solicitarCredito(E, { clienteId: cta.clienteId, tipo: "fiado", monto: M.saldoCuenta(cta) + deOtros, cuentaId: cta.id }, auth(), AHORA);
    hecho(res, "Pedido enviado: avisale a un dueño por WhatsApp con el botón.");
  },
  aprobarCodigo: (b) => {
    const res = M.aprobarPorCodigo(E, b.dataset.v, { codigo: val("#codigo-aprob"), monto: val("#codigo-monto") }, auth(), AHORA);
    hecho(res, (r) => `Aprobado por ${r.aprobo}: ${M.pesos(r.monto)}. Ya podés pasarlo a su cuenta corriente.`);
  },
  aprobarAca: (b) => pinPara("confirmarAprobarAca", b.dataset.v, "Aprobar el crédito"),
  confirmarAprobarAca: (b) => {
    const v = M.verificarPin(E, USUARIO, val("#cf-pin"));
    if (!v.ok) return toast(v.motivo, { error: true });
    cerrarSiSale(M.resolverCredito(E, b.dataset.v, { aprobar: true }, auth(val("#cf-pin")), AHORA), "Crédito aprobado.");
  },
  entregarPedido: (b) => {
    const pd = (E.pedidos ?? []).find((x) => x.id === b.dataset.v);
    ui.medio = "efectivo";
    abrir({ titulo: `Entregar ${esc(pd.codigo)}`, sub: `${esc(pd.nombre)} · ${M.pesos(pd.total)} (al precio de hoy)`, cuerpo: pickMedios(), pie: `<button type="button" class="btn" data-a="cerrar">Volver</button><button type="button" class="btn primary" data-a="confirmarEntrega" data-v="${pd.id}">Cobrar y entregar</button>` });
  },
  confirmarEntrega: (b) => cerrarSiSale(M.entregarPedido(E, b.dataset.v, { medio: ultimoMedio(), auth: auth() }, AHORA), (r) => `Pedido entregado y cobrado: ${M.pesos(r.total)}.`),
  pedidoACuenta: (b) => {
    const pd = (E.pedidos ?? []).find((x) => x.id === b.dataset.v);
    const q = String(ui.busca.pedidoCli ?? "");
    const pintar = () => { const lista = M.buscarClientes(E, ui.busca.pedidoCli ?? "").slice(0, 8); abrir({ titulo: `${esc(pd.codigo)} a la cuenta de…`, sub: `${esc(pd.nombre)} · ${M.pesos(pd.total)}`, refrescar: pintar, cuerpo: `<div class="search"><label class="sr" for="busca-pedcli">Buscar cliente</label><input id="busca-pedcli" data-busca="pedidoCli" placeholder="Nombre o celular" value="${esc(ui.busca.pedidoCli ?? q)}"></div><div class="usuarios">${lista.map((c) => `<button type="button" data-a="confirmarPedidoCuenta" data-v="${pd.id}" data-c="${c.id}"><b>${esc(c.nombre)}</b><span class="small muted">${esc(c.tel ?? "")}</span></button>`).join("") || `<p class="small muted">Sin resultados.</p>`}</div>` }); };
    pintar();
  },
  confirmarPedidoCuenta: (b) => cerrarSiSale(M.cargarPedidoACuenta(E, b.dataset.v, b.dataset.c, AHORA), "El pedido quedó en su cuenta de cargos."),
  pegarPedido: () => abrir({
    titulo: "Pedido de la tienda por WhatsApp",
    sub: "Pegá el mensaje tal como llegó (empieza con «Hola Break Point, quiero encargar…»).",
    cuerpo: `<label class="f">Mensaje<textarea id="pd-texto" rows="5"></textarea></label>`,
    pie: `<button type="button" class="btn" data-a="cerrar">Cancelar</button><button type="button" class="btn primary" data-a="cargarPedidoPegado">Cargar el pedido</button>`,
    alAbrir(d) { $("#pd-texto", d).focus(); },
  }),
  cargarPedidoPegado: () => cerrarSiSale(M.pedidoDesdeWhatsApp(E, val("#pd-texto"), AHORA), (r) => `Pedido ${r.pedido.codigo} de ${r.pedido.nombre} cargado: ${M.pesos(r.pedido.total)}.`),
  cancelarPedido: (b) => hecho(M.cancelarPedido(E, b.dataset.v, AHORA), "Pedido cancelado."),
  respaldo: () => descargarRespaldo(),
  pinInicial: (b) => {
    const u = b.dataset.v;
    const a = val(`#pi-${u}`), c = val(`#pi2-${u}`);
    if (a !== c) return toast("Los dos PIN no coinciden.", { error: true });
    hecho(M.definirPinInicial(E, u, a, AHORA), "PIN guardado. No se lo digas a nadie.");
  },
  altaUsuarioConsola: () => {
    const dueno = E.usuarios.find((u) => u.rol === "duenio" && u.pin);
    if (!dueno) return toast("Primero un dueño arma su PIN.", { error: true });
    const res = M.altaUsuario(E, { nombre: val("#nu-nombre"), rol: "recepcion" }, { usuarioId: dueno.id, pin: dueno.pin }, AHORA);
    if (res.ok) ui.pinesNuevos = { ...(ui.pinesNuevos ?? {}), [res.usuario.id]: res.pin };
    hecho(res, (r) => `${r.usuario.nombre} tiene PIN ${r.pin}. Anotalo y dáselo.`);
  },
  terminarConsola: () => {
    const res = M.terminarConfiguracion(E, AHORA);
    if (!res.ok) return toast(res.motivo, { error: true });
    ui.pinesNuevos = null;
    USUARIO = E.usuarios.find((u) => u.rol === "duenio" && u.pin).id;
    TAB = "agenda";
    render();
    guardarJornada(true);
    bloquear("recarga");
    toast("Club listo. Entrá con tu PIN.");
  },
  altaUsuario: () => pinPara("confirmarAltaUsuario", "", "Dar de alta un usuario"),
  confirmarAltaUsuario: () => {
    const res = M.altaUsuario(E, { nombre: val("#nu-nombre"), rol: val("#nu-rol") || "recepcion" }, auth(val("#cf-pin")), AHORA);
    if (!res.ok) return toast(res.motivo, { error: true });
    abrir({ titulo: `${esc(res.usuario.nombre)} ya tiene acceso`, sub: M.ROLES[res.usuario.rol], cuerpo: `<p style="margin:0">Su PIN es</p><p class="codigo-aprob num">${esc(res.pin)}</p><p class="small muted" style="margin:0">Se muestra una sola vez: anotalo y dáselo. Lo puede cambiar desde Configuración.</p>`, pie: `<button type="button" class="btn primary" data-a="cerrar">Listo</button>` });
    render();
  },
  cambiarMiPin: () => {
    const res = M.cambiarMiPin(E, { usuarioId: USUARIO, pin: val("#mp-viejo") }, val("#mp-nuevo"), AHORA);
    hecho(res, "Tu PIN cambió.");
  },
  armarDifusion: () => {
    const d = ui.difusion ?? {};
    const res = M.crearDifusion(E, { tipo: d.tipo, titulo: d.titulo, texto: d.texto, audiencia: d.audiencia }, auth(), AHORA);
    if (res.ok) ui.difusionId = res.difusion.id;
    hecho(res, (r) => `Listo para mandar a ${r.destinatarios.length} cliente(s).`);
  },
  verDifusion: (b) => { ui.difusionId = b.dataset.v; render(); },
  cerrarEnvio: () => { ui.difusionId = null; render(); },
  copiarDifusion: (b) => { const d = E.difusiones.find((x) => x.id === b.dataset.v); navigator.clipboard?.writeText(M.mensajeDifusion(d)).then(() => toast("Mensaje copiado: pegalo en la lista de difusión."), () => toast("No se pudo copiar: seleccionalo a mano.", { error: true })); },
  csvDifusion: (b) => {
    const d = E.difusiones.find((x) => x.id === b.dataset.v);
    const lista = d.destinatarios.map((id) => M.cliente(E, id)).filter(Boolean).map((c) => ({ nombre: c.nombre, tel: String(c.tel).replace(/\D/g, "") }));
    const url = URL.createObjectURL(new Blob(["\ufeff" + M.contactosCSV(lista)], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `breakpoint-difusion-${hoyLocal()}.csv` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast(`${lista.length} contactos descargados.`);
  },
  studio: () => abrirElStudio(null),
  studioNovedad: () => { const d = ui.difusion ?? {}; abrirElStudio({ plantilla: d.tipo === "promo" ? "promo" : d.tipo === "torneo" ? "torneo" : d.tipo === "turnos" ? "turnos" : "novedad", titulo: d.titulo, texto: d.texto }); },
  copiarLink: () => { const v = val("#link-clientes"); navigator.clipboard?.writeText(v).then(() => toast("Link copiado."), () => toast("No se pudo copiar: seleccionalo y copialo a mano.", { error: true })); },
  jornada: (b) => {
    const que = b.dataset.v;
    if (que === "demo") return pinPara("confirmarJornada", "demo", "Volver a la demo (la jornada queda guardada)");
    if (que === "retomar") return pinPara("confirmarJornada", "retomar", "Seguir la jornada real guardada");
    pinPara("confirmarJornada", "blanco", MODO_REAL ? "Empezar otra jornada en blanco (la de ahora queda como «anterior» en esta compu: igual descargá el respaldo antes)" : "Empezar la jornada real en blanco");
  },
  confirmarJornada: (b) => {
    const v = M.verificarPin(E, USUARIO, val("#cf-pin"));
    if (!v.ok || !esDuenio()) return toast(v.ok ? "Lo decide un dueño." : v.motivo, { error: true });
    const que = b.dataset.v;
    // Desde la demo (PIN de ejemplo, que conoce cualquiera) nunca se pisa una jornada real guardada.
    if (que === "blanco" && !MODO_REAL && leerJornada()) return toast("Hay una jornada real guardada en esta compu: desde la demo no se borra.", { error: true });
    guardado.fuera = true; // desde acá no se guarda más esta pestaña: se recarga
    if (que === "blanco") { if (MODO_REAL) { descargarRespaldo(); lsGuardar(`${CLAVE_JORNADA}-anterior`, fotoJornada()); } lsGuardar(CLAVE_JORNADA, null); lsGuardar(CLAVE_MODO, "real"); }
    if (que === "retomar") lsGuardar(CLAVE_MODO, "real");
    if (que === "demo") { if (MODO_REAL) lsGuardar(CLAVE_JORNADA, fotoJornada()); lsGuardar(CLAVE_MODO, "demo"); }
    setTimeout(() => location.replace(location.pathname), que === "blanco" && MODO_REAL ? 800 : 0);
  },
  goLive: () => {
    ui.goLive = { conservarSaldos: $("#gl-saldos")?.checked !== false, conservarStock: $("#gl-stock")?.checked !== false };
    pinPara("confirmarGoLive", "", `Limpieza para el go-live (${ui.goLive.conservarSaldos ? "se conservan los saldos" : "los saldos quedan en CERO"}): se borran turnos, cuentas, caja y pedidos`);
  },
  confirmarGoLive: () => {
    const v = M.verificarPin(E, USUARIO, val("#cf-pin"));
    if (!v.ok || !esDuenio()) return toast(v.ok ? "La limpieza la hace un dueño." : v.motivo, { error: true });
    descargarRespaldo();
    lsGuardar(`${CLAVE_JORNADA}-antes-golive`, fotoJornada());
    const res = M.limpiarParaGoLive(E, ui.goLive ?? {}, auth(val("#cf-pin")), AHORA);
    ui.goLive = null;
    if (!res.ok) return toast(res.motivo, { error: true });
    UNDO = null;
    TAB = "agenda";
    cerrarDialogo();
    render();
    guardarJornada(true);
    toast(`Listo para el go-live: se borraron ${res.borrado.turnos} turnos, ${res.borrado.cuentas} cuentas y ${res.borrado.movimientos} movimientos de caja. Quedó un respaldo descargado.`);
  },
  confirmarRestaurar: () => {
    const v = M.verificarPin(E, USUARIO, val("#cf-pin"));
    if (!v.ok || !esDuenio()) return toast(v.ok ? "Lo decide un dueño." : v.motivo, { error: true });
    const h = M.hidratarEstado(ui.restaurar);
    ui.restaurar = null;
    if (!h.ok) return toast(`Ese archivo no sirve: ${h.motivo}.`, { error: true });
    E = h.estado;
    cerrarDialogo();
    render();
    guardarJornada(true);
    toast("Jornada restaurada desde el respaldo.");
  },
  confirmarCredito: () => {
    const op = ui.pendienteCredito;
    if (!op) return;
    ui.pendienteCredito = null;
    if (op.tipo === "cancha") return hecho(M.registrarPago(E, op.id, { medio: "monedero", monto: op.monto, auth: auth() }, AHORA), `Se usaron ${M.pesos(op.monto)} de créditos${op.cubreSena ? ": seña pagada" : ""}.`);
    if (op.tipo === "parte") return hecho(M.cobrarParte(E, op.id, op.j, { medio: "monedero", auth: auth() }, AHORA), (r) => `Se usaron ${M.pesos(r.monto)} de créditos.`);
    if (op.tipo === "cuenta") return hecho(M.pagarCuenta(E, op.id, { medio: "monedero", monto: op.monto }, AHORA), `Se usaron ${M.pesos(op.monto)} de créditos.`);
    if (op.tipo === "jugador") return hecho(M.cobrarJugador(E, op.id, op.j, { medio: "monedero", auth: auth() }, AHORA), (r) => `Se usaron ${M.pesos(r.total)} de créditos.`);
  },
  anularCredito: () => { ui.pendienteCredito = null; ui.medio = "efectivo"; dialogoActual?.refrescar?.(); toast("No se usaron créditos. Elegí otro medio."); },
  jugador: (b) => acciones._jugador?.(b.dataset.v),
  consumo: (b) => {
    const pid = ui.producto.turno;
    if (!pid) return toast("Buscá y elegí un producto.", { error: true });
    const res = M.consumoJugador(E, b.dataset.v, acciones._jugadorSel?.() ?? 0, pid, Number(val("#cant-turno")) || 1, { modo: b.dataset.m, medio: ultimoMedio() }, AHORA);
    if (res.ok) { ui.producto.turno = null; ui.busca.turno = ""; }
    hecho(res, b.dataset.m === "cobrar" ? "Cargado y cobrado." : "Sumado a su cuenta.");
  },
  sumarJugador: (b) => { const res = M.sumarJugador(E, b.dataset.v, val("#nuevo-jug")); if (res.ok) ui.busca.jug = ""; hecho(res, "Jugador sumado."); },
  sumarJugadorFicha: (b) => { const res = M.sumarJugador(E, b.dataset.v, null, b.dataset.c); if (res.ok) ui.busca.jug = ""; hecho(res, "Jugador sumado con su ficha."); },
  checkin: (b) => hecho(M.checkIn(E, b.dataset.v, AHORA), "Cancha abierta y luz prendida."),
  finalizar: (b) => cerrarSiSale(M.finalizar(E, b.dataset.v, {}, AHORA), (r) => `Cancha cerrada.${r.cuentasAbiertas.length ? ` Quedan ${r.cuentasAbiertas.length} cuenta(s) de buffet abiertas.` : ""}`),
  aCuenta: (b) => cerrarSiSale(M.finalizar(E, b.dataset.v, { aCuenta: true }, AHORA), "Cancha cerrada; el saldo pasó a la cuenta corriente."),
  falta: (b) => faltaDialogo(b.dataset.v),
  marcarFalta: (b) => {
    const res = M.marcarNoShow(E, b.dataset.v, { cobrarA: b.dataset.m, auth: auth() }, AHORA);
    if (!res.ok) return toast(res.motivo, { error: true });
    const texto = res.cargos.length ? `Falta cobrada: ${res.cargos.map((c) => `${c.nombre} ${M.pesos(c.monto)}`).join(", ")}.` : "Falta registrada sin cargo.";
    if (!res.ofertas.length) return cerrarSiSale(res, texto);
    render();
    ofrecer(res.ofertas, texto);
  },
  cancelar: (b) => {
    const res = M.cancelar(E, b.dataset.v, {}, AHORA);
    if (!res.ok) return toast(res.motivo, { error: true });
    const texto = res.aTiempo ? (res.devuelto ? `Cancelado a tiempo: ${M.pesos(res.devuelto)} como crédito.` : res.devolverEnMano ? `Cancelado a tiempo: hay que devolverle ${M.pesos(res.devolverEnMano)}.` : "Cancelado a tiempo.") : res.enSuspenso ? "Cancelado tarde: la seña queda en suspenso hasta que se venda el hueco." : "Cancelado.";
    if (!res.ofertas.length) return cerrarSiSale(res, texto);
    render();
    ofrecer(res.ofertas, texto);
  },
  liberarFijo: (b) => {
    const r = M.reserva(E, b.dataset.v);
    const res = M.liberarFijo(E, r.fijoId, r.fecha, AHORA);
    if (!res.ok) return toast(res.motivo, { error: true });
    if (!res.ofertas?.length) return cerrarSiSale(res, "Liberado sólo esta semana; el turno fijo sigue.");
    render();
    ofrecer(res.ofertas, "Liberado sólo esta semana.");
  },
  mover: (b) => hecho(M.mover(E, b.dataset.v, { canchaId: val("#mover-c") }, AHORA), "Turno movido."),
  extender: (b) => hecho(M.extender(E, b.dataset.v, 30, AHORA), (r) => `Extendido 30′ (+${M.pesos(r.extra)}).`),
  interrumpir: (b) => hecho(M.interrumpir(E, b.dataset.v, "corte de luz", AHORA), (r) => `Se reconocen ${M.pesos(r.credito)} por ${r.noJugados}′ sin jugar.`),
  devuelto: (b) => cerrarSiSale(M.marcarDevuelto(E, b.dataset.v, ultimoMedio(), AHORA), (r) => `Devolución de ${M.pesos(r.monto)} registrada.`),
  cobrarFalta: (b) => cerrarSiSale(M.cobrarFaltaSinFicha(E, b.dataset.v, ultimoMedio(), AHORA), (r) => `Falta cobrada: ${M.pesos(r.monto)}.`),

  // buffet
  elegirProducto: (b) => { ui.producto[b.dataset.c] = b.dataset.v; if (dialogoActual?.refrescar) dialogoActual.refrescar(); else render(); },
  abrirConsumo: () => abrirConsumo(),
  abrirCuentaCliente: (b) => { const res = M.abrirCuenta(E, { clienteId: b.dataset.v }, AHORA); if (!res.ok) return toast(res.motivo, { error: true }); ui.busca.cliCons = ""; render(); verCuenta(res.cuenta.id); },
  abrirCuentaLibre: () => { const res = M.abrirCuenta(E, { titular: val("#cons-libre"), reservaId: `libre-${Date.now()}` }, AHORA); if (!res.ok) return toast(res.motivo, { error: true }); render(); verCuenta(res.cuenta.id); },
  verCuenta: (b) => verCuenta(b.dataset.v),
  cargarCuenta: (b) => {
    const pid = ui.producto.cuenta;
    if (!pid) return toast("Buscá y elegí un producto.", { error: true });
    const res = M.cargarEnCuenta(E, b.dataset.v, pid, Number(val("#cant-cuenta")) || 1, AHORA);
    if (res.ok) { ui.producto.cuenta = null; ui.busca.cuenta = ""; }
    hecho(res, "Cargado.");
  },
  rapido: (b) => hecho(M.cargarEnCuenta(E, b.dataset.v, b.dataset.c, 1, AHORA), "Cargado."),
  pagarCuenta: (b) => {
    const cta = M.cuenta(E, b.dataset.v);
    if (ui.medio === "monedero") return pedirConfirmacionCredito({ dueno: `c-${cta.id}`, tipo: "cuenta", id: cta.id, monto: Math.round(Number(val("#monto-cta"))), clienteId: cta.clienteId, que: `Cargos del buffet de ${cta.titular}` });
    hecho(M.pagarCuenta(E, cta.id, { medio: ui.medio, monto: val("#monto-cta") }, AHORA), "Cobrado.");
  },
  ajustar: (b) => hecho(M.ajustarCargo(E, b.dataset.v, Number(b.dataset.j), Number(b.dataset.m), AHORA, auth()), Number(b.dataset.m) > 0 ? "Uno más." : "Uno menos."),
  pasarCargo: (b) => {
    const dest = val("#tc-dest");
    const res = M.transferirCargo(E, b.dataset.v, Number(val("#tc-item")), dest, val("#tc-cant") || null, AHORA, auth());
    hecho(res, `Cargo pasado a la cuenta de ${M.cuenta(E, dest)?.titular ?? "la otra persona"}.`);
  },
  cargoManual: (b) => {
    // Un descuento lo firma el dueño con SU PIN, aunque quien esté usando el sistema sea recepción.
    const pin = val("#cm-pin");
    const monto = Math.abs(Number(val("#cm-mon"))) * (val("#cm-tipo") === "descuento" ? -1 : 1);
    if (monto < 0 && !pin.trim()) return toast("Un descuento lo autoriza el dueño con su PIN: escribilo en «PIN dueño».", { error: true });
    const firma = monto < 0 && pin ? M.usuarioPorPin(E, pin) : null;
    const quien = firma?.ok && firma.usuario.rol === "duenio" ? { usuarioId: firma.usuario.id, pin } : auth(pin);
    const res = M.cargoManual(E, b.dataset.v, { concepto: val("#cm-con"), monto }, quien, AHORA);
    if (res.ok) for (const sel of ["#cm-con", "#cm-mon", "#cm-pin"]) { const el = $(sel); if (el) el.value = ""; }
    hecho(res, (r) => (r.item.precioUnit < 0 ? "Descuento aplicado." : "Cargo manual sumado."));
  },
  cerrarCuenta: (b) => cerrarSiSale(M.cerrarCuenta(E, b.dataset.v, { aCuenta: b.dataset.m === "cuenta" }, AHORA), b.dataset.m === "cuenta" ? "Cuenta cerrada; el saldo pasó a la cuenta corriente." : "Cuenta cerrada."),
  mostrador: () => mostrador(),
  sumarCarrito: () => { const pid = ui.producto.mostrador; if (!pid) return toast("Buscá y elegí un producto.", { error: true }); ui.carrito[pid] = (ui.carrito[pid] ?? 0) + 1; ui.producto.mostrador = null; ui.busca.mostrador = ""; dialogoActual?.refrescar?.(); },
  qty: (b) => { const id = b.dataset.v; ui.carrito[id] = Math.max(0, (ui.carrito[id] ?? 0) + Number(b.dataset.m)); if (!ui.carrito[id]) delete ui.carrito[id]; dialogoActual?.refrescar?.(); },
  cobrarMostrador: () => { const res = M.ventaMostrador(E, Object.entries(ui.carrito).map(([productoId, cant]) => ({ productoId, cant })), ultimoMedio(), AHORA); if (res.ok) ui.carrito = {}; cerrarSiSale(res, (r) => `Venta cobrada: ${M.pesos(r.total)}.`); },

  // caja
  egreso: () => egresoDialogo(),
  aplicarEgreso: () => cerrarSiSale(M.egresoCaja(E, { monto: val("#g-m"), concepto: val("#g-c"), usuarioId: USUARIO, pin: val("#g-pin") }, AHORA), "Egreso registrado."),
  cerrarCaja: (b) => cierreCajaDialogo(b.dataset.v || null),
  aplicarCierre: (b) => cerrarSiSale(M.cerrarCaja(E, { contado: val("#k-cont"), usuarioId: USUARIO, pin: val("#k-pin"), dia: b.dataset.v || null }, AHORA), (r) => (r.cierre.diferencia === 0 ? "Caja cerrada: cuadra justo." : `Caja cerrada con diferencia de ${M.pesos(r.cierre.diferencia)}.`)),
  remito: () => remitoDialogo(),
  remitoAgregar: () => { const pid = ui.producto.remito; if (!pid) return toast("Buscá y elegí un producto.", { error: true }); sumarAlRemito(pid, 1); ui.producto.remito = null; ui.busca.remito = ""; dialogoActual?.refrescar?.(); },
  remitoQuitar: (b) => { ui.remito.items.splice(Number(b.dataset.v), 1); dialogoActual?.refrescar?.(); },
  guardarRemito: () => {
    const R = ui.remito;
    const res = M.registrarRemito(E, { proveedorId: R.proveedorId, numero: R.numero, items: R.items }, auth(), AHORA);
    if (res.ok) ui.remito = null;
    cerrarSiSale(res, (r) => `Remito ${r.remito.numero} cargado: ${M.pesos(r.remito.total)}.`);
  },

  // clientes
  altaCliente: () => altaClienteDialogo(),
  guardarAltaCliente: () => { const res = M.altaCliente(E, { nombre: val("#n-nom"), tel: val("#n-tel"), nivel: val("#n-niv") }, AHORA); if (!res.ok) return toast(res.motivo, { error: true }); render(); fichaCliente(res.cliente.id); toast("Cliente dado de alta."); },
  fichaCliente: (b) => fichaCliente(b.dataset.v),
  guardarCliente: (b) => hecho(M.editarCliente(E, b.dataset.v, { nombre: val("#c-nom"), tel: val("#c-tel"), nivel: val("#c-niv") }, AHORA), "Ficha guardada."),
  bajaCliente: (b) => cerrarSiSale(M.bajaCliente(E, b.dataset.v, AHORA), "Cliente dado de baja."),
  ccPedir: (b) => hecho(M.solicitarCC(E, b.dataset.v, { limite: val("#cc-pedir"), nota: val("#cc-nota") }, auth(), AHORA), "Pedido enviado al dueño."),
  ccGuardar: (b) => hecho(M.configurarCC(E, b.dataset.v, { habilitada: true, limite: val("#cc-lim") }, auth(), AHORA), "Cuenta corriente actualizada."),
  ccCortar: (b) => hecho(M.configurarCC(E, b.dataset.v, { habilitada: false }, auth(), AHORA), "Cuenta corriente cortada."),
  cobrarDeuda: (b) => hecho(M.cobrarDeuda(E, b.dataset.v, { medio: ultimoMedio(), monto: val("#cc-monto") }, AHORA), (r) => `Cobrado ${M.pesos(r.monto)}. Saldo: ${M.pesos(r.saldo)}.`),
  aprobarCC: (b) => hecho(M.resolverCC(E, b.dataset.v, { aprobar: true, limite: val(`#lim-${b.dataset.v}`) }, auth(), AHORA), "Cuenta corriente habilitada."),
  rechazarCC: (b) => hecho(M.resolverCC(E, b.dataset.v, { aprobar: false }, auth(), AHORA), "Pedido rechazado."),

  // proveedores
  altaProveedor: () => altaProveedorDialogo(),
  guardarAltaProveedor: () => cerrarSiSale(M.altaProveedor(E, { nombre: val("#np-nom"), rubro: val("#np-rub"), cuit: val("#np-cuit"), tel: val("#np-tel") }, auth(), AHORA), "Proveedor dado de alta."),
  fichaProveedor: (b) => fichaProveedor(b.dataset.v),
  guardarProveedor: (b) => hecho(M.editarProveedor(E, b.dataset.v, { nombre: val("#pv-nom"), rubro: val("#pv-rub"), cuit: val("#pv-cuit"), tel: val("#pv-tel") }, auth(), AHORA), "Proveedor guardado."),
  pagarProveedor: (b) => hecho(M.pagarProveedor(E, { proveedorId: b.dataset.v, medio: ui.medio, monto: val("#pp-monto") }, auth(val("#pp-pin")), AHORA), (r) => `Pago registrado. Saldo: ${M.pesos(r.saldo)}.`),

  // stock
  altaProducto: () => productoDialogo(null),
  stockModo: (b) => { ui.stockModo = b.dataset.v; render(); },
  editarProducto: (b) => productoDialogo(b.dataset.v),
  bajaProducto: (b) => cerrarSiSale(M.bajaProducto(E, b.dataset.v, auth(), AHORA, b.dataset.m === "1"), b.dataset.m === "1" ? "Producto activo otra vez." : "Producto dado de baja: ya no se vende."),
  guardarProducto: (b) => {
    const id = b.dataset.v;
    if (id && $("#pr-stk-aj")) {
      const p = M.producto(E, id);
      const nuevo = val("#pr-stk-aj").trim();
      if (nuevo !== String(p.stock ?? "")) { const aj = M.ajustarStock(E, id, nuevo === "" ? null : nuevo, auth(), AHORA); if (!aj.ok) return toast(aj.motivo, { error: true }); }
    }
    const res = id
      ? M.editarProducto(E, id, { nombre: val("#pr-nom"), precio: val("#pr-pre"), costo: val("#pr-cos"), minimo: $("#pr-min") ? val("#pr-min") : null, codigo: val("#pr-cod"), codigoExterno: val("#pr-ext") }, auth(), AHORA)
      : M.altaProducto(E, { nombre: val("#pr-nom"), categoria: val("#pr-cat"), precio: val("#pr-pre"), costo: val("#pr-cos"), minimo: val("#pr-min"), stock: val("#pr-stk"), codigo: val("#pr-cod"), codigoExterno: val("#pr-ext"), plato: $("#pr-plato")?.checked }, auth(), AHORA);
    cerrarSiSale(res, id ? "Producto guardado." : "Producto dado de alta.");
  },

  // contenido
  mes: (b) => { const n = Number(b.dataset.v); if (n === 0) ui.mes = HOY.slice(0, 7); else { const [a, m] = ui.mes.split("-").map(Number); ui.mes = new Date(Date.UTC(a, m - 1 + n, 1)).toISOString().slice(0, 7); } render(); },
  nuevoContenido: (b) => contenidoDialogo({ fecha: b.dataset.v }),
  verContenido: (b) => contenidoDialogo({ id: b.dataset.v }),
  guardarContenido: (b) => {
    const datos = { fecha: val("#ct-fecha"), hora: val("#ct-hora"), canal: val("#ct-canal"), estado: val("#ct-estado"), titulo: val("#ct-titulo"), texto: val("#ct-texto") };
    cerrarSiSale(b.dataset.v ? M.editarContenido(E, b.dataset.v, datos, auth()) : M.agregarContenido(E, datos, auth()), "Publicación guardada.");
  },
  borrarContenido: (b) => cerrarSiSale(M.borrarContenido(E, b.dataset.v, auth()), "Publicación borrada."),

  // mantenimiento y lluvia
  mantOn: (b) => hecho(M.configurarMantenimiento(E, b.dataset.v, { activo: true, motivo: val(`#mm-${b.dataset.v}`) }, AHORA), "Cancha en mantenimiento."),
  mantOff: (b) => hecho(M.configurarMantenimiento(E, b.dataset.v, { activo: false }, AHORA), "Cancha habilitada."),
  aplicarBloqueo: () => hecho(M.bloquear(E, { canchaId: val("#b-c"), fecha: VISTA, desde: Number(val("#b-d")), hasta: Number(val("#b-h")), motivo: val("#b-m").trim() || "Bloqueo" }, AHORA), "Horario bloqueado."),
  quitarBloqueo: (b) => hecho(M.quitarBloqueo(E, b.dataset.v, AHORA), "Bloqueo quitado."),
  aplicarLluvia: () => {
    const res = M.planLluvia(E, HOY, Number(val("#l-desde")), Number(val("#l-hasta")) + E.config.paso, AHORA);
    render();
    abrir({
      titulo: "Plan lluvia aplicado",
      sub: res.resultado.length ? `${res.resultado.length} turno(s) resueltos. Avisá a cada uno:` : "No había turnos en canchas descubiertas en ese horario.",
      cuerpo: res.resultado.map((x) => {
        const r = M.reserva(E, x.reservaId);
        const nombre = x.titular.split(" ")[0];
        if (x.accion === "cortado") return `<div><p style="margin:0"><b>${esc(x.titular)}</b> — estaban jugando: ${x.noJugados}′ sin jugar, se reconocen ${M.pesos(x.credito)}. Cobrá lo jugado y cerrá la cancha.</p><button type="button" class="btn sm" style="margin-top:6px" data-a="ver" data-v="${r.id}">Abrir el turno</button></div>`;
        const msj = x.accion === "movido" ? M.mensajeWhatsApp("lluvia_movido", { nombre, hora: M.hhmm(r.inicio), cancha: x.cancha })
          : x.devolverEnMano ? M.mensajeWhatsApp("lluvia_devolucion", { nombre, hora: M.hhmm(r.inicio), monto: M.pesos(x.devolverEnMano) })
          : M.mensajeWhatsApp("lluvia_suspendido", { nombre, hora: M.hhmm(r.inicio), credito: x.credito ? M.pesos(x.credito) : "" });
        const que = x.accion === "movido" ? `pasa a ${esc(x.cancha)}` : `suspendido${x.credito ? `, ${M.pesos(x.credito)} como crédito` : x.devolverEnMano ? `, hay que devolverle ${M.pesos(x.devolverEnMano)}` : ""}`;
        return `<div><p style="margin:0 0 4px"><b>${esc(x.titular)}</b> — ${que}</p><div class="wa">${esc(msj)}</div><a class="btn sm" style="margin-top:6px" target="_blank" rel="noopener" href="${esc(wa(msj))}">Mandar</a></div>`;
      }).join("") || `<p class="empty">Nada que mover.</p>`,
      pie: `<button type="button" class="btn primary" data-a="cerrar">Listo</button>`,
    });
  },

  // espera
  anotarEspera: () => {
    const nombre = val("#e-nom").trim();
    if (!nombre) return toast("Falta el nombre.", { error: true });
    const desde = Number(val("#e-desde")), hasta = Number(val("#e-hasta"));
    if (hasta < desde) return toast("El 'hasta' tiene que ser después del 'desde'.", { error: true });
    M.anotarEspera(E, { titular: nombre, fecha: val("#e-dia"), desde, hasta, soloCubierta: $("#e-techo").checked }, AHORA);
    render(); toast(`${nombre} quedó en la lista de espera.`);
  },
  asignarEspera: (b) => {
    const res = M.asignarDesdeEspera(E, b.dataset.v, { canchaId: b.dataset.c, inicio: Number(b.dataset.m) }, AHORA);
    if (dialogoActual?.refrescar) return hecho(res, "Turno reservado desde la lista de espera.");
    cerrarSiSale(res, "Turno reservado desde la lista de espera.");
  },
  sacarEspera: (b) => { E.espera = E.espera.filter((e) => e.id !== b.dataset.v); render(); },

  cam: (b) => camaraGrande(Number(b.dataset.v)),
};

// Buscadores con lupa: re-pintan al escribir sin perder el foco ni el cursor.
document.addEventListener("input", (ev) => {
  const t = ev.target;
  if (t.dataset?.dif && (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement)) {
    ui.difusion = { tipo: "novedad", titulo: "", texto: "", audiencia: "todos", ...(ui.difusion ?? {}), [t.dataset.dif]: t.value };
    clearTimeout(ui.difusionTimer);
    ui.difusionTimer = setTimeout(() => render(), 250);
    return;
  }
  if (!(t instanceof HTMLInputElement) || !t.dataset.busca) return;
  ui.busca[t.dataset.busca] = t.value;
  const pos = t.selectionStart;
  const id = t.id;
  if ($("#dlg").open && t.closest("dialog")) dialogoActual?.refrescar?.(); else render();
  const otra = document.getElementById(id);
  if (otra) { otra.focus(); try { otra.setSelectionRange(pos, pos); } catch { /* algunos tipos no admiten selección */ } }
});

document.addEventListener("change", (ev) => {
  const t = ev.target;
  if (t instanceof HTMLSelectElement && t.dataset.a === "aCargo") {
    ui.pendienteCredito = null; // los montos cambian: la confirmación de créditos se vuelve a pedir
    PREVIO = { json: JSON.stringify(E), v: t.dataset.v };
    try { hecho(M.asignarCargoCancha(E, t.dataset.v, Number(t.dataset.j), t.value === "" ? null : Number(t.value), AHORA), t.value === "" ? "Paga su propia parte." : "Listo: esa parte la paga otro jugador."); } finally { PREVIO = null; }
    return;
  }
  if (t instanceof HTMLSelectElement && t.dataset.dif) {
    ui.difusion = { tipo: "novedad", titulo: "", texto: "", audiencia: "todos", ...(ui.difusion ?? {}), [t.dataset.dif]: t.value };
    return render();
  }
  if (t instanceof HTMLSelectElement && t.dataset.a === "aCargoCargos") {
    PREVIO = { json: JSON.stringify(E), v: null };
    try { hecho(M.asignarCargoCargos(E, t.dataset.v, t.value || null, AHORA), t.value === "" ? "Paga sus propios cargos." : "Listo: esos cargos los paga otro jugador."); } finally { PREVIO = null; }
    return;
  }
  if (!(t instanceof HTMLInputElement)) return;
  if (t.dataset.a === "contacto") {
    const k = contactos();
    const limpio = t.value.replace(/[^\d]/g, "");
    if (limpio && (limpio.length < 8 || limpio.length > 15)) return toast("Ese número no parece un celular (con código de país, ej. 549 11 …).", { error: true });
    k[t.dataset.v] = limpio;
    lsGuardar(CLAVE_CONTACTOS, JSON.stringify(k));
    render();
    return toast(limpio ? "Número guardado en esta compu." : "Número borrado.");
  }
  if (t.dataset.a === "fondo") {
    const dueno = enConsola() ? E.usuarios.find((u) => u.rol === "duenio" && u.pin) : null;
    const res = M.ajustarFondo(E, t.value, dueno ? { usuarioId: dueno.id, pin: dueno.pin } : auth(), AHORA);
    if (!res.ok) { render(); return toast(enConsola() && !dueno ? "Primero un dueño arma su PIN." : res.motivo, { error: true }); }
    render();
    return toast(`Fondo de caja: ${M.pesos(E.caja.fondo)}.`);
  }
  if (t.dataset.a === "alias") {
    if (!esDuenio()) return toast("El alias lo carga un dueño.", { error: true });
    E.config.cobro = { ...(E.config.cobro ?? {}), alias: t.value.trim().slice(0, 40) };
    render();
    return toast("Alias guardado: va en la confirmación de los turnos.");
  }
  if (t.dataset.a === "restaurar") {
    const archivo = t.files?.[0];
    t.value = "";
    if (!archivo) return;
    const fr = new FileReader();
    fr.onload = () => { try { ui.restaurar = JSON.parse(String(fr.result)); } catch { return toast("Ese archivo no es un respaldo de Break Point.", { error: true }); } pinPara("confirmarRestaurar", "", "Restaurar la jornada desde el respaldo (reemplaza la de ahora)"); };
    fr.onerror = () => toast("No se pudo leer el archivo.", { error: true });
    fr.readAsText(archivo);
    return;
  }
  if (t.dataset.a === "px") {
    const p = M.producto(E, t.dataset.v);
    if (t.value.trim() === "") { render(); return toast("Ese campo no puede quedar vacío: no se cambió nada.", { error: true }); }
    const v = Number(t.value);
    const cambios = t.dataset.c === "costo" ? { costo: v } : t.dataset.c === "precio" ? { precio: v } : { precio: M.precioDesdeMarkup(p.costo, v) };
    if (cambios.precio === null) { t.value = ""; return toast("Para calcular el precio por % sobre costo, el producto necesita costo.", { error: true }); }
    const res = M.editarProducto(E, p.id, cambios, auth(), AHORA);
    if (!res.ok) { render(); return toast(res.motivo, { error: true }); }
    render();
    return toast(`${p.nombre}: precio ${M.pesos(p.precio)} · margen ${Math.round(((p.precio - p.costo) / p.precio) * 100)}%.`);
  }
  if (t.dataset.a === "bloqueoMin") {
    const res = M.ajustarBloqueo(E, t.value, auth());
    if (!res.ok) { t.value = minutosBloqueo(); return toast(res.motivo, { error: true }); }
    render(); return toast(res.valor ? `La pantalla se bloquea tras ${res.valor} min sin uso.` : "La pantalla se bloquea sólo al apagarse o al cambiar de app.");
  }
  if (t.dataset.rem && ui.remito) {
    const i = ui.remito.items[Number(t.dataset.k)];
    const v = Math.round(Number(t.value));
    if (i && v >= 0) { i[t.dataset.rem] = t.dataset.rem === "cant" ? Math.max(1, v) : v; dialogoActual?.refrescar?.(); }
    return;
  }
  if (t.dataset.a === "jugador") return acciones.jugador(t);
  if (t.dataset.a === "regla") {
    const res = M.ajustarPolitica(E, t.dataset.v, t.value);
    if (!res.ok) { t.value = E.config.politica[t.dataset.v] ?? ""; return toast(res.motivo, { error: true }); }
    render(); toast("Regla actualizada.");
  }
  if (t.dataset.a === "tarifa") { const v = Number(t.value); if (!(v >= 0)) return; E.config.tarifas[Number(t.dataset.v)].precioHora = Math.round(v); render(); toast("Precio actualizado para turnos nuevos."); }
});

document.addEventListener("click", (ev) => {
  const envio = ev.target.closest?.("a[data-envio]");
  if (envio) { M.marcarEnviado(E, envio.dataset.envio, envio.dataset.c); setTimeout(render, 0); return; }
  const b = ev.target.closest("[data-a]");
  if (!b || b.tagName === "INPUT" || b.disabled) return;
  if (largo.ignorarClick) { largo.ignorarClick = false; ev.preventDefault(); return; }
  const fn = acciones[b.dataset.a];
  if (typeof fn !== "function") return;
  ev.preventDefault();
  PREVIO = DESHACIBLES.has(b.dataset.a) ? { json: JSON.stringify(E), v: b.dataset.v } : null;
  try { fn(b); } finally { PREVIO = null; }
});

// ───── acciones rápidas sobre el turno: clic derecho, tecla de menú o mantener apretado (táctil) ─────
function menuTurno(id, x, y, origen) {
  const r = M.reserva(E, id);
  if (!r) return;
  if (!SOPORTA_POPOVER) return verReserva(id);
  const s = M.saldo(r);
  const op = (m, texto, extra = "") => `<button type="button" role="menuitem" data-a="qm" data-m="${m}" data-v="${r.id}" ${extra}>${texto}</button>`;
  const abierto = ["reservada", "en_cancha"].includes(r.estado);
  const qm = $("#qm");
  if (qm.matches(":popover-open")) qm.hidePopover();
  qm.innerHTML = `<div class="mh">${esc(r.titular)} · ${M.hhmm(r.inicio)} · ${esc(M.cancha(E, r.canchaId).nombre)}</div>
    ${r.estado === "reservada" && r.fecha === HOY ? op("checkin", "Abrir cancha") : ""}
    ${r.estado === "en_cancha" && s <= 0 ? op("finalizar", "Cerrar cancha") : ""}
    ${op("ver", abierto && s > 0 ? `Cobrar · ${M.pesos(s)}` : "Ver turno y cargos")}
    ${abierto ? op("mover", "Mover a otra cancha…") : ""}
    ${r.estado === "reservada" ? `<hr>${op("falta", "Marcar falta…", 'class="peligro"')}` : ""}`;
  qm.showPopover();
  largo.menuDesde = Date.now();
  const w = qm.offsetWidth, h = qm.offsetHeight;
  qm.style.left = `${Math.max(8, Math.min(x, innerWidth - w - 8))}px`;
  qm.style.top = `${Math.max(8, Math.min(y, innerHeight - h - 8))}px`;
  qm.querySelector("button")?.focus();
  qm.dataset.origen = origen?.dataset.k ?? "";
}
document.addEventListener("contextmenu", (ev) => {
  const blk = ev.target.closest?.("#app .blk[data-v]");
  if (!blk || !SOPORTA_POPOVER) return;
  ev.preventDefault();
  clearTimeout(largo.timer);
  if (Date.now() - largo.abierto < 1000) return; // ya lo abrió el «mantener apretado»
  const rect = blk.getBoundingClientRect();
  const desdeTeclado = ev.clientX === 0 && ev.clientY === 0;
  menuTurno(blk.dataset.v, desdeTeclado ? rect.left + 8 : ev.clientX, desdeTeclado ? rect.top + 24 : ev.clientY, blk);
});
const largo = { timer: null, ignorarClick: false, abierto: 0, menuDesde: 0, x: 0, y: 0 };
// El menú rápido se cierra solo al tocar afuera o con Esc (es «manual»: el automático se cerraba al soltar el clic derecho).
const cerrarMenuTurno = () => { if (SOPORTA_POPOVER && $("#qm").matches(":popover-open")) $("#qm").hidePopover(); };
document.addEventListener("pointerdown", (ev) => { if (!ev.target.closest?.("#qm") && Date.now() - largo.menuDesde > 50) cerrarMenuTurno(); }, true);
document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && SOPORTA_POPOVER && $("#qm").matches(":popover-open")) { ev.preventDefault(); cerrarMenuTurno(); } });
$("#app").addEventListener("scroll", cerrarMenuTurno, true);
document.addEventListener("pointerdown", (ev) => {
  const blk = ev.target.closest?.("#app .blk[data-v]");
  if (!blk || ev.pointerType !== "touch") return;
  largo.x = ev.clientX; largo.y = ev.clientY;
  clearTimeout(largo.timer);
  largo.timer = setTimeout(() => {
    largo.abierto = Date.now();
    largo.ignorarClick = true; // el clic que llega al soltar el dedo no abre el turno
    setTimeout(() => { largo.ignorarClick = false; }, 800);
    menuTurno(blk.dataset.v, largo.x, largo.y, blk);
  }, 480);
});
for (const tipo of ["pointerup", "pointercancel"]) document.addEventListener(tipo, () => clearTimeout(largo.timer));
document.addEventListener("pointermove", (ev) => { if (Math.hypot(ev.clientX - largo.x, ev.clientY - largo.y) > 10) clearTimeout(largo.timer); });
if (SOPORTA_POPOVER) {
  $("#qm").addEventListener("toggle", (ev) => {
    if (ev.newState !== "closed") return;
    const k = $("#qm").dataset.origen;
    if (k && !$("#dlg").open) document.querySelector(`#app [data-k="${CSS.escape(k)}"]`)?.focus({ preventScroll: true });
  });
  // «Más» se abre pegado a su botón.
  $("#mas-menu").addEventListener("beforetoggle", (ev) => {
    if (ev.newState !== "open") return;
    const r = $("#btn-mas")?.getBoundingClientRect();
    if (!r) return;
    const m = $("#mas-menu");
    m.style.left = `${Math.max(8, Math.min(r.left, innerWidth - 230))}px`;
    m.style.top = `${r.bottom + 4}px`;
  });
}
if (SOPORTA_POPOVER) {
  $("#estilo-menu").addEventListener("beforetoggle", (ev) => {
    if (ev.newState !== "open") return;
    const r = $("#btn-estilo").getBoundingClientRect();
    const m = $("#estilo-menu");
    m.style.left = `${Math.max(8, Math.min(r.right - 320, innerWidth - 328))}px`;
    m.style.top = `${r.bottom + 6}px`;
  });
}
// Las pestañas quedan pegadas justo debajo del encabezado, mida lo que mida en cada estilo.
if (typeof ResizeObserver === "function") new ResizeObserver(([e]) => document.documentElement.style.setProperty("--alto-header", `${Math.round(e.target.getBoundingClientRect().height)}px`)).observe($("header.top"));
// Flechas dentro de un menú flotante.
for (const id of ["qm", "mas-menu", "estilo-menu"]) {
  $(`#${id}`).addEventListener("keydown", (ev) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(ev.key)) return;
    ev.preventDefault();
    const items = [...ev.currentTarget.querySelectorAll("button,a")];
    const i = items.indexOf(document.activeElement);
    const sig = ev.key === "Home" ? 0 : ev.key === "End" ? items.length - 1 : (i + (ev.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[sig]?.focus();
  });
}

// ───── atajos de teclado: sólo cuando no estás escribiendo y no hay una ventana abierta ─────
document.addEventListener("keydown", (ev) => {
  const t = ev.target;
  const escribiendo = t instanceof HTMLElement && (t.matches("input, select, textarea") || t.isContentEditable);
  const hayVentana = $("#dlg").open || $("#cmdk").open;
  if (bloqueo.activo) return; // bloqueada: ningún atajo abre nada detrás del PIN
  if ((ev.metaKey || ev.ctrlKey) && !ev.altKey && ev.key.toLowerCase() === "k") {
    ev.preventDefault();
    if ($("#cmdk").open) $("#cmdk").close(); else if (!$("#dlg").open) abrirPaleta();
    return;
  }
  if ((ev.metaKey || ev.ctrlKey) && !ev.shiftKey && ev.key.toLowerCase() === "z" && UNDO && !escribiendo && !hayVentana) {
    ev.preventDefault(); acciones.deshacer(); return;
  }
  // Bloquear es de seguridad: L anda aunque haya una ventana abierta (no mientras se escribe en un campo).
  if (!escribiendo && !ev.metaKey && !ev.ctrlKey && !ev.altKey && (ev.key === "l" || ev.key === "L") && !$("#cmdk").open) { ev.preventDefault(); bloquear("manual"); return; }
  if (escribiendo || hayVentana || ev.metaKey || ev.ctrlKey || ev.altKey) return;
  const tabs = pestanias().orden;
  const k = ev.key;
  let hizo = true;
  if (k === "/") abrirPaleta();
  else if (k === "?") ayudaAtajos();
  else if ((k === "n" || k === "N") && puedo("agenda")) nuevoTurno({});
  else if ((k === "c" || k === "C") && puedo("buffet")) abrirConsumo();
  else if ((k === "t" || k === "T") && puedo("agenda")) { if (TAB !== "agenda") irTab("agenda"); irDia(HOY); }
  else if ((k === "ArrowLeft" || k === "ArrowRight") && TAB === "agenda" && !t.closest?.("#grid-wrap, .days")) {
    const d = M.sumarDias(VISTA, k === "ArrowLeft" ? -1 : 1);
    if (d >= M.sumarDias(HOY, -1) && d <= M.sumarDias(HOY, 5)) irDia(d); else hizo = false;
  } else if (/^[1-9]$/.test(k) && tabs[Number(k) - 1]) irTab(tabs[Number(k) - 1].id);
  else hizo = false;
  if (hizo) ev.preventDefault();
});

// Enter en un campo de PIN confirma la ventana.
document.addEventListener("keydown", (ev) => {
  const t = ev.target;
  if (ev.key !== "Enter" || !(t instanceof HTMLInputElement) || t.type !== "password") return;
  const primario = t.closest("dialog")?.querySelector(".dlg-f .btn.primary");
  if (primario && !primario.disabled) { ev.preventDefault(); primario.click(); }
});

$("#dlg").addEventListener("close", () => { dialogoActual = null; });

// ───── bloqueo de pantalla: cada vez que el puesto queda sin uso o la pantalla se apaga, se vuelve con el PIN propio ─────
// Celular, tablet, compu o POS: se bloquea tras N minutos sin tocar nada (Ajustes) y siempre que la pantalla se apagó
// o se cambió de app por más de 30 segundos. Se desbloquea con el PIN de quien estaba usando el sistema; si es otra
// persona, entra con su usuario y su PIN. 5 PIN mal → 30 segundos de espera. No hay forma de cerrarlo sin PIN.
const OCULTA_MAX_MS = 30_000;
const bloqueo = { activo: false, motivo: "", ultimo: Date.now(), ocultaDesde: null, fallos: 0, esperaHasta: 0, otro: false, elegido: null, timer: null };
const guardarIntentos = () => { if (MODO_REAL) lsGuardar("bp-intentos", JSON.stringify({ fallos: bloqueo.fallos, esperaHasta: bloqueo.esperaHasta, tandas: bloqueo.tandas ?? 0 })); };
function bloquear(motivo) {
  if (bloqueo.activo || guardado.fuera || enConsola()) return;
  bloqueo.activo = true;
  bloqueo.motivo = motivo;
  bloqueo.otro = false;
  bloqueo.elegido = null;
  cerrarMenuTurno();
  // Lo que quedó abierto es del usuario que se fue: se cierra, y su «Deshacer» ya no vale.
  cerrarDialogo();
  if ($("#cmdk").open) $("#cmdk").close();
  UNDO = null;
  ui.pendienteCredito = null;
  $("#toasts").replaceChildren();
  for (const id of ["mas-menu", "estilo-menu"]) { const m = $(`#${id}`); if (SOPORTA_POPOVER && m.matches(":popover-open")) m.hidePopover(); }
  document.documentElement.classList.add("bloqueada");
  pintarBloqueo();
  const d = $("#bloqueo");
  if (!d.open) d.showModal();
  $("#bl-pin", d)?.focus();
}
function pintarBloqueo() {
  const d = $("#bloqueo");
  const u = yo();
  const espera = Math.max(0, Math.ceil((bloqueo.esperaHasta - Date.now()) / 1000));
  const quien = bloqueo.otro ? (bloqueo.elegido ? M.usuario(E, bloqueo.elegido) : null) : u;
  const motivo = { inactividad: `Pasaron ${minutosBloqueo()} minutos sin uso.`, pantalla: "La pantalla se apagó o se cambió de app.", manual: "Se bloqueó a mano.", recarga: "Se volvió a abrir el sistema: poné tu PIN." }[bloqueo.motivo] ?? "";
  const activos = E.usuarios.filter((x) => x.activo !== false);
  morph(d, `<div class="bl-in">
    <p class="bl-marca">Break Point · Gestión del club</p>
    <h2 id="bl-titulo">Pantalla bloqueada</h2>
    <p class="small muted" style="margin:0">${esc(motivo)}</p>
    ${bloqueo.otro && !bloqueo.elegido
      ? `<div class="usuarios" role="group" aria-label="¿Quién entra?">${activos.map((x) => `<button type="button" data-a="bloqueoUsuario" data-v="${x.id}"><span><b>${esc(x.nombre)}</b></span><span class="small muted">${M.ROLES[x.rol]}</span></button>`).join("")}</div>
        <button type="button" class="btn ghost sm" data-a="bloqueoVolver">Volver</button>`
      : `<div class="bl-quien"><span class="avatar" aria-hidden="true">${esc(quien.nombre.slice(0, 1).toUpperCase())}</span><span><b>${esc(quien.nombre)}</b><br><span class="small muted">${M.ROLES[quien.rol]}</span></span></div>
        <label class="f bl-pin-l" for="bl-pin">${bloqueo.otro ? `PIN de ${esc(quien.nombre.split(" ")[0])}` : "Tu PIN para seguir"}</label>
        <input id="bl-pin" class="pin-in num" type="password" inputmode="numeric" autocomplete="off" maxlength="2" placeholder="••" ${espera ? "disabled" : ""} aria-describedby="bl-aviso">
        <p id="bl-aviso" class="${espera || bloqueo.fallos ? "err" : "small muted"}" role="status" style="margin:0;min-height:1.4em">${espera ? `Demasiados intentos: esperá ${espera > 60 ? `${Math.ceil(espera / 60)} minutos` : "un momento"}. <span aria-hidden="true">(${espera} s)</span>` : bloqueo.fallos ? `PIN incorrecto (${bloqueo.fallos} de 5).` : ""}</p>
        <button type="button" class="btn primary" data-a="desbloquear" ${espera ? "disabled" : ""}>Desbloquear</button>
        ${bloqueo.otro ? `<button type="button" class="btn ghost sm" data-a="bloqueoOtro">Elegir otro usuario</button>` : `<button type="button" class="btn ghost sm" data-a="bloqueoOtro">Entrar con otro usuario</button>`}`}
    ${pinesDemo(activos)}
  </div>`);
  if (espera) { clearTimeout(bloqueo.timer); bloqueo.timer = setTimeout(() => { if (bloqueo.activo) { if (Date.now() >= bloqueo.esperaHasta) bloqueo.fallos = 0; pintarBloqueo(); $("#bl-pin")?.focus(); } }, 1000); }
  if (bloqueo.otro && bloqueo.elegido) $("#bl-pin", d)?.focus();
}
function desbloquear() {
  if (Date.now() < bloqueo.esperaHasta) return pintarBloqueo();
  const quien = bloqueo.otro ? bloqueo.elegido : USUARIO;
  const res = M.verificarPin(E, quien, $("#bl-pin")?.value);
  if (!res.ok) {
    bloqueo.fallos += 1;
    // 5 PIN mal → espera; cada tanda espera más (30 s, 2 min, 10 min). En la jornada real sobrevive a recargar.
    if (bloqueo.fallos >= 5) { bloqueo.tandas = (bloqueo.tandas ?? 0) + 1; bloqueo.esperaHasta = Date.now() + [30, 120, 600][Math.min(bloqueo.tandas, 3) - 1] * 1000; }
    guardarIntentos();
    pintarBloqueo();
    const pin = $("#bl-pin");
    if (pin && !pin.disabled) { pin.value = ""; pin.focus(); }
    return;
  }
  const cambio = res.usuario.id !== USUARIO;
  USUARIO = res.usuario.id;
  bloqueo.activo = false;
  bloqueo.fallos = 0;
  bloqueo.tandas = 0;
  guardarIntentos();
  bloqueo.ultimo = Date.now();
  document.documentElement.classList.remove("bloqueada");
  $("#bloqueo").close();
  render();
  const pendientes = esDuenio() ? E.novedades.filter((x) => x.estado === "pendiente").length : 0;
  toast(`${cambio ? `Hola, ${res.usuario.nombre.split(" ")[0]}.` : "Desbloqueado."}${pendientes ? ` Tenés ${pendientes === 1 ? "un pedido de crédito" : `${pendientes} pedidos de crédito`} para resolver.` : ""}`);
  const despues = bloqueo.despues;
  bloqueo.despues = null;
  despues?.();
}
// Sin PIN no se cierra: Esc no hace nada y, si el navegador lo cierra igual, se vuelve a abrir.
$("#bloqueo").addEventListener("cancel", (ev) => ev.preventDefault());
$("#bloqueo").addEventListener("close", () => { if (bloqueo.activo) requestAnimationFrame(() => { if (bloqueo.activo && !$("#bloqueo").open) $("#bloqueo").showModal(); }); });
$("#bloqueo").addEventListener("keydown", (ev) => {
  if (ev.key === "Enter" && ev.target.id === "bl-pin") { ev.preventDefault(); desbloquear(); }
});
// El PIN son 2 números: lo que no es número no entra (y no gasta un intento).
$("#bloqueo").addEventListener("input", (ev) => {
  if (ev.target.id !== "bl-pin") return;
  const t = ev.target, limpio = t.value.replace(/\D/g, "");
  if (limpio !== t.value) t.value = limpio;
  if (limpio.length === 2) desbloquear();
});
const marcarUso = () => { if (!bloqueo.activo) bloqueo.ultimo = Date.now(); };
for (const tipo of ["pointerdown", "keydown", "wheel", "touchstart"]) document.addEventListener(tipo, marcarUso, { capture: true, passive: true });
const revisarInactividad = () => {
  const min = minutosBloqueo();
  if (!bloqueo.activo && min > 0 && Date.now() - bloqueo.ultimo >= min * 60_000) bloquear("inactividad");
};
setInterval(revisarInactividad, 15_000);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { bloqueo.ocultaDesde = Date.now(); return; }
  const fuera = bloqueo.ocultaDesde ? Date.now() - bloqueo.ocultaDesde : 0;
  bloqueo.ocultaDesde = null;
  if (fuera >= OCULTA_MAX_MS) bloquear("pantalla"); else revisarInactividad();
});
// iOS congela la página al apagar la pantalla sin avisar siempre con visibilitychange: al volver, pageshow lo cubre.
addEventListener("pageshow", (ev) => { if (ev.persisted) bloquear("pantalla"); });

try { const t = localStorage.getItem("bp-tema"); if (t) document.documentElement.dataset.theme = t; } catch { /* sin almacenamiento */ }
$("#kbd-k").textContent = ES_MAC ? "⌘K" : "Ctrl K";
// MODO CONECTADO (opcional): con ?api=<back del turnero> la agenda se sincroniza en vivo con las reservas web y
// los comprobantes de WhatsApp (conectado.mjs). Sin ?api= es la demo de siempre: nada sale del navegador.
const API_TURNERO = new URLSearchParams(location.search).get("api");
const puente = {
  M,
  get E() { return E; }, set E(v) { E = v; },
  get AHORA() { return AHORA; }, set AHORA(v) { AHORA = v; HOY = v.fecha; VISTA = v.fecha; },
  render: () => render(), toast: (t, o) => toast(t, o), despues: null, conectado: false,
};
iniciar();
// Jornada real: hora real, guardado automático (una sola pestaña) y vuelve bloqueada al recargar.
if (MODO_REAL) {
  document.documentElement.dataset.modo = "real";
  const cinta = $(".demo-ribbon");
  if (cinta) cinta.innerHTML = `<span><b>Jornada real</b> · se guarda en esta compu · <span id="guardado" role="status">guardando…</span></span><button type="button" data-a="respaldo">Descargar respaldo</button>`;
  const pie = $("footer.gsg");
  if (pie) pie.innerHTML = "Sistema hecho por <b>Gestión Studio Grow</b> · Break Point Pádel";
  const reloj = $(".clock .sr");
  if (reloj) reloj.textContent = "Hora: ";
  const habilitar = () => { guardado.habilitado = true; guardarJornada(true); };
  if (navigator.locks?.request) {
    navigator.locks.request("bp-jornada", { ifAvailable: true }, (lock) => {
      if (!lock) { otraPestania(); return null; }
      habilitar();
      return new Promise(() => {}); // el candado queda tomado mientras esta pestaña esté abierta
    }).catch(habilitar);
  } else habilitar();
  setInterval(latirReloj, 15_000);
  document.addEventListener("visibilitychange", () => { if (document.hidden) guardarJornada(true); else latirReloj(); });
  addEventListener("pagehide", () => guardarJornada(true));
  addEventListener("pageshow", latirReloj);
  try { const t = JSON.parse(lsLeer("bp-intentos") || "{}"); bloqueo.fallos = Number(t.fallos) || 0; bloqueo.esperaHasta = Number(t.esperaHasta) || 0; bloqueo.tandas = Number(t.tandas) || 0; } catch { /* sin intentos guardados */ }
  if (!enConsola()) bloquear("recarga");
}
function otraPestania() {
  guardado.fuera = true;
  const d = document.createElement("dialog");
  d.className = "bloqueo";
  d.setAttribute("aria-labelledby", "op-t");
  d.innerHTML = `<div class="bl-in"><h2 id="op-t">La jornada real ya está abierta en otra pestaña</h2><p>Para no pisar lo cargado, se usa una sola pestaña del club por compu. Cerrá esta y seguí en la otra.</p></div>`;
  d.addEventListener("cancel", (ev) => ev.preventDefault());
  document.body.append(d);
  bloqueo.activo = false;
  if ($("#bloqueo").open) $("#bloqueo").close();
  d.showModal();
}
// El dueño abre en su celular el link del pedido de crédito (#aprobar&…): se le muestra para aprobar con su PIN.
const HASH_APROB = location.hash.startsWith("#aprobar&") ? Object.fromEntries(new URLSearchParams(location.hash.slice("#aprobar&".length))) : null;
if (HASH_APROB?.id) {
  history.replaceState(null, "", location.pathname + location.search);
  if (bloqueo.activo) bloqueo.despues = () => dialogoAprobar(HASH_APROB); else dialogoAprobar(HASH_APROB);
}
// Sólo en desarrollo local o contra el mismo origen: un link armado no puede mandar la clave del club a otro servidor.
const API_PERMITIDA = API_TURNERO && /^https?:\/\/[\w.:[\]-]+\/?$/.test(API_TURNERO)
  && (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || new URL(API_TURNERO).origin === location.origin);
// En el sitio publicado (breakpointpadel.gsgapp.com.ar, sin servidor) /club trae <meta name="bp-demo-bus" content="1">: el
// backoffice se conecta con el turnero (/turnero) cuando hay uno abierto en otra pestaña del mismo navegador.
// En la jornada real NO: el estado del turnero (una demo) no puede reemplazar la jornada del club.
const DEMO_BUS = !MODO_REAL && !API_PERMITIDA && document.querySelector('meta[name="bp-demo-bus"]')?.content === "1" && typeof BroadcastChannel !== "undefined";
if (API_PERMITIDA || DEMO_BUS) {
  import("./conectado.mjs")
    .then((m) => (DEMO_BUS ? m.conectarCuandoHayaTurnero(puente) : m.conectar(puente, API_TURNERO)))
    .then(() => { puente.conectado = Boolean(puente.despues); })
    .catch(() => toast("No se pudo conectar con el turnero. Sigue en modo demo.", { error: true }));
}
