// Tests del rubro retail `carniceria` (magra) — blindan la consolidación 2026-07-06:
// el blueprint standalone viejo (catálogo genérico, `carniceria.ts`) se retiró a favor
// de ESTE rubro (catálogo boutique premium informado por el negocio real de magra),
// para que no vuelva a quedar una definición duplicada/divergente sin uso.

import { test } from "node:test";
import assert from "node:assert/strict";
import { getBlueprint } from "../index";
import { getRetailRubro, resolveRubroIdBySlug } from "./index";

test("magra resuelve al rubro retail `carniceria`", () => {
  assert.equal(resolveRubroIdBySlug("magra"), "carniceria");
});

test("el blueprint registrado `carniceria` es el de la familia retail (catálogo boutique, no el genérico viejo)", () => {
  const bp = getBlueprint("carniceria");
  const rubro = getRetailRubro("carniceria")!;
  assert.equal(bp.brandingDefaults?.shortLabel, rubro.brandingDefaults.shortLabel);
  // Marca de la línea premium real de magra (Estancia Don Ramón) — ausente en el
  // catálogo genérico viejo, presente en el rubro consolidado.
  assert.ok(rubro.catalog.some((i) => i.name.toLowerCase().includes("lomo")));
  assert.ok(rubro.catalog.some((i) => i.name.toLowerCase().includes("sorrentinos")), "línea gourmet presente");
});

test("branding provisional de magra (address/instagram) migró al rubro consolidado", () => {
  const rubro = getRetailRubro("carniceria")!;
  assert.ok(rubro.brandingDefaults.instagram, "instagram provisional presente");
  assert.ok(rubro.brandingDefaults.addressLine, "addressLine provisional presente");
});

// Fix M-2 (reporte QA 2026-07-06): el Instagram provisional de magra apuntaba a un
// handle real pero EQUIVOCADO ("@magra.carniceria", cuenta ajena/inexistente para el
// negocio) sin ninguna marca visual de que era un dato provisional. Debe quedar como
// placeholder MARCADO (a confirmar por el dueño), no como un handle que parece real.
test("Instagram provisional de magra: placeholder marcado, no el handle equivocado detectado por QA", () => {
  const rubro = getRetailRubro("carniceria")!;
  const ig = rubro.brandingDefaults.instagram ?? "";
  assert.notEqual(ig, "@magra.carniceria", "no debe ser el handle equivocado que reportó QA");
  assert.match(ig.toLowerCase(), /confirmar/, "debe quedar visiblemente marcado como pendiente de confirmar");
});

test("brandingDefaults NUNCA trae un whatsapp hardcodeado (regla dura — sin número real, el CTA lo pide just-in-time)", () => {
  const rubro = getRetailRubro("carniceria")!;
  assert.ok(!rubro.brandingDefaults.whatsapp, "whatsapp no debe tener un default falso/placeholder");
});
