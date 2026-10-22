/**
 * «Cerrar el día», la Semana y el Inicio de la dueña (reingeniería CH, Tanda 3 · 3-C), EJECUTADOS contra
 * Postgres con RLS (`app_rls`), con las Server Actions y los loaders reales y la sesión de cada rol:
 *
 *   · CH-038 · se cobra un turno de hoy $120.000 en efectivo; el cierre con $118.000 SIN «Qué pasó» se
 *     rechaza; con la nota, cierra y asienta la diferencia (EGRESO $2.000 en efectivo, marca del cierre)
 *     y deja el comprobante (auditoría) con la diferencia y la nota;
 *   · CH-038 · el día cerrado RECHAZA un cobro posterior con esa fecha (y no cobra nada) y un segundo cierre;
 *   · paso 3 · el comprobante por medio, los turnos atendidos y el WhatsApp «Efectivo $118.000 (−$2.000)»;
 *   · CH-032 · sin M1 en la base: `tarjetaEnLaBase` = false → la tarjeta va como Mercado Pago (D6);
 *   · CH-037/056/067 · novedades: la dueña ve el cierre con faltante y la anulación de la recepción con su
 *     nombre; la recepción no las ve (null); nada del otro negocio;
 *   · CH-037 · la caja de hoy neta ($118.000) sólo para la dueña; las señas sin cobrar de mañana, sólo las suyas;
 *   · CH-066 · el loader de la semana sólo trae profesionales, turnos, ausencias y horarios del negocio.
 *
 * Sin Postgres local se saltea diciendo por qué (en CI falla), como los demás `*-postgres.test.ts`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();
const MIN = 60_000;
const HORA = 60 * MIN;

type Negocio = { profesional: string; servicio: string; box: string; turno: (o: { inicio: Date; precio: number; status?: "PENDING" | "CONFIRMED" | "COMPLETED"; clienta: string }) => Promise<string> };
type Sembrado = { base: BaseEfimera; a: Negocio; b: Negocio; hoy: string };
let sembrado: Sembrado | null = null;

async function preparar(t: import("node:test").TestContext): Promise<Sembrado | null> {
  if (sembrado) return sembrado;
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: "2", DB_CONNECT_TIMEOUT_MS: "3000" });
  const duenio = await prismaComoDuenio(base);
  const { todayInBusinessTz } = await import("@/lib/datetime");
  let n = 0;
  const negocio = async (tenantId: string): Promise<Negocio> => {
    const box = await duenio.box.create({ data: { tenantId, name: "Box 1" } });
    const servicio = await duenio.service.create({ data: { tenantId, name: "Piernas completas", durationMin: 30, price: 120000, depositAmount: 5000 } });
    const prof = await duenio.professional.create({ data: { tenantId, name: "Caro", boxId: box.id, services: { connect: [{ id: servicio.id }] } } });
    for (const d of [0, 1, 2, 3, 4, 5, 6]) {
      await duenio.workingHours.create({ data: { tenantId, professionalId: prof.id, dayOfWeek: d, startTime: "00:00", endTime: "23:59" } });
    }
    return {
      profesional: prof.id,
      servicio: servicio.id,
      box: box.id,
      turno: async (o) => {
        const client = await duenio.client.create({ data: { tenantId, name: o.clienta, phone: `11500030${String(n++).padStart(2, "0")}` } });
        const a = await duenio.appointment.create({
          data: {
            tenantId,
            clientId: client.id,
            professionalId: prof.id,
            serviceId: servicio.id,
            boxId: box.id,
            startsAt: o.inicio,
            endsAt: new Date(o.inicio.getTime() + 30 * MIN),
            status: o.status ?? "CONFIRMED",
            priceAtBooking: o.precio,
          },
        });
        return a.id;
      },
    };
  };
  sembrado = { base, a: await negocio(base.a.id), b: await negocio(base.b.id), hoy: todayInBusinessTz() };
  return sembrado;
}

function fd(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

async function como<R>(s: Sembrado, quien: "duenia" | "recepcion", fn: () => Promise<R>, negocio: "a" | "b" = "a"): Promise<R> {
  const n = s.base[negocio];
  const r = await ejecutarAccion({ negocio: n, usuario: n[quien] }, fn);
  assert.equal(r.tipo, "respuesta", `no respondió (¿redirigió o tiró?): ${JSON.stringify(r)}`);
  if (r.tipo !== "respuesta") throw new Error("sin respuesta");
  return r.valor;
}

/** Un instante de HOY que ya pasó (hace 10 minutos, o un minuto después de la medianoche). */
async function hoyYaPasado(): Promise<Date> {
  const { businessWallTimeToUtc, todayInBusinessTz } = await import("@/lib/datetime");
  const medianoche = businessWallTimeToUtc(todayInBusinessTz(), "00:00").getTime();
  return new Date(Math.max(Date.now() - 10 * MIN, medianoche + MIN));
}

