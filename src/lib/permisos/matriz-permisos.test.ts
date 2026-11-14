// Matriz de permisos por usuario — motor (docs/producto/permisos/PLAN.md §2, §3, §5, §8, §11).
// Adversarial donde el plan lo pide: el candado (riesgo 1), el scoping (riesgo 2), la tabla ausente
// (riesgo 6), auto-edición y socio→socio (riesgo 7), y un guardián contra `roleHasCapability(user.role`.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  ALL_CAPABILITIES,
  CAPACIDADES_POR_USUARIO,
  ROLE_CAPABILITIES,
  motivoSoloLoSuyo,
  permisoEfectivo,
  roleHasCapability,
  type Capability,
  type Role,
} from "@/lib/capabilities";
import { leerOverridesTolerante } from "@/lib/permisos-overrides";
import { decidirCambioDePermiso, leerAllowed } from "@/lib/permisos/cambio-de-permiso";

const quien = (role: Role, overrides: { capability: string; allowed: boolean }[] = []) => ({ role, overrides });

test("defaults 3×8: socio todo; recepción agenda, contacto, stock y caja; profesional como hoy", () => {
  for (const cap of ["agenda:create", "clients:contact", "cash:manage"] as Capability[]) {
    assert.equal(roleHasCapability("OWNER", cap), true, cap);
    assert.equal(roleHasCapability("RECEPTION", cap), true, cap);
    assert.equal(roleHasCapability("PROFESSIONAL", cap), false, cap);
  }
  // `commissions:read-own` (D5, «Mi liquidación»): ve SU liquidación, sin tocar plata.
  assert.deepEqual([...ROLE_CAPABILITIES.PROFESSIONAL].sort(), [
    "agenda:collect", "agenda:complete", "agenda:read", "booking:online", "commissions:read-own",
  ]);
});

test("payments:own-account existe pero ningún rol la tiene ni la matriz la graba («próximamente»)", () => {
  for (const r of ["OWNER", "RECEPTION", "PROFESSIONAL"] as Role[]) assert.equal(roleHasCapability(r, "payments:own-account"), false);
  assert.equal(ALL_CAPABILITIES.includes("payments:own-account"), false);
  assert.equal(CAPACIDADES_POR_USUARIO.includes("payments:own-account"), false);
  assert.equal(permisoEfectivo(quien("PROFESSIONAL", [{ capability: "payments:own-account", allowed: true }]), "payments:own-account"), false);
});

test("las casillas son exactamente 1–6 y 8 (la 1 es `booking:online`, no la ficha)", () => {
  assert.deepEqual([...CAPACIDADES_POR_USUARIO].sort(), [
    "agenda:collect", "agenda:create", "agenda:manage", "booking:online", "cash:manage", "clients:contact", "stock:adjust", "stock:count", "stock:receive",
  ]);
});

test("permisoEfectivo: la excepción manda sobre el rol, en las dos direcciones", () => {
  assert.equal(permisoEfectivo(quien("PROFESSIONAL"), "agenda:create"), false);
  assert.equal(permisoEfectivo(quien("PROFESSIONAL", [{ capability: "agenda:create", allowed: true }]), "agenda:create"), true);
  assert.equal(permisoEfectivo(quien("RECEPTION"), "cash:manage"), true);
  assert.equal(permisoEfectivo(quien("RECEPTION", [{ capability: "cash:manage", allowed: false }]), "cash:manage"), false);
  // Apagar la caja no toca la venta (riesgo 3).
  assert.equal(permisoEfectivo(quien("RECEPTION", [{ capability: "cash:manage", allowed: false }]), "orders:manage"), true);
});

