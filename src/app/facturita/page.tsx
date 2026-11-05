// FACTURITA · Vidriera pública — la puerta de entrada del producto C (ADR-076).
// Tiene que vender en cinco segundos: qué es, para quién, que es gratis y cómo se empieza.
// `force-static` sin base (PD-1): todo lo que muestra sale de constantes (planes, pasos), así
// el build no golpea Neon y la página carga de la CDN.
//
// Rediseño 29/10/2026 «el talonario que se desprende» (fronts/facturita/DISENO.md): un teléfono
// dibujado con los tres toques reales y la hoja que se arranca (Talonario, simulador SÓLO de
// navegador, «sin validez fiscal»). Textos fiscales intactos: pasaron cuatro vueltas de contador
// (docs/producto/facturita/GATE.md).

import type { Metadata } from "next";
import Link from "next/link";
import { ACLARACION_IVA, PLAN_FACTURITA, PLAN_SALTO, precioTexto } from "@/lib/facturita-planes";
import { LIMITE_FACTURAS_FACTURITA } from "@/lib/facturita-core";
import { HOSTS_DE_PRODUCTO } from "@/lib/producto-host";
import VidrieraMarco from "./VidrieraMarco";
import { BOTON_PRINCIPAL } from "./estilos";
import InstalarApp from "./InstalarApp";
import Talonario from "./Talonario";
import Hoja, { EJEMPLO } from "./Hoja";

export const dynamic = "force-static";

// og:image ABSOLUTA (trampa vidriera-de-autor §5: relativa sale con el host del deploy). La página
// es estática y no puede leer el host del request: se usa el host público de Facturita, el mismo
// que la manda a esta vidriera (src/lib/producto-host.ts).
const HOST_PUBLICO = Object.keys(HOSTS_DE_PRODUCTO).find((h) => HOSTS_DE_PRODUCTO[h] === "/facturita");
const OG_IMAGEN = HOST_PUBLICO ? `https://${HOST_PUBLICO}/facturita/og.webp` : "/facturita/og.webp";

export const metadata: Metadata = {
  title: "Facturita — facturá desde el celu, sin vueltas. Gratis",
  description: `Emití facturas electrónicas desde el celu y mandalas a ARCA para su autorización. ${LIMITE_FACTURAS_FACTURITA} gratis por mes, sin tarjeta, para monotributistas y comercios chicos.`,
  generator: "Gestión Studio Grow",
  openGraph: {
    title: "Facturita — facturá desde el celu, sin vueltas",
    description: `${LIMITE_FACTURAS_FACTURITA} facturas gratis por mes, sin tarjeta. Si sos monotributista, sin saber de letras ni alícuotas.`,
    locale: "es_AR",
    type: "website",
    images: [
      { url: OG_IMAGEN, width: 1200, height: 630, type: "image/webp", alt: "Facturita: facturá desde el celu, sin vueltas" },
    ],
  },
  twitter: { card: "summary_large_image" },
};

const PASOS = [
  { t: "Contá qué vendiste", d: "Una línea y el total. Sin catálogo, sin configurar nada." },
  { t: "Decí a quién", d: "Consumidor final, o con CUIT o DNI (con CUIT, cómo está inscripto). La letra sale sola: C si sos monotributista o exento, B si sos inscripto y le vendés a un consumidor final o a un exento." },
  { t: "Va a ARCA", d: "La mandamos a ARCA para que la autorice. Si ARCA responde, en el momento ves el número y el CAE; si tarda, queda pendiente y sale apenas conteste." },
];

const PREGUNTAS = [
  {
    p: "¿Es gratis de verdad?",
    r: `Sí. Hasta ${LIMITE_FACTURAS_FACTURITA} facturas por mes no pagás nada y no te pedimos tarjeta. Si un mes necesitás más, te avisamos antes y vos decidís si pasás a Comerciante.`,
  },
  {
    p: "¿Qué necesito para empezar?",
    r: "Tu CUIT, tu clave fiscal de ARCA y un punto de venta para facturación electrónica. Si no tenés el punto de venta, en el alta te explicamos cómo crearlo en ARCA, paso a paso.",
  },
  {
    p: "¿Les tengo que dar mi clave fiscal?",
    r: "No, nunca. Desde ARCA nos das permiso sólo para emitir facturas a tu nombre (se llama «delegar el servicio»). Lo podés sacar cuando quieras, y tu clave queda con vos.",
  },
  {
    p: "¿Sirve si soy responsable inscripto?",
    r: "Sí, para la Factura B: a consumidores finales y a exentos, con la alícuota que elijas (21, 10,5 o 27 %), una por factura. La Factura A (a otro inscripto o a un monotributista) todavía no sale desde Facturita: esa hacela desde ARCA por ahora.",
  },
  {
    p: "¿Puedo cobrar con Mercado Pago o subir el extracto del banco?",
    r: "Eso es de Comerciante: ahí las facturas se arman solas con lo que te entra al banco y a Mercado Pago. Pasás en el mismo lugar, sin perder nada de lo que ya emitiste.",
  },
];

