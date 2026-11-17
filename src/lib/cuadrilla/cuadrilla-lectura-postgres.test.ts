// ============================================================================
// CONSOLA DE LA CUADRILLA · ninguna lectura escribe (GSG-MIA-072, bloqueante de MIA-069).
// ============================================================================
//
// MIA-069 lo vio en vivo: el operador qa069 (no dueño) sólo ABRIÓ `/operador/cuadrilla` y el pedido vencido de un
// negocio con slug beauty-spa (CH, candado del dueño) pasó a ESCALADO/TOPE, con una excepción y un mensaje nuevos.
// La causa: `cargarNegocio` (lo que lee cada negocio para la pantalla) llamaba a `vencerPedidos`, que escribe, y
// la página sólo pide `requireOperator`, sin la guardia del negocio.
//
// Acá, con la base real bajo RLS (`app_rls`) y las páginas y acciones REALES:
//   1. un operador que NO es dueño abre la consola (sin filtros, con un negocio, con una excepción y un hilo, en la
//      vista «Llegaron al tope») y NINGÚN negocio cambia: ni pedidos, ni excepciones, ni mensajes;
//   2. lo mismo con la supervisión de un negocio y con el usuario de un agente en `/admin/cuadrilla`;
//   3. el vencido igual se ve («pasó el tope»), y se escala sólo con una ACCIÓN: la del operador pasa por
//      `requireOperadorParaNegocio` (en CH, sólo el dueño de GSG) y la de la supervisión, por su sesión.
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

