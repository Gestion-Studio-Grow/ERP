// D4: el permiso del cliente (casillas del titular, append-only, revocable). PURO.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  TEXTO_CONSENTIMIENTO,
  consentimientoVigente,
  mailDeCopiaDeConsentimiento,
  nivelesPermitidos,
  validarConsentimiento,
} from "./consentimiento-core";

const f = (nivel: string, aceptado: boolean, hora: number, versionTexto: string = TEXTO_CONSENTIMIENTO.version) =>
  ({ nivel, aceptado, versionTexto, createdAt: new Date(Date.UTC(2026, 10, 14, hora)) });

test("vale la última casilla de cada nivel; sin filas, sin permiso", () => {
  assert.deepEqual(consentimientoVigente([]), { n1: false, n2: false });
  assert.deepEqual(consentimientoVigente([f("n1", true, 10)]), { n1: true, n2: false });
  assert.deepEqual(consentimientoVigente([f("n1", true, 10), f("n1", false, 11)]), { n1: false, n2: false }, "revocado");
  assert.deepEqual(consentimientoVigente([f("n1", false, 11), f("n1", true, 10)]), { n1: false, n2: false }, "el orden de llegada no importa");
  assert.deepEqual(consentimientoVigente([f("n1", true, 12), f("n1", false, 11)]), { n1: true, n2: false });
});

test("a igual hora gana la revocación; n2 sin n1 no vale; niveles desconocidos se ignoran", () => {
  assert.deepEqual(consentimientoVigente([f("n1", true, 10), f("n1", false, 10)]), { n1: false, n2: false });
  assert.deepEqual(consentimientoVigente([f("n1", false, 10), f("n1", true, 10)]), { n1: false, n2: false });
  assert.deepEqual(consentimientoVigente([f("n2", true, 10)]), { n1: false, n2: false });
  assert.deepEqual(consentimientoVigente([f("n1", true, 10), f("n2", true, 10)]), { n1: true, n2: true });
  assert.deepEqual(consentimientoVigente([f("n1", true, 10), f("n2", true, 10), f("n1", false, 12)]), { n1: false, n2: false }, "sacar n1 apaga n2");
  assert.deepEqual(
    consentimientoVigente([f("n1", true, 10), f("n2", true, 10), f("n1", false, 12), f("n1", true, 13)]),
    { n1: true, n2: false },
    "volver a dar n1 no revive el n2 viejo",
  );
  assert.deepEqual(
    consentimientoVigente([f("n1", true, 10), f("n1", false, 12), f("n1", true, 13), f("n2", true, 14)]),
    { n1: true, n2: true },
    "n2 tildado de nuevo después de n1 vale",
  );
  assert.deepEqual(consentimientoVigente([f("n3", true, 10), f("N1", true, 10), f("", true, 10)]), { n1: false, n2: false });
});

test("niveles permitidos: CH sólo borrador al dueño; sin permiso, sólo borrador interno", () => {
  assert.deepEqual(nivelesPermitidos({ n1: true, n2: true }, true).niveles, ["n1"]);
  assert.deepEqual(nivelesPermitidos({ n1: false, n2: false }, false).niveles, ["n1"]);
  assert.deepEqual(nivelesPermitidos({ n1: true, n2: false }, false).niveles, ["n1", "n3"]);
  assert.deepEqual(nivelesPermitidos({ n1: true, n2: true }, false).niveles, ["n1", "n2", "n3"]);
});

test("sólo el titular (OWNER) da o saca el permiso, y sólo de los niveles que existen", () => {
  assert.deepEqual(validarConsentimiento({ rol: "OWNER", nivel: "n1", aceptado: true }), { ok: true, valor: { nivel: "n1", aceptado: true } });
  assert.deepEqual(validarConsentimiento({ rol: "OWNER", nivel: "n2", aceptado: false }), { ok: true, valor: { nivel: "n2", aceptado: false } });
  for (const rol of ["RECEPTION", "owner", "", null, undefined, "SUPERADMIN"]) {
    assert.equal(validarConsentimiento({ rol, nivel: "n1", aceptado: true }).ok, false, String(rol));
  }
  for (const nivel of ["n3", "N1", "", null, 1]) assert.equal(validarConsentimiento({ rol: "OWNER", nivel, aceptado: true }).ok, false, String(nivel));
  for (const aceptado of ["true", 1, null, undefined]) assert.equal(validarConsentimiento({ rol: "OWNER", nivel: "n1", aceptado }).ok, false, String(aceptado));
});

test("la copia por mail lleva el texto aceptado, lo que nunca se toca, cómo revocar y la versión", () => {
  const m = mailDeCopiaDeConsentimiento({ negocio: "Kiosco Prueba", nivel: "n1", aceptado: true, cuando: new Date(Date.UTC(2026, 10, 14, 15)) });
  assert.match(m.asunto, /Diste permiso/);
  for (const parte of [TEXTO_CONSENTIMIENTO.n1, TEXTO_CONSENTIMIENTO.nunca, TEXTO_CONSENTIMIENTO.revocar, TEXTO_CONSENTIMIENTO.version, "Kiosco Prueba", "12:00"]) {
    assert.ok(m.cuerpo.includes(parte), parte);
  }
  const s = mailDeCopiaDeConsentimiento({ negocio: "K", nivel: "n2", aceptado: false, cuando: new Date() });
  assert.match(s.asunto, /Sacaste el permiso/);
  assert.ok(s.cuerpo.includes(TEXTO_CONSENTIMIENTO.n2));
  assert.equal(TEXTO_CONSENTIMIENTO.provisorio, true, "texto legal provisorio hasta que lo revise el dueño (D4)");
});

test("versión del texto: un permiso dado a una versión vieja no vale (MEDIO 5 de la certificación)", () => {
  assert.deepEqual(consentimientoVigente([f("n1", true, 10, "VERSION-VIEJA-1999")]), { n1: false, n2: false });
  assert.deepEqual(consentimientoVigente([f("n1", true, 10, "VERSION-VIEJA-1999"), f("n1", true, 11)]), { n1: true, n2: false }, "re-tildado con la vigente");
  assert.deepEqual(consentimientoVigente([f("n1", true, 10), f("n2", true, 11, "vieja")]), { n1: true, n2: false }, "n2 de versión vieja");
  assert.deepEqual(consentimientoVigente([f("n1", true, 10), f("n1", true, 10, "vieja")]), { n1: false, n2: false }, "a igual hora gana la que no vale");
  assert.deepEqual(consentimientoVigente([f("n1", true, 10, "otra")], "otra"), { n1: true, n2: false }, "la versión se puede pasar");
});

test("la versión del texto es la MISMA en TS y en el SQL del candado (gsg_permiso_n1_vigente y la de cartera)", () => {
  const sql = readFileSync(path.join(process.cwd(), "prisma/pending-gate2/MANT_roles_soporte.sql"), "utf8");
  const versiones = [...sql.matchAll(/"versionTexto" = '([^']*)'/g)].map((m) => m[1]);
  assert.ok(versiones.length >= 6, `el SQL compara la versión en cada lectura del permiso (encontradas: ${versiones.length})`);
  assert.deepEqual([...new Set(versiones)], [TEXTO_CONSENTIMIENTO.version]);
});
