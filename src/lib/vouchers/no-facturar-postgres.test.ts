/**
 * La plata de vouchers NO se factura (decisión del dueño), EJECUTADO contra Postgres con RLS (base
 * efímera local; el enum VOUCHER de prisma/pending-gate2/CH_voucher_enum.sql aplicado SÓLO acá):
 *
 *   · un pago de la administración a Mercado Pago pendiente de acreditación + su movimiento de MP
 *     «auto» en la ventana: `emitirPropuestas` NO lo factura; lo pasa a «revision» con un motivo
 *     que no es la marca del enganche, y la acreditación lo engancha después igual;
 *   · un movimiento «auto» que no coincide con ningún pago pendiente se sigue emitiendo;
 *   · un pago acreditado con su movimiento enganchado (o en efectivo) no frena la emisión de otro
 *     movimiento del mismo monto; acreditado A MANO (sin movimiento, cheques incluidos) sí frena, con
 *     la ventana de 10 días desde la confirmación (ATQ-B, ATQ-C);
 *   · un re-aviso de MP respeta la venta que una persona ya confirmó (ATQ-A);
 *   · carrera: el pago se registra mientras se emite → o facturado (y sin enganche posible) o en
 *     revisión (y enganchable), nunca facturado y enganchado a la vez; el candado de la acreditación
 *     (`candadoDeAcreditacion`) los pone en fila: el claim espera al registro y viceversa;
 *   · una venta del mismo monto que aprueba una persona queda confirmada: se factura y la acreditación
 *     no la engancha (va a mano);
 *   · un cheque pendiente no frena la emisión (entra a MP cuando se confirma el depósito); una
 *     transferencia, sólo dentro de su ventana de 10 días;
 *   · el aviso / la sincronización de Mercado Pago: un pago que coincide va a revisión, no a ARCA.
 *
 * Sin Postgres local se saltea diciendo por qué (en CI falla), como los demás `*-postgres.test.ts`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();
let lista: BaseEfimera | null = null;
let n = 0;

async function preparar(t: import("node:test").TestContext): Promise<BaseEfimera | null> {
  if (lista) return lista;
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const env = process.env as Record<string, string | undefined>;
  Object.assign(env, { DB_CONNECTION_LIMIT: "6", DB_CONNECT_TIMEOUT_MS: "3000", ARCA_INVOICING_ENABLED: "true" });
  delete env.ARCA_MODO; // stub: nada sale a la red
  const duenio = await prismaComoDuenio(base);
  const sql = readFileSync(path.join(process.cwd(), "prisma/pending-gate2/CH_voucher_enum.sql"), "utf8");
  for (const paso of sql.split("\n").filter((l) => /^ALTER TYPE/.test(l.trim()))) await duenio.$executeRawUnsafe(paso);
  const { olvidarSchemaProbe } = await import("@/lib/schema-probe");
  olvidarSchemaProbe();
  for (const id of [base.a.id, base.b.id]) {
    const tenant = await duenio.tenant.findUniqueOrThrow({ where: { id }, select: { modules: true } });
    await duenio.tenant.update({
      where: { id },
      data: { arcaCuit: "20111111112", arcaPuntoVenta: 1, arcaHomologacion: true, modules: [...new Set([...tenant.modules, "arca"])] },
    });
  }
  lista = base;
  return base;
}

const hoyDelNegocio = async () => (await import("@/lib/datetime")).todayInBusinessTz();
const clave = (p: string) => `${p}-nf-${String(n++).padStart(4, "0")}-1111-2222-3333`;

/** Un crédito de MP en el extracto (pipeline de mercadopago-auto.ts), «auto» = listo para facturar solo. */
async function movimientoMp(base: BaseEfimera, tenantId: string, monto: number, fecha: string, origen: "mercadopago" | "banco" = "mercadopago") {
  const d = await prismaComoDuenio(base);
  const imp = await d.importacionBancaria.create({
    data: { tenantId, nombreArchivo: `nf-${n++}`, origen, archivo: Buffer.from(""), mapeoJson: {} },
  });
  return (
    await d.movimientoImportado.create({
      data: {
        tenantId,
        importacionId: imp.id,
        hash: `nf:${n++}`,
        fecha: fecha.replace(/-/g, ""),
        monto,
        descripcion: "Transferencia de Adm. La Alameda",
        clasificacion: "venta",
        estadoPropuesta: "auto",
      },
    })
  ).id;
}

