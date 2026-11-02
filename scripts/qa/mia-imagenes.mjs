// Prueba del Estudio de imágenes: subir, ampliar, acercar, elegir para la ficha, eliminar con confirmación y con integridad.
//   node scripts/qa/mia-imagenes.mjs
import { abrir, entrar } from "./mia-base.mjs";

const fallas = [];
const ok = (cond, texto) => {
  console.log(`${cond ? "✔" : "✖"} ${texto}`);
  if (!cond) fallas.push(texto);
};

const n = await abrir();
const errores = [];
const page = await entrar(n, "admin", errores);
const marca = Date.now().toString(36);
const nombre = `Prueba ${marca}`;

await page.goto("/admin/proyectos");
await page.waitForLoadState("networkidle");
const link = await page.locator('a[href^="/admin/proyectos/"][href*="cm"]').first().getAttribute("href");
await page.goto(`${link}?tab=diseno`);
await page.waitForLoadState("networkidle");
await page.waitForTimeout(2000);
await page.getByRole("link", { name: "Estudio" }).or(page.getByRole("tab", { name: "Estudio" })).first().click();
await page.waitForTimeout(2500);

const png = await page.evaluate(() => {
  const c = document.createElement("canvas");
  c.width = 640;
  c.height = 480;
  const g = c.getContext("2d");
  const d = g.createLinearGradient(0, 0, 640, 480);
  d.addColorStop(0, "#0a4bd6");
  d.addColorStop(1, "#ff4b2b");
  g.fillStyle = d;
  g.fillRect(0, 0, 640, 480);
  return c.toDataURL("image/png").split(",")[1];
});
await page.getByLabel("Nombre (opcional)").fill(nombre);
await page.locator('input[type="file"]').first().setInputFiles({ name: "prueba.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
await page.waitForTimeout(3500);
await page.reload();
await page.waitForLoadState("networkidle");
await page.waitForTimeout(1500);
await page.getByRole("link", { name: "Estudio" }).or(page.getByRole("tab", { name: "Estudio" })).first().click();
await page.waitForTimeout(2500);

const ampliar = page.getByRole("button", { name: `Ampliar la imagen ${nombre}` });
ok((await ampliar.count()) === 1, "la imagen subida aparece en el Estudio");

// Ampliar
await ampliar.click();
const dialogo = page.getByRole("dialog", { name: new RegExp(`Imagen ampliada: ${nombre}`) });
ok(await dialogo.isVisible(), "al tocar la imagen se abre en grande");
const antes = await dialogo.locator("img").evaluate((i) => i.getBoundingClientRect().width);
await dialogo.getByRole("button", { name: "Acercar" }).click();
const despues = await dialogo.locator("img").evaluate((i) => i.getBoundingClientRect().width);
ok(despues > antes * 1.5, `«Acercar» agranda la imagen (${Math.round(antes)} → ${Math.round(despues)} px)`);
// La subida se reduce a JPG para que entre en la base: la descarga lleva la extensión del archivo real.
ok(/^Prueba-[a-z0-9]+\.(jpg|png|webp)$/.test((await dialogo.getByRole("link", { name: "Descargar" }).getAttribute("download")) ?? ""), "se puede descargar con su nombre y la extensión del archivo real");
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
ok(!(await page.getByRole("dialog").count()), "Escape cierra el visor");

// Elegir para la ficha y después eliminar: se saca de la ficha y no queda colgada
const tarjeta = page.locator("li", { has: page.getByRole("button", { name: `Ampliar la imagen ${nombre}` }) });
await tarjeta.getByRole("button", { name: "Elegir para la ficha" }).click();
await page.waitForTimeout(1800);

// Eliminar con confirmación
await page.getByRole("button", { name: `Eliminar la imagen ${nombre}` }).click();
ok(await page.getByRole("alertdialog").isVisible(), "eliminar pide confirmación");
await page.getByRole("button", { name: "No", exact: true }).click();
ok((await ampliar.count()) === 1 && !(await page.getByRole("alertdialog").count()), "«No» cancela y la imagen sigue");
await page.getByRole("button", { name: `Eliminar la imagen ${nombre}` }).click();
await page.getByRole("button", { name: "Sí, eliminar" }).click();
await page.waitForTimeout(3000);
ok((await page.getByRole("button", { name: `Ampliar la imagen ${nombre}` }).count()) === 0, "la imagen eliminada ya no está");
ok(/se sacó de la ficha/.test(await page.locator("main").innerText()), "si estaba elegida para la ficha, se avisa que se sacó");

if (errores.length) console.log(errores.join("\n"));
await n.close();
console.log(fallas.length ? `\n✖ ${fallas.length} fallas` : "\n✔ imágenes sin fallas");
process.exit(fallas.length ? 1 : 0);
