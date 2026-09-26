// ============================================================================
// MIS LOCALES — el núcleo EJECUTADO con datos: quién es la casa, qué locales se leen, cuánto
// vendió cada uno, qué dice su caja, la matriz de stock, el rango de fechas y el vínculo.
// ============================================================================
//
// El vínculo y la pasada corren contra una base falsa que se porta como Postgres con RLS y el
// rol `app_rls`: cada fila tiene su `tenantId`, y sólo se ve o se escribe con el GUC de ese
// negocio puesto. Si el código escribiera la auditoría del local con el GUC de la casa (o la
// fila de la red con el del local), esta base lo rechaza igual que la real.

import { test } from "node:test";
import assert from "node:assert/strict";
import { businessWallTimeToUtc } from "@/lib/datetime";
import {
  aliasDelLocal,
  cambioRelativo,
  consolidarPorCuit,
  csvVentasDeLaRed,
  darDeBajaEnTx,
  decidirAcceso,
  diasEntre,
  direccionDelLocal,
  elegirLocal,
  esStockBajo,
  estaEnNegativo,
  filtrarMatriz,
  leerRango,
  leerRedEnTx,
  localesDeLaRed,
  localesDeOtrasRedes,
  lunesDe,
  matrizDeStock,
  recolectarLocal,
  recorrerLocales,
  resumenDeLaFicha,
  resumirRed,
  validarVinculo,
  ventasDe,
  ventasPorDia,
  vincularEnTx,
  whereProductosDeStock,
  MAX_DIAS_RANGO,
  type ContextoPasada,
  type FilaCaja,
  type FilaRed,
  type LocalConPasada,
  type LocalDeLaRed,
  type MetaLocal,
  type NegocioDeLaRed,
  type PasadaLocal,
  type ProductoLocal,
  type PuertosRed,
} from "./multilocal-core";

// ── Quién es la casa ─────────────────────────────────────────────────────────

test("la casa necesita multilocal y no puede tener la cartera del contador", () => {
  assert.deepEqual(decidirAcceso(["pos", "multilocal"], "casa"), { ok: true });
  const sin = decidirAcceso(["pos", "catalog"], "casa");
  assert.equal(sin.ok, false);
  assert.match(sin.ok ? "" : sin.error, /Mis locales no está habilitado/);
  // CH hoy: sin módulos. Aunque su OWNER tenga la capability, no es casa.
  assert.equal(decidirAcceso([], "casa").ok, false);
  // Los dos a la vez: ninguno de los dos paneles se abre.
  const mezcla = decidirAcceso(["cartera", "multilocal"], "casa");
  assert.equal(mezcla.ok, false);
  assert.match(mezcla.ok ? "" : mezcla.error, /no pueden convivir/);
  // Sin la fila del negocio, cerrado.
  assert.equal(decidirAcceso(null, "casa").ok, false);
});

test("el estudio contable rechaza a quien tenga multilocal (exigirEstudio usa la misma regla)", () => {
  assert.deepEqual(decidirAcceso(["cartera", "arca", "bancos"], "estudio"), { ok: true });
  const casa = decidirAcceso(["cartera", "multilocal"], "estudio");
  assert.equal(casa.ok, false);
  assert.match(casa.ok ? "" : casa.error, /no pueden convivir/);
  assert.match((decidirAcceso(["multilocal"], "estudio") as { error: string }).error, /Cartera no está habilitado/);
});

// ── Los locales salen SÓLO de las filas de la casa ───────────────────────────

const META: Record<string, MetaLocal> = {
  "t-canning": { nombre: "MAGRA Canning", slug: "magra-canning", subdomain: "magra-canning", arcaCuit: "20304050607", arcaPuntoVenta: 3 },
  "t-lomas": { nombre: "MAGRA Lomas", slug: "magra-lomas", subdomain: null, arcaCuit: "20304050607", arcaPuntoVenta: null },
  "t-ajeno": { nombre: "Velas Shine", slug: "shinevelas", subdomain: "shinevelas", arcaCuit: "27111111113", arcaPuntoVenta: 1 },
};

function puertosDe(filas: FilaRed[], leidos: string[] = []): PuertosRed {
  return {
    filasDeLaRed: async () => filas,
    metaDeLocales: async (ids) => {
      leidos.push(...ids);
      return new Map(ids.filter((id) => META[id]).map((id) => [id, META[id]]));
    },
    enLocal: async (id, fn) => fn({ __local: id } as never),
  };
}

test("la red se lee sólo de las filas activas de la casa, sin la casa misma ni huérfanas", async () => {
  const leidos: string[] = [];
  const filas: FilaRed[] = [
    { id: "1", localTenantId: "t-canning", alias: "Canning", estado: "activa" },
    { id: "2", localTenantId: "t-lomas", alias: "Lomas", estado: "baja" },
    { id: "3", localTenantId: "t-casa", alias: "La casa", estado: "activa" },
    { id: "4", localTenantId: "t-borrado", alias: "Viejo", estado: "activa" },
  ];
  const locales = await localesDeLaRed(puertosDe(filas, leidos), "t-casa");
  assert.deepEqual(locales.map((l) => l.localTenantId), ["t-canning"]);
  // La metadata se pide sólo para los ids de filas activas que no son la casa.
  assert.deepEqual(leidos.sort(), ["t-borrado", "t-canning"]);
});

