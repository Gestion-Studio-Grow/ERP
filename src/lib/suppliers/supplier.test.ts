import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTaxId, formatTaxId, validateSupplierInput } from "./supplier";

// D1 (ADR-060) — validación pura del proveedor maestro, sin DB.

test("normalizeTaxId deja 11 dígitos y saca separadores", () => {
  assert.equal(normalizeTaxId("30-71234567-9"), "30712345679");
  assert.equal(normalizeTaxId("30712345679"), "30712345679");
});

test("normalizeTaxId → null si no son 11 dígitos", () => {
  assert.equal(normalizeTaxId("123"), null);
  assert.equal(normalizeTaxId(""), null);
  assert.equal(normalizeTaxId(null), null);
  assert.equal(normalizeTaxId(undefined), null);
});

test("formatTaxId muestra XX-XXXXXXXX-X o null", () => {
  assert.equal(formatTaxId("30712345679"), "30-71234567-9");
  assert.equal(formatTaxId("nope"), null);
});

test("validateSupplierInput exige razón social", () => {
  assert.deepEqual(validateSupplierInput({ name: "  " }), { ok: false, error: "NAME_REQUIRED" });
});

test("validateSupplierInput acepta proveedor mínimo (solo nombre), taxId null", () => {
  const r = validateSupplierInput({ name: "Distribuidora Norte" });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.value.name, "Distribuidora Norte");
    assert.equal(r.value.taxId, null);
    assert.equal(r.value.active, true);
  }
});

test("validateSupplierInput normaliza el CUIT cuando viene con guiones", () => {
  const r = validateSupplierInput({ name: "Prov SA", taxId: "30-71234567-9" });
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.value.taxId, "30712345679");
});

test("validateSupplierInput rechaza un CUIT con contenido pero inválido (no guarda basura)", () => {
  assert.deepEqual(
    validateSupplierInput({ name: "Prov SA", taxId: "123" }),
    { ok: false, error: "TAXID_INVALID" },
  );
});

test("validateSupplierInput: campos vacíos → null, no strings vacíos", () => {
  const r = validateSupplierInput({ name: "Prov", email: "  ", phone: "", notes: null });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.value.email, null);
    assert.equal(r.value.phone, null);
    assert.equal(r.value.notes, null);
  }
});
