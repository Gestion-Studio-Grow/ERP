// ============================================================================
// MIA-50 T10 · liquidación del proyecto I (O19-O23) contra Postgres real: base efímera migrada (M5 incluida), la app como
// `app_rls` y las Server Actions reales con sesión. Esperados escritos a mano ANTES de correr, del escenario Z (plan § 2),
// en pesos (los centavos son × 100):
//
//  Z      CO 1.000.000 · R 300.000 · comisión productor 30.000 · comercial 30.000 · margen 65.000 · total 1.490.000 ·
//         redondeo bruto 65.000 · comprobante imputado 900.000 → defensa 100.000 (productor 25 % = 25.000).
//         Productor 25.000 + 30.000 = 55.000 · comercial 30.000 · empresa 75.000 + 65.000 + 65.000 + 300.000 = 505.000.
//         Suma 590.000 = 1.490.000 − 900.000.
//  RLS    Con el negocio B: 0 filas de las 4 tablas de M5; insertar con el tenantId de A, rechazado.
//  C-O19  Evento en curso, real 900.000: el productor recibe 1 fila, 55.000; en la respuesta no está el comercial, ni
//         505.000 (empresa), ni el total de venta.
//         Se imputa otro comprobante de 100.000: real 1.000.000, defensa 0 → productor 0 + 30.000 = 30.000.
//  C-O20  Comercial declara: rechazo. Evento sin terminar: rechazo. Rendición pendiente: rechazo que la nombra.
//         3 declaraciones a la vez: 1 cabecera, 3 líneas (55.000 · 30.000 · 505.000), suma 590.000.
//  C-O21  Gasto sin comprobante de 10.000: real 910.000 contra comprobantes 900.000 → sin nota, rechazo; con nota, revisada
//         y con autor. Revisor que está en el equipo: rechazo. Esa liquidación: productor 22.500 + 30.000 = 52.500;
//         empresa 67.500 + 430.000 = 497.500; comercial 30.000; suma 580.000 = 1.490.000 − 910.000.
//  C-O22  Sin código: rechazo. 1 centavo de descuadre forzado: no aprueba. 4 aprobaciones a la vez (4 códigos de respaldo
//         válidos): 1 aprobada y 1 renglón de historial. Aprobar mientras entra un comprobante de 50.000: 1 aprobada, las
//         líneas siguen en Z y el comprobante queda «para ajuste» (5.000.000 centavos).
//  C-O23  Cobrado 1.000.000 de 1.802.900: generar el mes no suma la línea del proyecto y lo dice. Se cobra 802.900: 1 línea
//         por persona («Proyecto · …»): productor 55.000, comercial 30.000. Generar dos veces: sigue 1. Publicar y pagar al
//         productor: 1 egreso de 55.000.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";

const laBase = baseEfimeraDelArchivo();
const $ = (pesos: number) => pesos * 100;
const PASADO = new Date("2026-11-01T12:00:00-03:00");
const FUTURO = new Date("2027-12-01T12:00:00-03:00");

