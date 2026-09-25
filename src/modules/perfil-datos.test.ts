import { test } from "node:test";
import assert from "node:assert/strict";
import {
  avisosDeDatosQueQuedan,
  camposAjenosAlPlan,
  CAMPOS_DEL_CAMBIO_DE_PLAN,
  datosDelCambioDePlan,
  diferenciasDeConteo,
} from "./perfil-datos";

test("un cambio de plan sólo escribe plan, modules y profile", () => {
  assert.deepEqual([...CAMPOS_DEL_CAMBIO_DE_PLAN], ["plan", "modules", "profile"]);
  const d = datosDelCambioDePlan({ plan: "micro", modules: ["pos", "pos"], profile: "lite" });
  assert.deepEqual(Object.keys(d).sort(), ["modules", "plan", "profile"]);
  assert.deepEqual(d.modules, ["pos"], "sin repetidos");
});

test("un campo de más (un dato del negocio) se rechaza antes de escribir", () => {
  const conDatos = { plan: "micro", modules: [], profile: "lite", status: "SUSPENDED", name: "Otro" };
  assert.deepEqual(camposAjenosAlPlan(conDatos), ["name", "status"]);
  assert.throws(
    () => datosDelCambioDePlan(conDatos as unknown as Parameters<typeof datosDelCambioDePlan>[0]),
    /sólo prende o apaga pantallas: no puede escribir name, status/,
  );
});

test("plan vacío, módulo vacío o perfil desconocido: no se escribe nada", () => {
  assert.throws(() => datosDelCambioDePlan({ plan: " ", modules: [], profile: "lite" }), /plan nuevo/);
  assert.throws(() => datosDelCambioDePlan({ plan: "micro", modules: [""], profile: "lite" }), /sin vacíos/);
  assert.throws(
    () => datosDelCambioDePlan({ plan: "micro", modules: [], profile: "gold" as unknown as "lite" }),
    /Perfil desconocido/,
  );
});

test("lo que se apaga avisa que los datos quedan guardados", () => {
  const [linea] = avisosDeDatosQueQuedan([{ id: "multilocal", nombre: "Mis locales" }]);
  assert.match(linea, /«Mis locales» se apaga: lo cargado queda guardado/);
});

test("conteos por tabla: iguales no dan diferencias; uno menos, una tabla nueva o una que falta, sí", () => {
  assert.deepEqual(diferenciasDeConteo({ Order: 10, Client: 3 }, { Client: 3, Order: 10 }), []);
  assert.deepEqual(diferenciasDeConteo({ Order: 10, Client: 3 }, { Order: 9, Client: 3, Nueva: 0 }), [
    { tabla: "Nueva", antes: null, despues: 0 },
    { tabla: "Order", antes: 10, despues: 9 },
  ]);
  assert.deepEqual(diferenciasDeConteo({ Order: 1 }, {}), [{ tabla: "Order", antes: 1, despues: null }]);
});
