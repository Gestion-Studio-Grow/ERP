// Tests del motor de la gestión de TESVO (public/previews/tesvo/gestion/motor.mjs).
// Una fila de la matriz de eventualidades de docs/tenants/tesvo/REINGENIERIA-AEROBOX.md = al menos un test.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as motor from "../../../public/previews/tesvo/gestion/motor.mjs";

// El motor es JS plano (el navegador lo carga tal cual, sin build): los tipos que TypeScript infiere del JS
// son demasiado estrechos para un test que arma escenarios a mano, así que acá se usa sin tipar.
/* eslint-disable @typescript-eslint/no-explicit-any -- ver la nota de arriba: todo este archivo opera sobre el motor sin tipos */
const M: any = motor;

const HOY = "2026-10-15";
const ATENCION = { usuarioId: "u-sole" };
const DEPOSITO = { usuarioId: "u-nico" };
const DUENIO = { usuarioId: "u-duenio", pin: "9999" };

function base() {
  return M.crearEstado({
    clientes: [
      { id: "ana", nombre: "Ana Gómez", tipo: "persona", doc: "27-1", casilla: "TV-1001" },
      { id: "beto", nombre: "Beto Díaz", tipo: "persona", doc: "20-2", casilla: "TV-1002" },
      { id: "pyme", nombre: "Pinturería Sur SA", tipo: "pyme", doc: "30-3", casilla: "TV-1003" },
    ],
  });
}

const item = (valorUsd: number, extra: object = {}) => ({ descripcion: "Producto", valorCentavos: Math.round(valorUsd * 100), ...extra });

/** Cotiza, confirma y (si se pide) cobra la seña: devuelve el envío. */
function envioCon(E: any, clienteId: string, pedido: object, { senia = true, fecha = HOY } = {}) {
  const q = M.guardarCotizacion(E, pedido, { clienteId }, ATENCION, fecha);
  assert.ok(q.ok, q.motivo);
  const c = M.confirmarEnvio(E, { cotizacionId: q.cotizacion.id, clienteId }, ATENCION, fecha);
  assert.ok(c.ok, c.motivo);
  if (senia) {
    const monto = M.aPesos(Math.ceil(M.totalEnvio(c.envio) * 0.3) + 100, E.config.tipoCambio);
    assert.ok(M.cobrar(E, c.envio.id, { medio: "transferencia", monto }, ATENCION, fecha).ok);
  }
  return c.envio;
}

/** Envío Miami aéreo de 1 kg con su paquete recibido y pre-alertado. */
function enDeposito(E: any, clienteId = "ana", { valor = 100, gramos = 1000, medidas = { l: 20, a: 15, h: 10 }, tracking = "TRK000001", fecha = HOY } = {}) {
  const e = envioCon(E, clienteId, { tarifaId: "miami-aereo", items: [item(valor)], gramos, medidas }, { fecha });
  M.prealertar(E, e.id, { tracking }, fecha);
  assert.ok(M.recibirPaquete(E, { tracking, gramos, medidas }, DEPOSITO, fecha).ok);
  return e;
}

// ── Cotización y régimen ──

test("peso que se cobra: el mayor entre real y volumétrico, con el mínimo de la ruta", () => {
  const E = base();
  const t = M.tarifa(E, "miami-aereo");
  assert.equal(M.pesoVolumetrico({ l: 50, a: 40, h: 30 }, 5000), 12000);
  assert.equal(M.pesoACobrar(t, { gramos: 3000, medidas: { l: 50, a: 40, h: 30 } }), 12000);
  assert.equal(M.pesoACobrar(t, { gramos: 300 }), 1000); // mínimo 1 kg
  const r = M.cotizar(E, { tarifaId: "miami-aereo", items: [item(100)], gramos: 2000 });
  assert.equal(r.cotizacion.flete, 5000); // 2 kg × US$ 25
});

test("franquicia: hasta US$ 400 FOB sólo IVA; el excedente paga derechos y tasa de estadística", () => {
  const E = base();
  const dentro = M.impuestosCourier(E.regimen, 30000, 35000);
  assert.equal(dentro.derechos, 0);
  assert.equal(dentro.tasa, 0);
  assert.equal(dentro.iva, 7350); // 21 % de US$ 350 (CIF): el IVA se paga igual
  const fuera = M.impuestosCourier(E.regimen, 100000, 105000);
  assert.equal(fuera.excedente, 60000);
  assert.equal(fuera.derechos, 12000); // 20 % DEMO sobre US$ 600
  assert.equal(fuera.tasa, 1800); // 3 % de US$ 600
  assert.equal(fuera.iva, Math.round((105000 + 12000 + 1800) * 0.21));
});

