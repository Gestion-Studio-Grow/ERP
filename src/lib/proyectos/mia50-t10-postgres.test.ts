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
//
// MIA-50 T12 · liquidación del proyecto II (O24-O26) + observación 3(a) de la certificación de la ola 4. Mismo método:
//  C-O24  Z aprobada (prod 55.000 · com 30.000 · empresa 505.000). Entra un comprobante tardío de 10.000: real 910.000 →
//         defensa 90.000 → prod 22.500 + 30.000 = 52.500 (Δ −2.500) · com 30.000 (Δ 0, sin renglón) · empresa
//         67.500 + 430.000 = 497.500 (Δ −7.500). Ajuste = 2 renglones: −250.000 c y −750.000 c. Líneas + ajustes =
//         590.000 − 10.000 = 580.000 = 1.490.000 − 910.000. Las líneas aprobadas no cambian. Los −2.500 de la productora
//         quedan como 1 saldo a favor de 250.000 c (no se descuentan del mes). Administración: rechazo. Sin código: rechazo.
//         2 aprobaciones a la vez = 1 lote (2 renglones). Repetir sin nada nuevo: «ya estaba hecho» y NO gasta un código.
//         La productora ve sólo su renglón (−250.000 c), no el de la empresa.
//  C-O25  Evento de octubre, plus de la productora 20.000, aprobado y cobrado: la mensual 2026-10 trae «Proyecto · Z» 55.000
//         y NO el plus. Otro Z de agosto con plus 20.000 (sin liquidar): con el reparto prendido, 2026-08 sin el plus; con
//         `reparto.activo` apagado (el «negocio B» del plan, simulado con el parámetro de A), 2026-08 trae el plus 20.000.
//  C-O26  Real 1.300.000 → defensa 1.490.000 − 1.300.000 − 490.000 = −300.000 → prod −75.000 + 30.000 = −45.000 · com
//         30.000 · empresa −225.000 + 430.000 = 205.000. Suma 190.000 = 1.490.000 − 1.300.000. Aprobada: 1 saldo a favor
//         de 4.500.000 c. Cobrada y generada 2026-09: la productora no tiene línea negativa; el comercial, 30.000.
//  RLS    B ve 0 ajustes y 0 saldos; insertar un saldo con el tenantId de A: rechazo.
//  3(a)   Aprobar cuando quien aprueba cobra en el proyecto, o no tiene ficha: rechazo y los códigos de respaldo quedan
//         iguales (antes el código se gastaba primero).
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
  // MIA-179: quien revisa o aprueba necesita ficha (sin `personaId`, falla cerrado). La dueña tiene la suya, de Dirección y fuera
  // del equipo de Z; el caso sin ficha tiene su propio test al final.
  await duenio.proyectoPersona.create({ data: { tenantId: a.id, userId: dir, nombre: "Dirección", email: a.duenia.email, rol: "DIRECCION" } });

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
  const enT = <R>(tenantId: string, fn: (tx: Tx) => Promise<R>) =>
    duenio.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
      return fn(tx);
    });
  const enA = <R>(fn: (tx: Tx) => Promise<R>) => enT(a.id, fn);
  const prov = await duenio.supplier.create({ data: { tenantId: a.id, name: "Proveedor T10" }, select: { id: true } });
  /** T12 · 3(b): el negocio donde se arma Z (por defecto A; el test del alta usa un negocio recién creado). */
  type Neg = { tenantId: string; clientId: string; prod: { personaId: string }; com: { personaId: string }; provId: string; cargador: string };
  const enAZ: Neg = { tenantId: a.id, clientId: a.clientes[0], prod, com, provId: prov.id, cargador: dir };
  let sig = 0;
  const comprobante = async (proyectoId: string, pesos: number, n: Neg = enAZ) => {
    const numero = `0010-${String(++sig).padStart(8, "0")}`;
    const c = await enT(n.tenantId, (tx) => tx.proyectoComprobante.create({ data: { tenantId: n.tenantId, supplierId: n.provId, tipo: "C", numero, fecha: PASADO, netoCentavos: BigInt($(pesos)), totalCentavos: BigInt($(pesos)), cargadoPorId: n.cargador, cargadoNombre: "Test" }, select: { id: true } }));
    await enT(n.tenantId, (tx) => tx.proyectoComprobanteLinea.create({ data: { tenantId: n.tenantId, comprobanteId: c.id, destino: "PROYECTO", proyectoId, categoria: "Producción", netoCentavos: BigInt($(pesos)), ivaTratamiento: "COSTO", costoCentavos: BigInt($(pesos)) } }));
  };
  const cobrar = (proyectoId: string, pesos: number, tenantId = a.id) => duenio.proyectoPago.create({ data: { tenantId, proyectoId, medio: "TRANSFERENCIA", monto: pesos } });

  let numero = (await duenio.proyecto.count()) + 1000;
  /** Un proyecto Z: foto del precio aprobado, equipo, el comprobante de 900.000, lo facturado y lo cobrado. */
  const z = async (o: { evento?: Date; facturado?: number; cobrado?: number; gasto?: number; rendicion?: boolean; conAdmin2?: boolean; real?: number; plus?: number; otros?: string[]; en?: Neg } = {}) => {
    const n = o.en ?? enAZ;
    const { prod, com } = n;
    const nombre = `Z ${++numero}`;
    const p = await duenio.proyecto.create({ data: { tenantId: n.tenantId, numero, clientId: n.clientId, nombre, servicio: "EVENTOS", etapa: "APROBADO", brief: "Stand", responsable: "Comercial", fechaEvento: o.evento ?? PASADO }, select: { id: true } });
    const pres = await duenio.proyectoPresupuesto.create({ data: { tenantId: n.tenantId, proyectoId: p.id, version: 1, estado: "APROBADO", token: `t10-${p.id}`, ivaPct: 21 }, select: { id: true } });
    await duenio.proyectoItem.create({ data: { tenantId: n.tenantId, presupuestoId: pres.id, rubro: "General", descripcion: "Stand", cantidad: 1, precio: 1_490_000 } });
    const equipo = [{ ...prod, funcion: "PRODUCTOR", plus: o.plus ?? 0 }, { ...com, funcion: "COMERCIAL" }, ...(o.conAdmin2 ? [{ ...admin2, funcion: "PRODUCTOR" }] : []), ...(o.otros ?? []).map((personaId) => ({ personaId, funcion: "PRODUCTOR" }))];
    const eqs = [];
    for (const m of equipo) eqs.push(await duenio.proyectoEquipo.create({ data: { tenantId: n.tenantId, proyectoId: p.id, personaId: m.personaId, funcion: m.funcion, plus: "plus" in m ? m.plus : 0 }, select: { id: true } }));
    const participantes = [
      { equipoId: eqs[0].id, personaId: prod.personaId, nombre: "Productora", funcion: "PRODUCTOR", comisionPct: 10, reparto: { DEFENSA: 25 } },
      { equipoId: eqs[1].id, personaId: com.personaId, nombre: "Comercial", funcion: "COMERCIAL", comisionPct: 10, reparto: { DEFENSA: 0 } },
      { equipoId: null, personaId: null, nombre: "Empresa", funcion: "EMPRESA", comisionPct: 0, reparto: { DEFENSA: 75, REDONDEO: 100 } },
    ];
    await enT(n.tenantId, (tx) => tx.proyectoPrecioFoto.create({
      data: {
        tenantId: n.tenantId, proyectoId: p.id, presupuestoId: pres.id, version: 1, modo: "POR_TOTAL", moneda: "ARS", ivaPct: 21,
        costoOriginalCentavos: BigInt($(1_000_000)), adicionalesCentavos: BigInt(0), subtotalCentavos: BigInt($(1_425_000)), iibGaCentavos: BigInt(0),
        totalVentaCentavos: BigInt($(1_490_000)), redondeoBrutoCentavos: BigInt($(65_000)), redondeoNetoCentavos: BigInt($(65_000)),
        parametros: { comisiones: { PRODUCTOR: $(30_000), COMERCIAL: $(30_000) }, rentabilidad: $(300_000), margenError: $(65_000), provisionales: [] },
        participantes, aprobadoPor: "Dirección",
      },
    }));
    await comprobante(p.id, o.real ?? 900_000, n);
    if (o.gasto) await duenio.proyectoGasto.create({ data: { tenantId: n.tenantId, proyectoId: p.id, descripcion: "Taxi", neto: o.gasto, iva: 0 } });
    if (o.rendicion) {
      const g = await duenio.proyectoGasto.create({ data: { tenantId: n.tenantId, proyectoId: p.id, descripcion: "Fletes", neto: 0, iva: 0 }, select: { id: true } });
      await enT(n.tenantId, (tx) => tx.proyectoRendicion.create({ data: { tenantId: n.tenantId, proyectoId: p.id, gastoId: g.id, personaId: prod.personaId, medio: "PROPIO", montoCentavos: $(5_000), estado: "enviada" } }));
    }
    const facturado = o.facturado ?? 1_000_000;
    const cuota = await duenio.proyectoCuota.create({ data: { tenantId: n.tenantId, proyectoId: p.id, tipo: "COBRO", concepto: "Anticipo", monto: facturado, moneda: "ARS", venceEl: PASADO, auto: false }, select: { id: true } });
    const inv = await duenio.invoice.create({ data: { tenantId: n.tenantId, puntoVenta: 3, tipoComprobante: 6, concepto: 2, docTipo: 99, docNro: "0", fecha: "20261101", neto: facturado / 1.21, iva: facturado - facturado / 1.21, total: facturado, numero: 5000 + numero }, select: { id: true } });
    await enT(n.tenantId, (tx) => tx.proyectoCuotaFactura.create({ data: { tenantId: n.tenantId, cuotaId: cuota.id, facturaId: inv.id, tramo: "ANTICIPO", creadoPor: "Test" } }));
    await cobrar(p.id, o.cobrado ?? 1_000_000, n.tenantId);
    return { id: p.id, nombre };
  };

  // Segundo factor de Dirección: se activa y quedan sus códigos de respaldo (uno por aprobación).
  const u = { id: dir, tenantId: a.id, email: a.duenia.email, role: "OWNER" };
  const act = valor(await como(dir, () => sf.datosDeActivacion(u, "Factoque")));
  const activado = valor(await como(dir, () => sf.comprobarCodigo(u, sfc.codigoDelPaso(act.secreto, sfc.pasoDe(Date.now())))));
  assert.equal(activado.ok, true, "el factor de Dirección quedó activo");
  const respaldos = [...((activado as { codigos?: string[] }).codigos ?? [])];
  assert.ok(respaldos.length >= 8, "códigos de respaldo para las aprobaciones");

  /** T12: más códigos de respaldo para quien aprueba (los de la activación alcanzan para T10). */
  const masCodigos = async (userId: string) => {
    const n = sfc.nuevosCodigosDeRespaldo();
    await duenio.proyectoSegundoFactor.updateMany({ where: { tenantId: a.id, userId }, data: { codigosRespaldo: { push: n.hashes } } });
    return n.visibles;
  };
  const codigosDe = async (userId: string) => (await duenio.proyectoSegundoFactor.findFirstOrThrow({ where: { tenantId: a.id, userId }, select: { codigosRespaldo: true } })).codigosRespaldo.length;
  const liq = (proyectoId: string) => enA((tx) => tx.proyectoLiquidacionProyecto.findMany({ where: { proyectoId }, include: { lineas: true } }));
  const totales = (lineas: { clave: string; personaId: string | null; total: bigint }[]) =>
    Object.fromEntries(lineas.map((l) => [l.personaId === prod.personaId ? "prod" : l.personaId === com.personaId ? "com" : l.personaId ? "otro" : "empresa", Number(l.total)]));
  return { a, b, duenio, enA, enT, acc, empresa, lectura, tenantTransaction, como, valor, form, z, comprobante, cobrar, liq, totales, prod, com, admin, admin2, dir, respaldos, sf, sfc, persona, masCodigos, codigosDe };
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