test("candado (riesgo 1): un override fuera de las casillas se ignora, aunque esté en la base", () => {
  const prohibidas: Capability[] = ["users:manage", "agenda:void", "agenda:forgive", "modules:manage", "reports:read", "costs:read", "orders:void"];
  for (const cap of prohibidas) {
    const r = quien("PROFESSIONAL", [{ capability: cap, allowed: true }]);
    assert.equal(permisoEfectivo(r, cap), roleHasCapability("PROFESSIONAL", cap), `prendió ${cap}`);
    const o = quien("OWNER", [{ capability: cap, allowed: false }]);
    assert.equal(permisoEfectivo(o, cap), roleHasCapability("OWNER", cap), `apagó ${cap} al socio`);
  }
  // Un `allowed` que no es booleano verdadero no prende nada.
  const raro = quien("PROFESSIONAL", [{ capability: "agenda:create", allowed: "true" as unknown as boolean }]);
  assert.equal(permisoEfectivo(raro, "agenda:create"), false);
});

test("soloLoSuyo (riesgo 2): la profesional opera sólo lo suyo; sin ficha, nada; los demás roles no se limitan", () => {
  const ana = { role: "PROFESSIONAL" as const, professionalId: "p-ana" };
  assert.equal(motivoSoloLoSuyo(ana, "p-ana"), null);
  assert.match(motivoSoloLoSuyo(ana, "p-bea") ?? "", /otra profesional/);
  assert.match(motivoSoloLoSuyo(ana, null) ?? "", /otra profesional/);
  assert.match(motivoSoloLoSuyo({ role: "PROFESSIONAL", professionalId: null }, "p-ana") ?? "", /ficha/);
  assert.match(motivoSoloLoSuyo({ role: "PROFESSIONAL", professionalId: null }, null) ?? "", /ficha/);
  assert.equal(motivoSoloLoSuyo({ role: "RECEPTION", professionalId: null }, "p-bea"), null);
  assert.equal(motivoSoloLoSuyo({ role: "OWNER", professionalId: "p-ana" }, "p-bea"), null);
});

test("tabla ausente (riesgo 6): P2021/P2022 → rige el rol; cualquier otro error se relanza", async () => {
  const conCodigo = (code: string) => Object.assign(new Error(code), { code });
  assert.deepEqual(await leerOverridesTolerante(async () => { throw conCodigo("P2021"); }), []);
  assert.deepEqual(await leerOverridesTolerante(async () => { throw conCodigo("P2022"); }), []);
  await assert.rejects(leerOverridesTolerante(async () => { throw conCodigo("P1001"); }), /P1001/);
  await assert.rejects(leerOverridesTolerante(async () => { throw new Error("caída"); }), /caída/);
  assert.deepEqual(await leerOverridesTolerante(async () => [{ capability: "cash:manage", allowed: false }]), [{ capability: "cash:manage", allowed: false }]);
});

const recepcionista = { id: "u-rec", role: "RECEPTION" as const, professionalId: null, overrides: [] };
const profesional = { id: "u-pro", role: "PROFESSIONAL" as const, professionalId: "p-ana", overrides: [] };

test("setUserPermission (riesgo 7): nadie se cambia a sí mismo ni a otro socio; sólo casillas; valor explícito", () => {
  assert.equal(decidirCambioDePermiso({ actorId: "u-rec", objetivo: recepcionista, capability: "cash:manage", allowed: false }).ok, false);
  const socio = { id: "u-socio2", role: "OWNER" as const, professionalId: null, overrides: [] };
  assert.equal(decidirCambioDePermiso({ actorId: "u-socio", objetivo: socio, capability: "cash:manage", allowed: false }).ok, false);
  assert.equal(decidirCambioDePermiso({ actorId: "u-socio", objetivo: null, capability: "cash:manage", allowed: false }).ok, false);
  for (const cap of ["users:manage", "agenda:void", "payments:own-account", "modules:manage", "", "cash:manage "]) {
    assert.equal(decidirCambioDePermiso({ actorId: "u-socio", objetivo: profesional, capability: cap, allowed: true }).ok, false, cap);
  }
  assert.equal(decidirCambioDePermiso({ actorId: "u-socio", objetivo: profesional, capability: "agenda:create", allowed: null }).ok, false);
  assert.equal(leerAllowed("true"), true);
  assert.equal(leerAllowed("false"), false);
  assert.equal(leerAllowed("on"), null);
  assert.equal(leerAllowed(null), null);
});

