// "Tu plan" (R3-F3): lo que ve el dueño, con las reglas ejecutadas.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { limitesDelNegocio } from "@/planes/limites";
import { DESTINO_SIN_LUGAR_USUARIOS } from "@/lib/usuarios-del-plan";
import { enlaceQuieroMas, filasDeTuPlan, numeroDeWhatsApp, RUTA_TU_PLAN, vistaDeTuPlan } from "./tu-plan";

const micro = () => limitesDelNegocio({ slug: "negocio-x", plan: "micro" }, []);

test("quien choca con el tope de usuarios llega a una página que existe (no a un 404)", () => {
  const [ruta, consulta] = DESTINO_SIN_LUGAR_USUARIOS.split("?");
  assert.equal(ruta, RUTA_TU_PLAN);
  assert.equal(consulta, "no-se-pudo=usuarios");
  const pagina = join(process.cwd(), "src", "app", "admin", "(dashboard)", ...ruta.replace(/^\/admin\//, "").split("/"), "page.tsx");
  assert.ok(existsSync(pagina), `falta ${pagina}`);
});

test("un Micro con el cupo de usuarios lleno ve el porqué y cómo seguir", () => {
  const l = micro();
  const tope = l.topes.usuarios.valor;
  assert.equal(typeof tope, "number");
  const v = vistaDeTuPlan({ limites: l, uso: { usuarios: tope ?? 0 }, noSePudo: "usuarios" });
  assert.equal(v.tipo, "plan");
  if (v.tipo !== "plan") return;
  assert.equal(v.aviso?.tono, "peligro");
  assert.match(v.aviso?.texto ?? "", /^No se pudo sumar a la persona\. Tu plan incluye hasta \d+ personas? con usuario/);
  const fila = v.filas.find((f) => f.id === "usuarios");
  assert.equal(fila?.cifra, `${tope} de ${tope}`);
  assert.equal(fila?.nivel, "completo");
  assert.match(fila?.detalle ?? "", /pedí más o da de baja/);
});

test("si mientras tanto se liberó un lugar, el aviso lo dice en vez de repetir el error", () => {
  const v = vistaDeTuPlan({ limites: micro(), uso: { usuarios: 0 }, noSePudo: "usuarios" });
  assert.ok(v.tipo === "plan" && v.aviso?.tono === "info" && /Ahora hay lugar/.test(v.aviso.texto));
  const sinAviso = vistaDeTuPlan({ limites: micro(), uso: { usuarios: 0 } });
  assert.ok(sinAviso.tipo === "plan" && sinAviso.aviso === null);
});

test("los comprobantes avisan al 80 % y al 100 %, y nunca dicen que se frena una venta", () => {
  const l = limitesDelNegocio({ slug: "negocio-x", plan: "micro" }, [
    { id: "e1", entity: "LimiteDelPlan", entityId: "comprobantesMes", action: "limite.ajustar", actor: "operator:prueba", channel: "operador", changes: { plan: "micro", valor: 10 }, createdAt: new Date("2026-09-01T12:00:00Z") },
  ]);
  const fila = (n: number) => filasDeTuPlan(l, { comprobantesMes: n }).find((f) => f.id === "comprobantesMes");
  assert.equal(fila(8)?.nivel, "cerca");
  assert.match(fila(8)?.detalle ?? "", /80 %.*siguen igual/);
  assert.equal(fila(10)?.nivel, "completo");
  assert.match(fila(10)?.detalle ?? "", /siguen igual/);
  assert.equal(fila(12)?.nivel, "pasado");
  assert.match(fila(12)?.detalle ?? "", /2 de más.*siguen igual/);
  for (const n of [8, 10, 12]) assert.doesNotMatch(fila(n)?.detalle ?? "", /no se pueden|frena/);
  assert.match(fila(8)?.detalle ?? "", /Ajustado para tu negocio por Gestión Studio Grow/);
});

test("lo que no se midió no se inventa: se muestra sólo lo que incluye el plan", () => {
  const l = micro();
  const locales = filasDeTuPlan(l, {}).find((f) => f.id === "locales");
  assert.equal(locales?.nivel, "sin-medir");
  const tope = l.topes.locales.valor;
  assert.match(locales?.cifra ?? "", tope === null ? /^Sin tope$/ : new RegExp(`^Hasta ${tope} local`));
});

test("sin plan del catálogo no hay topes: se ofrece escribir", () => {
  const v = vistaDeTuPlan({ limites: limitesDelNegocio({ slug: "negocio-x", plan: null }, []), uso: {} });
  assert.equal(v.tipo, "sin-plan");
});

test("el precio va marcado como provisional a confirmar", () => {
  const v = vistaDeTuPlan({ limites: micro(), uso: {} });
  assert.ok(v.tipo === "plan" && /^\$ [\d.]+ por mes \(provisional a confirmar\)$/.test(v.precio), v.tipo === "plan" ? v.precio : v.tipo);
});

test("«Quiero más» abre WhatsApp: directo a GSG si hay número; si no, para elegir contacto, nunca roto", () => {
  assert.equal(numeroDeWhatsApp("+54 9 11 1234-5678"), "5491112345678");
  assert.equal(numeroDeWhatsApp("provisional"), null);
  assert.equal(numeroDeWhatsApp(undefined), null);
  const directo = enlaceQuieroMas({ numero: "5491112345678", negocio: "Magra & Co", nombrePlan: "Micro comerciante" });
  assert.match(directo, /^https:\/\/wa\.me\/5491112345678\?text=/);
  assert.match(decodeURIComponent(directo.split("text=")[1]), /^Hola, soy de Magra & Co\. Tengo el plan Micro comerciante/);
  assert.match(enlaceQuieroMas({ numero: undefined, negocio: "X", nombrePlan: null }), /^https:\/\/wa\.me\/\?text=Hola/);
});
