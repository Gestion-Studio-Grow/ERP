// El cliente de la venta (Magra, tanda 1 · 1D): el CUIT por dígito verificador (MG-015, MG-016),
// la búsqueda por nombre, teléfono o documento (3+ caracteres, hasta 8, sólo el negocio de la
// sesión — MG-039), lo que se trae al elegir (datos para facturar, última dirección, saldo,
// últimos 3 pedidos) y el alta en línea (MG-019).
//
// Dos capas: una base en memoria que obedece los filtros de Prisma (siempre corre, y registra cada
// consulta para ver que TODAS llevan el `tenantId`), y Postgres real con RLS (src/test/base-efimera.ts,
// sin Postgres local se saltea y lo dice) para el aislamiento de verdad y el alta de punta a punta.

import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { apuntarLaAppA, baseEfimeraDelArchivo } from "@/test/base-efimera";
import { validarCuit } from "@/lib/fiscal/cuit";
import {
  MAXIMO_RESULTADOS,
  buscarClientesParaVentaEnTx,
  consultarPadron,
  detalleDelClienteEnTx,
  leerDocumento,
  revisarCuit,
  saldoDelClienteEnTx,
  textoParaBuscar,
  validarClienteDeLaVenta,
} from "./buscar-para-venta-core";

// ── CUIT ──────────────────────────────────────────────────────────────────────

// Módulo 11 de 2,7,1,2,3,4,5,6,7,8 con pesos 5,4,3,2,7,6,5,4,3,2 = 176, resto 0 → verificador 0.
// OJO (aviso al diseño): MG-015 y MG-016 tienen los dos números al revés. 27-12345678-0 es el que
// cierra y 27-12345678-9 el mal escrito; los tests usan la cuenta, no el texto del caso.
const CUIT_BUENO = "27123456780";
const CUIT_MALO = "27123456789";

test("validarCuit: el dígito verificador decide, con o sin guiones", () => {
  const r = validarCuit(CUIT_BUENO);
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.formateado, "27-12345678-0");
  assert.equal(validarCuit("27-12345678-0").ok, true);
  assert.equal(validarCuit("20-11111111-2").ok, true);
  const mal = validarCuit(CUIT_MALO);
  assert.equal(mal.ok, false);
  assert.equal(!mal.ok && mal.error, "DIGITO_VERIFICADOR");
  assert.equal(!validarCuit("2712345678").ok && (validarCuit("2712345678") as { error: string }).error, "LARGO");
  assert.equal(!validarCuit("99123456780").ok && (validarCuit("99123456780") as { error: string }).error, "NO_EXISTE");
});

test("MG-015 / MG-016: el CUIT en Vender se muestra formateado o dice que no cierra, sin sugerir el dígito", () => {
  assert.deepEqual(revisarCuit(CUIT_BUENO), { ok: true, cuit: CUIT_BUENO, formateado: "27-12345678-0" });
  const mal = revisarCuit(CUIT_MALO);
  assert.equal(mal.ok, false);
  assert.match(!mal.ok ? mal.motivo : "", /^Ese CUIT no cierra: revisá el último número/);
  assert.doesNotMatch(!mal.ok ? mal.motivo : "", /debería ser|es el 0|terminado en/);

  const doc = leerDocumento(CUIT_BUENO);
  assert.equal(doc.estado, "valido");
  assert.equal(doc.estado === "valido" && doc.texto, "CUIT 27-12345678-0");
  assert.equal(doc.estado === "valido" && doc.docTipo, 80);
  assert.equal(leerDocumento(CUIT_MALO).estado, "invalido");
});

test("el campo «CUIT/DNI» distingue DNI y CUIT por el largo y rechaza lo que no es ninguno", () => {
  assert.deepEqual(leerDocumento(""), { estado: "vacio" });
  const dni = leerDocumento("12.345.678");
  assert.equal(dni.estado === "valido" && dni.docTipo, 96);
  assert.equal(dni.estado === "valido" && dni.docNro, "12345678");
  assert.equal(leerDocumento("1234").estado, "invalido");
  assert.equal(leerDocumento("27ABC").estado, "invalido");
  // CUIL elegido: misma regla, la palabra correcta.
  const cuil = leerDocumento(CUIT_MALO, 86);
  assert.match(cuil.estado === "invalido" ? cuil.motivo : "", /^Ese CUIL no cierra/);
});

