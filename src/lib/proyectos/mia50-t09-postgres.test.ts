// ============================================================================
// MIA-50 T09 · etapas II, obligaciones, cancelado y resultado contra Postgres real: base efímera migrada (M7b incluida),
// la app como `app_rls` y las Server Actions reales con sesión. Esperados escritos a mano ANTES de correr:
//
//  RLS    «B no ve lo de A»: con el negocio B, 0 filas de las 3 tablas de M7b; insertar con el tenantId de A, rechazado.
//  Carrera  4 cancelaciones a la vez → 1 sale, 1 fila de cancelación, 1 «Cancelado» en el historial.
//           5 altas de obligación con la misma clave de envío → 1 fila. 2 barridos de avisos a la vez → 1 aviso.
//  C-O04  Dirección cancela un aprobado con 2 cuotas pendientes → 2 anuladas, la fila con criterio y autor. Comercial
//         no cancela (0 filas) ni reabre; Dirección reabre y la fila queda con `reabiertoEl`.
//  C-O05  La prevista se guarda con su renglón de historial; la real del pase = la hora del renglón «Etapa».
//  C-O07  Obligación que vence el 20/3 con 3 días de aviso: el 16/3 no avisa, el 17/3 avisa 1 vez, el 18/3 0.
//  C-O49  Marzo 2031: P1 1.000 − 400 = 600, P2 1.000 − 700 = 300 (P3 es de abril: no entra) → 900; administración
//         150 + 50 (el anulado de 999 no cuenta) = 200 → empresa 700. Comercial no ve Dirección.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";

