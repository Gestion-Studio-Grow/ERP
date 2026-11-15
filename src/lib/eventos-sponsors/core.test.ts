import { test } from "node:test";
import assert from "node:assert/strict";
import { claveEvento, claveMarca, esDia, esUrl, leerFiltros, leerLote, normalizar, rangoDeFechas, rolDe, traeContacto, urlConContacto, validarLote, validarPedido, diaADate } from "./core";

const marca = (o: Record<string, unknown> = {}) => ({ nombre: "Banco Uno", rol: "SPONSOR", urlFuente: "https://expo.example/sponsors", ...o });
const evento = (o: Record<string, unknown> = {}) => ({
  nombre: "Expo Agro 2027",
  fecha: "2027-03-10",
  fechaHasta: "2027-03-12",
  lugar: "Predio Ferial",
  region: "Córdoba",
  organizador: "Cámara Agro",
  urlFuente: "https://expo.example",
  marcas: [marca()],
  ...o,
});

test("normalizar y las llaves: acentos, mayúsculas y signos no duplican", () => {
  assert.equal(normalizar("  Expo  AGRO, Córdoba! "), "expo agro cordoba");
  assert.equal(claveEvento("Expo Agro", "2027-03-10", "Córdoba"), claveEvento("expo  agro", "2027-03-10", "CORDOBA"));
  assert.notEqual(claveEvento("Expo Agro", "2027-03-10", "Córdoba"), claveEvento("Expo Agro", "2028-03-10", "Córdoba"));
  assert.equal(claveMarca("Coca-Cola"), claveMarca("coca cola"));
});

test("esDia y esUrl: días reales y sólo http(s)", () => {
  assert.ok(esDia("2027-02-28"));
  assert.ok(!esDia("2027-02-30"));
  assert.ok(!esDia("10/03/2027"));
  assert.ok(esUrl("https://a.example/x?y=1"));
  for (const u of ["javascript:alert(1)", "data:text/html,x", "file:///etc/passwd", "ftp://a.example", "no es url"]) assert.ok(!esUrl(u), u);
});

test("rolDe: mayúsculas, minúsculas y sinónimos", () => {
  assert.equal(rolDe("sponsor principal"), "SPONSOR_PRINCIPAL");
  assert.equal(rolDe("Media Partner"), "MEDIA_PARTNER");
  assert.equal(rolDe("patrocinador"), "SPONSOR");
  assert.equal(rolDe("cualquiera"), null);
});

test("traeContacto: mails y teléfonos sí; días, años y precios no", () => {
  assert.ok(traeContacto("escribir a juan@empresa.com"));
  assert.ok(traeContacto("+54 9 11 4567-8901"));
  assert.ok(traeContacto("(0351) 456-7890"));
  assert.ok(!traeContacto("2027-03-10"));
  assert.ok(!traeContacto("Temporada 2026-2027"));
  assert.ok(!traeContacto("Expo Agro 2027"));
});

test("validarLote: lote sano entra con sus marcas", () => {
  const r = validarLote({ eventos: [evento()] });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.eventos.length, 1);
  assert.equal(r.eventos[0].marcas[0].rol, "SPONSOR");
  assert.deepEqual(r.rechazos, []);
});

test("validarLote: acepta el array suelto", () => {
  assert.equal(validarLote([evento()]).ok, true);
});

test("validarLote: un evento malo se rechaza con su motivo y el resto entra", () => {
  const r = validarLote({ eventos: [evento(), evento({ nombre: "Otro", fecha: "2027-13-01" }), evento({ nombre: "Sin lugar", lugar: "" })] });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.eventos.length, 1);
  assert.equal(r.rechazos.length, 2);
  assert.match(r.rechazos[0].motivo, /fecha/);
  assert.match(r.rechazos[1].motivo, /lugar/);
});

