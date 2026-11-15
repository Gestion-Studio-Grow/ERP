// Simulación del segundo certificador (08-correcciones.md) sobre la clave v2 (recuento m/k), ya reemplazada por la v3 de 02-diseno.md §3. Punto de partida para la certificación de la tanda 1.
// Implementación literal de 02-diseno.md §3 (recuento m/k) + §5 posible_duplicado (sólo facturas fuera del libro).
import { createHash } from "node:crypto";
const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 8);
function nuevoNegocio() { return { filas: [], libro: new Set(), facturas: [] }; }
function cargar(neg, cuenta, movs) { // movs: {fecha, importe, ley}
  const out = { emitidas: [], revisar: [], nada: 0 };
  const grupos = new Map();
  for (const m of movs) { const b = `${cuenta}|${m.fecha}|${m.importe}`; (grupos.get(b) ?? grupos.set(b, []).get(b)).push(m); }
  for (const [base, ms] of grupos) {
    const k = neg.filas.filter((f) => f.base === base).length, mm = ms.length;
    if (mm <= k) { out.nada += mm; continue; }
    for (let n = k + 1; n <= mm; n++) {
      const clave = `mov:${cuenta}:${sha(base)}#${n}`, mov = ms[n - 1];
      neg.filas.push({ base, clave });
      if (k > 0) { out.revisar.push([clave, "posible_repetido", mov.ley]); continue; }
      // §5: posible_duplicado sólo contra facturas que NO están en el libro
      const dup = neg.facturas.find((f) => !f.enLibro && f.importe === mov.importe);
      if (dup) { out.revisar.push([clave, "posible_duplicado"]); continue; }
      if (neg.libro.has(clave)) { out.nada++; continue; }
      neg.libro.add(clave); neg.facturas.push({ importe: mov.importe, enLibro: true, ley: mov.ley }); out.emitidas.push([clave, mov.ley]);
    }
  }
  return out;
}
const casos = {
  "N1 re-fechado D->D+1 entre exportes": () => { const n = nuevoNegocio();
    cargar(n, "galicia-1234", [{ fecha: "20261110", importe: 2500000, ley: "TRANSF PEREZ" }]);
    const r = cargar(n, "galicia-1234", [{ fecha: "20261111", importe: 2500000, ley: "TRANSF PEREZ" }]);
    return { facturasDelMismoCobro: n.facturas.length, r }; },
  "N2 dos archivos parciales (mañana Perez / tarde Gomez)": () => { const n = nuevoNegocio();
    cargar(n, "galicia-1234", [{ fecha: "20261110", importe: 2000000, ley: "PEREZ" }]);
    const r = cargar(n, "galicia-1234", [{ fecha: "20261110", importe: 2000000, ley: "GOMEZ" }]);
    return { facturas: n.facturas.map((f) => f.ley), r }; },
  "N3 dos cuentas mismo banco y ult4 (CA $ y CC)": () => { const n = nuevoNegocio();
    cargar(n, "galicia-1234", [{ fecha: "20261110", importe: 1500000, ley: "CA PEREZ" }]);
    const r = cargar(n, "galicia-1234", [{ fecha: "20261110", importe: 1500000, ley: "CC GOMEZ" }]);
    return { facturas: n.facturas.map((f) => f.ley), r }; },
  "N4 débito y crédito mismo importe sin signo": () => { const n = nuevoNegocio();
    n.filas.push({ base: "galicia-1234|20261110|800000", clave: "debito" }); // débito ya cargado (no es venta)
    const r = cargar(n, "galicia-1234", [{ fecha: "20261110", importe: 800000, ley: "CREDITO GOMEZ" }]);
    return { facturas: n.facturas.length, r }; },
};
for (const [n, f] of Object.entries(casos)) console.log(n, JSON.stringify(f()));
