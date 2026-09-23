// ============================================================================
// MIS LOCALES, ESCRITURA — el traslado, el catálogo de la marca y el alta en la red, EJECUTADOS.
// ============================================================================
//
// Corren contra una base falsa que se porta como Postgres con RLS y el rol `app_rls`: cada fila
// tiene su `tenantId`, sólo se ve con el GUC de ese negocio puesto, y una escritura con el GUC de
// otro negocio la rechaza (el WITH CHECK). `transaccion` deshace todo si el callback tira, como
// `$transaction`. Las fases del traslado son las REALES (`fasesSobre` de rls.ts): si el código
// escribiera la entrada del destino en la fase del origen, esta base lo rechaza igual que la real.
// La prueba contra la base real (Postgres local con `app_rls`) está en
// prisma/rls/aislamiento-capa-app.ts.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@/generated/prisma/client";
import { basePrisma } from "@/lib/prisma-base";
import { fasesSobre, trasladoTransaction } from "@/lib/rls";
import { clasificarAjuste, resumirMerma } from "@/lib/stock/merma-core";
import { planificarPlanilla, type ProductoDelCatalogo } from "@/lib/catalogo/planilla-core";
import {
  SIN_TRASLADOS,
  TRASLADO_ACTOR_PREFIX,
  TrasladoRechazado,
  claveDeProducto,
  codigoDeRemito,
  cruzarPorClave,
  productosParaTraslado,
  htmlDelRemito,
  leerPedidoDeTraslado,
  remitoDeLaAuditoria,
  resumenDeTraslados,
  trasladarEnFases,
  validarUbicaciones,
  LEYENDA_REMITO,
  type ContextoTraslado,
  type Ubicacion,
} from "./traslado-core";
import {
  NOMBRE_APP_CATALOGO,
  divergeDeLaLista,
  empujarEnTx,
  listaDeLaCasa,
  resumenDeLaVista,
  vistaDelLocal,
} from "./catalogo-marca-core";
import { AltaEnRedRechazada, leerFiscalDelAlta, sumarAltaEnTx } from "./multilocal-core";

// ── La base falsa con RLS ────────────────────────────────────────────────────

type Fila = Record<string, unknown> & { tenantId: string };
type Negocio = { id: string; name: string; slug: string; modules: string[]; arcaCuit: string | null; arcaPuntoVenta: number | null };

function coincide(f: Record<string, unknown>, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (k === "tenantId_clienteTenantId") {
      const c = v as { tenantId: string; clienteTenantId: string };
      return f.tenantId === c.tenantId && f.clienteTenantId === c.clienteTenantId;
    }
    if (v === null) return f[k] === null || f[k] === undefined;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const o = v as Record<string, unknown>;
      if ("in" in o) return (o.in as unknown[]).includes(f[k]);
      if ("not" in o) return f[k] !== o.not;
      if ("gte" in o) return (f[k] as number) >= (o.gte as number) || (f[k] instanceof Date && f[k] >= (o.gte as Date));
      if ("has" in o) return Array.isArray(f[k]) && (f[k] as unknown[]).includes(o.has);
      return true;
    }
    return f[k] === v;
  });
}

const elegir = (f: Record<string, unknown>, select?: Record<string, unknown>) =>
  select ? Object.fromEntries(Object.keys(select).map((k) => [k, f[k]])) : { ...f };

