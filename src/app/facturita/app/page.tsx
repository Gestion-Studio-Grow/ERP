// FACTURITA · Emitir — la pantalla principal del producto: la factura en tres
// clics, con el tope de 5 gratis por mes y el gancho de upgrade a Comerciante.

import { PageHeader } from "@/components/ui";
import { datosEmisorFacturitaAction, estadoFacturitaAction } from "@/lib/facturita-actions";
import Link from "next/link";
import { listaEnCriollo } from "@/lib/facturita-emisor";
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
      {emisor.faltantesPdf.length > 0 && (
        // No bloquea: ARCA no exige estos datos para autorizar. Sin ellos, el PDF no sale.
        <p role="note" className="mb-4 rounded-xl border border-line bg-surface-sunken px-4 py-3 text-sm text-body">
          Antes de tu primera factura: para que puedas descargarla en PDF y mandársela a tu cliente, faltan{" "}
          {listaEnCriollo(emisor.faltantesPdf)}.{" "}
          <Link
            href="/facturita/app/cuenta#datos-para-facturas"
            className="font-semibold text-strong underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Completalos en Mi cuenta
          </Link>
          . Podés emitir igual: ARCA no los pide.
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