// «Así sale»: cada parte de la hoja, con su número en la hoja grande.
const PARTES = [
  {
    t: "La letra",
    d: "La letra sale sola: C si sos monotributista o exento, B si sos inscripto y le vendés a un consumidor final o a un exento. La A, por ahora, desde ARCA.",
  },
  { t: "El número", d: "Los primeros cinco números son tu punto de venta; los ocho que siguen, el número de la factura." },
  { t: "A quién", d: "Consumidor final, o con CUIT, CUIL o DNI." },
  { t: "El CAE", d: "ARCA te da el CAE: el número que dice que la factura es válida." },
  { t: "El QR de ARCA", d: "Va en el PDF, para que tu cliente la pueda verificar escaneándolo." },
];

export default function FacturitaLanding() {
  return (
    <VidrieraMarco barraFija="tras-cta">
      {/* 1 · Héroe: lo que vende en cinco segundos + el talonario */}
      <section aria-labelledby="titulo" className="fx-heroe">
        <div className="fx-caja fx-heroe-grilla">
          <div>
            <p className="fx-ante">Para monotributistas y comercios chicos</p>
            <h1 id="titulo" className="fx-h1">
              Facturá desde el celu, sin vueltas. <em>Gratis.</em>
            </h1>
            <p className="fx-lead">
              Facturita es un emisor de facturas electrónicas que se usa desde el celu, sin instalar programas y con{" "}
              {LIMITE_FACTURAS_FACTURITA} facturas por mes sin pagar un peso. Si sos monotributista, no tenés que saber de
              letras ni alícuotas; si sos inscripto, elegís la alícuota y cómo está inscripto tu comprador.
            </p>
            <div className="fx-acciones">
              <Link id="cta-heroe" href="/facturita/alta" className={BOTON_PRINCIPAL}>
                Empezar gratis
              </Link>
              <Link href="/admin/login" className="fx-enlace">
                Ya tengo cuenta, quiero ingresar
              </Link>
            </div>
            <ul className="fx-garantias" aria-label="Lo que tenés que saber">
              <li>Se autoriza en ARCA, con CAE</li>
              <li>Sin tarjeta</li>
              <li>Tu clave fiscal queda con vos</li>
            </ul>
          </div>
          <Talonario />
        </div>
      </section>

      {/* 3 · Así de corto */}
      <section aria-labelledby="como" className="fx-seccion fx-seccion--papel">
        <div className="fx-caja">
          <h2 id="como" className="fx-h2 fx-aparece">
            Así de <em>corto</em>
          </h2>
          <ol className="fx-pasos">
            {PASOS.map((paso, i) => (
              <li key={paso.t} className="fx-paso fx-aparece">
                <span className="fx-paso-n" aria-hidden="true">
                  {i + 1}
                </span>
                <h3 className="fx-h3">
                  <span className="sr-only">Paso {i + 1}: </span>
                  {paso.t}
                </h3>
                <p>{paso.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 4 · Así sale: la «ficha» del producto */}
      <section aria-labelledby="asi-sale" className="fx-seccion">
        <div className="fx-caja">
          <h2 id="asi-sale" className="fx-h2 fx-aparece">
            Así <em>sale</em>
          </h2>
          <p className="fx-bajada">Esta hoja es de ejemplo, con datos inventados. Lo que señalamos es lo que vas a ver en las tuyas.</p>
          <div className="fx-asi-grilla">
            <figure className="fx-hoja fx-hoja--grande fx-aparece" aria-label="Factura de ejemplo con sus partes numeradas, sin validez fiscal">
              <Hoja detalle={EJEMPLO.detalle} total={EJEMPLO.total} destinatario={EJEMPLO.destinatario} emitida grande conQr />
            </figure>
            <ol className="fx-partes">
              {PARTES.map((p, i) => (
                <li key={p.t}>
                  <span className="fx-marca-n" aria-hidden="true">
                    {i + 1}
                  </span>
                  <div>
                    <h3>{p.t}</h3>
                    <p>{p.d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* 5 · Planes: lo gratis y el salto */}
      <section aria-labelledby="planes" className="fx-seccion fx-seccion--papel">
        <div className="fx-caja">
          <h2 id="planes" className="fx-h2 fx-aparece">
            Arrancás <em>gratis.</em> Crecés sin mudarte.
          </h2>
          <p className="fx-bajada">
            Cuando necesites más, pasás a Comerciante en el mismo lugar: tus facturas y tus datos quedan donde estaban.
          </p>
          <div className="fx-precios">
            <article aria-labelledby="plan-gratis" className="fx-hoja-plan fx-aparece">
              <h3 id="plan-gratis" className="fx-h3">
                {PLAN_FACTURITA.nombre}
              </h3>
              <p className="fx-precio">{precioTexto(PLAN_FACTURITA.precioMensual)}</p>
              <p className="fx-tenue" style={{ margin: "8px 0 0" }}>
                {PLAN_FACTURITA.nota}
              </p>
              <ul className="fx-lista">
                {PLAN_FACTURITA.incluye.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </article>
            <article aria-labelledby="plan-salto" className="fx-hoja-plan fx-hoja-plan--quieta fx-aparece">
              <h3 id="plan-salto" className="fx-h3">
                {PLAN_SALTO.nombre}
              </h3>
              <p className="fx-precio">
                <span className="fx-precio-desde">desde</span>
                {precioTexto(PLAN_SALTO.precioMensual)}
                <small> por mes</small>
              </p>
              <p className="fx-tenue" style={{ margin: "8px 0 0" }}>
                {PLAN_SALTO.nota}
              </p>
              <ul className="fx-lista">
                {PLAN_SALTO.incluye.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </article>
          </div>
          <p className="fx-bajada" style={{ marginTop: 28 }}>
            Precios de referencia (lista del 11/07/2026, en revisión). Te lo confirmamos antes de cobrarte un peso.{" "}
            {ACLARACION_IVA}.{" "}
            <Link href="/facturita/planes" className="fx-enlace">
              Ver todos los planes
            </Link>
          </p>
        </div>
      </section>

      {/* 6 · Instalala */}
      <section aria-labelledby="instalar" className="fx-seccion">
        <div className="fx-caja">
          <h2 id="instalar" className="fx-h2 fx-aparece">
            Tenela a mano, <em>como una app</em>
          </h2>
          <p className="fx-bajada">
            No hace falta bajar nada de ningún store: la agregás a la pantalla de inicio y se abre directo en «Emitir».
          </p>
          <div style={{ marginTop: 28 }}>
            <InstalarApp />
          </div>
          <div className="fx-dos">
            <div>
              <h3 className="fx-h3">En Android</h3>
              <ol>
                <li>Abrí esta página en Chrome.</li>
                <li>Tocá los tres puntitos de arriba a la derecha.</li>
                <li>Elegí «Instalar app» o «Agregar a la pantalla principal».</li>
              </ol>
            </div>
            <div>
              <h3 className="fx-h3">En iPhone</h3>
              <ol>
                <li>Abrí esta página en Safari.</li>
                <li>Tocá el botón de compartir (el cuadradito con la flecha).</li>
                <li>Elegí «Agregar a inicio».</li>
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* 7 · Preguntas */}
      <section aria-labelledby="preguntas" className="fx-seccion fx-seccion--papel">
        <div className="fx-caja fx-caja--texto">
          <h2 id="preguntas" className="fx-h2 fx-aparece">
            Lo que todos <em>preguntan</em>
          </h2>
          <div className="fx-faq">
            {PREGUNTAS.map((q) => (
              <details key={q.p}>
                <summary>
                  {q.p}
                  <span aria-hidden="true">+</span>
                </summary>
                <p>{q.r}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* 8 · Cierre */}
      <section aria-labelledby="cierre" className="fx-seccion">
        <div className="fx-caja fx-cierre">
          <div>
            <h2 id="cierre" className="fx-h2 fx-aparece">
              Tu primera factura, <em>hoy.</em>
            </h2>
            <p className="fx-bajada">
              El alta son cinco pasos cortos y no te pide tarjeta. Después la activamos nosotros y te avisamos.
            </p>
          </div>
          <Link href="/facturita/alta" className={BOTON_PRINCIPAL}>
            Empezar gratis
          </Link>
        </div>
      </section>
    </VidrieraMarco>
  );
}
