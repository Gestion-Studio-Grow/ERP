// Propiedades de la cobranza (I1, I4, I5, previstas, traba) con fuzz de semilla fija: deterministas.
// Vienen de las suites adversariales v2–v7 de MIA Etapa 2, corregidas a las tolerancias DECLARADAS en
// cobranza-core.ts (encabezado: en H, cada cuota se pasa a pesos por separado → hasta 0,01 × tc por cuota)
// y con un épsilon para el ruido binario del borde. Pendiente a futuro (c): un test de concurrencia de la
// traba contra un Postgres efímero; acá sólo se afirma que la traba existe y precede a la relectura.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { alCentavoAbajo, cobranza, cobranzaEnMoneda, conciliarConCobros, esPrevista, pasaElTope, pendientesDeCobro, SIN_PREVISTAS_SIN_MARCAR, type CobroRegistrado } from "./cobranza-core";
import { aPesos } from "./gestion-core";
import { centavosDe } from "@/lib/dinero/redondeo";

const HOY = new Date("2026-11-10T12:00:00Z");
const d = (n: number) => new Date(HOY.getTime() + n * 86_400_000);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Q = any;
const q = (id: string, monto: number, dias: number, extra: Record<string, unknown> = {}): Q => ({ id, tipo: "COBRO", monto, moneda: "ARS", venceEl: d(dias), pagadoEl: null as Date | null, anuladoEl: null, ...extra });
/** Ruido binario de una suma de doubles en centavos: no es plata. */
const EPS = 1e-6;
function rng(seed: number) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
/** Simula «Marcar cobrado»: cobra el pendiente en pesos y enlaza el original si la cuota no es ARS. */
function marcar(cuotas: Q[], cobros: CobroRegistrado[], i: number, pend: number, tc: Record<string, number>) {
  const importe = aPesos(pend, cuotas[i].moneda, tc);
  const original = cuotas[i].moneda !== "ARS" ? { monto: Number(pend.toFixed(2)), moneda: cuotas[i].moneda } : null;
  cobros.push({ monto: importe, cuotaId: cuotas[i].id, original });
  cuotas[i] = { ...cuotas[i], pagadoEl: d(0) };
  return importe;
}

/** Tolerancia DECLARADA de I1/I5 en pesos (H): exacto si la cuota está en la moneda del proyecto o todo es en pesos;
 * si no, cada cuota se pasa a pesos por separado → hasta 0,01 × tc por cuota. Más un centavo de redondeo y el épsilon. */
function tolH(cuotas: Q[], vivos: number[], monedaP: string, tc: Record<string, number>): number {
  return vivos.reduce((s, i) => (cuotas[i].moneda === monedaP && monedaP === "ARS" ? s : s + 0.01 * (tc[cuotas[i].moneda] ?? tc[monedaP] ?? 1)), 0.01) + EPS;
}

test("alCentavoAbajo: nunca sube, baja menos de un centavo, da centavos exactos e iguala al piso viejo bajo 10 M", () => {
  const viejo = (x: number) => Math.floor(x * 100 + 1e-6) / 100; // no-es-plata: referencia histórica que se compara, no se usa
  const r = rng(12345);
  const casos: number[] = [0, 0.01, 0.005, 1.005, 1.225, 2.675, 1029 * 1842.07, (154281.33 / 1029) * 1029];
  for (let k = 0; k < 40_000; k++) {
    const base = Math.round(r() * 1e8) / 100; // no-es-plata: genera importes de prueba en centavos
    const tc = 800 + r() * 900;
    casos.push(r() * 5e6, base, (base * tc) / tc, base * 1029.37, base / tc, base + 1e-9, base - 1e-9, base - 0.005);
  }
  const malos: string[] = [];
  for (const x of casos) {
    const n = alCentavoAbajo(x), tol = 1e-8 + Math.abs(x) * 1e-15;
    if (n > x + tol || n <= x - 0.01 - tol || !Number.isInteger(centavosDe(n))) malos.push(`${x} → ${n}`);
    else if (x < 1e7 && Math.abs(viejo(x) - n) > 1e-9) malos.push(`${x}: viejo ${viejo(x)} vs ${n}`);
    if (malos.length >= 5) break;
  }
  assert.deepEqual(malos, []);
});