async function emitir(tenantId: string) {
  const { emitirPropuestas } = await import("@/lib/bancos-glue");
  return emitirPropuestas(tenantId, "auto");
}

test("un pago de la administración pendiente en MP: su movimiento «auto» NO se factura; queda en revisión y se engancha después", async (t) => {
  const base = await preparar(t);
  if (!base) return;
  const A = base.a.id;
  const d = await prismaComoDuenio(base);
  const { registrarPagoACuenta, confirmarAcreditacionMp } = await import("./liquidacion-repo");
  const { MARCA_ENGANCHE } = await import("./acreditacion-core");
  const hoy = await hoyDelNegocio();
  const pago = await registrarPagoACuenta(A, { clave: clave("pend"), monto: 6543.21, fecha: hoy, medio: "TRANSFERENCIA", actor: "user:test" });
  const mov = await movimientoMp(base, A, 6543.21, hoy);

  await emitir(A);

  const m = await d.movimientoImportado.findFirstOrThrow({ where: { id: mov } });
  assert.equal(m.invoiceId, null, "la plata de vouchers no se factura");
  assert.equal(m.estadoPropuesta, "revision");
  assert.match(m.motivoRevision ?? "", /Vouchers/);
  assert.ok(!(m.motivoRevision ?? "").includes(MARCA_ENGANCHE), "el motivo no es la marca del enganche");
  assert.equal(await d.invoice.count({ where: { tenantId: A, total: 6543.21 } }), 0);

  // La acreditación lo engancha igual (revision es enganchable) y lo pasa a no_facturable.
  const c = await confirmarAcreditacionMp(A, { pagoId: pago.pagoId, actor: "user:test" });
  assert.deepEqual([c.via, c.movimientoId], ["mp", mov]);
  assert.equal((await d.movimientoImportado.findFirstOrThrow({ where: { id: mov } })).estadoPropuesta, "no_facturable");
});

test("regresión: un movimiento «auto» que no coincide con ningún pago pendiente se sigue emitiendo", async (t) => {
  const base = await preparar(t);
  if (!base) return;
  const A = base.a.id;
  const d = await prismaComoDuenio(base);
  const { registrarPagoACuenta, confirmarAcreditacionMp } = await import("./liquidacion-repo");
  const hoy = await hoyDelNegocio();
  // Otro monto: no coincide.
  await registrarPagoACuenta(A, { clave: clave("otro"), monto: 1000.01, fecha: hoy, medio: "TRANSFERENCIA", actor: "user:test" });
  const venta = await movimientoMp(base, A, 1000.02, hoy);
  // Mismo monto que un pago en EFECTIVO (no espera acreditación): es una venta.
  await registrarPagoACuenta(A, { clave: clave("efec"), monto: 2000.02, fecha: hoy, medio: "EFECTIVO", actor: "user:test" });
  const venta2 = await movimientoMp(base, A, 2000.02, hoy);
  // Mismo monto que un pago YA acreditado con su movimiento enganchado: ya no frena (acreditado a
  // mano, sin movimiento, sí frena: ver ATQ-B).
  const acreditado = await registrarPagoACuenta(A, { clave: clave("acre"), monto: 3000.03, fecha: hoy, medio: "TRANSFERENCIA", actor: "user:test" });
  const suMovimiento = await movimientoMp(base, A, 3000.03, hoy);
  const c3 = await confirmarAcreditacionMp(A, { pagoId: acreditado.pagoId, movimientoId: suMovimiento, actor: "user:test" });
  assert.deepEqual([c3.via, c3.movimientoId], ["mp", suMovimiento]);
  const venta3 = await movimientoMp(base, A, 3000.03, hoy);
  // Mismo monto, pero el pago es de OTRO negocio.
  await registrarPagoACuenta(base.b.id, { clave: clave("negb"), monto: 4000.04, fecha: hoy, medio: "TRANSFERENCIA", actor: "user:test" });
  const venta4 = await movimientoMp(base, A, 4000.04, hoy);
  // Un crédito del banco (no de MP): la acreditación sólo engancha movimientos de MP.
  await registrarPagoACuenta(A, { clave: clave("banc"), monto: 5000.05, fecha: hoy, medio: "TRANSFERENCIA", actor: "user:test" });
  const venta5 = await movimientoMp(base, A, 5000.05, hoy, "banco");

  await emitir(A);

  for (const id of [venta, venta2, venta3, venta4, venta5]) {
    const m = await d.movimientoImportado.findFirstOrThrow({ where: { id } });
    assert.equal(m.estadoPropuesta, "emitida", `${m.monto} tenía que emitirse`);
    assert.ok(m.invoiceId, `${m.monto} sin factura`);
  }
});

