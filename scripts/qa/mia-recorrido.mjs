// Recorrido de MIA de punta a punta contra la demo local. Imprime sólo lo que falla.
//   node scripts/qa/mia-recorrido.mjs [a b c d e]    (MIA_VER=1 muestra la última pantalla)
import { abrir, BASE, entrar, resumen, texto } from "./mia-base.mjs";

const casos = process.argv.slice(2).length ? process.argv.slice(2) : ["a"];
const marca = Date.now().toString(36).slice(-5);
const errores = [];
let fallas = 0;
const n = await abrir();
let ultima;

async function paso(nombre, fn, page) {
  try {
    const r = await fn();
    return r;
  } catch (e) {
    fallas++;
    console.log(`✖ ${nombre}: ${String(e.message).split("\n")[0].slice(0, 200)}`);
    if (page) console.log(JSON.stringify(await resumen(page)).slice(0, 1500));
    throw e;
  }
}

function igual(a, b, que) {
  if (a !== b) throw new Error(`${que}: dio ${a}, se esperaba ${b}`);
}

async function crearProyecto(page, d) {
  await page.goto("/admin/proyectos/nuevo");
  await page.getByLabel("Nombre del evento").fill(d.nombre);
  await page.getByLabel("Nombre del cliente nuevo").fill(d.cliente);
  await page.getByLabel("Ciudad").fill("Buenos Aires");
  if (d.fecha) await page.getByLabel("Fecha de inicio").fill(d.fecha);
  if (d.moneda) await page.locator("label", { hasText: "Moneda de venta" }).locator("select").selectOption(d.moneda);
  await page.getByLabel("Brief").fill(d.brief ?? "Prueba del recorrido");
  await page.getByRole("button", { name: "Crear lead" }).click();
  await page.waitForURL(/\/admin\/proyectos\/c[a-z0-9]+/);
  return new URL(page.url()).pathname;
}

async function agregarItem(page, ruta, d) {
  await page.goto(`${ruta}?tab=ficha`);
  await page.getByLabel("Descripción del ítem nuevo").fill(d.nombre);
  await page.getByRole("button", { name: "Agregar ítem" }).click();
  await page.getByLabel(`Rubro de ${d.nombre}`).waitFor();
  const fila = page.locator("tr", { has: page.getByLabel(`Rubro de ${d.nombre}`) });
  for (const [etiqueta, valor] of [["Cantidad", d.cantidad], ["Costo unitario", d.costo], ["Precio de venta unitario", d.venta]]) {
    const c = fila.getByLabel(etiqueta, { exact: true });
    await c.fill(String(valor));
    await c.blur();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(350);
  }
}

async function elegirProveedor(page, item) {
  await page.waitForTimeout(500);
  await Promise.all([page.waitForResponse((r) => r.request().method() === "POST"), page.getByLabel(`Proveedor de ${item}`).selectOption({ index: 1 })]);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
}

/** Aprueba precios y envía: devuelve la dirección de la propuesta para el cliente. */
async function enviarPropuesta(page, ruta) {
  await page.goto(`${ruta}?tab=cotizacion`);
  await page.getByRole("button", { name: "Aprobar precios" }).click();
  await page.getByRole("button", { name: /Enviar: cerrar versión/ }).waitFor();
  await page.waitForLoadState("networkidle");
  const links = page.locator('a[href^="/propuesta/"]');
  const antes = await links.evaluateAll((a) => a.map((x) => x.getAttribute("href")));
  await page.getByRole("button", { name: /Enviar: cerrar versión/ }).click();
  await page.waitForFunction((n) => document.querySelectorAll('a[href^="/propuesta/"]').length > n, antes.length);
  const ahora = await links.evaluateAll((a) => a.map((x) => x.getAttribute("href")));
  return ahora.find((h) => !antes.includes(h));
}

