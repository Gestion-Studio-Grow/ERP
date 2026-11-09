// Interruptor «contabilidad» + estado del módulo (T0). Sin base: se reemplaza
// `basePrisma.$transaction` (mismo recurso que repo-migracion-pendiente.test.ts).
//   · apagado → OCULTO, y NO se sondea ninguna tabla contable (una sola transacción: la del interruptor);
//   · prendido + tabla/columna ausente (P2021/P2022) → MIGRACION_PENDIENTE, no un error;
//   · prendido + todo presente → LISTO;
//   · si leer el interruptor falla → apagado.

import { test } from "node:test";
import assert from "node:assert/strict";
import { CONTABILIDAD_HABILITADA, INTERRUPTORES_DE_LA_CONSOLA, contabilidadPrendida, esIncorporado } from "@/cambios/interruptores";

process.env.DATABASE_URL ??= "postgresql://nadie@127.0.0.1:1/nada";

/** Cada llamada a $transaction consume la próxima respuesta: un valor o un error. */
async function simular(respuestas: Array<{ valor: unknown } | { error: unknown }>) {
  const { basePrisma } = await import("@/lib/prisma-base");
  let llamadas = 0;
  Object.defineProperty(basePrisma, "$transaction", {
    configurable: true,
    writable: true,
    value: async () => {
      const r = respuestas[llamadas++];
      if (!r) throw new Error("llamada de más a la base");
      if ("error" in r) throw r.error;
      return r.valor;
    },
  });
  return {
    llamadas: () => llamadas,
    restaurar: () => delete (basePrisma as unknown as Record<string, unknown>).$transaction,
  };
}

test("interruptor «contabilidad»: existe, la consola lo ofrece, no es incorporado y arranca apagado", () => {
  assert.equal(CONTABILIDAD_HABILITADA, "contabilidad");
  assert.ok(INTERRUPTORES_DE_LA_CONSOLA.some((i) => i.id === "contabilidad"));
  assert.equal(esIncorporado(CONTABILIDAD_HABILITADA), false);
  assert.equal(contabilidadPrendida({}), false);
  assert.equal(contabilidadPrendida({ contabilidad: { encendido: true } }), true);
});

test("apagado → OCULTO sin tocar tablas contables", async () => {
  const m = await simular([{ valor: false }]);
  try {
    const { estadoContabilidadDelNegocio } = await import("./modulo.server");
    assert.equal(await estadoContabilidadDelNegocio("negocio-x"), "OCULTO");
    assert.equal(m.llamadas(), 1);
  } finally {
    m.restaurar();
  }
});

for (const code of ["P2021", "P2022"]) {
  test(`prendido + ${code} → MIGRACION_PENDIENTE (aviso, no error)`, async () => {
    const m = await simular([{ valor: true }, { error: Object.assign(new Error("The table `public.CuentaRol` does not exist"), { code }) }]);
    try {
      const { estadoContabilidadDelNegocio } = await import("./modulo.server");
      assert.equal(await estadoContabilidadDelNegocio("negocio-x"), "MIGRACION_PENDIENTE");
    } finally {
      m.restaurar();
    }
  });
}

test("prendido + tablas presentes → LISTO", async () => {
  const m = await simular([{ valor: true }, { valor: undefined }]);
  try {
    const { estadoContabilidadDelNegocio } = await import("./modulo.server");
    assert.equal(await estadoContabilidadDelNegocio("negocio-x"), "LISTO");
  } finally {
    m.restaurar();
  }
});

test("si leer el interruptor falla, queda apagado", async () => {
  const m = await simular([{ error: new Error("sin conexión") }]);
  try {
    const { estadoContabilidadDelNegocio } = await import("./modulo.server");
    assert.equal(await estadoContabilidadDelNegocio("negocio-x"), "OCULTO");
  } finally {
    m.restaurar();
  }
});

test("otro error de la sonda (no de migración) no se disfraza de «pendiente»", async () => {
  const m = await simular([{ valor: true }, { error: Object.assign(new Error("timeout"), { code: "P1008" }) }]);
  try {
    const { estadoContabilidadDelNegocio } = await import("./modulo.server");
    await assert.rejects(estadoContabilidadDelNegocio("negocio-x"), /timeout/);
  } finally {
    m.restaurar();
  }
});