test("el padrón de ARCA es un gancho: hoy no trae nada y se completa a mano", async () => {
  assert.equal(await consultarPadron(CUIT_BUENO), null);
});

// ── Alta en línea (puro) ──────────────────────────────────────────────────────

test("MG-019 (regla): alta con CUIT y responsable inscripto pide razón social y domicilio, y normaliza", () => {
  const sinRazon = validarClienteDeLaVenta({ nombre: "Parrilla UAT", docNro: CUIT_BUENO, condicionIva: "RESPONSABLE_INSCRIPTO" });
  assert.equal(sinRazon.ok, false);
  assert.equal(!sinRazon.ok && sinRazon.campo, "razonSocial");

  const ok = validarClienteDeLaVenta({
    nombre: "  Parrilla   UAT ",
    telefono: "11 5555-1234",
    docNro: "27-12345678-0",
    razonSocial: "Parrilla UAT SRL",
    condicionIva: "RESPONSABLE_INSCRIPTO",
    domicilio: "Av. Mitre 100, Canning",
  });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.ok && ok.cliente, {
    id: null,
    nombre: "Parrilla UAT",
    telefono: "11 5555-1234",
    ficha: { docTipo: 80, docNro: CUIT_BUENO, razonSocial: "Parrilla UAT SRL", condicionIva: "RESPONSABLE_INSCRIPTO", domicilio: "Av. Mitre 100, Canning" },
  });

  const malCuit = validarClienteDeLaVenta({ nombre: "X", docNro: CUIT_MALO });
  assert.equal(!malCuit.ok && malCuit.campo, "docNro");
  assert.match(!malCuit.ok ? malCuit.error : "", /^Ese CUIT no cierra/);

  assert.equal((validarClienteDeLaVenta({ nombre: "" }) as { campo: string }).campo, "nombre");
  assert.equal((validarClienteDeLaVenta({ nombre: "Ana", telefono: "abc" }) as { campo: string }).campo, "telefono");
  // Editar (con id) no pide nombre: sólo toca los datos para facturar.
  assert.equal(validarClienteDeLaVenta({ id: "cli_1", docNro: "12345678" }).ok, true);
  // Sin teléfono también se puede dar de alta (una parrilla con CUIT).
  assert.equal(validarClienteDeLaVenta({ nombre: "Parrilla", docTipo: "96", docNro: "30111222" }).ok, true);
});

// ── Buscar (base en memoria) ──────────────────────────────────────────────────

test("se busca desde 3 caracteres", () => {
  assert.equal(textoParaBuscar("an").ok, false);
  assert.equal(textoParaBuscar(" a  n ").ok, false);
  const q = textoParaBuscar("  Ana  Pé ");
  assert.deepEqual(q, { ok: true, texto: "Ana Pé", digitos: "" });
  assert.deepEqual(textoParaBuscar("11 5555"), { ok: true, texto: "11 5555", digitos: "115555" });
});

type Fila = Record<string, unknown>;

function cumple(fila: Fila, where: Fila | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([k, v]) => {
    if (k === "OR") return (v as Fila[]).some((w) => cumple(fila, w));
    const valor = fila[k];
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      const f = v as { contains?: string; mode?: string; in?: unknown[]; not?: unknown };
      if ("contains" in f) {
        const a = String(valor ?? "");
        return f.mode === "insensitive" ? a.toLowerCase().includes(String(f.contains).toLowerCase()) : a.includes(String(f.contains));
      }
      if ("in" in f) return (f.in ?? []).includes(valor);
      if ("not" in f) return f.not === null ? valor != null : valor !== f.not;
    }
    return valor === v;
  });
}