test("la tasa de estadística tiene tope (US$ 180)", () => {
  const E = base();
  assert.equal(M.impuestosCourier(E.regimen, 290000, 290000, { conFranquicia: false }).tasa, 8700);
  assert.equal(M.impuestosCourier(E.regimen, 1000000, 1000000, { conFranquicia: false }).tasa, E.regimen.topeTasaEstadisticaCentavos);
});

test("empresa por courier: sin franquicia y con el aviso de que el despachante suele convenir", () => {
  const E = base();
  const r = M.cotizar(E, { tarifaId: "miami-aereo", items: [item(300)], gramos: 1000, clienteId: "pyme" });
  assert.equal(r.cotizacion.impuestos.conFranquicia, false);
  assert.ok(r.cotizacion.impuestos.derechos > 0);
  assert.ok(r.avisos.some((a: any) => a.tipo === "pyme" && !a.grave));
  assert.equal(r.bloqueado, false);
});

test("cupo: pasados los 5 envíos con franquicia del año se puede seguir, pero paga sobre el total", () => {
  const E = base();
  for (let i = 0; i < 5; i++) envioCon(E, "ana", { tarifaId: "miami-aereo", items: [item(50)], gramos: 1000 });
  assert.deepEqual({ ...M.cupoCourier(E, "ana"), aplica: true }, { usados: 5, total: 5, quedan: 0, aplica: true });
  const r = M.cotizar(E, { tarifaId: "miami-aereo", items: [item(300)], gramos: 1000, clienteId: "ana" });
  assert.equal(r.cotizacion.impuestos.conFranquicia, false);
  assert.ok(r.avisos.some((a: any) => a.tipo === "cupo"));
  assert.equal(r.bloqueado, false);
});

test("un envío cancelado no consume cupo", () => {
  const E = base();
  const e = envioCon(E, "ana", { tarifaId: "miami-aereo", items: [item(50)], gramos: 1000 }, { senia: false });
  assert.equal(M.cupoCourier(E, "ana").usados, 1);
  assert.ok(M.cancelarEnvio(E, e.id, {}, ATENCION, HOY).ok);
  assert.equal(M.cupoCourier(E, "ana").usados, 0);
});

test("más de US$ 3.000 o más de 3 unidades iguales: no va por courier", () => {
  const E = base();
  const tope = M.cotizar(E, { tarifaId: "miami-aereo", items: [item(3100)], gramos: 1000 });
  assert.equal(tope.bloqueado, true);
  assert.ok(tope.avisos.some((a: any) => a.tipo === "tope"));
  const unidades = M.cotizar(E, { tarifaId: "miami-aereo", items: [item(20, { unidades: 4, descripcion: "Remera" })], gramos: 1000 });
  assert.equal(unidades.bloqueado, true);
  assert.match(unidades.avisos.find((a: any) => a.tipo === "unidades").texto, /Remera/);
  // Por despachante, el mismo pedido sí se cotiza (con el honorario del despachante).
  const general = M.cotizar(E, { tarifaId: "miami-aereo", regimen: "general", items: [item(3100)], gramos: 1000 });
  assert.equal(general.bloqueado, false);
  assert.equal(general.cotizacion.despachante, E.config.despachanteCentavos);
});

test("China marítimo va sólo con despachante y se cobra por metro cúbico con mínimo", () => {
  const E = base();
  assert.match(M.cotizar(E, { tarifaId: "china-maritimo", regimen: "courier", items: [item(500)] }).motivo, /despachante/);
  const r = M.cotizar(E, { tarifaId: "china-maritimo", items: [item(5000)], medidas: { l: 50, a: 50, h: 50 } });
  assert.equal(r.cotizacion.regimen, "general");
  assert.equal(r.cotizacion.cbmMilesimas, 1000); // 0,125 m³ → mínimo 1 m³
  assert.equal(r.cotizacion.flete, 45000);
});

test("productos restringidos avisan; los prohibidos bloquean la cotización", () => {
  const E = base();
  const bat = M.cotizar(E, { tarifaId: "miami-aereo", items: [item(30, { categoria: "baterias" })], gramos: 1000 });
  assert.equal(bat.bloqueado, false);
  assert.ok(bat.avisos.some((a: any) => a.tipo === "restringido"));
  const med = M.cotizar(E, { tarifaId: "miami-aereo", items: [item(30, { categoria: "medicamentos" })], gramos: 1000 });
  assert.equal(med.bloqueado, true);
});

