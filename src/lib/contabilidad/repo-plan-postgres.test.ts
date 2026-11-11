// ============================================================================
// FC-01 · PLAN DE CUENTAS CONTRA POSTGRES — base efímera con RLS (migraciones de las olas 1 y 2).
// ============================================================================
//
//   · sembrar «servicios por proyecto» en un negocio vacío deja todos los roles del rubro con cuenta,
//     y si falta uno la pantalla lo lista;
//   · un negocio no ve ni toca el plan de otro (lectura, alta de hoja, baja, ejercicios);
//   · no se puede imputar a una cuenta que agrupa, ni colgar una hoja de una hoja;
//   · alta de hoja con código del sistema y atributos heredados; baja protegida si cumple un rol;
//   · certificación T1 (reproducciones G1, G2, G3 y P2, ahora cerradas): baja y rol simultáneos, dos
//     cargas simultáneas, baja con saldo o borradores, rubro «proyectos» fabricado con cuentas;
//   · rastro en AuditLog de cada cambio del plan y completar roles sin pisar nada.
// Datos sintéticos.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";

const laBase = baseEfimeraDelArchivo();
const dia = (s: string) => new Date(`${s}T00:00:00Z`);

let preparado: Promise<void> | null = null;
async function preparar(base: BaseEfimera) {
  preparado ??= (async () => {
    apuntarLaAppA(base);
    const repo = await import("./repo");
    assert.equal((await repo.sembrarPlanModelo(base.a.id, "proyectos")).ok, true);
    assert.equal((await repo.sembrarPlanModelo(base.b.id, "comercio")).ok, true);
    assert.equal((await repo.abrirEjercicio(base.a.id, { fechaInicio: dia("2026-01-01"), fechaCierre: dia("2026-12-31") })).ok, true);
  })();
  await preparado;
  return { repo: await import("./repo"), plan: await import("./repo-plan") };
}

async function cuentasDe(tenantId: string) {
  const { plan } = { plan: await import("./repo-plan") };
  const r = await plan.leerPlanDeCuentas(tenantId);
  assert.ok(r.ok);
  return { ...r, id: (codigo: string) => r.cuentas.find((c) => c.codigo === codigo)!.id };
}

test("sembrar «servicios por proyecto» en un negocio vacío: todos los roles del rubro con cuenta", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const { plan } = await preparar(base);
  const { rolesModelo } = await import("./roles");
  const a = await cuentasDe(base.a.id);
  assert.equal(a.rubro, "proyectos", "se reconoce aunque la base guarde «servicios»");
  assert.deepEqual(plan.rolesFaltantes(Object.keys(a.roles), a.rubro).delRubro, []);
  assert.equal(Object.keys(a.roles).length, rolesModelo("proyectos").size);
  assert.equal(a.roles.RETENCIONES_IVA_A_DEPOSITAR, a.id("2.1.2.06"));
  assert.equal(a.roles.DIFERENCIA_DE_CAMBIO, a.id("5.3.08"));
});

test("si falta un rol, la lectura lo lista para asignarlo", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const { repo, plan } = await preparar(base);
  const duenio = await prismaComoDuenio(base);
  await duenio.cuentaRol.delete({ where: { tenantId_rol: { tenantId: base.b.id, rol: "CAJA" } } });
  const b = await cuentasDe(base.b.id);
  assert.equal(b.rubro, "comercio");
  assert.deepEqual(plan.rolesFaltantes(Object.keys(b.roles), b.rubro).delRubro, ["CAJA"]);
  assert.ok((await repo.asignarRolCuenta(base.b.id, "CAJA", b.id("1.1.1.01"))).ok);
  assert.deepEqual(plan.rolesFaltantes(Object.keys((await cuentasDe(base.b.id)).roles), "comercio").delRubro, []);
});

