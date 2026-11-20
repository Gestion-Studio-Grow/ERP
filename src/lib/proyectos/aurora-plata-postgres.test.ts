// ============================================================================
// MIA-199 · el recorrido «Aurora» del veedor (Factory-GSG 00-ESTADO/certificacion/e2e-veedor/P1.md), contra Postgres
// real: base efímera con todas las migraciones, rol app_rls sin BYPASSRLS y las Server Actions reales con sesión.
// Esperados escritos a mano ANTES de correr. Importes en pesos.
//
//  Costo de Aurora: Técnica 4 × 150.000 = 600.000 · Personal (1 → 5 puestos × 8 h × 2 días = 80) × 10.000 · Catering
//  300 × 2.000 = 600.000. Recargo del negocio 35 %, IVA 21 %, anticipo del cliente 50 % → 2 cuotas previstas.
//  P1-1   antes de la línea: costo 1.210.000 → venta 1.633.500 → con IVA 1.976.535 → 988.267,50 por cuota.
//         con la línea (80 h): costo 2.000.000 → venta 2.700.000 → con IVA 3.267.000 → 1.633.500 por cuota.
//  P3-1   precio por total 2.990.000 → con IVA 3.617.900 → 1.808.950 por cuota.
//  P3-2 · P5-2  aprobada con la foto de 2.990.000 y 1.700.000 de comprobantes (1.000.000 + IVA y 700.000 tipo C):
//         ganancia real 2.990.000 − 1.700.000 = 1.290.000 (no 2.700.000 − 1.700.000 = 1.000.000).
//  P5-1   los dos comprobantes, sin cuotas: «A pagar» sube 1.210.000 + 700.000 = 1.910.000; el proveedor debe eso.
//  P6     banco con 1.808.950 (el anticipo): pagar la orden de 1.210.000 por transferencia → 598.950, con el día elegido;
//         350.000 a cuenta del segundo → 248.950; anular esa orden → 598.950. Sin elegir cuenta, no se paga.
//  P4-3   con esos movimientos el saldo ya no se escribe a mano; una cuenta sin movimientos, sí.
// Reloj fijado: `Date` vale AHORA (19/11/2026 15:00 en Buenos Aires).
// ============================================================================

import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";
import { RUBROS } from "./gestion-core";

const laBase = baseEfimeraDelArchivo();
const DIA = 86_400_000;
const AHORA = Date.parse("2026-11-19T18:00:00Z");

