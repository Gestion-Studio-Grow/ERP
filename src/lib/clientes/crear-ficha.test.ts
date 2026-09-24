// ============================================================================
// NUEVA FICHA — el candado por número y las lecturas acotadas, EJECUTADOS.
// ============================================================================
//
// Se corre el cuerpo real (`crearFichaEnTx`) contra una base falsa que hace lo que hace
// Postgres con lo que importa acá:
//   · `pg_advisory_xact_lock(hashtext(clave))`: la segunda transacción con la MISMA clave
//     espera a que termine la primera (un candado asíncrono por clave);
//   · la consulta cruda de candidatas: devuelve las filas del negocio cuyo teléfono, sin lo que
//     no es dígito, termina con el patrón (el mismo `LIKE` que escribe la función).
// Antes, dos altas simultáneas del mismo número daban dos fichas: la búsqueda iba afuera de la
// transacción.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { Prisma } from "@/generated/prisma/client";
import { crearFichaEnTx, patronDeCandidatos, claveDelCandadoDeFicha } from "./crear-ficha";
import { normalizarTelefono } from "./telefono";

type Ficha = { id: string; tenantId: string; name: string; phone: string; createdAt: number };
type Pedido = { id: string; tenantId: string; customerPhone: string; clientId: string | null };

function baseFalsa(inicial: { fichas?: Ficha[]; pedidos?: Pedido[] } = {}) {
  const db = {
    fichas: [...(inicial.fichas ?? [])],
    pedidos: [...(inicial.pedidos ?? [])],
    candados: new Map<string, Promise<void>>(),
    candadosTomados: [] as string[],
    filasLeidas: 0,
  };
  const digitos = (s: string) => s.replace(/[^0-9]/g, "");
  const termina = (tel: string, patron: string) => digitos(tel).endsWith(patron.replace(/^%/, ""));

  /** Corre `cuerpo` como una transacción: los candados que tome se sueltan al terminar. */
  async function transaccion<T>(cuerpo: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    const mios: (() => void)[] = [];
    const tx = {
      $executeRaw: async (_sql: TemplateStringsArray, clave: string) => {
        db.candadosTomados.push(clave);
        const anterior = db.candados.get(clave) ?? Promise.resolve();
        let soltar!: () => void;
        const mio = new Promise<void>((r) => (soltar = r));
        db.candados.set(clave, anterior.then(() => mio));
        mios.push(soltar);
        await anterior;
        return 1;
      },
      $queryRaw: async (sql: TemplateStringsArray, tenantId: string, patron: string) => {
        const texto = sql.join("?");
        if (texto.includes('FROM "Client"')) {
          const filas = db.fichas
            .filter((f) => f.tenantId === tenantId && termina(f.phone, patron))
            .sort((a, b) => a.createdAt - b.createdAt);
          db.filasLeidas += filas.length;
          return filas.map(({ id, name, phone }) => ({ id, name, phone }));
        }
        const filas = db.pedidos.filter((o) => o.tenantId === tenantId && o.clientId === null && termina(o.customerPhone, patron));
        db.filasLeidas += filas.length;
        return filas.map(({ id, customerPhone }) => ({ id, customerPhone }));
      },
      client: {
        create: async (a: { data: { tenantId: string; name: string; phone: string } }) => {
          // Un respiro entre leer y escribir: sin candado, la otra alta se mete acá.
          await new Promise((r) => setTimeout(r, 5));
          const id = `cli_${db.fichas.length + 1}`;
          db.fichas.push({ id, tenantId: a.data.tenantId, name: a.data.name, phone: a.data.phone, createdAt: db.fichas.length + 1 });
          return { id };
        },
      },
      order: {
        updateMany: async (a: { where: { tenantId: string; id: { in: string[] }; clientId: null }; data: { clientId: string } }) => {
          let n = 0;
          for (const o of db.pedidos) {
            if (o.tenantId === a.where.tenantId && a.where.id.in.includes(o.id) && o.clientId === null) {
              o.clientId = a.data.clientId;
              n++;
            }
          }
          return { count: n };
        },
      },
    } as unknown as Prisma.TransactionClient;
    try {
      return await cuerpo(tx);
    } finally {
      for (const s of mios) s();
    }
  }
  return { db, transaccion };
}

const ANA = { name: "Ana", phone: "11 4000-7919", email: null, notes: null, birthDate: null };