// MIA-179 (ola 4, observación 4(b) de la certificación de T10): Dirección por el rol del ERP (dueño) y SIN ficha en Equipo no
// tiene `personaId`, así que «no cobra en el proyecto» no se puede comprobar. Falla cerrado: no revisa ni aprueba, y no se
// escribe nada. Esperados escritos a mano antes de correr: 2 rechazos que nombran la ficha; la liquidación sigue en BORRADOR y
// después en REVISADA; 0 renglones de historial de esa persona.
test("MIA-179 · Dirección sin ficha (dueño por el rol del ERP) no revisa ni aprueba: falla cerrado", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const otro = await p.duenio.user.create({ data: { tenantId: p.a.id, name: "Dueño sin ficha", email: "duenio-sin-ficha@mia50t10.test", passwordHash: "x", role: "OWNER" }, select: { id: true, email: true } });
  assert.equal(await p.duenio.proyectoPersona.count({ where: { tenantId: p.a.id, userId: otro.id } }), 0, "no tiene ficha");
  const u = { id: otro.id, tenantId: p.a.id, email: otro.email, role: "OWNER" };
  const act = p.valor(await p.como(otro.id, () => p.sf.datosDeActivacion(u, "Factoque")));
  const activado = p.valor(await p.como(otro.id, () => p.sf.comprobarCodigo(u, p.sfc.codigoDelPaso(act.secreto, p.sfc.pasoDe(Date.now())))));
  assert.equal(activado.ok, true, "su factor quedó activo: el rechazo no es por el código");
  const respaldo = (activado as { codigos?: string[] }).codigos![0];

  const z = await p.z();
  ok(p.valor(await p.como(p.admin.userId, () => p.acc.declararCostosCompletos(p.form({ proyectoId: z.id })))));
  rechazo(p.valor(await p.como(otro.id, () => p.acc.revisarLiquidacionProyecto(p.form({ proyectoId: z.id, nota: "" })))), /ficha/i);
  assert.equal((await p.liq(z.id))[0].estado, "BORRADOR", "sin ficha no revisa");

  ok(p.valor(await p.como(p.admin.userId, () => p.acc.revisarLiquidacionProyecto(p.form({ proyectoId: z.id, nota: "" })))));
  const antes = await p.codigosDe(otro.id);
  rechazo(p.valor(await p.como(otro.id, () => p.acc.aprobarLiquidacionProyecto(p.form({ proyectoId: z.id, codigo: respaldo })))), /ficha/i);
  assert.equal(await p.codigosDe(otro.id), antes, "T12 · 3(a): el rechazo no gastó el código");
  assert.equal((await p.liq(z.id))[0].estado, "REVISADA", "sin ficha no aprueba");
  assert.equal(await p.duenio.proyectoCambio.count({ where: { proyectoId: z.id, autor: "Dueño sin ficha" } }), 0, "no escribió historial");
});

