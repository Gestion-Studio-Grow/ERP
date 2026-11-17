// CONSOLA DE LA CUADRILLA · lo que necesita la pantalla de UN negocio, en una sola transacción parada en él.
import type { Prisma } from "@/generated/prisma/client";
import { huellaDe, leerHilo, leerTablero, mensajesRecientes, tiemposDeRespuesta, type ExcepcionVista, type Filtros, type MensajeVista, type Tablero } from "./consola-core";

type Tx = Prisma.TransactionClient;

export type CargaDelNegocio = {
  tablero: Tablero;
  seleccion: ExcepcionVista | null;
  hilo: { clave: string; titulo: string; mensajes: MensajeVista[]; excepciones: ExcepcionVista[] } | null;
  tiempos: number[];
};

const ID = /^[a-z0-9]{8,40}$/i;

export async function cargarNegocio(
  tx: Tx,
  tenantId: string,
  filtros: Filtros,
  pedido: { ex?: string; hilo?: string; abrirPrimera?: boolean },
): Promise<CargaDelNegocio> {
  const tablero = await leerTablero(tx, tenantId, filtros);
  let seleccion: ExcepcionVista | null = null;
  if (pedido.ex && ID.test(pedido.ex)) {
    seleccion = tablero.excepciones.find((e) => e.id === pedido.ex) ?? null;
    if (!seleccion) {
      const f = await tx.excepcionCuadrilla.findFirst({ where: { id: pedido.ex, tenantId }, include: { agente: { select: { nombre: true } } } });
      if (f) seleccion = { ...f, agenteNombre: f.agente.nombre, huella: huellaDe(f.contenido) };
    }
  } else if (pedido.abrirPrimera) {
    seleccion = tablero.excepciones.find((e) => e.estado === "PENDIENTE") ?? null;
  }

  let hilo: CargaDelNegocio["hilo"] = null;
  if (pedido.hilo?.startsWith("agente:")) {
    const agente = tablero.agentes.find((a) => `agente:${a.id}` === pedido.hilo);
    if (agente) {
      const pendientes = await tx.excepcionCuadrilla.findMany({
        where: { tenantId, agenteId: agente.id, estado: "PENDIENTE" },
        orderBy: { createdAt: "asc" },
        take: 20,
      });
      hilo = {
        clave: pedido.hilo,
        titulo: `Hilo de ${agente.nombre} · ${agente.puesto}`,
        mensajes: await leerHilo(tx, tenantId, pedido.hilo),
        excepciones: pendientes.map((f) => ({ ...f, agenteNombre: agente.nombre, huella: huellaDe(f.contenido) })),
      };
    }
  } else if (pedido.hilo?.startsWith("equipo:")) {
    const equipo = pedido.hilo.slice("equipo:".length);
    if (tablero.agentes.some((a) => a.equipo === equipo)) {
      hilo = { clave: pedido.hilo, titulo: `Hilo del equipo ${equipo}`, mensajes: await leerHilo(tx, tenantId, pedido.hilo), excepciones: [] };
    }
  }
  return { tablero, seleccion, hilo, tiempos: tiemposDeRespuesta(await mensajesRecientes(tx, tenantId)) };
}
