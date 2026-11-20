// ============================================================================
// GSG-MIA-215 · DETECTOR: qué rol de gestión puede mover plata, contra Postgres de verdad (base efímera migrada, rol
// app_rls sin BYPASSRLS, Server Actions reales con sesión). No cambia código de producto: encuentra los huecos para el
// arreglo central (decisión del dueño 20/11, opción A: la traba central va después de la demo).
//
// Una TABLA (`ACCIONES`): cada acción de servidor de `src/lib/proyectos/` y de Administración › Cuentas
// (`acciones-empresa.ts`) que escribe plata —libro (`CashMovement` / `asentarEnCajaTx`), cobros, cuotas, gastos pagados,
// liquidaciones, anticipos, órdenes de pago, cuentas y sus anulaciones— se llama como cada rol de la matriz
// (`ROLES_GESTION` de `gestion-core.ts`, más SIN_FICHA) que NO ve la plata, con dos usuarios del ERP: uno que ve la plata
// del ERP (RECEPTION, con «agenda:manage») y uno que no (PROFESSIONAL). Cada rol está en el equipo del proyecto: lo que
// lo frena tiene que ser la plata, no la visibilidad.
//
//  · Ven la plata: DIRECCION y ADMINISTRACION (`ROLES_QUE_APRUEBAN_RENDICIONES` / `pagaLiquidaciones`, «el rol que
//    mueve plata», gestion-core.ts). PRODUCCION tiene «Pagos · editar» de fábrica, pero desde MIA-213 no mueve plata.
//  · Verde = rechaza (ok:false, error, redirección) Y la foto del libro (filas + md5 de 22 tablas de plata del negocio)
//    queda igual. Rojo = HUECO: el subtest lleva el nombre de la acción y su `archivo:línea`, y el mensaje, los roles.
//  · Control: la misma llamada, con una fixture nueva, como Dirección (OWNER) o Administración (RECEPTION) SÍ escribe.
//    Si ninguno de los dos la hace, el verde de esa fila no prueba nada (subtest «controles»).
//
// LO ROJO NO SE ARREGLA ACÁ: es la lista para el arreglo central. Sin Postgres local se saltea y lo dice; en CI, falla.
// Corrida del 20/11 (98f6d0e): 49 acciones × 5 roles × 2 usuarios del ERP = 490 celdas; 18 acciones en rojo, todas por
// PRODUCCION («Pagos · editar» de fábrica): con usuario RECEPTION en las 18; con PROFESSIONAL, sólo recalcularCuotas.
// Contraprueba a mano (MIA215_SOLO=registrarCobro,crearPagoEmpresa): sin `veLaPlata` en registrarCobro, suma
// PRODUCCION/PROFESSIONAL (1 → 2 rojos); sin `exigirEditar("empresa")` en crearPagoEmpresa, de verde a 10 rojos. Repuestas.
//
// GSG-MIA-223 · la traba: `veLaPlata` de Proyectos (datos.server.ts) exige además rol de gestión DIRECCION o ADMINISTRACION
// (Producción no ve ni mueve plata). Se suman las celdas que el detector no miraba (MIA-217): PRODUCCION con usuario OWNER
// (OWNER tiene todas las capacidades) y un puesto al que Dirección le guardó «Pagos · editar» (DISENO, en este negocio)
// con usuario RECEPTION. Y un test directo de `veLaPlata`: Dirección (OWNER sin ficha y con ficha) y Administración sí.
// ============================================================================

import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";
import { ROLES_GESTION, RUBROS, type RolGestion } from "./gestion-core";

const laBase = baseEfimeraDelArchivo();
const EVENTO = new Date("2027-06-15T15:00:00Z");
/** Un evento que ya terminó (la liquidación del proyecto se declara después de la fecha de fin). */
const PASADO = new Date(Date.now() - 10 * 86_400_000);
const DIA = 86_400_000;
const HOY = new Date().toISOString().slice(0, 10);

const CON_PLATA: readonly RolGestion[] = ["DIRECCION", "ADMINISTRACION"];
const SIN_PLATA: readonly RolGestion[] = [...ROLES_GESTION.filter((r) => !CON_PLATA.includes(r)), "SIN_FICHA"];
const ERP = ["RECEPTION", "PROFESSIONAL"] as const;
/** MIA-223: celdas fuera de la grilla rol × {RECEPTION, PROFESSIONAL}. OWNER tiene todas las capacidades del ERP. */
const EXTRA = ["PRODUCCION/OWNER"] as const;
/** MIA-223: el puesto al que Dirección le guarda «Pagos · editar» (con DISENO/RECEPTION de la grilla queda cubierto). */
const PUESTO_CON_PAGOS: RolGestion = "DISENO";

/** Las tablas de plata: si una acción rechazada cambia cualquiera de estas filas, es un hueco. */
const TABLAS = [
  "CashMovement", "ProyectoPago", "ProyectoGasto", "ProyectoCuota", "ProyectoGastoFijo", "ProyectoCuentaBanco", "ProyectoMovBanco",
  "ProyectoTipoCambio", "ProyectoLiquidacion", "ProyectoRendicion", "ProyectoAnticipo", "ProyectoComprobante", "ProyectoComprobanteLinea",
  "ProyectoCuotaComprobante", "ProyectoOrdenPago", "ProyectoOrdenPagoLinea", "ProyectoMovMoneda", "ProyectoMovCuenta", "ProyectoCuotaFactura",
  "ProyectoLiquidacionProyecto", "ProyectoLiquidacionProyectoLinea", "ProyectoLiquidacionProyectoAjuste", "ProyectoPrevisionEstado",
  // MIA-236: el anticipo % de una línea (ProyectoLineaDetalle) y el costo y el anticipo de una línea de adicional: de ahí
  // salen las cuotas de PAGO al proveedor. Con esto el «no se guarda» de `guardarAnticipoLinea` se cuenta, no se supone.
  "ProyectoLineaDetalle", "ProyectoAdicionalLinea",
] as const;

const form = (c: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(c)) fd.set(k, v);
  return fd;
};

type Llamada = () => Promise<unknown>;
type Mundo = NonNullable<Awaited<ReturnType<typeof armarMundo>>>;
interface Fila {
  /** `archivo:línea` de la acción, para la lista del arreglo central. */
  donde: string;
  accion: string;
  /** Arma una fixture NUEVA (como dueña de las tablas o como Dirección) y devuelve la llamada a probar. */
  arma: (m: Mundo) => Promise<Llamada>;
}

let corrida = 0;
const unico = (p: string) => `${p}-${++corrida}-${Date.now().toString(36)}`;

