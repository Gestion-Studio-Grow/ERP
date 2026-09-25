// ============================================================================
// CAJAS DE LOS LOCALES — diseño nuevo («Renglón»). Servidor, sin lecturas propias.
// ============================================================================
//
// Los mismos datos que la pantalla de siempre (redDeLaCasaAction). Un renglón por local, en el
// orden que ya trae la página (primero los que no cerraron, del día más viejo): cómo está su
// caja, qué dejó el último cierre y la diferencia a la derecha, como plata. Los cierres
// anteriores se abren en el mismo renglón, como las hojas de un libro: nada de tarjetas.

import type { ReactNode } from "react";
import { Marca, Plata, Rotulo, fmtNumberAR, type TipoMarca } from "@/components/ui";
import { formatDayLabel } from "@/lib/caja/cierre-diario";
import { fmtDateTimeAr } from "@/lib/datetime";
import type { CierreLocal, LocalConPasada } from "@/lib/multilocal/multilocal-core";

const CIERRE: Record<string, { texto: string; tipo: TipoMarca }> = {
  CUADRA: { texto: "Cuadró", tipo: "hecho" },
  SOBRANTE: { texto: "Sobró plata", tipo: "atencion" },
  FALTANTE: { texto: "Faltó plata", tipo: "atencion" },
  MIXTO: { texto: "Sobró en un medio y faltó en otro", tipo: "atencion" },
  SIN_DECLARAR: { texto: "Sin conciliar", tipo: "pendiente" },
};

function marcaDeCierre(k: CierreLocal) {
  const e = k.estado ?? "SIN_DECLARAR";
  const c = CIERRE[e] ?? { texto: e, tipo: "info" as TipoMarca };
  return <Marca tipo={c.tipo}>{c.texto}</Marca>;
}

function EstadoHoy({ x }: { x: LocalConPasada }) {
  const c = x.dato.caja;
  if (c.estado === "cerrada-hoy") return <Marca tipo="hecho">Cerró hoy</Marca>;
  if (c.pendienteDesde) return <Marca tipo="atencion">{`Sin cerrar desde el ${formatDayLabel(c.pendienteDesde)}`}</Marca>;
  return <Marca tipo="info">Al día</Marca>;
}

/** La diferencia de un cierre: $0 se dice «sin diferencia»; lo demás, como plata con signo. */
function Diferencia({ n }: { n: number }) {
  if (n === 0) return <span className="text-[13px] text-muted">sin diferencia</span>;
  if (n < 0) return <Plata valor={n} tono="peligro" className="font-semibold" />;
  return (
    <span className="font-semibold whitespace-nowrap text-warning">
      +<Plata valor={n} />
    </span>
  );
}

export function CabeceraCajas({ casa, locales, sinCerrar }: { casa: string; locales: number; sinCerrar: number }) {
  return (
    <header data-ui="page-header" className="mb-4">
      <h1 className="text-2xl font-bold text-strong">Cajas de los locales</h1>
      <p className="mt-1 text-sm text-muted">
        {casa}
        {" · "}
        {`${fmtNumberAR(locales)} ${locales === 1 ? "local" : "locales"}`}
        {" · "}
        {sinCerrar === 0 ? (
          "todas cerradas hasta ayer"
        ) : (
          <strong className="text-strong">{`${fmtNumberAR(sinCerrar)} sin cerrar de días anteriores`}</strong>
        )}
      </p>
    </header>
  );
}

export function TablaCajas({ red, accion }: { red: readonly LocalConPasada[]; accion: (x: LocalConPasada) => ReactNode }) {
  return (
    <section aria-labelledby="cajas-red">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-line-strong pb-2">
        <h2 id="cajas-red" className="text-[15px] font-semibold text-strong">
          La caja de cada local
        </h2>
        <span className="text-[13px] text-muted">primero las que no cerraron</span>
      </div>
      <ul>
        {red.map((x) => {
          const { local, dato } = x;
          const c = dato.caja;
          const [ultimo, ...anteriores] = dato.cierres;
          return (
            <li key={local.localTenantId} id={`caja-${local.localTenantId}`} className="scroll-mt-4 border-b border-line py-3">
              <div className="grid grid-cols-[1fr_auto] items-start gap-x-4 gap-y-1.5 md:grid-cols-[minmax(0,14rem)_1fr_auto_auto]">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-strong break-words">{local.alias}</p>
                  <p className="text-[13px] text-muted">
                    {c.cerradoHasta ? `Cerrada hasta el ${formatDayLabel(c.cerradoHasta)}` : "Todavía no cerró ningún día"}
                  </p>
                </div>
                <div className="text-right md:order-3">{ultimo ? <Diferencia n={ultimo.diferencia} /> : null}</div>
                <div className="col-span-2 min-w-0 md:order-2 md:col-span-1">
                  <EstadoHoy x={x} />
                  <p className="text-[13px] text-muted break-words">
                    {ultimo ? (
                      <>
                        {`Último cierre: ${formatDayLabel(ultimo.dia)} · `}
                        {marcaDeCierre(ultimo)}
                      </>
                    ) : (
                      "No hay cierres registrados en este local."
                    )}
                  </p>
                </div>
                <div className="col-span-2 md:order-4 md:col-span-1">{accion(x)}</div>
              </div>

              {c.estado === "abierta" && c.pendienteDesde && (
                <p className="mt-1.5 text-[13px] text-body">
                  {`Tiene plata movida desde el ${formatDayLabel(c.pendienteDesde)} que nadie contó: hasta que cierre, esos días se pueden seguir tocando.`}
                </p>
              )}

              {ultimo && (
                <details className="mt-1">
                  <summary className="flex min-h-11 cursor-pointer items-center text-[13px] font-medium text-accent-ink hover:underline">
                    {anteriores.length === 0
                      ? "Ver el detalle del último cierre"
                      : `Ver el detalle y ${anteriores.length === 1 ? "el cierre anterior" : `los ${anteriores.length} cierres anteriores`}`}
                  </summary>
                  <ul className="border-l-2 border-line pl-3">
                    {[ultimo, ...anteriores].map((k) => (
                      <HojaDeCierre key={`${k.dia}-${k.cuando.toISOString()}`} k={k} />
                    ))}
                  </ul>
                </details>
              )}
            </li>
          );
        })}
      </ul>
      <p className="pt-2 text-[13px] text-muted">Cada cierre lo hace el local desde su pantalla de Caja. La diferencia es lo contado menos lo esperado.</p>
    </section>
  );
}

function HojaDeCierre({ k }: { k: CierreLocal }) {
  return (
    <li className="border-b border-line py-2 last:border-b-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="min-w-0 text-sm">
          <span className="font-medium text-strong">{formatDayLabel(k.dia)}</span>{" "}
          <span className="text-[13px] text-muted">{`· cerrado el ${fmtDateTimeAr(k.cuando)} · `}</span>
          {marcaDeCierre(k)}
        </p>
        <Diferencia n={k.diferencia} />
      </div>
      {k.medios.length > 0 && (
        <>
          <Rotulo className="sr-only">Por medio</Rotulo>
          <ul className="text-[13px] text-muted break-words">
            {k.medios.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </>
      )}
      {k.nota && <p className="text-[13px] text-body break-words">{`Nota: ${k.nota}`}</p>}
    </li>
  );
}
