// PROFETURNOS · Vidriera (/profeturnos; raíz de profeturnos.gsgapp.com.ar por src/lib/producto-host.ts).
//
// Propuesta en criollo, cómo funciona en 3 pasos, el precio (src/lib/profeturnos/planes.ts) y el
// botón al alta. Con el alta cerrada (`PROFETURNOS_ALTA_ABIERTA !== "1"`) el botón dice «Muy pronto»
// y no lleva a ningún lado: producción no se abre sin el OK del dueño.

import Link from "next/link";
import { PieProfeTurnos } from "@/app/profeturnos/_pie";
import { altaAbierta } from "@/lib/profeturnos/alta-core";
import { DIAS_PRUEBA, PRECIO_PROVISIONAL, precioEnPesos } from "@/lib/profeturnos/planes";

// El flag se lee en cada pedido (no queda horneado en el build).
export const dynamic = "force-dynamic";

const PASOS = [
  { titulo: "Creá tu turnero", texto: "Tu nombre, tu WhatsApp y una contraseña. En dos minutos tenés tu link." },
  { titulo: "Cargá tus horarios", texto: "Decí qué días y en qué club das clase, y cuánto cobrás." },
  { titulo: "Pasale el link a tus alumnos", texto: "Piden clase solos; vos confirmás con un toque y les avisás por WhatsApp." },
] as const;

export default function ProfeTurnosVidriera() {
  const abierta = altaAbierta();
  return (
    <>
    <main className="mx-auto max-w-3xl px-5 pb-8 pt-12 sm:pt-20">
      <p className="text-sm font-semibold uppercase tracking-wide text-accent">ProfeTurnos</p>
      <h1 className="mt-2 text-3xl font-bold leading-tight text-strong sm:text-5xl">
        Tus clases de pádel, ordenadas. Sin chat infinito.
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-body">
        Tus alumnos eligen día y hora desde tu link, vos confirmás, y cada uno sabe cuánto debe. Cobrás por transferencia,
        como siempre.
      </p>

      <Cta abierta={abierta} />

      <p className="mt-6 text-body">
        ¿Buscás profe?{" "}
        <Link
          href="/profeturnos/profes"
          className="inline-flex min-h-12 items-center font-semibold text-accent-ink underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          Mirá los profes y sus horarios libres
        </Link>
      </p>

      <section aria-labelledby="como-funciona" className="mt-16">
        <h2 id="como-funciona" className="text-2xl font-bold text-strong">
          Cómo funciona
        </h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-3">
          {PASOS.map((p, i) => (
            <li key={p.titulo} className="rounded-2xl border border-line bg-surface p-5">
              <span aria-hidden className="grid size-9 place-items-center rounded-full bg-accent-soft font-bold text-accent-ink">
                {i + 1}
              </span>
              <h3 className="mt-3 font-semibold text-strong">{p.titulo}</h3>
              <p className="mt-1 text-sm text-body">{p.texto}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="precio" className="mt-16 rounded-2xl border border-line bg-surface p-6">
        <h2 id="precio" className="text-2xl font-bold text-strong">
          Precio
        </h2>
        <p className="mt-3 text-body">
          <strong className="text-strong">{DIAS_PRUEBA} días gratis</strong>, sin tarjeta. Después,{" "}
          <strong className="text-strong">{precioEnPesos()} por mes</strong>, final.
        </p>
        {PRECIO_PROVISIONAL && <p className="mt-2 text-xs text-muted">Precio provisional a confirmar.</p>}
      </section>

      <Cta abierta={abierta} />
    </main>
      <PieProfeTurnos />
    </>
  );
}

function Cta({ abierta }: { abierta: boolean }) {
  if (!abierta) {
    return (
      <p className="mt-8 inline-flex rounded-xl border border-line bg-surface-sunken px-5 py-3 font-semibold text-muted" role="status">
        Muy pronto: estamos abriendo las altas.
      </p>
    );
  }
  return (
    <Link
      href="/profeturnos/alta"
      className="mt-8 inline-flex rounded-xl bg-accent px-6 py-3 font-semibold text-on-accent hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      Creá tu turnero gratis
    </Link>
  );
}
