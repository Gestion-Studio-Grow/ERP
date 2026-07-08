// Controlador de la versión ARTIFACT (archivo único, navegable sin servidor).
// Hash-router sobre vistas PRE-RENDERIZADAS (window.__ROUTES__, generadas por build-artifact.ts
// reusando render.ts) + la MISMA lógica pura del carrito (checkout.ts). Sin backend, sin datos
// reales: es la demo (ADR-030/031). Navegación por location.hash en vez de rutas de servidor.

import {
  agregarAlCarrito,
  normalizarCarrito,
  quitarDelCarrito,
  setCantidad,
  resumirCarrito,
  generarOrdenDemo,
  formatARS,
  type LineaCarrito,
} from "./checkout";

declare global {
  interface Window {
    __ROUTES__: Record<string, string>;
  }
}

const LS_CART = "plantilleria.cart.v1";
const LS_LAST = "plantilleria.lastOrder.v1";
const ROUTES = window.__ROUTES__ || {};

// --- persistencia ------------------------------------------------------------

function leerCarrito(): LineaCarrito[] {
  try {
    return normalizarCarrito(JSON.parse(localStorage.getItem(LS_CART) ?? "[]"));
  } catch {
    return [];
  }
}
function guardarCarrito(c: LineaCarrito[]): void {
  localStorage.setItem(LS_CART, JSON.stringify(c));
  pintarContador();
}

// --- helpers UI --------------------------------------------------------------

function toast(msg: string): void {
  const el = document.querySelector<HTMLElement>("[data-toast]");
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  el.classList.add("show");
  window.setTimeout(() => {
    el.classList.remove("show");
    window.setTimeout(() => (el.hidden = true), 250);
  }, 1800);
}
function pintarContador(): void {
  const { totalItems } = resumirCarrito(leerCarrito());
  document.querySelectorAll<HTMLElement>("[data-cart-count]").forEach((el) => {
    el.textContent = String(totalItems);
    el.hidden = totalItems === 0;
  });
}

// --- wiring por vista (reusa la lógica pura, con navegación por hash) ---------

function wireBotonesAgregar(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>("[data-add]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const slug = btn.getAttribute("data-add");
      if (!slug) return;
      guardarCarrito(agregarAlCarrito(leerCarrito(), slug, 1));
      toast("Agregado al carrito 🛒");
    });
  });
  root.querySelectorAll<HTMLElement>("[data-buy]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const slug = btn.getAttribute("data-buy");
      if (slug) guardarCarrito(agregarAlCarrito(leerCarrito(), slug, 1));
    });
  });
}

function renderCarrito(root: HTMLElement): void {
  const cont = root.querySelector<HTMLElement>("[data-cart-view]");
  if (!cont) return;
  const resumen = resumirCarrito(leerCarrito());
  if (resumen.vacio) {
    cont.innerHTML = `<p class="soft">Tu carrito está vacío. <a href="#/">Elegí una plantilla →</a></p>`;
    return;
  }
  const filas = resumen.lineas
    .map(
      (l) => `<div class="cart-row" data-row="${l.slug}">
        <div class="cart-row-main">
          <span class="cart-emoji" aria-hidden="true">${l.emoji}</span>
          <div>
            <p class="cart-nombre">${l.nombre}</p>
            <p class="precio-ars">US$${l.precioUSD} c/u · ≈ ${formatARS(l.precioARSref)} ARS</p>
          </div>
        </div>
        <div class="cart-row-controls">
          <div class="qty" role="group" aria-label="Cantidad de ${l.nombre}">
            <button class="qty-btn" data-dec="${l.slug}" aria-label="Restar uno">−</button>
            <span class="qty-n" data-qty="${l.slug}">${l.cantidad}</span>
            <button class="qty-btn" data-inc="${l.slug}" aria-label="Sumar uno">+</button>
          </div>
          <span class="cart-subtotal">US$${l.subtotalUSD}</span>
          <button class="link-quitar" data-del="${l.slug}" aria-label="Quitar ${l.nombre}">Quitar</button>
        </div>
      </div>`,
    )
    .join("");
  cont.innerHTML = `
    <div class="cart-list">${filas}</div>
    <div class="cart-total card">
      <div>
        <p class="cart-total-usd">Total: <strong>US$${resumen.totalUSD}</strong></p>
        <p class="precio-ars">≈ ${formatARS(resumen.totalARSref)} ARS de referencia</p>
      </div>
      <a class="btn btn-primario" href="#/checkout">Ir a pagar →</a>
    </div>
    <p class="fine mt">Pago con Mercado Pago en <strong>modo demo</strong>: no se cobra plata real.</p>`;

  cont.querySelectorAll<HTMLElement>("[data-inc]").forEach((b) =>
    b.addEventListener("click", () => cambiarCantidad(root, b.getAttribute("data-inc"), +1)),
  );
  cont.querySelectorAll<HTMLElement>("[data-dec]").forEach((b) =>
    b.addEventListener("click", () => cambiarCantidad(root, b.getAttribute("data-dec"), -1)),
  );
  cont.querySelectorAll<HTMLElement>("[data-del]").forEach((b) =>
    b.addEventListener("click", () => {
      const slug = b.getAttribute("data-del");
      if (!slug) return;
      guardarCarrito(quitarDelCarrito(leerCarrito(), slug));
      renderCarrito(root);
    }),
  );
}
function cambiarCantidad(root: HTMLElement, slug: string | null, delta: number): void {
  if (!slug) return;
  const actual = resumirCarrito(leerCarrito()).lineas.find((l) => l.slug === slug);
  const nueva = (actual?.cantidad ?? 0) + delta;
  guardarCarrito(setCantidad(leerCarrito(), slug, nueva));
  renderCarrito(root);
}

