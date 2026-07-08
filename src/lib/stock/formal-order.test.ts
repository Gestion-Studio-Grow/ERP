import { test } from "node:test";
import assert from "node:assert/strict";
import { formatCuit, composeFormalNotes } from "./formal-order";

test("formatCuit: normaliza 11 dígitos (con o sin separadores) a XX-XXXXXXXX-X", () => {
  assert.equal(formatCuit("30712345679"), "30-71234567-9");
  assert.equal(formatCuit("30-71234567-9"), "30-71234567-9");
  assert.equal(formatCuit("30 71234567 9"), "30-71234567-9");
});

test("formatCuit: null/inválido (≠ 11 dígitos) → null", () => {
  assert.equal(formatCuit(null), null);
  assert.equal(formatCuit(""), null);
  assert.equal(formatCuit("123"), null);
  assert.equal(formatCuit("307123456789"), null); // 12 dígitos
  assert.equal(formatCuit("no-numerico"), null);
});

test("composeFormalNotes: compone OC + CUIT + nota libre en una línea formal + nota", () => {
  assert.equal(
    composeFormalNotes({ orderNumber: "A-0042", cuit: "30712345679", note: "entrega parcial" }),
    "OC #A-0042 · CUIT 30-71234567-9\nentrega parcial",
  );
});

test("composeFormalNotes: solo lo presente; CUIT inválido se descarta", () => {
  assert.equal(composeFormalNotes({ orderNumber: "A-1", cuit: "", note: "" }), "OC #A-1");
  assert.equal(composeFormalNotes({ cuit: "30712345679" }), "CUIT 30-71234567-9");
  assert.equal(composeFormalNotes({ note: "solo nota" }), "solo nota");
  assert.equal(composeFormalNotes({ orderNumber: "A-1", cuit: "malo" }), "OC #A-1");
});

test("composeFormalNotes: todo vacío → null (idéntico al comportamiento legado de notes)", () => {
  assert.equal(composeFormalNotes({}), null);
  assert.equal(composeFormalNotes({ orderNumber: "", cuit: "", note: "" }), null);
  assert.equal(composeFormalNotes({ orderNumber: "  ", note: "  " }), null);
});
