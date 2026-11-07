"use server";

// ============================================================================
// PROYECTOS · IMPORTADOR DE LA PLANILLA DE STATUS (MIA T1). Dos pasos:
//   1. `previsualizarImportacion` sólo LEE: arma el plan (nuevas, repetidas, ya existentes, con error) y devuelve la
//      huella del archivo. No escribe nada.
//   2. `confirmarImportacion` escribe SÓLO si llega la confirmación con la misma huella: lo que se graba es exactamente
//      lo que se previsualizó. Corre todo en UNA `tenantTransaction` del negocio de la sesión, con un candado por negocio,
//      y vuelve a calcular el plan adentro: confirmar dos veces no duplica (la segunda vez todo «ya existe»).
// ============================================================================

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { tenantTransaction } from "@/lib/rls";
import { auditAdmin } from "@/lib/audit-core";
import { configProyectos } from "./datos.server";
import { CHECKLIST_BASE } from "./gestion-core";
import { exigirEditar, type Actor } from "./gestion.server";
import { fechaAntesDe } from "./ficha-core";
import { faltaLaMigracion } from "./rendiciones-core";
import { claveDeProyecto, normalizar, planDeImportacion, type FilaPlan, type EstadoFila, type PersonaDelNegocio } from "./importar-status-core";
import { SIN_MIGRACION_PRECIO } from "./precio-capas-core";

type Fila = Pick<FilaPlan, "linea" | "cliente" | "proyecto" | "productor" | "comercial" | "status" | "fechaTexto" | "estado" | "motivo" | "avisos" | "etapa" | "motivoPerdida" | "fecha">;

export type ResultadoPrevia = { ok: true; huella: string; filas: Fila[]; resumen: Record<EstadoFila, number> } | { ok: false; error: string };
export type ResultadoImportacion = { ok: true; creados: number; salteados: number } | { ok: false; error: string };

const RAIZ = "/admin/proyectos";
const mal = (error: string) => ({ ok: false as const, error });
const huellaDe = (texto: string) => createHash("sha256").update(texto, "utf8").digest("hex");

/** Un plan que dejó de valer adentro de la transacción: se devuelve como mensaje, sin escribir. */
class ErrorDelPlan extends Error {}

type Lector = Pick<typeof prisma, "proyecto" | "proyectoPersona">;

async function entrar(): Promise<Actor | string> {
  try {
    return await exigirEditar("pipeline");
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("No tenés permiso")) return "No tenés permiso para hacer esto.";
    throw e;
  }
}

/** Lo que hay en el negocio para armar el plan: claves cliente|proyecto y las personas activas. Siempre filtrado por negocio. */
async function contexto(db: Lector, tenantId: string): Promise<{ existentes: Set<string>; personas: PersonaDelNegocio[] }> {
  const [proyectos, personas] = await Promise.all([
    db.proyecto.findMany({ where: { tenantId }, select: { nombre: true, client: { select: { name: true } } } }),
    db.proyectoPersona.findMany({ where: { tenantId, activa: true }, select: { id: true, nombre: true } }),
  ]);
  return { existentes: new Set(proyectos.map((p) => claveDeProyecto(p.client.name, p.nombre))), personas };
}

/** Sin la tabla ProyectoVenta (migración sin aplicar) no se importa: productor, comercial y fecha difusa viven ahí. */
async function tablaDisponible(tenantId: string): Promise<boolean> {
  try {
    await prisma.proyectoVenta.findFirst({ where: { tenantId }, select: { id: true } });
    return true;
  } catch (e) {
    if (faltaLaMigracion(e)) return false;
    throw e;
  }
}

const aFila = (f: FilaPlan): Fila => ({ linea: f.linea, cliente: f.cliente, proyecto: f.proyecto, productor: f.productor, comercial: f.comercial, status: f.status, fechaTexto: f.fechaTexto, estado: f.estado, motivo: f.motivo, avisos: f.avisos, etapa: f.etapa, motivoPerdida: f.motivoPerdida, fecha: f.fecha });

export async function previsualizarImportacion(formData: FormData): Promise<ResultadoPrevia> {
  const a = await entrar();
  if (typeof a === "string") return mal(a);
  const texto = String(formData.get("csv") ?? "");
  if (!texto.trim()) return mal("Elegí el archivo CSV de la planilla.");
  if (!(await tablaDisponible(a.tenantId))) return mal(SIN_MIGRACION_PRECIO);
  const { existentes, personas } = await contexto(prisma, a.tenantId);
  const plan = planDeImportacion(texto, existentes, personas);
  if (plan.error) return mal(plan.error);
  return { ok: true, huella: huellaDe(texto), filas: plan.filas.map(aFila), resumen: plan.resumen };
}

