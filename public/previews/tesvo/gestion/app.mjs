// GESTIÓN — TESVO Importaciones y Exportaciones (demo del flujo). Toda la regla de negocio vive en motor.mjs;
// este archivo sólo pinta y conecta botones. Sin persistencia: el estado vive en memoria y se rearma al recargar.
import * as M from "./motor.mjs";

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const pad = (n) => String(n).padStart(2, "0");
const hoyLocal = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const ddmm = (f) => (f ? `${Number(f.slice(8))}/${Number(f.slice(5, 7))}` : "—");
const parseUsd = (v) => { const n = Number(String(v ?? "").replace(/\./g, "").replace(",", ".")); return Number.isFinite(n) ? Math.round(n * 100) : NaN; };
const parseNum = (v) => { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : NaN; };
const usdInput = (c) => (c / 100).toFixed(2).replace(".", ",");
const ruta = (t) => `${M.ORIGENES[t.origen]} · ${M.VIAS[t.via].toLowerCase()}`;
const rutaDe = (x) => ruta(M.tarifa(E, x.tarifaId) ?? x);
const conPesos = (c, tc = E.config.tipoCambio) => `${M.usd(c)} <span class="ayuda" style="display:inline">≈ ${M.pesos(M.aPesos(c, tc))}</span>`;

let E, HOY, USUARIO = "u-sole", TAB = "hoy";
const ui = {
  bandeja: null, // "mio" | "todo" (null = según el rol)
  filtro: "activos",
  busca: "",
  cot: null,
  partir: null,
  recepcion: null,
};

const TABS = [
  { id: "hoy", nombre: "Hoy", roles: ["atencion", "deposito", "duenio"] },
  { id: "envios", nombre: "Envíos", roles: ["atencion", "deposito", "duenio"] },
  { id: "cotizar", nombre: "Cotizar", roles: ["atencion", "duenio"] },
  { id: "deposito", nombre: "Depósito", roles: ["deposito", "duenio"] },
  { id: "embarques", nombre: "Embarques y aduana", roles: ["atencion", "deposito", "duenio"] },
  { id: "clientes", nombre: "Clientes", roles: ["atencion", "duenio"] },
  { id: "caja", nombre: "Caja", roles: ["atencion", "duenio"] },
  { id: "tablero", nombre: "Tablero", roles: ["duenio"] },
  { id: "ajustes", nombre: "Tarifas y régimen", roles: ["duenio"] },
];

const yo = () => M.usuario(E, USUARIO);
const puedo = (accion) => M.puede(E, USUARIO, accion);
const auth = (pin) => ({ usuarioId: USUARIO, pin });
const tabsDelRol = () => TABS.filter((t) => t.roles.includes(yo()?.rol));

function cotVacia() {
  return { clienteId: "", contacto: "", tarifaId: "miami-aereo", regimen: "courier", items: [{ descripcion: "", valor: "", unidades: "1", categoria: "general" }], kg: "", l: "", a: "", h: "", seguro: false };
}

function iniciar() {
  HOY = hoyLocal();
  E = M.generarDemo(HOY);
  ui.cot = cotVacia();
  const sel = $("#usuario");
  sel.innerHTML = E.usuarios.map((u) => `<option value="${u.id}">${esc(u.nombre)} · ${esc(M.ROLES[u.rol])}</option>`).join("");
  sel.value = USUARIO;
  sel.addEventListener("change", () => { USUARIO = sel.value; ui.bandeja = null; if (!tabsDelRol().some((t) => t.id === TAB)) TAB = "hoy"; render(); toast(`Ahora usa ${yo().nombre} (${M.ROLES[yo().rol]}).`); });
  const pedido = location.hash.slice(1);
  if (TABS.some((t) => t.id === pedido)) TAB = pedido;
  addEventListener("hashchange", () => { const h = location.hash.slice(1); if (TABS.some((t) => t.id === h) && h !== TAB) irTab(h, false); });
  document.addEventListener("click", alClic);
  document.addEventListener("input", alEscribir);
  document.addEventListener("change", alCambiar);
  document.addEventListener("submit", (ev) => { ev.preventDefault(); const a = ev.target.dataset.a; if (a && acciones[a]) acciones[a](ev.target.dataset, ev.target); });
  render();
}

// ───────────────────────── pintar ─────────────────────────

function render() {
  const tabs = tabsDelRol();
  const cuenta = M.bandeja(E, HOY).filter((x) => esMio(x)).length;
  $("#pestanas").innerHTML = tabs.map((t) => `<button type="button" data-a="tab" data-v="${t.id}" ${t.id === TAB ? 'aria-current="page"' : ""}>${esc(t.nombre)}${t.id === "hoy" && cuenta ? `<span class="cuenta" aria-label="${cuenta} pendientes">${cuenta}</span>` : ""}</button>`).join("");
  const vistas = { hoy: vistaHoy, envios: vistaEnvios, cotizar: vistaCotizar, deposito: vistaDeposito, embarques: vistaEmbarques, clientes: vistaClientes, caja: vistaCaja, tablero: vistaTablero, ajustes: vistaAjustes };
  $("#principal").innerHTML = (vistas[TAB] ?? vistaHoy)();
  if (TAB === "cotizar") pintarCotizacion();
}

function irTab(id, conHash = true) {
  TAB = id;
  if (conHash) history.replaceState(null, "", `#${id}`);
  render();
  $("#principal").focus({ preventScroll: true });
  scrollTo({ top: 0 });
}

const esMio = (x) => {
  const rol = yo()?.rol;
  if (rol === "duenio") return true;
  return x.rol === rol;
};

// ── Hoy: la bandeja ──

const ICONOS = { prohibido: "!", observado: "AD", sin_duenio: "?", dano: "×", peso: "kg", saldo: "$", almacenaje: "d", demora: "⏱", cotizacion: "Q", devolucion: "↩", embarcable: "✓" };
const CLASE = { prohibido: "urgente", observado: "urgente", demora: "urgente", sin_duenio: "urgente", saldo: "plata", peso: "plata", devolucion: "plata", embarcable: "ok" };

function vistaHoy() {
  const rol = yo().rol;
  const modo = ui.bandeja ?? (rol === "duenio" ? "todo" : "mio");
  const todos = M.bandeja(E, HOY);
  const lista = modo === "mio" ? todos.filter(esMio) : todos;
  const t = M.tablero(E, HOY);
  const saludo = rol === "deposito" ? "Lo que hay en el depósito y los embarques" : rol === "atencion" ? "Lo que tenés que resolver con los clientes" : "Todo lo que está pidiendo una decisión";
  return `
  <h1>Hoy</h1>
  <p class="bajada">${esc(saludo)}. Lo más urgente arriba; cada cosa con su acción a un toque.</p>
  <div class="kpis">
    <div class="kpi destacado"><div class="l">Para resolver</div><div class="v">${lista.length}</div><div class="s">${todos.filter((x) => x.urgente || CLASE[x.tipo] === "urgente").length} urgentes</div></div>
    <div class="kpi"><div class="l">Envíos en curso</div><div class="v">${t.activos}</div><div class="s">${t.porEstado.en_deposito} en depósito · ${t.porEstado.en_transito} en viaje</div></div>
    <div class="kpi"><div class="l">En aduana</div><div class="v">${t.porEstado.en_aduana}</div><div class="s">${t.observadosPct}% observados en el año</div></div>
    <div class="kpi"><div class="l">Por cobrar</div><div class="v">${M.usd(t.porCobrar)}</div><div class="s">≈ ${M.pesos(M.aPesos(t.porCobrar, E.config.tipoCambio))} · dólar ${M.pesos(E.config.tipoCambio)}</div></div>
  </div>
  ${rol !== "duenio" ? `<div class="chips" role="group" aria-label="Qué mostrar">
    <button type="button" data-a="bandeja" data-v="mio" aria-pressed="${modo === "mio"}">Lo mío (${todos.filter(esMio).length})</button>
    <button type="button" data-a="bandeja" data-v="todo" aria-pressed="${modo === "todo"}">Todo (${todos.length})</button>
  </div>` : ""}
  ${lista.length ? `<ul class="bandeja">${lista.map(itemBandeja).join("")}</ul>` : `<div class="panel vacio">No hay nada pendiente para vos. 🙌</div>`}`;
}

