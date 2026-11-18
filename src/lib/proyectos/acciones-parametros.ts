"use server";

// ============================================================================
// PARÁMETROS DEL MÓDULO — escrituras (MIA T03, O45). Sólo Dirección; el servidor valida tipo, rango y sumas; cada cambio
// deja un renglón de historial con antes y después. Acotado al negocio de la sesión (y a su política en la base).
// Los de precio y de reparto pedirán el segundo factor desde T11 (plan § 4.1): este archivo no lo pide todavía.
// ============================================================================

import { revalidatePath } from "next/cache";
import { tenantTransaction } from "@/lib/rls";
import type { Prisma } from "@/generated/prisma/client";
import { esTablaInexistente } from "@/lib/rendiciones/pin-core";
import { actorActual, type Actor } from "./gestion.server";
import { defDe, esClave, type Clave, type ConId } from "./parametros/catalogo";
import { huerfanosAlCambiar, validarValor, valorDelFormulario, valoresDe } from "./parametros/validar";
import { parametrosDelNegocio } from "./parametros/leer.server";

export type Resultado = { ok: true; sinCambios?: boolean } | { ok: false; error: string };

const RUTA = "/admin/proyectos/config/parametros";
const SIN_TABLA = "Los parámetros todavía no se pueden guardar en este servidor: falta aplicar la actualización de la base.";

/** Edita Dirección. Administración ve la pantalla pero no escribe; el resto, ni eso (plan MIA-50, O45). */
async function exigirDireccion(): Promise<Actor | string> {
  const a = await actorActual();
  return a.rol === "DIRECCION" ? a : "Sólo Dirección cambia los parámetros.";
}

const json = (v: unknown) => v as Prisma.InputJsonValue;
const igual = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);

/** Un cambio por vez para la misma clave del mismo negocio: el doble clic y dos pestañas dejan un solo renglón. */
const trabar = (tx: Prisma.TransactionClient, tenantId: string, clave: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`parametro:${tenantId}:${clave}`}))`;

export async function guardarParametro(formData: FormData): Promise<Resultado> {
  const a = await exigirDireccion();
  if (typeof a === "string") return { ok: false, error: a };
  const clave = String(formData.get("clave") ?? "");
  if (!esClave(clave)) return { ok: false, error: "Ese parámetro no existe." };
  const def = defDe(clave as Clave);
  const provisional = formData.get("provisional") === "on" || formData.get("provisional") === "1";
  try {
    const r = await tenantTransaction(async (tx) => {
      await trabar(tx, a.tenantId, clave);
      const actuales = await parametrosDelNegocio(a.tenantId, tx);
      const vigentes = valoresDe(actuales);
      const v = validarValor(def, valorDelFormulario(def, formData, vigentes), vigentes);
      if (!v.ok) return v;
      if (def.def.tipo === "conId") {
        const suelto = huerfanosAlCambiar(clave as Clave, v.valor as ConId[], vigentes);
        if (suelto) return { ok: false as const, error: suelto };
      }
      const antes = actuales[clave as Clave];
      if (antes.origen === "NEGOCIO" && igual(antes.valor, v.valor) && antes.provisional === provisional) return { ok: true as const, sinCambios: true };
      const quien = { actualizadoPor: a.user.id, actualizadoNombre: a.nombre, actualizadoEl: new Date() };
      await tx.proyectoParametro.upsert({
        where: { tenantId_clave: { tenantId: a.tenantId, clave } },
        create: { tenantId: a.tenantId, clave, valor: json(v.valor), provisional, ...quien },
        update: { valor: json(v.valor), provisional, ...quien },
      });
      await tx.proyectoParametroHistorial.create({
        data: { tenantId: a.tenantId, clave, antes: json(antes.valor), despues: json(v.valor), provisionalAntes: antes.provisional, provisionalDespues: provisional, autorId: a.user.id, autorNombre: a.nombre },
      });
      return { ok: true as const };
    }, { tenantId: a.tenantId });
    if (r.ok) revalidatePath(RUTA);
    return r;
  } catch (e) {
    if (esTablaInexistente(e)) return { ok: false, error: SIN_TABLA };
    throw e;
  }
}

/** Borra el valor del negocio: vuelve a regir el del rubro. Queda en el historial. */
export async function volverAlValorDelRubro(formData: FormData): Promise<Resultado> {
  const a = await exigirDireccion();
  if (typeof a === "string") return { ok: false, error: a };
  const clave = String(formData.get("clave") ?? "");
  if (!esClave(clave)) return { ok: false, error: "Ese parámetro no existe." };
  const def = defDe(clave as Clave);
  try {
    const r = await tenantTransaction(async (tx) => {
      await trabar(tx, a.tenantId, clave);
      const actuales = await parametrosDelNegocio(a.tenantId, tx);
      const antes = actuales[clave as Clave];
      if (antes.origen === "RUBRO") return { ok: true as const, sinCambios: true };
      // Volver al rubro no puede dejar huérfana la comisión o la matriz (p. ej. sacar una función con %).
      if (def.def.tipo === "conId") {
        const suelto = huerfanosAlCambiar(clave as Clave, def.rubro as ConId[], valoresDe(actuales));
        if (suelto) return { ok: false as const, error: suelto };
      }
      await tx.proyectoParametro.deleteMany({ where: { tenantId: a.tenantId, clave } });
      await tx.proyectoParametroHistorial.create({
        data: { tenantId: a.tenantId, clave, antes: json(antes.valor), provisionalAntes: antes.provisional, provisionalDespues: def.provisional, autorId: a.user.id, autorNombre: a.nombre },
      });
      return { ok: true as const };
    }, { tenantId: a.tenantId });
    if (r.ok) revalidatePath(RUTA);
    return r;
  } catch (e) {
    if (esTablaInexistente(e)) return { ok: false, error: SIN_TABLA };
    throw e;
  }
}
