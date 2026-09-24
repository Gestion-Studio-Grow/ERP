// Las piezas de "Cajas de los locales" (server components sin estado ni lecturas).
//
// Pensado para la dueña que revisa las cajas de sus 5 locales desde el celular: arriba, una
// fila por local con lo que importa (¿cerró?, ¿cuadró el último cierre?) que lleva a su
// tarjeta; abajo, la tarjeta de cada local con el último cierre a la vista y los anteriores a
// pedido. Nada más ancho que la pantalla: los montos van aparte de las insignias, que así no
// se estiran ni se parten a la mitad.
//
// Vive separado de page.tsx para que se pueda dibujar con datos de prueba (una página de Next
// sólo puede exportar la página). No importa nada de servidor: el link a cada local llega
// armado (`accion`).

import type { ReactNode } from "react";
import { Badge, Card, fmtMoneyARS, type BadgeTone } from "@/components/ui";
import { formatDayLabel } from "@/lib/caja/cierre-diario";
import { fmtDateTimeAr } from "@/lib/datetime";
import type { CierreLocal, LocalConPasada } from "@/lib/multilocal/multilocal-core";

const TONO_CIERRE: Record<string, BadgeTone> = {
  CUADRA: "success",
  SOBRANTE: "warning",
  FALTANTE: "danger",
  MIXTO: "danger",
  SIN_DECLARAR: "neutral",
};

const TEXTO_CIERRE: Record<string, string> = {
  CUADRA: "Cuadró",
  SOBRANTE: "Sobró plata",
  FALTANTE: "Faltó plata",
  MIXTO: "Sobró en un medio y faltó en otro",
  SIN_DECLARAR: "Sin conciliar",
};

/** "+$1.000,00" / "−$1.000,00" (signo tipográfico, el mismo de siempre en esta pantalla). */
export function diferenciaConSigno(n: number): string {
  return `${n > 0 ? "+" : "−"}${fmtMoneyARS(Math.abs(n))}`;
}

/** El ancla de la tarjeta de un local, para ir desde el resumen. */
export function anclaDeCaja(localTenantId: string): string {
  return `caja-${localTenantId}`;
}

/** Cómo está la caja HOY, en una insignia. Al día = ningún día anterior quedó sin cerrar. */
export function EstadoDeCaja({ x }: { x: LocalConPasada }) {
  const c = x.dato.caja;
  if (c.estado === "cerrada-hoy") return <Badge tone="neutral" dot>Cerró hoy</Badge>;
  if (c.pendienteDesde) return <Badge tone="warning" dot>Sin cerrar desde el {formatDayLabel(c.pendienteDesde)}</Badge>;
  return <Badge tone="success" dot>Al día</Badge>;
}

/**
 * Una fila por local, arriba de todo: la revisión de las cajas de la red entra en una pantalla
 * del celular. Cada fila lleva a la tarjeta del local, más abajo.
 */
export function ResumenDeCajas({ red }: { red: readonly LocalConPasada[] }) {
  return (
    <nav aria-label="Resumen de las cajas" className="mb-lg">
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface-raised">
        {red.map((x) => {
          const ultimo = x.dato.cierres[0];
          const estado = ultimo ? (ultimo.estado ?? "SIN_DECLARAR") : null;
          return (
            <li key={x.local.localTenantId}>
              <a
                href={`#${anclaDeCaja(x.local.localTenantId)}`}
                className="block min-h-11 px-4 py-2.5 hover:bg-surface-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
              >
                {/* El nombre y cómo está hoy arriba; el último cierre abajo, a todo el ancho: en
                    el celular la insignia no le come el lugar al texto. */}
                <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <span className="min-w-0 font-medium text-strong break-words">{x.local.alias}</span>
                  <EstadoDeCaja x={x} />
                </span>
                <span className="mt-0.5 block text-xs text-muted">
                  {ultimo ? (
                    <>
                      Último cierre: {formatDayLabel(ultimo.dia)} · {TEXTO_CIERRE[estado!] ?? estado}
                      {ultimo.diferencia !== 0 && (
                        <span
                          className={`whitespace-nowrap font-medium tabular-nums ${ultimo.diferencia < 0 ? "text-danger" : "text-warning"}`}
                        >
                          {" "}
                          {diferenciaConSigno(ultimo.diferencia)}
                        </span>
                      )}
                    </>
                  ) : (
                    "Todavía no cerró ningún día"
                  )}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** La tarjeta de un local: cómo está su caja, el último cierre y los anteriores a pedido. */
export function CajaDeUnLocal({ x, accion }: { x: LocalConPasada; accion: ReactNode }) {
  const { local, dato } = x;
  const c = dato.caja;
  const [ultimo, ...anteriores] = dato.cierres;
  return (
    <Card id={anclaDeCaja(local.localTenantId)} className="scroll-mt-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-strong break-words">{local.alias}</h2>
          <p className="text-sm text-muted">
            {c.cerradoHasta ? `Cerrada hasta el ${formatDayLabel(c.cerradoHasta)}` : "Todavía no cerró ningún día"}
          </p>
        </div>
        <EstadoDeCaja x={x} />
      </div>

      {c.estado === "abierta" && c.pendienteDesde && (
        <p className="text-sm text-body">
          Tiene plata movida desde el {formatDayLabel(c.pendienteDesde)} que nadie contó. Hasta que cierre, su libro de
          esos días se puede seguir tocando y la diferencia (si la hay) no aparece en ningún lado.
        </p>
      )}

      <div className="border-t border-line pt-3">
        <p className="text-sm font-medium text-strong">Último cierre</p>
        {!ultimo ? (
          <p className="mt-1 text-sm text-muted">No hay cierres registrados en este local.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            <Cierre k={ultimo} />
          </ul>
        )}
        {anteriores.length > 0 && (
          <details className="mt-2">
            <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-accent-ink hover:underline">
              Ver {anteriores.length === 1 ? "el cierre anterior" : `los ${anteriores.length} cierres anteriores`}
            </summary>
            <ul className="mt-1 space-y-2">
              {anteriores.map((k) => (
                <Cierre key={`${k.dia}-${k.cuando.toISOString()}`} k={k} />
              ))}
            </ul>
          </details>
        )}
      </div>

      {accion}
    </Card>
  );
}

function Cierre({ k }: { k: CierreLocal }) {
  const estado = k.estado ?? "SIN_DECLARAR";
  return (
    <li className="rounded-lg border border-line px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="min-w-0 text-sm font-medium text-strong">
          {formatDayLabel(k.dia)} <span className="font-normal text-muted">· cerrado el {fmtDateTimeAr(k.cuando)}</span>
        </p>
        <span className="flex flex-wrap items-center gap-2">
          <Badge tone={TONO_CIERRE[estado] ?? "neutral"}>{TEXTO_CIERRE[estado] ?? estado}</Badge>
          {k.diferencia !== 0 && (
            <span className={`whitespace-nowrap text-sm font-semibold tabular-nums ${k.diferencia < 0 ? "text-danger" : "text-warning"}`}>
              {diferenciaConSigno(k.diferencia)}
            </span>
          )}
        </span>
      </div>
      <ul className="mt-1 space-y-0.5 text-xs text-muted break-words">
        {k.medios.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
      {k.nota && <p className="mt-1 text-xs text-body break-words">Nota: {k.nota}</p>}
    </li>
  );
}
