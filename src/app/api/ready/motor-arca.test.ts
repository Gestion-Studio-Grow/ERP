import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HORAS_CRON_SIN_CORRER,
  RECHAZOS_MASIVOS_24H,
  alertasDeNegocio,
  configMotorArca,
  resumirMotorArca,
  type HechosNegocio,
} from "./motor-arca";
import { CACHE_MS, estadoMotorArca, medirMotorArca, olvidarCacheMotorArca, type DepsMedicion } from "./motor-arca.server";

const AHORA = new Date("2026-10-22T12:00:00Z");
const ON = { ARCA_INVOICING_ENABLED: "true", ARCA_MODO: "homologacion" };
const hace = (min: number) => new Date(AHORA.getTime() - min * 60_000);

const sano: HechosNegocio = {
  pendientes: 0,
  enDuda: 0,
  trabados: 0,
  muertos: 0,
  pendienteMasViejo: null,
  ultimoExito: hace(30),
  rechazos24h: 0,
};

test("facturación apagada: estado 'apagado' y no mira nada", () => {
  const r = resumirMotorArca([{ ...sano, enDuda: 5 }], { ahora: AHORA, env: {} });
  assert.equal(r.estado, "apagado");
  assert.equal(r.facturacion, false);
  assert.equal(r.modo, "stub");
  assert.deepEqual(r.alertas, []);
});

test("todo sano: 'ok' y el último éxito es el más reciente de todos", () => {
  const r = resumirMotorArca([sano, { ...sano, ultimoExito: hace(5) }], { ahora: AHORA, env: ON });
  assert.equal(r.estado, "ok");
  assert.equal(r.modo, "homologacion");
  assert.equal(r.ultimoExito, hace(5).toISOString());
  assert.equal(r.pendienteMasViejoMin, null);
});

test("un CAE en duda es crítico", () => {
  const r = resumirMotorArca([sano, { ...sano, pendientes: 1, enDuda: 1, pendienteMasViejo: hace(20) }], {
    ahora: AHORA,
    env: ON,
  });
  assert.equal(r.estado, "critico");
  assert.deepEqual(r.alertas, ["cae-en-duda"]);
  assert.equal(r.enDuda, 1);
  assert.equal(r.negociosConAlerta, 1);
  assert.equal(r.pendienteMasViejoMin, 20);
});

test("cron sin correr: un pendiente de más de 26 h es crítico (y sin éxito reciente)", () => {
  const viejo = { ...sano, pendientes: 2, pendienteMasViejo: hace(HORAS_CRON_SIN_CORRER * 60 + 1), ultimoExito: hace(3 * 24 * 60) };
  assert.deepEqual(alertasDeNegocio(viejo, AHORA), ["cron-sin-correr", "sin-exito-reciente"]);
  assert.equal(resumirMotorArca([viejo], { ahora: AHORA, env: ON }).estado, "critico");
});

test("pendiente reciente con último éxito reciente no alerta", () => {
  assert.deepEqual(alertasDeNegocio({ ...sano, pendientes: 3, pendienteMasViejo: hace(60) }, AHORA), []);
});

test("trabados y pocos rechazos son 'atencion'; rechazos masivos y muertos son críticos", () => {
  assert.equal(resumirMotorArca([{ ...sano, trabados: 1, pendientes: 1, pendienteMasViejo: hace(10) }], { ahora: AHORA, env: ON }).estado, "atencion");
  assert.equal(resumirMotorArca([{ ...sano, rechazos24h: 3 }], { ahora: AHORA, env: ON }).estado, "atencion");
  const masivo = resumirMotorArca([{ ...sano, rechazos24h: RECHAZOS_MASIVOS_24H }], { ahora: AHORA, env: ON });
  assert.equal(masivo.estado, "critico");
  assert.deepEqual(masivo.alertas, ["rechazos-masivos"]);
  assert.equal(resumirMotorArca([{ ...sano, muertos: 1 }], { ahora: AHORA, env: ON }).estado, "critico");
});

test("la respuesta nunca trae ids de negocio", () => {
  const r = resumirMotorArca([{ ...sano, enDuda: 1 }], { ahora: AHORA, env: ON });
  const texto = JSON.stringify(r);
  for (const k of ["tenant", "slug", "cuit", "id\""]) assert.ok(!texto.toLowerCase().includes(k), k);
});

test("health: config sin secretos (sólo si existe el del cron)", () => {
  const c = configMotorArca({ ...ON, CRON_SECRET: "super-secreto" });
  assert.deepEqual(c, { facturacion: true, modo: "homologacion", cronProtegido: true });
  assert.ok(!JSON.stringify(c).includes("super-secreto"));
  assert.equal(configMotorArca({ CRON_SECRET: "  " }).cronProtegido, false);
});

function deps(over: Partial<DepsMedicion> = {}): DepsMedicion {
  return {
    ids: async () => ["t1", "t2"],
    medir: async () => sano,
    env: ON,
    ahora: () => AHORA,
    ...over,
  };
}

test("medir: con la facturación apagada no toca la base", async () => {
  let llamadas = 0;
  const r = await medirMotorArca(deps({ env: {}, ids: async () => (llamadas++, []) }));
  assert.equal(r.estado, "apagado");
  assert.equal(llamadas, 0);
});

test("medir: un negocio que falla no tumba la medición; se cuenta y alerta", async () => {
  const r = await medirMotorArca(
    deps({
      medir: async (id) => {
        if (id === "t2") throw new Error("boom");
        return sano;
      },
    }),
  );
  assert.equal(r.negociosSinMedir, 1);
  assert.deepEqual(r.alertas, ["medicion-incompleta"]);
  assert.equal(r.estado, "atencion");
});

test("medir: si no se pueden listar los negocios, 'sin-medicion'", async () => {
  const r = await medirMotorArca(deps({ ids: async () => Promise.reject(new Error("db")) }));
  assert.equal(r.estado, "sin-medicion");
});

test("cache: una medición completa se reusa CACHE_MS; una incompleta no", async () => {
  olvidarCacheMotorArca();
  let medidas = 0;
  let reloj = AHORA.getTime();
  const d = deps({ medir: async () => (medidas++, sano), ahora: () => new Date(reloj) });
  await estadoMotorArca(d);
  await estadoMotorArca(d);
  assert.equal(medidas, 2); // dos negocios, una sola medición
  reloj += CACHE_MS + 1;
  await estadoMotorArca(d);
  assert.equal(medidas, 4);

  // Apagar la llave se ve en el acto aunque haya una medición en caché.
  const env: Record<string, string | undefined> = { ...ON };
  await estadoMotorArca({ ...d, env });
  env.ARCA_INVOICING_ENABLED = "false";
  assert.equal((await estadoMotorArca({ ...d, env })).estado, "apagado");

  olvidarCacheMotorArca();
  let fallas = 0;
  const rota = deps({ medir: async () => (fallas++, Promise.reject(new Error("x"))) });
  await estadoMotorArca(rota);
  await estadoMotorArca(rota);
  assert.equal(fallas, 4);
  olvidarCacheMotorArca();
});
