// ============================================================================
// TEST de los límites del negocio — plan + excepciones de la consola, y el uso contra el tope.
// ============================================================================
//
// Ejecuta la decisión: qué tope vale para un negocio (plan, excepción, sin plan), qué fila de
// AuditLog cuenta (sólo la de un operador por el canal del operador, la última de cada límite y
// plan, y sólo las del plan vigente), y cuándo se frena un alta. Una venta nunca se frena. CH nunca tiene plan
// hasta el OK del dueño.

import { test } from "node:test";
import assert from "node:assert/strict";
import { LIMITE_IDS, PLAN_IDS, planPorId, type LimiteId } from "./catalogo";
import {
  ACCION_AJUSTAR,
  ACCION_QUITAR_AJUSTE,
  ENTIDAD_LIMITE,
  LIMITES,
  NO_SE_PUDO_CONTAR,
  TOPE_MAXIMO,
  decidirAlta,
  entidadReservadaDelPlan,
  esFilaDeLimiteValida,
  evaluarUso,
  filaDeExcepcionDeLimite,
  filtroDeExcepcionesValidas,
  limitesDelNegocio,
  type FilaDeLimite,
  type LimiteQueBloquea,
} from "./limites";

const T = "tenant-1";
let secuencia = 0;

/** Una fila como la escribe la consola, con fecha e id (lo que agrega la base). */
function fila(p: {
  limite: LimiteId;
  plan?: string;
  valor?: number | null;
  quitar?: true;
  minuto: number;
  operador?: string;
  id?: string;
}): FilaDeLimite {
  const base = filaDeExcepcionDeLimite({
    tenantId: T,
    operador: p.operador ?? "facu",
    plan: "micro",
    limite: p.limite,
    ...(p.quitar ? {} : { valor: p.valor === undefined ? 5 : p.valor }),
  });
  return {
    ...base,
    changes: { ...base.changes, plan: p.plan ?? "micro" },
    id: p.id ?? `f${String(++secuencia).padStart(4, "0")}`,
    createdAt: new Date(Date.UTC(2026, 8, 24, 12, p.minuto)),
  };
}

// ── El plan sin excepciones ───────────────────────────────────────────────────

test("un negocio con plan tiene los topes de su plan", () => {
  for (const id of PLAN_IDS) {
    const l = limitesDelNegocio({ slug: "negocio", plan: id }, []);
    assert.equal(l.plan, id);
    assert.equal(l.motivoSinPlan, null);
    for (const lim of LIMITE_IDS) {
      assert.deepEqual(l.topes[lim], {
        valor: planPorId(id).limites[lim],
        origen: "plan",
        delPlan: planPorId(id).limites[lim],
        quien: null,
        cuando: null,
      });
    }
  }
});

test("sin plan del catálogo, ningún tope nuevo: se comporta como hoy", () => {
  const casos: [string | null, string][] = [
    [null, "sin-plan"],
    ["", "sin-plan"],
    ["   ", "sin-plan"],
    ["PYME", "plan-desconocido"],
    ["Micro", "plan-desconocido"],
    [" micro", "plan-desconocido"],
    ["premium", "plan-desconocido"],
  ];
  for (const [plan, motivo] of casos) {
    const l = limitesDelNegocio({ slug: "negocio", plan }, [fila({ limite: "usuarios", valor: 1, minuto: 1 })]);
    assert.equal(l.plan, null, String(plan));
    assert.equal(l.motivoSinPlan, motivo, String(plan));
    for (const lim of LIMITE_IDS) assert.equal(l.topes[lim].origen, "sin-plan");
    for (const lim of LIMITE_IDS) assert.equal(l.topes[lim].valor, null);
    assert.deepEqual(decidirAlta(l, "usuarios", 500), { ok: true });
  }
});

test("CH (beauty-spa) nunca tiene plan hasta el OK del dueño, diga lo que diga su columna y sus filas", () => {
  for (const slug of ["beauty-spa", " Beauty-Spa "]) {
    for (const plan of [...PLAN_IDS, null]) {
      const l = limitesDelNegocio({ slug, plan }, [fila({ limite: "usuarios", valor: 0, minuto: 1 })]);
      assert.equal(l.plan, null);
      assert.equal(l.motivoSinPlan, "requiere-ok-del-duenio");
      for (const id of ["usuarios", "locales", "cuentasBancarias", "clientesCartera"] as LimiteQueBloquea[]) {
        assert.deepEqual(decidirAlta(l, id, 10_000), { ok: true }, `${slug}/${String(plan)}/${id}`);
      }
    }
  }
});