function itemBandeja(x) {
  const clase = x.urgente ? "urgente" : CLASE[x.tipo] ?? "";
  const e = x.envioId ? M.envio(E, x.envioId) : null;
  const p = x.paqueteId ? M.paquete(E, x.paqueteId) : null;
  const b = [];
  const wa = (tipo, extra) => e ? botonWa(M.mensaje(tipo, E, e, extra)) : "";
  switch (x.tipo) {
    case "prohibido":
      if (e) b.push(wa("prohibido", { tracking: p.tracking, contenido: p.contenido || M.CATEGORIAS[p.categoria] }));
      if (puedo("asignar")) b.push(`<button class="b chico" data-a="prohibido" data-id="${p.id}" data-v="devolver">Vuelve al vendedor</button><button class="b chico" data-a="prohibido" data-id="${p.id}" data-v="descartar">Se descarta</button>`);
      break;
    case "observado":
      b.push(wa("observado"));
      if (puedo("aduana")) b.push(`<button class="b chico" data-a="resolverObs" data-id="${e.id}">Ya mandó lo que pidieron</button>`);
      break;
    case "sin_duenio":
      if (puedo("asignar")) b.push(`<button class="b chico primario" data-a="asignarDlg" data-id="${p.id}">Asignar a un envío</button>`);
      break;
    case "dano":
      b.push(wa("dano", { tracking: p.tracking }));
      if (puedo("avisar")) b.push(`<button class="b chico" data-a="dano" data-id="${p.id}" data-v="seguir">Sigue igual</button><button class="b chico" data-a="dano" data-id="${p.id}" data-v="devolver">Se reclama al vendedor</button>`);
      break;
    case "peso": {
      const d = M.diferenciaDePeso(E, e.id, HOY);
      b.push(wa("peso", { real: M.kg(d.cobrado), cotizado: M.kg(d.cotizado), monto: M.usd(d.centavos) }));
      if (puedo("cotizar")) b.push(`<button class="b chico primario" data-a="ajustePeso" data-id="${e.id}">Aplicar ${d.centavos > 0 ? "+" : ""}${M.usd(d.centavos)}</button>`);
      break;
    }
    case "saldo":
      b.push(wa("saldo"));
      if (puedo("cobrar")) b.push(`<button class="b chico primario" data-a="cobrarDlg" data-id="${e.id}">Cobrar</button>`);
      break;
    case "almacenaje": {
      const ps = e.paquetes.map((id) => M.paquete(E, id)).filter(Boolean);
      const peor = ps.map((q) => M.almacenaje(E, q, HOY)).sort((a, c) => c.dias - a.dias)[0];
      b.push(wa("almacenaje", { dias: peor?.dias, faltan: Math.max(0, peor?.faltan ?? 0) }));
      break;
    }
    case "demora":
      if (puedo("despachar")) b.push(`<button class="b chico primario" data-a="demoraDlg" data-id="${x.embarqueId}">Cargar la nueva fecha y avisar</button>`);
      break;
    case "cotizacion": {
      const q = E.cotizaciones.find((c) => c.id === x.cotizacionId);
      b.push(botonWa({ link: M.linkWhatsApp("", `Hola, ¿pudiste ver la cotización de TESVO por ${M.usd(q.total)}? Vale hasta el ${ddmm(q.vence)}; después la recalculamos con el dólar del día.`) }, "Recordar por WhatsApp"));
      if (puedo("confirmar")) b.push(`<button class="b chico" data-a="confirmarDlg" data-id="${q.id}">Confirmar</button>`);
      break;
    }
    case "devolucion":
      if (puedo("devolver")) b.push(`<button class="b chico primario" data-a="devolverDlg" data-id="${e.id}">Devolver (PIN del dueño)</button>`);
      else b.push(`<span class="ayuda">La devuelve el dueño con su PIN.</span>`);
      break;
    case "embarcable":
      if (puedo("embarcar")) b.push(`<button class="b chico verde" data-a="tab" data-v="embarques">Ir a embarques</button>`);
      break;
  }
  if (e) b.push(`<button class="b chico" data-a="ficha" data-id="${e.id}">Ver envío</button>`);
  return `<li class="item ${clase}">
    <span class="ico" aria-hidden="true">${ICONOS[x.tipo] ?? "·"}</span>
    <div><div class="t">${esc(x.titulo)}<span class="rol-chip">${esc(M.ROLES[x.rol] ?? "")}</span></div><div class="d">${esc(x.detalle)}</div></div>
    <div class="acciones">${b.join("")}</div>
  </li>`;
}

const botonWa = (m, texto = "WhatsApp") => `<a class="b chico wa" href="${esc(m.link)}" target="_blank" rel="noopener" aria-label="${esc(texto)}: abre WhatsApp con el mensaje listo">${esc(texto)}</a>`;

// ── Envíos ──

const FILTROS = [
  ["activos", "En curso", (e) => !["entregado", "cancelado", "cotizado"].includes(e.estado)],
  ["en_deposito", "En depósito", (e) => e.estado === "en_deposito" || e.estado === "esperando" || e.estado === "confirmado"],
  ["viaje", "En viaje", (e) => e.estado === "embarcado" || e.estado === "en_transito"],
  ["en_aduana", "En aduana", (e) => e.estado === "en_aduana"],
  ["listo", "Para entregar", (e) => e.estado === "listo" || e.estado === "en_reparto"],
  ["entregado", "Entregados", (e) => e.estado === "entregado"],
  ["cancelado", "Cancelados", (e) => e.estado === "cancelado"],
  ["todos", "Todos", () => true],
];

function vistaEnvios() {
  const f = FILTROS.find((x) => x[0] === ui.filtro) ?? FILTROS[0];
  const q = ui.busca.trim().toLowerCase();
  const lista = E.envios.filter(f[2]).filter((e) => {
    if (!q) return true;
    const c = M.cliente(E, e.clienteId);
    const tracks = [...(e.prealertas ?? []).map((p) => p.tracking), ...e.paquetes.map((id) => M.paquete(E, id)?.tracking)].join(" ");
    return `${e.codigo} ${c?.nombre} ${c?.casilla} ${tracks}`.toLowerCase().includes(q);
  });
  return `
  <h1>Envíos</h1>
  <p class="bajada">Cada envío es una operación puerta a puerta: nace cuando el cliente confirma una cotización y termina en su casa.</p>
  <div class="fila" style="margin-bottom:var(--s3)">
    <label class="f" style="flex:1;min-width:220px">Buscar<input type="search" data-in="busca" value="${esc(ui.busca)}" placeholder="Código, cliente, casilla o tracking"></label>
  </div>
  <div class="chips" role="group" aria-label="Filtrar por estado">${FILTROS.map(([id, nombre, fn]) => `<button type="button" data-a="filtro" data-v="${id}" aria-pressed="${ui.filtro === id}">${nombre} (${E.envios.filter(fn).length})</button>`).join("")}</div>
  ${tablaEnvios(lista)}`;
}

function tablaEnvios(lista) {
  if (!lista.length) return `<div class="panel vacio">No hay envíos con ese filtro.</div>`;
  return `<div class="tabla"><table>
    <caption class="sr">Envíos</caption>
    <thead><tr><th>Código</th><th>Cliente</th><th>Ruta</th><th>Estado</th><th class="n">Total</th><th class="n">Saldo</th></tr></thead>
    <tbody>${lista.map((e) => {
      const c = M.cliente(E, e.clienteId);
      const saldo = e.estado === "cancelado" ? 0 : M.saldoEnvio(e);
      const marcas = [e.desvio?.tipo === "observado" && !e.desvio.resuelto ? "observado" : "", e.retenerHasta && HOY < e.retenerHasta ? "espera compras" : ""].filter(Boolean);
      return `<tr class="clic" data-a="ficha" data-id="${e.id}">
        <td><button type="button" class="codigo" data-a="ficha" data-id="${e.id}" style="background:none;border:0;padding:0;cursor:pointer;text-decoration:underline">${e.codigo}</button></td>
        <td>${esc(c?.nombre)}<div class="ayuda">${esc(c?.casilla)} · ${esc(M.REGIMENES[e.regimen])}</div></td>
        <td>${esc(rutaDe(e))}</td>
        <td><span class="estado e-${e.estado}">${esc(M.ESTADOS[e.estado])}</span>${marcas.map((m) => `<div class="marca">${esc(m)}</div>`).join("")}</td>
        <td class="n">${M.usd(M.totalEnvio(e))}</td>
        <td class="n">${saldo > 50 ? M.usd(saldo) : "—"}</td>
      </tr>`;
    }).join("")}</tbody></table></div>`;
}

