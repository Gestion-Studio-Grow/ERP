// Quién es la administración (sus CUIT/CBU) lo carga sólo la dueña: RECEPTION y PROFESSIONAL reciben un
// rechazo aunque tengan `cash:manage` y aunque la base traiga un override que intente prenderles el permiso.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Role, UsuarioConPermisos } from "@/lib/capabilities";
import { motivoParaNoEditarPagadores, SOLO_DUENIA_PAGADORES } from "./pagadores-administracion";

const usuario = (role: Role, overrides: UsuarioConPermisos["overrides"] = []): UsuarioConPermisos => ({ role, overrides });

test("OWNER puede cargar los pagadores de la administración", () => {
  assert.equal(motivoParaNoEditarPagadores(usuario("OWNER")), null);
});

for (const role of ["RECEPTION", "PROFESSIONAL"] as const) {
  test(`${role} no puede guardar los pagadores, con cash:manage y con un override forzado`, () => {
    assert.equal(motivoParaNoEditarPagadores(usuario(role)), SOLO_DUENIA_PAGADORES);
    const forzado = usuario(role, [
      { capability: "cash:manage", allowed: true },
      { capability: "vouchers:conciliar", allowed: true },
    ]);
    assert.equal(motivoParaNoEditarPagadores(forzado), SOLO_DUENIA_PAGADORES);
  });
}

const accion = readFileSync(new URL("./pagadores-administracion-actions.ts", import.meta.url), "utf8");
const pantalla = readFileSync(new URL("../../app/admin/(dashboard)/vouchers/page.tsx", import.meta.url), "utf8");

test("la acción aplica la puerta del lado del servidor antes del interruptor, la demo y la escritura", () => {
  const cuerpo = accion.slice(accion.indexOf("export async function guardarPagadoresDeLaAdministracion"));
  const puerta = cuerpo.indexOf("if (negado) return");
  assert.ok(puerta > cuerpo.indexOf('requireCapability("cash:manage")'));
  assert.ok(puerta < cuerpo.indexOf("vouchersPrendidos"));
  assert.ok(puerta < cuerpo.indexOf("isDemoSandbox"));
  assert.ok(puerta < cuerpo.indexOf("businessSettings.upsert"));
  assert.match(cuerpo, /select: \{ id: true \}/); // sin select, el RETURNING pide columnas que pueden no estar
});

test("la pantalla muestra el formulario sólo a quien puede y avisa si la lista está vacía", () => {
  assert.match(pantalla, /const puedeCargarPagadores = motivoParaNoEditarPagadores\(user\) === null;/);
  assert.match(pantalla, /puedeCargarPagadores && \(\s*<div className="mt-8">\s*<Herramienta titulo="Quién es la administración"/);
  assert.match(pantalla, /pagadores\.length === 0 && \(\s*<AvisoError[\s\S]{0,80}tono="aviso"\s*titulo="Cargá el CUIT de la administración para cerrar el control"/);
});
