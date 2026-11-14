/**
 * #T7 · El aviso de la seña por Mercado Pago, EN CARRERA, contra Postgres con RLS (`app_rls`).
 *
 * MP reenvía el mismo aviso varias veces y a veces a la vez (dos lambdas del webhook). Cuando la
 * seña falla, `avisarSeniaMPFallida` deja una fila en la agenda para que una persona la resuelva.
 * Antes: «una sola fila por pago» era leer-y-después-escribir sin candado (en READ COMMITTED las
 * dos transacciones leen «no hay» y las dos escriben), y el pago aprobado que no se pudo asentar
 * ni siquiera miraba: cada reintento sumaba otra fila. Ahora el árbitro es la base: un candado
 * transaccional por (negocio, turno, acción, pago) antes de mirar.
 *
 * Para que la carrera sea determinista, cada transacción espera a la otra DESPUÉS de mirar (con
 * un tope: con el candado la segunda no llega a mirar hasta que la primera termina).
 *
 * Sin Postgres local se saltea diciendo por qué (en CI falla), como los demás `*-postgres.test.ts`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";
import type { PagoMP } from "@/plugins/mercadopago";

const laBase = baseEfimeraDelArchivo();

type Preparado = { base: BaseEfimera; turno: () => Promise<string> };
let preparado: Preparado | null = null;

async function preparar(t: import("node:test").TestContext): Promise<Preparado | null> {
  if (preparado) return preparado;
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: "4", DB_CONNECT_TIMEOUT_MS: "3000" });
  const duenio = await prismaComoDuenio(base);
  const tenantId = base.a.id;
  const box = await duenio.box.create({ data: { tenantId, name: "Box 1" } });
  const servicio = await duenio.service.create({ data: { tenantId, name: "Piernas", durationMin: 30, price: 18000, depositAmount: 5000 } });
  const pro = await duenio.professional.create({ data: { tenantId, name: "Caro", boxId: box.id } });
  let n = 0;
  const turno = async () => {
    n += 1;
    const cliente = await duenio.client.create({ data: { tenantId, name: `Clienta ${n}`, phone: `11700${String(n).padStart(5, "0")}` } });
    const startsAt = new Date(Date.now() + (24 + n * 24) * 3_600_000);
    const a = await duenio.appointment.create({
      data: { tenantId, clientId: cliente.id, professionalId: pro.id, serviceId: servicio.id, boxId: box.id, startsAt, endsAt: new Date(startsAt.getTime() + 1_800_000), status: "PENDING", priceAtBooking: 18000 },
    });
    return a.id;
  };
  preparado = { base, turno };
  return preparado;
}

/** Una transacción real del negocio cuyo `auditLog.findFirst` espera a la otra antes de seguir. */
async function transaccionConCita() {
  const { tenantTransaction } = await import("@/lib/rls");
  let llegaron = 0;
  let soltar: () => void = () => {};
  const cita = new Promise<void>((r) => (soltar = r));
  const esperarALaOtra = async () => {
    llegaron += 1;
    if (llegaron >= 2) soltar();
    await Promise.race([cita, new Promise((r) => setTimeout(r, 1500))]);
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <T,>(fn: (tx: any) => Promise<T>, opts: { tenantId: string }) =>
    tenantTransaction(
      (tx) =>
        fn(
          new Proxy(tx, {
            get(obj, k) {
              if (k !== "auditLog") return Reflect.get(obj, k);
              const al = Reflect.get(obj, k) as { findFirst: (a: unknown) => Promise<unknown> };
              return new Proxy(al, {
                get(o2, k2) {
                  if (k2 !== "findFirst") return Reflect.get(o2, k2);
                  return async (a: unknown) => {
                    const r = await o2.findFirst(a);
                    await esperarALaOtra();
                    return r;
                  };
                },
              });
            },
          }),
        ),
      opts,
    );
}

const pagoMP = (id: string, estado: PagoMP["estado"]): PagoMP =>
  ({ id, estado, monto: 5000, montoDevuelto: estado === "refunded" ? 5000 : 0, externalReference: null }) as unknown as PagoMP;

async function filas(base: BaseEfimera, entityId: string, action: string): Promise<number> {
  const duenio = await prismaComoDuenio(base);
  return duenio.auditLog.count({ where: { tenantId: base.a.id, entity: "Appointment", entityId, action } });
}

test("carrera: dos avisos a la vez de la MISMA seña devuelta sin anular → UNA sola fila en la agenda", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { avisarSeniaMPFallida } = await import("./senia-mp.server");
  const turnoId = await p.turno();
  const transaccion = await transaccionConCita();
  const deps = { transaccion, reglaPrendidaEnTx: async () => true };
  const pago = pagoMP("mp-dev-1", "refunded");
  await Promise.all([
    avisarSeniaMPFallida(turnoId, p.base.a.id, pago, new Error("40001 agotado"), deps),
    avisarSeniaMPFallida(turnoId, p.base.a.id, pago, new Error("40001 agotado"), deps),
  ]);
  assert.equal(await filas(p.base, turnoId, "senia_mp_devuelta_sin_anular"), 1);
});

test("carrera: dos avisos a la vez de la MISMA seña aprobada que no se pudo asentar → UNA sola fila", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { avisarSeniaMPFallida } = await import("./senia-mp.server");
  const turnoId = await p.turno();
  const transaccion = await transaccionConCita();
  const deps = { transaccion, reglaPrendidaEnTx: async () => true };
  const pago = pagoMP("mp-ok-1", "approved");
  await Promise.all([
    avisarSeniaMPFallida(turnoId, p.base.a.id, pago, new Error("caja"), deps),
    avisarSeniaMPFallida(turnoId, p.base.a.id, pago, new Error("caja"), deps),
  ]);
  // Y el reintento de MP, ya sin carrera, tampoco suma.
  await avisarSeniaMPFallida(turnoId, p.base.a.id, pago, new Error("caja"), deps);
  assert.equal(await filas(p.base, turnoId, "senia_mp_no_registrada"), 1);
});

test("otro pago del mismo turno sí deja su propia fila (el candado es por pago, no por turno)", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { avisarSeniaMPFallida } = await import("./senia-mp.server");
  const turnoId = await p.turno();
  const transaccion = await transaccionConCita();
  const deps = { transaccion, reglaPrendidaEnTx: async () => true };
  await Promise.all([
    avisarSeniaMPFallida(turnoId, p.base.a.id, pagoMP("mp-a", "approved"), new Error("caja"), deps),
    avisarSeniaMPFallida(turnoId, p.base.a.id, pagoMP("mp-b", "approved"), new Error("caja"), deps),
  ]);
  assert.equal(await filas(p.base, turnoId, "senia_mp_no_registrada"), 2);
});
