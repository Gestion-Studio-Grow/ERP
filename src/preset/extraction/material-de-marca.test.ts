import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SCHEMA_VERSION,
  emptyMaterial,
  field,
  validateMaterial,
  completenessScore,
  toProvisionHandoff,
  listFields,
  type MaterialDeMarca,
} from "./material-de-marca";

// Un material realista basado en el caso magra (docs/preventa/analisis-redes-magra.md),
// que ejercita las tres provenances: verificado / provisional / pedido-al-dueno.
function magraLike(): MaterialDeMarca {
  const m = emptyMaterial("MAGRA Meat Market", "2026-07-05");
  const src = "https://magrameatmarket.com.ar/";
  m.rubro = field("boutique de carnes premium", "verificado", { source: src });
  m.identidad.nombrePublico = field("MAGRA Meat Market", "verificado", { source: src });
  m.identidad.tagline = field("Esto no es una carnicería", "verificado", { source: src });
  m.identidad.tono = field("descontracturado, cercano, sin pretensiones", "verificado", {
    source: src,
  });
  m.identidad.accentPreset = field("oxblood", "provisional", {
    note: "estética oxblood/negro/crema descripta; hex exacto pendiente",
  });
  m.identidad.theme = field("light", "provisional", { note: "boutique clara" });
  m.modeloNegocio = field(
    "boutique premium envasada al vacío, delivery + WhatsApp (no mostrador al corte)",
    "verificado",
    { source: src },
  );
  m.catalogo = field(
    [
      { categoria: "Carne vacuna", items: ["Angus premium"], marcas: ["Estancia Don Ramón"] },
      { categoria: "Gourmet", items: ["pasta italiana", "conservas importadas"] },
    ],
    "verificado",
    { source: src },
  );
  m.contacto.whatsapp = field("+5491161354042", "verificado", {
    source: "https://linktr.ee/magrameatmarket",
  });
  m.contacto.ciudad = field("Canning", "verificado", { source: src });
  m.incumbente = field("Bistrosoft", "verificado", {
    source: "borders.bistrosoft.com/menu?commerceId=11113834",
  });
  m.fuentes = [src, "https://linktr.ee/magrameatmarket", "https://www.instagram.com/tiendamagra/"];
  m.pendientesDelDueno = ["lista de precios real + SKUs", "hex de marca", "acceso a Instagram"];
  return m;
}

test("emptyMaterial arranca honesto: todo pedido-al-dueno y válido", () => {
  const m = emptyMaterial("Nuevo Prospecto");
  assert.equal(m.schemaVersion, SCHEMA_VERSION);
  for (const { field } of listFields(m)) {
    assert.equal(field.provenance, "pedido-al-dueno");
    assert.equal(field.value, null);
  }
  // Un material vacío pero honesto es estructuralmente VÁLIDO (no completo, pero válido).
  assert.equal(validateMaterial(m).ok, true);
});

test("un material tipo magra es válido", () => {
  const res = validateMaterial(magraLike());
  assert.equal(res.ok, true, JSON.stringify(res.issues));
});

test("prospecto vacío es error", () => {
  const m = emptyMaterial("");
  const res = validateMaterial(m);
  assert.equal(res.ok, false);
  assert.ok(res.issues.some((i) => i.path === "prospecto" && i.severity === "error"));
});

test("verificado sin source es error (regla de oro)", () => {
  const m = emptyMaterial("X");
  m.identidad.nombrePublico = field("X", "verificado"); // falta source
  const res = validateMaterial(m);
  assert.equal(res.ok, false);
  assert.ok(
    res.issues.some(
      (i) => i.path === "identidad.nombrePublico" && /source/.test(i.message),
    ),
  );
});

test("sin valor pero marcado verificado es error", () => {
  const m = emptyMaterial("X");
  m.rubro = field<string>(null, "verificado", { source: "algo" });
  const res = validateMaterial(m);
  assert.equal(res.ok, false);
  assert.ok(res.issues.some((i) => i.path === "rubro" && i.severity === "error"));
});

test("provisional sin note es warning, no error", () => {
  const m = emptyMaterial("X");
  m.identidad.theme = field("dark", "provisional"); // sin note
  const res = validateMaterial(m);
  assert.equal(res.ok, true); // sigue válido
  assert.ok(
    res.issues.some(
      (i) => i.path === "identidad.theme" && i.severity === "warning",
    ),
  );
});

test("completenessScore: vacío = 0, magra tiene demo alto pero prod incompleto", () => {
  const vacio = completenessScore(emptyMaterial("X"));
  assert.equal(vacio.demo, 0);
  assert.equal(vacio.prod, 0);

  const magra = completenessScore(magraLike());
  // Todos los requeridos de demo están presentes en magraLike → demo == 1.
  assert.equal(magra.demo, 1);
  assert.deepEqual(magra.missingForDemo, []);
  // Prod pide logo/colores/dirección/etc. que magra no tiene → prod < 1.
  assert.ok(magra.prod < 1);
  assert.ok(magra.missingForProd.includes("identidad.logo"));
  assert.ok(magra.pendientes > 0);
});

test("toProvisionHandoff sólo emite valores presentes y marca provisionales", () => {
  const h = toProvisionHandoff(magraLike());
  assert.equal(h.prospecto, "MAGRA Meat Market");
  assert.equal(h.rubro, "boutique de carnes premium");
  assert.equal(h.flags.nombre, "MAGRA Meat Market");
  assert.equal(h.flags.whatsapp, "+5491161354042");
  assert.equal(h.flags.city, "Canning");
  assert.equal(h.flags.accentPreset, "oxblood");
  // accentPreset venía provisional → debe estar listado como provisional.
  assert.ok(h.provisionales.includes("identidad.accentPreset"));
  // logo/colores faltan → deben estar en bloqueantesProd.
  assert.ok(h.bloqueantesProd.includes("identidad.logo"));
  // los pendientes del dueño se arrastran al hand-off.
  assert.ok(h.bloqueantesProd.some((b) => /precios/.test(b)));
});

test("toProvisionHandoff no inventa: campos ausentes no aparecen en flags", () => {
  const h = toProvisionHandoff(magraLike());
  assert.equal(h.flags.contactNote, "Esto no es una carnicería"); // tagline presente
  assert.equal("email" in h.flags, false); // no había email → no se emite
});
