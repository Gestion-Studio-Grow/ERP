"use server";

// ============================================================================
// PADEL-CLASES · T5 — PAQUETES de clases (acciones del profe). Reglas en paquetes-core.ts.
// ============================================================================
//
// - venderPaquete: N clases por un precio, cobrado a mano (efectivo, transferencia o Mercado Pago).
//   Doble toque: la clave de la pantalla (`claveIdem`, única por negocio) no crea dos paquetes.
// - cobrarConPaquete: la clase queda PAGADO con medio PAQUETE y su uso en PadelPaqueteUso.
//   CANDADO: lo primero de la transacción es la FILA DEL ALUMNO (SELECT … FOR NO KEY UPDATE), que existe
//   siempre, tenga o no paquetes vivos (un candado sobre los paquetes no bloquea nada si todavía no
//   hay ninguno y una venta confirma en el medio). Vender, cobrar y anular toman el mismo candado:
//   dos cobros a la vez se ponen en fila, el segundo cuenta DESPUÉS de que el primero confirmó, y si
//   era la última clase contesta «No le quedan clases». Una misma clase dos veces: el cobro va
//   condicionado al pago leído (y `claseId` es único en los usos).
// - anularPaquete: una venta cargada por error, sólo si no se usó ninguna clase (mismo candado).
// - paqueteParaCobrar: cuántas le quedan al alumno de esa clase (la hoja «Cobré» lo muestra).
//
// Como el resto de las acciones de Clases: `agenda:manage` (OWNER y RECEPTION, los que cobran),
// todo por `tenantId` adentro de `tenantTransaction` (RLS), rastro en la auditoría. Si la migración
// 20261110120000 no se aplicó, contestan «todavía no está habilitado» (P2021), nunca un 500.

import { prisma } from "@/lib/prisma";
import { tenantTransaction } from "@/lib/rls";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireCapabilityFueraDeLaAgenda } from "@/lib/authz";
import { auditAdmin } from "@/lib/audit-core";
import { isTableMissing, isUniqueViolation } from "@/lib/prisma-errors";
import { puedeCobrarProfe } from "./core";
import { configPadel } from "./datos.server";
import { MEDIO_PAQUETE, elegirPaquete, paqueteValido, puedeAnularPaquete, quedanEnTotal } from "./paquetes-core";
import { paquetesEnTx, quedanAlAlumno } from "./paquetes.server";
import { ErrorNegocio, SIN_AVISO, avisarAlAlumno, conErrorNegocio, refrescar, type ConAviso, type Resultado, type Tx } from "./acciones-compartido";

const SIN_TABLA = "Los paquetes todavía no están habilitados en tu cuenta.";

/**
 * CANDADO de los paquetes de un alumno: su fila en PadelAlumno, bloqueada hasta el fin de la
 * transacción. Quien llega segundo espera acá y, como cada sentencia ve lo confirmado
 * (ReadCommitted), cuenta con lo que el primero ya hizo. `false` si el alumno no existe.
 * NO KEY UPDATE (y no UPDATE): se excluye con otro candado igual, pero no frena los INSERT que sólo
 * referencian al alumno (su FK toma KEY SHARE): agendar una clase no espera a un cobro.
 */