test("cuadrilla: abrir la consola no escribe en ningún negocio; escalar los vencidos es una acción con su guardia", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  const { valorDeClave } = await import("@/lib/operador/clave-operador");
  const antes = { ...process.env };
  Object.assign(process.env, {
    OPERATOR_SECRET: "secreto-de-operador-qa",
    AUTH_SECRET: "secreto-de-auth-qa",
    OPERADOR_DUENIO: "tomas",
    OPERADORES: `facu=${await valorDeClave("clave-de-facu", new Uint8Array(16).fill(9))}`,
  });
  t.after(() => {
    for (const k of ["OPERATOR_SECRET", "AUTH_SECRET", "OPERADOR_DUENIO", "OPERADORES"]) {
      if (antes[k] === undefined) delete process.env[k];
      else process.env[k] = antes[k];
    }
  });
  prepararAccionesDeServidor();

  const duenio = await prismaComoDuenio(base);
  base.alBorrar(() => duenio.$disconnect());
  const { a, b } = base;
  // A es CH: el slug con candado del dueño (REQUIEREN_OK_DEL_DUENIO). B es un negocio cualquiera.
  await duenio.tenant.update({ where: { id: a.id }, data: { slug: "beauty-spa" } });

  const agente = async (tenantId: string, nombre: string, userId: string | null) =>
    (await duenio.agenteCuadrilla.create({ data: { tenantId, nombre, puesto: "caja", equipo: "Caja", userId } })).id;
  const agA = await agente(a.id, "Turnos CH ficticio", null);
  const agB = await agente(b.id, "Caja B", b.recepcion.id); // la recepcionista de B es el usuario del agente
  const hace2h = new Date(Date.now() - 2 * 60 * 60_000);
  const vencido = async (tenantId: string, agenteId: string, texto: string) =>
    (await duenio.pedidoCuadrilla.create({ data: { tenantId, agenteId, texto, pedidoPor: "test", topeMinutos: 30, createdAt: hace2h } })).id;
  const pA = await vencido(a.id, agA, "Vencido en CH");
  const pB = await vencido(b.id, agB, "Vencido en B");
  const exB = (await duenio.excepcionCuadrilla.create({ data: { tenantId: b.id, agenteId: agB, tipo: "APROBACION", categoria: "OTRA", titulo: "Una de B", contenido: "x" } })).id;

  /** Todo lo que la consola podría escribir, de los dos negocios, leído como dueño de las tablas (sin RLS). */
  const foto = async () => ({
    pedidos: await duenio.pedidoCuadrilla.findMany({ orderBy: { id: "asc" }, select: { id: true, estado: true, salida: true, cerradoEn: true, turnosUsados: true, updatedAt: true } }),
    excepciones: await duenio.excepcionCuadrilla.findMany({ orderBy: { id: "asc" }, select: { id: true, estado: true, updatedAt: true } }),
    mensajes: await duenio.mensajeCuadrilla.count(),
    agentes: await duenio.agenteCuadrilla.findMany({ orderBy: { id: "asc" }, select: { id: true, estado: true, updatedAt: true } }),
  });

  const { createOperatorToken } = await import("@/lib/operator-auth");
  const facu = { cookies: { operator_session: await createOperatorToken("facu") } }; // operador, NO dueño
  const tomas = { cookies: { operator_session: await createOperatorToken("tomas") } }; // el dueño de GSG
  const { default: PaginaOperador } = await import("@/app/operador/(console)/cuadrilla/page");
  const { default: PaginaPanel } = await import("@/app/admin/(dashboard)/cuadrilla/page");
  const abrir = (sp: Record<string, string>) => () => PaginaOperador({ searchParams: Promise.resolve(sp) });
  const abrirPanel = (sp: Record<string, string>) => () => PaginaPanel({ searchParams: Promise.resolve(sp) });

  await t.test("un operador que no es dueño abre la consola de varias formas y ningún negocio cambia", async () => {
    const inicial = await foto();
    const vistas: Record<string, string>[] = [{}, { negocio: a.id }, { negocio: b.id, en: b.id, ex: exB, hilo: `agente:${agB}` }, { pedidos: "topes" }, { pedidos: "abiertos", agente: agA }];
    for (const sp of vistas) {
      const r = await ejecutarAccion(facu, abrir(sp));
      assert.equal(r.tipo, "respuesta", `la página abre (${JSON.stringify(sp)})`);
    }
    assert.deepEqual(await foto(), inicial, "abrir /operador/cuadrilla no escribe en ningún negocio, CH incluido");
    assert.equal((await duenio.pedidoCuadrilla.findUniqueOrThrow({ where: { id: pA } })).estado, "ABIERTO");
  });

  await t.test("la supervisión y el usuario del agente abren /admin/cuadrilla y nada cambia", async () => {
    const inicial = await foto();
    assert.equal((await ejecutarAccion({ negocio: b, usuario: b.duenia }, abrirPanel({}))).tipo, "respuesta");
    assert.equal((await ejecutarAccion({ negocio: b, usuario: b.duenia }, abrirPanel({ pedidos: "topes" }))).tipo, "respuesta");
    assert.equal((await ejecutarAccion({ negocio: b, usuario: b.recepcion }, abrirPanel({}))).tipo, "respuesta");
    assert.deepEqual(await foto(), inicial);
  });

  await t.test("el vencido se ve como vencido sin escribir nada", async () => {
    const { tenantTransaction } = await import("@/lib/rls");
    const { leerPedidos } = await import("@/lib/cuadrilla/pedidos-core");
    const inicial = await foto();
    const lista = await tenantTransaction((tx) => leerPedidos(tx, b.id, { vista: "abiertos" }), { tenantId: b.id });
    assert.deepEqual(lista.map((p) => [p.texto, p.vencido]), [["Vencido en B", "minutos"]]);
    assert.deepEqual(await foto(), inicial);
  });

  await t.test("escalar los vencidos: el operador no dueño NO puede en CH; el dueño sí; cada negocio por separado", async () => {
    const { operadorVencer } = await import("@/app/operador/(console)/cuadrilla/actions");
    const inicial = await foto();
    const r = await ejecutarAccion(facu, () => operadorVencer(fd({ tenantId: a.id })));
    assert.equal(r.tipo, "redireccion");
    assert.match(decodeURIComponent((r as { destino: string }).destino.replace(/\+/g, " ")), /sólo el dueño de GSG/);
    assert.deepEqual(await foto(), inicial, "la guardia de CH corta antes de escribir");

    assert.equal((await ejecutarAccion(facu, () => operadorVencer(fd({ tenantId: b.id })))).tipo, "redireccion");
    assert.equal((await duenio.pedidoCuadrilla.findUniqueOrThrow({ where: { id: pB } })).estado, "ESCALADO");
    assert.equal((await duenio.pedidoCuadrilla.findUniqueOrThrow({ where: { id: pA } })).estado, "ABIERTO", "escalar B no toca CH");

    assert.equal((await ejecutarAccion(tomas, () => operadorVencer(fd({ tenantId: a.id })))).tipo, "redireccion");
    const enA = await duenio.pedidoCuadrilla.findUniqueOrThrow({ where: { id: pA } });
    assert.deepEqual([enA.estado, enA.salida], ["ESCALADO", "TOPE"]);
  });

  await t.test("la supervisión escala los vencidos de SU negocio; el usuario del agente no puede", async () => {
    const { panelVencer } = await import("@/app/admin/(dashboard)/cuadrilla/actions");
    const pB2 = await vencido(b.id, agB, "Otro vencido en B");
    const pA2 = await vencido(a.id, agA, "Otro vencido en CH");
    const r = await ejecutarAccion({ negocio: b, usuario: b.recepcion }, () => panelVencer(fd({})));
    assert.ok(r.tipo === "redireccion" && /[?&]error=/.test(r.destino));
    assert.equal((await duenio.pedidoCuadrilla.findUniqueOrThrow({ where: { id: pB2 } })).estado, "ABIERTO");
    assert.equal((await ejecutarAccion({ negocio: b, usuario: b.duenia }, () => panelVencer(fd({ tenantId: a.id })))).tipo, "redireccion");
    assert.equal((await duenio.pedidoCuadrilla.findUniqueOrThrow({ where: { id: pB2 } })).estado, "ESCALADO");
    assert.equal((await duenio.pedidoCuadrilla.findUniqueOrThrow({ where: { id: pA2 } })).estado, "ABIERTO", "el negocio sale de la sesión, no del formulario");
  });
});