async function armarMundo(t: TestContext) {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  Object.assign(process.env as Record<string, string | undefined>, { NODE_ENV: "development", DB_CONNECTION_LIMIT: "12", DB_CONNECT_TIMEOUT_MS: "5000" });
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a } = base;
  const t0 = await duenio.tenant.findUniqueOrThrow({ where: { id: a.id }, select: { modules: true } });
  await duenio.tenant.update({ where: { id: a.id }, data: { modules: [...new Set([...t0.modules, "proyectos"])] } });
  const { passwordHash } = await duenio.user.findUniqueOrThrow({ where: { id: a.duenia.id }, select: { passwordHash: true } });

  // Un usuario por celda (rol de gestión × rol del ERP). SIN_FICHA no tiene persona.
  const usuarios = new Map<string, { userId: string; personaId: string | null }>();
  const crearUsuario = async (rol: RolGestion, erp: "OWNER" | "RECEPTION" | "PROFESSIONAL") => {
    const clave = `${rol}/${erp}`;
    const u = await duenio.user.create({ data: { tenantId: a.id, name: `MIA-215 ${clave}`, email: `mia215-${rol}-${erp}@negocio-a.erp.test`.toLowerCase(), passwordHash, role: erp }, select: { id: true } });
    const p = rol === "SIN_FICHA" ? null : await duenio.proyectoPersona.create({ data: { tenantId: a.id, userId: u.id, nombre: `MIA-215 ${clave}`, rol }, select: { id: true } });
    usuarios.set(clave, { userId: u.id, personaId: p?.id ?? null });
  };
  for (const rol of SIN_PLATA) for (const erp of ERP) await crearUsuario(rol, erp);
  await crearUsuario("ADMINISTRACION", "RECEPTION");
  await crearUsuario("PRODUCCION", "OWNER");
  // Positivos de MIA-223: Dirección con ficha (y usuario RECEPTION) también ve la plata.
  await crearUsuario("DIRECCION", "RECEPTION");
  await duenio.proyectoPermiso.create({ data: { tenantId: a.id, rol: PUESTO_CON_PAGOS, modulo: "pagos", ver: true, editar: true } });
  usuarios.set("DIRECCION/OWNER", { userId: a.duenia.id, personaId: null });
  // Una persona del equipo sin usuario: a ella se le entregan anticipos, se le liquida y rinde (nadie se liquida lo propio).
  const trabajador = await duenio.proyectoPersona.create({ data: { tenantId: a.id, nombre: "MIA-215 Trabajador", rol: "PRODUCCION_CAMPO", sueldoBase: 1000 }, select: { id: true } });
  const supplierId = (await duenio.supplier.create({ data: { tenantId: a.id, name: "Proveedor MIA-215" }, select: { id: true } })).id;
  const cuentaId = (await duenio.proyectoCuentaBanco.create({ data: { tenantId: a.id, nombre: "Banco MIA-215", moneda: "ARS", saldo: 1_000_000 }, select: { id: true } })).id;

  const registrar = (clave: string, userId: string) => usuarios.set(clave, { userId, personaId: null });
  const como = async <R>(clave: string, fn: () => Promise<R>) => {
    const u = usuarios.get(clave);
    assert.ok(u, clave);
    return ejecutarAccion({ negocio: a, usuario: { id: u.userId } }, fn);
  };
  /** Para las fixtures: como Dirección, y tiene que salir bien. */
  const direccion = async <R>(fn: () => Promise<R>): Promise<R> => {
    const r = await como("DIRECCION/OWNER", fn);
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    const v = (r as { valor: R }).valor;
    assert.notEqual((v as { ok?: boolean } | null)?.ok, false, `fixture: ${JSON.stringify(v)}`);
    return v;
  };
  const gestion = await import("./gestion.server");
  let numero = 21500;
  /** Un proyecto aprobado, con un ítem de $ 1.000 + IVA 21 %, sus cuotas (anticipo y saldo de $ 605) y todo el equipo adentro. */
  const proyecto = async (etapa = "APROBADO", evento = EVENTO) => {
    const p = await duenio.proyecto.create({
      data: { tenantId: a.id, numero: ++numero, clientId: a.clientes[0], nombre: `MIA-215 ${numero}`, servicio: "ARQUITECTURA", etapa, fechaArmado: new Date(evento.getTime() - 2 * DIA), fechaEvento: evento, fechaDesarme: new Date(evento.getTime() + DIA) },
      select: { id: true },
    });
    const pres = await duenio.proyectoPresupuesto.create({ data: { tenantId: a.id, proyectoId: p.id, version: 1, estado: "APROBADO", token: `mia215-${p.id}`, ivaPct: 21 }, select: { id: true } });
    const item = await duenio.proyectoItem.create({ data: { tenantId: a.id, presupuestoId: pres.id, rubro: "General", descripcion: "Stand", cantidad: 1, precio: 1000 }, select: { id: true } });
    const personas = [...usuarios.values()].flatMap((u) => (u.personaId ? [u.personaId] : []));
    await duenio.proyectoEquipo.createMany({ data: [...personas, trabajador.id].map((personaId) => ({ tenantId: a.id, proyectoId: p.id, personaId, funcion: "PRODUCTOR" })) });
    await direccion(() => gestion.regenerarCuotas(a.id, p.id));
    const cuota = await duenio.proyectoCuota.findFirstOrThrow({ where: { proyectoId: p.id, tipo: "COBRO", clave: { endsWith: ":cliente:anticipo" } }, select: { id: true } });
    return { id: p.id, itemId: item.id, cuotaId: cuota.id };
  };
  const cuotaEmpresa = (tipo: "COBRO" | "PAGO" = "PAGO") =>
    duenio.proyectoCuota.create({ data: { tenantId: a.id, proyectoId: null, tipo, concepto: unico("Cuota empresa"), monto: 100, moneda: "ARS", venceEl: new Date(EVENTO.getTime() - 60 * DIA), auto: false }, select: { id: true } });
  const comprobante = async (proyectoId: string) => {
    const comp = await import("./acciones-comprobantes");
    const r = await direccion(() => comp.cargarComprobante(form({ supplierId, fecha: HOY, tipo: "C", numero: `0001-${String(++corrida).padStart(8, "0")}`, neto: "1000", iva: "0", total: "1000", destino: proyectoId, categoria: "Catering" })));
    return (r as unknown as { id: string }).id;
  };
  const orden = async (comprobanteId: string, medio = "EFECTIVO") => {
    const ordenes = await import("./acciones-orden-pago");
    const r = await direccion(() => ordenes.crearOrdenPago({ supplierId, medio, lineas: [{ comprobanteId, cuotaId: null, importeCentavos: 100_000 }] }));
    return (r as { id: string }).id;
  };
  let mes = 0;
  /** Un período AAAA-MM que nadie usó (generar liquidaciones dos veces en el mismo mes no escribe). */
  const periodo = () => {
    const n = mes++;
    return `${2010 + Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, "0")}`;
  };
  const liquidacion = (estado: "BORRADOR" | "PUBLICADA") =>
    duenio.proyectoLiquidacion.create({ data: { tenantId: a.id, personaId: trabajador.id, periodo: periodo(), base: 1000, total: 1000, estado, publicadaEl: estado === "PUBLICADA" ? new Date() : null }, select: { id: true } });
  const rendicion = async (proyectoId: string, estado: string) => {
    const g = await duenio.proyectoGasto.create({ data: { tenantId: a.id, proyectoId, descripcion: unico("Rendición"), neto: 100, pagadoEl: new Date(), medio: "EFECTIVO", pagadoPor: "MIA-215 Trabajador" }, select: { id: true } });
    return duenio.proyectoRendicion.create({ data: { tenantId: a.id, proyectoId, gastoId: g.id, personaId: trabajador.id, medio: "PROPIO", montoCentavos: 10_000, estado }, select: { id: true } });
  };

  /** Filas y md5 de cada tabla de plata del negocio: cualquier alta, baja o cambio la mueve. Con el negocio puesto: las
   *  tablas de comprobantes y órdenes fuerzan RLS también para la dueña de las tablas (sin eso se ven vacías). */
  const foto = () =>
    duenio.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${a.id}, true)`;
      return tx.$queryRawUnsafe<{ t: string; n: number; h: string }[]>(
        TABLAS.map((tb) => `SELECT '${tb}' AS t, count(*)::int AS n, md5(coalesce(string_agg(x::text, '|' ORDER BY x.id), '')) AS h FROM "${tb}" x WHERE x."tenantId" = $1`).join(" UNION ALL "),
        a.id,
      );
    });

  const persona = (clave: string): string => { const id = usuarios.get(clave)?.personaId; assert.ok(id, clave); return id; };
  return { a, duenio, como, registrar, persona, direccion, proyecto, cuotaEmpresa, comprobante, orden, liquidacion, periodo, rendicion, foto, supplierId, cuentaId, trabajador };
}

/**
 * Filas sin control válido HOY: su verde dice «rechaza», pero no prueba que la llamada, hecha por quien sí puede, escriba.
 * Quedan dichas acá y no en rojo, porque el rojo es sólo la lista de huecos. Si aparece otra, el subtest de controles falla.
 */
const SIN_CONTROL_CONOCIDO: Record<string, string> = {
  declararCostosCompletos: "pide el precio aprobado con su foto (equipo y reparto: participantes de ProyectoPrecioFoto); la fixture no la arma",
  revisarLiquidacionProyecto: "va después de declararCostosCompletos (misma foto)",
  aprobarLiquidacionProyecto: "Dirección aprueba con el código de la app de autenticación (segundo factor) y la fixture no lo tiene",
  aprobarAjusteTardio: "ídem: código del segundo factor",
  enlazarCuotaFactura: "necesita una factura emitida (ARCA) para enlazar; la fixture no la emite",
  desenlazarCuotaFactura: "ídem: necesita una cuota con factura enlazada",
};

const P = "src/lib/proyectos/";
const ACCIONES: Fila[] = [
  // ── acciones.ts ──
  { donde: `${P}acciones.ts:214`, accion: "registrarCobro", arma: async (m) => { const p = await m.proyecto(); const x = await import("./acciones"); return () => x.registrarCobro(form({ proyectoId: p.id, medio: "EFECTIVO", monto: "100" })); } },
  { donde: `${P}acciones.ts:379`, accion: "registrarGasto (pagado)", arma: async (m) => { const p = await m.proyecto(); const x = await import("./acciones"); return () => x.registrarGasto(form({ proyectoId: p.id, descripcion: "Flete", neto: "100", pagado: "on", medio: "EFECTIVO" })); } },
  { donde: `${P}acciones.ts:466`, accion: "pagarGasto", arma: async (m) => { const p = await m.proyecto(); const g = await m.duenio.proyectoGasto.create({ data: { tenantId: m.a.id, proyectoId: p.id, descripcion: unico("Gasto a pagar"), neto: 100 }, select: { id: true } }); const x = await import("./acciones"); return () => x.pagarGasto(form({ id: g.id, medio: "EFECTIVO" })); } },
  // ── acciones-ficha.ts (Finanzas de la ficha) ──
  { donde: `${P}acciones-ficha.ts:942`, accion: "marcarCuota", arma: async (m) => { const p = await m.proyecto(); const x = await import("./acciones-ficha"); return () => x.marcarCuota(form({ envio: unico("mia215"), id: p.cuotaId, medio: "TRANSFERENCIA", cuenta: "ninguna" })); } },
  { donde: `${P}acciones-ficha.ts:1194`, accion: "crearMovimientoManual", arma: async (m) => { const p = await m.proyecto(); const x = await import("./acciones-ficha"); return () => x.crearMovimientoManual(form({ proyectoId: p.id, tipo: "PAGO", concepto: "Pago a mano", monto: "100", moneda: "ARS", venceEl: "2027-05-01" })); } },
  { donde: `${P}acciones-ficha.ts:1239`, accion: "quitarMovimiento", arma: async (m) => { const p = await m.proyecto(); const c = await m.duenio.proyectoCuota.create({ data: { tenantId: m.a.id, proyectoId: p.id, tipo: "COBRO", concepto: "Extra a mano", monto: 100, moneda: "ARS", venceEl: new Date(EVENTO.getTime() - 30 * DIA), auto: false }, select: { id: true } }); const x = await import("./acciones-ficha"); return () => x.quitarMovimiento(form({ proyectoId: p.id, id: c.id })); } },
  // Con el ítem cambiado por abajo, recalcular rehace las cuotas: si el rol pasa, la foto cambia.
  { donde: `${P}acciones-ficha.ts:1273`, accion: "recalcularCuotas", arma: async (m) => { const p = await m.proyecto(); await m.duenio.proyectoItem.update({ where: { id: p.itemId }, data: { precio: 2000 } }); const x = await import("./acciones-ficha"); return () => x.recalcularCuotas(form({ proyectoId: p.id })); } },
  { donde: `${P}acciones-ficha.ts:1299`, accion: "anularCobroFicha", arma: async (m) => { const p = await m.proyecto(); const x = await import("./acciones-ficha"); await m.direccion(() => x.marcarCuota(form({ envio: unico("mia215"), id: p.cuotaId, medio: "TRANSFERENCIA", cuenta: "ninguna" }))); const pago = await m.duenio.proyectoPago.findFirstOrThrow({ where: { proyectoId: p.id, anuladoEl: null }, select: { id: true } }); return () => x.anularCobroFicha(form({ id: pago.id })); } },
  { donde: `${P}acciones-ficha.ts:1351`, accion: "anularGastoFicha", arma: async (m) => { const p = await m.proyecto(); const x = await import("./acciones"); await m.direccion(() => x.registrarGasto(form({ proyectoId: p.id, descripcion: "Flete", neto: "100", pagado: "on", medio: "EFECTIVO" }))); const g = await m.duenio.proyectoGasto.findFirstOrThrow({ where: { proyectoId: p.id, anuladoEl: null }, select: { id: true } }); const f = await import("./acciones-ficha"); return () => f.anularGastoFicha(form({ id: g.id })); } },
  // ── acciones-presupuesto.ts · acciones-etapas.ts ──
  // MIA-234 · «2a» del dueño: el % de anticipo de una línea rehace las cuotas de pago al proveedor; es plata.
  { donde: `${P}acciones-presupuesto.ts:113`, accion: "guardarAnticipoLinea", arma: async (m) => { const p = await m.proyecto(); await m.duenio.proyectoItem.update({ where: { id: p.itemId }, data: { costo: 400, supplierId: m.supplierId } }); const g = await import("./gestion.server"); await m.direccion(() => g.regenerarCuotas(m.a.id, p.id)); const x = await import("./acciones-presupuesto"); return () => x.guardarAnticipoLinea(form({ itemId: p.itemId, anticipoPct: String(10 + (corrida++ % 80)) })); } },
  // MIA-236 · D1: la línea de un adicional con costo y anticipo % se vuelve cuotas de PAGO al aprobarse; es plata.
  { donde: `${P}acciones-presupuesto.ts:217`, accion: "agregarLineaAdicional", arma: async (m) => { const p = await m.proyecto(); const ad = await m.duenio.$transaction(async (tx) => { await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${m.a.id}, true)`; return tx.proyectoAdicional.create({ data: { tenantId: m.a.id, proyectoId: p.id, numero: 1, nombre: "Pantalla extra", creadoPor: "Dirección" }, select: { id: true } }); }); const x = await import("./acciones-presupuesto"); return () => x.agregarLineaAdicional(form({ adicionalId: ad.id, sector: "Producción", categoria: RUBROS[0], detalle: unico("Pantalla"), supplierId: m.supplierId, cantidad: "1", costo: "300", precio: "500", anticipoPct: "30" })); } },
  { donde: `${P}acciones-presupuesto.ts:141`, accion: "marcarPrevision", arma: async (m) => { const p = await m.proyecto(); const c = await m.duenio.proyectoCuota.create({ data: { tenantId: m.a.id, proyectoId: p.id, tipo: "PAGO", concepto: "Pago previsto", monto: 100, moneda: "ARS", venceEl: new Date(EVENTO.getTime() - 30 * DIA), auto: false }, select: { id: true } }); const x = await import("./acciones-presupuesto"); return () => x.marcarPrevision(form({ cuotaId: c.id, estado: "confirmado" })); } },
  { donde: `${P}acciones-etapas.ts:165`, accion: "cancelarProyecto", arma: async (m) => { const p = await m.proyecto(); const x = await import("./acciones-etapas"); return () => x.cancelarProyecto(form({ id: p.id, motivo: "El cliente se bajó" })); } },
  // ── acciones-rendiciones.ts (rendirGasto queda afuera: rinde lo propio, sin asiento, por diseño) ──
  { donde: `${P}acciones-rendiciones.ts:215`, accion: "aprobarRendicion", arma: async (m) => { const p = await m.proyecto(); const r = await m.rendicion(p.id, "enviada"); const x = await import("./acciones-rendiciones"); return () => x.aprobarRendicion(form({ id: r.id })); } },
  { donde: `${P}acciones-rendiciones.ts:219`, accion: "devolverRendicion", arma: async (m) => { const p = await m.proyecto(); const r = await m.rendicion(p.id, "enviada"); const x = await import("./acciones-rendiciones"); return () => x.devolverRendicion(form({ id: r.id, comentario: "Falta el ticket" })); } },
  { donde: `${P}acciones-rendiciones.ts:223`, accion: "rechazarRendicion", arma: async (m) => { const p = await m.proyecto(); const r = await m.rendicion(p.id, "enviada"); const x = await import("./acciones-rendiciones"); return () => x.rechazarRendicion(form({ id: r.id, comentario: "No corresponde" })); } },
  { donde: `${P}acciones-rendiciones.ts:252`, accion: "reintegrarDirecto", arma: async (m) => { const p = await m.proyecto(); const r = await m.rendicion(p.id, "aprobada"); const x = await import("./acciones-rendiciones"); return () => x.reintegrarDirecto(form({ id: r.id, medio: "EFECTIVO" })); } },
  { donde: `${P}acciones-rendiciones.ts:295`, accion: "entregarAnticipo", arma: async (m) => { const p = await m.proyecto(); const x = await import("./acciones-rendiciones"); return () => x.entregarAnticipo(form({ personaId: m.trabajador.id, proyectoId: p.id, medio: "EFECTIVO", monto: "500", clave: unico("mia215-anticipo") })); } },
  { donde: `${P}acciones-rendiciones.ts:337`, accion: "cerrarAnticipo", arma: async (m) => { const p = await m.proyecto(); const an = await m.duenio.proyectoAnticipo.create({ data: { tenantId: m.a.id, personaId: m.trabajador.id, proyectoId: p.id, montoCentavos: 50_000 }, select: { id: true } }); const x = await import("./acciones-rendiciones"); return () => x.cerrarAnticipo(form({ id: an.id, medio: "EFECTIVO" })); } },
  // ── acciones-liquidacion-proyecto.ts ──
  { donde: `${P}acciones-liquidacion-proyecto.ts:53`, accion: "declararCostosCompletos", arma: async (m) => { const p = await m.proyecto("CIERRE", PASADO); const x = await import("./acciones-liquidacion-proyecto"); return () => x.declararCostosCompletos(form({ proyectoId: p.id })); } },
  { donde: `${P}acciones-liquidacion-proyecto.ts:133`, accion: "revisarLiquidacionProyecto", arma: async (m) => { const p = await m.proyecto("CIERRE", PASADO); const x = await import("./acciones-liquidacion-proyecto"); await m.como("ADMINISTRACION/RECEPTION", () => x.declararCostosCompletos(form({ proyectoId: p.id }))); return () => x.revisarLiquidacionProyecto(form({ proyectoId: p.id, nota: "Revisada" })); } },
  { donde: `${P}acciones-liquidacion-proyecto.ts:203`, accion: "aprobarLiquidacionProyecto", arma: async (m) => { const p = await m.proyecto("CIERRE", PASADO); const x = await import("./acciones-liquidacion-proyecto"); await m.como("ADMINISTRACION/RECEPTION", () => x.declararCostosCompletos(form({ proyectoId: p.id }))); await m.como("ADMINISTRACION/RECEPTION", () => x.revisarLiquidacionProyecto(form({ proyectoId: p.id, nota: "Revisada" }))); return () => x.aprobarLiquidacionProyecto(form({ proyectoId: p.id })); } },
  { donde: `${P}acciones-liquidacion-proyecto.ts:247`, accion: "aprobarAjusteTardio", arma: async (m) => { const p = await m.proyecto("CIERRE", PASADO); const x = await import("./acciones-liquidacion-proyecto"); return () => x.aprobarAjusteTardio(form({ proyectoId: p.id, compensar: "si" })); } },
  // ── acciones-comprobantes.ts ──
  { donde: `${P}acciones-comprobantes.ts:100`, accion: "cargarComprobante", arma: async (m) => { const p = await m.proyecto(); const x = await import("./acciones-comprobantes"); return () => x.cargarComprobante(form({ supplierId: m.supplierId, fecha: HOY, tipo: "C", numero: `0002-${String(++corrida).padStart(8, "0")}`, neto: "1000", iva: "0", total: "1000", destino: p.id, categoria: "Catering" })); } },
  { donde: `${P}acciones-comprobantes.ts:267`, accion: "imputarComprobante", arma: async (m) => { const p = await m.proyecto(); const c = await m.comprobante(p.id); const x = await import("./acciones-comprobantes"); return () => x.imputarComprobante({ comprobanteId: c, lineas: [{ destino: "PROYECTO", proyectoId: p.id, sector: null, categoria: "Catering", detalle: "Reimputado", netoCentavos: 100_000, ivaCentavos: 0, ivaTratamiento: "COSTO" }] }); } },
  { donde: `${P}acciones-comprobantes.ts:325`, accion: "enlazarCuota", arma: async (m) => { const p = await m.proyecto(); const c = await m.comprobante(p.id); const q = await m.duenio.proyectoCuota.create({ data: { tenantId: m.a.id, proyectoId: p.id, tipo: "PAGO", concepto: "Pago al proveedor", monto: 1000, moneda: "ARS", venceEl: new Date(EVENTO.getTime() - 30 * DIA), auto: false, supplierId: m.supplierId }, select: { id: true } }); const x = await import("./acciones-comprobantes"); return () => x.enlazarCuota(form({ comprobanteId: c, cuotaId: q.id })); } },
  { donde: `${P}acciones-comprobantes.ts:376`, accion: "desenlazarCuota", arma: async (m) => { const p = await m.proyecto(); const c = await m.comprobante(p.id); const q = await m.duenio.proyectoCuota.create({ data: { tenantId: m.a.id, proyectoId: p.id, tipo: "PAGO", concepto: "Pago al proveedor", monto: 1000, moneda: "ARS", venceEl: new Date(EVENTO.getTime() - 30 * DIA), auto: false, supplierId: m.supplierId }, select: { id: true } }); const x = await import("./acciones-comprobantes"); await m.direccion(() => x.enlazarCuota(form({ comprobanteId: c, cuotaId: q.id }))); return () => x.desenlazarCuota(form({ cuotaId: q.id })); } },
  { donde: `${P}acciones-comprobantes.ts:398`, accion: "anularComprobante", arma: async (m) => { const p = await m.proyecto(); const c = await m.comprobante(p.id); const x = await import("./acciones-comprobantes"); return () => x.anularComprobante(form({ id: c })); } },
  // ── acciones-orden-pago.ts ──
  { donde: `${P}acciones-orden-pago.ts:89`, accion: "crearOrdenPago", arma: async (m) => { const p = await m.proyecto(); const c = await m.comprobante(p.id); const x = await import("./acciones-orden-pago"); return () => x.crearOrdenPago({ supplierId: m.supplierId, medio: "EFECTIVO", lineas: [{ comprobanteId: c, cuotaId: null, importeCentavos: 100_000 }] }); } },
  { donde: `${P}acciones-orden-pago.ts:181`, accion: "crearOrdenDesdeForm", arma: async (m) => { const p = await m.proyecto(); const c = await m.comprobante(p.id); const x = await import("./acciones-orden-pago"); return () => x.crearOrdenDesdeForm(form({ supplierId: m.supplierId, medio: "EFECTIVO", comprobanteId: c, importe: "1000" })); } },
  { donde: `${P}acciones-orden-pago.ts:201`, accion: "aprobarYPagarOrden", arma: async (m) => { const p = await m.proyecto(); const o = await m.orden(await m.comprobante(p.id)); const x = await import("./acciones-orden-pago"); return () => x.aprobarYPagarOrden(form({ id: o, fecha: HOY })); } },
  { donde: `${P}acciones-orden-pago.ts:324`, accion: "anularOrden", arma: async (m) => { const p = await m.proyecto(); const o = await m.orden(await m.comprobante(p.id)); const x = await import("./acciones-orden-pago"); const pago = await m.como("ADMINISTRACION/RECEPTION", () => x.aprobarYPagarOrden(form({ id: o, fecha: HOY }))); assert.equal((pago as { valor?: { ok?: boolean } }).valor?.ok, true, `fixture: ${JSON.stringify(pago)}`); return () => x.anularOrden(form({ id: o })); } },
  // ── acciones-empresa.ts (Administración › Cuentas, Bancos, Monedas, Liquidaciones) ──
  { donde: `${P}acciones-empresa.ts:62`, accion: "crearPagoEmpresa", arma: async () => { const x = await import("./acciones-empresa"); return () => x.crearPagoEmpresa(form({ tipo: "PAGO", concepto: unico("Alquiler"), monto: "100", venceEl: "2027-01-10" })); } },
  { donde: `${P}acciones-empresa.ts:102`, accion: "marcarCuotaEmpresa", arma: async (m) => { const c = await m.cuotaEmpresa(); const x = await import("./acciones-empresa"); return () => x.marcarCuotaEmpresa(form({ id: c.id, medio: "EFECTIVO", envio: unico("mia215") })); } },
  { donde: `${P}acciones-empresa.ts:176`, accion: "anularCuotaEmpresa", arma: async (m) => { const c = await m.cuotaEmpresa(); const x = await import("./acciones-empresa"); return () => x.anularCuotaEmpresa(form({ id: c.id })); } },
  { donde: `${P}acciones-empresa.ts:242`, accion: "guardarDatoCuota", arma: async (m) => { const c = await m.cuotaEmpresa(); const x = await import("./acciones-empresa"); return () => x.guardarDatoCuota(form({ id: c.id, campo: "venceEl", valor: "2027-02-15" })); } },
  { donde: `${P}acciones-empresa.ts:280`, accion: "crearCuenta", arma: async () => { const x = await import("./acciones-empresa"); return () => x.crearCuenta(form({ nombre: unico("Cuenta"), moneda: "ARS", saldo: "100" })); } },
  { donde: `${P}acciones-empresa.ts:290`, accion: "guardarSaldo", arma: async (m) => { const c = await m.duenio.proyectoCuentaBanco.create({ data: { tenantId: m.a.id, nombre: unico("Cuenta"), moneda: "ARS", saldo: 100 }, select: { id: true } }); const x = await import("./acciones-empresa"); return () => x.guardarSaldo(form({ id: c.id, saldo: "250" })); } },
  { donde: `${P}acciones-empresa.ts:312`, accion: "importarExtracto", arma: async (m) => { const x = await import("./acciones-empresa"); const linea = `${HOY};${unico("Depósito")};1000`; return () => x.importarExtracto(form({ cuentaId: m.cuentaId, csv: `Fecha;Descripción;Importe\n${linea}` })); } },
  { donde: `${P}acciones-empresa.ts:349`, accion: "conciliarMovimiento", arma: async (m) => { const c = await m.cuotaEmpresa(); const mv = await m.duenio.proyectoMovBanco.create({ data: { tenantId: m.a.id, cuentaId: m.cuentaId, fecha: new Date(), descripcion: unico("Mov"), importe: -100 }, select: { id: true } }); const x = await import("./acciones-empresa"); return () => x.conciliarMovimiento(form({ id: mv.id, cuotaId: c.id })); } },
  { donde: `${P}acciones-empresa.ts:394`, accion: "desconciliarMovimiento", arma: async (m) => { const c = await m.cuotaEmpresa(); const mv = await m.duenio.proyectoMovBanco.create({ data: { tenantId: m.a.id, cuentaId: m.cuentaId, fecha: new Date(), descripcion: unico("Mov"), importe: -100 }, select: { id: true } }); const x = await import("./acciones-empresa"); await m.direccion(() => x.conciliarMovimiento(form({ id: mv.id, cuotaId: c.id }))); return () => x.desconciliarMovimiento(form({ id: mv.id })); } },
  { donde: `${P}acciones-empresa.ts:433`, accion: "guardarTipoCambio", arma: async () => { const x = await import("./acciones-empresa"); const v = String(1000 + ++corrida); return () => x.guardarTipoCambio(form({ porUnidad: v, moneda: "USD", fecha: HOY })); } },
  { donde: `${P}acciones-empresa.ts:532`, accion: "enlazarCuotaFactura", arma: async (m) => { const p = await m.proyecto(); const x = await import("./acciones-empresa"); return () => x.enlazarCuotaFactura(form({ cuotaId: p.cuotaId, facturaId: "factura-inexistente", tramo: "anticipo" })); } },
  { donde: `${P}acciones-empresa.ts:560`, accion: "desenlazarCuotaFactura", arma: async (m) => { const p = await m.proyecto(); const x = await import("./acciones-empresa"); return () => x.desenlazarCuotaFactura(form({ cuotaId: p.cuotaId })); } },
  { donde: `${P}acciones-empresa.ts:576`, accion: "guardarGastoFijo", arma: async () => { const x = await import("./acciones-empresa"); return () => x.guardarGastoFijo(form({ nombre: unico("Alquiler"), monto: "100", frecuencia: "MENSUAL", fecha: HOY, moneda: "ARS" })); } },
  { donde: `${P}acciones-empresa.ts:601`, accion: "bajaGastoFijo", arma: async (m) => { const g = await m.duenio.proyectoGastoFijo.create({ data: { tenantId: m.a.id, nombre: unico("Fijo"), monto: 100 }, select: { id: true } }); const x = await import("./acciones-empresa"); return () => x.bajaGastoFijo(form({ id: g.id })); } },
  { donde: `${P}acciones-empresa.ts:646`, accion: "generarLiquidaciones", arma: async (m) => { const x = await import("./acciones-empresa"); const per = m.periodo(); return () => x.generarLiquidaciones(form({ periodo: per })); } },
  { donde: `${P}acciones-empresa.ts:701`, accion: "publicarBorradores", arma: async (m) => { const l = await m.liquidacion("BORRADOR"); const { periodo } = await m.duenio.proyectoLiquidacion.findUniqueOrThrow({ where: { id: l.id }, select: { periodo: true } }); const x = await import("./acciones-empresa"); return () => x.publicarBorradores(form({ periodo })); } },
  { donde: `${P}acciones-empresa.ts:740`, accion: "pagarLiquidacion", arma: async (m) => { const l = await m.liquidacion("PUBLICADA"); const x = await import("./acciones-empresa"); return () => x.pagarLiquidacion(form({ id: l.id, medio: "EFECTIVO", cuenta: "ninguna" })); } },
  { donde: `${P}acciones-empresa.ts:820`, accion: "borrarLiquidacion", arma: async (m) => { const l = await m.liquidacion("BORRADOR"); const x = await import("./acciones-empresa"); return () => x.borrarLiquidacion(form({ id: l.id })); } },
  { donde: `${P}acciones-empresa.ts:861`, accion: "editarExtrasLiquidacion", arma: async (m) => { const l = await m.liquidacion("BORRADOR"); const x = await import("./acciones-empresa"); return () => x.editarExtrasLiquidacion({ id: l.id, manuales: [{ nombre: "Extra", monto: "100" }] }); } },
];

