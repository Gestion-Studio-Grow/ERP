// Facturación y Cobros — módulos ARCA (facturación electrónica) + Mercado Pago
// (links de pago). Gated por `billing:manage` (ARCA) y `payments:manage` (cobros).
// Ambos módulos corren en modo sandbox por defecto: la pantalla funciona sin
// credenciales; el dueño las carga en el entorno para pasar a real (ver
// docs/arquitectura/propuesta-activacion-arca-mp.md).

import Link from "next/link";
import { getFacturacion } from "@/lib/facturacion-actions";
import { estadoCobros } from "@/lib/cobros-actions";
import { getActiveModuleIds, moduleGateAllows } from "@/lib/module-gating";
import { PageContainer, PageHeader, buttonClasses } from "@/components/ui";
import FacturasSection from "./FacturasSection";
import CobrosSection from "./CobrosSection";
import { requireApp } from "@/lib/require-app";
import { disenoNuevo } from "@/lib/diseno/diseno.server";
import { LineaDeEstado, Marca, Pestanas } from "@/components/ui";
import ComprobantesArca from "./ComprobantesArca";
import CobrarConLink from "./CobrarConLink";
import { FranjaDeArca, datosDeArca } from "./EstadoArca";

const bancosActivoNuevo = (activos: Awaited<ReturnType<typeof getActiveModuleIds>>) => moduleGateAllows("bancos", activos);

export const dynamic = "force-dynamic";

export default async function FacturacionPage({ searchParams }: { searchParams: Promise<{ vista?: string }> }) {
  // Guardia de la app (ADR-098): una app oculta no es una app protegida.
  await requireApp("facturacion");
  const [{ facturas, estado }, { modo }, activos, nuevo, { vista }] = await Promise.all([
    getFacturacion(),
    estadoCobros(),
    getActiveModuleIds(),
    disenoNuevo(),
    searchParams,
  ]);

  // DISEÑO NUEVO («Renglón»): una página por trabajo, unidas por pestañas: los comprobantes con su
  // estado ante ARCA y cobrar con link. El modo prueba de ARCA, en una franja fija. Facturación
  // automática ya es su propia app en la cabecera (la tarjeta que llevaba a ella sobra).
  if (nuevo) {
    const conLink = vista === "cobrar-con-link";
    const autorizadas = facturas.filter((f) => f.status === "AUTHORIZED").length;
    const rechazadas = facturas.filter((f) => f.status === "REJECTED").length;
    return (
      <main data-ui="pagina" className="mx-auto w-full px-4 py-6">
        <header data-ui="page-header" className="mb-3">
          <h1 className="text-2xl font-bold text-strong">Facturación</h1>
          <LineaDeEstado
            datos={[
              ...datosDeArca(estado),
              facturas.length > 0 ? `${autorizadas} ${autorizadas === 1 ? "autorizada" : "autorizadas"}` : null,
              estado.pendientes > 0 ? `${estado.pendientes} ${estado.pendientes === 1 ? "pendiente" : "pendientes"}` : null,
              rechazadas > 0 ? <Marca key="r" tipo="anulado">{rechazadas === 1 ? "1 rechazada" : `${rechazadas} rechazadas`}</Marca> : null,
            ]}
          />
        </header>
        <FranjaDeArca estado={estado} className="mb-4" />
        <Pestanas
          etiqueta="Vistas de Facturación"
          conRaya
          className="mb-5"
          pestanas={[
            { href: "/admin/facturacion", etiqueta: "Comprobantes", actual: !conLink, conteo: facturas.length },
            { href: "/admin/facturacion?vista=cobrar-con-link", etiqueta: "Cobrar con link", actual: conLink },
          ]}
        />
        {conLink ? <CobrarConLink modo={modo} /> : <ComprobantesArca facturas={facturas} estado={estado} />}
        {bancosActivoNuevo(activos) && !conLink && (
          <p className="mt-6 text-sm text-muted">
            Las ventas que entran al banco se facturan desde{" "}
            <Link href="/admin/facturacion/bancos" className="font-medium text-accent-ink underline underline-offset-4">
              Facturación automática
            </Link>
            : ahí aparecen como comprobantes cuando se emiten.
          </p>
        )}
      </main>
    );
  }
  // Gate por módulo (ADR-054/055): la entrada al tablero de BANCOS solo se
  // muestra si el tenant tiene el módulo asignado (con el registry apagado,
  // `activos` es null y el predicado deja pasar — navegación legada intacta).
  const bancosActivo = moduleGateAllows("bancos", activos);

  return (
    <PageContainer>
      <PageHeader
        title="Facturación y cobros"
        description="Emití facturas electrónicas ante ARCA y generá links de cobro por Mercado Pago."
      />

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
    </PageContainer>
  );
}
