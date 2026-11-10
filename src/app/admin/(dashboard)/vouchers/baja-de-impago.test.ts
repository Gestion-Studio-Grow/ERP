// QA vouchers (FALLA 2): la baja de un impago no tenía pantalla. En la liquidación conciliada, junto
// a cada impago pendiente, «Dar de baja» con motivo obligatorio y confirmación, sólo con cash:manage.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { estadoDeBaja } from "@/lib/vouchers/liquidacion-core";
import { PREFIJO_BAJA_IMPAGO } from "@/lib/vouchers/voucher-core";

const base = { estado: "USADO", resultadoLiquidacion: "IMPAGO", liquidadoEn: null, liquidacionRef: null, liquidacionSemanalId: "l1" };

test("estadoDeBaja: la misma condición que darDeBajaImpago", () => {
  assert.equal(estadoDeBaja(base), "pendiente");
  assert.equal(estadoDeBaja({ ...base, resultadoLiquidacion: "PAGADO" }), null);
  assert.equal(estadoDeBaja({ ...base, resultadoLiquidacion: null }), null);
  assert.equal(estadoDeBaja({ ...base, liquidacionSemanalId: null }), null);
  assert.equal(estadoDeBaja({ ...base, estado: "ANULADO" }), null);
  assert.equal(estadoDeBaja({ ...base, liquidadoEn: new Date(), liquidacionRef: `${PREFIJO_BAJA_IMPAGO}no lo reconocen` }), "dada");
  // Saldado con un pago a cuenta (liquidadoEn sin prefijo de baja): no se ofrece.
  assert.equal(estadoDeBaja({ ...base, liquidadoEn: new Date(), liquidacionRef: "A cuenta: x" }), null);
});

const pagina = readFileSync(new URL("./liquidacion/[id]/page.tsx", import.meta.url), "utf8");
const forms = readFileSync(new URL("./LiquidacionFormularios.tsx", import.meta.url), "utf8");

test("la liquidación ofrece «Dar de baja» sólo junto a un impago pendiente y con cash:manage", () => {
  assert.match(pagina, /permisoEfectivo\(user, "cash:manage"\)/);
  assert.match(pagina, /\{puedeDarDeBaja && r\.baja === "pendiente" && \(/);
  assert.match(pagina, /<DarDeBajaImpago numero=\{r\.numero\} \/>/);
  assert.match(pagina, /r\.baja === "dada"/);
});

test("el formulario llama a bajaDeImpago con motivo obligatorio y pide confirmación", () => {
  assert.match(forms, /import \{ bajaDeImpago,/);
  assert.match(forms, /const r = await bajaDeImpago\(fd\);/);
  assert.match(forms, /fd\.set\("motivo", motivo\)/);
  assert.match(forms, /motivo\.trim\(\)\.length < MOTIVO_MINIMO_BAJA/);
  assert.match(forms, />\s*Dar de baja\s*</);
  assert.match(forms, /Sí, darlo de baja/);
  assert.match(forms, /required/);
});

test("la acción exige cash:manage y el interruptor (preparar) antes de escribir", () => {
  const acciones = readFileSync(new URL("../../../../lib/vouchers/liquidacion-actions.ts", import.meta.url), "utf8");
  assert.match(acciones, /requireCapability\("cash:manage"\)/);
  const cuerpo = acciones.slice(acciones.indexOf("export async function bajaDeImpago"));
  assert.match(cuerpo, /const ctx = await preparar\(\);/);
});
