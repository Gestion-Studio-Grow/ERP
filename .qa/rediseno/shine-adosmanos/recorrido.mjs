// Recorrido de punta a punta — Shine Velas y A Dos Manos con «Diseño nuevo» (piel Renglón).
// Vidriera: portada → ficha → bolsa → pedido (texto del wa.me, sin abrirlo) → el pedido aparece en el backoffice.
// Backoffice (dueño): vender por unidad (teclado a 1440, toque a 390) → catálogo (alta + recarga) →
// compra a proveedor con recepción (stock +N, recarga) → reportes (rangos, margen, resultado, CSV).
// Además: permisos del cajero, estados vacío/error, scroll horizontal a 360, teclas < 44 px a 390,
// y CERO errores de consola (se cuentan todos, sin filtrar).
// Uso: node recorrido.mjs [shinevelas,adosmanos] [1440,390]
import { chromium } from "/home/user/erp/node_modules/playwright/index.mjs";
import fs from "node:fs";

const D = "/home/user/erp/.qa/rediseno/shine-adosmanos/";
const F = D + "fotos/";
fs.mkdirSync(F, { recursive: true });
const NEGOCIOS = (process.argv[2] || "shinevelas,adosmanos").split(",");
const ANCHOS = (process.argv[3] || "1440,390").split(",").map(Number);
const SELLO = Date.now().toString(36).slice(-5);
const CLAVE = (process.env.LAB_CLAVE_COMUN ?? "");
const DATOS = {
  // Productos con stock de sobra: cada corrida completa descuenta 4 u en la vidriera y 2 u en Vender.
  shinevelas: { vender: "Sahumerios de sándalo (pack x6)", tienda: /^Fósforos largos/, enMensaje: /Fósforos largos/, comprar: "Vela Sándalo", prov: "Taller", buscarTienda: "lavanda" },
  adosmanos: { vender: "Grip base Adidas", tienda: /^Protector de pala transparente/, enMensaje: /Protector de pala transparente/, comprar: "Muñequeras Head (par)", prov: "a", buscarTienda: "nox", variante: "Zapatillas Asics" },
};

const R = []; // { negocio, ancho, paso, ok, det }
const ERRORES = []; // errores de consola, todos
const INDUCIDO = /ERR_INTERNET_DISCONNECTED|no-existe-qa/; // los provoca el recorrido a propósito (sin conexión, ruta inexistente)
const CALLEJONES = [];
const log = (s) => { console.log(s); fs.appendFileSync(D + "salida-recorrido.txt", s + "\n"); };
fs.writeFileSync(D + "salida-recorrido.txt", `Recorrido ${new Date().toISOString()} sello=${SELLO}\n`);

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });

