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

test("branding provisional de magra (address/whatsapp/instagram) migró al rubro consolidado", () => {
  const rubro = getRetailRubro("carniceria")!;
  assert.ok(rubro.brandingDefaults.whatsapp, "whatsapp provisional presente");
  assert.ok(rubro.brandingDefaults.instagram, "instagram provisional presente");
  assert.ok(rubro.brandingDefaults.addressLine, "addressLine provisional presente");
});