test("una cotización vencida no se confirma: se recotiza con el cambio de hoy", () => {
  const E = base();
  const q = M.guardarCotizacion(E, { tarifaId: "miami-aereo", items: [item(100)], gramos: 1000 }, { clienteId: "ana" }, ATENCION, "2026-10-01").cotizacion;
  assert.equal(q.vence, "2026-10-04");
  assert.match(M.confirmarEnvio(E, { cotizacionId: q.id }, ATENCION, HOY).motivo, /venció/);
  assert.ok(M.confirmarEnvio(E, { cotizacionId: q.id }, ATENCION, "2026-10-03").ok);
  assert.match(M.confirmarEnvio(E, { cotizacionId: q.id }, ATENCION, "2026-10-03").motivo, /ya se usó/);
});

test("para confirmar hace falta la ficha del cliente", () => {
  const E = base();
  const q = M.guardarCotizacion(E, { tarifaId: "miami-aereo", items: [item(100)], gramos: 1000 }, { contacto: "Consulta" }, ATENCION, HOY).cotizacion;
  assert.match(M.confirmarEnvio(E, { cotizacionId: q.id }, ATENCION, HOY).motivo, /ficha del cliente/);
  assert.ok(M.confirmarEnvio(E, { cotizacionId: q.id, clienteId: "beto" }, ATENCION, HOY).ok);
});

// ── Plata ──

test("la seña congela el tipo de cambio para el saldo; sin seña se cobra al cambio del día", () => {
  const E = base();
  const e = envioCon(E, "ana", { tarifaId: "miami-aereo", items: [item(200)], gramos: 1000 });
  assert.equal(e.tcCongelado, 1450);
  assert.equal(e.estado, "esperando");
  M.cambiarTipoCambio(E, 1600, DUENIO, HOY);
  assert.equal(M.tcParaCobrar(E, e), 1450);
  const sin = envioCon(E, "beto", { tarifaId: "miami-aereo", items: [item(200)], gramos: 1000 }, { senia: false });
  assert.equal(M.tcParaCobrar(E, sin), 1600);
});

test("no se cobra más que el saldo; los dólares billete entran en dólares", () => {
  const E = base();
  const e = envioCon(E, "ana", { tarifaId: "miami-aereo", items: [item(200)], gramos: 1000 });
  const saldo = M.saldoEnvio(e);
  assert.match(M.cobrar(E, e.id, { medio: "usd_efectivo", monto: saldo + 1000 }, ATENCION, HOY).motivo, /más que el saldo/);
  const r = M.cobrar(E, e.id, { medio: "usd_efectivo", monto: saldo }, ATENCION, HOY);
  assert.ok(r.ok);
  assert.equal(r.saldo, 0);
  assert.equal(E.caja[0].moneda, "USD");
  assert.equal(M.cobrar(E, e.id, { medio: "transferencia", monto: 0 }, ATENCION, HOY).ok, false);
});

test("invariante: lo pagado nunca supera el total y el saldo es total − pagado", () => {
  const E = M.generarDemo(HOY);
  for (const e of E.envios) {
    assert.ok(M.pagadoEnvio(e) <= M.totalEnvio(e), e.codigo);
    assert.equal(M.saldoEnvio(e), M.totalEnvio(e) - M.pagadoEnvio(e));
  }
});

// ── Depósito ──

test("paquete sin pre-alerta: queda sin dueño y se asigna solo cuando el cliente avisa el tracking", () => {
  const E = base();
  const e = envioCon(E, "ana", { tarifaId: "miami-aereo", items: [item(100)], gramos: 1000 });
  const r = M.recibirPaquete(E, { tracking: "abc123456", gramos: 900 }, DEPOSITO, HOY);
  assert.equal(r.envio, null);
  assert.ok(M.bandeja(E, HOY).some((x: any) => x.tipo === "sin_duenio"));
  const p = M.prealertar(E, e.id, { tracking: "ABC123456" }, HOY);
  assert.equal(p.asignado, true);
  assert.equal(e.estado, "en_deposito");
  assert.ok(!M.bandeja(E, HOY).some((x: any) => x.tipo === "sin_duenio"));
});

test("sin pre-alerta, la casilla de la etiqueta encuentra al dueño si tiene un solo envío abierto", () => {
  const E = base();
  envioCon(E, "beto", { tarifaId: "miami-aereo", items: [item(100)], gramos: 1000 });
  const r = M.recibirPaquete(E, { tracking: "LBL000001", gramos: 900, casillaEtiqueta: "tv-1002" }, DEPOSITO, HOY);
  assert.equal(M.cliente(E, r.envio.clienteId).nombre, "Beto Díaz");
});

