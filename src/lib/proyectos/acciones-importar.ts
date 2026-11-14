"use server";

// ============================================================================
// PROYECTOS · IMPORTADOR DE LA PLANILLA DE STATUS (MIA T1). Dos pasos:
//   1. `previsualizarImportacion` sólo LEE: arma el plan (nuevas, repetidas, ya existentes, con error) y devuelve la
//      huella del archivo. No escribe nada.
//   2. `confirmarImportacion` escribe SÓLO si llega la confirmación con la misma huella: lo que se graba es exactamente
//      lo que se previsualizó. Graba en tandas de TANDA filas, cada una en una `tenantTransaction` corta del negocio de la
//      sesión con el candado del importador, y en cada tanda vuelve a calcular el plan: lo ya grabado cuenta como «ya
//      existe». Confirmar dos veces, o reintentar un import cortado a mitad, no duplica. El número de proyecto se toma con
//      el mismo candado corto que el alta manual (numero-proyecto.server.ts): un alta espera, como mucho, una tanda.
// Sólo con la fórmula por capas vigente (migration.sql:4: sin fórmula, ningún negocio cambia) y con permiso de costos,
// el mismo que guardar la venta: el import asigna productor y comercial.
// ============================================================================

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { tenantTransaction } from "@/lib/rls";
import { auditAdmin } from "@/lib/audit-core";
import { configProyectos } from "./datos.server";
import { CHECKLIST_BASE } from "./gestion-core";
import { exigirEditar, puede, type Actor } from "./gestion.server";
import { fechaAntesDe } from "./ficha-core";
import { faltaLaMigracion } from "./rendiciones-core";
import { claveDeProyecto, normalizar, planDeImportacion, type FilaPlan, type EstadoFila, type PersonaDelNegocio } from "./importar-status-core";
import { MENSAJE_APAGADO } from "./etapa2-core";
import { SIN_MIGRACION_PRECIO } from "./precio-capas-core";
import { formulaDelNegocio } from "./precio-capas.server";
import { ultimoNumeroConCandado } from "./numero-proyecto.server";

type Fila = Pick<FilaPlan, "linea" | "cliente" | "proyecto" | "productor" | "comercial" | "status" | "fechaTexto" | "estado" | "motivo" | "avisos" | "etapa" | "motivoPerdida" | "fecha">;

export type ResultadoPrevia = { ok: true; huella: string; filas: Fila[]; resumen: Record<EstadoFila, number> } | { ok: false; error: string };
export type ResultadoImportacion = { ok: true; creados: number; salteados: number } | { ok: false; error: string };

const RAIZ = "/admin/proyectos";
const mal = (error: string) => ({ ok: false as const, error });
/** Filas por transacción: cortas, para no frenar el alta manual del mismo negocio. */
const TANDA = 50;
const SIN_FORMULA = "El importador va con la fórmula de precio por capas: prendela en Configuración de proyectos.";
const SIN_COSTOS = "Importar asigna productor y comercial: hace falta el permiso para editar costos.";
const huellaDe = (texto: string) => createHash("sha256").update(texto, "utf8").digest("hex");

/** Un plan que dejó de valer adentro de la transacción: se devuelve como mensaje, sin escribir. */
class ErrorDelPlan extends Error {}

type Lector = Pick<typeof prisma, "proyecto" | "proyectoPersona">;
type Tx = Parameters<Parameters<typeof tenantTransaction>[0]>[0];

async function entrar(): Promise<Actor | string> {
  let a: Actor;
  try {
    a = await exigirEditar("pipeline");
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("No tenés permiso")) return "No tenés permiso para hacer esto.";
    throw e;
  }
  return puede(a, "costos", "editar") ? a : SIN_COSTOS;
}

/** Null si se puede importar; si no, el motivo. Con el interruptor apagado, sin las tablas (Gate 2) o sin la fórmula vigente, no. */
async function bloqueo(tenantId: string): Promise<string | null> {
  const formula = await formulaDelNegocio(tenantId);
  if (!formula.encendida) return MENSAJE_APAGADO["precio-capas"];
  if (!(await tablaDisponible(tenantId))) return SIN_MIGRACION_PRECIO;
  if (!formula.disponible) return SIN_MIGRACION_PRECIO;
  return formula.vigente ? null : SIN_FORMULA;
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
  const motivo = await bloqueo(a.tenantId);
  if (motivo) return mal(motivo);
  const { existentes, personas } = await contexto(prisma, a.tenantId);
  const plan = planDeImportacion(texto, existentes, personas);
  if (plan.error) return mal(plan.error);
  return { ok: true, huella: huellaDe(texto), filas: plan.filas.map(aFila), resumen: plan.resumen };
}

