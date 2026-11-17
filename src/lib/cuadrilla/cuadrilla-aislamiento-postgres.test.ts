// ============================================================================
// CONSOLA DE LA CUADRILLA · aislamiento y nivel 0 con la base real bajo RLS (GSG-MIA-062, criterios 3 y 4).
// ============================================================================
//
// Base efímera (src/test/base-efimera.ts): la app y la consola GSG conectan como `app_rls` (sin BYPASSRLS),
// como en producción. Se ejecutan las Server Actions REALES con sesiones reales (panel y consola) y se mira
// el resultado como dueño de las tablas. Se prueba:
//   · la supervisión de A no ve ni toca agentes, hilos ni excepciones de B: ni por id ajeno en la acción, ni
//     forjando la casilla del lote, ni escribiendo en un hilo ajeno; y RLS sola tampoco deja leerlas;
//   · un usuario de agente no aprueba (ni lo propio) y sólo habla en su hilo;
//   · plata y envíos a terceros: nunca en lote; de a uno sólo con la huella del contenido visto;
//   · el operador GSG ve varios negocios, pero cada lectura/escritura queda en el negocio donde está parado.
// Sin Postgres local el arnés saltea (en CI falla): este archivo no tiene un `if (!p) return` propio.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

function fd(campos: Record<string, string | string[]>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) for (const x of Array.isArray(v) ? v : [v]) f.append(k, x);
  return f;
}

