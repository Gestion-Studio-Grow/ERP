import { montoDeCupon } from "@/lib/venta-reglas";
const r2v = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const viejoVenta = (b: number, v: number) => r2v((r2v(b) * Math.min(v, 100)) / 100);
let tot = 0, cam = 0, cero = 0;
for (let p = 1; p <= 100_000; p++) for (const v of [5, 10, 15, 20, 25, 30, 50]) { tot++; const n = montoDeCupon("PERCENT", v, p); if (n !== viejoVenta(p, v)) cam++; if (n === 0 && viejoVenta(p, v) > 0) cero++; }
console.log(`venta, precios enteros $1..$100.000 x {5,10,15,20,25,30,50}: cambian ${cam} de ${tot}; positivos que pasan a 0: ${cero}`);
tot = 0; cam = 0; let max = 0;
for (let c = 1; c <= 2_000_000; c++) for (let v = 1; v < 100; v++) { tot++; const b = c / 100; const d = montoDeCupon("PERCENT", v, b) - viejoVenta(b, v); if (d !== 0) { cam++; max = Math.max(max, Math.abs(d)); } }
console.log(`venta, precios $0,01..$20.000,00 (cada centavo) x 1..99 %: cambian ${cam} de ${tot}; máximo ${max.toFixed(4)}`);
const viejoTurno = (p: number, v: number) => Math.round(p * (v / 100));
tot = 0; cam = 0; let ceroT = 0;
for (let p = 1; p <= 300_000; p++) for (let v = 1; v <= 100; v++) { tot++; const n = montoDeCupon("PERCENT", v, p, "turno"); const o = viejoTurno(p, v); if (n !== o) cam++; if (n === 0 && o > 0) ceroT++; }
console.log(`turno, precios enteros $1..$300.000 x 1..100 %: cambian ${cam} de ${tot}; positivos que pasan a 0: ${ceroT}`);
