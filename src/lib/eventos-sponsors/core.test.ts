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

test("detector de teléfonos (cuarta certificación): años pegados a un teléfono, URLs dentro del texto y query con letras", () => {
  for (const t of ["Cel 11 5512-2030", "0800-555-2010", "(011) 4567-1999", "+54 9 11 2023 4567", "Tel 2025 4567", "Fuente: https://x.example/?ref=1155123456", "ver https://x.example/#11-5512-3456"]) assert.ok(traeContacto(t), t);
  for (const u of ["https://x.example/?q=llamar+al+11+5512-3456", "https://x.example/?q=11·5512·3456", "https://x.example/?q=11.5512.3456"]) assert.ok(urlConContacto(u), u);
  for (const t of ["CUIT 30-71234567-8", "en -34.603722, -58.381570", "2025 (20-22/05/2025)", "Temporada 2026-2027"]) assert.ok(!traeContacto(t), t);
  for (const u of ["https://x.example/nota?id=12345678", "https://x.example/agenda?fecha=20261114"]) assert.ok(!urlConContacto(u), u);
});

test("detector de teléfonos: texto real que tiene que entrar (horarios, fechas US, CUIT, seguimiento, ids)", () => {
  for (const t of ["Biodiagnostico · «19/11/2026 – 13:00 – 14:30 ... From QC Materials»", "Relevado 2026-11-14 10:30", "Starts 11/14/2026", "CUIT 30712345678", "Pabellones 1 · 2 · 3 · 4 · 5 · 6 · 7 · 8"]) assert.ok(!traeContacto(t), t);
  for (const u of ["https://expo.example/?_ga=2.123456789.1234567890.1698765432-987654321.1698765432", "https://www.linkedin.com/jobs/view/?currentJobId=3712345678"]) assert.ok(!urlConContacto(u), u);
  assert.ok(traeContacto("11 55 12 34 56"), "de a pares también es teléfono");
});

test("detector de teléfonos (quinta certificación): característica con punto, separadores «·|*», dos años, ruta de URL y otras escrituras", () => {
  for (const t of [
    "Tel. 011.4567-8901", "Cel 15.4567-8901", "Tel/Fax: 011.4312-5566", "11.4567 8901", "Tel 351.423-4567",
    "Cel 11 5512 · 2030", "(011) 4567 | 2025",
    "(011) 2020-2021", "Tel 2024-2025", "Tel 2025/2026", "WhatsApp: 2024 2025",
    "٠١١ ٤٥٦٧-٨٩٠١", "०११ ४५६७-८९०१",
  ]) assert.equal(traeContacto(t), true, t);
  for (const u of [
    "https://expo.example/?q=11.4567-8901", "https://t.me/+5491155123456", "https://expo.example/contacto/1145678901",
    "https://expo.example/Tel.011-4567-8901", "https://expo.example/whatsapp-11-5512-3456",
  ]) assert.equal(urlConContacto(u), true, u);
  assert.equal(traeContacto("Web: https://expo.example/Tel.011-4567-8901"), true);
  // Lo que tiene que seguir entrando.
  for (const t of [
    "Coordenadas -34.603722, -58.381592", "Asistentes 12.500 · ediciones 2015-2026", "Presentes 2027 (20-22/05) en La Rural",
    "Edición 5 · 2026", "Hotel 2026-2027 sede", "Excel 2025 2026", "$ 150.000 - 200.000", "150.000 - 200.000 personas",
  ]) assert.equal(traeContacto(t), false, t);
  for (const u of ["https://expo.example/noticias/12345678", "https://expo.example/celebracion/2026/12345678", "https://expo.example/hotel-2026-12345678"])
    assert.equal(urlConContacto(u), false, u);
});

test("detector de teléfonos (quinta certificación): coma con espacio si nombra un teléfono, ruta y host con forma de teléfono", () => {
  assert.equal(traeContacto("Cel 11 5512, 3456"), true);
  assert.equal(traeContacto("Pabellones 12, 13 y 14 · edición 2026"), false);
  for (const u of ["https://x.example/llamar/11-5512-3456", "https://x.example/a/11-5512-3456", "https://11-5512-3456.example.com/"])
    assert.equal(urlConContacto(u), true, u);
  for (const u of ["https://x.example/2026/11/14/nota", "https://x.example/expo-2026-1-2", "https://x.example/12345678901"])
    assert.equal(urlConContacto(u), false, u);
});

