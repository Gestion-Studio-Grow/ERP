// ============================================================================
// UAT MAGRA 16/10 · Activar y borrar un producto: el negocio A no toca los de B (con RLS, como
// producción). El mismo recorrido que el archivo «sin-rls»: acá lo frenan las DOS capas.
// ============================================================================

import { test } from "node:test";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { probarProductoDeOtroNegocio } from "./producto-de-otro-negocio";

const laBase = baseEfimeraDelArchivo();

test("con RLS: el negocio A no puede activar, desactivar ni borrar un producto del negocio B", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  await probarProductoDeOtroNegocio(base, await prismaComoDuenio(base), ejecutarAccion);
});
