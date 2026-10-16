// TIENDA del turnero — Break Point Pádel (/turnero#tienda). Módulo aparte: app.mjs lo carga recién cuando se abre
// la tienda (import() diferido). En el sitio publicado esbuild lo deja dentro del mismo turnero.html.
//
// Encargos para RETIRAR y PAGAR en el club: el jugador arma el pedido, pone nombre (y celular si quiere) y se arma el
// mensaje de WhatsApp con el código T-XXXX. Las reglas son del motor del club (catalogoTienda / crearPedidoTienda),
// vía la misma API del turnero (GET /api/tienda/catalogo · POST /api/tienda/pedidos):
//   · demo con el club en otra pestaña (bus): el pedido le llega al club en vivo (evento "pedido" del canal staff);
//   · modo pedido (?modo=pedido): el núcleo corre en esta pestaña sobre el club en blanco y sólo arma el mensaje.
// En los dos casos lo que confirma es el club: precios y stock son de referencia.

const $ = (s, r = document) => r.querySelector(s);
const pesos = (n) => `$${Math.round(n).toLocaleString("es-AR")}`;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const CLAVE = "bp-tienda-carrito";
const MAX_POR_PRODUCTO = 20;

/** Carrito { productoId: cant } de esta pestaña. sessionStorage puede no estar (modo privado, bloqueado): no rompe. */
function leerCarrito() {
  try {
    const c = JSON.parse(sessionStorage.getItem(CLAVE) ?? "{}");
    return c && typeof c === "object" && !Array.isArray(c) ? c : {};
  } catch { return {}; }
}
function guardarCarrito(c) {
  try { sessionStorage.setItem(CLAVE, JSON.stringify(c)); } catch { /* sin almacenamiento: el carrito vive mientras esté abierta */ }
}

/** Arma el link de WhatsApp (sin número: WhatsApp abre y el jugador elige el chat del club). PURA. */
export const linkPedido = (wa, texto) => `https://wa.me/${wa}?text=${encodeURIComponent(texto)}`;

/** Agrupa el catálogo por categoría, en el orden en que aparece. PURA. */
export function porCategoria(productos) {
  const grupos = new Map();
  for (const p of productos) (grupos.get(p.categoria) ?? grupos.set(p.categoria, []).get(p.categoria)).push(p);
  return [...grupos];
}

const GLOBO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M4 20l1.3-3.9A8 8 0 1 1 8 18.8z"/></svg>';
const X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

function crearDialogo() {
  const d = document.createElement("dialog");
  d.id = "dlg-tienda";
  d.className = "dlg-tienda";
  d.setAttribute("aria-labelledby", "t-tienda");
  d.innerHTML = `<div class="dlg-cab"><h2 id="t-tienda">Tienda del club</h2><form method="dialog"><button class="dlg-x" aria-label="Cerrar la tienda">${X}</button></form></div>
<div class="dlg-cuerpo">
  <p class="nota-tienda">Precios y stock de referencia; el club te confirma. Se retira y se paga en el club.</p>
  <div id="tienda-cat" aria-busy="true"><p class="vacio">Cargando los productos…</p></div>
  <section class="carrito" aria-labelledby="t-carrito">
    <h3 id="t-carrito">Tu pedido</h3>
    <ul id="carrito-lista"></ul>
    <p class="carrito-total">Total <b id="carrito-total" class="num">$0</b></p>
  </section>
  <form id="form-tienda" class="dlg-form" novalidate>
    <div class="campo"><label for="tienda-nombre">Tu nombre</label><input id="tienda-nombre" name="nombre" type="text" autocomplete="name" maxlength="60" required aria-describedby="tienda-error"></div>
    <div class="campo"><label for="tienda-tel">Celular <span class="hint">(opcional, por si el club te tiene que avisar)</span></label><input id="tienda-tel" name="tel" type="tel" autocomplete="tel" inputmode="tel" maxlength="30" placeholder="11 5555 1234" aria-describedby="tienda-error"></div>
    <p id="tienda-error" class="error" role="alert"></p>
    <button id="btn-tienda-pedir" type="submit" class="btn btn-pri btn-block">Hacer el pedido</button>
  </form>
  <div id="tienda-listo" class="tienda-listo" hidden>
    <p class="badge badge-ok">Pedido <span id="tienda-codigo" class="mono"></span></p>
    <p>Mandalo por WhatsApp así el club lo prepara. Lo retirás y lo pagás en el club.</p>
    <a id="tienda-wa" class="btn btn-wa btn-block" href="#" target="_blank" rel="noopener">${GLOBO}Mandar el pedido por WhatsApp</a>
    <p id="tienda-sin-wa" class="hint" hidden>Se abre WhatsApp: elegí el chat del club y mandá el mensaje.</p>
    <button id="btn-tienda-otro" type="button" class="btn btn-block">Hacer otro pedido</button>
  </div>
  <p id="tienda-anuncio" class="sr" role="status" aria-live="polite"></p>
</div>`;
  document.body.append(d);
  return d;
}

let T = null; // { d, productos, carrito, api, wa, alCerrar }

function pintarCatalogo() {
  const caja = $("#tienda-cat");
  caja.setAttribute("aria-busy", "false");
  if (!T.productos.length) { caja.innerHTML = '<p class="vacio">Ahora no hay productos en la tienda. Consultá en el club.</p>'; return; }
  caja.innerHTML = porCategoria(T.productos).map(([cat, ps]) => `<section class="cat" aria-label="${esc(cat)}"><h3>${esc(cat)}</h3><ul class="prods">${ps.map((p) => `<li class="prod">
  <span class="prod-nombre">${esc(p.nombre)}</span>
  <span class="prod-precio num">${pesos(p.precio)}</span>
  ${p.pocas ? '<span class="tag tag-pocas">Pocas unidades</span>' : ""}
  <span class="cant"><button type="button" class="cant-b" data-menos="${esc(p.id)}" aria-label="Sacar uno: ${esc(p.nombre)}">−</button><span class="cant-n num" data-cant="${esc(p.id)}" aria-hidden="true">0</span><button type="button" class="cant-b" data-mas="${esc(p.id)}" aria-label="Sumar uno: ${esc(p.nombre)}">+</button></span>
</li>`).join("")}</ul></section>`).join("");
  pintarCarrito();
}

