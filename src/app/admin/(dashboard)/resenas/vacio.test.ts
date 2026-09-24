// Reseñas vacías: el botón a la bandeja sólo en el piloto y sólo si la bandeja se puede abrir.
// El caso de CH sale de medir `appPermitida` con su negocio (contexto null): la bandeja da
// permitida para OWNER y RECEPTION, así que el piloto es lo único que la frena.

import { test } from "node:test";
import assert from "node:assert/strict";
import { appPermitida, type NegocioApps } from "@/apps/visibles";
import { appPorId } from "@/apps/registro";
import { vacioDeResenas } from "./vacio";

const PEDIR = { href: "/admin/clientes/hoy", etiqueta: "Pedir reseñas" };

test("en el piloto, con la bandeja a mano, el siguiente paso es pedirlas desde ahí", () => {
  const p = vacioDeResenas({ piloto: true, bandejaPermitida: true });
  assert.deepEqual(p.accion, PEDIR);
});

test("en el piloto sin la bandeja no hay botón que termine en 'App no disponible'", () => {
  const p = vacioDeResenas({ piloto: true, bandejaPermitida: false });
  assert.equal(p.accion, null);
  assert.match(p.descripcion, /turno completado/);
});

test("CH (fuera del piloto) no recibe el botón a la bandeja, aunque el permiso la deje abrir", () => {
  for (const role of ["OWNER", "RECEPTION", "PROFESSIONAL"] as const) {
    const ch: NegocioApps = {
      role,
      contexto: null,
      modulosAsignados: [],
      perfil: null,
      esMostrador: false,
      carniceriaLista: false,
    };
    const p = vacioDeResenas({ piloto: false, bandejaPermitida: appPermitida(appPorId("para-contactar-hoy"), ch) });
    assert.equal(p.accion, null, role);
  }
});
