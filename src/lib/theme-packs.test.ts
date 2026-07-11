import { test } from "node:test";
import assert from "node:assert/strict";
import { THEME_PACKS, themeIdForBlueprint, themePack } from "./theme-packs";

test("themeIdForBlueprint: cada rubro demo mapea a su pack; desconocido/null → base neutra", () => {
  assert.equal(themeIdForBlueprint("servicios"), "servicios-spa");
  assert.equal(themeIdForBlueprint("carniceria"), "boutique-carne");
  assert.equal(themeIdForBlueprint("velas"), "boutique-velas");
  assert.equal(themeIdForBlueprint("padel"), "retail-deporte");
  assert.equal(themeIdForBlueprint("rubro-raro"), "gsg-base");
  assert.equal(themeIdForBlueprint(null), "gsg-base");
});

test("themePack: id desconocido → base neutra (nunca revienta)", () => {
  assert.equal(themePack("no-existe").id, "gsg-base");
  assert.equal(themePack(null).id, "gsg-base");
  assert.equal(themePack("boutique-velas").id, "boutique-velas");
});

test("los packs NO copian la paleta Nocturne de CH (hueso #f6f3ec / petróleo)", () => {
  for (const p of Object.values(THEME_PACKS)) {
    assert.notEqual(p.light.surface.toLowerCase(), "#f6f3ec", `${p.id} usa el hueso de CH`);
    assert.notEqual(p.light.surfaceSunken.toLowerCase(), "#ece7db", `${p.id} usa el sunken de CH`);
  }
});

test("los packs son DISTINTOS entre sí: surface (papel) y fuente de título únicos por rubro", () => {
  const demos = ["servicios-spa", "boutique-velas", "retail-deporte", "boutique-carne"] as const;
  const surfacesDark = demos.map((id) => THEME_PACKS[id].dark.surface);
  assert.equal(new Set(surfacesDark).size, demos.length, "los fondos oscuros del backoffice deberían ser todos distintos");
  const surfacesLight = demos.map((id) => THEME_PACKS[id].light.surface);
  assert.equal(new Set(surfacesLight).size, demos.length, "los papeles claros del front deberían ser todos distintos");
  // Densidad y tipografía: al menos 3 combinaciones distintas (no "el mismo con otro color").
  const sig = demos.map((id) => `${THEME_PACKS[id].display}/${THEME_PACKS[id].body}/${THEME_PACKS[id].density}`);
  assert.ok(new Set(sig).size >= 3, `esperaba packs variados, hubo: ${sig.join(" · ")}`);
});

test("todos los neutros son hex/rgba válidos (light y dark)", () => {
  const ok = (c: string) => /^#[0-9a-f]{6}$/i.test(c) || /^rgba?\(/i.test(c);
  for (const p of Object.values(THEME_PACKS)) {
    for (const mode of [p.light, p.dark]) {
      for (const [k, v] of Object.entries(mode)) {
        assert.ok(ok(v), `${p.id}.${k} = "${v}" no es un color válido`);
      }
    }
  }
});
