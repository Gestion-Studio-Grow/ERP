import assert from "node:assert/strict";
import { test } from "node:test";
import { agruparPorDia, claveDia, cuandoEnArgentina, diasDelRango, enlaceSeguro, entradaParaSuscripcion, entre, grillaDelMes, iniciales, laminasPublicas, matrizDelFormulario, mesPedido, mesVecino, paginacion, respuestaDePresentacion, tokenDeCalendario, usuarioDelToken, versionesVivas } from "./gestion-lecturas-core";

test("una reunión de las 22 en Argentina no cae al día siguiente", () => {
  assert.equal(claveDia(new Date("2026-11-10T22:00:00-03:00")), "2026-11-10");
  assert.equal(claveDia(new Date("2026-11-11T00:00:00-03:00")), "2026-11-11");
});

test("cuándo es se cuenta en días argentinos", () => {
  const ahora = new Date("2026-11-10T23:30:00-03:00");
  assert.equal(cuandoEnArgentina(new Date("2026-11-10T22:00:00-03:00"), ahora), "Hoy");
  assert.equal(cuandoEnArgentina(new Date("2026-11-11T01:00:00-03:00"), ahora), "Mañana");
  assert.equal(cuandoEnArgentina(new Date("2026-11-15T12:00:00-03:00"), ahora), "En 5 días");
});

test("la grilla va de lunes a domingo y cierra semanas completas", () => {
  // Noviembre de 2026 empieza domingo y termina lunes.
  const nov = grillaDelMes("2026-11");
  assert.equal(nov[0], "2026-10-26");
  assert.equal(nov[nov.length - 1], "2026-12-06");
  assert.equal(nov.length % 7, 0);
  for (const mes of ["2026-02", "2027-02", "2028-02", "2026-06", "2027-03"]) {
    const g = grillaDelMes(mes);
    assert.equal(g.length % 7, 0, mes);
    const [a, m, d] = g[0].split("-").map(Number);
    assert.equal(new Date(Date.UTC(a, m - 1, d)).getUTCDay(), 1, `${mes} arranca lunes`);
  }
});

test("el mes pedido se valida y se puede mover cruzando el año", () => {
  assert.equal(mesPedido("2026-13", new Date("2026-11-01T12:00:00-03:00")), "2026-11");
  assert.equal(mesPedido("<script>", new Date("2026-11-01T12:00:00-03:00")), "2026-11");
  assert.equal(mesVecino("2026-12", 1), "2027-01");
  assert.equal(mesVecino("2026-01", -1), "2025-12");
});

test("un evento de varios días ocupa cada día, con tope", () => {
  assert.deepEqual(diasDelRango(new Date("2026-11-10T12:00:00-03:00"), new Date("2026-11-12T12:00:00-03:00")), ["2026-11-10", "2026-11-11", "2026-11-12"]);
  assert.deepEqual(diasDelRango(new Date("2026-11-10T12:00:00-03:00"), null), ["2026-11-10"]);
  assert.equal(diasDelRango(new Date("2026-01-01T12:00:00-03:00"), new Date("2030-01-01T12:00:00-03:00")).length, 31);
});

test("agrupa por día y ordena por hora", () => {
  const mapa = agruparPorDia([{ fecha: new Date("2026-11-10T22:00:00-03:00") }, { fecha: new Date("2026-11-10T08:00:00-03:00") }]);
  assert.deepEqual([...mapa.keys()], ["2026-11-10"]);
  assert.equal(mapa.get("2026-11-10")?.[0].fecha.getTime(), new Date("2026-11-10T08:00:00-03:00").getTime());
});

test("la llave del calendario es de esa persona en ese negocio", () => {
  const t = tokenDeCalendario("secreto", "negocio", "usuario1");
  assert.equal(usuarioDelToken("secreto", "negocio", t), "usuario1");
  assert.equal(usuarioDelToken("secreto", "otro-negocio", t), null);
  assert.equal(usuarioDelToken("otro-secreto", "negocio", t), null);
  assert.equal(usuarioDelToken("secreto", "negocio", t.replace("usuario1", "usuario2")), null);
  assert.equal(usuarioDelToken("secreto", "negocio", "usuario1"), null);
  assert.equal(usuarioDelToken("secreto", "negocio", ""), null);
});

