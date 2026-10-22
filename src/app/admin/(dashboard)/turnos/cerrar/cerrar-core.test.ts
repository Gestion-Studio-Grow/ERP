import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  agruparPorDia,
  alternar,
  alternarTodos,
  avisoDelLote,
  detalleDeConfirmacion,
  detalleDePlata,
  esDeCajaCerrada,
  filtrarTurnos,
  formularioDeLote,
  itemDeVino,
  itemsDelLote,
  lasQueYaPagaron,
  lineaDeLaBandeja,
  loteNecesitaMedio,
  partirEnTandas,
  profesionalesDeLaBandeja,
  resumenDelLote,
  teclasDelRenglon,
  textoDeConfirmacion,
  textosDeLaLinea,
  tituloDelDia,
  type TurnoPendiente,
} from "./cerrar-core";

// Hoy: jueves 22 de octubre de 2026 en Buenos Aires. Ayer = 21 (miércoles); 19 = lunes; 18 = domingo.
const HOY = "2026-10-22";
const RECEPCION = { cobrar: true, terminar: true };
const SIN_TERMINAR = { cobrar: false, terminar: false };
const OK = { ok: true } as const;
const VERO_MOTIVO = "Vero cobra sus propios turnos. Pasale el cobro a ella; después rinde la comisión.";

let n = 0;
function turno(p: Partial<TurnoPendiente> & { dia: string; hora: string }): TurnoPendiente {
  n += 1;
  const precio = p.precio ?? 14000;
  const cobrado = p.cobrado ?? 0;
  return {
    id: p.id ?? `t${n}`,
    clienteId: "c1",
    inicio: new Date(`${p.dia}T${p.hora}:00.000-03:00`).toISOString(),
    clienta: p.clienta ?? `Clienta ${n}`,
    telefono: p.telefono ?? "11 5566-7788",
    servicio: p.servicio ?? "Piernas completas",
    profesional: p.profesional ?? "Caro",
    profesionalId: p.profesionalId ?? "p-caro",
    estado: p.estado ?? "CONFIRMED",
    precio,
    cobrado,
    saldo: p.saldo ?? precio - cobrado,
    veredicto: p.veredicto ?? OK,
  };
}

const vero = (p: { dia: string; hora: string } & Partial<TurnoPendiente>) =>
  turno({ profesional: "Vero", profesionalId: "p-vero", veredicto: { ok: false, motivo: VERO_MOTIVO }, ...p });

