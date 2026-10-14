// BACKOFFICE DEL CLUB — Break Point Pádel (demo del flujo). Toda la regla de negocio vive en motor.mjs;
// este archivo sólo pinta y conecta botones. Sin persistencia: el estado vive en memoria.
import * as M from "./motor.mjs";

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const pad = (n) => String(n).padStart(2, "0");
const hoyLocal = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const fechaCorta = (f) => { const [, m, d] = f.split("-"); return `${DIAS[M.diaSemana(f)]} ${Number(d)}/${Number(m)}`; };
// En la demo el WhatsApp abre sin número (elegís el contacto): los teléfonos de ejemplo podrían ser de alguien real.
const wa = (texto) => M.linkWhatsApp("", texto);
const ROW = 30;

let E, AHORA, VISTA, HOY, ROL = "recepcion";
let ALERTAS = [];
const ui = { medio: "efectivo", carrito: {}, cuentaDe: "" };

function iniciar() {
  HOY = hoyLocal();
  E = M.generarDemo(HOY);
  AHORA = { fecha: HOY, min: 19 * 60 + 10 };
  VISTA = HOY;
  for (let d = 1; d <= 6; d++) M.materializarFijos(E, M.sumarDias(HOY, d));
  render();
}

function toast(texto) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = texto;
  const pila = $("#toasts");
  pila.append(t);
  while (pila.children.length > 2) pila.firstElementChild.remove();
  setTimeout(() => t.remove(), 4000);
}

/** Muestra el motivo si la regla rechazó; si salió bien, re-pinta y avisa. */
function hecho(res, okTexto) {
  if (!res.ok) { toast(res.motivo); return false; }
  if (okTexto) toast(okTexto);
  render();
  return true;
}

// ═════════════════════════════════ RENDER ═════════════════════════════════

function render() {
  $("#reloj").textContent = M.hhmm(AHORA.min);
  document.querySelectorAll('[data-a="rol"]').forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === ROL)));
  if (VISTA >= HOY) M.materializarFijos(E, VISTA);
  ALERTAS = M.alertas(E, AHORA);
  const previo = $("#grid-wrap");
  const scroll = previo ? { top: previo.scrollTop, left: previo.scrollLeft, vista: previo.dataset.vista } : null;
  $("#app").innerHTML = ROL === "recepcion" ? vistaRecepcion() : vistaDuenio();
  const gw = $("#grid-wrap");
  if (gw) {
    if (scroll && scroll.vista === VISTA) { gw.scrollTop = scroll.top; gw.scrollLeft = scroll.left; }
    else gw.scrollTop = Math.max(0, ((AHORA.min - E.config.apertura) / E.config.paso) * ROW - 150);
  }
  camaras.parar();
  if (ROL === "duenio") camaras.arrancar();
  if ($("#dlg").open && dialogoActual) dialogoActual.refrescar?.();
}

function chipsReserva(r) {
  const s = M.saldo(r);
  const out = [];
  if (r.sena.monto > 0 && !r.sena.pagada && r.estado === "reservada") out.push(`<span class="chip bad">Falta seña ${M.pesos(r.sena.monto)}</span>`);
  else if (s <= 0) out.push(`<span class="chip ok">Pagado</span>`);
  else if (M.cobrado(r) > 0) out.push(`<span class="chip warn">Debe ${M.pesos(s)}</span>`);
  else out.push(`<span class="chip">A cobrar ${M.pesos(s)}</span>`);
  if (r.estado === "en_cancha") out.push(`<span class="chip ok">En cancha</span>`);
  if (r.tipo !== "turno") out.push(`<span class="chip info">${M.TIPOS[r.tipo]}</span>`);
  if (r.consumos.length) out.push(`<span class="chip">+${r.consumos.reduce((n, c) => n + c.cant, 0)} consumos</span>`);
  return out.join("");
}

// ───────────────────────────── Recepción ─────────────────────────────

function vistaRecepcion() {
  const dias = [-1, 0, 1, 2, 3, 4, 5].map((d) => M.sumarDias(HOY, d));
  const caja = M.resumenCaja(E, HOY);
  const fuera = E.reservas.filter((r) => r.fecha === VISTA && ["cancelada", "no_show", "suspendida"].includes(r.estado));
  const urg = ALERTAS.filter((a) => a.nivel === "alta").length;
  return `
  <div class="layout">
    <section aria-labelledby="t-grilla">
      <div class="card">
        <div class="card-head">
          <h2 id="t-grilla">Turnos · ${esc(fechaCorta(VISTA))}${VISTA === HOY ? " (hoy)" : ""}</h2>
          <span class="muted small">Tocá un hueco libre para reservar · tocá un turno para cobrar, dar la cancha o moverlo</span>
        </div>
        <div class="days" role="group" aria-label="Elegir día">
          ${dias.map((f) => `<button type="button" data-a="dia" data-v="${f}" aria-pressed="${f === VISTA}"><small>${f === HOY ? "Hoy" : DIAS[M.diaSemana(f)]}</small><b class="num">${Number(f.slice(8))}/${Number(f.slice(5, 7))}</b></button>`).join("")}
        </div>
        <div class="toolbar">
          <button type="button" class="btn primary" data-a="nuevo">+ Turno</button>
          <button type="button" class="btn accent" data-a="mostrador">Venta de mostrador</button>
          <button type="button" class="btn" data-a="espera">Lista de espera (${E.espera.filter((e) => e.fecha >= HOY).length})</button>
          <button type="button" class="btn" data-a="lluvia">Plan lluvia</button>
          <button type="button" class="btn" data-a="bloqueo">Bloquear cancha</button>
          <button type="button" class="btn" data-a="clientes">Clientes</button>
        </div>
        ${grilla()}
        <div class="legend" aria-hidden="true">
          <span><i style="background:var(--royal-soft);border-color:var(--royal-line)"></i>Reservado</span>
          <span><i style="background:var(--ok-soft);border-color:var(--ok)"></i>En cancha</span>
          <span><i style="background:var(--grid-past)"></i>Terminado</span>
          <span><i style="border-left:4px solid var(--royal)"></i>Turno fijo</span>
          <span><i style="border-left:4px solid var(--orange)"></i>Clase / partido abierto</span>
          <span><i style="box-shadow:0 0 0 2px var(--bad) inset"></i>Necesita atención</span>
        </div>
        ${fuera.length ? `<details style="margin-top:10px"><summary class="small muted">Cancelados, suspendidos y "no vino" de este día (${fuera.length})</summary><ul class="small">${fuera.map((r) => `<li>${M.hhmm(r.inicio)} · ${esc(M.cancha(E, r.canchaId).nombre)} · ${esc(r.titular)} — ${M.ESTADOS[r.estado]}${r.motivoCancelacion ? ` (${esc(r.motivoCancelacion)})` : ""}${r.senaEnSuspenso ? " · seña en suspenso hasta que se venda el hueco" : ""}</li>`).join("")}</ul></details>` : ""}
      </div>
    </section>
    <aside class="stack" aria-label="Pendientes y caja">
      <section class="card" aria-labelledby="t-bandeja">
        <div class="card-head"><h2 id="t-bandeja">Para resolver ahora</h2><span class="chip ${urg ? "bad" : "info"}">${urg ? `${urg} urgente${urg > 1 ? "s" : ""}` : `${ALERTAS.length}`}</span></div>
        <div class="inbox">
          ${ALERTAS.length ? ALERTAS.map((a, i) => `
            <div class="al ${a.nivel}">
              <span class="lvl">${a.nivel === "alta" ? "Urgente" : a.nivel === "media" ? "Atender" : "Aviso"}</span>
              <p>${esc(a.texto)}</p>
              <div class="row"><button type="button" class="btn sm primary" data-a="alerta" data-v="${i}">${esc(a.accion)}</button></div>
            </div>`).join("") : `<p class="empty">Todo en orden. 🎾</p>`}
        </div>
      </section>
      <section class="card" aria-labelledby="t-caja">
        <div class="card-head"><h2 id="t-caja">Caja de hoy</h2><button type="button" class="btn sm" data-a="cerrarCaja">Cerrar caja</button></div>
        <dl class="kv num">
          ${Object.entries(caja.porMedio).map(([k, v]) => `<dt>${M.MEDIOS[k]}</dt><dd>${M.pesos(v)}</dd>`).join("")}
          <dt>Gastos</dt><dd>${M.pesos(-caja.egresos)}</dd>
          <dt class="tot">Efectivo que tiene que haber</dt><dd class="tot">${M.pesos(caja.efectivoEsperado)}</dd>
        </dl>
        <p class="small muted" style="margin:8px 0 0">Fondo inicial ${M.pesos(E.caja.fondo)} · ${caja.movimientos} movimientos hoy</p>
        <div class="row" style="margin-top:8px"><button type="button" class="btn sm" data-a="egreso">Registrar un gasto</button></div>
      </section>
    </aside>
  </div>`;
}

