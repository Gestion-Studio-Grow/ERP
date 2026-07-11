// Configuración del módulo de Facturación automática (BANCOS): umbral de
// identificación, tope de facturas/mes y domicilio del emisor. Server
// component — lee la config actual del tenant (tenantId explícito, ADR-018) y
// delega la edición al ConfigForm, que guarda con guardarConfigBancosAction.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { getActiveModuleIds, moduleGateAllows } from "@/lib/module-gating";
import { UMBRAL_IDENTIFICACION_DEFAULT, CAP_FACTURAS_MES_DEFAULT } from "@/plugins/bancos";
import { PageHeader, buttonClasses } from "@/components/ui";
import ConfigForm from "./ConfigForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Configuración · Facturación automática",
  generator: "Gestión Studio Grow",
};

export default async function ConfiguracionBancosPage() {
  await requireCapability("billing:manage");
  // Gate por módulo (ADR-054/055, OBS-1 del Gate) — mismo criterio que el tablero.
  const activos = await getActiveModuleIds();
  if (!moduleGateAllows("bancos", activos)) notFound();
  const tenantId = await getCurrentTenantId();

  // Lectura directa y liviana de los 3 campos (no hay action de lectura; la
  // regla del frente admite una sola action nueva, la de guardado). Si la
  // migración de bancos no corrió todavía (P2022, columnas inexistentes),
  // seguimos con defaults en vez de un 500 (defensa Gate 2, OBS-1).
  let tenant: {
    bancosUmbralIdentificacion: unknown;
    bancosCapFacturasMes: number | null;
    bancosDomicilioEmisor: string | null;
  } | null = null;
  try {
    tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        bancosUmbralIdentificacion: true,
        bancosCapFacturasMes: true,
        bancosDomicilioEmisor: true,
      },
    });
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code !== "P2021" && code !== "P2022") throw e;
  }

  const umbralActual =
    tenant?.bancosUmbralIdentificacion != null
      ? Number(tenant.bancosUmbralIdentificacion)
      : null;

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Configuración de facturación automática"
        description="Las reglas con las que el módulo decide qué facturar solo y cuándo pedirte una mano."
        actions={
          <Link href="/admin/facturacion/bancos" className={buttonClasses("ghost", "sm")}>
            ← Volver al tablero
          </Link>
        }
      />

      <ConfigForm
        umbralActual={umbralActual}
        capActual={tenant?.bancosCapFacturasMes ?? null}
        domicilioActual={tenant?.bancosDomicilioEmisor ?? null}
        umbralDefault={UMBRAL_IDENTIFICACION_DEFAULT}
        capDefault={CAP_FACTURAS_MES_DEFAULT}
      />

      <footer className="mt-2xl border-t border-line pt-4 text-center text-xs text-faint">
        Con tecnología de Gestión Studio Grow
      </footer>
    </main>
  );
}
