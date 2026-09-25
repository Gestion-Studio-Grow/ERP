// ============================================================================
// El stock de un producto NUEVO entra por el ledger, y NADIE más escribe Product.stock.
// ============================================================================
//
// Dos defectos que esto guarda:
//   1. El alta escribía `stock` en el `create`: el producto nacía con kilos que ninguna fila
//      del ledger explicaba.
//   2. La edición del catálogo escribía `stock` con el número de cuando se abrió la pantalla:
//      guardar un precio después de una venta devolvía los kilos vendidos, sin movimiento.
//
// Cuatro frentes, sin DB:
//   · la decisión pura (`planDeAlta`) con datos;
//   · `crearProductoConStockInicial` corrida contra un tx FALSO en memoria, que ejecuta el
//     `recordMovement` real del ledger (no un doble): se ve la fila creada en 0, el AJUSTE
//     y el saldo;
//   · un barrido del árbol: fuera de ledger.ts y de los blueprints de siembra, ninguna
//     llamada a `product.create/update/upsert…` lleva `stock` en sus argumentos;
//   · el formulario de alta REAL en Chromium: el producto siguiente no hereda el stock
//     inicial ni el precio del anterior (si no, cada alta repetía el AJUSTE "Stock inicial").

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, Page } from "playwright";
import type { LedgerTx } from "./ledger";
import {
  MOTIVO_STOCK_INICIAL,
  crearProductoConStockInicial,
  planDeAlta,
  type AltaProducto,
} from "./alta-producto";

const ALTA: AltaProducto = {
  tenantId: "magra",
  name: "Vacío al vacío",
  unit: "kg",
  lowStockAt: 5,
  venta: { saleUnit: "WEIGHT", price: null, pricePerKg: 18900, trackStock: true },
  stockInicial: 10,
  createdBy: "user:u1",
};

// ── 1. La decisión pura ─────────────────────────────────────────────────────

test("alta con stock inicial 10: el producto se crea en 0 y el ledger asienta AJUSTE 'Stock inicial' por 10", () => {
  const plan = planDeAlta(ALTA);
  assert.equal(plan.producto.stock, 0);
  assert.equal(plan.producto.tenantId, "magra");
  assert.equal(plan.producto.pricePerKg, 18900);
  assert.deepEqual(plan.movimiento, {
    type: "AJUSTE",
    qty: 10,
    reason: MOTIVO_STOCK_INICIAL,
    createdBy: "user:u1",
  });
});

test("alta sin stock inicial: no hay movimiento (el ledger no acepta cantidad cero)", () => {
  assert.equal(planDeAlta({ ...ALTA, stockInicial: 0 }).movimiento, null);
});

test("stock inicial con gramos se redondea igual que el ledger", () => {
  assert.equal(planDeAlta({ ...ALTA, stockInicial: 4.3504 }).movimiento?.qty, 4.35);
});

test("stock inicial negativo o NaN se rechaza: antes NaN abortaba el alta SIN avisar", () => {
  assert.throws(() => planDeAlta({ ...ALTA, stockInicial: -3 }), /mayor o igual a cero/);
  assert.throws(() => planDeAlta({ ...ALTA, stockInicial: Number.NaN }), /mayor o igual a cero/);
  assert.throws(() => planDeAlta({ ...ALTA, name: "   " }), /nombre/);
});

// ── 2. La ejecución, contra un tx falso que corre el ledger real ─────────────

type FilaProducto = { id: string; tenantId: string; stock: number; name: string };
type FilaMovimiento = { productId: string; type: string; qty: number; balanceAfter: number; reason: string | null };

function txFalso() {
  const productos: FilaProducto[] = [];
  const movimientos: FilaMovimiento[] = [];
  const log: string[] = [];
  const tx = {
    product: {
      async create({ data }: { data: FilaProducto }) {
        log.push(`create stock=${data.stock}`);
        const fila = { ...data, id: `p${productos.length + 1}` };
        productos.push(fila);
        return { id: fila.id };
      },
      async updateMany({
        where,
        data,
      }: {
        where: { id: string; tenantId: string; stock?: { gte: number } };
        data: { stock: { increment: number } };
      }) {
        const f = productos.find(
          (p) =>
            p.id === where.id &&
            p.tenantId === where.tenantId &&
            (where.stock == null || p.stock >= where.stock.gte),
        );
        if (!f) return { count: 0 };
        f.stock += data.stock.increment;
        log.push(`increment ${data.stock.increment}`);
        return { count: 1 };
      },
      async findUnique({ where }: { where: { id: string } }) {
        const f = productos.find((p) => p.id === where.id);
        return f ? { stock: f.stock } : null;
      },
    },
    stockMovement: {
      async create({ data }: { data: FilaMovimiento }) {
        movimientos.push(data);
        log.push(`movimiento ${data.type} ${data.qty}`);
        return data;
      },
    },
  };
  return { tx: tx as unknown as LedgerTx, productos, movimientos, log };
}