test("aislamiento: un negocio no ve ni toca el plan ni los ejercicios de otro", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const { plan } = await preparar(base);
  const a = await cuentasDe(base.a.id);
  const b = await cuentasDe(base.b.id);
  const idsDeA = new Set(a.cuentas.map((c) => c.id));
  assert.ok(b.cuentas.every((c) => !idsDeA.has(c.id)), "B no recibe ninguna cuenta de A");
  assert.ok(Object.values(b.roles).every((id) => !idsDeA.has(id)));

  const { tenantTransaction } = await import("@/lib/rls");
  const visto = await tenantTransaction((tx) => tx.cuentaContable.count({ where: { tenantId: base.a.id } }), { tenantId: base.b.id });
  assert.equal(visto, 0, "RLS: B no ve filas de A ni pidiéndolas por tenantId");

  const hoja = await plan.agregarHoja(base.b.id, { padreId: a.id("1.1.1"), nombre: "Banco ajeno" });
  assert.ok(!hoja.ok && hoja.error === "NO_ENCONTRADO");
  const baja = await plan.cambiarActivaCuenta(base.b.id, a.id("1.1.1.05"), false);
  assert.ok(!baja.ok && baja.error === "NO_ENCONTRADO");
  const ej = await plan.listarEjercicios(base.b.id);
  assert.ok(ej.ok && ej.ejercicios.length === 0, "B no ve el ejercicio de A");
  const ejA = await plan.listarEjercicios(base.a.id);
  assert.ok(ejA.ok && ejA.ejercicios.length === 1);
});

test("no se puede imputar a una cuenta que agrupa ni colgar una hoja de una hoja", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const { repo, plan } = await preparar(base);
  const a = await cuentasDe(base.a.id);
  const asiento = await repo.registrarAsiento(base.a.id, {
    fecha: dia("2026-03-10"),
    descripcion: "Cobro de un proyecto",
    lineas: [
      { cuentaId: a.id("1.1.1"), debe: BigInt(250000), haber: BigInt(0) },
      { cuentaId: a.id("4.1.01"), debe: BigInt(0), haber: BigInt(250000) },
    ],
  });
  assert.ok(!asiento.ok && asiento.error === "ASIENTO_INVALIDO", JSON.stringify(asiento));

  for (const padre of ["1.1.1.01", "1.1", "1"]) {
    const r = await plan.agregarHoja(base.a.id, { padreId: a.id(padre), nombre: "Cuenta de prueba" });
    assert.ok(!r.ok && r.error === "PADRE_INVALIDO", padre);
  }
  const corto = await plan.agregarHoja(base.a.id, { padreId: a.id("1.1.1"), nombre: " x " });
  assert.ok(!corto.ok && corto.error === "DATOS_INVALIDOS");
  const repetido = await plan.agregarHoja(base.a.id, { padreId: a.id("1.1.1"), nombre: "caja" });
  assert.ok(!repetido.ok && repetido.error === "DATOS_INVALIDOS");
});

test("alta de hoja: código del sistema, atributos heredados e imputable; baja y reactivación", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const { repo, plan } = await preparar(base);
  const a = await cuentasDe(base.a.id);
  const nueva = await plan.agregarHoja(base.a.id, { padreId: a.id("1.1.1"), nombre: "Banco Galicia cuenta sueldos" });
  assert.ok(nueva.ok, JSON.stringify(nueva));
  assert.equal(nueva.codigo, "1.1.1.06");
  const duenio = await prismaComoDuenio(base);
  const fila = await duenio.cuentaContable.findUniqueOrThrow({ where: { id: nueva.cuentaId } });
  assert.equal(fila.tenantId, base.a.id);
  assert.equal(fila.tipo, "ACTIVO");
  assert.equal(fila.naturaleza, "DEUDORA");
  assert.equal(fila.rubro, "CAJA_Y_BANCOS");
  assert.equal(fila.plazo, "CORRIENTE");
  assert.equal(fila.ritmo, null);

  const gasto = await plan.agregarHoja(base.a.id, { padreId: a.id("5.1"), nombre: "Alquiler de equipos de sonido" });
  assert.ok(gasto.ok && gasto.codigo === "5.1.04");
  const filaGasto = await duenio.cuentaContable.findUniqueOrThrow({ where: { id: gasto.cuentaId } });
  assert.equal(filaGasto.funcion, "COSTO");
  assert.equal(filaGasto.ritmo, "VARIABLE");
  assert.equal(filaGasto.nombreDueno, "Alquiler de equipos de sonido");

  const lineas = (cuenta: string) => [
    { cuentaId: cuenta, debe: BigInt(100000), haber: BigInt(0) },
    { cuentaId: a.id("4.1.01"), debe: BigInt(0), haber: BigInt(100000) },
  ];
  assert.ok((await repo.registrarAsiento(base.a.id, { fecha: dia("2026-04-02"), descripcion: "Cobro", lineas: lineas(nueva.cuentaId) })).ok);

  const conRol = await plan.cambiarActivaCuenta(base.a.id, a.id("1.1.1.01"), false);
  assert.ok(!conRol.ok && conRol.error === "CUENTA_EN_USO");
  const agrupador = await plan.cambiarActivaCuenta(base.a.id, a.id("1.1.1"), false);
  assert.ok(!agrupador.ok && agrupador.error === "DATOS_INVALIDOS");

  const conBorrador = await plan.cambiarActivaCuenta(base.a.id, nueva.cuentaId, false);
  assert.ok(!conBorrador.ok && conBorrador.error === "CUENTA_EN_USO", "con un asiento en borrador no se da de baja");

  const sinUso = await plan.agregarHoja(base.a.id, { padreId: a.id("1.1.1"), nombre: "Banco que se cierra" });
  assert.ok(sinUso.ok);
  assert.ok((await plan.cambiarActivaCuenta(base.a.id, sinUso.cuentaId, false)).ok);
  const aInactiva = await repo.registrarAsiento(base.a.id, { fecha: dia("2026-04-03"), descripcion: "Cobro", lineas: lineas(sinUso.cuentaId) });
  assert.ok(!aInactiva.ok && aInactiva.error === "ASIENTO_INVALIDO", "una cuenta dada de baja no recibe asientos");
  assert.ok((await plan.cambiarActivaCuenta(base.a.id, sinUso.cuentaId, true)).ok);
  assert.equal((await cuentasDe(base.a.id)).cuentas.find((c) => c.id === sinUso.cuentaId)!.activa, true);
});

