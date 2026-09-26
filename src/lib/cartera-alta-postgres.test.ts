// ============================================================================
// ALTA POR PEDIDO + CONFIGURADOR DE SOPORTE GSG — contra Postgres (GSG-20 de raíz, GSG-21)
// ============================================================================
//
// Base efímera propia (src/test/base-efimera.ts): el negocio A hace de estudio contable (módulo
// `cartera`), el B es un negocio ajeno con su CUIT cargado. Se corre `altaClienteCarteraAction` TAL
// CUAL, con la sesión de la dueña de A, y el configurador (`configurarSolicitud`) con el cliente del
// operador, y se mide en la base.
//
// Qué se prueba:
//   · GSG-20: un CUIT de otro negocio, uno libre y uno inexistente reciben la MISMA respuesta
//     (valor idéntico) y dejan el MISMO rastro (un pedido en la auditoría de A); ninguno crea
//     negocios ni toca la cartera ni a B. El pedido repetido no se duplica.
//   · B (sin cartera) no puede pedir altas.
//   · Configurador: crea el negocio con plan, módulos y datos fiscales, usuarios con clave temporal,
//     lo suma a la cartera, audita y cierra el pedido; un doble clic simultáneo crea UN negocio.
//   · CUIT existente: se vincula el negocio de B a la cartera de A, sin duplicarlo ni pisar su plan.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const CUIT_DE_B = "20111111112";
const CUIT_NUEVO = "20222222223";
const CUIT_INEXISTENTE = "20333333334";
const CUIT_A_DESCARTAR = "20444444445";
const SOPORTE = { nombre: "soporte", esDuenio: false };

