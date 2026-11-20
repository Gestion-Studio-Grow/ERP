import { test } from "node:test";
import assert from "node:assert/strict";
import { dentroDeTopes, OPERACIONES, PUESTOS, puede, type Contexto, type Miembro, type Operacion, type Puesto } from "./permisos";

const direccion: Miembro = { userId: "ale", rol: "DIRECCION", puesto: null, activo: true };
const comercial: Miembro = { userId: "com1", rol: "COMERCIAL", puesto: null, activo: true };
const puesto = (p: Puesto, userId = `ag-${p}`): Miembro => ({ userId, rol: "PUESTO", puesto: p, activo: true });

const opDe = (o: Partial<{ duenoUserId: string | null; creadaPor: string; tomadoresEnCurso: string[] }> = {}) => ({
  oportunidad: { duenoUserId: null, creadaPor: "otro", tomadoresEnCurso: [], ...o },
});
const propia = opDe({ duenoUserId: "com1" });
const ajena = opDe({ duenoUserId: "com2" });

const ok = (m: Miembro | null, op: Operacion, ctx?: Contexto) => assert.deepEqual(puede(m, op, ctx), { ok: true }, `${m?.rol}/${m?.puesto} ${op}`);
const rechaza = (m: Miembro | null, op: Operacion, ctx?: Contexto, contiene?: RegExp) => {
  const r = puede(m, op, ctx);
  assert.equal(r.ok, false, `${m?.rol}/${m?.puesto} ${op} debía rechazarse`);
  if (!r.ok) {
    assert.ok(r.motivo.length > 10);
    if (contiene) assert.match(r.motivo, contiene);
  }
};

// ─── Membresía ───────────────────────────────────────────────────────────────

test("E16: sin membresía activa no puede nada, aunque en el resto del sistema tenga clients:manage", () => {
  for (const op of OPERACIONES) {
    rechaza(null, op, { ...propia, etapaDestino: "VERIFICADA", tareaPara: "PERSONA" }, /CRM comercial/);
    rechaza({ ...direccion, activo: false }, op, { ...propia, etapaDestino: "VERIFICADA", tareaPara: "PERSONA" }, /CRM comercial/);
  }
});

test("un PUESTO sin puesto válido no hace nada", () => {
  rechaza({ userId: "x", rol: "PUESTO", puesto: null, activo: true }, "escribir_borrador", opDe({ creadaPor: "x" }), /puesto válido/);
});

// ─── Dirección ───────────────────────────────────────────────────────────────

test("Dirección: ve todo, aprueba, asigna y confirma destino", () => {
  for (const op of ["ver_oportunidad", "aprobar_borrador", "rechazar_borrador", "marcar_enviado", "crear_contacto", "suprimir_contacto", "registrar_respuesta", "comprobar_identidad", "editar_brief"] as const) ok(direccion, op, ajena);
  for (const op of ["asignar_comercial", "confirmar_destino", "configurar", "ver_registro", "proponer_oportunidad"] as const) ok(direccion, op);
  for (const e of ["CALIFICADA", "ASIGNADA", "DORMIDA", "DESCARTADA", "PERDIDA", "DERIVADA_AL_TALLER", "FALTAN_DATOS"] as const) ok(direccion, "aplicar_pase", { ...ajena, etapaDestino: e });
});

test("A4: GANADA no la pone nadie a mano, ni Dirección (la pone el cierre del proyecto)", () => {
  rechaza(direccion, "aplicar_pase", { ...propia, etapaDestino: "GANADA" }, /cierre del proyecto/);
  rechaza(comercial, "aplicar_pase", { ...propia, etapaDestino: "GANADA" }, /cierre del proyecto/);
  rechaza(puesto("calificador"), "proponer_pase", { ...opDe({ creadaPor: "ag-calificador" }), etapaDestino: "GANADA" }, /cierre del proyecto/);
});

test("nadie le manda nada a terceros desde el sistema", () => {
  for (const m of [direccion, comercial, puesto("redactor")]) rechaza(m, "enviar_a_terceros", propia, /persona/);
});