test("asignación a mano de un paquete sin dueño; no se reasigna ni va a un envío que ya salió", () => {
  const E = base();
  const e = envioCon(E, "ana", { tarifaId: "miami-aereo", items: [item(100)], gramos: 1000 });
  const p = M.recibirPaquete(E, { tracking: "HUERFANO01", gramos: 900 }, DEPOSITO, HOY).paquete;
  assert.match(M.asignarPaquete(E, p.id, e.id, ATENCION, HOY).motivo, /no puede/); // Atención no asigna
  assert.ok(M.asignarPaquete(E, p.id, e.id, DEPOSITO, HOY).ok);
  assert.match(M.asignarPaquete(E, p.id, e.id, DEPOSITO, HOY).motivo, /ya tiene dueño/);
});

test("tracking duplicado y paquete sin pesar no se reciben", () => {
  const E = base();
  assert.ok(M.recibirPaquete(E, { tracking: "DUP0000001", gramos: 500 }, DEPOSITO, HOY).ok);
  assert.match(M.recibirPaquete(E, { tracking: "dup0000001", gramos: 500 }, DEPOSITO, HOY).motivo, /duplicado/);
  assert.match(M.recibirPaquete(E, { tracking: "OTRO000001", gramos: 0 }, DEPOSITO, HOY).motivo, /Pesá/);
});

test("un paquete de courier no pasa los 50 kg; con despachante sí", () => {
  const E = base();
  const c = envioCon(E, "ana", { tarifaId: "miami-aereo", items: [item(500)], gramos: 40000 });
  M.prealertar(E, c.id, { tracking: "PESADO0001" }, HOY);
  assert.match(M.recibirPaquete(E, { tracking: "PESADO0001", gramos: 51000 }, DEPOSITO, HOY).motivo, /50 kg/);
  const g = envioCon(E, "pyme", { tarifaId: "china-maritimo", items: [item(5000)], medidas: { l: 100, a: 100, h: 100 } });
  M.prealertar(E, g.id, { tracking: "PALLET0001" }, HOY);
  assert.ok(M.recibirPaquete(E, { tracking: "PALLET0001", gramos: 300000 }, DEPOSITO, HOY).ok);
});

test("diferencia de peso: dentro de la tolerancia no molesta; fuera, frena el embarque hasta avisar y ajustar", () => {
  const E = base();
  const chico = enDeposito(E, "ana", { gramos: 1000, tracking: "TOL0000001" });
  assert.equal(M.diferenciaDePeso(E, chico.id, HOY).hay, false);
  const e = envioCon(E, "beto", { tarifaId: "miami-aereo", items: [item(100)], gramos: 2000 });
  M.prealertar(E, e.id, { tracking: "GRANDE0001" }, HOY);
  M.recibirPaquete(E, { tracking: "GRANDE0001", gramos: 2000, medidas: { l: 50, a: 40, h: 30 } }, DEPOSITO, HOY);
  const d = M.diferenciaDePeso(E, e.id, HOY);
  assert.equal(d.cobrado, 12000);
  assert.equal(d.centavos, 25000); // 10 kg × US$ 25
  assert.ok(M.listoParaEmbarcar(E, e, HOY).frenos.some((f: string) => /peso/.test(f)));
  const total = M.totalEnvio(e);
  assert.ok(M.aplicarDiferenciaDePeso(E, e.id, ATENCION, HOY).ok);
  assert.equal(M.totalEnvio(e), total + 25000);
  assert.match(M.aplicarDiferenciaDePeso(E, e.id, ATENCION, HOY).motivo, /ya está aplicado/);
  assert.ok(!M.listoParaEmbarcar(E, e, HOY).frenos.some((f: string) => /peso/.test(f)));
});

test("diferencia de peso: no se compara mientras faltan compras avisadas", () => {
  const E = base();
  const e = envioCon(E, "ana", { tarifaId: "miami-aereo", items: [item(100)], gramos: 6000 });
  M.prealertar(E, e.id, { tracking: "PARTE00001" }, HOY);
  M.prealertar(E, e.id, { tracking: "PARTE00002" }, HOY);
  M.recibirPaquete(E, { tracking: "PARTE00001", gramos: 1000 }, DEPOSITO, HOY);
  assert.equal(M.diferenciaDePeso(E, e.id, HOY).incompleto, true);
  assert.ok(M.listoParaEmbarcar(E, e, HOY).frenos.some((f: string) => /faltan 1/.test(f)));
});

test("paquete dañado: frena el embarque; si el cliente decide devolverlo, el envío vuelve a esperar", () => {
  const E = base();
  const e = envioCon(E, "ana", { tarifaId: "miami-aereo", items: [item(100)], gramos: 1000 });
  M.prealertar(E, e.id, { tracking: "ROTO000001" }, HOY);
  const p = M.recibirPaquete(E, { tracking: "ROTO000001", gramos: 1000, danado: true }, DEPOSITO, HOY).paquete;
  assert.ok(M.listoParaEmbarcar(E, e, HOY).frenos.some((f: string) => /dañado/.test(f)));
  assert.ok(M.bandeja(E, HOY).some((x: any) => x.tipo === "dano"));
  assert.ok(M.resolverDano(E, p.id, "devolver", DEPOSITO, HOY).ok);
  assert.equal(e.estado, "esperando");
  assert.equal(e.paquetes.length, 0);
  assert.match(M.resolverDano(E, p.id, "seguir", DEPOSITO, HOY).motivo, /no tiene un daño pendiente/);
});