// ── T12 · liquidación del proyecto II ──

/** Declarada, revisada y aprobada por Dirección con un código nuevo. */
async function aprobada(p: NonNullable<Awaited<ReturnType<typeof preparar>>>, proyectoId: string) {
  ok(p.valor(await p.como(p.admin.userId, () => p.acc.declararCostosCompletos(p.form({ proyectoId })))));
  ok(p.valor(await p.como(p.admin.userId, () => p.acc.revisarLiquidacionProyecto(p.form({ proyectoId, nota: "" })))));
  const [codigo] = await p.masCodigos(p.dir);
  ok(p.valor(await p.como(p.dir, () => p.acc.aprobarLiquidacionProyecto(p.form({ proyectoId, codigo })))));
}

test("T12 · C-O24 · comprobante tardío: ajuste de 2 renglones debajo; doble envío = 1 lote; la aprobada no cambia", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const z = await p.z();
  await aprobada(p, z.id);
  await p.comprobante(z.id, 10_000);
  rechazo(p.valor(await p.como(p.admin.userId, () => p.acc.aprobarAjusteTardio(p.form({ proyectoId: z.id, codigo: "123456" })))), /Dirección/);
  rechazo(p.valor(await p.como(p.dir, () => p.acc.aprobarAjusteTardio(p.form({ proyectoId: z.id, codigo: "" })))), /código/);
  const codigos = await p.masCodigos(p.dir);
  const rs = await Promise.all(codigos.slice(0, 2).map((codigo) => p.como(p.dir, () => p.acc.aprobarAjusteTardio(p.form({ proyectoId: z.id, codigo })))));
  for (const r of rs) ok(p.valor(r));
  const cab = (await p.liq(z.id))[0];
  assert.deepEqual(p.totales(cab.lineas), { prod: $(55_000), com: $(30_000), empresa: $(505_000) }, "las líneas aprobadas no cambian");
  const ajustes = await p.enA((tx) => tx.proyectoLiquidacionProyectoAjuste.findMany({ where: { liquidacionId: cab.id }, select: { lineaId: true, monto: true, detalle: true, autorNombre: true } }));
  const deLinea = (id: string | null) => cab.lineas.find((l) => l.id === id);
  assert.deepEqual(ajustes.map((x) => [deLinea(x.lineaId)?.personaId === p.prod.personaId ? "prod" : deLinea(x.lineaId)?.personaId ? "otro" : "empresa", Number(x.monto)]).sort(), [["empresa", -$(7_500)], ["prod", -$(2_500)]]);
  assert.equal(new Set(ajustes.map((x) => (x.detalle as { lote: string }).lote)).size, 1, "un solo lote");
  const suma = cab.lineas.reduce((s, l) => s + Number(l.total), 0) + ajustes.reduce((s, x) => s + Number(x.monto), 0);
  assert.equal(suma, $(580_000), "liquidación + ajustes = 1.490.000 − 910.000");
  const saldos = await p.enA((tx) => tx.proyectoSaldoAFavor.findMany({ where: { liquidacionId: cab.id }, select: { personaId: true, monto: true } }));
  assert.deepEqual(saldos.map((x) => [x.personaId, Number(x.monto)]), [[p.prod.personaId, $(2_500)]]);
  // Repetir sin nada nuevo: no hay ajuste ni se gasta el código.
  const antes = await p.codigosDe(p.dir);
  const r3 = p.valor(await p.como(p.dir, () => p.acc.aprobarAjusteTardio(p.form({ proyectoId: z.id, codigo: codigos[2] }))));
  assert.equal(r3.ok, true);
  assert.match(String(r3.listo ?? ""), /ya estaba hecho/);
  assert.equal(await p.codigosDe(p.dir), antes, "no gastó el código");
  assert.equal(await p.enA((tx) => tx.proyectoLiquidacionProyectoAjuste.count({ where: { liquidacionId: cab.id } })), 2);
  // La productora ve sólo su renglón y su saldo.
  const deProd = p.valor(await p.como(p.prod.userId, () => p.lectura.liquidacionDeLaFicha(z.id)))!;
  assert.deepEqual(deProd.ajustes.map((x) => x.monto), [-$(2_500)]);
  const susSaldos = p.valor(await p.como(p.prod.userId, () => p.lectura.saldosAFavorDe(p.a.id, p.prod.personaId)));
  assert.ok(susSaldos.some((x) => x.proyecto === z.nombre && x.monto === $(2_500)));
});