/** Corre la llamada como `clave` con la foto antes y después. «Pasó» = respondió sin `ok:false`; «escribió» = la foto cambió. */
async function intentar(m: Mundo, clave: string, llamar: Llamada) {
  const antes = await m.foto();
  let salida: string;
  let paso = false;
  try {
    const r = await m.como(clave, llamar);
    if (r.tipo !== "respuesta") salida = r.tipo === "redireccion" ? `redirección a ${r.destino}` : "404";
    else {
      const v = (r as { valor: unknown }).valor as { ok?: boolean; error?: string } | null | undefined;
      paso = v?.ok !== false;
      salida = paso ? `respondió ${JSON.stringify(v)?.slice(0, 120)}` : `rechazó: ${v?.error ?? ""}`;
    }
  } catch (e) {
    salida = `error: ${(e as Error).message}`;
  }
  const despues = await m.foto();
  const previo = new Map(antes.map((x) => [x.t, x]));
  const cambiaron = despues.filter((d) => d.n !== previo.get(d.t)?.n || d.h !== previo.get(d.t)?.h).map((d) => `${d.t} ${previo.get(d.t)?.n}→${d.n}`);
  return { paso, escribio: cambiaron.length > 0, salida, cambiaron };
}

test("MIA-215 · matriz de plata: cada rol que no ve la plata rechaza cada acción que la mueve, y el libro no cambia", async (t) => {
  const m = await armarMundo(t);
  if (!m) return;
  await t.test("MIA-223 · veLaPlata de Proyectos: Dirección y Administración sí; Producción (OWNER o RECEPTION), un puesto con «Pagos · editar» y quien no tiene ficha, no", () => probarVeLaPlata(m));
  const sinControl: string[] = [];
  let celdas = 0;
  // MIA215_SOLO=registrarCobro,marcarCuota corre sólo esas filas (para la contraprueba a mano).
  const solo = process.env.MIA215_SOLO?.split(",").map((x) => x.trim()).filter(Boolean);
  for (const fila of ACCIONES.filter((f) => !solo?.length || solo.includes(f.accion))) {
    await t.test(`${fila.accion} (${fila.donde})`, async () => {
      const huecos: string[] = [];
      for (const clave of [...SIN_PLATA.flatMap((rol) => ERP.map((erp) => `${rol}/${erp}`)), ...EXTRA]) {
        celdas++;
        const r = await intentar(m, clave, await fila.arma(m));
        const [rol, erp] = clave.split("/");
        if (r.paso || r.escribio) huecos.push(`${rol} (ERP ${erp}): ${r.salida}${r.escribio ? ` · el libro cambió: ${r.cambiaron.join(", ")}` : ""}`);
      }
      // Control: con una fixture nueva, alguno de los dos roles que ven la plata la mueve de verdad.
      const controles: string[] = [];
      let alguno = false;
      for (const clave of ["DIRECCION/OWNER", "ADMINISTRACION/RECEPTION"]) {
        const r = await intentar(m, clave, await fila.arma(m));
        if (r.paso && r.escribio) alguno = true;
        controles.push(`${clave}: ${r.salida}${r.escribio ? "" : " · sin escribir"}`);
      }
      if (!alguno && !(fila.accion in SIN_CONTROL_CONOCIDO)) sinControl.push(`${fila.accion} (${fila.donde}) · ${controles.join(" | ")}`);
      assert.deepEqual(huecos, [], `HUECO ${fila.accion} (${fila.donde}): estos roles que no ven la plata la mueven`);
    });
  }
  console.log(`MIA-215 · ${ACCIONES.length} acciones × (${SIN_PLATA.length} roles × ${ERP.length} usuarios del ERP + ${EXTRA.length}) = ${celdas} celdas`);
  await t.test(`controles: Dirección o Administración sí mueven la plata con la misma llamada (sin probar, y dicho: ${Object.keys(SIN_CONTROL_CONOCIDO).join(", ")})`, () => {
    assert.deepEqual(sinControl, []);
  });
  // Al final: guarda «Empresa · editar» a PRODUCCION, y no tiene que contaminar las filas de arriba.
  await t.test("MIA-229 · lecturas de plata: Producción de fábrica (ERP RECEPTION o PROFESSIONAL) no ve deudas de proveedores ni Finanzas, y Dirección no le puede dar Empresa", () => probarLecturasDePlata(m));
  await t.test("MIA-229 · rendiciones propias: Producción y Producción de campo siguen rindiendo (y se registra)", () => probarRendicionesPropias(m));
  // Al final: guarda permisos a PRODUCCION_CAMPO y COMERCIAL, que no tienen que contaminar las filas de arriba.
  await t.test("MIA-237 · productor comercial: cobrado, por cobrar y costos de sus proyectos; sin pagos ni deudas a proveedores", () => probarProductorComercial(m));
  await t.test("MIA-237 · productor de campo: ningún importe, ni con lo que Dirección le guarde; sigue rindiendo", () => probarProductorDeCampo(m));
  await t.test("MIA-237 · Administración (usuario OWNER): ve la plata y los proyectos, no administra usuarios", () => probarAdministracion(m));
  await t.test("MIA-238 · productor comercial: en un proyecto que no es suyo no ve cobrado, por cobrar ni costos (pantalla y llamada directa)", () => probarComercialAjeno(m));
  await t.test("MIA-238 · una OWNER sin ficha activa que no es la Dueña (su ficha de Administración, de baja) no hereda Dirección ni usuarios", () => probarOwnerDeBaja(m));
  await t.test("MIA-239 · productor comercial: en un proyecto ajeno no ve la venta (Pipeline, ficha, IA) ni edita cotizaciones, precio, equipo ni el estimado", () => probarComercialVentaAjena(m));
  await t.test("MIA-237 · puertas de MIA-236: % de anticipo del proveedor y costos al presupuesto, sólo quien corresponde", () => probarPuertasMia236(m));
});