test("un pase sin etapa de destino se rechaza", () => {
  rechaza(direccion, "aplicar_pase", propia, /etapa/);
});

// ─── Comercial ───────────────────────────────────────────────────────────────

test("comercial: sobre su oportunidad trabaja (contactos, borradores, enviado, pases de persona)", () => {
  for (const op of ["ver_oportunidad", "crear_contacto", "escribir_borrador", "aprobar_borrador", "marcar_enviado", "registrar_respuesta", "comprobar_identidad", "editar_brief"] as const) ok(comercial, op, propia);
  for (const e of ["CONTACTADA", "EN_CONVERSACION", "FALTAN_DATOS"] as const) ok(comercial, "aplicar_pase", { ...propia, etapaDestino: e });
  ok(comercial, "proponer_pase", { ...propia, etapaDestino: "PERDIDA" });
  ok(comercial, "tomar_tarea", { ...propia, tareaPara: "PERSONA" });
});

test("E12: comercial sobre una oportunidad ajena o sin asignar: rechazado por permiso", () => {
  for (const op of ["ver_oportunidad", "escribir_borrador", "aprobar_borrador", "marcar_enviado", "registrar_respuesta", "editar_brief", "crear_contacto"] as const) {
    rechaza(comercial, op, ajena, /no es tuya/);
    rechaza(comercial, op, opDe({ duenoUserId: null }), /no es tuya/);
  }
  rechaza(comercial, "aplicar_pase", { ...ajena, etapaDestino: "CONTACTADA" }, /no es tuya/);
  rechaza(comercial, "tomar_tarea", { ...ajena, tareaPara: "PERSONA" }, /no es tuya/);
});

test("comercial: lo de Dirección no (asignar, confirmar destino, configurar, aplicar pases con aprobación)", () => {
  rechaza(comercial, "asignar_comercial", propia, /Dirección/);
  rechaza(comercial, "confirmar_destino", propia, /Dirección/);
  rechaza(comercial, "configurar", undefined, /Dirección/);
  rechaza(comercial, "aplicar_pase", { ...propia, etapaDestino: "CALIFICADA" }, /aprueba Dirección/);
  rechaza(comercial, "tomar_tarea", { ...propia, tareaPara: "DIRECCION" }, /Dirección/);
  rechaza(comercial, "tomar_tarea", { ...propia, tareaPara: "redactor" }, /puesto/);
});

test("sin la oportunidad en el contexto, la acción sobre una oportunidad se rechaza (falla cerrada)", () => {
  rechaza(comercial, "ver_oportunidad", {}, /qué oportunidad/);
  rechaza(puesto("redactor"), "escribir_borrador", {}, /qué oportunidad/);
});

// ─── Puestos ─────────────────────────────────────────────────────────────────

const delPuesto = (p: Puesto) => opDe({ creadaPor: "nadie", tomadoresEnCurso: [`ag-${p}`] });

test("puesto solo ✔: proponer, verificar, puntuar, marcar faltantes, borradores, seguimientos", () => {
  ok(puesto("descubridor"), "proponer_oportunidad");
  ok(puesto("identificador"), "proponer_oportunidad");
  ok(puesto("verificador"), "verificar", delPuesto("verificador"));
  ok(puesto("verificador"), "aplicar_pase", { ...delPuesto("verificador"), etapaDestino: "VERIFICADA" });
  ok(puesto("verificador"), "aplicar_pase", { ...delPuesto("verificador"), etapaDestino: "SIN_CONTACTO" });
  ok(puesto("calificador"), "puntuar", delPuesto("calificador"));
  ok(puesto("calificador"), "marcar_faltantes", delPuesto("calificador"));
  ok(puesto("calificador"), "aplicar_pase", { ...delPuesto("calificador"), etapaDestino: "FALTAN_DATOS" });
  ok(puesto("armador_brief"), "editar_brief", delPuesto("armador_brief"));
  ok(puesto("armador_brief"), "escribir_borrador", delPuesto("armador_brief"));
  ok(puesto("redactor"), "escribir_borrador", delPuesto("redactor"));
  ok(puesto("seguidor"), "crear_tarea_seguimiento", delPuesto("seguidor"));
});