async function casoA() {
  const comercial = await entrar(n, "comercial", errores);
  const ruta = await paso("A crear proyecto", () => crearProyecto(comercial, { nombre: `Prueba A ${marca}`, cliente: `Cliente A ${marca}`, fecha: "2027-03-10" }), comercial);
  const admin = await entrar(n, "admin", errores);
  ultima = admin;
  await paso("A cargar ítem", () => agregarItem(admin, ruta, { nombre: "Sonido", cantidad: 2, costo: 1000, venta: 1500 }), admin);
  const propuesta = await paso("A enviar propuesta", () => enviarPropuesta(admin, ruta), admin);
  const cliente = await (await n.newContext({ baseURL: BASE, acceptDownloads: true })).newPage();
  cliente.on("pageerror", (e) => errores.push(`[cliente] ${e.message.slice(0, 160)}`));
  await cliente.goto(propuesta);
  ultima = cliente;
  await paso("A total de la propuesta", async () => {
    const t = (await cliente.locator("body").innerText()).replace(/ /g, " ");
    for (const x of ["$ 3.000", "$ 630", "$ 3.630"]) if (!t.includes(x)) throw new Error(`falta ${x}`);
    if (/costo|margen/i.test(t)) throw new Error("el cliente ve costo o margen");
  }, cliente);
  await paso("A PDF de la propuesta", async () => {
    const r = await cliente.evaluate(async (u) => {
      const x = await fetch(u);
      return { estado: x.status, inicio: (await x.text()).slice(0, 4) };
    }, `${propuesta}/pdf`);
    igual(r.estado, 200, "estado");
    igual(r.inicio, "%PDF", "archivo");
  }, cliente);
  await paso("A aprobar", async () => {
    await cliente.getByLabel(/Tu nombre y apellido/).fill("Cliente De Prueba");
    await cliente.getByRole("button", { name: "Aprobar propuesta" }).click();
    await cliente.getByText(/aprobad/i).first().waitFor();
  }, cliente);
  await admin.goto(`${ruta}?tab=finanzas`);
  await admin.waitForLoadState("networkidle");
  ultima = admin;
  await paso("A finanzas", async () => {
    await debeDecir(admin, "· Confirmado", "Venta presupuestada | $ 3.000", "Saldo final | $ 3.630", "$ 1.000 (33,33%)", "anticipo del cliente", "saldo del cliente");
    await marcarTodo(admin);
    await admin.reload();
    await debeDecir(admin, "Saldo final | $ 3.630");
  }, admin);
  await paso("A gasto real", async () => {
    await plano(admin);
    await admin.getByLabel("Detalle del gasto").fill("Flete extra");
    await admin.getByLabel("Neto, sin IVA").fill("10000");
    await admin.getByLabel("IVA del comprobante").fill("2100");
    await admin.getByLabel("Fecha del comprobante").fill("2026-11-02");
    await admin.getByLabel("Número de comprobante").fill("0001-00000099");
    await admin.getByLabel("Proveedor", { exact: true }).fill("Fletes de prueba");
    await admin.getByLabel("Rubro").fill("Logística");
    await admin.getByRole("button", { name: "Registrar gasto" }).click();
    await admin.waitForLoadState("networkidle");
    await admin.getByText("Flete extra").first().waitFor();
    await admin.reload();
    await debeDecir(admin, "Real, sin IVA | $ 10.000", "Flete extra");
  }, admin);
}

const plano = async (page) => {
  await page.waitForFunction(() => !document.querySelector("main")?.innerText.includes("Cargando…"));
  return (await texto(page, "main", 20000)).replace(/ /g, " ");
};

async function debeDecir(page, ...frases) {
  const t = await plano(page);
  for (const f of frases) if (!t.includes(f)) throw new Error(`falta «${f}». Pantalla: ${t.slice(0, 500)}`);
}

/** Marca una por una todas las cuotas a la vista, contra la cuenta en pesos. */
async function marcarTodo(page) {
  const boton = page.getByRole("button", { name: /^Marcar (cobrado|pagado)$/ });
  let vueltas = 0;
  await plano(page);
  while ((await boton.count()) > 0) {
    if (++vueltas > 20) throw new Error("las cuotas no terminan de marcarse");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(800);
    const antes = await boton.count();
    const fila = page.locator("tr").filter({ has: page.locator('select[name="cuenta"]') }).first();
    await fila.locator('select[name="cuenta"]').selectOption({ label: "Banco de prueba · Pesos (ARS)" });
    await Promise.all([page.waitForResponse((r) => r.request().method() === "POST"), fila.getByRole("button", { name: /^Marcar/ }).click()]);
    await page.waitForFunction((n) => [...document.querySelectorAll("button")].filter((b) => /^Marcar (cobrado|pagado)$/.test(b.innerText.trim())).length < n, antes);
  }
}

async function avanzarHastaCierre(page) {
  const pasadas = [];
  for (let i = 0; i < 10; i++) {
    await plano(page);
    const boton = page.getByRole("button", { name: /^Pasar a / });
    if ((await boton.count()) === 0) break;
    const nombre = await boton.first().innerText();
    pasadas.push(nombre);
    await boton.first().click();
    await page.waitForFunction((v) => ![...document.querySelectorAll("button")].some((b) => b.innerText.trim() === v), nombre);
    await page.waitForLoadState("networkidle");
  }
  return pasadas;
}

