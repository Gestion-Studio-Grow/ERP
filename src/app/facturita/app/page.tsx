// FACTURITA · Emitir — la pantalla principal del producto: la factura en tres
// clics, con el tope de 5 gratis por mes y el gancho de upgrade a Comerciante.

import { PageHeader } from "@/components/ui";
import { datosEmisorFacturitaAction, estadoFacturitaAction } from "@/lib/facturita-actions";
import EmitirForm from "./EmitirForm";

export const dynamic = "force-dynamic";

export default async function FacturitaEmitirPage() {
  const [limite, emisor] = await Promise.all([estadoFacturitaAction(), datosEmisorFacturitaAction()]);

  return (
    <>
      <PageHeader
        title="Emitir una factura"
        description={`Cargá qué vendiste, el total y a quién: la factura va a ARCA para su autorización. Este mes usaste ${limite.usadas} de ${limite.limite} gratis.`}
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
      <EmitirForm
        bloqueado={!limite.puedeEmitir}
        inscripto={emisor.condicionIva === "RESPONSABLE_INSCRIPTO"}
        hoy={emisor.hoy}
      />
    </>
  );
}
