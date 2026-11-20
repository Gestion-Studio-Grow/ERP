// ============================================================================
// MIA-219 · C2 obs. (c) de GSG-PR214 (P1, plata sin candado): `regenerarCuotas` contra `enlazarCuota` + `crearOrdenPago`.
// Antes: `aplicarPlan` leía las cuotas y sus enlaces SIN el candado de la cuota (`tomarCuotas`) y anulaba las que sobran
// con lo leído. Si en el medio la cuota que sobra se enlazaba a un comprobante y entraba en una orden de pago, quedaba
// ANULADA, enlazada y dentro de una orden PENDIENTE: una orden trabada que no se puede pagar y una factura atada a nada.
//
// Escenario (números a mano): un ítem de proveedor, costo $ 100, anticipo del proveedor al 50 % → dos cuotas de pago,
// `…:anticipo` 50 y `…:saldo` 50. El anticipo pasa al 100 %: `…:saldo` sale del plan y `…:anticipo` sube a 100.
// Mientras `regenerarCuotas` corre, Administración carga un comprobante de $ 50, le enlaza `…:saldo` y arma la orden.
//
// Intercalado determinista, sin esperas arbitrarias: el test toma antes un candado de fila (`SELECT … FOR UPDATE`) sobre
// `…:anticipo`, la cuota que el ajuste TIENE que escribir. Sin el arreglo, el ajuste lee las cuotas (un SELECT simple no
// se traba) y se traba en el UPDATE de `…:anticipo`; con el arreglo, se traba en `tomarCuotas`. El test espera a VER al
// ajuste trabado detrás de su conexión (`pg_blocking_pids`) y recién ahí enlaza y arma la orden. Si eso a su vez queda
// trabado detrás del ajuste (con el arreglo, cuando `…:saldo` va primero en el orden por id), lo espera también como
// condición. Después suelta el candado (ROLLBACK) y espera a todos.
// Las dos posiciones de `…:saldo` en el orden por id del candado (antes y después de `…:anticipo`), dos vueltas cada una.
// Gane quien gane, nunca: «`…:saldo` anulada y enlazada» ni «anulada dentro de una orden viva». Y lo que se le paga al
// proveedor suma 100: si `…:saldo` quedó (enlazada, fija en 50), `…:anticipo` baja a 50; si se anuló, `…:anticipo` es 100.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenioBase } from "@/test/base-efimera";

const laBase = baseEfimeraDelArchivo();
const DIA = 86_400_000;
const PLAZO_MS = 20_000;
const VUELTAS = 2;
/** Fecha fija de los datos (evento): el resultado no depende del reloj. */
const AHORA = Date.parse("2026-11-10T12:00:00Z");