function baseDeLaRed(negocios: Negocio[], costos: Record<string, number> = {}) {
  const estado = {
    negocios: negocios.map((n) => ({ ...n })),
    productos: [] as Fila[],
    movimientos: [] as Fila[],
    auditoria: [] as Fila[],
    cartera: [] as Fila[],
  };
  let guc: string | null = null;
  let seq = 0;
  const gucs: string[] = [];
  const locks: string[] = [];
  const visible = (f: Fila) => f.tenantId === guc;
  const chequear = (f: Fila) => {
    if (f.tenantId !== guc) throw new Error(`WITH CHECK: fila de ${f.tenantId} con el GUC de ${guc}`);
  };
  const tabla = (filas: () => Fila[]) => ({
    findMany: async ({ where, select }: { where?: Record<string, unknown>; select?: Record<string, unknown> } = {}) =>
      filas().filter((f) => visible(f) && coincide(f, where)).map((f) => elegir(f, select)),
    findFirst: async ({ where, select }: { where?: Record<string, unknown>; select?: Record<string, unknown> } = {}) => {
      const f = filas().find((x) => visible(x) && coincide(x, where));
      return f ? elegir(f, select) : null;
    },
    findUnique: async ({ where, select }: { where: Record<string, unknown>; select?: Record<string, unknown> }) => {
      const f = filas().find((x) => visible(x) && coincide(x, where));
      return f ? elegir(f, select) : null;
    },
    create: async ({ data }: { data: Fila }) => {
      chequear(data);
      const fila = { id: `f${++seq}`, createdAt: new Date(), ...data };
      filas().push(fila);
      return fila;
    },
    createMany: async ({ data }: { data: Fila[] }) => {
      for (const d of data) chequear(d);
      for (const d of data) filas().push({ id: `f${++seq}`, createdAt: new Date(), ...d });
      return { count: data.length };
    },
  });
  const productos = tabla(() => estado.productos);
  const tx = {
    $executeRaw: async (partes: TemplateStringsArray, ...valores: unknown[]) => {
      const sql = partes.join("?");
      if (sql.includes("set_config")) {
        guc = String(valores[0]);
        gucs.push(guc);
        return 1;
      }
      if (sql.includes("pg_advisory_xact_lock")) {
        locks.push(String(valores[0]));
        return 1;
      }
      if (sql.includes('UPDATE "Product"')) {
        // escribirPlan: UPDATE … FROM unnest(ids, precios, preciosKg, controles) WHERE tenantId.
        const [ids, precios, kg, controles, tenantId] = valores as [string[], (number | null)[], (number | null)[], (boolean | null)[], string];
        let n = 0;
        ids.forEach((id, i) => {
          const p = estado.productos.find((x) => x.id === id && visible(x) && x.tenantId === tenantId && x.deletedAt == null);
          if (!p) return;
          p.price = precios[i] ?? p.price;
          p.pricePerKg = kg[i] ?? p.pricePerKg;
          p.trackStock = controles[i] ?? p.trackStock;
          n++;
        });
        return n;
      }
      throw new Error(`SQL no esperado: ${sql}`);
    },
    // costosVigentesEnTx: el costo de los productos pedidos, sólo los que se ven con el GUC.
    $queryRaw: async (_partes: TemplateStringsArray, ...valores: unknown[]) => {
      const ids = valores.find(Array.isArray) as string[];
      return estado.productos
        .filter((p) => visible(p) && ids.includes(p.id as string))
        .map((p) => ({ id: p.id, catalogo: null, ultimo: costos[p.id as string] ?? null }));
    },
    tenant: {
      findUnique: async ({ where, select }: { where: { id: string }; select?: Record<string, unknown> }) => {
        const t = estado.negocios.find((x) => x.id === where.id);
        return t ? elegir(t, select) : null;
      },
      findMany: async ({ where, select }: { where: Record<string, unknown>; select?: Record<string, unknown> }) =>
        estado.negocios.filter((t) => coincide(t, where)).map((t) => elegir(t, select)),
      update: async ({ where, data }: { where: { id: string }; data: Partial<Negocio> }) => {
        const t = estado.negocios.find((x) => x.id === where.id);
        if (!t) throw new Error("P2025");
        Object.assign(t, data);
        return t;
      },
    },
    product: {
      ...productos,
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: { stock: number | { increment: number } } }) => {
        const filas = estado.productos.filter((f) => visible(f) && coincide(f, where));
        for (const f of filas) {
          f.stock = typeof data.stock === "number" ? data.stock : (f.stock as number) + data.stock.increment;
        }
        return { count: filas.length };
      },
      createManyAndReturn: async ({ data, select }: { data: Fila[]; select?: Record<string, unknown> }) => {
        for (const d of data) chequear(d);
        return data.map((d) => {
          const f = { id: `p${++seq}`, stock: 0, active: true, deletedAt: null, ...d };
          estado.productos.push(f);
          return elegir(f, select);
        });
      },
    },
    stockMovement: tabla(() => estado.movimientos),
    auditLog: tabla(() => estado.auditoria),
    carteraCliente: {
      ...tabla(() => estado.cartera),
      upsert: async ({ where, create, update }: { where: Record<string, unknown>; create: Fila; update: Record<string, unknown> }) => {
        const f = estado.cartera.find((x) => visible(x) && coincide(x, where));
        if (f) {
          Object.assign(f, update);
          return f;
        }
        chequear(create);
        estado.cartera.push({ ...create });
        return create;
      },
    },
  };
  /** `$transaction`: si el callback tira, la base queda como estaba. */
  async function transaccion<T>(fn: (t: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    const copia = structuredClone(estado);
    try {
      return await fn(tx as never);
    } catch (e) {
      Object.assign(estado, copia);
      throw e;
    } finally {
      guc = null;
    }
  }
  const producto = (tenantId: string, name: string, extra: Record<string, unknown> = {}) => {
    const f: Fila = {
      id: `${tenantId}-${name}`,
      tenantId,
      name,
      unit: "kg",
      saleUnit: "WEIGHT",
      stock: 0,
      active: true,
      deletedAt: null,
      price: null,
      pricePerKg: null,
      trackStock: true,
      ...extra,
    };
    estado.productos.push(f);
    return f;
  };
  return { tx: tx as never, estado, transaccion, producto, gucs, locks };
}

const CUIT = "20304050607";
const NEGOCIOS: Negocio[] = [
  { id: "casa", name: "MAGRA", slug: "magra", modules: ["multilocal", "pos"], arcaCuit: CUIT, arcaPuntoVenta: 1 },
  { id: "canning", name: "MAGRA Canning", slug: "magra-canning", modules: ["pos"], arcaCuit: CUIT, arcaPuntoVenta: 2 },
  { id: "lomas", name: "MAGRA Lomas", slug: "magra-lomas", modules: ["pos"], arcaCuit: CUIT, arcaPuntoVenta: 3 },
  { id: "franquicia", name: "Franquicia Adrogué", slug: "franq", modules: ["pos"], arcaCuit: "27111111113", arcaPuntoVenta: 1 },
];

const UBICACIONES: Ubicacion[] = [
  { id: "casa", nombre: "MAGRA", esCasa: true, cuit: CUIT },
  { id: "canning", nombre: "Canning", esCasa: false, cuit: CUIT },
  { id: "lomas", nombre: "Lomas", esCasa: false, cuit: `${CUIT.slice(0, 2)}-${CUIT.slice(2, 10)}-${CUIT.slice(10)}` },
  { id: "franquicia", nombre: "Adrogué", esCasa: false, cuit: "27111111113" },
  { id: "sin-cuit", nombre: "Temperley", esCasa: false, cuit: null },
];

