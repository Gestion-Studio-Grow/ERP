// Prueba del editor de stands contra la demo: agregar, deshacer, rehacer, mover con botones, controles y exportar GLB.
//   node scripts/qa/mia-stand-editor.mjs
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { abrir, entrar } from "./mia-base.mjs";

const fallas = [];
const ok = (cond, texto) => {
  console.log(`${cond ? "✔" : "✖"} ${texto}`);
  if (!cond) fallas.push(texto);
};

const n = await abrir();
const errores = [];
const page = await entrar(n, "admin", errores);
await page.goto("/admin/proyectos");
await page.waitForLoadState("networkidle");
const link = await page.locator('a[href^="/admin/proyectos/"][href*="cm"]').first().getAttribute("href");
await page.goto(`${link}?tab=diseno`);
await page.waitForLoadState("networkidle");
await page.waitForTimeout(2000);
await page.getByRole("button", { name: "+ Armar stand en 3D" }).click();
await page.waitForURL(/stand\//);
await page.waitForLoadState("networkidle");
await page.waitForTimeout(3000);

const lista = page.locator("fieldset", { hasText: "Piezas en el stand" });
const cuantas = async () => Number((await lista.locator("legend").innerText()).match(/\((\d+)\)/)?.[1] ?? -1);
const agregar = (rotulo) => page.locator("fieldset", { hasText: "Agregar pieza" }).getByRole("button", { name: rotulo, exact: true }).click();
const deshacer = page.getByRole("button", { name: /Deshacer/ });
const rehacer = page.getByRole("button", { name: /Rehacer/ });

ok((await cuantas()) === 2, "un stand nuevo trae 2 piezas");
ok(await deshacer.isDisabled(), "sin cambios, Deshacer está apagado");

await agregar("Photocall");
await page.waitForTimeout(800);
ok((await cuantas()) === 3, "agregar una pieza suma 1");
ok(!(await deshacer.isDisabled()), "con un cambio, Deshacer se enciende");
await deshacer.click();
ok((await cuantas()) === 2, "Deshacer saca la pieza");
ok(!(await rehacer.isDisabled()), "Rehacer se enciende");
await rehacer.click();
ok((await cuantas()) === 3, "Rehacer la vuelve a poner");
await page.waitForTimeout(800);
await page.keyboard.press("Control+z");
await page.waitForTimeout(300);
ok((await cuantas()) === 2, "Ctrl+Z también deshace");
await page.keyboard.press("Control+y");
await page.waitForTimeout(300);
ok((await cuantas()) === 3, "Ctrl+Y también rehace");

// Mover con los botones: la posición de la pieza elegida cambia 25 cm.
const fila = lista.locator("ul button[aria-pressed='true']");
const antes = await fila.innerText();
await page.getByRole("button", { name: "Mover 25 cm a la derecha" }).click();
await page.waitForTimeout(300);
const despues = await lista.locator("ul button[aria-pressed='true']").innerText();
ok(antes !== despues, `mover a la derecha cambia la posición (${antes.replace(/\s+/g, " ")} → ${despues.replace(/\s+/g, " ")})`);

// Controles: una pieza más alta que la pared da error.
await page.getByLabel("Alto de pared (m)").fill("2.5").catch(() => {});
await page.waitForTimeout(300);
await agregar("Arco de largada");
await page.waitForTimeout(500);
const avisos = await page.getByRole("status", { name: "Controles del diseño" }).innerText();
ok(/Arco de largada mide 2,8 m/.test(avisos), "el arco de 2,8 m con pared de 2,5 m da aviso");

// Exportar GLB.
const descarga = page.waitForEvent("download", { timeout: 30000 });
await page.getByRole("button", { name: "Exportar modelo 3D (GLB)" }).click();
const d = await descarga;
const ruta = path.join(tmpdir(), "mia-prueba.glb");
await d.saveAs(ruta);
const b = readFileSync(ruta);
ok(b.subarray(0, 4).toString() === "glTF", `el archivo es un GLB válido (${b.length} bytes)`);
const largoJson = b.readUInt32LE(12);
const json = JSON.parse(b.subarray(20, 20 + largoJson).toString("utf8"));
const nodos = (json.nodes ?? []).filter((x) => x.extras?.tipo);
ok(nodos.length >= 3, `el modelo trae las piezas como objetos identificados (${nodos.length})`);
const foto = nodos.find((x) => x.extras.tipo === "PHOTOCALL");
ok(foto && foto.extras.ancho === 2.4 && foto.extras.alto === 2.4 && foto.extras.unidad === "m", "cada pieza lleva tipo y medidas en metros");
// El marco de selección son líneas (modo 1 de glTF): no tienen que estar en el modelo, aunque la pieza esté elegida.
ok(!(json.meshes ?? []).some((mesh) => mesh.primitives.some((p) => p.mode === 1)), "sin marco de selección en el modelo");

if (errores.length) console.log(errores.join("\n"));
await n.close();
console.log(fallas.length ? `\n✖ ${fallas.length} fallas` : "\n✔ editor sin fallas");
process.exit(fallas.length ? 1 : 0);