// ── Certificación T1 ────────────────────────────────────────────────────────────────────────────

/** Un negocio más, vacío (la base efímera trae dos). Datos sintéticos. */
async function negocioNuevo(base: BaseEfimera, sufijo: string): Promise<string> {
  const duenio = await prismaComoDuenio(base);
  const id = `negocio-${sufijo}-${Date.now().toString(36)}`;
  await duenio.tenant.create({ data: { id, name: `Negocio ${sufijo}`, slug: id, subdomain: id } });
  return id;
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("G1 · baja y asignación de rol simultáneas: el rol nunca queda en una cuenta dada de baja", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const { repo, plan } = await preparar(base);
  const A = base.a.id;
  const hoja = await plan.agregarHoja(A, { padreId: (await cuentasDe(A)).id("1.1.1"), nombre: "Caja chica carrera" });
  assert.ok(hoja.ok);
  const X = hoja.cuentaId;
  const duenio = await prismaComoDuenio(base);
  let soltar!: () => void;
  const suelto = new Promise<void>((r) => (soltar = r));
  let tomado!: () => void;
  const bloqueado = new Promise<void>((r) => (tomado = r));
  // Otra transacción tiene tomada la fila del rol CAJA: la asignación queda esperando CON el candado.
  const externa = duenio.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`UPDATE "CuentaRol" SET "updatedAt" = now() WHERE "tenantId" = $1 AND rol = 'CAJA'`, A);
      tomado();
      await suelto;
    },
    { timeout: 20000 },
  );
  await bloqueado;
  const asignar = repo.asignarRolCuenta(A, "CAJA", X);
  await esperar(400);
  const baja = plan.cambiarActivaCuenta(A, X, false); // espera el candado del plan
  await esperar(200);
  soltar();
  await externa;
  const [ra, rb] = await Promise.all([asignar, baja]);
  assert.ok(ra.ok, JSON.stringify(ra));
  assert.ok(!rb.ok && rb.error === "CUENTA_EN_USO", "la baja ve el rol recién asignado");
  const fin = await cuentasDe(A);
  assert.equal(fin.roles.CAJA, X);
  assert.equal(fin.cuentas.find((c) => c.id === X)!.activa, true, "INVARIANTE: el rol apunta a una cuenta activa");
  // Devuelve CAJA a su cuenta para no tocar el resto del archivo.
  assert.ok((await repo.asignarRolCuenta(A, "CAJA", fin.id("1.1.1.01"))).ok);
});

