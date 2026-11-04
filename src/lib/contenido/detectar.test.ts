import { test } from "node:test";
import assert from "node:assert/strict";
import { detectarTipo, extraer, ctaPara } from "./detectar";

test("detecta los 5 tipos con textos reales", () => {
  const casos: [string, string][] = [
    ["2x1 en turnos de lunes a viernes de 10 a 16", "promo"],
    ["Este feriado del lunes 24/11 abrimos de 9 a 13. El martes volvemos al horario de siempre.", "horario"],
    ["Torneo de pádel por parejas el sábado 15/11. Inscripción abierta hasta el jueves, cupos limitados.", "evento"],
    ["Ahora hacemos lifting de pestañas. Pedí tu turno, te esperamos en Canning.", "servicio"],
    ["Llegaron los cortes para la parrilla del finde, vení a conocerlos.", "novedad"],
  ];
  for (const [texto, tipo] of casos) {
    const d = detectarTipo(texto);
    assert.equal(d.tipo, tipo, texto);
    assert.ok(d.confianza > 0 && d.confianza <= 1);
    assert.ok(d.pistas.length > 0, `pistas en «${texto}»`);
  }
});

test("sin pistas → novedad con confianza baja", () => {
  const d = detectarTipo("Gracias a todos por acompañarnos");
  assert.equal(d.tipo, "novedad");
  assert.ok(d.confianza <= 0.3);
  assert.deepEqual(d.pistas, []);
});

test("la promo gana aunque el texto tenga horario (criterio 1)", () => {
  const d = detectarTipo("2x1 en turnos de lunes a viernes de 10 a 16");
  assert.ok(d.pistas.includes("2x1"));
});

test("extrae título, precio y rango horario", () => {
  const e = extraer("2x1 en turnos de lunes a viernes de 10 a 16");
  assert.equal(e.titulo, "2x1 en turnos de lunes a viernes de 10 a 16");
  assert.equal(e.precio, "2x1");
  assert.equal(e.hora, "de 10 a 16");
  assert.equal(e.fecha, undefined);
  assert.equal(e.cta, ctaPara("promo", "instagram"));
});

test("extrae fecha dd/mm, hora hh:mm y bajada del resto", () => {
  const e = extraer("Torneo de primavera\nSábado 8/11 a las 9:30 hs. Inscripción $ 15.000 por pareja.", { canal: "whatsapp" });
  assert.equal(e.titulo, "Torneo de primavera");
  assert.equal(e.fecha, "08/11");
  assert.equal(e.hora, "09:30");
  assert.equal(e.precio, "$ 15.000");
  assert.match(e.bajada, /Inscripción/);
  assert.equal(e.cta, ctaPara("evento", "whatsapp"));
});

test("porcentaje y «a las 20»", () => {
  const e = extraer("20% off en toda la tienda el viernes a las 20");
  assert.equal(e.precio, "20% OFF");
  assert.equal(e.hora, "20:00");
});

test("título largo: primera oración o recorte ≤ 60 con «…»", () => {
  const largo = "Esta semana sumamos un servicio de masajes descontracturantes con aceites esenciales para relajarte después del trabajo";
  const e = extraer(largo);
  assert.ok(e.titulo.length <= 60, e.titulo);
  assert.ok(e.titulo.endsWith("…"));
  const dos = extraer("Abrimos el domingo. Vení a conocer la nueva vidriera con todas las novedades de la temporada de verano.");
  assert.equal(dos.titulo, "Abrimos el domingo");
  assert.match(dos.bajada, /^Vení a conocer/);
});

test("texto vacío no rompe", () => {
  const e = extraer("");
  assert.equal(e.titulo, "");
  assert.equal(e.bajada, "");
  assert.ok(e.cta);
});
