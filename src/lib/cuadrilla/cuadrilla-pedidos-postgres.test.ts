// ============================================================================
// CONSOLA DE LA CUADRILLA · pedidos con alcance y tope, con la base real bajo RLS (GSG-MIA-062, criterio 8).
// ============================================================================
//
// Base efímera (src/test/base-efimera.ts), conexión `app_rls` sin BYPASSRLS, Server Actions REALES. Se prueba:
//   · un pedido fuera del puesto tiene dos salidas y nada más: NEGADO (con la regla del manual «puesto §n») u
//     OPORTUNIDAD (texto fijo de traspaso, dueño COM; lo que mande el formulario se ignora);
//   · el tope de turnos y el de minutos frenan y escalan (queda una excepción para una persona);
//   · un pedido lo cierra sólo el agente que lo recibió: ni otro agente, ni la supervisión, ni otro negocio;
//   · las listas (negados, oportunidades, topes) por negocio y por agente; el operador pide en el negocio donde
//     está parado, nunca en otro.
// Sin Postgres local el arnés saltea (en CI falla).

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

function fd(campos: Record<string, string | string[]>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) for (const x of Array.isArray(v) ? v : [v]) f.append(k, x);
  return f;
}

test("cuadrilla bajo RLS: pedidos fuera de alcance (negado u oportunidad) y tope de esfuerzo", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  const antes = { ...process.env };
  Object.assign(process.env, { OPERATOR_SECRET: "secreto-de-operador-qa", AUTH_SECRET: "secreto-de-auth-qa", OPERADOR_DUENIO: "tomas" });
  t.after(() => {
    for (const k of ["OPERATOR_SECRET", "AUTH_SECRET", "OPERADOR_DUENIO"]) {
      if (antes[k] === undefined) delete process.env[k];
      else process.env[k] = antes[k];
    }
  });
  prepararAccionesDeServidor();

  const duenio = await prismaComoDuenio(base);
  base.alBorrar(() => duenio.$disconnect());
  const { a, b } = base;
  const ag = async (tenantId: string, nombre: string, userId: string | null) =>
    (await duenio.agenteCuadrilla.create({ data: { tenantId, nombre, puesto: "verificador", equipo: "Comercial", userId } })).id;
  const a1 = await ag(a.id, "Verificadora A1", a.recepcion.id); // la recepcionista de A ES el usuario del agente A1
  const a2 = await ag(a.id, "Redactor A2", null);
  const b1 = await ag(b.id, "Verificadora B1", null);

  const { panelHablar, panelAvanzarPedido, panelCerrarPedido } = await import("@/app/admin/(dashboard)/cuadrilla/actions");
  const { operadorHablar } = await import("@/app/operador/(console)/cuadrilla/actions");
  const { tenantTransaction } = await import("@/lib/rls");
  const { leerPedidos, vencerPedidos } = await import("@/lib/cuadrilla/pedidos-core");
  const { RESPUESTA_OPORTUNIDAD } = await import("@/lib/cuadrilla/pedidos");
  const { createOperatorToken } = await import("@/lib/operator-auth");

  const supA = { negocio: a, usuario: a.duenia };
  const supB = { negocio: b, usuario: b.duenia };
  const agenteA = { negocio: a, usuario: a.recepcion };
  const operador = { cookies: { operator_session: await createOperatorToken("tomas") } };
  const conError = (r: { tipo: string; destino?: string }) => r.tipo === "redireccion" && /[?&]error=/.test(r.destino ?? "");
  const sinError = (r: { tipo: string; destino?: string }) => r.tipo === "redireccion" && !/[?&]error=/.test(r.destino ?? "");
  const pedido = (texto: string) => duenio.pedidoCuadrilla.findFirstOrThrow({ where: { texto } });
  const pedir = async (agenteId: string, texto: string, topes: Record<string, string> = {}) => {
    assert.ok(sinError(await ejecutarAccion(supA, () => panelHablar(fd({ hilo: `agente:${agenteId}`, texto, ...topes })))));
    return pedido(texto);
  };

  await t.test("la supervisión pide en el hilo de un agente: queda un pedido ABIERTO con el tope que fijó", async () => {
    const p = await pedir(a1, "Haceme un juego completo en un solo prompt", { topeMinutos: "45", topeTurnos: "3" });
    assert.equal(p.estado, "ABIERTO");
    assert.equal(p.tenantId, a.id);
    assert.equal(p.topeMinutos, 45);
    assert.equal(p.topeTurnos, 3);
    assert.equal(p.pedidoPorUserId, a.duenia.id);
    // Un tope fuera de rango no se guarda: vale el de la consola por defecto.
    const q = await pedir(a1, "Revisá la agenda de mañana", { topeMinutos: "9999", topeTurnos: "0" });
    assert.equal(q.topeMinutos, 30);
    assert.equal(q.topeTurnos, 10);
  });

  await t.test("ajeno al servicio: sin la regla del manual no se niega; con la regla queda NEGADO y se contesta amable", async () => {
    const p = await pedido("Haceme un juego completo en un solo prompt");
    assert.ok(conError(await ejecutarAccion(agenteA, () => panelCerrarPedido(fd({ pedidoId: p.id, salida: "AJENO", regla: "porque no", queSi: "verificar los turnos del día" })))));
    assert.equal((await pedido(p.texto)).estado, "ABIERTO");
    const r = await ejecutarAccion(agenteA, () => panelCerrarPedido(fd({ pedidoId: p.id, salida: "AJENO", regla: "verificador §2", queSi: "verificar los turnos del día y avisarte" })));
    assert.ok(sinError(r));
    const n = await pedido(p.texto);
    assert.equal(n.estado, "NEGADO");
    assert.equal(n.salida, "AJENO");
    assert.equal(n.regla, "verificador §2");
    assert.match(n.respuesta ?? "", /^Gracias por el pedido\. .*verificador §2.*Lo que sí puedo hacer: verificar/);
    const m = await duenio.mensajeCuadrilla.findFirstOrThrow({ where: { tenantId: a.id, hilo: `agente:${a1}`, autorTipo: "AGENTE" }, orderBy: { createdAt: "desc" } });
    assert.equal(m.texto, n.respuesta);
    // Ya cerrado: no se vuelve a cerrar por otra salida.
    assert.ok(conError(await ejecutarAccion(agenteA, () => panelCerrarPedido(fd({ pedidoId: p.id, salida: "OPORTUNIDAD" })))));
  });

  await t.test("posible servicio de GSG: ESCALADO a Oportunidades, dueño COM, siempre el texto fijo (sin precio ni plazo)", async () => {
    const p = await pedir(a1, "Armame una landing para el evento del sábado");
    const r = await ejecutarAccion(agenteA, () =>
      panelCerrarPedido(fd({ pedidoId: p.id, salida: "OPORTUNIDAD", respuesta: "Te sale $ 100.000 y está el lunes", regla: "x §1" })),
    );
    assert.ok(sinError(r));
    const n = await pedido(p.texto);
    assert.equal(n.estado, "ESCALADO");
    assert.equal(n.salida, "OPORTUNIDAD");
    assert.equal(n.duenio, "COM");
    assert.equal(n.regla, null);
    assert.equal(n.respuesta, RESPUESTA_OPORTUNIDAD);
    assert.ok(n.cerradoEn instanceof Date);
    assert.equal(await duenio.mensajeCuadrilla.count({ where: { tenantId: a.id, texto: { contains: "100.000" } } }), 0);
  });

  await t.test("tope de turnos: el último turno escala y frena; después no avanza ni se da por terminado", async () => {
    const p = await pedir(a1, "Confirmá los turnos de la semana", { topeTurnos: "2" });
    assert.ok(sinError(await ejecutarAccion(agenteA, () => panelAvanzarPedido(fd({ pedidoId: p.id, texto: "Confirmé lunes y martes" })))));
    assert.equal((await pedido(p.texto)).turnosUsados, 1);
    assert.ok(sinError(await ejecutarAccion(agenteA, () => panelAvanzarPedido(fd({ pedidoId: p.id, texto: "Confirmé miércoles" })))));
    const n = await pedido(p.texto);
    assert.equal(n.estado, "ESCALADO");
    assert.equal(n.salida, "TOPE");
    assert.equal(n.turnosUsados, 2);
    const ex = await duenio.excepcionCuadrilla.findFirstOrThrow({ where: { tenantId: a.id, agenteId: a1, titulo: "Un pedido llegó al tope de turnos" } });
    assert.equal(ex.tipo, "ESCALADO");
    assert.equal(ex.estado, "PENDIENTE");
    assert.ok(conError(await ejecutarAccion(agenteA, () => panelAvanzarPedido(fd({ pedidoId: p.id, texto: "sigo igual" })))));
    assert.ok(conError(await ejecutarAccion(agenteA, () => panelCerrarPedido(fd({ pedidoId: p.id, salida: "HECHO", respuesta: "Listo" })))));
    assert.equal((await pedido(p.texto)).turnosUsados, 2);
  });

  await t.test("tope de minutos: al leer la consola se escala solo; un HECHO tardío no lo cierra", async () => {
    const p = await pedir(a1, "Ordená la lista de clientes", { topeMinutos: "5" });
    await duenio.pedidoCuadrilla.update({ where: { id: p.id }, data: { createdAt: new Date(Date.now() - 6 * 60_000) } });
    const r = await ejecutarAccion(agenteA, () => panelCerrarPedido(fd({ pedidoId: p.id, salida: "HECHO", respuesta: "Ya está" })));
    assert.ok(conError(r), "pasado el tope no se da por terminado");
    const n = await pedido(p.texto);
    assert.equal(n.estado, "ESCALADO");
    assert.equal(n.salida, "TOPE");
    assert.equal(await duenio.excepcionCuadrilla.count({ where: { tenantId: a.id, titulo: "Un pedido llegó al tope de minutos" } }), 1);
    // Otro vencido sin que nadie lo toque: lo escala la lectura de la consola (y una sola vez).
    const q = await pedir(a1, "Mirá los mensajes de ayer", { topeMinutos: "5" });
    await duenio.pedidoCuadrilla.update({ where: { id: q.id }, data: { createdAt: new Date(Date.now() - 10 * 60_000) } });
    assert.equal(await tenantTransaction((tx) => vencerPedidos(tx, a.id), { tenantId: a.id }), 1);
    assert.equal(await tenantTransaction((tx) => vencerPedidos(tx, a.id), { tenantId: a.id }), 0);
    assert.equal((await pedido(q.texto)).estado, "ESCALADO");
  });

  await t.test("un pedido lo cierra sólo su agente: ni otro agente, ni la supervisión, ni otro negocio", async () => {
    const deA2 = await pedir(a2, "Redactá el saludo de fin de año");
    assert.ok(conError(await ejecutarAccion(agenteA, () => panelCerrarPedido(fd({ pedidoId: deA2.id, salida: "OPORTUNIDAD" })))));
    assert.ok(conError(await ejecutarAccion(agenteA, () => panelAvanzarPedido(fd({ pedidoId: deA2.id, texto: "me meto" })))));
    const deA1 = await pedir(a1, "Pasame el resumen del día");
    assert.ok(conError(await ejecutarAccion(supA, () => panelCerrarPedido(fd({ pedidoId: deA1.id, salida: "HECHO", respuesta: "lo cierro yo" })))));
    assert.ok(conError(await ejecutarAccion(supB, () => panelCerrarPedido(fd({ pedidoId: deA1.id, salida: "AJENO", regla: "verificador §1", queSi: "nada de nada de nada" })))));
    assert.equal((await pedido(deA2.texto)).estado, "ABIERTO");
    assert.equal((await pedido(deA1.texto)).estado, "ABIERTO");
  });

  await t.test("listas por vista y por agente; desde B no se ve ni un pedido de A (RLS sola tampoco)", async () => {
    const enA = (vista: "negados" | "oportunidades" | "topes" | "abiertos", agenteId?: string) =>
      tenantTransaction((tx) => leerPedidos(tx, a.id, { vista, agenteId }), { tenantId: a.id });
    assert.deepEqual((await enA("negados")).map((p) => p.texto), ["Haceme un juego completo en un solo prompt"]);
    assert.deepEqual((await enA("oportunidades")).map((p) => [p.texto, p.duenio]), [["Armame una landing para el evento del sábado", "COM"]]);
    assert.equal((await enA("topes")).length, 3);
    assert.deepEqual((await enA("abiertos", a2)).map((p) => p.agenteNombre), ["Redactor A2"]);
    const desdeB = await tenantTransaction(
      async (tx) => ({ todos: await leerPedidos(tx, b.id), crudo: await tx.pedidoCuadrilla.findMany({ where: { tenantId: a.id } }) }),
      { tenantId: b.id },
    );
    assert.equal(desdeB.todos.length, 0);
    assert.equal(desdeB.crudo.length, 0);
  });

  await t.test("operador GSG: pide en B parado en B; parado en A con el agente de B no crea nada", async () => {
    assert.ok(conError(await ejecutarAccion(operador, () => operadorHablar(fd({ tenantId: a.id, hilo: `agente:${b1}`, texto: "Cruzado de negocio" })))));
    assert.equal(await duenio.pedidoCuadrilla.count({ where: { texto: "Cruzado de negocio" } }), 0);
    assert.ok(sinError(await ejecutarAccion(operador, () => operadorHablar(fd({ tenantId: b.id, hilo: `agente:${b1}`, texto: "Revisá la caja de hoy", topeTurnos: "4" })))));
    const p = await pedido("Revisá la caja de hoy");
    assert.equal(p.tenantId, b.id);
    assert.equal(p.pedidoPor, "tomas (GSG)");
    assert.equal(p.pedidoPorUserId, null);
    assert.equal(p.topeTurnos, 4);
  });

  await t.test("la base misma no deja guardar un negado sin regla ni una oportunidad con otro dueño", async () => {
    const fila = { tenantId: a.id, agenteId: a1, texto: "forzado", pedidoPor: "test" };
    await assert.rejects(duenio.pedidoCuadrilla.create({ data: { ...fila, estado: "NEGADO", salida: "AJENO" } }));
    await assert.rejects(duenio.pedidoCuadrilla.create({ data: { ...fila, estado: "ESCALADO", salida: "OPORTUNIDAD", duenio: "OPS" } }));
    await assert.rejects(duenio.pedidoCuadrilla.create({ data: { ...fila, topeTurnos: 0 } }));
  });
});
