// QA · recorrido de punta a punta de «Supermercado La Esquina» contra el servidor real (next start),
// con la conexión de la app sujeta a RLS (app_rls), en la copia del laboratorio (erp_super_qa).
//
//   A · 1440 px, dueño: abrir la caja, cargar dos promos, venta de 15 renglones (3 etiquetas de
//       balanza, 2 con promo, un código con verificador malo, un renglón anulado), cobro con dos
//       medios, la venta en Ventas del día.
//   B · 1440 px, dueño: proveedor, su lista de precios, precios por margen sobre esa lista, carteles.
//   C · 1440 y 390 px, cliente: la vidriera con ofertas, pedido online con la oferta aplicada.
//   E · 390 px, dueño: las pantallas nuevas sin salirse de la pantalla.
//   D · 390 px, cajera: anular un renglón pide la clave del encargado; cobro en efectivo con vuelto.
//   F · cierre del día (1440, dueño) con las dos ventas; después, la caja con lector ya no cobra hoy.
//
// Falla ante cualquier error de consola del navegador. Uso:
//   CLAVE_DUENIO=... CLAVE_CAJERA=... node 03-recorrido.mjs <baseHost> <outDir>
// <baseHost> es el del negocio (http://super.localhost:3254). Las claves no se escriben en la evidencia.
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.argv[2] ?? "http://super.localhost:3254";
const OUT = process.argv[3] ?? "./capturas";
fs.mkdirSync(OUT, { recursive: true });
const DUENIO = { email: "duenio@super-la-esquina.test", clave: process.env.CLAVE_DUENIO ?? "" };
const CAJERA = { email: "cajera@super-la-esquina.test", clave: process.env.CLAVE_CAJERA ?? "" };
const pasos = [];
const errores = [];
const medidas = {};
const paso = (t) => {
  pasos.push(t);
  console.log("·", t);
};

// EAN-13 de balanza: 20 + PLU (5) + gramos (5) + verificador GS1.
function verificador(cuerpo) {
  let s = 0;
  for (let i = 0; i < cuerpo.length; i++) s += Number(cuerpo[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (s % 10)) % 10;
}
const etiqueta = (plu, kg) => {
  const c = `20${plu}${String(Math.round(kg * 1000)).padStart(5, "0")}`;
  return `${c}${verificador(c)}`;
};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

async function nuevaPagina(ancho, alto, nombre) {
  const ctx = await browser.newContext({ viewport: { width: ancho, height: alto } });
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") errores.push(`[${nombre}] consola: ${m.text().slice(0, 300)}`);
  });
  page.on("pageerror", (e) => errores.push(`[${nombre}] página: ${String(e).slice(0, 300)}`));
  page.on("dialog", (d) => d.accept());
  return { ctx, page };
}
const foto = (page, n) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: false });
const fotoLarga = (page, n) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true });
const sinDesborde = async (page, donde) => {
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  const vw = page.viewportSize().width;
  medidas[`ancho-${donde}`] = { scrollWidth: w, viewport: vw };
  if (w > vw + 1) throw new Error(`${donde}: la página se sale de la pantalla (${w}px > ${vw}px)`);
};

async function entrar(page, u) {
  await page.goto(`${BASE}/admin/login`);
  await page.fill('input[name="email"]', u.email);
  await page.fill('input[name="password"]', u.clave);
  await Promise.all([page.waitForURL((url) => !/\/admin\/login/.test(url.pathname), { timeout: 30000 }), page.click('button[type="submit"]')]);
}

async function leer(page, codigo) {
  const campo = page.locator("#lector");
  await campo.fill(codigo);
  await campo.press("Enter");
  // El foco vuelve solo al campo del lector.
  await page.waitForFunction(() => document.activeElement?.id === "lector", null, { timeout: 5000 });
}

const pesos = (t) => Number(String(t).replace(/[^\d,-]/g, "").replace(/\./g, "").replace(",", "."));