/** MIA-237 · lo que una persona lee de un proyecto: la vista, Finanzas, el Resumen y la Ficha. Corre como el usuario. */
async function leerProyecto(m: Mundo, clave: string, proyectoId: string) {
  const gestion = await import("./gestion.server");
  const ficha = await import("./ficha.server");
  const r = await m.como(clave, async () => {
    const a = await gestion.actorActual();
    const cab = await ficha.cabeceraFicha(a, proyectoId);
    assert.ok(cab, `${clave} ve el proyecto`);
    const v = ficha.vistaDe(a) as ReturnType<typeof ficha.vistaDe> & { cobros?: boolean; deudas?: boolean; importes?: boolean };
    // Finanzas se lee si la pestaña se abre (pagos o, MIA-237, cobros).
    const fin = v.pagos || v.cobros ? await ficha.datosFinanzas(a, cab, v) : null;
    const res = await ficha.datosResumen(a, cab, v);
    const fi = await ficha.datosFicha(a, cab, v);
    return {
      vista: { costos: v.costos, editaCostos: v.editaCostos, pagos: v.pagos, editaPagos: v.editaPagos, cobros: v.cobros ?? false, deudas: v.deudas ?? v.costos, importes: v.importes ?? true },
      finanzas: fin && { tipos: [...new Set(fin.cuotas.map((c) => c.tipo))].sort(), totalAprobado: fin.totalAprobado, cobrado: fin.cobrado, saldo: fin.saldo, gastos: fin.gastos.length, aPagar: (fin.resumen as { aPagar?: number }).aPagar ?? 0 },
      resumen: res.finanzas && { cobrado: res.finanzas.cobrado, aPagar: res.finanzas.aPagar, pagado: res.finanzas.pagado },
      ficha: fi.filas.map((f) => ({ venta: (f as { venta?: number }).venta ?? null, costo: (f as { costo?: number }).costo ?? null })),
    };
  });
  assert.equal(r.tipo, "respuesta", `${clave}: ${JSON.stringify(r)}`);
  return (r as { valor: LecturaDeProyecto }).valor;
}
interface LecturaDeProyecto {
  vista: Record<string, boolean>;
  finanzas: { tipos: string[]; totalAprobado: number; cobrado: number; saldo: number; gastos: number; aPagar: number } | null;
  resumen: { cobrado: number; aPagar: number; pagado: number } | null;
  ficha: { venta: number | null; costo: number | null }[];
}