describe("agrupar por día y por profesional", () => {
  test("el día más nuevo arriba; adentro, por hora (también cruzando la medianoche UTC)", () => {
    const ts = [
      turno({ id: "vie-16", dia: "2026-10-18", hora: "16:00" }),
      turno({ id: "sab-12", dia: "2026-10-19", hora: "12:00" }),
      turno({ id: "sab-10", dia: "2026-10-19", hora: "10:00" }),
      // 22:30 en Buenos Aires = 01:30 UTC del día siguiente: sigue siendo del sábado.
      turno({ id: "sab-2230", dia: "2026-10-19", hora: "22:30" }),
      turno({ id: "ayer-9", dia: "2026-10-21", hora: "09:00" }),
    ];
    const dias = agruparPorDia(ts);
    assert.deepEqual(
      dias.map((d) => d.dia),
      ["2026-10-21", "2026-10-19", "2026-10-18"],
    );
    assert.deepEqual(
      dias[1].turnos.map((t) => t.id),
      ["sab-10", "sab-12", "sab-2230"],
    );
  });

  test("cada día cuenta cuántos tiene cada profesional, por nombre, y suma lo que falta cobrar", () => {
    const ts = [
      turno({ dia: "2026-10-19", hora: "10:00", precio: 32000, cobrado: 5000 }),
      turno({ dia: "2026-10-19", hora: "10:30", precio: 8000 }),
      turno({ dia: "2026-10-19", hora: "11:00", profesional: "Lu", profesionalId: "p-lu", precio: 6000, cobrado: 6000 }),
      vero({ dia: "2026-10-19", hora: "11:30", precio: 18000 }),
    ];
    const [sabado] = agruparPorDia(ts);
    assert.deepEqual(sabado.porProfesional, [
      { profesionalId: "p-caro", nombre: "Caro", cuenta: 2 },
      { profesionalId: "p-lu", nombre: "Lu", cuenta: 1 },
      { profesionalId: "p-vero", nombre: "Vero", cuenta: 1 },
    ]);
    assert.equal(sabado.porCobrar, 27000 + 8000 + 18000);
  });

  test("el filtro por profesional lista a cada una con su cuenta y marca a la que cobra aparte", () => {
    const ts = [turno({ dia: "2026-10-19", hora: "10:00" }), vero({ dia: "2026-10-19", hora: "11:00" }), vero({ dia: "2026-10-18", hora: "11:00" })];
    assert.deepEqual(profesionalesDeLaBandeja(ts, RECEPCION), [
      { id: "p-caro", nombre: "Caro", cuenta: 1, cobraAparte: false },
      { id: "p-vero", nombre: "Vero", cuenta: 2, cobraAparte: true },
    ]);
    assert.deepEqual(
      filtrarTurnos(ts, { profesionalId: "p-vero" }).map((t) => t.profesionalId),
      ["p-vero", "p-vero"],
    );
    assert.equal(filtrarTurnos(ts, { profesionalId: "" }).length, 3);
  });

  test("el buscador encuentra por clienta sin tildes, por servicio y por teléfono", () => {
    const ts = [
      turno({ dia: "2026-10-19", hora: "10:00", clienta: "Sofía Pérez", servicio: "Bozo", telefono: "11 4000-7919" }),
      turno({ dia: "2026-10-19", hora: "11:00", clienta: "Ana Paz", servicio: "Axilas", telefono: "11 2222-3333" }),
    ];
    assert.deepEqual(filtrarTurnos(ts, { buscar: "sofia" }).map((t) => t.clienta), ["Sofía Pérez"]);
    assert.deepEqual(filtrarTurnos(ts, { buscar: "axi" }).map((t) => t.clienta), ["Ana Paz"]);
    assert.deepEqual(filtrarTurnos(ts, { buscar: "4000 79" }).map((t) => t.clienta), ["Sofía Pérez"]);
  });

  test("el título del día: «Ayer» o la fecha larga", () => {
    assert.equal(tituloDelDia("2026-10-21", HOY), "Ayer");
    assert.equal(tituloDelDia("2026-10-19", HOY), "Lunes 19 de octubre");
  });
});

describe("«Cerrar las que ya pagaron todo» = saldo ≤ 0", () => {
  const ts = [
    turno({ id: "saldado", dia: "2026-10-19", hora: "10:00", precio: 6000, cobrado: 6000 }),
    turno({ id: "de-mas", dia: "2026-10-19", hora: "10:30", precio: 5000, cobrado: 6000, saldo: -1000 }),
    turno({ id: "debe", dia: "2026-10-19", hora: "11:00", precio: 8000, cobrado: 5000 }),
    vero({ id: "vero-pago", dia: "2026-10-19", hora: "11:30", precio: 18000, cobrado: 18000 }),
  ];

  test("entran los saldados y los que pagaron de más (de cualquier profesional); no el que debe", () => {
    assert.deepEqual(
      lasQueYaPagaron(ts, RECEPCION).map((t) => t.id),
      ["saldado", "de-mas", "vero-pago"],
    );
  });

  test("sin permiso para terminar, no hay nada para cerrar", () => {
    assert.deepEqual(lasQueYaPagaron(ts, SIN_TERMINAR), []);
  });

  test("su ítem es «vino» sin medio: no se cobra nada nuevo", () => {
    assert.deepEqual(itemDeVino(ts[0], RECEPCION, null), { id: "saldado", accion: "vino" });
    assert.deepEqual(itemDeVino(ts[0], RECEPCION, "EFECTIVO"), { id: "saldado", accion: "vino" });
  });
});

