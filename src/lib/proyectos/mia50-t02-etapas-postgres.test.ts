// ============================================================================
// MIA-50 T02 · etapas y compuertas contra Postgres real: base efímera migrada, la app como `app_rls` y la Server Action
// real con sesión. Esperados escritos a mano ANTES del código (plan MIA-50 § 2.3):
//
//  C-O01  Las 4 etapas agrupan; ningún valor de `Proyecto.etapa` cambia y las cuotas de todos los proyectos quedan
//         idénticas después de leer el tablero. Proyectos por columna = conteo a mano.
//  C-O02  Mover guarda quién y cuándo, y exige «pipeline» en editar: Diseño (pipeline en ver) → 0 filas.
//  C-O06  Calendario: hitos del mes = a mano; filtros por persona, etapa y proyecto; Diseño sin montos.
//  C-O03  Pasar sin cumplir: aviso con la lista exacta (con el valor del rubro, avisa y pasa). Con la compuerta en
//         «frena»: no pasa (0 filas, cuotas iguales); forzar como Comercial: rechazo, 0 filas; forzar como Dirección
//         con motivo: pasa y deja 1 fila «Compuerta forzada» con autor y motivo.
//         MIA-234 · «1 a»: sin versión aprobada no se entra en Confirmado, ni forzando, así que la compuerta de Comercial
//         (que sólo pedía la aprobación) ya no se cruza sin cumplir. C-O03 se prueba con la de Producción: Desarme →
//         Cierre con el evento sin terminar.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";

const laBase = baseEfimeraDelArchivo();
const AVISO_EVENTO = "Que termine el evento (la fecha de fin todavía no pasó).";

let preparado: ReturnType<typeof armar> | null = null;
async function armar(base: BaseEfimera) {
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a } = base;
  const t0 = await duenio.tenant.findUniqueOrThrow({ where: { id: a.id }, select: { modules: true } });
  await duenio.tenant.update({ where: { id: a.id }, data: { modules: [...new Set([...t0.modules, "proyectos"])] } });
  const ficha = await import("./acciones-ficha");
  const fichaServer = await import("./ficha.server");
  const gestion = await import("./gestion.server");
  const { agruparPorEtapa } = await import("./etapas-core");
  const { valorDelNegocio } = await import("./parametros/leer.server");

  const cuenta = (nombre: string) => duenio.user.create({ data: { tenantId: a.id, name: nombre, email: `${nombre.toLowerCase()}@mia50t02.test`, passwordHash: "x", role: "RECEPTION" }, select: { id: true } });
  const [com, dis] = await Promise.all([cuenta("Comercial"), cuenta("Disenio")]);
  await duenio.proyectoPersona.create({ data: { tenantId: a.id, userId: com.id, nombre: "Comercial", email: "comercial@mia50t02.test", rol: "COMERCIAL" } });
  await duenio.proyectoPersona.create({ data: { tenantId: a.id, userId: dis.id, nombre: "Disenio", email: "disenio@mia50t02.test", rol: "DISENO" } });
  const usuarios = { direccion: a.duenia.id, com: com.id, dis: dis.id };

  const como = async <R>(usuarioId: string, fn: () => Promise<R>) => {
    try {
      return await ejecutarAccion({ negocio: a, usuario: { id: usuarioId } }, fn);
    } catch (e) {
      return { tipo: "error" as const, mensaje: e instanceof Error ? e.message : String(e) };
    }
  };
  const valor = <R>(s: Awaited<ReturnType<typeof como<R>>>): R => {
    assert.equal(s.tipo, "respuesta", JSON.stringify(s));
    return (s as { valor: R }).valor;
  };

  let numero = (await duenio.proyecto.count()) + 500;
  const EVENTO = new Date("2027-03-10T12:00:00-03:00");
  /** Proyecto con una versión ENVIADA (o APROBADA) de $ 1.000 + IVA 21 % y sus cuotas regeneradas. */
  const proyecto = async (etapa: string, estadoVersion = "ENVIADO") => {
    const p = await duenio.proyecto.create({
      data: { tenantId: a.id, numero: ++numero, clientId: a.clientes[0], nombre: `T02 ${numero}`, servicio: "EVENTOS", etapa, brief: "Stand", responsable: "Comercial", fechaEvento: EVENTO },
      select: { id: true },
    });
    const pres = await duenio.proyectoPresupuesto.create({ data: { tenantId: a.id, proyectoId: p.id, version: 1, estado: estadoVersion, token: `t02-${p.id}`, ivaPct: 21 }, select: { id: true } });
    await duenio.proyectoItem.create({ data: { tenantId: a.id, presupuestoId: pres.id, rubro: "General", descripcion: "Stand", cantidad: 1, precio: 1000 } });
    valor(await como(usuarios.direccion, () => gestion.regenerarCuotas(a.id, p.id)));
    return p.id;
  };
  const cambios = (proyectoId: string) => duenio.proyectoCambio.findMany({ where: { proyectoId }, orderBy: { createdAt: "asc" }, select: { campo: true, antes: true, despues: true, autor: true, createdAt: true } });
  const etapa = async (id: string) => (await duenio.proyecto.findUniqueOrThrow({ where: { id }, select: { etapa: true } })).etapa;
  const cuotas = async (proyectoId: string) =>
    JSON.stringify(await duenio.proyectoCuota.findMany({ where: { proyectoId }, orderBy: [{ clave: "asc" }, { createdAt: "asc" }], select: { clave: true, tipo: true, monto: true, venceEl: true, prevista: true, pagadoEl: true, anuladoEl: true } }));
  const ponerCompuerta = async (produccion: "AVISA" | "FRENA") => {
    const lista = (await import("./parametros/catalogo")).defDe("etapas.lista").rubro.map((e) => (e.id === "PRODUCCION" ? { ...e, compuerta: produccion } : e));
    await duenio.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${a.id}, true)`;
      await tx.proyectoParametro.deleteMany({ where: { tenantId: a.id, clave: "etapas.lista" } });
      await tx.proyectoParametro.create({ data: { tenantId: a.id, clave: "etapas.lista", valor: JSON.parse(JSON.stringify(lista)), actualizadoPor: a.duenia.id, actualizadoNombre: "Test" } });
    });
  };
  /** MIA-236 · Z3: las etapas con fecha real (O05) del proyecto. Sólo un pase efectivo escribe la de la etapa que se entra. */
  const fechasReales = (proyectoId: string) =>
    duenio.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${a.id}, true)`;
      return (await tx.proyectoEtapaFecha.findMany({ where: { tenantId: a.id, proyectoId }, orderBy: { etapaId: "asc" }, select: { etapaId: true } })).map((f) => f.etapaId);
    });
  return { a, duenio, ficha, fichaServer, gestion, agruparPorEtapa, valorDelNegocio, como, valor, usuarios, proyecto, cambios, etapa, cuotas, fechasReales, ponerCompuerta };
}