const CLAVE = "3f2a9c1e-7b4d-4e8a-9c0f-1a2b3c4d5e6f";

// ── El pedido y dónde puede ir ───────────────────────────────────────────────

test("el pedido de traslado: clave, origen, destino y líneas con cantidades como las escribe la gente", () => {
  const vacio = claveDeProducto("Vacío", "WEIGHT");
  const r = leerPedidoDeTraslado({
    clave: CLAVE,
    origen: "casa",
    destino: "canning",
    productos: [vacio, "", claveDeProducto("Chorizo", "UNIT")],
    cantidades: ["10,5", "", "12"],
    nota: "  para   el sábado ",
  });
  assert.ok(r.ok);
  assert.deepEqual(r.ok && r.pedido.lineas, [
    { producto: "vacio|WEIGHT", saleUnit: "WEIGHT", cantidad: 10.5 },
    { producto: "chorizo|UNIT", saleUnit: "UNIT", cantidad: 12 },
  ]);
  assert.equal(r.ok && r.pedido.nota, "para el sábado");

  const base = { clave: CLAVE, origen: "casa", destino: "canning", productos: [vacio], cantidades: ["10"], nota: null };
  const casos: [Record<string, unknown>, RegExp][] = [
    [{ clave: "no-es-una-clave" }, /Recargá la página/],
    [{ clave: 123 }, /Recargá la página/],
    [{ destino: "casa" }, /mismo local/],
    [{ destino: "" }, /a qué local/],
    [{ cantidades: ["-2"] }, /no se entiende/],
    [{ cantidades: ["0"] }, /no se entiende/],
    [{ productos: [claveDeProducto("Chorizo", "UNIT")], cantidades: ["1,5"] }, /entera/],
    [{ productos: [vacio, vacio], cantidades: ["1", "2"] }, /dos líneas/],
    [{ productos: ["vacio|LITRO"] }, /no se reconoce/],
    [{ productos: [""], cantidades: ["3"] }, /falta elegir el producto/],
    [{ productos: [], cantidades: [] }, /al menos un producto/],
    [{ cantidades: ["9999"] }, /más de 5000/],
  ];
  for (const [cambio, re] of casos) {
    const x = leerPedidoDeTraslado({ ...base, ...cambio } as Parameters<typeof leerPedidoDeTraslado>[0]);
    assert.equal(x.ok, false, String(re));
    assert.match(x.ok ? "" : x.error, re);
  }
});

test("sólo entre lugares de la red con el MISMO CUIT: con otro CUIT es una venta y se rechaza", () => {
  const ok = validarUbicaciones(UBICACIONES, "casa", "lomas");
  assert.ok(ok.ok, "el CUIT con guiones es el mismo CUIT");
  const venta = validarUbicaciones(UBICACIONES, "casa", "franquicia");
  assert.equal(venta.ok, false);
  assert.match(venta.ok ? "" : venta.error, /otro CUIT.*es una venta/);
  assert.match((validarUbicaciones(UBICACIONES, "sin-cuit", "casa") as { error: string }).error, /no tiene el CUIT cargado/);
  // Un id que no salió de las filas de la casa da el mismo error que uno que no existe.
  const ajeno = validarUbicaciones(UBICACIONES, "casa", "shinevelas");
  assert.match((ajeno as { error: string }).error, /no es de tu red/);
  assert.deepEqual(validarUbicaciones(UBICACIONES, "casa", "no-existe"), ajeno);
  assert.match((validarUbicaciones(UBICACIONES, "casa", "casa") as { error: string }).error, /mismo local/);
});

// ── Las fases de la transacción (las REALES de rls.ts) ───────────────────────

test("las fases del traslado ponen el GUC de SU negocio y no se pueden correr a la vez", async () => {
  const db = baseDeLaRed(NEGOCIOS);
  await db.transaccion(async (tx) => {
    const f = fasesSobre(tx, { origen: "casa", destino: "canning" });
    await f.enOrigen(async () => undefined);
    await f.enDestino(async () => undefined);
    await assert.rejects(
      Promise.all([f.enOrigen(async () => new Promise((r) => setTimeout(r, 5))), f.enDestino(async () => undefined)]),
      /van de a una/,
    );
  });
  assert.deepEqual(db.gucs.slice(0, 3), ["casa", "canning", "casa"]);
});

test("escribir la fila del destino en la fase del origen revienta (WITH CHECK) y no queda nada", async () => {
  const db = baseDeLaRed(NEGOCIOS);
  await assert.rejects(
    db.transaccion(async (tx) => {
      const f = fasesSobre(tx, { origen: "casa", destino: "canning" });
      await f.enOrigen((t) => t.auditLog.create({ data: { tenantId: "casa", actor: "qa", action: "a", entity: "Traslado" } }));
      await f.enOrigen((t) => t.auditLog.create({ data: { tenantId: "canning", actor: "qa", action: "b", entity: "Traslado" } }));
    }),
    /WITH CHECK: fila de canning con el GUC de casa/,
  );
  assert.equal(db.estado.auditoria.length, 0, "la transacción se deshizo entera");
});

