// Adversariales de la certificación de la matriz de permisos (A1, M1, M2, M3 y bajas), lógica pura.
// La contraparte con Postgres y las Server Actions reales: `correcciones-certificacion-postgres.test.ts`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { permisoEfectivo, permisoFueraDeLaAgenda, type PermisoOverride, type Role } from "@/lib/capabilities";
import { veredictoDeCobroDe, NO_CARGA_COBRANZAS } from "@/lib/turnos/cobro-mostrador";
import { permisosDe, planCierreEnLote, type TurnoParaCerrar } from "@/lib/turnos/cierre-lote";
import { clientaDelTurnoPara } from "@/lib/clientes/clienta-del-turno";
import { telefonoDelFormulario } from "@/lib/clientes/telefono";
import { motivoSinCaja, SIN_CAJA } from "@/lib/caja/permiso-libro";
import { accionDelRubro } from "@/app/admin/(dashboard)/armazon/armazon-core";
import { accionesParaPersona } from "@/apps/acciones";

const u = (role: Role, overrides: PermisoOverride[] = [], professionalId: string | null = null) => ({ role, overrides, professionalId });
const sinCobrar = (role: Role, professionalId: string | null = null) => u(role, [{ capability: "agenda:collect", allowed: false }], professionalId);

// ── A1 ──────────────────────────────────────────────────────────────────────────────────────────
test("A1: con «cargar cobranzas» apagada, el veredicto de cobro de un turno es NO (recepción y profesional)", () => {
  const turno = { professionalId: "caro", nombreProfesional: "Caro", cobraEnMostrador: true };
  assert.deepEqual(veredictoDeCobroDe(sinCobrar("RECEPTION"), turno), { ok: false, motivo: NO_CARGA_COBRANZAS });
  assert.deepEqual(veredictoDeCobroDe(sinCobrar("PROFESSIONAL", "caro"), turno), { ok: false, motivo: NO_CARGA_COBRANZAS });
  // Control: sin la excepción, la regla de siempre.
  assert.deepEqual(veredictoDeCobroDe(u("RECEPTION"), turno), { ok: true });
  assert.deepEqual(veredictoDeCobroDe(u("PROFESSIONAL", [], "caro"), turno), { ok: true });
});