test("crearProductoConStockInicial: create en 0, después el AJUSTE, y el saldo cierra", async () => {
  const f = txFalso();
  const r = await crearProductoConStockInicial(f.tx, ALTA);
  assert.deepEqual(f.log, ["create stock=0", "increment 10", "movimiento AJUSTE 10"]);
  assert.equal(r.stock, 10);
  assert.equal(f.productos[0].stock, 10);
  assert.equal(f.movimientos.length, 1);
  assert.equal(f.movimientos[0].reason, "Stock inicial");
  assert.equal(f.movimientos[0].balanceAfter, 10);
});

test("crearProductoConStockInicial sin stock: sólo el create, ninguna fila en el ledger", async () => {
  const f = txFalso();
  const r = await crearProductoConStockInicial(f.tx, { ...ALTA, stockInicial: 0 });
  assert.deepEqual(f.log, ["create stock=0"]);
  assert.equal(r.stock, 0);
  assert.equal(f.movimientos.length, 0);
});

// ── 3. Nadie más escribe Product.stock ──────────────────────────────────────

const SRC = fileURLToPath(new URL("../../", import.meta.url));

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === "generated" || n === "node_modules" ? [] : archivos(p);
    return /\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });
}

// Los argumentos de una llamada, con paréntesis balanceados desde `desde` (el "(").
function argumentos(src: string, desde: number): string {
  let prof = 0;
  for (let i = desde; i < src.length; i++) {
    if (src[i] === "(") prof++;
    else if (src[i] === ")" && --prof === 0) return src.slice(desde + 1, i);
  }
  return src.slice(desde + 1);
}

// Los únicos que pueden escribir `stock`: el ledger (el mutador) y los blueprints que siembran
// un tenant nuevo (src/blueprints/retail/index.ts:30-35), que corren antes de que exista un
// solo movimiento que cuidar.
const PERMITIDOS = [`lib${sep}stock${sep}ledger.ts`, `blueprints${sep}`];

