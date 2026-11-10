// Orden del dueño (08/11/2026) sobre marcar un cheque de la administración como rechazado:
// «solamente lo puede hacer el dueño y el administrador». No hay rol ADMIN aparte (OWNER lo absorbe),
// así que: OWNER puede; RECEPTION y PROFESSIONAL reciben un rechazo, aunque tengan `cash:manage`
// y aunque la base traiga un override que intente prenderles el permiso.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ROLE_CAPABILITIES, CAPACIDADES_POR_USUARIO, type Role, type UsuarioConPermisos } from "@/lib/capabilities";
import { motivoParaNoRechazarCheque, SOLO_DUENIO_RECHAZA_CHEQUE } from "./liquidacion-core";

const usuario = (role: Role, overrides: UsuarioConPermisos["overrides"] = []): UsuarioConPermisos => ({ role, overrides });

test("el dueño (OWNER, que absorbe al administrador) puede marcar un cheque rechazado", () => {
  assert.equal(motivoParaNoRechazarCheque(usuario("OWNER")), null);
  // Un override que intente apagárselo no aplica: la capacidad no está en la matriz por usuario.
  assert.equal(motivoParaNoRechazarCheque(usuario("OWNER", [{ capability: "vouchers:rechazar-cheque", allowed: false }])), null);
});

for (const role of ["RECEPTION", "PROFESSIONAL"] as const) {
  test(`${role} recibe un rechazo, con o sin cash:manage y aunque la base intente prenderle el permiso`, () => {
    assert.equal(motivoParaNoRechazarCheque(usuario(role)), SOLO_DUENIO_RECHAZA_CHEQUE);
    const conCaja = usuario(role, [{ capability: "cash:manage", allowed: true }]);
    assert.equal(motivoParaNoRechazarCheque(conCaja), SOLO_DUENIO_RECHAZA_CHEQUE);
    const forzado = usuario(role, [
      { capability: "cash:manage", allowed: true },
      { capability: "vouchers:rechazar-cheque", allowed: true },
    ]);
    assert.equal(motivoParaNoRechazarCheque(forzado), SOLO_DUENIO_RECHAZA_CHEQUE);
  });
}

test("cubre todos los roles del enum: sólo OWNER trae la capacidad, y no se prende por usuario", () => {
  const conPermiso = (Object.keys(ROLE_CAPABILITIES) as Role[]).filter((r) => ROLE_CAPABILITIES[r].includes("vouchers:rechazar-cheque"));
  assert.deepEqual(conPermiso, ["OWNER"]);
  assert.equal(CAPACIDADES_POR_USUARIO.includes("vouchers:rechazar-cheque"), false);
});

const acciones = readFileSync(new URL("./liquidacion-actions.ts", import.meta.url), "utf8");

test("rechazarCheque aplica la puerta del lado del servidor antes de escribir", () => {
  const cuerpo = acciones.slice(acciones.indexOf("export async function rechazarCheque"));
  assert.match(cuerpo.split("\n").slice(0, 3).join("\n"), /const ctx = await preparar\(motivoParaNoRechazarCheque\);\n\s*if \("ok" in ctx\) return ctx;/);
  // En `preparar`, la negación corta antes del interruptor, la demo y el tenant.
  const prep = acciones.slice(acciones.indexOf("async function preparar"), acciones.indexOf("function revalidar"));
  assert.ok(prep.indexOf("extra?.(user)") > prep.indexOf('requireCapability("cash:manage")'));
  assert.ok(prep.indexOf("if (negado) return") < prep.indexOf("vouchersPrendidos"));
  assert.ok(prep.indexOf("if (negado) return") < prep.indexOf("getCurrentTenantId"));
});

const forms = readFileSync(new URL("../../app/admin/(dashboard)/vouchers/LiquidacionFormularios.tsx", import.meta.url), "utf8");
const pantalla = readFileSync(new URL("../../app/admin/(dashboard)/vouchers/page.tsx", import.meta.url), "utf8");
const liquidacion = readFileSync(new URL("../../app/admin/(dashboard)/vouchers/liquidacion/[id]/page.tsx", import.meta.url), "utf8");

test("la UI oculta «Cheque rechazado» a quien no puede: cada botón pasa por puedeRechazarCheque", () => {
  const usos = forms.match(/<RechazarCheque /g) ?? [];
  const guardados = forms.match(/puedeRechazarCheque && <RechazarCheque /g) ?? [];
  assert.ok(usos.length >= 2);
  assert.equal(guardados.length, usos.length);
  for (const pagina of [pantalla, liquidacion]) {
    assert.match(pagina, /const puedeRechazarCheque = motivoParaNoRechazarCheque\(user\) === null;/);
    const llamadas = pagina.match(/<AcreditacionDelPago [^>]*\/>/g) ?? [];
    assert.ok(llamadas.length >= 1);
    for (const l of llamadas) assert.match(l, /puedeRechazarCheque=\{puedeRechazarCheque\}/);
  }
});
