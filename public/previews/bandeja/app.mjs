// Pantalla de la demo de Bandeja: buscador, ficha del profe, turnero de vista previa, puntuar una clase y
// la página para profes. Toda la lógica de negocio vive en motor.mjs; acá sólo DOM. No se envía nada a ningún lado.
import * as M from "./motor.mjs";
import { PROFES, PUNTOS, AHORA, HOY, tomadasDe, CLASE_DEMO } from "./datos.mjs";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Precios provisionales: propuesta de Pricing ajustada por el Challenger (docs/producto/bandeja/ESTRATEGIA.md).
const PLANES = [
  { nombre: "Perfil", precio: 0, incluye: "Ficha en el buscador con tus clubes, niveles y precio desde. Reseñas verificadas. Turnero con hasta 8 reservas por mes.", para: "Probar sin compromiso" },
  { nombre: "Profe", precio: 14900, incluye: "Turnero sin tope para la bio de Instagram, pantalla «Hoy», link del alumno con comprobante, recordatorios por WhatsApp de un toque.", para: "El profe que da clases todas las semanas", destacado: true },
  { nombre: "Profe Pro", precio: 29900, incluye: "Todo lo de Profe, más recordatorios automáticos el día anterior y abonos de 4 u 8 clases (a construir).", para: "Agenda llena, poco tiempo" },
  { nombre: "Club", precio: 59900, incluye: "Hasta 5 profes con agenda unificada, y el club ve qué clases se dan en sus canchas (a construir).", para: "Clubes con plantel de profes" },
  { nombre: "Club Escuelita", precio: 109900, incluye: "Hasta 12 profes, grupos fijos de la escuelita con cuota mensual y adulto responsable por cada menor (a construir).", para: "Clubes con escuelita" },
];

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fechaCorta = (f) => `${Number(f.slice(8, 10))} ${MESES[Number(f.slice(5, 7)) - 1]}`;
const tildeVerif = `<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="currentColor"/><path d="M4.6 8.2l2.2 2.2 4.6-4.8" fill="none" stroke="var(--surface)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const estado = {
  punto: PUNTOS[0],
  filtros: { radioKm: 10 },
  orden: "recomendados",
  activo: null,
  tomadas: new Map(PROFES.map((p) => [p.id, tomadasDe(p.id)])),
  claseDemo: { ...CLASE_DEMO },
  ultimaResena: null,
};

// ── Recordar la búsqueda (comodidad de este navegador; si no hay almacenamiento, arranca de cero) ──────
function leerPreferencias() {
  try {
    const p = JSON.parse(localStorage.getItem("bandeja.busqueda") || "null");
    if (p && PUNTOS.some((x) => x.id === p.punto)) {
      estado.punto = PUNTOS.find((x) => x.id === p.punto);
      $("#f-radio").value = String(p.radio ?? 10);
    }
  } catch { /* sin almacenamiento */ }
}
function guardarPreferencias() {
  try { localStorage.setItem("bandeja.busqueda", JSON.stringify({ punto: estado.punto.id, radio: Number($("#f-radio").value) })); } catch { /* idem */ }
}

// ── Buscador ─────────────────────────────────────────────────────────────────────────────────────────

function armarFiltros() {
  $("#f-punto").innerHTML = PUNTOS.map((p) => `<option value="${p.id}">${esc(p.nombre)}</option>`).join("");
  $("#f-nivel").insertAdjacentHTML("beforeend", M.NIVELES.map((n) => `<option value="${n.id}">${esc(n.nombre)}</option>`).join(""));
  leerPreferencias();
  $("#f-punto").value = estado.punto.id;
  $("#filtros").addEventListener("input", leerFiltros);
  $("#filtros").addEventListener("submit", (e) => e.preventDefault());
  $("#f-orden").addEventListener("change", () => { estado.orden = $("#f-orden").value; pintar(); });
  // En pantallas anchas los filtros entran todos; en el celular arrancan plegados para que se vean los profes.
  if (matchMedia("(min-width: 920px)").matches) $("#mas-filtros").open = true;
  leerFiltros();
}

function leerFiltros() {
  estado.punto = PUNTOS.find((p) => p.id === $("#f-punto").value) || PUNTOS[0];
  const precio = Number($("#f-precio").value);
  $("#f-precio-txt").textContent = precio >= 40000 ? "sin tope" : `hasta ${M.plata(precio)}`;
  estado.filtros = {
    radioKm: Number($("#f-radio").value) || 0,
    nivel: $("#f-nivel").value,
    modalidad: $("#f-modalidad").value,
    precioMax: precio >= 40000 ? 0 : precio,
    menores: $("#f-menores").checked,
    soloReservaOnline: $("#f-online").checked,
    texto: $("#f-texto").value,
  };
  const activos = ["nivel", "modalidad", "precioMax", "menores", "soloReservaOnline", "texto"].filter((k) => estado.filtros[k]).length;
  $("#mas-cuenta").textContent = activos ? `(${activos})` : "";
  guardarPreferencias();
  pintar();
}

function pintar() {
  const filas = M.buscar(PROFES, estado.punto, estado.filtros, estado.orden);
  const cuantos = filas.length;
  $("#conteo").innerHTML = cuantos
    ? `<strong>${cuantos} ${cuantos === 1 ? "profe" : "profes"}</strong> cerca de ${esc(estado.punto.nombre)}`
    : `Ningún profe con esos filtros cerca de ${esc(estado.punto.nombre)}`;
  $("#lista").innerHTML = cuantos ? filas.map(tarjeta).join("") : `
    <div class="vacio"><p>Probá ampliar la distancia o sacar algún filtro.</p>
    <p style="margin-top:10px"><button class="btn btn-sec btn-chico" type="button" data-accion="ampliar">Buscar sin límite de distancia</button></p></div>`;
  pintarMapa(filas);
}

const cuantasResenas = (n) => (n ? `${n} ${n === 1 ? "reseña" : "reseñas"}` : "sin reseñas aún");

/** El precio que se muestra según la clase que busca el jugador. */
function etiquetaPrecio(profe) {
  const modalidad = estado.filtros.modalidad;
  const precio = M.precioPara(profe, modalidad);
  if (modalidad === "individual") return `${M.plata(precio)} individual`;
  if (modalidad === "grupal") return `${M.plata(precio)} por persona`;
  return `desde ${M.plata(precio)}`;
}

function tarjeta({ profe, sede, km, resumen }) {
  const nota = resumen.muestraPuntaje
    ? `<span class="nota">${resumen.promedio.toFixed(1).replace(".", ",")}</span><small>${cuantasResenas(resumen.cantidad)}</small>`
    : `<span class="nota vacia">Nuevo</span><small>${cuantasResenas(resumen.cantidad)}</small>`;
  const reserva = profe.reservaOnline ? `<span class="tag online">Reserva online</span>` : `<span class="tag sin">Sólo por WhatsApp</span>`;
  const chicos = profe.menores ? `<span class="tag">Chicos</span>` : "";
  const niveles = profe.niveles.map((n) => M.NIVELES.find((x) => x.id === n).nombre.split(" (")[0]).join(" · ");
  return `
  <button class="profe${estado.activo === profe.id ? " activo" : ""}" type="button" data-profe="${profe.id}">
    <span class="avatar" aria-hidden="true">${esc(profe.iniciales)}</span>
    <span style="min-width:0">
      <span class="nombre">${esc(profe.nombre)}</span>
      <span class="meta"><span class="num">a ${M.km(km)}</span><span>${esc(sede.club)} · ${esc(sede.localidad)}</span></span>
      <span class="tags">${reserva}${chicos}<span class="tag">${esc(niveles)}</span></span>
    </span>
    <span class="puntaje">${nota}<span class="precio num">${etiquetaPrecio(profe)}</span></span>
  </button>`;
}

// ── Plano esquemático (sin servicio de mapas: las posiciones salen de las coordenadas reales) ──────────

function pintarMapa(filas) {
  const lats = PUNTOS.map((p) => p.lat), lngs = PUNTOS.map((p) => p.lng);
  const pad = 0.025;
  const minLat = Math.min(...lats) - pad, maxLat = Math.max(...lats) + pad;
  const minLng = Math.min(...lngs) - pad, maxLng = Math.max(...lngs) + pad;
  const kmX = 111.32 * Math.cos((estado.punto.lat * Math.PI) / 180), kmY = 110.57;
  const W = 600, escala = W / ((maxLng - minLng) * kmX); // px por km
  const H = Math.round((maxLat - minLat) * kmY * escala);
  const x = (lng) => ((lng - minLng) * kmX * escala).toFixed(1);
  const y = (lat) => ((maxLat - lat) * kmY * escala).toFixed(1);

  const clubes = new Map();
  for (const f of filas) for (const s of f.profe.sedes) {
    const k = `${s.club}|${s.localidad}`;
    if (!clubes.has(k)) clubes.set(k, { ...s, profes: new Set() });
    clubes.get(k).profes.add(f.profe.id);
  }
  // Rutas principales, aproximadas a mano y sólo como referencia visual.
  const rutas = [
    [[-34.7442, -58.397], [-34.7764, -58.3958], [-34.8007, -58.3903], [-34.8277, -58.3938]],
    [[-34.7609, -58.4063], [-34.8013, -58.4481], [-34.8189, -58.4686], [-34.8537, -58.5228], [-34.8868, -58.5636]],
    [[-34.8189, -58.4686], [-34.8705, -58.5089]],
  ].map((r) => `<polyline points="${r.map(([la, ln]) => `${x(ln)},${y(la)}`).join(" ")}" fill="none" stroke="var(--map-road)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`).join("");

  const radio = estado.filtros.radioKm
    ? `<circle cx="${x(estado.punto.lng)}" cy="${y(estado.punto.lat)}" r="${(estado.filtros.radioKm * escala).toFixed(1)}" fill="var(--accent)" fill-opacity=".07" stroke="var(--accent)" stroke-opacity=".5" stroke-dasharray="6 6"/>`
    : "";
  const etiquetas = PUNTOS.map((p) => `<text x="${x(p.lng)}" y="${(Number(y(p.lat)) - 12).toFixed(1)}" text-anchor="middle" font-size="13" fill="var(--muted)" font-family="var(--font-body)">${esc(p.nombre)}</text>`).join("");
  const pines = [...clubes.values()].map((c) => {
    const n = c.profes.size;
    const activo = estado.activo && c.profes.has(estado.activo);
    return `<g class="pin${activo ? " activo" : ""}" tabindex="0" role="button" data-club="${esc(c.club)}" aria-label="${esc(c.club)}, ${esc(c.localidad)}: ${n} ${n === 1 ? "profe" : "profes"}">
      <circle class="punto" cx="${x(c.lng)}" cy="${y(c.lat)}" r="7" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/>
      ${n > 1 ? `<text x="${x(c.lng)}" y="${(Number(y(c.lat)) + 4).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="700" fill="var(--accent-ink)" font-family="var(--font-body)" pointer-events="none">${n}</text>` : ""}
    </g>`;
  }).join("");
  const vos = `<g aria-hidden="true"><circle cx="${x(estado.punto.lng)}" cy="${y(estado.punto.lat)}" r="9" fill="var(--ink)" stroke="var(--surface)" stroke-width="3"/></g>`;
  const regla = `<g aria-hidden="true"><line x1="16" y1="${H - 16}" x2="${(16 + 5 * escala).toFixed(1)}" y2="${H - 16}" stroke="var(--muted)" stroke-width="2"/><text x="16" y="${H - 22}" font-size="11" fill="var(--muted)" font-family="var(--font-body)">5 km</text></g>`;

  const svg = $("#mapa");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.innerHTML = `<rect width="${W}" height="${H}" fill="var(--map-land)"/>${rutas}${radio}${etiquetas}${vos}${pines}${regla}`;
}

// ── Ficha del profe ──────────────────────────────────────────────────────────────────────────────────

let ultimoFoco = null;
function abrirHoja(html, foco) {
  ultimoFoco = document.activeElement;
  const hoja = $("#hoja");
  hoja.innerHTML = html;
  hoja.hidden = false;
  $("#velo").hidden = false;
  document.body.style.overflow = "hidden";
  (foco ? hoja.querySelector(foco) : hoja.querySelector(".cerrar"))?.focus();
}
function cerrarHoja() {
  $("#hoja").hidden = true;
  $("#velo").hidden = true;
  document.body.style.overflow = "";
  const profeId = ultimoFoco?.dataset?.profe;
  estado.activo = null;
  pintar();
  // pintar() rehace la lista: el foco vuelve a la tarjeta nueva del mismo profe, o a lo que lo abrió.
  const volver = profeId ? $(`#lista [data-profe="${profeId}"]`) : ultimoFoco;
  (volver?.isConnected ? volver : $("#conteo"))?.focus?.();
}

function fichaProfe(id, { turnero = null, mensaje = "" } = {}) {
  const profe = PROFES.find((p) => p.id === id);
  estado.activo = id;
  const res = M.resumen(profe.resenas);
  const cuentan = M.resenasQueCuentan(profe.resenas);
  const sedes = profe.sedes.map((s) => `<li><span><b>${esc(s.club)}</b><br><span class="nota-demo">${esc(s.localidad)}</span></span><span class="num">a ${M.km(M.distanciaKm(estado.punto, s))}</span></li>`).join("");
  const precios = [
    profe.precios.individual && `<div><b class="num">${M.plata(profe.precios.individual)}</b><span>Individual · ${profe.duracion} min</span></div>`,
    profe.precios.grupal && `<div><b class="num">${M.plata(profe.precios.grupal)}</b><span>Grupal, por persona · de 2 a 4</span></div>`,
  ].filter(Boolean).join("");
  const barras = M.CRITERIOS.map((c) => {
    const v = res.porCriterio[c.id];
    return `<div class="barra"><span>${esc(c.nombre)}</span><span class="pista"><i style="width:${v ? (v / 5) * 100 : 0}%"></i></span><span class="num">${v ? v.toFixed(1).replace(".", ",") : "–"}</span></div>`;
  }).join("");
  const resumenHtml = res.muestraPuntaje
    ? `<div class="resumen-nota"><span class="nota">${res.promedio.toFixed(1).replace(".", ",")}</span>
        <div class="barras" aria-label="Puntaje por criterio">${barras}</div></div>
       <p class="verif">${tildeVerif} ${res.cantidad} ${res.cantidad === 1 ? "alumno puntuó" : "alumnos puntuaron"} después de una clase dada</p>`
    : `<p class="nota-demo">${res.cantidad ? `Tiene ${cuantasResenas(res.cantidad)}. ` : "Todavía no tiene reseñas. "}El puntaje se muestra desde ${M.REGLAS.minimoParaPuntaje} reseñas de alumnos con clase dada.</p>`;

  const lista = cuentan.slice(0, 6).map((r) => `
    <li class="resena${estado.ultimaResena === r.id ? " nueva" : ""}">
      <div class="cab"><b>${esc(r.alumno)}</b><span class="verif">${tildeVerif} Clase verificada del ${fechaCorta(r.fechaClase)}</span>
        <span class="n num" aria-label="Puntaje ${(M.CRITERIOS.reduce((s, c) => s + r.puntos[c.id], 0) / 4).toFixed(1)}">${(M.CRITERIOS.reduce((s, c) => s + r.puntos[c.id], 0) / 4).toFixed(1).replace(".", ",")}</span></div>
      ${r.texto ? `<p>${esc(r.texto)}</p>` : `<p class="nota-demo">Puntuó sin comentario.</p>`}
      ${r.respuesta ? `<p class="nota-demo"><b>Respuesta de ${esc(profe.nombre.split(" ")[0])}:</b> ${esc(r.respuesta)}</p>` : ""}
      <p><button class="btn btn-sec btn-chico" type="button" data-accion="denunciar" style="min-height:30px;font-size:12px">Denunciar reseña</button></p>
    </li>`).join("");

  const accion = profe.reservaOnline
    ? (turnero ?? `<button class="btn btn-pri" type="button" data-accion="turnero" data-profe="${profe.id}">Ver horarios y reservar</button>`)
    : `<div class="turnero"><p><b>${esc(profe.nombre.split(" ")[0])} todavía no tiene reserva online.</b> Arregla los turnos por WhatsApp.</p>
       <p class="nota-demo">En la demo no hay teléfonos reales. En la real, acá va el botón de WhatsApp del profe.</p></div>`;

  return `
    <div class="hoja-cab">
      <span class="avatar grande" aria-hidden="true">${esc(profe.iniciales)}</span>
      <div><h2 id="hoja-titulo">${esc(profe.nombre)}</h2><p class="nota-demo">${esc(profe.juega)} · enseña desde ${profe.desde}</p></div>
      <button class="cerrar" type="button" data-accion="cerrar" aria-label="Cerrar">×</button>
    </div>
    ${mensaje}
    <p>${esc(profe.bio)}</p>
    <div class="seccion" id="reservar">${accion}</div>
    <div class="seccion"><h3>Dónde da clases</h3><ul class="sedes">${sedes}</ul></div>
    <div class="seccion"><h3>Precios</h3><div class="precios">${precios}</div></div>
    <div class="seccion"><h3>Cómo lo puntúan</h3>${resumenHtml}</div>
    ${lista ? `<div class="seccion"><h3>Reseñas</h3><ul class="resenas">${lista}</ul>
      ${cuentan.length > 6 ? `<p class="nota-demo">Y ${cuentan.length - 6} más.</p>` : ""}
      <p class="nota-demo">Cuenta la última reseña de cada alumno. El profe puede contestar en público, pero no puede borrar.</p></div>` : ""}
  `;
}

// ── Turnero de vista previa (lo mismo que el link de la bio del profe, módulo padel-clases) ─────────────

const turno = { profeId: null, fecha: null, hora: null };

function htmlTurnero(error = "") {
  const profe = PROFES.find((p) => p.id === turno.profeId);
  const libres = M.proximosLibres({ franjas: profe.franjas, duracion: profe.duracion, tomadas: estado.tomadas.get(profe.id), ahora: AHORA, dias: 7 });
  if (!libres.length) return `<div class="turnero"><p>No le quedan horarios libres esta semana.</p></div>`;
  if (!turno.fecha || !libres.some((d) => d.fecha === turno.fecha)) turno.fecha = libres[0].fecha;
  const dia = libres.find((d) => d.fecha === turno.fecha);
  const dias = libres.map((d) => `<button class="dia" type="button" data-fecha="${d.fecha}" aria-pressed="${d.fecha === turno.fecha}">
      <small>${d.fecha === HOY ? "hoy" : DIAS[M.diaSemana(d.fecha)]}</small><b class="num">${Number(d.fecha.slice(8))}</b></button>`).join("");
  const horas = dia.horas.map((h) => `<button class="hora" type="button" data-hora="${h}" aria-pressed="${h === turno.hora}">${h}</button>`).join("");
  return `
  <div class="turnero">
    <p class="paso">1 · Elegí el día</p><div class="dias" role="group" aria-label="Días">${dias}</div>
    <p class="paso">2 · Elegí la hora</p><div class="horas" role="group" aria-label="Horarios libres">${horas}</div>
    <form class="form" id="form-turno" novalidate>
      <p class="paso">3 · Tus datos</p>
      <div class="fila2">
        <label class="campo"><span>Nombre</span><input type="text" id="t-nombre" autocomplete="given-name" required></label>
        <label class="campo"><span>Celular</span><input type="tel" id="t-cel" autocomplete="tel" placeholder="11 2345 6789" required></label>
      </div>
      <div role="alert">${error ? `<p class="error">${esc(error)}</p>` : ""}</div>
      <button class="btn btn-pri" type="submit">${turno.hora ? `Pedir la clase del ${DIAS[M.diaSemana(turno.fecha)]} ${Number(turno.fecha.slice(8))} a las ${turno.hora}` : "Pedir la clase"}</button>
      <p class="nota-demo">La clase queda pedida y ${esc(profe.nombre.split(" ")[0])} la confirma con un toque. Se paga por transferencia o en efectivo.</p>
    </form>
  </div>`;
}

function refrescarTurnero(error = "") {
  const nombre = $("#t-nombre")?.value ?? "", cel = $("#t-cel")?.value ?? "";
  $("#reservar").innerHTML = htmlTurnero(error);
  if ($("#t-nombre")) { $("#t-nombre").value = nombre; $("#t-cel").value = cel; }
}

function pedirTurno() {
  const nombre = $("#t-nombre").value.trim(), cel = $("#t-cel").value.replace(/\D/g, "");
  if (!turno.hora) return refrescarTurnero("Elegí un horario.");
  if (nombre.length < 2) return refrescarTurnero("Escribí tu nombre.");
  if (cel.length < 8) return refrescarTurnero("Revisá el celular: tiene que tener al menos 8 números.");
  const profe = PROFES.find((p) => p.id === turno.profeId);
  estado.tomadas.get(profe.id).add(`${turno.fecha} ${turno.hora}`);
  const cuando = `${DIAS[M.diaSemana(turno.fecha)]} ${Number(turno.fecha.slice(8))} a las ${turno.hora}`;
  $("#reservar").innerHTML = `<div class="listo" role="status" tabindex="-1">
    <b>Listo, pediste la clase del ${esc(cuando)}.</b>
    <span>A ${esc(profe.nombre.split(" ")[0])} le aparece en «Pendientes» con tu nombre. Cuando la confirma, te llega por WhatsApp el precio, el alias y tu link de alumno: desde ahí mandás el comprobante, repetís la clase o la cancelás.</span>
    <span class="nota-demo">Demo: no se envió nada. El horario queda ocupado mientras no recargues la página.</span></div>`;
  turno.hora = null;
  $("#reservar .listo").focus();
}

// ── Puntuar una clase (lo que ve el alumno desde su link, después de una clase dada) ─────────────────────

function hojaResena(error = "", valores = {}) {
  const c = estado.claseDemo;
  const profe = PROFES.find((p) => p.id === c.profeId);
  const sede = profe.sedes[0];
  if (c.resenada) {
    return `<div class="hoja-cab"><div><h2 id="hoja-titulo">Ya puntuaste esta clase</h2></div><button class="cerrar" type="button" data-accion="cerrar" aria-label="Cerrar">×</button></div>
      <p>Cada clase dada se puntúa una vez. Tu próxima clase con ${esc(profe.nombre.split(" ")[0])} trae un link nuevo.</p>
      <p><button class="btn btn-pri" type="button" data-profe="${profe.id}">Ver la ficha de ${esc(profe.nombre)}</button></p>`;
  }
  const criterios = M.CRITERIOS.map((cr) => `
    <fieldset class="criterio"><legend>${esc(cr.nombre)}</legend>
      <div class="estrellas">${[1, 2, 3, 4, 5].map((v) => `<label><input type="radio" name="p-${cr.id}" value="${v}" ${valores[cr.id] === v ? "checked" : ""} aria-label="${esc(cr.nombre)}: ${v} de 5"><span>${v}</span></label>`).join("")}</div>
    </fieldset>`).join("");
  return `
    <div class="hoja-cab">
      <div><p class="paso">Link del alumno · clase dada</p><h2 id="hoja-titulo">¿Cómo estuvo tu clase con ${esc(profe.nombre.split(" ")[0])}?</h2></div>
      <button class="cerrar" type="button" data-accion="cerrar" aria-label="Cerrar">×</button>
    </div>
    <div class="turnero">
      <p><b>${esc(profe.nombre)}</b> · ${DIAS[M.diaSemana(c.fecha)]} ${fechaCorta(c.fecha)} a las ${c.hora} · ${esc(sede.club)}</p>
      <p class="verif">${tildeVerif} ${esc(profe.nombre.split(" ")[0])} la marcó como dada en su agenda</p>
    </div>
    <form class="form" id="form-resena" novalidate>
      ${criterios}
      <label class="campo"><span>Contá algo (opcional)</span>
        <textarea id="r-texto" maxlength="${M.REGLAS.largoMaxTexto + 50}" placeholder="Qué trabajaron, qué te sirvió">${esc(valores.texto ?? "")}</textarea>
        <span class="nota-demo"><span id="r-cuenta" class="num">${(valores.texto ?? "").length}</span> de ${M.REGLAS.largoMaxTexto}. Sin teléfonos, links ni arrobas.</span></label>
      <div role="alert">${error ? `<p class="error">${esc(error)}</p>` : ""}</div>
      <button class="btn btn-pri" type="submit">Publicar mi reseña</button>
      <p class="nota-demo">Se publica tu nombre y la inicial del apellido. Si sos menor, puntúa tu mamá, papá o quien te lleve a la clase. El link vence a los ${M.REGLAS.diasParaResenar} días.</p>
    </form>`;
}

function enviarResena() {
  const puntos = {};
  for (const c of M.CRITERIOS) {
    const marcado = document.querySelector(`input[name="p-${c.id}"]:checked`);
    puntos[c.id] = marcado ? Number(marcado.value) : undefined;
  }
  const texto = $("#r-texto").value;
  const r = M.validarResena({ clase: estado.claseDemo, token: "demo-token", puntos, texto, ahora: `${HOY}T15:00:00Z` });
  if (!r.ok) {
    $("#hoja").innerHTML = hojaResena(r.error, { ...puntos, texto });
    $("#hoja [role=alert]")?.scrollIntoView({ block: "nearest" });
    $("#form-resena button[type=submit]")?.focus();
    return;
  }
  const profe = PROFES.find((p) => p.id === estado.claseDemo.profeId);
  r.resena.alumno = "Vos";
  profe.resenas.push(r.resena);
  estado.claseDemo.resenada = true;
  estado.ultimaResena = r.resena.id;
  pintar();
  abrirHoja(fichaProfe(profe.id, {
    mensaje: `<div class="listo" role="status"><b>Listo, tu reseña ya está en la ficha.</b><span>Cuenta como verificada porque sale de una clase dada en la agenda de ${esc(profe.nombre.split(" ")[0])}.</span></div>`,
  }));
}

// ── Página para profes ───────────────────────────────────────────────────────────────────────────────

function armarPlanes() {
  $("#planes").innerHTML = PLANES.map((p) => `
    <tr${p.destacado ? ' class="destacado"' : ""}><th scope="row" style="color:var(--ink);font-size:15px;text-transform:none;letter-spacing:0">${esc(p.nombre)}</th>
    <td class="plata">${p.precio ? M.plata(p.precio) : "Gratis"}</td><td>${esc(p.incluye)}</td><td>${esc(p.para)}</td></tr>`).join("");
  $("#sumate").addEventListener("submit", (e) => {
    e.preventDefault();
    const nombre = $("#s-nombre").value.trim(), cel = $("#s-cel").value.replace(/\D/g, "");
    const msg = $("#s-msg");
    if (nombre.length < 3) { msg.innerHTML = `<p class="error">Escribí tu nombre y apellido.</p>`; return $("#s-nombre").focus(); }
    if (cel.length < 8) { msg.innerHTML = `<p class="error">Revisá el celular: tiene que tener al menos 8 números.</p>`; return $("#s-cel").focus(); }
    msg.innerHTML = `<div class="listo"><b>Gracias, ${esc(nombre.split(" ")[0])}.</b><span>En la versión real, te escribimos por WhatsApp para mostrarte la app en 10 minutos. En esta demo no se guardó ni se envió nada.</span></div>`;
  });
}

function mostrarVista(cual) {
  for (const [tab, vista] of [["#tab-buscar", "#vista-buscar"], ["#tab-profe", "#vista-profe"]]) {
    const on = vista === `#vista-${cual}`;
    $(tab).setAttribute("aria-selected", String(on));
    $(vista).hidden = !on;
  }
  try { localStorage.setItem("bandeja.vista", cual); } catch { /* sin almacenamiento */ }
  window.scrollTo({ top: 0 });
}

function toast(texto) {
  const t = $("#toast");
  t.textContent = texto;
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { t.hidden = true; }, 3200);
}