test("carrera: el pago se registra mientras se emite → facturado o en revisión, nunca facturado y enganchado", async (t) => {
  const base = await preparar(t);
  if (!base) return;
  const A = base.a.id;
  const d = await prismaComoDuenio(base);
  const { registrarPagoACuenta, confirmarAcreditacionMp } = await import("./liquidacion-repo");
  const hoy = await hoyDelNegocio();
  const finales = { facturado: 0, revision: 0 };
  // El pago sale cada vuelta un poco más tarde: así cae antes, durante y después del claim.
  const VUELTAS = 10;
  for (let i = 0; i < VUELTAS; i++) {
    const monto = 7100 + i + 0.17;
    const mov = await movimientoMp(base, A, monto, hoy);
    const [pago] = await Promise.all([
      (async () => {
        await new Promise((r) => setTimeout(r, i * 12));
        return registrarPagoACuenta(A, { clave: clave(`carr${i}`), monto, fecha: hoy, medio: "TRANSFERENCIA", actor: "user:test" });
      })(),
      emitir(A),
    ]);
    // Después, la persona confirma la acreditación (y si en el medio se emitió, no lo engancha).
    const c = await confirmarAcreditacionMp(A, { pagoId: pago.pagoId, actor: "user:test" });
    const m = await d.movimientoImportado.findFirstOrThrow({ where: { id: mov } });
    const facturado = m.invoiceId != null || m.estadoPropuesta === "emitida";
    const enganchado = c.movimientoId === mov || m.estadoPropuesta === "no_facturable";
    assert.ok(!(facturado && enganchado), `vuelta ${i}: facturado Y enganchado`);
    assert.ok(facturado || enganchado, `vuelta ${i}: ni facturado ni enganchado (${m.estadoPropuesta})`);
    // En fila por el candado: o el pago se registró antes del claim (no se factura: revisión y
    // enganche) o el claim pasó antes (facturado; no se arregla sin nota de crédito: va a mano).
    if (facturado) {
      assert.ok(m.invoiceId, `vuelta ${i}: emitida sin factura`);
      assert.equal(c.via, "manual", `vuelta ${i}: un movimiento facturado no se engancha`);
      finales.facturado++;
    } else finales.revision++;
  }
  assert.equal(finales.facturado + finales.revision, VUELTAS);
});

test("carrera: la emisión contra la confirmación de la acreditación del mismo movimiento", async (t) => {
  const base = await preparar(t);
  if (!base) return;
  const A = base.a.id;
  const d = await prismaComoDuenio(base);
  const { registrarPagoACuenta, confirmarAcreditacionMp } = await import("./liquidacion-repo");
  const hoy = await hoyDelNegocio();
  for (let i = 0; i < 6; i++) {
    const monto = 8200 + i + 0.29;
    const pago = await registrarPagoACuenta(A, { clave: clave(`conf${i}`), monto, fecha: hoy, medio: "TRANSFERENCIA", actor: "user:test" });
    const mov = await movimientoMp(base, A, monto, hoy);
    const [conf] = await Promise.allSettled([confirmarAcreditacionMp(A, { pagoId: pago.pagoId, movimientoId: mov, actor: "user:test" }), emitir(A)]);
    const m = await d.movimientoImportado.findFirstOrThrow({ where: { id: mov } });
    assert.equal(m.invoiceId, null, `vuelta ${i}: se facturó plata de vouchers`);
    assert.notEqual(m.estadoPropuesta, "emitida", `vuelta ${i}`);
    if (conf.status === "fulfilled") assert.equal(conf.value.movimientoId, mov);
    else assert.match(String(conf.reason), /cambió|modificó/);
  }
});