const laBase = baseEfimeraDelArchivo();

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
  const etapasAcc = await import("./acciones-etapas");
  const ficha = await import("./acciones-ficha");
  const gestion = await import("./gestion.server");
  const m7b = await import("./etapas-m7b.server");
  const resultado = await import("./resultado.server");
  const { tenantTransaction } = await import("@/lib/rls");

  const cuenta = (nombre: string) => duenio.user.create({ data: { tenantId: a.id, name: nombre, email: `${nombre.toLowerCase()}@mia50t09.test`, passwordHash: "x", role: "RECEPTION" }, select: { id: true } });
  const com = await cuenta("Comercial");
  const personaCom = await duenio.proyectoPersona.create({ data: { tenantId: a.id, userId: com.id, nombre: "Comercial", email: "comercial@mia50t09.test", rol: "COMERCIAL" }, select: { id: true } });
  const usuarios = { direccion: a.duenia.id, com: com.id };

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
  const form = (campos: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) f.set(k, v);
    return f;
  };

  let numero = (await duenio.proyecto.count()) + 900;
  /** Proyecto con una versión de $ 1.000 + IVA 21 %, sus cuotas regeneradas y, si se pide, un gasto cargado sin IVA (el costo real). */
  const proyecto = async (etapa: string, estadoVersion = "ENVIADO", o: { evento?: Date; costoReal?: number } = {}) => {
    const p = await duenio.proyecto.create({
      data: { tenantId: a.id, numero: ++numero, clientId: a.clientes[0], nombre: `T09 ${numero}`, servicio: "EVENTOS", etapa, brief: "Stand", responsable: "Comercial", fechaEvento: o.evento ?? new Date("2027-03-10T12:00:00-03:00") },
      select: { id: true },
    });
    const pres = await duenio.proyectoPresupuesto.create({ data: { tenantId: a.id, proyectoId: p.id, version: 1, estado: estadoVersion, token: `t09-${p.id}`, ivaPct: 21 }, select: { id: true } });
    await duenio.proyectoItem.create({ data: { tenantId: a.id, presupuestoId: pres.id, rubro: "General", descripcion: "Stand", cantidad: 1, precio: 1000 } });
    if (o.costoReal != null) await duenio.proyectoGasto.create({ data: { tenantId: a.id, proyectoId: p.id, descripcion: "Materiales", neto: o.costoReal, iva: 0 } });
    valor(await como(usuarios.direccion, () => gestion.regenerarCuotas(a.id, p.id)));
    return p.id;
  };
  const cambios = (proyectoId: string) => duenio.proyectoCambio.findMany({ where: { proyectoId }, orderBy: { createdAt: "asc" }, select: { campo: true, antes: true, despues: true, autor: true, createdAt: true } });
  /** El dueño, con el negocio A puesto: las tablas de M7b y M1 tienen FORCE ROW LEVEL SECURITY (también para el dueño). */
  type Tx = Parameters<Parameters<typeof duenio.$transaction>[0]>[0];
  const enA = <R>(fn: (tx: Tx) => Promise<R>) =>
    duenio.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${a.id}, true)`;
      return fn(tx);
    });
  const pendientes = (proyectoId: string) => duenio.proyectoCuota.count({ where: { proyectoId, anuladoEl: null, pagadoEl: null } });
  return { a, b, duenio, enA, etapasAcc, ficha, m7b, resultado, tenantTransaction, como, valor, form, usuarios, personaCom, proyecto, cambios, pendientes };
}

async function preparar(t: import("node:test").TestContext) {
  const base = await laBase(t);
  if (!base) return null;
  preparado ??= armar(base);
  return preparado;
}

const ok = (r: { ok: boolean }) => assert.equal(r.ok, true, JSON.stringify(r));

test("RLS · «B no ve lo de A»: 0 filas de las tablas de M7b con el negocio B, y no puede escribir con el tenantId de A", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await p.proyecto("PROPUESTA");
  ok(p.valor(await p.como(p.usuarios.com, () => p.etapasAcc.guardarFechasPrevistas(p.form({ id, "prevista-CIERRE": "2027-03-20" })))));
  ok(p.valor(await p.como(p.usuarios.com, () => p.etapasAcc.crearObligacion(p.form({ claveEnvio: "rls-1", tipo: "Otra", titulo: "Seguro", responsableId: p.personaCom.id, venceEl: "2027-03-01", diasAviso: "", proyectoId: id })))));
  const contar = (tenantId: string) =>
    p.tenantTransaction(async (tx) => [await tx.proyectoEtapaFecha.count(), await tx.proyectoObligacion.count(), await tx.proyectoCancelacion.count()], { tenantId });
  const deA = await contar(p.a.id);
  assert.ok(deA[0] >= 1 && deA[1] >= 1, `A ve lo suyo (${deA})`);
  assert.deepEqual(await contar(p.b.id), [0, 0, 0], "B no ve nada de A");
  await assert.rejects(
    p.tenantTransaction((tx) => tx.proyectoObligacion.create({ data: { tenantId: p.a.id, tipo: "Otra", titulo: "Intruso", responsableNombre: "X", venceEl: new Date(), diasAviso: 1, envio: "intruso", creadaPor: "B" } }), { tenantId: p.b.id }),
    "B no inserta con el tenantId de A",
  );
});

test("Carrera · 4 cancelaciones a la vez: sale 1, 1 fila de cancelación y 1 «Cancelado» en el historial", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await p.proyecto("APROBADO", "APROBADO");
  const rs = await Promise.all(Array.from({ length: 4 }, () => p.como(p.usuarios.direccion, () => p.etapasAcc.cancelarProyecto(p.form({ id, motivo: "El cliente suspendió el evento" })))));
  const oks = rs.filter((r) => r.tipo === "respuesta" && (r.valor as { ok: boolean }).ok);
  assert.equal(oks.length, 1, JSON.stringify(rs));
  assert.equal(await p.enA((tx) => tx.proyectoCancelacion.count({ where: { proyectoId: id } })), 1);
  assert.equal((await p.cambios(id)).filter((c) => c.despues?.startsWith("Cancelado")).length, 1);
});

test("Carrera · 5 altas de obligación con la misma clave de envío: 1 fila", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const campos = { claveEnvio: "doble-clic-1", tipo: "Otra", titulo: "Pagar el ART", responsableId: p.personaCom.id, venceEl: "2027-04-10", diasAviso: "2", proyectoId: "" };
  const rs = await Promise.all(Array.from({ length: 5 }, () => p.como(p.usuarios.com, () => p.etapasAcc.crearObligacion(p.form(campos)))));
  for (const r of rs) ok(p.valor(r));
  assert.equal(await p.enA((tx) => tx.proyectoObligacion.count({ where: { envio: "doble-clic-1" } })), 1);
  assert.equal(await p.duenio.proyectoCambio.count({ where: { entidad: "Obligación", despues: { contains: "Pagar el ART" } } }), 1, "un solo renglón de historial");
});

test("C-O04 · Dirección cancela un aprobado: cuotas pendientes anuladas, la fila con criterio; Comercial no cancela ni reabre", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await p.proyecto("APROBADO", "APROBADO");
  const antes = await p.pendientes(id);
  assert.ok(antes > 0, "el aprobado tiene cuotas pendientes");
  const deComercial = p.valor(await p.como(p.usuarios.com, () => p.etapasAcc.cancelarProyecto(p.form({ id, motivo: "No va" }))));
  assert.equal(deComercial.ok, false);
  assert.equal(await p.enA((tx) => tx.proyectoCancelacion.count({ where: { proyectoId: id } })), 0, "0 filas");
  assert.equal(await p.pendientes(id), antes, "cuotas intactas");
  const sinMotivo = p.valor(await p.como(p.usuarios.direccion, () => p.etapasAcc.cancelarProyecto(p.form({ id, motivo: " " }))));
  assert.equal(sinMotivo.ok, false, "sin motivo no cancela");

  ok(p.valor(await p.como(p.usuarios.direccion, () => p.etapasAcc.cancelarProyecto(p.form({ id, motivo: "El cliente suspendió el evento" })))));
  assert.equal(await p.pendientes(id), 0, "ninguna cuota pendiente viva");
  const fila = await p.enA((tx) => tx.proyectoCancelacion.findFirstOrThrow({ where: { proyectoId: id } }));
  assert.equal(fila.cuotasAnuladas, antes);
  assert.equal(fila.criterio, "SOLO_DIRECCION_SIN_LIQUIDACION");
  assert.equal(fila.motivo, "El cliente suspendió el evento");
  assert.equal(fila.reabiertoEl, null);
  const pr = await p.duenio.proyecto.findUniqueOrThrow({ where: { id }, select: { perdidoEl: true, motivoPerdida: true, etapa: true } });
  assert.ok(pr.perdidoEl);
  assert.equal(pr.motivoPerdida, "Cancelado: El cliente suspendió el evento");

  const reabreCom = p.valor(await p.como(p.usuarios.com, () => p.ficha.moverProyecto({ id, destino: "APROBADO" })));
  assert.equal(reabreCom.ok, false);
  assert.match((reabreCom as { error?: string }).error ?? "", /sólo Dirección lo reabre/);
  ok(p.valor(await p.como(p.usuarios.direccion, () => p.ficha.moverProyecto({ id, destino: "APROBADO" }))));
  const reabierta = await p.enA((tx) => tx.proyectoCancelacion.findFirstOrThrow({ where: { proyectoId: id } }));
  assert.ok(reabierta.reabiertoEl, "queda la marca de reapertura");
  assert.equal((await p.duenio.proyecto.findUniqueOrThrow({ where: { id }, select: { perdidoEl: true } })).perdidoEl, null);
});

test("C-O05 · la prevista se guarda con su historial; la real del pase coincide con la hora del renglón «Etapa»", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await p.proyecto("PEDIDO");
  const invalida = p.valor(await p.como(p.usuarios.com, () => p.etapasAcc.guardarFechasPrevistas(p.form({ id, "prevista-COMERCIAL": "2027-02-01", "prevista-PRODUCCION": "2027-02-30" }))));
  assert.deepEqual(invalida, { ok: false, error: "La fecha de Producción no es válida." });
  assert.equal(await p.enA((tx) => tx.proyectoEtapaFecha.count({ where: { proyectoId: id } })), 0, "una fecha que no existe no guarda nada");
  ok(p.valor(await p.como(p.usuarios.com, () => p.etapasAcc.guardarFechasPrevistas(p.form({ id, "prevista-COMERCIAL": "2027-02-01" })))));
  const prevista = await p.enA((tx) => tx.proyectoEtapaFecha.findFirstOrThrow({ where: { proyectoId: id, etapaId: "COMERCIAL" } }));
  assert.equal(prevista.prevista?.toISOString(), new Date("2027-02-01T12:00:00-03:00").toISOString());
  assert.equal(prevista.real, null);
  assert.deepEqual((await p.cambios(id)).map((c) => c.campo), ["Fecha prevista: Comercial"]);
  // Guardar lo mismo otra vez no suma historial.
  ok(p.valor(await p.como(p.usuarios.com, () => p.etapasAcc.guardarFechasPrevistas(p.form({ id, "prevista-COMERCIAL": "2027-02-01" })))));
  assert.equal((await p.cambios(id)).length, 1);

  ok(p.valor(await p.como(p.usuarios.com, () => p.ficha.moverProyecto({ id, destino: "DISENO" }))));
  const pase = (await p.cambios(id)).find((c) => c.campo === "Etapa")!;
  const real = await p.enA((tx) => tx.proyectoEtapaFecha.findFirstOrThrow({ where: { proyectoId: id, etapaId: "COMERCIAL" } }));
  assert.equal(real.real?.toISOString(), pase.createdAt.toISOString(), "misma hora que el historial");
  assert.equal(real.realPor, "Comercial");
  assert.equal(real.prevista?.toISOString(), prevista.prevista?.toISOString(), "la prevista sigue");
  // Moverse dentro de la misma etapa (DISENO → RENDER, ambas Comercial) no pisa la real.
  ok(p.valor(await p.como(p.usuarios.com, () => p.ficha.moverProyecto({ id, destino: "RENDER" }))));
  const igual = await p.enA((tx) => tx.proyectoEtapaFecha.findFirstOrThrow({ where: { proyectoId: id, etapaId: "COMERCIAL" } }));
  assert.equal(igual.real?.toISOString(), real.real?.toISOString());
});

test("C-O07 · la obligación avisa una sola vez, el día que toca, aun con dos barridos a la vez", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  ok(p.valor(await p.como(p.usuarios.com, () => p.etapasAcc.crearObligacion(p.form({ claveEnvio: "o07", tipo: "Otra", titulo: "Renovar el seguro del depósito", responsableId: p.personaCom.id, venceEl: "2030-03-20", diasAviso: "3", proyectoId: "" })))));
  const o = await p.enA((tx) => tx.proyectoObligacion.findFirstOrThrow({ where: { envio: "o07" } }));
  assert.equal(o.diasAviso, 3);
  assert.equal(o.responsableNombre, "Comercial");
  const enCalendario = p.valor(await p.como(p.usuarios.com, () => p.m7b.obligacionesEntre(p.a.id, new Date("2030-03-01T00:00:00-03:00"), new Date("2030-03-31T23:59:59-03:00"), {}, true)));
  assert.deepEqual(enCalendario.map((x) => x.id), [o.id], "el calendario de marzo la trae");

  // Aislamiento: las obligaciones de los tests anteriores (ya vencidas) se cierran para que el barrido mire sólo ésta.
  await p.enA((tx) => tx.proyectoObligacion.updateMany({ where: { tenantId: p.a.id, id: { not: o.id }, hechaEl: null }, data: { hechaEl: new Date() } }));
  const barrer = (dia: string) => p.tenantTransaction((tx) => p.m7b.avisarObligaciones(tx, p.a.id, new Date(`${dia}T09:00:00-03:00`), null), { tenantId: p.a.id });
  const texto = { contains: "Renovar el seguro del depósito" };
  assert.equal(await barrer("2030-03-16"), 0, "4 días antes: todavía no");
  const [x, y] = await Promise.all([barrer("2030-03-17"), barrer("2030-03-17")]);
  assert.equal(x + y, 1, "dos barridos a la vez: uno solo avisa");
  assert.equal(await barrer("2030-03-18"), 0, "al día siguiente no repite");
  const avisos = await p.duenio.proyectoAviso.findMany({ where: { tenantId: p.a.id, texto }, select: { destinatario: true, texto: true } });
  assert.deepEqual(avisos, [{ destinatario: p.usuarios.com, texto: "Otra: Renovar el seguro del depósito vence en 3 días" }]);

  ok(p.valor(await p.como(p.usuarios.com, () => p.etapasAcc.marcarObligacionHecha(p.form({ id: o.id })))));
  // El doble clic no es un error: la segunda no cambia nada ni suma historial.
  ok(p.valor(await p.como(p.usuarios.com, () => p.etapasAcc.marcarObligacionHecha(p.form({ id: o.id })))));
  assert.equal(await p.duenio.proyectoCambio.count({ where: { entidadId: o.id, campo: "Hecha" } }), 1, "un solo «Hecha»");
  assert.equal(p.valor(await p.como(p.usuarios.com, () => p.m7b.obligacionesEntre(p.a.id, new Date("2030-03-01"), new Date("2030-04-01"), {}, true))).length, 0, "hecha, sale del calendario");
});

test("C-O49 · resultado de marzo 2031: proyectos 900, administración 200, empresa 700; Comercial no ve Dirección", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const marzo = new Date("2031-03-15T12:00:00-03:00");
  const p1 = await p.proyecto("APROBADO", "APROBADO", { evento: marzo, costoReal: 400 });
  const p2 = await p.proyecto("APROBADO", "APROBADO", { evento: marzo, costoReal: 700 });
  const p3 = await p.proyecto("APROBADO", "APROBADO", { evento: new Date("2031-04-15T12:00:00-03:00"), costoReal: 100 });
  const prov = await p.duenio.supplier.create({ data: { tenantId: p.a.id, name: "Proveedor T09" }, select: { id: true } });
  const comprobante = async (numero: string, centavos: number, categoria: string, anulado = false) => {
    const c = await p.enA((tx) => tx.proyectoComprobante.create({
      data: { tenantId: p.a.id, supplierId: prov.id, tipo: "C", numero, fecha: marzo, netoCentavos: BigInt(centavos), totalCentavos: BigInt(centavos), cargadoPorId: p.usuarios.direccion, cargadoNombre: "Test", anuladoEl: anulado ? marzo : null },
      select: { id: true },
    }));
    await p.enA((tx) => tx.proyectoComprobanteLinea.create({ data: { tenantId: p.a.id, comprobanteId: c.id, destino: "ADMINISTRACION", categoria, netoCentavos: BigInt(centavos), ivaTratamiento: "COSTO", costoCentavos: BigInt(centavos) } }));
  };
  await comprobante("0001-00000001", 15000, "Alquiler");
  await comprobante("0001-00000002", 5000, "Servicios");
  await comprobante("0001-00000003", 99900, "Alquiler", true);

  const r = p.valor(await p.como(p.usuarios.direccion, () => p.resultado.resultadoDeLaEmpresa(p.a.id, "2031-03")));
  const nuestros = r.proyectos.filter((x) => [p1, p2, p3].includes(x.id)).map((x) => [x.id, x.venta, x.costoReal, x.resultado]);
  assert.deepEqual(nuestros.sort(), [[p1, 1000, 400, 600], [p2, 1000, 700, 300]].sort());
  assert.equal(r.sumaProyectos, 900);
  assert.deepEqual(r.administracion, [{ categoria: "Alquiler", real: 150 }, { categoria: "Servicios", real: 50 }]);
  assert.equal(r.administracionReal, 200);
  assert.equal(r.resultadoEmpresa, 700);

  // La pantalla de Dirección entra por `exigirVer("direccion")`: Comercial vuelve a Inicio, Dirección pasa.
  const gestion = await import("./gestion.server");
  const comercial = await p.como(p.usuarios.com, () => gestion.exigirVer("direccion"));
  assert.notEqual(comercial.tipo, "respuesta", `Comercial no entra (vino ${JSON.stringify(comercial)})`);
  assert.equal((await p.como(p.usuarios.direccion, () => gestion.exigirVer("direccion"))).tipo, "respuesta");
});

// Vuelta MIA-154 (O49, NO CUMPLE de MIA-153): Dirección contaba la última versión (un borrador) y la ficha, la aprobada.
// Esperados escritos a mano ANTES de correr: v1 APROBADO $ 1.000 y v2 BORRADOR $ 1.500, gasto real 400 → Dirección y
// el resultado muestran venta 1.000 y resultado 600 (lo mismo que la cabecera de la ficha), no 1.500 y 1.100.
// Fijos de mayo 2031: Alquiler mensual $ 300 + Seguro anual de mayo USD 1 a $ 1.200 = 1.500 previsto; el inactivo de 999 y la
// patente única de junio, no. Real de administración en mayo: 250 → desvío 250 − 1.500 = −1.250.
test("C-O49 · Dirección cuenta la versión aprobada (no el borrador encima), igual que la ficha; previsto contra real de los fijos", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const mayo = new Date("2031-05-15T12:00:00-03:00");
  const id = await p.proyecto("APROBADO", "APROBADO", { evento: mayo, costoReal: 400 });
  const v2 = await p.duenio.proyectoPresupuesto.create({ data: { tenantId: p.a.id, proyectoId: id, version: 2, estado: "BORRADOR", token: `t09-v2-${id}`, ivaPct: 21 }, select: { id: true } });
  await p.duenio.proyectoItem.create({ data: { tenantId: p.a.id, presupuestoId: v2.id, rubro: "General", descripcion: "Stand más grande", cantidad: 1, precio: 1500 } });

  const empresa = await import("./empresa.server");
  const fichaServer = await import("./ficha.server");
  const dir = p.valor(await p.como(p.usuarios.direccion, () => empresa.proyectosConNumeros(p.a.id))).find((x) => x.id === id)!;
  assert.equal(dir.venta, 1000, "Dirección: la venta es la de la versión aprobada");
  assert.equal(dir.costoReal, 400);
  assert.equal(dir.margenReal, 600);
  const gestion = await import("./gestion.server");
  const cab = p.valor(await p.como(p.usuarios.direccion, async () => fichaServer.cabeceraFicha(await gestion.actorActual(), id)));
  assert.equal(cab!.totales.venta, dir.venta, "la ficha y Dirección dicen la misma venta");
  assert.equal(cab!.totalesViva.venta, 1500, "el borrador se sigue viendo en la pestaña Ficha");

  // Previsto contra real de los gastos fijos, por la lectura real (moneda convertida, inactivo y otro mes afuera).
  // El dólar del negocio a $ 1.200: el seguro de USD 1 se prevé en $ 1.200 (en pesos de hoy).
  await p.enA((tx) => tx.proyectoTipoCambio.upsert({ where: { tenantId_moneda: { tenantId: p.a.id, moneda: "USD" } }, create: { tenantId: p.a.id, moneda: "USD", porUnidad: 1200 }, update: { porUnidad: 1200 } }));
  const usd = 1200;
  await p.duenio.proyectoGastoFijo.createMany({
    data: [
      { tenantId: p.a.id, nombre: "Alquiler T09", frecuencia: "MENSUAL", monto: 300 },
      { tenantId: p.a.id, nombre: "Seguro T09", frecuencia: "ANUAL", monto: 1, moneda: "USD", fecha: new Date("2030-05-10T12:00:00-03:00") },
      { tenantId: p.a.id, nombre: "Viejo T09", frecuencia: "MENSUAL", monto: 999, activo: false },
      { tenantId: p.a.id, nombre: "Patente T09", tipo: "IMPUESTO", frecuencia: "UNICO", monto: 777, fecha: new Date("2031-06-10T12:00:00-03:00") },
    ],
  });
  const prov = await p.duenio.supplier.create({ data: { tenantId: p.a.id, name: "Proveedor T09 mayo" }, select: { id: true } });
  const c = await p.enA((tx) => tx.proyectoComprobante.create({
    data: { tenantId: p.a.id, supplierId: prov.id, tipo: "C", numero: "0002-00000001", fecha: mayo, netoCentavos: BigInt(25000), totalCentavos: BigInt(25000), cargadoPorId: p.usuarios.direccion, cargadoNombre: "Test" },
    select: { id: true },
  }));
  await p.enA((tx) => tx.proyectoComprobanteLinea.create({ data: { tenantId: p.a.id, comprobanteId: c.id, destino: "ADMINISTRACION", categoria: "Alquiler", netoCentavos: BigInt(25000), ivaTratamiento: "COSTO", costoCentavos: BigInt(25000) } }));

  const r = p.valor(await p.como(p.usuarios.direccion, () => p.resultado.resultadoDeLaEmpresa(p.a.id, "2031-05")));
  assert.deepEqual(r.proyectos.filter((x) => x.id === id).map((x) => [x.venta, x.costoReal, x.resultado]), [[1000, 400, 600]]);
  const nuestros = r.fijosPrevistos.filter((g) => g.nombre.endsWith(" T09")).sort((x, y) => x.nombre.localeCompare(y.nombre));
  assert.deepEqual(nuestros, [{ nombre: "Alquiler T09", previsto: 300 }, { nombre: "Seguro T09", previsto: usd }]);
  assert.equal(r.fijosPrevisto, 300 + usd);
  assert.equal(r.administracionReal, 250);
  assert.equal(r.desvioFijos, -1250);
});

// Vuelta MIA-154 (punto 2 de MIA-153): «Pagos a proveedores $ 3.206.500» al cancelar contra «Pagado a proveedores $ 0» en
// la ficha. Fuente: cancelar suma los gastos pagados; la ficha, sólo las cuotas de pago marcadas, así que un gasto cargado
// ya pagado salía de «A pagar» y no entraba en ningún lado. Esperados a mano ANTES de correr: gasto directo pagado
// 2.650.000 + IVA 556.500 = 3.206.500, más una cuota de pago de 1.000 marcada (su gasto-asiento de 1.000 no se cuenta dos
// veces) → la ficha dice «Pagado a proveedores» 3.207.500; cancelar lista los dos gastos pagados: 2 por 3.207.500.
test("Ficha · «Pagado a proveedores» cuenta el gasto cargado ya pagado, sin contar dos veces el de una cuota marcada", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await p.proyecto("APROBADO", "APROBADO");
  const ayer = new Date(Date.now() - 86_400_000);
  await p.duenio.proyectoGasto.create({ data: { tenantId: p.a.id, proyectoId: id, descripcion: "Estructura", neto: 2_650_000, iva: 556_500, pagadoEl: ayer, medio: "TRANSFERENCIA" } });
  // Lo que deja `marcarCuota` al pagar una cuota de proveedor: la cuota marcada, su gasto pagado y el enlace «Asiento».
  const cuota = await p.duenio.proyectoCuota.create({ data: { tenantId: p.a.id, proyectoId: id, tipo: "PAGO", concepto: "Anticipo proveedor", monto: 1000, venceEl: ayer, pagadoEl: ayer }, select: { id: true } });
  const asiento = await p.duenio.proyectoGasto.create({ data: { tenantId: p.a.id, proyectoId: id, descripcion: "Anticipo proveedor", neto: 1000, iva: 0, pagadoEl: ayer, medio: "TRANSFERENCIA" }, select: { id: true } });
  await p.duenio.proyectoCambio.create({ data: { tenantId: p.a.id, proyectoId: id, entidad: "ProyectoCuota", entidadId: cuota.id, campo: "Asiento", despues: asiento.id, autor: "Test" } });

  const fichaServer = await import("./ficha.server");
  const gestion = await import("./gestion.server");
  const fin = p.valor(await p.como(p.usuarios.direccion, async () => {
    const a = await gestion.actorActual();
    const cab = (await fichaServer.cabeceraFicha(a, id))!;
    return (await fichaServer.datosResumen(a, cab, fichaServer.vistaDe(a))).finanzas!;
  }));
  assert.equal(fin.pagado, 3_207_500);

  ok(p.valor(await p.como(p.usuarios.direccion, () => p.etapasAcc.cancelarProyecto(p.form({ id, motivo: "Se cayó la feria" })))));
  const fila = await p.enA((tx) => tx.proyectoCancelacion.findFirstOrThrow({ where: { proyectoId: id }, select: { pendientes: true } }));
  const linea = (fila.pendientes as string[]).find((x) => x.startsWith("Pagos a proveedores"));
  assert.match(linea ?? "", /^Pagos a proveedores: 2 por \$\s?3\.207\.500\b/, linea);
});

// Vuelta 2 (MIA-161): el gasto de una parte pagada sigue siendo «Pagado» aunque su cuota deje de correr (cancelar la anula,
// o el plan nuevo la saca). Esperados a mano: ítem de costo 2.000 con proveedor → anticipo 1.000 + saldo 1.000; se pagan 400
// del anticipo → la ficha dice 400 (no 800: la cuota viva ya lo cuenta). Anulada la cuota → sigue 400, como lo lista cancelar.
let parteN = 0;
async function fichaPagadoCon400(p: NonNullable<Awaited<ReturnType<typeof preparar>>>) {
  const proveedor = (await p.duenio.supplier.create({ data: { tenantId: p.a.id, name: `Proveedor T09 ${++parteN}` }, select: { id: true } })).id;
  const evento = new Date(Date.now() + 40 * 86_400_000);
  const pr = await p.duenio.proyecto.create({
    data: { tenantId: p.a.id, numero: 990_000 + parteN, clientId: p.a.clientes[0], nombre: "T09 parte", servicio: "EVENTOS", etapa: "APROBADO", brief: "Stand", responsable: "Comercial", fechaArmado: new Date(evento.getTime() - 2 * 86_400_000), fechaEvento: evento, fechaDesarme: new Date(evento.getTime() + 86_400_000) },
    select: { id: true },
  });
  const pres = await p.duenio.proyectoPresupuesto.create({ data: { tenantId: p.a.id, proyectoId: pr.id, version: 1, estado: "APROBADO", token: `t09p-${pr.id}`, ivaPct: 21 }, select: { id: true } });
  await p.duenio.proyectoItem.create({ data: { tenantId: p.a.id, presupuestoId: pres.id, rubro: "General", descripcion: "Stand", cantidad: 1, precio: 3000, costo: 2000, supplierId: proveedor } });
  const gestion = await import("./gestion.server");
  p.valor(await p.como(p.usuarios.direccion, () => gestion.regenerarCuotas(p.a.id, pr.id)));
  const anticipo = await p.duenio.proyectoCuota.findFirstOrThrow({ where: { proyectoId: pr.id, tipo: "PAGO", anuladoEl: null, clave: { endsWith: ":anticipo" } }, select: { id: true, monto: true, prevista: true } });
  assert.deepEqual({ monto: anticipo.monto, prevista: anticipo.prevista }, { monto: 1000, prevista: false });
  ok(p.valor(await p.como(p.usuarios.direccion, () => p.ficha.marcarCuota(p.form({ envio: crypto.randomUUID(), id: anticipo.id, medio: "TRANSFERENCIA", monto: "400" })))));
  const fichaServer = await import("./ficha.server");
  const pagado = async () =>
    p.valor(await p.como(p.usuarios.direccion, async () => {
      const a = await gestion.actorActual();
      const cab = (await fichaServer.cabeceraFicha(a, pr.id))!;
      return (await fichaServer.datosResumen(a, cab, fichaServer.vistaDe(a))).finanzas!.pagado;
    }));
  assert.equal(await pagado(), 400, "la cuota viva con su parte: 400, no 800");
  return { id: pr.id, proveedor, anticipo: anticipo.id, pagado, gestion };
}

test("Ficha · pago parcial y después cancelar: la cuota anulada no se lleva lo pagado (sigue 400, como lo lista cancelar)", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const f = await fichaPagadoCon400(p);
  ok(p.valor(await p.como(p.usuarios.direccion, () => p.etapasAcc.cancelarProyecto(p.form({ id: f.id, motivo: "Se suspendió" })))));
  assert.ok((await p.duenio.proyectoCuota.findUniqueOrThrow({ where: { id: f.anticipo }, select: { anuladoEl: true } })).anuladoEl, "cancelar anuló la cuota");
  const fila = await p.enA((tx) => tx.proyectoCancelacion.findFirstOrThrow({ where: { proyectoId: f.id }, select: { pendientes: true } }));
  const linea = (fila.pendientes as string[]).find((x) => x.startsWith("Pagos a proveedores"));
  assert.match(linea ?? "", /^Pagos a proveedores: 1 por \$\s?400\b/, linea);
  assert.equal(await f.pagado(), 400);
});

test("Ficha · pago parcial y después el plan saca la cuota (anticipo 0 %): lo pagado en parte sigue en «Pagado»", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const f = await fichaPagadoCon400(p);
  await p.duenio.proyectoProveedorFicha.create({ data: { tenantId: p.a.id, supplierId: f.proveedor, anticipoPct: 0 } });
  p.valor(await p.como(p.usuarios.direccion, () => f.gestion.regenerarCuotas(p.a.id, f.id)));
  assert.ok((await p.duenio.proyectoCuota.findUniqueOrThrow({ where: { id: f.anticipo }, select: { anuladoEl: true } })).anuladoEl, "el plan sacó el anticipo");
  assert.equal(await f.pagado(), 400);
});