test("MIA-219 · regenerar el plan mientras la cuota que sobra se enlaza y entra en una orden: nunca anulada adentro de la orden", async (t) => {
  const base = await laBase(t);
  assert.ok(base, "sin Postgres este test no prueba nada: levantá ERP_TEST_PG_URL");
  apuntarLaAppA(base);
  Object.assign(process.env as Record<string, string | undefined>, { NODE_ENV: "development", DB_CONNECTION_LIMIT: "12", DB_CONNECT_TIMEOUT_MS: "5000" });
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenioBase(base);
  const { b } = base;
  const t0 = await duenio.tenant.findUniqueOrThrow({ where: { id: b.id }, select: { modules: true } });
  await duenio.tenant.update({ where: { id: b.id }, data: { modules: [...new Set([...t0.modules, "proyectos"])] } });
  await duenio.proyectoPersona.create({ data: { tenantId: b.id, userId: b.recepcion.id, nombre: "Administración B", rol: "ADMINISTRACION" } });
  const { regenerarCuotas } = await import("./gestion.server");
  const comp = await import("./acciones-comprobantes");
  const ordenes = await import("./acciones-orden-pago");
  const form = (campos: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    return fd;
  };
  const json = (r: unknown) => JSON.stringify(r, (_k, v) => (typeof v === "bigint" ? Number(v) : v));
  const como = async <R>(usuarioId: string, fn: () => Promise<R>): Promise<R> => {
    const r = await ejecutarAccion({ negocio: b, usuario: { id: usuarioId } }, fn);
    assert.equal(r.tipo, "respuesta", json(r));
    return (r as { valor: R }).valor;
  };
  const admin = <R>(fn: () => Promise<R>) => como(b.recepcion.id, fn);
  const okDe = (r: unknown) => (r as { ok: boolean }).ok;

  /** Un escenario entero; `saldoPrimero`: `…:saldo` va antes que `…:anticipo` en el orden por id del candado. */
  const escenario = async (v: number, saldoPrimero: boolean) => {
    const evento = new Date(AHORA + 20 * DIA);
    const prov = await duenio.supplier.create({ data: { tenantId: b.id, name: `Carpintería ${v} (de prueba)` }, select: { id: true } });
    await duenio.proyectoProveedorFicha.create({ data: { tenantId: b.id, supplierId: prov.id, anticipoPct: 50 } });
    const proy = await duenio.proyecto.create({
      data: { tenantId: b.id, numero: 9219_00 + v, clientId: b.clientes[0], nombre: `Stand regenerar ${v}`, servicio: "ARQUITECTURA", etapa: "APROBADO", fechaArmado: new Date(evento.getTime() - 2 * DIA), fechaEvento: evento, fechaDesarme: new Date(evento.getTime() + DIA) },
      select: { id: true },
    });
    const pres = await duenio.proyectoPresupuesto.create({ data: { tenantId: b.id, proyectoId: proy.id, version: 1, estado: "APROBADO", token: `tok-${proy.id}`, ivaPct: 21 }, select: { id: true } });
    const item = await duenio.proyectoItem.create({ data: { tenantId: b.id, presupuestoId: pres.id, rubro: "General", descripcion: "Mueble", cantidad: 1, costo: 100, precio: 200, supplierId: prov.id }, select: { id: true } });
    const regenerar = async () => {
      const r = await ejecutarAccion({ negocio: b, usuario: { id: b.duenia.id } }, () => regenerarCuotas(b.id, proy.id));
      assert.equal(r.tipo, "respuesta", json(r));
    };
    const claveAnticipo = `${proy.id}:${item.id}:anticipo`;
    const claveSaldo = `${proy.id}:${item.id}:saldo`;
    const cuotaDe = (clave: string) => duenio.proyectoCuota.findUniqueOrThrow({ where: { tenantId_clave: { tenantId: b.id, clave } }, select: { id: true, monto: true, pagadoEl: true, anuladoEl: true } });

    await regenerar();
    const anticipo = await cuotaDe(claveAnticipo);
    assert.equal(anticipo.monto, 50, "plan inicial: anticipo 50");
    assert.equal((await cuotaDe(claveSaldo)).monto, 50, "plan inicial: saldo 50");
    // El id de `…:saldo` a un lado u otro del de `…:anticipo` (nada la referencia todavía): las dos posiciones del candado.
    const idSaldo = `${saldoPrimero ? "0" : "z"}-mia219-saldo-${v}`;
    await duenio.$executeRaw`UPDATE "ProyectoCuota" SET "id" = ${idSaldo} WHERE "tenantId" = ${b.id} AND "clave" = ${claveSaldo}`;
    assert.equal(idSaldo < anticipo.id, saldoPrimero);

    const r = await admin(() => comp.cargarComprobante(form({ supplierId: prov.id, fecha: "2026-11-20", tipo: "C", numero: `0003-000002${String(v).padStart(2, "0")}`, neto: "50", iva: "", total: "50", destino: "ADMINISTRACION", categoria: "Alquiler" })));
    assert.ok(okDe(r), json(r));
    const comprobante = (r as unknown as { id: string }).id;

    // El anticipo pasa al 100 %: `…:saldo` sale del plan.
    await duenio.proyectoProveedorFicha.update({ where: { supplierId: prov.id }, data: { anticipoPct: 100 } });

    const c = new pg.Client({ connectionString: base.urlDuenio });
    await c.connect();
    let enlace: unknown = null;
    let orden: unknown = null;
    try {
      await c.query("BEGIN");
      await c.query(`SELECT id FROM "ProyectoCuota" WHERE id = $1 FOR UPDATE`, [anticipo.id]);
      const yo = (await c.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      const trabadosDetras = async (pid: number) => (await c.query<{ pid: number }>("SELECT pid FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))", [pid])).rows.map((x) => x.pid);

      let termino = false;
      const ajuste = regenerar().finally(() => (termino = true));
      ajuste.catch(() => {}); // el error se ve al esperar abajo
      const hasta = performance.now() + PLAZO_MS; // plazo de espera (monotónico), no un dato del test
      // Espera una CONDICIÓN (el ajuste trabado detrás del candado de `…:anticipo`), no un tiempo.
      let ajustePid: number | undefined;
      while (!(ajustePid = (await trabadosDetras(yo))[0])) {
        if (termino) {
          await c.query("ROLLBACK");
          await ajuste;
          assert.fail("el ajuste terminó sin trabarse en `…:anticipo`: no llegó a escribirla");
        }
        if (performance.now() > hasta) assert.fail(`el ajuste no se trabó en ${PLAZO_MS} ms`);
        await new Promise((x) => setImmediate(x));
      }
      // Con el ajuste trabado: Administración enlaza `…:saldo` y arma la orden que la paga.
      let listo = false;
      const administracion = (async () => {
        enlace = await admin(() => comp.enlazarCuota(form({ comprobanteId: comprobante, cuotaId: idSaldo })));
        if (okDe(enlace)) orden = await admin(() => ordenes.crearOrdenPago({ supplierId: prov.id, medio: "TRANSFERENCIA", lineas: [{ comprobanteId: comprobante, cuotaId: idSaldo, importeCentavos: 5_000 }] }));
      })().finally(() => (listo = true));
      administracion.catch(() => {});
      // Espera a que Administración termine o quede trabada detrás del ajuste (también una condición).
      while (!listo && (await trabadosDetras(ajustePid)).length === 0) {
        if (performance.now() > hasta) assert.fail(`Administración no terminó ni se trabó en ${PLAZO_MS} ms`);
        await new Promise((x) => setImmediate(x));
      }
      await c.query("ROLLBACK");
      await ajuste;
      await administracion;
    } finally {
      await c.end();
    }

    const saldo = await duenio.proyectoCuota.findUniqueOrThrow({ where: { id: idSaldo }, select: { monto: true, anuladoEl: true, pagadoEl: true } });
    // Los enlaces y las órdenes tienen RLS forzada (también para el dueño de las tablas): se leen con el negocio puesto.
    const { enlazada, enOrdenViva } = await duenio.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${b.id}, true)`;
      return {
        enlazada: (await tx.proyectoCuotaComprobante.count({ where: { tenantId: b.id, cuotaId: idSaldo } })) > 0,
        enOrdenViva: (await tx.proyectoOrdenPagoLinea.count({ where: { tenantId: b.id, cuotaId: idSaldo, orden: { estado: { not: "ANULADA" } } } })) > 0,
      };
    });
    const pagos = await duenio.proyectoCuota.findMany({ where: { tenantId: b.id, proyectoId: proy.id, tipo: "PAGO", anuladoEl: null }, select: { monto: true } });
    const foto = { saldoPrimero, anulada: !!saldo.anuladoEl, enlazada, enOrdenViva, enlace, orden, aPagar: pagos.reduce((s, x) => s + x.monto, 0) };
    assert.ok(!(foto.anulada && foto.enOrdenViva), `«…:saldo» quedó anulada dentro de una orden viva (la orden no se puede pagar): ${json(foto)}`);
    assert.ok(!(foto.anulada && foto.enlazada), `«…:saldo» quedó anulada y enlazada a su comprobante: ${json(foto)}`);
    assert.equal(saldo.pagadoEl, null, "nadie pagó nada");
    assert.equal(foto.aPagar, 100, `lo que se le paga al proveedor suma el costo del ítem: ${json(foto)}`);
    // Lo que pasó tiene que coincidir con lo que se contestó: o se enlazó y se armó la orden, o se rechazó.
    assert.equal(okDe(enlace), foto.enlazada, `el enlace contestó una cosa y quedó otra: ${json(foto)}`);
    assert.equal(foto.enOrdenViva, foto.enlazada && okDe(orden), `la orden contestó una cosa y quedó otra: ${json(foto)}`);
    return foto;
  };

  let v = 0;
  for (let vuelta = 0; vuelta < VUELTAS; vuelta++) {
    for (const saldoPrimero of [true, false]) {
      const foto = await escenario(++v, saldoPrimero);
      t.diagnostic(`vuelta ${v}: ${json(foto)}`);
    }
  }
});