test("producto prohibido: queda retenido y no se embarca", () => {
  const E = base();
  const e = envioCon(E, "ana", { tarifaId: "miami-aereo", items: [item(50)], gramos: 500 });
  M.prealertar(E, e.id, { tracking: "PROHIB0001" }, HOY);
  const p = M.recibirPaquete(E, { tracking: "PROHIB0001", gramos: 500, categoria: "medicamentos" }, DEPOSITO, HOY).paquete;
  assert.equal(p.retenido, "prohibido");
  assert.ok(M.listoParaEmbarcar(E, e, HOY).frenos.some((f: string) => /prohibido/.test(f)));
  assert.equal(M.bandeja(E, HOY)[0].tipo, "prohibido");
});

test("producto prohibido: se devuelve al vendedor y el envío vuelve a esperar sin él", () => {
  const E = base();
  const e = envioCon(E, "ana", { tarifaId: "miami-aereo", items: [item(50)], gramos: 500 });
  M.prealertar(E, e.id, { tracking: "PROHIB0002" }, HOY);
  const p = M.recibirPaquete(E, { tracking: "PROHIB0002", gramos: 500, categoria: "armas" }, DEPOSITO, HOY).paquete;
  assert.match(M.resolverProhibido(E, p.id, "devolver", ATENCION, HOY).motivo, /no puede/);
  assert.ok(M.resolverProhibido(E, p.id, "devolver", DEPOSITO, HOY).ok);
  assert.equal(e.estado, "esperando");
  assert.ok(!M.bandeja(E, HOY).some((x: any) => x.tipo === "prohibido" || x.tipo === "sin_duenio"));
  assert.match(M.resolverProhibido(E, p.id, "descartar", DEPOSITO, HOY).motivo, /no está retenido/);
});

test("almacenaje: gratis los primeros días, avisa antes de empezar y después corre por día", () => {
  const E = base();
  const e = enDeposito(E, "ana", { fecha: "2026-09-01", tracking: "ALM0000001" });
  const p = M.paquete(E, e.paquetes[0]);
  assert.equal(M.almacenaje(E, p, "2026-09-20").centavos, 0);
  assert.equal(M.almacenaje(E, p, "2026-09-27").faltan, 4);
  assert.ok(M.bandeja(E, "2026-09-27").some((x: any) => x.tipo === "almacenaje"));
  assert.equal(M.almacenaje(E, p, "2026-10-11").centavos, 1000); // 40 días − 30 gratis = 10 × US$ 1
});

test("retener para consolidar: no se embarca antes de la fecha que pidió el cliente", () => {
  const E = base();
  const e = enDeposito(E, "ana", { tracking: "RET0000001" });
  assert.ok(M.retenerParaConsolidar(E, e.id, "2026-10-20", HOY).ok);
  assert.ok(M.listoParaEmbarcar(E, e, HOY).frenos.some((f: string) => /esperar/.test(f)));
  assert.equal(M.listoParaEmbarcar(E, e, "2026-10-20").ok, true);
  const largo = M.retenerParaConsolidar(E, e.id, "2026-12-30", HOY);
  assert.match(largo.avisoAlmacenaje, /almacenaje/);
});

// ── Embarques ──

test("embarque: no sube un envío de otra ruta ni uno sin seña", () => {
  const E = base();
  const b = M.crearEmbarque(E, { tarifaId: "miami-aereo", referencia: "AWB 1", salida: HOY, llegada: "2026-10-22" }, DEPOSITO, HOY).embarque;
  const sinSenia = envioCon(E, "ana", { tarifaId: "miami-aereo", items: [item(100)], gramos: 1000 }, { senia: false });
  M.prealertar(E, sinSenia.id, { tracking: "SINSENA001" }, HOY);
  M.recibirPaquete(E, { tracking: "SINSENA001", gramos: 1000 }, DEPOSITO, HOY);
  assert.match(M.subirAEmbarque(E, b.id, sinSenia.id, DEPOSITO, HOY).motivo, /seña/);
  const py = envioCon(E, "beto", { tarifaId: "paraguay-terrestre", items: [item(100)], gramos: 1000 });
  assert.match(M.subirAEmbarque(E, b.id, py.id, DEPOSITO, HOY).motivo, /otra ruta/);
  assert.match(M.crearEmbarque(E, { tarifaId: "miami-aereo", referencia: " " }, DEPOSITO, HOY).motivo, /AWB/);
});