function fichaEnvio(id) {
  const e = M.envio(E, id);
  if (!e) return;
  const c = M.cliente(E, e.clienteId);
  const q = e.cotizacion;
  const tc = M.tcParaCobrar(E, e);
  const idx = M.LINEA.indexOf(e.estado);
  const linea = `<ol class="linea" aria-label="Recorrido">${M.LINEA.map((k, i) => {
    const ev = e.eventos.find((x) => x.estado === k);
    const cls = e.estado === "cancelado" ? (ev ? "hecho" : "") : i < idx ? "hecho" : i === idx ? "actual" : "";
    return `<li class="${cls}">${esc(M.ESTADOS[k])}<br>${ev ? ddmm(ev.fecha) : ""}</li>`;
  }).join("")}</ol>`;
  const filas = [
    ["Mercadería (valor declarado)", q.valor],
    [`Flete ${q.pesoCobradoGramos ? `(${M.kg(q.pesoCobradoGramos)} cobrados)` : q.cbmMilesimas ? `(${(q.cbmMilesimas / 1000).toLocaleString("es-AR")} m³)` : ""}`, q.flete],
    q.seguro ? ["Seguro", q.seguro] : null,
    ["Honorario TESVO", q.honorario],
    ["Manejo por paquete", q.manejo],
    q.despachante ? ["Despachante", q.despachante] : null,
    q.impuestos ? [`Impuestos estimados ${q.impuestos.conFranquicia ? "(con franquicia)" : "(sin franquicia)"}`, q.impuestos.total] : null,
    ...e.ajustes.map((a) => [`${a.texto}`, a.centavos]),
  ].filter(Boolean);
  const totalServicio = M.totalEnvio(e);
  const desglose = `<table class="desglose"><tbody>
    <tr><td>${esc(filas[0][0])}</td><td class="n ayuda">${M.usd(filas[0][1])} <span class="sr">(lo paga el cliente al vendedor)</span></td></tr>
    ${filas.slice(1).map(([l, v]) => `<tr><td>${esc(l)}</td><td class="n">${M.usd(v)}</td></tr>`).join("")}
    <tr class="total"><td>Total TESVO</td><td class="n">${M.usd(totalServicio)}</td></tr>
    <tr><td>Pagado</td><td class="n">${M.usd(M.pagadoEnvio(e))}</td></tr>
    <tr><td><b>Saldo</b> ${e.tcCongelado ? `<span class="ayuda" style="display:inline">dólar congelado ${M.pesos(e.tcCongelado)}</span>` : `<span class="ayuda" style="display:inline">al dólar del día</span>`}</td><td class="n"><b>${e.estado === "cancelado" ? "—" : conPesos(Math.max(0, M.saldoEnvio(e)), tc)}</b></td></tr>
  </tbody></table>`;
  const paquetes = e.paquetes.map((pid) => M.paquete(E, pid)).filter(Boolean);
  const pendientes = (e.prealertas ?? []).filter((x) => !paquetes.some((p) => p.tracking === x.tracking));
  const bloqPaq = `<h3>Paquetes</h3>${paquetes.length || pendientes.length ? `<ul class="avisos">${paquetes.map((p) => {
    const a = M.almacenaje(E, p, HOY);
    return `<li class="${p.danado && !p.danoResuelto ? "grave" : "bien"}"><span class="codigo">${esc(p.tracking)}</span> · ${M.kg(p.gramos)}${p.medidas ? ` · ${p.medidas.l}×${p.medidas.a}×${p.medidas.h} cm` : ""} · recibido ${ddmm(p.recibido)}${p.salio ? ` · salió ${ddmm(p.salio)}` : ` · ${a.dias} días en depósito`}${p.danado ? (p.danoResuelto ? " · daño resuelto" : " · llegó dañado") : ""}</li>`;
  }).join("")}${pendientes.map((x) => `<li><span class="codigo">${esc(x.tracking)}</span> · ${esc(x.tienda || "")} · avisado, todavía no llegó</li>`).join("")}</ul>` : `<p class="ayuda">Todavía no avisó ninguna compra.</p>`}`;
  const novedades = `<h3>Novedades</h3><ul class="avisos">${e.eventos.slice().reverse().slice(0, 6).map((x) => `<li class="bien">${ddmm(x.fecha)} · ${esc(x.texto)}</li>`).join("")}</ul>`;

  const acc = [];
  const mens = { esperando: "saldo", en_transito: "salio", listo: "listo", en_reparto: "reparto" }[e.estado];
  if (mens) acc.push(botonWa(M.mensaje(mens, E, e), "Avisar por WhatsApp"));
  if (puedo("cobrar") && e.estado !== "cancelado" && M.saldoEnvio(e) > 50) acc.push(`<button class="b" data-a="cobrarDlg" data-id="${e.id}">Cobrar</button>`);
  if (["confirmado", "esperando", "en_deposito"].includes(e.estado)) acc.push(`<button class="b" data-a="prealertaDlg" data-id="${e.id}">Avisar una compra</button>`);
  if (["esperando", "en_deposito"].includes(e.estado)) acc.push(`<button class="b" data-a="retenerDlg" data-id="${e.id}">Esperar más compras</button>`);
  if (e.estado === "en_aduana" && puedo("aduana")) {
    if (e.desvio?.tipo === "observado" && !e.desvio.resuelto) acc.push(`<button class="b" data-a="resolverObs" data-id="${e.id}">Resolver observación</button>`);
    else acc.push(`<button class="b primario" data-a="liberarDlg" data-id="${e.id}">Liberar</button><button class="b" data-a="observarDlg" data-id="${e.id}">Observado</button>`);
  }
  if ((e.estado === "listo" || e.estado === "en_reparto") && puedo("entregar")) {
    if (e.estado === "listo" && !e.retiroEnOficina) acc.push(`<button class="b primario" data-a="entregar" data-id="${e.id}" data-v="domicilio">Sale a reparto</button>`);
    if (e.estado === "en_reparto") acc.push(`<button class="b primario" data-a="entregar" data-id="${e.id}" data-v="domicilio">Entregado</button><button class="b" data-a="fallida" data-id="${e.id}">No había nadie</button>`);
    acc.push(`<button class="b" data-a="entregar" data-id="${e.id}" data-v="oficina">Retira en la oficina</button>`);
  }
  if (puedo("bonificar") && e.estado !== "cancelado") acc.push(`<button class="b" data-a="bonificarDlg" data-id="${e.id}">Bonificar</button>`);
  if (puedo("cancelar") && ["confirmado", "esperando", "en_deposito"].includes(e.estado)) acc.push(`<button class="b peligro" data-a="cancelarDlg" data-id="${e.id}">Cancelar envío</button>`);

  const seg = M.seguimiento(E, e.codigo);
  abrir({
    titulo: `${e.codigo}`,
    sub: `${c?.nombre} · ${c?.casilla} · ${rutaDe(e)} · ${M.REGIMENES[e.regimen]}`,
    cuerpo: `
      <span class="estado e-${e.estado}">${esc(M.ESTADOS[e.estado])}</span>
      ${e.desvio?.tipo === "observado" && !e.desvio.resuelto ? `<ul class="avisos"><li class="grave">Aduana: ${esc(e.desvio.motivo)} · pide ${esc(e.desvio.pide)} antes del ${ddmm(e.desvio.vence)}</li></ul>` : ""}
      ${e.devolucionPendiente > 0 ? `<ul class="avisos"><li>Seña a devolver: ${M.usd(e.devolucionPendiente)}</li></ul>` : ""}
      ${linea}
      <div class="dos" style="margin-top:var(--s4)">
        <div><h3>Cuenta</h3>${desglose}</div>
        <div>${bloqPaq}${novedades}</div>
      </div>
      <h3 style="margin-top:var(--s4)">Lo que ve el cliente en la web</h3>
      <p class="ayuda">Con el código ${esc(e.codigo)} ve el recorrido${seg.llegadaEstimada ? ` y la llegada estimada (${ddmm(seg.llegadaEstimada)})` : ""}, nunca montos ni datos de otros clientes.</p>`,
    pie: acc.join("") || `<span class="ayuda">Nada para hacer con tu rol en este estado.</span>`,
    ancho: true,
  });
}

// ── Cotizar ──