async function preparar(t: import("node:test").TestContext) {
  const base = await laBase(t);
  if (!base) return null;
  preparado ??= armar(base);
  return preparado;
}

test("C-O01 · el tablero agrupa en 4 etapas sin tocar ningún estado ni ninguna cuota; conteo por columna a mano", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const ids = [await p.proyecto("PEDIDO"), await p.proyecto("PROPUESTA"), await p.proyecto("APROBADO", "APROBADO"), await p.proyecto("ARMADO", "APROBADO"), await p.proyecto("CIERRE", "APROBADO")];
  const volcado = async () => JSON.stringify(await Promise.all(ids.map(async (id) => [id, await p.etapa(id), await p.cuotas(id)])));
  const antes = await volcado();
  const tarjetas = p.valor(await p.como(p.usuarios.direccion, async () => p.fichaServer.tableroPipeline(await p.gestion.actorActual())));
  const lista = p.valor(await p.como(p.usuarios.direccion, () => p.valorDelNegocio(p.a.id, "etapas.lista")));
  const nuestras = tarjetas.filter((x) => ids.includes(x.id)).map((x) => ({ id: x.id, etapa: x.etapa, perdido: false }));
  const { columnas } = p.agruparPorEtapa(lista, nuestras);
  // A mano: Brief {PEDIDO} = 1 · Comercial {PROPUESTA} = 1 · Producción {APROBADO, ARMADO} = 2 · Cierre {CIERRE} = 1.
  assert.deepEqual(columnas.map((c) => [c.etapa.nombre, c.items.length]), [["Brief o idea", 1], ["Comercial", 1], ["Producción", 2], ["Cierre y postventa", 1]]);
  assert.equal(await volcado(), antes, "estados y cuotas, idénticos fila por fila");
});

test("C-O02 · mover guarda quién y cuándo; Diseño (pipeline en ver) no mueve: 0 filas", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await p.proyecto("PEDIDO");
  const desde = new Date();
  const sinPermiso = await p.como(p.usuarios.dis, () => p.ficha.moverProyecto({ id, destino: "DISENO" }));
  assert.ok(sinPermiso.tipo !== "respuesta" || !(sinPermiso.valor as { ok: boolean }).ok, `Diseño no mueve (vino ${JSON.stringify(sinPermiso)})`);
  assert.equal((await p.cambios(id)).length, 0, "0 filas");
  assert.equal(await p.etapa(id), "PEDIDO");
  const r = p.valor(await p.como(p.usuarios.com, () => p.ficha.moverProyecto({ id, destino: "DISENO" })));
  assert.equal(r.ok, true, JSON.stringify(r));
  const filas = await p.cambios(id);
  assert.equal(filas.length, 1);
  assert.equal(filas[0].campo, "Etapa");
  assert.equal(filas[0].autor, "Comercial");
  assert.equal(filas[0].antes, "Lead / brief");
  assert.equal(filas[0].despues, "Desglose");
  assert.ok(filas[0].createdAt >= new Date(desde.getTime() - 1000), "cuándo");
});

