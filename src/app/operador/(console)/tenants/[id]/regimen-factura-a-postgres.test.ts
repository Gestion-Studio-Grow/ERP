// ============================================================================
// CONSOLA · «Qué Factura A le asignó ARCA» desde la ficha del negocio — la action TAL CUAL, en Postgres.
// ============================================================================
//
// Refutador 26/09: corregirRegimenFacturaAAction toma el negocio del FORMULARIO y no tenía test. Se
// corre con cookies reales (la de la consola se firma con la función real) y se mide en la base:
//   · sin sesión de consola (la dueña de un negocio, o una cookie forjada): al login, nada escrito;
//   · un negocio que no es Responsable Inscripto, uno inexistente o una clase inventada: rechazado;
//   · CH (beauty-spa): un operador que no es el dueño de GSG no lo toca;
//   · el caso bueno escribe UNA fila en ESE negocio (y ningún otro la lee como suya);
//   · la ficha de la consola (sujeta a RLS, como en producción) muestra la clase guardada: antes la
//     leía sin pararse en el negocio y con `app_rls` siempre mostraba «sin elegir».

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor, type SalidaDeAccion } from "@/test/accion-de-servidor";
import type { ResultadoRegimenFacturaA } from "./regimen-factura-a-actions";

test("corregir la Factura A desde la consola: sólo con sesión de operador, sólo a un inscripto, en ESE negocio, y CH sólo el dueño", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  const env = { AUTH_SECRET: process.env.AUTH_SECRET, OPERADORES: process.env.OPERADORES, OPERADOR_DUENIO: process.env.OPERADOR_DUENIO };
  const { valorDeClave } = await import("@/lib/operador/clave-operador");
  process.env.AUTH_SECRET = "secreto-de-auth-qa";
  process.env.OPERADORES = `soporte-qa=${await valorDeClave("clave larga de soporte qa", new Uint8Array(16).fill(5))}`;
  delete process.env.OPERADOR_DUENIO;
  t.after(() => {
    for (const [k, v] of Object.entries(env)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
  prepararAccionesDeServidor();

  const { operatorPrisma } = await import("@/lib/operator-db");
  const { createOperatorToken, operadorDuenio } = await import("@/lib/operator-auth");
  const { corregirRegimenFacturaAAction } = await import("./regimen-factura-a-actions");
  const { leerRegimenFacturaA } = await import("@/lib/fiscal/regimen-factura-a.server");
  const { ACCION_REGIMEN_FACTURA_A } = await import("@/lib/fiscal/regimen-factura-a");
  const { FacturaAFicha } = await import("./FacturaAFicha");
  base.alBorrar(() => operatorPrisma.$disconnect());
  // La consola (`operatorPrisma`) es `app_rls`: sembrar y mirar desde afuera, como dueño de las tablas.
  const comoDuenio = await prismaComoDuenio(base);
  /** Lo que la ficha le pasa al formulario como clase vigente, leído por la consola. */
  const enLaFicha = async (tenantId: string) => {
    const el = (await FacturaAFicha({ tenantId })) as { props: { children: { props: { actual: unknown } } } } | null;
    return el === null ? "sin bloque" : el.props.children.props.actual;
  };

  await comoDuenio.tenant.update({ where: { id: base.a.id }, data: { arcaCondicionIva: "MONOTRIBUTO" } });
  await comoDuenio.tenant.update({ where: { id: base.b.id }, data: { arcaCondicionIva: "RESPONSABLE_INSCRIPTO" } });
  const filas = () =>
    comoDuenio.auditLog.findMany({ where: { action: ACCION_REGIMEN_FACTURA_A }, select: { tenantId: true, entityId: true, actor: true, changes: true } });
  const form = (tenantId: string, regimen: string, confirmaFuera = false) => {
    const f = new FormData();
    f.set("tenantId", tenantId);
    f.set("regimen", regimen);
    if (confirmaFuera) f.set("confirmaFacturaAFuera", "si");
    return f;
  };
  const soporte = { operator_session: await createOperatorToken("soporte-qa") };
  const duenio = { operator_session: await createOperatorToken(operadorDuenio()) };
  const conSoporte = (fd: FormData) => ejecutarAccion({ cookies: soporte }, () => corregirRegimenFacturaAAction(null, fd));
  const rechazo = (s: Awaited<ReturnType<typeof conSoporte>>) => {
    assert.equal(s.tipo, "respuesta", JSON.stringify(s));
    const v = (s as { valor: { ok: boolean } }).valor;
    assert.equal(v.ok, false, JSON.stringify(v));
  };

  // 1) Sin sesión de consola: la dueña de B con su panel, o una cookie de consola forjada → al login.
  for (const pedido of [{ negocio: base.b, usuario: base.b.duenia }, { cookies: { operator_session: "op|d|duenio|0000000000000.firma-falsa" } }]) {
    const s: SalidaDeAccion<ResultadoRegimenFacturaA> = await ejecutarAccion(pedido, (): Promise<ResultadoRegimenFacturaA> =>
      corregirRegimenFacturaAAction(null, form(base.b.id, "A")),
    );
    assert.equal(s.tipo, "redireccion", JSON.stringify(s));
    assert.match((s as { destino: string }).destino, /\/operador\/login/);
  }
  assert.deepEqual(await filas(), [], "nada escrito sin sesión de consola");

  // 2) Formularios forjados con sesión de Soporte: no inscripto, inexistente, clase inventada.
  rechazo(await conSoporte(form(base.a.id, "A")));
  rechazo(await conSoporte(form(`${base.b.id}x`, "A")));
  rechazo(await conSoporte(form(base.b.id, "Z")));
  assert.deepEqual(await filas(), []);

  // 3) CH: un operador que no es el dueño de GSG no lo toca; el dueño sí.
  const slugB = base.b.slug;
  await comoDuenio.tenant.update({ where: { id: base.b.id }, data: { slug: "beauty-spa" } });
  try {
    rechazo(await conSoporte(form(base.b.id, "M")));
    assert.deepEqual(await filas(), [], "CH sin el OK del dueño: nada escrito");
    // «M» no la emite el sistema: sin la casilla de la ficha no se guarda, ni con el dueño (QA vuelta 7).
    const sinCasilla: SalidaDeAccion<ResultadoRegimenFacturaA> = await ejecutarAccion({ cookies: duenio }, () =>
      corregirRegimenFacturaAAction(null, form(base.b.id, "M")),
    );
    assert.equal(sinCasilla.tipo === "respuesta" && sinCasilla.valor.ok, false);
    assert.match(sinCasilla.tipo === "respuesta" && !sinCasilla.valor.ok ? sinCasilla.valor.error : "", /sitio de ARCA/);
    assert.deepEqual(await filas(), [], "sin la casilla: nada escrito");
    const s: SalidaDeAccion<ResultadoRegimenFacturaA> = await ejecutarAccion({ cookies: duenio }, () =>
      corregirRegimenFacturaAAction(null, form(base.b.id, "M", true)),
    );
    assert.deepEqual(s.tipo === "respuesta" && s.valor, { ok: true, regimen: "M" });
  } finally {
    await comoDuenio.tenant.update({ where: { id: base.b.id }, data: { slug: slugB } });
  }

  // 4) El caso bueno: la fila queda en ESE negocio, con el operador; la más nueva manda.
  const ok = await conSoporte(form(base.b.id, "A"));
  assert.deepEqual(ok.tipo === "respuesta" && ok.valor, { ok: true, regimen: "A" });
  assert.ok(ok.revalidadas.includes(`/operador/tenants/${base.b.id}`));
  const escritas = await filas();
  assert.equal(escritas.length, 2);
  for (const f of escritas) assert.deepEqual([f.tenantId, f.entityId], [base.b.id, base.b.id], "en el registro de B, sobre B");
  assert.deepEqual(escritas.map((f) => f.actor).sort(), [`operator:${operadorDuenio()}`, "operator:soporte-qa"].sort());
  assert.equal(await leerRegimenFacturaA(base.b.id), "A");
  assert.equal(await leerRegimenFacturaA(base.a.id), null, "A no hereda la clase de B");
  assert.equal(await enLaFicha(base.b.id), "A", "la ficha de la consola muestra la clase guardada");
  assert.equal(await enLaFicha(base.a.id), "sin bloque", "un monotributista no tiene el bloque");
});