test("fuzz P1: I1 e I5 siempre, I4 en cadena con la tolerancia declarada, y el tope no bloquea un marcar legítimo", () => {
  const r = rng(4242);
  const fallas: string[] = [];
  for (let k = 0; k < 10_000 && fallas.length < 5; k++) {
    const monedaP = r() < 0.5 ? "ARS" : "USD";
    const tc: Record<string, number> = { USD: Math.round(800 + r() * 900) + (r() < 0.5 ? 0.37 : 0), EUR: 1100.13 };
    const v = { moneda: monedaP, cambioVenta: tc.USD * (0.8 + r() * 0.4), tcHoy: tc.USD };
    const total = Math.round(r() * 3_000_000) + (r() < 0.3 ? 0.01 : 0);
    const n = 1 + Math.floor(r() * 5);
    const cuotas: Q[] = [];
    for (let j = 0; j < n; j++) {
      const mon = ["ARS", "USD", "EUR"][Math.floor(r() * 3)];
      const m = mon === "ARS" ? Math.round(r() * 1_500_000) + 0.33 : Math.round(r() * 1500 * 100) / 100 + 0.01; // no-es-plata: importes de prueba
      cuotas.push(q("c" + j, m, Math.floor(r() * 40) - 20, { moneda: mon }));
    }
    const cobros: CobroRegistrado[] = [];
    if (r() < 0.6) cobros.push({ monto: Math.round(r() * total * 0.7 * 100) / 100 }); // no-es-plata: importe de prueba
    for (let paso = 0; paso < n + 1; paso++) {
      const c = cobranzaEnMoneda(total, cobros, v);
      const p = pendientesDeCobro(cuotas, tc, c);
      const vivos = cuotas.map((x, i) => (!x.pagadoEl ? i : -1)).filter((i) => i >= 0);
      const sH = vivos.reduce((acc, i) => acc + aPesos(p[i], cuotas[i].moneda, tc), 0);
      if (c.total > 0 && sH > c.porCobrar + tolH(cuotas, vivos, monedaP, tc)) { fallas.push(`k${k} I1 Σ${sH} > ${c.porCobrar}`); break; }
      const res = conciliarConCobros(cuotas, tc, c, HOY);
      if (res.cobrosVencidos + res.aCobrar7 > c.porCobrar + tolH(cuotas, cuotas.map((_, i) => i), monedaP, tc)) { fallas.push(`k${k} I5 ${res.cobrosVencidos}+${res.aCobrar7} > ${c.porCobrar}`); break; }
      const i = vivos.find((i) => p[i] > 0 && aPesos(p[i], cuotas[i].moneda, tc) > 0);
      if (i === undefined) break;
      const importe = aPesos(p[i], cuotas[i].moneda, tc);
      if (pasaElTope(c, importe)) { fallas.push(`k${k} el tope bloquea marcar ${importe} con porCobrar ${c.porCobrar}`); break; }
      marcar(cuotas, cobros, i, p[i], tc);
      const c2 = cobranzaEnMoneda(total, cobros, v);
      const tol = (monedaP === "ARS" ? 0.01 : 0.01 * tc.USD + 0.01) + 0.001 + EPS; // declarada: 0,01 × tc por cuota
      const baja = c.porCobrar - c2.porCobrar;
      if (c.total > 0 && Math.abs(baja - importe) > tol && !(c2.porCobrar === 0 && baja <= importe + tol)) { fallas.push(`k${k} I4 ${monedaP}/${cuotas[i].moneda}: bajó ${baja} vs ${importe}`); break; }
    }
  }
  assert.deepEqual(fallas, []);
});