test("recorrerLocales abre UNA transacción por local, con el id de la fila (de a uno si se pide de a uno)", async () => {
  const filas: FilaRed[] = [
    { id: "1", localTenantId: "t-canning", alias: "Canning", estado: "activa" },
    { id: "2", localTenantId: "t-lomas", alias: "Lomas", estado: "activa" },
  ];
  const abiertas: string[] = [];
  const p = puertosDe(filas);
  let enCurso = 0;
  const r = await recorrerLocales(
    { ...p, enLocal: async (id, fn) => { abiertas.push(id); enCurso++; assert.equal(enCurso, 1, "en serie"); const x = await fn({} as never); enCurso--; return x; } },
    "t-casa",
    async (_tx, local) => local.alias.toUpperCase(),
    1,
  );
  assert.deepEqual(abiertas, ["t-canning", "t-lomas"]);
  assert.deepEqual(r.leidos.map((x) => x.dato), ["CANNING", "LOMAS"]);
  assert.deepEqual(r.fallidos, []);
});

test("un local que falla no tumba la red: los demás se leen y el que falló queda nombrado", async () => {
  const filas: FilaRed[] = [
    { id: "1", localTenantId: "t-canning", alias: "Canning", estado: "activa" },
    { id: "2", localTenantId: "t-lomas", alias: "Lomas", estado: "activa" },
  ];
  const caida = Object.assign(new Error("Timed out fetching a new connection from the connection pool"), { code: "P2024" });
  const p = puertosDe(filas);
  const r = await recorrerLocales(
    { ...p, enLocal: async (id, fn) => { if (id === "t-canning") throw caida; return fn({} as never); } },
    "t-casa",
    async (_tx, local) => local.alias,
  );
  assert.deepEqual(r.leidos.map((x) => x.dato), ["Lomas"], "Lomas se lee aunque Canning falló antes");
  assert.deepEqual(r.fallidos.map((f) => [f.local.alias, f.error]), [["Canning", caida]]);
  // Las filas de la red sí son de todos: si ESA lectura falla, falla la pantalla entera (y la
  // action lo convierte en un aviso, nunca en la pantalla genérica).
  await assert.rejects(
    recorrerLocales({ ...p, filasDeLaRed: async () => { throw caida; } }, "t-casa", async () => 1),
    /Timed out/,
  );
});

test("un local pedido desde afuera sólo vale si es de la red: el ajeno da error", () => {
  const locales = [{ localTenantId: "t-canning" }, { localTenantId: "t-lomas" }];
  assert.deepEqual(elegirLocal(locales, undefined), { ok: true, local: null });
  assert.deepEqual(elegirLocal(locales, "  "), { ok: true, local: null });
  assert.deepEqual(elegirLocal(locales, "t-lomas"), { ok: true, local: { localTenantId: "t-lomas" } });
  const ajeno = elegirLocal(locales, "t-ajeno");
  assert.equal(ajeno.ok, false);
  assert.match(ajeno.ok ? "" : ajeno.error, /no es de tu red/);
  // Un id inexistente da exactamente el mismo error: no se confirma qué negocios existen.
  assert.deepEqual(elegirLocal(locales, "no-existe"), ajeno);
});

// ── Ventas con el criterio del libro ─────────────────────────────────────────

const HOY = "2026-09-23"; // miércoles
const a = (dia: string, hora = "12:00") => businessWallTimeToUtc(dia, hora);
const fila = (dia: string, type: FilaCaja["type"], method: FilaCaja["method"], amount: number, extra: Partial<FilaCaja> = {}): FilaCaja => ({
  occurredAt: a(dia),
  type,
  method,
  amount,
  createdBy: "user:u1",
  orderId: null,
  ...extra,
});

test("ventas: cuenta VENTA, resta sólo las anulaciones; compras y retiros no son ventas", () => {
  const v = ventasDe([
    fila(HOY, "VENTA", "EFECTIVO", 1000, { orderId: "o1" }),
    fila(HOY, "VENTA", "MP", 500), // cobro de turno
    fila(HOY, "EGRESO", "EFECTIVO", 1000, { orderId: "o1", createdBy: "anulacion-venta:user:u1" }),
    fila(HOY, "EGRESO", "EFECTIVO", 300, { createdBy: "compra:p1" }),
    fila(HOY, "RETIRO", "EFECTIVO", 200),
    fila(HOY, "INGRESO", "EFECTIVO", 50),
  ]);
  assert.deepEqual(v.ventas, { EFECTIVO: 1000, MP: 500, TARJETA: 0 });
  assert.deepEqual(v.anulado, { EFECTIVO: 1000, MP: 0, TARJETA: 0 });
  assert.equal(v.neto, 500);
  assert.equal(v.cantidad, 2);
});

test("ventas por día: el día es el del negocio, no el de UTC", () => {
  // 23:30 del 22 en Argentina son las 02:30 del 23 en UTC: es venta del 22.
  const tarde = { ...fila("2026-09-22", "VENTA", "EFECTIVO", 100), occurredAt: a("2026-09-22", "23:30") };
  const r = ventasPorDia([tarde, fila(HOY, "VENTA", "TARJETA", 40)]);
  assert.deepEqual(r.map((d) => [d.dia, d.ventas.neto]), [["2026-09-22", 100], [HOY, 40]]);
});

// ── La pasada de un local, contra una base falsa ─────────────────────────────

type Mov = { id: string; tenantId: string; occurredAt: Date; type: FilaCaja["type"]; method: FilaCaja["method"]; amount: number; createdBy: string; orderId: string | null };