/** Una base en memoria con los filtros que usa el core, que anota cada `where`. */
function baseEnMemoria(t: { clientes: Fila[]; pedidos?: Fila[]; deudas?: Fila[]; cobros?: Fila[] }) {
  const consultas: { modelo: string; where: Fila | undefined; tenantCrudo?: unknown }[] = [];
  const modelo = (nombre: string, filas: Fila[]) => ({
    findMany: async (a: { where?: Fila; take?: number; orderBy?: unknown }) => {
      consultas.push({ modelo: nombre, where: a.where });
      let r = filas.filter((f) => cumple(f, a.where));
      if (nombre === "order") r = [...r].sort((x, y) => (y.createdAt as Date).getTime() - (x.createdAt as Date).getTime());
      if (nombre === "client") r = [...r].sort((x, y) => String(x.name).localeCompare(String(y.name)));
      return a.take ? r.slice(0, a.take) : r;
    },
    findFirst: async (a: { where?: Fila }) => {
      consultas.push({ modelo: nombre, where: a.where });
      return filas.find((f) => cumple(f, a.where)) ?? null;
    },
    groupBy: async (a: { where?: Fila }) => {
      consultas.push({ modelo: nombre, where: a.where });
      const suma = new Map<string, number>();
      for (const f of filas.filter((x) => cumple(x, a.where))) suma.set(String(f.originId), (suma.get(String(f.originId)) ?? 0) + Number(f.amount));
      return [...suma].map(([originId, amount]) => ({ originId, _sum: { amount } }));
    },
  });
  const tx = {
    client: modelo("client", t.clientes),
    order: modelo("order", t.pedidos ?? []),
    accountReceivable: modelo("accountReceivable", t.deudas ?? []),
    collection: modelo("collection", t.cobros ?? []),
    // La única cruda: `… WHERE "tenantId" = ${tenantId} AND regexp_replace(phone) LIKE ${patron} LIMIT ${n}`.
    $queryRaw: async (_s: TemplateStringsArray, tenantId: string, patron: string, limite: number) => {
      consultas.push({ modelo: "client(raw)", where: undefined, tenantCrudo: tenantId });
      const parte = patron.replace(/%/g, "");
      return t.clientes
        .filter((c) => c.tenantId === tenantId && String(c.phone ?? "").replace(/\D/g, "").includes(parte))
        .slice(0, limite)
        .map((c) => ({ id: c.id }));
    },
  };
  return { tx: tx as never, consultas };
}

const MAGRA = "t_magra";
const SPA = "t_beauty";
const ficha = (id: string, tenantId: string, name: string, extra: Fila = {}): Fila => ({
  id,
  tenantId,
  name,
  phone: "",
  docTipo: null,
  docNro: null,
  razonSocial: null,
  condicionIva: null,
  domicilio: null,
  ...extra,
});

test("MG-039: el mismo CUIT en magra y en beauty-spa — desde magra sólo aparece el de magra", async () => {
  const { tx, consultas } = baseEnMemoria({
    clientes: [
      ficha("c_magra", MAGRA, "Parrilla Canning", { docTipo: 80, docNro: CUIT_BUENO, razonSocial: "Parrilla Canning SRL", condicionIva: "RESPONSABLE_INSCRIPTO" }),
      ficha("c_spa", SPA, "Clienta del spa", { docTipo: 80, docNro: CUIT_BUENO, phone: "11 4000-7919" }),
    ],
  });
  const r = await buscarClientesParaVentaEnTx(tx, MAGRA, CUIT_BUENO);
  assert.deepEqual(r.map((c) => c.id), ["c_magra"]);
  assert.equal(r[0].coincide, "documento");
  assert.equal(r[0].razonSocial, "Parrilla Canning SRL");
  // Por teléfono del spa, desde magra: nada.
  assert.deepEqual(await buscarClientesParaVentaEnTx(tx, MAGRA, "1140007919"), []);
  // TODAS las consultas llevaron el negocio de la sesión (la cruda también).
  assert.ok(consultas.length > 0);
  for (const q of consultas) {
    if (q.modelo === "client(raw)") assert.equal(q.tenantCrudo, MAGRA);
    else assert.equal(q.where?.tenantId, MAGRA, `${q.modelo} sin tenantId`);
  }
});

