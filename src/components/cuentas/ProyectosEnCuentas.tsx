// MIA-50 · T08 · Adenda 1 § B: lo de Proyectos dentro de las cuentas generales. Sólo lectura (CG7): cada renglón
// lleva a Administración de Proyectos; acá no se cobra ni se paga. Sin la app o sin «Empresa · ver», no se muestra (CG5/CG6).
// MIA-50 T11 (C-CF4): los importes con `pesos` (V3, el mismo helper que Administración de Proyectos), con centavos: el
// mismo texto que «A cobrar» y «A pagar» de Administración, no el redondeado a pesos de `<Plata sinCentavos>`.
import Link from "next/link";
import { fmtNumberAR } from "@/components/ui";
import { ENLACE_PROYECTOS, type ProyectosEnCuentas as Datos } from "@/lib/proyectos/cuentas-generales";
import { fechaCorta, pesos, redondear } from "@/lib/proyectos/core";

export function ProyectosEnCuentas({ proyectos, lado, propias }: { proyectos: Datos | null; lado: "cobrar" | "pagar"; propias: number }) {
  if (!proyectos) return null;
  // C-CF5: con «costo total» oculto, lo de proyectos a pagar no viene del servidor: no hay recuadro ni total que mostrar.
  if (lado === "pagar" && proyectos.aPagarOculto) return null;
  const parte = lado === "cobrar" ? proyectos.aCobrar : proyectos.aPagar;
  if (parte.renglones.length === 0 && !proyectos.sinCambio) return null;
  const titulo = lado === "cobrar" ? "De proyectos: te deben" : "De proyectos: debés";
  return (
    <section aria-labelledby={`proyectos-${lado}`} className="mb-6 rounded-lg border border-line p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={`proyectos-${lado}`} className="text-base font-semibold text-strong">
          {titulo} <span className="tabular-nums">{pesos(parte.total)}</span>
        </h2>
        <Link href={`${ENLACE_PROYECTOS}?tab=${lado}`} className="text-sm font-medium underline underline-offset-2">
          Ir a Administración de Proyectos
        </Link>
      </div>
      <p className="mt-1 text-sm text-muted">
        Se {lado === "cobrar" ? "cobran" : "pagan"} desde Administración de Proyectos. Acá están para que veas toda la plata junta.
      </p>
      {proyectos.sinCambio && (
        <p role="status" className="mt-3 rounded-md border border-line p-3 text-sm">
          Falta cargar el cambio del día de una moneda: esas cuotas no suman hasta que lo cargues en{" "}
          <Link href={`${ENLACE_PROYECTOS}?tab=monedas`} className="font-medium underline underline-offset-2">
            Monedas
          </Link>
          .
        </p>
      )}
      {parte.renglones.length > 0 && (
        <ul className="mt-3 divide-y divide-line">
          {parte.renglones.map((r) => (
            <li key={r.clave} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
              <div className="min-w-0">
                <p className="font-medium text-strong [overflow-wrap:anywhere]">{r.quien}</p>
                <p className="text-sm text-muted [overflow-wrap:anywhere]">
                  {r.concepto} · {r.vence ? `vence el ${fechaCorta(r.vence)}` : "sin fecha"}
                </p>
              </div>
              <div className="text-right">
                <span className="tabular-nums">{pesos(r.pesos)}</span>
                {r.moneda !== "ARS" && <p className="text-xs text-muted tabular-nums">{r.moneda} {fmtNumberAR(r.monto, 2)}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 border-t border-line pt-3 text-sm">
        <strong>
          Total {lado === "cobrar" ? "a cobrar" : "a pagar"} con proyectos: <span className="tabular-nums">{pesos(redondear(propias + parte.total))}</span>
        </strong>
      </p>
    </section>
  );
}