function grilla() {
  const { apertura, cierre, paso } = E.config;
  const filas = (cierre - apertura) / paso;
  const top = (m) => ((m - apertura) / paso) * ROW;
  const delDia = E.reservas.filter((r) => r.fecha === VISTA && ["reservada", "en_cancha", "finalizada"].includes(r.estado));
  const conAlerta = VISTA === HOY ? new Set(ALERTAS.filter((a) => a.nivel === "alta" && a.reservaId).map((a) => a.reservaId)) : new Set();
  const pasado = (m) => M.minutosHasta(AHORA, VISTA, m) < -paso;
  const n = E.canchas.length;

  const cabecera = `<div class="gh" style="grid-column:1;grid-row:1"><span class="tag">Hora</span></div>` + E.canchas.map((c, i) => `
    <div class="gh" style="grid-column:${i + 2};grid-row:1">
      <div><div class="n">${esc(c.nombre)}</div><div class="tag">${c.cubierta ? "Techada" : "Descubierta"}${c.estado === "mantenimiento" ? " · en mantenimiento" : ""}</div></div>
      <div class="row" style="gap:4px">
        <button type="button" class="luz" data-a="luz" data-v="${c.id}" aria-pressed="${!!E.luces[c.id]}" aria-label="Luz de ${esc(c.nombre)}: ${E.luces[c.id] ? "prendida, tocar para apagar" : "apagada, tocar para prender"}">💡</button>
        <button type="button" class="luz" data-a="mant" data-v="${c.id}" aria-pressed="${c.estado === "mantenimiento"}" aria-label="${c.estado === "mantenimiento" ? "Sacar de mantenimiento" : "Poner en mantenimiento"} ${esc(c.nombre)}">🔧</button>
      </div>
    </div>`).join("");

  let horas = "";
  for (let m = apertura; m < cierre; m += 60) horas += `<span class="num" style="top:${top(m) + 8}px">${M.hhmm(m)}</span>`;
  const columnaHora = `<div class="tcol" style="grid-column:1;grid-row:2;height:${filas * ROW}px">${horas}</div>`;

  const columnas = E.canchas.map((c, idx) => {
    let slots = "";
    for (let i = 0; i < filas; i++) {
      const m = apertura + i * paso;
      const fueAntes = pasado(m);
      slots += fueAntes
        ? `<div class="slot pasado ${m % 60 === 0 ? "hora" : ""}" style="top:${i * ROW}px" aria-hidden="true"></div>`
        : `<button type="button" class="slot ${m % 60 === 0 ? "hora" : ""}" style="top:${i * ROW}px" data-a="nuevo" data-c="${c.id}" data-m="${m}" aria-label="${esc(c.nombre)}, ${M.hhmm(m)}, libre. Reservar">+ ${M.hhmm(m)}</button>`;
    }
    const turnos = delDia.filter((r) => r.canchaId === c.id).map((r) => {
      const h = (r.duracion / paso) * ROW - 3;
      return `<button type="button" class="blk ${r.estado} ${r.tipo} ${conAlerta.has(r.id) ? "alerta" : ""}" style="top:${top(r.inicio) + 1}px;height:${h}px" data-a="ver" data-v="${r.id}" aria-label="${esc(r.titular)}, ${M.hhmm(r.inicio)} a ${M.hhmm(r.inicio + r.duracion)}, ${M.ESTADOS[r.estado]}, saldo ${M.pesos(M.saldo(r))}">
        <span class="tt">${esc(r.titular)}</span>
        <span class="meta num">${M.hhmm(r.inicio)}–${M.hhmm(r.inicio + r.duracion)} · ${r.jugadores.length}/4 · ${esc(r.origen)}</span>
        ${h > 58 ? `<span class="chips">${chipsReserva(r)}</span>` : ""}
      </button>`;
    }).join("");
    const bloqueos = E.bloqueos.filter((b) => b.fecha === VISTA && (b.canchaId === c.id || b.canchaId === "*")).map((b) =>
      `<div class="blk bloqueo" style="top:${top(b.desde) + 1}px;height:${((b.hasta - b.desde) / paso) * ROW - 3}px"><span class="tt">Bloqueada</span><span class="meta">${esc(b.motivo)}</span></div>`).join("");
    return `<div class="ccol ${c.estado === "mantenimiento" ? "mant" : ""}" style="grid-column:${idx + 2};grid-row:2;height:${filas * ROW}px">${slots}${bloqueos}${turnos}</div>`;
  }).join("");

  const ahoraLinea = VISTA === HOY && AHORA.min >= apertura && AHORA.min <= cierre
    ? `<div style="grid-column:2 / -1;grid-row:2;position:relative;pointer-events:none;z-index:4" aria-hidden="true"><div class="now" style="top:${top(AHORA.min)}px" data-h="${M.hhmm(AHORA.min)}"></div></div>` : "";

  return `<div class="grid-wrap" id="grid-wrap" data-vista="${VISTA}"><div class="grilla" style="grid-template-columns:56px repeat(${n},minmax(140px,1fr))" role="group" aria-label="Grilla de turnos por cancha">
    ${cabecera}${columnaHora}${columnas}${ahoraLinea}
  </div></div>`;
}

// ───────────────────────────── Dueño ─────────────────────────────

function vistaDuenio() {
  const k = M.kpis(E, HOY, AHORA);
  const pct = (x) => `${Math.round(x * 100)}%`;
  const semana = Array.from({ length: 7 }, (_, i) => M.sumarDias(HOY, i - 6));
  const calor = M.mapaDeCalor(E, semana);
  const bajos = E.productos.filter((p) => !p.alquiler && p.stock <= p.minimo);
  const maxMedio = Math.max(1, ...Object.values(k.caja.porMedio).map(Math.abs));
  const enCancha = E.canchas.map((c) => {
    const r = E.reservas.find((x) => x.fecha === HOY && x.canchaId === c.id && x.estado === "en_cancha");
    const prox = E.reservas.filter((x) => x.fecha === HOY && x.canchaId === c.id && x.estado === "reservada" && x.inicio >= AHORA.min - 30).sort((a, b) => a.inicio - b.inicio)[0];
    return { c, r, prox };
  });
  return `
  <div class="stack">
    <section aria-labelledby="t-kpis">
      <h2 id="t-kpis" class="sr">Indicadores de hoy</h2>
      <div class="kpis num">
        ${kpi("Ocupación de hoy", pct(k.ocupacion), `Pico ${pct(k.ocupacionPico)} · valle ${pct(k.ocupacionValle)}`)}
        ${kpi("Facturado del día", M.pesos(k.facturado), `${k.turnos} turnos · ticket ${M.pesos(k.ticketPromedio)}`)}
        ${kpi("Cobrado", M.pesos(k.cobrado), `Falta cobrar ${M.pesos(k.pendiente)}`)}
        ${kpi("Bar y shop en turnos", M.pesos(k.consumos), "Consumos cargados a la cuenta de la cancha")}
        ${kpi("No vinieron / cancelaron", `${k.noShows} / ${k.cancelados}`, "Hoy")}
        ${kpi("Stock valorizado", M.pesos(k.stockValorizado), `${bajos.length} producto(s) bajo mínimo`)}
        ${kpi("Clientes que deben", M.pesos(k.deudaClientes), `Saldo a favor emitido ${M.pesos(k.saldoAFavor)}`)}
      </div>
    </section>

    <div class="owner">
      <section class="card span-8" aria-labelledby="t-cams">
        <div class="card-head"><h2 id="t-cams">Cámaras</h2><span class="muted small">Cada cámara muestra el turno que está en esa cancha y lo que debe</span></div>
        <div class="cams">${camaras.tiles()}</div>
        <p class="honesto">Simulación de demo. En el club se conecta la grabadora (NVR) que ya tienen: cada cámara se asocia a su cancha y se ve en vivo desde acá, sin abrir otra app.</p>
      </section>

      <section class="card span-4" aria-labelledby="t-torre">
        <div class="card-head"><h2 id="t-torre">Canchas ahora</h2><span class="muted small num">${M.hhmm(AHORA.min)}</span></div>
        <div class="torre">
          ${enCancha.map(({ c, r, prox }) => {
            const pctJugado = r ? Math.min(1, Math.max(0, (AHORA.min - r.inicio) / r.duracion)) : 0;
            return `<div class="t">
              <b>${esc(c.nombre)}</b>
              <div>
                ${r ? `<div class="small"><b>${esc(r.titular)}</b> · termina ${M.hhmm(r.inicio + r.duracion)}</div><div class="bar" role="img" aria-label="Jugado ${Math.round(pctJugado * 100)}%"><i style="width:${pctJugado * 100}%"></i></div>`
                  : `<div class="small muted">Libre${prox ? ` · próximo ${M.hhmm(prox.inicio)} ${esc(prox.titular)}` : ""}</div>`}
              </div>
              ${r ? (M.saldo(r) > 0 ? `<span class="chip warn">Debe ${M.pesos(M.saldo(r))}</span>` : `<span class="chip ok">Al día</span>`) : (E.luces[c.id] ? `<span class="chip bad">Luz prendida</span>` : `<span class="chip">—</span>`)}
            </div>`;
          }).join("")}
        </div>
      </section>

      <section class="card span-7" aria-labelledby="t-calor">
        <div class="card-head"><h2 id="t-calor">Ocupación de la semana</h2><span class="muted small">Dónde sobran horas para vender (promos de valle, clases, escuelita)</span></div>
        ${mapaCalor(calor)}
      </section>

      <section class="card span-5" aria-labelledby="t-plata">
        <div class="card-head"><h2 id="t-plata">Plata de hoy por medio</h2><span class="muted small num">Neto ${M.pesos(k.caja.neto)}</span></div>
        <div class="medios num">
          ${Object.entries(k.caja.porMedio).map(([m, v]) => `<div class="m"><span>${M.MEDIOS[m]}</span><div class="bar" role="img" aria-label="${M.MEDIOS[m]}: ${M.pesos(v)}"><i style="width:${(Math.max(0, v) / maxMedio) * 100}%"></i></div><b style="text-align:right">${M.pesos(v)}</b></div>`).join("")}
        </div>
        <h3 style="margin-top:14px">Cierres de caja</h3>
        ${E.caja.cierres.length ? `<table class="num"><thead><tr><th>Quién</th><th class="r">Esperado</th><th class="r">Contado</th><th class="r">Diferencia</th></tr></thead><tbody>${E.caja.cierres.map((c) => `<tr><td>${esc(c.responsable)} · ${M.hhmm(c.min)}</td><td class="r">${M.pesos(c.esperado)}</td><td class="r">${M.pesos(c.contado)}</td><td class="r">${c.diferencia === 0 ? `<span class="chip ok">Cuadra</span>` : `<span class="chip ${c.diferencia < 0 ? "bad" : "warn"}">${M.pesos(c.diferencia)}</span>`}</td></tr>`).join("")}</tbody></table>`
          : `<p class="small muted">Todavía nadie cerró caja hoy. El cierre lo hace recepción y acá ves si cuadró.</p>`}
      </section>

      <section class="card span-12" aria-labelledby="t-stock">
        <div class="card-head"><h2 id="t-stock">Stock</h2>
          <div class="row">${bajos.length ? `<a class="btn sm accent" target="_blank" rel="noopener" href="${esc(wa(M.mensajeWhatsApp("reposicion", { lista: bajos.map((p) => `${p.nombre} (${Math.max(p.minimo * 2 - p.stock, 1)})`).join(", ") })))}">Pedir lo que falta por WhatsApp</a>` : ""}</div>
        </div>
        <div class="tbl-wrap"><table class="num">
          <thead><tr><th>Producto</th><th>Rubro</th><th class="r">Precio</th><th class="r">Stock</th><th class="r">Mínimo</th><th>Estado</th><th class="r">Valorizado</th><th>Ingresar mercadería</th></tr></thead>
          <tbody>${E.productos.map((p) => `<tr>
            <td>${esc(p.nombre)}</td><td>${esc(p.categoria)}</td><td class="r">${M.pesos(p.precio)}</td>
            <td class="r">${p.stock}${p.alquiler ? ` <span class="muted small">(${p.prestados ?? 0} en cancha)</span>` : ""}</td><td class="r">${p.alquiler ? "—" : p.minimo}</td>
            <td>${p.alquiler ? `<span class="chip info">Alquiler</span>` : p.stock === 0 ? `<span class="chip bad">Sin stock</span>` : p.stock <= p.minimo ? `<span class="chip warn">Reponer</span>` : `<span class="chip ok">OK</span>`}</td>
            <td class="r">${M.pesos(p.costo * (p.stock + (p.prestados ?? 0)))}</td>
            <td><div class="row" style="flex-wrap:nowrap"><label class="sr" for="in-${p.id}">Cantidad que entra de ${esc(p.nombre)}</label><input id="in-${p.id}" type="number" min="1" value="6" style="width:72px;min-height:34px"><button type="button" class="btn sm" data-a="ingreso" data-v="${p.id}">Sumar</button></div></td>
          </tr>`).join("")}</tbody>
        </table></div>
      </section>

      <section class="card span-7" aria-labelledby="t-reglas">
        <div class="card-head"><h2 id="t-reglas">Reglas del club</h2><span class="muted small">Cambian en vivo lo que ve recepción</span></div>
        <div class="reglas">
          ${regla("horasCancelacionLibre", "Cancelar sin perder la seña hasta (horas antes)", E.config.politica.horasCancelacionLibre)}
          ${regla("senaPct", "Seña (% del turno)", E.config.politica.senaPct)}
          ${regla("strikesParaSena", "Faltas para pedir seña siempre", E.config.politica.strikesParaSena)}
          ${regla("toleranciaMin", "Tolerancia de llegada (minutos)", E.config.politica.toleranciaMin)}
          ${E.config.tarifas.map((t, i) => `<label class="f">Precio por hora ${esc(t.nombre.toLowerCase())} (${M.hhmm(t.desde)}–${M.hhmm(t.hasta)})<input type="number" min="0" step="500" value="${t.precioHora}" data-a="tarifa" data-v="${i}"></label>`).join("")}
          <label class="f">Descuento socio (%)<input type="number" min="0" max="100" value="${E.config.descuentoSocioPct}" data-a="socio"></label>
        </div>
        <p class="small muted" style="margin:10px 0 0">Precios y reglas de ejemplo, a confirmar con el club. Los cambios valen para turnos nuevos; lo ya reservado mantiene su precio.</p>
      </section>

      <section class="card span-5" aria-labelledby="t-log">
        <div class="card-head"><h2 id="t-log">Qué pasó hoy</h2></div>
        <div class="log">${E.log.slice(0, 40).map((l) => `<div><span class="muted num">${l.min != null ? M.hhmm(l.min) : ""}</span> ${esc(l.texto)}</div>`).join("") || `<p class="small muted">Sin movimientos todavía.</p>`}</div>
      </section>
    </div>
  </div>`;
}