test("trasladoTransaction: Serializable, reintenta un conflicto de escritura y exige dos negocios distintos", async () => {
  const original = basePrisma.$transaction;
  const opciones: unknown[] = [];
  let intentos = 0;
  const conflicto = new Prisma.PrismaClientKnownRequestError("write conflict", { code: "P2034", clientVersion: "7.8.0" });
  const db = baseDeLaRed(NEGOCIOS);
  (basePrisma as unknown as { $transaction: unknown }).$transaction = async (fn: (tx: unknown) => Promise<unknown>, opts: unknown) => {
    opciones.push(opts);
    intentos++;
    // El primer intento aborta como lo hace Postgres cuando otro traslado tocó el mismo stock.
    if (intentos === 1) throw conflicto;
    return db.transaccion((tx) => fn(tx));
  };
  try {
    const r = await trasladoTransaction({ origen: "casa", destino: "canning" }, async (f) => {
      await f.enOrigen(async () => undefined);
      return "trasladado";
    });
    assert.equal(r, "trasladado");
    assert.equal(intentos, 2, "un reintento");
    assert.deepEqual(opciones[0], { isolationLevel: "Serializable", timeout: 15_000 });
    await assert.rejects(trasladoTransaction({ origen: "casa", destino: "casa" }, async () => 1), /dos negocios distintos/);
  } finally {
    (basePrisma as unknown as { $transaction: unknown }).$transaction = original;
  }
});

// ── El traslado, de punta a punta ────────────────────────────────────────────

function contexto(pedido: Partial<ContextoTraslado["pedido"]> = {}, destino = "canning"): ContextoTraslado {
  return {
    pedido: {
      clave: CLAVE,
      origen: "casa",
      destino,
      lineas: [{ producto: claveDeProducto("Vacío", "WEIGHT"), saleUnit: "WEIGHT", cantidad: 10 }],
      nota: null,
      ...pedido,
    },
    origen: UBICACIONES[0],
    destino: UBICACIONES.find((u) => u.id === destino)!,
    casa: "MAGRA",
    usuarioId: "u1",
    por: "Ana",
    ahora: new Date("2026-09-23T13:00:00.000Z"),
  };
}

async function trasladar(db: ReturnType<typeof baseDeLaRed>, ctx: ContextoTraslado) {
  return db.transaccion((tx) => trasladarEnFases(fasesSobre(tx, { origen: ctx.origen.id, destino: ctx.destino.id }), ctx));
}

const stockDe = (db: ReturnType<typeof baseDeLaRed>, id: string) => db.estado.productos.find((p) => p.id === id)!.stock;

test("10 kg de vacío del obrador a Canning: el obrador baja 10 y Canning sube 10, al costo del obrador, con auditoría en los dos", async () => {
  const db = baseDeLaRed(NEGOCIOS, { "casa-Vacío": 5200 });
  db.producto("casa", "Vacío", { stock: 25 });
  db.producto("canning", "vacio ", { stock: 2 }); // mismo producto, escrito distinto
  const r = await trasladar(db, contexto());
  assert.equal(r.yaEstaba, false);
  assert.equal(stockDe(db, "casa-Vacío"), 15);
  assert.equal(stockDe(db, "canning-vacio "), 12);

  const movs = db.estado.movimientos.map((m) => [m.tenantId, m.type, m.qty, m.unitCost, m.createdBy]);
  assert.deepEqual(movs, [
    ["casa", "AJUSTE", -10, 5200, `${TRASLADO_ACTOR_PREFIX}user:u1`],
    ["canning", "REPOSICION", 10, 5200, `${TRASLADO_ACTOR_PREFIX}user:u1`],
  ]);
  assert.deepEqual(
    db.estado.auditoria.map((a) => [a.tenantId, a.action, a.entityId]),
    [
      ["casa", "traslado.salida", CLAVE],
      ["canning", "traslado.entrada", CLAVE],
    ],
  );
  assert.deepEqual(db.locks, [`traslado:${CLAVE}`]);
  // El remito que queda escrito no lleva costos (lo imprime el encargado); el costo queda aparte.
  const remito = remitoDeLaAuditoria(db.estado.auditoria[1].changes);
  assert.ok(remito);
  assert.equal(remito.codigo, codigoDeRemito(CLAVE));
  assert.deepEqual(remito.lineas, [{ nombre: "Vacío", saleUnit: "WEIGHT", unidad: "kg", cantidad: 10 }]);
  assert.doesNotMatch(JSON.stringify(db.estado.auditoria[1].changes), /5200/);
  assert.match(JSON.stringify(db.estado.auditoria[0].changes), /"unitCost":5200/);
});

test("doble clic (la misma clave dos veces): un solo traslado", async () => {
  const db = baseDeLaRed(NEGOCIOS);
  db.producto("casa", "Vacío", { stock: 25 });
  db.producto("canning", "Vacío", { stock: 0 });
  await trasladar(db, contexto());
  const otra = await trasladar(db, contexto());
  assert.equal(otra.yaEstaba, true);
  assert.equal(otra.remito.codigo, codigoDeRemito(CLAVE));
  assert.equal(stockDe(db, "casa-Vacío"), 15);
  assert.equal(stockDe(db, "canning-Vacío"), 10);
  assert.equal(db.estado.movimientos.length, 2);
});

test("si el destino no tiene el producto, no se mueve NADA (lo que salió del origen vuelve)", async () => {
  const db = baseDeLaRed(NEGOCIOS);
  db.producto("casa", "Vacío", { stock: 25 });
  db.producto("canning", "Vacío", { stock: 0, saleUnit: "UNIT" }); // en Canning se vende por unidad: es otro
  await assert.rejects(trasladar(db, contexto()), (e: unknown) => {
    assert.ok(e instanceof TrasladoRechazado);
    assert.match(e.message, /«Canning» no tiene «Vacío» \(por kilo\).*Catálogo y precios de la marca.*No se movió nada/);
    return true;
  });
  assert.equal(stockDe(db, "casa-Vacío"), 25);
  assert.equal(db.estado.movimientos.length, 0);
  assert.equal(db.estado.auditoria.length, 0);
});