test("busca por nombre, por teléfono escrito como sea y por parte del documento; como máximo 8", async () => {
  const muchas = Array.from({ length: 12 }, (_, i) => ficha(`c_${i}`, MAGRA, `Ana ${String(i).padStart(2, "0")}`));
  const { tx } = baseEnMemoria({
    clientes: [
      ...muchas,
      ficha("c_tel", MAGRA, "Beto Teléfono", { phone: "+54 9 11 5555-1234" }),
      ficha("c_dni", MAGRA, "Carla Documento", { docTipo: 96, docNro: "30111222" }),
    ],
  });
  const anas = await buscarClientesParaVentaEnTx(tx, MAGRA, "ana");
  assert.equal(anas.length, MAXIMO_RESULTADOS);
  assert.equal(MAXIMO_RESULTADOS, 8);
  assert.ok(anas.every((c) => c.nombre.startsWith("Ana")));

  const porTel = await buscarClientesParaVentaEnTx(tx, MAGRA, "11 5555-1234");
  assert.deepEqual(porTel.map((c) => [c.id, c.coincide]), [["c_tel", "telefono"]]);
  // Con el 15 y el 0 de larga distancia: la clave normalizada también se compara.
  assert.deepEqual((await buscarClientesParaVentaEnTx(tx, MAGRA, "011 15 5555-1234")).map((c) => c.id), ["c_tel"]);

  const porDni = await buscarClientesParaVentaEnTx(tx, MAGRA, "30.111");
  assert.deepEqual(porDni.map((c) => [c.id, c.coincide]), [["c_dni", "documento"]]);

  assert.deepEqual(await buscarClientesParaVentaEnTx(tx, MAGRA, "an"), [], "con 2 caracteres no se busca");
});

test("al elegir: datos para facturar, última dirección, últimos 3 pedidos sin anulados, y el saldo al centavo", async () => {
  const dia = (d: number) => new Date(Date.UTC(2026, 9, d, 15));
  const pedido = (id: string, code: number, d: number, extra: Fila = {}): Fila => ({
    id,
    tenantId: MAGRA,
    clientId: "c_ana",
    code,
    createdAt: dia(d),
    total: 10_000 + code,
    status: "DELIVERED",
    address: null,
    items: [{ productId: "p_vacio", name: "Vacío", quantity: 1.24, saleUnit: "WEIGHT" }],
    ...extra,
  });
  const { tx } = baseEnMemoria({
    clientes: [ficha("c_ana", MAGRA, "Ana Pérez", { phone: "11 5555-1234", docTipo: 80, docNro: CUIT_BUENO, razonSocial: "Ana Pérez", condicionIva: "MONOTRIBUTO", domicilio: "Los Álamos 123" })],
    pedidos: [
      pedido("o1", 101, 1, { address: "Los Álamos 123" }),
      pedido("o2", 102, 5, { address: "  " }),
      pedido("o3", 103, 8),
      pedido("o4", 104, 10, { status: "CANCELLED" }),
      pedido("o5", 105, 12),
      // Un pedido de otro negocio con el mismo clientId no se cuela.
      pedido("o_spa", 999, 20, { tenantId: SPA, address: "Otra dirección" }),
    ],
    deudas: [
      { id: "d1", tenantId: MAGRA, clientId: "c_ana", status: "OPEN", amount: 25_700 },
      { id: "d2", tenantId: MAGRA, clientId: "c_ana", status: "OPEN", amount: 1_000.5 },
      { id: "d3", tenantId: MAGRA, clientId: "c_ana", status: "VOID", amount: 99_999 },
      { id: "d_spa", tenantId: SPA, clientId: "c_ana", status: "OPEN", amount: 50_000 },
    ],
    cobros: [{ tenantId: MAGRA, originType: "RECEIVABLE", originId: "d1", amount: 7_300 }],
  });
  const d = await detalleDelClienteEnTx(tx, MAGRA, "c_ana");
  assert.ok(d);
  assert.equal(d.razonSocial, "Ana Pérez");
  assert.equal(d.condicionIva, "MONOTRIBUTO");
  assert.equal(d.ultimaDireccion, "Los Álamos 123", "la más reciente con texto (MG-035)");
  assert.deepEqual(d.ultimosPedidos.map((p) => p.code), [105, 103, 102]);
  assert.deepEqual(d.ultimosPedidos[0].renglones, [{ productId: "p_vacio", nombre: "Vacío", cantidad: 1.24, porPeso: true }]);
  assert.equal(await saldoDelClienteEnTx(tx, MAGRA, "c_ana"), 19_400.5);

  assert.equal(await detalleDelClienteEnTx(tx, SPA, "c_ana"), null, "la ficha de magra no existe para beauty-spa");
});