test("ciclo completo: depósito → embarque → aduana → listo → cobro → reparto → entregado", () => {
  const E = base();
  const e = enDeposito(E, "ana", { tracking: "CICLO00001" });
  const b = M.crearEmbarque(E, { tarifaId: "miami-aereo", referencia: "AWB 2", salida: HOY, llegada: "2026-10-22" }, DEPOSITO, HOY).embarque;
  assert.ok(M.subirAEmbarque(E, b.id, e.id, DEPOSITO, HOY).ok);
  assert.match(M.despacharEmbarque(E, b.id, {}, ATENCION, HOY).motivo, /no puede/); // lo despacha Depósito
  const s = M.despacharEmbarque(E, b.id, { costoRealCentavos: 1500 }, DEPOSITO, HOY);
  assert.equal(s.avisos.length, 1);
  assert.equal(e.estado, "en_transito");
  assert.ok(M.arriboEmbarque(E, b.id, DEPOSITO, "2026-10-21").ok);
  assert.equal(e.estado, "en_aduana");
  const lib = M.liberarAduana(E, e.id, {}, ATENCION, "2026-10-22");
  assert.match(lib.aviso.texto, /saldo/);
  assert.match(M.entregar(E, e.id, {}, ATENCION, "2026-10-22").motivo, /saldo/);
  M.cobrar(E, e.id, { medio: "mercadopago", monto: M.aPesos(M.saldoEnvio(e), M.tcParaCobrar(E, e)) }, ATENCION, "2026-10-22");
  assert.equal(M.entregar(E, e.id, {}, ATENCION, "2026-10-22").enReparto, true);
  assert.equal(M.entregar(E, e.id, {}, ATENCION, "2026-10-23").entregado, true);
  assert.equal(e.estado, "entregado");
  const seg = M.seguimiento(E, e.codigo);
  assert.equal(seg.linea.find((x: any) => x.estado === "entregado").fecha, "2026-10-23");
});

test("demora: una sola carga avisa a cada cliente del embarque; la fecha tiene que ser posterior", () => {
  const E = base();
  const a = enDeposito(E, "ana", { tracking: "DEM0000001" });
  const c = enDeposito(E, "beto", { tracking: "DEM0000002" });
  const b = M.crearEmbarque(E, { tarifaId: "miami-aereo", referencia: "AWB 3", salida: HOY, llegada: "2026-10-22" }, DEPOSITO, HOY).embarque;
  M.subirAEmbarque(E, b.id, a.id, DEPOSITO, HOY);
  M.subirAEmbarque(E, b.id, c.id, DEPOSITO, HOY);
  M.despacharEmbarque(E, b.id, {}, DEPOSITO, HOY);
  assert.match(M.demorarEmbarque(E, b.id, { nuevaLlegada: "2026-10-20", motivo: "x" }, DEPOSITO, HOY).motivo, /posterior/);
  assert.match(M.demorarEmbarque(E, b.id, { nuevaLlegada: "2026-10-25", motivo: "" }, DEPOSITO, HOY).motivo, /motivo/);
  const r = M.demorarEmbarque(E, b.id, { nuevaLlegada: "2026-10-25", motivo: "Vuelo reprogramado" }, DEPOSITO, HOY);
  assert.equal(r.avisos.length, 2);
  assert.ok(r.avisos.every((m: any) => /Vuelo reprogramado/.test(m.texto) && m.link.startsWith("https://wa.me/?text=")));
  assert.ok(M.bandeja(E, "2026-10-26").some((x: any) => x.tipo === "demora"));
});

// ── Aduana y entrega ──

test("aduana observa: no se libera hasta resolver; si liquida distinto, la diferencia ajusta el saldo", () => {
  const E = base();
  const e = enDeposito(E, "ana", { valor: 600, tracking: "ADU0000001" });
  const b = M.crearEmbarque(E, { tarifaId: "miami-aereo", referencia: "AWB 4", salida: HOY, llegada: "2026-10-22" }, DEPOSITO, HOY).embarque;
  M.subirAEmbarque(E, b.id, e.id, DEPOSITO, HOY);
  M.despacharEmbarque(E, b.id, {}, DEPOSITO, HOY);
  M.arriboEmbarque(E, b.id, DEPOSITO, "2026-10-21");
  const o = M.observarAduana(E, e.id, { motivo: "Valor bajo", pide: "la factura" }, ATENCION, "2026-10-21");
  assert.match(o.aviso.texto, /la factura/);
  assert.match(M.liberarAduana(E, e.id, {}, ATENCION, "2026-10-22").motivo, /observación abierta/);
  assert.ok(M.bandeja(E, "2026-10-27").find((x: any) => x.tipo === "observado").urgente);
  M.resolverObservacion(E, e.id, { nota: "Factura enviada" }, ATENCION, "2026-10-22");
  const saldoAntes = M.saldoEnvio(e);
  const estimado = e.cotizacion.impuestos.total;
  assert.ok(M.liberarAduana(E, e.id, { impuestosRealesCentavos: estimado + 2000 }, ATENCION, "2026-10-23").ok);
  assert.equal(M.saldoEnvio(e), saldoAntes + 2000);
});

