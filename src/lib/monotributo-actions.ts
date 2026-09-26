"use server";

// Monitor de monotributo de la cartera (frente C3) — el borde con la base.
//
// Quién puede: el ESTUDIO con la capability `cartera:manage` y el módulo `cartera` (sin
// `multilocal`), la misma puerta que el resto de /contador. Los clientes salen SIEMPRE de su
// cartera; ninguna acción recibe un tenantId que no se verifique contra ella.
//
// Dónde vive la categoría (sin migración, decisión registrada): no hay columna para la categoría
// del monotributo (Tenant sólo tiene `arcaCondicionIva`). Se guarda como una DECLARACIÓN fechada
// en `AuditLog` del estudio (entity `MonotributoCategoria`, entityId = el cliente): queda quién la
// cargó y cuándo, que es justo lo que cambia en cada recategorización, y la última manda. Es el
// mismo patrón que ya guarda estado en AuditLog (cierre de caja, interruptores por negocio). Cuando
// se abra la ventana de migraciones M1, pasa a una columna propia con estas filas como historia.
//
// Lo facturado se lee DENTRO de la transacción de cada cliente (tenantTransaction con SU id: RLS
// del cliente, cero bypass), sólo comprobantes autorizados con fecha en la ventana de 12 meses.

import { revalidatePath } from "next/cache";
import { basePrisma } from "@/lib/prisma-base";
import { tenantTransaction } from "@/lib/rls";
import { requireCapability } from "@/lib/authz";
import { getCurrentUser } from "@/lib/session";
import { getCurrentTenantId } from "@/lib/tenant";
import { dateStrInBusinessTz } from "@/lib/datetime";
import { decidirAcceso } from "@/lib/multilocal/multilocal-core";
import { exigirClienteDeCartera, type EstadoCartera, type FilaCarteraDb } from "@/lib/cartera-core";
import {
  cuadroDeLaRecategorizacion,
  cuadroParaHoy,
  esLetraCategoria,
  evaluarMonotributo,
  ordenarMonotributo,
  inicioDelCuadroDeLaRecategorizacion,
  proximaRecategorizacion,
  tablaVigenteEn,
  ventanaDeLectura,
  type FilaMonotributo,
  type LetraCategoria,
  type Recategorizacion,
} from "@/lib/monotributo-core";

const ENTIDAD_CATEGORIA = "MonotributoCategoria";
const ACCION_CATEGORIA = "monotributo.categoria";

export type ResultadoMonitorMonotributo =
  | {
      ok: true;
      hoy: string;
      filas: FilaMonotributo[];
      recategorizacion: Recategorizacion;
      tabla: { vigenciaDesde: string; vigenciaHasta: string; fuente: string; provisional: boolean; vigenteHoy: boolean };
      /**
       * Sólo con la recategorización en curso: el cuadro con el que ARCA recategoriza (el que empieza
       * el 1 del mes en que vence) y si ya está cargado. Sin él, el monitor no da letra.
       */
      cuadroRecategorizacion: { desde: string; cargado: boolean } | null;
      /** Clientes de la cartera sin condición frente al IVA cargada (no se sabe si son monotributo). */
      sinCondicionIva: number;
    }
  | { ok: false; error: string };

export type ResultadoCategoria = { ok: true } | { ok: false; error: string };

type Gate = { ok: true; estudioTenantId: string } | { ok: false; error: string };

async function exigirEstudio(): Promise<Gate> {
  await requireCapability("cartera:manage");
  const estudioTenantId = await getCurrentTenantId();
  const tenant = await basePrisma.tenant.findUnique({ where: { id: estudioTenantId }, select: { modules: true } });
  const acceso = decidirAcceso(tenant?.modules ?? null, "estudio");
  if (!acceso.ok) return acceso;
  return { ok: true, estudioTenantId };
}