// ── Las excepciones ──────────────────────────────────────────────────────────

test("una excepción de la consola ajusta el tope y dice quién y cuándo", () => {
  const f = fila({ limite: "usuarios", valor: 4, minuto: 10, operador: "vero" });
  const l = limitesDelNegocio({ slug: "negocio", plan: "micro" }, [f]);
  assert.deepEqual(l.topes.usuarios, { valor: 4, origen: "excepcion", delPlan: 2, quien: "vero", cuando: f.createdAt });
  assert.equal(l.topes.locales.origen, "plan");
  // Sin tope también es una excepción válida.
  const sinTope = limitesDelNegocio({ slug: "negocio", plan: "micro" }, [fila({ limite: "locales", valor: null, minuto: 1 })]);
  assert.equal(sinTope.topes.locales.valor, null);
  assert.equal(sinTope.topes.locales.origen, "excepcion");
  assert.deepEqual(decidirAlta(sinTope, "locales", 40), { ok: true });
});

test("manda la última fila válida de cada límite del plan (por fecha, y a igual fecha por id)", () => {
  const plan = { slug: "negocio", plan: "micro" };
  // ajustar y después quitar → vuelve el del plan
  let l = limitesDelNegocio(plan, [
    fila({ limite: "usuarios", valor: 9, minuto: 1 }),
    fila({ limite: "usuarios", quitar: true, minuto: 2 }),
  ]);
  assert.equal(l.topes.usuarios.valor, 2);
  assert.equal(l.topes.usuarios.origen, "plan");
  // quitar y después ajustar → la excepción; el orden en que llegan no importa
  l = limitesDelNegocio(plan, [
    fila({ limite: "usuarios", valor: 9, minuto: 3 }),
    fila({ limite: "usuarios", quitar: true, minuto: 2 }),
  ]);
  assert.equal(l.topes.usuarios.valor, 9);
  // misma hora: gana el id mayor
  l = limitesDelNegocio(plan, [
    fila({ limite: "usuarios", valor: 7, minuto: 5, id: "b" }),
    fila({ limite: "usuarios", valor: 8, minuto: 5, id: "a" }),
  ]);
  assert.equal(l.topes.usuarios.valor, 7);
  // cada límite por separado
  l = limitesDelNegocio(plan, [
    fila({ limite: "usuarios", valor: 3, minuto: 1 }),
    fila({ limite: "locales", valor: 2, minuto: 2 }),
  ]);
  assert.equal(l.topes.usuarios.valor, 3);
  assert.equal(l.topes.locales.valor, 2);
});

test("una fila forjada o mal formada no cuenta, aunque sea la más nueva", () => {
  const buena = fila({ limite: "usuarios", valor: 3, minuto: 1 });
  const forjadas: FilaDeLimite[] = [
    { ...buena, id: "x1", channel: "admin" },
    { ...buena, id: "x2", channel: "public" },
    { ...buena, id: "x3", channel: null },
    { ...buena, id: "x4", actor: "user:abc" },
    { ...buena, id: "x5", actor: "operator:" },
    { ...buena, id: "x6", actor: "admin" },
    { ...buena, id: "x7", entity: "Interruptor" },
    { ...buena, id: "x8", entity: "limitedelplan" },
    { ...buena, id: "x9", entityId: "empleados" },
    { ...buena, id: "x10", entityId: null },
    { ...buena, id: "x11", action: "limite.subir" },
    { ...buena, id: "x12", changes: { plan: "micro", valor: -1 } },
    { ...buena, id: "x13", changes: { plan: "micro", valor: 2.5 } },
    { ...buena, id: "x14", changes: { plan: "micro", valor: "100" } },
    { ...buena, id: "x15", changes: { plan: "micro", valor: Number.NaN } },
    { ...buena, id: "x16", changes: { plan: "micro", valor: Number.POSITIVE_INFINITY } },
    { ...buena, id: "x17", changes: { plan: "micro", valor: TOPE_MAXIMO + 1 } },
    { ...buena, id: "x18", changes: { plan: "micro" } },
    { ...buena, id: "x19", changes: { valor: 100 } },
    { ...buena, id: "x20", changes: { plan: "Micro", valor: 100 } },
    { ...buena, id: "x21", changes: null },
    { ...buena, id: "x22", changes: [100] },
    { ...buena, id: "x23", changes: "valor=100" },
    { ...buena, id: "x24", createdAt: new Date("no es fecha") },
  ].map((f, i) => ({ ...f, createdAt: f.id === "x24" ? f.createdAt : new Date(Date.UTC(2026, 8, 25, 0, i)) }));
  for (const f of forjadas) {
    assert.equal(esFilaDeLimiteValida(f), false, f.id);
    const l = limitesDelNegocio({ slug: "negocio", plan: "micro" }, [buena, f]);
    assert.equal(l.topes.usuarios.valor, 3, `${f.id} no debería contar`);
  }
  assert.equal(esFilaDeLimiteValida(buena), true);
});

