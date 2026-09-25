// ¿Un round2 que primero lleva el double a 15 cifras significativas (lo mismo que hace Postgres al
// pasar float8 → numeric) y después redondea medio-hacia-arriba con Decimal, acierta siempre?
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { Decimal } = require("/home/user/erp/node_modules/@prisma/client-runtime-utils");
const D = Decimal.clone({ precision: 34, rounding: Decimal.ROUND_HALF_UP });
const actual = (n) => Math.round((n + Number.EPSILON) * 100) / 100;           // src/lib/round.ts:18-20
const propuesto = (n) => new D(n.toPrecision(15)).toDecimalPlaces(2).toNumber(); // dinero/redondeo
const r = {};
// A · todos los x,xx5 de [0; 100.000): el valor tipeado es exacto en decimal y debe subir
{ let casos = 0, malActual = 0, malProp = 0;
  for (let c = 5; c < 100000000; c += 10) { // milésimos terminados en 5
    const s = (c / 1000).toFixed(3); const n = Number(s); const bien = new D(s).toDecimalPlaces(2).toNumber();
    casos++; if (actual(n) !== bien) malActual++; if (propuesto(n) !== bien) malProp++;
  }
  r.xxx5_0_a_100mil = { casos, malActual, malPropuesto: malProp }; }
// B · renglón precio con centavos × cantidad con 3 decimales (misma muestra que M2b)
{ let casos = 0, malActual = 0, malProp = 0, ej = null;
  for (let c = 1; c < 100000; c += 7) { const ps = (c / 100).toFixed(2); const p = Number(ps);
    for (let g = 1; g <= 3000; g += 13) { const qs = (g / 1000).toFixed(3); const q = Number(qs);
      const bien = new D(qs).mul(ps).toDecimalPlaces(2).toNumber(); casos++;
      if (actual(q * p) !== bien) malActual++;
      if (propuesto(q * p) !== bien) { malProp++; if (!ej) ej = `${qs}×${ps}`; } } }
  r.renglon = { casos, malActual, malPropuesto: malProp, ej }; }
// C · sumas de 2 a 20 renglones con centavos (muestra): round2(suma float) vs suma decimal
{ let casos = 0, malActual = 0, malProp = 0; let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let i = 0; i < 1000000; i++) { const k = 2 + Math.floor(rnd() * 19); let f = 0; let d = new D(0);
    for (let j = 0; j < k; j++) { const s = (Math.floor(rnd() * 10000000) / 100).toFixed(2); f += Number(s); d = d.plus(s); }
    casos++; const bien = d.toDecimalPlaces(2).toNumber(); if (actual(f) !== bien) malActual++; if (propuesto(f) !== bien) malProp++; }
  r.sumas = { casos, malActual, malPropuesto: malProp }; }
console.log(JSON.stringify(r, null, 2));
