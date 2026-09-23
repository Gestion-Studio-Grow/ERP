// ============================================================================
// EL PAQUETE DE UN CLIENTE, bajado por su estudio contable (/contador). SERVIDOR.
// ============================================================================
//
// La contadora baja el paquete del mes de cada cliente desde su cartera, sin pedirle el
// usuario a la dueña. Es lectura CRUZADA entre negocios, así que va con las mismas reglas de
// la cartera (cartera-core.ts, cartera-actions.ts):
//   1. la persona tiene `cartera:manage` y su negocio tiene el módulo `cartera` ASIGNADO
//      (lectura directa de Tenant.modules, independiente de cualquier flag);
//   2. el cliente pedido es de la cartera de SU estudio (`exigirClienteDeCartera`, leyendo
//      CarteraCliente con el GUC del estudio). Fila inexistente o de baja: el mismo "no está
//      en tu cartera", sin decir si el negocio existe;
//   3. recién ahí se lee el cliente, y sólo con `tenantTransaction({ tenantId: cliente })`.
// Jamás operatorPrisma. La descarga queda escrita en la auditoría del CLIENTE ("descargado
// por Juan (Estudio Norte)"), que es donde la dueña la ve.
//
// Sin "use server": no es un endpoint. Lo llama la ruta /contador/paquete, que sólo le pasa
// lo que vino en la URL; todo lo demás sale de la sesión.

import "server-only";
import { basePrisma } from "@/lib/prisma-base";
import { tenantTransaction } from "@/lib/rls";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { MODULO_CARTERA, exigirClienteDeCartera, type EstadoCartera, type FilaCarteraDb } from "@/lib/cartera-core";
import { esMesKey } from "@/lib/libros/fecha-fiscal";
import { mesCerrable } from "./cierre-mes";
import { armarPaquete, nombreDelPaquete } from "./paquete";
import { leerDatosPaquete, registrarDescarga } from "./paquete-lectura";

export type ResultadoPaqueteCartera =
  | { ok: true; cuerpo: string; archivo: string }
  | { ok: false; status: number; error: string };

/** La fila de la cartera del estudio para ese cliente (con el GUC del ESTUDIO). */
async function filaDeCartera(estudioTenantId: string, clienteTenantId: string): Promise<FilaCarteraDb | null> {
  const fila = await tenantTransaction(
    (tx) =>
      tx.carteraCliente.findUnique({
        where: { tenantId_clienteTenantId: { tenantId: estudioTenantId, clienteTenantId } },
        select: { id: true, clienteTenantId: true, alias: true, estado: true },
      }),
    { tenantId: estudioTenantId },
  );
  return fila ? { ...fila, estado: fila.estado as EstadoCartera } : null;
}

/** El paquete del mes de un cliente de la cartera, o por qué no se puede bajar. */
export async function paqueteDelClienteParaElEstudio(
  clienteRaw: string | null,
  mesRaw: string | null,
  ahora: Date,
): Promise<ResultadoPaqueteCartera> {
  const user = await requireCapability("cartera:manage");
  const estudioTenantId = await getCurrentTenantId();
  const estudio = await basePrisma.tenant.findUnique({
    where: { id: estudioTenantId },
    select: { name: true, modules: true },
  });
  if (!estudio?.modules?.includes(MODULO_CARTERA)) {
    return { ok: false, status: 404, error: "Tu negocio no tiene la cartera del estudio contable." };
  }
  if (!esMesKey(mesRaw) || !mesCerrable(mesRaw, ahora)) {
    return { ok: false, status: 400, error: "Elegí un mes que ya terminó." };
  }
  const clienteTenantId = String(clienteRaw ?? "").trim();
  if (!clienteTenantId) return { ok: false, status: 400, error: "Falta el cliente." };

  // Pausado también: la contadora puede necesitar el cierre de un cliente que pausó.
  const pertenencia = await exigirClienteDeCartera(filaDeCartera, estudioTenantId, clienteTenantId, { permitirPausada: true });
  if (!pertenencia.ok) return { ok: false, status: 404, error: pertenencia.error };

  // Tenant está fuera de RLS por diseño; el id ya salió de la cartera verificada.
  const cliente = await basePrisma.tenant.findUnique({
    where: { id: clienteTenantId },
    select: { name: true, slug: true },
  });
  if (!cliente) return { ok: false, status: 404, error: "Ese cliente no está en tu cartera." };

  const datos = await leerDatosPaquete(clienteTenantId, mesRaw, { negocio: cliente.name, pasos: null, ahora });
  const cuerpo = armarPaquete(datos);
  const borrador = !datos.estado.congelado;
  await tenantTransaction(
    (tx) =>
      registrarDescarga(tx, clienteTenantId, mesRaw, {
        actor: `estudio:${estudioTenantId}`,
        por: `${user.name} (${estudio.name})`,
        borrador,
      }),
    { tenantId: clienteTenantId },
  );
  return { ok: true, cuerpo, archivo: nombreDelPaquete(mesRaw, cliente.slug, borrador) };
}