test("si no alcanza el stock del origen, se rechaza diciendo cuánto hay", async () => {
  const db = baseDeLaRed(NEGOCIOS);
  db.producto("casa", "Vacío", { stock: 8 });
  db.producto("canning", "Vacío");
  await assert.rejects(trasladar(db, contexto()), /En «MAGRA» hay 8 kg de «Vacío»: no alcanza para mandar 10 kg/);
  assert.equal(db.estado.movimientos.length, 0);
});

test("el formulario y la transacción cruzan igual: un pausado en el destino entra, dos con el mismo nombre no", async () => {
  const db = baseDeLaRed(NEGOCIOS);
  db.producto("casa", "Vacío", { stock: 25 });
  db.producto("casa", "Asado", { stock: 30 });
  db.producto("casa", "Matambre", { stock: 5, active: false }); // pausado en la casa: no sale
  db.producto("canning", "Vacío", { stock: 1, active: false }); // pausado en Canning: entra igual
  db.producto("lomas", "Asado", { id: "lomas-asado-1", stock: 2 });
  db.producto("lomas", "asado", { id: "lomas-asado-2", stock: 3 }); // dos activos iguales en Lomas

  const porLugar = (id: string) => ({ id, productos: db.estado.productos.filter((p) => p.tenantId === id) as never[] });
  const form = productosParaTraslado([porLugar("casa"), porLugar("canning"), porLugar("lomas")]);
  const de = (nombre: string) => form.find((p) => p.nombre === nombre)!;
  assert.deepEqual(de("Vacío").sale, { casa: 25 }, "pausado en Canning: de ahí no sale");
  assert.deepEqual(de("Vacío").entra.canning, { stock: 1, pausado: true });
  assert.deepEqual(de("Asado").sale, { casa: 30, lomas: "repetido" }, "no suma el stock de los dos de Lomas");
  assert.equal(de("Asado").entra.lomas, "repetido");
  assert.equal(de("Matambre").sale.casa, undefined, "pausado en la casa: no se ofrece para mandar");
  assert.deepEqual(de("Matambre").entra.casa, { stock: 5, pausado: true });

  // La transacción decide lo mismo que mostró el formulario.
  const ok = await trasladar(db, contexto());
  assert.equal(ok.yaEstaba, false);
  assert.equal(stockDe(db, "canning-Vacío"), 11, "entró en el pausado de Canning");
  await assert.rejects(
    trasladar(db, contexto({ clave: "4f2a9c1e-7b4d-4e8a-9c0f-1a2b3c4d5e6f", destino: "lomas", lineas: [{ producto: claveDeProducto("Asado", "WEIGHT"), saleUnit: "WEIGHT", cantidad: 1 }] }, "lomas")),
    /En «Lomas» hay dos productos «Asado»/,
  );
  // Y la regla, sola: como origen sólo lo activo; como destino, los activos antes que los pausados.
  const filas = [
    { name: "Vacío", saleUnit: "WEIGHT", stock: 1, active: false },
    { name: "vacio", saleUnit: "WEIGHT", stock: 4, active: true },
    { name: "Pollo", saleUnit: "WEIGHT", stock: 1, active: false },
    { name: "pollo", saleUnit: "WEIGHT", stock: 2, active: false },
  ];
  assert.deepEqual(cruzarPorClave(filas, "origen").get("vacio|WEIGHT"), { estado: "uno", producto: filas[1] });
  assert.deepEqual(cruzarPorClave(filas, "destino").get("vacio|WEIGHT"), { estado: "uno", producto: filas[1] });
  assert.equal(cruzarPorClave(filas, "origen").get("pollo|WEIGHT"), undefined);
  assert.deepEqual(cruzarPorClave(filas, "destino").get("pollo|WEIGHT"), { estado: "repetido" });
});

test("el pedazo de where que deja los traslados fuera de las listas de ajustes", () => {
  assert.deepEqual(SIN_TRASLADOS, { NOT: { createdBy: { startsWith: TRASLADO_ACTOR_PREFIX } } });
});

test("el traslado NO es merma: la salida queda excluida del tablero de merma", async () => {
  const db = baseDeLaRed(NEGOCIOS, { "casa-Vacío": 5000 });
  db.producto("casa", "Vacío", { stock: 25 });
  db.producto("canning", "Vacío");
  await trasladar(db, contexto());
  const salida = db.estado.movimientos.find((m) => m.type === "AJUSTE")!;
  const mov = { productId: String(salida.productId), qty: Number(salida.qty), reason: String(salida.reason), createdBy: String(salida.createdBy), unitCost: 5000 };
  assert.deepEqual(clasificarAjuste(mov), { clase: "EXCLUIDO", porQue: "traslado" });
  const r = resumirMerma([mov], new Map([[mov.productId, { nombre: "Vacío", unidad: "kg", saleUnit: "WEIGHT", costo: 5000 }]]));
  assert.equal(r.merma.movimientos + r.faltante.movimientos + r.otro.movimientos, 0);
  assert.equal(r.excluidos.traslado, 1);
});