test("una excepción fijada con otro plan no cuenta y se informa; la de este plan sí", () => {
  const vieja = fila({ limite: "usuarios", plan: "micro", valor: 20, minuto: 1, operador: "vero" });
  const l = limitesDelNegocio({ slug: "negocio", plan: "comerciante" }, [
    vieja,
    fila({ limite: "locales", plan: "comerciante", valor: 2, minuto: 2 }),
  ]);
  assert.equal(l.topes.usuarios.valor, 6);
  assert.equal(l.topes.usuarios.origen, "plan");
  assert.deepEqual(l.excepcionesDeOtroPlan, [
    { limite: "usuarios", plan: "micro", valor: 20, quien: "vero", cuando: vieja.createdAt },
  ]);
  assert.equal(l.topes.locales.valor, 2);
  assert.equal(l.topes.locales.origen, "excepcion");
  // Si la última de ese límite y ese plan es un "quitar", no hay nada que informar.
  const cerrada = limitesDelNegocio({ slug: "negocio", plan: "comerciante" }, [
    fila({ limite: "usuarios", plan: "micro", valor: 20, minuto: 1 }),
    fila({ limite: "usuarios", plan: "micro", quitar: true, minuto: 2 }),
  ]);
  assert.deepEqual(cerrada.excepcionesDeOtroPlan, []);
});

test("cada excepción es de su límite Y su plan: lo que se hace con otro plan no la pisa ni la borra", () => {
  // Una PyME con 8 locales pasa a Comerciante; ahí el operador ajusta y después quita locales.
  const filas = [
    fila({ limite: "locales", plan: "pyme", valor: 8, minuto: 1 }),
    fila({ limite: "locales", plan: "comerciante", valor: 2, minuto: 2 }),
    fila({ limite: "locales", plan: "comerciante", quitar: true, minuto: 3 }),
  ];
  const enComerciante = limitesDelNegocio({ slug: "negocio", plan: "comerciante" }, filas);
  assert.equal(enComerciante.topes.locales.valor, 1);
  assert.equal(enComerciante.topes.locales.origen, "plan");
  // La de PyME sigue vigente y se informa, aunque lo último sobre locales haya sido un "quitar" de otro plan.
  assert.deepEqual(
    enComerciante.excepcionesDeOtroPlan.map((e) => [e.limite, e.plan, e.valor]),
    [["locales", "pyme", 8]],
  );
  // Vuelve a PyME: la excepción vuelve a valer (por eso la consola la tiene que cerrar al cambiar de plan).
  const deVuelta = limitesDelNegocio({ slug: "negocio", plan: "pyme" }, filas);
  assert.equal(deVuelta.topes.locales.valor, 8);
  assert.equal(deVuelta.topes.locales.origen, "excepcion");
  assert.deepEqual(deVuelta.excepcionesDeOtroPlan, []);
  // Cerrada con "quitar" en su plan, no vuelve.
  const cerrada = limitesDelNegocio({ slug: "negocio", plan: "pyme" }, [
    ...filas,
    fila({ limite: "locales", plan: "pyme", quitar: true, minuto: 4 }),
  ]);
  assert.equal(cerrada.topes.locales.valor, 3);
  assert.equal(cerrada.topes.locales.origen, "plan");
  // Un ajuste más nuevo de otro plan tampoco pisa la de este plan.
  const pisada = limitesDelNegocio({ slug: "negocio", plan: "pyme" }, [
    ...filas,
    fila({ limite: "locales", plan: "micro", valor: 0, minuto: 9 }),
  ]);
  assert.equal(pisada.topes.locales.valor, 8);
  assert.deepEqual(
    pisada.excepcionesDeOtroPlan.map((e) => [e.limite, e.plan, e.valor]),
    [["locales", "micro", 0]],
  );
});