test("G2 · dos cargas simultáneas del plan con rubros distintos: una sola entra, el plan no se mezcla", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const { repo } = await preparar(base);
  const { planModelo } = await import("./plan-modelo");
  const D = await negocioNuevo(base, "g2");
  const [s1, s2] = await Promise.all([
    repo.sembrarPlanModelo(D, "comercio", { soloSiVacio: true }),
    repo.sembrarPlanModelo(D, "proyectos", { soloSiVacio: true }),
  ]);
  assert.equal([s1, s2].filter((r) => r.ok).length, 1, "entra una sola");
  const rechazo = [s1, s2].find((r) => !r.ok)!;
  assert.ok(!rechazo.ok && rechazo.error === "DATOS_INVALIDOS");
  const ganador = s1.ok ? "comercio" : "proyectos";
  const d = await cuentasDe(D);
  assert.equal(d.cuentas.length, planModelo(ganador).length, "INVARIANTE: el plan es de un solo rubro");
  assert.equal(d.rubro, ganador);
});

test("P2 · un negocio «servicios» que crea 1.1.1.04 y 1.1.1.05 «Valores a depositar» sigue siendo «servicios»", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const { repo, plan } = await preparar(base);
  const C = await negocioNuevo(base, "p2");
  assert.ok((await repo.sembrarPlanModelo(C, "servicios", { soloSiVacio: true })).ok);
  const c = await cuentasDe(C);
  const h1 = await plan.agregarHoja(C, { padreId: c.id("1.1.1"), nombre: "Banco en dólares" });
  const h2 = await plan.agregarHoja(C, { padreId: c.id("1.1.1"), nombre: "Valores a depositar" });
  assert.ok(h1.ok && h2.ok && h2.codigo === "1.1.1.05", "la combinación de código y nombre de la vieja marca existe");
  const despues = await cuentasDe(C);
  assert.equal(despues.rubro, "servicios");
  assert.deepEqual(plan.rolesFaltantes(Object.keys(despues.roles), despues.rubro).delRubro, [], "sin falsos faltantes");
  // Y el negocio sembrado como «proyectos» lo sigue siendo por la marca de la carga.
  assert.equal((await cuentasDe(base.a.id)).rubro, "proyectos");
});

test("G3 · no se da de baja una cuenta con asientos en borrador ni con saldo", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const { repo, plan } = await preparar(base);
  const A = base.a.id;
  const a = await cuentasDe(A);
  const h = await plan.agregarHoja(A, { padreId: a.id("1.1.1"), nombre: "Banco con saldo" });
  assert.ok(h.ok);
  const mover = (desde: string, hacia: string, m: bigint) => [
    { cuentaId: hacia, debe: m, haber: BigInt(0) },
    { cuentaId: desde, debe: BigInt(0), haber: m },
  ];
  const conf = await repo.registrarAsiento(A, { fecha: dia("2026-05-01"), descripcion: "Depósito", lineas: mover(a.id("4.1.01"), h.cuentaId, BigInt(1000)), confirmar: true });
  assert.ok(conf.ok, JSON.stringify(conf));
  const borr = await repo.registrarAsiento(A, { fecha: dia("2026-05-02"), descripcion: "Borrador", lineas: mover(a.id("4.1.01"), h.cuentaId, BigInt(500)) });
  assert.ok(borr.ok);

  const conBorrador = await plan.cambiarActivaCuenta(A, h.cuentaId, false);
  assert.ok(!conBorrador.ok && conBorrador.error === "CUENTA_EN_USO" && /borrador/.test(conBorrador.mensaje));
  assert.ok((await repo.confirmarAsiento(A, borr.asientoId)).ok, "el borrador se sigue pudiendo confirmar");

  const conSaldo = await plan.cambiarActivaCuenta(A, h.cuentaId, false);
  assert.ok(!conSaldo.ok && conSaldo.error === "CUENTA_EN_USO" && /saldo/.test(conSaldo.mensaje));

  const vaciar = await repo.registrarAsiento(A, { fecha: dia("2026-05-03"), descripcion: "Traspaso", lineas: mover(h.cuentaId, a.id("1.1.1.01"), BigInt(1500)), confirmar: true });
  assert.ok(vaciar.ok);
  assert.ok((await plan.cambiarActivaCuenta(A, h.cuentaId, false)).ok, "en cero y sin borradores, se da de baja");
});

