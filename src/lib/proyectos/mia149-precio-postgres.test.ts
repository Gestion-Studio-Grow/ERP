// MIA T07 (GSG-MIA-149) — Postgres real, la app como `app_rls` (sin BYPASSRLS), Server Actions reales. Caso Z del plan § 2.1.
//
// C-O14: total a mano; menor que el subtotal → rechazo con cero cambios; sobre el tope → se guarda y el envío espera a Dirección.
// C-O15: fuera del rango (sin margen, § 3) espera a Dirección; con rango abierto, dentro del rango se aplica; con el cliente
//        aprobado, sólo Dirección y con motivo (Producción y Comercial, rechazados).
// C-O16: el plan de cobro y el tope salen del total congelado (× IVA), no de los ítems; cambiar ítems, % o el margen general
//        no los mueve. El cobro que pasa el tope se rechaza, también con N a la vez, con doble envío y con reintento, en
//        los tres caminos que cobran: «Registrar cobro», «Marcar cobrado» y la cuota de cobro a mano.
// C-O18: la foto se escribe en la misma transacción que la aprobación, una sola aunque aprueben N a la vez; no se modifica;
//        cambiar 3 parámetros y el equipo después la deja idéntica.
// C-O50: reparto por persona y concepto (el redondeo no se reparte; suma ≤ 100 / = 100 con la empresa); carrera de N guardados.
// R5:    el negocio B no ve ni escribe nada del A (RLS forzada en las tres tablas nuevas).

import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio, type NegocioDePrueba } from "@/test/base-efimera";
import { RUBROS } from "./gestion-core";

const DIA = 86_400_000;
const N = 6;