/** Un proyecto del mundo (ítem de $ 1.000 + IVA = $ 1.210, cuotas de cobro de $ 605) con un costo de $ 400 en el ítem y
 *  una deuda con un proveedor: cuota de PAGO pendiente de $ 1.234. Hecho a mano: cobrado 0, por cobrar 1.210, a pagar 1.234. */
async function proyectoConDeuda(m: Mundo) {
  const p = await m.proyecto();
  await m.duenio.proyectoItem.updateMany({ where: { id: p.itemId }, data: { costo: 400 } });
  const supplierId = (await m.duenio.supplier.create({ data: { tenantId: m.a.id, name: unico("Proveedor MIA-237") }, select: { id: true } })).id;
  await m.duenio.proyectoCuota.create({ data: { tenantId: m.a.id, proyectoId: p.id, tipo: "PAGO", concepto: unico("Pago proveedor"), monto: 1234, moneda: "ARS", venceEl: EVENTO, supplierId, prevista: false, auto: false } });
  return p;
}

async function probarProductorComercial(m: Mundo) {
  const lecturas = await import("./gestion-lecturas.server");
  const gestion = await import("./gestion.server");
  const p = await proyectoConDeuda(m);
  // Dirección le guarda «Costos · editar» y «Pagos · editar» a Comercial: no tiene que servir.
  for (const modulo of ["costos", "pagos"]) await m.duenio.proyectoPermiso.create({ data: { tenantId: m.a.id, rol: "COMERCIAL", modulo, ver: true, editar: true } });
  const obtenido: Record<string, unknown> = {};
  for (const clave of ["COMERCIAL/RECEPTION", "COMERCIAL/PROFESSIONAL"]) obtenido[clave] = await leerProyecto(m, clave, p.id);
  const ESPERADO = {
    vista: { costos: true, editaCostos: false, pagos: false, editaPagos: false, cobros: true, deudas: false, importes: true },
    finanzas: { tipos: ["COBRO"], totalAprobado: 1210, cobrado: 0, saldo: 1210, gastos: 0, aPagar: 0 },
    resumen: { cobrado: 0, aPagar: 0, pagado: 0 },
    ficha: [{ venta: 1000, costo: 400 }],
  };
  assert.deepEqual(obtenido, { "COMERCIAL/RECEPTION": ESPERADO, "COMERCIAL/PROFESSIONAL": ESPERADO });
  // Las deudas con proveedores tampoco por Proveedores.
  const r = await m.como("COMERCIAL/RECEPTION", async () => {
    const a = await gestion.actorActual();
    const lista = await lecturas.listaDeProveedores(a, {});
    return { verPlata: lista.verPlata, porPagarCuotas: lista.porPagarCuotas };
  });
  assert.deepEqual(r.tipo === "respuesta" ? r.valor : r, { verPlata: false, porPagarCuotas: 0 });
  // Control: Administración ve la deuda del mismo proyecto (la sonda no está ciega).
  const adm = await leerProyecto(m, "ADMINISTRACION/RECEPTION", p.id);
  assert.deepEqual(adm.finanzas?.tipos, ["COBRO", "PAGO"]);
  assert.equal(adm.finanzas?.aPagar, 1234);
}

