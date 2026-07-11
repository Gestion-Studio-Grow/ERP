// FACTURITA · Emitir — la pantalla principal del producto: la factura en tres
// clics, con el tope de 5 gratis por mes y el gancho de upgrade a Comerciante.

import { PageHeader } from "@/components/ui";
import { estadoFacturitaAction } from "@/lib/facturita-actions";
import EmitirForm from "./EmitirForm";

export const dynamic = "force-dynamic";

export default async function FacturitaEmitirPage() {
  const limite = await estadoFacturitaAction();

  return (
    <>
      <PageHeader
        title="Emitir una factura"
        description={`Cargá qué vendiste y el total: la factura sale con validez de ARCA. Este mes usaste ${limite.usadas} de ${limite.limite} gratis.`}
      />
      {limite.mensaje && (
        <p
          role={limite.puedeEmitir ? undefined : "alert"}
          className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
            limite.puedeEmitir
              ? "border-line bg-surface-sunken text-muted"
              : "border-warning bg-warning-soft font-medium text-strong"
          }`}
        >
          {limite.mensaje}
        </p>
      )}
      <EmitirForm bloqueado={!limite.puedeEmitir} />
    </>
  );
}
