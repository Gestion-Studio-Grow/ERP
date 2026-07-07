// Facturación y Cobros — módulos ARCA (facturación electrónica) + Mercado Pago
// (links de pago). Gated por `billing:manage` (ARCA) y `payments:manage` (cobros).
// Ambos módulos corren en modo sandbox por defecto: la pantalla funciona sin
// credenciales; el dueño las carga en el entorno para pasar a real (ver
// docs/arquitectura/propuesta-activacion-arca-mp.md).

import { getFacturacion } from "@/lib/facturacion-actions";
import { estadoCobros } from "@/lib/cobros-actions";
import FacturasSection from "./FacturasSection";
import CobrosSection from "./CobrosSection";

export const dynamic = "force-dynamic";

export default async function FacturacionPage() {
  const [{ facturas, estado }, { modo }] = await Promise.all([getFacturacion(), estadoCobros()]);

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="mb-1 text-2xl font-semibold">Facturación y cobros</h1>
      <p className="mb-8 text-muted">
        Emití facturas electrónicas ante ARCA y generá links de cobro por Mercado Pago.
      </p>

      <div className="space-y-10">
        <CobrosSection modo={modo} />
        <FacturasSection facturas={facturas} estado={estado} />
      </div>
    </main>
  );
}
