// Cert. D13 · R7 (segunda vuelta): con el pool lleno por OTRO pedido y el «sí» de la sonda sin recordar, la sonda de
// facturas de cuota vencía, daba `false` y regenerarCuotas corría sin el candado de la factura viva: la cuota con factura
// AUTORIZADA pasaba de 605 a 1210. Ahora la sonda tira y la operación no sigue. Pool de 1 conexión (espera 1,5 s) ocupada
// 2,4 s por otra transacción; la espera es por pg_stat_activity, sin relojes del test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";

const laBase = baseEfimeraDelArchivo();

test("sonda de facturas sin respuesta (pool lleno): regenerarCuotas no sigue y la cuota con factura AUTORIZADA no se pisa", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: "1", DB_CONNECT_TIMEOUT_MS: "1500" });
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a } = base;
  const t0 = await duenio.tenant.findUniqueOrThrow({ where: { id: a.id }, select: { modules: true } });
  await duenio.tenant.update({ where: { id: a.id }, data: { modules: [...new Set([...t0.modules, "proyectos"])] } });
  const p = await duenio.proyecto.create({ data: { tenantId: a.id, numero: 601, clientId: a.clientes[0], nombre: "Saturado", servicio: "ARQUITECTURA", etapa: "APROBADO", moneda: "ARS", fechaEvento: new Date(Date.UTC(2027, 5, 1)) }, select: { id: true } });
  const pres = await duenio.proyectoPresupuesto.create({ data: { tenantId: a.id, proyectoId: p.id, version: 1, estado: "APROBADO", token: `tok-${p.id}`, ivaPct: 21 } });
  const item = await duenio.proyectoItem.create({ data: { tenantId: a.id, presupuestoId: pres.id, rubro: "General", descripcion: "Stand", cantidad: 1, precio: 1000 } });
  const { regenerarCuotas } = await import("@/lib/proyectos/gestion.server");
  const fc = await import("@/lib/proyectos/facturar-cuota.server");
  const rls = await import("@/lib/rls");
  const regen = async () => {
    const r = await ejecutarAccion({ negocio: a, usuario: { id: a.duenia.id } }, () => regenerarCuotas(a.id, p.id));
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
  };
  const cobros = () => duenio.proyectoCuota.findMany({ where: { proyectoId: p.id, tipo: "COBRO", anuladoEl: null }, orderBy: { venceEl: "asc" }, select: { id: true, clave: true, monto: true } });
  await regen();
  const antes = await cobros();
  assert.ok(antes.length > 0, "el plan no armó cuotas");
  const congelar = antes[0];
  await duenio.invoice.create({
    data: { tenantId: a.id, puntoVenta: 1, concepto: 2, docTipo: 99, docNro: "0", fecha: "20261114", neto: congelar.monto, iva: 0, total: congelar.monto, status: "AUTHORIZED", proyectoCuotaId: congelar.id } as never,
  });
  await duenio.proyectoItem.update({ where: { id: item.id }, data: { precio: 2000 } });
  // Instancia fría: el «sí» todavía no se recordó.
  fc.olvidarColumnaCuotaParaTests();
  // Otro pedido ocupa la única conexión del pool 2,4 s (p.ej. una transacción lenta de otro usuario).
  const ocupante = rls.tenantTransaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_sleep(2.4)`;
  }, { tenantId: a.id, timeout: 10_000 } as never);
  // Espera determinista: hasta que el pg_sleep esté corriendo (mirado por la conexión del dueño, aparte).
  for (let i = 0; i < 500; i++) {
    const n = await duenio.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM pg_stat_activity WHERE query LIKE '%pg_sleep(2.4)%' AND state = 'active' AND pid <> pg_backend_pid()`;
    if (n[0].n > 0) break;
  }
  let error = "";
  await regen().catch((x) => { error = String((x as Error).message).slice(0, 200); });
  await ocupante.catch(() => undefined);
  const despues = (await cobros()).find((c) => c.id === congelar.id);
  console.log(`# R7-saturado: cuota facturada monto antes=${congelar.monto} después=${despues?.monto ?? "anulada"} error=${error}`);
  assert.match(error, /No se pudo verificar la facturación de las cuotas/, "la sonda sin respuesta tiene que cortar la operación");
  assert.equal(despues?.monto, congelar.monto, "regenerarCuotas pisó el monto de una cuota con factura AUTORIZADA (sonda vencida → conColumna=false)");
});