describe("las teclas de cada renglón", () => {
  test("pagado → sólo «Vino»; con saldo → los medios; la que cobra aparte → dejar el saldo con el motivo", () => {
    assert.deepEqual(teclasDelRenglon(turno({ dia: "2026-10-19", hora: "10:00", cobrado: 14000 }), RECEPCION), { tipo: "pagado" });
    assert.deepEqual(teclasDelRenglon(turno({ dia: "2026-10-19", hora: "10:00" }), RECEPCION), { tipo: "cobrar" });
    assert.deepEqual(teclasDelRenglon(vero({ dia: "2026-10-19", hora: "10:00" }), RECEPCION), { tipo: "cobra-aparte", motivo: VERO_MOTIVO });
    assert.deepEqual(teclasDelRenglon(turno({ dia: "2026-10-19", hora: "10:00" }), SIN_TERMINAR), { tipo: "ninguna" });
  });

  test("con saldo y sin medio no hay ítem (ningún medio preelegido); Vero siempre deja el saldo", () => {
    const t = turno({ dia: "2026-10-19", hora: "10:00" });
    assert.equal(itemDeVino(t, RECEPCION, null), null);
    assert.deepEqual(itemDeVino(t, RECEPCION, "MERCADOPAGO"), { id: t.id, accion: "vino", method: "MERCADOPAGO" });
    const v = vero({ dia: "2026-10-19", hora: "10:00" });
    assert.deepEqual(itemDeVino(v, RECEPCION, "EFECTIVO"), { id: v.id, accion: "dejar-saldo" });
  });

  test("el detalle de plata del renglón", () => {
    assert.equal(detalleDePlata({ precio: 32000, cobrado: 5000, saldo: 27000 }), "$32.000 · seña $5.000 · falta $27.000");
    assert.equal(detalleDePlata({ precio: 8000, cobrado: 0, saldo: 8000 }), "$8.000 · falta $8.000");
    assert.equal(detalleDePlata({ precio: 6000, cobrado: 6000, saldo: 0 }), "$6.000 · pagado ✓");
  });
});

describe("los totales de la línea de estado", () => {
  test("15 sin cerrar, por cobrar = Σ saldos > 0, con seña = los que ya tienen plata, Vero aparte", () => {
    const ts = [
      turno({ dia: "2026-10-19", hora: "10:00", precio: 32000, cobrado: 5000 }), // falta 27.000, con seña
      turno({ dia: "2026-10-19", hora: "10:30", precio: 8000 }), // falta 8.000
      turno({ dia: "2026-10-19", hora: "11:00", precio: 6000, cobrado: 6000 }), // pagado, con seña
      turno({ dia: "2026-10-19", hora: "11:15", precio: 5000, cobrado: 6000, saldo: -1000 }), // de más: no resta
      vero({ dia: "2026-10-19", hora: "11:30", precio: 18000 }), // falta 18.000, cobra aparte
    ];
    const l = lineaDeLaBandeja(ts, RECEPCION);
    assert.deepEqual(l, {
      sinCerrar: 5,
      porCobrar: 27000 + 8000 + 18000,
      conSenia: 3,
      cobranAparte: [{ nombre: "Vero", cuenta: 1 }],
      yaPagaron: 2,
    });
    assert.deepEqual(textosDeLaLinea(l), ["5 sin cerrar", "$53.000 por cobrar", "3 con seña", "1 de Vero (cobra aparte)"]);
  });

  test("la dueña (cobra todo) no ve «cobra aparte»; sin plata pendiente, no se dice «$0 por cobrar»", () => {
    const ts = [turno({ dia: "2026-10-19", hora: "10:00", precio: 6000, cobrado: 6000 })];
    const l = lineaDeLaBandeja(ts, RECEPCION);
    assert.deepEqual(textosDeLaLinea(l), ["1 sin cerrar", "1 con seña"]);
    const soloLectura = lineaDeLaBandeja([vero({ dia: "2026-10-19", hora: "10:00" })], { cobrar: false, terminar: true });
    assert.deepEqual(soloLectura.cobranAparte, []);
  });
});