function renderCheckout(root: HTMLElement): void {
  const cont = root.querySelector<HTMLElement>("[data-checkout]");
  if (!cont) return;
  const resumen = resumirCarrito(leerCarrito());
  if (resumen.vacio) {
    cont.innerHTML = `<div class="card"><p class="soft">No hay nada para pagar.
      <a href="#/">Elegí una plantilla →</a></p></div>`;
    return;
  }
  const items = resumen.lineas
    .map(
      (l) =>
        `<li><span>${l.emoji} ${l.nombre}${l.cantidad > 1 ? ` ×${l.cantidad}` : ""}</span><span>US$${l.subtotalUSD}</span></li>`,
    )
    .join("");
  cont.innerHTML = `
    <div class="mp-grid">
      <div class="card mp-resumen">
        <h2>Tu compra</h2>
        <ul class="mp-items">${items}</ul>
        <div class="mp-total">
          <span>Total</span>
          <strong>US$${resumen.totalUSD} <span class="precio-ars">≈ ${formatARS(resumen.totalARSref)} ARS</span></strong>
        </div>
      </div>
      <div class="card mp-pago">
        <div class="mp-brand"><span class="mp-logo">MP</span> Mercado Pago <span class="badge badge-demo">MODO DEMO</span></div>
        <p class="fine">Pantalla de pago simulada. No se cobra ni se guardan datos reales.</p>
        <label class="campo">
          <span>Email para la entrega</span>
          <input type="email" data-email placeholder="vos@ejemplo.com.ar" autocomplete="email" />
        </label>
        <div class="mp-metodos" role="radiogroup" aria-label="Medio de pago (demo)">
          <label class="mp-metodo"><input type="radio" name="mp" value="tarjeta" checked /> 💳 Tarjeta de crédito/débito</label>
          <label class="mp-metodo"><input type="radio" name="mp" value="cuenta" /> 💰 Dinero en cuenta</label>
          <label class="mp-metodo"><input type="radio" name="mp" value="pago-facil" /> 🏦 Efectivo (Pago Fácil / Rapipago)</label>
        </div>
        <button class="btn btn-primario btn-block" data-pagar>Pagar US$${resumen.totalUSD} (demo)</button>
        <p class="fine centro">🔒 Demo — no ingreses datos reales de tarjeta.</p>
      </div>
    </div>`;
  cont.querySelector<HTMLButtonElement>("[data-pagar]")?.addEventListener("click", () => pagarDemo());
}
function pagarDemo(): void {
  const resumen = resumirCarrito(leerCarrito());
  if (resumen.vacio) return;
  const emailEl = document.querySelector<HTMLInputElement>("[data-email]");
  const email = emailEl?.value.trim() || "demo@plantilleria.ar";
  const orden = generarOrdenDemo(Date.now());
  const principal = resumen.lineas[0];
  const last = {
    orden,
    email,
    nombre: resumen.lineas.length > 1 ? `pack de ${resumen.totalItems} plantillas` : principal.nombre,
    slug: principal.slug,
    totalUSD: resumen.totalUSD,
  };
  try {
    localStorage.setItem(LS_LAST, JSON.stringify(last));
  } catch {
    /* demo */
  }
  localStorage.removeItem(LS_CART);
  location.hash = "#/gracias";
}

function renderGracias(root: HTMLElement): void {
  const nombreEl = root.querySelector<HTMLElement>("[data-gracias-nombre]");
  const ordenEl = root.querySelector<HTMLElement>("[data-orden]");
  if (!nombreEl && !ordenEl) return;
  let last: { orden?: string; nombre?: string; email?: string } | null = null;
  try {
    last = JSON.parse(localStorage.getItem(LS_LAST) ?? "null");
  } catch {
    last = null;
  }
  if (last?.nombre && nombreEl) nombreEl.textContent = last.nombre;
  if (last?.orden && ordenEl) {
    ordenEl.hidden = false;
    ordenEl.textContent = `Orden ${last.orden} · enviada a ${last.email ?? "tu email"} (demo)`;
  }
}

// --- router por hash ---------------------------------------------------------

function parsePath(): string {
  const h = location.hash || "#/";
  if (!h.startsWith("#/")) return "/"; // ancla en la landing (#catalogo, #pack) → vista home
  return h.slice(1) || "/"; // "#/carrito" → "/carrito"
}

function render(): void {
  const app = document.querySelector<HTMLElement>("#app");
  if (!app) return;
  const path = parsePath();
  const html = ROUTES[path] ?? ROUTES["/"];
  app.innerHTML = html;
  // Wire de la vista recién montada.
  wireBotonesAgregar(app);
  renderCarrito(app);
  renderCheckout(app);
  renderGracias(app);
  pintarContador();
  // Anclas en la landing (#catalogo/#pack): scrollear; el resto, arriba.
  const anchor = location.hash.startsWith("#/") ? "" : location.hash.slice(1);
  if (anchor) {
    document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth" });
  } else {
    window.scrollTo(0, 0);
  }
}

window.addEventListener("hashchange", render);
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", render);
} else {
  render();
}