test("el remito: la leyenda arriba y abajo, y lo que escribió la gente escapado", () => {
  const html = htmlDelRemito(
    {
      clave: CLAVE,
      codigo: codigoDeRemito(CLAVE),
      fecha: "2026-09-23T13:00:00.000Z",
      casa: "MAGRA",
      origen: { id: "casa", nombre: "MAGRA <obrador>", cuit: CUIT },
      destino: { id: "canning", nombre: "Canning", cuit: CUIT },
      lineas: [{ nombre: "Vacío", saleUnit: "WEIGHT", unidad: "kg", cantidad: 10.25 }],
      nota: "<script>x</script>",
      por: "Ana",
    },
    "23/09/2026 10:00",
  );
  assert.equal(html.split(LEYENDA_REMITO).length - 1, 2);
  assert.match(html, /MAGRA &lt;obrador&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /10,25 kg/);
  assert.match(html, /CUIT 20-30405060-7/);
  assert.deepEqual(
    resumenDeTraslados([
      remitoDeLaAuditoria({ clave: CLAVE, codigo: "T-1", fecha: "x", origen: { id: "a", nombre: "A" }, destino: { id: "b", nombre: "B" }, lineas: [{ nombre: "Vacío", saleUnit: "WEIGHT", cantidad: 10.5 }, { nombre: "Chorizo", saleUnit: "UNIT", cantidad: 6 }] })!,
    ]),
    { cantidad: 1, kg: 10.5, unidades: 6 },
  );
  assert.equal(remitoDeLaAuditoria({ algo: 1 }), null);
});

// ── El catálogo de la marca ──────────────────────────────────────────────────

const prod = (name: string, extra: Partial<ProductoDelCatalogo> = {}): ProductoDelCatalogo => ({
  id: `p-${name}`,
  name,
  unit: "kg",
  stock: 0,
  active: true,
  saleUnit: "WEIGHT",
  price: null,
  pricePerKg: 1000,
  trackStock: true,
  ...extra,
});

test("la lista de la casa: sólo lo activo con precio; los repetidos se nombran", () => {
  const l = listaDeLaCasa([
    prod("Vacío", { pricePerKg: 12000 }),
    prod("Asado", { pricePerKg: 9000 }),
    prod("Matambre", { active: false }),
    prod("Chorizo", { saleUnit: "UNIT", price: null, pricePerKg: null }),
    prod("vacio"),
  ]);
  assert.equal(l.incluidos, 3);
  assert.deepEqual(l.sinPrecio, ["Chorizo"]);
  assert.deepEqual(l.repetidos, ["vacio"]);
  assert.doesNotMatch(l.texto, /Matambre|Chorizo/);
});

test("vista previa de Lomas: '58 cambios, 2 que no existen', y lo que sólo tiene Lomas no se toca", () => {
  const casa = Array.from({ length: 60 }, (_, i) => prod(`Corte ${i + 1}`, { pricePerKg: 10000 + i }));
  const lomas = [
    ...casa.slice(0, 58).map((p) => ({ ...p, id: `l-${p.id}`, pricePerKg: 9000 })),
    prod("Milanesa de la casa", { id: "l-mila", pricePerKg: 7000 }),
  ];
  const v = vistaDelLocal(planificarPlanilla(listaDeLaCasa(casa).texto, lomas));
  assert.equal(resumenDeLaVista("Lomas", v), "Lomas: 58 cambios, 2 que no existen");
  assert.deepEqual(v.soloEnElLocal, ["Milanesa de la casa"]);
  assert.equal(v.aplicable, true);
  assert.equal(divergeDeLaLista(v), true);
  const alDia = vistaDelLocal(planificarPlanilla(listaDeLaCasa(casa).texto, casa));
  assert.equal(resumenDeLaVista("Canning", alDia), "Canning: ya tiene la lista de la casa");
  assert.equal(divergeDeLaLista(alDia), false);
  // Un producto que en el local se vende por unidad y en la casa por kilo: ese local no se aplica.
  const mal = vistaDelLocal(planificarPlanilla(listaDeLaCasa(casa).texto, [prod("Corte 1", { saleUnit: "UNIT", price: 100 })]));
  assert.equal(mal.aplicable, false);
  assert.match(resumenDeLaVista("Adrogué", mal), /no se puede aplicar/);
  assert.match(mal.problemas[0].motivo, /se cambia desde Catálogo/);
});

function empuje(db: ReturnType<typeof baseDeLaRed>, tenantId: string, lista: { texto: string }, huella: string | null) {
  return db.transaccion(async (tx) => {
    // El GUC lo pone quien llama (tenantTransaction con el id del local).
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
    return empujarEnTx(tx, { tenantId, lista, huella, actor: "casa:casa:user:u1", casa: { id: "casa", nombre: "MAGRA" }, por: "Ana", lote: "lote-1" });
  });
}