test("CH-038 · cierre con diferencia: sin «Qué pasó» no cierra; con la nota asienta el faltante; después el día rechaza cobros", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const duenio = await prismaComoDuenio(s.base);
  const { terminarYCobrarDividido } = await import("@/lib/turnos/cobro-actions");
  const { cerrarTurnosEnLote } = await import("@/lib/turnos/cierre-lote-actions");
  const { formDataDelLote } = await import("@/lib/turnos/cierre-lote");
  const { cerrarDia, getCierreDiarioData } = await import("@/lib/cierre-diario-actions");
  const { cierreMarker } = await import("@/lib/caja/cierre-marca");

  // Un turno de hoy, $120.000 en efectivo (la acción de siempre).
  const t1 = await s.a.turno({ inicio: await hoyYaPasado(), precio: 120000, clienta: "Laura Gómez" });
  // «✓ Vino → Efectivo» de la bandeja (paso 1 del cierre): la acción de siempre.
  const cobro = await como(s, "recepcion", () => cerrarTurnosEnLote(formDataDelLote([{ id: t1, accion: "vino", method: "EFECTIVO" }])));
  assert.deepEqual(cobro.resultados, [{ id: t1, ok: true }]);
  const antes = await como(s, "recepcion", () => getCierreDiarioData(s.hoy));
  assert.equal(antes.preview.porMedio.EFECTIVO.expected, 120000);
  assert.equal(antes.yaCerrado, false);

  // $118.000 contados y sin «Qué pasó»: no cierra.
  const sinNota = await como(s, "recepcion", () => cerrarDia(fd({ day: s.hoy, declarado_EFECTIVO: "118.000" })));
  assert.equal(sinNota?.ok, false);
  assert.match(sinNota && !sinNota.ok ? sinNota.errors.join(" ") : "", /Anotá por qué/);
  assert.equal(await duenio.auditLog.count({ where: { tenantId: s.base.a.id, entity: "CierreDiario" } }), 0);

  // Con la nota: cierra, asienta el faltante en el libro y deja el comprobante.
  const ok = await como(s, "recepcion", () => cerrarDia(fd({ day: s.hoy, declarado_EFECTIVO: "118.000", note: "faltó cambio" })));
  assert.equal(ok?.ok, true, JSON.stringify(ok));
  const ajustes = await duenio.cashMovement.findMany({ where: { tenantId: s.base.a.id, createdBy: cierreMarker(s.hoy) }, select: { type: true, method: true, amount: true } });
  assert.deepEqual(ajustes, [{ type: "EGRESO", method: "EFECTIVO", amount: 2000 }]);
  const comprobante = await duenio.auditLog.findFirstOrThrow({ where: { tenantId: s.base.a.id, entity: "CierreDiario", entityId: s.hoy }, select: { changes: true, actor: true } });
  const changes = comprobante.changes as { note: string; porMedio: { EFECTIVO: { esperado: number; declarado: number; diferencia: number } } };
  assert.equal(changes.note, "faltó cambio");
  assert.deepEqual(changes.porMedio.EFECTIVO, { esperado: 120000, declarado: 118000, diferencia: -2000 });
  assert.equal(comprobante.actor, `user:${s.base.a.recepcion.id}`);

  // El día cerrado rechaza un cobro con esa fecha, y no cobra nada.
  const t2 = await s.a.turno({ inicio: await hoyYaPasado(), precio: 9000, clienta: "Martina Ruiz" });
  const tarde = await como(s, "recepcion", () =>
    terminarYCobrarDividido(fd({ appointmentId: t2, pagos: JSON.stringify([{ metodo: "EFECTIVO", monto: 5000 }, { metodo: "MERCADOPAGO", monto: 4000 }]), vino: "on" })),
  );
  assert.equal(tarde.ok, false);
  assert.match(tarde.ok ? "" : tarde.error, /ya está cerrada/);
  const enLote = await como(s, "recepcion", () => cerrarTurnosEnLote(formDataDelLote([{ id: t2, accion: "vino", method: "EFECTIVO" }])));
  assert.equal(enLote.resultados[0]?.ok, false, "la bandeja tampoco cobra con el día cerrado");
  assert.equal(await duenio.collection.count({ where: { appointmentId: t2 } }), 0);
  assert.equal((await duenio.appointment.findUniqueOrThrow({ where: { id: t2 }, select: { status: true } })).status, "CONFIRMED");
  // Y no se cierra dos veces.
  const otraVez = await como(s, "recepcion", () => cerrarDia(fd({ day: s.hoy, declarado_EFECTIVO: "118.000", note: "x" })));
  assert.equal(otraVez?.ok, false);
  assert.equal(await duenio.cashMovement.count({ where: { tenantId: s.base.a.id, createdBy: cierreMarker(s.hoy) } }), 1);
  // Nada en el otro negocio.
  assert.equal(await duenio.cashMovement.count({ where: { tenantId: s.base.b.id } }), 0);
  assert.equal(await duenio.auditLog.count({ where: { tenantId: s.base.b.id, entity: "CierreDiario" } }), 0);
});