function txDeCaja(movs: Mov[], productos: (ProductoLocal & { tenantId: string })[]) {
  const pasa = (m: Mov, where: Record<string, unknown>) => {
    if (where.tenantId !== undefined && m.tenantId !== where.tenantId) return false;
    const t = where.type as { in?: string[] } | undefined;
    if (t?.in && !t.in.includes(m.type)) return false;
    const o = where.occurredAt as { gte?: Date; lt?: Date } | undefined;
    if (o?.gte && m.occurredAt < o.gte) return false;
    if (o?.lt && m.occurredAt >= o.lt) return false;
    return true;
  };
  const consultas: string[] = [];
  const tx = {
    cashMovement: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        consultas.push("cashMovement.findMany");
        assert.ok(where.tenantId, "toda consulta lleva el negocio");
        return movs.filter((m) => pasa(m, where)).sort((x, y) => x.occurredAt.getTime() - y.occurredAt.getTime());
      },
      groupBy: async ({ where }: { where: Record<string, unknown> }) => {
        consultas.push("cashMovement.groupBy");
        const g = new Map<string, number>();
        for (const m of movs.filter((m) => pasa(m, where))) g.set(`${m.type}|${m.method}`, (g.get(`${m.type}|${m.method}`) ?? 0) + m.amount);
        return [...g.entries()].map(([k, v]) => ({ type: k.split("|")[0], method: k.split("|")[1], _sum: { amount: v } }));
      },
    },
    product: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        consultas.push("product.findMany");
        return productos
          .filter((p) => p.tenantId === where.tenantId)
          .map((p) => ({ name: p.nombre, saleUnit: p.saleUnit, unit: p.unidad, stock: p.stock, lowStockAt: p.minimo, trackStock: p.controla }));
      },
    },
  };
  return { tx: tx as never, consultas };
}

const CANNING: LocalDeLaRed = { ...META["t-canning"], localTenantId: "t-canning", alias: "Canning" };

function ctxCon(cerradoHasta: string | null, cierres: { entityId: string; createdAt: Date; changes: unknown }[] = []): ContextoPasada {
  return {
    hoy: HOY,
    leerFronteraCaja: async (_tx, tenantId) => {
      assert.equal(tenantId, "t-canning");
      return cerradoHasta;
    },
    leerCierres: async () => cierres,
  };
}

test("la caja del local: el mismo período, la misma cuenta y los mismos medios que su pantalla de Caja", async () => {
  const movs: Mov[] = [
    // Antes del último cierre (20/09): es el arrastre.
    { id: "m1", tenantId: "t-canning", occurredAt: a("2026-09-19"), type: "VENTA", method: "EFECTIVO", amount: 1000, createdBy: "user:u", orderId: "o0" },
    { id: "m2", tenantId: "t-canning", occurredAt: a("2026-09-20"), type: "RETIRO", method: "EFECTIVO", amount: 400, createdBy: "user:u", orderId: null },
    // Sin cerrar: el 21 (antes de hoy) y hoy.
    { id: "m3", tenantId: "t-canning", occurredAt: a("2026-09-21"), type: "VENTA", method: "MP", amount: 700, createdBy: "user:u", orderId: "o1" },
    { id: "m4", tenantId: "t-canning", occurredAt: a(HOY, "10:00"), type: "VENTA", method: "EFECTIVO", amount: 250, createdBy: "user:u", orderId: "o2" },
    { id: "m5", tenantId: "t-canning", occurredAt: a(HOY, "11:00"), type: "EGRESO", method: "EFECTIVO", amount: 50, createdBy: "user:u", orderId: null },
    // Otro negocio: no se puede colar.
    { id: "x1", tenantId: "t-ajeno", occurredAt: a(HOY), type: "VENTA", method: "EFECTIVO", amount: 99999, createdBy: "user:z", orderId: "oz" },
  ];
  const { tx } = txDeCaja(movs, []);
  const p = await recolectarLocal(tx, CANNING, ctxCon("2026-09-20"));
  assert.equal(p.caja.estado, "abierta");
  if (p.caja.estado !== "abierta") return;
  assert.equal(p.caja.desde, "2026-09-21");
  assert.equal(p.caja.pendienteDesde, "2026-09-21");
  // Efectivo: arrastre 1000 − 400 = 600, + 250 − 50 = 800. MP: 700.
  assert.deepEqual(p.caja.porMedio.EFECTIVO, { ingresos: 250, egresos: 50, hay: 800 });
  assert.deepEqual(p.caja.porMedio.MP, { ingresos: 700, egresos: 0, hay: 700 });
  assert.equal(p.caja.total, 1500);
  // Cobrado hoy: sólo lo de hoy y sólo de este local.
  assert.equal(p.hoy.neto, 250);
});

test("la caja: hoy ya cerrado no tiene período, y sin movimientos viejos está al día", async () => {
  const { tx } = txDeCaja([], []);
  const cerrada = await recolectarLocal(tx, CANNING, ctxCon(HOY));
  assert.deepEqual(cerrada.caja, { estado: "cerrada-hoy", cerradoHasta: HOY });
  const nueva = await recolectarLocal(tx, CANNING, ctxCon(null));
  assert.equal(nueva.caja.estado === "abierta" && nueva.caja.pendienteDesde, null);
  assert.equal(nueva.caja.estado === "abierta" && nueva.caja.desde, null);
});

