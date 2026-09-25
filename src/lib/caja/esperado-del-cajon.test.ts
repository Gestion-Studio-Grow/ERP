// ADR-101 · lo que la PANTALLA dice que se espera en el cajón es lo mismo con lo que el servidor
// arquea. Reglas puras; el mismo número contra Postgres está en
// `un-solo-esperado-pantalla-postgres.test.ts` y en el navegador en `caja/caja-renglon.test.ts`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { esperadoConfirmadoVigente, esperadoDelCajon } from "@/lib/caja/esperado-del-cajon";

const TURNO = {
  openingFloat: 4_000,
  movements: [
    { type: "APERTURA", amount: 4_000, method: "EFECTIVO" },
    { type: "VENTA", amount: 1_000, method: "EFECTIVO" },
    { type: "VENTA", amount: 9_999, method: "MP" },
    { type: "RETIRO", amount: 300, method: "EFECTIVO" },
  ],
};

test("el esperado que se muestra es el del libro, aunque el turno sume otra cosa", () => {
  // Salió una devolución de $200 que no pasó por el turno: el libro espera 4.500, el turno 4.700.
  const e = esperadoDelCajon(TURNO, 4_500);
  assert.equal(e.delTurno, 4_700);
  assert.equal(e.esperado, 4_500);
  assert.equal(e.fueraDelTurno, -200, "la diferencia se muestra como un renglón más, con signo");
  assert.deepEqual(e.desglose, { sales: 1_000, cashIn: 0, cashOut: 0, withdrawals: 300 });
});

test("si el libro y el turno coinciden, no hay renglón de efectivo fuera del turno", () => {
  const e = esperadoDelCajon(TURNO, 4_700);
  assert.equal(e.esperado, 4_700);
  assert.equal(e.fueraDelTurno, 0);
});

test("sin el número del libro (la demo), se muestra el del turno y no se inventa diferencia", () => {
  const e = esperadoDelCajon(TURNO, null);
  assert.equal(e.esperado, 4_700);
  assert.equal(e.fueraDelTurno, 0);
});

test("los centavos no dejan un renglón fantasma: 0,1 + 0,2 contra 0,3", () => {
  const e = esperadoDelCajon({ openingFloat: 0.1, movements: [{ type: "VENTA", amount: 0.2, method: "EFECTIVO" }] }, 0.3);
  assert.equal(e.fueraDelTurno, 0);
});

test("un movimiento sin medio (la demo) cuenta como efectivo, igual que antes", () => {
  const e = esperadoDelCajon({ openingFloat: 0, movements: [{ type: "VENTA", amount: 50 }] }, null);
  assert.equal(e.delTurno, 50);
});

test("el esperado que el cajero confirmó vale si es el mismo que el del libro al grabar", () => {
  assert.deepEqual(esperadoConfirmadoVigente("3800", 3_800), { ok: true });
  assert.deepEqual(esperadoConfirmadoVigente("3800.004", 3_800), { ok: true }, "mismo centavo");
});

test("si el libro cambió mientras el cajero contaba, no se graba y se dice el número nuevo", () => {
  const r = esperadoConfirmadoVigente("4000", 3_800);
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /Mientras contabas cambió el efectivo esperado en el cajón/);
  assert.match((r as { error: string }).error, /\$ ?3\.800,00/);
  assert.match((r as { error: string }).error, /\$ ?4\.000,00/);
});

test("sin esperado confirmado se rechaza: el cierre y la apertura siempre dicen contra qué número se contó", () => {
  for (const crudo of [null, "", "  ", "abc", "Infinity"]) {
    const r = esperadoConfirmadoVigente(crudo, 3_800);
    assert.equal(r.ok, false, `«${crudo}» no vale`);
    assert.match((r as { error: string }).error, /Recargá la página/);
  }
});

test("un libro que da el cajón en rojo también se puede confirmar: es lo que se mostró", () => {
  assert.deepEqual(esperadoConfirmadoVigente("-150", -150), { ok: true });
});