function nuevoContexto(ancho) {
  return b.newContext(ancho === 390 ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } : { viewport: { width: 1440, height: 900 } });
}
function escuchar(p, neg, ancho) {
  p.on("console", (m) => { if (m.type() === "error") ERRORES.push(`${neg} ${ancho} ${p.url()} :: ${m.text().slice(0, 240)}`); });
  p.on("pageerror", (e) => ERRORES.push(`${neg} ${ancho} ${p.url()} :: pageerror ${String(e).slice(0, 240)}`));
}
async function paso(neg, ancho, nombre, p, fn) {
  const t0 = Date.now();
  try {
    const det = await fn();
    R.push({ neg, ancho, paso: nombre, ok: true, det });
    log(`  OK   ${nombre} (${Date.now() - t0} ms) ${det ?? ""}`);
  } catch (e) {
    const det = String(e?.message ?? e).split("\n")[0].slice(0, 300);
    R.push({ neg, ancho, paso: nombre, ok: false, det });
    log(`  FALLA ${nombre}: ${det}`);
    await p.screenshot({ path: `${F}${neg}_${ancho}_FALLA_${nombre.replace(/\W+/g, "-")}.png`, fullPage: true }).catch(() => {});
  }
}
const foto = (p, neg, ancho, n) => p.screenshot({ path: `${F}${neg}_${ancho}_${n}.png`, fullPage: true });
const texto = (p, sel = "main") => p.evaluate((s) => (document.querySelector(s) || document.body).innerText.replace(/\s+/g, " "), sel);
async function medir(p) {
  return p.evaluate(() => {
    const main = document.querySelector("main") || document.body;
    const chicos = [...main.querySelectorAll("a, button, input:not([type=hidden]), select, textarea, [role=button]")]
      .filter((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && r.height < 44 && cs.visibility !== "hidden" && !(e.tagName === "INPUT" && (e.type === "checkbox" || e.type === "radio") && e.closest("label")?.getBoundingClientRect().height >= 44); })
      .map((e) => (e.getAttribute("aria-label") || e.innerText || e.name || e.tagName).trim().replace(/\s+/g, " ").slice(0, 28) + ":" + Math.round(e.getBoundingClientRect().height));
    return { sx: document.documentElement.scrollWidth - innerWidth, chicos };
  });
}
async function ir(p, url) {
  const r = await p.goto(url, { timeout: 120000, waitUntil: "networkidle" });
  await p.waitForTimeout(300);
  if (r && r.status() >= 400) throw new Error(`HTTP ${r.status()} en ${url}`);
  return r;
}
async function entrar(p, base, email) {
  await ir(p, base + "/admin/login");
  await p.fill("input[name=email]", email);
  await p.fill("input[name=password]", CLAVE);
  await Promise.all([p.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 120000 }), p.click("button[type=submit]")]);
}
async function stockDe(p, base, nombre) {
  await ir(p, `${base}/admin/inventario?q=${encodeURIComponent(nombre)}`);
  const t = await texto(p);
  const m = t.match(new RegExp(`(-?[\\d.,]+)\\s*(?:u|unidad(?:es)?)\\s+${nombre.replace(/[()]/g, "\\$&")}`));
  if (!m) throw new Error(`no encuentro el stock de «${nombre}» en Stock`);
  return Number(m[1].replace(/\./g, "").replace(",", "."));
}
const pedidos = {}; // neg → [códigos]
// En el celular la bolsa vive detrás de «Ver mi pedido»; en la compu está siempre a la vista.
async function abrirBolsa(p) {
  const enviar = p.locator("button[name=via]").first();
  if (await enviar.isVisible().catch(() => false)) return "a la vista";
  const abrir = p.getByRole("button", { name: /Ver mi pedido|Finalizar/ }).or(p.getByRole("link", { name: /Ver mi pedido|Finalizar/ })).first();
  if (!(await abrir.count())) return "sin botón para abrir";
  await abrir.click();
  await p.waitForTimeout(700);
  return "abierta con «Ver mi pedido»";
}

