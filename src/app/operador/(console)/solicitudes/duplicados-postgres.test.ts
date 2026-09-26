// ============================================================================
// CONFIGURADOR · posibles duplicados SIN CUIT, «ya está en la cartera» y el descarte visible — Postgres
// ============================================================================
//
// Hallazgos de QA 26/09 (vuelta 2), contra una base efímera (src/test/base-efimera.ts):
//   · el pedido de un CUIT nuevo para un negocio que YA existe sin CUIT («QA Kiosco Lab») ofrecía
//     «Crear el cliente» sin avisar: ahora Soporte ve el parecido y tiene que decidir; «Es este» le
//     carga el CUIT y lo suma (con la autorización del dueño), «Es otro» crea. Doble clic: un resultado.
//   · la respuesta a la contadora sigue IDÉNTICA para cualquier CUIT (no se entera de los parecidos);
//   · «Sumar a la cartera» con el negocio YA en la cartera de ese estudio: se rechaza con el motivo;
//   · el pedido descartado lo ve la contadora con su motivo, y otro estudio no.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const CUIT_KIOSCO = "20111111112";
const CUIT_SUCURSAL = "20222222223";
const CUIT_RED = "20301112220";
const CUIT_TARDE = "20333333334";
const SOPORTE = { nombre: "soporte", esDuenio: false };