// ── Postgres real con RLS ─────────────────────────────────────────────────────

const laBase = baseEfimeraDelArchivo();

test("Postgres + RLS: el mismo CUIT en dos negocios, cada uno ve el suyo; el alta queda en la ficha fiscal", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  const a = base.a.id;
  const b = base.b.id;
  const c = new pg.Client({ connectionString: base.urlDuenio });
  await c.connect();
  try {
    await c.query(
      `INSERT INTO "Client" (id, "tenantId", name, phone, "docTipo", "docNro", "updatedAt") VALUES
         ('cli_cuit_a', $1, 'Parrilla de A', '1150002222', 80, $3, now()),
         ('cli_cuit_b', $2, 'Parrilla de B', '1150002222', 80, $3, now())`,
      [a, b, CUIT_BUENO],
    );
  } finally {
    await c.end();
  }

  const { tenantTransaction } = await import("@/lib/rls");
  const desdeA = await tenantTransaction((tx) => buscarClientesParaVentaEnTx(tx, a, CUIT_BUENO), { tenantId: a });
  assert.deepEqual(desdeA.map((x) => x.id), ["cli_cuit_a"]);
  const telDesdeB = await tenantTransaction((tx) => buscarClientesParaVentaEnTx(tx, b, "1150002222"), { tenantId: b });
  assert.deepEqual(telDesdeB.map((x) => x.id), ["cli_cuit_b"]);
  // Aunque el código pidiera las de A con la sesión de B, RLS no las deja ver.
  const cruzado = await tenantTransaction((tx) => buscarClientesParaVentaEnTx(tx, a, CUIT_BUENO), { tenantId: b });
  assert.deepEqual(cruzado, []);
  assert.equal(await tenantTransaction((tx) => detalleDelClienteEnTx(tx, a, "cli_cuit_a"), { tenantId: b }), null);

  // MG-019: alta desde Vender con CUIT y condición; la ficha fiscal muestra exactamente eso.
  const { guardarClienteDeLaVentaEnTx } = await import("./buscar-para-venta-core");
  const v = validarClienteDeLaVenta({
    nombre: "Parrilla UAT",
    docNro: "20-11111111-2",
    razonSocial: "Parrilla UAT SRL",
    condicionIva: "RESPONSABLE_INSCRIPTO",
    domicilio: "Av. Mitre 100, Canning",
  });
  assert.ok(v.ok);
  const g = await tenantTransaction((tx) => guardarClienteDeLaVentaEnTx(tx, a, v.cliente), { tenantId: a });
  assert.ok(g.ok, JSON.stringify(g));
  const leida = await tenantTransaction(
    (tx) => tx.client.findFirst({ where: { id: g.id, tenantId: a }, select: { name: true, docTipo: true, docNro: true, razonSocial: true, condicionIva: true, domicilio: true } }),
    { tenantId: a },
  );
  assert.deepEqual(leida, {
    name: "Parrilla UAT",
    docTipo: 80,
    docNro: "20111111112",
    razonSocial: "Parrilla UAT SRL",
    condicionIva: "RESPONSABLE_INSCRIPTO",
    domicilio: "Av. Mitre 100, Canning",
  });
  // El mismo CUIT otra vez en A no duplica la ficha: dice cuál es.
  const otra = await tenantTransaction((tx) => guardarClienteDeLaVentaEnTx(tx, a, v.cliente), { tenantId: a });
  assert.equal(otra.ok, false);
  assert.equal(!otra.ok && otra.existenteId, g.id);
  // En B, ese CUIT es libre: cada negocio tiene su ficha.
  const enB = await tenantTransaction((tx) => guardarClienteDeLaVentaEnTx(tx, b, v.cliente), { tenantId: b });
  assert.ok(enB.ok);
});