test("T12 · C-O25 · plus con el reparto prendido no se paga dos veces; con el reparto apagado, entra", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const octubre = new Date("2026-10-15T12:00:00-03:00");
  const z = await p.z({ evento: octubre, plus: 20_000 });
  await aprobada(p, z.id);
  await p.cobrar(z.id, 802_900);
  const extrasDe = async (periodo: string) => {
    ok(p.valor(await p.como(p.admin.userId, () => p.empresa.generarLiquidaciones(p.form({ periodo })))) as Res);
    const l = await p.duenio.proyectoLiquidacion.findFirst({ where: { tenantId: p.a.id, personaId: p.prod.personaId, periodo }, select: { extras: true } });
    return ((l?.extras ?? []) as { nombre: string; monto: number }[]).map((e) => [e.nombre, e.monto]);
  };
  const oct = await extrasDe("2026-10");
  assert.ok(oct.some(([n, m]) => n === `Proyecto · ${z.nombre}` && m === 55_000), JSON.stringify(oct));
  assert.ok(!oct.some(([n]) => n === z.nombre), `sin el plus: ${JSON.stringify(oct)}`);
  const agosto = await p.z({ evento: new Date("2026-08-15T12:00:00-03:00"), plus: 20_000 });
  assert.ok(!(await extrasDe("2026-08")).some(([n]) => n === agosto.nombre), "reparto prendido: sin plus");
  await p.enA((tx) => tx.proyectoParametro.upsert({ where: { tenantId_clave: { tenantId: p.a.id, clave: "reparto.activo" } }, create: { tenantId: p.a.id, clave: "reparto.activo", valor: false, actualizadoPor: p.dir, actualizadoNombre: "Test" }, update: { valor: false } }));
  try {
    assert.deepEqual((await extrasDe("2026-08")).filter(([n]) => n === agosto.nombre), [[agosto.nombre, 20_000]], "reparto apagado: el plus entra");
  } finally {
    await p.enA((tx) => tx.proyectoParametro.delete({ where: { tenantId_clave: { tenantId: p.a.id, clave: "reparto.activo" } } }));
  }
});

