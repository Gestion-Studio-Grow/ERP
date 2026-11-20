// MIA T06 · presupuesto (GSG-MIA-125) — Postgres real, la app como `app_rls` (sin BYPASSRLS), Server Actions reales.
//
// C-O08: la línea toma sector y categoría de las listas del negocio (fuera de la lista, rechazo) y el personal es
//        puestos × horas × días (define la cantidad); en una versión ya enviada no se cambia.
// C-O12: el % de una línea cambia SÓLO sus dos cuotas (= costo × % a mano); las otras quedan igual y lo pagado no se toca.
//        Los dos estados de la previsión los marca sólo Administración, con 1 fila en el historial por marca.
// C-O09: un adicional no sale sin aprobación interna; la aprueba sólo Dirección y no alguien del equipo; queda quién y cuándo.
// C-O11: aprobado por el cliente, las cuotas del base no cambian, las suyas suman su precio con IVA y el tope de cobro
//        sube exactamente eso. El negocio B no ve nada del A.

import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { RUBROS } from "./gestion-core";

const DIA = 86_400_000;

test("T06 · presupuesto en Postgres real: líneas (O08), anticipo y previsión (O12), adicionales (O09, O11), aislamiento", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a, b } = base;
  const t0 = await duenio.tenant.findUniqueOrThrow({ where: { id: a.id }, select: { modules: true } });
  await duenio.tenant.update({ where: { id: a.id }, data: { modules: [...new Set([...t0.modules, "proyectos"])] } });
  const acc = await import("./acciones-presupuesto");
  const { regenerarCuotas } = await import("./gestion.server");
  const { cobranzasDelNegocio } = await import("./cobranza.server");

  const form = (campos: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    return fd;
  };
  type R = { ok: boolean; error?: string };
  /** La dueña (sin ficha: Dirección, fuera del equipo) o la recepcionista con la ficha que le toque en cada paso. */
  const como = async (quien: "duenia" | "recepcion", fn: () => Promise<R>): Promise<R> => {
    const r = await ejecutarAccion({ negocio: a, usuario: { id: a[quien].id } }, fn);
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return (r as { valor: R }).valor;
  };
  // Las tablas de M2 tienen la RLS forzada (también para su dueño): se leen con el negocio puesto.
  type Tx = Parameters<Parameters<typeof duenio.$transaction>[0]>[0];
  const enA = <T>(fn: (tx: Tx) => Promise<T>): Promise<T> =>
    duenio.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${a.id}, true)`;
      return fn(tx);
    });
  const persona = await duenio.proyectoPersona.create({ data: { tenantId: a.id, userId: a.recepcion.id, nombre: "Recepción de prueba", rol: "COMERCIAL" } });
  const conRol = (rol: string) => duenio.proyectoPersona.update({ where: { id: persona.id }, data: { rol } });

  // ── Datos: un proyecto aprobado con dos líneas de dos proveedores (50 % de anticipo los dos) y una versión en borrador ──
  const proveedores = [];
  for (const name of ["Proveedor Uno", "Proveedor Dos"]) {
    const s = await duenio.supplier.create({ data: { tenantId: a.id, name }, select: { id: true } });
    await duenio.proyectoProveedorFicha.create({ data: { tenantId: a.id, supplierId: s.id, anticipoPct: 50 } });
    proveedores.push(s.id);
  }
  const evento = new Date(Date.now() + 90 * DIA);
  const p = await duenio.proyecto.create({ data: { tenantId: a.id, numero: 9001, clientId: a.clientes[0], nombre: "Proyecto T06", servicio: "EVENTOS", etapa: "APROBADO", fechaEvento: evento, anticipoClientePct: 50 }, select: { id: true } });
  const v1 = await duenio.proyectoPresupuesto.create({ data: { tenantId: a.id, proyectoId: p.id, version: 1, estado: "APROBADO", token: `tok-t06-${p.id}-1-xxxxxxxxxx`, ivaPct: 21, enviadoEl: new Date(), aprobadoInternoEl: new Date(), aprobadoInternoPor: "Dirección" }, select: { id: true } });
  const linea1 = await duenio.proyectoItem.create({ data: { tenantId: a.id, presupuestoId: v1.id, rubro: RUBROS[0], descripcion: "Escenario", cantidad: 1, costo: 1000, precio: 2000, supplierId: proveedores[0], proveedor: "Proveedor Uno" }, select: { id: true } });
  const linea2 = await duenio.proyectoItem.create({ data: { tenantId: a.id, presupuestoId: v1.id, rubro: RUBROS[0], descripcion: "Sonido", cantidad: 1, costo: 600, precio: 900, supplierId: proveedores[1], proveedor: "Proveedor Dos" }, select: { id: true } });
  await ejecutarAccion({ negocio: a, usuario: { id: a.duenia.id } }, () => regenerarCuotas(a.id, p.id));
  const cuotas = () => duenio.proyectoCuota.findMany({ where: { tenantId: a.id, proyectoId: p.id, anuladoEl: null }, select: { id: true, clave: true, tipo: true, monto: true, pagadoEl: true }, orderBy: { clave: "asc" } });
  const deLinea = async (itemId: string) => (await cuotas()).filter((c) => c.clave?.startsWith(`${p.id}:${itemId}:`));
  assert.deepEqual((await deLinea(linea1.id)).map((c) => c.monto), [500, 500], "plan de partida: 50/50 del proveedor");

  // ── C-O08: sector, categoría y personal en una versión en borrador ──
  const p2 = await duenio.proyecto.create({ data: { tenantId: a.id, numero: 9002, clientId: a.clientes[0], nombre: "Proyecto T06 borrador", servicio: "EVENTOS", etapa: "PROPUESTA" }, select: { id: true } });
  const vb = await duenio.proyectoPresupuesto.create({ data: { tenantId: a.id, proyectoId: p2.id, version: 1, estado: "BORRADOR", token: `tok-t06-${p2.id}-1-xxxxxxxxxx`, ivaPct: 21 }, select: { id: true } });
  const lp = await duenio.proyectoItem.create({ data: { tenantId: a.id, presupuestoId: vb.id, rubro: RUBROS[0], descripcion: "Personal de armado", cantidad: 1, costo: 5000, precio: 8000 }, select: { id: true } });
  const fuera = await como("duenia", () => acc.guardarLineaDetalle(form({ itemId: lp.id, sector: "Catering", categoria: RUBROS[0] })));
  assert.equal(fuera.ok, false);
  assert.match(fuera.error ?? "", /sector «Catering» no está en la lista/);
  const aMedias = await como("duenia", () => acc.guardarLineaDetalle(form({ itemId: lp.id, sector: "Producción", categoria: RUBROS[0], puestos: "2", horas: "8" })));
  assert.match(aMedias.error ?? "", /puestos, horas y días/);
  const okLinea = await como("duenia", () => acc.guardarLineaDetalle(form({ itemId: lp.id, sector: "Producción", categoria: RUBROS[0], puestos: "2", horas: "8", dias: "3" })));
  assert.equal(okLinea.ok, true, okLinea.error);
  const item = await duenio.proyectoItem.findUniqueOrThrow({ where: { id: lp.id }, select: { cantidad: true, costo: true } });
  assert.equal(item.cantidad, 48, "personal = 2 puestos × 8 h × 3 días");
  assert.equal(item.cantidad * item.costo, 240_000, "subtotal = producto");
  const det = await enA((tx) => tx.proyectoLineaDetalle.findUniqueOrThrow({ where: { itemId: lp.id } }));
  assert.deepEqual([det.sector, det.categoria, det.puestos, det.horas, det.dias], ["Producción", RUBROS[0], 2, 8, 3]);
  const enAprobada = await como("duenia", () => acc.guardarLineaDetalle(form({ itemId: linea1.id, sector: "Producción", categoria: RUBROS[0] })));
  assert.match(enAprobada.error ?? "", /adicional/, "la versión aprobada no cambia precio: va como adicional");

  // ── C-O12: el % de una línea cambia sólo sus dos cuotas; lo pagado no se toca ──
  const antesL2 = await deLinea(linea2.id);
  const pct = await como("duenia", () => acc.guardarAnticipoLinea(form({ itemId: linea1.id, anticipoPct: "30" })));
  assert.equal(pct.ok, true, pct.error);
  assert.deepEqual((await deLinea(linea1.id)).map((c) => [c.clave?.split(":").at(-1), c.monto]), [["anticipo", 300], ["saldo", 700]], "costo 1000 × 30 % a mano");
  assert.deepEqual(await deLinea(linea2.id), antesL2, "la otra línea queda igual");
  const malPct = await como("duenia", () => acc.guardarAnticipoLinea(form({ itemId: linea1.id, anticipoPct: "130" })));
  assert.equal(malPct.ok, false);
  const anticipoL2 = antesL2.find((c) => c.clave?.endsWith(":anticipo"))!;
  await duenio.proyectoCuota.update({ where: { id: anticipoL2.id }, data: { pagadoEl: new Date() } });
  assert.equal((await como("duenia", () => acc.guardarAnticipoLinea(form({ itemId: linea2.id, anticipoPct: "20" })))).ok, true);
  const despuesL2 = await deLinea(linea2.id);
  assert.equal(despuesL2.find((c) => c.id === anticipoL2.id)?.monto, 300, "la cuota pagada no se toca");
  assert.equal(despuesL2.reduce((s, c) => s + c.monto, 0), 600, "anticipo pagado + saldo = costo de la línea");

  // Previsión: sólo Administración marca, 1 fila por marca.
  const pagoL1 = (await deLinea(linea1.id))[0];
  const historial = () => duenio.proyectoCambio.count({ where: { tenantId: a.id, entidad: "ProyectoCuota", entidadId: pagoL1.id } });
  await duenio.proyectoEquipo.create({ data: { tenantId: a.id, proyectoId: p.id, personaId: persona.id } });
  const h0 = await historial();
  assert.match((await como("recepcion", () => acc.marcarPrevision(form({ cuotaId: pagoL1.id, estado: "confirmado" })))).error ?? "", /permiso|Administración/, "Comercial no marca");
  assert.match((await como("duenia", () => acc.marcarPrevision(form({ cuotaId: pagoL1.id, estado: "confirmado" })))).error ?? "", /Administración/, "Dirección tampoco");
  await conRol("ADMINISTRACION");
  assert.equal((await como("recepcion", () => acc.marcarPrevision(form({ cuotaId: pagoL1.id, estado: "confirmado" })))).ok, true);
  assert.equal(await historial(), h0 + 1, "una fila en el historial");
  assert.equal((await como("recepcion", () => acc.marcarPrevision(form({ cuotaId: pagoL1.id, estado: "confirmado" })))).ok, false, "la misma marca dos veces no suma otra fila");
  assert.equal(await historial(), h0 + 1);
  const marca = await enA((tx) => tx.proyectoPrevisionEstado.findUniqueOrThrow({ where: { cuotaId: pagoL1.id } }));
  assert.deepEqual([marca.confirmado, marca.marcadoNombre, marca.marcadoPor], [true, "Recepción de prueba", a.recepcion.id]);

  // ── C-O09: adicional con aprobación interna ──
  const sinBase = await como("duenia", () => acc.crearAdicional(form({ proyectoId: p2.id, nombre: "Antes de aprobar" })));
  assert.match(sinBase.error ?? "", /después de aprobada la versión base/);
  assert.equal((await como("duenia", () => acc.crearAdicional(form({ proyectoId: p.id, nombre: "Pantalla extra" })))).ok, true);
  const ad = await enA((tx) => tx.proyectoAdicional.findFirstOrThrow({ where: { tenantId: a.id, proyectoId: p.id }, select: { id: true, numero: true } }));
  assert.equal(ad.numero, 1);
  const agregar = (campos: Record<string, string>) => como("duenia", () => acc.agregarLineaAdicional(form({ adicionalId: ad.id, ...campos })));
  assert.match((await agregar({ sector: "Otro", categoria: RUBROS[0], detalle: "x" })).error ?? "", /no está en la lista/);
  assert.equal((await agregar({ sector: "Producción", categoria: RUBROS[0], detalle: "Pantalla LED", supplierId: proveedores[0], cantidad: "2", costo: "250", precio: "400", anticipoPct: "40" })).ok, true);
  assert.equal((await agregar({ sector: "Logística", categoria: RUBROS[0], detalle: "Operadores", puestos: "2", horas: "5", dias: "1", costo: "10", precio: "20" })).ok, true);
  const enviarSinAprobar = await como("duenia", () => acc.enviarAdicional(form({ adicionalId: ad.id })));
  assert.match(enviarSinAprobar.error ?? "", /Falta la aprobación interna/);
  await conRol("COMERCIAL");
  assert.match((await como("recepcion", () => acc.aprobarAdicionalInterno(form({ adicionalId: ad.id })))).error ?? "", /los aprueba Dirección/, "Comercial no aprueba");
  await conRol("DIRECCION");
  assert.match((await como("recepcion", () => acc.aprobarAdicionalInterno(form({ adicionalId: ad.id })))).error ?? "", /Estás en el equipo/, "Dirección del equipo no aprueba");
  assert.equal((await como("duenia", () => acc.aprobarAdicionalInterno(form({ adicionalId: ad.id })))).ok, true);
  const aprobado = await enA((tx) => tx.proyectoAdicional.findUniqueOrThrow({ where: { id: ad.id } }));
  assert.equal(aprobado.aprobadoInternoPorId, a.duenia.id);
  assert.ok(aprobado.aprobadoInternoPor && aprobado.aprobadoInternoEl, "queda quién y cuándo");

  // ── C-O11: enviado, aprobado por el cliente → cuotas propias, el base igual, el tope sube exacto ──
  const baseAntes = (await cuotas()).filter((c) => !c.clave?.includes(":adic:"));
  const topeAntes = (await enA((tx) => cobranzasDelNegocio(a.id, {}, 0, [p.id], tx as never))).get(p.id)!;
  assert.equal((await como("duenia", () => acc.enviarAdicional(form({ adicionalId: ad.id })))).ok, true);
  assert.equal((await como("duenia", () => acc.responderAdicional(form({ adicionalId: ad.id, respuesta: "APROBADO", nombre: "Cliente por teléfono" })))).ok, true);
  const todas = await cuotas();
  assert.deepEqual(todas.filter((c) => !c.clave?.includes(":adic:")), baseAntes, "las cuotas del base no cambian");
  // Precio: 2 × 400 + (2 × 5 × 1) × 20 = 1000; con IVA 21 %: 1210. Costo de la línea con proveedor: 2 × 250 = 500, 40 % = 200.
  const deAdicional = todas.filter((c) => c.clave?.includes(":adic:"));
  assert.equal(deAdicional.filter((c) => c.tipo === "COBRO").reduce((s, c) => s + c.monto, 0), 1210);
  assert.deepEqual(deAdicional.filter((c) => c.tipo === "PAGO").map((c) => c.monto).sort((x, y) => x - y), [200, 300]);
  const topeDespues = (await enA((tx) => cobranzasDelNegocio(a.id, {}, 0, [p.id], tx as never))).get(p.id)!;
  assert.equal(Math.round((topeDespues.porCobrar - topeAntes.porCobrar) * 100), 121_000, "el tope sube exactamente el precio con IVA");
  assert.equal((await como("duenia", () => acc.responderAdicional(form({ adicionalId: ad.id, respuesta: "APROBADO", nombre: "Otra vez" })))).ok, false, "no se responde dos veces");

  // ── Aislamiento: B, como `app_rls`, no ve nada de lo de A ──
  const cli = new pg.Client({ connectionString: base.urlApp });
  await cli.connect();
  try {
    await cli.query("BEGIN");
    await cli.query("SELECT set_config('app.current_tenant_id', $1, true)", [b.id]);
    for (const tabla of ["ProyectoAdicional", "ProyectoAdicionalLinea", "ProyectoLineaDetalle", "ProyectoPrevisionEstado"]) {
      const r = await cli.query(`SELECT count(*)::int AS n FROM "${tabla}"`);
      assert.equal(r.rows[0].n, 0, `B no ve ${tabla} de A`);
    }
    await cli.query("ROLLBACK");
  } finally {
    await cli.end();
  }
});