/** Categorías declaradas por el estudio: la última por cliente. */
async function categoriasDeclaradas(estudioTenantId: string, ids: string[]): Promise<Map<string, LetraCategoria>> {
  if (ids.length === 0) return new Map();
  const filas = await tenantTransaction(
    (tx) =>
      tx.auditLog.findMany({
        where: { tenantId: estudioTenantId, entity: ENTIDAD_CATEGORIA, entityId: { in: ids } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { entityId: true, changes: true },
      }),
    { tenantId: estudioTenantId },
  );
  const out = new Map<string, LetraCategoria>();
  for (const f of filas) {
    if (!f.entityId || out.has(f.entityId)) continue;
    const letra = (f.changes as { categoria?: unknown } | null)?.categoria;
    if (esLetraCategoria(letra)) out.set(f.entityId, letra);
  }
  return out;
}

function aAaaammdd(dia: string): string {
  return dia.replaceAll("-", "");
}

/** El monitor: un renglón por cliente monotributista de la cartera, lo más urgente arriba. */
export async function monitorMonotributoAction(): Promise<ResultadoMonitorMonotributo> {
  const gate = await exigirEstudio();
  if (!gate.ok) return gate;
  const { estudioTenantId } = gate;
  const hoy = dateStrInBusinessTz(new Date());
  const { desde, hasta } = ventanaDeLectura(hoy);

  try {
    const cartera = await tenantTransaction(
      (tx) =>
        tx.carteraCliente.findMany({
          where: { tenantId: estudioTenantId, estado: { not: "baja" } },
          select: { clienteTenantId: true, alias: true },
        }),
      { tenantId: estudioTenantId },
    );
    const ids = cartera.map((c) => c.clienteTenantId);
    // Tenant está fuera de RLS por diseño; los ids salen de la cartera del estudio, nunca de un input.
    const condiciones = new Map(
      (
        await basePrisma.tenant.findMany({ where: { id: { in: ids } }, select: { id: true, arcaCondicionIva: true } })
      ).map((t) => [t.id, t.arcaCondicionIva]),
    );
    const monotributistas = cartera.filter((c) => condiciones.get(c.clienteTenantId) === "MONOTRIBUTO");
    const sinCondicionIva = cartera.filter((c) => !condiciones.get(c.clienteTenantId)).length;
    const categorias = await categoriasDeclaradas(
      estudioTenantId,
      monotributistas.map((c) => c.clienteTenantId),
    );

    const filas: FilaMonotributo[] = [];
    for (const c of monotributistas) {
      const comprobantes = await tenantTransaction(
        (tx) =>
          tx.invoice.findMany({
            where: {
              tenantId: c.clienteTenantId,
              status: "AUTHORIZED",
              fecha: { gte: aAaaammdd(desde), lte: aAaaammdd(hasta) },
            },
            select: { status: true, tipoComprobante: true, fecha: true, neto: true, total: true },
          }),
        { tenantId: c.clienteTenantId },
      );
      filas.push(
        evaluarMonotributo(
          {
            clienteTenantId: c.clienteTenantId,
            alias: c.alias,
            categoria: categorias.get(c.clienteTenantId) ?? null,
            comprobantes: comprobantes.map((i) => ({
              estado: i.status,
              tipoComprobante: i.tipoComprobante,
              fecha: i.fecha,
              neto: i.neto.toNumber(),
              total: i.total.toNumber(),
            })),
          },
          hoy,
        ),
      );
    }

    const recategorizacion = proximaRecategorizacion(hoy);
    const cuadro = cuadroParaHoy(hoy);
    return {
      ok: true,
      hoy,
      filas: ordenarMonotributo(filas),
      recategorizacion,
      tabla: {
        vigenciaDesde: cuadro.vigenciaDesde,
        vigenciaHasta: cuadro.vigenciaHasta,
        fuente: cuadro.fuente,
        provisional: !cuadro.verificadaContraArca,
        vigenteHoy: tablaVigenteEn(hoy, cuadro),
      },
      cuadroRecategorizacion: recategorizacion.enCurso
        ? {
            desde: inicioDelCuadroDeLaRecategorizacion(recategorizacion),
            cargado: cuadroDeLaRecategorizacion(recategorizacion) != null,
          }
        : null,
      sinCondicionIva,
    };
  } catch {
    return { ok: false, error: "No pudimos leer la facturación de la cartera. Probá de nuevo en un rato." };
  }
}

/** La contadora carga (o corrige) la categoría en la que está inscripto su cliente. */
export async function cargarCategoriaMonotributoAction(
  clienteTenantId: unknown,
  categoria: unknown,
): Promise<ResultadoCategoria> {
  const gate = await exigirEstudio();
  if (!gate.ok) return gate;
  if (typeof clienteTenantId !== "string" || clienteTenantId.length === 0) {
    return { ok: false, error: "Ese cliente no está en tu cartera." };
  }
  if (!esLetraCategoria(categoria)) {
    return { ok: false, error: "Elegí una categoría de la A a la K." };
  }
  const { estudioTenantId } = gate;
  const pertenencia = await exigirClienteDeCartera(
    async (estudio, cliente) => {
      const fila = await tenantTransaction(
        (tx) =>
          tx.carteraCliente.findUnique({
            where: { tenantId_clienteTenantId: { tenantId: estudio, clienteTenantId: cliente } },
            select: { id: true, clienteTenantId: true, alias: true, estado: true },
          }),
        { tenantId: estudio },
      );
      return fila ? ({ ...fila, estado: fila.estado as EstadoCartera } satisfies FilaCarteraDb) : null;
    },
    estudioTenantId,
    clienteTenantId,
    { permitirPausada: true },
  );
  if (!pertenencia.ok) return pertenencia;

  const cliente = await basePrisma.tenant.findUnique({
    where: { id: clienteTenantId },
    select: { arcaCondicionIva: true },
  });
  if (cliente?.arcaCondicionIva !== "MONOTRIBUTO") {
    return { ok: false, error: "Ese cliente no figura como monotributista: revisá su condición frente al IVA." };
  }

  const user = await getCurrentUser();
  const anterior = (await categoriasDeclaradas(estudioTenantId, [clienteTenantId])).get(clienteTenantId) ?? null;
  if (anterior === categoria) return { ok: true };
  try {
    await tenantTransaction(
      (tx) =>
        tx.auditLog.create({
          data: {
            tenantId: estudioTenantId,
            actor: user ? `user:${user.id}` : "admin",
            action: ACCION_CATEGORIA,
            entity: ENTIDAD_CATEGORIA,
            entityId: clienteTenantId,
            changes: { categoria, anterior },
            channel: "admin",
          },
        }),
      { tenantId: estudioTenantId },
    );
  } catch {
    return { ok: false, error: "No se guardó la categoría. Probá de nuevo." };
  }
  revalidatePath("/contador");
  return { ok: true };
}
