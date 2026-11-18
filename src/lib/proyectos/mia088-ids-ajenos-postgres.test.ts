// ============================================================================
// GSG-MIA-088 · ADM-143 (P4 del plan): en Administración, un id de otro negocio es un id que no existe. Contra Postgres
// real con la app como `app_rls` (sin BYPASSRLS) y las Server Actions reales con la sesión de la dueña de A (Dirección,
// todo en «editar»). Esperados escritos a mano ANTES del arreglo:
//  · La respuesta a un id de B es idéntica, letra por letra, a la de un id inventado, esté como esté la fila de B
//    (pendiente, pagada, anulada, conciliada o no, activa o dada de baja, borrador, publicada o pagada).
//  · Esa respuesta no afirma ningún estado («ya estaba anulado», «ya no está», «no está conciliado»…): para este
//    negocio la fila no existe.
//  · 0 filas cambian en A y en B.
//  · Lo propio sigue diciendo su estado (una cuota propia anulada: «ya estaba anulado»).
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";

const INVENTADO = "cinventado0000000000000000";
const AFIRMA_UN_ESTADO = /ya (estaba|está|no|se)|no está|sólo se borra|anulad|pagad|conciliad|dad[oa] de baja/i;

test("ADM-143 · las acciones de Administración con id: un id de otro negocio contesta igual que uno inventado, sin afirmar estados y sin escribir", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a, b } = base;
  for (const n of [a, b]) {
    const t0 = await duenio.tenant.findUniqueOrThrow({ where: { id: n.id }, select: { modules: true } });
    await duenio.tenant.update({ where: { id: n.id }, data: { modules: [...new Set([...t0.modules, "proyectos"])] } });
  }
  const emp = await import("./acciones-empresa");

  const mirar = <R>(tenantId: string, fn: (tx: Parameters<Parameters<typeof duenio.$transaction>[0]>[0]) => Promise<R>) =>
    duenio.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
      return fn(tx);
    });

  /** Siembra, en un negocio, una fila de cada estado. */
  const sembrar = (tenantId: string, n: string) =>
    mirar(tenantId, async (tx) => {
      const prov = await tx.supplier.create({ data: { tenantId, name: `Proveedor ${n}` } });
      const venceEl = new Date("2026-12-01T12:00:00Z");
      const cuota = (extra: Record<string, unknown>) => tx.proyectoCuota.create({ data: { tenantId, tipo: "PAGO", concepto: `Cuota ${n}`, monto: 100, venceEl, supplierId: prov.id, ...extra } });
      const pendiente = await cuota({});
      const pagada = await cuota({ pagadoEl: new Date("2026-11-02T12:00:00Z") });
      const anulada = await cuota({ anuladoEl: new Date("2026-11-03T12:00:00Z") });
      const cuenta = await tx.proyectoCuentaBanco.create({ data: { tenantId, nombre: `Banco ${n}` } });
      const movSuelto = await tx.proyectoMovBanco.create({ data: { tenantId, cuentaId: cuenta.id, fecha: new Date("2026-11-04T12:00:00Z"), descripcion: "Transferencia", importe: -100 } });
      const conciliada = await cuota({ pagadoEl: new Date("2026-11-04T12:00:00Z") });
      const movConciliado = await tx.proyectoMovBanco.create({ data: { tenantId, cuentaId: cuenta.id, fecha: new Date("2026-11-04T12:00:00Z"), descripcion: "Pago", importe: -100, cuotaId: conciliada.id } });
      const fijoActivo = await tx.proyectoGastoFijo.create({ data: { tenantId, nombre: `Alquiler ${n}`, monto: 500 } });
      const fijoBaja = await tx.proyectoGastoFijo.create({ data: { tenantId, nombre: `Viejo ${n}`, monto: 50, activo: false } });
      const persona = await tx.proyectoPersona.create({ data: { tenantId, nombre: `Armador ${n}`, rol: "PRODUCCION" } });
      const liq = (periodo: string, estado: string) => tx.proyectoLiquidacion.create({ data: { tenantId, personaId: persona.id, periodo, total: 1000, estado } });
      return {
        prov: prov.id,
        cuotas: { pendiente: pendiente.id, pagada: pagada.id, anulada: anulada.id, conciliada: conciliada.id },
        cuenta: cuenta.id,
        movs: { suelto: movSuelto.id, conciliado: movConciliado.id },
        fijos: { activo: fijoActivo.id, baja: fijoBaja.id },
        liqs: { borrador: (await liq("2026-08", "BORRADOR")).id, publicada: (await liq("2026-09", "PUBLICADA")).id, pagada: (await liq("2026-10", "PAGADA")).id },
      };
    });
  const deA = await sembrar(a.id, "A");
  const deB = await sembrar(b.id, "B");

  const foto = async () => {
    const una = (tenantId: string) =>
      mirar(tenantId, async (tx) =>
        JSON.stringify([
          await tx.proyectoCuota.findMany({ orderBy: { id: "asc" } }),
          await tx.proyectoCuentaBanco.findMany({ orderBy: { id: "asc" } }),
          await tx.proyectoMovBanco.findMany({ orderBy: { id: "asc" } }),
          await tx.proyectoGastoFijo.findMany({ orderBy: { id: "asc" } }),
          await tx.proyectoLiquidacion.findMany({ orderBy: { id: "asc" } }),
          await tx.cashMovement.count(),
          await tx.proyectoCambio.count(),
        ]),
      );
    return { a: await una(a.id), b: await una(b.id) };
  };
  const form = (campos: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    return fd;
  };
  const comoA = (fn: () => Promise<unknown>) => ejecutarAccion({ negocio: a, usuario: { id: a.duenia.id } }, fn);

  // [acción, id de B (en cada estado), cómo se llama con un id]
  type Caso = [string, string[], (id: string) => Promise<unknown>];
  const cuotasB = Object.values(deB.cuotas);
  const casos: Caso[] = [
    ["crearPagoEmpresa (proveedor)", [deB.prov], (id) => emp.crearPagoEmpresa(form({ tipo: "PAGO", concepto: "Flete", monto: "100", venceEl: "2026-12-10", supplierId: id, moneda: "ARS" }))],
    ["marcarCuotaEmpresa", cuotasB, (id) => emp.marcarCuotaEmpresa(form({ id, medio: "TRANSFERENCIA" }))],
    ["anularCuotaEmpresa", cuotasB, (id) => emp.anularCuotaEmpresa(form({ id }))],
    ["anularCuotaEmpresa (visto PAGADA)", cuotasB, (id) => emp.anularCuotaEmpresa(form({ id, visto: "PAGADA" }))],
    ["guardarDatoCuota venceEl", cuotasB, (id) => emp.guardarDatoCuota(form({ id, campo: "venceEl", valor: "2026-12-20" }))],
    ["guardarDatoCuota factura", cuotasB, (id) => emp.guardarDatoCuota(form({ id, campo: "factura", valor: "A-0001-00000001" }))],
    ["guardarDatoCuota comentario", cuotasB, (id) => emp.guardarDatoCuota(form({ id, campo: "comentario", valor: "hola" }))],
    ["guardarSaldo", [deB.cuenta], (id) => emp.guardarSaldo(form({ id, saldo: "999" }))],
    ["importarExtracto", [deB.cuenta], (id) => emp.importarExtracto(form({ cuentaId: id, csv: "fecha;descripcion;importe\n05/11/2026;Pago;-100" }))],
    ["conciliarMovimiento (movimiento ajeno)", Object.values(deB.movs), (id) => emp.conciliarMovimiento(form({ id, cuotaId: deA.cuotas.pagada }))],
    ["conciliarMovimiento (cuota ajena)", cuotasB, (id) => emp.conciliarMovimiento(form({ id: deA.movs.suelto, cuotaId: id }))],
    ["desconciliarMovimiento", Object.values(deB.movs), (id) => emp.desconciliarMovimiento(form({ id }))],
    ["guardarGastoFijo", Object.values(deB.fijos), (id) => emp.guardarGastoFijo(form({ id, nombre: "Pisado", monto: "1", frecuencia: "MENSUAL", fecha: "2026-11-01", tipo: "FIJO" }))],
    ["bajaGastoFijo", Object.values(deB.fijos), (id) => emp.bajaGastoFijo(form({ id }))],
    ["pagarLiquidacion", Object.values(deB.liqs), (id) => emp.pagarLiquidacion(form({ id, medio: "TRANSFERENCIA" }))],
    ["borrarLiquidacion", Object.values(deB.liqs), (id) => emp.borrarLiquidacion(form({ id }))],
    ["editarExtrasLiquidacion", Object.values(deB.liqs), (id) => emp.editarExtrasLiquidacion({ id, base: "1", manuales: [] })],
    ["marcarLiquidacionVista", Object.values(deB.liqs), (id) => emp.marcarLiquidacionVista(id)],
  ];

  const antes = await foto();
  for (const [nombre, idsDeB, llamar] of casos) {
    const inventado = await comoA(() => llamar(INVENTADO));
    assert.deepEqual(await foto(), antes, `${nombre}, id inventado: 0 cambios`);
    const valor = inventado.tipo === "respuesta" ? (inventado.valor as { error?: string } | undefined) : undefined;
    if (valor?.error) assert.doesNotMatch(valor.error, AFIRMA_UN_ESTADO, `${nombre}: a un id que no existe no se le afirma un estado`);
    for (const id of idsDeB) {
      const ajeno = await comoA(() => llamar(id));
      assert.deepEqual(ajeno, inventado, `${nombre}: el id de B (${id}) contesta igual que uno inventado`);
      assert.deepEqual(await foto(), antes, `${nombre}, id de B: 0 cambios en A y en B`);
    }
  }

  // Lo propio sigue diciendo su estado.
  const propia = await comoA(() => emp.anularCuotaEmpresa(form({ id: deA.cuotas.anulada })));
  assert.deepEqual(propia.tipo === "respuesta" && propia.valor, { ok: false, error: "Ese pago ya estaba anulado." }, "una cuota propia anulada dice que ya estaba anulada");
  const fijoPropio = await comoA(() => emp.bajaGastoFijo(form({ id: deA.fijos.baja })));
  assert.equal(fijoPropio.tipo === "respuesta" && (fijoPropio.valor as { ok: boolean }).ok, false, "un gasto fijo propio ya dado de baja no se vuelve a dar de baja");
  assert.deepEqual(await foto(), antes, "lo propio: 0 cambios");
});