for (const neg of NEGOCIOS) {
  const base = `http://${neg}.localhost:3210`;
  const d = DATOS[neg];
  pedidos[neg] = [];
  // ───────────── El dueño publica su WhatsApp (en el laboratorio venía vacío: sin número la vidriera no ofrece «Pedir por WhatsApp») ─────────────
  {
    const ctx = await nuevoContexto(1440);
    const p = await ctx.newPage();
    escuchar(p, neg, "config");
    await paso(neg, "config", "admin: cargar el WhatsApp del negocio (Localización) y recargar", p, async () => {
      await entrar(p, base, `dueno@${neg}.lab`);
      await ir(p, base + "/admin/localizacion");
      const campo = p.locator("input[name=whatsapp]").first();
      const antes = await campo.inputValue();
      if (!antes) {
        await campo.fill(neg === "adosmanos" ? "5491155550102" : "5491155550101");
        await p.locator("form").filter({ has: campo }).getByRole("button", { name: /Guardar cambios/ }).click();
        await p.waitForTimeout(2500);
      }
      await ir(p, base + "/admin/localizacion");
      const despues = await p.locator("input[name=whatsapp]").first().inputValue();
      await foto(p, neg, "config", "c1-localizacion");
      if (!despues) throw new Error("el WhatsApp no quedó guardado al recargar");
      return antes ? `ya estaba: ${antes}` : `vacío → ${despues} (número inventado 11 5555-01xx)`;
    });
    await ctx.close();
  }
  for (const ancho of ANCHOS) {
    log(`\n=== ${neg} · ${ancho} px`);
    // ───────────── Vidriera ─────────────
    {
      const ctx = await nuevoContexto(ancho);
      const p = await ctx.newPage();
      escuchar(p, neg, ancho);
      const waLinks = [];
      await ctx.route(/https:\/\/(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)\//, (r) => { waLinks.push(r.request().url()); r.abort(); });
      ctx.on("page", (np) => np.on("request", (rq) => { if (/wa\.me|whatsapp\.com/.test(rq.url())) waLinks.push(rq.url()); }));
      let urlFicha = "";
      await paso(neg, ancho, "tienda: portada", p, async () => {
        await ir(p, base + "/tienda");
        await foto(p, neg, ancho, "t1-portada");
        const m = await medir(p);
        return `sx=${m.sx} chicos(${m.chicos.length})=${m.chicos.slice(0, 6).join("|")}`;
      });
      await paso(neg, ancho, "tienda: buscar y vacío", p, async () => {
        const s = p.getByRole("searchbox").first();
        if (ancho === 1440) { await p.locator("body").click({ position: { x: 5, y: 5 } }); await p.keyboard.press("/"); const foco = await p.evaluate(() => document.activeElement?.getAttribute("type")); if (foco !== "search") throw new Error("la tecla / no lleva al buscador"); await p.keyboard.type(d.buscarTienda); }
        else await s.fill(d.buscarTienda);
        await p.waitForTimeout(600);
        const visibles = async () => p.locator("button[aria-label^='Sumar uno de']").evaluateAll((es) => es.filter((e) => e.getBoundingClientRect().height > 0).length);
        const conRes = `${await visibles()} productos visibles`;
        await s.fill("zzqqxx");
        await p.waitForTimeout(600);
        const vacio = (await texto(p)).match(/(No (hay|encontramos)[^.]*\.)/i)?.[0];
        await foto(p, neg, ancho, "t2-vacio");
        await s.fill("");
        if (!vacio) throw new Error(`búsqueda sin resultados no explica nada (con «${d.buscarTienda}»: ${conRes})`);
        return `«${d.buscarTienda}» → ${conRes}; vacío → «${vacio}»`;
      });
      await paso(neg, ancho, "tienda: ficha de producto", p, async () => {
        await p.getByRole("button", { name: d.tienda }).first().click();
        await p.waitForURL(/producto=/, { timeout: 15000 });
        urlFicha = p.url();
        await p.waitForTimeout(500);
        await foto(p, neg, ancho, "t3-ficha");
        const dlg = await p.evaluate(() => (document.querySelector("[role=dialog]") || document.body).innerText.replace(/\s+/g, " ").slice(0, 260));
        const talle = await p.locator("[role=dialog] select, [role=dialog] [role=radiogroup]").count();
        // Recarga: la ficha tiene que volver a abrirse sola desde el enlace.
        await ir(p, urlFicha);
        const abierta = await p.getByRole("button", { name: /^Sumar al pedido/ }).isVisible();
        if (!abierta) throw new Error("recargar el enlace de la ficha no la vuelve a abrir");
        return `url=${urlFicha.replace(base, "")} selectorDeVariante=${talle} texto=«${dlg.slice(0, 160)}»`;
      });
      await paso(neg, ancho, "tienda: sumar a la bolsa (+1 con Más)", p, async () => {
        await p.getByRole("button", { name: /^Más$/ }).click();
        await p.getByRole("button", { name: /^Sumar al pedido/ }).click();
        await p.waitForTimeout(700);
        const como = await abrirBolsa(p);
        const btn = p.locator("button[name=via]").first();
        await btn.scrollIntoViewIfNeeded({ timeout: 8000 });
        await foto(p, neg, ancho, "t4-bolsa");
        return `bolsa ${como} · botón de envío: «${(await btn.innerText()).trim()}» via=${await btn.getAttribute("value")}`;
      });
      await paso(neg, ancho, "tienda: la bolsa sobrevive a recargar", p, async () => {
        await ir(p, base + "/tienda");
        await abrirBolsa(p);
        const btn = p.locator("button[name=via]").first();
        if (!(await btn.count())) throw new Error("al recargar la página la bolsa quedó vacía");
        return `sigue: «${(await btn.innerText()).trim()}»`;
      });
      await paso(neg, ancho, "tienda: error sin conexión", p, async () => {
        await abrirBolsa(p);
        await p.fill("input[name=customerName]", `QA Recorrido ${SELLO}`);
        await p.fill("input[name=customerPhone]", "11 5555-0199");
        await p.locator("input[name=fulfillment][value=PICKUP]").check({ force: true });
        await p.fill("input[name=notes]", `Prueba QA ${SELLO} (talle 42)`);
        await ctx.setOffline(true);
        await p.locator("button[name=via]").first().click();
        await p.waitForTimeout(2500);
        const t = await texto(p, "body");
        await ctx.setOffline(false);
        await foto(p, neg, ancho, "t5-sin-conexion");
        const msg = t.match(/(No (se )?pud[^.]*\.|sin conexión[^.]*\.|Revisá[^.]*\.)/i)?.[0];
        // la pestaña en blanco del wa.me puede haberse abierto: cerrarla
        for (const pg of ctx.pages()) if (pg !== p) await pg.close();
        if (!msg) throw new Error("sin conexión, al enviar no aparece ningún aviso");
        return `aviso: «${msg}»`;
      });
      await paso(neg, ancho, "tienda: enviar pedido y texto del wa.me", p, async () => {
        waLinks.length = 0;
        await abrirBolsa(p);
        const btnWa = p.locator("button[name=via][value=whatsapp]");
        const btn = (await btnWa.count()) ? btnWa.first() : p.locator("button[name=via]").first();
        const via = await btn.getAttribute("value");
        const antes = (await btn.innerText()).trim();
        await btn.click();
        await p.waitForTimeout(400);
        const cargando = (await btn.innerText().catch(() => "")).trim();
        await p.waitForFunction(() => /pedido|#\s?\d+|código/i.test(document.body.innerText) && !/Enviando|Guardando/.test(document.body.innerText), null, { timeout: 30000 });
        await p.waitForTimeout(2500);
        await foto(p, neg, ancho, "t6-confirmado");
        const t = await texto(p, "body");
        const codigo = t.match(/#\s?(\d{2,})/)?.[1];
        const href = await p.locator("a[href*='wa.me'], a[href*='whatsapp.com']").first().getAttribute("href").catch(() => null);
        const wa = waLinks.find((l) => /text=/.test(l)) || href;
        if (href && waLinks[0] && href !== waLinks[0]) fs.appendFileSync(D + "wa-links.txt", `${neg} ${ancho} (enlace de la página de gracias) ${decodeURIComponent(href)}\n`);
        if (codigo) pedidos[neg].push(codigo);
        for (const pg of ctx.pages()) if (pg !== p) await pg.close();
        if (!wa) throw new Error(`no hay enlace de WhatsApp (via=${via}, botón «${antes}», cargando «${cargando}»); confirmación: «${t.match(/[^.]*(pedido|recibimos)[^.]*\./i)?.[0] ?? t.slice(0, 200)}»`);
        const u = new URL(wa);
        const msg = u.searchParams.get("text") ?? "";
        fs.appendFileSync(D + "wa-links.txt", `${neg} ${ancho} ${u.origin}${u.pathname}\n${msg}\n---\n`);
        const nombreProd = (await p.evaluate(() => "")) || "";
        const faltan = [];
        if (!/\d/.test(u.pathname)) faltan.push("número de destino");
        if (!/\$\s?[\d.]+/.test(msg)) faltan.push("total");
        if (codigo && !msg.includes(codigo)) faltan.push("código del pedido");
        if (!d.enMensaje.test(msg)) faltan.push("nombre del producto");
        if (!/(\b2\s*(u\b|x|×|unidades))|((x|×)\s*2\b)/i.test(msg)) faltan.push("cantidad 2");
        if (faltan.length) throw new Error(`al texto del wa.me le falta: ${faltan.join(", ")} — «${msg.slice(0, 200)}»`);
        return `código #${codigo} · cargando=«${cargando}» · destino ${u.pathname} · «${msg.replace(/\n/g, " ⏎ ").slice(0, 220)}»${nombreProd}`;
      });
      await paso(neg, ancho, "tienda: 360 px sin scroll horizontal", p, async () => {
        await p.setViewportSize({ width: 360, height: 780 });
        await ir(p, base + "/tienda");
        const a = await medir(p);
        await ir(p, urlFicha || base + "/tienda");
        const f2 = await medir(p);
        if (a.sx > 0 || f2.sx > 0) throw new Error(`scroll horizontal: portada ${a.sx}px, ficha ${f2.sx}px`);
        return "portada y ficha sin desborde";
      });
      await ctx.close();
    }

    // ───────────── Backoffice (dueño) ─────────────
    {
      const ctx = await nuevoContexto(ancho);
      const p = await ctx.newPage();
      escuchar(p, neg, ancho);
      await ctx.route(/https:\/\/(wa\.me|api\.whatsapp\.com)\//, (r) => r.abort());
      const visitadas = new Set();
      await paso(neg, ancho, "admin: entrar como dueño", p, async () => {
        await entrar(p, base, `dueno@${neg}.lab`);
        const dis = await p.getAttribute("[data-diseno]", "data-diseno").catch(() => null);
        await foto(p, neg, ancho, "a1-inicio");
        visitadas.add("/admin");
        if (dis !== "renglon") throw new Error(`«Diseño nuevo» no está puesto: data-diseno=${dis}`);
        return `diseño=${dis}`;
      });
      await paso(neg, ancho, "admin: el pedido de la vidriera llegó a Pedidos", p, async () => {
        await ir(p, base + "/admin/pedidos");
        visitadas.add("/admin/pedidos");
        const t = await texto(p);
        const cods = pedidos[neg];
        if (!cods.length) throw new Error("no hay código de pedido de la vidriera para buscar");
        const falta = cods.filter((c) => !t.includes(`#${c}`));
        await foto(p, neg, ancho, "a2-pedidos");
        if (falta.length) throw new Error(`no aparecen en Pedidos: ${falta.map((c) => "#" + c).join(", ")}`);
        return `aparecen ${cods.map((c) => "#" + c).join(", ")}`;
      });
      let stock0 = null;
      await paso(neg, ancho, "admin: vender por unidad y cobrar", p, async () => {
        stock0 = await stockDe(p, base, d.vender);
        await ir(p, base + "/admin/vender");
        visitadas.add("/admin/vender");
        const n0 = Number((await texto(p)).match(/(\d+) ventas? cobradas? hoy/)?.[1] ?? NaN);
        const busc = p.getByPlaceholder("Buscá un producto");
        if (ancho === 1440) {
          await p.locator("body").click({ position: { x: 5, y: 300 } });
          await p.keyboard.press("/");
          const enBuscador = await busc.evaluate((e) => e === document.activeElement);
          if (!enBuscador) throw new Error("la tecla / no lleva al buscador de Vender");
          await p.keyboard.type(d.vender);
          await p.waitForTimeout(800);
          await p.keyboard.press("Enter");
          await p.waitForTimeout(500);
          // «Enter listo»: si pide cantidad, Enter la confirma
          await p.keyboard.press("Enter");
        } else {
          await busc.fill(d.vender);
          await p.waitForTimeout(800);
          // A 390 el buscador abre una lista (role=option): se toca el resultado, como un usuario.
          await p.getByRole("option", { name: new RegExp("^" + d.vender.replace(/[()]/g, "\\$&")) }).first().click();
          await p.waitForTimeout(500);
          if (await p.getByRole("button", { name: /^(Listo|Sumar|Agregar)/ }).first().isVisible().catch(() => false)) await p.getByRole("button", { name: /^(Listo|Sumar|Agregar)/ }).first().click();
        }
        await p.waitForTimeout(800);
        const t1 = await texto(p);
        const total = t1.match(/\$\s?([\d.]+)\s*TOTAL/i)?.[1] ?? t1.match(/TOTAL[^$]{0,20}\$\s?([\d.]+)/i)?.[1];
        await foto(p, neg, ancho, "a3-vender-linea");
        if (!total || total === "0") throw new Error(`la línea no se sumó (TOTAL=${total})`);
        if (ancho === 1440) {
          await p.keyboard.press("Alt+1");
          await p.waitForTimeout(300);
          const elegido = await p.getByRole("radio", { name: /^Efectivo/ }).getAttribute("aria-checked");
          if (elegido !== "true") throw new Error("Alt+1 no elige Efectivo");
          await p.keyboard.press("F2");
        } else {
          await p.getByRole("radio", { name: /^Efectivo/ }).click();
          await p.getByRole("button", { name: /^Cobr/ }).first().click();
        }
        await p.waitForTimeout(3000);
        const t2 = await texto(p, "body");
        await foto(p, neg, ancho, "a4-vender-cobrado");
        const conf = t2.match(/(Cobrad[oa][^.]{0,80}|Venta (registrada|cobrada)[^.]{0,80}|Ticket[^.]{0,60})/i)?.[0];
        await ir(p, base + "/admin/vender");
        const n1 = Number((await texto(p)).match(/(\d+) ventas? cobradas? hoy/)?.[1] ?? NaN);
        const stock1 = await stockDe(p, base, d.vender);
        if (!(n1 === n0 + 1)) throw new Error(`tras recargar, ventas de hoy ${n0} → ${n1}; confirmación «${conf}»`);
        if (stock1 !== stock0 - 1) throw new Error(`stock de ${d.vender} ${stock0} → ${stock1} (esperaba -1)`);
        return `TOTAL $${total} · «${conf}» · ventas hoy ${n0}→${n1} · stock ${stock0}→${stock1}`;
      });
      if (d.variante) {
        await paso(neg, ancho, "admin: vender con variante (talle)", p, async () => {
          await ir(p, base + "/admin/vender");
          await p.getByPlaceholder("Buscá un producto").fill(d.variante);
          await p.waitForTimeout(800);
          const ops = await p.getByRole("option").filter({ hasText: new RegExp(d.variante, "i") }).allInnerTexts();
          await foto(p, neg, ancho, "a5-vender-variante");
          await p.getByPlaceholder("Buscá un producto").fill("");
          const conTalle = ops.filter((o) => /talle/i.test(o));
          if (!conTalle.length || ops.length > conTalle.length) {
            CALLEJONES.push(`${neg}: no hay variantes (talle/color). «${d.variante}» aparece como ${ops.length} productos sueltos (${ops.map((o) => o.replace(/\s+/g, " ").slice(0, 45)).join(" / ")}); el talle sólo existe si se crea un producto aparte o se escribe en la nota del pedido.`);
            throw new Error(`sin selector de talle: ${ops.length} productos sueltos para «${d.variante}»`);
          }
          return ops.join(" / ");
        });
      }
      const nuevo = `QA Recorrido ${neg === "adosmanos" ? "Grip" : "Vela"} ${ancho} ${SELLO}`;
      await paso(neg, ancho, "admin: catálogo — agregar producto y recargar", p, async () => {
        await ir(p, base + "/admin/catalogo?agregar=1");
        visitadas.add("/admin/catalogo");
        await p.fill("#new-corte-name", nuevo);
        await p.fill("#new-corte-cost", "1000");
        const opciones = await p.locator("#new-corte-saleUnit option").allInnerTexts();
        await p.selectOption("#new-corte-saleUnit", { label: "Por unidad" });
        await p.fill("#new-corte-unit", "unidad");
        await p.fill("#new-corte-precio", "2500");
        await p.fill("#new-corte-stock", "3");
        await foto(p, neg, ancho, "a6-catalogo-alta");
        await p.locator("form").filter({ has: p.locator("#new-corte-name") }).getByRole("button", { name: "Agregar producto" }).click();
        await p.waitForTimeout(2500);
        const aviso = (await texto(p, "body")).match(/(Listo[^.]{0,80}|Agregad[oa][^.]{0,80}|Guardad[oa][^.]{0,60})/)?.[0];
        await ir(p, `${base}/admin/catalogo?q=${encodeURIComponent(nuevo)}`);
        const t = await texto(p);
        await foto(p, neg, ancho, "a7-catalogo-recargado");
        if (!t.includes(nuevo)) throw new Error(`después de recargar no está «${nuevo}»`);
        const fila = t.slice(Math.max(0, t.indexOf(nuevo) - 12), t.indexOf(nuevo) + nuevo.length + 60);
        return `aviso «${aviso}» · fila «${fila}» · formas de venta ofrecidas: ${opciones.join("/")}`;
      });
      await paso(neg, ancho, "admin: catálogo — búsqueda sin resultados", p, async () => {
        await ir(p, `${base}/admin/catalogo?q=zzqqxx`);
        const t = await texto(p);
        const m = t.match(/((No (hay|encontramos|tenés)|Ningún)[^.]*\.)/i)?.[0];
        await foto(p, neg, ancho, "a8-catalogo-vacio");
        if (!m) throw new Error(`catálogo vacío sin explicación: «${t.slice(0, 160)}»`);
        return `«${m}»`;
      });
      await paso(neg, ancho, "admin: compra — registrar vacía da error", p, async () => {
        await ir(p, base + "/admin/compras");
        visitadas.add("/admin/compras");
        const btn = p.getByRole("button", { name: /^Registrar compra/ });
        const deshab = await btn.isDisabled();
        if (!deshab) { await btn.click(); await p.waitForTimeout(1200); }
        const t = await texto(p);
        return deshab ? `botón deshabilitado con leyenda «${t.match(/Cargá qué llegó[^.]*\./)?.[0]}»` : `aviso «${t.match(/(Falta|Cargá|Elegí)[^.]*\./)?.[0]}»`;
      });
      await paso(neg, ancho, "admin: compra a proveedor y recepción (stock +N, recarga)", p, async () => {
        const s0 = await stockDe(p, base, d.comprar);
        await ir(p, base + "/admin/compras");
        const prov = p.getByRole("combobox", { name: "Proveedor" });
        await prov.click(); await prov.fill(d.prov); await p.waitForTimeout(600);
        const opP = p.getByRole("option").first();
        const provNombre = (await opP.innerText()).split("\n")[0];
        await opP.click();
        await p.fill("input[name=notes]", `remito QA-${SELLO}-${ancho}`);
        const prod = p.getByRole("combobox", { name: /renglón 1/ });
        await prod.click(); await prod.fill(d.comprar.slice(0, 10)); await p.waitForTimeout(600);
        await p.getByRole("option", { name: new RegExp("^" + d.comprar.replace(/[()]/g, "\\$&")) }).first().click();
        // Cantidad distinta por ancho: dos compras idénticas en 2 minutos las frena el sistema a propósito (doble toque).
        const cant = ancho === 390 ? 3 : 2;
        await p.locator("input[id^=cant-]").first().fill(String(cant));
        const costo = p.locator("input[id^=costo-]").first();
        if (await costo.count()) await costo.fill("1000");
        await p.locator("input[name=pago]").first().check({ force: true });
        await foto(p, neg, ancho, "a9-compra-cargada");
        await p.getByRole("button", { name: /^Registrar compra/ }).click();
        await p.waitForTimeout(3000);
        const aviso = (await texto(p, "body")).match(/(Listo[^.]{0,100}|Registrad[oa][^.]{0,100}|Entró[^.]{0,100})/)?.[0];
        await foto(p, neg, ancho, "a10-compra-registrada");
        await ir(p, base + "/admin/compras");
        const t = await texto(p);
        if (!t.includes(`QA-${SELLO}-${ancho}`)) throw new Error(`tras recargar, «Lo último que entró» no muestra el remito QA-${SELLO}-${ancho} (aviso «${aviso}»)`);
        const s1 = await stockDe(p, base, d.comprar);
        if (s1 !== s0 + cant) throw new Error(`stock de ${d.comprar} ${s0} → ${s1} (esperaba +${cant})`);
        return `proveedor «${provNombre}» · aviso «${aviso}» · stock ${s0}→${s1}`;
      });
      await paso(neg, ancho, "admin: qué pedir (sugerido) lleva a recibir", p, async () => {
        await ir(p, base + "/admin/compras/sugerido");
        visitadas.add("/admin/compras/sugerido");
        const t = await texto(p);
        await foto(p, neg, ancho, "a11-sugerido");
        const salidas = await p.locator("main a, main button").allInnerTexts();
        const accion = salidas.map((s) => s.trim()).filter((s) => /pedir|whatsapp|recib|enviar|copiar|cargar/i.test(s)).slice(0, 5);
        if (!accion.length) { CALLEJONES.push(`${neg}: «Qué pedir» no tiene ninguna acción para pedir ni para recibir.`); throw new Error("«Qué pedir» sin acción"); }
        return `«${t.slice(0, 90)}» · acciones: ${accion.join(" / ")}`;
      });
      await paso(neg, ancho, "admin: reportes (rango, margen, resultado, CSV)", p, async () => {
        await ir(p, base + "/admin/reportes");
        visitadas.add("/admin/reportes");
        await foto(p, neg, ancho, "a12-reportes");
        await p.getByRole("link", { name: "30 días" }).click();
        await p.waitForURL(/dias=30/, { timeout: 30000 });
        const r30 = (await texto(p)).match(/Del [\d/]+ al [\d/]+/)?.[0];
        await p.getByRole("link", { name: /Margen por producto/ }).click();
        await p.waitForURL(/reportes\/margen/, { timeout: 60000 });
        await p.waitForLoadState("networkidle");
        const h1m = await p.locator("h1").first().innerText();
        await foto(p, neg, ancho, "a13-margen");
        visitadas.add("/admin/reportes/margen");
        await ir(p, base + "/admin/resultado");
        visitadas.add("/admin/resultado");
        const h1r = await p.locator("h1").first().innerText();
        await foto(p, neg, ancho, "a14-resultado");
        const csvR = await p.evaluate(async () => { const r = await fetch("/admin/reportes/export?dias=30"); return { st: r.status, ct: r.headers.get("content-type"), cuerpo: await r.text() }; });
        const cuerpo = csvR.cuerpo;
        if (csvR.st !== 200 || !/csv|text/.test(csvR.ct || "")) throw new Error(`CSV ${csvR.st} ${csvR.ct}`);
        return `30 días: «${r30}» · margen h1 «${h1m}» · resultado h1 «${h1r}» · CSV ${cuerpo.split("\n").length} líneas, encabezado «${cuerpo.split("\n")[0].slice(0, 80)}»`;
      });
      await paso(neg, ancho, "admin: ruta inexistente muestra error entendible", p, async () => {
        const r = await p.goto(base + "/admin/catalogo/no-existe-qa", { waitUntil: "networkidle" });
        const t = await texto(p, "body");
        const volver = await p.locator("a[href='/admin'], a[href='/admin/']").count();
        await foto(p, neg, ancho, "a15-404");
        if (!volver) CALLEJONES.push(`${neg}: la página de «no existe» (${r?.status()}) no ofrece volver al inicio.`);
        return `HTTP ${r?.status()} · «${t.slice(0, 100)}» · enlaces a inicio=${volver}`;
      });
      if (ancho === 390) {
        await paso(neg, ancho, "admin: teclas < 44 px a 390 y scroll a 360", p, async () => {
          const out = [];
          let desborde = [];
          for (const r of visitadas) {
            await p.setViewportSize({ width: 390, height: 844 });
            await ir(p, base + r);
            const m390 = await medir(p);
            await p.setViewportSize({ width: 360, height: 780 });
            await p.waitForTimeout(300);
            const m360 = await medir(p);
            if (m360.sx > 0) desborde.push(`${r}:${m360.sx}px`);
            out.push(`${r} chicos(${m390.chicos.length})=${m390.chicos.slice(0, 5).join("|")}`);
          }
          fs.appendFileSync(D + "tactil-y-desborde.txt", `${neg} ${SELLO}\n${out.join("\n")}\ndesborde360: ${desborde.join(", ") || "ninguno"}\n\n`);
          if (desborde.length) throw new Error(`scroll horizontal a 360: ${desborde.join(", ")}`);
          const conChicos = out.filter((o) => !/chicos\(0\)/.test(o));
          return `sin desborde a 360 en ${visitadas.size} pantallas; con teclas < 44 px: ${conChicos.length} (detalle en tactil-y-desborde.txt)`;
        });
      }
      await ctx.close();
    }
  }
  // ───────────── Permisos (cajero), una vez por negocio a 1440 ─────────────
  {
    const ctx = await nuevoContexto(1440);
    const p = await ctx.newPage();
    escuchar(p, neg, "cajero");
    await paso(neg, "cajero", "permisos del cajero", p, async () => {
      await entrar(p, base, `cajero@${neg}.lab`);
      const res = [];
      for (const r of ["/admin/vender", "/admin/catalogo?agregar=1", "/admin/compras", "/admin/reportes", "/admin/resultado", "/admin/usuarios", "/admin/cierre-mes"]) {
        const resp = await p.goto(base + r, { waitUntil: "networkidle" });
        const h1 = await p.locator("h1").first().innerText().catch(() => "—");
        const alta = r.includes("agregar") ? await p.locator("#new-corte-name").count() : null;
        res.push(`${r} → ${resp?.status()} ${new URL(p.url()).pathname} «${h1.slice(0, 40)}»${alta !== null ? ` formAlta=${alta}` : ""}`);
      }
      await foto(p, neg, "cajero", "p1-ultima");
      fs.appendFileSync(D + "permisos-cajero.txt", `${neg}\n${res.join("\n")}\n\n`);
      return res.join(" ; ");
    });
    await ctx.close();
  }
}
await b.close();

const fallas = R.filter((r) => !r.ok);
log(`\n=== RESUMEN sello=${SELLO}`);
log(`pasos: ${R.length} · ok: ${R.length - fallas.length} · fallas: ${fallas.length}`);
for (const f of fallas) log(`  FALLA [${f.neg} ${f.ancho}] ${f.paso}: ${f.det}`);
const reales = ERRORES.filter((e) => !INDUCIDO.test(e));
log(`errores de consola: ${reales.length} (más ${ERRORES.length - reales.length} provocados a propósito)`);
for (const e of [...new Set(ERRORES)]) log(`  CONSOLA${INDUCIDO.test(e) ? " (provocado)" : ""} ${e}`);
log(`callejones: ${CALLEJONES.length}`);
for (const c of [...new Set(CALLEJONES)]) log(`  CALLEJÓN ${c}`);
fs.writeFileSync(D + "resultado.json", JSON.stringify({ sello: SELLO, pasos: R, errores: ERRORES, callejones: [...new Set(CALLEJONES)], pedidos }, null, 2));
process.exit(fallas.length || reales.length ? 1 : 0);