test("entrega fallida: se reintenta una vez y a la segunda queda para retirar en la oficina", () => {
  const E = base();
  const e = enDeposito(E, "ana", { tracking: "ENT0000001" });
  const b = M.crearEmbarque(E, { tarifaId: "miami-aereo", referencia: "AWB 5", salida: HOY, llegada: "2026-10-22" }, DEPOSITO, HOY).embarque;
  M.subirAEmbarque(E, b.id, e.id, DEPOSITO, HOY);
  M.despacharEmbarque(E, b.id, {}, DEPOSITO, HOY);
  M.arriboEmbarque(E, b.id, DEPOSITO, "2026-10-21");
  M.liberarAduana(E, e.id, {}, ATENCION, "2026-10-21");
  M.cobrar(E, e.id, { medio: "transferencia", monto: M.aPesos(M.saldoEnvio(e), M.tcParaCobrar(E, e)) }, ATENCION, "2026-10-21");
  M.entregar(E, e.id, {}, ATENCION, "2026-10-22");
  assert.equal(M.entregaFallida(E, e.id, {}, ATENCION, "2026-10-22").aOficina, false);
  M.entregar(E, e.id, {}, ATENCION, "2026-10-23");
  const r = M.entregaFallida(E, e.id, {}, ATENCION, "2026-10-23");
  assert.equal(r.aOficina, true);
  assert.equal(r.aviso.tipo, "retiro");
  assert.ok(M.entregar(E, e.id, { modo: "oficina" }, ATENCION, "2026-10-24").entregado);
});

// ── Cancelar, devolver, bonificar ──

test("cancelar: sin paquetes se devuelve todo; con paquetes se retiene el manejo; embarcado no se cancela", () => {
  const E = base();
  const sin = envioCon(E, "ana", { tarifaId: "miami-aereo", items: [item(100)], gramos: 1000 });
  const r1 = M.cancelarEnvio(E, sin.id, {}, ATENCION, HOY);
  assert.equal(r1.retiene, 0);
  assert.equal(r1.devolver, M.pagadoEnvio(sin));
  const con = enDeposito(E, "beto", { tracking: "CAN0000001" });
  const r2 = M.cancelarEnvio(E, con.id, {}, ATENCION, HOY);
  assert.equal(r2.retiene, E.config.manejoPorPaqueteCentavos);
  const ido = enDeposito(E, "ana", { tracking: "CAN0000002" });
  const b = M.crearEmbarque(E, { tarifaId: "miami-aereo", referencia: "AWB 6", salida: HOY, llegada: "2026-10-22" }, DEPOSITO, HOY).embarque;
  M.subirAEmbarque(E, b.id, ido.id, DEPOSITO, HOY);
  assert.match(M.cancelarEnvio(E, ido.id, {}, ATENCION, HOY).motivo, /devolución/);
});

test("devolver la seña y bonificar mueven plata: sólo el dueño, con su PIN", () => {
  const E = base();
  const e = envioCon(E, "ana", { tarifaId: "miami-aereo", items: [item(100)], gramos: 1000 });
  M.cancelarEnvio(E, e.id, {}, ATENCION, HOY);
  assert.match(M.devolverSena(E, e.id, {}, ATENCION, HOY).motivo, /no puede/);
  assert.match(M.devolverSena(E, e.id, {}, { usuarioId: "u-duenio", pin: "0000" }, HOY).motivo, /PIN/);
  assert.ok(M.devolverSena(E, e.id, {}, DUENIO, HOY).ok);
  assert.equal(E.caja[0].tipo, "egreso");
  assert.match(M.devolverSena(E, e.id, {}, DUENIO, HOY).motivo, /No hay devolución/);

  const f = envioCon(E, "beto", { tarifaId: "miami-aereo", items: [item(100)], gramos: 1000 });
  assert.match(M.bonificar(E, f.id, { centavos: 500, motivo: "" }, DUENIO, HOY).motivo, /por qué/);
  assert.match(M.bonificar(E, f.id, { centavos: M.totalEnvio(f), motivo: "x" }, DUENIO, HOY).motivo, /por debajo/);
  assert.ok(M.bonificar(E, f.id, { centavos: 500, motivo: "Demora larga" }, DUENIO, HOY).ok);
});

