// SEG-020: tope de intentos del PIN de dueño en la base (src/lib/club/tope-pin-servidor.ts), con una base de mentira
// en memoria (el mismo tope contra Postgres real está en firma-del-duenio-postgres.test.ts).
// Reglas: los fallos cuentan por dueño (lo que se prueba contra ESE dueño) y aparte los que no dicen de qué dueño;
// un acierto sólo limpia los del dueño que acertó; un techo por negocio cuenta todos los fallos y ningún acierto lo
// limpia. Durante la espera no se llama a `verificar`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { TECHO_FALLOS_NEGOCIO, conTopeDePin, type CorrerEnElNegocio } from "./tope-pin-servidor";

const NEGOCIO = "negocio-tope";
const DUENIOS = ["u-rober", "u-majo", "u-d3", "u-d4", "u-d5", "u-d6", "u-d7", "u-d8"];

/** Una base en memoria con lo que usa el tope (AuditLog por negocio y clave). */
function baseEnMemoria() {
  let filas: { entityId: string; changes: unknown }[] = [];
  const db = {
    $executeRaw: async () => 0,
    auditLog: {
      findFirst: async ({ where }: { where: { entityId: string } }) => filas.filter((f) => f.entityId === where.entityId).at(-1) ?? null,
      deleteMany: async ({ where }: { where: { entityId: string } }) => {
        filas = filas.filter((f) => f.entityId !== where.entityId);
        return { count: 0 };
      },
      create: async ({ data }: { data: { entityId: string; changes: unknown } }) => {
        filas.push({ entityId: data.entityId, changes: JSON.parse(JSON.stringify(data.changes)) });
        return data;
      },
    },
  };
  const correr: CorrerEnElNegocio = (_tenantId, fn) => fn(db as never);
  return { correr };
}

function tope(ambito: "pin" | "codigo" = "pin") {
  const { correr } = baseEnMemoria();
  let ahoraMs = 1_000_000;
  let llamadas = 0;
  /** Un intento: `acierta` = el PIN es el de `limpia` (o un acierto que no limpia nada si `limpia` es null). */
  const intento = (usuarioId: string | null, acierta: boolean, limpia: string | null = acierta ? usuarioId : null) =>
    conTopeDePin(
      NEGOCIO,
      ambito,
      () => {
        llamadas += 1;
        // `duenio`: lo que mandaba la versión anterior (queda para que el test corra contra las dos).
        return { ok: acierta, duenio: acierta, limpia };
      },
      { usuarioId, ahoraMs, correr },
    );
  return {
    intento,
    pasar: (ms: number) => (ahoraMs += ms),
    llamadas: () => llamadas,
  };
}

test("4 fallos contra otro dueño + 1 acierto propio, repetido: se frena antes de 25 fallos", async () => {
  for (const blanco of ["u-majo", null] as const) {
    const t = tope();
    let fallos = 0;
    let frenado = false;
    for (let vuelta = 0; vuelta < 30 && !frenado; vuelta++) {
      for (let k = 0; k < 4; k++) {
        const r = await t.intento(blanco, false);
        if (r.espera) {
          frenado = true;
          break;
        }
        fallos += 1;
      }
      if (!frenado) await t.intento("u-rober", true);
    }
    assert.ok(frenado, `${blanco ?? "sin usuario"}: nunca espera`);
    assert.ok(fallos < 25, `${blanco ?? "sin usuario"}: ${fallos} fallos evaluados`);
    assert.equal(fallos, 5, "el balde de ese blanco no lo limpia el acierto de otro dueño");
  }
});

test("repartido entre dueños con aciertos en el medio: el techo del negocio frena y ningún acierto lo limpia", async () => {
  const t = tope();
  let fallos = 0;
  for (let vuelta = 0; ; vuelta++) {
    const blanco = DUENIOS[1 + (vuelta % (DUENIOS.length - 1))];
    let frenado = false;
    for (let k = 0; k < 4; k++) {
      const r = await t.intento(blanco, false);
      if (r.espera) {
        frenado = true;
        break;
      }
      fallos += 1;
    }
    if (frenado) break;
    const ok = await t.intento("u-rober", true);
    if (ok.espera) break; // el techo ya frena a todos
    assert.ok(ok.resultado.ok);
    assert.ok(vuelta < 10, "nunca frena");
  }
  assert.equal(fallos, TECHO_FALLOS_NEGOCIO);
  // En la espera del techo no pasa nadie (tampoco el PIN correcto) y no se verifica nada.
  const antes = t.llamadas();
  for (const quien of ["u-rober", null]) {
    const x = await t.intento(quien, true, "u-rober");
    assert.deepEqual(x, { espera: true, esperaS: 30 });
  }
  assert.equal(t.llamadas(), antes);
  // Pasada la espera, la próxima tanda del techo espera más (misma escalera).
  t.pasar(30_000);
  fallos = 0;
  for (let vuelta = 0; ; vuelta++) {
    const x = await t.intento(`u-x${vuelta % 6}`, false); // menos de 5 por dueño: sólo el techo los frena
    if (x.espera) {
      assert.equal(x.esperaS, 120);
      break;
    }
    fallos += 1;
    if (vuelta % 3 === 2) await t.intento("u-rober", true);
  }
  assert.equal(fallos, TECHO_FALLOS_NEGOCIO);
});