test("las excepciones de otro plan se informan ordenadas por límite y por plan", () => {
  const l = limitesDelNegocio({ slug: "negocio", plan: "facturacion" }, [
    fila({ limite: "locales", plan: "pyme", valor: 8, minuto: 1 }),
    fila({ limite: "usuarios", plan: "pyme", valor: 40, minuto: 2 }),
    fila({ limite: "usuarios", plan: "micro", valor: 3, minuto: 3 }),
  ]);
  assert.deepEqual(
    l.excepcionesDeOtroPlan.map((e) => `${e.limite}/${e.plan}`),
    ["usuarios/micro", "usuarios/pyme", "locales/pyme"],
  );
});

// ── La fila que se escribe ───────────────────────────────────────────────────

test("la fila que arma la consola es la que la lectura acepta", () => {
  const ajustar = filaDeExcepcionDeLimite({ tenantId: T, operador: " facu ", plan: "pyme", limite: "locales", valor: 8 });
  assert.deepEqual(ajustar, {
    tenantId: T,
    actor: "operator:facu",
    action: ACCION_AJUSTAR,
    entity: ENTIDAD_LIMITE,
    entityId: "locales",
    channel: "operador",
    changes: { plan: "pyme", valor: 8 },
  });
  const quitar = filaDeExcepcionDeLimite({ tenantId: T, operador: "facu", plan: "pyme", limite: "locales" });
  assert.equal(quitar.action, ACCION_QUITAR_AJUSTE);
  assert.deepEqual(quitar.changes, { plan: "pyme" });
  for (const f of [ajustar, quitar]) {
    assert.equal(esFilaDeLimiteValida({ ...f, id: "1", createdAt: new Date() }), true);
  }
  const l = limitesDelNegocio({ slug: "negocio", plan: "pyme" }, [{ ...ajustar, id: "1", createdAt: new Date() }]);
  assert.equal(l.topes.locales.valor, 8);
});

test("la consola no puede armar una fila inválida", () => {
  assert.throws(() => filaDeExcepcionDeLimite({ tenantId: T, operador: "  ", plan: "micro", limite: "usuarios", valor: 3 }));
  for (const valor of [-1, 1.5, Number.NaN, TOPE_MAXIMO + 1]) {
    assert.throws(() => filaDeExcepcionDeLimite({ tenantId: T, operador: "facu", plan: "micro", limite: "usuarios", valor }), String(valor));
  }
});

test("el filtro de la consulta acota a las filas de la consola de ese negocio", () => {
  assert.deepEqual(filtroDeExcepcionesValidas(T), {
    tenantId: T,
    entity: ENTIDAD_LIMITE,
    entityId: { in: [...LIMITE_IDS] },
    action: { in: [ACCION_AJUSTAR, ACCION_QUITAR_AJUSTE] },
    channel: "operador",
    actor: { startsWith: "operator:" },
  });
});

test("la entidad de las excepciones está reservada para la consola", () => {
  for (const e of ["LimiteDelPlan", "limitedelplan", " LIMITEDELPLAN "]) assert.equal(entidadReservadaDelPlan(e), true, e);
  for (const e of ["Interruptor", "Tenant", "Limite"]) assert.equal(entidadReservadaDelPlan(e), false, e);
});

// ── El uso contra el tope ───────────────────────────────────────────────────

