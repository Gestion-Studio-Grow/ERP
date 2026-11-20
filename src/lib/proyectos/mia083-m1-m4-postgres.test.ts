// ============================================================================
// GSG-MIA-083 · M1, M4a y M4b de la UAT de Administración de MIA, contra Postgres de verdad (base efímera migrada,
// rol app_rls sin BYPASSRLS, Server Actions con sesión).
//
//  M1   «No mueve ninguna cuenta» al marcar un cobro en la ficha: FIJA lo que pasa hoy, por medio. El cobro entra al
//       libro de caja en la columna del medio (Efectivo → EFECTIVO, Mercado Pago → MP, Transferencia y Cheque →
//       TRANSFERENCIA, con la columna en la base) y no mueve el saldo de ninguna cuenta de Administración. No es una
//       falla: «ninguna cuenta» es ninguna cuenta del banco; la caja es otra cosa. Decisión en el PR (sin cambio de
//       qué se asienta; sólo el rótulo).
//  M4a  la cuenta del cierre no se toca: un anticipo en efectivo con el cajón en 0 deja el libro en −200.000; el
//       cierre espera −200.000, contar 0 asienta un ajuste de +200.000 y el libro queda en 0. Con #185 integrado se
//       reproduce (es diseño, `revisar-cierre.ts:59-62`).
//  M4b  la pista del cierre no nombra el cuaderno cuando lo que tiene fecha vieja es un cobro de Proyectos: en la
//       demo la disparaban los cobros de la semilla (`seed-mia-gestion.ts`, `cobroDeCuota`, con la fecha del cobro).
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";

const laBase = baseEfimeraDelArchivo();
const DIA = 86_400_000;

async function preparar(t: import("node:test").TestContext) {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a } = base;
  const t0 = await duenio.tenant.findUniqueOrThrow({ where: { id: a.id }, select: { modules: true } });
  await duenio.tenant.update({ where: { id: a.id }, data: { modules: [...new Set([...t0.modules, "proyectos"])] } });
  // Cada caso arranca con el libro de A vacío, sin cierres ni turnos abiertos.
  await duenio.auditLog.deleteMany({ where: { tenantId: a.id, entity: { in: ["CierreDiario", "CierreMes"] } } });
  await duenio.cashMovement.deleteMany({ where: { tenantId: a.id } });
  await duenio.cashSession.updateMany({ where: { tenantId: a.id, status: "OPEN" }, data: { status: "CLOSED", closedAt: new Date() } });
  const form = (c: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(c)) fd.set(k, v);
    return fd;
  };
  const enSesion = async <R>(fn: () => Promise<R>): Promise<R> => {
    const r = await ejecutarAccion({ negocio: a, usuario: { id: a.duenia.id } }, fn);
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return (r as { valor: R }).valor;
  };
  let numero = (await duenio.proyecto.count()) + 900;
  /** Proyecto confirmado, v1 aprobada: un ítem de $ 1.000 + IVA 21 % → anticipo del cliente 50 % = $ 605. */
  const proyecto = async () => {
    const evento = new Date(Date.now() + 30 * DIA);
    const p = await duenio.proyecto.create({
      data: { tenantId: a.id, numero: ++numero, clientId: a.clientes[0], nombre: `Stand M1 ${numero}`, servicio: "ARQUITECTURA", etapa: "APROBADO", fechaArmado: new Date(evento.getTime() - 2 * DIA), fechaEvento: evento, fechaDesarme: new Date(evento.getTime() + DIA) },
      select: { id: true },
    });
    const pres = await duenio.proyectoPresupuesto.create({ data: { tenantId: a.id, proyectoId: p.id, version: 1, estado: "APROBADO", token: `m1-${p.id}`, ivaPct: 21 }, select: { id: true } });
    await duenio.proyectoItem.create({ data: { tenantId: a.id, presupuestoId: pres.id, rubro: "General", descripcion: "Stand", cantidad: 1, precio: 1000 } });
    return p.id;
  };
  return { base, duenio, a, form, enSesion, proyecto };
}

test("M1 · «No mueve ninguna cuenta»: el cobro de la cuota entra al libro en la columna del medio y no mueve ninguna cuenta", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { duenio, a } = p;
  const ficha = await import("./acciones-ficha");
  const gestion = await import("./gestion.server");
  const cuenta = await duenio.proyectoCuentaBanco.create({ data: { tenantId: a.id, nombre: "Banco M1", moneda: "ARS", saldo: 50_000 }, select: { id: true } });
  // A mano: la columna del libro por medio (core.ts `metodoDeCaja`, con TRANSFERENCIA en la base migrada).
  const COLUMNA = { EFECTIVO: "EFECTIVO", MERCADO_PAGO: "MP", TRANSFERENCIA: "TRANSFERENCIA", CHEQUE: "TRANSFERENCIA" } as const;
  for (const [medio, columna] of Object.entries(COLUMNA)) {
    const id: string = await p.proyecto();
    await p.enSesion(() => gestion.regenerarCuotas(a.id, id));
    const anticipo: { id: string; monto: number } = await duenio.proyectoCuota.findFirstOrThrow({ where: { proyectoId: id, tipo: "COBRO", clave: { endsWith: ":cliente:anticipo" } }, select: { id: true, monto: true } });
    assert.equal(anticipo.monto, 605, "a mano: 1.210 al 50 %");
    const r: { ok: boolean } = await p.enSesion(() => ficha.marcarCuota(p.form({ envio: crypto.randomUUID(), id: anticipo.id, medio, cuenta: "ninguna" })));
    assert.equal(r.ok, true, `${medio}: ${JSON.stringify(r)}`);
    const pago = await duenio.proyectoPago.findFirstOrThrow({ where: { proyectoId: id }, select: { id: true } });
    const asientos = await duenio.cashMovement.findMany({ where: { proyectoPagoId: pago.id }, select: { type: true, method: true, amount: true } });
    assert.deepEqual(asientos, [{ type: "VENTA", method: columna, amount: 605 }], `${medio}: una VENTA de $ 605 en ${columna}`);
    const marcada = await duenio.proyectoCuota.findUniqueOrThrow({ where: { id: anticipo.id }, select: { cuentaId: true, cuentaMovido: true } });
    assert.deepEqual(marcada, { cuentaId: null, cuentaMovido: null }, `${medio}: la cuota no guarda cuenta`);
  }
  assert.equal((await duenio.proyectoCuentaBanco.findUniqueOrThrow({ where: { id: cuenta.id }, select: { saldo: true } })).saldo, 50_000, "la cuenta del banco no se movió");
});

