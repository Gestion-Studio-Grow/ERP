import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { billetesDelCajon, listoDelCobro, vueltoDelCajon } from "./cobro-del-cajon";
import { mensajeCobro } from "./mensajes-whatsapp";

const CUANDO = "2026-10-24T19:00:00.000Z"; // sábado 24, 16:00 en Buenos Aires

describe("vuelto del cajón (sólo se muestra, no toca el cobro)", () => {
  test("paga con billete grande: vuelto exacto", () => {
    assert.deepEqual(vueltoDelCajon(27000, 30000), { estado: "vuelto", vuelto: 3000, texto: "Paga con $30.000 → vuelto $3.000" });
    assert.equal(vueltoDelCajon(20000, "25000")?.texto, "Paga con $25.000 → vuelto $5.000");
  });

  test("al centavo, sin errores de coma flotante", () => {
    const v = vueltoDelCajon(0.3, 1);
    assert.equal(v?.estado, "vuelto");
    assert.equal(v?.estado === "vuelto" && v.vuelto, 0.7);
    assert.equal(vueltoDelCajon(7500.5, 10000)?.texto, "Paga con $10.000 → vuelto $2.499,50");
  });

  test("Exacto: sin vuelto", () => {
    assert.deepEqual(vueltoDelCajon(27000, 27000), { estado: "justo", vuelto: 0, texto: "Paga justo, sin vuelto" });
  });

  test("no alcanza: dice cuánto falta", () => {
    assert.deepEqual(vueltoDelCajon(27000, 20000), { estado: "falta", falta: 7000, texto: "Con $20.000 te faltan $7.000" });
  });

  test("nada elegido o tipeo inválido: no muestra nada", () => {
    assert.equal(vueltoDelCajon(27000, ""), null);
    assert.equal(vueltoDelCajon(27000, null), null);
    assert.equal(vueltoDelCajon(27000, "abc"), null);
    assert.equal(vueltoDelCajon(27000, -5), null);
  });

  test("billetes: los del pie de cobro, todos mayores al total", () => {
    const b = billetesDelCajon(27000);
    assert.ok(b.length > 0 && b.length <= 3);
    for (const x of b) assert.ok(x > 27000);
    assert.deepEqual(billetesDelCajon(0), []);
  });
});

describe("Listo ✓ del cobro: comprobante por WhatsApp", () => {
  const base = { clienta: "Laura Gómez", telefono: "11 2345-6789", servicio: "Piernas", monto: 27000, medio: "EFECTIVO", cuando: CUANDO };

  test("comprobante con monto, medio y fecha; abre wa.me", () => {
    const l = listoDelCobro({ ...base, vuelto: 3000 });
    assert.equal(l.linea, "$27.000 en efectivo · vuelto $3.000");
    assert.ok(l.wa?.startsWith("https://wa.me/"));
    const texto = decodeURIComponent(new URL(l.wa!).searchParams.get("text") ?? "");
    assert.equal(texto, "¡Hola Laura! Recibimos $27.000 en efectivo por *Piernas* el sábado 24 a las 16:00. ¡Gracias! 💚");
    assert.doesNotMatch(texto, /undefined|null|\$0\b/);
  });

  test("sin teléfono (o no celular): la tecla no aparece", () => {
    assert.equal(listoDelCobro({ ...base, telefono: "" }).wa, null);
    assert.equal(listoDelCobro({ ...base, telefono: null }).wa, null);
    assert.equal(listoDelCobro({ ...base, telefono: "123" }).wa, null);
  });

  test("sin monto del servidor: ni comprobante ni «$0»", () => {
    const l = listoDelCobro({ ...base, monto: null });
    assert.equal(l.wa, null);
    assert.equal(l.linea, "Cobrado en efectivo");
  });

  test("el vuelto sólo se nombra en efectivo", () => {
    assert.equal(listoDelCobro({ ...base, medio: "TRANSFERENCIA", vuelto: 3000 }).linea, "$27.000 por transferencia");
  });

  test("mensajeCobro sin fecha queda como siempre", () => {
    assert.equal(mensajeCobro({ clienta: "Laura", monto: 27000, medio: "EFECTIVO", servicio: "Piernas" }), "¡Hola Laura! Recibimos $27.000 en efectivo por *Piernas*. ¡Gracias! 💚");
  });
});
