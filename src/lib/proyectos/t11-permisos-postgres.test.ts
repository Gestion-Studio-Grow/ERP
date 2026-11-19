// ============================================================================
// MIA-50 · T11 · Adenda 2 (C-CF2 a C-CF6, C-CF9) y O47 (código en el momento, rol de campo). Contra Postgres real: base
// efímera con todas las migraciones, rol app_rls sin BYPASSRLS, las páginas y las acciones reales con sesión y SIN el header
// `x-pathname` (el layout no frena: la regla tiene que estar en la página y en la acción). Esperados escritos a mano desde la
// Adenda (R7). Todo ficticio y marcado «T11».
//
// Negocios A y B: rubro productora, módulos proyectos, cuentas-a-cobrar, cuentas-a-pagar y reports (sólo en esta base).
// Datos (A y B, los mismos; Adenda 1 § B + P3):
//   propias   a cobrar 100.000 con un cobro de 30.000 → 70.000 · a pagar 50.000
//   P1 (ARS)  cuota cobrada 200.000, cuota pendiente 300.000, cobro suelto 50.000 → 250.000
//   P2 (USD)  cuota de US$ 1.000 al cambio de hoy 1.200 → 1.200.000
//   P3 (ARS)  cuota pendiente 1.000,55 → 1.000,55
//   a cobrar de proyectos 250.000 + 1.200.000 + 1.000,55 = 1.451.000,55 · general 70.000 + 1.451.000,55 = 1.521.000,55
//   a pagar   cuota a proveedor 80.000 − pago parcial 30.000 = 50.000; gasto sin pagar 10.000 + IVA 2.100 = 12.100;
//             cuota de la empresa 15.000 → 77.100 · general 50.000 + 77.100 = 127.100
// Personas de A (todas OWNER del ERP salvo «sin ficha»): la dueña sin ficha (Dirección), Dirección con ficha, Administración,
// Producción, Producción de campo, Comercial y Diseño; «sin ficha» es la recepción (RECEPTION, sin ficha).
// Orden: C-CF2, C-CF3, C-CF4, C-CF5, C-CF6, O47 y C-CF9 al final (mueve la plata propia). Reloj fijado en AHORA.
// ============================================================================

import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ejecutarAccion, prepararAccionesDeServidor, type SalidaDeAccion } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type NegocioDePrueba } from "@/test/base-efimera";

const laBase = baseEfimeraDelArchivo();
const DIA = 86_400_000;
const AHORA = Date.parse("2026-11-19T18:00:00Z");
const HOY = "2026-11-19";
const MODULOS = ["proyectos", "cuentas-a-cobrar", "cuentas-a-pagar", "reports"];

type Roles = "dueniaSinFicha" | "direccion" | "administracion" | "produccion" | "campo" | "comercial" | "diseno";
type Ids = { ar: string; ap: string; cuotas: string[]; p1: string; p2: string; p3: string; personas: Record<Roles, string>; usuarios: Record<Roles, string> };
let sembrado: { a: Ids; b: Ids } | null = null;

