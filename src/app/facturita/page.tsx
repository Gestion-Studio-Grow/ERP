// FACTURITA · Vidriera pública — la puerta de entrada del producto C (ADR-076).
// Tiene que vender en cinco segundos: qué es, para quién, que es gratis y cómo se empieza.
// `force-static` sin base (PD-1): todo lo que muestra sale de constantes (planes, pasos), así
// el build no golpea Neon y la página carga de la CDN.

import type { Metadata } from "next";
import Link from "next/link";
import { ACLARACION_IVA, ESTADO_PRECIOS, PLAN_FACTURITA, PLAN_SALTO, precioTexto } from "@/lib/facturita-planes";
import { LIMITE_FACTURAS_FACTURITA } from "@/lib/facturita-core";
import VidrieraMarco from "./VidrieraMarco";
import { BOTON_PRINCIPAL, FOCO } from "./estilos";
import InstalarApp from "./InstalarApp";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Facturita — tu factura de ARCA en tres toques, gratis",
  description: `Emití facturas con validez de ARCA desde el celu. ${LIMITE_FACTURAS_FACTURITA} gratis por mes, sin tarjeta, para monotributistas y comercios chicos.`,
  generator: "Gestión Studio Grow",
  openGraph: {
    title: "Facturita — tu factura de ARCA en tres toques",
    description: `${LIMITE_FACTURAS_FACTURITA} facturas gratis por mes, sin tarjeta y sin saber de letras ni alícuotas.`,
    locale: "es_AR",
    type: "website",
  },
};

const PASOS = [
  { t: "Contá qué vendiste", d: "Una línea y el total. Sin catálogo, sin configurar nada." },
  { t: "Decí a quién", d: "Consumidor final, o con CUIT o DNI. La letra (A, B o C) la elige el sistema." },
  { t: "Listo, sale aprobada", d: "ARCA la aprueba en el momento. La descargás en PDF y se la mandás a tu cliente." },
];

const PREGUNTAS = [
  {
    p: "¿Es gratis de verdad?",
    r: `Sí. Hasta ${LIMITE_FACTURAS_FACTURITA} facturas por mes no pagás nada y no te pedimos tarjeta. Si un mes necesitás más, te avisamos antes y vos decidís si pasás a Comerciante.`,
  },
  {
    p: "¿Qué necesito para empezar?",
    r: "Tu CUIT, tu clave fiscal de ARCA y un punto de venta para facturación electrónica. Si no tenés el punto de venta, en el alta te explicamos cómo crearlo en dos minutos.",
  },
  {
    p: "¿Les tengo que dar mi clave fiscal?",
    r: "No, nunca. Desde ARCA nos das permiso sólo para emitir facturas a tu nombre (se llama «delegar el servicio»). Lo podés sacar cuando quieras, y tu clave queda con vos.",
  },
  {
    p: "¿Sirve si soy responsable inscripto?",
    r: "Sí: emitís A o B según a quién le vendas, y el sistema lo resuelve solo. Si facturás mucho, Comerciante te va a quedar más cómodo.",
  },
  {
    p: "¿Puedo cobrar con Mercado Pago o subir el extracto del banco?",
    r: "Eso es de Comerciante: ahí las facturas se arman solas con lo que te entra al banco y a Mercado Pago. Pasás en el mismo lugar, sin perder nada de lo que ya emitiste.",
  },
];