test("fuera de ledger.ts y de src/blueprints, ninguna escritura de Product lleva `stock`", () => {
  const llamada = /\.product\.(create|createMany|createManyAndReturn|update|updateMany|upsert)\s*\(/g;
  const culpables: string[] = [];
  for (const archivo of archivos(SRC)) {
    const rel = relative(SRC, archivo);
    if (PERMITIDOS.some((p) => rel.startsWith(p))) continue;
    const src = readFileSync(archivo, "utf8");
    for (const m of src.matchAll(llamada)) {
      const args = argumentos(src, m.index! + m[0].length - 1);
      if (/\bstock\s*[:,}]/.test(args)) {
        const linea = src.slice(0, m.index).split("\n").length;
        culpables.push(`${rel}:${linea}`);
      }
    }
    // SQL crudo: `UPDATE "Product" SET ... "stock"`.
    if (/UPDATE\s+"Product"\s+SET[^`;]*"stock"/i.test(src)) culpables.push(`${rel} (SQL crudo)`);
  }
  assert.deepEqual(
    culpables,
    [],
    "estas escrituras mueven Product.stock sin pasar por recordMovement (ledger.ts): el stock " +
      "cambia y el historial no tiene la fila que lo explique.",
  );
});

test("el barrido detecta lo que tiene que detectar (si no, pasar no prueba nada)", () => {
  const viejo = `await prisma.product.update({\n  where: { id },\n  data: { name, unit, stock, lowStockAt },\n});`;
  const m = /\.product\.update\s*\(/.exec(viejo)!;
  assert.match(argumentos(viejo, m.index + m[0].length - 1), /\bstock\s*[:,}]/);
  const bien = `await prisma.product.updateMany({ where: { id, tenantId }, data: { name, lowStockAt } });`;
  const m2 = /\.product\.updateMany\s*\(/.exec(bien)!;
  assert.doesNotMatch(argumentos(bien, m2.index + m2[0].length - 1), /\bstock\s*[:,}]/);
});

test("el catálogo ya no manda un campo `stock` en la edición", () => {
  // La edición de CH (ProductsSection) y la de MAGRA (CortesSection) mostraban el stock en un
  // input editable con el valor de cuando se abrió la pantalla. Aunque el server ya no lo lea,
  // un `name="stock"` en la edición vuelve a invitar a escribirlo.
  for (const f of ["ProductsSection.tsx", "CortesSection.tsx"]) {
    const src = readFileSync(join(SRC, "app", "admin", "(dashboard)", "catalogo", f), "utf8");
    const edicion = src.slice(src.indexOf("await updateProduct(fd)"));
    const finForm = edicion.indexOf("</form>");
    assert.ok(finForm > 0, `${f}: no encontré el formulario de edición`);
    assert.doesNotMatch(edicion.slice(0, finForm), /name="stock"/, `${f}: la edición volvió a mandar stock`);
    assert.match(edicion.slice(0, finForm), /<StockSoloLectura/, `${f}: la edición perdió el stock con Recontar`);
  }
  // Y el "Recontar" lleva al recuento con el producto y el motivo ya elegidos (ajustes/page.tsx
  // lee esos dos parámetros).
  const ps = readFileSync(join(SRC, "app", "admin", "(dashboard)", "catalogo", "ProductsSection.tsx"), "utf8");
  const comp = ps.slice(ps.indexOf("export function StockSoloLectura"));
  assert.match(comp, /\/admin\/ajustes\?producto=\$\{encodeURIComponent\(productId\)\}&motivo=RECUENTO/);
  assert.match(comp, />\s*Recontar\s*</);
});

test("el alta y la edición leen TODO el formulario antes de escribir", () => {
  // Un costo ilegible lanza en `parseCarniceriaExtras`. Si eso pasara después del create, el
  // producto quedaría creado con la action en error, y reintentar lo duplicaría.
  const src = readFileSync(join(SRC, "lib", "catalog-actions.ts"), "utf8");
  for (const [fn, escritura] of [
    ["createProduct", "tenantTransaction("],
    ["updateProduct", "prisma.product.updateMany("],
  ] as const) {
    const cuerpo = src.slice(src.indexOf(`export async function ${fn}(`));
    const escribe = cuerpo.indexOf(escritura);
    assert.ok(escribe > 0, `${fn}: no encontré la escritura`);
    for (const lectura of ["parseCarniceriaExtras(formData)", "parseSaleFields(formData)", "parseLowStockAt(formData)"]) {
      const lee = cuerpo.indexOf(lectura);
      assert.ok(lee > 0 && lee < escribe, `${fn}: ${lectura} tiene que ir antes de ${escritura}`);
    }
  }
});

// ── 4. En el navegador: el alta siguiente no hereda los números del anterior ────
//
// `CampoDecimal` guarda lo tipeado en estado (lo lee mientras se tipea), y el reset que React
// 19 le hace al `<form action>` al terminar el alta es el `form.reset()` nativo: sólo alcanza a
// los campos NO controlados. Sin `useVolverAlResetear` (ProductsSection.tsx), el segundo
// producto viajaba con el stock inicial del primero (otro AJUSTE "Stock inicial" que nadie
// cargó) y con su precio. Eso no se ve sin React y un DOM de verdad: se bundlean los
// componentes REALES con esbuild (sólo la Server Action se reemplaza por una que guarda el
// FormData, y `next/link` por un `<a>`) y se tipea en Chromium.
//
// Sin Chromium o sin esbuild se saltea y lo dice; donde están (este contenedor,
// /opt/pw-browsers; el job `tests` del CI, que lo instala desde ENG-000), corre.

const RAIZ = fileURLToPath(new URL("../../../", import.meta.url));

const ACCIONES_FALSAS = `
const guardar = (fd) => {
  const o = {};
  for (const k of new Set(fd.keys())) o[k] = fd.getAll(k).map(String);
  window.__envios.push(o);
};
export async function createProduct(fd) { guardar(fd); }
export async function updateProduct(fd) { guardar(fd); }
export async function toggleProductActive() {}
export async function deleteProduct() {}
`;
const LINK_FALSO = `
import { createElement } from "react";
export default function Link({ href, children, prefetch, ...resto }) {
  return createElement("a", { href, ...resto }, children);
}
`;
const ENTRADA = `
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import ProductsSection from "@/app/admin/(dashboard)/catalogo/ProductsSection";
import CortesSection from "@/app/admin/(dashboard)/catalogo/CortesSection";
window.__envios = [];
window.__montar = (cual) =>
  createRoot(document.getElementById("root")).render(
    cual === "cortes"
      ? createElement(CortesSection, { cortes: [], catalogHeading: "" })
      : createElement(ProductsSection, { products: [] }),
  );
`;

type Envio = Record<string, string[]>;
type Ventana = { __envios: Envio[]; __montar: (cual: "productos" | "cortes") => void };

// El Chromium de Playwright; si la versión instalada no es la que espera este Playwright
// (pasa en este contenedor), el que haya en PLAYWRIGHT_BROWSERS_PATH.
function rutaDeChromium(porDefecto: () => string): string | null {
  try {
    const p = porDefecto();
    if (existsSync(p)) return p;
  } catch {
    // sin navegador registrado: se busca abajo
  }
  const dir = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!dir || !existsSync(dir)) return null;
  for (const n of readdirSync(dir).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse()) {
    for (const sub of ["chrome-linux64", "chrome-linux"]) {
      const p = join(dir, n, sub, "chrome");
      if (existsSync(p)) return p;
    }
  }
  return null;
}

describe("alta en el navegador: después de cada alta los números vuelven a su inicial", { timeout: 90_000 }, () => {
  let browser: Browser | null = null;
  let bundle = "";
  let sinNavegador = "";

  before(async () => {
    let esbuild: typeof import("esbuild");
    let playwright: typeof import("playwright");
    try {
      esbuild = await import("esbuild");
      playwright = await import("playwright");
    } catch {
      sinNavegador = "no están esbuild o playwright";
      return;
    }
    const chrome = rutaDeChromium(() => playwright.chromium.executablePath());
    if (!chrome) {
      sinNavegador = "no hay un Chromium instalado";
      return;
    }
    const r = await esbuild.build({
      stdin: { contents: ENTRADA, loader: "tsx", resolveDir: RAIZ },
      bundle: true,
      write: false,
      format: "iife",
      jsx: "automatic",
      tsconfig: join(RAIZ, "tsconfig.json"),
      define: { "process.env.NODE_ENV": '"production"' },
      logLevel: "silent",
      plugins: [
        {
          name: "falsos",
          setup(b) {
            b.onResolve({ filter: /^@\/lib\/catalog-actions$/ }, () => ({ path: "acciones", namespace: "falso" }));
            b.onResolve({ filter: /^next\/link$/ }, () => ({ path: "link", namespace: "falso" }));
            b.onLoad({ filter: /.*/, namespace: "falso" }, (a) => ({
              contents: a.path === "acciones" ? ACCIONES_FALSAS : LINK_FALSO,
              loader: "js",
              resolveDir: RAIZ,
            }));
          },
        },
      ],
    });
    bundle = r.outputFiles[0].text;
    browser = await playwright.chromium.launch({ executablePath: chrome });
  });

  after(async () => {
    await browser?.close();
  });

  async function montar(cual: "productos" | "cortes"): Promise<{ page: Page; errores: string[] }> {
    const page = await browser!.newPage();
    const errores: string[] = [];
    page.on("pageerror", (e) => errores.push(e.message));
    await page.setContent('<!doctype html><html lang="es"><body><div id="root"></div></body></html>');
    await page.addScriptTag({ content: bundle });
    await page.evaluate((c) => (window as unknown as Ventana).__montar(c), cual);
    return { page, errores };
  }

  // Toca el botón y espera a que la action haya recibido el envío número `n` y a que React
  // haya reseteado el form (el nombre, que no es controlado, vuelve a vacío).
  async function enviar(page: Page, boton: string, nombreId: string, n: number): Promise<Envio> {
    await page.getByRole("button", { name: boton }).click();
    await page.waitForFunction((k) => (window as unknown as Ventana).__envios.length >= k, n);
    await page.waitForFunction((id) => (document.getElementById(id) as HTMLInputElement).value === "", nombreId);
    return page.evaluate((k) => (window as unknown as Ventana).__envios[k - 1], n);
  }

  test("CH: el alta de 'Crema B' no viaja con el stock inicial ni el precio de 'Crema A'", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("productos");
    await page.fill("#new-product-name", "Crema A");
    await page.fill("#new-product-stock", "10");
    await page.fill("#new-product-precio", "15.000");
    const primero = await enviar(page, "Agregar producto", "new-product-name", 1);
    assert.deepEqual(primero.stock, ["10"]);
    assert.deepEqual(primero.price, ["15000"]); // "15.000" son quince mil (leerImporte)

    // Después del alta, los números a la vista vuelven a su inicial…
    assert.equal(await page.inputValue("#new-product-stock"), "");
    assert.equal(await page.inputValue("#new-product-precio"), "");
    assert.equal(await page.inputValue("#new-product-low"), "5");

    // …y lo que viaja también: tipeando sólo el nombre, no hay stock inicial ni precio.
    await page.fill("#new-product-name", "Crema B");
    const segundo = await enviar(page, "Agregar producto", "new-product-name", 2);
    assert.deepEqual(segundo.name, ["Crema B"]);
    assert.deepEqual(segundo.stock, [""]); // vacío = 0 en createProduct: ningún AJUSTE
    assert.deepEqual(segundo.price, [""]);
    assert.deepEqual(segundo.lowStockAt, ["5"]);
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("CH: después de un alta 'por peso', la forma de venta vuelve a 'por unidad' entera", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("productos");
    await page.fill("#new-product-name", "Queso");
    await page.selectOption("#new-product-saleUnit", "WEIGHT");
    await page.fill("#new-product-precio", "9.000");
    const primero = await enviar(page, "Agregar producto", "new-product-name", 1);
    assert.deepEqual([primero.saleUnit, primero.unit, primero.pricePerKg], [["WEIGHT"], ["kg"], ["9000"]]);

    // El select vuelve solo a "por unidad"; el resto del form (unidad, qué precio manda)
    // tiene que acompañarlo, no quedarse en kg.
    await page.fill("#new-product-name", "Jabón");
    const segundo = await enviar(page, "Agregar producto", "new-product-name", 2);
    assert.deepEqual(segundo.saleUnit, ["UNIT"]);
    assert.deepEqual(segundo.unit, ["unidades"]);
    assert.deepEqual(segundo.price, [""]);
    assert.equal(segundo.pricePerKg, undefined);
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("cortes: 'Matambre' no hereda stock, precio/kg ni costo de 'Vacío', y la forma de venta vuelve a kilo", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("cortes");
    await page.fill("#new-corte-name", "Vacío");
    await page.fill("#new-corte-precio", "18.900");
    await page.fill("#new-corte-cost", "9.000");
    await page.fill("#new-corte-stock", "10");
    const primero = await enviar(page, "Agregar corte", "new-corte-name", 1);
    assert.deepEqual([primero.pricePerKg, primero.cost, primero.stock], [["18900"], ["9000"], ["10"]]);

    await page.fill("#new-corte-name", "Matambre");
    const segundo = await enviar(page, "Agregar corte", "new-corte-name", 2);
    assert.deepEqual(segundo.stock, ["0"]);
    assert.deepEqual(segundo.pricePerKg, [""]);
    assert.deepEqual(segundo.cost, [""]);

    // Un corte "por unidad" y después uno más: el siguiente vuelve a kilo, con unit=kg.
    await page.selectOption("#new-corte-saleUnit", "UNIT");
    await page.fill("#new-corte-name", "Chorizo");
    await page.fill("#new-corte-unit", "unidad");
    await page.fill("#new-corte-precio", "1.500");
    const tercero = await enviar(page, "Agregar corte", "new-corte-name", 3);
    assert.deepEqual([tercero.saleUnit, tercero.unit, tercero.price], [["UNIT"], ["unidad"], ["1500"]]);

    await page.fill("#new-corte-name", "Morcilla");
    const cuarto = await enviar(page, "Agregar corte", "new-corte-name", 4);
    assert.deepEqual([cuarto.saleUnit, cuarto.unit, cuarto.pricePerKg], [["WEIGHT"], ["kg"], [""]]);
    assert.equal(cuarto.price, undefined);
    assert.deepEqual(errores, []);
    await page.close();
  });
});
