import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTenantHostMap, hostMapSubdomain } from "./tenant";
import { ALL_CAPABILITIES, ROLE_CAPABILITIES } from "./capabilities";
import { catalogo, resolverActivacion } from "@/modules";

// ============================================================================
// LAS AFIRMACIONES DE LOS DOCUMENTOS, EJECUTABLES.
// ============================================================================
//
// Este repo ya perdió tiempo con documentación que se contradecía a sí misma (RLS
// aplicado / no aplicado, en tres archivos que se citaban entre sí). La defensa no es
// escribir un doc mejor: es que las dos o tres afirmaciones que MANDAN SOBRE UNA ACCIÓN
// se rompan solas cuando el código cambia de opinión.
//
// Cada test de acá respalda una frase concreta que un operador va a leer y obedecer:
//   · docs/runbooks/alta-magra.md (Paso 8) y .env.vercel.template (§TENANT_HOST_MAP)
//   · docs/ESTADO-ACTUAL.md:133-134 (corrección sobre `modules:manage`)
//   · docs/producto/diseno-tienda-modulos.md §RULING y docs/runbooks/qa-seed-tenants.sql
//
// Si alguno se pone rojo, el arreglo NO es tocar el assert: es corregir el documento que
// quedó mintiendo.
// ============================================================================

// --- 1 · TENANT_HOST_MAP con 5 locales: por qué la edición va de una sola vez ---
//
// El runbook y la plantilla dicen "editá las 5 entradas en UNA edición verificando que
// las previas queden". Eso es un procedimiento manual y a mano nadie lo respeta salvo que
// entienda qué pasa si falla. Estos tres tests son ese "qué pasa", con el mapa real.

/** El valor de producción tal como lo documenta `.env.vercel.template:40`, + 4 locales de Magra. */
const MAPA_5_LOCALES = [
  "chestetica-erp.vercel.app=chestetica",
  "magra-erp.vercel.app=magra",
  "shinevelas-erp.vercel.app=shinevelas",
  "adosmanos-erp.vercel.app=adosmanos",
  "magra-canning-erp.vercel.app=magra-canning",
  "magra-lomas-erp.vercel.app=magra-lomas",
  "magra-ezeiza-erp.vercel.app=magra-ezeiza",
  "magra-monte-erp.vercel.app=magra-monte",
].join(";");

test("las 8 entradas del mapa de 5 locales resuelven, incluida la de beauty-spa", () => {
  const env = { TENANT_HOST_MAP: MAPA_5_LOCALES };
  assert.equal(parseTenantHostMap(MAPA_5_LOCALES).size, 8);
  // El cliente vivo primero: es el que no se puede degradar.
  assert.equal(hostMapSubdomain("chestetica-erp.vercel.app", env), "chestetica");
  assert.equal(hostMapSubdomain("magra-canning-erp.vercel.app", env), "magra-canning");
  assert.equal(hostMapSubdomain("magra-monte-erp.vercel.app", env), "magra-monte");
  // Con puerto y en mayúsculas (así llega `x-forwarded-host` a veces) sigue resolviendo.
  assert.equal(hostMapSubdomain("MAGRA-LOMAS-ERP.vercel.app:443", env), "magra-lomas");
});

test("perder UNA entrada al editar no rompe a las otras: rompe SÓLO a esa (y en silencio)", () => {
  // El accidente típico: se re-escribe la variable a mano y se cae la primera entrada.
  const sinChestetica = MAPA_5_LOCALES.split(";").slice(1).join(";");
  const env = { TENANT_HOST_MAP: sinChestetica };
  // Los 7 locales restantes andan perfecto — por eso el error pasa desapercibido en QA.
  assert.equal(hostMapSubdomain("magra-erp.vercel.app", env), "magra");
  assert.equal(parseTenantHostMap(sinChestetica).size, 7);
  // Y el único cliente vivo deja de tener ruteo. `null` acá = fail-closed más adelante
  // (src/lib/tenant.ts:150-154), no un fallback silencioso a otro tenant.
  assert.equal(hostMapSubdomain("chestetica-erp.vercel.app", env), null);
});