test("C-O03 · con el valor del rubro, avisa con la lista exacta y pasa", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  await p.ponerCompuerta("AVISA");
  const id = await p.proyecto("DESARME", "APROBADO");
  const r = p.valor(await p.como(p.usuarios.com, () => p.ficha.moverProyecto({ id, destino: "CIERRE" })));
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal((r as { aviso?: string }).aviso, `Para pasar a Cierre y postventa falta: ${AVISO_EVENTO}`);
  assert.equal(await p.etapa(id), "CIERRE");
  assert.deepEqual((await p.cambios(id)).map((c) => c.campo), ["Etapa", "Compuerta (aviso)"]);
});

test("C-O03 · con «frena»: no pasa; Comercial no fuerza; Dirección fuerza con motivo y queda 1 fila con autor y motivo", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  await p.ponerCompuerta("FRENA");
  try {
    const id = await p.proyecto("DESARME", "APROBADO");
    const cuotas0 = await p.cuotas(id);
    const sinForzar = p.valor(await p.como(p.usuarios.com, () => p.ficha.moverProyecto({ id, destino: "CIERRE" })));
    assert.equal(sinForzar.ok, false);
    assert.deepEqual((sinForzar as { faltan?: string[] }).faltan, [AVISO_EVENTO], "la lista exacta");
    assert.equal((sinForzar as { puedeForzar?: boolean }).puedeForzar, false);
    const comercial = p.valor(await p.como(p.usuarios.com, () => p.ficha.moverProyecto({ id, destino: "CIERRE", forzar: true, motivoForzar: "El evento terminó antes" })));
    assert.equal(comercial.ok, false, "Comercial no fuerza");
    const sinMotivo = p.valor(await p.como(p.usuarios.direccion, () => p.ficha.moverProyecto({ id, destino: "CIERRE", forzar: true, motivoForzar: "  " })));
    assert.equal(sinMotivo.ok, false, "sin motivo no se fuerza");
    assert.equal((await p.cambios(id)).length, 0, "tres rechazos: 0 filas");
    assert.equal(await p.etapa(id), "DESARME");
    assert.equal(await p.cuotas(id), cuotas0, "las cuotas, idénticas");
    // MIA-236 · Z3: Desarme y Cierre generan las mismas cuotas, así que la línea de arriba ya no distingue un pase indebido
    // (antes, Propuesta → Confirmado cruzaba el borde de las cuotas). El testigo que sí distingue, aparte de la etapa y del
    // historial: la fecha real de entrada a Cierre (O05), que sólo escribe un pase efectivo. Abajo, la contraprueba.
    assert.deepEqual(await p.fechasReales(id), [], "tres rechazos: ninguna fecha real de Cierre");
    const dir = p.valor(await p.como(p.usuarios.direccion, () => p.ficha.moverProyecto({ id, destino: "CIERRE", forzar: true, motivoForzar: "Se levantó un día antes" })));
    assert.equal(dir.ok, true, JSON.stringify(dir));
    assert.equal(await p.etapa(id), "CIERRE");
    assert.deepEqual(await p.fechasReales(id), ["CIERRE"], "el pase forzado sí deja la fecha real de Cierre: el testigo distingue");
    const forzadas = (await p.cambios(id)).filter((c) => c.campo === "Compuerta forzada");
    assert.equal(forzadas.length, 1);
    assert.equal(forzadas[0].antes, AVISO_EVENTO);
    assert.equal(forzadas[0].despues, "Forzó Dirección: Se levantó un día antes");
    assert.ok(forzadas[0].autor.length > 0, "con autor");
  } finally {
    await p.ponerCompuerta("AVISA");
  }
});

