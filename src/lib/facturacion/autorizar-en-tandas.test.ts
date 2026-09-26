// «Autorizar los N pendientes» manda los N (QA vuelta 1: con 59 mandaba 20 por toque) y no culpa
// a ARCA de un error nuestro (QA vuelta 2: 19 envíos trabados por la base se anunciaban como «ARCA
// no respondió… probá de nuevo en unos minutos», y cada toque los volvía a mandar).
import { test } from "node:test";
import assert from "node:assert/strict";
import { TANDA_DE_ARCA, autorizarEnTandas, avisoDeAutorizar, enviosASaltear, type TandaMandada } from "./autorizar-en-tandas";

type Resultado = "autorizado" | "rechazado" | "falla" | "sistema";

/**
 * Un despacho de mentira con el límite y el orden de verdad: toma hasta 20 envíos pendientes, del
 * más viejo al más nuevo, salteando los que le piden. `resultado(i)` es lo que le pasa SIEMPRE al
 * envío i: «falla» = ARCA no respondió; «sistema» = error nuestro (la base rechazó la operación).
 * Los dos dejan el envío pendiente, como `anotarFallaYSoltar` (arca-dispatch.ts).
 */
function despachoCon(pendientes: number, resultado: (i: number) => Resultado = () => "rechazado") {
  let abiertos = Array.from({ length: pendientes }, (_, i) => i);
  const intentos = new Map<number, number>();
  let llamadas = 0;
  const mandar = async (saltear: readonly string[] = []): Promise<TandaMandada> => {
    llamadas++;
    const t: TandaMandada = { procesados: 0, autorizados: 0, rechazados: 0, fallidos: 0, descartados: 0, quedan: 0, conErrorDelSistema: [] };
    const tomados = abiertos.filter((i) => !saltear.includes(`env_${i}`)).slice(0, TANDA_DE_ARCA);
    for (const i of tomados) {
      intentos.set(i, (intentos.get(i) ?? 0) + 1);
      const r = resultado(i);
      if (r === "falla" || r === "sistema") {
        t.fallidos++;
        if (r === "sistema") t.conErrorDelSistema.push(`env_${i}`);
        continue;
      }
      t.procesados++;
      abiertos = abiertos.filter((x) => x !== i);
      if (r === "autorizado") t.autorizados++;
      else t.rechazados++;
    }
    t.quedan = abiertos.length;
    return t;
  };
  return { mandar, llamadas: () => llamadas, intentosDe: (i: number) => intentos.get(i) ?? 0 };
}

test("un toque con 59 pendientes manda los 59 (tres tandas de a 20), no 20", async () => {
  const d = despachoCon(59);
  const avances: number[] = [];
  const r = await autorizarEnTandas(d.mandar, 59, (p) => avances.push(p.procesados));
  assert.equal(r.procesados, 59);
  assert.equal(r.quedan, 0);
  assert.equal(r.corte, "terminado");
  assert.equal(d.llamadas(), 3);
  assert.deepEqual(avances, [20, 40], "el botón dice cuántos lleva mientras manda");
  assert.match(avisoDeAutorizar(r).texto, /^Se mandaron 59 comprobantes a ARCA: 0 autorizados, 59 rechazados\./);
});

test("con 300 pendientes, un toque: 15 tandas y ninguno queda", async () => {
  const d = despachoCon(300, (i) => (i % 3 === 0 ? "rechazado" : "autorizado"));
  const r = await autorizarEnTandas(d.mandar, 300);
  assert.deepEqual([r.procesados, r.autorizados, r.rechazados, r.quedan, r.tandas], [300, 200, 100, 0, 15]);
});

test("si ARCA no responde, para en esa tanda y dice cuántos quedan (no le insiste a ARCA caído)", async () => {
  const d = despachoCon(59, (i) => (i >= 25 ? "falla" : "autorizado"));
  const r = await autorizarEnTandas(d.mandar, 59);
  assert.equal(r.corte, "arca-no-respondio");
  assert.equal(d.llamadas(), 2);
  assert.equal(r.quedan, 34);
  assert.equal(r.sinRespuesta, 15);
  assert.equal(r.delSistema, 0);
  const aviso = avisoDeAutorizar(r);
  assert.equal(aviso.tono, "atencion");
  assert.match(aviso.texto, /ARCA no respondió a 15\. Quedan 34 pendientes: probá de nuevo en unos minutos\./);
  assert.doesNotMatch(aviso.texto, /error del sistema/);
});