test("una entrada malformada se DESCARTA sin avisar — por eso hay que contar antes de guardar", () => {
  // `magra-lomas-erp.vercel.app` sin el `=`: el parser la saltea (tenant.ts:80). No lanza,
  // no loguea, no falla el build. Es exactamente la razón del paso "contar" del runbook.
  const roto = MAPA_5_LOCALES.replace("magra-lomas-erp.vercel.app=magra-lomas", "magra-lomas-erp.vercel.app");
  assert.equal(parseTenantHostMap(roto).size, 7, "una entrada rota se pierde sin ruido");
  assert.equal(hostMapSubdomain("magra-lomas-erp.vercel.app", { TENANT_HOST_MAP: roto }), null);
  // El resto queda intacto: nada avisa que falta un local.
  assert.equal(hostMapSubdomain("magra-ezeiza-erp.vercel.app", { TENANT_HOST_MAP: roto }), "magra-ezeiza");
});

// --- 2 · `modules:manage` NO es del dueño (docs/ESTADO-ACTUAL.md decía que sí) ---

test("el dueño NO tiene `modules:manage`: aprovisionar módulos vive en /operador", () => {
  // `ALL_CAPABILITIES` se deriva de `DEL_DUENIO` (capabilities.ts:84), así que esto se
  // rompe si alguien vuelve a metérsela al dueño — y ahí ESTADO-ACTUAL.md:133 tendría razón
  // otra vez y habría que revertir la corrección.
  assert.ok(
    !ALL_CAPABILITIES.includes("modules:manage"),
    "modules:manage volvió a las capacidades del dueño: revisá capabilities.ts:71-84 y ESTADO-ACTUAL.md",
  );
  for (const [rol, caps] of Object.entries(ROLE_CAPABILITIES)) {
    assert.ok(!caps.includes("modules:manage"), `el rol ${rol} no debería poder aprovisionar módulos`);
  }
});

// --- 3 · Prender MODULE_REGISTRY_ENABLED deja sin menú a beauty-spa ---

test("con el registro ENFORCED, la fila REAL de beauty-spa resuelve CERO módulos activos", () => {
  // Datos tomados de la fila viva, no inventados:
  //   SELECT slug, modules, "blueprintId" FROM "Tenant" WHERE slug = 'beauty-spa';
  //   → beauty-spa | {} | (null)
  // `enforced: true` simula MODULE_REGISTRY_ENABLED=on (es lo que le pasa
  // `getActiveModuleIds`, src/lib/module-gating.ts:34-41).
  const res = resolverActivacion(
    { tenantId: "beauty-spa", blueprintId: null, modules: [] },
    catalogo(),
    { enforced: true },
  );
  assert.equal(res.activos.length, 0, "si esto deja de dar 0, el ruling de los tres docs cambió");
  // Y no es que "falten dependencias" o "sea incompatible": no hay NADA que resolver.
  // El resolver parte de lo asignado y sólo resta (activation.ts:12-16,77, guardarraíl DX-6).
  assert.deepEqual(res.incompatibles, []);
  assert.deepEqual(res.desconocidos, []);
});

test("el mismo tenant con el registro APAGADO no gatea nada: por eso hoy tiene menú", () => {
  // `getActiveModuleIds` devuelve null con el flag OFF (module-gating.ts:28) y el predicado
  // deja pasar todo. Acá se prueba la otra mitad: la resolución en sí no cambia, lo que
  // cambia es que el llamador NO la toma como autoritativa.
  const res = resolverActivacion(
    { tenantId: "beauty-spa", blueprintId: null, modules: [] },
    catalogo(),
    { enforced: false },
  );
  assert.equal(res.enforced, false, "el resultado tiene que declararse NO autoritativo");
});
