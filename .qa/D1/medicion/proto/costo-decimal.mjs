import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { Decimal } = require("/home/user/erp/node_modules/@prisma/client-runtime-utils");
const D = Decimal.clone({ precision: 34, rounding: Decimal.ROUND_HALF_UP });
// Una "venta de 10 renglones": 10 × (precio × cantidad al centavo) + suma + descuento 10 % + total
const precios = Array.from({ length: 10 }, (_, i) => new D((1234.56 + i * 17.3).toFixed(2)));
const cant = Array.from({ length: 10 }, (_, i) => ((i + 1) * 0.137).toPrecision(15));
const N = 200000; const t0 = process.hrtime.bigint();
let x;
for (let k = 0; k < N; k++) {
  let sub = new D(0);
  for (let i = 0; i < 10; i++) sub = sub.plus(precios[i].mul(cant[i]).toDecimalPlaces(2));
  const desc = sub.mul("0.10").toDecimalPlaces(2);
  x = sub.minus(desc).toFixed(2);
}
const t1 = process.hrtime.bigint();
console.log(JSON.stringify({ ventas: N, microsegundos_por_venta: Number(t1 - t0) / 1000 / N, ultimo: x }));
