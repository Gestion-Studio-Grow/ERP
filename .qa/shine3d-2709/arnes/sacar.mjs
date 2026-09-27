import { chromium } from "/tmp/claude-0/-home-user-Factory-GSG/12bc8dd5-60d3-5e22-95c1-3816d17ad0a9/scratchpad/lab/node_modules/playwright/index.mjs";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const errores = [];
async function foto(nombre, encendida, encuadre, w, h) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  p.on("pageerror", (e) => errores.push(nombre + ": " + e.message));
  p.on("console", (m) => { if (m.type() === "error") errores.push(nombre + ": " + m.text().slice(0, 200)); });
  await p.goto("file://" + process.cwd() + "/index.html");
  await p.evaluate(([e, en, w, h]) => window.montar(e, en, w, h), [encendida, encuadre, w, h]);
  await p.waitForTimeout(6000);
  await p.screenshot({ path: nombre + ".png" });
  await p.close();
}
await foto("vela-encendida-escritorio", true, "sangre", 1440, 800);
await foto("vela-apagada-escritorio", false, "sangre", 1440, 800);
await foto("vela-encendida-celular", true, "sangre", 390, 700);
await foto("vela-primer-plano", true, "columna", 700, 800);
await b.close();
console.log(JSON.stringify(errores));