test("T12 · C-O26 · total negativo: saldo a favor de la empresa, no un descuento del mes", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const z = await p.z({ real: 1_300_000 });
  await aprobada(p, z.id);
  const cab = (await p.liq(z.id))[0];
  assert.deepEqual(p.totales(cab.lineas), { prod: -$(45_000), com: $(30_000), empresa: $(205_000) });
  assert.equal(cab.lineas.reduce((s, l) => s + Number(l.total), 0), $(190_000));
  const saldos = await p.enA((tx) => tx.proyectoSaldoAFavor.findMany({ where: { liquidacionId: cab.id }, select: { personaId: true, monto: true, aplicado: true } }));
  assert.deepEqual(saldos.map((x) => [x.personaId, Number(x.monto), Number(x.aplicado)]), [[p.prod.personaId, $(45_000), 0]]);
  await p.cobrar(z.id, 802_900);
  const periodo = "2026-09";
  ok(p.valor(await p.como(p.admin.userId, () => p.empresa.generarLiquidaciones(p.form({ periodo })))) as Res);
  const extras = async (personaId: string) => (((await p.duenio.proyectoLiquidacion.findFirst({ where: { tenantId: p.a.id, personaId, periodo }, select: { extras: true } }))?.extras ?? []) as { nombre: string; monto: number }[]).filter((e) => e.nombre === `Proyecto · ${z.nombre}`).map((e) => e.monto);
  assert.deepEqual(await extras(p.prod.personaId), [], "el negativo no se descuenta del mes");
  assert.deepEqual(await extras(p.com.personaId), [30_000]);
});