test("alta por pedido: misma respuesta con cualquier CUIT, y Soporte lo configura una sola vez", async (t) => {
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
  base.alBorrar(() => operatorPrisma.$disconnect());

  await operatorPrisma.tenant.update({ where: { id: base.a.id }, data: { modules: ["cartera", "clients", "reports"] } });
  await operatorPrisma.tenant.update({ where: { id: base.b.id }, data: { arcaCuit: CUIT_DE_B, arcaPuntoVenta: 4, plan: "micro" } });
  const bAntes = await operatorPrisma.tenant.findUnique({ where: { id: base.b.id } });
  const tenantsAntes = await operatorPrisma.tenant.count();

  const comoEstudio = <T>(fn: () => Promise<T>) => ejecutarAccion({ negocio: base.a, usuario: base.a.duenia }, fn);
  const pedir = (nombre: string, cuit: string, email: string) =>
    comoEstudio(() => altaClienteCarteraAction({ nombre, cuit, email, puntoVenta: "3", whatsapp: "11 5555-4444", condicionIva: "MONOTRIBUTO", tamanio: "chico" }));

  // ── 1) GSG-20: tres CUITs, una sola respuesta ──
  const ajeno = await pedir("Kiosco de Otro", CUIT_DE_B, "otro@ejemplo.test");
  const libre = await pedir("Ferretería El Tornillo", CUIT_NUEVO, "tornillo@ejemplo.test");
  const inexistente = await pedir("Otro Nuevo", CUIT_INEXISTENTE, "nuevo@ejemplo.test");
  const esperado = { ok: true, mensaje: reglas.RESPUESTA_SOLICITUD_ALTA };
  for (const r of [ajeno, libre, inexistente]) {
    assert.equal(r.tipo, "respuesta");
    assert.deepEqual(r.tipo === "respuesta" && r.valor, esperado, "misma respuesta con cualquier CUIT");
  }
  assert.equal(await operatorPrisma.tenant.count(), tenantsAntes, "pedir no crea negocios");
  assert.equal(await operatorPrisma.carteraCliente.count({ where: { tenantId: base.a.id } }), 0, "la cartera de A sigue vacía");
  assert.deepEqual(await operatorPrisma.tenant.findUnique({ where: { id: base.b.id } }), bAntes, "B intacto");
  const pedidos = await operatorPrisma.auditLog.findMany({
    where: { tenantId: base.a.id, action: reglas.ACCION_SOLICITUD_ALTA },
    orderBy: { createdAt: "asc" },
  });
  assert.equal(pedidos.length, 3, "un pedido por CUIT, el mismo rastro para los tres");
  assert.ok(pedidos.every((p) => p.actor === `user:${base.a.duenia.id}`), "queda quién lo pidió");
  assert.equal(
    await operatorPrisma.auditLog.count({ where: { tenantId: base.b.id, action: { startsWith: "cartera." } } }),
    0,
    "B no se entera de nada",
  );

  // Repetir el pedido abierto (doble clic) no lo duplica, y contesta lo mismo.
  const repetido = await pedir("Ferretería El Tornillo", CUIT_NUEVO, "tornillo@ejemplo.test");
  assert.deepEqual(repetido.tipo === "respuesta" && repetido.valor, esperado);
  assert.equal(await operatorPrisma.auditLog.count({ where: { tenantId: base.a.id, action: reglas.ACCION_SOLICITUD_ALTA } }), 3);

  // Un CUIT mal tipeado sí se rechaza: depende sólo de lo escrito.
  const malo = await pedir("X Y", "20111111113", "x@ejemplo.test");
  assert.deepEqual(malo.tipo === "respuesta" && malo.valor, { ok: false, error: "El CUIT no es válido: revisá los 11 números." });

  // B no es estudio: no puede pedir altas.
  const desdeB = await ejecutarAccion({ negocio: base.b, usuario: base.b.duenia }, () =>
    altaClienteCarteraAction({ nombre: "Algo", cuit: CUIT_NUEVO, email: "a@ejemplo.test" }),
  );
  assert.ok(desdeB.tipo !== "respuesta" || (desdeB.valor as { ok: boolean }).ok === false, "sin cartera no hay pedido");
  assert.equal(await operatorPrisma.auditLog.count({ where: { tenantId: base.b.id, action: reglas.ACCION_SOLICITUD_ALTA } }), 0);

  // ── 2) La bandeja de Soporte ve los tres, con el CUIT ajeno marcado ──
  const bandeja = (await conf.listarSolicitudesPendientes(operatorPrisma)).pedidos;
  assert.equal(bandeja.length, 3);
  const pedidoAjeno = bandeja.find((s) => s.datos.cuit === CUIT_DE_B)!;
  const pedidoLibre = bandeja.find((s) => s.datos.cuit === CUIT_NUEVO)!;
  assert.deepEqual(pedidoAjeno.yaExisten.map((x) => x.id), [base.b.id], "Soporte sí ve que el CUIT existe");
  assert.equal(pedidoLibre.pedidoPor?.email, base.a.duenia.email);

  // ── 3) Configurar el CUIT libre, con doble clic simultáneo ──
  const form = {
    razonSocial: "Ferretería El Tornillo SRL",
    cuit: CUIT_NUEVO,
    condicionIva: "RESPONSABLE_INSCRIPTO", regimenFacturaA: "A",
    puntoVenta: "3",
    rubro: "mostrador",
    plan: "micro",
    email: "tornillo@ejemplo.test",
    whatsapp: "1155554444",
    subdominio: "tornillo",
  };
  const [uno, dos] = await Promise.all([
    conf.configurarSolicitud(operatorPrisma, { solicitudId: pedidoLibre.id, sesion: SOPORTE, form }),
    conf.configurarSolicitud(operatorPrisma, { solicitudId: pedidoLibre.id, sesion: SOPORTE, form }),
  ]);
  assert.ok(uno.ok && dos.ok, JSON.stringify([uno, dos]));
  const [hecho, repe] = uno.ok && !uno.yaConfigurada ? [uno, dos] : [dos, uno];
  assert.ok(hecho.ok && !hecho.yaConfigurada && repe.ok && repe.yaConfigurada, "uno configura, el otro ve el pedido cerrado");
  assert.equal(repe.ok && repe.clienteTenantId, hecho.ok && hecho.clienteTenantId);
  assert.equal(await operatorPrisma.tenant.count(), tenantsAntes + 1, "doble clic = un solo negocio");
  assert.ok(hecho.ok);
  if (!hecho.ok) return;
  assert.equal(hecho.creado, true);
  assert.equal(repe.ok && repe.usuarios.length, 0, "el reintento no vuelve a mostrar claves");
  const creado = await operatorPrisma.tenant.findUniqueOrThrow({ where: { id: hecho.clienteTenantId } });
  assert.equal(creado.plan, "micro");
  assert.equal(creado.arcaCuit, CUIT_NUEVO);
  assert.equal(creado.arcaCondicionIva, "RESPONSABLE_INSCRIPTO");
  assert.equal(creado.arcaPuntoVenta, 3);
  assert.equal(creado.arcaHomologacion, true);
  assert.equal(creado.subdomain, "tornillo");
  assert.ok(creado.modules.includes("arca") && creado.modules.includes("pos"), creado.modules.join(","));
  const usuarios = await operatorPrisma.user.findMany({ where: { tenantId: creado.id }, select: { email: true, role: true } });
  assert.deepEqual(usuarios.map((u) => u.email), ["tornillo@ejemplo.test"], "la contadora NO queda de dueña del negocio del cliente");
  const claveDuenio = hecho.usuarios.find((u) => u.quien === "cliente")?.clave;
  assert.ok(typeof claveDuenio === "string" && claveDuenio.length >= 12, "clave temporal del dueño entregada una vez");
  assert.deepEqual(
    hecho.usuarios.find((u) => u.quien === "contadora"),
    { quien: "contadora", nombre: pedidoLibre.pedidoPor?.nombre, email: base.a.duenia.email.toLowerCase(), clave: null },
    "la contadora que pidió ya entra por su cartera: no se le crea nada",
  );
  // El arnés define APP_BASE_DOMAIN: la dirección es la que ese ruteo sirve (el caso «sin dirección» va en el punto 9).
  assert.equal(hecho.direccion, `https://tornillo.${process.env.APP_BASE_DOMAIN}/admin`);
  assert.deepEqual(hecho.pendientes, { condicionIva: false, cambioDeClave: true }, "M1 medida: condición escrita; cambio obligatorio pendiente");
  assert.equal(
    (await operatorPrisma.carteraCliente.findFirst({ where: { tenantId: base.a.id, clienteTenantId: creado.id } }))?.estado,
    "activa",
  );
  const auditoria = await operatorPrisma.auditLog.findMany({
    where: { OR: [{ tenantId: creado.id }, { tenantId: base.a.id }], actor: "operator:soporte" },
    select: { action: true, changes: true },
  });
  assert.deepEqual(auditoria.map((a) => a.action).sort(), ["cartera.alta-por-soporte", "cartera.solicitud_configurada", "configurador.alta", "fiscal.regimen_factura_a"]);
  assert.doesNotMatch(JSON.stringify(auditoria), new RegExp(claveDuenio!), "la clave no queda en la auditoría");
  assert.doesNotMatch(JSON.stringify(auditoria), /1155554444/, "el teléfono no queda en la auditoría");
  assert.equal((await conf.listarSolicitudesPendientes(operatorPrisma)).pedidos.length, 2, "el pedido sale de la bandeja");

  // ── 4) CUIT que ya existe (B): sin la autorización de su dueño no se vincula; con ella, se vincula sin duplicar ──
  const formB = { ...form, razonSocial: "Kiosco de Otro", cuit: CUIT_DE_B, puntoVenta: "4", plan: "facturacion", email: "otro@ejemplo.test", subdominio: "" };
  const sinPermiso = await conf.configurarSolicitud(operatorPrisma, { solicitudId: pedidoAjeno.id, sesion: SOPORTE, form: formB });
  assert.deepEqual(sinPermiso, { ok: false, error: confReglas.AVISO_VINCULO_SIN_AUTORIZACION });
  assert.equal(await operatorPrisma.carteraCliente.count({ where: { tenantId: base.a.id, clienteTenantId: base.b.id } }), 0, "nada a medias");
  const usuariosDeB = await operatorPrisma.user.count({ where: { tenantId: base.b.id } });
  const vinc = await conf.configurarSolicitud(operatorPrisma, {
    solicitudId: pedidoAjeno.id,
    sesion: SOPORTE,
    form: { ...formB, autorizaVinculo: "si" },
  });
  assert.ok(vinc.ok && !vinc.yaConfigurada && !vinc.creado, JSON.stringify(vinc));
  assert.equal(vinc.ok && vinc.clienteTenantId, base.b.id);
  assert.equal(await operatorPrisma.tenant.count(), tenantsAntes + 1, "no se duplicó");
  const b = await operatorPrisma.tenant.findUniqueOrThrow({ where: { id: base.b.id } });
  assert.equal(b.plan, "micro", "conserva su plan");
  assert.deepEqual(b.modules, bAntes!.modules, "conserva sus módulos");
  assert.ok(await operatorPrisma.carteraCliente.findFirst({ where: { tenantId: base.a.id, clienteTenantId: base.b.id } }));
  assert.equal(await operatorPrisma.user.count({ where: { tenantId: base.b.id } }), usuariosDeB, "vincular no crea usuarios en B");
  assert.equal(vinc.ok && vinc.usuarios.some((u) => u.clave !== null), false, "vincular no entrega claves");

  // ── 5) CH sólo con el dueño; un CUIT inválido se frena antes de tocar nada ──
  const invalido = await conf.configurarSolicitud(operatorPrisma, {
    solicitudId: bandeja.find((s) => s.datos.cuit === CUIT_INEXISTENTE)!.id,
    sesion: SOPORTE,
    form: { ...form, cuit: "20333333335" },
  });
  assert.equal(invalido.ok, false);
  assert.match(!invalido.ok ? invalido.error : "", /CUIT/, "el motivo del dígito verificador, en castellano");

  // ── 6) Todo o nada: el email del dueño es de una persona del estudio → rechazo y NADA escrito ──
  const pedidoInexistente = bandeja.find((s) => s.datos.cuit === CUIT_INEXISTENTE)!;
  const filasAntes = await operatorPrisma.auditLog.count();
  const usuariosAntes = await operatorPrisma.user.count();
  const formNuevo = { ...form, razonSocial: "Otro Nuevo SA", cuit: CUIT_INEXISTENTE, puntoVenta: "7", subdominio: "otronuevo", plan: "comerciante" };
  const conEmailDelEstudio = await conf.configurarSolicitud(operatorPrisma, {
    solicitudId: pedidoInexistente.id,
    sesion: SOPORTE,
    form: { ...formNuevo, email: base.a.duenia.email },
  });
  assert.deepEqual(conEmailDelEstudio, { ok: false, error: confReglas.EMAIL_DEL_CLIENTE_ES_DEL_ESTUDIO });
  assert.equal(await operatorPrisma.tenant.count(), tenantsAntes + 1, "no quedó negocio");
  assert.equal(await operatorPrisma.auditLog.count(), filasAntes, "no quedó auditoría");
  assert.equal(await operatorPrisma.user.count(), usuariosAntes, "no quedó usuario");

  // ── 7) Acceso nuevo para otra persona del estudio: se crea EN el estudio, con su clave, y el mensaje no lleva la del dueño ──
  const conNueva = await conf.configurarSolicitud(operatorPrisma, {
    solicitudId: pedidoInexistente.id,
    sesion: SOPORTE,
    form: { ...formNuevo, email: "duenio@otronuevo.test", accesoContadora: "nueva", contadoraNombre: "Martina Ruiz", contadoraEmail: "martina@estudio.test" },
  });
  assert.ok(conNueva.ok && conNueva.creado, JSON.stringify(conNueva));
  if (!conNueva.ok) return;
  const martina = await operatorPrisma.user.findFirst({ where: { email: "martina@estudio.test" }, select: { tenantId: true, role: true } });
  assert.deepEqual(martina, { tenantId: base.a.id, role: "OWNER" }, "la contadora nueva vive en el estudio");
  const claveMartina = conNueva.usuarios.find((u) => u.quien === "contadora")?.clave;
  const claveDuenio2 = conNueva.usuarios.find((u) => u.quien === "cliente")?.clave;
  assert.ok(claveMartina && claveDuenio2 && claveMartina !== claveDuenio2);
  const msj = confReglas.mensajeParaLaContadora({
    cliente: conNueva.nombre, cuit: conNueva.cuit, puntoVenta: conNueva.puntoVenta,
    direccionCartera: conNueva.estudio.direccionCartera, acceso: { usuario: "martina@estudio.test", clave: claveMartina! },
  });
  assert.ok(msj.includes(claveMartina!) && !msj.includes(claveDuenio2!), "el mensaje de la contadora no lleva la clave del dueño");
  assert.equal(
    await operatorPrisma.auditLog.count({ where: { tenantId: base.a.id, action: "usuario.alta", actor: "operator:soporte" } }),
    1,
    "el alta del acceso queda auditada en el estudio",
  );

  // ── 8) Descartar: sale de la bandeja, queda en la auditoría y ya no se puede configurar ──
  await pedir("Pedido Repetido", CUIT_A_DESCARTAR, "repetido@ejemplo.test");
  const aDescartar = (await conf.listarSolicitudesPendientes(operatorPrisma)).pedidos.find((s) => s.datos.cuit === CUIT_A_DESCARTAR)!;
  assert.deepEqual(await conf.descartarSolicitud(operatorPrisma, { solicitudId: aDescartar.id, sesion: SOPORTE, motivo: "faltan-datos", nota: "NEGOCIO-AJENO-XYZ: ya lo pidió otra persona del estudio" }), { ok: true, motivo: "faltan-datos" });
  assert.equal((await conf.listarSolicitudesPendientes(operatorPrisma)).pedidos.length, 0, "bandeja vacía");
  // QA 26/09, vuelta 4, bloqueante 1: la contadora lee SÓLO un motivo de la lista cerrada. La nota libre
  // (acá, con el nombre de un negocio ajeno) no llega a la cartera ni a la auditoría del panel del
  // estudio, queda para Soporte, y el estudio B no ve nada del descarte de A. Un motivo libre se rechaza.
  {
    const { leerPedidosDeAltaDelEstudio } = await import("@/app/contador/altas-en-curso.server");
    const { whereAuditoriaDelPanel } = await import("@/app/admin/(dashboard)/auditoria/filtros");
    const { tenantTransaction } = await import("@/lib/rls");
    const vistaA = await tenantTransaction((tx) => leerPedidosDeAltaDelEstudio(tx, base.a.id, new Date()), { tenantId: base.a.id });
    assert.deepEqual(vistaA.descartadas.map((d) => d.motivo), ["Faltan datos para darlo de alta."]);
    assert.ok(!JSON.stringify(vistaA).includes("NEGOCIO-AJENO-XYZ"), "la nota interna no llega a la cartera");
    const auditoriaA = await tenantTransaction(
      (tx) =>
        tx.auditLog.findMany({
          where: { AND: [{ tenantId: base.a.id }, whereAuditoriaDelPanel({} as Parameters<typeof whereAuditoriaDelPanel>[0])] },
          select: { action: true, changes: true },
        }),
      { tenantId: base.a.id },
    );
    assert.ok(auditoriaA.length > 0 && !JSON.stringify(auditoriaA).includes("NEGOCIO-AJENO-XYZ"), "ni a la auditoría del panel del estudio");
    assert.equal(await operatorPrisma.auditLog.count({ where: { tenantId: base.a.id, action: "soporte.nota_interna" } }), 1, "la nota queda para Soporte");
    const vistaB = await tenantTransaction((tx) => leerPedidosDeAltaDelEstudio(tx, base.b.id, new Date()), { tenantId: base.b.id });
    assert.equal(vistaB.descartadas.length, 0, "el estudio B no ve el descarte de A");
    const libre = await conf.descartarSolicitud(operatorPrisma, { solicitudId: aDescartar.id, sesion: SOPORTE, motivo: "QA Kiosco Lab" });
    assert.equal(libre.ok, false, "un motivo escrito a mano no se acepta");
  }
  const tarde = await conf.configurarSolicitud(operatorPrisma, { solicitudId: aDescartar.id, sesion: SOPORTE, form: { ...form, cuit: CUIT_A_DESCARTAR } });
  assert.equal(tarde.ok, false, "un pedido descartado no crea nada");

  // ── 8b) Descartado NO es abierto: el estudio vuelve a pedir ese CUIT y el pedido nuevo se guarda y
  //        llega a la bandeja (antes quedaba bloqueado para siempre y se perdía sin avisar) ──
  const pedidosDelCuit = () =>
    operatorPrisma.auditLog.count({
      where: { tenantId: base.a.id, action: reglas.ACCION_SOLICITUD_ALTA, changes: { path: ["cuit"], equals: CUIT_A_DESCARTAR } },
    });
  assert.equal(await pedidosDelCuit(), 1);
  const otraVez = await pedir("Pedido Repetido", CUIT_A_DESCARTAR, "repetido@ejemplo.test");
  assert.deepEqual(otraVez.tipo === "respuesta" && otraVez.valor, esperado, "misma respuesta de siempre");
  assert.equal(await pedidosDelCuit(), 2, "el pedido nuevo quedó guardado");
  const bandejaDespues = (await conf.listarSolicitudesPendientes(operatorPrisma)).pedidos;
  assert.equal(bandejaDespues.length, 1, "el pedido nuevo está en la bandeja de Soporte");
  assert.equal(bandejaDespues[0]!.datos.cuit, CUIT_A_DESCARTAR);
  assert.notEqual(bandejaDespues[0]!.id, aDescartar.id, "es otro pedido, el descartado sigue cerrado");
  // Con ese pedido nuevo ABIERTO, pedir de nuevo no duplica (la idempotencia sigue en pie).
  await pedir("Pedido Repetido", CUIT_A_DESCARTAR, "repetido@ejemplo.test");
  assert.equal(await pedidosDelCuit(), 2, "con uno abierto no se crea otro");
  // Y al descartarlo también, se puede volver a pedir (no es un candado de una sola vez).
  assert.deepEqual(
    await conf.descartarSolicitud(operatorPrisma, { solicitudId: bandejaDespues[0]!.id, sesion: SOPORTE, motivo: "faltan-datos" }),
    { ok: true, motivo: "faltan-datos" },
  );
  await pedir("Pedido Repetido", CUIT_A_DESCARTAR, "repetido@ejemplo.test");
  assert.equal(await pedidosDelCuit(), 3, "tras el segundo descarte, el tercer pedido también se guarda");
  assert.equal((await conf.listarSolicitudesPendientes(operatorPrisma)).pedidos.length, 1);
  // La contadora ve en su panel lo mismo que está pendiente en la bandeja: el abierto sí, los
  // configurados y descartados no. Con RLS del estudio: B no ve los pedidos de A.
  const { pedidosDeAltaDelEstudio } = await import("@/app/contador/altas-en-curso.server");
  const enCursoA = (await pedidosDeAltaDelEstudio(base.a.id)).enCurso;
  const pendientesAhora = (await conf.listarSolicitudesPendientes(operatorPrisma)).pedidos;
  assert.deepEqual(
    enCursoA.map((x) => x.id),
    pendientesAhora.map((x) => x.id),
    "el panel del estudio muestra exactamente los pedidos que Soporte tiene pendientes",
  );
  assert.equal(enCursoA[0]!.cuit, CUIT_A_DESCARTAR);
  assert.deepEqual((await pedidosDeAltaDelEstudio(base.b.id)).enCurso, [], "B no ve los pedidos de A");
  // La acción pasa la guardia con el estudio del formulario: con otro estudio, el pedido de A «no existe»
  // (ni se descarta ni se configura) y sigue pendiente.
  assert.deepEqual(
    await conf.descartarSolicitud(operatorPrisma, { solicitudId: enCursoA[0]!.id, estudioTenantId: base.b.id, sesion: SOPORTE, motivo: "soporte-escribe" }),
    { ok: false, error: "Ese pedido no existe." },
  );
  const tenantsAntesDelCruce = await operatorPrisma.tenant.count();
  const conOtroEstudio = await conf.configurarSolicitud(operatorPrisma, {
    solicitudId: enCursoA[0]!.id,
    estudioTenantId: base.b.id,
    sesion: SOPORTE,
    form: { ...form, razonSocial: "Pedido Repetido", cuit: CUIT_A_DESCARTAR, subdominio: "repetido", email: "repetido@ejemplo.test" },
  });
  assert.deepEqual(conOtroEstudio, { ok: false, error: "Ese pedido no existe." }, "configurar con otro estudio: el pedido no existe");
  assert.equal(await operatorPrisma.tenant.count(), tenantsAntesDelCruce, "no se creó ningún negocio");
  assert.deepEqual((await conf.listarSolicitudesPendientes(operatorPrisma)).pedidos.map((x) => x.id), [enCursoA[0]!.id], "el pedido de A sigue pendiente");
  // Aislamiento: los pedidos y descartes de A no dejan rastro en B.
  assert.equal(
    await operatorPrisma.auditLog.count({ where: { tenantId: base.b.id, entity: reglas.ENTIDAD_SOLICITUD } }),
    0,
    "B no ve pedidos ni descartes de A",
  );

  // ── 9) Dirección: sólo la que el deploy rutea ──
  assert.equal(conf.direccionDe("tornillo", "/admin", { TENANT_HOST_MAP: "tornillo.gsg.test=tornillo" }), "https://tornillo.gsg.test/admin");
  assert.equal(conf.direccionDe("tornillo", "/admin", { APP_BASE_DOMAIN: "gsg.test" }), "https://tornillo.gsg.test/admin");
  assert.equal(conf.direccionDe("tornillo", "/admin", {}), null);
});
