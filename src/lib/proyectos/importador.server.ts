// ============================================================================
// PROYECTOS · Etapa 2 · T3 — importador: lectura de la base y escritura de las altas, SIEMPRE dentro de la transacción
// del negocio que abre la acción (acciones-importador.ts). Sin export de endpoints: este archivo no es "use server".
// ============================================================================

import "server-only";
import { randomBytes } from "node:crypto";
import type { tenantTransaction } from "@/lib/rls";
import { sha256, type BaseImportacion, type PlanImportacion, mensajeDeDatosCrudos } from "./importador-core";

export type TxImportador = Parameters<Parameters<typeof tenantTransaction>[0]>[0];

export const ENTIDAD_IMPORTACION = "Importacion";
export const CAMPO_CLAVE = "clave";
export const AUTOR_IMPORTADOR = "Importador";

/** Año en Buenos Aires de una fecha guardada. */
const anioAR = (d: Date): number => new Date(d.getTime() - 3 * 3_600_000).getUTCFullYear();

/** Candado por negocio hasta el fin de la transacción: dos confirmaciones a la vez se ordenan y la segunda ve la primera. */
export async function tomarCandadoImportador(tx: TxImportador, tenantId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`importador:${tenantId}`}))`;
}

/** Lo que el plan necesita del negocio, leído en la MISMA transacción que escribe. */
export async function leerBaseImportacion(tx: TxImportador, tenantId: string): Promise<BaseImportacion> {
  const [clientes, personas, marcas, proyectos] = await Promise.all([
    tx.client.findMany({ where: { tenantId }, select: { id: true, name: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    tx.proyectoPersona.findMany({ where: { tenantId, activa: true }, select: { id: true, nombre: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    tx.proyectoCambio.findMany({ where: { tenantId, entidad: ENTIDAD_IMPORTACION, campo: CAMPO_CLAVE }, select: { despues: true } }),
    tx.proyecto.findMany({ where: { tenantId }, select: { nombre: true, createdAt: true, fechaEvento: true, client: { select: { name: true } } } }),
  ]);
  return {
    tenantId,
    clientes: clientes.map((c) => ({ id: c.id, nombre: c.name })),
    personas,
    claves: marcas.flatMap((m) => (m.despues ? [m.despues] : [])),
    proyectos: proyectos.flatMap((p) => {
      const anios = new Set([anioAR(p.createdAt), ...(p.fechaEvento ? [anioAR(p.fechaEvento)] : [])]);
      return [...anios].map((anio) => ({ cliente: p.client.name, nombre: p.nombre, anio }));
    }),
  };
}

export interface ConfigAlta {
  ivaPct: number;
  condiciones: string;
}

/**
 * Escribe SÓLO las altas del plan: cliente (existente o nuevo), proyecto con su número, presupuesto v1 vacío, equipo,
 * los mensajes del importador (datos crudos + un mensaje por comentario) y la marca de idempotencia. Sin checklist,
 * sin cuotas, sin movimientos de caja. Llamar con el candado tomado y el plan replanificado en esta transacción.
 */
export async function escribirImportacion(tx: TxImportador, tenantId: string, plan: PlanImportacion, autor: string, config: ConfigAlta): Promise<{ proyectos: number; clientesNuevos: number; ids: string[] }> {
  const clientes = new Map<string, string>();
  let clientesNuevos = 0;
  for (const c of plan.clientesNuevos) {
    const creado = await tx.client.create({ data: { tenantId, name: c.nombre, phone: `sin-tel-imp-${sha256(`${tenantId}|${c.norm}`).slice(0, 8)}` }, select: { id: true } });
    clientes.set(c.norm, creado.id);
    clientesNuevos++;
  }

  const ultimo = await tx.proyecto.findFirst({ where: { tenantId }, orderBy: { numero: "desc" }, select: { numero: true } });
  let numero = ultimo?.numero ?? 0;
  const presupuestos: { tenantId: string; proyectoId: string; version: number; token: string; ivaPct: number; condiciones: string; creadoPor: string; nota: string; createdAt: Date }[] = [];
  const equipo: { tenantId: string; proyectoId: string; personaId: string; funcion: string }[] = [];
  const mensajes: { tenantId: string; proyectoId: string; canal: string; autor: string; texto: string; createdAt: Date }[] = [];
  const marcas: { tenantId: string; proyectoId: string; entidad: string; entidadId: string; campo: string; despues: string; autor: string }[] = [];
  const ids: string[] = [];

  for (const a of plan.altas) {
    const clientId = a.cliente.id ?? clientes.get(a.cliente.norm);
    if (!clientId) throw new Error(`Importador: falta el cliente de la fila ${a.hoja}:${a.fila}`);
    const p = await tx.proyecto.create({
      data: {
        tenantId,
        numero: ++numero,
        clientId,
        nombre: a.nombre,
        servicio: "EVENTOS",
        etapa: a.etapa,
        fechaEvento: a.fechaEvento,
        fechaFin: a.fechaFin,
        responsable: a.productor?.nombre ?? null,
        carpetaUrl: a.carpetaUrl,
        perdidoEl: a.perdidoEl,
        motivoPerdida: a.motivoPerdida,
        createdAt: a.creadoEl,
      },
      select: { id: true },
    });
    ids.push(p.id);
    presupuestos.push({ tenantId, proyectoId: p.id, version: 1, token: randomBytes(18).toString("base64url"), ivaPct: config.ivaPct, condiciones: config.condiciones, creadoPor: AUTOR_IMPORTADOR, nota: "Versión inicial (importado)", createdAt: a.creadoEl });
    const enEquipo = new Set<string>();
    for (const [persona, funcion] of [[a.productor, "Responsable"], [a.diseno, "Diseño"]] as const) {
      if (persona?.personaId && !enEquipo.has(persona.personaId)) {
        enEquipo.add(persona.personaId);
        equipo.push({ tenantId, proyectoId: p.id, personaId: persona.personaId, funcion });
      }
    }
    mensajes.push({ tenantId, proyectoId: p.id, canal: "general", autor: AUTOR_IMPORTADOR, texto: mensajeDeDatosCrudos(a), createdAt: a.creadoEl });
    for (const c of a.comentarios) {
      const texto = c.fecha || !c.fechaTexto ? c.texto : `${c.texto}\n(Fecha escrita: «${c.fechaTexto}»)`;
      mensajes.push({ tenantId, proyectoId: p.id, canal: "general", autor: AUTOR_IMPORTADOR, texto, createdAt: c.fecha ?? a.creadoEl });
    }
    marcas.push({ tenantId, proyectoId: p.id, entidad: ENTIDAD_IMPORTACION, entidadId: p.id, campo: CAMPO_CLAVE, despues: a.clave, autor });
  }

  if (presupuestos.length) await tx.proyectoPresupuesto.createMany({ data: presupuestos });
  if (equipo.length) await tx.proyectoEquipo.createMany({ data: equipo });
  if (mensajes.length) await tx.proyectoMensaje.createMany({ data: mensajes });
  if (marcas.length) await tx.proyectoCambio.createMany({ data: marcas });
  return { proyectos: ids.length, clientesNuevos, ids };
}
