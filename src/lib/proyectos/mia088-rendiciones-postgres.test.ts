// ============================================================================
// GSG-MIA-088 · anexo «Lote 2» del plan: ADM-134 (P9) y ADM-135 (P11), contra Postgres real con la app como `app_rls`
// (sin BYPASSRLS) y las Server Actions reales con sesión. Esperados escritos a mano ANTES del arreglo:
//
//  P9   El permiso `rendiciones` de la matriz es el piso, en el servidor. Sin «ver», ninguna de las 7 acciones de
//       `acciones-rendiciones.ts`. Con «ver», sólo rendir lo propio. Aprobar, devolver, rechazar, reintegrar, entregar
//       y cerrar un anticipo piden «editar» Y la regla del rol (las dos, como `pagarLiquidacion`). Cada rechazo: 0 filas
//       nuevas en rendiciones, gastos, anticipos, caja y el registro. Sin «editar», las lecturas no traen lo de otros.
//       Con «editar» (la matriz de fábrica de Administración), las 7 andan como hoy.
//  P11  Administración con `liquidaciones` en «ver»: `pagarLiquidacion` llamado directo se rechaza, 0 cambios.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";

const FOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQ==";

test("ADM-134 y ADM-135 · Rendiciones y pagar liquidación deciden por la matriz en el servidor, además del rol", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a } = base;
  const t0 = await duenio.tenant.findUniqueOrThrow({ where: { id: a.id }, select: { modules: true } });
  await duenio.tenant.update({ where: { id: a.id }, data: { modules: [...new Set([...t0.modules, "proyectos"])] } });
  const acc = await import("./acciones-rendiciones");
  const { pagarLiquidacion } = await import("./acciones-empresa");
  const { actorActual } = await import("./gestion.server");
  const { rendicionesDelProyecto, anticiposDelProyecto } = await import("./rendiciones.server");
  const { comprobanteDeRendicion } = await import("./comprobante.server");

  const usuario = (nombre: string) => duenio.user.create({ data: { tenantId: a.id, name: nombre, email: `${nombre.toLowerCase()}@mia088r.test`, passwordHash: "x", role: "RECEPTION" }, select: { id: true } });
  const [adm, prod] = await Promise.all([usuario("Admin"), usuario("Produccion")]);
  const persona = (userId: string, rol: string) => duenio.proyectoPersona.create({ data: { tenantId: a.id, userId, nombre: rol, rol }, select: { id: true } });
  const pAdm = await persona(adm.id, "ADMINISTRACION");
  const pProd = await persona(prod.id, "PRODUCCION");
  const p1 = await duenio.proyecto.create({ data: { tenantId: a.id, numero: 1, clientId: a.clientes[0], nombre: "Stand 1", servicio: "ARQUITECTURA", etapa: "APROBADO" }, select: { id: true } });
  await duenio.proyectoEquipo.createMany({ data: [pAdm, pProd].map((p) => ({ tenantId: a.id, proyectoId: p1.id, personaId: p.id })) });

  const form = (campos: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    return fd;
  };
  const correr = async <R>(usuarioId: string, fn: () => Promise<R>): Promise<R> => {
    const r = await ejecutarAccion({ negocio: a, usuario: { id: usuarioId } }, fn);
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return (r as { valor: R }).valor;
  };
  const mirar = <R>(fn: (tx: Parameters<Parameters<typeof duenio.$transaction>[0]>[0]) => Promise<R>) =>
    duenio.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${a.id}, true)`;
      return fn(tx);
    });
  /**
   * Dirección (la dueña) cambia una celda de la matriz por la pantalla: `guardarPermisos` con la matriz entera, como la manda
   * Equipo › Permisos. Parte de la de fábrica y acumula los cambios.
   */
  const core = await import("./gestion-core");
  const { guardarPermisos } = await import("./acciones-gestion");
  const editables = core.ROLES_GESTION.filter((r) => r !== "DIRECCION");
  const matriz = new Map<string, { ver: boolean; editar: boolean }>();
  for (const rol of editables) for (const { id } of core.MODULOS) matriz.set(`${rol}:${id}`, core.PERMISOS_BASE[rol][id]);
  const fijar = async (rol: string, modulo: string, ver: boolean, editar: boolean) => {
    matriz.set(`${rol}:${modulo}`, { ver, editar });
    const fd = new FormData();
    for (const r of editables) {
      for (const { id } of core.MODULOS) {
        const p = matriz.get(`${r}:${id}`)!;
        if (p.ver) fd.set(`ver:${r}:${id}`, "on");
        if (p.editar) fd.set(`editar:${r}:${id}`, "on");
      }
      for (const c of core.COLUMNAS_OCULTAS_BASE[r]) fd.set(`oculta:${r}:${c}`, "on");
    }
    const r = await ejecutarAccion({ negocio: a, usuario: { id: a.duenia.id } }, () => guardarPermisos(fd));
    assert.deepEqual(r.tipo === "redireccion" && r.destino, "/admin/proyectos/equipo?tab=permisos&ok=1", `Dirección guarda ${rol}:${modulo}: ${JSON.stringify(r)}`);
    const guardada = await mirar((tx) => tx.proyectoPermiso.findFirst({ where: { rol, modulo }, select: { ver: true, editar: true } }));
    assert.deepEqual(guardada, { ver, editar }, `quedó ${rol}:${modulo}`);
  };
  const foto = () =>
    mirar(async (tx) => ({
      rendiciones: (await tx.proyectoRendicion.findMany({ select: { id: true, estado: true, liquidacionId: true } })).map((r) => `${r.id}|${r.estado}|${r.liquidacionId}`).sort(),
      gastos: await tx.proyectoGasto.count(),
      anticipos: (await tx.proyectoAnticipo.findMany({ select: { id: true, estado: true, devueltoCentavos: true, reintegradoCentavos: true } })).map((x) => `${x.id}|${x.estado}|${x.devueltoCentavos}|${x.reintegradoCentavos}`).sort(),
      caja: await tx.cashMovement.count(),
      liquidaciones: (await tx.proyectoLiquidacion.findMany({ select: { id: true, estado: true } })).map((l) => `${l.id}|${l.estado}`).sort(),
      registro: await tx.proyectoCambio.count(),
    }));

  // Datos con la matriz de fábrica: Producción rinde 4 gastos de su bolsillo; Administración aprueba uno; la dueña le
  // entrega un anticipo a Producción; y hay una liquidación publicada de Producción.
  let n = 0;
  const rendir = async (quien: string) => {
    const clave = `aaaaaaaa-bbbb-4ccc-8ddd-${String(++n).padStart(12, "0")}`;
    const r = await correr(quien, () => acc.rendirGasto(form({ proyectoId: p1.id, clave, descripcion: `Gasto ${n}`, monto: "1.000", medio: "PROPIO", fecha: "2026-11-04", foto: FOTO })));
    assert.deepEqual(r, { ok: true }, `rinde el gasto ${n}`);
    return (await mirar((tx) => tx.proyectoRendicion.findFirstOrThrow({ orderBy: { createdAt: "desc" }, select: { id: true } }))).id;
  };
  const [r1, r2, r3, r4] = [await rendir(prod.id), await rendir(prod.id), await rendir(prod.id), await rendir(prod.id)];
  assert.deepEqual(await correr(adm.id, () => acc.aprobarRendicion(form({ id: r3 }))), { ok: true }, "precondición: Administración aprueba r3");
  assert.deepEqual(await correr(a.duenia.id, () => acc.entregarAnticipo(form({ personaId: pProd.id, proyectoId: p1.id, monto: "5.000", medio: "EFECTIVO", clave: "bbbbbbbb-cccc-4ddd-8eee-000000000001" }))), { ok: true });
  const anticipo = (await mirar((tx) => tx.proyectoAnticipo.findFirstOrThrow({ select: { id: true } }))).id;
  const liq = await mirar((tx) => tx.proyectoLiquidacion.create({ data: { tenantId: a.id, personaId: pProd.id, periodo: "2026-10", total: 1000, estado: "PUBLICADA", publicadaEl: new Date() }, select: { id: true } }));

  const lasSiete = (sufijo: string): [string, () => Promise<{ ok: boolean }>][] => [
    ["rendirGasto", () => acc.rendirGasto(form({ proyectoId: p1.id, clave: `cccccccc-dddd-4eee-8fff-${sufijo}`, descripcion: "Lo mío", monto: "300", medio: "PROPIO", fecha: "2026-11-05", foto: FOTO }))],
    ["aprobarRendicion", () => acc.aprobarRendicion(form({ id: r1 }))],
    ["devolverRendicion", () => acc.devolverRendicion(form({ id: r2, comentario: "Falta el ticket" }))],
    ["rechazarRendicion", () => acc.rechazarRendicion(form({ id: r4, comentario: "Duplicado" }))],
    ["reintegrarDirecto", () => acc.reintegrarDirecto(form({ id: r3, medio: "EFECTIVO" }))],
    ["entregarAnticipo", () => acc.entregarAnticipo(form({ personaId: pProd.id, proyectoId: p1.id, monto: "2.000", medio: "EFECTIVO", clave: `dddddddd-eeee-4fff-8aaa-${sufijo}` }))],
    ["cerrarAnticipo", () => acc.cerrarAnticipo(form({ id: anticipo, medio: "EFECTIVO" }))],
  ];
  const lecturas = async () =>
    correr(adm.id, async () => {
      const yo = await actorActual();
      const r = await rendicionesDelProyecto(yo, p1.id);
      return { revisa: r.revisa, deOtros: r.filas.filter((f) => [r1, r2, r3, r4].includes(f.id)).length, anticipos: await anticiposDelProyecto(yo, p1.id), comprobanteAjeno: await comprobanteDeRendicion(r1) };
    });

  // ── Administración SIN acceso a Rendiciones: las 7 rechazadas, 0 cambios; las lecturas no traen lo de otros.
  await fijar("ADMINISTRACION", "rendiciones", false, false);
  for (const [nombre, fn] of lasSiete("000000000001")) {
    const antes = await foto();
    const r = await correr(adm.id, fn);
    assert.equal(r.ok, false, `sin acceso a Rendiciones, ${nombre} se rechaza (vino ${JSON.stringify(r)})`);
    assert.deepEqual(await foto(), antes, `sin acceso, ${nombre}: 0 filas en rendiciones, gastos, anticipos, caja y registro`);
  }
  assert.deepEqual(await lecturas(), { revisa: false, deOtros: 0, anticipos: null, comprobanteAjeno: null }, "sin acceso: ni las rendiciones de otros, ni los anticipos, ni el comprobante ajeno");

  // ── Con «ver»: rinde lo propio; las otras 6 rechazadas, 0 cambios; las lecturas, sólo lo propio.
  await fijar("ADMINISTRACION", "rendiciones", true, false);
  for (const [nombre, fn] of lasSiete("000000000002")) {
    const antes = await foto();
    const r = await correr(adm.id, fn);
    if (nombre === "rendirGasto") {
      assert.deepEqual(r, { ok: true }, "con «ver», rinde lo propio");
      continue;
    }
    assert.equal(r.ok, false, `con «ver», ${nombre} se rechaza (vino ${JSON.stringify(r)})`);
    assert.deepEqual(await foto(), antes, `con «ver», ${nombre}: 0 cambios`);
  }
  assert.deepEqual(await lecturas(), { revisa: false, deOtros: 0, anticipos: null, comprobanteAjeno: null }, "con «ver»: sólo lo propio");

  // ── ADM-135: con `liquidaciones` en «ver», pagar una liquidación llamada directo se rechaza.
  await fijar("ADMINISTRACION", "liquidaciones", true, false);
  const antesDePagar = await foto();
  const paga = await correr(adm.id, () => pagarLiquidacion(form({ id: liq.id })));
  assert.equal(paga.ok, false, `con liquidaciones en «ver», pagarLiquidacion se rechaza (vino ${JSON.stringify(paga)})`);
  assert.deepEqual(await foto(), antesDePagar, "0 cambios en liquidaciones y caja");

  // ── Con «editar» (la matriz de fábrica): las 6 andan como hoy.
  await fijar("ADMINISTRACION", "rendiciones", true, true);
  for (const [nombre, fn] of lasSiete("000000000003").slice(1)) {
    const r = await correr(adm.id, fn);
    assert.deepEqual(r, { ok: true }, `con «editar», ${nombre} anda (vino ${JSON.stringify(r)})`);
  }
  const l = await lecturas();
  assert.deepEqual([l.revisa, l.deOtros > 0, l.anticipos !== null], [true, true, true], "con «editar», revisa todo");
});