export async function confirmarImportacion(formData: FormData): Promise<ResultadoImportacion> {
  const a = await entrar();
  if (typeof a === "string") return mal(a);
  const { tenantId } = a;
  const texto = String(formData.get("csv") ?? "");
  if (String(formData.get("confirmo") ?? "") !== "si") return mal("Falta confirmar la importación.");
  if (!texto.trim() || String(formData.get("huella") ?? "") !== huellaDe(texto)) return mal("El archivo no es el que se previsualizó: volvé a previsualizarlo.");
  if (!(await tablaDisponible(tenantId))) return mal(SIN_MIGRACION_PRECIO);
  const config = await configProyectos(tenantId);

  try {
    const r = await tenantTransaction(
      async (tx) => {
        // Un importador a la vez por negocio: el segundo espera y, al entrar, ve lo que creó el primero.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`proyectos-importar:${tenantId}`}))`;
        const { existentes, personas } = await contexto(tx, tenantId);
        const plan = planDeImportacion(texto, existentes, personas);
        if (plan.error) throw new ErrorDelPlan(plan.error);
        const nuevas = plan.filas.filter((f) => f.estado === "nueva");
        if (nuevas.length === 0) return { creados: 0, salteados: plan.filas.length };

        const clientes = new Map<string, string>();
        for (const c of await tx.client.findMany({ where: { tenantId }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } })) {
          const k = normalizar(c.name);
          if (!clientes.has(k)) clientes.set(k, c.id);
        }
        const ultimo = await tx.proyecto.findFirst({ where: { tenantId }, orderBy: { numero: "desc" }, select: { numero: true } });
        let numero = ultimo?.numero ?? 0;
        const ahora = new Date();

        for (const f of nuevas) {
          const kc = normalizar(f.cliente);
          let clientId = clientes.get(kc);
          if (!clientId) {
            clientId = (await tx.client.create({ data: { tenantId, name: f.cliente, phone: `sin-tel-${randomBytes(4).toString("hex")}` }, select: { id: true } })).id;
            clientes.set(kc, clientId);
          }
          const fechaEvento = f.fecha.fecha ? new Date(`${f.fecha.fecha}T12:00:00-03:00`) : null;
          numero += 1;
          const p = await tx.proyecto.create({
            data: {
              tenantId,
              numero,
              clientId,
              nombre: f.proyecto,
              servicio: "ARQUITECTURA", // MIA: stands y eventos; se corrige desde la ficha
              etapa: f.etapa,
              fechaEvento,
              responsable: f.productor || a.nombre,
              perdidoEl: f.motivoPerdida ? ahora : null,
              motivoPerdida: f.motivoPerdida,
              brief: `Importado de la planilla de status (línea ${f.linea}).`,
            },
            select: { id: true },
          });
          await tx.proyectoChecklist.createMany({ data: CHECKLIST_BASE.map((c) => ({ tenantId, proyectoId: p.id, texto: c.texto, categoria: c.categoria, fecha: fechaAntesDe(fechaEvento, c.dias) })) });
          await tx.proyectoPresupuesto.create({ data: { tenantId, proyectoId: p.id, version: 1, token: randomBytes(18).toString("base64url"), ivaPct: config.ivaPct, condiciones: config.condiciones, creadoPor: a.nombre, nota: "Versión inicial (importada)" } });
          const equipo = [
            f.productorId && { personaId: f.productorId, funcion: "Productor" },
            f.comercialId && f.comercialId !== f.productorId && { personaId: f.comercialId, funcion: "Comercial" },
          ].filter((x): x is { personaId: string; funcion: string } => !!x);
          if (equipo.length) await tx.proyectoEquipo.createMany({ data: equipo.map((e) => ({ tenantId, proyectoId: p.id, ...e })) });
          await tx.proyectoVenta.create({ data: { tenantId, proyectoId: p.id, productorId: f.productorId, comercialId: f.comercialId, fechaEventoTexto: f.fecha.texto, statusImportado: f.status || null } });
        }
        return { creados: nuevas.length, salteados: plan.filas.length - nuevas.length };
      },
      { tenantId, timeoutMs: 120_000 },
    );
    await auditAdmin({ action: "proyecto.importar-status", entity: "Proyecto", entityId: null, changes: { ...r, huella: huellaDe(texto).slice(0, 16) } });
    revalidatePath(RAIZ);
    return { ok: true, ...r };
  } catch (e) {
    if (e instanceof ErrorDelPlan) return mal(e.message);
    if ((e as { code?: string }).code === "P2002") return mal("Alguien creó un proyecto mientras se importaba. Volvé a previsualizar y confirmá de nuevo.");
    if (faltaLaMigracion(e)) return mal(SIN_MIGRACION_PRECIO);
    throw e;
  }
}
