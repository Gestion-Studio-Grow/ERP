// ============================================================================
// PUESTA A PUNTO — el checklist con semáforo de la facturación (server component)
// ============================================================================
//
// Una sola pantalla de configuración (docs/facturacion/ux-v2-diseno.md §2). La cabecera dice «Listo
// para facturar» o «Te faltan N pasos» y su botón lleva al primer pendiente. Lo que antes vivía
// suelto se monta adentro: el asistente para conectar con ARCA y la factura de prueba van en el paso
// «Conexión con ARCA» (cada uno con sus actions de siempre). El cálculo es puro: puesta-a-punto.ts.

import Link from "next/link";
import { Marca, buttonClasses } from "@/components/ui";
import type { EstadoPasoPuesta, PasoPuesta, PuestaAPunto as Puesta } from "@/lib/facturacion/puesta-a-punto";

const SEMAFORO: Record<EstadoPasoPuesta, { tipo: "hecho" | "pendiente" | "atencion" | "info"; texto: string }> = {
  listo: { tipo: "hecho", texto: "Listo" },
  falta: { tipo: "pendiente", texto: "Falta" },
  prueba: { tipo: "atencion", texto: "Modo de prueba" },
  atencion: { tipo: "atencion", texto: "Ojo" },
  "no-aplica": { tipo: "info", texto: "No aplica" },
};

function EnlaceDeAccion({ accion, principal = false }: { accion: { etiqueta: string; href: string }; principal?: boolean }) {
  const externo = accion.href.startsWith("http");
  const clase = `${buttonClasses(principal ? "solid" : "outline", principal ? undefined : "sm")} self-start`;
  return externo ? (
    <a href={accion.href} target="_blank" rel="noopener noreferrer" className={clase}>
      {accion.etiqueta}
    </a>
  ) : (
    <Link href={accion.href} className={clase}>
      {accion.etiqueta}
    </Link>
  );
}

/** La cabecera (también es el banner de la lista de comprobantes). */
export function CabeceraDePuesta({ puesta, comoBanner = false }: { puesta: Puesta; comoBanner?: boolean }) {
  return (
    <div
      data-testid="puesta-estado"
      data-listo={puesta.listo ? "si" : "no"}
      role={comoBanner ? "status" : undefined}
      className={`flex flex-col gap-3 rounded-lg border px-4 py-4 sm:flex-row sm:items-center sm:justify-between ${
        puesta.listo ? "border-success bg-surface-raised" : "border-warning bg-warning-soft"
      }`}
    >
      <div className="min-w-0">
        <p className="m-0 text-base font-semibold text-strong">{puesta.titulo}</p>
        <p className="m-0 text-sm text-body">{puesta.texto}</p>
      </div>
      {puesta.cta && <EnlaceDeAccion accion={puesta.cta} principal />}
    </div>
  );
}

function Barra({ barra }: { barra: NonNullable<PasoPuesta["barra"]> }) {
  if (barra.limite == null) return null;
  return (
    <div
      role="progressbar"
      aria-label="Lo facturado este mes"
      aria-valuemin={0}
      aria-valuemax={barra.limite}
      aria-valuenow={barra.usadas}
      className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken"
    >
      <div className={`h-full ${barra.porcentaje >= 100 ? "bg-danger" : barra.porcentaje >= 80 ? "bg-warning" : "bg-accent"}`} style={{ width: `${barra.porcentaje}%` }} />
    </div>
  );
}

export default function PuestaAPunto({
  puesta,
  conexion,
  prueba,
}: {
  puesta: Puesta;
  /** Lo que se hace en el paso «Conexión con ARCA» (el asistente de siempre). */
  conexion?: React.ReactNode;
  /** La factura de prueba, si el negocio está en modo de prueba. */
  prueba?: React.ReactNode;
}) {
  return (
    <section aria-labelledby="puesta-titulo" className="flex max-w-3xl flex-col gap-4">
      <h2 id="puesta-titulo" className="text-lg font-semibold text-strong">
        Puesta a punto
      </h2>
      <CabeceraDePuesta puesta={puesta} />
      <ol aria-label="Pasos de la puesta a punto" className="m-0 flex list-none flex-col p-0">
        {puesta.pasos.map((p) => {
          const s = SEMAFORO[p.estado];
          return (
            <li key={p.id} id={`paso-${p.id}`} data-testid={`puesta-paso-${p.id}`} data-estado={p.estado} className="scroll-mt-24 border-b border-line py-4">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="m-0 text-sm font-semibold text-strong">{p.titulo}</h3>
                <Marca tipo={s.tipo}>{s.texto}</Marca>
              </div>
              <div className="mt-2 flex flex-col gap-3 text-sm text-body">
                <p className="m-0">{p.detalle}</p>
                {p.barra && <Barra barra={p.barra} />}
                {p.accion && p.id !== "conexion" && <EnlaceDeAccion accion={p.accion} />}
                {p.id === "conexion" && (
                  <>
                    {prueba}
                    {conexion && p.estado !== "listo" ? conexion : conexion && (
                      <details>
                        <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-accent-ink">Ver la conexión con ARCA</summary>
                        {conexion}
                      </details>
                    )}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
