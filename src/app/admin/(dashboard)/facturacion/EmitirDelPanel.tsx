"use client";

// La pestaña «Emitir factura» del panel de Facturación: el facturador guiado común (a quién · qué ·
// confirmar) con la acción del negocio de la sesión. Lo mismo que usan la consola del contador y
// Factoque; acá sólo van las rutas de ayuda del panel y el refresco de la lista.

import { useRouter } from "next/navigation";
import EmitirComprobante from "@/components/facturacion/EmitirComprobante";
import { emitirComprobanteManualAction } from "@/lib/facturacion/emitir-manual-actions";

const BASE = "/admin/facturacion";

export default function EmitirDelPanel({
  tenantId,
  condicionEmisor,
  hoy,
  regimenFacturaA,
}: {
  tenantId: string;
  condicionEmisor: string | null;
  hoy: string;
  regimenFacturaA: "A" | "A_CON_LEYENDA" | "M" | null;
}) {
  const router = useRouter();
  return (
    <div className="max-w-2xl">
      <EmitirComprobante
        emitir={emitirComprobanteManualAction}
        condicionEmisor={condicionEmisor}
        hoy={hoy}
        regimenFacturaA={regimenFacturaA}
        pdf={{ href: (id) => `${BASE}/comprobante/${id}/pdf` }}
        ambito={`negocio:${tenantId}`}
        rutas={{ datosFiscales: `${BASE}?vista=arca`, comprobantes: `${BASE}?vista=comprobantes` }}
        enlaceDelComprobante={(id) => `${BASE}/comprobante/${id}`}
        alEmitir={() => router.refresh()}
      />
    </div>
  );
}
