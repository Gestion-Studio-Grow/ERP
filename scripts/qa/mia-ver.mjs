// Ver una pantalla de la demo, opcionalmente después de unos pasos:
//   node scripts/qa/mia-ver.mjs <rol> <ruta> ["await page.getByRole('button',{name:'X'}).click()"]
import { abrir, entrar, resumen } from "./mia-base.mjs";
const [rol = "comercial", ruta = "/admin/proyectos", pasos = ""] = process.argv.slice(2);
const n = await abrir();
const errores = [];
const page = await entrar(n, rol, errores);
await page.goto(ruta);
await page.waitForLoadState("networkidle");
if (pasos) {
  await new (Object.getPrototypeOf(async function () {}).constructor)("page", pasos)(page);
  await page.waitForTimeout(800);
}
console.log(JSON.stringify(await resumen(page, process.env.MIA_ZONA ?? "main")));
if (errores.length) console.log(errores.join("\n"));
await n.close();