test("aplicar la lista en un local: precios y productos nuevos, cada precio en su auditoría, y la segunda vez no escribe nada", async () => {
  const db = baseDeLaRed(NEGOCIOS);
  db.producto("lomas", "Vacío", { pricePerKg: 11000 });
  db.producto("lomas", "Milanesa de la casa", { pricePerKg: 7000 });
  const lista = listaDeLaCasa([prod("Vacío", { pricePerKg: 12000 }), prod("Asado", { pricePerKg: 9000 })]);
  const huella = vistaDelLocal(planificarPlanilla(lista.texto, [prod("Vacío", { id: "lomas-Vacío", pricePerKg: 11000 }), prod("Milanesa de la casa", { id: "lomas-Milanesa de la casa", pricePerKg: 7000 })])).huella;

  const r = await empuje(db, "lomas", lista, huella);
  assert.deepEqual(r, { estado: "aplicado", nuevos: 1, cambios: 1 });
  const deLomas = db.estado.productos.filter((p) => p.tenantId === "lomas").map((p) => [p.name, p.pricePerKg]);
  assert.deepEqual(deLomas, [["Vacío", 12000], ["Milanesa de la casa", 7000], ["Asado", 9000]]);
  assert.deepEqual(
    db.estado.auditoria.map((a) => [a.tenantId, a.action, (a.changes as { origen?: string }).origen ?? null]),
    [
      ["lomas", "cambio-de-precio", "planilla"],
      ["lomas", "cambio-de-precio", "alta"],
      ["lomas", "multilocal.catalogo", null],
    ],
  );
  // Idempotente: la misma lista otra vez no cambia nada.
  assert.deepEqual(await empuje(db, "lomas", lista, null), { estado: "al-dia" });
  assert.equal(db.estado.auditoria.length, 3);
});

test("si el catálogo del local cambió desde la vista previa, ese local no se aplica", async () => {
  const db = baseDeLaRed(NEGOCIOS);
  db.producto("canning", "Vacío", { pricePerKg: 11000 });
  const lista = listaDeLaCasa([prod("Vacío", { pricePerKg: 12000 })]);
  const r = await empuje(db, "canning", lista, "huella-vieja");
  assert.equal(r.estado, "cambio");
  assert.equal(db.estado.productos[0].pricePerKg, 11000);
  assert.equal(db.estado.auditoria.length, 0);
});

// ── El alta de un local que nace dentro de la red ────────────────────────────

test("CUIT y punto de venta del alta: el de la casa por defecto, validado, y el punto de venta es un entero", () => {
  assert.deepEqual(leerFiscalDelAlta({}, "20-30405060-7"), { ok: true, cuit: CUIT, puntoVenta: null });
  assert.deepEqual(leerFiscalDelAlta({ puntoVenta: "4" }, CUIT), { ok: true, cuit: CUIT, puntoVenta: 4 });
  assert.match((leerFiscalDelAlta({ cuit: "20304050600" }, CUIT) as { motivo: string }).motivo, /dígito verificador/);
  assert.match((leerFiscalDelAlta({ puntoVenta: "0" }, CUIT) as { motivo: string }).motivo, /no es un punto de venta/);
  assert.match((leerFiscalDelAlta({ puntoVenta: "4" }, null) as { motivo: string }).motivo, /hace falta el CUIT/);
});

function altaDb() {
  const db = baseDeLaRed([
    ...NEGOCIOS,
    { id: "nuevo", name: "MAGRA Temperley", slug: "magra-temperley", modules: ["pos"], arcaCuit: null, arcaPuntoVenta: null },
  ]);
  db.producto("casa", "Vacío", { pricePerKg: 12000, stock: 30 });
  db.producto("casa", "Chorizo", { saleUnit: "UNIT", unit: "u", price: 900, pricePerKg: null });
  return db;
}

const pedidoAlta = (extra: Record<string, unknown> = {}) => ({
  casaId: "casa",
  localId: "nuevo",
  alias: "Temperley",
  puntoVenta: "5",
  actor: "operator:gsg",
  lote: "lote-alta",
  ...extra,
});

test("el local nuevo entra a la red en una corrida: vínculo, CUIT y punto de venta, y la lista de la casa (sin stock)", async () => {
  const db = altaDb();
  const r = await db.transaccion((tx) => sumarAltaEnTx(tx, pedidoAlta(), () => false));
  assert.equal(r.alias, "Temperley");
  assert.equal(r.cuit, CUIT);
  assert.equal(r.puntoVenta, 5);
  assert.deepEqual(r.catalogo, { estado: "aplicado", nuevos: 2, cambios: 0 });
  const nuevo = db.estado.negocios.find((n) => n.id === "nuevo")!;
  assert.deepEqual([nuevo.arcaCuit, nuevo.arcaPuntoVenta], [CUIT, 5]);
  assert.deepEqual(db.estado.cartera.map((c) => [c.tenantId, c.clienteTenantId, c.estado]), [["casa", "nuevo", "activa"]]);
  const productos = db.estado.productos.filter((p) => p.tenantId === "nuevo").map((p) => [p.name, p.stock, p.pricePerKg ?? p.price]);
  assert.deepEqual(productos, [["Chorizo", 0, 900], ["Vacío", 0, 12000]], "la lista viaja; el stock no");
  const acciones = db.estado.auditoria.map((a) => `${a.tenantId}:${a.action}`);
  for (const esperada of ["casa:multilocal.vincular", "nuevo:multilocal.vinculado", "nuevo:fiscal.alta-en-red", "nuevo:multilocal.catalogo", "casa:multilocal.catalogo.empuje"]) {
    assert.ok(acciones.includes(esperada), `falta ${esperada}: ${acciones.join(", ")}`);
  }
  assert.ok(db.locks.includes(`arca-punto-venta:${CUIT}`), "el mismo candado por CUIT que la ficha");
  // Reintentar es seguro: no escribe nada nuevo.
  const antes = db.estado.auditoria.length;
  const otra = await db.transaccion((tx) => sumarAltaEnTx(tx, pedidoAlta(), () => false));
  assert.deepEqual(otra.catalogo, { estado: "al-dia" });
  assert.equal(db.estado.auditoria.length, antes);
});