test("el dueño que acierta su PIN sigue firmando: limpia sus fallos, no los de otro; otro dueño trabado no lo frena", async () => {
  const t = tope();
  for (let k = 0; k < 3; k++) assert.equal((await t.intento("u-rober", false)).esperaS, 0);
  const ok = await t.intento("u-rober", true);
  assert.ok(!ok.espera && ok.resultado.ok && ok.esperaS === 0);
  // Sus fallos se limpiaron: 4 más no lo hacen esperar.
  for (let k = 0; k < 4; k++) assert.equal((await t.intento("u-rober", false)).esperaS, 0);
  assert.ok((await t.intento("u-rober", true)).espera === false);
  // Majo queda trabada; Rober sigue firmando.
  for (let k = 0; k < 5; k++) await t.intento("u-majo", false);
  assert.ok((await t.intento("u-majo", true)).espera, "majo espera");
  const rober = await t.intento("u-rober", true);
  assert.ok(!rober.espera && rober.resultado.ok);
  // «¿De qué dueño es?» prueba contra todos: con un dueño trabado, espera.
  assert.ok((await t.intento(null, true, "u-rober")).espera);
});

test("un acierto que no limpia (PIN del largo viejo) no borra fallos", async () => {
  const t = tope();
  for (let k = 0; k < 4; k++) await t.intento("u-majo", false);
  const viejo = await t.intento("u-majo", true, null);
  assert.ok(!viejo.espera && viejo.resultado.ok);
  assert.equal((await t.intento("u-majo", false)).esperaS, 30);
});

test("código de aprobación: tope propio, ningún acierto lo limpia y no se mezcla con el del PIN", async () => {
  const { correr } = baseEnMemoria();
  const ahoraMs = 5_000_000;
  const codigo = (ok: boolean) => conTopeDePin(NEGOCIO, "codigo", () => ({ ok, duenio: ok }), { usuarioId: null, ahoraMs, correr });
  const pin = (ok: boolean) => conTopeDePin(NEGOCIO, "pin", () => ({ ok, limpia: ok ? "u-rober" : null }), { usuarioId: "u-rober", ahoraMs, correr });
  for (let k = 0; k < 4; k++) await codigo(false);
  assert.ok((await codigo(true)).espera === false);
  assert.equal((await codigo(false)).esperaS, 30);
  assert.ok((await codigo(true)).espera);
  const p = await pin(true);
  assert.ok(!p.espera && p.resultado.ok, "el tope del código no frena el PIN");
});

test("una fila de antes (sólo `intentos`, en espera) se respeta", async () => {
  const { correr } = baseEnMemoria();
  await correr(NEGOCIO, (db) =>
    db.auditLog.create({ data: { entityId: NEGOCIO, changes: { intentos: { fallos: 5, tandas: 1, esperaHasta: 2_000_000, ultimoFallo: 1_000_000 } } } as never }),
  );
  const r = await conTopeDePin(NEGOCIO, "pin", () => assert.fail("no se verifica en la espera"), { usuarioId: "u-rober", ahoraMs: 1_500_000, correr });
  assert.deepEqual(r, { espera: true, esperaS: 500 });
});

test("con y sin dueño cuentan juntos contra un mismo dueño: nunca más de 5 antes de la primera espera", async () => {
  // 5 sin dueño: el primero con dueño ya espera (y no se verifica).
  {
    const t = tope();
    for (let k = 0; k < 5; k++) assert.equal((await t.intento(null, false)).espera, false);
    const antes = t.llamadas();
    assert.deepEqual(await t.intento("u-rober", true), { espera: true, esperaS: 30 });
    assert.equal(t.llamadas(), antes);
  }
  // 3 sin dueño + 2 contra Rober, y al revés: el siguiente contra Rober espera; otro dueño sin fallos propios no.
  for (const orden of [[null, null, null, "u-rober", "u-rober"], ["u-rober", "u-rober", null, null, null]] as const) {
    const t = tope();
    const respuestas = [];
    for (const quien of orden) respuestas.push(await t.intento(quien, false));
    assert.ok(respuestas.every((r) => !r.espera), `${orden.join(",")}: ninguno de los 5 espera antes de evaluarse`);
    assert.equal(respuestas.at(-1)?.esperaS, 30, `${orden.join(",")}: el 5.º avisa la espera`);
    const antes = t.llamadas();
    assert.ok((await t.intento("u-rober", true)).espera, `${orden.join(",")}: el 6.º contra Rober espera`);
    assert.ok((await t.intento(null, true, "u-majo")).espera, `${orden.join(",")}: sin dueño también espera`);
    assert.equal(t.llamadas(), antes);
    const majo = await t.intento("u-majo", true);
    assert.ok(!majo.espera && majo.resultado.ok, "otro dueño sigue firmando");
  }
});