test("la semana: lunes a hoy contra la semana anterior hasta el MISMO día", async () => {
  assert.equal(lunesDe(HOY), "2026-09-21");
  assert.equal(lunesDe("2026-09-21"), "2026-09-21");
  assert.equal(lunesDe("2026-09-27"), "2026-09-21"); // domingo
  const movs: Mov[] = [
    { id: "s1", tenantId: "t-canning", occurredAt: a("2026-09-14"), type: "VENTA", method: "EFECTIVO", amount: 100, createdBy: "u", orderId: "a" },
    { id: "s2", tenantId: "t-canning", occurredAt: a("2026-09-16"), type: "VENTA", method: "EFECTIVO", amount: 100, createdBy: "u", orderId: "b" },
    // Jueves de la semana pasada: queda fuera de la comparación de un miércoles.
    { id: "s3", tenantId: "t-canning", occurredAt: a("2026-09-17"), type: "VENTA", method: "EFECTIVO", amount: 5000, createdBy: "u", orderId: "c" },
    { id: "s4", tenantId: "t-canning", occurredAt: a("2026-09-22"), type: "VENTA", method: "EFECTIVO", amount: 224, createdBy: "u", orderId: "d" },
  ];
  const { tx } = txDeCaja(movs, []);
  const p = await recolectarLocal(tx, CANNING, ctxCon("2026-09-22"));
  assert.deepEqual(p.semana, { actual: 224, anterior: 200 });
  assert.equal(cambioRelativo(224, 200), 0.12);
  assert.equal(cambioRelativo(10, 0), null);
});

test("los cierres del local: la diferencia que asentó cada uno, leída de su auditoría", async () => {
  const { tx } = txDeCaja([], []);
  const p = await recolectarLocal(
    tx,
    CANNING,
    ctxCon("2026-09-22", [
      {
        entityId: "2026-09-22",
        createdAt: a("2026-09-22", "21:00"),
        changes: {
          estado: "FALTANTE",
          movimientos: 12,
          porMedio: {
            EFECTIVO: { esperado: 1000, declarado: 900, diferencia: -100 },
            MP: { esperado: 500, declarado: 500, diferencia: 0 },
            TARJETA: { esperado: 0, declarado: null, diferencia: null },
          },
        },
      },
      { entityId: "2026-09-21", createdAt: a("2026-09-21", "21:00"), changes: { raro: true } },
    ]),
  );
  assert.equal(p.cierres.length, 1, "un cierre sin la forma del cierre no se inventa");
  assert.equal(p.cierres[0].estado, "FALTANTE");
  assert.equal(p.cierres[0].diferencia, -100);
  assert.match(p.cierres[0].medios[0], /Efectivo: contó .*900.* faltan .*100/);
});

// ── El tablero ───────────────────────────────────────────────────────────────

function pasada(over: Partial<PasadaLocal>): PasadaLocal {
  return {
    hoy: ventasDe([]),
    semana: { actual: 0, anterior: 0 },
    caja: { estado: "abierta", cerradoHasta: "2026-09-22", desde: HOY, pendienteDesde: null, porMedio: { EFECTIVO: { ingresos: 0, egresos: 0, hay: 0 }, MP: { ingresos: 0, egresos: 0, hay: 0 }, TARJETA: { ingresos: 0, egresos: 0, hay: 0 } }, total: 0 },
    cierres: [],
    stock: [],
    ...over,
  };
}
const prod = (nombre: string, stock: number, minimo = 5, controla = true, saleUnit: "UNIT" | "WEIGHT" = "WEIGHT"): ProductoLocal => ({
  nombre,
  saleUnit,
  unidad: "kg",
  stock,
  minimo,
  controla,
});

test("resumen de la red: cobrado hoy, cajas sin cerrar, stock bajo y el local que más cambió", () => {
  const red: LocalConPasada[] = [
    {
      local: CANNING,
      dato: pasada({
        hoy: ventasDe([fila(HOY, "VENTA", "EFECTIVO", 1000)]),
        semana: { actual: 1120, anterior: 1000 },
        caja: { ...pasada({}).caja, pendienteDesde: "2026-09-21" } as PasadaLocal["caja"],
        stock: [prod("Vacío", 2), prod("Entraña", -1), prod("Carbón", 1, 5, false)],
      }),
    },
    {
      local: { ...META["t-lomas"], localTenantId: "t-lomas", alias: "Lomas" },
      dato: pasada({
        hoy: ventasDe([fila(HOY, "VENTA", "MP", 500)]),
        semana: { actual: 700, anterior: 1000 },
        caja: { ...pasada({}).caja, pendienteDesde: "2026-09-19" } as PasadaLocal["caja"],
        stock: [prod("Vacío", 10)],
      }),
    },
  ];
  const r = resumirRed(red);
  assert.equal(r.locales, 2);
  assert.equal(r.cobradoHoy, 1500);
  assert.equal(r.cajasSinCerrar, 2);
  assert.equal(r.pendienteMasViejo, "2026-09-19");
  // Vacío (2 ≤ 5) y Entraña (−1) en Canning; el carbón no controla stock.
  assert.deepEqual(r.stockBajo, { productos: 2, locales: 1 });
  assert.deepEqual(r.stockNegativo, { productos: 1, locales: 1 });
  assert.deepEqual(r.semana.destacado, { alias: "Lomas", cambio: -0.3 });
  assert.equal(r.sinPuntoDeVenta, 1);
});