function vistaCotizar() {
  const c = ui.cot;
  const opcTarifas = E.tarifas.map((t) => `<option value="${t.id}" ${t.id === c.tarifaId ? "selected" : ""}>${esc(ruta(t))} (${t.dias[0]}–${t.dias[1]} días)</option>`).join("");
  const t = M.tarifa(E, c.tarifaId);
  const opcReg = t.regimenes.map((r) => `<option value="${r}" ${r === c.regimen ? "selected" : ""}>${esc(M.REGIMENES[r])}</option>`).join("");
  const abiertas = E.cotizaciones.filter((q) => q.estado === "abierta");
  return `
  <h1>Cotizar</h1>
  <p class="bajada">Lo que el cliente pregunta por WhatsApp, respondido con el número completo: flete, honorario, impuestos estimados y avisos del régimen antes de que compre.</p>
  <div class="dos">
    <form class="panel" data-a="guardarCot" aria-label="Datos de la cotización">
      <div class="campos">
        <label class="f">Cliente<select data-cot="clienteId"><option value="">Consulta (sin ficha)</option>${E.clientes.map((x) => `<option value="${x.id}" ${x.id === c.clienteId ? "selected" : ""}>${esc(x.nombre)} · ${esc(x.casilla)}</option>`).join("")}</select></label>
        ${c.clienteId ? "" : `<label class="f">Quién consulta<input data-cot="contacto" value="${esc(c.contacto)}" placeholder="Nombre o «WhatsApp de…»"></label>`}
        <label class="f">Desde dónde y cómo<select data-cot="tarifaId">${opcTarifas}</select></label>
        <label class="f">Régimen<select data-cot="regimen">${opcReg}</select></label>
      </div>
      <h3 style="margin-top:var(--s4)">Qué trae</h3>
      ${c.items.map((it, i) => `<div class="campos" style="margin-bottom:var(--s2)">
        <label class="f">Producto<input data-cot="item.${i}.descripcion" value="${esc(it.descripcion)}" placeholder="Ej.: notebook"></label>
        <label class="f">Valor (US$)<input data-cot="item.${i}.valor" value="${esc(it.valor)}" inputmode="decimal" placeholder="0,00"></label>
        <label class="f">Unidades<input data-cot="item.${i}.unidades" value="${esc(it.unidades)}" inputmode="numeric"></label>
        <label class="f">Tipo<select data-cot="item.${i}.categoria">${Object.entries(M.CATEGORIAS).map(([k, v]) => `<option value="${k}" ${k === it.categoria ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></label>
        ${c.items.length > 1 ? `<button type="button" class="b chico" data-a="quitarItem" data-v="${i}" aria-label="Quitar ${esc(it.descripcion || `producto ${i + 1}`)}">Quitar</button>` : ""}
      </div>`).join("")}
      <button type="button" class="b chico" data-a="sumarItem">+ Otro producto</button>
      <h3 style="margin-top:var(--s4)">Cuánto pesa y mide la caja</h3>
      <div class="campos">
        ${t.porCbmCentavos ? "" : `<label class="f">Peso (kg)<input data-cot="kg" value="${esc(c.kg)}" inputmode="decimal" placeholder="0,0"></label>`}
        <label class="f">Largo (cm)<input data-cot="l" value="${esc(c.l)}" inputmode="numeric"></label>
        <label class="f">Ancho (cm)<input data-cot="a" value="${esc(c.a)}" inputmode="numeric"></label>
        <label class="f">Alto (cm)<input data-cot="h" value="${esc(c.h)}" inputmode="numeric"></label>
      </div>
      <label class="f chk"><input type="checkbox" data-cot="seguro" ${c.seguro ? "checked" : ""}> Con seguro (${Math.round(E.config.seguroTasa * 1000) / 10}% del valor)</label>
      <div class="fila" style="margin-top:var(--s4)">
        <button class="b primario" type="submit">Guardar cotización</button>
        <button class="b" type="button" data-a="partir">Partir para ahorrar</button>
        <button class="b" type="button" data-a="limpiarCot">Empezar de nuevo</button>
      </div>
    </form>
    <section class="panel" aria-live="polite" aria-label="Resultado"><div id="cot-resultado"></div></section>
  </div>
  <h2 style="margin-top:var(--s6)">Cotizaciones abiertas</h2>
  ${abiertas.length ? `<div class="tabla"><table><thead><tr><th>Para</th><th>Ruta</th><th class="n">Total</th><th>Vence</th><th></th></tr></thead><tbody>
    ${abiertas.map((q) => `<tr><td>${esc(q.clienteId ? M.cliente(E, q.clienteId)?.nombre : q.contacto)}</td><td>${esc(rutaDe(q))}</td><td class="n">${M.usd(q.total)}</td><td>${M.cotizacionVencida(q, HOY) ? `<span class="marca">venció ${ddmm(q.vence)}</span>` : ddmm(q.vence)}</td>
      <td><div class="fila">${botonWa({ link: M.linkWhatsApp("", textoCotizacion(q)) }, "Mandar")}${puedo("confirmar") ? `<button class="b chico primario" data-a="confirmarDlg" data-id="${q.id}">Confirmar</button>` : ""}</div></td></tr>`).join("")}
  </tbody></table></div>` : `<div class="panel vacio">No hay cotizaciones abiertas.</div>`}`;
}

function pedidoDesdeForm() {
  const c = ui.cot;
  const medidas = [c.l, c.a, c.h].every((v) => parseNum(v) > 0) ? { l: parseNum(c.l), a: parseNum(c.a), h: parseNum(c.h) } : null;
  return {
    tarifaId: c.tarifaId,
    regimen: c.regimen,
    clienteId: c.clienteId || undefined,
    items: c.items.map((it) => ({ descripcion: it.descripcion.trim() || "Producto", valorCentavos: parseUsd(it.valor), unidades: Math.max(1, Math.round(parseNum(it.unidades)) || 1), categoria: it.categoria })).filter((it) => it.valorCentavos > 0),
    gramos: parseNum(c.kg) > 0 ? Math.round(parseNum(c.kg) * 1000) : 0,
    medidas,
    seguro: c.seguro,
  };
}

function textoCotizacion(q) {
  const lineas = [
    `Cotización TESVO — ${ruta(M.tarifa(E, q.tarifaId) ?? q)} (${q.dias[0]} a ${q.dias[1]} días)`,
    `Flete: ${M.usd(q.flete)}`,
    q.seguro ? `Seguro: ${M.usd(q.seguro)}` : "",
    `Honorario y manejo: ${M.usd(q.honorario + q.manejo)}`,
    q.despachante ? `Despachante: ${M.usd(q.despachante)}` : "",
    q.impuestos ? `Impuestos estimados: ${M.usd(q.impuestos.total)} (los liquida la aduana)` : "",
    `Total: ${M.usd(q.total)} ≈ ${M.pesos(q.totalPesos)} al dólar de hoy`,
    `Con la seña del ${Math.round(E.config.senaTasa * 100)}% te congelamos el dólar. Vale hasta el ${ddmm(q.vence ?? M.sumarDias(HOY, E.config.validezCotizacionDias))}.`,
  ];
  return lineas.filter(Boolean).join("\n");
}

function pintarCotizacion() {
  const caja = $("#cot-resultado");
  if (!caja) return;
  const p = pedidoDesdeForm();
  if (!p.items.length) { caja.innerHTML = `<h2>Resultado</h2><p class="ayuda">Cargá al menos un producto con su valor en dólares.</p>`; return; }
  const r = M.cotizar(E, p);
  if (!r.ok) { caja.innerHTML = `<h2>Resultado</h2><ul class="avisos"><li class="grave">${esc(r.motivo)}</li></ul>`; return; }
  const q = r.cotizacion;
  const filas = [
    ["Flete" + (q.pesoCobradoGramos ? ` (${M.kg(q.pesoCobradoGramos)} cobrados${p.gramos && q.pesoCobradoGramos > p.gramos ? ", por volumen" : ""})` : q.cbmMilesimas ? ` (${(q.cbmMilesimas / 1000).toLocaleString("es-AR")} m³)` : ""), q.flete],
    q.seguro ? ["Seguro", q.seguro] : null,
    ["Honorario TESVO", q.honorario],
    ["Manejo por paquete", q.manejo],
    q.despachante ? ["Despachante", q.despachante] : null,
    q.impuestos ? [`Derechos y tasa de estadística`, q.impuestos.derechos + q.impuestos.tasa] : null,
    q.impuestos ? ["IVA", q.impuestos.iva] : null,
  ].filter(Boolean);
  let partir = "";
  if (ui.partir) {
    const cupo = p.clienteId ? M.cupoCourier(E, p.clienteId) : null;
    const pr = M.partirParaAhorrar(E, p.items, { cupo: cupo?.aplica ? cupo.quedan : 5, fleteCentavosPorEnvio: Math.round(q.flete / Math.max(1, p.items.length)) });
    partir = pr.ok ? `<h3 style="margin-top:var(--s4)">Partido en ${pr.grupos.length} envío(s)</h3>
      <ul class="avisos">${pr.grupos.map((g, i) => `<li class="bien">Envío ${i + 1}: ${g.items.map((x) => esc(x.descripcion)).join(", ")} · ${M.usd(g.valor)} · impuestos ${M.usd(g.impuestos)}</li>`).join("")}
      <li class="${pr.ahorro > 0 ? "bien" : ""}">${pr.ahorro == null ? "Junto no entra en el courier." : pr.ahorro > 0 ? `Ahorra ${M.usd(pr.ahorro)} en impuestos (suma ${M.usd(pr.fletesExtra)} de fletes y manejo extra).` : "Partirlo no ahorra: conviene mandar todo junto."}</li>
      <li>Usa ${pr.grupos.length} de los envíos con franquicia del año. El despachante valida que sean compras distintas.</li></ul>`
      : `<ul class="avisos"><li class="grave">${esc(pr.motivo)}</li></ul>`;
  }
  caja.innerHTML = `<h2>Resultado</h2>
    <table class="desglose"><tbody>
      <tr><td class="ayuda">Mercadería (la paga el cliente al vendedor)</td><td class="n ayuda">${M.usd(q.valor)}</td></tr>
      ${filas.map(([l, v]) => `<tr><td>${esc(l)}</td><td class="n">${M.usd(v)}</td></tr>`).join("")}
      <tr class="total"><td>Total TESVO</td><td class="n">${M.usd(q.total)}</td></tr>
      <tr><td class="ayuda">Al dólar de hoy (${M.pesos(q.tipoCambio)})</td><td class="n">${M.pesos(q.totalPesos)}</td></tr>
      <tr><td class="ayuda">Seña para congelar el dólar (${Math.round(E.config.senaTasa * 100)}%)</td><td class="n">${M.usd(Math.round(q.total * E.config.senaTasa))}</td></tr>
    </tbody></table>
    <ul class="avisos">${r.avisos.map((a) => `<li class="${a.grave ? "grave" : a.tipo === "franquicia" ? "bien" : ""}">${esc(a.texto)}</li>`).join("") || `<li class="bien">Sin observaciones del régimen.</li>`}</ul>
    <p class="ayuda">Llega en ${q.dias[0]} a ${q.dias[1]} días desde que sale. Impuestos estimados: los liquida la aduana.</p>
    ${partir}
    <div class="fila" style="margin-top:var(--s3)">${botonWa({ link: M.linkWhatsApp("", textoCotizacion(q)) }, "Mandar por WhatsApp")}</div>`;
}

// ── Depósito ──

function vistaDeposito() {
  const r = ui.recepcion;
  const enDep = E.paquetes.filter((p) => !p.salio && !p.devuelto);
  return `
  <h1>Depósito</h1>
  <p class="bajada">Recibir es pesar, medir y sacar la foto. El sistema busca al dueño por el tracking avisado o por la casilla de la etiqueta; si no lo encuentra, queda en la bandeja y no se embarca.</p>
  <div class="dos">
    <form class="panel" data-a="recibir" aria-label="Recibir paquete">
      <h2>Recibir un paquete</h2>
      <div class="campos">
        <label class="f">Tracking de la etiqueta<input name="tracking" required autocomplete="off" placeholder="Escaneá o tipeá"></label>
        <label class="f">Peso (kg)<input name="kg" required inputmode="decimal" placeholder="0,0"></label>
        <label class="f">Largo (cm)<input name="l" inputmode="numeric"></label>
        <label class="f">Ancho (cm)<input name="a" inputmode="numeric"></label>
        <label class="f">Alto (cm)<input name="h" inputmode="numeric"></label>
        <label class="f">Casilla escrita<input name="casilla" placeholder="TV-1001" autocomplete="off"></label>
        <label class="f">Depósito<select name="deposito">${Object.entries(M.ORIGENES).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}</select></label>
        <label class="f">Contenido<select name="categoria">${Object.entries(M.CATEGORIAS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}</select></label>
      </div>
      <label class="f" style="margin-top:var(--s3)">Qué se ve adentro (opcional)<input name="contenido" placeholder="Ej.: zapatillas, caja original"></label>
      <label class="f chk"><input type="checkbox" name="danado"> La caja llegó dañada</label>
      <p class="ayuda">Simulación de demo: la foto se toma sola al recibir. En el depósito se conecta a la balanza y a la cámara del puesto.</p>
      <button class="b primario" type="submit" style="margin-top:var(--s3)">Recibir</button>
      ${r ? `<ul class="avisos" style="margin-top:var(--s4)"><li class="${r.ok ? (r.envio ? "bien" : "") : "grave"}">${esc(r.texto)}</li></ul>` : ""}
    </form>
    <section class="panel" aria-label="Pendientes del depósito">
      <h2>Para resolver acá</h2>
      <ul class="bandeja">${M.bandeja(E, HOY).filter((x) => x.rol === "deposito" && x.tipo !== "demora").map(itemBandeja).join("") || `<li class="vacio">Nada pendiente.</li>`}</ul>
    </section>
  </div>
  <h2 style="margin-top:var(--s6)">En el depósito (${enDep.length})</h2>
  <div class="tabla"><table><thead><tr><th>Tracking</th><th>Envío</th><th>Depósito</th><th class="n">Peso</th><th class="n">Días</th><th>Estado</th></tr></thead><tbody>
    ${enDep.map((p) => {
      const e = p.envioId ? M.envio(E, p.envioId) : null;
      const a = M.almacenaje(E, p, HOY);
      const est = p.retenido === "prohibido" && !p.resueltoProhibido ? "prohibido" : !p.envioId ? "sin dueño" : p.danado && !p.danoResuelto ? "dañado" : a.cobrables > 0 ? `almacenaje ${M.usd(a.centavos)}` : "ok";
      return `<tr><td class="codigo">${esc(p.tracking)}</td><td>${e ? `<button type="button" class="codigo" data-a="ficha" data-id="${e.id}" style="background:none;border:0;padding:0;cursor:pointer;text-decoration:underline">${e.codigo}</button><div class="ayuda">${esc(M.cliente(E, e.clienteId)?.nombre)}</div>` : "—"}</td><td>${esc(M.ORIGENES[p.deposito])}</td><td class="n">${M.kg(p.gramos)}</td><td class="n">${a.dias}</td><td>${est === "ok" ? `<span class="estado e-listo">ok</span>` : `<span class="marca">${esc(est)}</span>`}</td></tr>`;
    }).join("")}
  </tbody></table></div>`;
}

// ── Embarques y aduana ──

function vistaEmbarques() {
  const orden = { armando: 0, en_transito: 1, arribado: 2, cerrado: 3 };
  const lista = E.embarques.slice().sort((a, b) => orden[a.estado] - orden[b.estado]);
  const enAduana = E.envios.filter((e) => e.estado === "en_aduana");
  return `
  <h1>Embarques y aduana</h1>
  <p class="bajada">Un embarque es un vuelo, un contenedor o un camión. Sólo sube lo que está completo, pesado, avisado y con seña; si se demora, una carga avisa a todos.</p>
  ${enAduana.length ? `<section class="panel"><h2>En aduana (${enAduana.length})</h2>${tablaAduana(enAduana)}</section>` : ""}
  ${puedo("embarcar") ? `<form class="panel" data-a="nuevoEmbarque" aria-label="Nuevo embarque">
    <h2>Abrir un embarque</h2>
    <div class="campos">
      <label class="f">Ruta<select name="tarifaId">${E.tarifas.map((t) => `<option value="${t.id}">${esc(ruta(t))}</option>`).join("")}</select></label>
      <label class="f">Guía, contenedor o carta de porte<input name="referencia" required placeholder="AWB 045-…"></label>
      <label class="f">Llegada estimada<input name="llegada" type="date" required value="${M.sumarDias(HOY, 7)}" min="${HOY}"></label>
    </div>
    <button class="b primario" type="submit" style="margin-top:var(--s3)">Abrir embarque</button>
  </form>` : ""}
  ${lista.map(tarjetaEmbarque).join("")}`;
}

function tablaAduana(lista) {
  return `<div class="tabla"><table><thead><tr><th>Envío</th><th>Cliente</th><th>Situación</th><th></th></tr></thead><tbody>
  ${lista.map((e) => {
    const obs = e.desvio?.tipo === "observado" && !e.desvio.resuelto;
    return `<tr><td><button type="button" class="codigo" data-a="ficha" data-id="${e.id}" style="background:none;border:0;padding:0;cursor:pointer;text-decoration:underline">${e.codigo}</button></td><td>${esc(M.cliente(E, e.clienteId)?.nombre)}</td>
      <td>${obs ? `<span class="marca">Observado: ${esc(e.desvio.motivo)} · vence ${ddmm(e.desvio.vence)}</span>` : "Esperando liberación"}</td>
      <td><div class="fila">${puedo("aduana") ? (obs ? botonWa(M.mensaje("observado", E, e), "Pedir documentación") + `<button class="b chico" data-a="resolverObs" data-id="${e.id}">Resuelto</button>` : `<button class="b chico primario" data-a="liberarDlg" data-id="${e.id}">Liberar</button><button class="b chico" data-a="observarDlg" data-id="${e.id}">Observado</button>`) : ""}</div></td></tr>`;
  }).join("")}</tbody></table></div>`;
}

function tarjetaEmbarque(b) {
  const t = M.tarifa(E, b.tarifaId);
  const envios = b.envios.map((id) => M.envio(E, id));
  let cuerpo = "";
  if (b.estado === "armando") {
    const candidatos = E.envios.filter((e) => e.tarifaId === b.tarifaId && e.estado === "en_deposito");
    cuerpo = `<h3>Para subir</h3>${candidatos.length ? `<ul class="avisos">${candidatos.map((e) => {
      const l = M.listoParaEmbarcar(E, e, HOY);
      return `<li class="${l.ok ? "bien" : ""}"><span class="codigo">${e.codigo}</span> · ${esc(M.cliente(E, e.clienteId)?.nombre)} · ${l.ok ? "listo" : `no sube: ${esc(l.frenos.join(", "))}`} ${l.ok && puedo("embarcar") ? `<button class="b chico verde" data-a="subir" data-id="${b.id}" data-v="${e.id}">Subir</button>` : ""}</li>`;
    }).join("")}</ul>` : `<p class="ayuda">No hay envíos de esta ruta en el depósito.</p>`}`;
  }
  const acc = [];
  if (b.estado === "armando" && puedo("despachar")) acc.push(`<button class="b primario" data-a="despacharDlg" data-id="${b.id}" ${b.envios.length ? "" : "disabled"}>Salió</button>`);
  if (b.estado === "en_transito" && puedo("despachar")) acc.push(`<button class="b" data-a="demoraDlg" data-id="${b.id}">Se demora</button><button class="b primario" data-a="arribo" data-id="${b.id}">Llegó a Argentina</button>`);
  const atrasado = b.estado === "en_transito" && b.llegada < HOY;
  return `<section class="panel">
    <div class="fila" style="justify-content:space-between">
      <div><h2 style="margin:0">${esc(b.referencia)}</h2><p class="ayuda">${esc(ruta(t))} · ${esc(M.ESTADOS_EMBARQUE[b.estado])} · ${b.salida ? `salida ${ddmm(b.salida)}` : "sin salir"} · llegada ${b.arribo ? `real ${ddmm(b.arribo)}` : `estimada ${ddmm(b.llegada)}`}${b.demoras.length ? ` (era ${ddmm(b.llegadaOriginal)})` : ""}</p>
      ${atrasado ? `<p class="marca">Pasó la fecha estimada: cargá la nueva y avisá.</p>` : ""}</div>
      <div class="fila">${acc.join("")}</div>
    </div>
    ${envios.length ? `<ul class="avisos">${envios.map((e) => `<li class="bien"><span class="codigo">${e.codigo}</span> · ${esc(M.cliente(E, e.clienteId)?.nombre)} · ${esc(M.ESTADOS[e.estado])}</li>`).join("")}</ul>` : ""}
    ${b.demoras.map((d) => `<p class="ayuda">Demora cargada el ${ddmm(d.fecha)}: ${esc(d.motivo)} (${ddmm(d.desde)} → ${ddmm(d.hasta)})</p>`).join("")}
    ${cuerpo}
  </section>`;
}

// ── Clientes ──

function vistaClientes() {
  return `
  <h1>Clientes</h1>
  <p class="bajada">Cada cliente tiene su casilla (la «dirección» que pone en la tienda) y su cupo de envíos con franquicia del año.</p>
  ${puedo("clientes") ? `<div class="fila" style="margin-bottom:var(--s4)"><button class="b primario" data-a="altaClienteDlg">+ Nuevo cliente</button></div>` : ""}
  <div class="tabla"><table><thead><tr><th>Cliente</th><th>Casilla</th><th>Tipo</th><th>Franquicia del año</th><th class="n">En curso</th><th class="n">Debe</th></tr></thead><tbody>
  ${E.clientes.map((c) => {
    const cupo = M.cupoCourier(E, c.id);
    const envios = E.envios.filter((e) => e.clienteId === c.id);
    const curso = envios.filter((e) => !["entregado", "cancelado"].includes(e.estado));
    const debe = curso.filter((e) => ["listo", "en_reparto"].includes(e.estado)).reduce((s, e) => s + Math.max(0, M.saldoEnvio(e)), 0);
    return `<tr class="clic" data-a="fichaCliente" data-id="${c.id}"><td><button type="button" data-a="fichaCliente" data-id="${c.id}" style="background:none;border:0;padding:0;cursor:pointer;text-decoration:underline;font-weight:600">${esc(c.nombre)}</button><div class="ayuda">${esc(c.doc)}</div></td><td class="codigo">${esc(c.casilla)}</td><td>${c.tipo === "pyme" ? "Empresa" : "Persona"}</td>
      <td>${cupo.aplica ? `${cupo.usados} de ${cupo.total}${cupo.quedan === 0 ? ` <span class="marca">sin franquicia</span>` : cupo.quedan === 1 ? ` <span class="marca">queda 1</span>` : ""}` : "No aplica"}</td>
      <td class="n">${curso.length}</td><td class="n">${debe > 50 ? M.usd(debe) : "—"}</td></tr>`;
  }).join("")}</tbody></table></div>`;
}

function fichaCliente(id) {
  const c = M.cliente(E, id);
  const envios = E.envios.filter((e) => e.clienteId === id);
  const cupo = M.cupoCourier(E, id);
  abrir({
    titulo: c.nombre,
    sub: `${c.casilla} · ${c.tipo === "pyme" ? "Empresa" : "Persona"} · ${c.doc}`,
    cuerpo: `<p>${cupo.aplica ? `Usó ${cupo.usados} de sus ${cupo.total} envíos con franquicia de ${HOY.slice(0, 4)}.` : "Como empresa, por courier no tiene franquicia: con despachante suele convenir."}</p>
      <h3>Dirección para comprar en Miami</h3>
      <p class="ayuda">En la tienda pone su nombre seguido de <b class="codigo">${esc(c.casilla)}</b> y la dirección del depósito de TESVO (a confirmar con TESVO).</p>
      ${tablaEnvios(envios)}`,
    pie: `${botonWa({ link: M.linkWhatsApp("", `Hola ${c.nombre.split(" ")[0]}, tu casilla en TESVO es ${c.casilla}. Cuando compres, avisanos el tracking por acá así lo recibimos con tu nombre.`) }, "Mandar su casilla")}`,
    ancho: true,
  });
}

// ── Caja ──

function vistaCaja() {
  const dia = M.cajaDelDia(E, HOY);
  const ult = E.caja.slice(0, 30);
  return `
  <h1>Caja</h1>
  <p class="bajada">Lo que entra y sale, en la moneda en que se movió. Los pesos se convierten al dólar congelado del envío (si dejó seña) o al del día.</p>
  <div class="kpis">${Object.keys(M.MEDIOS).map((k) => {
    const m = dia.porMedio[k];
    const neto = m ? m.ingresos - m.egresos : 0;
    const usdMedio = k === "usd_efectivo";
    return `<div class="kpi"><div class="l">${esc(M.MEDIOS[k])} · hoy</div><div class="v">${usdMedio ? M.usd(neto) : M.pesos(neto)}</div><div class="s">${m ? `${usdMedio ? M.usd(m.ingresos) : M.pesos(m.ingresos)} entró${m.egresos ? ` · ${usdMedio ? M.usd(m.egresos) : M.pesos(m.egresos)} salió` : ""}` : "sin movimientos"}</div></div>`;
  }).join("")}</div>
  <h2>Últimos movimientos</h2>
  <div class="tabla"><table><thead><tr><th>Fecha</th><th>Concepto</th><th>Medio</th><th class="n">Monto</th><th class="n">En dólares</th></tr></thead><tbody>
  ${ult.map((m) => {
    const e = M.envio(E, m.envioId);
    return `<tr><td>${ddmm(m.fecha)}</td><td>${m.tipo === "egreso" ? "↩ " : ""}${esc(m.concepto || (e ? `Cobro ${e.codigo}` : ""))}<div class="ayuda">${esc(M.cliente(E, e?.clienteId)?.nombre ?? "")}</div></td><td>${esc(M.MEDIOS[m.medio])}</td><td class="n">${m.tipo === "egreso" ? "-" : ""}${m.moneda === "USD" ? M.usd(m.monto) : M.pesos(m.monto)}</td><td class="n">${M.usd(m.centavos)}<div class="ayuda">dólar ${M.pesos(m.tc)}</div></td></tr>`;
  }).join("")}</tbody></table></div>`;
}

// ── Tablero del dueño ──

function vistaTablero() {
  const t = M.tablero(E, HOY);
  const max = Math.max(1, ...Object.values(t.porEstado));
  const maxRuta = Math.max(1, ...t.porRuta.map((r) => r.envios));
  return `
  <h1>Tablero</h1>
  <p class="bajada">El negocio en una pantalla: qué está en curso, qué falta cobrar, cuánto deja cada embarque y por dónde entra el trabajo.</p>
  <div class="kpis">
    <div class="kpi destacado"><div class="l">Por cobrar</div><div class="v">${M.usd(t.porCobrar)}</div><div class="s">≈ ${M.pesos(M.aPesos(t.porCobrar, E.config.tipoCambio))}</div></div>
    <div class="kpi"><div class="l">Cobrado este mes</div><div class="v">${M.usd(t.cobradoMes)}</div><div class="s">servicio facturado ${M.usd(t.facturado)}</div></div>
    <div class="kpi"><div class="l">Puerta a puerta</div><div class="v">${t.puertaAPuerta ?? "—"} días</div><div class="s">promedio de lo entregado</div></div>
    <div class="kpi"><div class="l">Cotizaciones que se confirman</div><div class="v">${t.conversion}%</div><div class="s">${t.cotizacionesAbiertas} abiertas</div></div>
    <div class="kpi"><div class="l">Observados en aduana</div><div class="v">${t.observadosPct}%</div><div class="s">de lo que pasó por aduana</div></div>
    <div class="kpi"><div class="l">Paquetes sin dueño</div><div class="v">${t.sinDuenio}</div><div class="s">no se embarcan hasta asignarlos</div></div>
  </div>
  <div class="dos">
    <section class="panel"><h2>Dónde están los envíos</h2><div class="barras">${M.LINEA.map((k) => `<div class="barra-h"><span>${esc(M.ESTADOS[k])}</span><span class="riel" role="img" aria-label="${t.porEstado[k]} envíos"><span style="width:${(t.porEstado[k] * 100) / max}%"></span></span><b class="n">${t.porEstado[k]}</b></div>`).join("")}</div></section>
    <section class="panel"><h2>Por ruta</h2><div class="barras">${t.porRuta.map((r) => `<div class="barra-h"><span>${esc(M.ORIGENES[r.origen])} ${esc(M.VIAS[r.via].toLowerCase())}</span><span class="riel" role="img" aria-label="${r.envios} envíos"><span style="width:${(r.envios * 100) / maxRuta}%"></span></span><b class="n">${r.envios}</b></div>`).join("")}</div></section>
  </div>
  <section class="panel" style="margin-top:var(--s4)"><h2>Margen de flete por embarque</h2>
    <p class="ayuda">Lo que se le cobró de flete a los clientes contra lo que costó de verdad la guía, el contenedor o el camión.</p>
    <div class="tabla"><table><thead><tr><th>Embarque</th><th class="n">Cobrado</th><th class="n">Costó</th><th class="n">Margen</th></tr></thead><tbody>
    ${t.margenes.map((m) => `<tr><td>${esc(m.referencia)}</td><td class="n">${M.usd(m.cobrado)}</td><td class="n">${M.usd(m.costo)}</td><td class="n"><b>${M.usd(m.margen)}</b> (${m.cobrado ? Math.round((m.margen * 100) / m.cobrado) : 0}%)</td></tr>`).join("")}
    </tbody></table></div>
  </section>
  <section class="panel"><h2>Últimos movimientos del sistema</h2><ul class="avisos">${E.log.slice(0, 8).map((l) => `<li class="bien">${ddmm(l.fecha)} · ${esc(l.texto)}</li>`).join("")}</ul></section>`;
}

// ── Tarifas y régimen ──

function vistaAjustes() {
  const R = E.regimen;
  return `
  <h1>Tarifas y régimen</h1>
  <p class="bajada">Los números cambian sin pedirle nada a nadie: el dólar del día, el precio por kilo de cada ruta y, con PIN, las reglas del régimen courier cuando ARCA las modifique.</p>
  <div class="grilla">
    <form class="panel" data-a="guardarTc">
      <h2>Dólar del día</h2>
      <label class="f">Pesos por dólar<input name="tc" inputmode="numeric" value="${E.config.tipoCambio}"></label>
      <p class="ayuda">Las cotizaciones nuevas y los saldos sin seña se calculan con este valor.</p>
      <button class="b primario" type="submit" style="margin-top:var(--s3)">Guardar</button>
    </form>
    <form class="panel" data-a="guardarRegimen">
      <h2>Régimen courier</h2>
      <div class="campos">
        <label class="f">Franquicia (US$)<input name="franquiciaCentavos" inputmode="decimal" value="${usdInput(R.franquiciaCentavos)}"></label>
        <label class="f">Tope por envío (US$)<input name="topeEnvioCentavos" inputmode="decimal" value="${usdInput(R.topeEnvioCentavos)}"></label>
        <label class="f">Derechos sobre el excedente (%)<input name="derechosExcedente" inputmode="decimal" value="${Math.round(R.derechosExcedente * 100)}"></label>
        <label class="f">Envíos con franquicia por año<input name="enviosPorAnio" inputmode="numeric" value="${R.enviosPorAnio}"></label>
        <label class="f">Tu PIN<input name="pin" type="password" inputmode="numeric" autocomplete="off" required></label>
      </div>
      <p class="ayuda">Vigente desde ${esc(R.vigenteDesde)}. ${esc(R.fuente)}. PIN de la demo: 9999.</p>
      <button class="b primario" type="submit" style="margin-top:var(--s3)">Guardar régimen</button>
    </form>
  </div>
  <section class="panel" style="margin-top:var(--s4)"><h2>Tarifas por ruta</h2>
    <div class="tabla"><table><thead><tr><th>Ruta</th><th>Régimen</th><th>Plazo</th><th class="n">Precio</th><th></th></tr></thead><tbody>
    ${E.tarifas.map((t) => {
      const campo = t.porCbmCentavos ? "porCbmCentavos" : "porKgCentavos";
      return `<tr><td>${esc(ruta(t))}</td><td>${t.regimenes.map((r) => esc(M.REGIMENES[r])).join(" · ")}</td><td>${t.dias[0]}–${t.dias[1]} días</td>
        <td class="n"><label class="sr" for="tar-${t.id}">US$ por ${t.porCbmCentavos ? "m³" : "kg"} de ${esc(ruta(t))}</label><input id="tar-${t.id}" data-tarifa="${t.id}" data-campo="${campo}" value="${usdInput(t[campo])}" inputmode="decimal" style="width:110px;min-height:36px;border:1.5px solid var(--borde-campo);border-radius:var(--r-campo);padding:0 var(--s2);text-align:right;background:var(--panel)"> / ${t.porCbmCentavos ? "m³" : "kg"}</td>
        <td><button class="b chico" data-a="guardarTarifa" data-id="${t.id}">Guardar</button></td></tr>`;
    }).join("")}
    </tbody></table></div>
    <p class="ayuda">Valores de demostración: no son tarifas de TESVO.</p>
  </section>`;
}

// ───────────────────────── diálogos ─────────────────────────

function abrir({ titulo, sub = "", cuerpo, pie = "", ancho = false }) {
  const d = $("#dlg");
  d.style.maxWidth = ancho ? "min(960px, calc(100vw - 32px))" : "";
  d.innerHTML = `<div class="dlg-cab"><div style="flex:1"><h2 id="dlg-titulo">${esc(titulo)}</h2>${sub ? `<p>${esc(sub)}</p>` : ""}</div><button type="button" class="cerrar" data-a="cerrar" aria-label="Cerrar">×</button></div>
    <div class="dlg-cuerpo">${cuerpo}</div>${pie ? `<div class="dlg-pie">${pie}</div>` : ""}`;
  if (!d.open) d.showModal();
  const foco = d.querySelector("input:not([type=hidden]),select,textarea") ?? d.querySelector(".dlg-pie .b") ?? d.querySelector(".cerrar");
  foco?.focus();
}
const cerrar = () => { const d = $("#dlg"); if (d.open) d.close(); };

function formDlg({ titulo, sub, campos, enviar, accion, datos = {} }) {
  abrir({
    titulo, sub,
    cuerpo: `<form id="dlg-form" data-a="${accion}" ${Object.entries(datos).map(([k, v]) => `data-${k}="${esc(v)}"`).join(" ")}><div class="campos">${campos}</div></form>`,
    pie: `<button class="b" type="button" data-a="cerrar">Volver</button><button class="b primario" type="submit" form="dlg-form">${esc(enviar)}</button>`,
  });
}

const campoPin = () => `<label class="f">PIN del dueño<input name="pin" type="password" inputmode="numeric" autocomplete="off" required></label><p class="ayuda" style="grid-column:1/-1">PIN de la demo: 9999.</p>`;

function cobrarDlg(id) {
  const e = M.envio(E, id);
  const tc = M.tcParaCobrar(E, e);
  const saldo = Math.max(0, M.saldoEnvio(e));
  formDlg({
    titulo: `Cobrar ${e.codigo}`,
    sub: `${M.cliente(E, e.clienteId)?.nombre} · saldo ${M.usd(saldo)} ≈ ${M.pesos(M.aPesos(saldo, tc))} (${e.tcCongelado ? "dólar congelado por la seña" : "dólar del día"} ${M.pesos(tc)})`,
    accion: "cobrar", datos: { id },
    campos: `<label class="f">Medio<select name="medio">${Object.entries(M.MEDIOS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}</select></label>
      <label class="f">Monto en pesos (o en dólares si es billete)<input name="monto" inputmode="decimal" required value="${M.aPesos(saldo, tc)}"></label>
      <p class="ayuda" style="grid-column:1/-1">Para dólares billete el monto va en dólares: ${usdInput(saldo)}.</p>`,
    enviar: "Cobrar",
  });
}

// ───────────────────────── acciones ─────────────────────────

function resultado(r, okTexto, { cerrarDlg = true, refrescarFicha = null } = {}) {
  if (!r?.ok) { toast(r?.motivo ?? "No se pudo.", true); return false; }
  toast(typeof okTexto === "function" ? okTexto(r) : okTexto);
  if (cerrarDlg) cerrar();
  render();
  if (refrescarFicha) fichaEnvio(refrescarFicha);
  return true;
}

function mostrarAvisos(titulo, avisos) {
  abrir({
    titulo, sub: "Un mensaje listo por cliente: tocá cada uno para mandarlo.",
    cuerpo: `<ul class="avisos">${avisos.map((m) => `<li class="bien"><b>${esc(m.cliente)}</b><br>${esc(m.texto)}<div class="fila" style="margin-top:var(--s2)">${botonWa(m, "Mandar")}</div></li>`).join("")}</ul>`,
    pie: `<button class="b primario" data-a="cerrar">Listo</button>`,
  });
}

const acciones = {
  tab: (d) => irTab(d.v),
  cerrar: () => cerrar(),
  bandeja: (d) => { ui.bandeja = d.v; render(); },
  filtro: (d) => { ui.filtro = d.v; render(); },
  ficha: (d) => fichaEnvio(d.id),
  fichaCliente: (d) => fichaCliente(d.id),

  prohibido: (d) => resultado(M.resolverProhibido(E, d.id, d.v, auth(), HOY), d.v === "devolver" ? "Vuelve al vendedor: el resto del envío sigue." : "Se descarta: el resto del envío sigue."),
  dano: (d) => resultado(M.resolverDano(E, d.id, d.v, auth(), HOY), d.v === "seguir" ? "Sigue igual: ya puede embarcar." : "Se reclama al vendedor: el envío espera el reemplazo."),
  resolverObs: (d) => resultado(M.resolverObservacion(E, d.id, { nota: "Documentación enviada" }, auth(), HOY), "Observación resuelta: ya se puede liberar."),
  ajustePeso: (d) => resultado(M.aplicarDiferenciaDePeso(E, d.id, auth(), HOY), (r) => `Ajuste de ${M.usd(r.centavos)} aplicado.`),
  asignarDlg: (d) => {
    const p = M.paquete(E, d.id);
    const opciones = E.envios.filter((e) => ["confirmado", "esperando", "en_deposito"].includes(e.estado));
    formDlg({
      titulo: `Asignar ${p.tracking}`, sub: `${M.kg(p.gramos)} · recibido ${ddmm(p.recibido)} · ${p.casillaEtiqueta ? `etiqueta ${p.casillaEtiqueta}` : "sin casilla en la etiqueta"}`,
      accion: "asignar", datos: { id: p.id },
      campos: `<label class="f" style="grid-column:1/-1">Envío<select name="envio">${opciones.map((e) => `<option value="${e.id}">${e.codigo} · ${esc(M.cliente(E, e.clienteId)?.nombre)} · ${esc(M.ESTADOS[e.estado])}</option>`).join("")}</select></label>
        <p class="ayuda" style="grid-column:1/-1">Confirmá con la factura del cliente o por WhatsApp antes de asignar.</p>`,
      enviar: "Asignar",
    });
  },
  asignar: (d, f) => resultado(M.asignarPaquete(E, d.id, f.envio.value, auth(), HOY), "Paquete asignado."),
  cobrarDlg: (d) => cobrarDlg(d.id),
  cobrar: (d, f) => {
    const enDolares = f.medio.value === "usd_efectivo";
    const monto = enDolares ? parseUsd(f.monto.value) : Math.round(parseNum(String(f.monto.value).replace(/\./g, "")));
    resultado(M.cobrar(E, d.id, { medio: f.medio.value, monto }, auth(), HOY), (r) => r.saldo > 50 ? `Cobrado. Queda ${M.usd(r.saldo)}.` : "Cobrado. Saldo en cero.", { refrescarFicha: d.id });
  },
  demoraDlg: (d) => {
    const b = M.embarque(E, d.id);
    formDlg({
      titulo: `Demora en ${b.referencia}`, sub: `Llegada estimada ${ddmm(b.llegada)} · ${b.envios.length} cliente(s) a avisar`,
      accion: "demora", datos: { id: b.id },
      campos: `<label class="f">Nueva llegada estimada<input name="fecha" type="date" required value="${M.sumarDias(b.llegada > HOY ? b.llegada : HOY, 4)}"></label>
        <label class="f" style="grid-column:1/-1">Motivo (lo lee el cliente)<input name="motivo" required placeholder="Ej.: el contenedor quedó para el próximo buque"></label>`,
      enviar: "Cargar y armar los avisos",
    });
  },
  demora: (d, f) => {
    const r = M.demorarEmbarque(E, d.id, { nuevaLlegada: f.fecha.value, motivo: f.motivo.value }, auth(), HOY);
    if (resultado(r, "Demora cargada.", { cerrarDlg: false })) mostrarAvisos("Avisos de la demora", r.avisos);
  },
  confirmarDlg: (d) => {
    const q = E.cotizaciones.find((x) => x.id === d.id);
    formDlg({
      titulo: "Confirmar la cotización", sub: `${M.usd(q.total)} · ${rutaDe(q)} · vence ${ddmm(q.vence)}`,
      accion: "confirmar", datos: { id: q.id },
      campos: `<label class="f" style="grid-column:1/-1">Cliente<select name="cliente">${E.clientes.map((c) => `<option value="${c.id}" ${c.id === q.clienteId ? "selected" : ""}>${esc(c.nombre)} · ${esc(c.casilla)}</option>`).join("")}</select></label>
        <p class="ayuda" style="grid-column:1/-1">Si es alguien nuevo, dalo de alta en Clientes primero (hace falta el CUIT/CUIL para la aduana).</p>`,
      enviar: "Confirmar",
    });
  },
  confirmar: (d, f) => {
    const r = M.confirmarEnvio(E, { cotizacionId: d.id, clienteId: f.cliente.value }, auth(), HOY);
    if (resultado(r, (x) => `Envío ${x.envio.codigo} creado. Pedile la seña.`)) fichaEnvio(r.envio.id);
  },
  devolverDlg: (d) => {
    const e = M.envio(E, d.id);
    formDlg({ titulo: `Devolver la seña de ${e.codigo}`, sub: `${M.usd(e.devolucionPendiente)} a ${M.cliente(E, e.clienteId)?.nombre}`, accion: "devolver", datos: { id: e.id },
      campos: `<label class="f">Medio<select name="medio"><option value="transferencia">Transferencia</option><option value="mercadopago">Mercado Pago</option><option value="usd_efectivo">Dólares billete</option></select></label>${campoPin()}`, enviar: "Devolver" });
  },
  devolver: (d, f) => resultado(M.devolverSena(E, d.id, { medio: f.medio.value }, auth(f.pin.value), HOY), "Seña devuelta: quedó en la caja como egreso."),
  bonificarDlg: (d) => {
    const e = M.envio(E, d.id);
    formDlg({ titulo: `Bonificar ${e.codigo}`, sub: "Queda registrado quién y por qué.", accion: "bonificar", datos: { id: e.id },
      campos: `<label class="f">Monto (US$)<input name="monto" inputmode="decimal" required></label><label class="f" style="grid-column:1/-1">Motivo<input name="motivo" required placeholder="Ej.: demora larga del vuelo"></label>${campoPin()}`, enviar: "Bonificar" });
  },
  bonificar: (d, f) => resultado(M.bonificar(E, d.id, { centavos: parseUsd(f.monto.value), motivo: f.motivo.value }, auth(f.pin.value), HOY), "Bonificación aplicada.", { refrescarFicha: d.id }),
  cancelarDlg: (d) => {
    const e = M.envio(E, d.id);
    formDlg({ titulo: `Cancelar ${e.codigo}`, sub: "Sin paquetes se devuelve todo; con paquetes en el depósito se retienen el manejo y el almacenaje.", accion: "cancelar", datos: { id: e.id },
      campos: `<label class="f" style="grid-column:1/-1">Motivo<input name="motivo" placeholder="Ej.: el vendedor no tenía stock"></label>`, enviar: "Cancelar envío" });
  },
  cancelar: (d, f) => resultado(M.cancelarEnvio(E, d.id, { motivo: f.motivo.value }, auth(), HOY), (r) => `Cancelado. A devolver ${M.usd(r.devolver)}${r.retiene ? `, se retiene ${M.usd(r.retiene)}` : ""}.`),
  prealertaDlg: (d) => formDlg({ titulo: "Avisar una compra", sub: "El tracking que da la tienda. Cuando llegue al depósito se asigna solo.", accion: "prealerta", datos: { id: d.id },
    campos: `<label class="f">Tracking<input name="tracking" required autocomplete="off"></label><label class="f">Tienda<input name="tienda" placeholder="Amazon, Shein…"></label>`, enviar: "Avisar" }),
  prealerta: (d, f) => resultado(M.prealertar(E, d.id, { tracking: f.tracking.value, tienda: f.tienda.value }, HOY), (r) => r.asignado ? "Avisada: ya estaba en el depósito y se asignó." : "Compra avisada.", { refrescarFicha: d.id }),
  retenerDlg: (d) => formDlg({ titulo: "Esperar más compras", sub: `Se consolida todo junto. Pasados ${E.config.almacenajeDiasGratis} días en el depósito corre almacenaje.`, accion: "retener", datos: { id: d.id },
    campos: `<label class="f">Hasta<input name="hasta" type="date" required min="${HOY}" value="${M.sumarDias(HOY, 7)}"></label>`, enviar: "Guardar" }),
  retener: (d, f) => resultado(M.retenerParaConsolidar(E, d.id, f.hasta.value, HOY), (r) => r.avisoAlmacenaje ?? "Listo: espera hasta esa fecha.", { refrescarFicha: d.id }),
  liberarDlg: (d) => {
    const e = M.envio(E, d.id);
    formDlg({ titulo: `Liberar ${e.codigo}`, sub: e.cotizacion.impuestos ? `Impuestos estimados ${M.usd(e.cotizacion.impuestos.total)}. Si la aduana liquidó otro monto, cargalo y se ajusta el saldo.` : "Régimen general: los tributos los paga el despachante con la cuenta del cliente.", accion: "liberar", datos: { id: e.id },
      campos: e.cotizacion.impuestos ? `<label class="f">Impuestos liquidados (US$, opcional)<input name="imp" inputmode="decimal" placeholder="${usdInput(e.cotizacion.impuestos.total)}"></label>` : "", enviar: "Liberar" });
  },
  liberar: (d, f) => {
    const imp = f.imp?.value ? parseUsd(f.imp.value) : null;
    const r = M.liberarAduana(E, d.id, { impuestosRealesCentavos: Number.isNaN(imp) ? null : imp }, auth(), HOY);
    if (resultado(r, "Liberado: listo para entregar.", { cerrarDlg: false })) mostrarAvisos("Avisar que está listo", [r.aviso]);
  },
  observarDlg: (d) => formDlg({ titulo: "La aduana observó el envío", sub: "Queda frenado con un pedido concreto y un plazo.", accion: "observar", datos: { id: d.id },
    campos: `<label class="f" style="grid-column:1/-1">Qué observó<input name="motivo" required placeholder="Ej.: valor declarado bajo"></label><label class="f">Qué pide<input name="pide" value="la factura de compra"></label><label class="f">Plazo (días)<input name="plazo" inputmode="numeric" value="5"></label>`, enviar: "Guardar" }),
  observar: (d, f) => {
    const r = M.observarAduana(E, d.id, { motivo: f.motivo.value, pide: f.pide.value, plazoDias: Math.max(1, Math.round(parseNum(f.plazo.value)) || 5) }, auth(), HOY);
    if (resultado(r, "Observación cargada.", { cerrarDlg: false })) mostrarAvisos("Pedir la documentación", [r.aviso]);
  },
  entregar: (d) => {
    const r = M.entregar(E, d.id, { modo: d.v }, auth(), HOY);
    if (resultado(r, r?.enReparto ? "Salió a reparto." : "Entregado. ¡Listo!", { cerrarDlg: false })) { if (r.aviso) mostrarAvisos("Avisar al cliente", [r.aviso]); else fichaEnvio(d.id); }
  },
  fallida: (d) => {
    const r = M.entregaFallida(E, d.id, {}, auth(), HOY);
    if (resultado(r, r?.aOficina ? "Queda para retirar en la oficina." : "Se reintenta.", { cerrarDlg: false })) mostrarAvisos("Avisar al cliente", [r.aviso]);
  },
  subir: (d) => resultado(M.subirAEmbarque(E, d.id, d.v, auth(), HOY), "Subió al embarque.", { cerrarDlg: false }),
  despacharDlg: (d) => {
    const b = M.embarque(E, d.id);
    formDlg({ titulo: `Sale ${b.referencia}`, sub: `${b.envios.length} envío(s). El costo real alimenta el margen del tablero.`, accion: "despachar", datos: { id: b.id },
      campos: `<label class="f">Costo real del flete (US$)<input name="costo" inputmode="decimal" placeholder="0,00"></label>`, enviar: "Salió" });
  },
  despachar: (d, f) => {
    const costo = parseUsd(f.costo.value);
    const r = M.despacharEmbarque(E, d.id, { costoRealCentavos: Number.isNaN(costo) ? 0 : costo }, auth(), HOY);
    if (resultado(r, "Embarque en viaje.", { cerrarDlg: false })) mostrarAvisos("Avisar que salió", r.avisos);
  },
  arribo: (d) => resultado(M.arriboEmbarque(E, d.id, auth(), HOY), "Llegó: los envíos pasan a aduana.", { cerrarDlg: false }),
  nuevoEmbarque: (_d, f) => resultado(M.crearEmbarque(E, { tarifaId: f.tarifaId.value, referencia: f.referencia.value, salida: null, llegada: f.llegada.value }, auth(), HOY), "Embarque abierto: subí los envíos listos.", { cerrarDlg: false }),
  recibir: (_d, f) => {
    const gramos = Math.round(parseNum(f.kg.value) * 1000);
    const medidas = [f.l.value, f.a.value, f.h.value].every((v) => parseNum(v) > 0) ? { l: parseNum(f.l.value), a: parseNum(f.a.value), h: parseNum(f.h.value) } : null;
    const r = M.recibirPaquete(E, { tracking: f.tracking.value, gramos, medidas, casillaEtiqueta: f.casilla.value, danado: f.danado.checked, contenido: f.contenido.value, categoria: f.categoria.value, deposito: f.deposito.value }, auth(), HOY);
    ui.recepcion = r.ok
      ? { ok: true, envio: r.envio, texto: r.envio ? `Recibido y asignado a ${r.envio.codigo} (${M.cliente(E, r.envio.clienteId)?.nombre}).${r.paquete.retenido ? " Producto prohibido: queda retenido." : ""}${r.paquete.danado ? " Avisá al cliente del daño." : ""}` : "Recibido SIN DUEÑO: quedó en la bandeja para asignar." }
      : { ok: false, texto: r.motivo };
    toast(ui.recepcion.texto, !r.ok);
    render();
    $("#principal form[data-a=recibir] input[name=tracking]")?.focus();
  },
  altaClienteDlg: () => formDlg({ titulo: "Nuevo cliente", sub: "Le asignamos su casilla al darlo de alta.", accion: "altaCliente",
    campos: `<label class="f">Nombre o razón social<input name="nombre" required></label><label class="f">Tipo<select name="tipo"><option value="persona">Persona</option><option value="pyme">Empresa</option></select></label><label class="f">CUIT/CUIL<input name="doc" inputmode="numeric" required></label><label class="f">Email<input name="email" type="email"></label>`, enviar: "Dar de alta" }),
  altaCliente: (_d, f) => resultado(M.altaCliente(E, { nombre: f.nombre.value, tipo: f.tipo.value, doc: f.doc.value, email: f.email.value }, auth(), HOY), (r) => `Alta lista: casilla ${r.cliente.casilla}.`),

  // Cotizador
  sumarItem: () => { ui.cot.items.push({ descripcion: "", valor: "", unidades: "1", categoria: "general" }); render(); $(`[data-cot="item.${ui.cot.items.length - 1}.descripcion"]`)?.focus(); },
  quitarItem: (d) => { ui.cot.items.splice(Number(d.v), 1); render(); },
  limpiarCot: () => { ui.cot = cotVacia(); ui.partir = null; render(); },
  partir: () => { ui.partir = !ui.partir; pintarCotizacion(); },
  guardarCot: () => {
    const p = pedidoDesdeForm();
    const r = M.guardarCotizacion(E, p, { clienteId: p.clienteId ?? null, contacto: ui.cot.contacto || "Consulta" }, auth(), HOY);
    if (resultado(r, (x) => `Cotización guardada: ${M.usd(x.cotizacion.total)}, vale hasta el ${ddmm(x.cotizacion.vence)}.`, { cerrarDlg: false })) { ui.cot = cotVacia(); ui.partir = null; render(); }
  },

  // Dueño
  guardarTc: (_d, f) => resultado(M.cambiarTipoCambio(E, f.tc.value, auth(), HOY), "Dólar del día actualizado.", { cerrarDlg: false }),
  guardarRegimen: (_d, f) => {
    const pin = f.pin.value;
    const cambios = [
      ["franquiciaCentavos", parseUsd(f.franquiciaCentavos.value)],
      ["topeEnvioCentavos", parseUsd(f.topeEnvioCentavos.value)],
      ["derechosExcedente", parseNum(f.derechosExcedente.value) / 100],
      ["enviosPorAnio", Math.round(parseNum(f.enviosPorAnio.value))],
    ].filter(([k, v]) => E.regimen[k] !== v);
    if (!cambios.length) return toast("No cambiaste nada.");
    for (const [k, v] of cambios) {
      const r = M.cambiarRegimen(E, k, v, auth(pin), HOY);
      if (!r.ok) return toast(r.motivo, true);
    }
    resultado({ ok: true }, "Régimen actualizado: las cotizaciones nuevas ya lo usan.", { cerrarDlg: false });
  },
  guardarTarifa: (d) => {
    const inp = $(`[data-tarifa="${d.id}"]`);
    resultado(M.cambiarTarifa(E, d.id, inp.dataset.campo, parseUsd(inp.value), auth(), HOY), "Tarifa guardada.", { cerrarDlg: false });
  },
};

function alClic(ev) {
  const el = ev.target.closest("[data-a]");
  if (!el || el.tagName === "FORM") return;
  if (el.tagName === "TR" && ev.target.closest("button,a,input,select")) return;
  const a = el.dataset.a;
  if (!acciones[a]) return;
  if (el.tagName === "A") return;
  ev.preventDefault();
  acciones[a](el.dataset, el.closest("form"));
}

function alEscribir(ev) {
  const el = ev.target;
  if (el.dataset.in === "busca") {
    ui.busca = el.value;
    const pos = el.selectionStart;
    render();
    const nuevo = $('[data-in="busca"]');
    nuevo?.focus();
    nuevo?.setSelectionRange(pos, pos);
    return;
  }
  if (el.dataset.cot) { leerCot(el); pintarCotizacion(); }
}

function alCambiar(ev) {
  const el = ev.target;
  if (!el.dataset.cot) return;
  leerCot(el);
  // Cambiar ruta, régimen o cliente cambia el formulario: se repinta entero.
  if (["tarifaId", "clienteId", "regimen"].includes(el.dataset.cot)) {
    if (el.dataset.cot === "tarifaId") { const t = M.tarifa(E, ui.cot.tarifaId); if (!t.regimenes.includes(ui.cot.regimen)) ui.cot.regimen = t.regimenes[0]; }
    render();
    $(`[data-cot="${el.dataset.cot}"]`)?.focus();
  } else pintarCotizacion();
}

function leerCot(el) {
  const k = el.dataset.cot;
  const v = el.type === "checkbox" ? el.checked : el.value;
  if (k.startsWith("item.")) { const [, i, campo] = k.split("."); ui.cot.items[Number(i)][campo] = v; } else ui.cot[k] = v;
}

let timerToast = null;
function toast(texto, error = false) {
  const t = $("#toast");
  t.textContent = texto;
  t.classList.toggle("error", !!error);
  t.classList.add("ver");
  clearTimeout(timerToast);
  timerToast = setTimeout(() => t.classList.remove("ver"), error ? 5200 : 3200);
}

addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && $("#dlg").open) { ev.preventDefault(); cerrar(); }
});
$("#dlg").addEventListener("click", (ev) => { if (ev.target === ev.currentTarget) cerrar(); });

iniciar();
