"use server";

// ============================================================================
// PADEL-CLASES — Ajustes de a un campo (Tanda 3B · M-077/M-079/M-084).
// ============================================================================
//
// `guardarCampoConfig(clave, valor)`: el profe sale del campo y queda guardado, sin un «Guardar»
// al pie. La clave viene de la pantalla, así que pasa por la LISTA BLANCA de config-campos.ts
// (nunca se escribe una clave arbitraria) y cada una con su validación. Como el resto de las
// acciones del profe: `agenda:manage`, todo acotado por `tenantId` y rastro en la auditoría.
//
// Un campo simple es un `upsert` de UNA columna de PadelConfig (dos campos distintos a la vez no se
// pisan). Los horarios: borrar y volver a crear las franjas semanales en una transacción.
//
// Los textos de WhatsApp y la marca de la Bienvenida viven en UN JSON (`PadelConfig.plantillas`):
// guardar uno es leer el JSON entero y reescribirlo. Leer y escribir en la misma transacción NO
// alcanza en ReadCommitted: dos guardados a la vez leen el mismo JSON viejo y el último pisa al otro
// (F-2 de la CERT T2+T3: 8 de 20 textos perdidos, con las dos pantallas diciendo «Guardado»). Por
// eso esas dos ramas van en Serializable (`ESCRITURA_DEL_JSON`): Postgres aborta la segunda con
// 40001, `tenantTransaction` la reintenta y la segunda relee el JSON con el texto de la primera.

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { esConflictoDeEscritura } from "@/lib/conflicto-de-escritura";
import { tenantTransaction } from "@/lib/rls";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireCapability } from "@/lib/authz";
import { auditAdmin } from "@/lib/audit-core";
import { PLANTILLAS_DEFAULT } from "./core";
import { plantillasConBienvenida, plantillasConCambio, validarCampoConfig, type TramoSemanal } from "./config-campos";
import { refrescar, type Resultado } from "./acciones-compartido";

/**
 * Leer-y-reescribir el JSON de plantillas: Serializable con reintento (F-2). Cinco reintentos: con
 * un solo profe es raro que choquen más de dos guardados, pero un «Ir a Hoy» y dos textos que se
 * guardan al salir de cada campo con la señal lenta pueden llegar juntos.
 */
const ESCRITURA_DEL_JSON = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxRetries: 5 } as const;

/**
 * Guarda UN ajuste. Devuelve el valor como quedó (normalizado: el precio como número, el celular
 * en 10 dígitos, el texto de fábrica si se restauró) para que la pantalla lo muestre así.
 */
export async function guardarCampoConfig(
  clave: string,
  valor: unknown,
): Promise<Resultado<{ valor: number | string | null | TramoSemanal[] }>> {
  try {
    return await guardarCampo(clave, valor);
  } catch (e) {
    // Siguió chocando después de los reintentos: se dice, no se finge «Guardado» ni se tira un 500.
    if (esConflictoDeEscritura(e)) return { ok: false, error: "Se estaban guardando dos cosas a la vez y ésta no entró. Probá de nuevo." };
    throw e;
  }
}

async function guardarCampo(clave: string, valor: unknown): Promise<Resultado<{ valor: number | string | null | TramoSemanal[] }>> {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const r = validarCampoConfig(clave, valor);
  if (!r.ok) return { ok: false, error: r.error };
  const v = r.v;

  if (v.tipo === "campo") {
    const data = { [v.campo]: v.valor };
    // `select` explícito (schema-ahead, src/lib/padel/modelo.ts): la respuesta no pide las columnas de la T4.
    await prisma.padelConfig.upsert({ where: { tenantId }, create: { tenantId, ...data }, update: data, select: { id: true } });
    // El alias y el celular no van a la auditoría con su valor: alcanza con saber que cambiaron.
    const sensible = v.campo === "aliasCbu" || v.campo === "titularCuenta" || v.campo === "whatsappProfe";
    await auditAdmin({ action: "padel.config.campo", entity: "PadelConfig", entityId: tenantId, changes: { campo: v.campo, ...(sensible ? {} : { valor: v.valor }) } });
    refrescar();
    return { ok: true, valor: v.valor };
  }

  if (v.tipo === "bienvenida") {
    // «Ya vio la Bienvenida» (O-9): marca en el JSON de plantillas, en la misma transacción que lo lee.
    await tenantTransaction(async (tx) => {
      const actual = await tx.padelConfig.findUnique({ where: { tenantId }, select: { plantillas: true } });
      const plantillas = plantillasConBienvenida(actual?.plantillas);
      await tx.padelConfig.upsert({ where: { tenantId }, create: { tenantId, plantillas }, update: { plantillas }, select: { id: true } });
    }, { tenantId, ...ESCRITURA_DEL_JSON });
    await auditAdmin({ action: "padel.config.bienvenida", entity: "PadelConfig", entityId: tenantId, changes: { vista: true } });
    refrescar();
    return { ok: true, valor: null };
  }

  if (v.tipo === "plantilla") {
    await tenantTransaction(async (tx) => {
      const actual = await tx.padelConfig.findUnique({ where: { tenantId }, select: { plantillas: true } });
      const plantillas = plantillasConCambio(actual?.plantillas, v.clave, v.texto);
      await tx.padelConfig.upsert({ where: { tenantId }, create: { tenantId, plantillas }, update: { plantillas }, select: { id: true } });
    }, { tenantId, ...ESCRITURA_DEL_JSON });
    await auditAdmin({ action: "padel.config.plantilla", entity: "PadelConfig", entityId: tenantId, changes: { clave: v.clave, restaurada: v.texto === null } });
    refrescar();
    return { ok: true, valor: v.texto ?? PLANTILLAS_DEFAULT[v.clave] };
  }

  await tenantTransaction(async (tx) => {
    await tx.padelDisponibilidad.deleteMany({ where: { tenantId, fecha: null } });
    if (v.tramos.length) await tx.padelDisponibilidad.createMany({ data: v.tramos.map((t) => ({ tenantId, ...t, tipo: "DA" })) });
  }, { tenantId });
  await auditAdmin({ action: "padel.horarios", entity: "PadelDisponibilidad", changes: { tramos: v.tramos.length } });
  refrescar();
  return { ok: true, valor: v.tramos };
}
