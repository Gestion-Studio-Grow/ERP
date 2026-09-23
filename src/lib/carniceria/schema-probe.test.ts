// Lotes y Despiece según el negocio: la migración cárnica es de TODA la base, así que "la tabla
// existe" no alcanza; además el rubro tiene que vender perecederos (dato del blueprint).

import { test } from "node:test";
import assert from "node:assert/strict";
import { estadoLotesYDespiece } from "./schema-probe";
import { resolveRubroId, rubroConPerecederos } from "@/blueprints/retail/rubros";

const perecederosDe = (slug: string, blueprintId: string | null = null) => rubroConPerecederos(resolveRubroId({ slug, blueprintId }));

test("con la migración aplicada: MAGRA los ve; Shine y A Dos Manos no (antes los hubieran visto)", () => {
  assert.equal(estadoLotesYDespiece(perecederosDe("magra"), true), "lista");
  assert.equal(estadoLotesYDespiece(perecederosDe("magra-canning", "carniceria"), true), "lista");
  assert.equal(estadoLotesYDespiece(perecederosDe("shinevelas"), true), "no-aplica");
  assert.equal(estadoLotesYDespiece(perecederosDe("adosmanos", "padel"), true), "no-aplica");
  assert.equal(estadoLotesYDespiece(perecederosDe("beauty-spa"), true), "no-aplica", "CH: servicios");
});

test("sin la migración (producción hasta la ola 9): MAGRA ve 'En preparación'; el resto, nada", () => {
  assert.equal(estadoLotesYDespiece(perecederosDe("magra"), false), "falta-migracion");
  assert.equal(estadoLotesYDespiece(perecederosDe("shinevelas"), false), "no-aplica");
  assert.equal(estadoLotesYDespiece(perecederosDe("beauty-spa"), false), "no-aplica");
});