test("la matriz de stock cruza por nombre sin acentos ni mayúsculas y por unidad de venta", () => {
  const filas = matrizDeStock([
    { id: "casa", nombre: "Casa", esCasa: true, productos: [prod("Vacío", 40), prod("Vacío", 3, 1, true, "UNIT")] },
    { id: "t-canning", nombre: "Canning", esCasa: false, productos: [prod("  VACIO ", 2), prod("Entraña", 8)] },
    { id: "t-lomas", nombre: "Lomas", esCasa: false, productos: [prod("vacío", -1), prod("vacío", 4)] },
  ]);
  assert.deepEqual(filas.map((f) => [f.nombre, f.saleUnit]), [["Entraña", "WEIGHT"], ["Vacío", "UNIT"], ["Vacío", "WEIGHT"]]);
  const vacio = filas.find((f) => f.saleUnit === "WEIGHT" && f.nombre === "Vacío")!;
  assert.deepEqual(vacio.celdas.map((c) => c?.stock ?? null), [40, 2, 3]);
  assert.equal(vacio.celdas[1]?.bajo, true);
  // Dos productos iguales en Lomas (un duplicado viejo): la celda suma lo que hay en ese local.
  assert.equal(vacio.celdas[2]?.negativo, false);
  const entrania = filas.find((f) => f.nombre === "Entraña")!;
  assert.deepEqual(entrania.celdas.map((c) => c === null), [true, false, true], "en la casa y en Lomas no está");
  assert.deepEqual(filtrarMatriz(filas, { q: "entrana" }).map((f) => f.nombre), ["Entraña"]);
  assert.deepEqual(filtrarMatriz(filas, { soloBajo: true }).map((f) => `${f.nombre}|${f.saleUnit}`), ["Vacío|WEIGHT"]);
});

/** Los casos de la regla del stock: con y sin control, arriba, justo en y bajo el mínimo, y bajo cero. */
const NIVELES = [true, false].flatMap((trackStock) =>
  [-2, -0.5, 0, 3, 5, 5.001, 40].flatMap((stock) => [0, 5].map((lowStockAt) => ({ trackStock, stock, lowStockAt }))),
);

test("la regla del stock: bajo el mínimo y en negativo sólo cuentan si el producto controla existencias", () => {
  assert.equal(esStockBajo({ trackStock: true, stock: 5, lowStockAt: 5 }), true, "en el mínimo ya es bajo");
  assert.equal(esStockBajo({ trackStock: true, stock: 5.001, lowStockAt: 5 }), false);
  assert.equal(esStockBajo({ trackStock: false, stock: -3, lowStockAt: 5 }), false, "el carbón que nadie cuenta no está bajo");
  assert.equal(estaEnNegativo({ trackStock: true, stock: -0.5 }), true);
  assert.equal(estaEnNegativo({ trackStock: true, stock: 0 }), false);
  assert.equal(estaEnNegativo({ trackStock: false, stock: -0.5 }), false);
  assert.deepEqual(whereProductosDeStock("t-canning"), { tenantId: "t-canning", deletedAt: null, active: true });
});

test("la regla del stock es la MISMA que la de la pantalla de Stock (valuation.ts), caso por caso", async (t) => {
  // valuation.ts las suma el frente de stock de esta ola. Mientras no estén, no hay con qué
  // comparar; cuando estén, cualquier diferencia entre las dos copias pone esto en rojo.
  const valuation = (await import("@/lib/inventory/valuation")) as unknown as Record<string, unknown>;
  const suyas = {
    bajo: valuation.esStockBajo,
    negativo: valuation.estaEnNegativo,
    where: valuation.whereProductosDeStock,
  };
  if (typeof suyas.bajo !== "function" || typeof suyas.negativo !== "function" || typeof suyas.where !== "function") {
    t.skip("valuation.ts todavía no tiene esStockBajo / estaEnNegativo / whereProductosDeStock");
    return;
  }
  const bajo = suyas.bajo as typeof esStockBajo;
  const negativo = suyas.negativo as typeof estaEnNegativo;
  const where = suyas.where as typeof whereProductosDeStock;
  for (const n of NIVELES) {
    assert.equal(esStockBajo(n), bajo(n), `bajo difiere en ${JSON.stringify(n)}`);
    assert.equal(estaEnNegativo(n), negativo(n), `negativo difiere en ${JSON.stringify(n)}`);
  }
  assert.deepEqual(whereProductosDeStock("t-qa"), where("t-qa"));
});

// ── El rango y el archivo ────────────────────────────────────────────────────

test("el rango: la semana por defecto, y lo ilegible, invertido, futuro o largo se dice", () => {
  assert.deepEqual(leerRango(null, null, HOY), { rango: { desde: "2026-09-21", hasta: HOY, dias: 3 }, aviso: null });
  assert.deepEqual(leerRango("2026-09-01", "2026-09-10", HOY).rango, { desde: "2026-09-01", hasta: "2026-09-10", dias: 10 });
  assert.deepEqual(leerRango("2026-09-20", null, HOY).rango.hasta, HOY);
  for (const [d, h, re] of [
    ["2026-02-30", HOY, /no se entendió/],
    ["2026-09-10", "2026-09-01", /posterior a la fecha hasta/],
    ["2026-09-01", "2026-09-30", /posterior a hoy/],
    ["2026-01-01", HOY, /hasta 93 días/],
    ["'; drop table", HOY, /no se entendió/],
  ] as const) {
    const r = leerRango(d, h, HOY);
    assert.match(r.aviso ?? "", re, `${d}..${h}`);
    assert.equal(r.rango.desde, "2026-09-21");
  }
  assert.equal(diasEntre("2026-06-23", "2026-09-23"), MAX_DIAS_RANGO);
});