let preparado: ReturnType<typeof armar> | null = null;
async function armar(base: BaseEfimera) {
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a, b } = base;
  for (const n of [a, b]) {
    const t0 = await duenio.tenant.findUniqueOrThrow({ where: { id: n.id }, select: { modules: true } });
    await duenio.tenant.update({ where: { id: n.id }, data: { modules: [...new Set([...t0.modules, "proyectos"])] } });
  }
  const acc = await import("./acciones-liquidacion-proyecto");
  const empresa = await import("./acciones-empresa");
  const lectura = await import("./liquidacion-proyecto.server");
  const sf = await import("./segundo-factor.server");
  const sfc = await import("./segundo-factor-core");
  const { tenantTransaction } = await import("@/lib/rls");

  const persona = async (nombre: string, rol: string) => {
    const u = await duenio.user.create({ data: { tenantId: a.id, name: nombre, email: `${nombre.toLowerCase()}@mia50t10.test`, passwordHash: "x", role: "RECEPTION" }, select: { id: true } });
    const p = await duenio.proyectoPersona.create({ data: { tenantId: a.id, userId: u.id, nombre, email: `${nombre.toLowerCase()}@mia50t10.test`, rol }, select: { id: true } });
    return { userId: u.id, personaId: p.id };
  };
  const prod = await persona("Productora", "PRODUCCION");
  const com = await persona("Comercial", "COMERCIAL");
  const admin = await persona("Administra", "ADMINISTRACION");
  const admin2 = await persona("Adminequipo", "ADMINISTRACION");
  const dir = a.duenia.id;

  const como = async <R>(usuarioId: string, fn: () => Promise<R>) => {
    try {
      return await ejecutarAccion({ negocio: a, usuario: { id: usuarioId } }, fn);
    } catch (e) {
      return { tipo: "error" as const, mensaje: e instanceof Error ? e.message : String(e) };
    }
  };
  const valor = <R>(s: Awaited<ReturnType<typeof como<R>>>): R => {
    assert.equal(s.tipo, "respuesta", JSON.stringify(s, (_k, v) => (typeof v === "bigint" ? Number(v) : v)));
    return (s as { valor: R }).valor;
  };
  const form = (campos: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) f.set(k, v);
    return f;
  };
  type Tx = Parameters<Parameters<typeof duenio.$transaction>[0]>[0];
  const enA = <R>(fn: (tx: Tx) => Promise<R>) =>
    duenio.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${a.id}, true)`;
      return fn(tx);
    });
  const prov = await duenio.supplier.create({ data: { tenantId: a.id, name: "Proveedor T10" }, select: { id: true } });
  let sig = 0;
  const comprobante = async (proyectoId: string, pesos: number) => {
    const numero = `0010-${String(++sig).padStart(8, "0")}`;
    const c = await enA((tx) => tx.proyectoComprobante.create({ data: { tenantId: a.id, supplierId: prov.id, tipo: "C", numero, fecha: PASADO, netoCentavos: BigInt($(pesos)), totalCentavos: BigInt($(pesos)), cargadoPorId: dir, cargadoNombre: "Test" }, select: { id: true } }));
    await enA((tx) => tx.proyectoComprobanteLinea.create({ data: { tenantId: a.id, comprobanteId: c.id, destino: "PROYECTO", proyectoId, categoria: "Producción", netoCentavos: BigInt($(pesos)), ivaTratamiento: "COSTO", costoCentavos: BigInt($(pesos)) } }));
  };
  const cobrar = (proyectoId: string, pesos: number) => duenio.proyectoPago.create({ data: { tenantId: a.id, proyectoId, medio: "TRANSFERENCIA", monto: pesos } });

  let numero = (await duenio.proyecto.count()) + 1000;
  /** Un proyecto Z: foto del precio aprobado, equipo, el comprobante de 900.000, lo facturado y lo cobrado. */
  const z = async (o: { evento?: Date; facturado?: number; cobrado?: number; gasto?: number; rendicion?: boolean; conAdmin2?: boolean } = {}) => {
    const nombre = `Z ${++numero}`;
    const p = await duenio.proyecto.create({ data: { tenantId: a.id, numero, clientId: a.clientes[0], nombre, servicio: "EVENTOS", etapa: "APROBADO", brief: "Stand", responsable: "Comercial", fechaEvento: o.evento ?? PASADO }, select: { id: true } });
    const pres = await duenio.proyectoPresupuesto.create({ data: { tenantId: a.id, proyectoId: p.id, version: 1, estado: "APROBADO", token: `t10-${p.id}`, ivaPct: 21 }, select: { id: true } });
    await duenio.proyectoItem.create({ data: { tenantId: a.id, presupuestoId: pres.id, rubro: "General", descripcion: "Stand", cantidad: 1, precio: 1_490_000 } });
    const equipo = [{ ...prod, funcion: "PRODUCTOR" }, { ...com, funcion: "COMERCIAL" }, ...(o.conAdmin2 ? [{ ...admin2, funcion: "PRODUCTOR" }] : [])];
    const eqs = [];
    for (const m of equipo) eqs.push(await duenio.proyectoEquipo.create({ data: { tenantId: a.id, proyectoId: p.id, personaId: m.personaId, funcion: m.funcion }, select: { id: true } }));
    const participantes = [
      { equipoId: eqs[0].id, personaId: prod.personaId, nombre: "Productora", funcion: "PRODUCTOR", comisionPct: 10, reparto: { DEFENSA: 25 } },
      { equipoId: eqs[1].id, personaId: com.personaId, nombre: "Comercial", funcion: "COMERCIAL", comisionPct: 10, reparto: { DEFENSA: 0 } },
      { equipoId: null, personaId: null, nombre: "Empresa", funcion: "EMPRESA", comisionPct: 0, reparto: { DEFENSA: 75, REDONDEO: 100 } },
    ];
    await enA((tx) => tx.proyectoPrecioFoto.create({
      data: {
        tenantId: a.id, proyectoId: p.id, presupuestoId: pres.id, version: 1, modo: "POR_TOTAL", moneda: "ARS", ivaPct: 21,
        costoOriginalCentavos: BigInt($(1_000_000)), adicionalesCentavos: BigInt(0), subtotalCentavos: BigInt($(1_425_000)), iibGaCentavos: BigInt(0),
        totalVentaCentavos: BigInt($(1_490_000)), redondeoBrutoCentavos: BigInt($(65_000)), redondeoNetoCentavos: BigInt($(65_000)),
        parametros: { comisiones: { PRODUCTOR: $(30_000), COMERCIAL: $(30_000) }, rentabilidad: $(300_000), margenError: $(65_000), provisionales: [] },
        participantes, aprobadoPor: "Dirección",
      },
    }));
    await comprobante(p.id, 900_000);
    if (o.gasto) await duenio.proyectoGasto.create({ data: { tenantId: a.id, proyectoId: p.id, descripcion: "Taxi", neto: o.gasto, iva: 0 } });
    if (o.rendicion) {
      const g = await duenio.proyectoGasto.create({ data: { tenantId: a.id, proyectoId: p.id, descripcion: "Fletes", neto: 0, iva: 0 }, select: { id: true } });
      await enA((tx) => tx.proyectoRendicion.create({ data: { tenantId: a.id, proyectoId: p.id, gastoId: g.id, personaId: prod.personaId, medio: "PROPIO", montoCentavos: $(5_000), estado: "enviada" } }));
    }
    const facturado = o.facturado ?? 1_000_000;
    const cuota = await duenio.proyectoCuota.create({ data: { tenantId: a.id, proyectoId: p.id, tipo: "COBRO", concepto: "Anticipo", monto: facturado, moneda: "ARS", venceEl: PASADO, auto: false }, select: { id: true } });
    const inv = await duenio.invoice.create({ data: { tenantId: a.id, puntoVenta: 3, tipoComprobante: 6, concepto: 2, docTipo: 99, docNro: "0", fecha: "20261101", neto: facturado / 1.21, iva: facturado - facturado / 1.21, total: facturado, numero: 5000 + numero }, select: { id: true } });
    await enA((tx) => tx.proyectoCuotaFactura.create({ data: { tenantId: a.id, cuotaId: cuota.id, facturaId: inv.id, tramo: "ANTICIPO", creadoPor: "Test" } }));
    await cobrar(p.id, o.cobrado ?? 1_000_000);
    return { id: p.id, nombre };
  };

  // Segundo factor de Dirección: se activa y quedan sus códigos de respaldo (uno por aprobación).
  const u = { id: dir, tenantId: a.id, email: a.duenia.email, role: "OWNER" };
  const act = valor(await como(dir, () => sf.datosDeActivacion(u, "Factoque")));
  const activado = valor(await como(dir, () => sf.comprobarCodigo(u, sfc.codigoDelPaso(act.secreto, sfc.pasoDe(Date.now())))));
  assert.equal(activado.ok, true, "el factor de Dirección quedó activo");
  const respaldos = [...((activado as { codigos?: string[] }).codigos ?? [])];
  assert.ok(respaldos.length >= 8, "códigos de respaldo para las aprobaciones");

  const liq = (proyectoId: string) => enA((tx) => tx.proyectoLiquidacionProyecto.findMany({ where: { proyectoId }, include: { lineas: true } }));
  const totales = (lineas: { clave: string; personaId: string | null; total: bigint }[]) =>
    Object.fromEntries(lineas.map((l) => [l.personaId === prod.personaId ? "prod" : l.personaId === com.personaId ? "com" : l.personaId ? "otro" : "empresa", Number(l.total)]));
  return { a, b, duenio, enA, acc, empresa, lectura, tenantTransaction, como, valor, form, z, comprobante, cobrar, liq, totales, prod, com, admin, admin2, dir, respaldos };
}

async function preparar(t: import("node:test").TestContext) {
  const base = await laBase(t);
  if (!base) return null;
  preparado ??= armar(base);
  return preparado;
}

type Res = { ok: boolean; error?: string; listo?: string };
const ok = (r: Res) => assert.equal(r.ok, true, JSON.stringify(r));
const rechazo = (r: Res, patron: RegExp) => {
  assert.equal(r.ok, false, JSON.stringify(r));
  assert.match(r.error ?? "", patron);
};

test("RLS · «B no ve lo de A» en las 4 tablas de M5", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const z = await p.z();
  ok(p.valor(await p.como(p.admin.userId, () => p.acc.declararCostosCompletos(p.form({ proyectoId: z.id })))));
  const contar = (tenantId: string) =>
    p.tenantTransaction(async (tx) => [await tx.proyectoLiquidacionProyecto.count(), await tx.proyectoLiquidacionProyectoLinea.count(), await tx.proyectoLiquidacionProyectoAjuste.count(), await tx.proyectoSaldoAFavor.count()], { tenantId });
  const deA = await contar(p.a.id);
  assert.ok(deA[0] >= 1 && deA[1] >= 3, `A ve lo suyo (${deA})`);
  assert.deepEqual(await contar(p.b.id), [0, 0, 0, 0], "B no ve nada de A");
  const cab = (await p.liq(z.id))[0];
  await assert.rejects(
    p.tenantTransaction((tx) => tx.proyectoLiquidacionProyectoAjuste.create({ data: { tenantId: p.a.id, liquidacionId: cab.id, motivo: "Intruso", monto: BigInt(1), autorId: "x", autorNombre: "B" } }), { tenantId: p.b.id }),
    "B no inserta con el tenantId de A",
  );
});

test("C-O19 · provisoria: el productor recibe sólo su fila (55.000) y cambia al imputar un comprobante (30.000)", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const z = await p.z({ evento: FUTURO });
  const r1 = p.valor(await p.como(p.prod.userId, () => p.lectura.liquidacionDeLaFicha(z.id)))!;
  assert.equal(r1.provisoria, true);
  assert.deepEqual(r1.filas.map((f) => f.total), [$(55_000)]);
  const crudo = JSON.stringify(r1, (_k, v) => (typeof v === "bigint" ? Number(v) : v));
  // Su propia comisión también es 30.000: se busca lo que es sólo de los otros (la empresa 505.000, el id del comercial).
  assert.ok(!crudo.includes(String($(505_000))) && !crudo.includes(p.com.personaId) && !crudo.includes(String($(1_490_000))), "en la respuesta no viene el importe de nadie más");
  await p.comprobante(z.id, 100_000);
  const r2 = p.valor(await p.como(p.prod.userId, () => p.lectura.liquidacionDeLaFicha(z.id)))!;
  assert.deepEqual(r2.filas.map((f) => f.total), [$(30_000)]);
  const deAdmin = p.valor(await p.como(p.admin.userId, () => p.lectura.liquidacionDeLaFicha(z.id)))!;
  assert.equal(deAdmin.filas.length, 3, "Administración ve las tres filas");
});

test("C-O20 · sólo Administración, evento terminado y sin rendiciones; 3 envíos a la vez = 1 borrador que suma 590.000", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const enCurso = await p.z({ evento: FUTURO });
  rechazo(p.valor(await p.como(p.admin.userId, () => p.acc.declararCostosCompletos(p.form({ proyectoId: enCurso.id })))), /evento todavía no terminó/);
  const conRendicion = await p.z({ rendicion: true });
  rechazo(p.valor(await p.como(p.admin.userId, () => p.acc.declararCostosCompletos(p.form({ proyectoId: conRendicion.id })))), /rendici.*Productora/);
  const z = await p.z();
  rechazo(p.valor(await p.como(p.com.userId, () => p.acc.declararCostosCompletos(p.form({ proyectoId: z.id })))), /Administración/);
  const rs = await Promise.all(Array.from({ length: 3 }, () => p.como(p.admin.userId, () => p.acc.declararCostosCompletos(p.form({ proyectoId: z.id })))));
  for (const r of rs) ok(p.valor(r));
  const cabs = await p.liq(z.id);
  assert.equal(cabs.length, 1, "un solo borrador");
  assert.equal(cabs[0].estado, "BORRADOR");
  assert.equal(cabs[0].declaradaNombre, "Administra");
  assert.deepEqual(p.totales(cabs[0].lineas), { prod: $(55_000), com: $(30_000), empresa: $(505_000) });
  assert.equal(Number(cabs[0].esperado), $(590_000));
  assert.equal(cabs[0].lineas.reduce((s, l) => s + Number(l.total), 0), $(590_000));
  assert.equal(Number(cabs[0].costoReal), $(900_000));
  assert.ok(JSON.stringify(cabs[0].parametros).includes("reparto.queEsCobrado"), "la marca de provisional queda en la base");
});

test("C-O21 · diferencia sin nota: rechazo; con nota, revisada con autor; quien está en el equipo no revisa", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const z = await p.z({ gasto: 10_000, conAdmin2: true });
  ok(p.valor(await p.como(p.admin.userId, () => p.acc.declararCostosCompletos(p.form({ proyectoId: z.id })))));
  const cab = (await p.liq(z.id))[0];
  assert.deepEqual(p.totales(cab.lineas.filter((l) => l.personaId !== p.admin2.personaId)), { prod: $(52_500), com: $(30_000), empresa: $(497_500) });
  assert.equal(Number(cab.costoReal) - Number(cab.comprobantes), $(10_000));
  rechazo(p.valor(await p.como(p.admin2.userId, () => p.acc.revisarLiquidacionProyecto(p.form({ proyectoId: z.id, nota: "Revisado" })))), /cobrás en este proyecto/i);
  rechazo(p.valor(await p.como(p.admin.userId, () => p.acc.revisarLiquidacionProyecto(p.form({ proyectoId: z.id, nota: "" })))), /nota/);
  ok(p.valor(await p.como(p.admin.userId, () => p.acc.revisarLiquidacionProyecto(p.form({ proyectoId: z.id, nota: "Taxi del montaje sin factura" })))));
  const rev = (await p.liq(z.id))[0];
  assert.equal(rev.estado, "REVISADA");
  assert.equal(rev.revisadaNombre, "Administra");
  assert.equal(rev.notaRevision, "Taxi del montaje sin factura");
  // C-O22 · 1 centavo de descuadre forzado: no aprueba y sigue revisada.
  const linea = rev.lineas.find((l) => l.personaId === p.prod.personaId)!;
  await p.enA((tx) => tx.proyectoLiquidacionProyectoLinea.update({ where: { id: linea.id }, data: { reparto: linea.reparto + BigInt(1), total: linea.total + BigInt(1) } }));
  rechazo(p.valor(await p.como(p.dir, () => p.acc.aprobarLiquidacionProyecto(p.form({ proyectoId: z.id, codigo: p.respaldos.pop()! })))), /centavo/);
  assert.equal((await p.liq(z.id))[0].estado, "REVISADA");
});

test("C-O22 · sin código, rechazo; 4 aprobaciones a la vez: 1 aprobada y 1 renglón de historial", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const z = await p.z();
  ok(p.valor(await p.como(p.admin.userId, () => p.acc.declararCostosCompletos(p.form({ proyectoId: z.id })))));
  ok(p.valor(await p.como(p.admin.userId, () => p.acc.revisarLiquidacionProyecto(p.form({ proyectoId: z.id, nota: "" })))));
  rechazo(p.valor(await p.como(p.dir, () => p.acc.aprobarLiquidacionProyecto(p.form({ proyectoId: z.id, codigo: "" })))), /código/);
  rechazo(p.valor(await p.como(p.admin.userId, () => p.acc.aprobarLiquidacionProyecto(p.form({ proyectoId: z.id, codigo: "123456" })))), /Dirección/);
  const codigos = p.respaldos.splice(0, 4);
  const rs = await Promise.all(codigos.map((codigo) => p.como(p.dir, () => p.acc.aprobarLiquidacionProyecto(p.form({ proyectoId: z.id, codigo })))));
  const oks = rs.filter((r) => r.tipo === "respuesta" && (r.valor as Res).ok);
  assert.equal(oks.length, 1, JSON.stringify(rs));
  const cab = (await p.liq(z.id))[0];
  assert.equal(cab.estado, "APROBADA");
  assert.ok(cab.aprobadaEl);
  assert.deepEqual(p.totales(cab.lineas), { prod: $(55_000), com: $(30_000), empresa: $(505_000) });
  assert.equal(await p.duenio.proyectoCambio.count({ where: { proyectoId: z.id, campo: "Liquidación del proyecto", despues: "Aprobada" } }), 1);
});

test("C-O22 · aprobar mientras entra un comprobante: 1 aprobada, líneas de Z y el comprobante «para ajuste»", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const z = await p.z();
  ok(p.valor(await p.como(p.admin.userId, () => p.acc.declararCostosCompletos(p.form({ proyectoId: z.id })))));
  ok(p.valor(await p.como(p.admin.userId, () => p.acc.revisarLiquidacionProyecto(p.form({ proyectoId: z.id, nota: "" })))));
  const [r] = await Promise.all([p.como(p.dir, () => p.acc.aprobarLiquidacionProyecto(p.form({ proyectoId: z.id, codigo: p.respaldos.pop()! }))), p.comprobante(z.id, 50_000)]);
  ok(p.valor(r));
  const cabs = await p.liq(z.id);
  assert.equal(cabs.length, 1);
  assert.equal(cabs[0].estado, "APROBADA");
  assert.deepEqual(p.totales(cabs[0].lineas), { prod: $(55_000), com: $(30_000), empresa: $(505_000) });
  const ajuste = await p.enA((tx) => p.lectura.comprobantesParaAjuste(tx, p.a.id, z.id, cabs[0].costoDetalle));
  assert.deepEqual(ajuste.map((x) => x.costo), [$(50_000)]);
});

test("C-O23 · sin cobrar todo no entra y lo dice; cobrado, 1 línea por persona; dos veces, sigue 1; pagar: 1 egreso", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const z = await p.z();
  ok(p.valor(await p.como(p.admin.userId, () => p.acc.declararCostosCompletos(p.form({ proyectoId: z.id })))));
  ok(p.valor(await p.como(p.admin.userId, () => p.acc.revisarLiquidacionProyecto(p.form({ proyectoId: z.id, nota: "" })))));
  ok(p.valor(await p.como(p.dir, () => p.acc.aprobarLiquidacionProyecto(p.form({ proyectoId: z.id, codigo: p.respaldos.pop()! })))));
  const periodo = "2026-11";
  const generar = async () => p.valor(await p.como(p.admin.userId, () => p.empresa.generarLiquidaciones(p.form({ periodo }))));
  const g1 = await generar();
  assert.equal(g1.ok, true, JSON.stringify(g1));
  assert.ok((g1 as { esperando?: string[] }).esperando?.some((e) => e.includes(z.nombre)), "dice que el proyecto espera el cobro");
  const extrasDe = async (personaId: string) => {
    const l = await p.duenio.proyectoLiquidacion.findFirst({ where: { tenantId: p.a.id, personaId, periodo }, select: { id: true, extras: true, total: true } });
    return { id: l?.id, total: l?.total ?? 0, delProyecto: ((l?.extras ?? []) as { nombre: string; monto: number }[]).filter((e) => e.nombre === `Proyecto · ${z.nombre}`) };
  };
  assert.deepEqual((await extrasDe(p.prod.personaId)).delProyecto, [], "sin cobrar todo no entra nada");
  await p.cobrar(z.id, 802_900); // 1.000.000 + 802.900 = 1.802.900 = 1.490.000 × 1,21
  for (let i = 0; i < 2; i++) assert.equal((await generar()).ok, true);
  const deProd = await extrasDe(p.prod.personaId);
  const deCom = await extrasDe(p.com.personaId);
  assert.deepEqual(deProd.delProyecto.map((e) => e.monto), [55_000]);
  assert.deepEqual(deCom.delProyecto.map((e) => e.monto), [30_000]);
  const tomadas = await p.enA((tx) => tx.proyectoLiquidacionProyectoLinea.findMany({ where: { liquidacion: { proyectoId: z.id } }, select: { personaId: true, mensualId: true } }));
  assert.equal(tomadas.find((l) => l.personaId === p.prod.personaId)?.mensualId, deProd.id);
  assert.equal(tomadas.find((l) => l.personaId === null)?.mensualId, null, "la empresa no va a la liquidación mensual");
  ok(p.valor(await p.como(p.admin.userId, () => p.empresa.publicarBorradores(p.form({ periodo })))) as Res);
  ok(p.valor(await p.como(p.admin.userId, () => p.empresa.pagarLiquidacion(p.form({ id: deProd.id!, medio: "TRANSFERENCIA" })))) as Res);
  const egresos = await p.duenio.cashMovement.findMany({ where: { tenantId: p.a.id, proyectoLiquidacionId: deProd.id }, select: { amount: true, type: true } });
  assert.equal(egresos.length, 1, "un egreso");
  assert.equal(egresos[0].type, "EGRESO");
  assert.equal(deProd.total, 55_000, "sueldo fijo 0 + la línea del proyecto");
  assert.equal(egresos[0].amount, 55_000);
});