test("fuzz T1 tope doble: 0≤p≤monto, ΣH≤porCobrar, Σ en moneda≤saldo, cadena en la misma moneda salda a 0", () => {
  const r = rng(6606);
  const fallas: string[] = [];
  for (let k = 0; k < 15_000 && fallas.length < 6; k++) {
    const monedaP = r() < 0.5 ? "ARS" : "USD";
    const tc: Record<string, number> = { USD: Math.round(800 + r() * 900) + [0, 0.37, 0.01, 0.99][Math.floor(r() * 4)], EUR: 1100.13 };
    const v = { moneda: monedaP, cambioVenta: Math.round(tc.USD * (0.8 + r() * 0.4) * 100) / 100, tcHoy: tc.USD };
    const misma = r() < 0.5; // todas en la moneda del proyecto
    const n = 1 + Math.floor(r() * 5);
    const cuotas: Q[] = [];
    for (let j = 0; j < n; j++) {
      const mon = misma ? monedaP : ["ARS", "USD", "EUR"][Math.floor(r() * 3)];
      const m = mon === "ARS" ? Math.round(r() * 1_500_000) + 0.33 : Math.round(r() * 1500 * 100) / 100 + 0.01;
      cuotas.push(q("c" + j, m, Math.floor(r() * 40) - 20, { moneda: mon, prevista: r() < 0.15 }));
    }
    // total = Σ de las reales en la moneda del proyecto (plan coherente) o al azar
    const sumaReal = cuotas.filter((c) => !c.prevista).reduce((s, c) => s + aPesos(c.monto, c.moneda, { ...tc, USD: v.cambioVenta }), 0);
    const total = misma && r() < 0.7 ? Math.round(sumaReal * 100) / 100 : Math.round(r() * 3_000_000) + 0.01;
    const cobros: CobroRegistrado[] = [];
    if (r() < 0.5) cobros.push({ monto: Math.round(r() * total * 0.5 * 100) / 100 });
    for (let paso = 0; paso < n + 2; paso++) {
      const c = cobranzaEnMoneda(total, cobros, v);
      const p = pendientesDeCobro(cuotas, tc, c);
      for (let i = 0; i < n; i++) {
        if (!Number.isFinite(p[i]) || p[i] < 0 || p[i] > cuotas[i].monto + 1e-9) fallas.push(`k${k} saldo imposible c${i} ${p[i]} de ${cuotas[i].monto}`);
        if (Math.round(p[i] * 100) / 100 !== p[i] && Math.abs(Math.round(p[i] * 100) / 100 - p[i]) > 1e-9) fallas.push(`k${k} no centavos ${p[i]}`);
      }
      const vivos = cuotas.map((x, i) => (!x.pagadoEl ? i : -1)).filter((i) => i >= 0);
      const sH = vivos.reduce((s, i) => s + aPesos(p[i], cuotas[i].moneda, tc), 0);
      if (c.total > 0 && sH > c.porCobrar + tolH(cuotas, vivos, monedaP, tc)) fallas.push(`k${k} I1 ΣH ${sH} > ${c.porCobrar}`);
      if (c.enMoneda) {
        const sM = vivos.reduce((s, i) => s + (cuotas[i].moneda === monedaP ? p[i] : aPesos(p[i], cuotas[i].moneda, tc) / tc[monedaP]), 0);
        if (c.total > 0 && sM > Math.max(0, c.enMoneda.saldo) + 0.01 + 1e-9) fallas.push(`k${k} Σ en ${monedaP} ${sM} > saldo ${c.enMoneda.saldo}`);
      }
      const res = conciliarConCobros(cuotas, tc, c, HOY);
      if (res.cobrosVencidos + res.aCobrar7 > c.porCobrar + tolH(cuotas, cuotas.map((_, i) => i), monedaP, tc)) fallas.push(`k${k} I5`);
      const reales = vivos.filter((i) => !esPrevista(cuotas[i]));
      const i = reales.find((i) => p[i] > 0 && aPesos(p[i], cuotas[i].moneda, tc) > 0);
      if (i === undefined) {
        // F1: todas en la moneda del proyecto, plan coherente y ya no queda nada para marcar → saldo 0 exacto en esa moneda.
        if (misma && total === Math.round(sumaReal * 100) / 100 && !cuotas.some((x) => x.prevista && !x.pagadoEl) && cuotas.every((x) => x.pagadoEl) ) {
          const fin = c.enMoneda ? c.enMoneda.saldo : c.saldo;
          if (fin > 0) fallas.push(`k${k} F1 ${monedaP} queda ${fin} sin cuota pendiente · tc ${tc.USD} venta ${v.cambioVenta} total ${total} cuotas ${cuotas.map((x) => x.monto + (x.prevista ? 'P' : ''))} cobros ${cobros.map((x) => x.monto + '/' + (x.original?.monto ?? '-') + (x.cuotaId ? '@' + x.cuotaId : ''))} enM ${JSON.stringify(c.enMoneda)}`);
        }
        if (misma && total === Math.round(sumaReal * 100) / 100 && c.total > 0 && reales.length > 0 && (c.enMoneda ? c.enMoneda.saldo : c.saldo) >= 0.01 && reales.every((j) => p[j] === 0) && reales.reduce((s, j) => s + cuotas[j].monto, 0) > 0)
          fallas.push(`k${k} F1' quedan ${c.enMoneda?.saldo ?? c.saldo} ${monedaP} y las pendientes en 0`);
        break;
      }
      const importe = aPesos(p[i], cuotas[i].moneda, tc);
      if (pasaElTope(c, importe)) { fallas.push(`k${k} tope bloquea marcar ${importe} vs ${c.porCobrar}`); break; }
      marcar(cuotas, cobros, i, p[i], tc);
      const c2 = cobranzaEnMoneda(total, cobros, v);
      const tol = monedaP === "ARS" ? 0.011 : 0.01 * tc.USD + 0.011;
      const baja = c.porCobrar - c2.porCobrar;
      if (c.total > 0 && Math.abs(baja - importe) > tol && !(c2.porCobrar === 0 && baja <= importe + tol)) fallas.push(`k${k} I4 bajó ${baja} vs ${importe}`);
      if (misma && monedaP === "USD" && c2.enMoneda && c2.enMoneda.saldo < -0.0001 && c.enMoneda!.saldo >= 0) fallas.push(`k${k} cobró de más ${c2.enMoneda.saldo} USD`);
    }
  }
  assert.deepEqual(fallas, []);
});

