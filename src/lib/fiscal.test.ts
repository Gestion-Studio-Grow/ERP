import { test } from "node:test";
import assert from "node:assert/strict";

import {
  calcularImpuestos,
  construirPerfilFiscal,
  crearGetFiscalProfile,
  PerfilFiscalIncompletoError,
  type LeerRegistroFiscal,
  type RegistroFiscalTenant,
} from "./fiscal";

// CUITs con dígito verificador VÁLIDO (módulo 11). No son altas reales: sirven
// para que el validador no rechace el fixture por una razón equivocada.
const CUIT_A = "20304050609";
const CUIT_B = "27222222228";

const registro = (r: Partial<RegistroFiscalTenant> = {}): RegistroFiscalTenant => ({
  arcaCuit: CUIT_A,
  arcaPuntoVenta: 3,
  arcaHomologacion: true,
  ...r,
});

// Lector fake: no toca la DB. El seam es justamente para testear offline.
const leerFijo =
  (porTenant: Record<string, RegistroFiscalTenant>): LeerRegistroFiscal =>
  async (tenantId) =>
    porTenant[tenantId] ?? null;

// --- 1. Tenant con perfil cargado: sale el dato REAL, no el hardcode ---------

test("getFiscalProfile: lee CUIT y punto de venta del tenant (no el placeholder)", async () => {
  const getPerfil = crearGetFiscalProfile(leerFijo({ "beauty-spa": registro() }));
  const perfil = await getPerfil("beauty-spa");

  assert.equal(perfil.cuit, 20304050609);
  assert.equal(perfil.puntoVenta, 3);
  assert.notEqual(perfil.cuit, 20000000000, "no puede volver el CUIT placeholder");
  assert.notEqual(perfil.puntoVenta, 1, "no puede volver el punto de venta hardcodeado");
});

// --- 2. Tenant sin CUIT: falla RUIDOSAMENTE, no cae al placeholder -----------

test("getFiscalProfile: tenant sin CUIT LANZA (no emite con datos inventados)", async () => {
  const getPerfil = crearGetFiscalProfile(
    leerFijo({ "sin-cuit": registro({ arcaCuit: null }) }),
  );
  await assert.rejects(
    () => getPerfil("sin-cuit"),
    (err: unknown) => {
      assert.ok(err instanceof PerfilFiscalIncompletoError);
      assert.equal(err.campo, "arcaCuit");
      assert.equal(err.tenantId, "sin-cuit");
      return true;
    },
  );
});

test("getFiscalProfile: CUIT vacío o en blanco también LANZA", async () => {
  const getPerfil = crearGetFiscalProfile(
    leerFijo({ vacio: registro({ arcaCuit: "   " }) }),
  );
  await assert.rejects(() => getPerfil("vacio"), PerfilFiscalIncompletoError);
});

test("construirPerfilFiscal: el viejo CUIT placeholder 20000000000 se rechaza por nombre", () => {
  assert.throws(
    () => construirPerfilFiscal("t", registro({ arcaCuit: "20000000000" })),
    /placeholder/,
  );
});

test("construirPerfilFiscal: CUIT con dígito verificador mal LANZA", () => {
  // 20304050607: mismos 10 primeros dígitos que CUIT_A, verificador equivocado.
  assert.throws(
    () => construirPerfilFiscal("t", registro({ arcaCuit: "20304050607" })),
    /no es un CUIT válido/,
  );
});

test("construirPerfilFiscal: tenant inexistente LANZA", () => {
  assert.throws(
    () => construirPerfilFiscal("fantasma", null),
    (err: unknown) =>
      err instanceof PerfilFiscalIncompletoError && err.campo === "tenant",
  );
});

test("construirPerfilFiscal: sin punto de venta (o inválido) LANZA", () => {
  assert.throws(
    () => construirPerfilFiscal("t", registro({ arcaPuntoVenta: null })),
    (err: unknown) =>
      err instanceof PerfilFiscalIncompletoError && err.campo === "arcaPuntoVenta",
  );
  assert.throws(
    () => construirPerfilFiscal("t", registro({ arcaPuntoVenta: 0 })),
    /punto de venta válido/,
  );
});

// --- 3. Aislamiento: dos tenants ⇒ dos perfiles distintos --------------------