async function preparar(t: import("node:test").TestContext) {
  const base = await laBase(t);
  if (!base) return null;
  mock.timers.enable({ apis: ["Date"], now: AHORA });
  t.after(() => mock.timers.reset());
  apuntarLaAppA(base);
  Object.assign(process.env as Record<string, string | undefined>, { NODE_ENV: "development", DB_CONNECTION_LIMIT: "12", DB_CONNECT_TIMEOUT_MS: "5000" });
  delete (process.env as Record<string, string | undefined>).CUENTAS_CORRIENTES_ENABLED;
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a, b } = base;

  const acciones = await import("./acciones");
  const ficha = await import("./acciones-ficha");
  const empresa = await import("./acciones-empresa");
  const parametros = await import("./acciones-parametros");
  const cg = await import("./cuentas-generales.server");
  const cgCore = await import("./cuentas-generales");
  const emp = await import("./empresa.server");
  const sf = await import("./segundo-factor.server");
  const sfCore = await import("./segundo-factor-core");
  const { pesos } = await import("./core");
  const flujo = await import("@/lib/reports/flujo-lectura");
  const { HORIZONTE_POR_DEFECTO } = await import("@/lib/reports/flujo");
  const { prisma } = await import("@/lib/prisma");
  const { ProyectosEnCuentas } = await import("@/components/cuentas/ProyectosEnCuentas");
  const cobrar = await import("@/app/admin/(dashboard)/cuentas-a-cobrar/actions");
  const pagar = await import("@/app/admin/(dashboard)/cuentas-a-pagar/actions");
  const paginas = {
    "/admin/cuentas-a-cobrar": (await import("@/app/admin/(dashboard)/cuentas-a-cobrar/page")).default,
    "/admin/cuentas-a-cobrar/[id]": (await import("@/app/admin/(dashboard)/cuentas-a-cobrar/[id]/page")).default,
    "/admin/cuentas-a-pagar": (await import("@/app/admin/(dashboard)/cuentas-a-pagar/page")).default,
    "/admin/cuentas-a-pagar/[id]": (await import("@/app/admin/(dashboard)/cuentas-a-pagar/[id]/page")).default,
    "/admin/flujo": (await import("@/app/admin/(dashboard)/flujo/page")).default,
  } as const;

  const form = (campos: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    return fd;
  };
  const pedido = <R>(negocio: NegocioDePrueba, usuarioId: string, fn: () => Promise<R>, cookies?: Record<string, string>): Promise<SalidaDeAccion<R>> =>
    ejecutarAccion({ negocio, usuario: { id: usuarioId }, cookies }, fn);
  const como = async <R>(negocio: NegocioDePrueba, usuarioId: string, fn: () => Promise<R>, cookies?: Record<string, string>): Promise<R> => {
    const r = await pedido(negocio, usuarioId, fn, cookies);
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return (r as { valor: R }).valor;
  };
  const ok = (r: unknown) => assert.equal((r as { ok: boolean }).ok, true, JSON.stringify(r));

  let numero = (await duenio.proyecto.count()) + 900;
  const proyecto = async (n: NegocioDePrueba, d: { precio: number; moneda?: string; tcVenta?: number }) => {
    const evento = new Date(AHORA + 30 * DIA);
    const p = await duenio.proyecto.create({
      data: {
        tenantId: n.id, numero: ++numero, clientId: n.clientes[0], nombre: `T11 ${numero}`, servicio: "ARQUITECTURA", etapa: "APROBADO", moneda: d.moneda ?? "ARS",
        fechaArmado: new Date(evento.getTime() - 2 * DIA), fechaEvento: evento, fechaDesarme: new Date(evento.getTime() + DIA),
      },
      select: { id: true },
    });
    const pres = await duenio.proyectoPresupuesto.create({ data: { tenantId: n.id, proyectoId: p.id, version: 1, estado: "APROBADO", token: `t11-${p.id}`, ivaPct: 21, tcVenta: d.tcVenta ?? null }, select: { id: true } });
    await duenio.proyectoItem.create({ data: { tenantId: n.id, presupuestoId: pres.id, rubro: "General", descripcion: "Stand", cantidad: 1, precio: d.precio } });
    return p.id;
  };
  const cuota = async (n: NegocioDePrueba, d: { proyectoId: string | null; monto: number; tipo?: string; moneda?: string; supplierId?: string }) =>
    (
      await duenio.proyectoCuota.create({
        data: { tenantId: n.id, proyectoId: d.proyectoId, tipo: d.tipo ?? "COBRO", concepto: `Cuota T11 ${d.monto}`, monto: d.monto, moneda: d.moneda ?? "ARS", venceEl: new Date(AHORA + 5 * DIA), auto: false, supplierId: d.supplierId ?? null },
        select: { id: true },
      })
    ).id;

  const sembrar = async (n: NegocioDePrueba, letra: string): Promise<Ids> => {
    const t0 = await duenio.tenant.findUniqueOrThrow({ where: { id: n.id }, select: { modules: true } });
    await duenio.tenant.update({ where: { id: n.id }, data: { blueprintId: "productora", modules: [...new Set([...t0.modules, ...MODULOS])] } });
    // Las personas: cada una con su usuario OWNER y su ficha (la dueña, sin ficha).
    const usuarios = { dueniaSinFicha: n.duenia.id } as Record<Roles, string>;
    const personas = {} as Record<Roles, string>;
    const fichas: [Roles, string][] = [["direccion", "DIRECCION"], ["administracion", "ADMINISTRACION"], ["produccion", "PRODUCCION"], ["campo", "PRODUCCION_CAMPO"], ["comercial", "COMERCIAL"], ["diseno", "DISENO"]];
    for (const [quien, rol] of fichas) {
      const u = await duenio.user.create({ data: { tenantId: n.id, name: `T11 ${quien}`, email: `t11-${quien}-${letra}@erp.test`, passwordHash: "x", role: "OWNER" }, select: { id: true } });
      usuarios[quien] = u.id;
      personas[quien] = (await duenio.proyectoPersona.create({ data: { tenantId: n.id, userId: u.id, nombre: `T11 ${quien}`, rol }, select: { id: true } })).id;
    }
    const sup = await duenio.supplier.create({ data: { tenantId: n.id, name: "Proveedor T11" }, select: { id: true } });
    const ar = await duenio.accountReceivable.create({ data: { tenantId: n.id, clientId: n.clientes[0], amount: 100_000, concept: "Fiado T11", createdBy: `user:${n.duenia.id}` }, select: { id: true } });
    await duenio.collection.create({ data: { tenantId: n.id, originType: "RECEIVABLE", originId: ar.id, amount: 30_000, method: "EFECTIVO", collectedBy: `user:${n.duenia.id}` } });
    const ap = await duenio.accountPayable.create({ data: { tenantId: n.id, supplierId: sup.id, amount: 50_000, createdBy: `user:${n.duenia.id}` }, select: { id: true } });
    ok(await como(n, n.duenia.id, () => empresa.guardarTipoCambio(form({ moneda: "USD", fecha: HOY, porUnidad: "1200" }))));
    const p1 = await proyecto(n, { precio: 500_000 / 1.21 });
    const c200 = await cuota(n, { proyectoId: p1, monto: 200_000 });
    const c300 = await cuota(n, { proyectoId: p1, monto: 300_000 });
    ok(await como(n, n.duenia.id, () => ficha.marcarCuota(form({ id: c200, medio: "TRANSFERENCIA" }))));
    ok(await como(n, n.duenia.id, () => acciones.registrarCobro(form({ proyectoId: p1, medio: "TRANSFERENCIA", monto: "50000" }))));
    const p2 = await proyecto(n, { precio: 1_200_000 / 1.21, moneda: "USD", tcVenta: 1200 });
    const cUsd = await cuota(n, { proyectoId: p2, monto: 1_000, moneda: "USD" });
    const p3 = await proyecto(n, { precio: 1_000.55 / 1.21 });
    const c1000 = await cuota(n, { proyectoId: p3, monto: 1_000.55 });
    const c80 = await cuota(n, { proyectoId: p1, monto: 80_000, tipo: "PAGO", supplierId: sup.id });
    const parcial = await duenio.proyectoGasto.create({ data: { tenantId: n.id, proyectoId: p1, supplierId: sup.id, descripcion: "Pago parcial T11", neto: 30_000, iva: 0, pagadoEl: new Date(AHORA - DIA), medio: "TRANSFERENCIA" }, select: { id: true } });
    await duenio.proyectoCambio.create({ data: { tenantId: n.id, entidad: "ProyectoCuota", campo: "Asiento", entidadId: c80, despues: parcial.id, autor: "T11" } });
    await duenio.proyectoGasto.create({ data: { tenantId: n.id, proyectoId: p1, supplierId: sup.id, descripcion: "Gasto sin pagar T11", neto: 10_000, iva: 2_100 } });
    const c15 = await cuota(n, { proyectoId: null, monto: 15_000, tipo: "PAGO" });
    return { ar: ar.id, ap: ap.id, cuotas: [c200, c300, cUsd, c1000, c80, c15], p1, p2, p3, personas, usuarios };
  };
  if (!sembrado) sembrado = { a: await sembrar(a, "a"), b: await sembrar(b, "b") };
  const ids = sembrado;

  /** Lo que mira C-CF3: los cobros, los pagos y el libro de caja de A (filas antes = después). */
  const filasDePlata = async (n: NegocioDePrueba = a) => ({
    cobrosYPagos: await duenio.collection.count({ where: { tenantId: n.id } }),
    libro: await duenio.cashMovement.count({ where: { tenantId: n.id } }),
    cheques: await duenio.payableCheque.count({ where: { tenantId: n.id } }).catch(() => -1),
  });
  const generales = (n: NegocioDePrueba, usuarioId: string) => como(n, usuarioId, () => cg.cuentasGenerales(n.id));
  return { base, duenio, a, b, ids, cg, cgCore, emp, sf, sfCore, pesos, flujo, HORIZONTE_POR_DEFECTO, prisma, ProyectosEnCuentas, cobrar, pagar, paginas, parametros, empresa, form, pedido, como, ok, generales, filasDePlata };
}

