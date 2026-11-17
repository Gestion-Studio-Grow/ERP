// ============================================================================
// GUARDIA DEL AGENTE OWNER (GSG-MIA-080, SEGURIDAD): G1, G3, G4 y G5 de la certificación.
// ============================================================================
//
// Un usuario de agente de la Cuadrilla que tiene rol OWNER (cargado antes del techo o a mano en la base) es un estado
// anómalo. La guardia está en el PUNTO COMÚN de la sesión del panel (`getSesionDelPanel`, que usan `requireUser`,
// `requireCapability`, sus variantes, `getCurrentUser` y la auditoría): para ese usuario NO HAY SESIÓN.
//   · G1: no escribe por soporte, inmobiliaria ni taller (ni por ninguna otra ruta del panel): base igual.
//   · G3: tampoco lee (`getUsers`, la matriz de permisos): decisión de MIA-080, rechazadas.
//   · G4: la dueña humana sigue escribiendo y leyendo; el agente que no es OWNER sigue en su consola.
//   · G5: mientras exista un agente OWNER en el negocio, reanudar (prender) agentes se niega con un aviso, desde el
//     panel y desde la consola del operador GSG, y el negocio queda como estaba. Pausar sigue andando.
// Con la base real bajo RLS (`app_rls`, `apuntarLaAppA`) y las Server Actions REALES. Sin Postgres local el arnés
// saltea (en CI falla).

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