test("A1: el cierre en lote resuelve permisos con la excepción del usuario y no planifica «completar-y-cobrar»", () => {
  const recep = sinCobrar("RECEPTION");
  assert.equal(permisosDe(recep).cobrar, false);
  assert.equal(permisosDe("RECEPTION").cobrar, true);
  const t: TurnoParaCerrar = { id: "t1", status: "PENDING", startsAt: new Date("2026-10-21T13:00:00Z"), professionalId: "caro", saldo: 20000, cobrado: 0 } as TurnoParaCerrar;
  const plan = planCierreEnLote([{ pedido: { id: "t1", accion: "vino", method: "efectivo" }, turno: t }], {
    ahora: new Date("2026-10-22T13:00:00Z"),
    permisos: permisosDe(recep),
    veredictos: new Map([["t1", veredictoDeCobroDe(recep, { professionalId: "caro" })]]),
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.ok && plan.lineas[0]!.decision.tipo, "rechazado");
});

test("A1: completeAppointment, el cierre en lote y la bandeja usan el veredicto con la matriz (no el del rol)", () => {
  const actions = readFileSync("src/lib/actions.ts", "utf8");
  const i = actions.indexOf("export async function completeAppointment(");
  const cuerpo = actions.slice(i, actions.indexOf("\nexport async function", i + 10));
  assert.match(cuerpo, /veredictoDeCobroDe\(user,/);
  for (const f of ["src/lib/turnos/cierre-lote-actions.ts", "src/lib/turnos/sin-cerrar.server.ts"]) {
    const s = readFileSync(f, "utf8");
    assert.doesNotMatch(s, /permisosDeRol\(|puedeCobrarEsteTurno\(/, f);
    assert.match(s, /permisosDe\(user\)/, f);
  }
});

// ── M1 ──────────────────────────────────────────────────────────────────────────────────────────
test("M1: la clienta del turno sale con el teléfono enmascarado a quien no ve el contacto, y con su ficha", () => {
  const client = { id: "cli1", name: "Ana", phone: "1144448821" };
  const sinContacto = clientaDelTurnoPara(client, u("RECEPTION", [{ capability: "clients:contact", allowed: false }]));
  assert.ok(!sinContacto.telefono.includes("11444"), "no viaja el número completo");
  assert.match(sinContacto.telefono, /8821$/);
  assert.equal(sinContacto.clientId, "cli1");
  assert.equal(clientaDelTurnoPara(client, u("OWNER")).telefono, "1144448821");
  // El enmascarado que vuelve en el formulario no se graba como teléfono.
  assert.equal(telefonoDelFormulario(sinContacto.telefono), "");
  assert.equal(telefonoDelFormulario(" 1144448821 "), "1144448821");
});

// ── M2 ──────────────────────────────────────────────────────────────────────────────────────────
test("M2: los asientos manuales del libro exigen cash:manage efectivo", () => {
  assert.equal(motivoSinCaja(u("RECEPTION", [{ capability: "cash:manage", allowed: false }])), SIN_CAJA);
  assert.equal(motivoSinCaja(u("RECEPTION")), null);
  assert.equal(motivoSinCaja(u("OWNER")), null);
  const s = readFileSync("src/lib/libro-caja-actions.ts", "utf8");
  for (const nombre of ["addLibroEntry", "deleteLibroEntry"]) {
    const i = s.indexOf(`export async function ${nombre}(`);
    const cuerpo = s.slice(i, s.indexOf("isDemoSandbox()", i));
    assert.match(cuerpo, /motivoSinCaja\(user\)/, nombre);
  }
});

// ── M3 ──────────────────────────────────────────────────────────────────────────────────────────
test("M3: agendar/editar prendidos a una PROFESSIONAL valen en la agenda de turnos, no fuera", () => {
  const prof = u("PROFESSIONAL", [
    { capability: "agenda:manage", allowed: true },
    { capability: "agenda:create", allowed: true },
  ], "caro");
  assert.equal(permisoEfectivo(prof, "agenda:manage"), true, "en la agenda de turnos sí");
  assert.equal(permisoFueraDeLaAgenda(prof, "agenda:manage"), false);
  assert.equal(permisoFueraDeLaAgenda(prof, "agenda:create"), false);
  // Los demás roles y capacidades: la matriz de siempre.
  const recep = u("RECEPTION", [{ capability: "agenda:manage", allowed: false }]);
  assert.equal(permisoFueraDeLaAgenda(recep, "agenda:manage"), false);
  assert.equal(permisoFueraDeLaAgenda(u("RECEPTION"), "agenda:manage"), true);
  assert.equal(permisoFueraDeLaAgenda(u("PROFESSIONAL", [{ capability: "agenda:collect", allowed: false }]), "agenda:collect"), false);
});

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return archivos(p);
    return /\.tsx?$/.test(n) && !n.includes(".test.") ? [p] : [];
  });
}

test("M3 guardián: pádel, taller, inmobiliaria y proyectos no gatean agendar/editar con el resolvedor de la agenda", () => {
  const dirs = [
    "src/lib/padel",
    "src/lib/taller",
    "src/lib/inmobiliaria",
    "src/lib/proyectos",
    "src/app/admin/(dashboard)/inmobiliaria",
    "src/app/admin/(dashboard)/proyectos",
    "src/app/admin/(dashboard)/taller",
  ];
  const malos = /requireCapability\("agenda:(manage|create)"\)|permisoEfectivo\([\w.]+, "agenda:(manage|create)"\)|canCurrentUser\("agenda:(manage|create)"\)/;
  const hallados = dirs.flatMap(archivos).filter((f) => malos.test(readFileSync(f, "utf8")));
  assert.deepEqual(hallados, []);
});

// ── Bajas ───────────────────────────────────────────────────────────────────────────────────────
test("bajas: «Dar un turno» decide con la matriz, no con el rol", () => {
  const agenda = { id: "agenda", ruta: "/admin/turnos", icono: "agenda", nombre: "Agenda" } as const;
  const prof = u("PROFESSIONAL", [{ capability: "agenda:manage", allowed: true }], "caro");
  assert.equal(accionDelRubro([agenda], false, prof)?.palabra, "Dar un turno");
  assert.ok(accionesParaPersona([agenda], prof).some((a) => a.id === "dar-un-turno"));
  const recepSin = u("RECEPTION", [{ capability: "agenda:manage", allowed: false }]);
  assert.equal(accionDelRubro([agenda], false, recepSin), null);
});

test("bajas: lecturas de turnos con agenda:manage acotadas con filtroSoloLoSuyo", () => {
  for (const f of ["src/lib/turnos/mover-actions.ts", "src/lib/turnos/senia-actions.ts", "src/app/admin/(dashboard)/turnos/proximo/[id]/page.tsx"]) {
    assert.match(readFileSync(f, "utf8"), /filtroSoloLoSuyo\(user\)/, f);
  }
});