type P = NonNullable<Awaited<ReturnType<typeof preparar>>>;
const ABREN: Roles[] = ["dueniaSinFicha", "direccion", "administracion"];
const NO_ABREN: Roles[] = ["produccion", "campo", "comercial", "diseno"];
const params = (id: string) => ({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) });
const llamarPagina = (p: P, ruta: keyof P["paginas"]) => {
  const pagina = p.paginas[ruta] as (props: unknown) => Promise<unknown>;
  const id = ruta.startsWith("/admin/cuentas-a-cobrar/") ? p.ids.a.ar : p.ids.a.ap;
  return () => pagina(ruta.endsWith("[id]") ? params(id) : { searchParams: Promise.resolve({}) });
};

test("C-CF2 · las 5 páginas sin el header: abren Dirección (con y sin ficha) y Administración; los demás vuelven a Proyectos", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  for (const ruta of Object.keys(p.paginas) as (keyof P["paginas"])[]) {
    for (const quien of ABREN) {
      const r: SalidaDeAccion<unknown> = await p.pedido(p.a, p.ids.a.usuarios[quien], llamarPagina(p, ruta));
      assert.equal(r.tipo, "respuesta", `${quien} · ${ruta}: ${r.tipo} ${(r as { destino?: string }).destino ?? ""}`);
    }
    for (const quien of NO_ABREN) {
      const r: SalidaDeAccion<unknown> = await p.pedido(p.a, p.ids.a.usuarios[quien], llamarPagina(p, ruta));
      assert.deepEqual([r.tipo, (r as { destino?: string }).destino], ["redireccion", "/admin/proyectos/inicio"], `${quien} · ${ruta}`);
    }
    // Sin ficha (la recepción): ni el rol del ERP la deja entrar.
    const r: SalidaDeAccion<unknown> = await p.pedido(p.a, p.a.recepcion.id, llamarPagina(p, ruta));
    assert.equal(r.tipo, "redireccion", `sin ficha · ${ruta}`);
  }
});

