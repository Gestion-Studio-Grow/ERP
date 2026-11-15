// ============================================================================
// IMPORTACIÓN DE EXTRACTOS — contra Postgres (base efímera, app_rls) · GSG-FACT-011
// ============================================================================
//   · C11: dos cobros legítimos iguales el mismo día → dos filas (dos ventas). La segunda subida
//     del mismo archivo responde «ya subiste este archivo» y no crea nada.
//   · H3: dos subidas SIMULTÁNEAS del mismo archivo (dos transacciones, dos conexiones del pool)
//     → una sola importación (candado por negocio + el archivo crudo comparado byte a byte).
//   · F3: dos extractos DISTINTOS a la vez con el mismo día de corte → la segunda ve a la primera
//     (candado por negocio + foto de lo guardado; si cambió, se procesa de nuevo).
// Determinista: sin sleep ni azar; la carrera la resuelve el candado, no el reloj.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();

function formulario(nombre: string, lineas: string[]): FormData {
  const fd = new FormData();
  fd.set("archivo", new File([lineas.join("\r\n")], nombre, { type: "text/csv" }));
  return fd;
}

async function preparar(t: Parameters<typeof laBase>[0]) {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  if (process.env.AUTH_SECRET === undefined) process.env.AUTH_SECRET = "secreto-de-auth-qa";
  prepararAccionesDeServidor();
  const acciones = await import("@/lib/bancos-actions");
  const duenio = await prismaComoDuenio(base);
  return { base, acciones, duenio };
}

test("C11: dos cobros iguales el mismo día → dos filas; la segunda subida del archivo → cero", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, acciones, duenio } = p;
  const neg = base.a;
  const subir = () =>
    ejecutarAccion({ negocio: neg, usuario: neg.duenia }, () =>
      acciones.procesarExtractoAction(
        formulario("noviembre.csv", [
          "Fecha;Descripción;Débito;Crédito;Saldo",
          "10/11/2026;Transferencia recibida CBU 285;;5.000,00;5.000,00",
          "10/11/2026;Transferencia recibida CBU 285;;5.000,00;10.000,00",
          "12/11/2026;Acreditación ventas;;7.000,00;17.000,00",
        ]),
      ),
    );

  const r1 = await subir();
  assert.equal(r1.tipo, "respuesta");
  const v1 = (r1 as { valor: Awaited<ReturnType<typeof acciones.procesarExtractoAction>> }).valor;
  assert.ok(v1.ok, JSON.stringify(v1));
  const filas = await duenio.movimientoImportado.findMany({
    where: { tenantId: neg.id, fecha: "20261110" },
    select: { hash: true, estadoPropuesta: true },
  });
  assert.equal(filas.length, 2, "dos cobros = dos ventas");
  assert.deepEqual(filas.map((f) => f.estadoPropuesta).sort(), ["auto", "auto"]);

  const r2 = await subir();
  const v2 = (r2 as { valor: Awaited<ReturnType<typeof acciones.procesarExtractoAction>> }).valor;
  assert.equal(v2.ok, false);
  assert.match((v2 as { error: string }).error, /ya subiste este archivo/i);
  assert.equal(await duenio.importacionBancaria.count({ where: { tenantId: neg.id } }), 1);
  assert.equal(await duenio.movimientoImportado.count({ where: { tenantId: neg.id } }), 3);
});

test("H3: dos subidas simultáneas del mismo archivo → una sola importación", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, acciones, duenio } = p;
  const neg = base.b;
  const lineas = [
    "Fecha;Descripción;Débito;Crédito;Saldo",
    "03/11/2026;Transferencia recibida CBU 007;;4.000,00;4.000,00",
    "04/11/2026;Acreditación ventas;;6.000,00;10.000,00",
  ];
  const subir = () =>
    ejecutarAccion({ negocio: neg, usuario: neg.duenia }, () =>
      acciones.procesarExtractoAction(formulario("simultaneo.csv", lineas)),
    );

  const [r1, r2] = await Promise.all([subir(), subir()]);
  const valores = [r1, r2].map(
    (r) => (r as { valor: Awaited<ReturnType<typeof acciones.procesarExtractoAction>> }).valor,
  );
  assert.equal(valores.filter((v) => v.ok).length, 1, JSON.stringify(valores));
  const rechazo = valores.find((v) => !v.ok) as { error: string };
  assert.match(rechazo.error, /ya subiste este archivo/i);
  assert.equal(await duenio.importacionBancaria.count({ where: { tenantId: neg.id } }), 1);
  assert.equal(await duenio.movimientoImportado.count({ where: { tenantId: neg.id } }), 2);
});