async function probarProductorDeCampo(m: Mundo) {
  const p = await proyectoConDeuda(m);
  // Dirección le guarda todo en «editar» al productor de campo: ningún importe igual.
  for (const modulo of ["costos", "cotizaciones", "proveedores", "pagos", "direccion"]) await m.duenio.proyectoPermiso.create({ data: { tenantId: m.a.id, rol: "PRODUCCION_CAMPO", modulo, ver: true, editar: true } });
  const SIN_IMPORTES = {
    vista: { costos: false, editaCostos: false, pagos: false, editaPagos: false, cobros: false, deudas: false, importes: false },
    finanzas: null,
    resumen: null,
    ficha: [{ venta: null, costo: null }],
  };
  const obtenido: Record<string, unknown> = {};
  for (const clave of ["PRODUCCION_CAMPO/PROFESSIONAL", "PRODUCCION_CAMPO/RECEPTION"]) obtenido[clave] = await leerProyecto(m, clave, p.id);
  assert.deepEqual(obtenido, { "PRODUCCION_CAMPO/PROFESSIONAL": SIN_IMPORTES, "PRODUCCION_CAMPO/RECEPTION": SIN_IMPORTES });
}

async function probarAdministracion(m: Mundo) {
  const { passwordHash } = await m.duenio.user.findUniqueOrThrow({ where: { id: m.a.duenia.id }, select: { passwordHash: true } });
  const u = await m.duenio.user.create({ data: { tenantId: m.a.id, name: "MIA-237 ADMINISTRACION/OWNER", email: "mia237-administracion-owner@negocio-a.erp.test", passwordHash, role: "OWNER" }, select: { id: true } });
  await m.duenio.proyectoPersona.create({ data: { tenantId: m.a.id, userId: u.id, nombre: "MIA-237 ADMINISTRACION/OWNER", rol: "ADMINISTRACION" } });
  m.registrar("ADMINISTRACION/OWNER", u.id);
  const { canCurrentUser } = await import("@/lib/authz");
  const { veLaPlata } = await import("./datos.server");
  const { requireCapability } = await import("@/lib/authz");
  const usuarios = await import("@/lib/user-actions");
  const mira = async (clave: string) => {
    const r = await m.como(clave, async () => ({ usuarios: await canCurrentUser("users:manage"), facturacion: await canCurrentUser("billing:manage"), plata: await veLaPlata(await requireCapability("agenda:read")) }));
    assert.equal(r.tipo, "respuesta", `${clave}: ${JSON.stringify(r)}`);
    return (r as { valor: unknown }).valor;
  };
  assert.deepEqual({ adm: await mira("ADMINISTRACION/OWNER"), duenia: await mira("DIRECCION/OWNER") }, {
    adm: { usuarios: false, facturacion: true, plata: true },
    duenia: { usuarios: true, facturacion: true, plata: true },
  });
  // Y la acción: no da de alta a nadie (redirige sin escribir).
  const antes = await m.duenio.user.count({ where: { tenantId: m.a.id } });
  const r = await m.como("ADMINISTRACION/OWNER", () => usuarios.createUser(form({ name: "Colado", email: "colado-mia237@negocio-a.erp.test", role: "DUENIO", password: "Provisoria-123456" })));
  assert.notEqual(r.tipo, "respuesta", `createUser como Administración: ${JSON.stringify(r)}`);
  assert.equal(await m.duenio.user.count({ where: { tenantId: m.a.id } }), antes);
}

async function probarPuertasMia236(m: Mundo) {
  const gestion = await import("./acciones-gestion");
  const fichaAcc = await import("./acciones-ficha");
  const taller = await import("@/lib/taller-stands/acciones");
  // 1 · el % de anticipo del proveedor (regenera las cuotas de PAGO de los proyectos abiertos): sólo con la plata.
  const prov = (await m.como("DIRECCION/OWNER", () => gestion.guardarProveedor(form({ name: unico("Proveedor anticipo"), anticipoPct: "50", evaluacion: "4", moneda: "ARS" })))) as { tipo: string; valor: { ok: boolean; id: string } };
  assert.ok(prov.tipo === "respuesta" && prov.valor.ok, JSON.stringify(prov));
  const id = prov.valor.id;
  const pct = async () => (await m.duenio.proyectoProveedorFicha.findFirstOrThrow({ where: { supplierId: id }, select: { anticipoPct: true } })).anticipoPct;
  const huecos: string[] = [];
  for (const clave of ["PRODUCCION/PROFESSIONAL", "PRODUCCION/RECEPTION", "PRODUCCION/OWNER"]) {
    const r = await intentar(m, clave, () => gestion.guardarProveedor(form({ id, name: "Proveedor anticipo cambiado", anticipoPct: "90", evaluacion: "4", moneda: "ARS" })));
    if (r.paso || (await pct()) !== 50) huecos.push(`${clave}: ${r.salida}`);
  }
  // Producción sigue editando el proveedor si no toca el % (sin el campo, o con el mismo valor).
  const sinPct = await intentar(m, "PRODUCCION/PROFESSIONAL", () => gestion.guardarProveedor(form({ id, name: "Proveedor anticipo (Producción)", evaluacion: "5", moneda: "ARS" })));
  assert.ok(sinPct.paso, `Producción edita el proveedor sin tocar el %: ${sinPct.salida}`);
  assert.equal(await pct(), 50, "sin el campo, el % queda como estaba");
  // Control: Administración sí lo cambia.
  const adm = await intentar(m, "ADMINISTRACION/RECEPTION", () => gestion.guardarProveedor(form({ id, name: "Proveedor anticipo", anticipoPct: "30", evaluacion: "4", moneda: "ARS" })));
  assert.ok(adm.paso, adm.salida);
  assert.equal(await pct(), 30);
  // 2 · el costo de un ítem en borrador: no el productor comercial (ve, no cambia) ni el de campo (aunque Dirección le guarde
  // «Costos · editar» y «Ficha · editar», que el puesto no deja).
  await m.duenio.proyectoPermiso.create({ data: { tenantId: m.a.id, rol: "PRODUCCION_CAMPO", modulo: "ficha", ver: true, editar: true } }).catch(() => undefined);
  const p = await m.proyecto();
  const borrador = await m.duenio.proyectoPresupuesto.create({ data: { tenantId: m.a.id, proyectoId: p.id, version: 2, estado: "BORRADOR", token: unico("mia237"), ivaPct: 21 }, select: { id: true } });
  const item = await m.duenio.proyectoItem.create({ data: { tenantId: m.a.id, presupuestoId: borrador.id, rubro: "General", descripcion: "Stand", cantidad: 1, costo: 100, precio: 0 }, select: { id: true } });
  const costo = async () => (await m.duenio.proyectoItem.findUniqueOrThrow({ where: { id: item.id }, select: { costo: true } })).costo;
  for (const clave of ["COMERCIAL/RECEPTION", "PRODUCCION_CAMPO/PROFESSIONAL", "PRODUCCION_CAMPO/RECEPTION"]) {
    const r = await intentar(m, clave, () => fichaAcc.guardarCampoItem({ id: item.id, campo: "costo", valor: "999" }));
    if (r.paso || (await costo()) !== 100) huecos.push(`guardarCampoItem «costo» como ${clave}: ${r.salida}`);
  }
  // Control: Producción (presupuesta, P3) sí.
  const prod = await intentar(m, "PRODUCCION/PROFESSIONAL", () => fichaAcc.guardarCampoItem({ id: item.id, campo: "costo", valor: "150" }));
  assert.ok(prod.paso && (await costo()) === 150, `Producción cambia el costo: ${prod.salida}`);
  // 3 · el despiece al presupuesto escribe costos: pide «Costos · editar» antes que nada (ni el comercial ni el de campo).
  for (const clave of ["COMERCIAL/RECEPTION", "PRODUCCION_CAMPO/PROFESSIONAL"]) {
    const r = await m.como(clave, () => taller.despieceAlPresupuesto(form({ proyectoId: p.id })));
    const aviso = r.tipo === "redireccion" ? decodeURIComponent(r.destino) : JSON.stringify(r);
    if (!/escribe costos/.test(aviso)) huecos.push(`despieceAlPresupuesto como ${clave}: ${aviso}`);
  }
  const ctrl = await m.como("PRODUCCION/PROFESSIONAL", () => taller.despieceAlPresupuesto(form({ proyectoId: p.id })));
  assert.ok(ctrl.tipo === "redireccion" && !/escribe costos/.test(decodeURIComponent(ctrl.destino)), `Producción no frena por costos: ${JSON.stringify(ctrl)}`);
  assert.deepEqual(huecos, []);
}

/** MIA-229 · lo que no pasaba por `veLaPlata` (certificación GSG-PR214-v4, X3): lecturas de proveedores, la vista de la
 *  ficha (pestaña Finanzas) y «Empresa · editar» guardado por Dirección. Corre como el usuario, con `app_rls`. */