test("C-CF2 · las 4 acciones sin «Empresa · editar» rechazan y no escriben nada", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const antes = await p.filasDePlata();
  const vacio = { estado: "idle" } as never;
  const llamadas = {
    registerReceivableCollection: () => p.cobrar.registerReceivableCollection(vacio, p.form({ id: p.ids.a.ar, monto: "1000", metodo: "EFECTIVO" })),
    registerPayablePayment: () => p.pagar.registerPayablePayment(vacio, p.form({ id: p.ids.a.ap, monto: "1000", metodo: "EFECTIVO" })),
    agregarCheque: () => p.pagar.agregarCheque(vacio, p.form({ id: p.ids.a.ap, numero: "1", banco: "T11", monto: "1000", vence: HOY })),
    cambiarEstadoCheque: () => p.pagar.cambiarEstadoCheque(vacio, p.form({ id: "cheque-t11", estado: "ACREDITADO" })),
  };
  for (const quien of NO_ABREN) {
    for (const [nombre, fn] of Object.entries(llamadas)) {
      const r: { estado: string; mensaje?: string } = await p.como(p.a, p.ids.a.usuarios[quien], fn);
      assert.equal(r.estado, "error", `${quien} · ${nombre}: ${JSON.stringify(r)}`);
      assert.match(String(r.mensaje), /Cuentas, cashflow y bancos/, `${quien} · ${nombre}: ${r.mensaje}`);
    }
  }
  assert.deepEqual(await p.filasDePlata(), antes);
});