// ── Eventos ──────────────────────────────────────────────────────────────────────────────────────────

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-profe], [data-accion], [data-club], [data-fecha], [data-hora]");
  if (!el) return;
  if (el.dataset.accion === "cerrar") return cerrarHoja();
  if (el.dataset.accion === "ampliar") { $("#f-radio").value = "0"; return leerFiltros(); }
  if (el.dataset.accion === "denunciar") return toast("En la real, la denuncia la revisamos en 48 horas y avisamos al profe y al alumno. En la demo no se envió nada.");
  if (el.dataset.accion === "turnero") {
    turno.profeId = el.dataset.profe; turno.fecha = null; turno.hora = null;
    refrescarTurnero();
    return $("#reservar .dia")?.focus();
  }
  if (el.dataset.fecha) { turno.fecha = el.dataset.fecha; turno.hora = null; refrescarTurnero(); return $(`[data-fecha="${turno.fecha}"]`)?.focus(); }
  if (el.dataset.hora) { turno.hora = el.dataset.hora; refrescarTurnero(); return $(`[data-hora="${turno.hora}"]`)?.focus(); }
  if (el.dataset.club) {
    $("#f-texto").value = el.dataset.club;
    leerFiltros();
    return $(`#mapa [data-club="${CSS.escape(el.dataset.club)}"]`)?.focus();
  }
  if (el.dataset.profe) {
    abrirHoja(fichaProfe(el.dataset.profe));
    pintar();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("#hoja").hidden) return cerrarHoja();
  if ((e.key === "Enter" || e.key === " ") && e.target.matches?.(".pin")) { e.preventDefault(); e.target.dispatchEvent(new MouseEvent("click", { bubbles: true })); }
  // Foco atrapado en la hoja abierta.
  if (e.key === "Tab" && !$("#hoja").hidden) {
    const f = [...$("#hoja").querySelectorAll("button, input, textarea, select, a[href]")].filter((x) => !x.disabled);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); }
    else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); }
  }
});

document.addEventListener("submit", (e) => {
  if (e.target.id === "form-turno") { e.preventDefault(); pedirTurno(); }
  if (e.target.id === "form-resena") { e.preventDefault(); enviarResena(); }
});
document.addEventListener("input", (e) => {
  if (e.target.id === "r-texto") $("#r-cuenta").textContent = String(e.target.value.length);
});

$("#velo").addEventListener("click", cerrarHoja);
$("#tab-buscar").addEventListener("click", () => mostrarVista("buscar"));
$("#tab-profe").addEventListener("click", () => mostrarVista("profe"));
$("#probar-resena").addEventListener("click", () => abrirHoja(hojaResena(), "input[type=radio]"));
$("#verPlano").addEventListener("click", () => {
  const plegado = $("#plano").classList.toggle("plegado");
  $("#verPlano").setAttribute("aria-expanded", String(!plegado));
  $("#verPlano").textContent = plegado ? "Ver en el plano" : "Ocultar el plano";
});

armarFiltros();
armarPlanes();
if (location.hash === "#profe") mostrarVista("profe");
else {
  try { if (localStorage.getItem("bandeja.vista") === "profe") mostrarVista("profe"); } catch { /* idem */ }
}
