// Panel del contador (módulo CARTERA — ADR-025 §12 / ADR-045) — AHORA REAL.
// Un estudio contable ve su cartera de clientes (cada uno, un tenant del ERP):
// facturado del mes, facturas vs tope con barra de objetivo, pendientes de
// revisión, última importación y estado ARCA; con alta de cliente, emisión en
// lote y pausa/baja de la fila. Server component: junta los datos con las
// actions de cartera; la interacción vive en los client components de la carpeta.
//
// BARRERA DE ACCESO (doble, server-side): capability `cartera:manage` (solo
// OWNER) + módulo `cartera` ASIGNADO al tenant actual (ADR-055) — un admin común
// de un negocio cualquiera NO ve esta pantalla. Las actions repiten el gate.
//
// AISLAMIENTO: el panel NUNCA evade RLS — cada dato de cliente sale de
// tenantTransaction(clienteTenantId) vía los cores de bancos-glue (ver
// src/lib/cartera-actions.ts). Jamás operatorPrisma en este camino.

import { notFound } from "next/navigation";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { basePrisma } from "@/lib/prisma-base";
import { MODULO_CARTERA, UMBRAL_ALERTA_CAP } from "@/lib/cartera-core";
import { listarCarteraAction } from "@/lib/cartera-actions";
import { Badge, KpiTile, PageContainer, PageHeader, fmtMoneyARS, fmtNumberAR } from "@/components/ui";
import ThemeToggle from "@/app/admin/(dashboard)/ThemeToggle";
import CarteraPanel from "./CarteraPanel";
import AltaCliente from "./AltaCliente";

export const dynamic = "force-dynamic";

// Ícono de línea, mismo lenguaje que AdminShell/bancos (stroke 1.85, currentColor).
function Icono({ path }: { path: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4"
      aria-hidden
    >
      {path}
    </svg>
  );
}

export default async function ContadorPage() {
  // Guarda de rol de la página (las actions la repiten server-side por acción).
  await requireCapability("cartera:manage");
  const estudioTenantId = await getCurrentTenantId();

  // Barrera dura por ASIGNACIÓN de módulo (ADR-055): sin `cartera` en
  // Tenant.modules, este panel no existe para el tenant (aunque el rol dé la
  // capability). Chequeo directo, independiente del flag del registry.
  const estudio = await basePrisma.tenant.findUnique({
    where: { id: estudioTenantId },
    select: { name: true, modules: true },
  });
  if (!estudio?.modules?.includes(MODULO_CARTERA)) notFound();

  const res = await listarCarteraAction();

  // Defensa Gate 2: si el código llegó antes que su migración, estado honesto.
  if (!res.ok) {
    return (
      <PageContainer>
        <PageHeader
          title="Mi cartera"
          description="El panel está instalado pero falta el último paso de base de datos."
        />
        <div
          role="alert"
          className="rounded-xl border border-line bg-surface-raised p-5 text-sm text-muted shadow-card"
        >
          {res.error}
        </div>
      </PageContainer>
    );
  }

  const { filas, resumen } = res;
  const base = process.env.APP_BASE_DOMAIN?.trim() || null;

  return (
    <PageContainer>
      <PageHeader
        title="Mi cartera"
        badge={
          <Badge tone="accent" dot>
            {estudio.name}
          </Badge>
        }
        description={
          <>
            Tus clientes, cada uno con su facturación al día: cuánto lleva facturado el mes, qué tan
            cerca está del tope y qué quedó esperando tu revisión. Todo desde un solo lugar.
          </>
        }
        actions={<ThemeToggle />}
      />

      {resumen.cercaDelTope > 0 && (
        <div
          role="alert"
          className="mb-lg rounded-xl border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger"
        >
          <strong>{fmtNumberAR(resumen.cercaDelTope)}</strong>{" "}
          {resumen.cercaDelTope === 1 ? "cliente está" : "clientes están"} al{" "}
          {Math.round(UMBRAL_ALERTA_CAP * 100)}% o más del tope de facturas del mes. Revisá si
          corresponde subir el tope o frenar la emisión automática.
        </div>
      )}

      {/* KPIs de la cartera — 4-up desde lg con gap 14px (fix 28); KpiTile ya
          trae tabular-nums (fix 7). */}
      <section
        aria-label="Indicadores de la cartera"
        className="mb-xl grid grid-cols-1 gap-[14px] sm:grid-cols-2 lg:grid-cols-4"
      >
        <KpiTile
          label="Clientes activos"
          value={fmtNumberAR(resumen.clientes)}
          sub={
            resumen.pausados > 0
              ? `${fmtNumberAR(resumen.pausados)} en pausa.`
              : "Toda la cartera operando."
          }
          icon={<Icono path={<><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c.8-3 3-4.5 5.5-4.5S13.7 16 14.5 19" /><circle cx="17" cy="9" r="2.4" /><path d="M15.5 14.8c2.3.1 4.1 1.5 4.8 4" /></>} />}
        />
        <KpiTile
          label="Facturado del mes"
          value={fmtMoneyARS(resumen.montoFacturadoMes, 0)}
          sub={`${fmtNumberAR(resumen.facturasMes)} facturas entre todos los clientes.`}
          icon={<Icono path={<path d="M4 17l5-6 4 3 7-9" />} />}
        />
        <KpiTile
          label="Pendientes de revisión"
          value={
            <span className={resumen.pendientesRevision > 0 ? "text-warning" : undefined}>
              {fmtNumberAR(resumen.pendientesRevision)}
            </span>
          }
          sub={
            resumen.pendientesRevision > 0
              ? "Ventas que necesitan datos del comprador."
              : "Nada para revisar. Todo al día."
          }
          icon={<Icono path={<><circle cx="12" cy="12" r="8.5" /><path d="M12 8v4l3 2" /></>} />}
        />
        <KpiTile
          label="Listas para emitir"
          value={fmtNumberAR(resumen.listasParaEmitir)}
          sub="Propuestas automáticas esperando un clic."
          icon={<Icono path={<><path d="M7 3h10v18l-2.5-1.5L12 21l-2.5-1.5L7 21V3z" /><path d="M10 8h4m-4 4h4" /></>} />}
        />
      </section>

      {/* Cartera: tabla + panel de detalle con acciones */}
      <CarteraPanel filas={filas} baseDomain={base} />

      {/* Alta de cliente */}
      <AltaCliente />

      <footer className="mt-2xl border-t border-line pt-4 text-center text-xs text-faint">
        Con tecnología de Gestión Studio Grow
      </footer>
    </PageContainer>
  );
}
