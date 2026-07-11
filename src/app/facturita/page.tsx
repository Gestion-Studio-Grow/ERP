// FACTURITA · Landing pública — la puerta de entrada del producto C (ADR-076).
// Página de venta corta y en criollo; el alta self-serve multi-negocio queda
// para la fase 2 (resolución de tenant por sesión) — hoy la activación la hace
// GSG en el día, y el acceso del usuario es su link propio + Ingresar.

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Facturita — emití tu factura en tres clics, gratis",
  description:
    "Emisor de facturas con validez de ARCA para monotributistas y comercios chicos. Cinco facturas gratis por mes, sin instalar nada.",
  generator: "Gestión Studio Grow",
};

const PASOS = [
  { n: "1", t: "Contá qué vendiste", d: "Una línea y el total. Sin catálogos ni configuración." },
  { n: "2", t: "Confirmá", d: "La letra de la factura la decide el sistema — vos no tenés que saber de A, B o C." },
  { n: "3", t: "Listo", d: "Factura emitida con validez de ARCA. La descargás o la mandás por WhatsApp." },
];

export default function FacturitaLanding() {
  return (
    <div data-skin="fable" data-theme="light" className="min-h-screen bg-surface text-body">
      <main className="mx-auto max-w-2xl px-6 py-16 sm:py-24">
        <p className="text-sm font-semibold uppercase tracking-[.09em] text-accent">Facturita</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight text-strong sm:text-5xl">
          Emití tu factura en tres clics. Gratis.
        </h1>
        <p className="mt-4 text-lg text-muted">
          Para monotributistas y comercios chicos que necesitan facturar sin vueltas: cinco facturas
          por mes, con validez de ARCA, sin instalar nada y sin saber de letras ni alícuotas.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href="https://wa.me/5491100000000?text=Quiero%20mi%20Facturita"
            className="inline-flex h-11 items-center rounded-lg bg-accent px-5 text-sm font-semibold text-on-accent transition-[filter] hover:brightness-110"
          >
            Quiero mi Facturita
          </a>
          <Link
            href="/admin/login"
            className="inline-flex h-11 items-center rounded-lg border border-line bg-surface-raised px-5 text-sm font-semibold text-strong transition-colors hover:bg-surface-sunken"
          >
            Ya tengo cuenta — Ingresar
          </Link>
        </div>
        <p className="mt-3 text-xs text-faint">
          Te lo activamos en el día: pedilo por WhatsApp y recibís tu acceso listo para facturar.
        </p>

        <section aria-label="Cómo funciona" className="mt-14 grid gap-4 sm:grid-cols-3">
          {PASOS.map((p) => (
            <div key={p.n} className="rounded-xl border border-line bg-surface-raised p-5 shadow-card">
              <span className="grid size-8 place-items-center rounded-lg bg-accent-soft text-sm font-bold text-accent">
                {p.n}
              </span>
              <h2 className="mt-3 text-sm font-semibold text-strong">{p.t}</h2>
              <p className="mt-1 text-sm text-muted">{p.d}</p>
            </div>
          ))}
        </section>

        <section className="mt-14 rounded-xl border border-line bg-surface-sunken p-6">
          <h2 className="text-base font-semibold text-strong">¿Y cuando tu negocio crezca?</h2>
          <p className="mt-2 text-sm text-muted">
            Facturita es la puerta de entrada: cuando necesites más de cinco facturas, o quieras que
            lo que cobrás por el banco y por Mercado Pago se facture solo, pasás a{" "}
            <strong className="font-semibold text-strong">Comerciante</strong> en el mismo espacio,
            sin migrar nada.
          </p>
        </section>

        <footer className="mt-16 border-t border-line pt-6 text-center text-xs text-faint">
          Con tecnología de Gestión Studio Grow
        </footer>
      </main>
    </div>
  );
}