const kpi = (l, v, s) => `<div class="kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
const regla = (k, l, v) => `<label class="f">${l}<input type="number" min="0" value="${v}" data-a="regla" data-v="${k}"></label>`;

function mapaCalor({ horas, filas }) {
  // Secuencial de un solo tono (azul de la marca): más oscuro = más ocupado. El número va en el título y en la tabla.
  const color = (v) => `color-mix(in oklab, var(--royal) ${Math.round(8 + v * 92)}%, var(--paper))`;
  const cols = `grid-template-columns:64px repeat(${horas.length},minmax(14px,1fr))`;
  return `<div class="tbl-wrap"><div class="heat" style="${cols};min-width:520px" role="img" aria-label="Mapa de ocupación de los últimos 7 días por hora. Detalle en la tabla de abajo.">
    <span></span>${horas.map((h) => `<span class="lab num" style="justify-content:center">${(h / 60) % 24}</span>`).join("")}
    ${filas.map((f) => `<span class="lab">${esc(fechaCorta(f.fecha))}</span>${f.valores.map((v, i) => `<span class="c" style="background:${color(v)}" title="${esc(fechaCorta(f.fecha))} ${M.hhmm(horas[i])}: ${Math.round(v * 100)}% ocupado"></span>`).join("")}`).join("")}
  </div></div>
  <div class="heat-scale" aria-hidden="true">Vacío <i style="background:${color(0)}"></i><i style="background:${color(0.33)}"></i><i style="background:${color(0.66)}"></i><i style="background:${color(1)}"></i> Lleno</div>
  <details style="margin-top:8px"><summary class="small muted">Ver como tabla</summary><div class="tbl-wrap"><table class="num small"><thead><tr><th>Día</th>${horas.map((h) => `<th class="r">${M.hhmm(h)}</th>`).join("")}</tr></thead><tbody>${filas.map((f) => `<tr><td>${esc(fechaCorta(f.fecha))}</td>${f.valores.map((v) => `<td class="r">${Math.round(v * 100)}%</td>`).join("")}</tr>`).join("")}</tbody></table></div></details>`;
}

// ───────────────────────────── Cámaras (simuladas) ─────────────────────────────

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
      const pie = cam.cancha ? (r ? `${esc(r.titular)} · ${M.saldo(r) > 0 ? `debe ${M.pesos(M.saldo(r))}` : "al día"}` : E.luces[cam.cancha] ? "Sin turno · luz prendida" : "Sin turno") : "General";
      return `<button type="button" class="cam" data-a="cam" data-v="${i}" aria-label="Cámara ${esc(cam.nombre)}: ${pie}. Ampliar">
        <canvas width="320" height="200" data-cam="${i}" aria-hidden="true"></canvas>
        <span class="ov"><span class="top"><span>CAM ${pad(i + 1)} · ${esc(cam.nombre)}</span><span class="live">EN VIVO</span></span><span class="bot">${pie}</span></span>
      </button>`;
    }).join("");
  }

  function dibujar(cv, cam, t) {
    const g = cv.getContext("2d");
    const W = cv.width, H = cv.height;
    const luz = cam.cancha ? E.luces[cam.cancha] : true;
    const r = cam.cancha ? E.reservas.find((x) => x.fecha === HOY && x.canchaId === cam.cancha && x.estado === "en_cancha") : null;
    g.fillStyle = luz ? "#1b2a1f" : "#07090b";
    g.fillRect(0, 0, W, H);
    if (cam.cancha) {
      // Cancha vista desde arriba, en perspectiva leve: césped azul, líneas, red y vidrios.
      g.save();
      g.translate(W / 2, H / 2);
      const cw = W * 0.78, ch = H * 0.62;
      g.fillStyle = luz ? "#1f5fa8" : "#0d243f";
      g.fillRect(-cw / 2, -ch / 2, cw, ch);
      g.strokeStyle = luz ? "rgba(255,255,255,.85)" : "rgba(255,255,255,.25)";
      g.lineWidth = 2;
      g.strokeRect(-cw / 2, -ch / 2, cw, ch);
      g.beginPath(); g.moveTo(0, -ch / 2); g.lineTo(0, ch / 2); g.stroke(); // red
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(-cw * 0.33, -ch / 2); g.lineTo(-cw * 0.33, ch / 2); g.moveTo(cw * 0.33, -ch / 2); g.lineTo(cw * 0.33, ch / 2);
      g.moveTo(-cw * 0.33, 0); g.lineTo(cw * 0.33, 0); g.stroke();
      g.strokeStyle = "rgba(180,220,255,.35)"; g.lineWidth = 4;
      g.strokeRect(-cw / 2 - 6, -ch / 2 - 6, cw + 12, ch + 12);
      if (r && luz) {
        const jugadores = Math.max(2, r.jugadores.length);
        const pos = [[-0.3, -0.25], [-0.3, 0.25], [0.3, -0.25], [0.3, 0.25]].slice(0, jugadores === 3 ? 4 : jugadores);
        pos.forEach(([x, y], k) => {
          const px = x * cw + Math.sin(t / 700 + k * 1.7) * cw * 0.08;
          const py = y * ch + Math.cos(t / 900 + k) * ch * 0.12;
          g.fillStyle = k < 2 ? "#ffd5a8" : "#f2f2f2";
          g.beginPath(); g.arc(px, py, 6, 0, Math.PI * 2); g.fill();
        });
        const bx = Math.sin(t / 380) * cw * 0.38, by = Math.sin(t / 530) * ch * 0.3;
        g.fillStyle = "#e9ff3c"; g.beginPath(); g.arc(bx, by, 2.6, 0, Math.PI * 2); g.fill();
      }
      g.restore();
    } else {
      // Escena genérica: piso, mostrador / mesas / autos, y alguien que se mueve.
      g.fillStyle = "#2a2622"; g.fillRect(0, H * 0.55, W, H * 0.45);
      g.fillStyle = cam.escena === "estacionamiento" ? "#3a3a3a" : "#5a4632";
      if (cam.escena === "recepcion") g.fillRect(W * 0.15, H * 0.5, W * 0.55, H * 0.14);
      if (cam.escena === "bar") for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(W * (0.2 + k * 0.2), H * 0.72, 14, 0, Math.PI * 2); g.fill(); }
      if (cam.escena === "estacionamiento") for (let k = 0; k < 4; k++) { g.fillStyle = ["#7a1f1f", "#20406a", "#cfcfcf", "#2e2e2e"][k]; g.fillRect(W * (0.08 + k * 0.23), H * 0.66, W * 0.16, H * 0.16); }
      const x = W * (0.5 + Math.sin(t / 2500) * 0.35);
      g.fillStyle = "#d9c7b3"; g.beginPath(); g.arc(x, H * 0.48, 7, 0, Math.PI * 2); g.fill();
      g.fillRect(x - 6, H * 0.5, 12, 22);
    }
    // Grano y sello de hora: la marca de agua de cualquier NVR.
    g.fillStyle = "rgba(255,255,255,.05)";
    for (let k = 0; k < 120; k++) g.fillRect(Math.random() * W, Math.random() * H, 1, 1);
    g.fillStyle = "rgba(255,255,255,.75)"; g.font = "10px ui-monospace,monospace";
    g.fillText(`${HOY} ${M.hhmm(AHORA.min)}:${pad(Math.floor(t / 1000) % 60)}`, 8, Math.round(H * 0.2));
  }

  function frame() {
    const lista = LISTA();
    const t = performance.now();
    document.querySelectorAll("canvas[data-cam]").forEach((cv) => dibujar(cv, lista[Number(cv.dataset.cam)], t));
  }

  return {
    tiles,
    lista: LISTA,
    dibujar,
    arrancar() { frame(); if (!quieto) timer = setInterval(frame, 120); },
    parar() { clearInterval(timer); timer = null; },
  };
})();

// ═════════════════════════════════ DIÁLOGOS ═════════════════════════════════

let dialogoActual = null;

function abrir({ titulo, sub = "", cuerpo, pie = "", ancho = false, alAbrir, refrescar }) {
  const d = $("#dlg");
  d.className = ancho ? "wide" : "";
  d.innerHTML = `
    <div class="dlg-h"><div><h2 id="dlg-titulo">${titulo}</h2>${sub ? `<p class="small muted" style="margin:4px 0 0">${sub}</p>` : ""}</div>
      <button type="button" class="btn sm ghost" data-a="cerrar" aria-label="Cerrar">✕</button></div>
    <div class="dlg-b">${cuerpo}</div>
    ${pie ? `<div class="dlg-f">${pie}</div>` : ""}`;
  dialogoActual = { refrescar };
  if (!d.open) d.showModal();
  alAbrir?.(d);
}

function cerrarDialogo() { const d = $("#dlg"); if (d.open) d.close(); dialogoActual = null; }

// ───── detalle del turno: cobrar, dar cancha, mover, cancelar ─────

function verReserva(id) {
  const pintar = () => {
    const r = M.reserva(E, id);
    if (!r) return cerrarDialogo();
    const c = M.cancha(E, r.canchaId);
    const cl = r.clienteId ? M.cliente(E, r.clienteId) : null;
    const abierto = ["reservada", "en_cancha"].includes(r.estado);
    const s = M.saldo(r);
    // El saldo se reparte entre los que todavía no pusieron nada (si ya pusieron todos, entre todos).
    const sinPagar = r.jugadores.map((j, i) => (j.pagado ? -1 : i)).filter((i) => i >= 0);
    const quienes = sinPagar.length ? sinPagar : r.jugadores.map((_, i) => i);
    const cuotas = M.dividir(Math.max(0, s), quienes.length);
    const partes = r.jugadores.map((_, i) => (quienes.includes(i) ? cuotas[quienes.indexOf(i)] : 0));
    const otras = E.canchas.filter((x) => x.id !== r.canchaId);
    const vendibles = E.productos.filter((p) => p.stock > 0);
    abrir({
      titulo: esc(r.titular),
      sub: `${esc(c.nombre)} · ${esc(fechaCorta(r.fecha))} ${M.hhmm(r.inicio)}–${M.hhmm(r.inicio + r.duracion)} · ${M.TIPOS[r.tipo]} · ${M.ESTADOS[r.estado]} · vino por ${esc(r.origen)}`,
      ancho: true,
      refrescar: pintar,
      cuerpo: `
        ${cl ? `<div class="row small">${cl.socio ? `<span class="chip info">Socio</span>` : ""}${cl.nivel ? `<span class="chip">Nivel ${esc(cl.nivel)}</span>` : ""}${cl.strikes ? `<span class="chip warn">${cl.strikes} falta(s)</span>` : ""}${cl.deuda ? `<span class="chip bad">Debe ${M.pesos(cl.deuda)} de antes</span>` : ""}${cl.monedero ? `<span class="chip ok">Saldo a favor ${M.pesos(cl.monedero)}</span>` : ""}</div>` : `<p class="small muted" style="margin:0">Sin ficha de cliente (turno de mostrador).</p>`}
        ${r.notas ? `<p class="small" style="margin:0">📝 ${esc(r.notas)}</p>` : ""}
        <div class="grid2">
          <div>
            <h3>Cuenta de la cancha</h3>
            <dl class="kv num" style="margin-top:6px">
              <dt>Turno (${r.duracion}′)</dt><dd>${M.pesos(r.precio)}</dd>
              ${r.consumos.map((x) => `<dt>${x.cant} × ${esc(x.nombre)}</dt><dd>${M.pesos(x.cant * x.precioUnit)}</dd>`).join("")}
              <dt>Cobrado</dt><dd>${M.pesos(-M.cobrado(r))}</dd>
              <dt class="tot">Saldo</dt><dd class="tot">${M.pesos(s)}</dd>
            </dl>
            ${r.sena.monto > 0 ? `<p class="small" style="margin:6px 0 0">Seña ${M.pesos(r.sena.monto)}: ${r.sena.pagada ? "✔ pagada" : "<b>pendiente</b>"}</p>` : ""}
            ${abierto && vendibles.length ? `<div class="row" style="margin-top:10px">
              <label class="sr" for="cons-prod">Producto para sumar a la cuenta</label>
              <select id="cons-prod" style="flex:1;min-width:160px">${vendibles.map((p) => `<option value="${p.id}">${esc(p.nombre)} · ${M.pesos(p.precio)}</option>`).join("")}</select>
              <button type="button" class="btn sm" data-a="consumo" data-v="${r.id}">+ A la cuenta</button>
            </div>` : ""}
          </div>
          <div>
            <h3>Jugadores</h3>
            <div class="players" style="margin-top:6px">
              ${r.jugadores.map((j, i) => `<div class="player"><span>${esc(j.nombre)}</span><span class="small muted num">${j.pagado ? `pagó ${M.pesos(j.pagado)}` : ""}</span>
                ${abierto && s > 0 && r.jugadores.length > 1 && partes[i] > 0 ? `<button type="button" class="btn sm" data-a="pagarParte" data-v="${r.id}" data-j="${i}" data-m="${partes[i] ?? 0}">Cobrar ${M.pesos(partes[i] ?? 0)}</button>` : "<span></span>"}</div>`).join("")}
            </div>
            ${abierto && r.jugadores.length < 4 ? `<div class="row" style="margin-top:6px"><label class="sr" for="nuevo-jug">Nombre del jugador</label><input id="nuevo-jug" placeholder="Sumar jugador" style="flex:1"><button type="button" class="btn sm" data-a="sumarJugador" data-v="${r.id}">Sumar</button></div>` : ""}
          </div>
        </div>
        ${abierto && s > 0 ? `<div>
          <h3>Cobrar</h3>
          <div class="medio-pick" role="group" aria-label="Medio de pago" style="margin-top:6px">
            ${Object.entries(M.MEDIOS).filter(([k]) => k !== "monedero" || (cl && cl.monedero > 0)).map(([k, v]) => `<button type="button" data-a="medio" data-v="${k}" aria-pressed="${ui.medio === k}">${v}${k === "monedero" ? ` (${M.pesos(cl.monedero)})` : ""}</button>`).join("")}
          </div>
          <div class="row" style="margin-top:8px">
            <label class="sr" for="monto">Monto a cobrar</label>
            <input id="monto" type="number" min="1" value="${r.sena.monto > 0 && !r.sena.pagada ? r.sena.monto : s}" style="max-width:160px">
            <button type="button" class="btn primary" data-a="pagar" data-v="${r.id}">Cobrar</button>
            ${r.jugadores.length > 1 ? `<span class="small muted">o dividido entre ${quienes.length}: ${M.pesos(cuotas[0] ?? 0)} c/u (botón de cada jugador)</span>` : ""}
          </div>
        </div>` : ""}
        ${abierto ? `<details><summary><b>Mover o extender</b></summary>
          <div class="row" style="margin-top:8px">
            <label class="sr" for="mover-c">Cancha destino</label>
            <select id="mover-c" style="max-width:200px">${otras.map((x) => `<option value="${x.id}">${esc(x.nombre)}${x.cubierta ? "" : " (descubierta)"}</option>`).join("")}</select>
            <button type="button" class="btn sm" data-a="mover" data-v="${r.id}">Pasar a esa cancha</button>
            <button type="button" class="btn sm" data-a="extender" data-v="${r.id}">Extender 30′</button>
          </div></details>` : ""}
      `,
      pie: abierto ? `
        ${cl?.tel ? `<a class="btn" target="_blank" rel="noopener" href="${esc(wa(M.mensajeWhatsApp("recordatorio", { nombre: r.titular.split(" ")[0], hora: M.hhmm(r.inicio), cancha: c.nombre })))}">WhatsApp</a>` : ""}
        ${r.estado === "reservada" ? `<button type="button" class="btn danger" data-a="noShow" data-v="${r.id}">No vino</button>
          ${r.fijoId ? `<button type="button" class="btn" data-a="liberarFijo" data-v="${r.id}">Esta semana no vienen</button>` : ""}
          <button type="button" class="btn danger" data-a="cancelar" data-v="${r.id}">Cancelar turno</button>
          <button type="button" class="btn primary" data-a="checkin" data-v="${r.id}">Dar la cancha</button>` : ""}
        ${r.estado === "en_cancha" ? `<button type="button" class="btn danger" data-a="interrumpir" data-v="${r.id}">Corte de luz / se suspende</button>
          ${s > 0 && cl ? `<button type="button" class="btn" data-a="aCuenta" data-v="${r.id}">Cerrar y dejar ${M.pesos(s)} a cuenta</button>` : ""}
          <button type="button" class="btn primary" data-a="finalizar" data-v="${r.id}" ${s > 0 ? "disabled" : ""}>Cerrar turno${s > 0 ? " (falta cobrar)" : ""}</button>` : ""}`
        : `<button type="button" class="btn" data-a="cerrar">Listo</button>`,
    });
  };
  pintar();
}

// ───── nuevo turno ─────

function nuevoTurno({ canchaId, inicio } = {}) {
  const estadoForm = { canchaId: canchaId ?? E.canchas[0].id, inicio: inicio ?? null, duracion: E.config.duracionTurno, clienteId: null, nuevo: false, tipo: "turno", origen: "mostrador" };
  const pintar = () => {
    const libres = M.huecosLibres(E, VISTA, estadoForm.canchaId, estadoForm.duracion, VISTA === HOY ? Math.floor((AHORA.min - E.config.paso) / E.config.paso) * E.config.paso + E.config.paso : E.config.apertura);
    if (estadoForm.inicio == null || !libres.includes(estadoForm.inicio)) estadoForm.inicio = libres[0] ?? null;
    const cl = estadoForm.clienteId ? M.cliente(E, estadoForm.clienteId) : null;
    const precio = estadoForm.inicio != null ? M.precioTurno(E, { fecha: VISTA, inicio: estadoForm.inicio, duracion: estadoForm.duracion, canchaId: estadoForm.canchaId }, estadoForm.clienteId) : 0;
    const pideSena = M.requiereSena(E, estadoForm.clienteId, estadoForm.tipo);
    abrir({
      titulo: "Nuevo turno",
      sub: `${esc(fechaCorta(VISTA))}`,
      refrescar: null,
      cuerpo: `
        <div class="grid2">
          <label class="f">Cancha<select id="f-cancha">${E.canchas.map((c) => `<option value="${c.id}" ${c.id === estadoForm.canchaId ? "selected" : ""}>${esc(c.nombre)}${c.cubierta ? "" : " (descubierta)"}</option>`).join("")}</select></label>
          <label class="f">Duración<select id="f-dur">${[60, 90, 120].map((d) => `<option value="${d}" ${d === estadoForm.duracion ? "selected" : ""}>${d} min</option>`).join("")}</select></label>
          <label class="f">Hora (sólo libres)<select id="f-hora">${libres.length ? libres.map((m) => `<option value="${m}" ${m === estadoForm.inicio ? "selected" : ""}>${M.hhmm(m)}</option>`).join("") : `<option value="">No hay huecos</option>`}</select></label>
          <label class="f">Tipo<select id="f-tipo">${Object.entries(M.TIPOS).filter(([k]) => k !== "fijo").map(([k, v]) => `<option value="${k}" ${k === estadoForm.tipo ? "selected" : ""}>${v}</option>`).join("")}</select></label>
          <label class="f">Llegó por<select id="f-origen">${["mostrador", "whatsapp", "teléfono", "instagram"].map((o) => `<option ${o === estadoForm.origen ? "selected" : ""}>${o}</option>`).join("")}</select></label>
        </div>
        <div>
          <label class="f" for="f-cli">Cliente (nombre o teléfono)</label>
          ${cl ? `<div class="row" style="margin-top:4px"><span class="chip info">${esc(cl.nombre)}</span>${cl.socio ? `<span class="chip ok">Socio −${E.config.descuentoSocioPct}%</span>` : ""}${cl.strikes ? `<span class="chip warn">${cl.strikes} falta(s)</span>` : ""}${cl.deuda ? `<span class="chip bad">Debe ${M.pesos(cl.deuda)}</span>` : ""}<button type="button" class="btn sm ghost" data-a="quitarCliente">Cambiar</button></div>`
            : `<input id="f-cli" autocomplete="off" placeholder="Escribí para buscar…" style="margin-top:4px"><div class="sug" id="f-sug"></div>
               <div class="grid2" style="margin-top:6px"><label class="f">O a nombre de (sin ficha)<input id="f-titular" placeholder="Ej.: Grupo de Bruno"></label><label class="f">Teléfono (opcional)<input id="f-tel" inputmode="tel"></label></div>`}
        </div>
        <dl class="kv num"><dt>Precio</dt><dd>${M.pesos(precio)}</dd>${pideSena ? `<dt>Seña que corresponde (${E.config.politica.senaPct}%)</dt><dd>${M.pesos(Math.round((precio * E.config.politica.senaPct) / 100 / 100) * 100)}</dd>` : ""}</dl>
        ${pideSena ? `<p class="small muted" style="margin:0">Pide seña porque ${cl ? (cl.deuda ? "debe de un turno anterior" : "tiene faltas sin aviso") : "no tiene ficha de cliente"}. Se confirma por transferencia o Mercado Pago.</p>` : ""}
        <p class="err" id="f-err" role="alert"></p>`,
      pie: `<button type="button" class="btn" data-a="cerrar">Cancelar</button><button type="button" class="btn primary" data-a="confirmarTurno">Reservar</button>`,
      alAbrir(d) {
        const leer = () => {
          estadoForm.canchaId = $("#f-cancha", d).value;
          estadoForm.duracion = Number($("#f-dur", d).value);
          estadoForm.inicio = $("#f-hora", d).value === "" ? null : Number($("#f-hora", d).value);
          estadoForm.tipo = $("#f-tipo", d).value;
          estadoForm.origen = $("#f-origen", d).value;
        };
        ["#f-cancha", "#f-dur", "#f-hora", "#f-tipo"].forEach((s) => $(s, d).addEventListener("change", () => { leer(); pintar(); }));
        $("#f-origen", d).addEventListener("change", leer);
        const input = $("#f-cli", d);
        if (input) {
          input.addEventListener("input", () => {
            const res = M.buscarClientes(E, input.value).slice(0, 6);
            $("#f-sug", d).innerHTML = res.map((c) => `<button type="button" data-a="elegirCliente" data-v="${c.id}">${esc(c.nombre)} <span class="muted small">${c.socio ? "· socio " : ""}${c.strikes ? `· ${c.strikes} falta(s)` : ""}</span></button>`).join("");
          });
          input.focus();
        }
        estadoForm.elegir = (id) => { leer(); estadoForm.clienteId = id; pintar(); };
        estadoForm.quitar = () => { leer(); estadoForm.clienteId = null; pintar(); };
        estadoForm.confirmar = () => {
          leer();
          if (estadoForm.inicio == null) { $("#f-err", d).textContent = "No hay horario libre con esa cancha y duración."; return; }
          let clienteId = estadoForm.clienteId;
          let titular;
          if (!clienteId) {
            titular = $("#f-titular", d)?.value.trim() || $("#f-cli", d)?.value.trim();
            const tel = $("#f-tel", d)?.value.trim();
            if (titular && tel) { const alta = M.altaCliente(E, { nombre: titular, tel }); if (alta.ok) clienteId = alta.cliente.id; }
          }
          const res = M.crearReserva(E, { canchaId: estadoForm.canchaId, fecha: VISTA, inicio: estadoForm.inicio, duracion: estadoForm.duracion, tipo: estadoForm.tipo, origen: estadoForm.origen, clienteId, titular }, AHORA);
          if (!res.ok) { $("#f-err", d).textContent = res.motivo; return; }
          const r = res.reserva;
          render();
          const msj = M.mensajeWhatsApp("confirmacion", { nombre: r.titular.split(" ")[0], cancha: M.cancha(E, r.canchaId).nombre, fecha: fechaCorta(r.fecha), hora: M.hhmm(r.inicio), sena: r.sena.monto ? M.pesos(r.sena.monto) : "" });
          abrir({
            titulo: "Turno reservado ✔",
            sub: `${esc(r.titular)} · ${esc(M.cancha(E, r.canchaId).nombre)} ${M.hhmm(r.inicio)}`,
            cuerpo: `${res.liberadas?.length ? `<p class="small">Se rellenó un hueco cancelado tarde: ${res.liberadas.map((x) => `${esc(x.cliente)} recupera ${M.pesos(x.monto)} como saldo a favor`).join(", ")}.</p>` : ""}<p class="small muted" style="margin:0">Mensaje de confirmación listo para mandar:</p><div class="wa">${esc(msj)}</div>`,
            pie: `<a class="btn" target="_blank" rel="noopener" href="${esc(wa(msj))}">Mandar por WhatsApp</a><button type="button" class="btn" data-a="ver" data-v="${r.id}">Abrir el turno</button><button type="button" class="btn primary" data-a="cerrar">Listo</button>`,
          });
        };
        acciones.formTurno = estadoForm;
      },
    });
  };
  pintar();
}

// ───── venta de mostrador ─────

function mostrador() {
  ui.carrito = {};
  const pintar = () => {
    const enCancha = E.reservas.filter((r) => r.fecha === HOY && ["en_cancha", "reservada"].includes(r.estado) && M.minutosHasta(AHORA, r.fecha, r.inicio) < 60);
    const total = Object.entries(ui.carrito).reduce((s, [id, n]) => s + M.producto(E, id).precio * n, 0);
    abrir({
      titulo: "Venta de mostrador",
      sub: "Bebidas, pelotas, grips y shop. Lo de alquiler va a la cuenta de un turno.",
      refrescar: pintar,
      cuerpo: `
        <div class="prod-list">${E.productos.map((p) => `<div class="prod">
          <span>${esc(p.nombre)} <span class="small muted num">· ${M.pesos(p.precio)} · quedan ${p.stock}</span></span>
          <span class="qty"><button type="button" data-a="qty" data-v="${p.id}" data-m="-1" aria-label="Uno menos de ${esc(p.nombre)}">−</button><b class="num" aria-live="polite">${ui.carrito[p.id] ?? 0}</b><button type="button" data-a="qty" data-v="${p.id}" data-m="1" aria-label="Uno más de ${esc(p.nombre)}" ${p.stock <= (ui.carrito[p.id] ?? 0) ? "disabled" : ""}>+</button></span>
          <span class="num small" style="min-width:80px;text-align:right">${ui.carrito[p.id] ? M.pesos(p.precio * ui.carrito[p.id]) : ""}</span>
        </div>`).join("")}</div>
        <label class="f">¿Cómo lo paga?
          <select id="v-dest">
            <option value="">Paga ahora</option>
            ${enCancha.map((r) => `<option value="${r.id}" ${ui.cuentaDe === r.id ? "selected" : ""}>A la cuenta de ${esc(r.titular)} (${esc(M.cancha(E, r.canchaId).nombre)})</option>`).join("")}
          </select></label>
        <div class="medio-pick" role="group" aria-label="Medio de pago">${Object.entries(M.MEDIOS).filter(([k]) => k !== "monedero").map(([k, v]) => `<button type="button" data-a="medio" data-v="${k}" aria-pressed="${ui.medio === k}">${v}</button>`).join("")}</div>
        <dl class="kv num"><dt class="tot">Total</dt><dd class="tot">${M.pesos(total)}</dd></dl>`,
      pie: `<button type="button" class="btn" data-a="cerrar">Cancelar</button><button type="button" class="btn primary" data-a="cobrarMostrador" ${total ? "" : "disabled"}>Cobrar ${M.pesos(total)}</button>`,
      alAbrir(d) { $("#v-dest", d).addEventListener("change", (ev) => { ui.cuentaDe = ev.target.value; }); },
    });
  };
  pintar();
}

// ───── lista de espera ─────

function listaEspera() {
  const pintar = () => {
    const lista = E.espera.filter((e) => e.fecha >= HOY);
    abrir({
      titulo: "Lista de espera",
      sub: "Cuando alguien cancela o no viene, el sistema le ofrece el hueco al primero que encaje.",
      refrescar: pintar,
      cuerpo: `
        ${lista.length ? `<table><thead><tr><th>Quién</th><th>Día</th><th>Desde–hasta</th><th></th></tr></thead><tbody>${lista.map((e) => {
          const oferta = E.canchas.map((c) => ({ c, m: M.huecosLibres(E, e.fecha, c.id, e.duracion, Math.max(e.desde, e.fecha === HOY ? AHORA.min : 0)).find((m) => m <= e.hasta) })).find((x) => x.m != null && (!e.soloCubierta || x.c.cubierta));
          return `<tr><td>${esc(e.titular)}${e.soloCubierta ? ` <span class="chip">techada</span>` : ""}</td><td>${esc(fechaCorta(e.fecha))}</td><td class="num">${M.hhmm(e.desde)}–${M.hhmm(e.hasta)}</td>
            <td>${oferta ? `<button type="button" class="btn sm primary" data-a="asignarEspera" data-v="${e.id}" data-c="${oferta.c.id}" data-m="${oferta.m}">Dar ${esc(oferta.c.nombre)} ${M.hhmm(oferta.m)}</button>` : `<span class="small muted">Sin hueco todavía</span>`}
            <button type="button" class="btn sm ghost" data-a="sacarEspera" data-v="${e.id}">Sacar</button></td></tr>`;
        }).join("")}</tbody></table>` : `<p class="empty">Nadie esperando.</p>`}
        <h3>Anotar</h3>
        <div class="grid2">
          <label class="f">Nombre<input id="e-nom"></label>
          <label class="f">Día<select id="e-dia">${[0, 1, 2, 3].map((d) => M.sumarDias(HOY, d)).map((f) => `<option value="${f}">${esc(fechaCorta(f))}</option>`).join("")}</select></label>
          <label class="f">Desde<select id="e-desde">${horasOpc(18 * 60)}</select></label>
          <label class="f">Hasta<select id="e-hasta">${horasOpc(23 * 60)}</select></label>
        </div>
        <label class="row small"><input type="checkbox" id="e-techo"> Sólo cancha techada</label>
        <p class="err" id="e-err" role="alert"></p>`,
      pie: `<button type="button" class="btn" data-a="cerrar">Cerrar</button><button type="button" class="btn primary" data-a="anotarEspera">Anotar</button>`,
    });
  };
  pintar();
}

const horasOpc = (sel) => { let o = ""; for (let m = E.config.apertura; m < E.config.cierre; m += E.config.paso) o += `<option value="${m}" ${m === sel ? "selected" : ""}>${M.hhmm(m)}</option>`; return o; };

// ───── plan lluvia ─────

function planLluvia() {
  const p = E.clima.pronostico?.fecha === HOY ? E.clima.pronostico : { desde: Math.ceil(AHORA.min / 30) * 30, hasta: E.config.cierre };
  const descubiertas = E.canchas.filter((c) => !c.cubierta);
  abrir({
    titulo: "Plan lluvia",
    sub: `Para ${descubiertas.map((c) => esc(c.nombre)).join(", ") || "ninguna cancha descubierta"}. Primero intenta pasar cada turno a una techada libre; si no hay, lo suspende y deja saldo a favor.`,
    cuerpo: `
      ${E.clima.pronostico?.fecha === HOY ? `<p class="small" style="margin:0">🌧️ Pronóstico de ejemplo: lluvia de ${M.hhmm(p.desde)} a ${M.hhmm(p.hasta)}.</p>` : ""}
      <div class="grid2">
        <label class="f">Desde<select id="l-desde">${horasOpc(Math.max(E.config.apertura, Math.min(p.desde - (p.desde % 30), E.config.cierre - 30)))}</select></label>
        <label class="f">Hasta<select id="l-hasta">${horasOpc(Math.min(E.config.cierre - 30, p.hasta - (p.hasta % 30)))}</select></label>
      </div>`,
    pie: `<button type="button" class="btn" data-a="cerrar">Cancelar</button><button type="button" class="btn primary" data-a="aplicarLluvia">Aplicar plan lluvia</button>`,
  });
}

// ───── bloqueo ─────

function bloqueo() {
  abrir({
    titulo: "Bloquear cancha",
    sub: "Mantenimiento, torneo, evento privado. No pisa turnos: si hay alguno, primero hay que moverlo.",
    cuerpo: `<div class="grid2">
      <label class="f">Cancha<select id="b-c"><option value="*">Todo el club</option>${E.canchas.map((c) => `<option value="${c.id}">${esc(c.nombre)}</option>`).join("")}</select></label>
      <label class="f">Desde<select id="b-d">${horasOpc(9 * 60)}</select></label>
      <label class="f">Hasta<select id="b-h">${horasOpc(11 * 60)}</select></label>
      <label class="f">Motivo<input id="b-m" value="Cambio de red"></label>
    </div><p class="err" id="b-err" role="alert"></p>`,
    pie: `<button type="button" class="btn" data-a="cerrar">Cancelar</button><button type="button" class="btn primary" data-a="aplicarBloqueo">Bloquear ${esc(fechaCorta(VISTA))}</button>`,
  });
}

// ───── caja ─────

function cierreCaja() {
  const r = M.resumenCaja(E, HOY);
  abrir({
    titulo: "Cerrar caja",
    sub: "Contá el efectivo del cajón. Lo digital (Mercado Pago, transferencias, tarjeta) ya está registrado.",
    cuerpo: `<dl class="kv num">${Object.entries(r.porMedio).map(([k, v]) => `<dt>${M.MEDIOS[k]}</dt><dd>${M.pesos(v)}</dd>`).join("")}<dt>Fondo inicial</dt><dd>${M.pesos(E.caja.fondo)}</dd><dt class="tot">Efectivo que tiene que haber</dt><dd class="tot">${M.pesos(r.efectivoEsperado)}</dd></dl>
      <div class="grid2"><label class="f">Quién cierra<input id="k-quien" value="Mica (recepción tarde)"></label><label class="f">Efectivo contado<input id="k-cont" type="number" min="0" value="${r.efectivoEsperado}"></label></div>
      <p class="err" id="k-err" role="alert"></p>`,
    pie: `<button type="button" class="btn" data-a="cerrar">Cancelar</button><button type="button" class="btn primary" data-a="aplicarCierre">Cerrar caja</button>`,
  });
}

function egreso() {
  abrir({
    titulo: "Registrar un gasto",
    cuerpo: `<div class="grid2"><label class="f">Concepto<input id="g-c" placeholder="Ej.: hielo, artículos de limpieza"></label><label class="f">Monto<input id="g-m" type="number" min="1"></label></div><p class="err" id="g-err" role="alert"></p>`,
    pie: `<button type="button" class="btn" data-a="cerrar">Cancelar</button><button type="button" class="btn primary" data-a="aplicarEgreso">Registrar (sale del efectivo)</button>`,
  });
}

// ───── clientes ─────

function clientes() {
  const pintar = () => {
    const lista = [...E.clientes].sort((a, b) => (b.deuda - a.deuda) || (b.strikes - a.strikes) || a.nombre.localeCompare(b.nombre));
    abrir({
      titulo: "Clientes",
      ancho: true,
      refrescar: pintar,
      cuerpo: `<div class="tbl-wrap"><table class="num"><thead><tr><th>Nombre</th><th>Nivel</th><th>Socio</th><th class="r">Faltas</th><th class="r">Debe</th><th class="r">Saldo a favor</th><th></th></tr></thead><tbody>
        ${lista.map((c) => `<tr><td>${esc(c.nombre)}</td><td>${esc(c.nivel || "—")}</td><td>${c.socio ? "Sí" : ""}</td><td class="r">${c.strikes || ""}</td><td class="r">${c.deuda ? `<span class="chip bad">${M.pesos(c.deuda)}</span>` : ""}</td><td class="r">${c.monedero ? M.pesos(c.monedero) : ""}</td>
          <td>${c.deuda ? `<a class="btn sm" target="_blank" rel="noopener" href="${esc(wa(M.mensajeWhatsApp("deuda", { nombre: c.nombre.split(" ")[0], monto: M.pesos(c.deuda) })))}">Recordar por WhatsApp</a> <button type="button" class="btn sm" data-a="saldarDeuda" data-v="${c.id}">Cobró</button>` : ""}${c.strikes ? ` <button type="button" class="btn sm ghost" data-a="perdonar" data-v="${c.id}">Perdonar faltas</button>` : ""}</td></tr>`).join("")}
      </tbody></table></div>`,
    });
  };
  pintar();
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
      const loop = () => { if (!d.open || !$("#cam-big", d)) return; camaras.dibujar(cv, cam, performance.now()); requestAnimationFrame(loop); };
      loop();
    },
  });
}

// ═════════════════════════════════ ACCIONES ═════════════════════════════════

const acciones = {
  formTurno: null,
  rol: (b) => { ROL = b.dataset.v; render(); $("#app").focus(); },
  reloj: (b) => { AHORA.min = Math.min(E.config.cierre, Math.max(E.config.apertura, AHORA.min + Number(b.dataset.v))); render(); },
  tema: () => {
    const raiz = document.documentElement;
    const oscuroAhora = raiz.dataset.theme ? raiz.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    raiz.dataset.theme = oscuroAhora ? "light" : "dark";
    try { localStorage.setItem("bp-tema", raiz.dataset.theme); } catch { /* sin almacenamiento: vale para esta visita */ }
  },
  reiniciar: () => { cerrarDialogo(); iniciar(); toast("Demo reiniciada."); },
  dia: (b) => { VISTA = b.dataset.v; render(); },
  nuevo: (b) => nuevoTurno({ canchaId: b.dataset.c, inicio: b.dataset.m != null ? Number(b.dataset.m) : undefined }),
  ver: (b) => verReserva(b.dataset.v),
  cerrar: () => cerrarDialogo(),
  luz: (b) => { E.luces[b.dataset.v] = !E.luces[b.dataset.v]; render(); },
  mant: (b) => { const c = M.cancha(E, b.dataset.v); c.estado = c.estado === "mantenimiento" ? "ok" : "mantenimiento"; toast(`${c.nombre}: ${c.estado === "mantenimiento" ? "en mantenimiento" : "habilitada"}.`); render(); },
  mostrador: () => mostrador(),
  espera: () => listaEspera(),
  lluvia: () => planLluvia(),
  bloqueo: () => bloqueo(),
  clientes: () => clientes(),
  cerrarCaja: () => cierreCaja(),
  egreso: () => egreso(),
  cam: (b) => camaraGrande(Number(b.dataset.v)),

  alerta: (b) => {
    const a = ALERTAS[Number(b.dataset.v)];
    if (!a) return;
    if (a.reservaId) return verReserva(a.reservaId);
    if (a.tipo === "luz") { E.luces[a.canchaId] = false; toast(`Luz de ${M.cancha(E, a.canchaId).nombre} apagada.`); return render(); }
    if (a.tipo === "lluvia") return planLluvia();
    if (a.tipo === "espera") {
      const e = E.espera.find((x) => x.id === a.esperaId);
      const msj = M.mensajeWhatsApp("espera", { nombre: e.titular.split(" ")[0], cancha: M.cancha(E, a.canchaId).nombre, hora: M.hhmm(a.inicio), fecha: "hoy" });
      return abrir({
        titulo: "Ofrecer el hueco",
        sub: `${esc(e.titular)} · ${esc(M.cancha(E, a.canchaId).nombre)} ${M.hhmm(a.inicio)}`,
        cuerpo: `<div class="wa">${esc(msj)}</div><p class="small muted" style="margin:0">Cuando conteste que sí, reservale el turno con un toque.</p>`,
        pie: `<a class="btn" target="_blank" rel="noopener" href="${esc(wa(msj))}">Mandar por WhatsApp</a><button type="button" class="btn primary" data-a="asignarEspera" data-v="${e.id}" data-c="${a.canchaId}" data-m="${a.inicio}">Dijo que sí: reservar</button>`,
      });
    }
    if (a.tipo === "stock") { ROL = "duenio"; render(); return $("#t-stock")?.scrollIntoView({ behavior: "smooth" }); }
    if (a.tipo === "mantenimiento") {
      const r = E.reservas.find((x) => x.fecha === HOY && x.canchaId === a.canchaId && x.estado === "reservada" && x.inicio > AHORA.min);
      if (r) return verReserva(r.id);
    }
  },

  // turno
  medio: (b) => { ui.medio = b.dataset.v; b.parentElement.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); },
  pagar: (b) => { const monto = Number($("#monto").value); hecho(M.registrarPago(E, b.dataset.v, { medio: ui.medio, monto }, AHORA), `Cobrado ${M.pesos(monto)} (${M.MEDIOS[ui.medio]}).`); },
  pagarParte: (b) => { const monto = Number(b.dataset.m); hecho(M.registrarPago(E, b.dataset.v, { medio: ui.medio, monto, jugador: Number(b.dataset.j) }, AHORA), `Cobrado ${M.pesos(monto)} a ${M.reserva(E, b.dataset.v).jugadores[b.dataset.j].nombre}.`); },
  consumo: (b) => hecho(M.agregarConsumo(E, b.dataset.v, $("#cons-prod").value, 1, AHORA), "Sumado a la cuenta."),
  sumarJugador: (b) => { const n = $("#nuevo-jug").value.trim(); if (!n) return toast("Escribí el nombre."); M.reserva(E, b.dataset.v).jugadores.push({ nombre: n }); render(); },
  checkin: (b) => hecho(M.checkIn(E, b.dataset.v, AHORA), "Cancha entregada y luz prendida."),
  finalizar: (b) => { if (hecho(M.finalizar(E, b.dataset.v, {}, AHORA), "Turno cerrado. Luz apagada.")) cerrarDialogo(); },
  aCuenta: (b) => { if (hecho(M.finalizar(E, b.dataset.v, { dejarDeuda: true }, AHORA), "Turno cerrado con saldo a cuenta del cliente.")) cerrarDialogo(); },
  noShow: (b) => {
    const res = M.marcarNoShow(E, b.dataset.v, AHORA);
    if (!hecho(res, "Marcado como 'no vino'. Se sumó una falta.")) return;
    ofrecer(res.ofertas);
  },
  cancelar: (b) => {
    const res = M.cancelar(E, b.dataset.v, {}, AHORA);
    if (!hecho(res, res.aTiempo ? (res.devuelto ? `Cancelado a tiempo: ${M.pesos(res.devuelto)} a saldo a favor.` : "Cancelado a tiempo.") : res.enSuspenso ? "Cancelado tarde: la seña queda en suspenso hasta que se venda el hueco." : "Cancelado.")) return;
    ofrecer(res.ofertas);
  },
  liberarFijo: (b) => { const r = M.reserva(E, b.dataset.v); const res = M.liberarFijo(E, r.fijoId, r.fecha, AHORA); if (hecho(res, "Liberado sólo esta semana; el turno fijo sigue.")) ofrecer(res.ofertas ?? []); },
  mover: (b) => hecho(M.mover(E, b.dataset.v, { canchaId: $("#mover-c").value }, AHORA), "Turno movido."),
  extender: (b) => { const res = M.extender(E, b.dataset.v, 30, AHORA); hecho(res, res.ok ? `Extendido 30′ (+${M.pesos(res.extra)}).` : ""); },
  interrumpir: (b) => { const res = M.interrumpir(E, b.dataset.v, "corte de luz", AHORA); hecho(res, res.ok ? `Se reconocen ${M.pesos(res.credito)} por ${res.noJugados}′ sin jugar.` : ""); },

  // nuevo turno
  elegirCliente: (b) => acciones.formTurno?.elegir(b.dataset.v),
  quitarCliente: () => acciones.formTurno?.quitar(),
  confirmarTurno: () => acciones.formTurno?.confirmar(),

  // mostrador
  qty: (b) => { const id = b.dataset.v; ui.carrito[id] = Math.max(0, (ui.carrito[id] ?? 0) + Number(b.dataset.m)); if (!ui.carrito[id]) delete ui.carrito[id]; dialogoActual?.refrescar?.(); },
  cobrarMostrador: () => {
    const items = Object.entries(ui.carrito).map(([productoId, cant]) => ({ productoId, cant }));
    const destino = $("#v-dest")?.value;
    if (destino) {
      for (const it of items) { const res = M.agregarConsumo(E, destino, it.productoId, it.cant, AHORA); if (!res.ok) return toast(res.motivo); }
      ui.carrito = {}; ui.cuentaDe = ""; cerrarDialogo(); render(); return toast("Cargado a la cuenta del turno.");
    }
    const res = M.ventaMostrador(E, items, ui.medio, AHORA);
    if (!res.ok) return toast(res.motivo);
    ui.carrito = {}; cerrarDialogo(); render(); toast(`Venta cobrada: ${M.pesos(res.total)}.`);
  },

  // espera
  anotarEspera: () => {
    const nombre = $("#e-nom").value.trim();
    if (!nombre) { $("#e-err").textContent = "Falta el nombre."; return; }
    const desde = Number($("#e-desde").value), hasta = Number($("#e-hasta").value);
    if (hasta < desde) { $("#e-err").textContent = "El 'hasta' tiene que ser después del 'desde'."; return; }
    M.anotarEspera(E, { titular: nombre, fecha: $("#e-dia").value, desde, hasta, soloCubierta: $("#e-techo").checked }, AHORA);
    toast(`${nombre} quedó en la lista de espera.`); render();
  },
  asignarEspera: (b) => { if (hecho(M.asignarDesdeEspera(E, b.dataset.v, { canchaId: b.dataset.c, inicio: Number(b.dataset.m) }, AHORA), "Turno reservado desde la lista de espera.")) { if (!dialogoActual?.refrescar) cerrarDialogo(); } },
  sacarEspera: (b) => { E.espera = E.espera.filter((e) => e.id !== b.dataset.v); render(); },

  aplicarLluvia: () => {
    const res = M.planLluvia(E, HOY, Number($("#l-desde").value), Number($("#l-hasta").value) + E.config.paso, AHORA);
    render();
    abrir({
      titulo: "Plan lluvia aplicado",
      sub: res.resultado.length ? `${res.resultado.length} turno(s) resueltos. Avisá a cada uno:` : "No había turnos en canchas descubiertas en ese horario.",
      cuerpo: res.resultado.map((x) => {
        const r = M.reserva(E, x.reservaId);
        const msj = x.accion === "movido"
          ? M.mensajeWhatsApp("lluvia_movido", { nombre: x.titular.split(" ")[0], hora: M.hhmm(r.inicio), cancha: x.cancha })
          : M.mensajeWhatsApp("lluvia_suspendido", { nombre: x.titular.split(" ")[0], hora: M.hhmm(r.inicio), credito: x.credito ? M.pesos(x.credito) : "" });
        return `<div><p style="margin:0 0 4px"><b>${esc(x.titular)}</b> — ${x.accion === "movido" ? `pasa a ${esc(x.cancha)}` : `suspendido${x.credito ? `, ${M.pesos(x.credito)} a saldo a favor` : ""}`}</p><div class="wa">${esc(msj)}</div><a class="btn sm" style="margin-top:6px" target="_blank" rel="noopener" href="${esc(wa(msj))}">Mandar</a></div>`;
      }).join("") || `<p class="empty">Nada que mover.</p>`,
      pie: `<button type="button" class="btn primary" data-a="cerrar">Listo</button>`,
    });
  },
  aplicarBloqueo: () => {
    const res = M.bloquear(E, { canchaId: $("#b-c").value, fecha: VISTA, desde: Number($("#b-d").value), hasta: Number($("#b-h").value), motivo: $("#b-m").value.trim() || "Bloqueo" }, AHORA);
    if (!res.ok) { $("#b-err").textContent = res.motivo; return; }
    cerrarDialogo(); render(); toast("Cancha bloqueada.");
  },
  aplicarCierre: () => {
    const res = M.cerrarCaja(E, { contado: $("#k-cont").value, responsable: $("#k-quien").value.trim() || "Recepción" }, AHORA);
    if (!res.ok) { $("#k-err").textContent = res.motivo; return; }
    cerrarDialogo(); render();
    toast(res.cierre.diferencia === 0 ? "Caja cerrada: cuadra justo." : `Caja cerrada con diferencia de ${M.pesos(res.cierre.diferencia)}. El dueño la ve en su tablero.`);
  },
  aplicarEgreso: () => {
    const res = M.egresoCaja(E, { monto: $("#g-m").value, concepto: $("#g-c").value }, AHORA);
    if (!res.ok) { $("#g-err").textContent = res.motivo; return; }
    cerrarDialogo(); render(); toast("Gasto registrado.");
  },
  saldarDeuda: (b) => {
    const c = M.cliente(E, b.dataset.v);
    E.caja.movimientos.push({ id: `m-deuda-${c.id}-${E.caja.movimientos.length}`, tipo: "ingreso", medio: ui.medio, monto: c.deuda, concepto: `Deuda de ${c.nombre}`, fecha: HOY, min: AHORA.min });
    toast(`${c.nombre} saldó ${M.pesos(c.deuda)} (${M.MEDIOS[ui.medio]}).`);
    c.deuda = 0; render();
  },
  perdonar: (b) => { M.cliente(E, b.dataset.v).strikes = 0; render(); },

  // dueño
  ingreso: (b) => { const p = M.producto(E, b.dataset.v); const n = Math.round(Number($(`#in-${p.id}`).value)); if (!(n > 0)) return toast("Poné cuántos entran."); p.stock += n; toast(`Entraron ${n} × ${p.nombre}.`); render(); },
};

