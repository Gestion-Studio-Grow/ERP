// Sondeo de formularios: controles visibles después de interacciones puntuales.
import { chromium } from "/home/user/erp/node_modules/playwright/index.mjs";
const neg = process.argv[2] || "shinevelas";
const base = `http://${neg}.localhost:3210`;
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const dump = async (t, sel = "body") => {
  const ctl = await p.evaluate((sel) => [...document.querySelector(sel).querySelectorAll("a,button,input,select,textarea,[role=option],[role=dialog],label")].filter(e=>e.getBoundingClientRect().width>0).map(e => `${e.tagName}${e.getAttribute("role")?"{"+e.getAttribute("role")+"}":""}${e.name?"["+e.name+"]":""}${e.id?"#"+e.id:""}${e.type&&e.tagName==="INPUT"?"("+e.type+")":""}:${(e.getAttribute("aria-label")||e.innerText||e.placeholder||e.value||"").trim().replace(/\s+/g," ").slice(0,40)}`), sel);
  console.log(`--- ${t}\n${ctl.join(" | ")}`);
};
await p.goto(base + "/tienda", { timeout: 120000, waitUntil: "networkidle" });
const nombre = neg === "adosmanos" ? /^speed motion/i : /^Vela Lavanda/;
await p.getByRole("button", { name: nombre }).first().click(); await p.waitForTimeout(800);
console.log("URL tras ficha:", p.url()); await dump("ficha", "body");
await p.getByRole("button", { name: /^Sumar al pedido/ }).click(); await p.waitForTimeout(800);
await dump("tras sumar", "body"); console.log("URL", p.url()); const bolsa = p.getByRole("button", { name: /pedido|bolsa|carrito/i }); console.log("botones bolsa:", await bolsa.allInnerTexts());
await p.screenshot({ path: "/home/user/erp/.qa/rediseno/shine-adosmanos/sondeo/tienda-tras-mas.png" });
await p.goto(base + "/admin/login");
await p.fill("input[name=email]", `dueno@${neg}.lab`); await p.fill("input[name=password]", (process.env.LAB_CLAVE_COMUN ?? ""));
await Promise.all([p.waitForURL((u) => !u.pathname.endsWith("/login")), p.click("button[type=submit]")]);
await p.goto(base + "/admin/catalogo?agregar=1", { waitUntil: "networkidle" }); await p.waitForTimeout(500);
await dump("catalogo agregar", "body");
await p.goto(base + "/admin/compras", { waitUntil: "networkidle" });
await p.getByPlaceholder("Proveedor").fill("Taller"); await p.waitForTimeout(700); await dump("proveedor opciones", "main");
await p.goto(base + "/admin/vender", { waitUntil: "networkidle" });
await p.getByPlaceholder("Buscá un producto").fill(neg === "adosmanos" ? "Zapatillas" : "Lavanda"); await p.waitForTimeout(700); await dump("vender busqueda", "main");
await b.close();