test("aviso / sincronización de MP: un pago que coincide con uno pendiente va a revisión, no a ARCA", async (t) => {
  const base = await preparar(t);
  if (!base) return;
  const A = base.a.id;
  const { registrarPagoACuenta } = await import("./liquidacion-repo");
  const { clasificadorSinPlataDeVouchers } = await import("@/lib/mercadopago-auto");
  const hoy = await hoyDelNegocio();
  await registrarPagoACuenta(A, { clave: clave("avis"), monto: 9300.31, fecha: hoy, medio: "TRANSFERENCIA", actor: "user:test" });
  const facturable = { clasificar: async () => ({ clasificacion: "FACTURABLE" as const, motivo: "venta" }) };
  const c = clasificadorSinPlataDeVouchers(facturable as never);
  const pago = (id: string, monto: number) => ({ id, estado: "approved", monto, fechaAcreditacion: hoy.replace(/-/g, ""), descripcion: "Transferencia" }) as never;
  const coincide = await c.clasificar(pago("p-1", 9300.31), A);
  assert.equal(coincide.clasificacion, "REVISAR");
  assert.match(coincide.motivo ?? "", /Vouchers/);
  const venta = await c.clasificar(pago("p-2", 9300.32), A);
  assert.equal(venta.clasificacion, "FACTURABLE");
  // Otro negocio no ve el pago de A.
  assert.equal((await c.clasificar(pago("p-3", 9300.31), base.b.id)).clasificacion, "FACTURABLE");
});