function ofrecer(ofertas) {
  if (!ofertas?.length) return;
  const o = ofertas[0];
  abrir({
    titulo: "Se liberó un hueco",
    sub: `${esc(M.cancha(E, o.canchaId).nombre)} ${M.hhmm(o.inicio)} — ${ofertas.length} en lista de espera lo aceptarían`,
    cuerpo: `<p class="small" style="margin:0">Primero en la lista: <b>${esc(o.titular)}</b></p><div class="wa">${esc(o.mensaje)}</div>`,
    pie: `<button type="button" class="btn" data-a="cerrar">Ahora no</button><a class="btn" target="_blank" rel="noopener" href="${esc(wa(o.mensaje))}">Mandar por WhatsApp</a><button type="button" class="btn primary" data-a="asignarEspera" data-v="${o.id}" data-c="${o.canchaId}" data-m="${o.inicio}">Dijo que sí: reservar</button>`,
  });
}

// Inputs de reglas (dueño): cambian la política en vivo.
document.addEventListener("change", (ev) => {
  const t = ev.target;
  if (!(t instanceof HTMLInputElement)) return;
  const v = Number(t.value);
  if (!(v >= 0)) return;
  if (t.dataset.a === "regla") { E.config.politica[t.dataset.v] = v; toast("Regla actualizada."); render(); }
  if (t.dataset.a === "tarifa") { E.config.tarifas[Number(t.dataset.v)].precioHora = v; toast("Precio actualizado para turnos nuevos."); render(); }
  if (t.dataset.a === "socio") { E.config.descuentoSocioPct = Math.min(100, v); toast("Descuento de socio actualizado."); render(); }
});

document.addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-a]");
  if (!b || b.tagName === "INPUT" || b.disabled) return;
  const fn = acciones[b.dataset.a];
  if (typeof fn === "function") { ev.preventDefault(); fn(b); }
});

$("#dlg").addEventListener("close", () => { dialogoActual = null; });

try { const t = localStorage.getItem("bp-tema"); if (t) document.documentElement.dataset.theme = t; } catch { /* sin almacenamiento */ }
iniciar();