test("C-CF3 · un solo número: Dirección y Administración ven 1.521.000,55 y 127.100; los demás, 0 renglones de proyectos; B, 0 de A", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  for (const quien of ABREN) {
    const g = await p.generales(p.a, p.ids.a.usuarios[quien]);
    assert.deepEqual(g.aCobrar, { propias: 70_000, proyectos: 1_451_000.55, total: 1_521_000.55 }, quien);
    assert.deepEqual(g.aPagar, { propias: 50_000, proyectos: 77_100, total: 127_100 }, quien);
  }
  for (const quien of [...NO_ABREN, "recepcion"] as const) {
    const usuario = quien === "recepcion" ? p.a.recepcion.id : p.ids.a.usuarios[quien];
    const g = await p.generales(p.a, usuario);
    assert.equal(g.proyectos, null, quien);
    assert.deepEqual([g.aCobrar.proyectos, g.aPagar.proyectos], [0, 0], quien);
  }
  // Administración de B: lo suyo, ninguna fila de A.
  const gb = await p.generales(p.b, p.ids.b.usuarios.administracion);
  assert.equal(gb.aCobrar.total, 1_521_000.55);
  const deA = new Set([...p.ids.a.cuotas].map((id) => `cuota-${id}`));
  const renglones = [...gb.proyectos!.aCobrar.renglones, ...gb.proyectos!.aPagar.renglones];
  assert.equal(renglones.filter((x) => deA.has(x.clave) || [p.ids.a.p1, p.ids.a.p2, p.ids.a.p3].some((id) => x.clave.endsWith(id))).length, 0);
});

test("C-CF4 · el mismo número en el texto, al centavo: la pantalla general dice lo mismo que Administración de Proyectos", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const usuario = p.ids.a.usuarios.administracion;
  const g = await p.generales(p.a, usuario);
  const admin = await p.como(p.a, usuario, () => p.emp.recuadrosDeCuotas(p.a.id));
  assert.equal(admin.resumen.aCobrar, 1_451_000.55);
  const html = renderToStaticMarkup(createElement(p.ProyectosEnCuentas, { proyectos: g.proyectos, lado: "cobrar", propias: g.aCobrar.propias }));
  const aTexto = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&nbsp;|\u00a0/g, " ");
  const texto = aTexto(html);
  const norm = (s: string) => s.replace(/ /g, " ");
  assert.ok(texto.includes(norm(p.pesos(admin.resumen.aCobrar))), `falta ${p.pesos(admin.resumen.aCobrar)} en ${texto}`);
  assert.ok(texto.includes(norm(p.pesos(1_521_000.55))), `falta el total general en ${texto}`);
  assert.ok(texto.includes(",55"), "sin centavos en el texto");
  const htmlPagar = renderToStaticMarkup(createElement(p.ProyectosEnCuentas, { proyectos: g.proyectos, lado: "pagar", propias: g.aPagar.propias }));
  assert.ok(aTexto(htmlPagar).includes(norm(p.pesos(admin.resumen.aPagar))), `falta ${p.pesos(admin.resumen.aPagar)} en ${aTexto(htmlPagar)}`);
});

