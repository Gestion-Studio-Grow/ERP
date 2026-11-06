// Modo simple, Tanda 1 (Factory-GSG/00-ESTADO/MODO-SIMPLE-DECISION.md §3–§4).
// (a) la fila `ui:modo-simple` es una preferencia: `permisoEfectivo` la ignora y nunca da permisos;
//     la excepción `ui:` de `decidirCambioDePermiso` sólo abre esa clave.
// (b) la barra simple recorta, nunca agrega.
// (c) la agenda en simple esconde anular / dar de baja / deshacer, nunca agrega.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ALL_CAPABILITIES, permisoEfectivo, type Role } from "@/lib/capabilities";
import { decidirCambioDePermiso } from "@/lib/permisos/cambio-de-permiso";
import { ALL_ITEMS, menuDeModoSimple, RUTAS_DEL_MODO_SIMPLE } from "@/lib/admin-nav-items";
import {
  PREFERENCIA_MODO_SIMPLE,
  destinoSeguro,
  esModoSimple,
  hrefModoCompleto,
  prefiereModoSimple,
  recortarPermisosDeAgenda,
} from "@/lib/modo-simple";

const ROLES: Role[] = ["OWNER", "RECEPTION", "PROFESSIONAL"];
const FILA_SIMPLE = { capability: PREFERENCIA_MODO_SIMPLE, allowed: true };

// ── (a) esModoSimple y la fila ─────────────────────────────────────────────────

test("(a) sin sesión, sin fila o con la tabla ausente (overrides []) → modo completo", () => {
  assert.equal(esModoSimple(null), false);
  assert.equal(esModoSimple({ overrides: [] }), false);
  assert.equal(esModoSimple({ overrides: undefined }), false);
  assert.equal(esModoSimple({ overrides: [{ capability: PREFERENCIA_MODO_SIMPLE, allowed: false }] }), false);
  assert.equal(esModoSimple({ overrides: [{ capability: "agenda:manage", allowed: true }] }), false);
});

test("(a) con la fila → simple; «Ver todo» en la sesión → completo sin tocar lo guardado", () => {
  const u = { overrides: [FILA_SIMPLE] };
  assert.equal(esModoSimple(u), true);
  assert.equal(esModoSimple(u, { verTodo: true }), false);
  assert.equal(prefiereModoSimple(u), true);
});

test("(a) permisoEfectivo IGNORA la fila ui: en todo rol y toda capability (prendida o apagada)", () => {
  for (const role of ROLES) {
    for (const cap of ALL_CAPABILITIES) {
      const base = permisoEfectivo({ role, overrides: [] }, cap);
      for (const allowed of [true, false]) {
        const con = permisoEfectivo({ role, overrides: [{ capability: PREFERENCIA_MODO_SIMPLE, allowed }] }, cap);
        assert.equal(con, base, `${role} ${cap} con ui:modo-simple=${allowed}`);
      }
    }
  }
});

test("(a) la fila ui: nunca da un permiso que el rol no tiene", () => {
  const prof = { role: "PROFESSIONAL" as const, overrides: [FILA_SIMPLE] };
  for (const cap of ["users:manage", "agenda:void", "agenda:forgive", "billing:manage", "agenda:manage"] as const) {
    assert.equal(permisoEfectivo(prof, cap), false, cap);
  }
});

const recep = { id: "u-recep", role: "RECEPTION" as const, professionalId: null, overrides: [] };
const socia = { id: "u-socia", role: "OWNER" as const, professionalId: null, overrides: [] };

test("(a) excepción ui:: la propia persona y un socio pueden cambiar su modo simple", () => {
  const propia = decidirCambioDePermiso({ actorId: recep.id, objetivo: recep, capability: PREFERENCIA_MODO_SIMPLE, allowed: true });
  assert.ok(propia.ok);
  assert.deepEqual(propia.ok && propia.plan.grabar, [PREFERENCIA_MODO_SIMPLE]);
  assert.deepEqual(propia.ok && propia.plan.borrar, []);
  const aSocia = decidirCambioDePermiso({ actorId: "otro", objetivo: socia, capability: PREFERENCIA_MODO_SIMPLE, allowed: true });
  assert.ok(aSocia.ok);
  const apagar = decidirCambioDePermiso({ actorId: recep.id, objetivo: { ...recep, overrides: [FILA_SIMPLE] }, capability: PREFERENCIA_MODO_SIMPLE, allowed: false });
  assert.ok(apagar.ok);
  assert.deepEqual(apagar.ok && apagar.plan.borrar, [PREFERENCIA_MODO_SIMPLE]);
  assert.deepEqual(apagar.ok && apagar.plan.antes, { [PREFERENCIA_MODO_SIMPLE]: true });
});

test("(a) la excepción ui: no abre nada más: otra clave ui:, valor faltante y auto-edición de permisos siguen cerrados", () => {
  assert.equal(decidirCambioDePermiso({ actorId: "x", objetivo: recep, capability: "ui:admin", allowed: true }).ok, false);
  assert.equal(decidirCambioDePermiso({ actorId: "x", objetivo: recep, capability: PREFERENCIA_MODO_SIMPLE, allowed: null }).ok, false);
  assert.equal(decidirCambioDePermiso({ actorId: "x", objetivo: null, capability: PREFERENCIA_MODO_SIMPLE, allowed: true }).ok, false);
  // Lo de siempre: nadie se cambia sus permisos ni los de un socio.
  assert.equal(decidirCambioDePermiso({ actorId: recep.id, objetivo: recep, capability: "agenda:manage", allowed: false }).ok, false);
  assert.equal(decidirCambioDePermiso({ actorId: "x", objetivo: socia, capability: "agenda:manage", allowed: false }).ok, false);
  // Una capability con prefijo raro no se cuela como preferencia.
  assert.equal(decidirCambioDePermiso({ actorId: recep.id, objetivo: recep, capability: "ui:modo-simple:users:manage", allowed: true }).ok, false);
});