test("T12 · RLS · B no ve los ajustes ni los saldos de A, ni inserta un saldo con su tenantId", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const contar = (tenantId: string) => p.tenantTransaction(async (tx) => [await tx.proyectoLiquidacionProyectoAjuste.count(), await tx.proyectoSaldoAFavor.count()], { tenantId });
  const deA = await contar(p.a.id);
  assert.ok(deA[0] >= 2 && deA[1] >= 2, `A ve lo suyo (${deA})`);
  assert.deepEqual(await contar(p.b.id), [0, 0]);
  const s = await p.enA((tx) => tx.proyectoSaldoAFavor.findFirstOrThrow({ select: { personaId: true, liquidacionId: true } }));
  await assert.rejects(p.tenantTransaction((tx) => tx.proyectoSaldoAFavor.create({ data: { tenantId: p.a.id, personaId: s.personaId, liquidacionId: s.liquidacionId, monto: BigInt(1) } }), { tenantId: p.b.id }));
});

test("T12 · 3(a) · quien cobra en el proyecto no aprueba y su código no se gasta", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const d2 = await p.persona("Direquipo", "DIRECCION");
  const u = { id: d2.userId, tenantId: p.a.id, email: "direquipo@mia50t10.test", role: "RECEPTION" };
  const act = p.valor(await p.como(d2.userId, () => p.sf.datosDeActivacion(u, "Factoque")));
  const activado = p.valor(await p.como(d2.userId, () => p.sf.comprobarCodigo(u, p.sfc.codigoDelPaso(act.secreto, p.sfc.pasoDe(Date.now())))));
  assert.equal(activado.ok, true);
  const z = await p.z({ otros: [d2.personaId] });
  ok(p.valor(await p.como(p.admin.userId, () => p.acc.declararCostosCompletos(p.form({ proyectoId: z.id })))));
  ok(p.valor(await p.como(p.admin.userId, () => p.acc.revisarLiquidacionProyecto(p.form({ proyectoId: z.id, nota: "" })))));
  const antes = await p.codigosDe(d2.userId);
  rechazo(p.valor(await p.como(d2.userId, () => p.acc.aprobarLiquidacionProyecto(p.form({ proyectoId: z.id, codigo: (activado as { codigos: string[] }).codigos[0] })))), /cobrás/i);
  assert.equal(await p.codigosDe(d2.userId), antes, "el rechazo llegó antes de gastar el código");
  assert.equal((await p.liq(z.id))[0].estado, "REVISADA");
});