test("M4a · anticipo en efectivo con el cajón en 0: el libro queda en −200.000; el cierre espera −200.000, contar 0 asienta +200.000 y el libro queda en 0", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { duenio, a } = p;
  const rendiciones = await import("./acciones-rendiciones");
  const { cerrarDia } = await import("@/lib/cierre-diario-actions");
  const { todayInBusinessTz } = await import("@/lib/datetime");
  const id = await p.proyecto();
  const persona = await duenio.proyectoPersona.create({ data: { tenantId: a.id, nombre: "Productora M4", rol: "PRODUCCION" }, select: { id: true } });
  const r = await p.enSesion(() => rendiciones.entregarAnticipo(p.form({ personaId: persona.id, proyectoId: id, medio: "EFECTIVO", monto: "200000", clave: "m4a-anticipo-efectivo-0001" })));
  assert.equal((r as { ok?: boolean }).ok, true, JSON.stringify(r));
  const efectivo = async () => (await duenio.cashMovement.findMany({ where: { tenantId: a.id, method: "EFECTIVO" }, select: { type: true, amount: true } })).reduce((s, m) => s + (m.type === "EGRESO" ? -m.amount : m.amount), 0);
  assert.equal(await efectivo(), -200_000, "el anticipo deja el efectivo del libro en −200.000");
  const hoy = todayInBusinessTz();
  const rc = await p.enSesion(() => cerrarDia(p.form({ day: hoy, declarado_EFECTIVO: "0", note: "No queda efectivo" })));
  assert.equal(rc?.ok, true, JSON.stringify(rc));
  const cierre = await duenio.auditLog.findFirstOrThrow({ where: { tenantId: a.id, action: "caja.cierre-diario", entityId: hoy }, select: { changes: true } });
  assert.deepEqual((cierre.changes as { porMedio: Record<string, unknown> }).porMedio.EFECTIVO, { esperado: -200_000, declarado: 0, diferencia: 200_000 }, "a mano: contado 0 − esperado −200.000 = +200.000");
  const ajustes = await duenio.cashMovement.findMany({ where: { tenantId: a.id, createdBy: { startsWith: "cierre" } }, select: { type: true, method: true, amount: true } });
  assert.deepEqual(ajustes, [{ type: "INGRESO", method: "EFECTIVO", amount: 200_000 }], "un ajuste de +200.000 en efectivo");
  assert.equal(await efectivo(), 0, "después del cierre el libro dice lo que se contó");
});

test("M4b · un cobro de Proyectos con la fecha del cobro (como los de la semilla) no es una venta del cuaderno: la pista no lo nombra", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { duenio, a } = p;
  const { getCierreDiarioData } = await import("@/lib/cierre-diario-actions");
  const { causasProbables } = await import("@/app/admin/(dashboard)/caja/cierre/revisar-cierre");
  const id = await p.proyecto();
  // Como `cobroDeCuota` de seed-mia-gestion.ts: el cobro con la fecha en que se cobró (ayer), cargado ahora.
  const ayer = new Date(Date.now() - DIA);
  const pago = await duenio.proyectoPago.create({ data: { tenantId: a.id, proyectoId: id, medio: "TRANSFERENCIA", monto: 605, cobradoPor: "test", createdAt: ayer }, select: { id: true } });
  await duenio.cashMovement.create({ data: { tenantId: a.id, type: "VENTA", method: "TRANSFERENCIA", amount: 605, reason: "Proyecto · anticipo", proyectoPagoId: pago.id, createdBy: "test", occurredAt: ayer } });
  const hoja = await p.enSesion(() => getCierreDiarioData(null, { conTurnosSinCerrar: true }));
  assert.deepEqual(hoja.hechos?.cuadernoConFechaVieja, { cantidad: 0, monto: 0 }, "el cobro de Proyectos no cuenta como cuaderno");
  assert.ok(!causasProbables(hoja.hechos ?? null).some((c) => c.id === "cuaderno"), "la pista no nombra el cuaderno");
  // Control: una venta suelta con fecha de ayer cargada hoy sí es del cuaderno (como m1-caja-medios-postgres:151).
  await duenio.cashMovement.create({ data: { tenantId: a.id, type: "VENTA", method: "EFECTIVO", amount: 12_000, reason: "Venta del cuaderno", createdBy: "test", occurredAt: ayer } });
  const otra = await p.enSesion(() => getCierreDiarioData(null, { conTurnosSinCerrar: true }));
  assert.deepEqual(otra.hechos?.cuadernoConFechaVieja, { cantidad: 1, monto: 12_000 }, "la venta del cuaderno sí");
});