test("paso 3 · el comprobante por medio, los turnos atendidos y el WhatsApp; CH-032 sin M1 la tarjeta va como MP", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { leerMediosDelComprobante } = await import("./comprobante.server");
  const { tarjetaEnLaBase, turnosAtendidosDelDia } = await import("./cerrar-el-dia.server");
  const { mensajeDelCierre, modoTarjeta } = await import("./cerrar-el-dia-core");
  const { cashMethodFromPaymentMethod } = await import("@/lib/caja/cierre-diario");
  const [medios, turnos, enumConTarjeta] = await como(s, "duenia", () =>
    Promise.all([leerMediosDelComprobante(s.hoy), turnosAtendidosDelDia(s.hoy), tarjetaEnLaBase()]),
  );
  assert.deepEqual(
    medios?.find((m) => m.medio === "EFECTIVO"),
    { medio: "EFECTIVO", esperado: 120000, declarado: 118000, diferencia: -2000 },
  );
  assert.equal(turnos, 1, "Laura, la única terminada hoy");
  assert.equal(enumConTarjeta, false, "la base de prueba no tiene M1");
  assert.equal(modoTarjeta({ mapea: cashMethodFromPaymentMethod, enumTieneTarjeta: enumConTarjeta }), "como-mp");
  const m = mensajeDelCierre({ day: s.hoy, medios, turnos, nota: "faltó cambio", quien: "Recepcion A" });
  assert.match(m, /^Cierre \S+ \d+: Efectivo \$118\.000 \(−\$2\.000\) · 1 turno\. Qué pasó: faltó cambio\. Cerró Recepcion A\.$/);
});

test("CH-037/056/067 · novedades de la caja: la dueña las ve con nombres; la recepción no; nada del otro negocio", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const duenio = await prismaComoDuenio(s.base);
  const { leerNovedadesDeLaCaja } = await import("@/lib/auditoria/novedades.server");
  // Una anulación de la recepción en A y otra en B (como las deja `anularCobroTurno`).
  await duenio.auditLog.create({
    data: { tenantId: s.base.a.id, actor: `user:${s.base.a.recepcion.id}`, action: "void_collection", entity: "Appointment", entityId: "t-x", channel: "admin", changes: { monto: 8000, motivo: "cobré con el medio equivocado" } },
  });
  await duenio.auditLog.create({
    data: { tenantId: s.base.b.id, actor: `user:${s.base.b.recepcion.id}`, action: "void_collection", entity: "Appointment", entityId: "t-y", channel: "admin", changes: { monto: 999, motivo: "de B" } },
  });
  const deLaDuenia = await como(s, "duenia", () => leerNovedadesDeLaCaja());
  assert.ok(deLaDuenia);
  const textos = deLaDuenia.map((x) => `${x.texto}${x.motivo ? ` — ${x.motivo}` : ""}`);
  assert.ok(textos.includes("Recepcion A anuló un cobro de $8.000 — cobré con el medio equivocado"), textos.join(" | "));
  assert.ok(textos.some((x) => /^Recepcion A cerró el \d\d\/\d\d con un faltante de \$2\.000 — faltó cambio$/.test(x)), textos.join(" | "));
  assert.ok(!textos.some((x) => /999|de B|Recepcion B/.test(x)), "nada del otro negocio");
  assert.equal(await como(s, "recepcion", () => leerNovedadesDeLaCaja()), null, "la recepción no ve las novedades");
  const deB = await como(s, "duenia", () => leerNovedadesDeLaCaja(), "b");
  assert.deepEqual(deB?.map((x) => x.monto), [999]);
});

