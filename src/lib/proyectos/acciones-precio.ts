"use server";

// ============================================================================
// PROYECTOS · PRECIO POR CAPAS (MIA T1) — guardar la fórmula del negocio y, por proyecto, el precio final a mano, el
// productor y el comercial. Es plata: cada acción vuelve a pedir el permiso, valida contra lo guardado en el negocio de
// la sesión, escribe en `tenantTransaction` y deja el cambio en el historial del proyecto.
// ============================================================================

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { tenantTransaction } from "@/lib/rls";
import { auditAdmin } from "@/lib/audit-core";
import { exigirEditar, proyectoVisible, registrarCambio, type Actor } from "./gestion.server";
import type { ModuloGestion } from "./gestion-core";
import { faltaLaMigracion } from "./rendiciones-core";
import { bpDeTexto, centavosDeTexto, CLAVES_PARAMETRO, desglosePrecio, dentroDelTope, ETIQUETA_PARAMETRO, formulaVigente, problemaDeParametros, rangoDelTope, SIN_MIGRACION_PRECIO, textoDeBp, type ParametrosPrecio } from "./precio-capas-core";
import { costoVigenteCent, formulaDelNegocio } from "./precio-capas.server";

export type ResultadoPrecio = { ok: true } | { ok: false; error: string };

const RAIZ = "/admin/proyectos";

const txt = (v: FormDataEntryValue | null): string => String(v ?? "").trim();
const mal = (error: string) => ({ ok: false as const, error });
const pesosTexto = (c: number) => (c / 100).toLocaleString("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 });

async function entrar(modulo: ModuloGestion, proyectoId?: string): Promise<Actor | string> {
  let a: Actor;
  try {
    a = await exigirEditar(modulo);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("No tenés permiso")) return "No tenés permiso para hacer esto.";
    throw e;
  }
  if (proyectoId !== undefined && (!proyectoId || !(await proyectoVisible(a, proyectoId)))) return "Ese proyecto no existe.";
  return a;
}

// ── La fórmula del negocio ──────────────────────────────────────────────────

export async function guardarFormulaPrecio(formData: FormData): Promise<ResultadoPrecio> {
  const a = await entrar("direccion");
  if (typeof a === "string") return mal(a);
  const { tenantId } = a;
  const p = {} as ParametrosPrecio;
  for (const k of CLAVES_PARAMETRO) {
    const bp = bpDeTexto(txt(formData.get(k)));
    if (bp === null) return mal(`${ETIQUETA_PARAMETRO[k]}: escribí un porcentaje, por ejemplo 30 o 7,5.`);
    p[k] = bp;
  }
  const problema = problemaDeParametros(p);
  if (problema) return mal(problema);
  const activa = txt(formData.get("activa")) === "on";
  try {
    await tenantTransaction(async (tx) => {
      await tx.proyectoPrecioConfig.upsert({ where: { tenantId }, create: { tenantId, activa, ...p }, update: { activa, ...p } });
    });
  } catch (e) {
    if (faltaLaMigracion(e)) return mal(SIN_MIGRACION_PRECIO);
    throw e;
  }
  await auditAdmin({ action: "proyecto.formula-precio", entity: "ProyectoPrecioConfig", entityId: tenantId, changes: { activa, ...p } });
  revalidatePath(`${RAIZ}/config`);
  revalidatePath(RAIZ, "layout");
  return { ok: true };
}

// ── El precio, el productor y el comercial de un proyecto ───────────────────

/** Una persona activa de ESTE negocio, o null (vacío = sin asignar). `false`: no existe acá. */
async function personaDelNegocio(tenantId: string, id: string): Promise<{ id: string; nombre: string } | null | false> {
  if (!id) return null;
  const p = await prisma.proyectoPersona.findFirst({ where: { id, tenantId, activa: true }, select: { id: true, nombre: true } });
  return p ?? false;
}