/** Graba una tanda de filas nuevas. Corre adentro de la transacción corta de la tanda. */
async function grabarTanda(tx: Tx, a: Actor, config: Awaited<ReturnType<typeof configProyectos>>, tanda: FilaPlan[]): Promise<void> {
  const { tenantId } = a;
  const clientes = new Map<string, string>();
  for (const c of await tx.client.findMany({ where: { tenantId }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } })) {
    const k = normalizar(c.name);
    if (!clientes.has(k)) clientes.set(k, c.id);
  }
  const datos: { f: FilaPlan; clientId: string; fechaEvento: Date | null }[] = [];
  for (const f of tanda) {
    const kc = normalizar(f.cliente);
    let clientId = clientes.get(kc);
    if (!clientId) {
      clientId = (await tx.client.create({ data: { tenantId, name: f.cliente, phone: `sin-tel-${randomBytes(4).toString("hex")}` }, select: { id: true } })).id;
      clientes.set(kc, clientId);
    }
    datos.push({ f, clientId, fechaEvento: f.fecha.fecha ? new Date(`${f.fecha.fecha}T12:00:00-03:00`) : null });
  }
  // El candado de numeración se toma lo más tarde posible: lo comparte con el alta manual.
  const ultimo = await ultimoNumeroConCandado(tx, tenantId);
  const ahora = new Date();
  const creados = await tx.proyecto.createManyAndReturn({
    data: datos.map(({ f, clientId, fechaEvento }, i) => ({
      tenantId,
      numero: ultimo + i + 1,
      clientId,
      nombre: f.proyecto,
      servicio: "ARQUITECTURA" as const, // MIA: stands y eventos; se corrige desde la ficha
      etapa: f.etapa,
      fechaEvento,
      responsable: f.productor || a.nombre,
      perdidoEl: f.motivoPerdida ? ahora : null,
      motivoPerdida: f.motivoPerdida,
      brief: `Importado de la planilla de status (línea ${f.linea}).`,
    })),
    select: { id: true, numero: true },
  });
  const idDe = new Map(creados.map((p) => [p.numero, p.id]));
  const filas = datos.map((d, i) => ({ ...d, proyectoId: idDe.get(ultimo + i + 1)! }));
  await tx.proyectoChecklist.createMany({ data: filas.flatMap(({ proyectoId, fechaEvento }) => CHECKLIST_BASE.map((c) => ({ tenantId, proyectoId, texto: c.texto, categoria: c.categoria, fecha: fechaAntesDe(fechaEvento, c.dias) }))) });
  await tx.proyectoPresupuesto.createMany({ data: filas.map(({ proyectoId }) => ({ tenantId, proyectoId, version: 1, token: randomBytes(18).toString("base64url"), ivaPct: config.ivaPct, condiciones: config.condiciones, creadoPor: a.nombre, nota: "Versión inicial (importada)" })) });
  const equipo = filas.flatMap(({ f, proyectoId }) =>
    [
      f.productorId && { personaId: f.productorId, funcion: "Productor" },
      f.comercialId && f.comercialId !== f.productorId && { personaId: f.comercialId, funcion: "Comercial" },
    ]
      .filter((x): x is { personaId: string; funcion: string } => !!x)
      .map((e) => ({ tenantId, proyectoId, ...e })),
  );
  if (equipo.length) await tx.proyectoEquipo.createMany({ data: equipo });
  await tx.proyectoVenta.createMany({ data: filas.map(({ f, proyectoId }) => ({ tenantId, proyectoId, productorId: f.productorId, comercialId: f.comercialId, fechaEventoTexto: f.fecha.texto, statusImportado: f.status || null })) });
}

export async function confirmarImportacion(formData: FormData): Promise<ResultadoImportacion> {
  const a = await entrar();
  if (typeof a === "string") return mal(a);
  const { tenantId } = a;
  const texto = String(formData.get("csv") ?? "");
  if (String(formData.get("confirmo") ?? "") !== "si") return mal("Falta confirmar la importación.");
  if (!texto.trim() || String(formData.get("huella") ?? "") !== huellaDe(texto)) return mal("El archivo no es el que se previsualizó: volvé a previsualizarlo.");
  const motivo = await bloqueo(tenantId);
  if (motivo) return mal(motivo);
  const config = await configProyectos(tenantId);

  let creados = 0;
  let filasDelArchivo: number | null = null;
  let quedaban = Infinity;
  try {
    for (;;) {
      const r = await tenantTransaction(
        async (tx) => {
          // Un importador a la vez por negocio y por tanda: el otro espera y, al entrar, ve lo que ya se grabó.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`proyectos-importar:${tenantId}`}))`;
          const { existentes, personas } = await contexto(tx, tenantId);
          const plan = planDeImportacion(texto, existentes, personas);
          if (plan.error) throw new ErrorDelPlan(plan.error);
          const nuevas = plan.filas.filter((f) => f.estado === "nueva");
          const tanda = nuevas.slice(0, TANDA);
          if (tanda.length) await grabarTanda(tx, a, config, tanda);
          return { filas: plan.filas.length, nuevas: nuevas.length, grabadas: tanda.length };
        },
        { tenantId },
      );
      filasDelArchivo ??= r.filas;
      // Lo grabado tiene que contar como «ya existe» en la vuelta siguiente; si no baja, se corta antes de duplicar.
      if (r.nuevas >= quedaban) throw new ErrorDelPlan("La importación no avanza: revisá los nombres de cliente y proyecto de la planilla.");
      quedaban = r.nuevas;
      creados += r.grabadas;
      if (r.nuevas === r.grabadas) break;
    }
    const resultado = { creados, salteados: (filasDelArchivo ?? 0) - creados };
    await auditAdmin({ action: "proyecto.importar-status", entity: "Proyecto", entityId: null, changes: { ...resultado, huella: huellaDe(texto).slice(0, 16) } });
    revalidatePath(RAIZ);
    return { ok: true, ...resultado };
  } catch (e) {
    if (creados > 0) {
      await auditAdmin({ action: "proyecto.importar-status", entity: "Proyecto", entityId: null, changes: { creados, cortado: true, huella: huellaDe(texto).slice(0, 16) } });
      revalidatePath(RAIZ);
    }
    if (e instanceof ErrorDelPlan) return mal(e.message);
    if ((e as { code?: string }).code === "P2002") return mal("Alguien creó un proyecto mientras se importaba. Volvé a previsualizar y confirmá de nuevo.");
    if (faltaLaMigracion(e)) return mal(SIN_MIGRACION_PRECIO);
    throw e;
  }
}