test("cuadrilla bajo RLS: aislamiento entre negocios, usuario de agente y nivel 0", async (t) => {
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

  // ── Siembra como dueño de las tablas ──────────────────────────────────────────────────────────
  const duenio = await prismaComoDuenio(base);
  base.alBorrar(() => duenio.$disconnect());
  const { a, b } = base;
  const ag = async (tenantId: string, nombre: string, userId: string | null) =>
    (await duenio.agenteCuadrilla.create({ data: { tenantId, nombre, puesto: "verificador", equipo: "Comercial", userId } })).id;
  const a1 = await ag(a.id, "Verificadora A1", a.recepcion.id); // la recepcionista de A ES el usuario de un agente
  const a2 = await ag(a.id, "Redactor A2", null);
  const b1 = await ag(b.id, "Verificadora B1", null);
  const exc = async (tenantId: string, agenteId: string, categoria: string, titulo: string, creadaPorUserId: string | null = null, tipo = "APROBACION") =>
    (await duenio.excepcionCuadrilla.create({ data: { tenantId, agenteId, tipo, categoria, titulo, contenido: `Contenido de ${titulo}`, creadaPorUserId } })).id;
  const e1 = await exc(a.id, a1, "OTRA", "A común", a.recepcion.id);
  const e2 = await exc(a.id, a2, "PLATA", "A plata");
  const e3 = await exc(a.id, a2, "ENVIO_TERCEROS", "A envío");
  const eb1 = await exc(b.id, b1, "OTRA", "B común");
  const eb2 = await exc(b.id, b1, "PLATA", "B plata");
  const estado = async (id: string) => (await duenio.excepcionCuadrilla.findUniqueOrThrow({ where: { id } })).estado;

  const { panelDecidir, panelLote, panelHablar, panelLevantar } = await import("@/app/admin/(dashboard)/cuadrilla/actions");
  const { operadorDecidir, operadorLote, operadorHablar } = await import("@/app/operador/(console)/cuadrilla/actions");
  const { tenantTransaction } = await import("@/lib/rls");
  const { enElNegocio } = await import("@/lib/operator-db");
  const { leerTablero, huellaDe } = await import("@/lib/cuadrilla/consola-core");
  const { createOperatorToken } = await import("@/lib/operator-auth");

  const supA = { negocio: a, usuario: a.duenia };
  const supB = { negocio: b, usuario: b.duenia };
  const agenteA = { negocio: a, usuario: a.recepcion };
  const recepcionB = { negocio: b, usuario: b.recepcion };
  const operador = { cookies: { operator_session: await createOperatorToken("tomas") } };
  const conError = (r: { tipo: string; destino?: string }) => r.tipo === "redireccion" && /[?&]error=/.test(r.destino ?? "");

  await t.test("RLS sola: parado en B no se lee ni una fila de A (sin filtro de tenantId)", async () => {
    const vistoDesdeB = await tenantTransaction(
      async (tx) => ({
        ex: await tx.excepcionCuadrilla.findMany({ where: { id: { in: [e1, e2, e3] } } }),
        ag: await tx.agenteCuadrilla.findMany({ where: { id: { in: [a1, a2] } } }),
      }),
      { tenantId: b.id },
    );
    assert.equal(vistoDesdeB.ex.length, 0);
    assert.equal(vistoDesdeB.ag.length, 0);
  });

  await t.test("supervisión de A con id de B: no aprueba, no rechaza en lote, no forja la casilla, no habla en su hilo", async () => {
    assert.ok(conError(await ejecutarAccion(supA, () => panelDecidir(fd({ op: "aprobar", id: eb1 })))));
    assert.ok(conError(await ejecutarAccion(supA, () => panelLote(fd({ op: "rechazar", sel: `${b.id}:${eb1}` })))));
    assert.ok(conError(await ejecutarAccion(supA, () => panelLote(fd({ op: "rechazar", sel: [`${a.id}:${eb1}`, `${a.id}:${eb2}`] })))));
    assert.ok(conError(await ejecutarAccion(supA, () => panelHablar(fd({ hilo: `agente:${b1}`, texto: "hola" })))));
    assert.equal(await estado(eb1), "PENDIENTE");
    assert.equal(await estado(eb2), "PENDIENTE");
    assert.equal(await duenio.mensajeCuadrilla.count({ where: { tenantId: b.id } }), 0);
  });

  await t.test("el tablero de A sólo trae lo de A; el de B sólo lo de B", async () => {
    const ta = await tenantTransaction((tx) => leerTablero(tx, a.id), { tenantId: a.id });
    const tb = await tenantTransaction((tx) => leerTablero(tx, b.id), { tenantId: b.id });
    assert.deepEqual(new Set(ta.excepciones.map((e) => e.id)), new Set([e1, e2, e3]));
    assert.deepEqual(new Set(tb.excepciones.map((e) => e.id)), new Set([eb1, eb2]));
    assert.ok(ta.agentes.every((x) => x.id !== b1));
  });

  await t.test("usuario de agente: no aprueba (ni lo propio), sólo habla en su hilo, levanta excepciones", async () => {
    assert.ok(conError(await ejecutarAccion(agenteA, () => panelDecidir(fd({ op: "aprobar", id: e1 })))));
    assert.ok(conError(await ejecutarAccion(agenteA, () => panelDecidir(fd({ op: "aprobar", id: e2, huella: huellaDe("Contenido de A plata") })))));
    assert.ok(conError(await ejecutarAccion(agenteA, () => panelLote(fd({ op: "aprobar", sel: `${a.id}:${e1}` })))));
    assert.equal(await estado(e1), "PENDIENTE");
    assert.equal(await estado(e2), "PENDIENTE");
    assert.ok(conError(await ejecutarAccion(agenteA, () => panelHablar(fd({ hilo: `agente:${a2}`, texto: "me meto" })))));
    const ok = await ejecutarAccion(agenteA, () => panelHablar(fd({ hilo: `agente:${a1}`, texto: "Listo, sigo." })));
    assert.ok(ok.tipo === "redireccion" && !/error=/.test(ok.destino));
    const m = await duenio.mensajeCuadrilla.findFirstOrThrow({ where: { tenantId: a.id, hilo: `agente:${a1}` } });
    assert.equal(m.autorTipo, "AGENTE");
    await ejecutarAccion(agenteA, () => panelLevantar(fd({ tipo: "APROBACION", categoria: "PLATA", titulo: "Pagar a proveedor", contenido: "Transferir $ 10.000 a X" })));
    const nueva = await duenio.excepcionCuadrilla.findFirstOrThrow({ where: { tenantId: a.id, titulo: "Pagar a proveedor" } });
    assert.equal(nueva.creadaPorUserId, a.recepcion.id);
    assert.equal(nueva.agenteId, a1);
  });

  await t.test("una persona sin consola (recepción de B, no agente) no decide nada", async () => {
    assert.ok(conError(await ejecutarAccion(recepcionB, () => panelDecidir(fd({ op: "rechazar", id: eb1 })))));
    assert.equal(await estado(eb1), "PENDIENTE");
  });

  await t.test("nivel 0: nunca en lote; de a uno sólo con la huella del contenido que se vio", async () => {
    assert.ok(conError(await ejecutarAccion(supA, () => panelLote(fd({ op: "aprobar", sel: [`${a.id}:${e1}`, `${a.id}:${e2}`] })))));
    assert.equal(await estado(e1), "PENDIENTE", "el lote con plata no aprueba ni la común");
    assert.ok(conError(await ejecutarAccion(supA, () => panelDecidir(fd({ op: "aprobar", id: e2 })))));
    assert.ok(conError(await ejecutarAccion(supA, () => panelDecidir(fd({ op: "aprobar", id: e2, huella: huellaDe("otro contenido") })))));
    assert.equal(await estado(e2), "PENDIENTE");
    const ok = await ejecutarAccion(supA, () => panelDecidir(fd({ op: "aprobar", id: e2, huella: huellaDe("Contenido de A plata") })));
    assert.ok(ok.tipo === "redireccion" && !/error=/.test(ok.destino));
    assert.equal(await estado(e2), "APROBADA");
    // Aprobar dos veces la misma: la segunda no pasa.
    assert.ok(conError(await ejecutarAccion(supA, () => panelDecidir(fd({ op: "aprobar", id: e2, huella: huellaDe("Contenido de A plata") })))));
    // Rechazar en lote sí puede llevar plata y envíos (no ejecuta nada).
    const r = await ejecutarAccion(supA, () => panelLote(fd({ op: "rechazar", sel: [`${a.id}:${e3}`] })));
    assert.ok(r.tipo === "redireccion" && !/error=/.test(r.destino));
    assert.equal(await estado(e3), "RECHAZADA");
    // La supervisión de A aprueba lo común de A.
    await ejecutarAccion(supA, () => panelDecidir(fd({ op: "aprobar", id: e1 })));
    assert.equal(await estado(e1), "APROBADA");
  });

  await t.test("operador GSG: parado en A no toca un id de B; en B sí, con la misma regla de nivel 0", async () => {
    assert.ok(conError(await ejecutarAccion(operador, () => operadorDecidir(fd({ tenantId: a.id, op: "aprobar", id: eb1 })))));
    assert.ok(conError(await ejecutarAccion(operador, () => operadorHablar(fd({ tenantId: a.id, hilo: `agente:${b1}`, texto: "x" })))));
    assert.equal(await estado(eb1), "PENDIENTE");
    assert.ok(conError(await ejecutarAccion(operador, () => operadorLote(fd({ op: "aprobar", sel: [`${b.id}:${eb1}`, `${b.id}:${eb2}`] })))));
    assert.equal(await estado(eb1), "PENDIENTE");
    assert.ok(conError(await ejecutarAccion(operador, () => operadorDecidir(fd({ tenantId: b.id, op: "aprobar", id: eb2 })))));
    await ejecutarAccion(operador, () => operadorDecidir(fd({ tenantId: b.id, op: "aprobar", id: eb2, huella: huellaDe("Contenido de B plata") })));
    assert.equal(await estado(eb2), "APROBADA");
    await ejecutarAccion(operador, () => operadorLote(fd({ op: "aprobar", sel: [`${b.id}:${eb1}`] })));
    assert.equal(await estado(eb1), "APROBADA");
    const soloA = await enElNegocio(a.id, (tx) => tx.excepcionCuadrilla.findMany({ where: { id: { in: [eb1, eb2] } } }));
    assert.equal(soloA.length, 0, "la conexión de la consola parada en A no ve filas de B");
  });

  await t.test("supervisión de B ve lo de B decidido por el operador y nada de A", async () => {
    const tb = await tenantTransaction((tx) => leerTablero(tx, b.id, { estado: "TODAS" }), { tenantId: b.id });
    assert.equal(tb.excepciones.length, 2);
    assert.ok(tb.excepciones.every((e) => e.tenantId === b.id && e.decididaPor === "tomas (GSG)"));
    void supB;
  });
});
