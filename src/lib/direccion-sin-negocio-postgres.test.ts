// QA 26/09, bloqueante 4: el dueño que entraba por una dirección que todavía no abre ningún
// negocio ponía su clave y veía «Se produjo un error inesperado». La decisión se ejecuta contra una
// base con DOS negocios (como producción): una dirección sin negocio es `DireccionSinNegocioError`
// y la pantalla de ingreso lo sabe (`direccionConNegocio` = false); con negocio, true; y una falla
// de otra clase (la base caída) no se disfraza de «dirección no habilitada».
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest } from "@/test/base-efimera";

test("una dirección sin negocio se reconoce; con negocio entra; otra falla se propaga", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  const { resolveTenantId, direccionConNegocio, DireccionSinNegocioError } = await import("./tenant");

  // Host que no está en el mapa ni es del dominio base (el caso de losandes-lab en el laboratorio).
  await assert.rejects(resolveTenantId("losandes-lab.localhost"), DireccionSinNegocioError);
  assert.equal(await direccionConNegocio(() => resolveTenantId("losandes-lab.localhost")), false);
  // Subdominio del dominio base sin negocio cargado.
  await assert.rejects(resolveTenantId("no-existe.erp.test"), DireccionSinNegocioError);
  assert.equal(await direccionConNegocio(() => resolveTenantId("no-existe.erp.test")), false);
  // La dirección de un negocio real entra.
  assert.equal(await resolveTenantId(base.a.host), base.a.id);
  assert.equal(await direccionConNegocio(() => resolveTenantId(base.a.host)), true);
  // La base caída NO es «dirección no habilitada»: se propaga.
  await assert.rejects(direccionConNegocio(async () => { throw new Error("ECONNREFUSED"); }), /ECONNREFUSED/);
});