test("dos altas SIMULTÁNEAS del mismo número (escrito distinto): una ficha, y la otra dice cuál", async () => {
  const { db, transaccion } = baseFalsa();
  const [a, b] = await Promise.all([
    transaccion((tx) => crearFichaEnTx(tx, "t_magra", ANA)),
    transaccion((tx) => crearFichaEnTx(tx, "t_magra", { ...ANA, name: "Ana G.", phone: "+54 9 11 4000 7919" })),
  ]);
  assert.equal(db.fichas.length, 1, "antes quedaban dos fichas de la misma persona");
  const creada = [a, b].find((r) => r.ok);
  const rechazada = [a, b].find((r) => !r.ok);
  assert.ok(creada && rechazada);
  if (!rechazada.ok) assert.equal(rechazada.existente.id, db.fichas[0].id);
  // Los dos tomaron el MISMO candado: la clave normalizada, no lo tipeado.
  assert.deepEqual(db.candadosTomados, [claveDelCandadoDeFicha("t_magra", "1140007919"), claveDelCandadoDeFicha("t_magra", "1140007919")]);
});

test("el mismo número en OTRO negocio no choca, y números distintos no comparten candado", async () => {
  const { db, transaccion } = baseFalsa({ fichas: [{ id: "x1", tenantId: "t_shine", name: "Ana", phone: "1140007919", createdAt: 0 }] });
  const r = await transaccion((tx) => crearFichaEnTx(tx, "t_magra", ANA));
  assert.equal(r.ok, true);
  await transaccion((tx) => crearFichaEnTx(tx, "t_magra", { ...ANA, phone: "11 5555-0000" }));
  assert.notEqual(db.candadosTomados[0], db.candadosTomados[1]);
});

test("otro número que TERMINA igual no es duplicado: el filtro exacto lo saca", async () => {
  // Mismos últimos 6 dígitos, otra área: pasa el LIKE, no pasa `normalizarTelefono`.
  const { db, transaccion } = baseFalsa({ fichas: [{ id: "c1", tenantId: "t_magra", name: "Otra", phone: "0221 400-7919", createdAt: 0 }] });
  const r = await transaccion((tx) => crearFichaEnTx(tx, "t_magra", ANA));
  assert.equal(r.ok, true);
  assert.equal(db.fichas.length, 2);
});

test("ata sólo los pedidos sin ficha de ESE número (y de este negocio); lee sólo candidatas", async () => {
  const pedidos: Pedido[] = [
    { id: "o1", tenantId: "t_magra", customerPhone: "011 15-4000-7919", clientId: null },
    { id: "o2", tenantId: "t_magra", customerPhone: "1140007919", clientId: "cli_vieja" },
    { id: "o3", tenantId: "t_shine", customerPhone: "1140007919", clientId: null },
    { id: "o4", tenantId: "t_magra", customerPhone: "11 2222-3333", clientId: null },
    { id: "o5", tenantId: "t_magra", customerPhone: "0221 400-7919", clientId: null }, // termina igual, otro número
  ];
  const fichas: Ficha[] = Array.from({ length: 50 }, (_, i) => ({
    id: `f${i}`,
    tenantId: "t_magra",
    name: `F${i}`,
    phone: `11 3000-${String(1000 + i)}`,
    createdAt: i,
  }));
  const { db, transaccion } = baseFalsa({ fichas, pedidos });
  const r = await transaccion((tx) => crearFichaEnTx(tx, "t_magra", ANA));
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.pedidos, ["o1"]);
  assert.equal(db.pedidos.find((o) => o.id === "o1")!.clientId, r.ok ? r.id : "");
  assert.equal(db.pedidos.find((o) => o.id === "o3")!.clientId, null, "el pedido del otro negocio no se toca");
  assert.equal(db.pedidos.find((o) => o.id === "o5")!.clientId, null);
  // Antes se traían las 50 fichas y los 5 pedidos; ahora sólo lo que termina igual.
  assert.equal(db.filasLeidas, 2, "o1 y o5 (candidatos); ninguna de las 50 fichas");
});

test("el patrón de SQL es un sufijo de la clave: toda escritura del número lo cumple", () => {
  const escrituras = ["11 4000-7919", "1140007919", "+5491140007919", "011 15-4000-7919", "0054 9 11 4000 7919", "(011) 4000-7919"];
  const patron = patronDeCandidatos("1140007919");
  assert.equal(patron, "%007919");
  for (const e of escrituras) assert.ok(e.replace(/[^0-9]/g, "").endsWith(patron.slice(1)), e);
  // El caso borde: área de 4 dígitos + "15" (el 15 más a la derecha que se recorta). La clave
  // pierde dos dígitos del medio y el sufijo de 6 queda intacto.
  const borde = "02966 15 412345";
  const clave = normalizarTelefono(borde);
  assert.equal(clave, "2966412345");
  assert.ok(borde.replace(/[^0-9]/g, "").endsWith(patronDeCandidatos(clave).slice(1)));
});