test("setUserPermission: profesional sin ficha no puede tener agendar/editar prendido (sí apagarlo)", () => {
  const sinFicha = { ...profesional, professionalId: null };
  assert.equal(decidirCambioDePermiso({ actorId: "u-socio", objetivo: sinFicha, capability: "agenda:create", allowed: true }).ok, false);
  assert.equal(decidirCambioDePermiso({ actorId: "u-socio", objetivo: sinFicha, capability: "agenda:manage", allowed: true }).ok, false);
  assert.equal(decidirCambioDePermiso({ actorId: "u-socio", objetivo: sinFicha, capability: "agenda:collect", allowed: false }).ok, true);
});

test("setUserPermission: igual al rol borra la fila; distinto la graba; stock graba las tres", () => {
  const prender = decidirCambioDePermiso({ actorId: "u-socio", objetivo: profesional, capability: "agenda:create", allowed: true });
  assert.ok(prender.ok);
  assert.deepEqual(prender.plan.grabar, ["agenda:create"]);
  assert.deepEqual(prender.plan.borrar, []);
  assert.deepEqual(prender.plan.antes, { "agenda:create": false });

  const volver = decidirCambioDePermiso({
    actorId: "u-socio",
    objetivo: { ...profesional, overrides: [{ capability: "agenda:create", allowed: true }] },
    capability: "agenda:create",
    allowed: false,
  });
  assert.ok(volver.ok);
  assert.deepEqual(volver.plan.borrar, ["agenda:create"]);
  assert.deepEqual(volver.plan.grabar, []);
  assert.deepEqual(volver.plan.antes, { "agenda:create": true });

  const stock = decidirCambioDePermiso({ actorId: "u-socio", objetivo: recepcionista, capability: "stock:count", allowed: false });
  assert.ok(stock.ok);
  assert.deepEqual(stock.plan.grabar, ["stock:receive", "stock:count", "stock:adjust"]);
});

// ── Guardián (PLAN §2): un usuario de sesión se resuelve con `permisoEfectivo`, que mira la matriz.
// `roleHasCapability(<algo>.role, "<casilla>")` la ignoraría en silencio. Fuera de `capabilities.ts`
// y los tests, falla si aparece con una capability de la matriz o con una capability variable sobre
// `user`/`viewer`/`actor`/`u`/`quien`.
function archivos(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (n === "generated" || n === "node_modules") continue;
    if (statSync(p).isDirectory()) archivos(p, out);
    else if (/\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n)) out.push(p);
  }
  return out;
}

test("guardián: nadie resuelve una casilla de la matriz con roleHasCapability(x.role, …)", () => {
  const raiz = join(process.cwd(), "src");
  const casillas = new Set<string>(CAPACIDADES_POR_USUARIO);
  const literal = /roleHasCapability\(\s*[\w.?]+\.role\s*,\s*"([^"]+)"/g;
  const variable = /roleHasCapability\(\s*(?:user|viewer|actor|u|quien)\.role\s*,\s*[A-Za-z_]/g;
  const fallas: string[] = [];
  for (const f of archivos(raiz)) {
    if (f.endsWith(join("lib", "capabilities.ts"))) continue;
    const s = readFileSync(f, "utf8");
    for (const m of s.matchAll(literal)) if (casillas.has(m[1])) fallas.push(`${f}: ${m[0]}`);
    for (const m of s.matchAll(variable)) fallas.push(`${f}: ${m[0]}`);
  }
  assert.deepEqual(fallas, [], "usá permisoEfectivo(user, cap)");
});
