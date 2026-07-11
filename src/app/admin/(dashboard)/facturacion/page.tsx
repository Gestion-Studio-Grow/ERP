// Facturación y Cobros — módulos ARCA (facturación electrónica) + Mercado Pago
// (links de pago). Gated por `billing:manage` (ARCA) y `payments:manage` (cobros).
// Ambos módulos corren en modo sandbox por defecto: la pantalla funciona sin
// credenciales; el dueño las carga en el entorno para pasar a real (ver
// docs/arquitectura/propuesta-activacion-arca-mp.md).

import Link from "next/link";
import { getFacturacion } from "@/lib/facturacion-actions";
import { estadoCobros } from "@/lib/cobros-actions";
import { getActiveModuleIds, moduleGateAllows } from "@/lib/module-gating";
import { buttonClasses } from "@/components/ui";
import FacturasSection from "./FacturasSection";
import CobrosSection from "./CobrosSection";

export const dynamic = "force-dynamic";

export default async function FacturacionPage() {
  const [{ facturas, estado }, { modo }, activos] = await Promise.all([
    getFacturacion(),
    estadoCobros(),
    getActiveModuleIds(),
  ]);
  // Gate por módulo (ADR-054/055): la entrada al tablero de BANCOS solo se
  // muestra si el tenant tiene el módulo asignado (con el registry apagado,
  // `activos` es null y el predicado deja pasar — navegación legada intacta).
  const bancosActivo = moduleGateAllows("bancos", activos);

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="mb-1 text-2xl font-semibold">Facturación y cobros</h1>
      <p className="mb-8 text-muted">
        Emití facturas electrónicas ante ARCA y generá links de cobro por Mercado Pago.
      </p>

      <div className="space-y-10">
        {/* Facturación automática desde el extracto del banco (módulo BANCOS) —
            sección hermana con tablero propio, gateada por el módulo. */}
        {bancosActivo && (
          <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface-raised p-5 shadow-card sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-medium text-strong">Facturación automática</h2>
              <p className="mt-1 text-sm text-muted">
                Subí el extracto de tu banco y el sistema arma las facturas solo — vos revisás
                únicamente las ventas que necesitan los datos del comprador.
              </p>
            </div>
            <Link
              href="/admin/facturacion/bancos"
              className={buttonClasses("outline", "md", "shrink-0")}
            >
              Abrir el tablero →
            </Link>
          </section>
        )}

        <CobrosSection modo={modo} />
        <FacturasSection facturas={facturas} estado={estado} />
      </div>
    </main>
  );
}