test("T12 · C-O46 · liquidaciones con vista: Comercial con permiso no recibe importes aunque la vista de su rol los pida", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const vistas = await import("./vistas.server");
  const { guardarVista } = await import("./acciones-vistas");
  const { actorActual } = await import("./gestion.server");
  const periodo = "2027-03";
  await p.duenio.proyectoLiquidacion.create({ data: { tenantId: p.a.id, personaId: p.prod.personaId, periodo, base: 777_001, extras: [{ nombre: "Plus", monto: 33_003, manual: true }], total: 810_004, facturaA: "MIA", estado: "PUBLICADA" } });
  // Sin el permiso de liquidaciones, Comercial no lee la lista.
  assert.equal(p.valor(await p.como(p.com.userId, async () => vistas.leerLiquidacionesConVista(await actorActual(), periodo))).ok, false);
  await p.duenio.proyectoPermiso.create({ data: { tenantId: p.a.id, rol: "COMERCIAL", modulo: "liquidaciones", ver: true, editar: false } });
  const f = p.form({ lista: "liquidaciones", nombre: "Comercial: sueldos", alcance: "ROL", rol: "COMERCIAL", estado: "todos", agrupacion: "", orden: "monto:desc" });
  for (const c of ["base", "extras", "total", "estado"]) f.append("columnas", c);
  const deRol = p.valor(await p.como(p.dir, () => guardarVista(f)));
  ok(deRol as Res);
  const idRol = (deRol as { id: string }).id;
  const leida = p.valor(await p.como(p.com.userId, async () => vistas.leerLiquidacionesConVista(await actorActual(), periodo, idRol)));
  assert.equal(leida.ok, true, JSON.stringify(leida));
  if (leida.ok) {
    assert.equal(leida.actual.id, idRol, "la vista de su rol la ve");
    assert.deepEqual(leida.columnas.map((c) => c.id), ["persona", "estado", "accion"], "las columnas ocultas no viajan");
    assert.equal(leida.actual.orden, "contraparte:asc", "no ordena por el total oculto");
    assert.equal(leida.montos, false);
    assert.equal(leida.grupos.flatMap((g) => g.filas).length, 1);
    assert.doesNotMatch(JSON.stringify(leida), /777001|33003|810004/, "ningún importe en la respuesta");
  }
  const deDireccion = p.valor(await p.como(p.dir, async () => vistas.leerLiquidacionesConVista(await actorActual(), periodo, "sistema:todas")));
  assert.ok(deDireccion.ok && deDireccion.grupos[0].filas[0].total === 810_004, "Dirección sí lo ve");
  const deAdm = p.valor(await p.como(p.admin.userId, async () => vistas.leerLiquidacionesConVista(await actorActual(), periodo, idRol)));
  assert.ok(deAdm.ok && deAdm.actual.id === "sistema:todas", "la vista del rol Comercial no es de Administración");
  await p.duenio.proyectoPermiso.deleteMany({ where: { tenantId: p.a.id, rol: "COMERCIAL", modulo: "liquidaciones" } });
});