async function bloquearAlumno(tx: Tx, tenantId: string, alumnoId: string): Promise<boolean> {
  const filas = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "PadelAlumno" WHERE "tenantId" = ${tenantId} AND id = ${alumnoId} FOR NO KEY UPDATE`;
  return filas.length > 0;
}

/** Id que manda la pantalla: corto y sin cosas raras. */
const idValido = (x: unknown): x is string => typeof x === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(x);

/** La clave del doble toque: la arma la pantalla una vez por formulario. */
const claveValida = (x: unknown): string | null => (typeof x === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(x) ? x : null);

/** El error de «la tabla no existe» se contesta en criollo; el resto sigue su camino. */
async function conTabla<T>(fn: () => Promise<T>): Promise<T | { ok: false; error: string }> {
  try {
    return await conErrorNegocio(fn);
  } catch (e) {
    if (isTableMissing(e)) return { ok: false, error: SIN_TABLA };
    throw e;
  }
}

/** «Vender paquete» (ficha del alumno): N clases por un precio, ya cobrado con ese medio. */
export async function venderPaquete(
  alumnoId: string,
  datos: { clases: unknown; precio: unknown; medio: unknown; clave?: unknown },
): Promise<Resultado<{ paqueteId: string; quedan: number; repetido?: boolean }>> {
  await requireCapabilityFueraDeLaAgenda("agenda:manage");
  const tenantId = await getCurrentTenantId();
  if (!idValido(alumnoId)) return { ok: false, error: "No encontramos ese alumno." };
  const v = paqueteValido(datos ?? { clases: null, precio: null, medio: null });
  if (!v.ok) return v;
  const claveIdem = claveValida(datos?.clave);
  return conTabla(async () => {
    let r: { paqueteId: string; quedan: number; repetido?: boolean; token: string };
    try {
      r = await tenantTransaction(async (tx) => {
        if (!(await bloquearAlumno(tx, tenantId, alumnoId))) throw new ErrorNegocio("No encontramos ese alumno.");
        const a = await tx.padelAlumno.findFirst({ where: { tenantId, id: alumnoId }, select: { id: true, token: true } });
        if (!a) throw new ErrorNegocio("No encontramos ese alumno.");
        const p = await tx.padelPaquete.create({
          data: { tenantId, alumnoId: a.id, clases: v.clases, precio: v.precio, pagoMedio: v.medio, pagadoEl: new Date(), claveIdem },
          select: { id: true },
        });
        const vivos = await paquetesEnTx(tx, tenantId, a.id);
        return { paqueteId: p.id, quedan: quedanEnTotal(vivos), token: a.token };
      }, { tenantId });
    } catch (e) {
      // El mismo formulario dos veces (doble toque, red lenta): se devuelve el que ya quedó.
      if (claveIdem && isUniqueViolation(e, "claveIdem")) {
        const ya = await prisma.padelPaquete.findFirst({ where: { tenantId, claveIdem, alumnoId }, select: { id: true } });
        if (ya) return { ok: true as const, paqueteId: ya.id, quedan: (await quedanAlAlumno(tenantId, alumnoId)).quedan, repetido: true };
      }
      throw e;
    }
    await auditAdmin({ action: "padel.paquete.vender", entity: "PadelPaquete", entityId: r.paqueteId, changes: { alumnoId, clases: v.clases, precio: v.precio, medio: v.medio } });
    refrescar(r.token);
    return { ok: true as const, paqueteId: r.paqueteId, quedan: r.quedan };
  });
}

/**
 * «Del paquete» (hoja «Cobré»): la clase queda pagada descontándola del paquete más viejo con
 * clases. `recibo`: además le manda «Recibí el pago». Devuelve cuántas le quedan.
 */
export async function cobrarConPaquete(claseId: string, opciones?: { recibo?: boolean }): Promise<Resultado<ConAviso & { quedan: number }>> {
  await requireCapabilityFueraDeLaAgenda("agenda:manage");
  const tenantId = await getCurrentTenantId();
  if (!idValido(claseId)) return { ok: false, error: "No encontramos esa clase." };
  return conTabla(async () => {
    const clase = await prisma.padelClase.findFirst({
      where: { tenantId, id: claseId },
      select: { id: true, estado: true, pagoEstado: true, pagoMedio: true, precio: true, motivoCancel: true, empiezaEn: true, clubId: true, alumnoId: true, alumno: { select: { token: true } }, client: { select: { name: true, phone: true } } },
    });
    if (!clase) throw new ErrorNegocio("No encontramos esa clase.");
    if (!puedeCobrarProfe({ ...clase, precio: Number(clase.precio) })) {
      throw new ErrorNegocio(["PAGADO", "ACREDITADO", "DEVUELTO"].includes(clase.pagoEstado) ? "Esa clase ya está cobrada." : "Esa clase no se puede cobrar.");
    }
    const ahora = new Date();
    const r = await tenantTransaction(async (tx) => {
      // CANDADO: la fila del alumno. Quien llega segundo espera acá y cuenta con lo que el primero
      // (o una venta) ya confirmó.
      if (!(await bloquearAlumno(tx, tenantId, clase.alumnoId))) throw new ErrorNegocio("No encontramos esa clase.");
      const paquetes = await paquetesEnTx(tx, tenantId, clase.alumnoId);
      const paquete = elegirPaquete(paquetes);
      if (!paquete) throw new ErrorNegocio(paquetes.length ? "No le quedan clases en el paquete." : "No tiene un paquete de clases.");
      const n = await tx.padelClase.updateMany({
        where: { tenantId, id: clase.id, alumnoId: clase.alumnoId, estado: clase.estado, pagoEstado: clase.pagoEstado },
        data: { pagoEstado: "PAGADO", pagoMedio: MEDIO_PAQUETE, pagoValidadoEl: ahora },
      });
      if (n.count === 0) throw new ErrorNegocio("Ese cobro ya cambió. Actualizá la pantalla.");
      // Un uso viejo de esta clase (se cobró del paquete, se canceló y volvió): se reemplaza.
      await tx.padelPaqueteUso.deleteMany({ where: { tenantId, claseId: clase.id } });
      await tx.padelPaqueteUso.create({ data: { tenantId, paqueteId: paquete.id, claseId: clase.id } });
      return { paqueteId: paquete.id, quedan: quedanEnTotal(paquetes) - 1 };
    }, { tenantId });
    await prisma.padelAviso.updateMany({ where: { tenantId, claseId: clase.id, destino: "PROFE", tipo: "comprobante", leidoEl: null }, data: { leidoEl: ahora } });
    await auditAdmin({ action: "padel.pago.paquete", entity: "PadelClase", entityId: clase.id, changes: { de: clase.pagoEstado, a: "PAGADO", medio: MEDIO_PAQUETE, paqueteId: r.paqueteId, quedan: r.quedan } });
    const alumno = { id: clase.alumnoId, token: clase.alumno.token, nombre: clase.client.name, telefono: clase.client.phone };
    const aviso = opciones?.recibo
      ? await avisarAlAlumno({ tenantId, config: await configPadel(tenantId), clave: "pagoOk", tipo: "pago-ok", clase, alumno })
      : SIN_AVISO;
    refrescar(alumno.token);
    return { ok: true as const, ...aviso, quedan: r.quedan };
  });
}

/** «Anular» un paquete cargado por error: sólo si todavía no se usó ninguna clase. */
export async function anularPaquete(paqueteId: string): Promise<Resultado> {
  await requireCapabilityFueraDeLaAgenda("agenda:manage");
  const tenantId = await getCurrentTenantId();
  if (!idValido(paqueteId)) return { ok: false, error: "No encontramos ese paquete." };
  return conTabla(async () => {
    const ahora = new Date();
    const r = await tenantTransaction(async (tx) => {
      const p = await tx.padelPaquete.findFirst({ where: { tenantId, id: paqueteId }, select: { alumnoId: true, alumno: { select: { token: true } } } });
      if (!p) throw new ErrorNegocio("No encontramos ese paquete.");
      // El mismo candado que el cobro (la fila del alumno): un cobro a la vez no se cruza con la anulación.
      if (!(await bloquearAlumno(tx, tenantId, p.alumnoId))) throw new ErrorNegocio("No encontramos ese paquete.");
      const vivos = await paquetesEnTx(tx, tenantId, p.alumnoId);
      const vivo = vivos.find((x) => x.id === paqueteId);
      if (!vivo) throw new ErrorNegocio("Ese paquete ya cambió. Actualizá la pantalla.");
      if (!puedeAnularPaquete(vivo)) throw new ErrorNegocio("Ya usó clases de ese paquete: no se puede anular.");
      const n = await tx.padelPaquete.updateMany({ where: { tenantId, id: paqueteId, anuladoEl: null }, data: { anuladoEl: ahora } });
      if (n.count === 0) throw new ErrorNegocio("Ese paquete ya cambió. Actualizá la pantalla.");
      return { token: p.alumno.token, alumnoId: p.alumnoId };
    }, { tenantId });
    await auditAdmin({ action: "padel.paquete.anular", entity: "PadelPaquete", entityId: paqueteId, changes: { alumnoId: r.alumnoId } });
    refrescar(r.token);
    return { ok: true as const };
  });
}

/** Cuántas clases le quedan en paquetes al alumno de esa clase (la hoja «Cobré»). */
export async function paqueteParaCobrar(claseId: string): Promise<{ disponible: boolean; quedan: number }> {
  await requireCapabilityFueraDeLaAgenda("agenda:manage");
  const tenantId = await getCurrentTenantId();
  if (!idValido(claseId)) return { disponible: false, quedan: 0 };
  const c = await prisma.padelClase.findFirst({ where: { tenantId, id: claseId }, select: { alumnoId: true } });
  if (!c) return { disponible: false, quedan: 0 };
  return quedanAlAlumno(tenantId, c.alumnoId);
}
