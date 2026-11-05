"use server";

// Asistente ARCA del CLIENTE (/admin/facturacion?vista=arca). Cada action empieza con la guardia
// `exigirAsistenteArca`: sesión con `billing:manage`, módulo `arca` activo y el negocio SALE DE LA
// SESIÓN (nunca del formulario). Lo que toca la base vive en ./asistente-arca.server.ts; el certificado
// se valida contra el CUIT del negocio, que el cliente no puede editar (lo carga GSG).
//
// Este archivo importa el plano del operador (verificar-arca.server): figura en OTRO_PLANO de
// src/lib/operador/guardia-negocio.test.ts con esta guardia.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { getActiveModuleIds, moduleGateAllows } from "@/lib/module-gating";
import { logger } from "@/lib/logger";
import { verificarCertificadoDelNegocio } from "@/lib/operador/verificar-arca.server";
import { mensajeDeVerificacion } from "@/lib/fiscal/verificar-con-arca";
import { TOPE_CERTIFICADO_BYTES } from "@/lib/fiscal/asistente-arca";
import {
  cargarCertificadoDelPedido,
  generarPedidoDelNegocio,
  pedirPaseDelNegocio,
  type Resultado,
} from "@/lib/fiscal/asistente-arca.server";

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
  const q = new URLSearchParams({ vista: "arca" });
  if (r.ok) q.set("ok", r.mensaje);
  else q.set("error", r.motivo);
  revalidatePath(VISTA);
  redirect(`${VISTA}?${q.toString()}#asistente-arca`);
}

export async function generarPedidoArcaAction() {
  const { tenantId, actor } = await exigirAsistenteArca();
  volver(await generarPedidoDelNegocio(tenantId, actor));
}

export async function cargarCertificadoArcaAction(formData: FormData) {
  const { tenantId, actor } = await exigirAsistenteArca();
  const archivo = formData.get("certArchivo");
  const texto = String(formData.get("certPem") || "").trim();
  let entrada: string | Uint8Array = texto;
  if (archivo instanceof File && archivo.size > 0) {
    if (archivo.size > TOPE_CERTIFICADO_BYTES) volver({ ok: false, motivo: "El archivo es muy grande para ser un certificado." });
    entrada = new Uint8Array(await archivo.arrayBuffer());
  } else if (texto.length > TOPE_CERTIFICADO_BYTES) {
    volver({ ok: false, motivo: "Lo pegado es muy largo para ser un certificado." });
  }
  if (!texto && !(archivo instanceof File && archivo.size > 0)) {
    volver({ ok: false, motivo: "Pegá el certificado o subí el archivo .crt." });
  }
  volver(await cargarCertificadoDelPedido(tenantId, entrada, actor));
}

export async function probarCertificadoArcaAction() {
  const { tenantId, actor } = await exigirAsistenteArca();
  const r = await verificarCertificadoDelNegocio(tenantId);
  logger.info("arca.verificacion", "Verificación del certificado con ARCA (asistente del cliente)", {
    tenantId,
    actor,
    ok: r.ok,
    ...(r.ok ? { entorno: r.entorno, conCae: !!r.prueba } : { paso: r.paso }),
  });
  const texto = mensajeDeVerificacion(r);
  volver(r.ok ? { ok: true, mensaje: texto } : { ok: false, motivo: texto });
}

export async function pedirPaseArcaAction(formData: FormData) {
  const { tenantId, actor } = await exigirAsistenteArca();
  volver(await pedirPaseDelNegocio(tenantId, actor, formData.get("confirmacion")));
}