async function probarLecturasDePlata(m: Mundo) {
  const gestion = await import("./gestion.server");
  const lecturas = await import("./gestion-lecturas.server");
  const { vistaDe } = await import("./ficha.server");
  const empresa = await import("./acciones-empresa");
  // Una deuda con el proveedor en un proyecto donde está todo el equipo: cuota de pago pendiente de $ 1.234.
  // Proveedor propio: en la corrida completa, las filas de arriba le cargan comprobantes al proveedor del mundo.
  const supplierId = (await m.duenio.supplier.create({ data: { tenantId: m.a.id, name: "Proveedor MIA-229" }, select: { id: true } })).id;
  const p = await m.proyecto();
  await m.duenio.proyectoCuota.create({ data: { tenantId: m.a.id, proyectoId: p.id, tipo: "PAGO", concepto: unico("Pago proveedor"), monto: 1234, moneda: "ARS", venceEl: EVENTO, supplierId, prevista: false, auto: false } });
  // Dirección le guarda «Empresa · editar» y «Liquidaciones · editar» a Producción: no tiene que servir.
  for (const modulo of ["empresa", "liquidaciones"]) await m.duenio.proyectoPermiso.create({ data: { tenantId: m.a.id, rol: "PRODUCCION", modulo, ver: true, editar: true } });
  const leer = async (clave: string) => {
    const r = await m.como(clave, async () => {
      const a = await gestion.actorActual();
      const lista = await lecturas.listaDeProveedores(a, {});
      const detalle = await lecturas.detalleDeProveedor(a, supplierId);
      const v = vistaDe(a);
      return {
        lista: { verPlata: lista.verPlata, debe: lista.proveedores.find((x) => x.id === supplierId)?.debe ?? 0, porPagarCuotas: lista.porPagarCuotas },
        detalle: { verPlata: detalle?.verPlata, debe: detalle?.debe },
        finanzas: { pagos: v.pagos, editaPagos: v.editaPagos, costos: v.costos },
        empresa: { ver: gestion.puede(a, "empresa", "ver"), editar: gestion.puede(a, "empresa", "editar"), liquidaciones: gestion.puede(a, "liquidaciones", "editar") },
      };
    });
    assert.equal(r.tipo, "respuesta", `${clave}: ${JSON.stringify(r)}`);
    return (r as { valor: unknown }).valor;
  };
  const SIN = {
    lista: { verPlata: false, debe: 0, porPagarCuotas: 0 },
    detalle: { verPlata: false, debe: 0 },
    // P3 (ORQ-007, 20/11): Producción arma presupuestos, ve costos; cobros, pagos y deudas, no.
    finanzas: { pagos: false, editaPagos: false, costos: true },
    empresa: { ver: false, editar: false, liquidaciones: false },
  };
  const obtenido: Record<string, unknown> = {};
  for (const clave of ["PRODUCCION/RECEPTION", "PRODUCCION/PROFESSIONAL", "PRODUCCION/OWNER"]) obtenido[clave] = await leer(clave);
  assert.deepEqual(obtenido, { "PRODUCCION/RECEPTION": SIN, "PRODUCCION/PROFESSIONAL": SIN, "PRODUCCION/OWNER": SIN });
  // Y la acción: con «Empresa · editar» guardado, Producción no crea un pago de la empresa ni el libro cambia.
  const r = await intentar(m, "PRODUCCION/RECEPTION", () => empresa.crearPagoEmpresa(form({ tipo: "PAGO", concepto: unico("Alquiler"), monto: "100", venceEl: "2027-01-10" })));
  assert.ok(!r.paso && !r.escribio, `crearPagoEmpresa como PRODUCCION/RECEPTION con «Empresa · editar» guardado: ${r.salida}`);
  // Control: Administración sí ve la deuda (la sonda no está ciega).
  const adm = (await leer("ADMINISTRACION/RECEPTION")) as typeof SIN;
  assert.equal(adm.lista.verPlata, true);
  assert.equal(adm.lista.debe, 1234);
  assert.equal(adm.finanzas.pagos, true);
}

/** Condición (a) de ORQ-007: la traba no rompe rendir lo propio. Rinde, y la rendición queda registrada. */
async function probarRendicionesPropias(m: Mundo) {
  const { rendirGasto } = await import("./acciones-rendiciones");
  const FOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQ==";
  const p = await m.proyecto();
  for (const [clave, uuid] of [["PRODUCCION/PROFESSIONAL", "229c1a9e-6b7d-4c1e-9a0b-000000000001"], ["PRODUCCION_CAMPO/PROFESSIONAL", "229c1a9e-6b7d-4c1e-9a0b-000000000002"]] as const) {
    const antes = await m.duenio.proyectoRendicion.count({ where: { tenantId: m.a.id, proyectoId: p.id } });
    const r = await m.como(clave, () => rendirGasto(form({ proyectoId: p.id, clave: uuid, descripcion: "Taxi al predio", monto: "12.500", medio: "PROPIO", fecha: HOY, foto: FOTO })));
    assert.deepEqual(r.tipo === "respuesta" ? r.valor : r, { ok: true }, clave);
    assert.equal(await m.duenio.proyectoRendicion.count({ where: { tenantId: m.a.id, proyectoId: p.id } }), antes + 1, clave);
  }
}

/** MIA-223 · `veLaPlata` de Proyectos: sólo Dirección y Administración (y el techo del ERP sigue). Corre dentro del test
 *  de la matriz, sobre el mismo mundo (los usuarios tienen mail fijo). */
async function probarVeLaPlata(m: Mundo) {
  const { veLaPlata } = await import("./datos.server");
  const { requireCapability } = await import("@/lib/authz");
  const ve = async (clave: string) => {
    const r = await m.como(clave, async () => veLaPlata(await requireCapability("agenda:read")));
    assert.equal(r.tipo, "respuesta", `${clave}: ${JSON.stringify(r)}`);
    return (r as { valor: boolean }).valor;
  };
  const esperado: Record<string, boolean> = {
    "DIRECCION/OWNER": true, // la dueña sin ficha entra como Dirección
    "DIRECCION/RECEPTION": true,
    "ADMINISTRACION/RECEPTION": true,
    "PRODUCCION/OWNER": false,
    "PRODUCCION/RECEPTION": false,
    [`${PUESTO_CON_PAGOS}/RECEPTION`]: false, // con «Pagos · editar» guardado
    "COMERCIAL/RECEPTION": false,
    "SIN_FICHA/RECEPTION": false,
    "ADMINISTRACION/PROFESSIONAL": false, // el techo del ERP sigue: PROFESSIONAL no tiene «agenda:manage»
  };
  // ADMINISTRACION/PROFESSIONAL no está en la grilla: se crea acá.
  const { passwordHash } = await m.duenio.user.findUniqueOrThrow({ where: { id: m.a.duenia.id }, select: { passwordHash: true } });
  const u = await m.duenio.user.create({ data: { tenantId: m.a.id, name: "MIA-223 ADMINISTRACION/PROFESSIONAL", email: "mia223-administracion-professional@negocio-a.erp.test", passwordHash, role: "PROFESSIONAL" }, select: { id: true } });
  await m.duenio.proyectoPersona.create({ data: { tenantId: m.a.id, userId: u.id, nombre: "MIA-223 ADMINISTRACION/PROFESSIONAL", rol: "ADMINISTRACION" } });
  m.registrar("ADMINISTRACION/PROFESSIONAL", u.id);
  const obtenido: Record<string, boolean> = {};
  for (const clave of Object.keys(esperado)) obtenido[clave] = await ve(clave);
  assert.deepEqual(obtenido, esperado);
}

/**
 * MIA-238 · «ve sólo lo cobrado y lo que falta cobrar de sus proyectos» (dueño, 20/11 13:05Z, opción B). Sus proyectos =
 * donde está en el equipo (`ProyectoEquipo`: quien crea el proyecto entra como «Responsable», acciones-ficha.ts). Se lee
 * como la pantalla: el actor del proyecto (`actorDelProyecto`) y su vista. Hecho a mano: el mismo proyecto de $ 1.210 por
 * cobrar y $ 400 de costo; afuera del equipo, ni un importe de cobros ni de costos.
 */
async function probarComercialAjeno(m: Mundo) {
  const gestion = await import("./gestion.server");
  const ficha = await import("./ficha.server");
  const precio = await import("./acciones-precio");
  const p = await proyectoConDeuda(m);
  const fuera = ["COMERCIAL/RECEPTION", "COMERCIAL/PROFESSIONAL"].map((c) => m.persona(c));
  await m.duenio.proyectoEquipo.deleteMany({ where: { proyectoId: p.id, personaId: { in: fuera } } });
  const leer = async (clave: string) => {
    const r = await m.como(clave, async () => {
      const yo = await gestion.actorActual();
      const delProyecto = (gestion as { actorDelProyecto?: (a: typeof yo, id: string) => Promise<typeof yo> }).actorDelProyecto;
      const a = delProyecto ? await delProyecto(yo, p.id) : yo;
      const cab = await ficha.cabeceraFicha(a, p.id);
      assert.ok(cab, `${clave} sigue viendo el proyecto (el lead)`);
      const v = ficha.vistaDe(a);
      const res = await ficha.datosResumen(a, cab, v);
      const fi = await ficha.datosFicha(a, cab, v);
      return {
        vista: { costos: v.costos, cobros: v.cobros, deudas: v.deudas, pagos: v.pagos },
        resumen: res.finanzas && { cobrado: res.finanzas.cobrado },
        costos: fi.filas.map((f) => (f as { costo?: number }).costo ?? null),
      };
    });
    assert.equal(r.tipo, "respuesta", `${clave}: ${JSON.stringify(r)}`);
    return (r as { valor: unknown }).valor;
  };
  const AJENO = { vista: { costos: false, cobros: false, deudas: false, pagos: false }, resumen: null, costos: [null] };
  assert.deepEqual({ rec: await leer("COMERCIAL/RECEPTION"), prof: await leer("COMERCIAL/PROFESSIONAL") }, { rec: AJENO, prof: AJENO });
  // Control: Dirección, en el mismo proyecto, ve los $ 400 de costo y la cobranza (la sonda no está ciega).
  const dir = (await leer("DIRECCION/OWNER")) as typeof AJENO;
  assert.deepEqual(dir.costos, [400]);
  assert.equal(dir.vista.cobros, true);
  // Llamada directa: el precio por total (muestra costos) no se guarda en un proyecto ajeno, aunque tenga «Cotizaciones · editar».
  const antes = await m.duenio.proyectoPrecio.count({ where: { proyectoId: p.id } });
  const r = await m.como("COMERCIAL/RECEPTION", () => precio.guardarPrecio(form({ proyectoId: p.id, modo: "total", totalPersonas: "1000" })));
  const valor = r.tipo === "respuesta" ? (r.valor as { ok: boolean; error?: string }) : null;
  assert.equal(valor?.ok, false, `guardarPrecio en un proyecto ajeno: ${JSON.stringify(r)}`);
  assert.match(valor?.error ?? "", /costos/);
  assert.equal(await m.duenio.proyectoPrecio.count({ where: { proyectoId: p.id } }), antes);
}