test("el CSV: resumen por local, consolidado por CUIT si comparten, y detalle por día y medio", () => {
  const lomas: LocalDeLaRed = { ...META["t-lomas"], localTenantId: "t-lomas", alias: "Lomas" };
  const shine: LocalDeLaRed = { ...META["t-ajeno"], localTenantId: "t-ajeno", alias: "Shine" };
  const filasCanning = [fila("2026-09-21", "VENTA", "EFECTIVO", 1234.5), fila("2026-09-22", "VENTA", "MP", 100)];
  const locales = [
    { local: CANNING, total: ventasDe(filasCanning), porDia: ventasPorDia(filasCanning) },
    { local: lomas, total: ventasDe([fila(HOY, "VENTA", "TARJETA", 10)]), porDia: ventasPorDia([fila(HOY, "VENTA", "TARJETA", 10)]) },
    { local: shine, total: ventasDe([]), porDia: [] },
  ];
  const porCuit = consolidarPorCuit(locales);
  assert.deepEqual(porCuit.map((g) => [g.cuit, g.locales, g.total.neto]), [["20304050607", ["Canning", "Lomas"], 1344.5]]);
  const csv = csvVentasDeLaRed({ casa: "MAGRA", rango: { desde: "2026-09-21", hasta: HOY, dias: 3 }, locales, porCuit });
  const lineas = csv.split("\r\n");
  assert.ok(lineas.includes("Canning;20304050607;3;1.234,50;100,00;0,00;0,00;1.334,50;2"));
  assert.ok(lineas.includes("CONSOLIDADO POR CUIT"));
  assert.ok(lineas.includes("2026-09-21;Canning;20304050607;Efectivo;1.234,50;0,00;1.234,50"));
  assert.ok(lineas.includes("TOTAL;;;1.234,50;100,00;10,00;0,00;1.344,50;3"));
  // Un alias con ";" no rompe las columnas.
  const raro = csvVentasDeLaRed({ casa: "A;B", rango: { desde: HOY, hasta: HOY, dias: 1 }, locales: [], porCuit: [] });
  assert.ok(raro.startsWith('Ventas por local;"A;B"'));
});

test("la dirección de un local: el dominio propio, o el host del mapa de ruteo, o nada", () => {
  const mapa = new Map([["magra-canning-erp.vercel.app", "magra-canning"]]);
  assert.equal(direccionDelLocal("magra-canning", { mapaDeHosts: mapa, dominioPropio: null }, "/admin/caja"), "https://magra-canning-erp.vercel.app/admin/caja");
  assert.equal(direccionDelLocal("magra-lomas", { mapaDeHosts: mapa, dominioPropio: "gsgapp.com.ar" }, "/admin/caja"), "https://magra-lomas.gsgapp.com.ar/admin/caja");
  assert.equal(direccionDelLocal("magra-lomas", { mapaDeHosts: mapa, dominioPropio: null }, "/admin/caja"), null);
  assert.equal(direccionDelLocal(null, { mapaDeHosts: mapa, dominioPropio: "x.com" }, "/admin"), null);
});

test("con dominio propio, un negocio que también está en el mapa se muestra con el dominio propio", () => {
  // El mapa (`.vercel.app`) sigue ruteando, pero la dirección que se muestra y se comparte es la del
  // dominio propio: todo lo creado antes del dominio lo hereda sin tocar el mapa.
  const mapa = new Map([["chestetica-erp.vercel.app", "chestetica"]]);
  assert.equal(
    direccionDelLocal("chestetica", { mapaDeHosts: mapa, dominioPropio: "gsgapp.com.ar" }, "/admin"),
    "https://chestetica.gsgapp.com.ar/admin",
  );
  assert.equal(
    direccionDelLocal("Chestetica ", { mapaDeHosts: mapa, dominioPropio: " gsgapp.com.ar " }, "/admin"),
    "https://chestetica.gsgapp.com.ar/admin",
  );
});

// ── El vínculo ───────────────────────────────────────────────────────────────

const neg = (id: string, modules: string[], extra: Partial<NegocioDeLaRed> = {}): NegocioDeLaRed => ({
  id,
  name: extra.name ?? id,
  slug: extra.slug ?? id,
  modules,
  arcaCuit: extra.arcaCuit ?? null,
});
const base = { otrasCasasDelLocal: [], casasDeLaCasa: [], requiereOk: (s: string) => s === "beauty-spa" };

test("validarVinculo: cada rechazo con su porqué", () => {
  const casa = neg("casa", ["multilocal"], { name: "MAGRA", arcaCuit: "20304050607" });
  const local = neg("canning", ["pos"], { name: "MAGRA Canning", arcaCuit: "20304050607" });
  assert.deepEqual(validarVinculo({ ...base, casa, local }), { ok: true, aviso: null });
  const casos: [Parameters<typeof validarVinculo>[0], RegExp][] = [
    [{ ...base, casa: null, local }, /casa no existe/],
    [{ ...base, casa, local: null }, /no existe/],
    [{ ...base, casa, local: casa }, /sí mismo/],
    [{ ...base, casa, local: neg("ch", [], { slug: "beauty-spa" }) }, /OK del dueño/],
    [{ ...base, casa: neg("casa", ["pos"]), local }, /Primero activá «Mis locales»/],
    [{ ...base, casa, local: neg("estudio", ["cartera"], { name: "Estudio" }) }, /panel del contador/],
    [{ ...base, casa: neg("casa", ["multilocal", "cartera"]), local }, /panel del contador/],
    [{ ...base, casa, local: neg("otra", ["multilocal"], { name: "Otra casa" }) }, /casa de su propia red/],
    [{ ...base, casa, local, otrasCasasDelLocal: [{ id: "x", name: "Velas" }] }, /ya es local de «Velas»/],
    [{ ...base, casa, local, casasDeLaCasa: [{ id: "y", name: "Holding" }] }, /es local de la red de «Holding»/],
  ];
  for (const [e, re] of casos) {
    const r = validarVinculo(e);
    assert.equal(r.ok, false, String(re));
    assert.match(r.ok ? "" : r.motivo, re);
  }
  const otroCuit = validarVinculo({ ...base, casa, local: neg("franquicia", [], { arcaCuit: "27111111113" }) });
  assert.ok(otroCuit.ok);
  assert.match(otroCuit.ok ? (otroCuit.aviso ?? "") : "", /otro CUIT/);
});