// La tabla del permiso de soporte está en prisma/pending-gate2 (Gate 2, no es migración): se crea acá, sólo en la base
// efímera, con lo mínimo (lo mismo que borrador-y-permiso-postgres.test.ts), para que la ruta de soporte escriba de
// verdad y la foto lo vea.
const TABLA_SOPORTE = [
  `CREATE TABLE IF NOT EXISTS "SoporteConsentimiento" (
    "id" TEXT NOT NULL PRIMARY KEY, "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id"),
    "nivel" TEXT NOT NULL CHECK ("nivel" IN ('n1', 'n2')), "aceptado" BOOLEAN NOT NULL,
    "versionTexto" TEXT NOT NULL, "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `ALTER TABLE "SoporteConsentimiento" ENABLE ROW LEVEL SECURITY`,
  `CREATE POLICY tenant_isolation ON "SoporteConsentimiento"
    USING ("tenantId" = current_setting('app.current_tenant_id', true))
    WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true))`,
  `GRANT SELECT, INSERT ON "SoporteConsentimiento" TO app_rls`,
];

function fd(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.append(k, v);
  return f;
}

test("guardia del agente OWNER: sin sesión del panel, no escribe ni lee; los demás siguen; no se prende la Cuadrilla", async (t) => {
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
  const { a } = base;
  for (const sql of TABLA_SOPORTE) await duenio.$executeRawUnsafe(sql);
  const { hashPassword } = await import("@/lib/auth-password");
  const hash = await hashPassword("no-se-usa-en-el-test-1");
  const usuario = (name: string, role: "OWNER" | "RECEPTION") =>
    duenio.user.create({ data: { tenantId: a.id, name, email: `${name.replace(/\W/g, "").toLowerCase()}@negocio.test`, passwordHash: hash, role } });
  // El usuario de un agente YA OWNER (antes del techo o a mano) y el de un agente con el rol del puesto.
  const delAgenteOwner = await usuario("Usuario Agente Owner", "OWNER");
  const delAgenteCaja = await usuario("Usuario Agente Caja", "RECEPTION");
  const agenteOwner = await duenio.agenteCuadrilla.create({ data: { tenantId: a.id, nombre: "Joaquín", puesto: "caja", equipo: "Caja", userId: delAgenteOwner.id } });
  const agenteCaja = await duenio.agenteCuadrilla.create({ data: { tenantId: a.id, nombre: "Bruno", puesto: "cobranzas", equipo: "Caja", userId: delAgenteCaja.id, estado: "PAUSADO" } });

  const comoAgenteOwner = { negocio: a, usuario: delAgenteOwner };
  const comoAgenteCaja = { negocio: a, usuario: delAgenteCaja };
  const laDuenia = { negocio: a, usuario: a.duenia };
  const { createOperatorToken } = await import("@/lib/operator-auth");
  const tomas = { cookies: { operator_session: await createOperatorToken("tomas") } };

  // El rechazo de la guardia: al login con el aviso propio, desde el punto común (no desde cada ruta).
  const rechazado = (r: { tipo: string; destino?: string }) =>
    r.tipo === "redireccion" && /^\/admin\/login\?(.*&)?error=agente_duenio(&|$)/.test(r.destino ?? "");

  /** Foto de lo que las rutas de G1 podrían escribir, más usuarios, auditoría y agentes. */
  const foto = async () => {
    const [soporte, taller, inmo, auditoria, usuarios, agentes] = await Promise.all([
      duenio.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM "SoporteConsentimiento" WHERE "tenantId" = ${a.id}`,
      duenio.tallerConfig.findUnique({ where: { tenantId: a.id } }),
      duenio.inmoConfig.findUnique({ where: { tenantId: a.id } }),
      duenio.auditLog.count({ where: { tenantId: a.id } }),
      duenio.user.findMany({ where: { tenantId: a.id }, orderBy: { id: "asc" }, select: { id: true, role: true, active: true, passwordHash: true } }),
      duenio.agenteCuadrilla.findMany({ where: { tenantId: a.id }, orderBy: { id: "asc" }, select: { id: true, estado: true } }),
    ]);
    return {
      soporteConsentimientos: Number(soporte[0]?.n ?? 0),
      tallerConfig: taller ? JSON.stringify(taller) : null,
      inmoConfig: inmo ? JSON.stringify(inmo) : null,
      auditLog: auditoria,
      usuarios: JSON.stringify(usuarios),
      agentes: JSON.stringify(agentes),
    };
  };
  const resumen = (f: Awaited<ReturnType<typeof foto>>) =>
    `soporte=${f.soporteConsentimientos} taller=${f.tallerConfig ? "sí" : "no"} inmo=${f.inmoConfig ? "sí" : "no"} auditoría=${f.auditLog}`;

  const { cambiarPermisoSoporteAction } = await import("@/app/admin/(dashboard)/ajustes/soporte/actions");
  const inmobiliaria = await import("@/lib/inmobiliaria/acciones");
  const taller = await import("@/lib/taller/acciones");

  await t.test("G1: el agente OWNER no escribe por soporte, inmobiliaria ni taller; la base queda igual", async (tt) => {
    const inicial = await foto();
    tt.diagnostic(`foto antes:   ${resumen(inicial)}`);
    const intentos: [string, () => Promise<unknown>][] = [
      ["soporte: sacar el permiso n1 (anda aun con el interruptor apagado)", () => cambiarPermisoSoporteAction(null, fd({ nivel: "n1" }))],
      ["inmobiliaria: guardarConfigRecibo (acciones.ts:1012)", () => inmobiliaria.guardarConfigRecibo(fd({ prefijo: "AGT" }))],
      ["inmobiliaria: guardarConfigInmo (acciones.ts:1027)", () => inmobiliaria.guardarConfigInmo(fd({ prefijoCodigo: "AGT" }))],
      ["taller: guardarConfig (acciones.ts:603)", () => taller.guardarConfig(fd({}))],
    ];
    for (const [nombre, accion] of intentos) {
      const r = await ejecutarAccion(comoAgenteOwner, accion);
      assert.ok(rechazado(r), `${nombre}: ${JSON.stringify(r)}`);
    }
    const final = await foto();
    tt.diagnostic(`foto después: ${resumen(final)}`);
    assert.deepEqual(final, inicial, "nada escrito");
  });

  await t.test("G1/G2: el rechazo sale del punto común: las 5 puertas de authz.ts y getCurrentUser", async () => {
    const authz = await import("@/lib/authz");
    const { getCurrentUser } = await import("@/lib/session");
    const puertas: [string, () => Promise<unknown>][] = [
      ["requireUser", () => authz.requireUser()],
      ["requireUserConCambioPendiente", () => authz.requireUserConCambioPendiente()],
      ["requireCapability", () => authz.requireCapability("dashboard:read")],
      ["requireCapabilityFueraDeLaAgenda", () => authz.requireCapabilityFueraDeLaAgenda("dashboard:read")],
      ["requireAlgunaCapability", () => authz.requireAlgunaCapability(["dashboard:read"])],
    ];
    for (const [nombre, puerta] of puertas) {
      const r = await ejecutarAccion(comoAgenteOwner, puerta);
      assert.ok(rechazado(r), `${nombre}: ${JSON.stringify(r)}`);
    }
    const r = await ejecutarAccion(comoAgenteOwner, () => getCurrentUser());
    assert.ok(r.tipo === "respuesta" && r.valor === null, `getCurrentUser: ${JSON.stringify(r)}`);
    const pude = await ejecutarAccion(comoAgenteOwner, () => authz.canCurrentUser("users:manage"));
    assert.ok(pude.tipo === "respuesta" && pude.valor === false, `canCurrentUser: ${JSON.stringify(pude)}`);
  });

  await t.test("G3: el agente OWNER tampoco lee Usuarios ni la matriz de permisos", async () => {
    const { getUsers } = await import("@/lib/user-actions");
    const { cargarDatosDeLaMatriz } = await import("@/app/admin/(dashboard)/usuarios/matriz.server");
    const r1 = await ejecutarAccion(comoAgenteOwner, () => getUsers());
    assert.ok(rechazado(r1), `getUsers (user-actions.ts:65): ${JSON.stringify(r1).slice(0, 200)}`);
    const r2 = await ejecutarAccion(comoAgenteOwner, () => cargarDatosDeLaMatriz());
    assert.ok(rechazado(r2), `cargarDatosDeLaMatriz (matriz.server.ts:32): ${JSON.stringify(r2).slice(0, 200)}`);
  });

  await t.test("G4: la dueña humana escribe por las 3 rutas y lee Usuarios (control)", async () => {
    const inicial = await foto();
    const r = await ejecutarAccion(laDuenia, () => cambiarPermisoSoporteAction(null, fd({ nivel: "n1" })));
    assert.ok(r.tipo === "respuesta" && (r.valor as { ok: boolean }).ok === true, `soporte: ${JSON.stringify(r)}`);
    for (const accion of [
      () => inmobiliaria.guardarConfigRecibo(fd({ prefijo: "DUE" })),
      () => inmobiliaria.guardarConfigInmo(fd({ prefijoCodigo: "DUE" })),
      () => taller.guardarConfig(fd({})),
    ]) {
      const s = await ejecutarAccion(laDuenia, accion);
      assert.ok(s.tipo !== "redireccion" || !/\/admin\/login/.test(s.destino), JSON.stringify(s));
    }
    const final = await foto();
    assert.equal(final.soporteConsentimientos, inicial.soporteConsentimientos + 1, "soporte escrito");
    assert.ok(final.inmoConfig && final.tallerConfig, "configuraciones escritas");
    const { getUsers } = await import("@/lib/user-actions");
    const u = await ejecutarAccion(laDuenia, () => getUsers());
    assert.ok(u.tipo === "respuesta" && Array.isArray(u.valor) && u.valor.length >= 4, `getUsers: ${JSON.stringify(u).slice(0, 200)}`);
  });

  await t.test("G4: el agente que no es OWNER sigue entrando y es agente en su consola", async () => {
    const authz = await import("@/lib/authz");
    const r = await ejecutarAccion(comoAgenteCaja, () => authz.requireUser());
    assert.ok(r.tipo === "respuesta" && (r.valor as { id: string }).id === delAgenteCaja.id, JSON.stringify(r));
    const { actorDelPanel } = await import("@/lib/cuadrilla/actor-del-panel.server");
    const c = await ejecutarAccion(comoAgenteCaja, () => actorDelPanel());
    assert.ok(c.tipo === "respuesta" && c.valor.actor?.tipo === "agente" && c.valor.actor.agenteId === agenteCaja.id, JSON.stringify(c));
  });

  const estadoDe = async (id: string) => (await duenio.agenteCuadrilla.findUniqueOrThrow({ where: { id } })).estado;

  await t.test("G5: con un agente OWNER, reanudar (prender) se niega con aviso, en el panel y en la consola GSG", async () => {
    const { panelAgente } = await import("@/app/admin/(dashboard)/cuadrilla/actions");
    const { operadorAgente } = await import("@/app/operador/(console)/cuadrilla/actions");
    const inicial = await foto();
    const p = await ejecutarAccion(laDuenia, () => panelAgente(fd({ agenteId: agenteCaja.id, estado: "ACTIVO" })));
    assert.ok(p.tipo === "redireccion" && /[?&]error=/.test(p.destino), `panel: ${JSON.stringify(p)}`);
    assert.match(decodeURIComponent(p.destino.replace(/\+/g, " ")), /Dueño\/a/, "el aviso nombra el problema");
    const o = await ejecutarAccion(tomas, () => operadorAgente(fd({ tenantId: a.id, agenteId: agenteCaja.id, estado: "ACTIVO" })));
    assert.ok(o.tipo === "redireccion" && /[?&]error=/.test(o.destino), `operador: ${JSON.stringify(o)}`);
    assert.equal(await estadoDe(agenteCaja.id), "PAUSADO", "el agente sigue pausado");
    assert.deepEqual(await foto(), inicial, "el negocio quedó como estaba");
    // Pausar sí: es lo seguro.
    const pausa = await ejecutarAccion(tomas, () => operadorAgente(fd({ tenantId: a.id, agenteId: agenteOwner.id, estado: "PAUSADO" })));
    assert.ok(pausa.tipo === "redireccion" && !/[?&]error=/.test(pausa.destino), `pausar: ${JSON.stringify(pausa)}`);
    assert.equal(await estadoDe(agenteOwner.id), "PAUSADO");
  });

  await t.test("G5/G4: corregido el rol del agente, la dueña y el operador GSG vuelven a prender (control)", async () => {
    await duenio.user.update({ where: { id: delAgenteOwner.id }, data: { role: "RECEPTION" } });
    const { panelAgente } = await import("@/app/admin/(dashboard)/cuadrilla/actions");
    const { operadorAgente } = await import("@/app/operador/(console)/cuadrilla/actions");
    const p = await ejecutarAccion(laDuenia, () => panelAgente(fd({ agenteId: agenteCaja.id, estado: "ACTIVO" })));
    assert.ok(p.tipo === "redireccion" && !/[?&]error=/.test(p.destino), `panel: ${JSON.stringify(p)}`);
    assert.equal(await estadoDe(agenteCaja.id), "ACTIVO");
    const o = await ejecutarAccion(tomas, () => operadorAgente(fd({ tenantId: a.id, agenteId: agenteOwner.id, estado: "ACTIVO" })));
    assert.ok(o.tipo === "redireccion" && !/[?&]error=/.test(o.destino), `operador: ${JSON.stringify(o)}`);
    assert.equal(await estadoDe(agenteOwner.id), "ACTIVO");
    // Y su usuario, ya sin rol de dueña, vuelve a tener sesión (como agente).
    const authz = await import("@/lib/authz");
    const r = await ejecutarAccion(comoAgenteOwner, () => authz.requireUser());
    assert.ok(r.tipo === "respuesta", JSON.stringify(r));
  });
});
