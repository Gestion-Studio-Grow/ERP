// ============================================================================
// CONSOLA DE LA CUADRILLA · el usuario de un agente con los MISMOS accesos que la persona de su puesto (GSG-MIA-072).
// ============================================================================
//
// Orden del dueño (17/11/2026 07:38Z): «los agentes tienen absoluta autorización del rol, mismos accesos que una
// persona». Brief: los mismos permisos que la persona del puesto, ni más ni menos. Con la base real bajo RLS
// (`app_rls`) y las Server Actions REALES se prueba:
//   · igualar copia el rol y la matriz por usuario de la persona, y saca lo que el agente tenía de más;
//   · después, el permiso efectivo del agente es el de la persona en TODAS las capacidades (ni más ni menos);
//   · aunque copie el rol de la dueña, en la consola sigue siendo agente: no aprueba (criterio 4 de MIA-062);
//   · igualar lo hace una persona: el agente no puede, la supervisión de otro negocio no puede, y en CH el operador
//     que no es dueño tampoco (guardia del negocio); no se iguala con la cuenta de otro agente;
//   · abrir la consola no cambia ningún acceso.
// Sin Postgres local el arnés saltea (en CI falla).

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

function fd(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.append(k, v);
  return f;
}

test("cuadrilla: el usuario del agente queda con los mismos accesos que la persona del puesto, ni más ni menos", async (t) => {
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
  await duenio.tenant.update({ where: { id: b.id }, data: { slug: "beauty-spa" } }); // B es CH (candado del dueño)

  // En A: la persona del puesto de caja (RECEPTION, sin clientes:contacto y con informes prendidos a mano) y el
  // usuario del agente (hoy PROFESSIONAL, con un permiso de más que la persona no tiene).
  const { hashPassword } = await import("@/lib/auth-password");
  const hash = await hashPassword("no-se-usa-en-el-test-1");
  const usuario = (tenantId: string, name: string, role: "OWNER" | "RECEPTION" | "PROFESSIONAL") =>
    duenio.user.create({ data: { tenantId, name, email: `${name.replace(/\W/g, "").toLowerCase()}@negocio.test`, passwordHash: hash, role } });
  const persona = await usuario(a.id, "Cajera Humana", "RECEPTION");
  await duenio.userPermissionOverride.createMany({
    data: [
      { tenantId: a.id, userId: persona.id, capability: "clients:contact", allowed: false },
      { tenantId: a.id, userId: persona.id, capability: "reports:read", allowed: true },
    ],
  });
  const delAgente = await usuario(a.id, "Usuario Joaquin", "PROFESSIONAL");
  await duenio.userPermissionOverride.create({ data: { tenantId: a.id, userId: delAgente.id, capability: "catalog:manage", allowed: true } });
  const agente = await duenio.agenteCuadrilla.create({ data: { tenantId: a.id, nombre: "Joaquín", puesto: "caja", equipo: "Caja", userId: delAgente.id } });
  const otroAgente = await duenio.agenteCuadrilla.create({ data: { tenantId: a.id, nombre: "Bruno", puesto: "cobranzas", equipo: "Caja", userId: a.recepcion.id } });
  const personaB = await usuario(b.id, "Recepcion CH", "RECEPTION");
  const agenteB = await duenio.agenteCuadrilla.create({ data: { tenantId: b.id, nombre: "Turnos CH", puesto: "caja", equipo: "Turnos", userId: b.recepcion.id } });

  const { panelAccesos } = await import("@/app/admin/(dashboard)/cuadrilla/actions");
  const { operadorAccesos } = await import("@/app/operador/(console)/cuadrilla/actions");
  const { createOperatorToken } = await import("@/lib/operator-auth");
  const { ALL_CAPABILITIES, permisoEfectivo } = await import("@/lib/capabilities");
  const supA = { negocio: a, usuario: a.duenia };
  const supB = { negocio: b, usuario: b.duenia };
  const comoAgente = { negocio: a, usuario: delAgente };
  const facu = { cookies: { operator_session: await createOperatorToken("facu") } };
  const tomas = { cookies: { operator_session: await createOperatorToken("tomas") } };
  const conError = (r: { tipo: string; destino?: string }) => r.tipo === "redireccion" && /[?&]error=/.test(r.destino ?? "");
  const sinError = (r: { tipo: string; destino?: string }) => r.tipo === "redireccion" && !/[?&]error=/.test(r.destino ?? "");
  const accesos = async (userId: string) => {
    const u = await duenio.user.findUniqueOrThrow({ where: { id: userId }, select: { role: true, permissionOverrides: { select: { capability: true, allowed: true } } } });
    return { role: u.role, overrides: u.permissionOverrides.map((o) => `${o.capability}=${o.allowed}`).sort() };
  };

  await t.test("nadie que no corresponde iguala: ni el agente, ni la supervisión de otro negocio, ni con la cuenta de otro agente", async () => {
    const inicial = await accesos(delAgente.id);
    assert.ok(conError(await ejecutarAccion(comoAgente, () => panelAccesos(fd({ agenteId: agente.id, personaId: persona.id })))));
    assert.ok(conError(await ejecutarAccion(supB, () => panelAccesos(fd({ agenteId: agente.id, personaId: persona.id })))), "desde B no se encuentra el agente de A");
    assert.ok(conError(await ejecutarAccion(supA, () => panelAccesos(fd({ agenteId: agente.id, personaId: a.recepcion.id })))), "la recepcionista de A es el usuario de otro agente");
    assert.ok(conError(await ejecutarAccion(supA, () => panelAccesos(fd({ agenteId: agente.id, personaId: personaB.id })))), "persona de otro negocio");
    assert.ok(conError(await ejecutarAccion(supA, () => panelAccesos(fd({ agenteId: agente.id, personaId: delAgente.id })))));
    assert.deepEqual(await accesos(delAgente.id), inicial);
  });

  await t.test("la supervisión iguala: mismo rol, misma matriz, y lo que tenía de más se va", async () => {
    assert.ok(sinError(await ejecutarAccion(supA, () => panelAccesos(fd({ agenteId: agente.id, personaId: persona.id })))));
    assert.deepEqual(await accesos(delAgente.id), await accesos(persona.id));
    assert.deepEqual(await accesos(delAgente.id), { role: "RECEPTION", overrides: ["clients:contact=false", "reports:read=true"] });
    assert.equal((await duenio.agenteCuadrilla.findUniqueOrThrow({ where: { id: agente.id } })).comoUserId, persona.id);
    // Ni más ni menos: el permiso efectivo coincide en TODAS las capacidades del sistema.
    const conPermisos = async (id: string) => {
      const u = await duenio.user.findUniqueOrThrow({ where: { id }, select: { role: true, permissionOverrides: { select: { capability: true, allowed: true } } } });
      return { role: u.role, overrides: u.permissionOverrides } as Parameters<typeof permisoEfectivo>[0];
    };
    const ag = await conPermisos(delAgente.id);
    const pe = await conPermisos(persona.id);
    for (const cap of ALL_CAPABILITIES) assert.equal(permisoEfectivo(ag, cap), permisoEfectivo(pe, cap), cap);
    // Queda a la vista en el hilo del agente quién lo hizo.
    const aviso = await duenio.mensajeCuadrilla.findFirstOrThrow({ where: { tenantId: a.id, hilo: `agente:${agente.id}`, autorTipo: "SISTEMA" } });
    assert.match(aviso.texto, /iguales a los de Cajera Humana \(rol Recepción, 2 permisos propios\)/);
  });

  await t.test("la consola lo muestra: iguales; si alguien cambia algo a mano, aparece la diferencia", async () => {
    const { tenantTransaction } = await import("@/lib/rls");
    const { estadoDeAccesos } = await import("@/lib/cuadrilla/accesos-core");
    const leer = () =>
      tenantTransaction(async (tx) => (await estadoDeAccesos(tx, a.id, [{ id: agente.id, userId: delAgente.id, comoUserId: persona.id }])).get(agente.id)!, { tenantId: a.id });
    assert.deepEqual((await leer()).diferencias, []);
    await duenio.userPermissionOverride.create({ data: { tenantId: a.id, userId: delAgente.id, capability: "users:manage", allowed: true } });
    assert.deepEqual((await leer()).diferencias, ["permiso «users:manage»: sí (la persona: lo del rol)"]);
    assert.ok(sinError(await ejecutarAccion(supA, () => panelAccesos(fd({ agenteId: agente.id, personaId: persona.id })))));
    assert.deepEqual((await leer()).diferencias, []);
  });

  await t.test("con el rol de la dueña sigue siendo agente en la consola: no aprueba", async () => {
    assert.ok(sinError(await ejecutarAccion(supA, () => panelAccesos(fd({ agenteId: agente.id, personaId: a.duenia.id })))));
    assert.equal((await accesos(delAgente.id)).role, "OWNER");
    const ex = await duenio.excepcionCuadrilla.create({ data: { tenantId: a.id, agenteId: otroAgente.id, tipo: "APROBACION", categoria: "OTRA", titulo: "Algo para aprobar", contenido: "x" } });
    const { panelDecidir } = await import("@/app/admin/(dashboard)/cuadrilla/actions");
    assert.ok(conError(await ejecutarAccion(comoAgente, () => panelDecidir(fd({ id: ex.id, op: "aprobar", huella: "" })))));
    assert.equal((await duenio.excepcionCuadrilla.findUniqueOrThrow({ where: { id: ex.id } })).estado, "PENDIENTE");
  });

  await t.test("operador GSG: en CH sólo el dueño de GSG iguala", async () => {
    const inicial = await accesos(b.recepcion.id);
    const r = await ejecutarAccion(facu, () => operadorAccesos(fd({ tenantId: b.id, agenteId: agenteB.id, personaId: personaB.id })));
    assert.ok(r.tipo === "redireccion" && /s%C3%B3lo\+el\+due%C3%B1o|sólo el dueño/.test(r.destino));
    assert.deepEqual(await accesos(b.recepcion.id), inicial);
    assert.ok(sinError(await ejecutarAccion(tomas, () => operadorAccesos(fd({ tenantId: b.id, agenteId: agenteB.id, personaId: personaB.id })))));
    assert.deepEqual(await accesos(b.recepcion.id), await accesos(personaB.id));
    // Parado en A con el agente de B: no se encuentra.
    assert.ok(conError(await ejecutarAccion(tomas, () => operadorAccesos(fd({ tenantId: a.id, agenteId: agenteB.id, personaId: persona.id })))));
  });
});