test("(a) destinoSeguro: sólo rutas del panel, nunca otro sitio", () => {
  assert.equal(destinoSeguro("/admin/turnos?turno=abc"), "/admin/turnos?turno=abc");
  assert.equal(destinoSeguro("/admin"), "/admin");
  for (const malo of ["https://evil.com", "//evil.com", "/admin//evil.com", "/admin\\evil", "/administracion", "/admin/\nx", null, 3, "/"]) {
    assert.equal(destinoSeguro(malo), "/admin", String(malo));
  }
  assert.equal(hrefModoCompleto("/admin/turnos/cerrar"), "/admin/modo-completo?volver=%2Fadmin%2Fturnos%2Fcerrar");
});

// ── (b) la barra ───────────────────────────────────────────────────────────────

test("(b) la barra simple: Hoy, Agenda, Clientes y Caja, en ese orden y con «Hoy»", () => {
  const simple = menuDeModoSimple(ALL_ITEMS);
  assert.deepEqual(simple.map((i) => i.href), [...RUTAS_DEL_MODO_SIMPLE]);
  assert.deepEqual(simple.map((i) => i.label), ["Hoy", "Agenda", "Clientes", "Caja"]);
  // Libro de caja y Cierre del día (sub-rutas de Caja) no se cuelan.
  assert.ok(!simple.some((i) => i.href === "/admin/caja/libro" || i.href === "/admin/caja/cierre"));
});

test("(b) recorta, nunca agrega: lo que la persona no ve no aparece", () => {
  const profesional = ALL_ITEMS.filter((i) => i.href === "/admin/turnos");
  assert.deepEqual(menuDeModoSimple(profesional).map((i) => i.href), ["/admin/turnos"]);
  assert.deepEqual(menuDeModoSimple([]), []);
  // No muta el menú de entrada (el Inicio sigue diciendo «Inicio» en completo).
  menuDeModoSimple(ALL_ITEMS);
  assert.equal(ALL_ITEMS.find((i) => i.href === "/admin")?.label, "Inicio");
});

// ── (c) la agenda ──────────────────────────────────────────────────────────────

const permisosDueña = { gestionar: true, cobrar: true, terminar: true, perdonar: true, anular: "directa" as const };

test("(c) en simple: sin anular ni dar de baja, con la marca para «Corregir en modo completo»", () => {
  const r = recortarPermisosDeAgenda(permisosDueña, true);
  assert.equal(r.perdonar, false);
  assert.equal(r.anular, null);
  assert.equal(r.modoSimple, true);
  // Lo del día a día queda igual.
  assert.equal(r.gestionar, true);
  assert.equal(r.cobrar, true);
  assert.equal(r.terminar, true);
});

test("(c) en completo: los permisos tal cual (mismo objeto)", () => {
  assert.equal(recortarPermisosDeAgenda(permisosDueña, false), permisosDueña);
});

test("(c) nunca agrega: quien no anula ni perdona sigue sin poder", () => {
  const recepcion = { gestionar: true, cobrar: true, terminar: true, perdonar: false, anular: null };
  const r = recortarPermisosDeAgenda(recepcion, true);
  assert.equal(r.perdonar, false);
  assert.equal(r.anular, null);
});

test("CSS · en el diseño nuevo, el toque de 48 px les gana a las alturas de renglon.css (QA 06/11)", () => {
  const raiz = path.resolve(import.meta.dirname, "../..");
  const globals = readFileSync(path.join(raiz, "src/app/globals.css"), "utf8");
  const renglon = readFileSync(path.join(raiz, "public/diseno/renglon.css"), "utf8");
  // Lo que renglon.css acorta con selectores de atributo (por eso ganaba): la barra y los botones.
  assert.match(renglon, /\[data-diseno="renglon"\] \[data-ui="cabecera"\] \[data-parte="espacio"\] \{[^}]*min-height: 2\.25rem/);
  assert.match(renglon, /\[data-diseno="renglon"\] :is\(\[data-ui="button"\][^{]*\{[^}]*min-height: var\(--alto\)/);
  const regla = globals.match(/\[data-diseno="renglon"\]\.modo-simple :is\(([^)]*\([^)]*\)[^)]*)\) \{\s*min-height: 3rem;/);
  assert.ok(regla, "falta la regla [data-diseno=renglon].modo-simple con min-height: 3rem");
  for (const sel of ['[data-ui="button"]', "button", '[data-parte="espacio"]', '[data-parte="negocio"]', "nav a", "[data-modo-simple]", '[data-ui="indice"] a', ".min-h-11"]) {
    assert.ok(regla[1].includes(sel), sel);
  }
});

test("agenda · las teclas con alto inline siguen a --tap-min (48 px en simple), no a un 44 fijo (QA 06/11)", () => {
  const raiz = path.resolve(import.meta.dirname, "../..");
  for (const f of ["BarraDelTurno.tsx", "TurnoCajon.tsx"]) {
    const src = readFileSync(path.join(raiz, "src/app/admin/(dashboard)/turnos/_agenda", f), "utf8");
    assert.doesNotMatch(src, /minHeight: "2\.75rem"/, f);
  }
  const barra = readFileSync(path.join(raiz, "src/app/admin/(dashboard)/turnos/_agenda/BarraDelTurno.tsx"), "utf8");
  assert.match(barra, /ALTO_DE_TECLA = "max\(2\.75rem, var\(--tap-min, 2\.75rem\)\)"/);
});
