// Render de páginas → HTML estático. Sin framework, sin runtime: template strings tipados.
// Copy criollo (ADR-044/046). El catálogo (data/catalogo.ts) es la única fuente de verdad.

import {
  PLANTILLAS,
  BUNDLE,
  getPlantilla,
  type Plantilla,
} from "../data/catalogo";
import { formatARS } from "./checkout";

// --- helpers de escape -------------------------------------------------------

/** Escapa texto para contenido HTML. */
export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Escapa para atributos con comillas dobles. */
function attr(s: string): string {
  return esc(s).replace(/"/g, "&quot;");
}

// --- chrome compartido -------------------------------------------------------

const FAQ_ITEMS: ReadonlyArray<{ q: string; a: string }> = [
  {
    q: "¿Cómo recibo la plantilla después de pagar?",
    a: "Al instante. Apenas se acredita el pago te llega un email con el archivo (o el link para hacer tu copia del Google Sheet / duplicar el Notion). También te redirigimos a una página con las instrucciones.",
  },
  {
    q: "¿En qué formato viene?",
    a: "Según la plantilla: Google Sheets y/o Excel (la mayoría), y algunas también en Notion. Podés usarla en la compu o el celular, sin instalar nada.",
  },
  {
    q: "¿Necesito saber de Excel o de contabilidad?",
    a: "No. Cargás tus datos en las celdas de color y la planilla calcula sola. Cada una viene con una hoja de instrucciones en criollo.",
  },
  {
    q: "¿Está actualizada a la normativa argentina?",
    a: "Sí. Las plantillas de monotributo, sueldos y demás tienen los topes, escalas y reglas vigentes de ARCA/AFIP y la LCT. Cuando cambia la normativa, actualizamos y te avisamos por email.",
  },
  {
    q: "¿Puedo pagar en pesos?",
    a: "Sí. El pago es con Mercado Pago (tarjeta, débito o dinero en cuenta), en pesos. El precio en dólares es la referencia con la que fijamos el valor.",
  },
  {
    q: "¿Esto reemplaza a mi contador?",
    a: "No. Son herramientas para ordenarte y ver tus números con claridad. No reemplazan el asesoramiento de un profesional matriculado; verificá siempre los valores vigentes en ARCA.",
  },
];

function faqHtml(): string {
  return `<div class="faq">${FAQ_ITEMS.map(
    (i) => `
    <details>
      <summary>${esc(i.q)}</summary>
      <p>${esc(i.a)}</p>
    </details>`,
  ).join("")}</div>`;
}

/** Cinta DEMO fija — deja EXPLÍCITO que no se cobra plata real ni hay datos reales. */
function bannerDemo(): string {
  return `<div class="demo-bar" role="note">
    🧪 <strong>Demo</strong> · Es una tienda de demostración: el pago con Mercado Pago está en
    <strong>modo demo</strong>, no se cobra plata real ni se guardan tus datos.
  </div>`;
}

function header(): string {
  return `<header class="header">
    <div class="contenedor header-in">
      <a href="/" class="logo">Plantillería<span class="logo-ar">.ar</span></a>
      <nav class="nav">
        <a href="/#catalogo">Plantillas</a>
        <a href="/#faq">Preguntas</a>
        <a class="cart-link" href="/carrito/" aria-label="Ver carrito">
          🛒 <span class="cart-count" data-cart-count hidden>0</span>
        </a>
        <a class="btn btn-primario btn-sm" href="/#catalogo">Ver catálogo</a>
      </nav>
    </div>
  </header>`;
}

function footer(): string {
  return `<footer class="footer">
    <div class="contenedor">
      <p class="footer-brand">Plantillería.ar</p>
      <p>Plantillas de gestión localizadas a la normativa argentina. Producto digital de
        Gestión Studio Grow.</p>
      <p class="footer-fine">Herramientas de organización. No reemplazan el asesoramiento de un
        contador matriculado. Verificá siempre los valores vigentes en ARCA/AFIP.</p>
      <p class="footer-fine">© 2026 Plantillería.ar — Todos los derechos reservados.</p>
      <p class="footer-seal">Hecho con estándar de calidad — <strong>Gestión Studio Grow</strong></p>
    </div>
  </footer>`;
}

export interface PageOpts {
  title: string;
  description: string;
  body: string;
  /** ruta relativa para <link rel=canonical> opcional (no crítica en demo) */
  canonical?: string;
}

/** Documento HTML completo con el sello GSG en <meta generator> (ADR-043). */
export function page(o: PageOpts): string {
  return `<!doctype html>
<html lang="es-AR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="generator" content="Gestión Studio Grow" />
  <meta name="description" content="${attr(o.description)}" />
  <title>${esc(o.title)}</title>
  <link rel="stylesheet" href="/globals.css" />
</head>
<body>
  ${bannerDemo()}
  ${header()}
  <main>${o.body}</main>
  ${footer()}
  <div class="toast" data-toast hidden></div>
  <script type="module" src="/app.js"></script>
</body>
</html>`;
}

// --- piezas reutilizables ----------------------------------------------------

function badgesFormato(p: Plantilla, max = 2): string {
  return p.formato
    .slice(0, max)
    .map((f) => `<span class="badge badge-fmt">${esc(f)}</span>`)
    .join("");
}

function precioBloque(precioUSD: number, precioARSref: number): string {
  return `<div class="precio-wrap">
    <span class="precio">US$${precioUSD}</span>
    <span class="precio-ars">≈ ${formatARS(precioARSref)} ARS</span>
  </div>`;
}

/** Botón "agregar al carrito" (lo cablea app.js con data-add). */
function btnAgregar(slug: string, label: string, extra = ""): string {
  return `<button class="btn btn-primario ${extra}" data-add="${attr(slug)}">${esc(label)}</button>`;
}

function cardPlantilla(p: Plantilla): string {
  return `<article class="card card-plant">
    <a class="card-link" href="/producto/${attr(p.slug)}/">
      <div class="badges">
        <span class="badge badge-ar">Normativa AR</span>
        ${badgesFormato(p)}
      </div>
      <div class="card-emoji" aria-hidden="true">${p.emoji}</div>
      <h3>${esc(p.nombre)}</h3>
      <p class="card-gancho">${esc(p.gancho)}</p>
    </a>
    <div class="card-foot">
      ${precioBloque(p.precioUSD, p.precioARSref)}
      <a class="btn btn-secundario btn-sm" href="/producto/${attr(p.slug)}/">Ver ficha →</a>
    </div>
    ${btnAgregar(p.slug, "Agregar al carrito", "btn-block btn-sm")}
  </article>`;
}

// --- páginas -----------------------------------------------------------------

export function landing(): string {
  const bloques = [
    {
      t: "El problema",
      d: "Las plantillas que bajás de internet son de México o España: monotributo que no existe, sueldos con otras leyes, finanzas que asumen precios estables.",
    },
    {
      t: "Lo nuestro",
      d: "Cada plantilla está localizada: escalas de ARCA, recategorización, SAC, descuentos de ley y lógica anti-inflación. Diseño prolijo, en criollo.",
    },
    {
      t: "El resultado",
      d: "Ordenás tu negocio o tu plata en una tarde, sin contratar un sistema caro ni saber de Excel. Cargás datos, la planilla calcula sola.",
    },
  ];
  const testimonios: ReadonlyArray<[string, string]> = [
    [
      "Me di cuenta de que estaba a un mes de pasarme de categoría. Me salvó de una multa.",
      "Rodrigo · monotributista",
    ],
    [
      "Cotizo los trabajos en 5 minutos y encima se ve profesional. Cerré más presupuestos.",
      "Vanina · gasista matriculada",
    ],
    ["Por fin sé cuánto gano de verdad en el kiosco cada día.", "Comercio de barrio · Rosario"],
  ];

  const body = `
  <section class="hero">
    <div class="contenedor hero-in">
      <span class="badge badge-ar">🇦🇷 Hechas para la Argentina real</span>
      <h1>Dejá de pelearte con planillas que no sirven para acá.</h1>
      <p class="lead">Plantillas de monotributo, presupuestos por oficio, caja de kiosco, sueldos y
        finanzas — con los topes de ARCA, el aguinaldo y la inflación ya adentro. Las descargás y las
        usás hoy.</p>
      <div class="cta-row">
        <a class="btn btn-primario" href="#catalogo">Ver las 5 plantillas →</a>
        <a class="btn btn-secundario" href="#pack">Llevar el pack (US$${BUNDLE.precioUSD})</a>
      </div>
      <p class="hero-fine">Descarga inmediata · Pago con Mercado Pago · Sin suscripciones</p>
    </div>
  </section>

  <section class="seccion-alt">
    <div class="contenedor grid grid-3">
      ${bloques
        .map(
          (b) => `<div class="card"><h3>${esc(b.t)}</h3><p class="soft">${esc(b.d)}</p></div>`,
        )
        .join("")}
    </div>
  </section>

  <section id="catalogo">
    <div class="contenedor">
      <div class="centro estrecho">
        <h2>El catálogo</h2>
        <p class="lead">Elegí la que resuelve tu dolor. Todas one-time, sin suscripción.</p>
      </div>
      <div class="grid grid-3">
        ${PLANTILLAS.map(cardPlantilla).join("")}
      </div>
    </div>
  </section>

  <section id="pack" class="seccion-alt">
    <div class="contenedor">
      <div class="card centro pack">
        <span class="badge">Mejor precio</span>
        <div class="card-emoji" aria-hidden="true">${BUNDLE.emoji}</div>
        <h2>${esc(BUNDLE.nombre)}</h2>
        <p class="lead">${esc(BUNDLE.gancho)}</p>
        <div class="pack-precio">
          <span class="tachado">US$${BUNDLE.precioUSD + BUNDLE.ahorroUSD}</span>
          <span class="precio precio-accent">US$${BUNDLE.precioUSD}</span>
          <div class="precio-ars">≈ ${formatARS(BUNDLE.precioARSref)} ARS · ahorrás US$${BUNDLE.ahorroUSD}</div>
        </div>
        ${btnAgregar(BUNDLE.slug, `Llevar las 5 por US$${BUNDLE.precioUSD}`)}
      </div>
    </div>
  </section>

  <section>
    <div class="contenedor centro">
      <h2>Lo que dicen los que ya la usan</h2>
      <p class="lead nota-demo">Testimonios de muestra para la demo — se reemplazan por reseñas reales
        con las primeras ventas.</p>
      <div class="grid grid-3">
        ${testimonios
          .map(
            ([t, a]) =>
              `<div class="card"><p class="cita">“${esc(t)}”</p><p class="cita-autor">${esc(a)}</p></div>`,
          )
          .join("")}
      </div>
    </div>
  </section>

  <section id="faq" class="seccion-alt">
    <div class="contenedor">
      <h2 class="centro">Preguntas frecuentes</h2>
      ${faqHtml()}
    </div>
  </section>`;

  return page({
    title: "Plantillería AR — Plantillas hechas para la Argentina real",
    description:
      "Planillas de monotributo, presupuestos por oficio, caja de kiosco, sueldos y finanzas, localizadas a la normativa argentina (ARCA, monotributo, LCT). Descarga inmediata.",
    body,
  });
}

export function producto(p: Plantilla): string {
  const body = `
  <section>
    <div class="contenedor estrecho-md">
      <a class="volver" href="/#catalogo">← Volver al catálogo</a>

      <div class="prod">
        <div class="prod-head">
          <div class="badges">
            <span class="badge badge-ar">Normativa AR</span>
            ${p.formato.map((f) => `<span class="badge badge-fmt">${esc(f)}</span>`).join("")}
          </div>
          <div class="card-emoji card-emoji-lg" aria-hidden="true">${p.emoji}</div>
          <h1>${esc(p.nombre)}</h1>
          <p class="lead">${esc(p.gancho)}</p>
        </div>

        <div class="card compra">
          ${precioBloque(p.precioUSD, p.precioARSref)}
          ${btnAgregar(p.slug, "Agregar al carrito", "btn-block")}
          <a class="btn btn-secundario btn-block btn-comprar-ya" href="/carrito/"
             data-buy="${attr(p.slug)}">Comprar ahora →</a>
          <p class="fine">Descarga inmediata por email · Pago único con Mercado Pago · Sin suscripción</p>
        </div>

        <div>
          <h2>¿Para quién es?</h2>
          <p class="soft">${esc(p.publico)}</p>
          <h3>El problema que resuelve</h3>
          <p class="soft">${esc(p.dolor)}</p>
        </div>

        <div>
          <h2>Qué incluye</h2>
          <ul class="lista-check">${p.incluye.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>
        </div>

        <div class="card normativa">
          <h3>Normativa argentina embebida</h3>
          <ul class="lista-check">${p.normativa.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>
        </div>

        <p class="disclaimer">Herramienta de organización. No reemplaza el asesoramiento de un
          contador matriculado. Verificá siempre los valores vigentes en ARCA/AFIP.</p>

        <div class="centro">
          ${btnAgregar(p.slug, `Llevar ${p.nombre} — US$${p.precioUSD}`)}
        </div>

        <div>
          <h2 class="centro">Preguntas frecuentes</h2>
          ${faqHtml()}
        </div>
      </div>
    </div>
  </section>`;

  return page({
    title: `${p.nombre} — Plantillería AR`,
    description: p.gancho,
    body,
  });
}

/** Carrito: la lista real la pinta app.js desde localStorage; esto es el cascarón + fallback. */
export function carrito(): string {
  const body = `
  <section>
    <div class="contenedor estrecho-md">
      <h1>Tu carrito</h1>
      <div data-cart-view>
        <p class="soft" data-cart-empty>Tu carrito está vacío. <a href="/#catalogo">Elegí una plantilla →</a></p>
      </div>
    </div>
  </section>`;
  return page({
    title: "Tu carrito — Plantillería AR",
    description: "Revisá las plantillas que elegiste antes de pagar.",
    body,
  });
}

/** Checkout Mercado Pago en MODO DEMO: pantalla de pago simulada, sin cobro real. */
export function checkout(): string {
  const body = `
  <section>
    <div class="contenedor estrecho-md">
      <a class="volver" href="/carrito/">← Volver al carrito</a>
      <h1>Pagar</h1>

      <div class="mp-demo" data-checkout>
        <p class="soft">Cargando el resumen de tu compra…</p>
      </div>
    </div>
  </section>`;
  return page({
    title: "Checkout (demo) — Plantillería AR",
    description: "Checkout de demostración con Mercado Pago en modo demo. No se cobra plata real.",
    body,
  });
}

/** Página de gracias / entrega. app.js completa el nombre del producto y la orden demo. */
export function gracias(): string {
  const upsell = PLANTILLAS.find((x) => x.destacada);
  const body = `
  <section>
    <div class="contenedor centro estrecho-md">
      <div class="tilde" aria-hidden="true">✓</div>
      <h1>¡Gracias por tu compra! 🎉</h1>
      <p class="lead">Tu <strong data-gracias-nombre>plantilla</strong> ya está en camino a tu email.</p>
      <p class="orden-demo" data-orden hidden></p>

      <div class="card txt-left">
        <h3>Cómo empezar a usarla</h3>
        <ol class="soft pasos">
          <li>Revisá tu casilla (y la carpeta de spam/promociones) — te llegó un email con el archivo o el link.</li>
          <li>Si es Google Sheets: abrí el link y hacé <strong>Archivo → Crear una copia</strong> para tener
            tu versión editable. Si es Notion: tocá <strong>Duplicar</strong> arriba a la derecha.</li>
          <li>Si es Excel: descargá el archivo adjunto y abrilo con Excel, Google Sheets o LibreOffice.</li>
          <li>Empezá por la hoja <strong>“Instrucciones”</strong> — te guía paso a paso.</li>
        </ol>
        <p class="fine">¿No te llegó en 10 minutos? Escribinos y te lo reenviamos al toque.</p>
      </div>

      ${
        upsell
          ? `<div class="card txt-left">
        <span class="badge">Te puede servir</span>
        <h3>${esc(upsell.nombre)}</h3>
        <p class="soft">${esc(upsell.gancho)}</p>
        <a class="btn btn-secundario" href="/producto/${attr(upsell.slug)}/">Ver plantilla →</a>
      </div>`
          : ""
      }

      <p class="mt"><a href="/#catalogo">← Volver al catálogo</a></p>
    </div>
  </section>`;
  return page({
    title: "¡Gracias! — Plantillería AR",
    description: "Gracias por tu compra en Plantillería AR.",
    body,
  });
}

// Reexport para el build.
export { PLANTILLAS, BUNDLE, getPlantilla };