test("T07 · precio por total, foto, plan de cobro y equipo en Postgres real", async (t) => {
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
  const precio = await import("./acciones-precio");
  const ficha = await import("./acciones-ficha");
  const publica = await import("./acciones");
  const { regenerarCuotas, tiposDeCambio } = await import("./gestion.server");
  const { cobranzasDelNegocio } = await import("./cobranza.server");
  const { configProyectos } = await import("./datos.server");

  const form = (campos: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    return fd;
  };
  type R = { ok: boolean; error?: string; listo?: string };
  const en = async (negocio: NegocioDePrueba, quien: "duenia" | "recepcion", fn: () => Promise<R>): Promise<R> => {
    const r = await ejecutarAccion({ negocio, usuario: { id: negocio[quien].id } }, fn);
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return (r as { valor: R }).valor;
  };
  /** Dirección = la dueña (sin ficha); Producción = la recepcionista con ficha de Producción (edita cotizaciones y ve costos). */
  const direccion = (fn: () => Promise<R>) => en(a, "duenia", fn);
  const produccion = (fn: () => Promise<R>) => en(a, "recepcion", fn);
  type Tx = Parameters<Parameters<typeof duenio.$transaction>[0]>[0];
  const enA = <T>(fn: (tx: Tx) => Promise<T>): Promise<T> =>
    duenio.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${a.id}, true)`;
      return fn(tx);
    });

  // ── Datos: el proyecto Z (CO 1.000.000, ítem sin proveedor) con una versión en borrador; Producción en el equipo ──
  const prod = await duenio.proyectoPersona.create({ data: { tenantId: a.id, userId: a.recepcion.id, nombre: "Producción de prueba", rol: "PRODUCCION" } });
  const com = await duenio.proyectoPersona.create({ data: { tenantId: a.id, nombre: "Comercial de prueba", rol: "COMERCIAL" } });
  const p = await duenio.proyecto.create({ data: { tenantId: a.id, numero: 9149, clientId: a.clientes[0], nombre: "Proyecto Z", servicio: "EVENTOS", etapa: "PRESUPUESTO", fechaEvento: new Date(Date.now() + 60 * DIA), anticipoClientePct: 50 }, select: { id: true } });
  const v1 = await duenio.proyectoPresupuesto.create({ data: { tenantId: a.id, proyectoId: p.id, version: 1, estado: "BORRADOR", token: `tok-t07-${p.id}-1-xxxxxxxxxx`, ivaPct: 21 }, select: { id: true, token: true } });
  const item = await duenio.proyectoItem.create({ data: { tenantId: a.id, presupuestoId: v1.id, rubro: RUBROS[0], descripcion: "Escenario", cantidad: 1, costo: 1_000_000, precio: 1_200_000 }, select: { id: true } });
  const eqProd = await duenio.proyectoEquipo.create({ data: { tenantId: a.id, proyectoId: p.id, personaId: prod.id, funcion: "PRODUCTOR" }, select: { id: true } });
  const fila = () => enA((tx) => tx.proyectoPrecio.findUnique({ where: { proyectoId: p.id } }));
  const guardar = (campos: Record<string, string>) => precio.guardarPrecio(form({ proyectoId: p.id, ...campos }));
  const enviar = () => direccion(() => ficha.enviarCotizacion(form({ id: v1.id })));
  const aprobarInterno = async () => assert.equal((await direccion(() => ficha.aprobarInterno(form({ id: v1.id })))).ok, true);

  // ── C-O14 · Z-mín: menor que el subtotal → rechazo y cero cambios ──
  const zmin = await produccion(() => guardar({ total: "1.400.000" }));
  assert.equal(zmin.ok, false);
  assert.match(zmin.error ?? "", /menor que el subtotal/);
  assert.equal(await fila(), null, "el rechazo no escribe nada");
  assert.equal(await enA((tx) => tx.proyectoCambio.count({ where: { tenantId: a.id, entidad: "ProyectoPrecio" } })), 0);

  // ── C-O14 · Z-tope: 7 % > 5 % → se guarda, el envío espera a Dirección ──
  const ztope = await produccion(() => guardar({ total: "1.532.258,06" }));
  assert.equal(ztope.ok, true, ztope.error);
  assert.match(ztope.listo ?? "", /Dirección/);
  const f1 = await fila();
  assert.deepEqual([f1?.totalVentaCentavos, f1?.subtotalCentavos, f1?.redondeoBrutoCentavos, f1?.topeAprobadoCentavos], [BigInt(153225806), BigInt(142500000), BigInt(10725806), null]);
  await aprobarInterno();
  const frenado = await enviar();
  assert.match(frenado.error ?? "", /falta que Dirección lo apruebe/);
  const aprobo = await direccion(() => precio.aprobarPrecio(form({ proyectoId: p.id })));
  assert.equal(aprobo.ok, true, aprobo.error);
  assert.equal((await fila())?.topeAprobadoCentavos, BigInt(10725806));
  assert.equal((await produccion(() => precio.aprobarPrecio(form({ proyectoId: p.id })))).error, "Esto lo aprueba Dirección.");
  // Aprobado el redondeo, frena la función que cobra y no tiene a nadie (O50).
  assert.match((await enviar()).error ?? "", /Falta asignar a alguien del equipo en: Comercial/);
  assert.equal((await direccion(() => ficha.asignarEquipo(form({ proyectoId: p.id, personaId: com.id, funcion: "Comercial a mano" })))).error, "Elegí una función del negocio.", "R8: la función sale del catálogo");
  assert.equal((await direccion(() => ficha.asignarEquipo(form({ proyectoId: p.id, personaId: com.id, funcion: "COMERCIAL" })))).ok, true);
  const eqCom = await duenio.proyectoEquipo.findFirstOrThrow({ where: { proyectoId: p.id, personaId: com.id }, select: { id: true } });

  // ── El total de Z: 1.490.000 (4,36 % ≤ 5 %): no pide nada; un total nuevo pide aprobar los precios otra vez ──
  const z = await produccion(() => guardar({ total: "1.490.000" }));
  assert.equal(z.listo, "Listo: precio guardado.", z.error);
  assert.equal((await duenio.proyectoPresupuesto.findUniqueOrThrow({ where: { id: v1.id } })).aprobadoInternoEl, null);
  assert.equal((await fila())?.redondeoNetoCentavos, -BigInt(4225806));

  // ── C-O15: sin margen, cualquier cambio espera a Dirección; Dirección lo aplica directo ──
  const fuera = await produccion(() => guardar({ total: "1.490.000", rentabilidad: "35" }));
  assert.match(fuera.listo ?? "", /Rentabilidad\) esperan a Dirección/);
  const f2 = await fila();
  assert.equal((f2?.porcentajes as { rentabilidad: number }).rentabilidad, 30, "no se aplica");
  assert.equal((f2?.pendientes as { rentabilidad: number }).rentabilidad, 35);
  await aprobarInterno();
  assert.match((await enviar()).error ?? "", /esperando a Dirección/);
  const dirAplica = await direccion(() => guardar({ total: "1.490.000", rentabilidad: "30" }));
  assert.equal(dirAplica.ok, true, dirAplica.error);
  assert.equal((await fila())?.pendientes, null);
  // Con rango abierto (fila del negocio), dentro del rango se aplica sin esperar.
  await enA((tx) => tx.proyectoParametro.create({ data: { tenantId: a.id, clave: "precio.rentabilidad", valor: { valor: 30, min: 20, max: 40 }, provisional: true, actualizadoPor: a.duenia.id, actualizadoNombre: "Dirección" } }));
  const dentro = await produccion(() => guardar({ total: "1.490.000", rentabilidad: "32" }));
  assert.equal(dentro.listo, "Listo: precio guardado.", dentro.error);
  assert.equal(((await fila())?.porcentajes as { rentabilidad: number }).rentabilidad, 32);
  assert.equal((await produccion(() => guardar({ total: "1.490.000", rentabilidad: "30" }))).ok, true);
  await enA((tx) => tx.proyectoParametro.deleteMany({ where: { tenantId: a.id, clave: "precio.rentabilidad" } }));

  // ── C-O50: reparto ──
  const rep = (campos: Record<string, string>) => produccion(() => precio.guardarReparto(form({ proyectoId: p.id, ...campos })));
  assert.match((await rep({ [`reparto.REDONDEO.${eqProd.id}`]: "5" })).error ?? "", /redondeo no se reparte/);
  assert.match((await rep({ [`reparto.DEFENSA.${eqProd.id}`]: "60", [`reparto.DEFENSA.${eqCom.id}`]: "50" })).error ?? "", /más de 100/);
  assert.match((await rep({ [`reparto.DEFENSA.${eqProd.id}`]: "20", "reparto.DEFENSA.EMPRESA": "70" })).error ?? "", /suman 90 %/);
  assert.equal(await enA((tx) => tx.proyectoEquipoReparto.count({ where: { proyectoId: p.id } })), 0, "los rechazos no escriben");
  // Carrera: N guardados a la vez del mismo reparto con valores distintos → todos responden y queda UNO entero (no se mezclan).
  const carrera = await Promise.all(Array.from({ length: N }, (_, i) => rep({ [`reparto.DEFENSA.${eqProd.id}`]: String(20 + i), [`reparto.DEFENSA.${eqCom.id}`]: "5", "reparto.DEFENSA.EMPRESA": String(75 - i) })));
  assert.ok(carrera.every((r) => r.ok), JSON.stringify(carrera));
  const filasRep = await enA((tx) => tx.proyectoEquipoReparto.findMany({ where: { proyectoId: p.id }, orderBy: { puntos: "desc" } }));
  assert.equal(filasRep.length, 2);
  assert.equal(filasRep[1].puntos, 500);
  assert.ok(filasRep[0].puntos >= 2000 && filasRep[0].puntos < 2000 + N * 100);
  assert.equal((await rep({ [`reparto.DEFENSA.${eqProd.id}`]: "20", [`reparto.DEFENSA.${eqCom.id}`]: "5", "reparto.DEFENSA.EMPRESA": "75" })).ok, true);
  // Carrera del total: N guardados a la vez → una fila, con uno de los totales pedidos.
  const totales = Array.from({ length: N }, (_, i) => 1_490_000 + i);
  const carreraTotal = await Promise.all(totales.map((x) => produccion(() => guardar({ total: String(x) }))));
  assert.ok(carreraTotal.every((r) => r.ok), JSON.stringify(carreraTotal));
  assert.equal(await enA((tx) => tx.proyectoPrecio.count({ where: { proyectoId: p.id } })), 1);
  assert.equal((await produccion(() => guardar({ total: "1.490.000" }))).ok, true);

  // ── Envío: sale; enviada, el precio no cambia ──
  await aprobarInterno();
  const envio = await enviar();
  assert.equal(envio.ok, true, envio.error);
  assert.match((await produccion(() => guardar({ total: "1.500.000" }))).error ?? "", /ya se envió/);

  // ── C-O18: N aprobaciones a la vez (la del link del cliente y la que carga el equipo) → una aprobada y UNA foto ──
  const aprobaciones = await Promise.all(
    Array.from({ length: N }, (_, i) =>
      i % 2 === 0
        ? en(a, "duenia", () => ficha.registrarRespuesta(form({ id: v1.id, respuesta: "APROBADO", nombre: "Cliente Z" })))
        : ejecutarAccion({ negocio: a }, () => publica.responderPropuesta({ token: v1.token, aprueba: true, nombre: "Cliente Z" })).then((r) => (r as { valor: R }).valor),
    ),
  );
  assert.equal(aprobaciones.filter((r) => r.ok).length, 1, JSON.stringify(aprobaciones));
  const fotos = await enA((tx) => tx.proyectoPrecioFoto.findMany({ where: { proyectoId: p.id } }));
  assert.equal(fotos.length, 1);
  const foto = fotos[0];
  assert.deepEqual(
    [foto.presupuestoId, foto.totalVentaCentavos, foto.subtotalCentavos, foto.iibGaCentavos, foto.redondeoBrutoCentavos, foto.redondeoNetoCentavos, foto.ivaPct],
    [v1.id, BigInt(149000000), BigInt(142500000), BigInt(10725806), BigInt(6500000), -BigInt(4225806), 21],
  );
  const part = foto.participantes as { nombre: string; funcion: string; comisionPct: number; reparto: Record<string, number> }[];
  assert.deepEqual(part.map((x) => [x.nombre, x.funcion, x.comisionPct, x.reparto.DEFENSA]), [
    ["Producción de prueba", "PRODUCTOR", 10, 20],
    ["Comercial de prueba", "COMERCIAL", 10, 5],
    ["Empresa", "EMPRESA", 0, 75],
  ].sort((x, y) => (part.findIndex((q) => q.nombre === x[0]) - part.findIndex((q) => q.nombre === y[0]))));
  assert.ok((foto.parametros as { provisionales: string[] }).provisionales.includes("precio.rentabilidad"), "lo provisional queda marcado en la foto (R3)");

  // ── C-O18: inmutable. Ni el dueño de la tabla (disparador) ni la app (sin permiso de UPDATE) la cambian ──
  await assert.rejects(enA((tx) => tx.$executeRaw`UPDATE "ProyectoPrecioFoto" SET "totalVentaCentavos" = 1 WHERE "id" = ${foto.id}`), /no se modifica|inmutable/i);
  const app = new pg.Client({ connectionString: base.urlApp });
  app.on("error", () => {});
  await app.connect();
  base.alBorrar(() => app.end());
  await app.query("BEGIN");
  await app.query("SELECT set_config('app.current_tenant_id', $1, true)", [a.id]);
  await assert.rejects(app.query(`UPDATE "ProyectoPrecioFoto" SET "totalVentaCentavos" = 1 WHERE "id" = $1`, [foto.id]), /permission denied|no se modifica/i);
  await app.query("ROLLBACK");

  // ── C-O15 con el cliente aprobado: sólo Dirección y con motivo; el total no cambia ──
  assert.match((await produccion(() => guardar({ total: "1.490.000", margenError: "4" }))).error ?? "", /sólo Dirección/);
  assert.match((await direccion(() => guardar({ total: "1.490.000", margenError: "4" }))).error ?? "", /motivo/);
  assert.match((await direccion(() => guardar({ total: "1.500.000", motivo: "ajuste" }))).error ?? "", /no cambia/);
  const tres = await direccion(() => guardar({ total: "1.490.000", rentabilidad: "31", margenError: "4", iibGa: "8", motivo: "Ajuste de Dirección después de aprobar" }));
  assert.equal(tres.ok, true, tres.error);
  // Comercial tampoco (vuelta MIA-155): la recepcionista pasa a Comercial. Por defecto Comercial no ve costos y no entra; con
  // los costos habilitados por el negocio, llega y se rechaza igual. Ningún rechazo escribe.
  await duenio.proyectoPersona.update({ where: { id: prod.id }, data: { rol: "COMERCIAL" } });
  const precioAntes = await fila();
  const deComercial = () => produccion(() => guardar({ total: "1.490.000", rentabilidad: "33", motivo: "Lo pide Comercial" }));
  assert.match((await deComercial()).error ?? "", /no tenés permiso para verlos/);
  const permisoCostos = { tenantId: a.id, rol: "COMERCIAL", modulo: "costos" };
  await duenio.proyectoPermiso.upsert({ where: { tenantId_rol_modulo: permisoCostos }, create: { ...permisoCostos, ver: true }, update: { ver: true } });
  assert.match((await deComercial()).error ?? "", /sólo Dirección/);
  assert.deepEqual(await fila(), precioAntes, "el rechazo de Comercial no escribe");
  await duenio.proyectoPermiso.delete({ where: { tenantId_rol_modulo: permisoCostos } });
  await duenio.proyectoPersona.update({ where: { id: prod.id }, data: { rol: "PRODUCCION" } });
  // … y el equipo: sale Comercial (su reparto se va con él).
  assert.equal((await direccion(() => ficha.quitarEquipo(form({ proyectoId: p.id, id: eqCom.id })))).ok, true);
  const fotoDespues = await enA((tx) => tx.proyectoPrecioFoto.findUniqueOrThrow({ where: { id: foto.id } }));
  assert.deepEqual(fotoDespues, foto, "3 parámetros y el equipo cambiaron: la foto quedó idéntica");

  // ── C-O16: cuotas del cliente = 1.490.000 × 1,21 = 1.802.900 (50/50), no lo de los ítems (1.200.000 × 1,21) ──
  const cuotasCliente = () => duenio.proyectoCuota.findMany({ where: { tenantId: a.id, proyectoId: p.id, tipo: "COBRO", anuladoEl: null }, orderBy: { clave: "asc" }, select: { clave: true, monto: true } });
  const plan1 = await cuotasCliente();
  assert.deepEqual(plan1.map((c) => c.monto), [901_450, 901_450], JSON.stringify(plan1));
  const cobranza = async () => {
    const r = await ejecutarAccion({ negocio: a, usuario: { id: a.duenia.id } }, async () => (await cobranzasDelNegocio(a.id, await tiposDeCambio(a.id), (await configProyectos(a.id)).margenPct, [p.id])).get(p.id)!);
    return (r as { valor: { total: number; porCobrar: number } }).valor;
  };
  const tope = async () => (await cobranza()).total;
  assert.equal(await tope(), 1_802_900, "el tope de cobro es el total congelado con IVA");
  // Cambian los ítems de la versión aprobada: las cuotas y el tope no se mueven.
  await duenio.proyectoItem.update({ where: { id: item.id }, data: { precio: 3_000_000, costo: 1_500_000 } });
  await ejecutarAccion({ negocio: a, usuario: { id: a.duenia.id } }, () => regenerarCuotas(a.id, p.id));
  assert.deepEqual((await cuotasCliente()).map((c) => c.monto), [901_450, 901_450]);
  assert.equal(await tope(), 1_802_900);
  // … y el margen general del negocio (35 → 80 %): tampoco.
  await duenio.proyectoConfig.upsert({ where: { tenantId: a.id }, create: { tenantId: a.id, margenPct: 80 }, update: { margenPct: 80 } });
  assert.equal((await duenio.proyectoConfig.findUniqueOrThrow({ where: { tenantId: a.id } })).margenPct, 80);
  await ejecutarAccion({ negocio: a, usuario: { id: a.duenia.id } }, () => regenerarCuotas(a.id, p.id));
  assert.deepEqual((await cuotasCliente()).map((c) => c.monto), [901_450, 901_450]);
  assert.equal(await tope(), 1_802_900);

  // ── C-O16 · el cobro que pasa el tope congelado se rechaza, también con N a la vez (molde plata fila 1, R5) ──
  // Con los ítems subidos (3.000.000) y el margen en 80 %, el tope sigue siendo 1.802.900: 5 cobros de 450.000 a la vez →
  // entran 4 (1.800.000) y el quinto se rechaza. Sin el candado o sin la verificación entran los 5 (2.250.000).
  const cobrar = (monto: string, extra: Record<string, string> = {}) => direccion(() => publica.registrarCobro(form({ proyectoId: p.id, medio: "TRANSFERENCIA", monto, ...extra })));
  const cobrado = async () => {
    const pagos = await enA((tx) => tx.proyectoPago.findMany({ where: { proyectoId: p.id, anuladoEl: null }, select: { monto: true } }));
    return { n: pagos.length, total: pagos.reduce((s, x) => s + x.monto, 0) };
  };
  const cinco = await Promise.all(Array.from({ length: 5 }, () => cobrar("450000")));
  assert.equal(cinco.filter((r) => r.ok).length, 4, JSON.stringify(cinco));
  assert.match(cinco.find((r) => !r.ok)?.error ?? "", /falta cobrar|pasa/i);
  assert.deepEqual(await cobrado(), { n: 4, total: 1_800_000 });
  // Al borde: falta 2.900. Uno más (2.901) se rechaza y no escribe; 2.900 entra.
  const pasado = await cobrar("2901");
  assert.equal(pasado.ok, false);
  assert.deepEqual(await cobrado(), { n: 4, total: 1_800_000 });
  // El de 2.900 con doble envío (los dos a la vez, la misma clave) y después un reintento: un solo cobro.
  const claveO16 = `o16-borde-${p.id}`.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
  const doble = await Promise.all([cobrar("2900", { claveEnvio: claveO16 }), cobrar("2900", { claveEnvio: claveO16 })]);
  assert.ok(doble.every((r) => r.ok), JSON.stringify(doble));
  assert.deepEqual(await cobrado(), { n: 5, total: 1_802_900 }, "el doble envío asienta una vez");
  assert.equal((await cobrar("2900", { claveEnvio: claveO16 })).ok, true, "el reintento responde lo ya grabado");
  assert.deepEqual(await cobrado(), { n: 5, total: 1_802_900 });
  assert.deepEqual(await cobranza().then((c) => [c.total, c.porCobrar]), [1_802_900, 0]);
  assert.equal((await cobrar("1")).ok, false, "cobrado el total congelado, no entra un peso más");
  assert.deepEqual(await cobrado(), { n: 5, total: 1_802_900 });

  // ── C-O16 · «Marcar cobrado» (`marcarCuota`) contra el mismo tope congelado (vuelta 2, MIA-159) ──
  // Preparación por la base: se anulan los 5 cobros de arriba (cobrado 0) y se suma una cuota de cobro cargada a mano antes
  // de aprobar (sin tope entonces), la más vieja. Las cuotas esperan 2.252.900 y el tope congelado (1.802.900) recorta la
  // más nueva: la 2ª queda en 451.450. Sin la base congelada el tope sería el de los ítems (3.630.000) y no recortaría nada.
  const anularCobros = () => duenio.proyectoPago.updateMany({ where: { tenantId: a.id, proyectoId: p.id, anuladoEl: null }, data: { anuladoEl: new Date() } });
  await anularCobros();
  assert.deepEqual(await cobrado(), { n: 0, total: 0 });
  const [c1, c2] = await duenio.proyectoCuota.findMany({ where: { tenantId: a.id, proyectoId: p.id, tipo: "COBRO", anuladoEl: null }, orderBy: { venceEl: "asc" }, select: { id: true, venceEl: true } });
  const vieja = await duenio.proyectoCuota.create({ data: { tenantId: a.id, proyectoId: p.id, tipo: "COBRO", concepto: "Seña cargada antes de aprobar", monto: 450_000, venceEl: new Date(c1.venceEl.getTime() - DIA) }, select: { id: true } });
  const marcar = (id: string, monto?: string) => direccion(() => ficha.marcarCuota(form({ id, medio: "TRANSFERENCIA", ...(monto && { monto }) })));
  // 5 a la vez: la vieja y la 1ª enteras, y tres partes de 448.550 sobre la 2ª → de la 2ª entra una sola parte: 1.800.000.
  const marcas = await Promise.all([marcar(vieja.id), marcar(c1.id), marcar(c2.id, "448550"), marcar(c2.id, "448550"), marcar(c2.id, "448550")]);
  assert.equal(marcas.filter((r) => r.ok).length, 3, JSON.stringify(marcas));
  assert.ok(marcas[0].ok && marcas[1].ok, JSON.stringify(marcas));
  assert.deepEqual(await cobrado(), { n: 3, total: 1_800_000 });
  // Al borde: falta 2.900, todo en la 2ª. Una parte de 2.901 se rechaza y no escribe; 2.900 entra y la salda.
  assert.equal((await marcar(c2.id, "2901")).ok, false);
  assert.deepEqual(await cobrado(), { n: 3, total: 1_800_000 });
  assert.equal((await marcar(c2.id, "2900")).ok, true);
  assert.deepEqual(await cobrado(), { n: 4, total: 1_802_900 });
  assert.deepEqual(await cobranza().then((c) => [c.total, c.porCobrar]), [1_802_900, 0]);

  // ── C-O16 · cuota de cobro a mano (`crearMovimientoManual`) contra el mismo tope congelado ──
  // Preparación por la base: se anulan los cobros y las cuotas de cobro. No queda nada esperado y el lugar para cuotas a
  // mano es todo el tope congelado (1.802.900); sin la base congelada sería el de los ítems (3.630.000).
  await anularCobros();
  await duenio.proyectoCuota.updateMany({ where: { tenantId: a.id, proyectoId: p.id, tipo: "COBRO", anuladoEl: null }, data: { anuladoEl: new Date() } });
  const vence = new Date(Date.now() + 30 * DIA).toISOString().slice(0, 10);
  const aMano = (monto: string, extra: Record<string, string> = {}) => direccion(() => ficha.crearMovimientoManual(form({ proyectoId: p.id, tipo: "COBRO", concepto: "Cuota a mano O16", monto, venceEl: vence, ...extra })));
  const esperado = async () => {
    const qs = await enA((tx) => tx.proyectoCuota.findMany({ where: { proyectoId: p.id, tipo: "COBRO", anuladoEl: null }, select: { monto: true } }));
    return { n: qs.length, total: qs.reduce((s, x) => s + x.monto, 0) };
  };
  const cincoAMano = await Promise.all(Array.from({ length: 5 }, () => aMano("450000")));
  assert.equal(cincoAMano.filter((r) => r.ok).length, 4, JSON.stringify(cincoAMano));
  assert.match(cincoAMano.find((r) => !r.ok)?.error ?? "", /No entra otra cuota|falta cobrar/);
  assert.deepEqual(await esperado(), { n: 4, total: 1_800_000 });
  assert.equal((await aMano("2901")).ok, false);
  assert.deepEqual(await esperado(), { n: 4, total: 1_800_000 });
  // 2.900 con doble envío (la misma clave, a la vez) y un reintento: una sola cuota.
  const claveMano = `o16-mano-${p.id}`.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
  const dobleMano = await Promise.all([aMano("2900", { claveEnvio: claveMano }), aMano("2900", { claveEnvio: claveMano })]);
  assert.ok(dobleMano.every((r) => r.ok), JSON.stringify(dobleMano));
  assert.equal((await aMano("2900", { claveEnvio: claveMano })).ok, true, "el reintento no graba otra");
  assert.deepEqual(await esperado(), { n: 5, total: 1_802_900 });
  assert.equal((await aMano("1")).ok, false, "esperado todo el total congelado, no entra un peso más");
  assert.deepEqual(await esperado(), { n: 5, total: 1_802_900 });

  // ── R5: el negocio B no ve ni toca nada del A ──
  const deB = await en(b, "duenia", () => precio.guardarPrecio(form({ proyectoId: p.id, total: "1.490.000" })));
  assert.equal(deB.error, "Ese proyecto no existe.");
  assert.equal((await en(b, "duenia", () => precio.guardarReparto(form({ proyectoId: p.id })))).error, "Ese proyecto no existe.");
  const contar = async (tenant: string) => {
    await app.query("BEGIN");
    await app.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenant]);
    const r = await app.query(`SELECT (SELECT count(*) FROM "ProyectoPrecio")::int AS precio, (SELECT count(*) FROM "ProyectoPrecioFoto")::int AS foto, (SELECT count(*) FROM "ProyectoEquipoReparto")::int AS reparto`);
    await app.query("ROLLBACK");
    return r.rows[0];
  };
  assert.deepEqual(await contar(b.id), { precio: 0, foto: 0, reparto: 0 });
  assert.deepEqual(await contar(a.id), { precio: 1, foto: 1, reparto: 1 });
  await app.query("BEGIN");
  await app.query("SELECT set_config('app.current_tenant_id', $1, true)", [b.id]);
  await assert.rejects(app.query(`INSERT INTO "ProyectoPrecio" ("id","tenantId","proyectoId","actualizadoPor","updatedAt") VALUES ('x-b', $1, $2, 'B', now())`, [a.id, p.id]), /row-level security/);
  await app.query("ROLLBACK");
});
