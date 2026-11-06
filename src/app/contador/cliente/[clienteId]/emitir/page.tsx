// Emitir a mano para UN cliente de la cartera, desde la consola del estudio. El facturador es el
// común (a quién · qué · confirmar, src/components/facturacion/FacturadorGuiado.tsx); lo propio del
// contador va en la capa `FacturadorDelEstudio`: atajos de teclado, emisión en serie y el salto al
// lote del mes. El acceso (sesión, módulo y cliente ACTIVO de su cartera) lo decide
// `accesoAClienteDeCartera`; la acción lo vuelve a exigir.

import { accesoAClienteDeCartera } from "@/lib/contador/recibidos-db";
import { datosDelFacturador } from "@/lib/facturacion/emision-manual.server";
import { ButtonLink, Franja, PageContainer, PageHeader, fmtCuit } from "@/components/ui";
import FacturadorDelEstudio from "./FacturadorDelEstudio";

export const dynamic = "force-dynamic";
// Emitir habla con ARCA en el mismo pedido (el CAE): el mismo tope que «Comprobantes».
export const maxDuration = 60;

export default async function EmitirParaCliente({ params }: { params: Promise<{ clienteId: string }> }) {
  const { clienteId } = await params;
  const acceso = await accesoAClienteDeCartera(clienteId, true);
  if (!acceso.ok) {
    return (
      <PageContainer>
        <PageHeader title="Emitir para un cliente" />
        <Franja tono="peligro">{acceso.error}</Franja>
        <ButtonLink href="/contador" variant="outline" className="mt-4 min-h-11">Volver a la cartera</ButtonLink>
      </PageContainer>
    );
  }
  const cliente = acceso.cliente;
  const { condicionEmisor, hoy } = await datosDelFacturador(cliente.id);
  const base = `/contador/cliente/${encodeURIComponent(cliente.id)}`;

  return (
    <PageContainer>
      <PageHeader
        title={`Emitir para ${cliente.alias}`}
        description={`CUIT ${cliente.cuit ? fmtCuit(cliente.cuit) : "sin cargar"} · sale con el punto de venta y el certificado del cliente.`}
      />
      <nav aria-label="Volver" className="mb-4 flex flex-wrap gap-2">
        <ButtonLink href="/contador" variant="ghost" className="min-h-11">Volver a la cartera</ButtonLink>
        <ButtonLink href={`${base}/comprobantes`} variant="outline" className="min-h-11">Ver sus comprobantes</ButtonLink>
      </nav>
      <FacturadorDelEstudio clienteId={cliente.id} alias={cliente.alias} condicionEmisor={condicionEmisor} hoy={hoy} />
    </PageContainer>
  );
}