test("hacia un calendario externo no sale ninguna cifra de pagos y cobros", () => {
  const base = { id: "x", fecha: new Date(), proyecto: "Gala" };
  assert.equal(entradaParaSuscripcion({ ...base, tipo: "PAGO", titulo: "Seña $ 500.000 a Juan" }).titulo, "Pago · Gala");
  assert.equal(entradaParaSuscripcion({ ...base, tipo: "COBRO", titulo: "Saldo USD 2000" }).titulo, "Cobro · Gala");
  assert.equal(entradaParaSuscripcion({ ...base, tipo: "REUNION", titulo: "Visita" }).titulo, "Reunión · Visita");
});

test("en pantallas públicas sólo https o imágenes embebidas", () => {
  assert.equal(enlaceSeguro("https://x.com/a.pdf"), "https://x.com/a.pdf");
  assert.equal(enlaceSeguro("data:image/png;base64,AAAA"), "data:image/png;base64,AAAA");
  assert.equal(enlaceSeguro("javascript:alert(1)"), null);
  assert.equal(enlaceSeguro("http://x.com"), null);
  assert.equal(enlaceSeguro("data:text/html;base64,AAAA"), null);
  assert.equal(enlaceSeguro(undefined), null);
});

test("de una lámina sale título, texto e imagen, y nada interno", () => {
  const salida = laminasPublicas([{ titulo: "Idea", texto: "Concepto", imagen: "https://x.com/i.png", costo: 100, notas: "interna" }, { titulo: "", imagen: "javascript:1" }, "basura", null]);
  assert.deepEqual(salida, [{ titulo: "Idea", texto: "Concepto", imagen: "https://x.com/i.png" }]);
  assert.deepEqual(laminasPublicas("nada"), []);
  assert.deepEqual(laminasPublicas([{ titulo: "Puntos", items: ["a", "b", 3] }]), [{ titulo: "Puntos", texto: "a\nb", imagen: null }]);
  // Una referencia interna nunca sale como dirección: o se resuelve a la imagen, o la lámina va sin ella.
  assert.deepEqual(laminasPublicas([{ titulo: "Foto", imagen: "archivo:abc" }]), [{ titulo: "Foto", texto: "", imagen: null }]);
  assert.deepEqual(laminasPublicas([{ titulo: "Foto", imagen: "archivo:abc" }], () => "data:image/png;base64,AAAA"), [{ titulo: "Foto", texto: "", imagen: "data:image/png;base64,AAAA" }]);
  assert.deepEqual(laminasPublicas([{ titulo: "Foto", imagen: "archivo:abc" }], () => "javascript:1"), [{ titulo: "Foto", texto: "", imagen: null }]);
});

test("la respuesta del cliente deja nombre, fecha y pedido", () => {
  assert.equal(respuestaDePresentacion(true, "Ana", "", "1 nov"), "Aprobada por Ana el 1 nov.");
  assert.equal(respuestaDePresentacion(false, "Ana", "Otra foto", "1 nov"), "Cambios pedidos por Ana el 1 nov: Otra foto");
});

test("la matriz nunca trae a Dirección, y editar implica ver", () => {
  const marcados = new Set(["editar:DISENO:diseno", "ver:DISENO:ficha", "oculta:DISENO:margen", "ver:DIRECCION:ficha", "editar:DIRECCION:equipo"]);
  const filas = matrizDelFormulario((c) => marcados.has(c));
  assert.ok(!filas.some((f) => (f.rol as string) === "DIRECCION"));
  const diseno = filas.find((f) => f.rol === "DISENO" && f.modulo === "diseno");
  assert.deepEqual([diseno?.ver, diseno?.editar], [true, true]);
  const ficha = filas.find((f) => f.rol === "DISENO" && f.modulo === "ficha");
  assert.deepEqual(ficha?.columnasOcultas, ["margen"]);
  assert.equal(filas.find((f) => f.rol === "DISENO" && f.modulo === "costos")?.columnasOcultas, undefined);
});

test("varios detalles", () => {
  assert.equal(iniciales("Ana María Pérez"), "AM");
  assert.equal(iniciales("Sonido"), "SO");
  assert.equal(iniciales("  "), "?");
  assert.deepEqual(paginacion("3", 95, 30), { pagina: 3, paginas: 4, salto: 60 });
  assert.deepEqual(paginacion("99", 95, 30), { pagina: 4, paginas: 4, salto: 90 });
  assert.deepEqual(paginacion("x", 0, 30), { pagina: 1, paginas: 1, salto: 0 });
  assert.equal(entre(120, 0, 100, 50), 100);
  assert.equal(entre(NaN, 1, 5, 4), 4);
  assert.equal(versionesVivas([{ proyectoId: "a", version: 1 }, { proyectoId: "a", version: 3 }, { proyectoId: "b", version: 2 }]).get("a"), 3);
});