test("AuditLog: cargar, alta de hoja, baja, reactivación y rol dejan rastro con el actor", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const { repo, plan } = await preparar(base);
  const E = await negocioNuevo(base, "audit");
  const quien = { actor: "admin:usuario-sintetico-1", channel: "admin" as const };
  assert.ok((await repo.sembrarPlanModelo(E, "comercio", { soloSiVacio: true, auditoria: quien })).ok);
  const e = await cuentasDe(E);
  const h = await plan.agregarHoja(E, { padreId: e.id("1.1.1"), nombre: "Banco auditado" }, quien);
  assert.ok(h.ok);
  assert.ok((await plan.cambiarActivaCuenta(E, h.cuentaId, false, quien)).ok);
  assert.ok((await plan.cambiarActivaCuenta(E, h.cuentaId, true, quien)).ok);
  const antes = e.roles.CAJA;
  assert.ok((await repo.asignarRolCuenta(E, "CAJA", h.cuentaId, quien)).ok);
  assert.ok((await repo.asignarRolCuenta(E, "CAJA", h.cuentaId, quien)).ok, "reasignar a la misma cuenta no ensucia el rastro");

  const duenio = await prismaComoDuenio(base);
  const filas = await duenio.auditLog.findMany({ where: { tenantId: E }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  assert.deepEqual(filas.map((f) => f.action), ["sembrar", "agregar_hoja", "baja_cuenta", "reactivar_cuenta", "asignar_rol"]);
  assert.ok(filas.every((f) => f.actor === quien.actor && f.channel === "admin"));
  const rol = filas.at(-1)!;
  assert.equal(rol.entity, "CuentaRol");
  assert.equal(rol.entityId, "CAJA");
  assert.deepEqual(rol.changes, { antes, despues: h.cuentaId });
  assert.equal((filas[0].changes as Record<string, unknown>).rubroAnotado, "comercio");

  // Un rechazo no deja rastro (el rastro va en la misma transacción que el cambio).
  const rechazada = await repo.sembrarPlanModelo(E, "servicios", { soloSiVacio: true, auditoria: quien });
  assert.ok(!rechazada.ok);
  assert.equal(await duenio.auditLog.count({ where: { tenantId: E } }), filas.length);
});

test("completar roles: asigna los que faltan con la cuenta del modelo, no pisa nada y es idempotente", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const { repo, plan } = await preparar(base);
  const F = await negocioNuevo(base, "roles");
  assert.ok((await repo.sembrarPlanModelo(F, "comercio", { soloSiVacio: true })).ok);
  const duenio = await prismaComoDuenio(base);
  const comunes = ["SALDO_TECNICO_IVA", "ANTICIPOS_GANANCIAS", "GANANCIAS_A_PAGAR"];
  // Un plan sembrado antes de que existieran los roles comunes.
  await duenio.cuentaRol.deleteMany({ where: { tenantId: F, rol: { in: [...comunes, "BILLETERA_MP"] } } });
  const f = await cuentasDe(F);
  // El contador ya había movido CAJA a otra cuenta: no se toca.
  const propia = await plan.agregarHoja(F, { padreId: f.id("1.1.1"), nombre: "Caja de la sucursal" });
  assert.ok(propia.ok);
  assert.ok((await repo.asignarRolCuenta(F, "CAJA", propia.cuentaId)).ok);
  // La cuenta modelo de BILLETERA_MP fue dada de baja: queda para el contador, no se asigna.
  const billetera = f.cuentas.find((c) => c.codigo === "1.1.1.03")!;
  assert.ok((await plan.cambiarActivaCuenta(F, billetera.id, false)).ok);

  const r = await plan.completarRolesFaltantes(F, { actor: "admin:usuario-sintetico-2", channel: "admin" });
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(r.rolesAsignados, comunes.length);
  assert.ok(r.sinCuenta.includes("BILLETERA_MP"));
  const despues = await cuentasDe(F);
  assert.equal(despues.roles.CAJA, propia.cuentaId, "no pisa un rol asignado");
  assert.equal(despues.roles.SALDO_TECNICO_IVA, despues.id("1.1.3.07"));
  assert.equal(despues.roles.GANANCIAS_A_PAGAR, despues.id("2.1.2.04"));
  assert.equal(despues.roles.BILLETERA_MP, undefined);

  const otraVez = await plan.completarRolesFaltantes(F);
  assert.ok(otraVez.ok && otraVez.rolesAsignados === 0, "idempotente");
  assert.equal(await duenio.auditLog.count({ where: { tenantId: F, action: "completar_roles" } }), 1);

  const vacio = await plan.completarRolesFaltantes(await negocioNuevo(base, "sin-plan"));
  assert.ok(!vacio.ok && vacio.error === "DATOS_INVALIDOS");
});