const diasAntes = (dia: string, dias: number) => {
  const d = new Date(dia + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
};

test("venta del mismo monto que un pago pendiente: la persona la aprueba, se factura y la acreditación no la engancha", async (t) => {
  const base = await preparar(t);
  if (!base) return;
  const A = base.a.id;
  const d = await prismaComoDuenio(base);
  const { registrarPagoACuenta, confirmarAcreditacionMp } = await import("./liquidacion-repo");
  const { completarRevisionAction } = await import("@/lib/bancos-actions");
  const { MARCA_VENTA_CONFIRMADA } = await import("./acreditacion-core");
  const hoy = await hoyDelNegocio();
  const pago = await registrarPagoACuenta(A, { clave: clave("vent"), monto: 50000, fecha: hoy, medio: "TRANSFERENCIA", actor: "user:test" });
  const venta = await movimientoMp(base, A, 50000, hoy);

  await emitir(A);
  assert.equal((await d.movimientoImportado.findFirstOrThrow({ where: { id: venta } })).estadoPropuesta, "revision");

  // La persona la aprueba como venta (consumidor final), con la acción real de la pantalla.
  const r = await ejecutarAccion({ negocio: base.a, usuario: base.a.duenia }, () => completarRevisionAction(venta, { docTipo: 99, docNro: "" }));
  assert.equal(r.tipo, "respuesta");
  assert.deepEqual(r.tipo === "respuesta" ? r.valor : null, { ok: true });
  let m = await d.movimientoImportado.findFirstOrThrow({ where: { id: venta } });
  assert.equal(m.estadoPropuesta, "auto");
  assert.ok((m.motivoRevision ?? "").includes(MARCA_VENTA_CONFIRMADA), "queda marcada como venta confirmada");

  await emitir(A);
  m = await d.movimientoImportado.findFirstOrThrow({ where: { id: venta } });
  assert.equal(m.estadoPropuesta, "emitida", "una venta confirmada no vuelve a revisión");
  assert.ok(m.invoiceId, "la venta confirmada se factura");

  const c = await confirmarAcreditacionMp(A, { pagoId: pago.pagoId, actor: "user:test" });
  assert.deepEqual([c.via, c.movimientoId], ["manual", null], "la acreditación no engancha la venta");
  assert.equal((await d.movimientoImportado.findFirstOrThrow({ where: { id: venta } })).estadoPropuesta, "emitida");
});

test("venta confirmada todavía sin emitir: la acreditación tampoco la engancha", async (t) => {
  const base = await preparar(t);
  if (!base) return;
  const A = base.a.id;
  const d = await prismaComoDuenio(base);
  const { registrarPagoACuenta, confirmarAcreditacionMp } = await import("./liquidacion-repo");
  const { completarRevisionAction } = await import("@/lib/bancos-actions");
  const hoy = await hoyDelNegocio();
  const pago = await registrarPagoACuenta(A, { clave: clave("vsin"), monto: 51000.51, fecha: hoy, medio: "TRANSFERENCIA", actor: "user:test" });
  const venta = await movimientoMp(base, A, 51000.51, hoy);
  await emitir(A);
  await ejecutarAccion({ negocio: base.a, usuario: base.a.duenia }, () => completarRevisionAction(venta, { docTipo: 99, docNro: "" }));
  const c = await confirmarAcreditacionMp(A, { pagoId: pago.pagoId, actor: "user:test" });
  assert.deepEqual([c.via, c.movimientoId], ["manual", null]);
  assert.equal((await d.movimientoImportado.findFirstOrThrow({ where: { id: venta } })).estadoPropuesta, "auto");
});

test("un cheque pendiente no frena la emisión; una transferencia, sólo dentro de sus 10 días", async (t) => {
  const base = await preparar(t);
  if (!base) return;
  const A = base.a.id;
  const d = await prismaComoDuenio(base);
  const { registrarPagoACuenta } = await import("./liquidacion-repo");
  const hoy = await hoyDelNegocio();
  // Cheque recibido hace 40 días, sin depositar: entra a MP sólo cuando una persona confirma el depósito.
  await registrarPagoACuenta(A, { clave: clave("ch40"), monto: 30000, fecha: diasAntes(hoy, 40), medio: "CHEQUE", actor: "user:test" });
  const venta1 = await movimientoMp(base, A, 30000, hoy);
  // Cheque de hoy: tampoco.
  await registrarPagoACuenta(A, { clave: clave("ch00"), monto: 30001.01, fecha: hoy, medio: "CHEQUE", actor: "user:test" });
  const venta2 = await movimientoMp(base, A, 30001.01, hoy);
  // Transferencia de hace 11 días: fuera de su ventana.
  await registrarPagoACuenta(A, { clave: clave("tr11"), monto: 30002.02, fecha: diasAntes(hoy, 11), medio: "TRANSFERENCIA", actor: "user:test" });
  const venta3 = await movimientoMp(base, A, 30002.02, hoy);
  // Transferencia de hace 10 días: dentro, no se factura.
  await registrarPagoACuenta(A, { clave: clave("tr10"), monto: 30003.03, fecha: diasAntes(hoy, 10), medio: "TRANSFERENCIA", actor: "user:test" });
  const vouchers = await movimientoMp(base, A, 30003.03, hoy);

  await emitir(A);

  for (const id of [venta1, venta2, venta3]) {
    const m = await d.movimientoImportado.findFirstOrThrow({ where: { id } });
    assert.equal(m.estadoPropuesta, "emitida", `${m.monto} tenía que emitirse`);
    assert.ok(m.invoiceId, `${m.monto} sin factura`);
  }
  const m = await d.movimientoImportado.findFirstOrThrow({ where: { id: vouchers } });
  assert.deepEqual([m.estadoPropuesta, m.invoiceId], ["revision", null]);
});

test("serialización: el claim de la emisión y el registro de un pago a MP esperan el mismo candado del negocio", async (t) => {
  const base = await preparar(t);
  if (!base) return;
  const A = base.a.id;
  const d = await prismaComoDuenio(base);
  const { registrarPagoACuenta } = await import("./liquidacion-repo");
  const hoy = await hoyDelNegocio();
  const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const candado = (tx: { $executeRaw: typeof d.$executeRaw }) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`vouchers-acreditacion:${A}`}))`;

  // 1) Con el candado tomado, el claim espera; el pago entra antes y el movimiento no se factura.
  const mov = await movimientoMp(base, A, 61000.61, hoy);
  let emision: Promise<unknown> | null = null;
  await d.$transaction(
    async (tx) => {
      await candado(tx);
      emision = emitir(A);
      await espera(400);
      assert.equal((await d.movimientoImportado.findFirstOrThrow({ where: { id: mov } })).estadoPropuesta, "auto", "el claim espera el candado");
      await tx.voucherPagoAdministracion.create({
        data: { tenantId: A, clave: `cuenta:${clave("ser1")}`, fecha: hoy, monto: 61000.61, medio: "TRANSFERENCIA", creadoPor: "user:test" },
      });
    },
    { timeout: 20_000 },
  );
  await emision;
  const m = await d.movimientoImportado.findFirstOrThrow({ where: { id: mov } });
  assert.deepEqual([m.estadoPropuesta, m.invoiceId], ["revision", null], "el pago quedó antes: no se factura");

  // 2) Con el candado tomado, el registro de una transferencia espera; el de un cheque no.
  let listo = false;
  let registro: Promise<unknown> | null = null;
  await d.$transaction(
    async (tx) => {
      await candado(tx);
      registro = registrarPagoACuenta(A, { clave: clave("ser2"), monto: 62000.62, fecha: hoy, medio: "TRANSFERENCIA", actor: "user:test" }).then(() => (listo = true));
      await registrarPagoACuenta(A, { clave: clave("ser3"), monto: 63000.63, fecha: hoy, medio: "CHEQUE", actor: "user:test" });
      await espera(400);
      assert.equal(listo, false, "el registro de un pago a MP espera el candado");
    },
    { timeout: 20_000 },
  );
  await registro;
  assert.equal(listo, true);
});

test("el aviso de MP llega ANTES de registrar el pago: se factura (orden documentado, va a mano al acreditar)", async (t) => {
  const base = await preparar(t);
  if (!base) return;
  const A = base.a.id;
  const { clasificadorSinPlataDeVouchers } = await import("@/lib/mercadopago-auto");
  const { registrarPagoACuenta } = await import("./liquidacion-repo");
  const hoy = await hoyDelNegocio();
  const facturable = { clasificar: async () => ({ clasificacion: "FACTURABLE" as const, motivo: "venta" }) };
  const c = clasificadorSinPlataDeVouchers(facturable as never);
  const r = await c.clasificar({ id: "p-x", estado: "approved", monto: 77777.77, fechaAcreditacion: hoy.replace(/-/g, ""), descripcion: "Transf Adm" } as never, A);
  await registrarPagoACuenta(A, { clave: clave("tarde"), monto: 77777.77, fecha: hoy, medio: "TRANSFERENCIA", actor: "user:test" });
  assert.equal(r.clasificacion, "FACTURABLE");
});

test("el aviso de MP sin fecha de acreditación usa hoy y igual protege", async (t) => {
  const base = await preparar(t);
  if (!base) return;
  const A = base.a.id;
  const { clasificadorSinPlataDeVouchers } = await import("@/lib/mercadopago-auto");
  const { registrarPagoACuenta } = await import("./liquidacion-repo");
  const hoy = await hoyDelNegocio();
  await registrarPagoACuenta(A, { clave: clave("iso"), monto: 1234.56, fecha: hoy, medio: "TRANSFERENCIA", actor: "user:test" });
  const facturable = { clasificar: async () => ({ clasificacion: "FACTURABLE" as const, motivo: "venta" }) };
  const c = clasificadorSinPlataDeVouchers(facturable as never);
  const sinFecha = await c.clasificar({ id: "p-y", estado: "approved", monto: 1234.56 } as never, A);
  assert.equal(sinFecha.clasificacion, "REVISAR");
});

// ── Vuelta 3 de la certificación: ataques ATQ-A/B/C pasados a la suite ──────────────────────────────

const L = () => import("./liquidacion-repo");

/** Arma el pipeline real del aviso de MP con un clasificador base FACTURABLE y facturación de mentira. */
async function pipelineMp(tenantId: string) {
  const { clasificadorSinPlataDeVouchers, ReconciliacionMovimientosMP } = await import("@/lib/mercadopago-auto");
  const { facturarPagoSiCorresponde } = await import("@/plugins/mercadopago");
  const rec = new ReconciliacionMovimientosMP(tenantId);
  const facturadas: string[] = [];
  const deps = {
    tenantId,
    client: {} as never,
    clasificador: clasificadorSinPlataDeVouchers({ clasificar: async () => ({ clasificacion: "FACTURABLE" as const, motivo: "venta" }) } as never),
    reconciliacion: rec,
    facturar: async (pago: { id: string }) => {
      facturadas.push(pago.id);
      return null as unknown as string; // null = transitorio, no persiste: sólo contamos que llegó a facturar
    },
  };
  const procesar = async (pago: unknown) => {
    rec.recordarPago(pago as never);
    const resumen = { leidos: 0, facturados: 0, noFacturables: 0, aRevisar: 0, rechazados: 0, saltados: 0, errores: 0 };
    await facturarPagoSiCorresponde(pago as never, deps as never, resumen as never);
    return resumen;
  };
  return { procesar, facturadas };
}

test("ATQ-A · re-aviso / sincronización de MP después de aprobar la venta: ¿pisa la marca venta-confirmada?", async (t) => {
  const base = await preparar(t);
  if (!base) return;
  const A = base.a.id;
  const d = await prismaComoDuenio(base);
  const { registrarPagoACuenta } = await L();
  const { completarRevisionAction } = await import("@/lib/bancos-actions");
  const { MARCA_VENTA_CONFIRMADA } = await import("@/lib/vouchers/acreditacion-core");
  const { hashPagoMP } = await import("@/lib/mercadopago-auto");
  const hoy = await hoyDelNegocio();
  await registrarPagoACuenta(A, { clave: clave("rsy"), monto: 4242.42, fecha: hoy, medio: "TRANSFERENCIA", actor: "user:test" });
  const { procesar } = await pipelineMp(A);
  const pago = { id: "pay-rsy-1", estado: "approved", monto: 4242.42, fechaAcreditacion: hoy.replace(/-/g, ""), descripcion: "Transferencia" };
  await procesar(pago);
  const mov = await d.movimientoImportado.findFirstOrThrow({ where: { tenantId: A, hash: hashPagoMP(pago.id) } });
  assert.equal(mov.estadoPropuesta, "revision");
  const r = await ejecutarAccion({ negocio: base.a, usuario: base.a.duenia }, () => completarRevisionAction(mov.id, { docTipo: 99, docNro: "" }));
  assert.equal(r.tipo, "respuesta");
  let m = await d.movimientoImportado.findFirstOrThrow({ where: { id: mov.id } });
  assert.ok((m.motivoRevision ?? "").includes(MARCA_VENTA_CONFIRMADA));
  // MP manda otro aviso del mismo pago (payment.updated) o la persona aprieta «Sincronizar».
  await procesar(pago);
  m = await d.movimientoImportado.findFirstOrThrow({ where: { id: mov.id } });
  console.log("# ATQ-A estado tras re-aviso:", m.estadoPropuesta, "| marca venta-confirmada:", (m.motivoRevision ?? "").includes(MARCA_VENTA_CONFIRMADA));
  assert.ok((m.motivoRevision ?? "").includes(MARCA_VENTA_CONFIRMADA), `el re-aviso pisó la confirmación de la persona: ${m.estadoPropuesta} / ${m.motivoRevision}`);
});

test("ATQ-B · acreditación confirmada a mano (sin movimiento todavía) y el extracto de MP llega después: ¿se factura la plata de vouchers?", async (t) => {
  const base = await preparar(t);
  if (!base) return;
  const A = base.a.id;
  const d = await prismaComoDuenio(base);
  const { registrarPagoACuenta, confirmarAcreditacionMp } = await L();
  const hoy = await hoyDelNegocio();
  const pago = await registrarPagoACuenta(A, { clave: clave("man"), monto: 5151.51, fecha: hoy, medio: "TRANSFERENCIA", actor: "user:test" });
  const c = await confirmarAcreditacionMp(A, { pagoId: pago.pagoId, actor: "user:test" });
  assert.deepEqual([c.via, c.movimientoId], ["manual", null]);
  const mov = await movimientoMp(base, A, 5151.51, hoy); // el extracto CSV de MP importado después
  await emitir(A);
  const m = await d.movimientoImportado.findFirstOrThrow({ where: { id: mov } });
  console.log("# ATQ-B estado:", m.estadoPropuesta, "invoice:", m.invoiceId != null);
  assert.equal(m.invoiceId, null, "se facturó la acreditación de un pago de vouchers confirmado a mano");
});

test("ATQ-C · cheque: depósito confirmado y después llega el crédito a MP: ¿se factura?", async (t) => {
  const base = await preparar(t);
  if (!base) return;
  const A = base.a.id;
  const d = await prismaComoDuenio(base);
  const { registrarPagoACuenta, confirmarAcreditacionMp } = await L();
  const hoy = await hoyDelNegocio();
  const pago = await registrarPagoACuenta(A, { clave: clave("chq"), monto: 6161.61, fecha: hoy, medio: "CHEQUE", actor: "user:test" });
  const c = await confirmarAcreditacionMp(A, { pagoId: pago.pagoId, actor: "user:test" });
  assert.equal(c.via, "manual");
  const mov = await movimientoMp(base, A, 6161.61, hoy);
  await emitir(A);
  const m = await d.movimientoImportado.findFirstOrThrow({ where: { id: mov } });
  console.log("# ATQ-C estado:", m.estadoPropuesta, "invoice:", m.invoiceId != null);
  assert.equal(m.invoiceId, null, "se facturó el depósito de un cheque de vouchers");
});


test("acreditado a mano: la ventana de 10 días corre desde la confirmación (cheque viejo incluido); con movimiento enganchado no frena", async (t) => {
  const base = await preparar(t);
  if (!base) return;
  const A = base.a.id;
  const { registrarPagoACuenta, confirmarAcreditacionMp, pagoPendienteDelCreditoMp } = await L();
  const { tenantTransaction } = await import("@/lib/rls");
  const hoy = await hoyDelNegocio();
  const enDias = (dias: number) => diasAntes(hoy, -dias).replace(/-/g, "");
  const frena = (monto: number, fecha: string) =>
    tenantTransaction(
      (tx) => pagoPendienteDelCreditoMp(tx, A, { id: `mov-${n++}`, fecha, monto, referencia: null, descripcion: "Transferencia", contraparte: null }),
      { tenantId: A },
    );
  // Cheque recibido hace 40 días, depósito confirmado hoy (a mano): la ventana corre desde hoy.
  const chq = await registrarPagoACuenta(A, { clave: clave("cv40"), monto: 41414.14, fecha: diasAntes(hoy, 40), medio: "CHEQUE", actor: "user:test" });
  assert.equal((await confirmarAcreditacionMp(A, { pagoId: chq.pagoId, actor: "user:test" })).via, "manual");
  assert.equal(await frena(41414.14, enDias(0)), chq.pagoId);
  assert.equal(await frena(41414.14, enDias(10)), chq.pagoId, "día 10 desde la confirmación: frena");
  assert.equal(await frena(41414.14, enDias(-1)), chq.pagoId, "un día antes (DIAS_ANTES): frena");
  assert.equal(await frena(41414.14, enDias(11)), null, "día 11: fuera de la ventana");
  assert.equal(await frena(41414.14, enDias(-2)), null, "dos días antes: fuera de la ventana");
  // Transferencia de hace 11 días confirmada a mano hoy: frena por la confirmación, no por su fecha.
  const tr = await registrarPagoACuenta(A, { clave: clave("tv11"), monto: 42424.24, fecha: diasAntes(hoy, 11), medio: "TRANSFERENCIA", actor: "user:test" });
  await confirmarAcreditacionMp(A, { pagoId: tr.pagoId, actor: "user:test" });
  assert.equal(await frena(42424.24, enDias(0)), tr.pagoId);
  // Cheque pendiente (sin confirmar): no frena.
  await registrarPagoACuenta(A, { clave: clave("cpen"), monto: 43434.34, fecha: hoy, medio: "CHEQUE", actor: "user:test" });
  assert.equal(await frena(43434.34, enDias(0)), null);
  // Acreditado con su movimiento enganchado: no frena otro crédito del mismo monto.
  const eng = await registrarPagoACuenta(A, { clave: clave("teng"), monto: 44444.44, fecha: hoy, medio: "TRANSFERENCIA", actor: "user:test" });
  const suMov = await movimientoMp(base, A, 44444.44, hoy);
  assert.equal((await confirmarAcreditacionMp(A, { pagoId: eng.pagoId, movimientoId: suMov, actor: "user:test" })).via, "mp");
  assert.equal(await frena(44444.44, enDias(0)), null);
});