test("Aurora · previstas, ganancia, a pagar, pago desde la cuenta y saldo con movimientos", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  mock.timers.enable({ apis: ["Date"], now: AHORA });
  t.after(() => mock.timers.reset());
  apuntarLaAppA(base);
  Object.assign(process.env as Record<string, string | undefined>, { NODE_ENV: "development", DB_CONNECTION_LIMIT: "12", DB_CONNECT_TIMEOUT_MS: "5000" });
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a } = base;
  const t0 = await duenio.tenant.findUniqueOrThrow({ where: { id: a.id }, select: { modules: true } });
  await duenio.tenant.update({ where: { id: a.id }, data: { modules: [...new Set([...t0.modules, "proyectos"])] } });
  await duenio.proyectoPersona.create({ data: { tenantId: a.id, userId: a.recepcion.id, nombre: "Administración Aurora", rol: "ADMINISTRACION" } });

  const presupuesto = await import("./acciones-presupuesto");
  const precio = await import("./acciones-precio");
  const empresa = await import("./acciones-empresa");
  const comp = await import("./acciones-comprobantes");
  const ordenes = await import("./acciones-orden-pago");
  const datos = await import("./datos.server");
  const { recuadrosDeCuotas } = await import("./empresa.server");
  const { aPagarSinCuotas } = await import("./comprobantes.server");

  const form = (campos: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    return fd;
  };
  const como = async <R>(usuarioId: string, fn: () => Promise<R>): Promise<R> => {
    const r = await ejecutarAccion({ negocio: a, usuario: { id: usuarioId } }, fn);
    assert.equal(r.tipo, "respuesta", JSON.stringify(r, (_k, v) => (typeof v === "bigint" ? Number(v) : v)));
    return (r as { valor: R }).valor;
  };
  const direccion = <R>(fn: () => Promise<R>) => como(a.duenia.id, fn);
  const admin = <R>(fn: () => Promise<R>) => como(a.recepcion.id, fn);
  const ok = (r: unknown) => assert.equal((r as { ok: boolean }).ok, true, JSON.stringify(r));

  // ── Aurora: evento a 60 días, sin confirmar, versión en borrador, anticipo del cliente 50 % ──
  const p = await duenio.proyecto.create({
    data: { tenantId: a.id, numero: 9199, clientId: a.clientes[0], nombre: "Aurora", servicio: "EVENTOS", etapa: "PRESUPUESTO", fechaEvento: new Date(AHORA + 60 * DIA), anticipoClientePct: 50 },
    select: { id: true },
  });
  const v1 = await duenio.proyectoPresupuesto.create({ data: { tenantId: a.id, proyectoId: p.id, version: 1, estado: "BORRADOR", token: `tok-aurora-${p.id}-xxxxxxxxxx`, ivaPct: 21 }, select: { id: true } });
  const item = (rubro: string, descripcion: string, cantidad: number, costo: number) =>
    duenio.proyectoItem.create({ data: { tenantId: a.id, presupuestoId: v1.id, rubro, descripcion, cantidad, costo }, select: { id: true } });
  await item(RUBROS[0], "Técnica", 4, 150_000);
  const personal = await item(RUBROS[0], "Personal de armado", 1, 10_000);
  await item(RUBROS[1], "Catering", 300, 2_000);
  const previstas = async () =>
    (await duenio.proyectoCuota.findMany({ where: { proyectoId: p.id, tipo: "COBRO", anuladoEl: null }, orderBy: { venceEl: "asc" }, select: { monto: true, prevista: true } })).map((c) => c.monto);
  // Primer guardado de la cotización: arma el plan con los renglones como están.
  const { regenerarCuotas } = await import("./gestion.server");
  await regenerarCuotas(a.id, p.id);
  assert.deepEqual(await previstas(), [988_267.5, 988_267.5], "1.210.000 × 1,35 × 1,21 / 2");

  // ── P1-1: puestos × horas × días pasa la línea de 1 a 80: las previstas se rehacen al guardarla ──
  ok(await direccion(() => presupuesto.guardarLineaDetalle(form({ itemId: personal.id, sector: "Producción", categoria: RUBROS[0], puestos: "5", horas: "8", dias: "2" }))));
  assert.deepEqual(await previstas(), [1_633_500, 1_633_500], "2.000.000 × 1,35 × 1,21 / 2");

  // ── P3-1: el precio por total (2.990.000) manda en las previstas apenas se guarda ──
  ok(await direccion(() => precio.guardarPrecio(form({ proyectoId: p.id, total: "2.990.000" }))));
  assert.deepEqual(await previstas(), [1_808_950, 1_808_950], "2.990.000 × 1,21 / 2");

  // ── P5-1: dos comprobantes cargados sin cuotas ya cuentan en «A pagar» y en lo que se le debe al proveedor ──
  const s = (await duenio.supplier.create({ data: { tenantId: a.id, name: "Proveedor Aurora" }, select: { id: true } })).id;
  const aPagarAntes = (await direccion(() => recuadrosDeCuotas(a.id))).resumen.aPagar;
  const cargar = async (numero: string, neto: string, iva: string, total: string, tipo: string) => {
    const r = await direccion(() => comp.cargarComprobante(form({ supplierId: s, fecha: "2026-11-15", tipo, numero, neto, iva, total, destino: p.id, categoria: "Catering" })));
    ok(r);
    return (r as unknown as { id: string }).id;
  };
  const c1 = await cargar("0001-00000001", "1000000", "210000", "1210000", "A");
  const c2 = await cargar("0001-00000002", "700000", "0", "700000", "C");
  assert.equal((await direccion(() => recuadrosDeCuotas(a.id))).resumen.aPagar - aPagarAntes, 1_910_000, "1.210.000 + 700.000");
  assert.equal((await direccion(() => aPagarSinCuotas(a.id))).porProveedor.get(s), 1_910_000);

  // ── P3-2 · P5-2: aprobada con la foto de 2.990.000, la ganancia real sale del precio vendido ──
  await duenio.proyectoPresupuesto.update({ where: { id: v1.id }, data: { estado: "APROBADO" } });
  await duenio.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${a.id}, true)`;
    await tx.proyectoPrecioFoto.create({
      data: { tenantId: a.id, proyectoId: p.id, presupuestoId: v1.id, version: 1, modo: "POR_TOTAL", moneda: "ARS", ivaPct: 21, costoOriginalCentavos: BigInt(200_000_000), adicionalesCentavos: BigInt(0), subtotalCentavos: BigInt(270_000_000), iibGaCentavos: BigInt(0), totalVentaCentavos: BigInt(299_000_000), redondeoBrutoCentavos: BigInt(29_000_000), redondeoNetoCentavos: BigInt(29_000_000), parametros: {}, participantes: [], aprobadoPor: "Dirección" },
    });
  });
  const ficha = (await direccion(() => datos.fichaProyecto(p.id)))!;
  assert.equal(ficha.real.costoReal, 1_700_000, "1.000.000 + 700.000, sin IVA");
  assert.equal(ficha.real.gananciaReal, 1_290_000, "2.990.000 − 1.700.000");

  // ── P6: la orden por transferencia sale de la cuenta elegida, con el día del pago; anularla la devuelve ──
  const crearCuenta = async (nombre: string, saldo: string) => {
    ok(await direccion(() => empresa.crearCuenta(form({ nombre, moneda: "ARS", saldo }))));
    return (await duenio.proyectoCuentaBanco.findFirstOrThrow({ where: { tenantId: a.id, nombre }, select: { id: true } })).id;
  };
  const banco = await crearCuenta("Banco Aurora", "1808950");
  const saldo = async (id = banco) => (await duenio.proyectoCuentaBanco.findUniqueOrThrow({ where: { id }, select: { saldo: true } })).saldo;
  const orden = async (lineas: { comprobanteId: string; importeCentavos: number }[]) => {
    const o = await direccion(() => ordenes.crearOrdenPago({ supplierId: s, medio: "TRANSFERENCIA", lineas: lineas.map((l) => ({ ...l, cuotaId: null })) }));
    ok(o);
    return (o as { id: string }).id;
  };
  const o1 = await orden([{ comprobanteId: c1, importeCentavos: 121_000_000 }]);
  const sinCuenta = await admin(() => ordenes.aprobarYPagarOrden(form({ id: o1, fecha: "2026-11-18" })));
  assert.equal((sinCuenta as { error?: string }).error, "Elegí la cuenta de la que sale el pago.");
  assert.equal(await saldo(), 1_808_950, "sin cuenta no se paga nada");
  ok(await admin(() => ordenes.aprobarYPagarOrden(form({ id: o1, cuentaId: banco, fecha: "2026-11-18" }))));
  assert.equal(await saldo(), 598_950, "1.808.950 − 1.210.000");
  const pagada = await duenio.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${a.id}, true)`;
    return tx.proyectoOrdenPago.findUniqueOrThrow({ where: { id: o1 }, select: { estado: true, pagadaEl: true } });
  });
  assert.deepEqual([pagada.estado, pagada.pagadaEl?.toISOString()], ["PAGADA", "2026-11-18T15:00:00.000Z"], "el día que se eligió");
  const o2 = await orden([{ comprobanteId: c2, importeCentavos: 35_000_000 }]);
  ok(await admin(() => ordenes.aprobarYPagarOrden(form({ id: o2, cuentaId: banco, fecha: "2026-11-19" }))));
  assert.equal(await saldo(), 248_950, "598.950 − 350.000");
  assert.equal((await direccion(() => aPagarSinCuotas(a.id))).porProveedor.get(s), 350_000, "le falta la mitad del segundo");
  ok(await admin(() => ordenes.anularOrden(form({ id: o2 }))));
  assert.equal(await saldo(), 598_950, "anular devuelve los 350.000 a la cuenta");

  // ── P4-3: con movimientos el saldo no se escribe a mano; una cuenta nueva, sin movimientos, sí ──
  const aMano = await direccion(() => empresa.guardarSaldo(form({ id: banco, saldo: "5000000" })));
  assert.equal(aMano.ok, false);
  assert.match((aMano as { error?: string }).error ?? "", /ya tiene cobros o pagos/);
  assert.equal(await saldo(), 598_950, "el rechazo no toca el saldo");
  const caja2 = await crearCuenta("Banco sin movimientos", "100");
  ok(await direccion(() => empresa.guardarSaldo(form({ id: caja2, saldo: "250" }))));
  assert.equal(await saldo(caja2), 250);
});