test("detector de teléfonos (sexta certificación): paréntesis antes del guion, URL pegada a un teléfono, rutas de contacto y textos largos", () => {
  for (const t of ["(0351)-423.4567", "Tel (0351)-423.4567", "+54 (351)-423.4567", "https://expo.com.arTel:011-4567-8901", "https://expo.com.ar,Tel:011-4567-8901", "https://expo.com.ar011-4567-8901"])
    assert.equal(traeContacto(t), true, t);
  for (const u of ["https://x.example/contacto-11-5512-3456", "https://x.example/phone/1145678901", "https://x.example/11_5512_3456", "https://x.example/contactanos/1145678901"])
    assert.equal(urlConContacto(u), true, u);
  // Lo que tiene que seguir entrando.
  for (const t of ["En 2026: 1500 expositores", "2026 | 3500 stands", "1990-2026: 36 años", "Del 3 al 5 de junio · 2027 · 12500 asistentes", "Expo Móvil 2026, 10, 11, 12, 13 de agosto", "Expo Tel Aviv 2026: halls 10, 11, 12, 13", "Stands 10, 12, 14, 16 · consultas por WhatsApp"])
    assert.equal(traeContacto(t), false, t);
  for (const u of ["https://x.example/noticias/20261114-123456", "https://x.example/p/12345-67890", "https://x.example/v/1.2.3456789"])
    assert.equal(urlConContacto(u), false, u);
  // Un texto enorme no traba y un teléfono en el medio se encuentra igual.
  const largo = "Expo 2027 ".repeat(4000);
  const inicio = Date.now();
  assert.equal(traeContacto(largo), false);
  assert.equal(traeContacto(largo + " Cel 11 5512 3456 " + largo), true);
  assert.equal(traeContacto("1".repeat(40_000).replace(/1/g, (_, i: number) => (i % 3 ? "1" : " "))), true);
  assert.ok(Date.now() - inicio < 3_000, `tardó ${Date.now() - inicio} ms`);
});

test("detector de teléfonos (sexta certificación, ajustes): miles con «·» o «/», WhatsApp en la ruta y listas que no son teléfonos", () => {
  for (const t of ["351.423 · 4567", "351.423/4567", "Cel 11 5512 · 2030", "(011) 2020-2021", "+54 (11) 2020-2021", "Tel (11) 2030-2031"]) assert.equal(traeContacto(t), true, t);
  assert.equal(urlConContacto("https://expo.com.ar/WhatsApp/5491155123456"), true);
  for (const t of ["Salones 101, 102, 103 (info por tel)", "Edición 2025-2026 · 2026-2027", "Hall 4 · 2026 · 4567 visitantes", "Hall 12.500 · 2026"])
    assert.equal(traeContacto(t), false, t);
});

test("detector de teléfonos (séptima certificación): miles seguidos de un año, palabra de teléfono lejos en un texto largo y costo acotado", () => {
  for (const t of ["Tel 351.423-2030", "Cel 351.423 2030", "Tel. 341.423-2025", "Córdoba 351.423-2019", "Teléfono " + "a".repeat(1500) + " 4567, 8901"])
    assert.equal(traeContacto(t), true, t.slice(0, 40));
  assert.equal(traeContacto("Hall 12.500 · 2026"), false);
  const inicio = Date.now();
  assert.equal(traeContacto("a".repeat(40_000)), false);
  assert.equal(traeContacto("a".repeat(20_000) + " juan@x.com " + "a".repeat(20_000)), true);
  assert.ok(Date.now() - inicio < 3_000, `tardó ${Date.now() - inicio} ms`);
});

test("detector de teléfonos (séptima certificación, menores): pares, guion bajo, teléfono dentro de la ruta y falsos positivos de URL", () => {
  for (const t of ["351.423-45-67", "11_2030_4567", "11 · 5512 · 2030"]) assert.equal(traeContacto(t), true, t);
  for (const u of ["https://expo.com.ar/eventos-011-4567-8901", "https://expo.com.ar/11.5512.3456", "https://expo.com.ar/eventos)011-4567-8901"])
    assert.equal(urlConContacto(u), true, u);
  for (const u of ["https://www.expo.com.ar/llamado-a-expositores/20261114", "https://compras.gob.ar/llamado-licitacion-publica-2051-1234-lpu26", "https://200.45.123.45/expo", "https://expo.com.ar/contactless/123456789"])
    assert.equal(urlConContacto(u), false, u);
  for (const t of ["Expositores 1500 · 2026", "Visitantes 25000 | 2026"]) assert.equal(traeContacto(t), false, t);
  // Un corte de trozo no parte una URL, un CUIT ni una coordenada.
  for (let n = 900; n <= 1_000; n += 7) {
    const relleno = "Expo ".repeat(Math.floor(n / 5));
    for (const cola of [" https://expo.example/noticias/123456789012 fin", " CUIT 30-71234567-8 fin", " -34.603722, -58.381592 fin"])
      assert.equal(traeContacto(relleno + cola + " " + relleno), false, `${n}${cola}`);
  }
});