test("C-CF5 · con «costo total» oculto, Administración no recibe lo de proyectos a pagar (ni en Cuentas a pagar ni en el flujo); sin la fila, 77.100", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const usuario = p.ids.a.usuarios.administracion;
  const conFila = async <R>(fn: () => Promise<R>): Promise<R> => {
    const fila = await p.duenio.proyectoPermiso.create({ data: { tenantId: p.a.id, rol: "ADMINISTRACION", modulo: "ficha", ver: true, editar: false, columnasOcultas: ["costoUnitario", "costoTotal", "recargo", "margen"] } });
    try {
      return await fn();
    } finally {
      await p.duenio.proyectoPermiso.delete({ where: { id: fila.id } });
    }
  };
  const oculto = await conFila(async () => {
    const g = await p.generales(p.a, usuario);
    const proy = await p.como(p.a, usuario, () => p.cg.proyectosParaCuentas(p.a.id));
    const f = await p.como(p.a, usuario, () => p.flujo.leerFlujo(p.prisma, p.a.id, HOY, p.HORIZONTE_POR_DEFECTO, p.cgCore.paraElFlujo(proy)));
    return { g, f };
  });
  assert.deepEqual(oculto.g.aPagar, { propias: 50_000, proyectos: 0, total: 50_000 });
  assert.equal(oculto.g.proyectos!.aPagar.renglones.length, 0);
  assert.equal(oculto.g.proyectos!.aPagarOculto, true);
  const pagosDeProyectos = oculto.f.flujo.semanas.flatMap((s) => s.movimientos).filter((m) => m.tipo === "pago" && String(m.cuentaId).startsWith("cuota-"));
  assert.equal(pagosDeProyectos.length, 0);
  // Lo de cobrar no cambia.
  assert.equal(oculto.g.aCobrar.total, 1_521_000.55);
  const sin = await p.generales(p.a, usuario);
  assert.equal(sin.aPagar.proyectos, 77_100);
});

test("C-CF6 · flujo = Administración − sin calendario − sin fecha − después del horizonte, a mano", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const usuario = p.ids.a.usuarios.administracion;
  const proy = await p.como(p.a, usuario, () => p.cg.proyectosParaCuentas(p.a.id));
  const leer = (extra?: ReturnType<typeof p.cgCore.paraElFlujo>) => p.como(p.a, usuario, () => p.flujo.leerFlujo(p.prisma, p.a.id, HOY, p.HORIZONTE_POR_DEFECTO, extra));
  const suma = (f: Awaited<ReturnType<typeof leer>>, tipo: string) => Math.round(f.flujo.semanas.flatMap((s) => s.movimientos).filter((m) => m.tipo === tipo).reduce((s, m) => s + m.monto, 0) * 100) / 100;
  const con = await leer(p.cgCore.paraElFlujo(proy));
  const sin = await leer();
  // A cobrar de Administración 1.451.000,55; sin calendario 0; sin fecha 0; después del horizonte 0 (todo vence el 24/11).
  assert.equal(Math.round((suma(con, "cobro") - suma(sin, "cobro")) * 100) / 100, 1_451_000.55);
  // A pagar 77.100 − sin fecha 12.100 (el gasto sin pagar no tiene fecha) − 0 − 0 = 65.000 (80.000 − 30.000 + 15.000).
  assert.equal(Math.round((suma(con, "pago") - suma(sin, "pago")) * 100) / 100, 65_000);
});