test("un error nuestro no se le achaca a ARCA ni invita a reintentar: lo dice como es y el toque sigue con el resto", async () => {
  // Lo de la QA vuelta 2: de 59, 19 chocan en la base (P2002) cada vez que se mandan.
  const trabados = new Set([1, 2, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37]);
  const d = despachoCon(59, (i) => (trabados.has(i) ? "sistema" : i % 5 === 0 ? "autorizado" : "rechazado"));
  const r = await autorizarEnTandas(d.mandar, 59);
  assert.equal(r.corte, "terminado", "no corta en la primera tanda: manda todo lo que se puede mandar");
  assert.equal(r.procesados, 40, "los 40 que no chocan se mandaron en el mismo toque");
  assert.equal(r.delSistema, 19);
  assert.equal(r.sinRespuesta, 0);
  assert.equal(r.quedan, 19, "los trabados siguen pendientes: el botón los sigue contando");
  for (const i of trabados) assert.equal(d.intentosDe(i), 1, `el envío ${i} se mandó una sola vez en el toque, no en cada tanda`);
  const aviso = avisoDeAutorizar(r);
  assert.equal(aviso.tono, "atencion");
  assert.match(aviso.texto, /No se pudieron mandar 19 por un error del sistema: ya quedó registrado y Soporte lo revisa\./);
  assert.doesNotMatch(aviso.texto, /ARCA no respondió|probá de nuevo|Tocá «Autorizar»/, "no invita a reintentar lo que reintentar no arregla");
});

test("si todo lo que queda falla por error nuestro, una sola tanda y no gira: el aviso no culpa a ARCA", async () => {
  const d = despachoCon(3, () => "sistema");
  const r = await autorizarEnTandas(d.mandar, 3);
  assert.equal(d.llamadas(), 1);
  assert.equal(r.corte, "terminado");
  assert.deepEqual([r.procesados, r.delSistema, r.quedan], [0, 3, 3]);
  assert.equal(
    avisoDeAutorizar(r).texto,
    "No se autorizó ni se rechazó ninguno. No se pudieron mandar 3 por un error del sistema: ya quedó registrado y Soporte lo revisa.",
  );
  const uno = await autorizarEnTandas(despachoCon(1, () => "sistema").mandar, 1);
  assert.match(avisoDeAutorizar(uno).texto, /No se pudo mandar uno por un error del sistema/);
});

test("ARCA sin respuesta y error nuestro en la misma tanda: cada uno con su causa, y el «probá de nuevo» cuenta sólo lo que ARCA dejó", async () => {
  const d = despachoCon(30, (i) => (i === 0 ? "sistema" : i >= 10 ? "falla" : "autorizado"));
  const r = await autorizarEnTandas(d.mandar, 30);
  assert.equal(r.corte, "arca-no-respondio");
  assert.deepEqual([r.procesados, r.delSistema, r.sinRespuesta, r.quedan], [9, 1, 10, 21]);
  assert.match(
    avisoDeAutorizar(r).texto,
    /No se pudo mandar uno por un error del sistema: ya quedó registrado y Soporte lo revisa\. ARCA no respondió a 10\. Quedan otros 20 pendientes: probá de nuevo en unos minutos\./,
  );
});

test("una tanda que no avanza corta (no gira en falso) y no persigue sin fin los que van entrando", async () => {
  const nada = { procesados: 0, autorizados: 0, rechazados: 0, fallidos: 0, descartados: 0, conErrorDelSistema: [] };
  const quieto = await autorizarEnTandas(async () => ({ ...nada, quedan: 5 }), 5);
  assert.equal(quieto.corte, "sin-avance");
  assert.equal(quieto.tandas, 1);
  let llamadas = 0;
  const sinFin = await autorizarEnTandas(async () => {
    llamadas++;
    return { ...nada, procesados: 20, autorizados: 20, quedan: 40 };
  }, 40);
  assert.equal(sinFin.corte, "tope");
  assert.equal(llamadas, 4, "las 2 tandas de los 40 del toque, más 2");
  assert.match(avisoDeAutorizar(sinFin).texto, /Tocá «Autorizar» otra vez\./);
});

test("el aviso usa el singular con uno", () => {
  assert.equal(
    avisoDeAutorizar({ procesados: 1, autorizados: 1, rechazados: 0, sinRespuesta: 0, delSistema: 0, quedan: 0, tandas: 1, corte: "terminado" }).texto,
    "Se mandó 1 comprobante a ARCA: 1 autorizado, 0 rechazados.",
  );
});

test("lo que la pantalla pide saltear se valida en el borde: sólo ids con forma de id, sin repetir y con tope", () => {
  assert.deepEqual(enviosASaltear(undefined), []);
  assert.deepEqual(enviosASaltear("env_1"), []);
  assert.deepEqual(enviosASaltear(["env_1", 7, null, "", "con espacio", "x".repeat(65), "env_1", "cm1abc-DEF_2"]), ["env_1", "cm1abc-DEF_2"]);
  assert.equal(enviosASaltear(Array.from({ length: 6000 }, (_, i) => `env_${i}`)).length, 5000);
});
