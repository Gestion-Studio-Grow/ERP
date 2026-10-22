// ============================================================================
// «NOVEDADES DE LA CAJA» — lo que hizo la recepción con la plata, en el Inicio de la dueña.
// ============================================================================
//
// Reingeniería CH, Tanda 3 (§2.8, CH-037/056). Anulaciones, bajas de saldo, señas devueltas, asientos
// borrados del libro y cierres con diferencia de ayer y hoy, cada uno con quién, cuánto y el porqué
// que escribió. Lo decide `novedades.ts` (puro, con test); lo lee `leerNovedadesDeLaCaja` (con
// `tenantId`). A la recepción no se le muestra: la lectura devuelve `null` y acá no se dibuja nada.
//
// Dos pieles: `renglon` (el Inicio nuevo, con `Bloque` y `Renglon`) y `clasica` (el Inicio de siempre,
// con los tokens del panel, para que la dueña de CH lo vea aunque «Diseño nuevo» esté apagado).

import Link from "next/link";
import { Bloque, Marca, Renglon } from "@/components/ui";
import { dateStrInBusinessTz, fmtTime, todayInBusinessTz } from "@/lib/datetime";
import { leerNovedadesDeLaCaja } from "@/lib/auditoria/novedades.server";
import type { Novedad } from "@/lib/auditoria/novedades";

/** «11:20» si es de hoy; «ayer 18:40» si es de ayer (la lectura trae desde ayer). */
function cuando(iso: string): string {
  const hora = fmtTime(iso);
  return dateStrInBusinessTz(new Date(iso)) === todayInBusinessTz() ? hora : `ayer ${hora}`;
}

const NADA = "Nada para mirar: desde ayer nadie anuló, devolvió ni dio de baja plata.";

function Ver({ n }: { n: Novedad }) {
  if (!n.href) return null;
  return (
    <Link href={n.href} className="inline-flex min-h-11 items-center text-sm font-medium text-accent-ink underline underline-offset-4" aria-label={`Ver: ${n.texto}`}>
      Ver
    </Link>
  );
}

const frase = (n: Novedad) => (
  <>
    {n.texto}
    {n.motivo && <span className="font-normal text-muted"> — «{n.motivo}»</span>}
  </>
);

export default async function NovedadesDeCaja({ piel = "renglon" }: { piel?: "renglon" | "clasica" }) {
  let novedades: Novedad[] | null;
  try {
    novedades = await leerNovedadesDeLaCaja();
  } catch (e) {
    // Un corte de Next (redirect de la guardia) sigue su camino; lo demás no tira el Inicio abajo.
    if (typeof (e as { digest?: unknown } | null)?.digest === "string") throw e;
    return piel === "renglon" ? (
      <Bloque id="novedades-de-caja" titulo="Novedades de la caja" className="mt-8">
        <p className="border-b border-line py-3 text-sm text-muted">
          <Marca tipo="atencion">No se pudieron leer ahora.</Marca> Probá recargar en un rato.
        </p>
      </Bloque>
    ) : null;
  }
  if (novedades === null) return null;

  if (piel === "clasica") {
    return (
      <section aria-labelledby="novedades-de-caja" className="mb-6 overflow-hidden rounded-xl border border-line bg-surface-raised">
        <div className="flex items-baseline justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 id="novedades-de-caja" className="text-[15px] font-semibold text-strong">
            Novedades de la caja
          </h2>
          <span className="text-[13px] text-muted">lo que hizo la recepción con la plata, desde ayer</span>
        </div>
        {novedades.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">{NADA}</p>
        ) : (
          <ol>
            {novedades.map((n, i) => (
              <li key={n.id} className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5 text-sm ${i > 0 ? "border-t border-line" : ""}`}>
                <span className="w-20 shrink-0 tabular-nums text-muted">{cuando(n.cuando)}</span>
                <span className="min-w-0 flex-1 font-medium text-strong">{frase(n)}</span>
                <Ver n={n} />
              </li>
            ))}
          </ol>
        )}
      </section>
    );
  }

  return (
    <Bloque
      id="novedades-de-caja"
      titulo="Novedades de la caja"
      cuenta={novedades.length > 0 ? novedades.length : undefined}
      nota="Lo que hizo la recepción con la plata, desde ayer"
      className="mt-8"
    >
      {novedades.length === 0 ? (
        <p className="border-b border-line py-3 text-sm text-muted">
          <Marca tipo="hecho">{NADA}</Marca>
        </p>
      ) : (
        <ol data-inicio="novedades-de-caja">
          {novedades.map((n) => (
            <Renglon
              key={n.id}
              as="li"
              folio={<Marca tipo={n.tono === "peligro" ? "atencion" : "pendiente"}>{cuando(n.cuando)}</Marca>}
              titulo={frase(n)}
              tecla={<Ver n={n} />}
            />
          ))}
        </ol>
      )}
    </Bloque>
  );
}