test("CH-037 · caja de hoy (sólo la dueña) y señas sin cobrar (sólo las suyas)", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { cajaDeHoy, seniasSinCobrar } = await import("../../inicio/duena-bandeja.server");
  assert.equal(await como(s, "duenia", () => cajaDeHoy()), 118000, "VENTA 120.000 − ajuste 2.000");
  assert.equal(await como(s, "recepcion", () => cajaDeHoy()), null);
  const manana = new Date(Date.now() + 20 * HORA);
  const conSenia = await s.a.turno({ inicio: manana, precio: 14000, status: "PENDING", clienta: "Sofía Pérez" });
  await s.b.turno({ inicio: manana, precio: 14000, status: "PENDING", clienta: "Otra de B" });
  const senias = await como(s, "recepcion", () => seniasSinCobrar());
  assert.deepEqual(
    senias.map((x) => [x.turnoId, x.clienta, x.monto]),
    [[conSenia, "Sofía Pérez", 5000]],
  );
});

test("CH-066 · la semana sólo trae lo del negocio, con los turnos de los 7 días en una lectura", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const duenio = await prismaComoDuenio(s.base);
  const { agendaDelRango } = await import("@/lib/turnos/agenda-rango.server");
  const { lunesDe, armarSemana } = await import("@/app/admin/(dashboard)/turnos/_agenda/semana-core");
  const lunes = lunesDe(s.hoy);
  await duenio.professionalBlock.create({ data: { tenantId: s.base.b.id, professionalId: s.b.profesional, startsAt: new Date(), endsAt: new Date(Date.now() + HORA), reason: "médico de B" } });
  const agenda = await como(s, "recepcion", () => agendaDelRango(lunes));
  assert.deepEqual(agenda.profesionales.map((p) => p.id), [s.a.profesional]);
  const deA = await duenio.appointment.findMany({ where: { tenantId: s.base.a.id, status: { not: "CANCELLED" } }, select: { id: true, startsAt: true } });
  const fin = new Date(new Date(`${lunes}T03:00:00.000Z`).getTime() + 7 * 24 * HORA);
  const esperados = deA.filter((x) => x.startsAt >= new Date(`${lunes}T03:00:00.000Z`) && x.startsAt < fin).map((x) => x.id).sort();
  assert.deepEqual(agenda.turnos.map((x) => x.id).sort(), esperados);
  assert.ok(agenda.turnos.every((x) => x.profesionalId === s.a.profesional));
  assert.equal(agenda.ausencias.length, 0, "el médico de B no aparece");
  assert.ok(agenda.horarios && agenda.horarios.length === 7 && agenda.horarios.every((h) => h.profesionalId === s.a.profesional));
  // Y la cuenta se arma sin romper con lo leído.
  const semana = armarSemana(agenda, { hoy: s.hoy, ahoraMin: 0, puedeDarTurno: true, ahora: new Date() });
  assert.equal(semana.filas.length, 1);
});

test("CH-031 · CON la migración M1 (sólo en esta base efímera): la base trae la tarjeta y, con el código de 3-A, va en su columna", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const duenio = await prismaComoDuenio(s.base);
  // M1 de 3-A, aplicada acá a mano (Gate 2: nunca en Neon). `ADD VALUE` no corre dentro de una transacción.
  await duenio.$executeRawUnsafe(`ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'DEBITO'`);
  await duenio.$executeRawUnsafe(`ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'CREDITO'`);
  const { tarjetaEnLaBase } = await import("./cerrar-el-dia.server");
  const { modoTarjeta } = await import("./cerrar-el-dia-core");
  const { cashMethodFromPaymentMethod } = await import("@/lib/caja/cierre-diario");
  const conTarjeta = await como(s, "duenia", () => tarjetaEnLaBase());
  assert.equal(conTarjeta, true);
  // Con el código de hoy (sin el cambio de 3-A) sigue D6; con la traducción DEBITO/CREDITO → TARJETA, separada.
  assert.equal(modoTarjeta({ mapea: cashMethodFromPaymentMethod, enumTieneTarjeta: conTarjeta }), cashMethodFromPaymentMethod("DEBITO") === "TARJETA" ? "separada" : "como-mp");
  const conM1 = (m: string) => (m === "DEBITO" || m === "CREDITO" ? ("TARJETA" as const) : cashMethodFromPaymentMethod(m));
  assert.equal(modoTarjeta({ mapea: conM1, enumTieneTarjeta: conTarjeta }), "separada");
});
