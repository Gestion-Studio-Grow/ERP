// Ficha del negocio · «Plan de Factoque» (T2): Gratis / Plus / Pro con vencimiento opcional, para la
// venta por transferencia. Sólo se muestra en negocios Factoque. La acción es `cambiarPlanFactoque`
// (src/lib/operator-actions.ts): escribe `Tenant.plan` y deja la auditoría con la vigencia.
// Bajar de plan o dejarlo vencer no borra facturas: sólo frena la siguiente del mes.

import { Bloque, Button, Field, Input, Select } from "@/components/ui";
import { cambiarPlanFactoque } from "@/lib/operator-actions";
import { PLANES_FACTOQUE, precioConPeriodo } from "@/lib/facturita-planes";
import type { PlanFactoqueDelNegocio } from "@/lib/facturacion/plan-factoque.server";

function fechaCorta(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

export default function PlanFactoqueCard({
  tenantId,
  planGuardado,
  vigente,
  soloLectura,
}: {
  tenantId: string;
  /** `Tenant.plan` tal cual (lo que se vendió). */
  planGuardado: string | null;
  /** El plan que rige hoy (vencido → Gratis); `null` si no se pudo leer. */
  vigente: PlanFactoqueDelNegocio | null;
  soloLectura: boolean;
}) {
  const elegido = PLANES_FACTOQUE.find((p) => p.id === planGuardado)?.id ?? "facturita";
  const cuenta = vigente
    ? vigente.vencido
      ? `Vencido el ${vigente.vigenciaHasta ? fechaCorta(vigente.vigenciaHasta) : "—"}: corre Gratis (${vigente.cupo.tope} por mes)`
      : `${vigente.plan.nombre} · ${vigente.cupo.tope} facturas por mes${vigente.vigenciaHasta ? ` · hasta el ${fechaCorta(vigente.vigenciaHasta)}` : ""}`
    : "No se pudo leer el plan";
  return (
    <Bloque titulo="Plan de Factoque" cuenta={cuenta}>
      <form action={cambiarPlanFactoque} className="flex flex-wrap items-end gap-2 py-3">
        <input type="hidden" name="tenantId" value={tenantId} />
        <Field label="Plan" htmlFor="factoque-plan" className="min-w-48 flex-1">
          <Select id="factoque-plan" name="plan" defaultValue={elegido} disabled={soloLectura}>
            {PLANES_FACTOQUE.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} — {p.facturasPorMes} por mes · {precioConPeriodo(p.precioMensual)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Pago hasta (opcional)" htmlFor="factoque-vigencia" className="min-w-40">
          <Input
            id="factoque-vigencia"
            name="vigenciaHasta"
            type="date"
            defaultValue={vigente && !vigente.vencido ? (vigente.vigenciaHasta ?? "") : ""}
            disabled={soloLectura}
          />
        </Field>
        <Button type="submit" variant="outline" disabled={soloLectura}>
          Cambiar plan
        </Button>
      </form>
      <p className="border-t border-line py-2 text-[13px] text-muted">
        Para la venta por transferencia: cuando llega el pago, elegí el plan y hasta qué día está pago
        (inclusive). Al vencer vuelve solo a Gratis; si bajás de plan no se borra ninguna factura, sólo
        se frena la siguiente del mes. Precios finales por mes, IVA incluido.
      </p>
    </Bloque>
  );
}