test("alias: el escrito, sin espacios de más y corto; si no, el nombre del negocio", () => {
  assert.equal(aliasDelLocal("  Canning   centro ", "MAGRA Canning"), "Canning centro");
  assert.equal(aliasDelLocal("", "MAGRA Canning"), "MAGRA Canning");
  assert.equal(aliasDelLocal("x".repeat(80), "y").length, 60);
});

// Base falsa con RLS: cada fila tiene tenantId y sólo se ve / escribe con el GUC de ese negocio.
type Fila = Record<string, unknown> & { tenantId: string };

function baseConRls(tenants: (NegocioDeLaRed & { arcaPuntoVenta?: number | null })[]) {
  let guc: string | null = null;
  const cartera: Fila[] = [];
  const auditoria: Fila[] = [];
  const locks: string[] = [];
  const visible = (f: Fila) => f.tenantId === guc;
  const chequear = (f: Fila) => {
    if (f.tenantId !== guc) throw new Error(`WITH CHECK: fila de ${f.tenantId} con el GUC de ${guc}`);
  };
  const coincide = (f: Fila, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => {
      if (k === "tenantId_clienteTenantId") {
        const c = v as { tenantId: string; clienteTenantId: string };
        return f.tenantId === c.tenantId && f.clienteTenantId === c.clienteTenantId;
      }
      if (v && typeof v === "object" && "in" in (v as object)) return (v as { in: unknown[] }).in.includes(f[k]);
      if (v && typeof v === "object" && "not" in (v as object)) return f[k] !== (v as { not: unknown }).not;
      return f[k] === v;
    });
  const tx = {
    $executeRaw: async (partes: TemplateStringsArray, ...valores: unknown[]) => {
      const sql = partes.join("?");
      if (sql.includes("set_config")) guc = String(valores[0]);
      else if (sql.includes("pg_advisory_xact_lock")) locks.push(String(valores[0]));
      return 1;
    },
    tenant: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const t = tenants.find((x) => x.id === where.id);
        return t ? { id: t.id, name: t.name, slug: t.slug, modules: t.modules, arcaCuit: t.arcaCuit } : null;
      },
      findMany: async ({ where, select }: { where: Record<string, unknown>; select?: Record<string, boolean> }) =>
        tenants
          .filter((t) => {
            const m = where.modules as { has?: string } | undefined;
            if (m?.has && !t.modules.includes(m.has)) return false;
            const id = where.id as { not?: string; in?: string[] } | undefined;
            if (id?.not && t.id === id.not) return false;
            if (id?.in && !id.in.includes(t.id)) return false;
            return true;
          })
          .map((t) => ({ ...t, arcaPuntoVenta: t.arcaPuntoVenta ?? null }))
          .map((t) => (select ? Object.fromEntries(Object.keys(select).map((k) => [k, (t as Record<string, unknown>)[k]])) : t)),
    },
    carteraCliente: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => cartera.filter((f) => visible(f) && coincide(f, where)),
      findUnique: async ({ where }: { where: Record<string, unknown> }) => cartera.find((f) => visible(f) && coincide(f, where)) ?? null,
      upsert: async ({ where, create, update }: { where: Record<string, unknown>; create: Fila; update: Record<string, unknown> }) => {
        const f = cartera.find((x) => visible(x) && coincide(x, where));
        if (f) {
          chequear(f);
          Object.assign(f, update);
          return f;
        }
        chequear(create);
        cartera.push({ ...create });
        return create;
      },
      update: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const f = cartera.find((x) => visible(x) && coincide(x, where));
        if (!f) throw new Error("P2025");
        Object.assign(f, data);
        return f;
      },
    },
    auditLog: {
      create: async ({ data }: { data: Fila }) => {
        chequear(data);
        auditoria.push(data);
        return data;
      },
    },
  };
  return { tx: tx as never, cartera, auditoria, locks, get guc() { return guc; } };
}

const TENANTS = [
  neg("casa", ["multilocal", "pos"], { name: "MAGRA", slug: "magra", arcaCuit: "20304050607" }),
  neg("canning", ["pos"], { name: "MAGRA Canning", slug: "magra-canning", arcaCuit: "20304050607" }),
  neg("lomas", ["pos"], { name: "MAGRA Lomas", slug: "magra-lomas", arcaCuit: "20304050607" }),
  neg("velas", ["multilocal"], { name: "Velas", slug: "shinevelas" }),
  neg("estudio", ["cartera"], { name: "Estudio", slug: "estudio" }),
];

test("vincular: la fila con el GUC de la casa, auditoría en la casa Y en el local, con candado", async () => {
  const db = baseConRls(TENANTS);
  const r = await vincularEnTx(db.tx, { casaId: "casa", localId: "canning", alias: "Canning", actor: "operator:gsg" }, () => false);
  assert.ok(r.ok);
  assert.equal(r.ok && r.yaEstaba, false);
  assert.deepEqual(db.locks, ["red-locales:canning", "red-locales:casa"], "candado de los dos, en orden");
  assert.deepEqual(db.cartera.map((f) => [f.tenantId, f.clienteTenantId, f.alias, f.estado]), [["casa", "canning", "Canning", "activa"]]);
  assert.deepEqual(db.auditoria.map((f) => [f.tenantId, f.action]), [
    ["casa", "multilocal.vincular"],
    ["canning", "multilocal.vinculado"],
  ]);
  // Idempotente: vincular de nuevo no escribe nada.
  const otra = await vincularEnTx(db.tx, { casaId: "casa", localId: "canning", alias: "Canning", actor: "operator:gsg" }, () => false);
  assert.ok(otra.ok && otra.yaEstaba);
  assert.equal(db.auditoria.length, 2);
});