// C-O06 · Calendario: hitos del mes por proyecto = conteo a mano; cada filtro (persona, etapa, proyecto) devuelve el
// subconjunto esperado; como Diseño, ni un monto. Junio de 2027: ningún otro test de este archivo pone fechas ahí.
test("C-O06 · calendario: hitos del mes = a mano; cada filtro da su subconjunto; Diseño no ve montos", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { a, duenio } = p;
  const d = (s: string) => new Date(`${s}T12:00:00-03:00`);
  let n = 9000;
  const crear = (etapa: string, responsable: string, fechas: { fechaEvento: Date; fechaFin?: Date; fechaArmado?: Date; fechaDesarme?: Date }) =>
    duenio.proyecto.create({ data: { tenantId: a.id, numero: ++n, clientId: a.clientes[0], nombre: `Cal ${n}`, servicio: "EVENTOS", etapa, brief: "x", responsable, ...fechas }, select: { id: true } }).then((x) => x.id);
  // X: Producción, de Comercial: evento + armado + desarme = 3 hitos. Y: Brief, Diseño en el equipo: 1. Z: Producción, dos días: 2.
  const X = await crear("APROBADO", "Comercial", { fechaEvento: d("2027-06-10"), fechaArmado: d("2027-06-09"), fechaDesarme: d("2027-06-11") });
  const Y = await crear("PEDIDO", "Otra", { fechaEvento: d("2027-06-20") });
  const Z = await crear("PRODUCCION", "Otra", { fechaEvento: d("2027-06-25"), fechaFin: d("2027-06-26") });
  const personas = await duenio.proyectoPersona.findMany({ where: { tenantId: a.id }, select: { id: true, nombre: true } });
  const disenio = personas.find((x) => x.nombre === "Disenio")!;
  await duenio.proyectoEquipo.create({ data: { tenantId: a.id, proyectoId: Y, personaId: disenio.id } });
  await duenio.proyectoCuota.create({ data: { tenantId: a.id, proyectoId: X, tipo: "COBRO", concepto: "Anticipo", monto: 1210, venceEl: d("2027-06-15") } });
  await duenio.proyectoCuota.create({ data: { tenantId: a.id, proyectoId: null, tipo: "PAGO", concepto: "Alquiler", monto: 500, venceEl: d("2027-06-16") } });

  const lecturas = await import("./gestion-lecturas.server");
  const core = await import("./gestion-lecturas-core");
  const desde = new Date("2027-06-01T00:00:00-03:00");
  const hasta = new Date("2027-06-30T23:59:59.999-03:00");
  const nuestros = new Set([X, Y, Z]);
  const leer = (usuario: string, sp: { persona?: string; etapa?: string; proyecto?: string }) =>
    p.como(usuario, async () => {
      const actor = await p.gestion.actorActual();
      const etapas = await p.valorDelNegocio(a.id, "etapas.lista");
      const filtro = core.filtroDelCalendario(sp, etapas, personas, [{ id: X }, { id: Y }, { id: Z }]);
      const todo = await lecturas.entradasCalendario(actor, desde, hasta, filtro);
      return todo.filter((e) => (e.proyectoId ? nuestros.has(e.proyectoId) : true));
    });
  const porProyecto = (es: { proyectoId: string | null }[]) => {
    const c: Record<string, number> = {};
    const nombre = new Map([[X, "X"], [Y, "Y"], [Z, "Z"]]);
    for (const e of es) {
      const k = (e.proyectoId && nombre.get(e.proyectoId)) || "empresa";
      c[k] = (c[k] ?? 0) + 1;
    }
    return c;
  };
  const HITOS = new Set(["EVENTO", "EVENTO_TENTATIVO", "MONTAJE"]);

  const todo = p.valor(await leer(p.usuarios.direccion, {}));
  assert.deepEqual(porProyecto(todo.filter((e) => HITOS.has(e.tipo))), { X: 3, Y: 1, Z: 2 }, "hitos del mes por proyecto, a mano");
  assert.deepEqual(porProyecto(todo), { X: 4, Y: 1, Z: 2, empresa: 1 }, "más la cuota de X y la de la empresa");

  const comercial = personas.find((x) => x.nombre === "Comercial")!;
  assert.deepEqual(porProyecto(p.valor(await leer(p.usuarios.direccion, { persona: comercial.id }))), { X: 4 }, "persona Comercial: su proyecto, sin lo de la empresa");
  assert.deepEqual(porProyecto(p.valor(await leer(p.usuarios.direccion, { persona: disenio.id }))), { Y: 1 }, "persona Diseño: el proyecto donde está en el equipo");
  assert.deepEqual(porProyecto(p.valor(await leer(p.usuarios.direccion, { etapa: "PRODUCCION" }))), { X: 4, Z: 2 }, "etapa Producción: X y Z, sin lo de la empresa");
  assert.deepEqual(porProyecto(p.valor(await leer(p.usuarios.direccion, { proyecto: Y }))), { Y: 1 }, "proyecto Y");
  assert.deepEqual(porProyecto(p.valor(await leer(p.usuarios.direccion, { proyecto: "no-existe" }))), { X: 4, Y: 1, Z: 2, empresa: 1 }, "un id ajeno no filtra");

  const comoDisenio = p.valor(await leer(p.usuarios.dis, {}));
  assert.ok(comoDisenio.length > 0, "Diseño ve hitos");
  assert.deepEqual(comoDisenio.filter((e) => e.monto !== null || e.tipo === "COBRO" || e.tipo === "PAGO"), [], "Diseño: ni un monto");
});
