/**
 * Redondeos de plata a mano fuera del módulo (ENG-109, D1-PLAN P0 criterio 3). El patrón es el
 * del plan, ampliado en su rev. 1. Una línea que redondea algo que no es plata (un porcentaje
 * para leer, una cantidad) lleva `// no-es-plata: <por qué>`.
 *
 * Los archivos que quedan son los que esta parte NO podía tocar, cada uno con su motivo. Un
 * archivo nuevo con un redondeo a mano rompe el test; al limpiar uno de la lista, se lo saca.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * Las formas de redondear plata a mano que se buscan, línea por línea:
 * - `Math.round|floor|ceil|trunc(…)` con un factor 100, 1e2, 1e4 o 1e6 a cualquiera de los lados;
 * - `Math.round(…) / 100` (el factor puede estar en una variable adentro);
 * - `.toFixed(2)`, suelto o dentro de `Number(…)`;
 * - `Number.EPSILON` (el truco para "arreglar" el binario, con el factor en una variable).
 * Límite conocido: un factor en variable sin dividir por 100 en la misma línea ni EPSILON no se ve.
 */
const PATRON = new RegExp(
  [
    String.raw`Math\.(round|floor|ceil|trunc)\([^;]*\*\s*(100|1e2|1e4|1e6)\b`,
    String.raw`Math\.(round|floor|ceil|trunc)\(\s*\(?\s*(100|1e2|1e4|1e6)\s*\*`,
    String.raw`Math\.(round|floor|ceil|trunc)\([^;]*\)\s*\/\s*(100|1e2|1e4|1e6)\b`,
    String.raw`\*\s*100\)\s*\/\s*100\b`,
    String.raw`\.toFixed\(2\)`,
    String.raw`Number\.EPSILON`,
  ].join("|"),
);

const PANTALLA = "pantalla del rediseño: va después de su corte (D1-PLAN §6.0)";
const SIN_COMMIT = "archivo con cambios sin commit de otra sesión: espera su corte";

/**
 * Lo que queda, con su motivo. Medido 2026-09-25 con el patrón ampliado (vuelta 1 de la revisión):
 * 53 líneas en 41 archivos (55 en 43 antes de limpiar libro-csv y planilla-core; con el patrón
 * anterior eran 46 en 36; al empezar ENG-109, 77).
 */