function pintarCarrito() {
  const renglones = T.productos.filter((p) => T.carrito[p.id] > 0).map((p) => ({ p, cant: T.carrito[p.id] }));
  for (const el of T.d.querySelectorAll("[data-cant]")) el.textContent = String(T.carrito[el.dataset.cant] ?? 0);
  for (const b of T.d.querySelectorAll("[data-menos]")) b.disabled = !(T.carrito[b.dataset.menos] > 0);
  const total = renglones.reduce((s, r) => s + r.cant * r.p.precio, 0);
  $("#carrito-lista").innerHTML = renglones.length
    ? renglones.map(({ p, cant }) => `<li><span>${cant} × ${esc(p.nombre)}</span><span class="num">${pesos(cant * p.precio)}</span></li>`).join("")
    : '<li class="carrito-vacio">Todavía no sumaste nada.</li>';
  $("#carrito-total").textContent = pesos(total);
  return total;
}

function cambiarCantidad(id, delta) {
  const p = T.productos.find((x) => x.id === id);
  if (!p) return;
  const n = Math.max(0, Math.min(MAX_POR_PRODUCTO, (T.carrito[id] ?? 0) + delta));
  if (n) T.carrito[id] = n; else delete T.carrito[id];
  guardarCarrito(T.carrito);
  const total = pintarCarrito();
  $("#tienda-anuncio").textContent = `${p.nombre}: ${n}. Total ${pesos(total)}.`;
  $("#tienda-error").textContent = "";
}

async function pedir(e) {
  e.preventDefault();
  const nombre = $("#tienda-nombre").value.trim(), tel = $("#tienda-tel").value.trim();
  const items = Object.entries(T.carrito).filter(([id, c]) => c > 0 && T.productos.some((p) => p.id === id)).map(([productoId, cant]) => ({ productoId, cant }));
  const digitos = tel.replace(/\D/g, "").length;
  const error = !items.length ? ["Sumá al menos un producto.", null]
    : !nombre ? ["Poné tu nombre para el pedido.", "#tienda-nombre"]
    : tel && (digitos < 8 || digitos > 15) ? ["Revisá el celular: con código de área, ej. 11 5555 1234.", "#tienda-tel"]
    : null;
  for (const id of ["#tienda-nombre", "#tienda-tel"]) $(id).removeAttribute("aria-invalid");
  if (error) {
    $("#tienda-error").textContent = error[0];
    if (error[1]) { $(error[1]).setAttribute("aria-invalid", "true"); $(error[1]).focus(); }
    return;
  }
  const b = $("#btn-tienda-pedir");
  b.disabled = true;
  const r = await T.api("/api/tienda/pedidos", { metodo: "POST", cuerpo: { items, nombre, tel } });
  b.disabled = false;
  if (!r.ok) { $("#tienda-error").textContent = r.status === 404 ? "La tienda todavía no está habilitada en este club." : r.motivo ?? "No pudimos armar el pedido. Probá de nuevo."; return; }
  T.carrito = {};
  guardarCarrito(T.carrito);
  pintarCarrito();
  $("#tienda-codigo").textContent = r.pedido.codigo;
  $("#tienda-wa").href = linkPedido(T.wa, r.mensaje);
  $("#tienda-sin-wa").hidden = Boolean(T.wa);
  $("#form-tienda").hidden = true;
  $("#tienda-listo").hidden = false;
  $("#tienda-wa").focus();
}

function cablear() {
  T.d.addEventListener("click", (e) => {
    const mas = e.target.closest("[data-mas]"), menos = e.target.closest("[data-menos]");
    if (mas) cambiarCantidad(mas.dataset.mas, 1);
    else if (menos) cambiarCantidad(menos.dataset.menos, -1);
    else if (e.target.closest("#btn-tienda-otro")) { $("#tienda-listo").hidden = true; $("#form-tienda").hidden = false; $("#tienda-cat .cant-b[data-mas]")?.focus(); }
  });
  $("#form-tienda").addEventListener("submit", pedir);
  T.d.addEventListener("close", () => T.alCerrar?.());
}

/** Abre la tienda (la arma la primera vez). `api` es la del turnero (bus, local o back). */
export async function abrirTienda({ api, wa = "", alCerrar = () => {} }) {
  if (!T) {
    T = { d: crearDialogo(), productos: [], carrito: leerCarrito(), api, wa, alCerrar };
    cablear();
  }
  if (!T.d.open) T.d.showModal();
  const r = await api("/api/tienda/catalogo");
  if (!r.ok) {
    $("#tienda-cat").setAttribute("aria-busy", "false");
    $("#tienda-cat").innerHTML = `<p class="vacio" role="alert">${r.status === 404 ? "La tienda todavía no está habilitada en este club." : esc(r.motivo ?? "No pudimos cargar la tienda.")}</p>`;
    return;
  }
  T.productos = r.productos ?? [];
  // Lo que quedó en el carrito de un producto que ya no está, se saca.
  for (const id of Object.keys(T.carrito)) if (!T.productos.some((p) => p.id === id)) delete T.carrito[id];
  pintarCatalogo();
}