test("validarLote: marca sin URL de fuente, con URL javascript: o rol desconocido se rechaza sola", () => {
  const r = validarLote({ eventos: [evento({ marcas: [marca(), marca({ nombre: "B", urlFuente: undefined }), marca({ nombre: "C", urlFuente: "javascript:alert(1)" }), marca({ nombre: "D", rol: "amigo" })] })] });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.eventos[0].marcas.length, 1);
  assert.equal(r.rechazos.length, 3);
});

test("validarLote: duplicados dentro del lote se unen (evento por llave, marca por llave+rol)", () => {
  const r = validarLote({
    eventos: [
      evento({ marcas: [marca(), marca({ nombre: "banco uno" })] }),
      evento({ nombre: "EXPO AGRO 2027", region: "cordoba", marcas: [marca({ nombre: "Agro SA", rol: "expositor" })] }),
    ],
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.eventos.length, 1);
  assert.deepEqual(r.eventos[0].marcas.map((m) => m.nombre), ["Banco Uno", "Agro SA"]);
});

test("validarLote: datos de contacto de personas rechazan el lote ENTERO", () => {
  for (const malo of [
    evento({ marcas: [marca({ email: "x@y.com" })] }),
    evento({ contacto: "Juan" }),
    evento({ organizador: "Cámara (tel 11 4567 8901)" }),
    evento({ marcas: [marca({ nombre: "info@banco.com" })] }),
    evento({ marcas: [marca({ web: "mailto:info@banco.com" })] }),
  ]) {
    const r = validarLote({ eventos: [evento({ nombre: "Sano" }), malo] });
    assert.equal(r.ok, false, JSON.stringify(malo));
    if (!r.ok) assert.match(r.motivo, /contacto/);
  }
});

test("validarLote: vacíos, topes y formas raras", () => {
  assert.equal(validarLote({}).ok, false);
  assert.equal(validarLote({ eventos: [] }).ok, false);
  assert.equal(validarLote({ eventos: Array.from({ length: 501 }, (_, i) => evento({ nombre: `E${i}` })) }).ok, false);
  assert.equal(validarLote({ eventos: [evento({ fechaHasta: "2027-03-01" })] }).ok, false);
  assert.equal(validarLote({ eventos: [evento({ marcas: "no" })] }).ok, false); // «marcas» inválida: el evento no entra
  assert.equal(validarLote({ eventos: [evento({ nombre: "!!!" })] }).ok, false);
});

test("leerLote: JSON inválido o enorme", () => {
  assert.equal(leerLote("{no json").ok, false);
  assert.equal(leerLote("x".repeat(2_000_001)).ok, false);
  assert.equal(leerLote(JSON.stringify({ eventos: [evento()] })).ok, true);
});

test("leerFiltros: ignora lo que no es válido", () => {
  assert.deepEqual(leerFiltros({ region: "CABA", desde: "2027-01-01", hasta: "nada" }), { region: "CABA", desde: "2027-01-01", hasta: null });
  assert.deepEqual(leerFiltros({ region: ["a", "b"] }), { region: null, desde: null, hasta: null });
});

test("rangoDeFechas", () => {
  assert.match(rangoDeFechas(diaADate("2027-03-10"), null), /2027/);
  assert.match(rangoDeFechas(diaADate("2027-03-10"), diaADate("2027-03-12")), / al /);
  assert.match(rangoDeFechas(diaADate("2027-03-10"), diaADate("2027-03-12")), /^10 al 12 /, "mismo mes: el mes va una sola vez");
  assert.match(rangoDeFechas(diaADate("2026-12-30"), diaADate("2027-01-02")), /2027$/);
});

// ── Regresión de la certificación adversarial (GSG-CRM-009) ──────────────────

test("cert A1: URLs que llevan a una persona (WhatsApp, teléfono en la query, mail) rechazan el lote", () => {
  for (const malo of [
    evento({ marcas: [marca({ web: "https://wa.me/5491112345678" })] }),
    evento({ marcas: [marca({ urlFuente: "https://api.whatsapp.com/send?phone=5491112345678" })] }),
    evento({ urlFuente: "https://expo.example/contacto?tel=1145678901" }),
    evento({ marcas: [marca({ urlFuente: "https://expo.example/x?mail=juan%40gmail.com" })] }),
  ]) {
    const r = validarLote({ eventos: [malo] });
    assert.equal(r.ok, false, JSON.stringify(malo));
  }
  // Un id largo en la RUTA de la fuente no es un teléfono.
  assert.equal(validarLote({ eventos: [evento({ urlFuente: "https://diario.example/noticias/123456789/expo" })] }).ok, true);
});

test("cert A2: nombres de campo y valores disfrazados", () => {
  for (const k of ["e-mail", "e_mail", "emails", "telefonos", "phone", "celulares", "mobile", "contactoComercial", "whatsapp_url", "tel"]) {
    assert.equal(validarLote({ eventos: [evento({ [k]: "x" })] }).ok, false, k);
  }
  for (const v of ["11/4567/8901", "juan @ gmail.com", "juan(at)gmail.com", "11_4567_8901"]) {
    assert.equal(validarLote({ eventos: [evento({ organizador: v })] }).ok, false, v);
  }
  // Lo que no es de persona sigue entrando: «hotel», «cartel».
  assert.equal(validarLote({ eventos: [evento({ hotel: "Hotel Demo", cartel: "sí" })] }).ok, true);
});

test("cert A3: un evento rechazado por sus marcas no entra; el tope vale después de unir copias", () => {
  const r = validarLote({ eventos: [evento({ nombre: "Bueno" }), evento({ nombre: "Malo", marcas: "no" })] });
  assert.ok(r.ok && r.eventos.length === 1 && r.eventos[0].nombre === "Bueno");
  const muchas = (desde: number) => Array.from({ length: 150 }, (_, i) => marca({ nombre: `Marca ${desde + i}` }));
  const r2 = validarLote({ eventos: [evento({ marcas: muchas(0) }), evento({ marcas: muchas(150) })] });
  assert.ok(r2.ok && r2.eventos[0].marcas.length === 200);
});

test("cert A4: URL con espacios alrededor se guarda limpia (pasa el CHECK de la base)", () => {
  const r = validarLote({ eventos: [evento({ urlFuente: "  https://expo.example ", marcas: [marca({ urlFuente: "\thttps://expo.example/s" })] })] });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.match(r.eventos[0].urlFuente ?? "", /^https:\/\//);
  assert.match(r.eventos[0].marcas[0].urlFuente, /^https:\/\//);
});

test("cert A5: años seguidos y fechas con barra no son teléfonos", () => {
  assert.ok(!traeContacto("Expo 2026 2027 2028"));
  assert.ok(!traeContacto("Edición del 10/03/2027"));
});

test("tope de relaciones por lote", () => {
  const ev = Array.from({ length: 26 }, (_, i) => evento({ nombre: `E${i}`, marcas: Array.from({ length: 200 }, (_, j) => marca({ nombre: `M${j}` })) }));
  const r = validarLote({ eventos: ev });
  assert.equal(r.ok, false);
});

test("traeContacto: teléfonos disfrazados de fecha entran como teléfono (certificación en contra)", () => {
  for (const t of ["cel 1155-12-3456", "visto 2026-11-14T5491155123456", "llamar 11-55/12/3456", "nota 2027-55-12", "20262027", "2026-11-14 1155123456"]) assert.ok(traeContacto(t), t);
  for (const t of ["2025 (20-22/05/2025)", "2026-2027", "del 2026-11-14 al 2026-11-16", "2026-11-14T23:14:46Z", "10/03/2027", "edición 2026 2027"]) assert.ok(!traeContacto(t), t);
});

test("urlConContacto: un teléfono escondido después del # se rechaza; un ancla común no", () => {
  assert.ok(urlConContacto("https://x.example/#Juan cel 1155123456"));
  assert.ok(urlConContacto("https://x.example/sponsors#juan%40empresa.com"));
  assert.ok(!urlConContacto("https://x.example/sponsors#partners"));
});

test("validarPedido: la región y las fechas se eligen en cada encargo; el Descubridor va a Buenos Aires por defecto", () => {
  const def = validarPedido("descubridor", "Buscá ferias de alimentos");
  assert.ok(def.ok && def.region === "Buenos Aires" && def.desde === null && def.hasta === null);
  const cba = validarPedido("descubridor", "Buscá congresos", { region: "  Córdoba ", desde: "2027-03-01", hasta: "2027-05-31" });
  assert.ok(cba.ok && cba.region === "Córdoba" && cba.desde === "2027-03-01" && cba.hasta === "2027-05-31");
  const ver = validarPedido("verificador", "Revisá lo que quedó en duda");
  assert.ok(ver.ok && ver.region === null, "el Verificador no necesita región");
  assert.equal(validarPedido("descubridor", "Buscá ferias", { desde: "2027-05-10", hasta: "2027-05-01" }).ok, false);
  assert.equal(validarPedido("descubridor", "Buscá ferias", { desde: "2027-02-30" }).ok, false);
  assert.equal(validarPedido("descubridor", "Buscá ferias", { region: "Córdoba, llamar al 351 456 7890" }).ok, false);
  assert.equal(validarPedido("descubridor", "Buscá ferias", { region: "x".repeat(81) }).ok, false);
});

test("traeContacto: dos teléfonos seguidos, relleno, guiones largos e invisibles también cuentan (segunda certificación)", () => {
  for (const t of [
    "Juan 11 5512 3456 / 11 4433 2211",
    "+54 9 11 5512-3456 0000",
    "11 5512 3456 / 14-11-2026",
    "11–5512–3456",
    "11​5512​3456",
    "11·5512·3456",
    "11|5512|3456",
    "11,5512,3456",
    "１１５５１２３４５６",
  ]) assert.ok(traeContacto(t), t);
  for (const t of ["2025, 2026 y 2027", "Temporada 2026–2027", "precio $ 3.100.000", "Lollapalooza Argentina 2027 | 12, 13 y 14 de Marzo", "Pabellones 1, 2, 3, 4, 5, 6, 7 y 8", "ediciones 2015-2024", "(2016-2026)", "2019/2026", "12,500,000 visitantes", "$ 150.000.000", "14-11-2026", "14.11.2026", "de 10.00-18.00 hs"]) assert.ok(!traeContacto(t), t);
  assert.ok(urlConContacto("https://x.example/s#Juan 11 5512 3456 %"));
  assert.ok(urlConContacto("https://x.example/s#Juan%2011%205512%203456%"));
});

test("detector de teléfonos (tercera certificación): separadores con espacio e invisibles sí; ids y coordenadas de URL no", () => {
  for (const t of ["11⁦5512⁩3456", "11‪5512‬3456", "11 · 5512 · 3456", "11 | 5512 | 3456", "11 5512 3456 / 14-11-2026"]) assert.ok(traeContacto(t), t);
  assert.ok(urlConContacto("https://x.example/?1155123456"));
  assert.ok(urlConContacto("https://x.example/?tel=11%204567-8901"));
  for (const u of [
    "https://x.example/sponsors?_ga=2.123456789.987654321.1700000000",
    "https://www.facebook.com/profile.php?id=100012345678901",
    "https://maps.google.com/maps?q=-34.6037222,-58.3815704",
  ]) assert.ok(!urlConContacto(u), u);
  assert.ok(!traeContacto("ver https://maps.google.com/maps?q=-34.6037222,-58.3815704 y https://x.example/?_ga=2.123456789.987654321"));
});