export default function FacturitaLanding() {
  return (
    <VidrieraMarco>
      {/* Lo que vende en cinco segundos */}
      <section aria-labelledby="titulo" className="mx-auto grid max-w-5xl gap-10 px-4 pb-14 pt-10 sm:px-6 sm:pt-16 lg:grid-cols-[1.15fr_1fr] lg:items-center">
        <div>
          <p className="text-sm font-semibold text-accent-ink">Para monotributistas y comercios chicos</p>
          <h1 id="titulo" className="mt-3 font-display text-4xl leading-[1.08] tracking-[-0.02em] text-strong sm:text-5xl">
            Tu factura de ARCA en tres toques. Gratis.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-muted">
            Facturita es un emisor de facturas electrónicas que se usa desde el celu. Sin instalar programas, sin
            saber de letras ni alícuotas, y con {LIMITE_FACTURAS_FACTURITA} facturas por mes sin pagar un peso.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link href="/facturita/alta" className={BOTON_PRINCIPAL}>
              Empezar gratis
            </Link>
            <Link href="/admin/login" className={`rounded-lg px-1 py-2 text-sm font-semibold text-strong underline-offset-4 hover:underline ${FOCO}`}>
              Ya tengo cuenta, quiero ingresar
            </Link>
          </div>
          <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted" aria-label="Lo que tenés que saber">
            <li>✓ Validez oficial de ARCA</li>
            <li>✓ Sin tarjeta</li>
            <li>✓ Tu clave fiscal queda con vos</li>
          </ul>
        </div>

        {/* Ejemplo de factura: HTML puro, sin imagen (no pesa ni mueve el LCP) */}
        <figure className="mx-auto w-full max-w-sm">
          <div className="rounded-xl border border-line bg-surface-raised p-5 shadow-raised">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[.06em] text-muted">Factura C</p>
                <p className="mt-1 whitespace-nowrap font-mono text-sm tabular-nums text-strong">N.º 00002-00000015</p>
              </div>
              <span className="whitespace-nowrap rounded-full bg-success-soft px-2.5 py-1 text-xs font-semibold text-success">
                Aprobada por ARCA
              </span>
            </div>
            <dl className="mt-5 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">A</dt>
                <dd className="text-strong">Consumidor final</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Detalle</dt>
                <dd className="text-right text-strong">Corte y peinado</dd>
              </div>
            </dl>
            <div className="mt-5 flex items-baseline justify-between border-t border-line pt-4">
              <span className="text-sm text-muted">Total</span>
              <span className="text-2xl font-semibold tabular-nums text-strong">$18.500</span>
            </div>
            <div className="mt-5 text-center text-sm font-semibold">
              <span className="block rounded-lg bg-surface-sunken py-2 text-strong">Descargar en PDF</span>
            </div>
          </div>
          <figcaption className="mt-3 text-center text-xs text-faint">Ejemplo ilustrativo, con datos inventados.</figcaption>
        </figure>
      </section>

      {/* Cómo funciona */}
      <section aria-labelledby="como" className="border-t border-line bg-surface-raised">
        <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
          <h2 id="como" className="font-display text-2xl tracking-[-0.01em] text-strong sm:text-3xl">
            Así de corto
          </h2>
          <ol className="mt-8 grid gap-8 sm:grid-cols-3">
            {PASOS.map((paso, i) => (
              <li key={paso.t} className="border-t-2 border-accent pt-4">
                <span className="text-sm font-semibold tabular-nums text-accent-ink">Paso {i + 1}</span>
                <h3 className="mt-1 text-base font-semibold text-strong">{paso.t}</h3>
                <p className="mt-1 text-sm text-muted">{paso.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Planes: lo gratis y el salto */}
      <section aria-labelledby="planes" className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
        <h2 id="planes" className="font-display text-2xl tracking-[-0.01em] text-strong sm:text-3xl">
          Arrancás gratis. Crecés sin mudarte.
        </h2>
        <p className="mt-2 max-w-2xl text-muted">
          Cuando necesites más, pasás a Comerciante en el mismo lugar: tus facturas y tus datos quedan donde estaban.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <article className="rounded-xl border-2 border-accent bg-surface-raised p-6">
            <h3 className="text-lg font-semibold text-strong">{PLAN_FACTURITA.nombre}</h3>
            <p className="mt-1 text-3xl font-semibold text-strong">{precioTexto(PLAN_FACTURITA.precioMensual)}</p>
            <p className="text-sm text-muted">{PLAN_FACTURITA.nota}</p>
            <ul className="mt-4 space-y-2 text-sm text-body">
              {PLAN_FACTURITA.incluye.map((x) => (
                <li key={x}>✓ {x}</li>
              ))}
            </ul>
          </article>
          <article className="rounded-xl border border-line bg-surface-raised p-6">
            <h3 className="text-lg font-semibold text-strong">{PLAN_SALTO.nombre}</h3>
            <p className="mt-1 text-3xl font-semibold tabular-nums text-strong">
              {precioTexto(PLAN_SALTO.precioMensual)}
              <span className="text-base font-normal text-muted"> por mes</span>
            </p>
            <p className="text-sm text-muted">{PLAN_SALTO.nota}</p>
            <ul className="mt-4 space-y-2 text-sm text-body">
              {PLAN_SALTO.incluye.map((x) => (
                <li key={x}>✓ {x}</li>
              ))}
            </ul>
          </article>
        </div>
        <p className="mt-4 text-xs text-faint">
          {ESTADO_PRECIOS}. {ACLARACION_IVA}.{" "}
          <Link href="/facturita/planes" className={`font-semibold text-strong underline underline-offset-4 ${FOCO}`}>
            Ver todos los planes
          </Link>
        </p>
      </section>

      {/* Instalala */}
      <section aria-labelledby="instalar" className="border-t border-line bg-surface-raised">
        <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
          <h2 id="instalar" className="font-display text-2xl tracking-[-0.01em] text-strong sm:text-3xl">
            Tenela a mano, como una app
          </h2>
          <p className="mt-2 max-w-2xl text-muted">
            No hace falta bajar nada de ningún store: la agregás a la pantalla de inicio y se abre directo en «Emitir».
          </p>
          <div className="mt-6">
            <InstalarApp />
          </div>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <div>
              <h3 className="text-base font-semibold text-strong">En Android</h3>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted">
                <li>Abrí esta página en Chrome.</li>
                <li>Tocá los tres puntitos de arriba a la derecha.</li>
                <li>Elegí «Instalar app» o «Agregar a la pantalla principal».</li>
              </ol>
            </div>
            <div>
              <h3 className="text-base font-semibold text-strong">En iPhone</h3>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted">
                <li>Abrí esta página en Safari.</li>
                <li>Tocá el botón de compartir (el cuadradito con la flecha).</li>
                <li>Elegí «Agregar a inicio».</li>
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* Preguntas */}
      <section aria-labelledby="preguntas" className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <h2 id="preguntas" className="font-display text-2xl tracking-[-0.01em] text-strong sm:text-3xl">
          Lo que todos preguntan
        </h2>
        <div className="mt-6 divide-y divide-line border-y border-line">
          {PREGUNTAS.map((q) => (
            <details key={q.p} className="group py-1">
              <summary className={`flex cursor-pointer list-none items-center justify-between gap-4 rounded-lg py-3 text-base font-semibold text-strong ${FOCO}`}>
                {q.p}
                <span aria-hidden="true" className="text-xl text-muted transition-transform duration-200 group-open:rotate-45 motion-reduce:transition-none">
                  +
                </span>
              </summary>
              <p className="pb-4 text-sm text-muted">{q.r}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Cierre */}
      <section aria-labelledby="cierre" className="border-t border-line bg-surface-raised">
        <div className="mx-auto flex max-w-5xl flex-col items-start gap-5 px-4 py-14 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h2 id="cierre" className="font-display text-2xl tracking-[-0.01em] text-strong">
              Tu primera factura, hoy.
            </h2>
            <p className="mt-1 text-muted">El alta lleva cinco minutos y no te pide tarjeta.</p>
          </div>
          <Link href="/facturita/alta" className={BOTON_PRINCIPAL}>
            Empezar gratis
          </Link>
        </div>
      </section>
    </VidrieraMarco>
  );
}