test("el alta rechaza un CUIT + punto de venta ya usado, y no deja NADA escrito", async () => {
  const db = altaDb();
  await assert.rejects(db.transaccion((tx) => sumarAltaEnTx(tx, pedidoAlta({ puntoVenta: "3" }), () => false)), (e: unknown) => {
    assert.ok(e instanceof AltaEnRedRechazada);
    assert.match(e.message, /punto de venta 3 del CUIT 20-30405060-7 ya lo usa «MAGRA Lomas»/);
    return true;
  });
  assert.equal(db.estado.cartera.length, 0, "el vínculo se deshizo");
  assert.equal(db.estado.productos.filter((p) => p.tenantId === "nuevo").length, 0);
  assert.equal(db.estado.negocios.find((n) => n.id === "nuevo")!.arcaPuntoVenta, null);
  assert.equal(db.estado.auditoria.length, 0);
});

test("si la lista no se puede dejar, el local queda en la red igual y la lista queda pendiente con su porqué", async () => {
  const db = altaDb();
  db.producto("casa", "vacio", { pricePerKg: 11000 }); // la casa tiene dos «Vacío»
  const r = await db.transaccion((tx) => sumarAltaEnTx(tx, pedidoAlta(), () => false));
  assert.equal(r.catalogo.estado, "no-aplicable");
  assert.match(r.catalogo.estado === "no-aplicable" ? r.catalogo.motivo : "", new RegExp(`mismo nombre \\(vacio\\).*${NOMBRE_APP_CATALOGO}`));
  assert.deepEqual(db.estado.cartera.map((c) => [c.clienteTenantId, c.estado]), [["nuevo", "activa"]], "el vínculo quedó");
  assert.equal(db.estado.negocios.find((n) => n.id === "nuevo")!.arcaPuntoVenta, 5, "el punto de venta quedó");
  assert.equal(db.estado.productos.filter((p) => p.tenantId === "nuevo").length, 0, "no se escribió ningún producto");
  // Arreglada la casa, reintentar deja la lista (antes, el reintento volvía a rechazar lo mismo).
  db.estado.productos = db.estado.productos.filter((p) => p.name !== "vacio");
  const otra = await db.transaccion((tx) => sumarAltaEnTx(tx, pedidoAlta(), () => false));
  assert.deepEqual(otra.catalogo, { estado: "aplicado", nuevos: 2, cambios: 0 });
});

test("sin vista previa no se pisa un catálogo propio: un local que ya tenía productos conserva sus precios", async () => {
  const db = altaDb();
  // Lo que deja la fábrica si siembra el catálogo de ejemplo del rubro, o un negocio que ya existía.
  db.producto("nuevo", "Vacío", { pricePerKg: 9000, stock: 20 });
  db.producto("nuevo", "Bondiola", { pricePerKg: 8000, stock: 14 });
  const r = await db.transaccion((tx) => sumarAltaEnTx(tx, pedidoAlta(), () => false));
  assert.equal(r.catalogo.estado, "no-aplicable");
  assert.match(r.catalogo.estado === "no-aplicable" ? r.catalogo.motivo : "", /Ya tiene su propio catálogo \(2 productos.*vista previa/);
  const delLocal = db.estado.productos.filter((p) => p.tenantId === "nuevo").map((p) => [p.name, p.pricePerKg, p.stock]);
  assert.deepEqual(delLocal, [["Vacío", 9000, 20], ["Bondiola", 8000, 14]], "ni un precio tocado");
  assert.ok(!db.estado.auditoria.some((a) => a.action === "multilocal.catalogo"), "no hubo empuje");
  assert.equal(db.estado.cartera.length, 1, "el vínculo sí");
  // La misma lista CON la vista previa aprobada (la huella) sí se aplica: es el camino de la casa.
  const texto = listaDeLaCasa([prod("Vacío", { pricePerKg: 12000 }), prod("Chorizo", { saleUnit: "UNIT", unit: "u", price: 900, pricePerKg: null })]).texto;
  const vista = vistaDelLocal(planificarPlanilla(texto, [prod("Vacío", { id: "nuevo-Vacío", pricePerKg: 9000, stock: 20 }), prod("Bondiola", { id: "nuevo-Bondiola", pricePerKg: 8000, stock: 14 })]));
  assert.equal((await empuje(db, "nuevo", { texto }, vista.huella)).estado, "aplicado");

  // El caso del revisor: un producto de ejemplo con el mismo nombre que uno de la casa pero otra
  // forma de venta. Antes, el alta tiraba siempre y "Reintentar" volvía a tirar: el local quedaba
  // fuera de la red. Ahora el local entra y la lista queda pendiente con el porqué.
  const otra = altaDb();
  otra.producto("nuevo", "Vacío", { saleUnit: "UNIT", unit: "u", price: 5000, pricePerKg: null });
  const r2 = await otra.transaccion((tx) => sumarAltaEnTx(tx, pedidoAlta(), () => false));
  assert.equal(r2.catalogo.estado, "no-aplicable");
  assert.equal(r2.puntoVenta, 5);
  assert.equal(otra.estado.cartera.length, 1);
});

test("el alta en la red no se usa para sumar a CH ni a un negocio de otra red", async () => {
  const db = altaDb();
  await assert.rejects(
    db.transaccion((tx) => sumarAltaEnTx(tx, pedidoAlta(), (slug) => slug === "magra-temperley")),
    /OK del dueño/,
  );
  assert.equal(db.estado.auditoria.length, 0);
});