const PENDIENTES: Record<string, string> = {
  "src/app/admin/(dashboard)/caja/cierre/ContarYCerrar.tsx": SIN_COMMIT,
  "src/app/admin/(dashboard)/caja/cierre/comprobante.ts": SIN_COMMIT,
  "src/app/admin/(dashboard)/catalogo/CatalogoRenglon.tsx": SIN_COMMIT,
  "src/app/admin/(dashboard)/catalogo/CortesSection.tsx": SIN_COMMIT,
  "src/app/admin/(dashboard)/catalogo/precios/ActualizarPrecios.tsx": SIN_COMMIT,
  "src/app/admin/(dashboard)/cuentas-a-cobrar/bandeja-cuentas.ts": SIN_COMMIT,
  "src/app/admin/(dashboard)/despiece/DespieceClient.tsx": PANTALLA,
  "src/app/admin/(dashboard)/despiece/page.tsx": PANTALLA,
  "src/app/admin/(dashboard)/facturacion/bancos/KpisBancos.tsx": PANTALLA,
  "src/app/admin/(dashboard)/facturacion/bancos/MapeoPreview.tsx": PANTALLA,
  "src/app/admin/(dashboard)/facturacion/bancos/page.tsx": SIN_COMMIT,
  "src/app/admin/(dashboard)/flujo/page.tsx": SIN_COMMIT,
  "src/app/admin/(dashboard)/locales/page.tsx": PANTALLA,
  "src/app/admin/(dashboard)/page.tsx": SIN_COMMIT,
  "src/app/admin/(dashboard)/pedidos/pedidos-core.ts": SIN_COMMIT,
  "src/app/admin/(dashboard)/recordatorios/page.tsx": PANTALLA,
  "src/app/admin/(dashboard)/reportes/tira-core.ts": SIN_COMMIT,
  "src/app/admin/(dashboard)/turnos/agenda-core.ts": SIN_COMMIT,
  "src/app/contador/CarteraPanel.tsx": PANTALLA,
  "src/app/operador/(console)/direccion/panel.generated.ts": "archivo generado: se corrige en su generador",
  "src/app/tienda/MagraFront.tsx": PANTALLA,
  "src/app/tienda/SiteReplica.tsx": PANTALLA,
  "src/app/tienda/Storefront.tsx": PANTALLA,
  "src/app/tienda/vidriera/Ficha.tsx": SIN_COMMIT,
  "src/app/tienda/vidriera/Vidriera.tsx": SIN_COMMIT,
  "src/app/tienda/vidriera/catalogo-core.ts": SIN_COMMIT,
  "src/apps/kpis/locales.server.ts": SIN_COMMIT,
  "src/components/OwnerPanel.tsx": PANTALLA,
  "src/components/ui/Deslizar.tsx": SIN_COMMIT,
  "src/components/ui/deslizar-core.ts": SIN_COMMIT,
  "src/lib/contador-wa/mensajes.ts": "núcleo aprobado sin commit (contador-wa): espera su corte",
  "src/lib/stock/supplier-return.ts": "costo unitario a 6 decimales: pasa a alCostoUnitario con M-D1-5 (D1-PLAN P4)",
  "src/plugins/bancos/domain/valores.ts": "plugin: importar el módulo pide extender DEC-011 a bancos",
  "src/plugins/mercadopago/cobros/http.ts": "plugin: importar el módulo pide extender DEC-011 a mercadopago",
  "src/plugins/mercadopago/http.ts": "plugin: importar el módulo pide extender DEC-011 a mercadopago",
  "src/plugins/mercadopago/stub.ts": "plugin: importar el módulo pide extender DEC-011 a mercadopago",
  "src/app/admin/(dashboard)/turnos/_agenda/CobrarTurno.tsx": SIN_COMMIT,
  "src/app/operador/(console)/diseno/page.tsx": "pantalla sin commit; su toFixed(2) es una razón de contraste, no plata",
  "src/components/ui/display-core.ts": "rediseño sin commit: Plata y Ticket muestran con EPSILON; pasar a textoAlCentavo (pedido en necesita_fuera de ENG-109)",
  "src/lib/fiscal/decidir-comprobante.ts": "núcleo aprobado sin commit (fiscal): la coherencia con el envío la asegura validarComprobante; parche propuesto en .qa/ENG-109/decidir-comprobante.diff",
  "src/plugins/bancos/domain/reglas.ts": "plugin: la clave de conciliación usa toFixed(2); extender DEC-011 a bancos sin cambiar el formato de la clave",
};

function archivos(dir: string, fuera: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    const ruta = path.join(dir, nombre);
    if (statSync(ruta).isDirectory()) archivos(ruta, fuera);
    else if (/\.(ts|tsx)$/.test(nombre) && !/\.test\./.test(nombre)) fuera.push(ruta);
  }
  return fuera;
}

test("fuera del módulo de plata no aparecen redondeos a mano nuevos (sólo los pendientes con motivo)", () => {
  const nuevos: string[] = [];
  for (const ruta of archivos(path.join(RAIZ, "src"))) {
    const relativa = path.relative(RAIZ, ruta).split(path.sep).join("/");
    if (relativa.startsWith("src/lib/dinero/") || relativa in PENDIENTES) continue;
    readFileSync(ruta, "utf8")
      .split("\n")
      .forEach((linea, i) => {
        if (PATRON.test(linea) && !linea.includes("no-es-plata:")) nuevos.push(`${relativa}:${i + 1}`);
      });
  }
  assert.deepEqual(nuevos, [], "redondear con @/lib/dinero/redondeo, o marcar `// no-es-plata: <por qué>`");
});

test("el patrón detecta las formas de redondeo a mano que busca", () => {
  for (const linea of [
    "const x = Math.round(total * 100) / 100;",
    "const c = Math.round(precio * 100);",
    "const u = Math.round((a / b) * 1e6) / 1e6;",
    "const v = Number(total.toFixed(2));",
    "const w = Math.floor(importe * 100);",
    "return n.toFixed(2).replace('.', ',');",
    "const c = Math.round(100 * importe);",
    "const d = Math.round(importe * FACTOR) / 100;",
    "const r = Math.round(Math.abs(valor) * factor + Number.EPSILON * factor);",
  ]) {
    assert.ok(PATRON.test(linea), linea);
  }
  assert.ok(!PATRON.test("const k = Math.round(kilos * 1000) / 1000;"));
  assert.ok(!PATRON.test("const p = pct.toFixed(1);"));
});
