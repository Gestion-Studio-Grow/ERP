"use server";

// RENDICIÓN DE LA PROFESIONAL QUE COBRA APARTE — la acción de la pantalla de Comisiones.
//
// Registrar la rendición es PLATA QUE ENTRA AL CAJÓN → `cash:manage` (dueña y recepción, como
// abrir y cerrar la caja). Registrar una RETENCIÓN (la profesional se queda con su comisión) es
// pagar comisión → además `commissions:manage` (sólo la dueña). Diseño:
// docs/producto/comisiones/RENDICION.md.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCapability } from "@/lib/authz";
import { permisoEfectivo } from "@/lib/capabilities";
import { auditAdmin } from "@/lib/audit-core";
import { getCurrentTenantId } from "@/lib/tenant";
import { tenantTransaction } from "@/lib/rls";
import { prisma } from "@/lib/prisma";
import { isDemoSandbox } from "@/lib/demo-sandbox";
import { lastClosedDay } from "@/lib/caja/frontera-cierre";
import { transferenciaEnElLibroTx } from "@/lib/caja/transferencia-en-el-libro";
import { parseMedioDeLiquidacion } from "@/lib/comision-liquidacion";
import { leerImporte } from "@/lib/pos-peso";
import {
  RendicionRechazada,
  esChoqueDeClaveDeRendicion,
  leerRendicionesInTx,
  registrarRendicionInTx,
  type LecturaRendiciones,
} from "./rendicion-repo";

const COMISIONES_PATH = "/admin/comisiones";
const LIBRO_PATH = "/admin/caja/libro";
const CAJA_PATH = "/admin/caja";

function volverCon(status: string): never {
  redirect(`${COMISIONES_PATH}?status=${encodeURIComponent(status)}`);
}

/** Lo que cada profesional que cobra aparte tiene a rendir, y las últimas rendiciones. */
export async function getRendiciones(): Promise<LecturaRendiciones> {
  await requireCapability("reports:read");
  if (isDemoSandbox()) return { habilitada: false };
  const tenantId = await getCurrentTenantId();
  return tenantTransaction((tx) => leerRendicionesInTx(tx, tenantId), { tenantId });
}

export async function registrarRendicion(formData: FormData) {
  const user = await requireCapability("cash:manage");
  if (isDemoSandbox()) volverCon("rendicion_sin-tabla");
  const tenantId = await getCurrentTenantId();

  const professionalId = String(formData.get("professionalId") ?? "").trim();
  const cobroIds = formData.getAll("cobroId").map((v) => String(v));
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "").trim();
  if (!professionalId || !idempotencyKey) volverCon("rendicion_sin-cobros");
  const lectura = leerImporte(String(formData.get("entregado") ?? ""));
  const entregado = lectura.estado === "ok" ? lectura.valor : NaN;
  const nota = String(formData.get("nota") ?? "").trim().slice(0, 200) || null;
  // Medio por defecto: efectivo, como la liquidación de hoy (provisional a confirmar, F5 del dueño).
  const method = parseMedioDeLiquidacion(formData.get("method")) ?? "EFECTIVO";
  if (method === "TRANSFERENCIA" && !(await transferenciaEnElLibroTx(prisma))) volverCon("rendicion_medio");

  const cerradoHasta = await lastClosedDay(tenantId);
  const actor = `user:${user.id}`;

  let r;
  try {
    r = await tenantTransaction(
      (tx) =>
        registrarRendicionInTx(tx, tenantId, {
          professionalId,
          cobroIds,
          entregado,
          method,
          idempotencyKey,
          nota,
          actor,
          puedeRetener: permisoEfectivo(user, "commissions:manage"),
          cerradoHasta,
        }),
      { tenantId },
    );
  } catch (e) {
    if (e instanceof RendicionRechazada) volverCon(`rendicion_${e.motivo}`);
    // Dos envíos de la MISMA rendición que pasaron juntos el pre-check: ganó el otro.
    if (esChoqueDeClaveDeRendicion(e)) volverCon("rendicion_ok");
    throw e;
  }

  if (r.estado === "registrada") {
    await auditAdmin({
      action: "rendicion",
      entity: "RendicionProfesional",
      entityId: r.rendicionId,
      changes: {
        professionalId,
        profesional: r.profesional,
        cobros: r.cantidad,
        cobrado: r.cobrado,
        entregado: r.entregado,
        retenido: r.retenido,
        method,
        cashMovementId: r.cashMovementId,
      },
    });
    revalidatePath(LIBRO_PATH);
    revalidatePath(CAJA_PATH);
  }
  revalidatePath(COMISIONES_PATH);
  volverCon("rendicion_ok");
}
