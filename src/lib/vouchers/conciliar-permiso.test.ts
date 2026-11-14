// Orden del dueño (09/11/2026): «la recepción no concilia ni da de baja». Conciliar, pago a cuenta,
// confirmar la acreditación, dar de baja un impago y descartar una liquidación son sólo de la dueña
// (OWNER). Generar la liquidación sigue con `cash:manage` (la recepción la puede generar).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ROLE_CAPABILITIES, CAPACIDADES_POR_USUARIO, type Role, type UsuarioConPermisos } from "@/lib/capabilities";
import { motivoParaNoConciliar, SOLO_DUENIO_CONCILIA } from "./liquidacion-core";

const usuario = (role: Role, overrides: UsuarioConPermisos["overrides"] = []): UsuarioConPermisos => ({ role, overrides });

test("la dueña concilia; un override no se lo saca", () => {
  assert.equal(motivoParaNoConciliar(usuario("OWNER")), null);
  assert.equal(motivoParaNoConciliar(usuario("OWNER", [{ capability: "vouchers:conciliar", allowed: false }])), null);
});

for (const role of ["RECEPTION", "PROFESSIONAL"] as const) {
  test(`${role} no concilia, con cash:manage y aunque la base intente prenderle el permiso`, () => {
    assert.equal(motivoParaNoConciliar(usuario(role)), SOLO_DUENIO_CONCILIA);
    const forzado = usuario(role, [
      { capability: "cash:manage", allowed: true },
      { capability: "vouchers:conciliar", allowed: true },
    ]);
    assert.equal(motivoParaNoConciliar(forzado), SOLO_DUENIO_CONCILIA);
  });
}

test("sólo OWNER trae vouchers:conciliar y no se prende por usuario; la recepción sigue con cash:manage", () => {
  const conPermiso = (Object.keys(ROLE_CAPABILITIES) as Role[]).filter((r) => ROLE_CAPABILITIES[r].includes("vouchers:conciliar"));
  assert.deepEqual(conPermiso, ["OWNER"]);
  assert.equal(CAPACIDADES_POR_USUARIO.includes("vouchers:conciliar"), false);
  assert.ok(ROLE_CAPABILITIES.RECEPTION.includes("cash:manage"), "generar la liquidación sigue siendo de la recepción");
});

const acciones = readFileSync(new URL("./liquidacion-actions.ts", import.meta.url), "utf8");
const cuerpo = (fn: string) => acciones.slice(acciones.indexOf(`export async function ${fn}`)).split("\n").slice(0, 3).join("\n");

test("cada acción de plata de la dueña pasa por la puerta fina antes de escribir; generar no", () => {
  for (const fn of ["conciliarLiquidacion", "bajaDeImpago", "pagoACuenta", "descartarLiquidacion", "confirmarAcreditacion"]) {
    assert.match(cuerpo(fn), /const ctx = await preparar\(motivoParaNoConciliar\);\n\s*if \("ok" in ctx\) return ctx;/, fn);
  }
  assert.match(cuerpo("generarLiquidacion"), /const ctx = await preparar\(\);/);
});

const forms = readFileSync(new URL("../../app/admin/(dashboard)/vouchers/LiquidacionFormularios.tsx", import.meta.url), "utf8");
const pantalla = readFileSync(new URL("../../app/admin/(dashboard)/vouchers/page.tsx", import.meta.url), "utf8");
const liquidacion = readFileSync(new URL("../../app/admin/(dashboard)/vouchers/liquidacion/[id]/page.tsx", import.meta.url), "utf8");

test("la UI oculta conciliar, pago a cuenta, acreditar, baja y descartar a quien no puede", () => {
  assert.match(forms, /\{puedeConciliar && \(\n\s*<Button type="button" variant="outline"[^\n]*onClick=\{confirmar\}/);
  for (const pagina of [pantalla, liquidacion]) {
    assert.match(pagina, /const puedeConciliar = motivoParaNoConciliar\(user\) === null;/);
    for (const l of pagina.match(/<AcreditacionDelPago [^>]*\/>/g) ?? []) assert.match(l, /puedeConciliar=\{puedeConciliar\}/);
  }
  assert.match(pantalla, /\{puedeConciliar && \(\n\s*<Herramienta titulo="Anotar un pago a cuenta/);
  assert.match(liquidacion, /const puedeDarDeBaja = puedeConciliar;/);
  assert.match(liquidacion, /!puedeConciliar \? \(/);
});