/**
 * MIA-238 · la Dueña (puesto «Dueño/a» del alta: OWNER sin ficha) entra como Dirección. Una OWNER cuya ficha de otro puesto
 * está de baja NO es la Dueña: no hereda Dirección (rol SIN_FICHA) ni administra usuarios. Una OWNER cuya única ficha es de
 * Dirección y está de baja sigue como antes (Dirección): nadie pierde lo que ya tenía por puesto.
 */
async function probarOwnerDeBaja(m: Mundo) {
  const { passwordHash } = await m.duenio.user.findUniqueOrThrow({ where: { id: m.a.duenia.id }, select: { passwordHash: true } });
  const gestion = await import("./gestion.server");
  const { canCurrentUser } = await import("@/lib/authz");
  const alta = async (clave: string, rol: RolGestion) => {
    const u = await m.duenio.user.create({ data: { tenantId: m.a.id, name: `MIA-238 ${clave}`, email: `mia238-${clave.replace("/", "-").toLowerCase()}@negocio-a.erp.test`, passwordHash, role: "OWNER" }, select: { id: true } });
    await m.duenio.proyectoPersona.create({ data: { tenantId: m.a.id, userId: u.id, nombre: `MIA-238 ${clave}`, rol, activa: false } });
    m.registrar(clave, u.id);
  };
  await alta("ADMINISTRACION-BAJA/OWNER", "ADMINISTRACION");
  await alta("DIRECCION-BAJA/OWNER", "DIRECCION");
  const mira = async (clave: string) => {
    const r = await m.como(clave, async () => ({ rol: (await gestion.actorActual()).rol, usuarios: await canCurrentUser("users:manage") }));
    assert.equal(r.tipo, "respuesta", `${clave}: ${JSON.stringify(r)}`);
    return (r as { valor: unknown }).valor;
  };
  assert.deepEqual(
    { adm: await mira("ADMINISTRACION-BAJA/OWNER"), dir: await mira("DIRECCION-BAJA/OWNER"), duenia: await mira("DIRECCION/OWNER") },
    { adm: { rol: "SIN_FICHA", usuarios: false }, dir: { rol: "DIRECCION", usuarios: true }, duenia: { rol: "DIRECCION", usuarios: true } },
  );
}

/**
 * MIA-239 · «ve sólo lo cobrado y lo que falta cobrar de sus proyectos» (opción B, lectura de ORQ-007): en un proyecto ajeno
 * (fuera de su `ProyectoEquipo`) el productor comercial no ve NINGÚN importe, tampoco la venta, ni edita cotizaciones,
 * precio, reparto, el estimado o el equipo (sumarse al equipo le abriría la plata). Ve el lead: nombre, cliente y etapa.
 * Mismo control de MIA-238 (`actorDelProyecto` / `veLaPlataDelProyecto`). Hecho a mano: ítem de $ 1.000 de venta.
 */
async function probarComercialVentaAjena(m: Mundo) {
  const gestion = await import("./gestion.server");
  const ficha = await import("./ficha.server");
  const ia = await import("./ia.server");
  const accFicha = await import("./acciones-ficha");
  const ajeno = await m.proyecto();
  const propio = await m.proyecto();
  const yo = m.persona("COMERCIAL/RECEPTION");
  const fuera = ["COMERCIAL/RECEPTION", "COMERCIAL/PROFESSIONAL"].map((c) => m.persona(c));
  await m.duenio.proyectoEquipo.deleteMany({ where: { proyectoId: ajeno.id, personaId: { in: fuera } } });
  await m.duenio.proyecto.update({ where: { id: ajeno.id }, data: { presupuestoEstimado: 5000 } });
  const leer = async (clave: string) => {
    const r = await m.como(clave, async () => {
      const a0 = await gestion.actorActual();
      const tarjetas = await ficha.tableroPipeline(a0);
      const tarjeta = (id: string) => {
        const t = tarjetas.find((x) => x.id === id);
        assert.ok(t, `${clave} ve el lead ${id} en el Pipeline`);
        return { venta: t.venta ?? null, ventaTexto: t.ventaTexto ?? null, nombre: !!t.nombre, cliente: !!t.cliente, etapa: !!t.etapa };
      };
      const a = await gestion.actorDelProyecto(a0, ajeno.id);
      const cab = await ficha.cabeceraFicha(a, ajeno.id);
      assert.ok(cab, `${clave} sigue viendo el proyecto (el lead)`);
      const v = ficha.vistaDe(a);
      const fi = await ficha.datosFicha(a, cab, v);
      const contexto = await ia.contextoDeAgente(a0, "analista", ajeno.id);
      return {
        pipelineAjeno: tarjeta(ajeno.id),
        pipelinePropio: tarjeta(propio.id).venta,
        vista: { importes: v.importes, cotizaciones: v.cotizaciones, editaCotizaciones: v.editaCotizaciones, fichaEdita: v.fichaEdita },
        ventaFicha: fi.filas.map((f) => (f as { venta?: number }).venta ?? null),
        iaConVenta: /venta/i.test(contexto),
      };
    });
    assert.equal(r.tipo, "respuesta", `${clave}: ${JSON.stringify(r)}`);
    return (r as { valor: Record<string, unknown> }).valor;
  };
  const AJENO = {
    pipelineAjeno: { venta: null, ventaTexto: null, nombre: true, cliente: true, etapa: true },
    pipelinePropio: 1000,
    vista: { importes: false, cotizaciones: false, editaCotizaciones: false, fichaEdita: false },
    ventaFicha: [null],
    iaConVenta: false,
  };
  assert.deepEqual({ rec: await leer("COMERCIAL/RECEPTION"), prof: await leer("COMERCIAL/PROFESSIONAL") }, { rec: AJENO, prof: AJENO });
  // Control: Dirección, en el mismo proyecto, ve la venta de $ 1.000 en el Pipeline, la ficha y la IA (la sonda no está ciega).
  const dir = await leer("DIRECCION/OWNER");
  assert.deepEqual([(dir.pipelineAjeno as { venta: number }).venta, dir.ventaFicha, dir.iaConVenta], [1000, [1000], true]);

  // Llamadas directas, como Comercial con «Cotizaciones · editar» y «Pipeline · editar» de fábrica.
  const versiones = () => m.duenio.proyectoPresupuesto.count({ where: { proyectoId: ajeno.id } });
  const antesVersiones = await versiones();
  const nv = await m.como("COMERCIAL/RECEPTION", () => accFicha.nuevaVersion(form({ proyectoId: ajeno.id })));
  const nvValor = nv.tipo === "respuesta" ? (nv.valor as { ok: boolean; error?: string }) : null;
  assert.equal(nvValor?.ok, false, `nuevaVersion en un proyecto ajeno: ${JSON.stringify(nv)}`);
  assert.match(nvValor?.error ?? "", /permiso/);
  assert.equal(await versiones(), antesVersiones);
  // Sumarse al equipo de un proyecto ajeno le abriría la plata: no.
  const eq = await m.como("COMERCIAL/RECEPTION", () => accFicha.asignarEquipo(form({ proyectoId: ajeno.id, personaId: yo, funcion: "" })));
  assert.equal(eq.tipo === "respuesta" ? (eq.valor as { ok: boolean }).ok : null, false, `asignarEquipo en un proyecto ajeno: ${JSON.stringify(eq)}`);
  assert.equal(await m.duenio.proyectoEquipo.count({ where: { proyectoId: ajeno.id, personaId: yo } }), 0);
  // El estimado y el anticipo son plata: guardar los datos del lead no los toca.
  const dd = await m.como("COMERCIAL/RECEPTION", () => accFicha.guardarDatos(form({ id: ajeno.id, nombre: "Lead renombrado", moneda: "ARS", presupuestoEstimado: "999999", anticipoClientePct: "10" })));
  assert.equal(dd.tipo, "respuesta", JSON.stringify(dd));
  const tras = await m.duenio.proyecto.findUniqueOrThrow({ where: { id: ajeno.id }, select: { nombre: true, presupuestoEstimado: true, anticipoClientePct: true } });
  assert.deepEqual(tras, { nombre: "Lead renombrado", presupuestoEstimado: 5000, anticipoClientePct: 50 });
  // Control: en su propio proyecto, la misma llamada sí llega al negocio (no la frena el permiso).
  const nvPropio = await m.como("COMERCIAL/RECEPTION", () => accFicha.nuevaVersion(form({ proyectoId: propio.id })));
  assert.doesNotMatch(nvPropio.tipo === "respuesta" ? ((nvPropio.valor as { error?: string }).error ?? "") : "", /permiso/);
}