try {
  // ───────────────────────── A · la caja con lector (1440, dueño) ─────────────────────────
  const { page } = await nuevaPagina(1440, 900, "dueño 1440");
  await entrar(page, DUENIO);
  await page.waitForLoadState("networkidle");
  await page.waitForSelector("text=Caja con lector", { timeout: 20000 }).catch(() => {});
  await foto(page, "A01-inicio");
  const inicio = await page.textContent("body");
  for (const app of ["Caja con lector", "Ofertas"]) if (!inicio.includes(app)) throw new Error(`el Inicio no muestra «${app}»`);
  paso("dueño entra; el Inicio muestra Caja con lector y Ofertas");

  // Abrir la caja (turno) con $20.000 de fondo.
  await page.goto(`${BASE}/admin/caja`);
  if (await page.locator("#openingFloat").count()) {
    await page.fill("#openingFloat", "20.000");
    await page.getByRole("button", { name: "Abrir caja" }).click();
    const si = page.getByRole("button", { name: "Sí, abrir caja" });
    if (await si.isVisible({ timeout: 2000 }).catch(() => false)) await si.click();
    await page.waitForFunction(() => !document.querySelector("#openingFloat"), null, { timeout: 15000 });
  }
  await foto(page, "A02-caja-abierta");
  paso("caja abierta con $20.000 de fondo");

  // Dos promos desde Ofertas.
  async function nuevaPromo(nombre, tipo, llenar, buscar, producto) {
    await page.goto(`${BASE}/admin/ofertas`);
    await page.click('[data-ofertas="nueva"]');
    const form = page.locator('form[aria-label="Promo"]');
    await form.getByPlaceholder("2×1 en Coca-Cola 2,25 L").fill(nombre);
    await form.locator("select").first().selectOption(tipo);
    await llenar(form);
    await form.getByText("Sumar un producto (nombre o código)").locator("..").locator("input").fill(buscar);
    await form.getByRole("button", { name: producto, exact: true }).click();
    await form.getByRole("button", { name: "Guardar la promo" }).click();
    await page.waitForSelector(`ul[aria-label="Promos"] >> text=${nombre}`, { timeout: 15000 });
  }
  await nuevaPromo(
    "2×1 Coca-Cola 2,25 L",
    "nxm",
    async (f) => {
      await f.getByText("Lleva").locator("..").locator("input").fill("2");
      await f.getByText("Paga", { exact: true }).locator("..").locator("input").fill("1");
    },
    "coca-cola 2,25",
    "Gaseosa Coca-Cola 2,25 L",
  );
  await nuevaPromo(
    "2ª al 50 % Magistral limón",
    "segunda-unidad",
    async (f) => {
      await f.getByText("Descuento en la segunda unidad (%)").locator("..").locator("input").fill("50");
    },
    "magistral limon",
    "Detergente Magistral limón 500 ml",
  );
  await foto(page, "A03-ofertas");
  paso("dos promos cargadas en Ofertas: 2×1 Coca-Cola 2,25 L y 2.ª unidad al 50 % en Magistral limón");

  // La venta.
  await page.goto(`${BASE}/admin/caja-rapida`);
  await page.waitForSelector("#lector");
  const esFoco = await page.evaluate(() => document.activeElement?.id === "lector");
  if (!esFoco) throw new Error("al abrir la caja el foco no está en el campo del lector");
  // Un código de balanza con el verificador cambiado: se rechaza y no entra nada.
  const buena = etiqueta("00209", 0.348);
  const mala = buena.slice(0, 12) + String((Number(buena[12]) + 1) % 10);
  await leer(page, mala);
  const aviso = await page.locator('p[role="alert"]').textContent();
  if (!aviso || !/verificador|dígito|no se pudo leer/i.test(aviso)) throw new Error(`el verificador malo no avisó: «${aviso}»`);
  if (await page.locator('[data-caja="renglon"]').count()) throw new Error("el código con verificador malo agregó un renglón");
  await foto(page, "A04-verificador-malo");
  paso(`etiqueta de balanza con verificador malo: rechazada («${aviso.trim()}»)`);

  await leer(page, "2*");
  await leer(page, "7791527000132"); // Coca-Cola 2,25 L ×2 → 2×1
  await leer(page, "2*7792052000130"); // Magistral limón ×2 → 2.ª al 50 %
  await leer(page, buena); // Queso cremoso 0,348 kg (balanza)
  await leer(page, etiqueta("00201", 0.25)); // Jamón cocido natural 0,250 kg (balanza)
  await leer(page, etiqueta("00101", 1.234)); // Papa 1,234 kg (balanza)
  for (const c of [
    "7791149000268", // Aceite Natura 900 ml
    "7791198000134", // Arroz Gallo Oro 1 kg
    "7791177000131", // Fideos tallarín Lucchetti
    "7791422000138", // Oreo
    "7791800000262", // Leche sachet
    "7792045000130", // Lavandina Ayudín 2 L
    "7791156000138", // Aceite Cocinero 1,5 L
    "7791177000391", // Fideos spaghetti
    "7791408000398", // Rumba
    "7791527000521", // Coca lata
    "7791408000268", // Chocolinas (se anula)
  ]) {
    await leer(page, c);
  }
  let renglones = await page.locator('[data-caja="renglon"]').count();
  if (renglones !== 16) throw new Error(`el ticket tiene ${renglones} renglones, se esperaban 16`);
  // Anular las Chocolinas (el dueño anula sin otra clave).
  await page.getByRole("button", { name: "Anular Galletitas Chocolinas 170 g" }).click();
  await page.locator('[role="dialog"]').getByRole("button", { name: /Anular/ }).first().click();
  await page.waitForFunction(() => document.querySelectorAll('[data-caja="renglon"]').length === 15, null, { timeout: 10000 });
  renglones = 15;
  const totalTxt = await page.locator('[data-caja="total"]').textContent();
  const total = pesos(totalTxt);
  medidas.totalVenta = total;
  if (Math.abs(total - 39989.18) > 0.001) throw new Error(`el total es ${totalTxt}, se esperaba $39.989,18`);
  await fotoLarga(page, "A05-ticket-15-renglones");
  paso(`ticket de 15 renglones (3 de balanza, 2 con promo, Chocolinas anulada): total ${totalTxt.trim()}`);

  // Cobro: $20.000 en efectivo y el resto por Mercado Pago.
  await page.fill('[data-caja="monto-0"]', "20.000");
  await page.click('[data-caja="otro-medio"]');
  await page.locator('[role="radiogroup"][aria-label="Medio 2"]').getByRole("radio", { name: "Mercado Pago" }).click();
  await foto(page, "A06-dos-medios");
  await page.click('[data-caja="cobrar"]');
  await page.waitForSelector('[data-caja="cobrada"]', { timeout: 30000 });
  const cobrada = await page.locator('[data-caja="cobrada"]').textContent();
  for (const t of ["2×1 Coca-Cola 2,25 L", "Magistral limón", "Ahorraste", "Efectivo", "Mercado Pago"]) {
    if (!cobrada.includes(t)) throw new Error(`el ticket no dice «${t}»`);
  }
  const codigoVenta = /Venta #(\d+)/.exec(cobrada)?.[1];
  medidas.ventaCaja = codigoVenta;
  await fotoLarga(page, "A07-ticket-cobrado");
  paso(`venta #${codigoVenta} cobrada con efectivo y Mercado Pago; el ticket muestra las promos y el ahorro`);

  await page.goto(`${BASE}/admin/ventas`);
  await page.waitForSelector(`text=#${codigoVenta}`);
  await foto(page, "A08-ventas-del-dia");
  paso("la venta aparece en Ventas del día");

  // ───────────────────── B · proveedor, lista, margen y carteles (1440) ─────────────────────
  await page.goto(`${BASE}/admin/proveedores`);
  await page.waitForLoadState("networkidle");
  // Sin proveedores, la pantalla ya muestra el alta; con el diseño nuevo, se abre con «Nuevo proveedor».
  if ((await page.locator('input[name="name"]:visible').count()) === 0) {
    await page.getByRole("link", { name: "Nuevo proveedor" }).first().click();
  }
  await page.locator('input[name="name"]:visible').first().fill("Distribuidora Norte SA");
  await page.getByRole("button", { name: "Dar de alta" }).click();
  await page.waitForSelector("text=Distribuidora Norte SA", { timeout: 15000 });
  paso("proveedor «Distribuidora Norte SA» dado de alta");

  await page.goto(`${BASE}/admin/compras/listas`);
  await page.locator("textarea").fill(
    [
      "7791527000132;Coca-Cola 2,25 L;3.200",
      "7791527000521;Coca-Cola lata 354 ml;1.000",
      "7791149000268;Aceite Natura 900 ml;1.900",
      "7791198000134;Arroz Gallo Oro 1 kg;1.750",
      "7791177000131;Fideos tallarín Lucchetti 500 g;950",
    ].join("\n"),
  );
  await page.waitForSelector("text=5 renglones leídos");
  await foto(page, "B01-lista-comparada");
  await page.getByRole("button", { name: "Guardar la lista" }).click();
  await page.waitForSelector("text=/Se guardó la lista de Distribuidora Norte SA: 5 productos/");
  paso("lista de precios del proveedor pegada, comparada y guardada (5 productos)");

  await page.goto(`${BASE}/admin/catalogo/precios`);
  await page.getByText("De un proveedor", { exact: true }).click();
  await page.locator('select[id$="-proveedor"]').selectOption({ label: "Distribuidora Norte SA (5)" });
  await page.getByText("Margen sobre el costo", { exact: true }).click();
  await page.locator('input[id$="-pct"]').fill("45");
  await page.waitForSelector("text=/5 cambian/");
  await foto(page, "B02-margen-vista-previa");
  await page.getByRole("button", { name: /^Aplicar 5 cambios$/ }).click();
  const confirmar = page.getByRole("button", { name: "Sí, aplicar el margen" });
  if (await confirmar.isVisible({ timeout: 2000 }).catch(() => false)) await confirmar.click();
  await page.waitForSelector("text=/Listo: 5 precios cambiados \\(margen del 45 % sobre el costo\\)/", { timeout: 20000 });
  await foto(page, "B03-margen-aplicado");
  paso("precios por margen del 45 % sobre la lista del proveedor: vista previa de 5 y aplicados");

  await page.goto(`${BASE}/admin/catalogo/etiquetas`);
  await page.getByRole("button", { name: /Cambiaron de precio \(5\)/ }).click();
  // El filtro de los carteles usa las secciones del salón (el rubro las declara), no las de la carnicería.
  const opciones = await page.locator('select[id$="-gondola"] option').allTextContents();
  medidas.filtroDeCarteles = opciones;
  if (!opciones.includes("Bebidas") || opciones.includes("Vaca")) throw new Error(`el filtro de carteles no son las secciones del súper: ${opciones.join(", ")}`);
  await page.getByRole("button", { name: "Tildar los 5" }).click();
  const doc = await page.locator('iframe[title="Vista de impresión de las etiquetas"]').getAttribute("srcdoc");
  for (const t of ["el litro", "7791527000132", "2×1", "el kg"]) if (!doc.includes(t)) throw new Error(`el cartel no trae «${t}»`);
  fs.writeFileSync(`${OUT}/B04-carteles.html`, doc);
  await foto(page, "B04-carteles");
  await page.getByRole("button", { name: /Imprimir 5 etiquetas/ }).click();
  await page.waitForSelector("text=/Se mandaron 5 etiquetas/", { timeout: 15000 });
  paso("5 carteles con precio, precio por litro o kilo, código y la promo; mandados a imprimir");

  // ───────────────────── C · la vidriera y el pedido online (1440 y 390) ─────────────────────
  for (const [ancho, alto, n] of [
    [1440, 900, "C1440"],
    [390, 844, "C390"],
  ]) {
    const { page: t, ctx } = await nuevaPagina(ancho, alto, `cliente ${ancho}`);
    await t.goto(`${BASE}/tienda`);
    await t.waitForSelector("#ofertas");
    const ofertas = await t.locator("#ofertas").textContent();
    for (const x of ["Ofertas de la semana", "2×1", "Coca-Cola 2,25"]) if (!ofertas.includes(x)) throw new Error(`${n}: la vidriera no muestra «${x}»`);
    await sinDesborde(t, `${n}-vidriera`);
    await foto(t, `${n}-01-vidriera`);
    const secciones = await t.locator('[role="group"][aria-label="Secciones"]').textContent();
    for (const s of ["Almacén", "Bebidas", "Limpieza", "Verdulería"]) if (!secciones.includes(s)) throw new Error(`${n}: falta la sección ${s}`);
    // Precio por litro al lado del precio (ley de góndolas).
    const conLitro = await t.locator("text=/el litro/").count();
    if (conLitro === 0) throw new Error(`${n}: ningún producto muestra el precio por litro`);
    if (ancho === 1440) {
      const sumarCoca = () => t.locator("#ofertas").getByRole("button", { name: /^Sumar .* Gaseosa Coca-Cola 2,25 L$/ }).first().click();
      await sumarCoca();
      await sumarCoca();
      await t.fill('input[type="search"]', "papa");
      await t.waitForTimeout(300);
      await t.locator("#carta").getByRole("button", { name: /^Sumar .* Papa$/ }).first().click();
      const bolsa = await t.locator("#pedido").textContent();
      if (!/Oferta · 2×1 Coca-Cola 2,25 L/.test(bolsa)) throw new Error("la bolsa no muestra la oferta aplicada");
      await foto(t, `${n}-02-bolsa-con-oferta`);
      await t.fill('input[name="customerName"]', "Marta Online");
      await t.fill('input[name="customerPhone"]', "11 5555 0101");
      await t.getByRole("radio", { name: "Retiro en el local" }).check();
      await Promise.all([t.waitForURL(/\/tienda\/gracias/, { timeout: 30000 }), t.getByRole("button", { name: /^Enviar pedido/ }).click()]);
      await foto(t, `${n}-03-gracias`);
      medidas.pedidoOnline = new URL(t.url()).searchParams.get("pedido");
      paso(`pedido online #${medidas.pedidoOnline}: 2 Coca-Cola con el 2×1 en la bolsa, 250 g de papa, retiro en el local`);
    } else {
      await t.getByRole("button", { name: "Limpieza" }).first().click();
      await t.waitForTimeout(300);
      await sinDesborde(t, `${n}-limpieza`);
      await foto(t, `${n}-02-seccion-limpieza`);
      paso("vidriera a 390 px: ofertas, secciones y precio por litro sin salirse de la pantalla");
    }
    await ctx.close();
  }

  // El pedido en la bandeja del dueño.
  await page.goto(`${BASE}/admin/pedidos`);
  await page.waitForSelector(`text=#${medidas.pedidoOnline}`, { timeout: 15000 });
  await foto(page, "C04-bandeja-con-el-pedido");
  paso("el pedido online llega a la bandeja de pedidos");

  // ───────────────────── E · las pantallas nuevas del dueño a 390 px ─────────────────────
  {
    const { page: d, ctx } = await nuevaPagina(390, 844, "dueño 390");
    await entrar(d, DUENIO);
    for (const [ruta, n] of [
      ["/admin/ofertas", "E01-ofertas-390"],
      ["/admin/compras/listas", "E02-listas-390"],
      ["/admin/caja-rapida/configuracion", "E03-lector-y-balanza-390"],
      ["/admin/catalogo/precios", "E04-precios-390"],
    ]) {
      await d.goto(`${BASE}${ruta}`);
      await d.waitForLoadState("networkidle");
      await sinDesborde(d, n);
      await foto(d, n);
    }
    await ctx.close();
    paso("Ofertas, Listas de proveedores, Lector y balanza y Precios a 390 px sin salirse de la pantalla");
  }

  // ───────────────────── D · la cajera a 390 px ─────────────────────
  const { page: m } = await nuevaPagina(390, 844, "cajera 390");
  await entrar(m, CAJERA);
  await m.goto(`${BASE}/admin/caja-rapida`);
  await m.waitForSelector("#lector");
  await leer(m, "7791527000521");
  await leer(m, "7791408000268");
  await m.getByRole("button", { name: "Anular Galletitas Chocolinas 170 g" }).click();
  const dlg = m.locator('[role="dialog"]');
  if (!(await dlg.textContent()).includes("Tiene que autorizar el encargado")) throw new Error("a la cajera no le pide la clave del encargado");
  await dlg.getByRole("textbox", { name: "Mail del encargado" }).fill(DUENIO.email);
  await dlg.locator('input[type="password"]').fill("una-clave-mala");
  await dlg.getByRole("button", { name: /Anular/ }).first().click();
  await dlg.locator('p[role="alert"]').waitFor({ timeout: 10000 });
  const rechazo = await dlg.locator('p[role="alert"]').textContent();
  if (!/no son correctos/.test(rechazo)) throw new Error(`clave mala: «${rechazo}»`);
  await foto(m, "D01-clave-mala");
  await dlg.locator('input[type="password"]').fill(DUENIO.clave);
  await dlg.getByRole("button", { name: /Anular/ }).first().click();
  await m.waitForSelector("text=/Se anuló «Galletitas Chocolinas 170 g». Autorizó/", { timeout: 10000 });
  paso("cajera a 390 px: anular un renglón pide mail y clave del encargado; con la clave mala no anula, con la buena sí");
  await m.fill('[data-caja="monto-0"]', "2.000");
  await m.waitForSelector('[data-caja="vuelto"]');
  const vuelto = await m.locator('[data-caja="vuelto"]').textContent();
  await sinDesborde(m, "D-caja-390");
  await foto(m, "D02-vuelto");
  await m.click('[data-caja="cobrar"]');
  await m.waitForSelector('[data-caja="cobrada"]', { timeout: 30000 });
  await sinDesborde(m, "D-cobrada-390");
  await fotoLarga(m, "D03-cobrada-390");
  paso(`cajera cobra en efectivo con $2.000: ${vuelto.trim()}`);
  // Los toques del cobro miden 44 px o más.
  const chicos = await m.evaluate(() =>
    [...document.querySelectorAll('aside[aria-label="Cobro"] button, aside[aria-label="Cobro"] input')]
      .filter((e) => e.offsetParent !== null)
      .map((e) => ({ t: (e.textContent || e.getAttribute("aria-label") || e.id || "").trim().slice(0, 30), h: e.getBoundingClientRect().height }))
      .filter((x) => x.h < 43.5),
  );
  medidas.toquesChicosEnCobro390 = chicos;
  if (chicos.length) throw new Error(`toques de menos de 44 px en el cobro: ${JSON.stringify(chicos)}`);
  paso("en el cobro a 390 px todos los toques miden 44 px o más");
  // Cierre del día: se declara lo que dice el libro en cada columna.
  await page.goto(`${BASE}/admin/caja/cierre`);
  const form = page.locator('form[aria-label="Cerrar el día"]');
  await form.waitFor();
  const campos = await form.locator('input[id^="declarado-"]').all();
  for (const c of campos) {
    const id = await c.getAttribute("id");
    const dice = await page.locator(`#${id} ~ p`).first().textContent();
    const m = /El libro dice \$\s?([\d.,-]+)/.exec(dice ?? "");
    await c.fill(m ? m[1] : "0");
  }
  await foto(page, "F01-cierre-declarado");
  await form.getByRole("button", { name: "Cerrar el día" }).click();
  await page.getByRole("button", { name: "Sí, cerrar el día" }).click();
  await form.waitFor({ state: "detached", timeout: 20000 });
  await foto(page, "F02-dia-cerrado");
  paso("cierre del día hecho: cada columna cuadra con el libro");


  // Con el día cerrado, la caja con lector ya no cobra hoy y dice cómo seguir.
  await leer(m, "7791527000521");
  await m.fill('[data-caja="monto-0"]', "2.000");
  await m.click('[data-caja="cobrar"]');
  const tras = m.locator('p[role="alert"]');
  await tras.filter({ hasText: "Esta caja vuelve a cobrar" }).waitFor({ timeout: 15000 });
  await foto(m, "F03-caja-con-el-dia-cerrado-390");
  paso("con el día cerrado la caja con lector no cobra: «" + (await tras.first().textContent()).trim().slice(0, 90) + "…»");
} catch (e) {
  errores.push("FALLA: " + (e?.message ?? String(e)));
} finally {
  await browser.close();
}
fs.writeFileSync(`${OUT}/03-recorrido.json`, JSON.stringify({ pasos, errores, medidas }, null, 2));
console.log(JSON.stringify({ pasos: pasos.length, errores, medidas }, null, 2));
process.exit(errores.length ? 1 : 0);