test("permisos: Depósito no cobra; Atención no toca tarifas ni régimen", () => {
  const E = base();
  const e = envioCon(E, "ana", { tarifaId: "miami-aereo", items: [item(100)], gramos: 1000 });
  assert.match(M.cobrar(E, e.id, { medio: "efectivo", monto: 1000 }, DEPOSITO, HOY).motivo, /no puede/);
  assert.match(M.cambiarTarifa(E, "miami-aereo", "porKgCentavos", 3000, ATENCION, HOY).motivo, /no puede/);
  assert.ok(M.cambiarTarifa(E, "miami-aereo", "porKgCentavos", 3000, DUENIO, HOY).ok);
  assert.match(M.cambiarRegimen(E, "franquiciaCentavos", 50000, { usuarioId: "u-duenio" }, HOY).motivo, /PIN/);
  assert.ok(M.cambiarRegimen(E, "franquiciaCentavos", 50000, DUENIO, HOY).ok);
  assert.equal(E.regimen.vigenteDesde, HOY);
  assert.match(M.cambiarTipoCambio(E, 5, DUENIO, HOY).motivo, /entre/);
});

// ── Innovaciones ──

test("partir para ahorrar: reparte en envíos dentro de la franquicia sin pasar el tope ni el cupo", () => {
  const E = base();
  const items = [item(350, { descripcion: "Celular" }), item(300, { descripcion: "Tablet" }), item(80, { descripcion: "Funda" })];
  const r = M.partirParaAhorrar(E, items, { cupo: 3 });
  assert.ok(r.ok);
  assert.ok(r.grupos.length >= 2 && r.grupos.length <= 3);
  assert.ok(r.grupos.every((g: any) => g.valor <= E.regimen.topeEnvioCentavos));
  assert.ok(r.ahorro > 0, "partir tiene que ahorrar derechos y tasa");
  const sinCupo = M.partirParaAhorrar(E, items, { cupo: 1 });
  assert.equal(sinCupo.grupos.length, 1);
  assert.equal(sinCupo.ahorro, 0);
  assert.match(M.partirParaAhorrar(E, [item(3500)]).motivo, /tope/);
});

test("el código del envío lleva dígito de control y el seguimiento público no muestra plata", () => {
  const E = base();
  const e = envioCon(E, "ana", { tarifaId: "miami-aereo", items: [item(100)], gramos: 1000 });
  assert.match(e.codigo, /^TV-2026-0001-\d$/);
  assert.equal(M.validarCodigo(e.codigo), true);
  const tipeado = e.codigo.replace(/-(\d)$/, (_: string, d: string) => `-${(Number(d) + 1) % 10}`);
  assert.equal(M.validarCodigo(tipeado), false);
  const s = M.seguimiento(E, e.codigo.toLowerCase());
  assert.ok(s.ok);
  assert.ok(!JSON.stringify(s).includes("centavos") && !("total" in s));
});

test("la demo abre con cada eventualidad a la vista y la bandeja ordena lo urgente primero", () => {
  const E = M.generarDemo(HOY);
  const tipos = new Set(M.bandeja(E, HOY).map((x: any) => x.tipo));
  for (const t of ["demora", "prohibido", "observado", "sin_duenio", "dano", "peso", "saldo", "almacenaje", "cotizacion", "devolucion", "embarcable"]) {
    assert.ok(tipos.has(t), `falta «${t}» en la bandeja de la demo`);
  }
  assert.equal(M.bandeja(E, HOY)[0].urgente, true);
  // Determinística: dos demos del mismo día son iguales.
  assert.deepEqual(JSON.parse(JSON.stringify(M.generarDemo(HOY))), JSON.parse(JSON.stringify(E)));
  const t = M.tablero(E, HOY);
  assert.ok(t.margenes.every((m: any) => m.margen > 0));
  assert.ok(t.puertaAPuerta > 0);
});

test("los mensajes de WhatsApp de la demo van sin número", () => {
  const E = M.generarDemo(HOY);
  for (const e of E.envios) {
    for (const tipo of ["salio", "listo", "saldo", "reparto"]) assert.ok(M.mensaje(tipo, E, e).link.startsWith("https://wa.me/?text="));
  }
});

test("el sitio empaquetado está al día con la fuente (node src/tenants/tesvo/empaquetar.mjs)", async () => {
  const { readFileSync } = await import("node:fs");
  const { empaquetar, leerFuente, SALIDA } = await import("./empaquetar.mjs");
  assert.equal(readFileSync(SALIDA, "utf8"), empaquetar(leerFuente(process.cwd())), "re-empaquetá la gestión de TESVO");
});
