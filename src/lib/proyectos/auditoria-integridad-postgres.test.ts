// ============================================================================
// MIA-209 · auditoría de integridad de la plata de MIA (Factory-GSG 00-ESTADO/BRIEF-MIA-209.md), contra Postgres real:
// base efímera migrada, rol app_rls sin BYPASSRLS y las Server Actions reales con sesión. NO ARREGLA NADA: cada
// invariante es un subtest: I* da verde hoy; H* es un hallazgo y da ROJO hasta que se arregle (informe de MIA-209).
//
// Escenario: P1 «Aurora» del plan (Factory-GSG 00-ESTADO/certificacion/PLAN-MIA-50-E2E-VEEDOR.md § 1.1). Esperados
// escritos A MANO antes de correr, en pesos:
//   costo 2.000.000 · precio por total 2.990.000 · IVA 627.900 · con IVA 3.617.900 · dos cuotas de 1.808.950.
//   C1 1.000.000 + IVA 210.000 = 1.210.000 · C2 700.000 (tipo C) · costo real 1.700.000 · a pagar 1.910.000.
//   Banco (cuenta en 0): seña +1.808.950 = 1.808.950 · OP1 −1.210.000 · OP2 −350.000 = 248.950 · cobro del saldo por
//   error +1.808.950 = 2.057.900 · anulado = 248.950 · cobro con retención 54.268,50: entra 1.754.681,50 = 2.003.631,50 ·
//   OP3 −350.000 = 1.653.631,50.
// Reloj: un solo día (20/11/2026, Buenos Aires) que AVANZA entre paso y paso, como pasa de verdad en la oficina.
// ============================================================================

import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";
import { RUBROS } from "./gestion-core";

const laBase = baseEfimeraDelArchivo();
const DIA = 86_400_000;
/** Hora de Buenos Aires del 20/11/2026 → instante. */
const ba = (hhmm: string, dia = "2026-11-20") => Date.parse(`${dia}T${hhmm}:00-03:00`);