async function casoB() {
  const comercial = await entrar(n, "comercial", errores);
  const ruta = await paso("B crear", () => crearProyecto(comercial, { nombre: `Prueba B ${marca}`, cliente: `Cliente B ${marca}`, fecha: "2027-04-20" }), comercial);
  const admin = await entrar(n, "admin", errores);
  ultima = admin;
  await paso("B ítems", async () => {
    for (const d of [{ nombre: "Sonido", cantidad: 2, costo: 1000, venta: 1500 }, { nombre: "Catering", cantidad: 10, costo: 100, venta: 200 }]) {
      await agregarItem(admin, ruta, d);
      await elegirProveedor(admin, d.nombre);
    }
  }, admin);
  const v1 = await paso("B enviar v1", () => enviarPropuesta(admin, ruta), admin);
  const cliente = await (await n.newContext({ baseURL: BASE })).newPage();
  cliente.on("pageerror", (e) => errores.push(`[cliente] ${e.message.slice(0, 160)}`));
  await paso("B cliente rechaza", async () => {
    await cliente.goto(v1);
    await cliente.getByLabel(/Tu nombre y apellido/).fill("Cliente De Prueba");
    await cliente.getByRole("button", { name: "No la aprobamos" }).click();
    await cliente.locator("textarea").fill("Bajar el catering");
    await cliente.getByRole("button", { name: "Enviar respuesta" }).click();
    await cliente.getByText(/recibi|gracias|cambios/i).first().waitFor();
  }, cliente);
  await paso("B versión 2", async () => {
    await admin.goto(`${ruta}?tab=cotizacion`);
    await debeDecir(admin, "Bajar el catering");
    await admin.getByRole("button", { name: "Nueva versión" }).click();
    await admin.getByRole("button", { name: "Aprobar precios" }).waitFor();
    await admin.goto(`${ruta}?tab=ficha`);
    const fila = admin.locator("tr", { has: admin.getByLabel("Rubro de Catering") });
    const c = fila.getByLabel("Precio de venta unitario", { exact: true });
    await c.fill("250");
    await c.blur();
    await admin.waitForLoadState("networkidle");
    await admin.waitForTimeout(400);
  }, admin);
  const v2 = await paso("B enviar v2", () => enviarPropuesta(admin, ruta), admin);
  await paso("B cliente aprueba v2", async () => {
    if (v2 === v1) throw new Error("la versión 2 trae el link de la 1");
    await cliente.goto(v2);
    const t = (await texto(cliente, "body", 3000)).replace(/ /g, " ");
    for (const x of ["$ 5.500", "$ 1.155", "$ 6.655"]) if (!t.includes(x)) throw new Error(`falta ${x}: ${t.slice(0, 300)}`);
    await cliente.getByLabel(/Tu nombre y apellido/).fill("Cliente De Prueba");
    await cliente.getByRole("button", { name: "Aprobar propuesta" }).click();
    await cliente.getByText(/aprobad/i).first().waitFor();
  }, cliente);
  await paso("B cobrar y pagar", async () => {
    await admin.goto(`${ruta}?tab=finanzas`);
    await debeDecir(admin, "Venta presupuestada | $ 5.500", "Costo presupuestado | $ 3.000", "Saldo final | $ 3.655", "$ 2.500 (45,45%)");
    await marcarTodo(admin);
    await admin.reload();
    await debeDecir(admin, "Saldo final | $ 3.655");
  }, admin);
  await paso("B llevar hasta cierre", async () => {
    await admin.goto(`${ruta}?tab=resumen`);
    const p = await avanzarHastaCierre(admin);
    console.log(`  etapas: ${p.join(" · ")}`);
    await debeDecir(admin, "· Cierre");
  }, admin);
  console.log("TEXTO", (await texto(admin, "main", 1300)));
}

async function casoC() {
  const admin = await entrar(n, "admin", errores);
  ultima = admin;
  const ruta = await paso("C crear", () => crearProyecto(admin, { nombre: `Prueba C ${marca}`, cliente: `Cliente C ${marca}`, fecha: "2027-05-15", moneda: "USD" }), admin);
  await paso("C ítem", async () => {
    await agregarItem(admin, ruta, { nombre: "Pantalla", cantidad: 1, costo: 100000, venta: 200 });
    await elegirProveedor(admin, "Pantalla");
  }, admin);
  await paso("C previstas", async () => {
    await admin.goto(`${ruta}?tab=finanzas`);
    await debeDecir(admin, "Venta presupuestada | US$ 200", "Costo presupuestado | US$ 74,07", "Saldo final | US$ 167,93", "Las cuotas previstas son una proyección", "Prevista");
    if ((await admin.getByRole("button", { name: /^Marcar (cobrado|pagado)$/ }).count()) > 0) throw new Error("una cuota prevista se puede marcar");
  }, admin);
  const propuesta = await paso("C enviar", () => enviarPropuesta(admin, ruta), admin);
  const cliente = await (await n.newContext({ baseURL: BASE })).newPage();
  await paso("C cliente aprueba", async () => {
    await cliente.goto(propuesta);
    const t = (await texto(cliente, "body", 3000)).replace(/ /g, " ");
    for (const x of ["US$ 200", "US$ 42", "US$ 242"]) if (!t.includes(x)) throw new Error(`falta ${x}: ${t.slice(0, 300)}`);
    await cliente.getByLabel(/Tu nombre y apellido/).fill("Cliente De Prueba");
    await cliente.getByRole("button", { name: "Aprobar propuesta" }).click();
    await cliente.getByText(/aprobad/i).first().waitFor();
  }, cliente);
  const saldoPesos = async () => {
    await admin.goto("/admin/proyectos/administracion?tab=bancos");
    const m = (await plano(admin)).match(/Banco de prueba · Pesos \| \$ ([\d.,]+)/);
    return Number(m[1].replace(/\./g, "").replace(",", "."));
  };
  const antes = await saldoPesos();
  await paso("C cobrar en pesos", async () => {
    await admin.goto(`${ruta}?tab=finanzas`);
    await marcarTodo(admin);
    await admin.reload();
    await debeDecir(admin, "Ganancia real | $ 170.000 (62,96%)", "Por pagar | $ 0");
    igual(await saldoPesos(), antes + 326700 - 100000, "saldo del banco en pesos");
  }, admin);
  const dolar = async (v) => {
    await admin.goto("/admin/proyectos/administracion?tab=monedas");
    await plano(admin);
    const c = admin.getByLabel("Pesos por dólar");
    await c.fill(String(v));
    await admin.getByRole("button", { name: "Guardar", exact: true }).first().click();
    await admin.waitForLoadState("networkidle");
    await admin.waitForTimeout(600);
  };
  await paso("C sube el dólar y el margen enviado no cambia", async () => {
    await dolar(1500);
    await admin.goto(`${ruta}?tab=cotizacion`);
    await debeDecir(admin, "US$ 125,93 (62,96%)");
  }, admin);
  await dolar(1350);
}