test("configurador: parecidos sin CUIT, ya en la cartera y descarte visible para la contadora", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  const antes = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "secreto-de-auth-qa";
  t.after(() => {
    if (antes === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = antes;
  });
  prepararAccionesDeServidor();

  const { operatorPrisma } = await import("@/lib/operator-db");
  const { altaClienteCarteraAction } = await import("@/lib/cartera-actions");
  const reglas = await import("@/lib/cartera-alta-reglas");
  const conf = await import("@/app/operador/(console)/solicitudes/configurador.server");
  const confReglas = await import("@/app/operador/(console)/solicitudes/configurador-reglas");
  const { pedidosDeAltaDelEstudio } = await import("@/app/contador/altas-en-curso.server");
  base.alBorrar(() => operatorPrisma.$disconnect());
  // La consola (`operatorPrisma`) es `app_rls`, como en producción: el configurador corre con ella.
  // Sembrar y mirar desde afuera, como dueño de las tablas.
  const duenio = await prismaComoDuenio(base);

  // A es el estudio; B es «QA Kiosco Lab», un negocio real SIN CUIT cargado.
  await duenio.tenant.update({ where: { id: base.a.id }, data: { modules: ["cartera", "clients", "reports"] } });
  await duenio.tenant.update({ where: { id: base.b.id }, data: { name: "QA Kiosco Lab", arcaCuit: null, arcaPuntoVenta: null, plan: "micro" } });
  const bAntes = await duenio.tenant.findUniqueOrThrow({ where: { id: base.b.id } });

  const pedir = (nombre: string, cuit: string, email: string) =>
    ejecutarAccion({ negocio: base.a, usuario: base.a.duenia }, () =>
      altaClienteCarteraAction({ nombre, cuit, email, puntoVenta: "3", condicionIva: "MONOTRIBUTO", tamanio: "chico" }),
    );
  const esperado = { ok: true, mensaje: reglas.RESPUESTA_SOLICITUD_ALTA };

  // ── 1) La contadora recibe la MISMA respuesta: no se entera de que hay un parecido ──
  for (const [nombre, cuit, email] of [
    ["QA Kiosco Lab", CUIT_KIOSCO, "kiosco@ejemplo.test"],
    ["QA Kiosco Lab Sucursal", CUIT_SUCURSAL, "sucursal@ejemplo.test"],
  ] as const) {
    const r = await pedir(nombre, cuit, email);
    assert.deepEqual(r.tipo === "respuesta" && r.valor, esperado, "misma respuesta con o sin parecidos");
  }
  const bandeja = (await conf.listarSolicitudesPendientes(operatorPrisma)).pedidos;
  const pKiosco = bandeja.find((s) => s.datos.cuit === CUIT_KIOSCO)!;
  const pSucursal = bandeja.find((s) => s.datos.cuit === CUIT_SUCURSAL)!;
  assert.deepEqual(pKiosco.yaExisten, [], "el CUIT no está en la plataforma");
  assert.deepEqual(pKiosco.parecidos.map((x) => x.id), [base.b.id], "Soporte sí ve el negocio parecido sin CUIT");
  assert.ok(!pKiosco.parecidos.some((x) => x.id === base.a.id), "nunca el propio estudio");

  const form = {
    razonSocial: "QA Kiosco Lab", cuit: CUIT_KIOSCO, condicionIva: "MONOTRIBUTO", puntoVenta: "3",
    rubro: "mostrador", plan: "micro", email: "kiosco@ejemplo.test", whatsapp: "", subdominio: "",
  };
  const tenantsAntes = await duenio.tenant.count();

  // ── 2) Sin decidir no se crea nada (antes: «Crear el cliente» duplicaba al Kiosco) ──
  const sinDecidir = await conf.configurarSolicitud(operatorPrisma, { estudioTenantId: base.a.id, solicitudId: pKiosco.id, sesion: SOPORTE, form });
  assert.deepEqual(sinDecidir, { ok: false, error: confReglas.AVISO_POSIBLE_DUPLICADO });
  assert.equal(await duenio.tenant.count(), tenantsAntes, "no se duplicó el negocio");

  // ── 3) «Es otro negocio»: se crea, y queda registrado qué parecido se descartó ──
  const otro = await conf.configurarSolicitud(operatorPrisma, {
    estudioTenantId: base.a.id, solicitudId: pSucursal.id,
    sesion: SOPORTE,
    form: { ...form, razonSocial: "QA Kiosco Lab Sucursal", cuit: CUIT_SUCURSAL, email: "sucursal@ejemplo.test", duplicado: "otro" },
  });
  assert.ok(otro.ok && otro.creado, JSON.stringify(otro));
  assert.equal(await duenio.tenant.count(), tenantsAntes + 1);
  const audOtro = await duenio.auditLog.findFirst({ where: { action: confReglas.ACCION_CONFIGURADOR_ALTA, entityId: otro.ok ? otro.clienteTenantId : "" } });
  assert.deepEqual((audOtro?.changes as { parecidosDescartados?: string[] }).parecidosDescartados, [base.b.id]);
  assert.equal(otro.ok && otro.otrosLocales, false, "un pedido «chico» no lleva el recordatorio de los otros locales");

  // ── 3 bis) Refutador vuelta 4: un pedido de «varios locales» lo recuerda en «Pasale esto» ──
  const rRed = await ejecutarAccion({ negocio: base.a, usuario: base.a.duenia }, () =>
    altaClienteCarteraAction({ nombre: "Autoservicio Red Sur", cuit: CUIT_RED, email: "redsur@ejemplo.test", puntoVenta: "3", condicionIva: "MONOTRIBUTO", tamanio: "varios-locales" }),
  );
  assert.deepEqual(rRed.tipo === "respuesta" && rRed.valor, esperado);
  const pRed = (await conf.listarSolicitudesPendientes(operatorPrisma)).pedidos.find((s) => s.datos.cuit === CUIT_RED)!;
  const red = await conf.configurarSolicitud(operatorPrisma, {
    estudioTenantId: base.a.id, solicitudId: pRed.id,
    sesion: SOPORTE,
    form: { ...form, razonSocial: "Autoservicio Red Sur", cuit: CUIT_RED, email: "redsur@ejemplo.test", plan: "pyme", duplicado: "otro" },
  });
  assert.ok(red.ok, JSON.stringify(red));
  assert.equal(red.otrosLocales, true);
  assert.ok(red.avisos.includes(confReglas.avisoDeOtrosLocales("varios-locales")!), JSON.stringify(red.avisos));

  // ── 4) «Es este» sin la autorización del dueño: no ── con ella y doble clic: UN resultado ──
  const esEste = { ...form, duplicado: `es:${base.b.id}` };
  const sinPermiso = await conf.configurarSolicitud(operatorPrisma, { estudioTenantId: base.a.id, solicitudId: pKiosco.id, sesion: SOPORTE, form: esEste });
  assert.deepEqual(sinPermiso, { ok: false, error: confReglas.AVISO_VINCULO_SIN_AUTORIZACION });
  assert.equal((await duenio.tenant.findUniqueOrThrow({ where: { id: base.b.id } })).arcaCuit, null, "nada a medias");
  const [uno, dos] = await Promise.all([
    conf.configurarSolicitud(operatorPrisma, { estudioTenantId: base.a.id, solicitudId: pKiosco.id, sesion: SOPORTE, form: { ...esEste, autorizaVinculo: "si" } }),
    conf.configurarSolicitud(operatorPrisma, { estudioTenantId: base.a.id, solicitudId: pKiosco.id, sesion: SOPORTE, form: { ...esEste, autorizaVinculo: "si" } }),
  ]);
  assert.ok(uno.ok && dos.ok, JSON.stringify([uno, dos]));
  assert.equal([uno, dos].filter((r) => r.ok && !r.yaConfigurada).length, 1, "doble clic: uno configura, el otro ve el pedido cerrado");
  const hecho = [uno, dos].find((r) => r.ok && !r.yaConfigurada)!;
  assert.ok(hecho.ok && !hecho.creado && hecho.clienteTenantId === base.b.id);
  assert.ok(hecho.ok && hecho.avisos.some((a) => a.includes("20-11111111-2") && a.includes("QA Kiosco Lab")), "el aviso dice a quién se le cargó el CUIT");
  assert.equal(hecho.ok && hecho.usuarios.some((u) => u.clave !== null), false, "no entrega claves");
  assert.equal(await duenio.tenant.count(), tenantsAntes + 2, "no se creó otro negocio (la sucursal y la red del paso 3 bis)");
  const bDespues = await duenio.tenant.findUniqueOrThrow({ where: { id: base.b.id } });
  assert.equal(bDespues.arcaCuit, CUIT_KIOSCO, "se le cargó el CUIT");
  assert.equal(bDespues.arcaPuntoVenta, 3, "y el punto de venta, que no tenía");
  assert.equal(bDespues.plan, bAntes.plan, "conserva su plan");
  assert.deepEqual(bDespues.modules, bAntes.modules, "conserva sus apps");
  assert.equal(await duenio.carteraCliente.count({ where: { tenantId: base.a.id, clienteTenantId: base.b.id } }), 1);
  const audB = await duenio.auditLog.findFirst({ where: { tenantId: base.b.id, action: confReglas.ACCION_CONFIGURADOR_ALTA } });
  assert.equal((audB?.changes as { cuitCargado?: boolean }).cuitCargado, true, "queda en el historial del negocio");

  // ── 5) Otro pedido que eligió «Es este» con el Kiosco ya con CUIT: se rechaza (no pisa el CUIT) ──
  await pedir("QA Kiosco Lab", CUIT_TARDE, "tarde@ejemplo.test");
  const pTarde = (await conf.listarSolicitudesPendientes(operatorPrisma)).pedidos.find((s) => s.datos.cuit === CUIT_TARDE)!;
  assert.deepEqual(pTarde.parecidos, [], "el Kiosco ya tiene CUIT: deja de ser un parecido");
  const tarde = await conf.configurarSolicitud(operatorPrisma, {
    estudioTenantId: base.a.id, solicitudId: pTarde.id, sesion: SOPORTE, form: { ...esEste, cuit: CUIT_TARDE, email: "tarde@ejemplo.test", autorizaVinculo: "si" },
  });
  assert.equal(tarde.ok, false);
  assert.match(!tarde.ok ? tarde.error : "", /ya no figura/);
  assert.equal((await duenio.tenant.findUniqueOrThrow({ where: { id: base.b.id } })).arcaCuit, CUIT_KIOSCO, "el CUIT no se pisó");
  await conf.descartarSolicitud(operatorPrisma, { estudioTenantId: base.a.id, solicitudId: pTarde.id, sesion: SOPORTE, motivo: "faltan-datos" });

  // ── 6) Pedir de nuevo el Kiosco, que YA está en la cartera: «Ya está en la cartera de este estudio» ──
  await pedir("QA Kiosco Lab", CUIT_KIOSCO, "kiosco@ejemplo.test");
  const pOtraVez = (await conf.listarSolicitudesPendientes(operatorPrisma)).pedidos.find((s) => s.datos.cuit === CUIT_KIOSCO)!;
  assert.deepEqual(pOtraVez.yaExisten.map((x) => [x.id, x.enCartera]), [[base.b.id, true]]);
  const yaEsta = await conf.configurarSolicitud(operatorPrisma, { estudioTenantId: base.a.id, solicitudId: pOtraVez.id, sesion: SOPORTE, form: { ...form, autorizaVinculo: "si" } });
  assert.deepEqual(yaEsta, { ok: false, error: confReglas.YA_EN_LA_CARTERA });
  assert.equal(await duenio.carteraCliente.count({ where: { tenantId: base.a.id, clienteTenantId: base.b.id } }), 1);

  // ── 7) Descartado con motivo: la contadora lo ve; otro estudio (B) no ve nada de A ──
  assert.deepEqual(
    await conf.descartarSolicitud(operatorPrisma, { estudioTenantId: base.a.id, solicitudId: pOtraVez.id, sesion: SOPORTE, motivo: "ya-en-cartera" }),
    { ok: true, motivo: "ya-en-cartera" },
  );
  const deA = await pedidosDeAltaDelEstudio(base.a.id);
  assert.deepEqual(deA.enCurso, [], "no queda nada en curso");
  const motivos = deA.descartadas.map((d) => [d.cuit, d.motivo]);
  assert.deepEqual(motivos, [
    [CUIT_KIOSCO, "Ya está en tu cartera: no hacía falta pedir el alta."],
    [CUIT_TARDE, "Faltan datos para darlo de alta."],
  ]);
  const deB = await pedidosDeAltaDelEstudio(base.b.id);
  assert.deepEqual(deB, { enCurso: [], enCursoTotal: 0, descartadas: [], descartadasTotal: 0 }, "B no ve pedidos ni descartes de A");
});