test("O47 · el código en el momento: sin código no se escribe; el mismo código dos veces, no; pagar abre 10 minutos sólo para pagar", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const u = { id: p.a.duenia.id, tenantId: p.a.id, email: p.a.duenia.email, role: "OWNER" };
  // Activar la app de la dueña (Dirección): el primer código activa y consume el paso.
  const { secreto } = await p.como(p.a, u.id, () => p.sf.datosDeActivacion(u, "Factoque"));
  const codigo = () => p.sfCore.codigoDelPaso(secreto, p.sfCore.pasoDe(Date.now()));
  const siguiente = () => mock.timers.tick(30_000);
  assert.equal((await p.como(p.a, u.id, () => p.sf.comprobarCodigo(u, codigo()))).ok, true);
  // Con la RLS forzada (M7a), hasta el dueño necesita el negocio fijado para contar.
  const historial = () =>
    p.duenio.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${p.a.id}, true)`;
      return tx.proyectoParametroHistorial.count();
    });
  const h0 = await historial();

  // Parámetro de precio sin código: rechaza y 0 filas.
  const sin = await p.como(p.a, u.id, () => p.parametros.guardarParametro(p.form({ clave: "precio.modo", valor: "POR_ITEM" })));
  assert.equal(sin.ok, false);
  assert.equal(await historial(), h0);
  // Con el código del paso siguiente: guarda.
  siguiente();
  const c1 = codigo();
  const guardado = await p.como(p.a, u.id, () => p.parametros.guardarParametro(p.form({ clave: "precio.modo", valor: "POR_ITEM", codigoSegundoPaso: c1 })));
  p.ok(guardado);
  const h1 = await historial();
  assert.ok(h1 > h0, JSON.stringify(guardado));
  // El mismo código otra vez: rechaza y 0 filas.
  const repetido = await p.como(p.a, u.id, () => p.parametros.guardarParametro(p.form({ clave: "precio.propuesta.iva", valor: "CON_IVA", codigoSegundoPaso: c1 })));
  assert.equal(repetido.ok, false);
  assert.equal(await historial(), h1);

  // Pagar una liquidación de otra persona: sin código, nada; con código, paga y abre la ventana; el segundo pago entra sin código.
  const liq = (periodo: string) => p.duenio.proyectoLiquidacion.create({ data: { tenantId: p.a.id, personaId: p.ids.a.personas.produccion, periodo, base: 1000, total: 1000, estado: "PUBLICADA", publicadaEl: new Date(AHORA - DIA) }, select: { id: true } });
  const l1 = await liq("2026-09");
  const l2 = await liq("2026-10");
  const estado = async (id: string) => (await p.duenio.proyectoLiquidacion.findUniqueOrThrow({ where: { id }, select: { estado: true } })).estado;
  const libro0 = await p.duenio.cashMovement.count({ where: { tenantId: p.a.id } });
  const sinCodigo = await p.como(p.a, u.id, () => p.empresa.pagarLiquidacion(p.form({ id: l1.id, medio: "TRANSFERENCIA" })));
  assert.equal(sinCodigo.ok, false);
  assert.equal(await estado(l1.id), "PUBLICADA");
  assert.equal(await p.duenio.cashMovement.count({ where: { tenantId: p.a.id } }), libro0);
  siguiente();
  const pago = await p.pedido(p.a, u.id, () => p.empresa.pagarLiquidacion(p.form({ id: l1.id, medio: "TRANSFERENCIA", codigoSegundoPaso: codigo() })));
  assert.equal(pago.tipo, "respuesta");
  p.ok((pago as { valor: unknown }).valor);
  assert.equal(await estado(l1.id), "PAGADA");
  const ventana = pago.cookiesPuestas;
  assert.ok(Object.keys(ventana).length > 0, "pagar no abrió la ventana");
  p.ok(await p.como(p.a, u.id, () => p.empresa.pagarLiquidacion(p.form({ id: l2.id, medio: "TRANSFERENCIA" })), ventana));
  assert.equal(await estado(l2.id), "PAGADA");
  // La ventana es sólo para pagar: un parámetro de precio con la ventana abierta y sin código, no.
  const conVentana = await p.como(p.a, u.id, () => p.parametros.guardarParametro(p.form({ clave: "precio.propuesta.iva", valor: "CON_IVA" })), ventana);
  assert.equal(conVentana.ok, false);
  // La ventana es de la persona: Administración con la cookie de la dueña no paga sin su código.
  const otra = await p.como(p.a, p.ids.a.usuarios.administracion, () => p.sf.exigirCodigoEnElMomento({ id: p.ids.a.usuarios.administracion, tenantId: p.a.id, email: "t11-administracion-a@erp.test", role: "OWNER" }, p.form({}), "pagar"), ventana);
  assert.notEqual(otra, null);
});

test("O47 · el rol de campo no llega a la plata: ni las cuentas, ni cobrar, ni pagar una liquidación", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const campo = p.ids.a.usuarios.campo;
  const antes = await p.filasDePlata();
  assert.equal(await p.como(p.a, campo, () => p.cg.proyectosParaCuentas(p.a.id)), null);
  const l = await p.duenio.proyectoLiquidacion.create({ data: { tenantId: p.a.id, personaId: p.ids.a.personas.comercial, periodo: "2026-08", base: 500, total: 500, estado: "PUBLICADA" }, select: { id: true } });
  const r = await p.como(p.a, campo, () => p.empresa.pagarLiquidacion(p.form({ id: l.id, medio: "TRANSFERENCIA" })));
  assert.equal(r.ok, false);
  assert.equal((await p.duenio.proyectoLiquidacion.findUniqueOrThrow({ where: { id: l.id } })).estado, "PUBLICADA");
  assert.deepEqual(await p.filasDePlata(), antes);
});

test("O47 · fuera de los rubros con dos pasos (CH) no pide código", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const antes = await p.duenio.tenant.findUniqueOrThrow({ where: { id: p.b.id }, select: { blueprintId: true } });
  await p.duenio.tenant.update({ where: { id: p.b.id }, data: { blueprintId: null } });
  t.after(() => p.duenio.tenant.update({ where: { id: p.b.id }, data: { blueprintId: antes.blueprintId } }));
  const u = { id: p.b.duenia.id, tenantId: p.b.id, email: p.b.duenia.email, role: "OWNER" };
  for (const accion of ["pagar", "parametros", "aprobar"] as const) {
    const motivo: string | null = await p.como(p.b, u.id, (): Promise<string | null> => p.sf.exigirCodigoEnElMomento(u, p.form({}), accion));
    assert.equal(motivo, null, accion);
  }
});

test("C-CF9 · Administración cobra lo propio: con las cuentas corrientes apagadas, 0 asientos; prendidas, 1 asiento de 30.000", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const usuario = p.ids.a.usuarios.administracion;
  const vacio = { estado: "idle" } as never;
  const cobro = () => p.como(p.a, usuario, () => p.cobrar.registerReceivableCollection(vacio, p.form({ id: p.ids.a.ar, monto: "30000", metodo: "EFECTIVO" })));
  const libro = () => p.duenio.cashMovement.findMany({ where: { tenantId: p.a.id, createdBy: { startsWith: "cuenta-corriente:" } }, select: { type: true, amount: true } });
  const c0 = await p.duenio.collection.count({ where: { tenantId: p.a.id } });
  // Apagado (ni fila del interruptor ni variable): el cobro entra y el libro no.
  const r0 = await cobro();
  assert.equal(r0.estado, "ok", JSON.stringify(r0));
  assert.equal((await libro()).length, 0);
  // Prendido (la variable de siempre; sin fila de la consola manda ella): 1 asiento de 30.000.
  (process.env as Record<string, string | undefined>).CUENTAS_CORRIENTES_ENABLED = "1";
  t.after(() => delete (process.env as Record<string, string | undefined>).CUENTAS_CORRIENTES_ENABLED);
  const r1 = await cobro();
  assert.equal(r1.estado, "ok", JSON.stringify(r1));
  assert.deepEqual((await libro()).map((m) => [m.type, Number(m.amount)]), [["INGRESO", 30_000]]);
  assert.equal(await p.duenio.collection.count({ where: { tenantId: p.a.id } }), c0 + 2);
});