export async function guardarVentaProyecto(formData: FormData): Promise<ResultadoPrecio> {
  const proyectoId = txt(formData.get("proyectoId"));
  // Precio y comisiones son costos y márgenes: el mismo permiso que editar costos.
  const a = await entrar("costos", proyectoId);
  if (typeof a === "string") return mal(a);
  const { tenantId } = a;
  const formula = await formulaDelNegocio(tenantId);
  if (!formula.disponible) return mal(SIN_MIGRACION_PRECIO);
  const parametros = formulaVigente(formula.config);
  if (!parametros) return mal("Este negocio no usa la fórmula de precio por capas. Se prende en Configuración.");

  const [productor, comercial] = await Promise.all([personaDelNegocio(tenantId, txt(formData.get("productorId"))), personaDelNegocio(tenantId, txt(formData.get("comercialId")))]);
  if (productor === false) return mal("El productor elegido no está en el equipo.");
  if (comercial === false) return mal("El comercial elegido no está en el equipo.");

  const textoPrecio = txt(formData.get("precioFinal"));
  const precioFinalCent = textoPrecio ? centavosDeTexto(textoPrecio) : null;
  if (textoPrecio && (precioFinalCent === null || precioFinalCent <= 0)) return mal("El precio final no se entiende: escribilo como un monto, por ejemplo 1.250.000 o 1.250.000,50.");
  if (precioFinalCent !== null) {
    // El tope se valida contra el costo de HOY, recalculado acá: lo que mandó la pantalla no cuenta.
    const sugerido = desglosePrecio(await costoVigenteCent(tenantId, proyectoId), parametros).sugerido;
    if (sugerido <= 0) return mal("Sin costos cargados no hay precio sugerido: cargá la ficha antes de escribir el precio final.");
    if (!dentroDelTope(sugerido, precioFinalCent, parametros.topeRedondeoBp)) {
      const r = rangoDelTope(sugerido, parametros.topeRedondeoBp);
      return mal(`El precio final se aparta más del ${textoDeBp(parametros.topeRedondeoBp)} % del sugerido (${pesosTexto(sugerido)}): tiene que quedar entre ${pesosTexto(r.minimo)} y ${pesosTexto(r.maximo)}.`);
    }
  }

  const data = { productorId: productor?.id ?? null, comercialId: comercial?.id ?? null, precioFinalCent: precioFinalCent === null ? null : BigInt(precioFinalCent) };
  try {
    await tenantTransaction(async (tx) => {
      const previo = await tx.proyectoVenta.findFirst({
        where: { tenantId, proyectoId },
        select: { precioFinalCent: true, productor: { select: { nombre: true } }, comercial: { select: { nombre: true } } },
      });
      // Upsert por la clave única del proyecto: dos guardados juntos terminan en una sola fila.
      await tx.proyectoVenta.upsert({ where: { proyectoId_tenantId: { proyectoId, tenantId } }, create: { tenantId, proyectoId, ...data }, update: data });
      const cambio = (campo: string, antes: unknown, despues: unknown) => registrarCambio(tx, { tenantId, proyectoId, entidad: "ProyectoVenta", entidadId: proyectoId, campo, antes, despues, autor: a.nombre });
      await cambio("Precio final", previo?.precioFinalCent == null ? null : pesosTexto(Number(previo.precioFinalCent)), precioFinalCent === null ? null : pesosTexto(precioFinalCent));
      await cambio("Productor", previo?.productor?.nombre ?? null, productor?.nombre ?? null);
      await cambio("Comercial", previo?.comercial?.nombre ?? null, comercial?.nombre ?? null);
    });
  } catch (e) {
    if (faltaLaMigracion(e)) return mal(SIN_MIGRACION_PRECIO);
    throw e;
  }
  await auditAdmin({ action: "proyecto.precio-final", entity: "Proyecto", entityId: proyectoId, changes: { precioFinalCent, productorId: data.productorId, comercialId: data.comercialId } });
  revalidatePath(`${RAIZ}/${proyectoId}`);
  return { ok: true };
}
