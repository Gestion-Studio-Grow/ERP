// ============================================================================
// MIA-184 (C) · Ficha de Dirección del dueño en un negocio que YA existe.
//
// El alta nueva ya crea la ficha (T12 · 3(b), scripts/provision-tenant.ts), pero no es retroactiva: un negocio con módulo
// de proyectos cuyo OWNER no tiene ficha sigue sin poder aprobar liquidaciones (MIA-179 falla cerrado y nadie vincula una
// ficha a su propia cuenta, E7). Este script la crea, o vincula la que ya existe sin cuenta con el mismo mail y rol de
// Dirección. Una ficha sin cuenta con el mail del dueño y OTRO rol no se toca: se informa para revisarla a mano (no sube
// el rol de nadie en silencio).
//
// Idempotente: el dueño que ya tiene ficha no cambia; correrlo dos veces da 0 cambios. La ficha nueva nace con sueldo 0
// (lo fija otra persona) y deja su renglón en el historial, como el alta.
//
// MODO DE PRUEBA POR DEFECTO: sin `--aplicar` sólo muestra qué haría y no escribe nada. Se aplica en la publicación, con el
// Gate 2 del dueño. No imprime mails.
//
//   npx tsx scripts/proyectos/ficha-direccion-duenio.ts --negocio <slug o id>            # prueba
//   npx tsx scripts/proyectos/ficha-direccion-duenio.ts --negocio <slug o id> --aplicar  # escribe
// ============================================================================

import "dotenv/config";
import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

export type AccionFicha = "ya-tiene" | "crear" | "vincular" | "revisar-a-mano";
export interface PasoFicha { userId: string; nombre: string; accion: AccionFicha; fichaId: string | null; motivo: string }
export interface ResultadoFicha { tenantId: string; conProyectos: boolean; aplicado: boolean; pasos: PasoFicha[] }

const AUTOR = "Script de ficha de Dirección (MIA-184)";
const mismoMail = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Dentro de una transacción con el negocio fijado (RLS): qué pasa con cada OWNER y, con `aplicar`, lo hace. Sin el módulo
 * de proyectos no hace nada. La unicidad (tenantId, userId) de la ficha cubre dos corridas a la vez: la segunda no duplica.
 */
export async function fichaDeDireccionDelDuenio(tx: Tx, tenantId: string, aplicar: boolean): Promise<ResultadoFicha> {
  const negocio = await tx.tenant.findUnique({ where: { id: tenantId }, select: { modules: true } });
  if (!negocio) throw new Error("Ese negocio no existe.");
  if (!negocio.modules?.includes("proyectos")) return { tenantId, conProyectos: false, aplicado: false, pasos: [] };
  const duenios = await tx.user.findMany({ where: { tenantId, role: "OWNER" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, name: true, email: true } });
  const fichas = await tx.proyectoPersona.findMany({
    where: { tenantId, OR: [{ userId: { in: duenios.map((d) => d.id) } }, { userId: null, email: { not: null } }] },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, userId: true, email: true, rol: true },
  });
  const pasos: PasoFicha[] = [];
  const tomadas = new Set<string>();
  for (const d of duenios) {
    const propia = fichas.find((f) => f.userId === d.id);
    if (propia) {
      pasos.push({ userId: d.id, nombre: d.name, accion: "ya-tiene", fichaId: propia.id, motivo: `Ya tiene su ficha (${propia.rol}).` });
      continue;
    }
    const sinCuenta = fichas.filter((f) => f.userId === null && !tomadas.has(f.id) && mismoMail(f.email, d.email));
    const deDireccion = sinCuenta.find((f) => f.rol === "DIRECCION");
    if (deDireccion) {
      tomadas.add(deDireccion.id);
      pasos.push({ userId: d.id, nombre: d.name, accion: "vincular", fichaId: deDireccion.id, motivo: "Hay una ficha de Dirección sin cuenta con su mail: se vincula." });
    } else if (sinCuenta.length > 0) {
      pasos.push({ userId: d.id, nombre: d.name, accion: "revisar-a-mano", fichaId: sinCuenta[0].id, motivo: `Hay una ficha sin cuenta con su mail y rol ${sinCuenta[0].rol}: no se cambia el rol solo. Revisala a mano.` });
    } else {
      pasos.push({ userId: d.id, nombre: d.name, accion: "crear", fichaId: null, motivo: "No tiene ficha: se crea una de Dirección, vinculada, con sueldo 0." });
    }
  }
  if (!aplicar) return { tenantId, conProyectos: true, aplicado: false, pasos };

  for (const p of pasos) {
    const d = duenios.find((x) => x.id === p.userId)!;
    if (p.accion === "vincular") {
      const r = await tx.proyectoPersona.updateMany({ where: { tenantId, id: p.fichaId!, userId: null }, data: { userId: d.id } });
      if (r.count === 0) continue; // otra corrida la vinculó recién
      await tx.proyectoCambio.create({ data: { tenantId, entidad: "Persona", entidadId: p.fichaId!, campo: "cuenta", despues: `${d.name} (cuenta del dueño)`, autor: AUTOR } });
    } else if (p.accion === "crear") {
      const r = await tx.proyectoPersona.createMany({ data: [{ tenantId, userId: d.id, nombre: d.name, email: d.email, rol: "DIRECCION", puesto: "Dirección" }], skipDuplicates: true });
      if (r.count === 0) continue; // otra corrida la creó recién
      const ficha = await tx.proyectoPersona.findFirstOrThrow({ where: { tenantId, userId: d.id }, select: { id: true } });
      p.fichaId = ficha.id;
      await tx.proyectoCambio.create({ data: { tenantId, entidad: "Persona", entidadId: ficha.id, campo: "alta", despues: `${d.name} (Dirección, cuenta del dueño, negocio existente)`, autor: AUTOR } });
    }
  }
  return { tenantId, conProyectos: true, aplicado: true, pasos };
}

async function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf("--negocio");
  const negocio = i >= 0 ? args[i + 1] : undefined;
  const aplicar = args.includes("--aplicar");
  if (!negocio) {
    console.error("Falta --negocio <slug o id>. Sin --aplicar sólo muestra qué haría.");
    process.exit(2);
  }
  const { basePrisma } = await import("@/lib/prisma-base");
  const { tenantTransaction } = await import("@/lib/rls");
  const t = await basePrisma.tenant.findFirst({ where: { OR: [{ id: negocio }, { slug: negocio }] }, select: { id: true, name: true } });
  if (!t) {
    console.error("Ese negocio no existe.");
    process.exit(1);
  }
  const r = await tenantTransaction((tx) => fichaDeDireccionDelDuenio(tx as unknown as Tx, t.id, aplicar), { tenantId: t.id });
  console.log(`${t.name}: ${aplicar ? "APLICADO" : "MODO DE PRUEBA (no se escribió nada; agregá --aplicar)"}`);
  if (!r.conProyectos) console.log("Sin el módulo de proyectos: no hace falta ficha.");
  for (const p of r.pasos) console.log(`- ${p.nombre}: ${p.accion}${p.fichaId ? ` · ficha ${p.fichaId}` : ""} · ${p.motivo}`);
  await basePrisma.$disconnect();
}

if (process.argv[1]?.endsWith("ficha-direccion-duenio.ts")) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
