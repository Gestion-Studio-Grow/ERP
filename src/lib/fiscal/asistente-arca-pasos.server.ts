// Los pasos del asistente ARCA del CLIENTE, sin guardia ni redirección: los usan los dos planos del
// cliente, cada uno con su guardia y su pantalla de vuelta:
//   · el backoffice (/admin/facturacion?vista=arca) → ./asistente-arca-actions.ts
//   · Factoque (/facturita/app/arca)                → src/lib/facturita-arca-actions.ts
// NO es "use server" (ningún export es un endpoint). El negocio llega SIEMPRE de la guardia de quien
// llama (sesión), nunca del formulario. El certificado lo saca el cliente con su clave fiscal: acá
// sólo se arma el pedido (CSR), se recibe el .crt, se prueba y se pide el pase.

import { logger } from "@/lib/logger";
import { verificarCertificadoDelNegocio } from "@/lib/operador/verificar-arca.server";
import { mensajeDeVerificacion } from "@/lib/fiscal/verificar-con-arca";
import { TOPE_CERTIFICADO_BYTES } from "@/lib/fiscal/asistente-arca";
import {
  cancelarContadorDelNegocio,
  cargarCertificadoDelPedido,
  generarPedidoDelNegocio,
  pedirContadorDelNegocio,
  pedirPaseDelNegocio,
  registrarPruebaOk,
  type Resultado,
} from "@/lib/fiscal/asistente-arca.server";

export type { Resultado };

export function pasoGenerarPedido(tenantId: string, actor: string): Promise<Resultado> {
  return generarPedidoDelNegocio(tenantId, actor);
}

export async function pasoCargarCertificado(tenantId: string, actor: string, formData: FormData): Promise<Resultado> {
  const archivo = formData.get("certArchivo");
  const texto = String(formData.get("certPem") || "").trim();
  let entrada: string | Uint8Array = texto;
  if (archivo instanceof File && archivo.size > 0) {
    if (archivo.size > TOPE_CERTIFICADO_BYTES) return { ok: false, motivo: "El archivo es muy grande para ser un certificado." };
    entrada = new Uint8Array(await archivo.arrayBuffer());
  } else if (texto.length > TOPE_CERTIFICADO_BYTES) {
    return { ok: false, motivo: "Lo pegado es muy largo para ser un certificado." };
  }
  if (!texto && !(archivo instanceof File && archivo.size > 0)) {
    return { ok: false, motivo: "Pegá el certificado o subí el archivo .crt." };
  }
  return cargarCertificadoDelPedido(tenantId, entrada, actor);
}

export async function pasoProbar(tenantId: string, actor: string, plano: string): Promise<Resultado> {
  const r = await verificarCertificadoDelNegocio(tenantId);
  logger.info("arca.verificacion", `Verificación del certificado con ARCA (asistente del cliente, ${plano})`, {
    tenantId,
    actor,
    ok: r.ok,
    ...(r.ok ? { entorno: r.entorno, conCae: !!r.prueba } : { paso: r.paso }),
  });
  if (r.ok) {
    await registrarPruebaOk(tenantId, actor, r.entorno).catch((e) => {
      logger.warn("arca.asistente", "No se pudo registrar la prueba con ARCA", { tenantId, err: e instanceof Error ? e.name : "error" });
    });
  }
  const texto = mensajeDeVerificacion(r);
  return r.ok ? { ok: true, mensaje: texto } : { ok: false, motivo: texto };
}

export function pasoPedirPase(tenantId: string, actor: string, formData: FormData): Promise<Resultado> {
  return pedirPaseDelNegocio(tenantId, actor, formData.get("confirmacion"));
}

export function pasoPedirContador(tenantId: string, actor: string, formData: FormData): Promise<Resultado> {
  return pedirContadorDelNegocio(tenantId, actor, formData.get("estudioTenantId"));
}

export function pasoCancelarContador(tenantId: string, actor: string): Promise<Resultado> {
  return cancelarContadorDelNegocio(tenantId, actor);
}

/** El destino después de un paso: la vista del asistente con el aviso (ok o error) en la query. */
export function destinoDelPaso(vista: string, extra: Record<string, string>, r: Resultado): string {
  const q = new URLSearchParams(extra);
  if (r.ok) q.set("ok", r.mensaje);
  else q.set("error", r.motivo);
  const query = q.toString();
  return `${vista}${query ? `?${query}` : ""}#asistente-arca`;
}