test("prevista ya marcada: la ficha y Administración leen lo mismo, porque las dos excluyen sólo la prevista SIN marcar", () => {
  const P = q("P", 500, -20, { prevista: true, pagadoEl: d(-19) });
  const R = q("R", 500, -5);
  const c = cobranza(1000, [{ monto: 500, cuotaId: "P" }]);
  assert.deepEqual(SIN_PREVISTAS_SIN_MARCAR, { NOT: { prevista: true, pagadoEl: null } });
  const deAdministracion = [P, R].filter((x) => !esPrevista(x)); // lo mismo que filtra la consulta
  assert.deepEqual(deAdministracion.map((x) => x.id), ["P", "R"]);
  const ficha = pendientesDeCobro([P, R], {}, c);
  const adm = pendientesDeCobro(deAdministracion, {}, c);
  assert.deepEqual(ficha, adm);
  assert.equal(ficha[1], 500);
});

test("carrera de cobros: la traba de la cobranza existe y precede a TODA relectura del pendiente dentro de la transacción", () => {
  // Reemplaza a los tests que simulaban, sin traba, una intercalación que producción no permite.
  const server = readFileSync(new URL("./cobranza.server.ts", import.meta.url), "utf8");
  assert.match(server, /export async function trabarCobranza[\s\S]{0,200}pg_advisory_xact_lock\(hashtext\(\$\{`cobranza-proyecto:\$\{tenantId\}:\$\{proyectoId\}`\}\)\)/);
  for (const archivo of ["./acciones-ficha.ts", "./acciones.ts"]) {
    const lineas = readFileSync(new URL(archivo, import.meta.url), "utf8").split("\n");
    const relecturas = lineas.flatMap((l, i) => (/cobranzaConCuotas\(tx\b|pendienteDeLaCuota\([^)]*\btx\)/.test(l) ? [i] : []));
    for (const i of relecturas) {
      const antes = lineas.slice(Math.max(0, i - 3), i).join("\n");
      assert.match(antes, /await trabarCobranza\(tx,/, `${archivo}:${i + 1} relee el pendiente sin trabar antes la cobranza`);
    }
    if (archivo === "./acciones-ficha.ts") assert.ok(relecturas.length >= 2, "acciones-ficha relee el pendiente adentro de la transacción");
    assert.ok(lineas.some((l) => /await trabarCobranza\(tx,/.test(l)), `${archivo} traba la cobranza`);
  }
});