let PNG;

const prohibido = (t, re, que) => {
  const m = t.match(re);
  if (m) throw new Error(`${que} ve «${m[0]}»`);
};

async function barra(page) {
  return page.evaluate(() => [...new Set([...document.querySelectorAll("nav a, aside a")].map((a) => a.innerText.trim()).filter(Boolean))].join(" · "));
}

const ESPERADO = {
  admin: ["Proyectos", "Calendario", "Administración", "Dirección", "Equipo y permisos", "Reportes"],
  produccion: ["Proyectos", "Calendario", "Proveedores", "Mi liquidación"],
  diseno: ["Proyectos", "Diseño", "Calendario", "Propuesta con IA", "Mi liquidación"],
  comercial: ["Proyectos", "Calendario", "Propuesta con IA", "Mi liquidación", "Clientes"],
  administracion: ["Proveedores", "Administración", "Caja", "Libro de caja", "Cierre del día", "Facturación"],
  sinficha: ["Inicio"],
};

async function casoD() {
  const admin = await entrar(n, "admin", errores);
  ultima = admin;
  PNG = Buffer.from((await admin.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 400;
    c.height = 300;
    c.getContext("2d").fillRect(0, 0, 400, 300);
    return c.toDataURL("image/png");
  })).split(",")[1], "base64");
  const ruta = await paso("D crear", () => crearProyecto(admin, { nombre: `Stand D ${marca}`, cliente: `Cliente D ${marca}`, fecha: "2027-06-10" }), admin);
  await paso("D ítem", async () => {
    await agregarItem(admin, ruta, { nombre: "Armado", cantidad: 1, costo: 500000, venta: 900000 });
    await elegirProveedor(admin, "Armado");
  }, admin);
  const produccion = await entrar(n, "produccion", errores);
  const diseno = await entrar(n, "diseno", errores);
  const comercial = await entrar(n, "comercial", errores);
  const administracion = await entrar(n, "administracion", errores);
  const sinficha = await entrar(n, "sinficha", errores);
  await paso("D sin equipo: ni Producción ni Diseño lo ven", async () => {
    for (const [rol, page] of [["produccion", produccion], ["diseno", diseno]]) {
      await page.goto(`${ruta}?tab=resumen`);
      await page.waitForLoadState("networkidle");
      const t = await texto(page, "body", 4000);
      if (t.includes(`Stand D ${marca}`)) throw new Error(`${rol} ve un proyecto donde no está`);
    }
  });
  await paso("D asignar equipo", async () => {
    await admin.goto(`${ruta}?tab=resumen`);
    await plano(admin);
    for (const persona of ["Equipo de diseño", "Tomás Vera", "Paula Ibáñez", "Nadia Quiroga"]) {
      await admin.waitForTimeout(600);
      const op = await admin.getByLabel("Persona").locator("option", { hasText: persona }).count();
      if (!op) continue;
      await admin.getByLabel("Persona").selectOption({ label: persona });
      await admin.getByLabel("Función").fill("Equipo");
      await Promise.all([admin.waitForResponse((r) => r.request().method() === "POST"), admin.getByRole("button", { name: "Asignar" }).click()]);
      await admin.waitForLoadState("networkidle");
    }
  }, admin);
  for (const [rol, page] of [["admin", admin], ["produccion", produccion], ["diseno", diseno], ["comercial", comercial], ["administracion", administracion], ["sinficha", sinficha]]) {
    await page.goto("/admin/proyectos/inicio");
    await page.waitForLoadState("networkidle");
    const menu = await barra(page);
    await page.goto(`${ruta}?tab=ficha`);
    await page.waitForLoadState("networkidle");
    await plano(page);
    const t = (await texto(page, "body", 9000)).replace(/ /g, " ");
    const ve = t.includes(`Stand D ${marca}`);
    const conCosto = /Costo unitario|Margen/.test(t);
    await paso(`D ${rol} y su pantalla`, async () => {
      igual(ve, rol !== "sinficha", `${rol} ve el proyecto`);
      igual(conCosto, ["admin", "produccion", "administracion"].includes(rol), `${rol} ve costos`);
      for (const app of ESPERADO[rol]) if (!menu.includes(app)) throw new Error(`a ${rol} le falta ${app} en el menú: ${menu}`);
    }, page);
    if (rol === "comercial" || rol === "diseno" || rol === "sinficha") await paso(`D ${rol} sin costos`, async () => prohibido(t, /\$ 500\.000|Costo unitario|Margen/, rol), page);
  }
  ultima = produccion;
  await paso("D Producción edita", async () => {
    await produccion.goto(`${ruta}?tab=ficha`);
    await plano(produccion);
    await produccion.getByLabel("Descripción del ítem nuevo").waitFor();
  }, produccion);
  await paso("D stand 3D", async () => {
    await diseno.goto(`${ruta}?tab=diseno`);
    await plano(diseno);
    await diseno.getByRole("button", { name: "+ Armar stand en 3D" }).click();
    await diseno.waitForURL(/stand\//);
    await diseno.waitForLoadState("networkidle");
    if ((await diseno.locator("canvas").count()) !== 1) throw new Error("no se dibuja el 3D");
    await diseno.getByLabel("Frente (m)").fill("6");
    await diseno.getByRole("button", { name: "Mostrador" }).click();
    await diseno.getByRole("button", { name: "Guardar stand" }).click();
    await diseno.getByRole("button", { name: "Guardado" }).waitFor({ timeout: 20000 });
    await diseno.getByRole("button", { name: "Agregar esta vista a la propuesta" }).click();
    await diseno.waitForLoadState("networkidle");
    await diseno.waitForTimeout(800);
    console.log("STAND", (await resumen(diseno)).avisos, (await resumen(diseno)).botones.slice(-3));
  }, diseno);
  await paso("D cómputo al presupuesto (Producción)", async () => {
    const produccion = await entrar(n, "produccion", errores);
    await produccion.goto(`${ruta}?tab=diseno`);
    await plano(produccion);
    await produccion.locator('a[href*="/stand/"]').first().click();
    await produccion.waitForURL(/stand\//);
    await produccion.waitForLoadState("networkidle");
    await produccion.getByRole("button", { name: "Pasar el cómputo al presupuesto" }).click();
    await produccion.waitForLoadState("networkidle");
    await produccion.waitForTimeout(1200);
    await admin.goto(`${ruta}?tab=ficha`);
    const t = await plano(admin);
    console.log("FICHA", t.match(/Ítems \| \d+/)?.[0]);
  }, admin);
  await paso("D pieza", async () => {
    await diseno.goto(`${ruta}?tab=diseno`);
    await plano(diseno);
    await diseno.getByLabel("Nombre de la pieza").fill("Cartel");
    await diseno.getByRole("button", { name: "Agregar pieza" }).click();
    await diseno.locator("a", { hasText: "Cartel" }).first().click();
    await diseno.waitForURL(/entregable\//);
    await plano(diseno);
    await diseno.getByLabel("Elegir imagen de la versión").setInputFiles({ name: "cartel.png", mimeType: "image/png", buffer: PNG });
    const enviar = diseno.getByRole("button", { name: "Enviar al cliente" });
    await enviar.waitFor();
    await diseno.waitForLoadState("networkidle");
    await enviar.click();
    await diseno.waitForLoadState("networkidle");
    await diseno.waitForTimeout(800);
  }, diseno);
  await paso("D cliente aprueba la pieza", async () => {
    await admin.goto(`${ruta}?tab=diseno`);
    await plano(admin);
    const links = await admin.locator('a[href*="/entregables/"], [data-ruta*="/entregables/"]').evaluateAll((a) => a.map((x) => x.getAttribute("href") ?? x.dataset.ruta));
    const texto1 = await plano(admin);
    if (!links[0]) throw new Error(`no hay link de piezas: ${texto1.match(/Piezas para aprobar.{0,300}/)?.[0]}`);
    const cliente = await (await n.newContext({ baseURL: BASE })).newPage();
    await cliente.goto(links[0]);
    const r = await resumen(cliente, "body");
    console.log("PIEZAS CLIENTE", JSON.stringify({ c: r.campos, b: r.botones, t: r.titulos }).slice(0, 500));
    await cliente.getByLabel(/nombre/i).first().fill("Cliente De Prueba");
    await cliente.getByRole("button", { name: /Aprobar/ }).first().click();
    await cliente.waitForLoadState("networkidle");
    await cliente.waitForTimeout(800);
    await admin.reload();
    await debeDecir(admin, "Aprobada");
  }, admin);
  await paso("D archivos", async () => {
    await diseno.goto(`${ruta}?tab=archivos`);
    await plano(diseno);
    await diseno.getByLabel(/Elegir imagen/).setInputFiles({ name: "render.png", mimeType: "image/png", buffer: PNG });
    await diseno.getByRole("link", { name: /render\.png/ }).waitFor();
    await diseno.getByLabel("Nombre del archivo").fill("Plano nube");
    await diseno.getByLabel("Link del archivo").fill("https://ejemplo.com/plano.dwg");
    await diseno.getByRole("button", { name: "Guardar link" }).click();
    await diseno.getByRole("link", { name: "Plano nube" }).waitFor();
  }, diseno);
  await paso("D chat", async () => {
    await admin.goto(`${ruta}?tab=chat`);
    await plano(admin);
    const caja = admin.locator("main textarea").locator("visible=true").first();
    await caja.fill(`Hola equipo ${marca}`);
    await admin.getByRole("button", { name: "Enviar" }).click();
    await admin.getByText(`Hola equipo ${marca}`).first().waitFor();
    await diseno.goto(`${ruta}?tab=chat`);
    await plano(diseno);
    await diseno.getByText(`Hola equipo ${marca}`).first().waitFor();
  }, admin);
  await paso("D tarea", async () => {
    await admin.goto(`${ruta}?tab=seguimiento`);
    await plano(admin);
    await admin.getByLabel("Nueva tarea").fill(`Llamar al predio ${marca}`);
    await admin.getByLabel("Responsable de la tarea").selectOption({ index: 1 });
    await admin.getByLabel("Vencimiento de la tarea").fill("2027-05-01");
    await admin.getByRole("button", { name: "Agregar tarea" }).click();
    await admin.getByText(`Llamar al predio ${marca}`).first().waitFor();
  }, admin);
  await paso("D propuesta con imagen", async () => {
    const link = await enviarPropuesta(admin, ruta);
    const cliente = await (await n.newContext({ baseURL: BASE })).newPage();
    await cliente.goto(link);
    await cliente.waitForLoadState("networkidle");
    const imgs = await cliente.locator("img").evaluateAll((a) => a.filter((i) => i.naturalWidth > 0).length);
    console.log("PROPUESTA imágenes", imgs, (await texto(cliente, "body", 400)));
    if (/Costo|Margen/.test(await texto(cliente, "body", 9000))) throw new Error("el cliente ve costos");
    await cliente.getByLabel(/Tu nombre y apellido/).fill("Cliente De Prueba");
    await cliente.getByRole("button", { name: "Aprobar propuesta" }).click();
    await cliente.getByText(/aprobad/i).first().waitFor();
  }, admin);
  await paso("D Administración cobra desde su pantalla", async () => {
    await administracion.goto("/admin/proyectos/administracion");
    await plano(administracion);
    const fila = administracion.locator("tr", { hasText: `Cliente D ${marca}` }).first();
    await fila.waitFor();
    await fila.getByRole("button", { name: "Cobrado" }).click();
    const cuenta = administracion.locator('select[name="cuenta"]').locator("visible=true").first();
    await cuenta.selectOption({ label: "Banco de prueba · Pesos (ARS)" });
    await Promise.all([administracion.waitForResponse((r) => r.request().method() === "POST"), administracion.getByRole("button", { name: "Confirmar" }).locator("visible=true").first().click()]);
    await administracion.waitForLoadState("networkidle");
    await administracion.waitForTimeout(800);
    await administracion.goto("/admin/proyectos/administracion?filtro=pagados");
    await plano(administracion);
  }, administracion);
  await paso("D reunión", async () => {
    await admin.goto("/admin/proyectos/calendario");
    await plano(admin);
    await admin.getByLabel("Título").locator("visible=true").last().fill(`Reunión ${marca}`);
    await admin.getByLabel("Fecha y hora").locator("visible=true").last().fill("2026-11-20T10:00");
    await admin.getByRole("button", { name: "Guardar reunión" }).locator("visible=true").last().click();
    await admin.getByText("Quedó en el calendario.").waitFor();
    await admin.reload();
    await plano(admin);
    if (!(await admin.locator(`input[value="Reunión ${marca}"]`).count())) throw new Error("la reunión no aparece después de recargar");
  }, admin);
  await paso("D extracto", async () => {
    await administracion.goto("/admin/proyectos/administracion?tab=bancos");
    await plano(administracion);
    await administracion.getByLabel("Archivo CSV").setInputFiles({ name: "extracto.csv", mimeType: "text/csv", buffer: Buffer.from(`fecha;descripción;importe\n02/11/2026;TRANSF RECIBIDA ${marca};1000,50\n`) });
    await administracion.waitForLoadState("networkidle");
    await administracion.waitForTimeout(1200);
    const r = await resumen(administracion);
    console.log("EXT", JSON.stringify({ a: r.avisos, b: r.botones }).slice(0, 300));
    const fila = administracion.locator("tr", { hasText: `TRANSF RECIBIDA ${marca}` }).first();
    await fila.locator("details summary").first().click();
    await fila.locator("select").selectOption({ index: 1 });
    await Promise.all([administracion.waitForResponse((r) => r.request().method() === "POST"), fila.getByRole("button", { name: "Conciliar" }).click()]);
    await administracion.waitForLoadState("networkidle");
    await administracion.waitForTimeout(800);
    await administracion.reload();
    await plano(administracion);
    if (await administracion.locator("tr", { hasText: `TRANSF RECIBIDA ${marca}` }).first().getByRole("button", { name: "Conciliar" }).count()) throw new Error("no quedó conciliado");
  }, administracion);
  await paso("D liquidación", async () => {
    await admin.goto("/admin/proyectos/administracion?tab=liquidaciones");
    await plano(admin);
    await admin.getByRole("button", { name: "Generar o recalcular" }).click();
    await admin.waitForLoadState("networkidle");
    await admin.waitForTimeout(1500);
    const publicar = admin.getByRole("button", { name: /Publicar borradores/ });
    if (await publicar.count()) {
      await publicar.click();
      await admin.getByRole("button", { name: /Confirmar|Sí/ }).first().click();
      await admin.waitForLoadState("networkidle");
      await admin.waitForTimeout(1000);
    }
    await comercial.goto("/admin/proyectos/mi-liquidacion");
    const t = await plano(comercial);
    if (/Todavía no tenés liquidaciones/.test(t)) throw new Error("publicada, pero Comercial no la ve");
    if (/Dueño de MIA|Equipo de diseño/.test(t)) throw new Error("Comercial ve liquidaciones de otros");
    const pdf = await comercial.locator('main a:has-text("PDF")').first().getAttribute("href");
    const r = await comercial.evaluate(async (u) => {
      const x = await fetch(u);
      return { e: x.status, n: (await x.text()).length };
    }, pdf);
    if (r.e !== 200 || r.n < 500) throw new Error(`liquidación: ${JSON.stringify(r)}`);
  }, admin);
  await paso("D descargas de la cotización", async () => {
    await admin.goto(`${ruta}?tab=cotizacion`);
    await plano(admin);
    const enlaces = await admin.locator("main a").evaluateAll((a) => a.filter((x) => /^(PDF|Excel)$/.test(x.innerText.trim())).map((x) => [x.innerText.trim(), x.getAttribute("href")]));
    if (enlaces.length < 2) throw new Error(`faltan descargas: ${JSON.stringify(enlaces)}`);
    for (const [nombre, h] of enlaces.slice(0, 2)) {
      const r = await admin.evaluate(async (u) => {
        const x = await fetch(u);
        return { e: x.status, n: (await x.arrayBuffer()).byteLength };
      }, h);
      if (r.e !== 200 || r.n < 500) throw new Error(`${nombre}: ${JSON.stringify(r)}`);
    }
  }, admin);
  for (const [rol, page, url] of [["produccion", produccion, "/admin/proyectos/proveedores"], ["administracion", administracion, "/admin/proyectos/proveedores"], ["admin", admin, "/admin/proyectos/direccion"], ["admin", admin, "/admin/proyectos/reportes"], ["admin", admin, "/admin/proyectos/calendario"], ["comercial", comercial, "/admin/proyectos/mi-liquidacion"], ["admin", admin, "/admin/proyectos/administracion?tab=liquidaciones"], ["admin", admin, "/admin/proyectos/equipo"], ["admin", admin, "/admin/reportes"], ["administracion", administracion, "/admin/caja"], ["administracion", administracion, "/admin/caja/libro"], ["comercial", comercial, "/admin/clientes"]]) {
    await paso(`D abrir ${url} (${rol})`, async () => {
      const r = await page.goto(url);
      if (r.status() >= 400) throw new Error(`da ${r.status()}`);
      const t = await plano(page);
      console.log("ABRE", rol, url, page.url().includes(url.split("?")[0]) ? "" : `→ ${page.url()}`, t.slice(0, 110));
    }, page);
  }
}

async function casoE() {
  const admin = await entrar(n, "admin", errores);
  ultima = admin;
  const diseno = await entrar(n, "diseno", errores);
  const comercial = await entrar(n, "comercial", errores);
  const sinficha = await entrar(n, "sinficha", errores);
  const ruta = await paso("E crear", () => crearProyecto(admin, { nombre: `Prueba E ${marca}`, cliente: `Cliente E ${marca}`, fecha: "2027-07-01" }), admin);
  await paso("E ítem", () => agregarItem(admin, ruta, { nombre: "Sonido", cantidad: 1, costo: 100, venta: 1000 }), admin);
  await paso("E lo prohibido no abre por URL", async () => {
    for (const [rol, page, url, nodebe] of [
      ["diseno", diseno, "/admin/proyectos/administracion", /A cobrar/],
      ["diseno", diseno, "/admin/proyectos/direccion", /Caja hoy/],
      ["comercial", comercial, "/admin/proyectos/administracion", /A cobrar/],
      ["comercial", comercial, `${ruta}?tab=finanzas`, /Saldo final|Costo presupuestado/],
      ["sinficha", sinficha, "/admin/proyectos", /Lead \/ brief/],
      ["sinficha", sinficha, "/admin/caja", /Lo que hay ahora/],
      ["comercial", comercial, "/admin/caja", /Lo que hay ahora/],
    ]) {
      await page.goto(url);
      await page.waitForLoadState("networkidle");
      if (nodebe.test(await texto(page, "body", 6000))) throw new Error(`${rol} abre ${url}`);
    }
  });
  const link = await paso("E enviar", () => enviarPropuesta(admin, ruta), admin);
  await paso("E lo enviado no se edita", async () => {
    await admin.goto(`${ruta}?tab=ficha`);
    await plano(admin);
    if (await admin.getByLabel("Descripción del ítem nuevo").count()) throw new Error("se pueden agregar ítems a una versión enviada");
  }, admin);
  const cliente = await (await n.newContext({ baseURL: BASE })).newPage();
  await paso("E rechazar sin motivo no deja", async () => {
    await cliente.goto(link);
    await cliente.getByLabel(/Tu nombre y apellido/).fill("Cliente");
    await cliente.getByRole("button", { name: "No la aprobamos" }).click();
    await cliente.getByRole("button", { name: "Enviar respuesta" }).waitFor();
    if (!(await cliente.getByRole("button", { name: "Enviar respuesta" }).isDisabled())) throw new Error("deja rechazar sin motivo");
    await cliente.getByRole("button", { name: "Volver" }).click();
  }, cliente);
  await paso("E aprobar dos veces", async () => {
    await cliente.getByRole("button", { name: "Aprobar propuesta" }).click();
    await cliente.getByText(/aprobad/i).first().waitFor();
    await cliente.reload();
    if (await cliente.getByRole("button", { name: "Aprobar propuesta" }).count()) throw new Error("se puede aprobar de nuevo");
    const otro = await (await n.newContext({ baseURL: BASE })).newPage();
    igual((await otro.goto("/propuesta/token-que-no-existe-0000000000")).status(), 404, "link inexistente");
  }, cliente);
  await paso("E doble clic no cobra dos veces, y anular devuelve la plata", async () => {
    const saldo = async () => {
      await admin.goto("/admin/proyectos/administracion?tab=bancos");
      const m = (await plano(admin)).match(/Banco de prueba · Pesos \| \$ ([\d.,]+)/);
      return Number(m[1].replace(/\./g, "").replace(",", "."));
    };
    const antes = await saldo();
    await admin.goto(`${ruta}?tab=finanzas`);
    await plano(admin);
    await admin.waitForLoadState("networkidle");
    await admin.waitForTimeout(800);
    const fila = admin.locator("tr").filter({ has: admin.locator('select[name="cuenta"]') }).first();
    await fila.locator('select[name="cuenta"]').selectOption({ label: "Banco de prueba · Pesos (ARS)" });
    await fila.getByRole("button", { name: /^Marcar/ }).dblclick();
    await admin.waitForLoadState("networkidle");
    await admin.waitForTimeout(1500);
    igual(await saldo(), antes + 605, "saldo tras el doble clic");
    await admin.goto(`${ruta}?tab=finanzas`);
    await plano(admin);
    await admin.waitForLoadState("networkidle");
    await admin.getByRole("button", { name: /^Anular cobro/ }).first().click();
    await admin.waitForTimeout(500);
    const si = admin.getByRole("button", { name: /Sí, anular|^Confirmar|^Anular$/ }).locator("visible=true").first();
    if (await si.count()) await si.click();
    await admin.waitForLoadState("networkidle");
    await admin.waitForTimeout(1500);
    igual(await saldo(), antes, "saldo tras anular");
  }, admin);
  await paso("E perdido con motivo", async () => {
    await comercial.goto(ruta);
    await plano(comercial);
    await comercial.getByRole("button", { name: "Marcar perdido" }).click();
    const boton = comercial.getByRole("button", { name: "Marcar perdido" }).locator("visible=true").last();
    if (!(await boton.isDisabled())) throw new Error("deja marcar perdido sin motivo");
    await comercial.locator("select").locator("visible=true").filter({ hasText: "Elegí un motivo" }).selectOption("Precio");
    await boton.click();
    await comercial.waitForLoadState("networkidle");
    await comercial.waitForTimeout(800);
    await admin.goto("/admin/proyectos/direccion?tab=comerciales");
    await debeDecir(admin, "Precio");
  }, comercial);
}

try {
  if (casos.includes("e")) await casoE();
  if (casos.includes("d")) await casoD();
  if (casos.includes("c")) await casoC();
  if (casos.includes("a")) await casoA();
  if (casos.includes("b")) await casoB();
} catch {
  // la falla ya se imprimió
}
if (process.env.MIA_VER && ultima) console.log(JSON.stringify(await resumen(ultima, "body")).slice(0, 3500));
for (const e of errores) console.log(`✖ ${e}`);
console.log(fallas || errores.length ? `Fallas: ${fallas + errores.length}` : `✔ ${casos.join(" ")} sin fallas · ${BASE}`);
await n.close();
process.exit(fallas || errores.length ? 1 : 0);
