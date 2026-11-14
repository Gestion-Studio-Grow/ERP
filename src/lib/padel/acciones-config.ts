"use server";

// ============================================================================
// PADEL-CLASES — Ajustes de a un campo (Tanda 3B · M-077/M-079/M-084).
// ============================================================================
//
// `guardarCampoConfig(clave, valor)`: el profe sale del campo y queda guardado, sin un «Guardar»
// al pie. La clave viene de la pantalla, así que pasa por la LISTA BLANCA de config-campos.ts
// (nunca se escribe una clave arbitraria) y cada una con su validación. Como el resto de las
// acciones del profe: `agenda:manage` (la cuenta de cobro, sólo OWNER: `puedeCambiarAjuste`), todo
// acotado por `tenantId` y rastro en la auditoría.
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
import { requireCapabilityFueraDeLaAgenda } from "@/lib/authz";
import { auditAdmin } from "@/lib/audit-core";
import { PLANTILLAS_DEFAULT } from "./core";
import { AJUSTE_DIRECTORIO, SOLO_EL_DUENIO_COBRO, SOLO_EL_DUENIO_DIRECTORIO, plantillasConBienvenida, plantillasConCambio, puedeCambiarAjuste, validarCampoConfig, type TramoSemanal } from "./config-campos";
import { refrescar, type Resultado } from "./acciones-compartido";
import { plantillasConDirectorio, validarDirectorio, type Directorio } from "./directorio";

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
  const user = await requireCapabilityFueraDeLaAgenda("agenda:manage");
  if (!puedeCambiarAjuste(user.role, clave)) return { ok: false, error: SOLO_EL_DUENIO_COBRO };
  const tenantId = await getCurrentTenantId();
  const r = validarCampoConfig(clave, valor);
  if (!r.ok) return { ok: false, error: r.error };
  const v = r.v;

  if (v.tipo === "campo") {
    const data = { [v.campo]: v.valor };
    await prisma.padelConfig.upsert({ where: { tenantId }, create: { tenantId, ...data }, update: data });
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
      const plantillas = plantillasConBienvenida(actual?.plantillas) as Prisma.InputJsonObject;
      await tx.padelConfig.upsert({ where: { tenantId }, create: { tenantId, plantillas }, update: { plantillas } });
    }, { tenantId, ...ESCRITURA_DEL_JSON });
    await auditAdmin({ action: "padel.config.bienvenida", entity: "PadelConfig", entityId: tenantId, changes: { vista: true } });
    refrescar();
    return { ok: true, valor: null };
  }

  if (v.tipo === "plantilla") {
    await tenantTransaction(async (tx) => {
      const actual = await tx.padelConfig.findUnique({ where: { tenantId }, select: { plantillas: true } });
      const plantillas = plantillasConCambio(actual?.plantillas, v.clave, v.texto) as Prisma.InputJsonObject;
      await tx.padelConfig.upsert({ where: { tenantId }, create: { tenantId, plantillas }, update: { plantillas } });
    }, { tenantId, ...ESCRITURA_DEL_JSON });
    await auditAdmin({ action: "padel.config.plantilla", entity: "PadelConfig", entityId: tenantId, changes: { clave: v.clave, restaurada: v.texto === null } });
    refrescar();
    return { ok: true, valor: v.texto ?? PLANTILLAS_DEFAULT[v.clave] };
  }

  // E4 · Un club de otro negocio (o inventado) no entra: se valida contra los clubes de ÉSTE.
  const pedidos = [...new Set(v.tramos.map((t) => t.clubId).filter((x): x is string => Boolean(x)))];
  if (pedidos.length) {
    const propios = await prisma.padelClub.count({ where: { tenantId, id: { in: pedidos } } });
    if (propios !== pedidos.length) return { ok: false, error: "Uno de los clubes ya no está. Actualizá la pantalla." };
  }
  await tenantTransaction(async (tx) => {
    await tx.padelDisponibilidad.deleteMany({ where: { tenantId, fecha: null } });
    if (v.tramos.length) {
      await tx.padelDisponibilidad.createMany({
        data: v.tramos.map((t) => ({ tenantId, diaSemana: t.diaSemana, desde: t.desde, hasta: t.hasta, clubId: t.clubId ?? null, tipo: "DA" })),
      });
    }
  }, { tenantId });
  await auditAdmin({ action: "padel.horarios", entity: "PadelDisponibilidad", changes: { tramos: v.tramos.length } });
  refrescar();
  return { ok: true, valor: v.tramos };
}

/**
 * «Aparecer en el buscador de profes» (directorio público, src/lib/padel/directorio.ts): sí/no y la
 * zona, de una. Vive en el mismo JSON que los textos (clave reservada
 * `_directorio`, sin migración): leer y reescribir en Serializable, como los textos (F-2), y sin
 * tocar los textos ni la marca de la Bienvenida. Publicar el negocio lo decide SÓLO el dueño (CERT
 * 13/11): `agenda:manage` + `puedeCambiarAjuste(rol, "directorio")`, como la cuenta de cobro.
 */
export async function guardarDirectorio(valor: unknown): Promise<Resultado<{ valor: Directorio }>> {
  const user = await requireCapabilityFueraDeLaAgenda("agenda:manage");
  if (!puedeCambiarAjuste(user.role, AJUSTE_DIRECTORIO)) return { ok: false, error: SOLO_EL_DUENIO_DIRECTORIO };
  const tenantId = await getCurrentTenantId();
  const r = validarDirectorio(valor);
  if (!r.ok) return { ok: false, error: r.error };
  try {
    await tenantTransaction(async (tx) => {
      const actual = await tx.padelConfig.findUnique({ where: { tenantId }, select: { plantillas: true } });
      const plantillas = plantillasConDirectorio(actual?.plantillas, r.v) as Prisma.InputJsonObject;
      await tx.padelConfig.upsert({ where: { tenantId }, create: { tenantId, plantillas }, update: { plantillas } });
    }, { tenantId, ...ESCRITURA_DEL_JSON });
  } catch (e) {
    if (esConflictoDeEscritura(e)) return { ok: false, error: "Se estaban guardando dos cosas a la vez y ésta no entró. Probá de nuevo." };
    throw e;
  }
  await auditAdmin({ action: "padel.config.directorio", entity: "PadelConfig", entityId: tenantId, changes: { visible: r.v.visible, zona: r.v.zona } });
  refrescar();
  return { ok: true, valor: r.v };
}