test("evaluarUso: avisa desde el 80 %, completo en el tope, pasado por encima", () => {
  const nivel = (tope: number | null, usados: number) => evaluarUso(tope, usados).nivel;
  assert.equal(nivel(null, 10_000), "sin-tope");
  assert.equal(evaluarUso(null, 3).quedan, null);
  assert.equal(nivel(300, 0), "holgado");
  assert.equal(nivel(300, 239), "holgado");
  assert.equal(nivel(300, 240), "cerca");
  assert.equal(nivel(300, 299), "cerca");
  assert.equal(nivel(300, 300), "completo");
  assert.equal(nivel(300, 301), "pasado");
  assert.equal(evaluarUso(300, 250).quedan, 50);
  assert.equal(evaluarUso(300, 350).quedan, 0);
  assert.equal(nivel(2, 1), "holgado");
  assert.equal(nivel(2, 2), "completo");
  assert.equal(nivel(0, 0), "completo");
  assert.equal(nivel(0, 1), "pasado");
  for (const malo of [-1, 1.5, Number.NaN]) assert.throws(() => evaluarUso(10, malo), String(malo));
});

test("decidirAlta: frena al llegar al tope y dice cómo seguir", () => {
  const micro = limitesDelNegocio({ slug: "negocio", plan: "micro" }, []);
  assert.deepEqual(decidirAlta(micro, "usuarios", 0), { ok: true });
  assert.deepEqual(decidirAlta(micro, "usuarios", 1), { ok: true });
  assert.deepEqual(decidirAlta(micro, "usuarios", 2), {
    ok: false,
    motivo: "Tu plan incluye hasta 2 personas con usuario. Para sumar otra, escribinos a Gestión Studio Grow y lo ampliamos.",
  });
  assert.equal(decidirAlta(micro, "usuarios", 7).ok, false);
  assert.deepEqual(decidirAlta(micro, "locales", 1), {
    ok: false,
    motivo: "Tu plan incluye hasta 1 local. Para sumar otro, escribinos a Gestión Studio Grow y lo ampliamos.",
  });
  assert.deepEqual(decidirAlta(micro, "clientesCartera", 0), {
    ok: false,
    motivo: "Tu plan no incluye clientes en la cartera. Para sumarlos, escribinos a Gestión Studio Grow y lo ampliamos.",
  });
  const estudio = limitesDelNegocio({ slug: "estudio", plan: "estudio" }, []);
  assert.deepEqual(decidirAlta(estudio, "clientesCartera", 9), { ok: true });
  assert.equal(decidirAlta(estudio, "clientesCartera", 10).ok, false);
  const pyme = limitesDelNegocio({ slug: "pyme", plan: "pyme" }, []);
  assert.deepEqual(decidirAlta(pyme, "cuentasBancarias", 250), { ok: true });
});

test("decidirAlta: si no se pudo contar, frena con un porqué que dice cómo seguir", () => {
  const micro = limitesDelNegocio({ slug: "negocio", plan: "micro" }, []);
  for (const malo of [Number.NaN, -1, 0.5]) {
    assert.deepEqual(decidirAlta(micro, "usuarios", malo), { ok: false, motivo: NO_SE_PUDO_CONTAR });
  }
});

test("una venta nunca se frena: comprobantes y facturas automáticas sólo avisan", () => {
  assert.equal(LIMITES.comprobantesMes.bloquea, false);
  assert.equal(LIMITES.facturasAutomaticasMes.bloquea, false);
  const micro = limitesDelNegocio({ slug: "negocio", plan: "micro" }, []);
  // Aunque alguien lo pida por decidirAlta (forzando el tipo), no frena.
  for (const id of ["comprobantesMes", "facturasAutomaticasMes"]) {
    assert.deepEqual(decidirAlta(micro, id as LimiteQueBloquea, 1_000_000), { ok: true });
  }
  assert.equal(evaluarUso(micro.topes.comprobantesMes.valor, 1_000).nivel, "pasado");
});

test("cada límite tiene nombre, unidad y cómo se cuenta, en castellano", () => {
  assert.deepEqual(Object.keys(LIMITES).sort(), [...LIMITE_IDS].sort());
  for (const id of LIMITE_IDS) {
    const m = LIMITES[id];
    assert.equal(m.id, id);
    for (const texto of [m.nombre, m.unidad.uno, m.unidad.varios, m.comoSeCuenta]) {
      assert.ok(texto.trim().length > 0, id);
      assert.doesNotMatch(texto, /\b(scope|tenant|lite|enterprise)\b/i, `${id}: jerga en "${texto}"`);
    }
  }
  const bloquean = LIMITE_IDS.filter((id) => LIMITES[id].bloquea).sort();
  assert.deepEqual(bloquean, ["clientesCartera", "cuentasBancarias", "locales", "usuarios"]);
});