test("getFiscalProfile: dos tenants distintos obtienen perfiles distintos", async () => {
  const getPerfil = crearGetFiscalProfile(
    leerFijo({
      "beauty-spa": registro({ arcaCuit: CUIT_A, arcaPuntoVenta: 3 }),
      magra: registro({ arcaCuit: CUIT_B, arcaPuntoVenta: 7, arcaHomologacion: false, arcaCondicionIva: "RESPONSABLE_INSCRIPTO" }),
    }),
  );

  const beauty = await getPerfil("beauty-spa");
  const magra = await getPerfil("magra");

  assert.notEqual(beauty.cuit, magra.cuit);
  assert.notEqual(beauty.puntoVenta, magra.puntoVenta);
  assert.equal(beauty.cuit, 20304050609);
  assert.equal(magra.cuit, 27222222228);
  assert.equal(magra.puntoVenta, 7);
  assert.equal(magra.condicionIva, "RESPONSABLE_INSCRIPTO");
});

// --- 4. Homologación vs producción ------------------------------------------

test("construirPerfilFiscal: homologacion refleja arcaHomologacion del tenant", () => {
  const test1 = construirPerfilFiscal("t", registro({ arcaHomologacion: true }));
  assert.equal(test1.homologacion, true, "testing ARCA");

  const prod = construirPerfilFiscal(
    "t",
    registro({ arcaHomologacion: false, arcaCondicionIva: "MONOTRIBUTO" }),
  );
  assert.equal(prod.homologacion, false, "producción");
});

// --- 5. Condición de IVA: asumida solo en homologación -----------------------

test("construirPerfilFiscal: sin condición de IVA en HOMOLOGACIÓN asume el default y lo marca", () => {
  const perfil = construirPerfilFiscal("t", registro({ arcaHomologacion: true }));
  assert.equal(perfil.condicionIva, "MONOTRIBUTO");
  assert.equal(perfil.condicionIvaAsumida, true, "queda marcado como supuesto, no como dato");
});

test("construirPerfilFiscal: sin condición de IVA en PRODUCCIÓN LANZA (no asume Monotributo)", () => {
  assert.throws(
    () => construirPerfilFiscal("t", registro({ arcaHomologacion: false })),
    (err: unknown) =>
      err instanceof PerfilFiscalIncompletoError && err.campo === "condicionIva",
  );
});

test("construirPerfilFiscal: condición de IVA cargada gana y no queda marcada como asumida", () => {
  const perfil = construirPerfilFiscal(
    "t",
    registro({ arcaCondicionIva: "RESPONSABLE_INSCRIPTO", arcaHomologacion: false }),
  );
  assert.equal(perfil.condicionIva, "RESPONSABLE_INSCRIPTO");
  assert.equal(perfil.condicionIvaAsumida, false);
});

test("construirPerfilFiscal: condición de IVA desconocida LANZA (no cae al default)", () => {
  assert.throws(
    () => construirPerfilFiscal("t", registro({ arcaCondicionIva: "RESPONSABLE_NO_INSCRIPTO" })),
    /no es una condición de IVA conocida/,
  );
});

// Consecuencia de fondo del punto 5: la condición del emisor decide el tipo de
// comprobante. Si el emisor real es Responsable Inscripto y se asume Monotributo,
// se emite Factura C sin IVA discriminado en vez de A/B con IVA.
test("calcularImpuestos: Monotributo asumido sobre un Responsable Inscripto pierde el IVA", () => {
  const monto = 121_000;
  const comoMono = calcularImpuestos("MONOTRIBUTO", monto);
  const comoRI = calcularImpuestos("RESPONSABLE_INSCRIPTO", monto);

  assert.equal(comoMono.iva[0].importe, 0);
  assert.equal(comoRI.iva[0].importe, 21_000);
  assert.notEqual(comoMono.neto, comoRI.neto);
});

// --- Formato de carga del CUIT ----------------------------------------------

// La columna es texto libre y en el repo ya hay fixtures con guiones
// (`bancos-glue.test.ts`): si el perfil no normalizara, un CUIT bien cargado a
// mano haría fallar la emisión del tenant entero.
test("construirPerfilFiscal: tolera el CUIT con guiones y espacios", () => {
  for (const crudo of ["20-30405060-9", "20 30405060 9", " 20304050609 "]) {
    const perfil = construirPerfilFiscal("t", registro({ arcaCuit: crudo }));
    assert.equal(perfil.cuit, 20304050609, `debería normalizar "${crudo}"`);
  }
});
