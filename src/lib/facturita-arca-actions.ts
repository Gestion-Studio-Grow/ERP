"use server";

// FACTOQUE · Asistente ARCA del cliente dentro de la app (/facturita/app/arca). El backoffice
// (/admin) devuelve a Factoque a /facturita/app (layout de /admin), así que el asistente vive acá con
// sus propias actions, que vuelven acá. Cada una empieza con la guardia `exigirArcaFactoque`: sesión
// con `billing:manage` de ESTE negocio y negocio de Factoque; el negocio SALE DE LA SESIÓN, nunca del
// formulario. Los pasos son los mismos del backoffice (src/lib/fiscal/asistente-arca-pasos.server.ts).
// El certificado lo saca el CLIENTE con su clave fiscal: el asistente lo guía, GSG no lo saca.
//
// Figura en OTRO_PLANO de src/lib/operador/guardia-negocio.test.ts con esta guardia.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { tenantTransaction } from "@/lib/rls";
import {
  destinoDelPaso,
  pasoCancelarContador,
  pasoCargarCertificado,
  pasoGenerarPedido,
  pasoPedirContador,
  pasoPedirPase,
  pasoProbar,
  type Resultado,
} from "@/lib/fiscal/asistente-arca-pasos.server";

const VISTA = "/facturita/app/arca";

/** La guardia del asistente en Factoque. Redirige si no corresponde; si no, devuelve el negocio de la sesión. */
async function exigirArcaFactoque(): Promise<{ tenantId: string; actor: string }> {
  const user = await requireCapability("billing:manage");
  const tenantId = await getCurrentTenantId();
  if (user.tenantId !== tenantId) redirect("/admin/login");
  const tenant = await tenantTransaction(
    (tx) => tx.tenant.findUnique({ where: { id: tenantId }, select: { blueprintId: true } }),
    { tenantId },
  );
  if (tenant?.blueprintId !== "facturita") redirect("/admin");
  return { tenantId, actor: `user:${user.id}` };
}

function volver(r: Resultado): never {
  revalidatePath(VISTA);
  revalidatePath("/facturita/app/cuenta");
  redirect(destinoDelPaso(VISTA, {}, r));
}

export async function generarPedidoArcaFactoqueAction() {
  const { tenantId, actor } = await exigirArcaFactoque();
  volver(await pasoGenerarPedido(tenantId, actor));
}

export async function cargarCertificadoArcaFactoqueAction(formData: FormData) {
  const { tenantId, actor } = await exigirArcaFactoque();
  volver(await pasoCargarCertificado(tenantId, actor, formData));
}

export async function probarCertificadoArcaFactoqueAction() {
  const { tenantId, actor } = await exigirArcaFactoque();
  volver(await pasoProbar(tenantId, actor, "factoque"));
}

export async function pedirPaseArcaFactoqueAction(formData: FormData) {
  const { tenantId, actor } = await exigirArcaFactoque();
  volver(await pasoPedirPase(tenantId, actor, formData));
}

export async function pedirContadorArcaFactoqueAction(formData: FormData) {
  const { tenantId, actor } = await exigirArcaFactoque();
  volver(await pasoPedirContador(tenantId, actor, formData));
}

export async function cancelarContadorArcaFactoqueAction() {
  const { tenantId, actor } = await exigirArcaFactoque();
  volver(await pasoCancelarContador(tenantId, actor));
}