test("con aprobación: el puesto PROPONE el pase y no lo puede aplicar (lo aplica Dirección)", () => {
  const c = delPuesto("calificador");
  for (const e of ["CALIFICADA", "DERIVADA_AL_TALLER", "DESCARTADA"] as const) {
    ok(puesto("calificador"), "proponer_pase", { ...c, etapaDestino: e });
    rechaza(puesto("calificador"), "aplicar_pase", { ...c, etapaDestino: e }, /PROPONER/);
  }
  const s = delPuesto("seguidor");
  for (const e of ["DORMIDA", "PERDIDA"] as const) {
    ok(puesto("seguidor"), "proponer_pase", { ...s, etapaDestino: e });
    rechaza(puesto("seguidor"), "aplicar_pase", { ...s, etapaDestino: e }, /PROPONER/);
  }
  rechaza(puesto("calificador"), "proponer_pase", { ...c, etapaDestino: "ASIGNADA" });
  rechaza(puesto("calificador"), "aplicar_pase", { ...c, etapaDestino: "CONTACTADA" });
});

test("E16: ningún puesto crea contactos, marca «enviado», aprueba ni hace lo de Dirección", () => {
  for (const p of PUESTOS) {
    const m = puesto(p);
    const ctx = opDe({ creadaPor: m.userId });
    rechaza(m, "crear_contacto", ctx, /persona/);
    rechaza(m, "suprimir_contacto", ctx);
    rechaza(m, "marcar_enviado", ctx, /persona/);
    rechaza(m, "aprobar_borrador", ctx);
    rechaza(m, "rechazar_borrador", ctx);
    rechaza(m, "registrar_respuesta", ctx);
    rechaza(m, "comprobar_identidad", ctx);
    for (const op of ["asignar_comercial", "confirmar_destino", "configurar", "ver_registro"] as const) rechaza(m, op, ctx, /Dirección/);
    rechaza(m, "enviar_a_terceros", ctx);
  }
});

test("E16: el puesto no hace lo de otro puesto", () => {
  rechaza(puesto("redactor"), "puntuar", delPuesto("redactor"), /redactor/);
  rechaza(puesto("descubridor"), "escribir_borrador", delPuesto("descubridor"), /descubridor/);
  rechaza(puesto("verificador"), "aplicar_pase", { ...delPuesto("verificador"), etapaDestino: "FALTAN_DATOS" });
});

test("el Buscador de contactos está apagado", () => {
  rechaza(puesto("contactos"), "ver_oportunidad", delPuesto("contactos"), /apagado/);
  rechaza(puesto("contactos"), "proponer_oportunidad", undefined, /apagado/);
});

test("puesto: sólo ve oportunidades que creó o con tarea EN_CURSO tomada por él", () => {
  const m = puesto("redactor");
  ok(m, "ver_oportunidad", opDe({ creadaPor: m.userId }));
  ok(m, "ver_oportunidad", opDe({ tomadoresEnCurso: [m.userId] }));
  rechaza(m, "ver_oportunidad", opDe({ tomadoresEnCurso: ["ag-otro"] }), /creó o donde tiene una tarea en curso/);
  rechaza(m, "escribir_borrador", opDe({ duenoUserId: m.userId }), /creó/);
});

test("puesto: toma tareas de su cola (aunque todavía no vea la oportunidad) y no de otra", () => {
  ok(puesto("seguidor"), "tomar_tarea", { ...opDe(), tareaPara: "seguidor" });
  rechaza(puesto("seguidor"), "tomar_tarea", { ...opDe(), tareaPara: "redactor" }, /redactor/);
  rechaza(puesto("seguidor"), "tomar_tarea", { ...opDe(), tareaPara: "PERSONA" });
  rechaza(puesto("seguidor"), "tomar_tarea", { ...opDe() }, /cola/);
});

// ─── Topes (E11) ─────────────────────────────────────────────────────────────