test("MIA-209 · Aurora: saldos, reportes y fechas contra la base", async (t) => {
  const base = await laBase(t);
  assert.ok(base, "sin Postgres este test no prueba nada: levantá ERP_TEST_PG_URL");
  mock.timers.enable({ apis: ["Date"], now: ba("08:30") });
  t.after(() => mock.timers.reset());
  const reloj = (hhmm: string, dia?: string) => mock.timers.setTime(ba(hhmm, dia));
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
  const fichaAcc = await import("./acciones-ficha");
  const empresa = await import("./acciones-empresa");
  const comp = await import("./acciones-comprobantes");
  const ordenes = await import("./acciones-orden-pago");
  const { recuadrosDeCuotas } = await import("./empresa.server");
  const { aPagarSinCuotas } = await import("./comprobantes.server");
  const fichaSrv = await import("./ficha.server");
  const { actorActual } = await import("./gestion.server");
  const libroAcc = await import("@/lib/libro-caja-actions");

  const form = (campos: Record<string, string | string[]>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) for (const x of [v].flat()) fd.append(k, x);
    return fd;
  };
  const json = (r: unknown) => JSON.stringify(r, (_k, v) => (typeof v === "bigint" ? Number(v) : v));
  const como = async <R>(usuarioId: string, fn: () => Promise<R>): Promise<R> => {
    const r = await ejecutarAccion({ negocio: a, usuario: { id: usuarioId } }, fn);
    assert.equal(r.tipo, "respuesta", json(r));
    return (r as { valor: R }).valor;
  };
  const direccion = <R>(fn: () => Promise<R>) => como(a.duenia.id, fn);
  const admin = <R>(fn: () => Promise<R>) => como(a.recepcion.id, fn);
  const ok = (r: unknown) => assert.equal((r as { ok: boolean }).ok, true, json(r));
  const enTenant = <R>(fn: (tx: Parameters<Parameters<typeof duenio.$transaction>[0]>[0]) => Promise<R>) =>
    duenio.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${a.id}, true)`;
      return fn(tx);
    });

  // ── Alta y presupuesto (paso 1-3) ──
  const p = await duenio.proyecto.create({
    data: { tenantId: a.id, numero: 9209, clientId: a.clientes[0], nombre: "Aurora (de prueba)", servicio: "EVENTOS", etapa: "PRESUPUESTO", fechaEvento: new Date(ba("12:00", "2026-12-20")), anticipoClientePct: 50 },
    select: { id: true },
  });
  const v1 = await duenio.proyectoPresupuesto.create({ data: { tenantId: a.id, proyectoId: p.id, version: 1, estado: "BORRADOR", token: `tok-aud-${p.id}-xxxxxxxxxx`, ivaPct: 21 }, select: { id: true } });
  const item = (rubro: string, descripcion: string, cantidad: number, costo: number) =>
    duenio.proyectoItem.create({ data: { tenantId: a.id, presupuestoId: v1.id, rubro, descripcion, cantidad, costo }, select: { id: true } });
  await item(RUBROS[0], "Técnica", 4, 150_000);
  const personal = await item(RUBROS[0], "Personal", 1, 10_000);
  await item(RUBROS[1], "Catering", 300, 2_000);
  const { regenerarCuotas } = await import("./gestion.server");
  await regenerarCuotas(a.id, p.id);
  ok(await direccion(() => presupuesto.guardarLineaDetalle(form({ itemId: personal.id, sector: "Producción", categoria: RUBROS[0], puestos: "5", horas: "8", dias: "2" }))));
  ok(await direccion(() => precio.guardarPrecio(form({ proyectoId: p.id, total: "2.990.000" }))));
  const prod = await duenio.proyectoPersona.create({ data: { tenantId: a.id, nombre: "Productor (de prueba)", rol: "PRODUCCION" }, select: { id: true } });
  const com = await duenio.proyectoPersona.create({ data: { tenantId: a.id, nombre: "Comercial (de prueba)", rol: "COMERCIAL" }, select: { id: true } });
  ok(await direccion(() => fichaAcc.asignarEquipo(form({ proyectoId: p.id, personaId: prod.id, funcion: "PRODUCTOR" }))));
  ok(await direccion(() => fichaAcc.asignarEquipo(form({ proyectoId: p.id, personaId: com.id, funcion: "COMERCIAL" }))));
  ok(await direccion(() => fichaAcc.aprobarInterno(form({ id: v1.id }))));
  ok(await direccion(() => fichaAcc.enviarCotizacion(form({ id: v1.id }))));
  ok(await direccion(() => fichaAcc.registrarRespuesta(form({ id: v1.id, respuesta: "APROBADO", nombre: "Contacto Aurora (de prueba)" }))));

  const cuotas = () => duenio.proyectoCuota.findMany({ where: { proyectoId: p.id, tipo: "COBRO", anuladoEl: null }, orderBy: { venceEl: "asc" }, select: { id: true, monto: true, prevista: true, venceEl: true, pagadoEl: true, concepto: true } });
  const plan = await cuotas();
  assert.deepEqual(plan.map((c) => c.monto), [1_808_950, 1_808_950], "2.990.000 × 1,21 ÷ 2");
  const [anticipo, saldoCuota] = plan;

  // ── Lecturas que usan las pantallas ──
  ok(await direccion(() => empresa.crearCuenta(form({ nombre: "Cuenta de prueba", moneda: "ARS", saldo: "0" }))));
  const banco = (await duenio.proyectoCuentaBanco.findFirstOrThrow({ where: { tenantId: a.id, nombre: "Cuenta de prueba" }, select: { id: true } })).id;
  const saldoBanco = async () => (await duenio.proyectoCuentaBanco.findUniqueOrThrow({ where: { id: banco }, select: { saldo: true } })).saldo;
  const libro = () => direccion(() => libroAcc.getLibroCajaData("2026-11"));
  const finanzas = () =>
    direccion(async () => {
      const ac = await actorActual();
      const cab = await fichaSrv.cabeceraFicha(ac, p.id);
      assert.ok(cab, "la cabecera de la ficha");
      return { cab, f: await fichaSrv.datosFinanzas(ac, cab, fichaSrv.vistaDe(ac)) };
    });
  const resumen = async () => (await direccion(() => recuadrosDeCuotas(a.id))).resumen;
  const aPagarProv = async () => [...(await direccion(() => aPagarSinCuotas(a.id))).porProveedor.values()].reduce((s, x) => s + x, 0);
  /** Lo que vio la oficina en el libro después de cada paso: el saldo total que la base tenía en ese momento. */
  const saldosQueExistieron: number[] = [0];
  const anotar = async () => saldosQueExistieron.push(await saldoBanco());

  const cobrar = (cuotaId: string, extra: Record<string, string | string[]> = {}) =>
    admin(() => fichaAcc.marcarCuota(form({ id: cuotaId, medio: "TRANSFERENCIA", cuenta: banco, envio: crypto.randomUUID(), ...extra })));

  // ── Paso 4 · 09:00 la seña ──
  reloj("09:00");
  ok(await cobrar(anticipo.id));
  await anotar();
  const tras4 = { banco: await saldoBanco(), fin: (await finanzas()).f, res: await resumen() };

  // ── Paso 5 · 09:30 C1 y C2 imputados a Aurora ──
  reloj("09:30");
  const s1 = (await duenio.supplier.create({ data: { tenantId: a.id, name: "Proveedor Uno (de prueba)" }, select: { id: true } })).id;
  const s2 = (await duenio.supplier.create({ data: { tenantId: a.id, name: "Proveedor Dos (de prueba)" }, select: { id: true } })).id;
  const cargar = async (supplierId: string, numero: string, tipo: string, neto: string, iva: string, total: string, categoria: string) => {
    const r = await admin(() => comp.cargarComprobante(form({ supplierId, fecha: "2026-11-20", tipo, numero, neto, iva, total, destino: p.id, categoria })));
    ok(r);
    return (r as unknown as { id: string }).id;
  };
  const c1 = await cargar(s1, "0001-00000001", "A", "1000000", "210000", "1210000", RUBROS[0]);
  const c2 = await cargar(s2, "0001-00000002", "C", "700000", "", "700000", RUBROS[1]);
  const tras5 = { fin: await finanzas(), aPagar: await aPagarProv() };

  // ── Paso 6 · 10:00 órdenes 1 y 2, pagadas hoy (el día que propone la pantalla) ──
  reloj("10:00");
  const pagarOrden = async (supplierId: string, comprobanteId: string, importeCentavos: number) => {
    const o = await admin(() => ordenes.crearOrdenPago({ supplierId, medio: "TRANSFERENCIA", lineas: [{ comprobanteId, importeCentavos, cuotaId: null }] }));
    ok(o);
    ok(await direccion(() => ordenes.aprobarYPagarOrden(form({ id: (o as { id: string }).id, cuentaId: banco, fecha: "2026-11-20" }))));
  };
  await pagarOrden(s1, c1, 121_000_000);
  await anotar();
  await pagarOrden(s2, c2, 35_000_000);
  await anotar();
  const tras6 = { banco: await saldoBanco(), res: await resumen(), aPagar: await aPagarProv() };

  // ── Paso 8 · 11:00 cobro del saldo sin retención, por error ──
  reloj("11:00");
  ok(await cobrar(saldoCuota.id));
  await anotar();
  const tras8 = { banco: await saldoBanco(), fin: (await finanzas()).f };
  const pagoErrado = await duenio.proyectoPago.findFirstOrThrow({ where: { proyectoId: p.id, anuladoEl: null }, orderBy: { createdAt: "desc" }, select: { id: true, monto: true } });

  // ── Paso 9 · 11:10 anulación ──
  reloj("11:10");
  ok(await admin(() => fichaAcc.anularCobroFicha(form({ id: pagoErrado.id }))));
  await anotar();
  const tras9 = { banco: await saldoBanco(), fin: (await finanzas()).f, res: await resumen() };

  // ── Paso 10 · 11:20 cobro del saldo con retención de 54.268,50 ──
  reloj("11:20");
  const deMas = await cobrar(saldoCuota.id, { monto: "1808951" });
  ok(await cobrar(saldoCuota.id, { retTipo: "Retención sufrida (sin clasificar)", retImporte: "54268,50", retCertificado: "R-1" }));
  await anotar();
  const tras10 = { banco: await saldoBanco(), fin: (await finanzas()).f };

  // ── Paso 11 · 11:30 orden 3 (saldo de C2) ──
  reloj("11:30");
  await pagarOrden(s2, c2, 35_000_000);
  await anotar();
  const tras11 = { banco: await saldoBanco(), fin: await finanzas(), res: await resumen(), aPagar: await aPagarProv(), libro: await libro() };

  // ── Paso 15 (parte) · 18:00 cierre del día 20/11; con el día cerrado no se cobra ni se paga ese día ──
  const { cerrarDia, getCierreDiarioData } = await import("@/lib/cierre-diario-actions");
  reloj("18:00");
  const caja20 = await direccion(() => getCierreDiarioData("2026-11-20"));
  const cierre = await direccion(() => cerrarDia(form({ day: "2026-11-20", declarado_EFECTIVO: "0", note: "Cierre MIA-209" })));
  reloj("18:05");
  // C3 va a otro proyecto (no cambia la liquidación de Aurora): sólo hace falta algo para pagar con el día cerrado.
  const p2 = await duenio.proyecto.create({ data: { tenantId: a.id, numero: 9210, clientId: a.clientes[0], nombre: "Otro (de prueba)", servicio: "EVENTOS", etapa: "APROBADO" }, select: { id: true } });
  const r3 = await admin(() => comp.cargarComprobante(form({ supplierId: s1, fecha: "2026-11-20", tipo: "A", numero: "0001-00000003", neto: "10000", iva: "2100", total: "12100", destino: p2.id, categoria: RUBROS[0] })));
  ok(r3);
  const c3 = (r3 as unknown as { id: string }).id;
  const o3 = await admin(() => ordenes.crearOrdenPago({ supplierId: s1, medio: "TRANSFERENCIA", lineas: [{ comprobanteId: c3, importeCentavos: 1_210_000, cuotaId: null }] }));
  const o3id = (o3 as { id?: string }).id ?? "";
  const pagoDiaCerrado = await direccion(() => ordenes.aprobarYPagarOrden(form({ id: o3id, cuentaId: banco, fecha: "2026-11-20" })));
  const pagoCobroVivo = await duenio.proyectoPago.findFirstOrThrow({ where: { proyectoId: p.id, anuladoEl: null, medio: "TRANSFERENCIA" }, orderBy: { createdAt: "desc" }, select: { id: true } });
  const anularDiaCerrado = await admin(() => fichaAcc.anularCobroFicha(form({ id: pagoCobroVivo.id })));
  const bancoTrasCierre = await saldoBanco();
  // Al otro día, el pago con fecha del día cerrado (atrasado) también se rechaza.
  reloj("09:00", "2026-11-21");
  const pagoAtrasado = await direccion(() => ordenes.aprobarYPagarOrden(form({ id: o3id, cuentaId: banco, fecha: "2026-11-20" })));
  const bancoTrasAtrasado = await saldoBanco();

  // ── Fin de mes: la orden pagada el 30/11 a las 23:30 de Buenos Aires (02:30 UTC del 1/12) es de noviembre ──
  reloj("23:30", "2026-11-30");
  const pagoFinDeMes = await direccion(() => ordenes.aprobarYPagarOrden(form({ id: o3id, cuentaId: banco })));
  const libroNov = await libro();
  const libroDic = await direccion(() => libroAcc.getLibroCajaData("2026-12"));
  const caja30 = await direccion(() => getCierreDiarioData("2026-11-30"));

  // ── Paso 13 · terminado el evento (21/12), Administración declara los costos completos ──
  reloj("10:00", "2026-12-21");
  const declarar = await admin(async () => (await import("./acciones-liquidacion-proyecto")).declararCostosCompletos(form({ proyectoId: p.id })));
  const liq = await enTenant((tx) => tx.proyectoLiquidacionProyecto.findFirst({ where: { proyectoId: p.id }, include: { lineas: true } }));

  // A-06 para la orden de pago: borrar desde el libro el egreso de la OP del 30/11 (día abierto).
  const egresoOp = await duenio.cashMovement.findFirstOrThrow({ where: { tenantId: a.id, amount: 12_100 }, select: { id: true } });
  const borrarOp = await direccion(() => libroAcc.deleteLibroEntry({ ok: false } as never, form({ id: egresoOp.id })));
  const libroNovTrasBorrar = await libro();
  const bancoTrasBorrar = await saldoBanco();
  const { rotuloDeOrigen } = await import("@/lib/caja/libro-caja");

  // ═══════════ INVARIANTES (verde = se cumple; rojo = hallazgo) ═══════════
  const n = (x: unknown) => Number(x);
  await t.test("I1 · banco = esperado a mano en cada paso y = neto del libro y de Caja del día (Transferencia)", () => {
    assert.deepEqual(saldosQueExistieron, [0, 1_808_950, 598_950, 248_950, 2_057_900, 248_950, 2_003_631.5, 1_653_631.5]);
    assert.equal(tras11.libro.summary.saldo.TRANSFERENCIA, 1_653_631.5);
    assert.equal(caja20.preview.porMedio.TRANSFERENCIA.expected, 1_653_631.5, "Caja del día 20/11");
  });
  await t.test("I2 · cobrado y falta = cobros no anulados; anular deja todo como antes; cobrar de más se rechaza", () => {
    assert.deepEqual([tras4.fin.cobrado, tras4.fin.saldo, tras4.res.aCobrar], [1_808_950, 1_808_950, 1_808_950]);
    assert.deepEqual([tras8.banco, tras8.fin.cobrado], [2_057_900, 3_617_900]);
    assert.deepEqual([tras9.banco, tras9.fin.cobrado, tras9.fin.saldo, tras9.res.aCobrar, tras9.res.aPagar], [tras6.banco, tras6.res.cobrado, 1_808_950, tras6.res.aCobrar, tras6.res.aPagar]);
    assert.equal((deMas as { ok: boolean }).ok, false);
    assert.deepEqual([tras10.banco, tras10.fin.cobrado, tras10.fin.saldo], [2_003_631.5, 3_617_900, 0]);
  });
  await t.test("I3a · A cobrar / A pagar / costo real contra la base", () => {
    assert.equal(tras5.aPagar, 1_910_000);
    assert.equal(tras5.fin.f.real.costoReal, 1_700_000);
    assert.equal(tras5.fin.f.real.gananciaReal, 1_290_000);
    assert.deepEqual([tras6.aPagar, tras6.res.aCobrar], [350_000, 1_808_950]);
    assert.deepEqual([tras11.aPagar, tras11.res.aCobrar, tras11.res.aPagar], [0, 0, 0]);
    assert.equal(tras11.fin.f.real.porPagar, 0, "Finanzas «Por pagar» con todo pagado");
  });
  await t.test("H1 [reporte] · Libro de caja: el saldo corrido sólo muestra saldos que existieron", () => {
    // OP1 y OP2 se pagaron a las 10:00 y la OP3 a las 11:30 con «Día del pago» = hoy: el asiento queda a las 12:00
    // (acciones-orden-pago.ts:231 y :278), detrás de los cobros de las 11:00 y 11:20. El corrido muestra 3.617.900.
    const corrido = tras11.libro.rows.map((r) => r.runningTotal);
    assert.deepEqual(corrido.filter((x) => !saldosQueExistieron.includes(x)), [], `corrido ${json(corrido)}`);
  });
  await t.test("H2 [reporte] · Cashflow del evento: con C1 y C2 imputados, el saldo final descuenta lo que se les paga", () => {
    // datosFinanzas (ficha.server.ts:241) arma el flujo sólo con cuotas: los comprobantes y sus órdenes no entran.
    assert.equal(tras5.fin.f.flujo.saldoFinal, 3_617_900 - 1_910_000, "3.617.900 − 1.910.000");
  });
  await t.test("H3 [texto] · «ítems con costo sin proveedor: no están en este cashflow» no cuenta lo ya imputado", () => {
    // costoSinProveedor (gestion-core.ts:222) mira sólo el supplierId del ítem: con 1.700.000 imputados sigue en 2.000.000.
    assert.ok(tras5.fin.cab.sinProveedor.monto <= 2_000_000 - 1_700_000, `dice ${tras5.fin.cab.sinProveedor.monto}`);
  });
  await t.test("H4 [texto] · Caja del día (CajaRenglon.tsx:252, sin «borrable» desde cierre-diario-actions.ts:539): nada de lo que asentó Proyectos dice «cargado a mano»", () => {
    const rotulos = caja20.movements.map((m) => [m.detail, rotuloDeOrigen(m)]);
    assert.deepEqual(rotulos.filter(([, r]) => r === "cargado a mano"), [], json(rotulos));
  });
  await t.test("I5 · A-06: el egreso de una orden de pago no se borra desde el libro", () => {
    assert.equal((borrarOp as { ok: boolean }).ok, false, json(borrarOp));
    assert.equal(libroNovTrasBorrar.summary.saldo.TRANSFERENCIA, bancoTrasBorrar, "libro = banco");
  });
  await t.test("I4 · calendario: día cerrado rechaza pagar (hoy y atrasado) y anular; fin de mes en BA; vencimientos", () => {
    assert.equal((cierre as { ok: boolean }).ok, true);
    assert.match((pagoDiaCerrado as { error?: string }).error ?? "", /ya está cerrada/);
    assert.match((anularDiaCerrado as { error?: string }).error ?? "", /ya está cerrada/);
    assert.match((pagoAtrasado as { error?: string }).error ?? "", /ya está cerrada/);
    assert.deepEqual([bancoTrasCierre, bancoTrasAtrasado], [1_653_631.5, 1_653_631.5]);
    ok(pagoFinDeMes);
    assert.equal(libroNov.summary.saldo.TRANSFERENCIA, 1_653_631.5 - 12_100, "la OP del 30/11 23:30 es de noviembre");
    assert.deepEqual(libroDic.rows, []);
    assert.deepEqual(caja30.movements.map((m) => [m.day, m.amount]), [["2026-11-30", 12_100]]);
    // Seña: vence el día de la aprobación; saldo: 5 días antes del evento (20/12). Días de Buenos Aires.
    const dia = (d: Date) => new Date(d.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
    assert.deepEqual([dia(anticipo.venceEl), dia(saldoCuota.venceEl)], ["2026-11-20", "2026-12-15"]);
  });
  await t.test("I3b · liquidación = la cuenta a mano (productor 135.000 · comercial 60.000 · MIA 1.095.000 = 1.290.000)", () => {
    ok(declarar);
    assert.ok(liq);
    assert.equal(n(liq.totalVenta) - n(liq.costoReal), 129_000_000);
    const total = Object.fromEntries(liq.lineas.map((l) => [l.funcion, n(l.total) / 100]));
    assert.deepEqual(total, { PRODUCTOR: 135_000, COMERCIAL: 60_000, EMPRESA: 1_095_000 });
  });
});

// MIA-210 · S1 (Factory-GSG 00-ESTADO/informes/MIA-210-patrones-errores.md § Parte 2), pedido por ORQ-007: «Anular» una
// cuota de EMPRESA que pagó una orden de pago. Esperado a mano: banco 500.000 → orden de 100.000 → 400.000. Anular la
// cuota tiene que dejar todo coherente: o se rechaza (la corrige anular la orden), o la cuota pendiente viene con la orden
// anulada, el egreso revertido y el banco en 500.000. Nunca «la plata volvió a la caja» con la plata afuera.
test("MIA-210 S1 · anular una cuota de empresa pagada por una orden de pago", async (t) => {
  const base = await laBase(t);
  assert.ok(base, "sin Postgres este test no prueba nada: levantá ERP_TEST_PG_URL");
  mock.timers.enable({ apis: ["Date"], now: ba("10:00", "2026-11-25") });
  t.after(() => mock.timers.reset());
  apuntarLaAppA(base);
  Object.assign(process.env as Record<string, string | undefined>, { NODE_ENV: "development", DB_CONNECTION_LIMIT: "12", DB_CONNECT_TIMEOUT_MS: "5000" });
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { b } = base;
  const t0 = await duenio.tenant.findUniqueOrThrow({ where: { id: b.id }, select: { modules: true } });
  await duenio.tenant.update({ where: { id: b.id }, data: { modules: [...new Set([...t0.modules, "proyectos"])] } });
  await duenio.proyectoPersona.create({ data: { tenantId: b.id, userId: b.recepcion.id, nombre: "Administración B", rol: "ADMINISTRACION" } });
  const empresa = await import("./acciones-empresa");
  const comp = await import("./acciones-comprobantes");
  const ordenes = await import("./acciones-orden-pago");
  const { recuadrosDeCuotas } = await import("./empresa.server");
  const form = (campos: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    return fd;
  };
  const json = (r: unknown) => JSON.stringify(r, (_k, v) => (typeof v === "bigint" ? Number(v) : v));
  const como = async <R>(usuarioId: string, fn: () => Promise<R>): Promise<R> => {
    const r = await ejecutarAccion({ negocio: b, usuario: { id: usuarioId } }, fn);
    assert.equal(r.tipo, "respuesta", json(r));
    return (r as { valor: R }).valor;
  };
  const direccion = <R>(fn: () => Promise<R>) => como(b.duenia.id, fn);
  const admin = <R>(fn: () => Promise<R>) => como(b.recepcion.id, fn);
  const ok = (r: unknown) => assert.equal((r as { ok: boolean }).ok, true, json(r));

  ok(await direccion(() => empresa.crearCuenta(form({ nombre: "Banco B", moneda: "ARS", saldo: "500000" }))));
  const banco = (await duenio.proyectoCuentaBanco.findFirstOrThrow({ where: { tenantId: b.id, nombre: "Banco B" }, select: { id: true } })).id;
  const saldo = async () => (await duenio.proyectoCuentaBanco.findUniqueOrThrow({ where: { id: banco }, select: { saldo: true } })).saldo;
  const s = (await duenio.supplier.create({ data: { tenantId: b.id, name: "Alquiler (de prueba)" }, select: { id: true } })).id;
  const cuota = (await duenio.proyectoCuota.create({ data: { tenantId: b.id, proyectoId: null, tipo: "PAGO", concepto: "Alquiler de noviembre", monto: 100_000, moneda: "ARS", venceEl: new Date(ba("12:00", "2026-11-30")), auto: false, supplierId: s }, select: { id: true } })).id;
  const r = await admin(() => comp.cargarComprobante(form({ supplierId: s, fecha: "2026-11-25", tipo: "C", numero: "0001-00000099", neto: "100000", iva: "", total: "100000", destino: "ADMINISTRACION", categoria: "Alquiler" })));
  ok(r);
  const c = (r as unknown as { id: string }).id;
  ok(await admin(() => comp.enlazarCuota(form({ comprobanteId: c, cuotaId: cuota }))));
  const o = await admin(() => ordenes.crearOrdenPago({ supplierId: s, medio: "TRANSFERENCIA", lineas: [{ comprobanteId: c, cuotaId: cuota, importeCentavos: 10_000_000 }] }));
  ok(o);
  const oid = (o as { id: string }).id;
  ok(await direccion(() => ordenes.aprobarYPagarOrden(form({ id: oid, cuentaId: banco, fecha: "2026-11-25" }))));
  assert.equal(await saldo(), 400_000, "500.000 − 100.000");
  const aPagarPagada = (await direccion(() => recuadrosDeCuotas(b.id))).resumen.aPagar;

  const anular = await direccion(() => empresa.anularCuotaEmpresa(form({ id: cuota, visto: "PAGADA" })));
  const q = await duenio.proyectoCuota.findUniqueOrThrow({ where: { id: cuota }, select: { pagadoEl: true, anuladoEl: true } });
  const orden = await duenio.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${b.id}, true)`;
    return tx.proyectoOrdenPago.findUniqueOrThrow({ where: { id: oid }, select: { estado: true } });
  });
  const libroNeto = (await duenio.cashMovement.findMany({ where: { tenantId: b.id }, select: { type: true, amount: true } })).reduce((x, m) => x + (m.type === "EGRESO" ? -m.amount : m.amount), 0);
  const aPagarDespues = (await direccion(() => recuadrosDeCuotas(b.id))).resumen.aPagar;
  const foto = { anular, cuotaPendiente: q.pagadoEl === null && q.anuladoEl === null, orden: orden.estado, banco: await saldo(), libroNeto, aPagarPagada, aPagarDespues };

  await t.test("S1a [plata] · la cuota no queda pendiente con su orden PAGADA y la plata afuera (acciones-empresa.ts:199-206)", () => {
    if ((anular as { ok: boolean }).ok) {
      // Si se acepta, todo vuelve: orden anulada, banco y libro como antes, «A pagar» con la deuda una sola vez.
      assert.deepEqual([foto.orden, foto.banco, foto.libroNeto], ["ANULADA", 500_000, 0], json(foto));
    } else {
      assert.deepEqual([foto.cuotaPendiente, foto.orden, foto.banco], [false, "PAGADA", 400_000], json(foto));
    }
  });
  await t.test("S1b [reporte] · «A pagar» no vuelve a sumar una deuda que la orden ya pagó", () => {
    assert.equal(foto.aPagarDespues, foto.aPagarPagada, json(foto));
  });
  await t.test("S1c [texto] · el aviso no dice «la plata volvió a la caja» si no volvió", () => {
    const listo = (anular as { listo?: string }).listo ?? "";
    if (/volvió a la caja/.test(listo)) assert.equal(foto.banco, 500_000, `${listo} · banco ${foto.banco}`);
  });
});
