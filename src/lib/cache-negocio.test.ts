// Aislamiento de la caché por negocio: un negocio NUNCA lee la entrada de otro.
// La caché de prueba guarda SÓLO por las partes de la clave (como la de Next, que suma la clave a los argumentos):
// si el `tenantId` no estuviera en la clave, el segundo negocio leería lo del primero y estas pruebas fallarían.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cachePorNegocio,
  claveDelNegocio,
  etiquetaDelNegocio,
  invalidarNegocio,
  NegocioInvalidoParaCacheError,
  type EnvolverConCache,
} from "./cache-negocio";

const NEGOCIO_A = "tenant_aaaaaaaaaaaa";
const NEGOCIO_B = "tenant_bbbbbbbbbbbb";

function cacheDePrueba() {
  const entradas = new Map<string, { valor: unknown; tags: string[] }>();
  const envolver: EnvolverConCache = (leer, clave, opciones) => async () => {
    const k = JSON.stringify(clave);
    const hay = entradas.get(k);
    if (hay) return hay.valor as never;
    const valor = await leer();
    entradas.set(k, { valor, tags: opciones.tags });
    return valor;
  };
  const vencer = (etiqueta: string) => {
    for (const [k, e] of entradas) if (e.tags.includes(etiqueta)) entradas.delete(k);
  };
  return { entradas, envolver, vencer };
}

const sinContexto = <T,>(_tenantId: string, fn: () => Promise<T>) => fn();

test("cada negocio lee lo suyo: B no recibe la entrada que dejó A", async () => {
  const { envolver } = cacheDePrueba();
  const lecturas: string[] = [];
  const leer = cachePorNegocio("vidriera", async (tenantId) => { lecturas.push(tenantId); return { de: tenantId }; },
    { revalidate: 30, envolver, enContexto: sinContexto });

  assert.deepEqual(await leer(NEGOCIO_A), { de: NEGOCIO_A });
  assert.deepEqual(await leer(NEGOCIO_B), { de: NEGOCIO_B });
  assert.deepEqual(await leer(NEGOCIO_A), { de: NEGOCIO_A });
  assert.deepEqual(await leer(NEGOCIO_B), { de: NEGOCIO_B });
  // Dos lecturas reales (una por negocio); las otras dos salieron de la caché de cada uno.
  assert.deepEqual(lecturas, [NEGOCIO_A, NEGOCIO_B]);
});

test("la clave y la etiqueta llevan el negocio y no coinciden entre negocios", () => {
  assert.deepEqual(claveDelNegocio(NEGOCIO_A, "vidriera"), ["negocio", NEGOCIO_A, "vidriera"]);
  assert.notDeepEqual(claveDelNegocio(NEGOCIO_A, "vidriera"), claveDelNegocio(NEGOCIO_B, "vidriera"));
  assert.equal(etiquetaDelNegocio(NEGOCIO_A, "vidriera"), `negocio:${NEGOCIO_A}:vidriera`);
  assert.notEqual(etiquetaDelNegocio(NEGOCIO_A, "vidriera"), etiquetaDelNegocio(NEGOCIO_B, "vidriera"));
});

test("el lector corre con el negocio pedido en contexto (el que usa Prisma)", async () => {
  const { envolver } = cacheDePrueba();
  const contextos: string[] = [];
  const leer = cachePorNegocio("vidriera", async () => "ok", {
    revalidate: 30, envolver,
    enContexto: (tenantId, fn) => { contextos.push(tenantId); return fn(); },
  });
  await leer(NEGOCIO_A);
  await leer(NEGOCIO_B);
  assert.deepEqual(contextos, [NEGOCIO_A, NEGOCIO_B]);
});

test("con el contexto real, el lector ve el tenantId del negocio pedido", async () => {
  const { getTenantStore } = await import("./tenant-context");
  const { envolver } = cacheDePrueba();
  const leer = cachePorNegocio("vidriera", async () => getTenantStore()?.tenantId ?? null, { revalidate: 30, envolver });
  assert.equal(await leer(NEGOCIO_A), NEGOCIO_A);
  assert.equal(await leer(NEGOCIO_B), NEGOCIO_B);
});

test("sin negocio o con forma rara: falla cerrado, sin leer ni escribir la caché", () => {
  const { envolver, entradas } = cacheDePrueba();
  let lecturas = 0;
  const leer = cachePorNegocio("vidriera", async () => { lecturas++; return 1; }, { revalidate: 30, envolver, enContexto: sinContexto });
  for (const malo of ["", " ", "a".repeat(65), "tenant a", "tenant:aaaaaaaa", "../aaaaaaaa", undefined, null, 42]) {
    assert.throws(() => leer(malo as never), NegocioInvalidoParaCacheError);
    assert.throws(() => etiquetaDelNegocio(malo as never, "vidriera"), NegocioInvalidoParaCacheError);
    assert.throws(() => claveDelNegocio(malo as never, "vidriera"), NegocioInvalidoParaCacheError);
  }
  assert.equal(lecturas, 0);
  assert.equal(entradas.size, 0);
});

test("invalidar A vence sólo la entrada de A; la de B sigue", async () => {
  const { envolver, vencer } = cacheDePrueba();
  const lecturas: string[] = [];
  const leer = cachePorNegocio("vidriera", async (tenantId) => { lecturas.push(tenantId); return lecturas.length; },
    { revalidate: 30, envolver, enContexto: sinContexto });
  await leer(NEGOCIO_A);
  await leer(NEGOCIO_B);
  assert.equal(invalidarNegocio(NEGOCIO_A, "vidriera", vencer), true);
  await leer(NEGOCIO_A);
  await leer(NEGOCIO_B);
  assert.deepEqual(lecturas, [NEGOCIO_A, NEGOCIO_B, NEGOCIO_A]);
});

test("invalidar fuera de un pedido no rompe la escritura: devuelve false y el dato vence por tiempo", () => {
  const explota = () => { throw new Error("Invariant: static generation store missing"); };
  assert.equal(invalidarNegocio(NEGOCIO_A, "vidriera", explota), false);
  // Un id inválido tampoco lanza (la escritura ya se guardó) y no llega a vencer nada.
  let llamadas = 0;
  assert.equal(invalidarNegocio("", "vidriera", () => { llamadas++; }), false);
  assert.equal(llamadas, 0);
});
