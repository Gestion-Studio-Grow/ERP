"use server";

// El estudio contable marca «presentado» o «pagado» en el calendario de UN cliente de su cartera
// (FC-11 · T7). Del formulario llegan sólo el cliente, el vencimiento y el estado: el estudio, la
// persona y el permiso salen de la sesión (`accesoAClienteDeCartera`), y el cliente se verifica
// contra la cartera antes de tocar nada. La escritura corre con la transacción del CLIENTE (RLS con
// su GUC) y verifica que el vencimiento sea de ese cliente. Nada más se puede cambiar desde acá.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { accesoAClienteDeCartera } from "@/lib/contador/recibidos-db";
import { cambiarEstadoVencimiento, generarCalendario } from "@/lib/contabilidad/repo";
import { contabilidadPrendidaEn } from "@/lib/contabilidad/modulo.server";
import { desdeDondeMarcaElEstudio, estudioPuedeMarcar, periodosParaGenerar } from "@/lib/contabilidad/monitor";

const texto = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

function volver(clienteId: string, aviso?: string): never {
  const ruta = `/contador/cliente/${encodeURIComponent(clienteId)}/vencimientos`;
  revalidatePath(ruta);
  redirect(aviso ? `${ruta}?aviso=${encodeURIComponent(aviso)}` : ruta);
}

async function clienteParaEscribir(clienteId: string) {
  const acceso = await accesoAClienteDeCartera(clienteId, true);
  if (!acceso.ok) volver(clienteId, acceso.error);
  if (!(await contabilidadPrendidaEn(acceso.cliente.id))) volver(clienteId, "Este cliente no tiene prendida Contabilidad en Factoque.");
  return acceso;
}

export async function marcarDesdeElEstudio(fd: FormData): Promise<void> {
  const clienteId = texto(fd, "clienteId");
  const estado = texto(fd, "estado");
  const acceso = await clienteParaEscribir(clienteId);
  if (!estudioPuedeMarcar(estado)) volver(clienteId, "Desde el estudio sólo se marca «presentado» o «pagado».");
  // La transición (desde qué estado, según la acción de la obligación) se valida en el repo,
  // atómica con la escritura: un POST armado a mano no reabre ni pisa lo cerrado por el negocio.
  const r = await cambiarEstadoVencimiento(
    acceso.cliente.id,
    texto(fd, "vencimientoId"),
    estado,
    {},
    {
      actor: `estudio:${acceso.estudioNombre}/${acceso.usuario.name}`,
      channel: "estudio",
      ids: { estudioTenantId: acceso.estudioTenantId, usuarioId: acceso.usuario.id },
    },
    { desde: (accion) => desdeDondeMarcaElEstudio(estado, accion) },
  );
  volver(clienteId, r.ok ? undefined : r.mensaje);
}

export async function generarDesdeElEstudio(fd: FormData): Promise<void> {
  const clienteId = texto(fd, "clienteId");
  const acceso = await clienteParaEscribir(clienteId);
  let creados = 0;
  for (const periodo of periodosParaGenerar()) {
    const r = await generarCalendario(acceso.cliente.id, null, periodo);
    if (!r.ok) volver(clienteId, r.mensaje);
    creados += r.creados;
  }
  volver(clienteId, creados === 0 ? "El calendario ya estaba al día." : `Sumamos ${creados} vencimiento${creados === 1 ? "" : "s"}.`);
}