describe("el lote: selección, total y confirmación", () => {
  // CH-005: 8 pasados con saldo que suman $94.000.
  const saldos = [14000, 8000, 14000, 6000, 18000, 14000, 12000, 8000];
  const ocho = saldos.map((s, i) => turno({ id: `l${i}`, dia: "2026-10-19", hora: `1${i}:00`, precio: s }));

  test("«¿Cerrar 8 turnos y cobrar $94.000 en efectivo?»", () => {
    const sel = new Set(ocho.map((t) => t.id));
    const r = resumenDelLote(ocho, sel, RECEPCION);
    assert.deepEqual(r, { cantidad: 8, aCobrar: 94000, conCobro: 8, yaPagos: 0, dejanSaldo: 0 });
    assert.equal(textoDeConfirmacion(r, "EFECTIVO"), "¿Cerrar 8 turnos y cobrar $94.000 en efectivo?");
    assert.equal(textoDeConfirmacion(r, "MERCADOPAGO"), "¿Cerrar 8 turnos y cobrar $94.000 por Mercado Pago?");
    assert.equal(textoDeConfirmacion(r, "TRANSFERENCIA"), "¿Cerrar 8 turnos y cobrar $94.000 por transferencia?");
    assert.equal(detalleDeConfirmacion(r), "");
    assert.equal(loteNecesitaMedio(r), true);
  });

  test("singular, y un lote sin nada que cobrar no pide medio", () => {
    const uno = resumenDelLote(ocho, new Set(["l0"]), RECEPCION);
    assert.equal(textoDeConfirmacion(uno, "EFECTIVO"), "¿Cerrar 1 turno y cobrar $14.000 en efectivo?");
    const pagos = [turno({ id: "p1", dia: "2026-10-19", hora: "10:00", cobrado: 14000 }), turno({ id: "p2", dia: "2026-10-19", hora: "11:00", cobrado: 14000 })];
    const r = resumenDelLote(pagos, new Set(["p1", "p2"]), RECEPCION);
    assert.equal(loteNecesitaMedio(r), false);
    assert.equal(textoDeConfirmacion(r, null), "¿Cerrar 2 turnos? No se cobra nada.");
    assert.equal(detalleDeConfirmacion(r), "2 ya estaban pagos");
  });

  test("mezclado: lo pagado no suma, Vero deja su saldo, y se dice en la letra chica", () => {
    const ts = [...ocho.slice(0, 2), turno({ id: "pago", dia: "2026-10-19", hora: "09:00", cobrado: 14000 }), vero({ id: "v", dia: "2026-10-19", hora: "09:30" })];
    const sel = new Set(ts.map((t) => t.id));
    const r = resumenDelLote(ts, sel, RECEPCION);
    assert.deepEqual(r, { cantidad: 4, aCobrar: 22000, conCobro: 2, yaPagos: 1, dejanSaldo: 1 });
    assert.equal(textoDeConfirmacion(r, "EFECTIVO"), "¿Cerrar 4 turnos y cobrar $22.000 en efectivo?");
    assert.equal(detalleDeConfirmacion(r), "1 ya estaba pago · 1 queda con su saldo (cobra aparte)");
    assert.deepEqual(itemsDelLote(ts, sel, RECEPCION, "EFECTIVO"), [
      { id: "l0", accion: "vino", method: "EFECTIVO" },
      { id: "l1", accion: "vino", method: "EFECTIVO" },
      { id: "pago", accion: "vino" },
      { id: "v", accion: "dejar-saldo" },
    ]);
  });

  test("marcar, desmarcar y marcar todo el día", () => {
    let sel = alternar(new Set(), "a");
    assert.deepEqual([...sel], ["a"]);
    sel = alternar(sel, "a");
    assert.deepEqual([...sel], []);
    sel = alternarTodos(new Set(["a"]), ["a", "b", "c"]);
    assert.deepEqual([...sel].sort(), ["a", "b", "c"]);
    sel = alternarTodos(sel, ["a", "b", "c"]);
    assert.deepEqual([...sel], []);
  });

  test("lo que viaja: `items` en JSON, de a tandas", () => {
    const fd = formularioDeLote([{ id: "x", accion: "vino", method: "EFECTIVO" }]);
    assert.deepEqual(JSON.parse(String(fd.get("items"))), [{ id: "x", accion: "vino", method: "EFECTIVO" }]);
    assert.deepEqual(partirEnTandas([1, 2, 3, 4, 5, 6, 7], 5), [[1, 2, 3, 4, 5], [6, 7]]);
    assert.deepEqual(partirEnTandas([], 5), []);
  });

  test("el aviso al terminar y la falla de caja cerrada (CH-006)", () => {
    const caja = "La caja del viernes ya está cerrada: registralo hoy.";
    assert.deepEqual(avisoDelLote([{ ok: true }, { ok: true }]), { texto: "2 cerradas", tono: "ok" });
    assert.deepEqual(avisoDelLote([{ ok: true }, { ok: true }, { ok: true }, { ok: true }, { ok: false, error: caja }]), {
      texto: "4 cerradas · 1 no se pudo: la caja del viernes ya está cerrada: registralo hoy.",
      tono: "error",
    });
    assert.equal(esDeCajaCerrada(caja), true);
    assert.equal(esDeCajaCerrada("Ese turno cambió recién. Recargá la agenda."), false);
  });
});
