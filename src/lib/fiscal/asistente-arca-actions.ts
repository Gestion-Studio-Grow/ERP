"use server";

// Asistente ARCA del CLIENTE en el backoffice (/admin/facturacion?vista=arca). Cada action empieza con
// la guardia `exigirAsistenteArca`: sesión con `billing:manage`, módulo `arca` activo y el negocio SALE
// DE LA SESIÓN (nunca del formulario). Los pasos viven en ./asistente-arca-pasos.server.ts (los comparte
// Factoque, src/lib/facturita-arca-actions.ts); lo que toca la base, en ./asistente-arca.server.ts.
//
// Este archivo figura en OTRO_PLANO de src/lib/operador/guardia-negocio.test.ts con esta guardia.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { getActiveModuleIds, moduleGateAllows } from "@/lib/module-gating";
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

const VISTA = "/admin/facturacion";

/** La guardia del asistente del cliente. Redirige si no corresponde; si no, devuelve el negocio de la sesión. */
async function exigirAsistenteArca(): Promise<{ tenantId: string; actor: string }> {
  const user = await requireCapability("billing:manage");
  const tenantId = await getCurrentTenantId();
  if (user.tenantId !== tenantId) redirect("/admin/login");
  if (!moduleGateAllows("arca", await getActiveModuleIds())) redirect(VISTA);
  return { tenantId, actor: `user:${user.id}` };
}

function volver(r: Resultado): never {
  revalidatePath(VISTA);
  redirect(destinoDelPaso(VISTA, { vista: "arca" }, r));
}

export async function generarPedidoArcaAction() {
  const { tenantId, actor } = await exigirAsistenteArca();
  volver(await pasoGenerarPedido(tenantId, actor));
}

export async function cargarCertificadoArcaAction(formData: FormData) {
  const { tenantId, actor } = await exigirAsistenteArca();
  volver(await pasoCargarCertificado(tenantId, actor, formData));
}

export async function probarCertificadoArcaAction() {
  const { tenantId, actor } = await exigirAsistenteArca();
  volver(await pasoProbar(tenantId, actor, "backoffice"));
}

export async function pedirPaseArcaAction(formData: FormData) {
  const { tenantId, actor } = await exigirAsistenteArca();
  volver(await pasoPedirPase(tenantId, actor, formData));
}

/** «Obtené asistencia»: el estudio se elige de la red (se revalida en el servidor), o «propio» / «a confirmar». */
export async function pedirContadorArcaAction(formData: FormData) {
  const { tenantId, actor } = await exigirAsistenteArca();
  volver(await pasoPedirContador(tenantId, actor, formData));
}

export async function cancelarContadorArcaAction() {
  const { tenantId, actor } = await exigirAsistenteArca();
  volver(await pasoCancelarContador(tenantId, actor));
}