test("H1: día partido entre dos extractos → el cobro del borde queda en REVISIÓN, con otra clave", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, acciones, duenio } = p;
  const neg = base.a;
  const subir = (nombre: string, lineas: string[]) =>
    ejecutarAccion({ negocio: neg, usuario: neg.duenia }, () =>
      acciones.procesarExtractoAction(formulario(nombre, ["Fecha;Descripción;Débito;Crédito;Saldo", ...lineas])),
    );
  const ok = (r: Awaited<ReturnType<typeof subir>>) => {
    const v = (r as { valor: Awaited<ReturnType<typeof acciones.procesarExtractoAction>> }).valor;
    assert.ok(v.ok, JSON.stringify(v));
  };
  ok(await subir("borde-1a15.csv", ["01/10/2026;Acreditación ventas;;1.000,00;1.000,00", "15/10/2026;Transferencia recibida CBU 999;;5.000,00;6.000,00"]));
  ok(await subir("borde-15a20.csv", ["15/10/2026;Transferencia recibida CBU 999;;5.000,00;5.000,00", "20/10/2026;Acreditación ventas;;2.000,00;7.000,00"]));

  const del15 = await duenio.movimientoImportado.findMany({
    where: { tenantId: neg.id, fecha: "20261015" },
    select: { hash: true, estadoPropuesta: true, motivoRevision: true },
    orderBy: { createdAt: "asc" },
  });
  assert.equal(del15.length, 2, "el cobro del borde no se pierde");
  assert.notEqual(del15[0].hash, del15[1].hash);
  assert.equal(del15[0].estadoPropuesta, "auto");
  assert.equal(del15[1].estadoPropuesta, "revision", "nunca sale solo");
  assert.match(del15[1].motivoRevision ?? "", /posible cobro repetido/i);
});

test("F3: dos extractos DISTINTOS con el mismo día de corte, subidos a la vez → no se pierde el cobro y el resumen es lo insertado", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, acciones, duenio } = p;
  const neg = base.a;
  const subir = (nombre: string, lineas: string[]) =>
    ejecutarAccion({ negocio: neg, usuario: neg.duenia }, () =>
      acciones.procesarExtractoAction(formulario(nombre, ["Fecha;Descripción;Débito;Crédito;Saldo", ...lineas])),
    );
  const valor = (r: Awaited<ReturnType<typeof subir>>) =>
    (r as { valor: Awaited<ReturnType<typeof acciones.procesarExtractoAction>> }).valor;

  // Mañana del 15 (en el extracto del 1 al 15) y tarde del 15 (en el del 15 al 20): dos cobros.
  const [r1, r2] = await Promise.all([
    subir("simul-1a15.csv", ["01/09/2026;Acreditación ventas;;1.000,00;1.000,00", "15/09/2026;Transferencia recibida CBU 321;;5.000,00;6.000,00"]),
    subir("simul-15a20.csv", ["15/09/2026;Transferencia recibida CBU 321;;5.000,00;5.000,00", "20/09/2026;Acreditación ventas;;2.000,00;7.000,00"]),
  ]);
  const valores = [valor(r1), valor(r2)];
  for (const v of valores) assert.ok(v.ok, JSON.stringify(v));

  const del15 = await duenio.movimientoImportado.findMany({
    where: { tenantId: neg.id, fecha: "20260915" },
    select: { estadoPropuesta: true },
  });
  assert.deepEqual(del15.map((f) => f.estadoPropuesta).sort(), ["auto", "revision"], "ninguno se traga al otro");

  // El resumen de cada subida sale de lo que de verdad quedó guardado.
  for (const v of valores) {
    if (!v.ok) continue;
    const filas = await duenio.movimientoImportado.findMany({
      where: { tenantId: neg.id, importacionId: v.importacionId },
      select: { estadoPropuesta: true },
    });
    assert.equal(v.resumen.importados, filas.length, JSON.stringify(v.resumen));
    assert.equal(v.resumen.autos, filas.filter((f) => f.estadoPropuesta === "auto").length);
    assert.equal(v.resumen.aRevisar, filas.filter((f) => f.estadoPropuesta === "revision").length);
  }
});
