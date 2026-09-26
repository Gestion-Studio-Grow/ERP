// Qué clientes de la cartera tienen panel propio al que entrar (y con qué dirección).
import { test } from "node:test";
import assert from "node:assert/strict";
import { direccionDelPanel, panelesDeLaCartera } from "./paneles-de-la-cartera";

test("un cliente ruteado por el mapa de hosts tiene panel aunque no haya dominio propio", () => {
  const p = panelesDeLaCartera(["lucia-ferro"], { TENANT_HOST_MAP: "estudio.localhost=estudio;lucia-ferro.localhost=lucia-ferro" });
  assert.equal(direccionDelPanel(p, "lucia-ferro", "/admin/facturacion"), "https://lucia-ferro.localhost/admin/facturacion");
});

test("con dominio propio, cada cliente con subdominio tiene su panel", () => {
  const p = panelesDeLaCartera(["el-tornillo", "del-sur"], { APP_BASE_DOMAIN: " gestionstudiogrow.com " });
  assert.equal(direccionDelPanel(p, "el-tornillo", "/admin"), "https://el-tornillo.gestionstudiogrow.com/admin");
  assert.equal(direccionDelPanel(p, "DEL-SUR", "/admin"), "https://del-sur.gestionstudiogrow.com/admin");
});

test("el mapa exacto gana sobre el dominio propio (misma regla que el ruteo del deploy)", () => {
  const p = panelesDeLaCartera(["shinevelas"], { TENANT_HOST_MAP: "shinevelas.vercel.app=shinevelas", APP_BASE_DOMAIN: "gsg.com" });
  assert.equal(direccionDelPanel(p, "shinevelas", "/admin"), "https://shinevelas.vercel.app/admin");
});

test("sin subdominio, o sin mapa ni dominio propio, no se promete ninguna dirección", () => {
  const p = panelesDeLaCartera([null, "del-sur"], { TENANT_HOST_MAP: "magra.localhost=magra" });
  assert.equal(direccionDelPanel(p, null, "/admin"), null);
  assert.equal(direccionDelPanel(p, "del-sur", "/admin"), null);
  assert.deepEqual(panelesDeLaCartera(["del-sur"], {}), {});
});

// Una sola regla: ninguna pantalla de /contador arma direcciones por su cuenta con las variables del
// deploy (así fue como la ficha decía «Sin dirección propia todavía» a clientes con panel).
test("las pantallas de /contador no leen APP_BASE_DOMAIN ni TENANT_HOST_MAP por su cuenta", async () => {
  const { readdirSync, readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const raiz = fileURLToPath(new URL("../../app/contador", import.meta.url));
  const archivos = (readdirSync(raiz, { recursive: true }) as string[]).filter((a) => /\.tsx?$/.test(a) && !/\.test\.tsx?$/.test(a));
  assert.ok(archivos.length > 5);
  const culpables = archivos.filter((a) => /APP_BASE_DOMAIN|TENANT_HOST_MAP/.test(readFileSync(join(raiz, a), "utf8")));
  assert.deepEqual(culpables, []);
});

test("la regla que usa el navegador no importa nada (ni Prisma ni el ruteo del servidor)", async () => {
  const { readFileSync } = await import("node:fs");
  const fuente = readFileSync(new URL("./direccion-del-panel.ts", import.meta.url), "utf8");
  assert.doesNotMatch(fuente, /^\s*import\s/m);
});
