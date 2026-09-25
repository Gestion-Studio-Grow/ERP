// Mediciones de D1 con el Decimal que trae Prisma (@prisma/client-runtime-utils, decimal.js 10.5).
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { Decimal } = require("/home/user/erp/node_modules/@prisma/client-runtime-utils");
const D = Decimal.clone({ precision: 34, rounding: Decimal.ROUND_HALF_UP });
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100; // src/lib/round.ts:18-20
const r = {};

// M2 · Renglón por peso: cantidad en gramos (0,001 a 5,000 kg) × precio por kilo entero ($1.000 a $30.000, paso $10).
{
  let casos = 0, distintos = 0, ej = null;
  for (let g = 1; g <= 5000; g++) {
    const qs = (g / 1000).toFixed(3); const q = Number(qs);
    for (let p = 1000; p <= 30000; p += 10) {
      casos++;
      const f = round2(q * p);
      const d = new D(qs).mul(p).toDecimalPlaces(2);
      if (d.toNumber() !== f) { distintos++; if (!ej) ej = `${qs} kg × $${p}: float ${f}, decimal ${d.toFixed(2)}`; }
    }
  }
  r.renglon_por_peso = { casos, distintos, pct: +(100 * distintos / casos).toFixed(4), ejemplo: ej };
}
// M2b · Mismo renglón con precio con centavos ($0,01 a $999,99) × cantidad 1..3 decimales (muestra)
{
  let casos = 0, distintos = 0, ej = null;
  for (let c = 1; c < 100000; c += 7) {
    const ps = (c / 100).toFixed(2); const p = Number(ps);
    for (let g = 1; g <= 3000; g += 13) {
      const qs = (g / 1000).toFixed(3); const q = Number(qs);
      casos++;
      const f = round2(q * p); const d = new D(qs).mul(ps).toDecimalPlaces(2);
      if (d.toNumber() !== f) { distintos++; if (!ej) ej = `${qs} × $${ps}: float ${f}, decimal ${d.toFixed(2)}`; }
    }
  }
  r.renglon_precio_con_centavos = { casos, distintos, pct: +(100 * distintos / casos).toFixed(4), ejemplo: ej };
}
// M3 · IVA 21 % incluido: neto = total / 1,21 (src/lib/fiscal.ts:286), todos los totales de $0,01 a $100.000,00
{
  let casos = 0, distintos = 0, ej = null;
  const k = new D("1.21");
  for (let c = 1; c <= 10000000; c++) {
    casos++;
    const t = c / 100;
    const f = round2(t / 1.21);
    const d = new D(c).div(100).div(k).toDecimalPlaces(2);
    if (d.toNumber() !== f) { distintos++; if (!ej) ej = `total ${t.toFixed(2)}: neto float ${f}, decimal ${d.toFixed(2)}`; }
  }
  r.iva_neto_desde_total = { casos, distintos, pct: +(100 * distintos / casos).toFixed(4), ejemplo: ej };
}
// M4 · Ida y vuelta numeric(14,2) → number → Decimal: ¿se pierde algo? 10 millones de importes al azar en (-1e12, 1e12)
{
  let casos = 0, perdidos = 0, fixed = 0; let seed = 42;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let i = 0; i < 10000000; i++) {
    const cents = BigInt(Math.floor(rnd() * 1e7)) * 10000000n + BigInt(Math.floor(rnd() * 1e7));
    const signo = rnd() < 0.5 ? -1n : 1n;
    const v = (signo * (cents % 100000000000000n));
    const s = (v < 0n ? "-" : "") + ((v < 0n ? -v : v) / 100n).toString() + "." + ((v < 0n ? -v : v) % 100n).toString().padStart(2, "0");
    casos++;
    const n = Number(s);
    if (!new D(String(n)).eq(new D(s))) perdidos++;
    if (n.toFixed(2) !== (s.startsWith("-0.00") ? "0.00" : s)) fixed++;
  }
  r.ida_y_vuelta_number = { casos, perdidos, toFixed_distinto: fixed };
}
// M5 · Suma de 100.000 importes de $1.234,56 en float vs decimal
{
  let f = 0; let d = new D(0);
  for (let i = 0; i < 100000; i++) { f += 1234.56; d = d.plus("1234.56"); }
  r.suma_100k = { float: f, decimal: d.toFixed(2), desvio: new D(f).minus(d).toString() };
}
// M6 · toFixed(2) de soap.ts:385 sobre medios centavos que no pasaron por round2
{
  const ej = [1.005, 2.675, 1.045, 8.345, 1234.565].map((x) => `${x}→${x.toFixed(2)} (decimal ${new D(String(x)).toDecimalPlaces(2).toFixed(2)})`);
  r.toFixed_medio_centavo = ej;
}
console.log(JSON.stringify(r, null, 2));
