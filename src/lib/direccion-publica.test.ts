// GSG-MARCA-006: ningún texto que sale al cliente lleva un `.vercel.app` cuando hay dominio propio.
// Caso real: un mail a CH salió con `chestetica-erp.vercel.app`; la dirección oficial es
// `https://chestetica.gsgapp.com.ar`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { linkVercelEnTextoSaliente, origenPublico, origenPublicoSiDifiere, esHostVercel } from "./direccion-publica";
import { direccionDelLocal } from "./multilocal/multilocal-core";
import { mapaDeHostsVigente } from "./tenant";
import { linkDeConfirmado } from "./turnos/mensajes-whatsapp";
import { pasaleEsto } from "@/app/operador/(console)/alta/pasale-esto";

const PROD = { APP_BASE_DOMAIN: "gsgapp.com.ar", TENANT_HOST_MAP: "chestetica-erp.vercel.app=chestetica;magra-erp.vercel.app=magra" };
const SIN_DOMINIO = { APP_BASE_DOMAIN: "", TENANT_HOST_MAP: PROD.TENANT_HOST_MAP };

test("origenPublico: con dominio propio, el .vercel.app de CH pasa a chestetica.gsgapp.com.ar", () => {
  assert.equal(origenPublico("chestetica-erp.vercel.app", PROD), "https://chestetica.gsgapp.com.ar");
  assert.equal(origenPublico("Chestetica-ERP.vercel.app:443", PROD), "https://chestetica.gsgapp.com.ar");
  assert.equal(origenPublico("chestetica-erp.vercel.app, proxy.interno", PROD), "https://chestetica.gsgapp.com.ar");
});

test("origenPublico (no-cambio CH): por la dirección oficial queda igual", () => {
  assert.equal(origenPublico("chestetica.gsgapp.com.ar", PROD), "https://chestetica.gsgapp.com.ar");
  assert.equal(origenPublicoSiDifiere("chestetica.gsgapp.com.ar", PROD), undefined);
  assert.equal(origenPublicoSiDifiere("chestetica-erp.vercel.app", PROD), "https://chestetica.gsgapp.com.ar");
});

test("origenPublico: sin dominio propio, o host que el mapa no conoce, no se inventa nada", () => {
  assert.equal(origenPublico("chestetica-erp.vercel.app", SIN_DOMINIO), "https://chestetica-erp.vercel.app");
  assert.equal(origenPublico("otro-erp.vercel.app", PROD), "https://otro-erp.vercel.app");
  assert.equal(origenPublico("localhost:3000", PROD), "http://localhost:3000");
  assert.equal(origenPublico(null, PROD), null);
  assert.equal(origenPublico("", PROD), null);
});

test("esHostVercel", () => {
  assert.equal(esHostVercel("chestetica-erp.vercel.app"), true);
  assert.equal(esHostVercel("chestetica.gsgapp.com.ar"), false);
  assert.equal(esHostVercel("vercel.app.ejemplo.com"), false);
});

test("direccionDelLocal: sin dominio propio, un alias propio gana al .vercel.app", () => {
  const mapa = new Map([["chestetica-erp.vercel.app", "chestetica"], ["chestetica.gsgapp.com.ar", "chestetica"]]);
  assert.equal(direccionDelLocal("chestetica", { mapaDeHosts: mapa, dominioPropio: null }, "/admin/login"), "https://chestetica.gsgapp.com.ar/admin/login");
  // Sólo el .vercel.app: sigue siendo la única dirección que hay (comportamiento previo).
  const solo = new Map([["chestetica-erp.vercel.app", "chestetica"]]);
  assert.equal(direccionDelLocal("chestetica", { mapaDeHosts: solo, dominioPropio: null }, ""), "https://chestetica-erp.vercel.app");
});

// ── La guarda ────────────────────────────────────────────────────────────────

test("guarda: detecta un .vercel.app en un texto saliente sólo cuando hay dominio propio", () => {
  assert.equal(linkVercelEnTextoSaliente("Entrá en https://chestetica-erp.vercel.app/admin", PROD), "chestetica-erp.vercel.app");
  assert.equal(linkVercelEnTextoSaliente("Entrá en https://chestetica.gsgapp.com.ar/admin", PROD), null);
  assert.equal(linkVercelEnTextoSaliente("Entrá en https://chestetica-erp.vercel.app/admin", SIN_DOMINIO), null);
});

test("guarda: el mensaje del alta (mail/WhatsApp al dueño) armado con direccionDelLocal no lleva .vercel.app", () => {
  const direccion = direccionDelLocal(
    "chestetica",
    { mapaDeHosts: mapaDeHostsVigente(PROD), dominioPropio: PROD.APP_BASE_DOMAIN },
    "/admin",
  );
  assert.equal(direccion, "https://chestetica.gsgapp.com.ar/admin");
  const p = pasaleEsto({ negocio: "CH Estética", direccion, usuario: "duenia@ch.test", clave: null });
  assert.equal(linkVercelEnTextoSaliente(p.mensaje, PROD), null);
  assert.equal(linkVercelEnTextoSaliente(decodeURIComponent(p.whatsapp), PROD), null);
  assert.ok(p.mensaje.includes("https://chestetica.gsgapp.com.ar/admin"));
});

test("guarda: el WhatsApp de «Confirmado» de la agenda, con el origen público, no lleva .vercel.app", () => {
  const origen = origenPublico("chestetica-erp.vercel.app", PROD)!;
  const href = linkDeConfirmado(
    { turnoId: "t1", telefono: "+54 9 11 5555-0000", clienta: "Ana", servicio: "Limpieza facial", inicio: "2026-11-12T13:00:00.000Z" },
    origen,
  );
  assert.ok(href);
  const texto = decodeURIComponent(href!);
  assert.equal(linkVercelEnTextoSaliente(texto, PROD), null);
  assert.ok(texto.includes("https://chestetica.gsgapp.com.ar/reserva/turno/t1"));
});

test("guarda estática: ningún link https://….vercel.app escrito a mano en el código de la app", async () => {
  const { readdirSync, readFileSync, statSync } = await import("node:fs");
  const { join } = await import("node:path");
  const ofensores: string[] = [];
  const recorrer = (dir: string) => {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) { if (n !== "generated") recorrer(p); continue; }
      if (!/\.(ts|tsx)$/.test(n) || /\.test\.tsx?$/.test(n)) continue;
      readFileSync(p, "utf8").split("\n").forEach((l, i) => {
        if (/https?:\/\/[a-z0-9.-]+\.vercel\.app/i.test(l)) ofensores.push(`${p}:${i + 1}`);
      });
    }
  };
  recorrer("src");
  assert.deepEqual(ofensores, [], "Armá el link con direccionDelLocal / origenPublico, no con un host .vercel.app fijo");
});