test("E11: el puesto que pasa su tope de acciones o de gasto se frena y avisa", () => {
  const m: Miembro = { ...puesto("redactor"), topeAccionesDia: 10, topeCostoDiaUsd: 2 };
  assert.deepEqual(dentroDeTopes(m, { accionesHoy: 9, costoHoyUsd: 1.5 }, 0.4), { ok: true });
  const a = dentroDeTopes(m, { accionesHoy: 10, costoHoyUsd: 0 });
  assert.equal(a.ok, false);
  if (!a.ok) assert.match(a.motivo, /tope de 10 acciones/);
  const c = dentroDeTopes(m, { accionesHoy: 0, costoHoyUsd: 1.9 }, 0.2);
  assert.equal(c.ok, false);
  if (!c.ok) assert.match(c.motivo, /tope de gasto/);
});

test("E11: sin tope (null) no frena; las personas no tienen tope", () => {
  assert.deepEqual(dentroDeTopes({ ...puesto("redactor"), topeAccionesDia: null, topeCostoDiaUsd: null }, { accionesHoy: 9999, costoHoyUsd: 9999 }, 5), { ok: true });
  assert.deepEqual(dentroDeTopes({ ...direccion, topeAccionesDia: 0 }, { accionesHoy: 50, costoHoyUsd: 50 }), { ok: true });
  assert.deepEqual(dentroDeTopes({ ...comercial, topeCostoDiaUsd: 0 }, { accionesHoy: 0, costoHoyUsd: 50 }, 1), { ok: true });
});

// ─── GSG-CRM-011 · B7: la consulta que cargó el comercial ───────────────────

test("B7: el comercial ve y opera la consulta entrante que cargó él mientras no esté asignada a otro", () => {
  const suya = { oportunidad: { duenoUserId: null, creadaPor: "com1", tipo: "CONSULTA", tomadoresEnCurso: [] } };
  ok(comercial, "ver_oportunidad", suya);
  ok(comercial, "registrar_respuesta", suya);
  ok(comercial, "comprobar_identidad", suya);
  ok(comercial, "crear_contacto", suya);
  ok(comercial, "aplicar_pase", { ...suya, etapaDestino: "EN_CONVERSACION" });
  rechaza(comercial, "aplicar_pase", { ...suya, etapaDestino: "CALIFICADA" }, /lo aprueba Dirección/);
  // Asignada a otro (comercial o Dirección): ya no.
  rechaza(comercial, "ver_oportunidad", { oportunidad: { ...suya.oportunidad, duenoUserId: "com2" } }, /no es tuya/);
  rechaza(comercial, "ver_oportunidad", { oportunidad: { ...suya.oportunidad, duenoUserId: "ale" } }, /no es tuya/);
  // La que cargó otro comercial: no.
  rechaza(comercial, "ver_oportunidad", { oportunidad: { ...suya.oportunidad, creadaPor: "com2" } }, /no es tuya/);
  rechaza({ ...comercial, userId: "com2" }, "ver_oportunidad", suya, /no es tuya/);
  // Un prospecto (no consulta), o sin tipo en el contexto: falla cerrada.
  rechaza(comercial, "ver_oportunidad", { oportunidad: { ...suya.oportunidad, tipo: "PROSPECTO" } }, /no es tuya/);
  rechaza(comercial, "ver_oportunidad", { oportunidad: { duenoUserId: null, creadaPor: "com1", tomadoresEnCurso: [] } }, /no es tuya/);
});

test("GSG-CRM-011: vincular un contacto con su papel (crear_contacto) lo hace una persona, nunca un puesto", () => {
  const o = { oportunidad: { duenoUserId: null, creadaPor: "ag-calificador", tipo: "CONSULTA", tomadoresEnCurso: ["ag-calificador"] } };
  rechaza(puesto("calificador"), "crear_contacto", o, /no carga contactos/);
  rechaza(puesto("armador_brief"), "crear_contacto", o, /no carga contactos/);
  ok(direccion, "crear_contacto", o);
});
