"use client";

// La pestaña «Emitir» del panel de Facturación: el facturador guiado común (a quién · qué ·
// confirmar) con la acción del negocio de la sesión. Lo mismo que usan la consola del contador y
// Factoque; acá sólo van las rutas de ayuda del panel y el refresco de la lista.

import { useRouter } from "next/navigation";
import FacturadorGuiado from "@/components/facturacion/FacturadorGuiado";
import { emitirComprobanteManualAction } from "@/lib/facturacion/emitir-manual-actions";

const BASE = "/admin/facturacion";

export default function EmitirComprobante({
  tenantId,
  condicionEmisor,
  hoy,
}: {
  tenantId: string;
  condicionEmisor: string | null;
  hoy: string;
}) {
  const router = useRouter();
  return (
    <div className="max-w-2xl">
      <FacturadorGuiado
        emitir={emitirComprobanteManualAction}
        condicionEmisor={condicionEmisor}
        hoy={hoy}
        ambito={`negocio:${tenantId}`}
        rutas={{ datosFiscales: `${BASE}?vista=arca`, comprobantes: `${BASE}?vista=comprobantes` }}
        enlaceDelComprobante={(id) => `${BASE}/comprobante/${id}`}
        alEmitir={() => router.refresh()}
      />
    </div>
  );
}