// T12 · 3(b), decisión del dueño (19/11, opción A): la regla de la ficha no cambia (sin excepción ni autovincularse); la ficha de
// Dirección de la dueña la crea el ALTA del negocio (`scripts/provision-tenant.ts`). Negocio recién creado con el alta real, la
// dueña es la única persona de Dirección. Esperados escritos a mano antes de correr: aprueba Z sin cobrar en él (APROBADA); con
// su ficha en el equipo de otro Z, rechazo «cobrás», su código no se gasta y Z sigue REVISADA; 1 sola ficha de Dirección, la suya.
test("T12 · 3(b) · alta de un negocio nuevo: la dueña, única de Dirección, aprueba lo que no cobra y no lo que cobra", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { provisionTenant } = await import("../../../scripts/provision-tenant");
  const sub = "productora-nueva-t12";
  const r = await provisionTenant(p.duenio, { name: "Productora nueva", slug: sub, blueprint: "productora", skipCatalog: true, owner: { name: "Dueña nueva", email: `duenia@${sub}.test` }, platform: { subdomain: sub } });
  assert.equal(r.tenantCreated, true);
  const tid = r.tenantId;
  const duenia = await p.duenio.user.findFirstOrThrow({ where: { tenantId: tid, role: "OWNER" }, select: { id: true, email: true } });
  await p.duenio.user.update({ where: { id: duenia.id }, data: { mustChangePassword: false } }); // ya cambió la provisoria
  const como = async <R>(userId: string, fn: () => Promise<R>) => p.valor(await ejecutarAccion({ negocio: { host: `${sub}.erp.test` }, usuario: { id: userId } }, fn));

  const persona = async (nombre: string, rol: string) => {
    const email = `${nombre.toLowerCase()}@${sub}.test`;
    const u = await p.duenio.user.create({ data: { tenantId: tid, name: nombre, email, passwordHash: "x", role: "RECEPTION" }, select: { id: true } });
    const f = await p.duenio.proyectoPersona.create({ data: { tenantId: tid, userId: u.id, nombre, email, rol }, select: { id: true } });
    return { userId: u.id, personaId: f.id };
  };
  const [prod, com, admin] = [await persona("Prodnueva", "PRODUCCION"), await persona("Comnueva", "COMERCIAL"), await persona("Adminnueva", "ADMINISTRACION")];
  const cli = await p.duenio.client.create({ data: { tenantId: tid, name: "Cliente nuevo", phone: "1130000099" }, select: { id: true } });
  const prov = await p.duenio.supplier.create({ data: { tenantId: tid, name: "Proveedor nuevo" }, select: { id: true } });
  const en = { tenantId: tid, clientId: cli.id, prod, com, provId: prov.id, cargador: duenia.id };
  const u = { id: duenia.id, tenantId: tid, email: duenia.email, role: "OWNER" };
  const act = como(duenia.id, () => p.sf.datosDeActivacion(u, "Factoque"));
  const activado = await como(duenia.id, async () => p.sf.comprobarCodigo(u, p.sfc.codigoDelPaso((await act).secreto, p.sfc.pasoDe(Date.now()))));
  assert.equal(activado.ok, true, "su factor quedó activo: un rechazo no es por el código");
  const [c1, c2] = (activado as { codigos: string[] }).codigos;
  const estado = async (proyectoId: string) => (await p.enT(tid, (tx) => tx.proyectoLiquidacionProyecto.findFirstOrThrow({ where: { tenantId: tid, proyectoId }, select: { estado: true } }))).estado;
  const revisada = async (proyectoId: string) => {
    ok(await como(admin.userId, () => p.acc.declararCostosCompletos(p.form({ proyectoId }))));
    ok(await como(admin.userId, () => p.acc.revisarLiquidacionProyecto(p.form({ proyectoId, nota: "" }))));
  };

  const z1 = await p.z({ en });
  await revisada(z1.id);
  ok(await como(duenia.id, () => p.acc.aprobarLiquidacionProyecto(p.form({ proyectoId: z1.id, codigo: c1 }))));
  assert.equal(await estado(z1.id), "APROBADA");

  const ficha = await p.enT(tid, (tx) => tx.proyectoPersona.findMany({ where: { tenantId: tid, rol: "DIRECCION" }, select: { id: true, userId: true } }));
  assert.deepEqual(ficha.map((f) => f.userId), [duenia.id], "1 sola ficha de Dirección, vinculada a la cuenta de la dueña");
  assert.equal(r.ownerFichaCreated, true);

  const z2 = await p.z({ en, otros: [ficha[0].id] });
  await revisada(z2.id);
  const codigos = async () => (await p.duenio.proyectoSegundoFactor.findFirstOrThrow({ where: { tenantId: tid, userId: duenia.id }, select: { codigosRespaldo: true } })).codigosRespaldo.length;
  const antes = await codigos();
  rechazo(await como(duenia.id, () => p.acc.aprobarLiquidacionProyecto(p.form({ proyectoId: z2.id, codigo: c2 }))), /cobrás/i);
  assert.equal(await codigos(), antes, "el rechazo llegó antes de gastar el código");
  assert.equal(await estado(z2.id), "REVISADA");
});
