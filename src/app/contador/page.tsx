// Consola del contador (módulo CARTERA — ADR-025 §12 / ADR-045).
// Un estudio contable ve su cartera de clientes (cada uno, un tenant del ERP) en dos
// partes, las dos salidas de UNA pasada por cliente (`monitorCarteraAction`):
//   1. arriba, "de quién me ocupo hoy" (MonitorBandeja): cuántos no pueden emitir y una
//      línea por cliente con su peor señal y la acción que existe;
//   2. abajo, el VOLUMEN: facturado con validez fiscal (separado de lo emitido en
//      prueba), facturas del cupo, pendientes de revisión y la tabla con el detalle.
// Server component: junta los datos con las actions de cartera; la interacción vive en
// los client components de la carpeta.
//
// BARRERA DE ACCESO (doble, server-side): capability `cartera:manage` (solo
// OWNER) + módulo `cartera` ASIGNADO al tenant actual (ADR-055) — un admin común
// de un negocio cualquiera NO ve esta pantalla. Las actions repiten el gate.
//
// AISLAMIENTO: el panel NUNCA evade RLS — cada dato de cliente sale de
// tenantTransaction(clienteTenantId) (ver src/lib/cartera-actions.ts). Jamás
// operatorPrisma en este camino.

import { notFound } from "next/navigation";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { basePrisma } from "@/lib/prisma-base";
import { MODULO_CARTERA } from "@/lib/cartera-core";
import { monitorCarteraAction } from "@/lib/cartera-actions";
import { Badge, KpiTile, PageContainer, PageHeader, fmtMoneyARS, fmtNumberAR } from "@/components/ui";
import ThemeToggle from "@/app/admin/(dashboard)/ThemeToggle";
import CarteraPanel from "./CarteraPanel";
import MonitorBandeja from "./MonitorBandeja";
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

  const res = await monitorCarteraAction();

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

  const { filas, resumen, monitor } = res;
  const base = process.env.APP_BASE_DOMAIN?.trim() || null;
  // Si NINGÚN cliente emite con validez fiscal (hoy: toda la cartera en homologación), la
  // tarjeta no puede decir "facturado": dice lo que es, emitido en prueba.
  const hayFiscal = filas.some((f) => f.validezFiscal);

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
            Primero, de qué cliente te tenés que ocupar hoy y qué hacer. Abajo, cuánto facturó cada
            uno este mes y qué quedó esperando tu revisión.
          </>
        }
        actions={<ThemeToggle />}
      />

      {/* "De quién me ocupo hoy": sale de la misma pasada que el volumen de abajo. */}
      <MonitorBandeja
        filas={monitor.filas}
        resumen={monitor.resumen}
        avisos={monitor.avisos}
        cartera={filas}
        baseDomain={base}
      />

      {/* KPIs de VOLUMEN — 4-up desde lg con gap 14px (fix 28); KpiTile ya trae
          tabular-nums (fix 7). La plata y la cantidad van en tarjetas SEPARADAS porque
          responden a relojes distintos: la plata es fiscal (comprobantes con CAE, por su
          fecha) y la cantidad es el cupo del plan (todo lo emitido en el mes). */}
      <section
        aria-label="Volumen de la cartera en el mes"
        className="mb-xl grid grid-cols-1 gap-[14px] sm:grid-cols-2 lg:grid-cols-4"
      >
        {hayFiscal ? (
          <KpiTile
            label="Facturado con validez fiscal"
            value={fmtMoneyARS(resumen.montoFiscalMes, 0)}
            sub={
              resumen.montoPruebaMes > 0
                ? `Aparte, ${fmtMoneyARS(resumen.montoPruebaMes, 0)} emitido en prueba (sin validez fiscal).`
                : "Con CAE de ARCA, por la fecha del comprobante."
            }
            icon={<Icono path={<path d="M4 17l5-6 4 3 7-9" />} />}
          />
        ) : (
          <KpiTile
            label="Emitido en prueba (sin validez fiscal)"
            value={fmtMoneyARS(resumen.montoPruebaMes, 0)}
            sub="Tiene CAE de prueba: todavía no es facturación."
            icon={<Icono path={<path d="M4 17l5-6 4 3 7-9" />} />}
          />
        )}
        <KpiTile
          label="Facturas del cupo"
          value={fmtNumberAR(resumen.facturasMes)}
          sub="Todo lo emitido este mes entre todos tus clientes, rechazos incluidos: es lo que cuenta para el cupo del plan."
          icon={<Icono path={<path d="M5 6h14M5 12h14M5 18h9" />} />}
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
