import { test } from "node:test";
import assert from "node:assert/strict";
import type { FilaMonitor, Senal, SenalId } from "@/lib/monitor-core";
import { folioDeBandeja, ordenarBandeja, venceAlgo } from "./bandeja-core";

function senal(id: SenalId, severidad: Senal["severidad"]): Senal {
  return {
    id,
    severidad,
    titulo: id,
    detalle: "",
    accion: "",
    resuelve: { quien: "gsg" },
  };
}

function fila(alias: string, senales: Senal[], id = alias): FilaMonitor {
  const urgencia = senales.reduce(
    (s, x) => s + (x.severidad === "critico" ? 100 : 10),
    0,
  );
  return {
    clienteTenantId: id,
    alias,
    estado: urgencia >= 100 ? "critico" : "atencion",
    senales,
    urgencia,
    pctCap: 0,
  };
}

const sinPlata = () => 0;

test("el cliente que no puede facturar va arriba aunque otro mueva más plata", () => {
  const frenado = fila("Kiosco 24", [senal("facturas_rechazadas", "critico")]);
  const grande = fila("Ferretería Lanús", [
    senal("cola_estancada", "atencion"),
  ]);
  const plata = new Map([
    ["Kiosco 24", 38_400],
    ["Ferretería Lanús", 4_318_900],
  ]);
  const orden = ordenarBandeja([grande, frenado], (id) => plata.get(id) ?? 0);
  assert.deepEqual(
    orden.map((f) => f.alias),
    ["Kiosco 24", "Ferretería Lanús"],
  );
});

test("a igual gravedad, lo que vence va antes que lo que no vence", () => {
  const vence = fila("Taller Gómez", [senal("cert_por_vencer", "atencion")]);
  const cola = fila("Consultorio Ruiz", [senal("cola_estancada", "atencion")]);
  const orden = ordenarBandeja([cola, vence], (id) =>
    id === "Consultorio Ruiz" ? 9_000_000 : 0,
  );
  assert.deepEqual(
    orden.map((f) => f.alias),
    ["Taller Gómez", "Consultorio Ruiz"],
  );
});

test("a igual gravedad y vencimiento, primero el que más facturó este mes", () => {
  const a = fila("Almacén Sur", [senal("cola_estancada", "atencion")]);
  const b = fila("Bazar Norte", [senal("silencio_de_ingesta", "atencion")]);
  const plata = new Map([
    ["Almacén Sur", 120_000],
    ["Bazar Norte", 890_000],
  ]);
  const orden = ordenarBandeja([a, b], (id) => plata.get(id) ?? 0);
  assert.deepEqual(
    orden.map((f) => f.alias),
    ["Bazar Norte", "Almacén Sur"],
  );
});

test("con todo igual, el orden es estable por nombre y después por id", () => {
  const x2 = fila("Mismo", [senal("cola_estancada", "atencion")], "id-2");
  const x1 = fila("Mismo", [senal("cola_estancada", "atencion")], "id-1");
  const otro = fila("Abasto", [senal("cola_estancada", "atencion")]);
  const orden = ordenarBandeja([x2, otro, x1], sinPlata);
  assert.deepEqual(
    orden.map((f) => f.clienteTenantId),
    ["Abasto", "id-1", "id-2"],
  );
});

test("ordenar no toca el arreglo que recibe", () => {
  const entrada = [
    fila("B", [senal("cola_estancada", "atencion")]),
    fila("A", [senal("cert_vencido", "critico")]),
  ];
  const copia = entrada.map((f) => f.alias);
  ordenarBandeja(entrada, sinPlata);
  assert.deepEqual(
    entrada.map((f) => f.alias),
    copia,
  );
});

test("el folio dice la peor señal en una palabra, sin inventar fechas", () => {
  assert.equal(
    folioDeBandeja(
      fila("A", [
        senal("cola_estancada", "atencion"),
        senal("cert_vencido", "critico"),
      ]),
    ),
    "Venció",
  );
  assert.equal(
    folioDeBandeja(fila("B", [senal("outbox_trabado", "critico")])),
    "Frenado",
  );
  assert.equal(
    folioDeBandeja(fila("C", [senal("silencio_de_ingesta", "atencion")])),
    "Para ver",
  );
  assert.equal(folioDeBandeja(fila("D", [])), "");
});

test("vence algo: certificado y límite del plan sí; la cola de revisión no", () => {
  assert.equal(
    venceAlgo(fila("A", [senal("cerca_del_cupo", "atencion")])),
    true,
  );
  assert.equal(
    venceAlgo(fila("B", [senal("cola_estancada", "atencion")])),
    false,
  );
});