test("vincular: un local que ya está en otra red se rechaza, aunque la tabla sólo se vea con el GUC de cada casa", async () => {
  const db = baseConRls(TENANTS);
  await vincularEnTx(db.tx, { casaId: "velas", localId: "lomas", actor: "operator:gsg" }, () => false);
  const r = await vincularEnTx(db.tx, { casaId: "casa", localId: "lomas", actor: "operator:gsg" }, () => false);
  assert.equal(r.ok, false);
  assert.match(r.ok ? "" : r.motivo, /ya es local de «Velas»/);
  assert.equal(db.cartera.filter((f) => f.tenantId === "casa").length, 0);
});

test("la lista de la consola marca los que ya son local de OTRA red, con su casa; los libres y los propios no", async () => {
  const db = baseConRls(TENANTS);
  await vincularEnTx(db.tx, { casaId: "velas", localId: "lomas", actor: "operator:gsg" }, () => false);
  await vincularEnTx(db.tx, { casaId: "casa", localId: "canning", actor: "operator:gsg" }, () => false);
  const m = await localesDeOtrasRedes(db.tx, ["canning", "lomas"], "casa");
  assert.deepEqual([...m].map(([id, casas]) => [id, casas.map((c) => c.name)]), [["lomas", ["Velas"]]]);
  // Dado de baja en la otra red, vuelve a estar libre.
  await darDeBajaEnTx(db.tx, { casaId: "velas", localId: "lomas", actor: "operator:gsg" });
  assert.equal((await localesDeOtrasRedes(db.tx, ["lomas"], "casa")).size, 0);
  assert.equal((await localesDeOtrasRedes(db.tx, [], "casa")).size, 0);
});

test("vincular: un estudio contable no entra a una red; CH sólo con el OK del dueño", async () => {
  const db = baseConRls(TENANTS);
  const estudio = await vincularEnTx(db.tx, { casaId: "casa", localId: "estudio", actor: "operator:gsg" }, () => false);
  assert.match(estudio.ok ? "" : estudio.motivo, /panel del contador/);
  const ch = await vincularEnTx(db.tx, { casaId: "casa", localId: "canning", actor: "operator:gsg" }, (slug) => slug === "magra-canning");
  assert.match(ch.ok ? "" : ch.motivo, /OK del dueño/);
  assert.equal(db.cartera.length, 0);
  assert.equal(db.auditoria.length, 0, "un rechazo no deja escrito nada");
});

test("dar de baja: el local desaparece de la red y queda auditado en los dos; dar de baja otra vez avisa", async () => {
  const db = baseConRls(TENANTS);
  await vincularEnTx(db.tx, { casaId: "casa", localId: "canning", actor: "operator:gsg" }, () => false);
  await vincularEnTx(db.tx, { casaId: "casa", localId: "lomas", actor: "operator:gsg" }, () => false);
  const r = await darDeBajaEnTx(db.tx, { casaId: "casa", localId: "lomas", actor: "operator:gsg" });
  assert.ok(r.ok);
  assert.deepEqual(db.auditoria.slice(-2).map((f) => [f.tenantId, f.action]), [
    ["casa", "multilocal.baja"],
    ["lomas", "multilocal.desvinculado"],
  ]);
  // La lectura real de la red (filas activas) ya no lo trae.
  const puertos = {
    filasDeLaRed: async () => db.cartera.filter((f) => f.tenantId === "casa").map((f) => ({ id: "x", localTenantId: String(f.clienteTenantId), alias: String(f.alias), estado: f.estado as FilaRed["estado"] })),
    metaDeLocales: async (ids: string[]) => new Map(ids.map((id) => [id, { nombre: id, slug: id, subdomain: null, arcaCuit: null, arcaPuntoVenta: null }])),
  };
  assert.deepEqual((await localesDeLaRed(puertos, "casa")).map((l) => l.localTenantId), ["canning"]);
  const otraVez = await darDeBajaEnTx(db.tx, { casaId: "casa", localId: "lomas", actor: "operator:gsg" });
  assert.equal(otraVez.ok, false);
  // Y después se puede volver a vincular.
  const vuelve = await vincularEnTx(db.tx, { casaId: "casa", localId: "lomas", actor: "operator:gsg" }, () => false);
  assert.ok(vuelve.ok && !vuelve.yaEstaba);
});

test("la ficha: los locales de la casa, a qué red pertenece un local y sus vínculos activos", async () => {
  const db = baseConRls(TENANTS);
  await vincularEnTx(db.tx, { casaId: "casa", localId: "canning", alias: "Canning", actor: "operator:gsg" }, () => false);
  await vincularEnTx(db.tx, { casaId: "casa", localId: "lomas", alias: "Lomas", actor: "operator:gsg" }, () => false);
  await darDeBajaEnTx(db.tx, { casaId: "casa", localId: "lomas", actor: "operator:gsg" });
  const casa = await leerRedEnTx(db.tx, "casa");
  assert.deepEqual(casa.locales.map((l) => [l.alias, l.estado]), [["Canning", "activa"], ["Lomas", "baja"]]);
  assert.equal(casa.vinculosActivos, 1);
  assert.equal(resumenDeLaFicha("MAGRA", casa.locales), "Red MAGRA: 1 local · 1 sin punto de venta");
  const canning = await leerRedEnTx(db.tx, "canning");
  assert.deepEqual(canning.esLocalDe, [{ id: "casa", name: "MAGRA" }]);
  assert.equal(canning.vinculosActivos, 0);
});
