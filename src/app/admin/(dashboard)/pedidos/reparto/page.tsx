import Link from "next/link";
import { redirect } from "next/navigation";
import { requireApp } from "@/lib/require-app";
import { roleHasCapability } from "@/lib/capabilities";
import { getCurrentTenantId } from "@/lib/tenant";
import { getTenantIdentity } from "@/lib/identidad-rubro";
import { interruptoresDelNegocio } from "@/cambios/interruptores.server";
import { mostradorBoutiquePrendido } from "@/cambios/interruptores";
import { fmtCalendarDateLabel } from "@/lib/datetime";
import { leerDatosDelReparto } from "./datos.server";
import { franjaPropuesta, franjasDelDia, hojaDelReparto } from "./reparto-core";
import ArmarReparto from "./ArmarReparto";

// ============================================================================
// ARMAR REPARTO — los envíos de una franja, por zona, para el cadete (Magra, tanda 2 · 2C · MG-055).
// ============================================================================
//
// Detrás del interruptor «mostrador-boutique» (como Armar y pesar): apagado, vuelve a la bandeja.
// `?franja=<clave>` elige la franja (las chips de arriba); sin elegir, la primera con algo listo
// para salir. Las lecturas son las de `leerDatosDelReparto` (tres, acotadas por negocio).

export const dynamic = "force-dynamic";
export const metadata = { title: "Armar reparto", generator: "Gestión Studio Grow" };

export default async function ArmarRepartoPage({ searchParams }: { searchParams: Promise<{ franja?: string }> }) {
  const user = await requireApp("pedidos");
  const [identidad, interruptores, sp] = await Promise.all([getTenantIdentity(), interruptoresDelNegocio(), searchParams]);
  if (!identidad.isRetail || !mostradorBoutiquePrendido(interruptores)) redirect("/admin/pedidos");

  const datos = await leerDatosDelReparto(await getCurrentTenantId());
  const franjas = franjasDelDia(datos.envios, datos.hoy);
  const pedida = typeof sp.franja === "string" ? sp.franja : null;
  const clave = pedida && franjas.some((f) => f.clave === pedida) ? pedida : franjaPropuesta(franjas);
  const franja = franjas.find((f) => f.clave === clave) ?? null;
  const deLaFranja = franja ? datos.envios.filter((e) => e.franja.clave === franja.clave) : [];
  const enLaCalle = datos.envios.filter((e) => e.salida).length;

  return (
    <main data-ui="pagina" className="mx-auto w-full max-w-4xl px-4 py-6">
      <Link href="/admin/pedidos" className="inline-flex min-h-11 items-center text-sm font-medium text-accent-ink underline underline-offset-4">
        ← Pedidos
      </Link>
      <header className="mt-1 mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-3xl leading-none text-strong">Armar reparto</h1>
          <p className="mt-1 text-sm text-muted">Envíos de hoy · {fmtCalendarDateLabel(datos.hoy)}</p>
        </div>
        {enLaCalle > 0 && (
          <Link
            href="/admin/pedidos/reparto/rendicion"
            className="inline-flex min-h-11 items-center rounded-md border border-line-strong px-4 text-sm font-semibold text-strong hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Rendición del cadete · {enLaCalle}
          </Link>
        )}
      </header>

      {franjas.length === 0 ? (
        <p role="status" className="rounded-lg border border-line bg-surface-raised p-4 text-body">
          No hay envíos para hoy. Cuando entren pedidos con envío a domicilio, acá se arman por franja y por zona.
        </p>
      ) : (
        <>
          <nav aria-label="Franjas de hoy" className="mb-4 flex max-w-full gap-2 overflow-x-auto pb-1">
            {franjas.map((f) => {
              const actual = f.clave === clave;
              return (
                <Link
                  key={f.clave}
                  href={`/admin/pedidos/reparto?franja=${encodeURIComponent(f.clave)}`}
                  aria-current={actual ? "page" : undefined}
                  data-ui="chip"
                  className={
                    "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium tabular-nums " +
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus " +
                    (actual ? "border-accent bg-accent text-on-accent" : "border-line-strong bg-surface-raised text-strong hover:bg-accent-soft")
                  }
                >
                  {f.texto}
                  <span className="text-xs opacity-80">
                    {f.listos} de {f.envios} listos
                  </span>
                </Link>
              );
            })}
          </nav>
          {franja && (
            <ArmarReparto
              key={franja.clave}
              hoja={hojaDelReparto(deLaFranja, datos.ordenDeZonas)}
              franja={franja.texto}
              dia={fmtCalendarDateLabel(datos.hoy)}
              negocio={datos.negocio}
              puedeOperar={roleHasCapability(user.role, "orders:manage")}
            />
          )}
        </>
      )}
    </main>
  );
}
