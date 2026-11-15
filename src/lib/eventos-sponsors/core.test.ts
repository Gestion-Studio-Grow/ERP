import { test } from "node:test";
import assert from "node:assert/strict";
import { claveEvento, claveMarca, esDia, esUrl, leerFiltros, leerLote, normalizar, rangoDeFechas, revisarUrl, rolDe, traeContacto, validarLote, validarPedido, diaADate } from "./core";

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

test("tope de relaciones por lote", () => {
  const ev = Array.from({ length: 26 }, (_, i) => evento({ nombre: `E${i}`, marcas: Array.from({ length: 200 }, (_, j) => marca({ nombre: `M${j}` })) }));
  const r = validarLote({ eventos: ev });
  assert.equal(r.ok, false);
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

// ── Datos de contacto: rechazar por defecto (contacto.ts) ────────────────────
// Cada teléfono de abajo lo encontró alguna de las 8 rondas de certificación en contra contra el diseño anterior
// (lista de formatos prohibidos). Con «rechazar por defecto» tienen que quedar todos afuera.

const TELEFONOS_Y_MAILS = [
  "+54 9 11 4567-8901", "(0351) 456-7890", "cel 1155-12-3456", "visto 2026-11-14T5491155123456", "llamar 11-55/12/3456",
  "nota 2027-55-12", "20262027", "2026-11-14 1155123456", "Juan 11 5512 3456 / 11 4433 2211", "11–5512–3456",
  "11​5512​3456", "11·5512·3456", "11|5512|3456", "11,5512,3456", "１１５５１２３４５６", "11⁦5512⁩3456",
  "Cel 11 5512-2030", "0800-555-2010", "(011) 4567-1999", "+54 9 11 2023 4567", "Tel 2025 4567", "11 55 12 34 56",
  "Fuente: https://x.example/?ref=1155123456", "ver https://x.example/#11-5512-3456", "https://x.example/?q=11·5512·3456",
  "Tel. 011.4567-8901", "Cel 15.4567-8901", "Tel/Fax: 011.4312-5566", "11.4567 8901", "Tel 351.423-4567",
  "Cel 11 5512 · 2030", "(011) 4567 | 2025", "(011) 2020-2021", "Tel 2024-2025", "WhatsApp: 2024 2025",
  "٠١١ ٤٥٦٧-٨٩٠١", "०११ ४५६७-८९०१", "(0351)-423.4567", "+54 (351)-423.4567", "https://expo.com.arTel:011-4567-8901",
  "https://expo.com.ar011-4567-8901", "Tel 351.423-2030", "Cel 351.423 2030", "Córdoba 351.423-2019", "351.423-45-67",
  "351.423 · 4567", "11_2030_4567", "4567*2030", "11 · 2030 · 4567", "11 | 2030 | 4567", "Tel 351.423-4567.",
  "Informes: Tel. 351.423-4567.", "Cel 351.423-4567, Juan", "Llamar al 351.423-4567.", "Cel 15.423-4567.",
  "Tel. 423-4567", "Tel 42-1234", "Tel 351.423/2030", "11.45.67.89.01", "juan_perez_11_5512_3456", "(011)-4567-8901",
  "Cel 11 5512, 3456", "Contacto: 2030-2031", "escribir a juan@empresa.com", "juan @ gmail.com", "juan(at)gmail.com",
  "juan(arroba)gmail.com", "juan%40gmail.com", "mailto:info@banco.com", "11/4567/8901", "11_4567_8901",
  // Certificación del diseño «rechazar por defecto» (15/11): texto crudo vs. guardado, corridas partidas, formas sin tope.
  "Expo Agro 4567\n8901", "La Rural 4567     8901", "cel 4567\n8901", "Rural 4567 - · - 8901", "Rural 11456 y 78901", "4567 hola 8901", "Entrada $ 11-4567-8901", "USD 1145678901", "1.145.678.901 visitantes", "Rural 1,145,678,901", "-11.45678901", "Rural -34.45678901, -58.15456789", "Salones 11, 456, 789, 01", "11-45-67-89-0-1", "Rural 1 1 4 5 6 7 8 9 0 1", "Expte. 11-4567-8901", "Ley 1145678901", "Matrícula 15-4567-8901", "CUIT 20-45678901-3", "Rural ❶❶ ❹❺❻❼ ❽❾⓿❶", "ver https://x.example/4567%0A8901", "ver https://x.example/4567/////8901", "ver https://x.example/precio$11-4567-8901", "ver https://x.example/1.145.678.901", "ver https://x.example/expediente-11-4567-8901", "ver https://x.example/1-1-4-5-6-7-8-9-0-1", "45% 67% 89% 01%", "4, 5, 6, 7, 8, 9, 0 y 1 de marzo",
  // Segunda certificación del diseño endurecido (15/11): palabras de teléfono abreviadas, unidad cerrada, invisibles, URLs.
  "Teléf. 2034-5678 hs", "Teléf. 421.234 Juan", "Telef. 2019-2031", "Telf 2034-5678", "Tél. 2034-5678", "Celu 2034-5678", "Whats 2034-5678", "WA 2034-5678", "Mov. 2034-5678", "Contacto 2034-5678", "421.234 Juan", "421,234 Juan", "421.234 personas", "Stand 421.234 visitantes", "421.234 - 567.890 Juan", "2034-5678ㅤ", "11ㅤ2019-2031", "Tel 4567-12 al 30 de mayo", "4567-12 al 30 de mayo", "11.23.12.30", "x -45.678901 y", "Olivars 456-789", "Exp. 2034-56789", "ISSN 4567-8901 Juan", "ver https://ferias.com:11456/78901", "ver http://4567.ar/8901", "ver https://expo४५६७८९०१.com/",
  // Tercera certificación (15/11): mails con «arroba/punto/at/dot», fechas y horas en pares, palabras, formas cortas.
  "Organiza Juan Pérez (juan.perez arroba gmail punto com)", "info arroba expo punto com punto ar", "juan.perez AT gmail DOT com", "josé @ gmail.com", "https://f.com/juan＠gmail.com", "15-30-12-34", "Ana 23-07-24", "Ana 21.45.32", "Ana 12:34:56", "Comuníquese al 23-07-24", "Número 2019-2031", "Nro 2019-2031", "Línea 2019-2031", "Escribí al 2019-2031", "Ana 4567, 12 y 30 de mayo", "Juan 421 – 56 – 12, 18 y 19 de noviembre", "Expte 11456, Ana 78901", "11.456 - 78.901 asistentes", "$ 11.456 / 78.901", "Expte 1145-67, Ana 8901", "Ley 785.887 de lunes a viernes", "Ana 28-29-07 en 2026", "La Rural · 30–10–11", "Juan 15.19 1974", "1960-241 sponsors",
  // Cuarta certificación (15/11, CERTIFICA) — observaciones cerradas igual: mails sin dominio o con «[@]», fechas de a pares.
  "juan@hotmail", "juan [@] gmail.com", "juan(a)gmail.com", "juan@gmail,com", "juan@gmail。com", "https://expo.example/contacto/juan%2540gmail.com", "Ana 21-02-20-02", "Juan 25-08-17/02", "Coordinadora: 30.11 12.05", "Ana 21/02 20/02", "Coordinadora: 21/02/20/02 Juan", "Ana 28-03-15-06",
];

const TEXTO_REAL_QUE_ENTRA = [
  "2027-03-10", "Temporada 2026-2027", "Temporada 2026–2027", "Expo Agro 2027", "Expo 2026 2027 2028", "Edición del 10/03/2027",
  "2025 (20-22/05/2025)", "del 2026-11-14 al 2026-11-16", "2026-11-14T23:14:46Z", "edición 2026 2027", "2025, 2026 y 2027",
  "Festival Demo 2027 | 12, 13 y 14 de Marzo", "Pabellones 1, 2, 3 y 4", "Pabellones 1 · 2 · 3",
  "ediciones 2015-2024", "(2016-2026)", "2019/2026", "14-11-2026", "14.11.2026", "de 10.00-18.00 hs", "Starts 11/14/2026",
  "Marca Demo · «19/11/2026 – 13:00 – 14:30 ... charla técnica»", "Relevado 2026-11-14 10:30", "Expo Demo 2027 (20-22/05) en el predio",
  "precio $ 3.100.000", "$ 150.000.000", "$ 150.000 - 200.000", "Entradas $ 15.000 - $ 25.000", "12,500,000 visitantes", "150.000 - 200.000 personas",
  "Asistentes 12.500 · ediciones 2015-2026", "$ 1.250,50", "Edición 5 · 2026", "En 2026: 1500 expositores", "2026 | 3500 stands",
  "CUIT 30-71234567-1", "CUIT 30712345671", "en -34.603722, -58.381570", "Resolución 1234/2025", "EXP-2026-0042",
  "ISBN 978-950-07-1234-7", "Matrícula 1234", "Stand 1210", "N.º 12", "Hall 4",
  "ver https://maps.example/expo-agro-2027 y https://x.example/2026/11/14/nota",
];

test("traeContacto: rechazar por defecto deja afuera cada teléfono y mail que encontraron las 8 rondas de certificación", () => {
  for (const t of TELEFONOS_Y_MAILS) assert.equal(traeContacto(t), true, t);
});

test("traeContacto: los años, fechas, horas, cantidades, importes, coordenadas y números declarados siguen entrando", () => {
  for (const t of TEXTO_REAL_QUE_ENTRA) assert.equal(traeContacto(t), false, t);
});

test("traeContacto: residuo aceptado — dos años crecientes sin palabra de teléfono entran como rango de años", () => {
  // Un fijo de 8 cifras con esa forma tendría que empezar con 19 o 20; los del AMBA empiezan con 4, 5 o 6.
  assert.equal(traeContacto("Juan 2019-2031"), false);
  assert.equal(traeContacto("Tel 2019-2031"), true, "con la palabra, no");
  assert.equal(traeContacto("Juan 2031-2019"), true, "decreciente no es rango");
});

test("traeContacto: rechazar de más se acepta (formas no declaradas)", () => {
  for (const t of ["Stand 1210/1211", "Entradas 15000-25000", "Entradas $ 15000-25000", "Matrícula 1234-5678", "1.250,50", "Pabellones 1, 2, 3, 4, 5, 6, 7 y 8", "CUIT 30-71234567-8", "ISBN 978-950-07-1234-5", "ISSN 1234-5679", "Telecom 2026 4567", "123.456 visitantes", "100% Demo Stand: K410 · 2026", "Del 3 al 5 de junio · 2027 · 12500 asistentes", "Hall 12.500 · 2026", "Expositores 1500 · 2026"]) assert.equal(traeContacto(t), true, t);
});

test("revisarUrl: enlaces de contacto y dominios con números no se guardan; ruta con números se guarda como dominio; sin query ni #", () => {
  for (const u of ["mailto:info@banco.com", "tel:+541145678901", "https://wa.me/5491112345678", "https://api.whatsapp.com/send?phone=5491112345678", "https://t.me/+5491155123456", "https://expo.example/x?mail=juan%40gmail.com", "https://11-5512-3456.example.com/", "https://200.45.123.45/expo"]) {
    const r = revisarUrl(u);
    assert.equal(r?.ok, false, u);
  }
  for (const u of ["https://diario.example/noticias/123456789/expo", "https://x.example/contacto/1145678901", "https://x.example/11.5512.3456", "https://x.example/eventos-011-4567-8901", "https://x.example/llamar/11-5512-3456", "https://x.example/juan-perez-1155123456"]) {
    assert.deepEqual(revisarUrl(u), { ok: true, url: `${new URL(u).origin}/`, soloDominio: true }, u);
  }
  assert.deepEqual(revisarUrl("https://x.example/sponsors?_ga=2.123456789&tel=1145678901#Juan 11 5512 3456"), { ok: true, url: "https://x.example/sponsors", soloDominio: false });
  for (const u of ["https://x.example/2026/11/14/expo-agro", "https://x.example/expo-agro-2027", "https://www.expo2027.com.ar/sponsors"]) {
    const r = revisarUrl(u);
    assert.equal(r?.ok === true && !r.soloDominio, true, u);
  }
  assert.equal(revisarUrl("javascript:alert(1)"), null);
});

test("validarLote: la fila con datos de contacto queda afuera con su motivo y SIN el dato; el resto entra", () => {
  const r = validarLote({
    eventos: [
      evento({ nombre: "Sano", marcas: [marca(), marca({ nombre: "Con Mail", email: "x@y.com" }), marca({ nombre: "info@banco.com" }), marca({ nombre: "Web Mailto", web: "mailto:info@banco.com" })] }),
      evento({ nombre: "Con organizador", organizador: "Cámara (tel 11 4567 8901)" }),
      evento({ nombre: "Con campo", contacto: "Juan" }),
      evento({ nombre: "Con fuente WhatsApp", urlFuente: "https://wa.me/5491112345678" }),
      evento({ nombre: "Con fuente numerada", urlFuente: "https://diario.example/noticias/123456789?tel=1145678901" }),
    ],
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.eventos.map((e) => e.nombre), ["Sano", "Con fuente numerada"]);
  assert.deepEqual(r.eventos[0].marcas.map((m) => m.nombre), ["Banco Uno"]);
  assert.equal(r.eventos[1].urlFuente, "https://diario.example/");
  const texto = JSON.stringify(r.rechazos);
  for (const dato of ["x@y.com", "info@banco.com", "4567 8901", "5491112345678", "Juan"]) assert.ok(!texto.includes(dato), `el motivo no repite «${dato}»`);
  assert.ok(r.rechazos.some((x) => x.donde === "evento 2" && /organizador/.test(x.motivo)), texto);
  assert.ok(r.rechazos.some((x) => /sólo el dominio/.test(x.motivo)), texto);
});

test("validarLote: nombres de campo de contacto dejan afuera la fila; «hotel» y «cartel» no", () => {
  for (const k of ["e-mail", "e_mail", "emails", "telefonos", "phone", "celulares", "mobile", "contactoComercial", "whatsapp_url", "tel"]) {
    const r = validarLote({ eventos: [evento({ nombre: "Sano" }), evento({ nombre: "Con campo", [k]: "x" })] });
    assert.equal(r.ok && r.eventos.length, 1, k);
  }
  assert.equal(validarLote({ eventos: [evento({ hotel: "Hotel Demo", cartel: "sí" })] }).ok, true);
});

test("validarLote: un teléfono partido entre dos campos de la fila la deja afuera; la altura de la calle no", () => {
  const r = validarLote({ eventos: [evento({ nombre: "Expo 4567", lugar: "Ana 8901" }), evento({ nombre: "Torneo Demo 2027 (categoría 250)", lugar: "Calle Demo 1510, CABA" })] });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.eventos.map((e) => e.nombre), ["Torneo Demo 2027 (categoría 250)"]);
  assert.ok(r.rechazos.some((x) => /entre sus campos/.test(x.motivo) && !/4567|8901/.test(JSON.stringify(x))));
});

test("validarLote: el «·» con que se unen los campos no arma un año y una cifra", () => {
  const r = validarLote({ eventos: [evento({ nombre: "Feria 4567 en 2026", lugar: "8901 expositores" })] });
  assert.equal(r.ok, false);
});

test("validarPedido: un teléfono partido entre el pedido y la región no entra", () => {
  assert.equal(validarPedido("descubridor", "Buscá ferias 4567", { region: "Zona 8901" }).ok, false);
  assert.equal(validarPedido("descubridor", "Buscá ferias de 2027", { region: "Córdoba" }).ok, true);
});

test("validarLote: una línea del registro con un teléfono no se guarda y se cuenta", () => {
  const linea = (detalle: string) => ({ puesto: "descubridor", accion: "Encontró el evento", hora: "2026-11-14T10:00:00Z", detalle });
  const r = validarLote({ eventos: [evento({ registro: [linea("Visto en la web oficial 2027"), linea("Llamé al 11 4567 8901")] })] });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.eventos[0].registro.map((l) => l.detalle), ["Visto en la web oficial 2027"]);
  assert.ok(r.rechazos.some((x) => /1 línea/.test(x.motivo)));
});
