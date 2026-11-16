/**
 * CRM comercial · lo que deciden las pantallas (GSG-CRM-011): qué botones ve cada mirada (Dirección, comercial,
 * puesto), el orden de «Hoy» y el ponderado del embudo. Datos ficticios.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogo } from "@/modules/catalog";
import { appPorId } from "@/apps/registro";
import { appPermitida, resolverContextoApps, type NegocioApps, type TenantParaApps } from "@/apps/visibles";
import type { Role } from "@/lib/capabilities";
import { appsDeInterruptores } from "../armazon/navegacion";
import { appDeGestionVisible, appEnLaBarra } from "@/lib/proyectos/gestion-core";
import type { Miembro } from "@/lib/crm-comercial/permisos";
import { armarBandeja, avisoAlCerrarTarea, etiquetaTarea, opcionesDePase, ponderadoDe, puedeEn, textoPonderado, type FilaParaHoy } from "./crm-core";

const DIR: Miembro = { userId: "u-dir", rol: "DIRECCION", puesto: null, activo: true };
const COM: Miembro = { userId: "u-com", rol: "COMERCIAL", puesto: null, activo: true };
const CALIF: Miembro = { userId: "u-calif", rol: "PUESTO", puesto: "calificador", activo: true };
const VERIF: Miembro = { userId: "u-verif", rol: "PUESTO", puesto: "verificador", activo: true };
const REDAC: Miembro = { userId: "u-redac", rol: "PUESTO", puesto: "redactor", activo: true };
const AHORA = new Date("2026-11-16T15:00:00Z");

const destinos = (m: Miembro, o: Parameters<typeof opcionesDePase>[1]) => opcionesDePase(m, o).map((x) => `${x.modo}:${x.destino}`);

test("pases: Dirección aplica, el comercial aplica lo suyo y propone lo que aprueba Dirección, el puesto sólo lo de su puesto", () => {
  const o = { etapa: "EN_CONVERSACION", tipo: "CONSULTA", duenoUserId: null };
  assert.ok(destinos(DIR, o).includes("aplicar:CALIFICADA"));
  assert.ok(destinos(DIR, o).includes("aplicar:DESCARTADA"));
  const com = destinos(COM, { ...o, duenoUserId: COM.userId });
  assert.ok(com.includes("aplicar:FALTAN_DATOS"));
  assert.ok(com.includes("proponer:CALIFICADA"));
  assert.ok(!com.some((x) => x.startsWith("aplicar:CALIFICADA")));
  assert.deepEqual(destinos(CALIF, o).sort(), ["aplicar:FALTAN_DATOS", "proponer:CALIFICADA", "proponer:DERIVADA_AL_TALLER", "proponer:DESCARTADA"].sort());
  assert.deepEqual(destinos(REDAC, o), [], "el Redactor no mueve etapas");
});

test("pases: nunca GANADA, nada desde ASIGNADA ni cerrada, la consulta no recorre el camino del prospecto y con un pase propuesto no se propone otro", () => {
  assert.deepEqual(opcionesDePase(DIR, { etapa: "ASIGNADA", tipo: "PROSPECTO", duenoUserId: "u-com" }), []);
  assert.deepEqual(opcionesDePase(DIR, { etapa: "PERDIDA", tipo: "PROSPECTO", duenoUserId: null }), []);
  assert.ok(!destinos(DIR, { etapa: "DORMIDA", tipo: "PROSPECTO", duenoUserId: null }).some((x) => x.endsWith("GANADA")));
  assert.ok(!destinos(DIR, { etapa: "RECIBIDA", tipo: "CONSULTA", duenoUserId: null }).some((x) => /VERIFICADA|CONTACTADA/.test(x)));
  assert.deepEqual(destinos(VERIF, { etapa: "DETECTADA", tipo: "PROSPECTO", duenoUserId: null }).sort(), ["aplicar:VERIFICADA", "proponer:DESCARTADA"]);
  assert.deepEqual(destinos(VERIF, { etapa: "DETECTADA", tipo: "PROSPECTO", duenoUserId: null, pasePropuesto: "DESCARTADA" }), ["aplicar:VERIFICADA"]);
  assert.deepEqual(opcionesDePase(null, { etapa: "DETECTADA", tipo: "PROSPECTO", duenoUserId: null }), []);
});

test("pases: el formulario pide lo que el servidor no puede mirar (motivo, fecha para despertar, comercial)", () => {
  const ops = opcionesDePase(DIR, { etapa: "CALIFICADA", tipo: "CONSULTA", duenoUserId: null });
  const de = (d: string) => ops.find((o) => o.destino === d);
  assert.deepEqual(de("ASIGNADA")?.pide, ["comercial"]);
  assert.deepEqual(de("DORMIDA")?.pide, ["motivo", "despertarEl"]);
  assert.ok(de("DORMIDA")?.motivos.every((m) => ["EVENTO_CANCELADO", "PROXIMA_EDICION", "SIN_RESPUESTA", "OTRO"].includes(m.valor)));
  assert.deepEqual(de("PERDIDA")?.pide, ["motivo"]);
  assert.deepEqual(de("FALTAN_DATOS")?.pide, []);
});

test("botones por mirada: el puesto no ve aprobar, mandar ni cargar contactos; Dirección sí; sin membresía, nada", () => {
  const o = { tipo: "PROSPECTO", duenoUserId: null };
  for (const op of ["aprobar_borrador", "marcar_enviado", "crear_contacto", "registrar_respuesta"] as const) {
    assert.equal(puedeEn(REDAC, op, o), false, op);
    assert.equal(puedeEn(DIR, op, o), true, op);
  }
  assert.equal(puedeEn(REDAC, "escribir_borrador", o), true);
  assert.equal(puedeEn(COM, "confirmar_destino", o), false);
  assert.equal(puedeEn(null, "ver_oportunidad", o), false);
  assert.equal(puedeEn({ ...DIR, activo: false }, "ver_oportunidad", o), false);
});

const fila = (id: string, x: Partial<FilaParaHoy> = {}): FilaParaHoy => ({ id, tipo: "PROSPECTO", etapa: "CONTACTADA", marca: `Marca ${id}`, evento: "Expo Demo", duenoUserId: null, pasePropuesto: null, proximoPaso: "x", proximoPasoEl: null, version: 1, ...x });

test("Hoy: una sola lista por urgencia, con la acción en un toque que le toca a cada uno", () => {
  const base = {
    entradas: [
      { id: "a", urgencia: 30, por: ["Pase propuesto a «Calificada»"] },
      { id: "b", urgencia: 90, por: ["Venció la fecha de entrega de la licitación"] },
    ],
    filas: [fila("a", { pasePropuesto: "CALIFICADA", etapa: "EN_CONVERSACION" }), fila("b"), fila("c", { etapa: "FALTAN_DATOS" })],
    borradores: [{ id: "br1", oportunidadId: "a", canal: "WHATSAPP", estado: "BORRADOR", createdAt: new Date("2026-11-14T15:00:00Z"), marca: "Marca a", evento: null }],
    enCola: [{ id: "t1", oportunidadId: "c", tipo: "SEGUIMIENTO", venceEl: new Date("2026-11-15T15:00:00Z"), createdAt: AHORA }],
    enCurso: [],
    pedidosEnCola: [],
    pedidosEnCurso: [],
    ahora: AHORA,
  };
  const dir = armarBandeja({ ...base, miembro: DIR });
  assert.equal(dir[0].clave, "op-b", "lo más urgente arriba");
  assert.deepEqual(dir.map((i) => i.urgencia), [...dir.map((i) => i.urgencia)].sort((x, y) => y - x));
  const a = dir.find((i) => i.clave === "op-a");
  assert.deepEqual(a?.acciones.map((x) => x.tipo), ["aprobar_pase", "rechazar_pase"]);
  assert.deepEqual(dir.find((i) => i.clave === "bo-br1")?.acciones.map((x) => x.tipo), ["aprobar_borrador", "ir_a_borradores"]);
  assert.deepEqual(dir.find((i) => i.clave === "op-c")?.acciones.map((x) => x.tipo), ["pedido_de_datos"], "faltan datos: registrar el pedido");

  const red = armarBandeja({ ...base, miembro: REDAC });
  assert.deepEqual(red.find((i) => i.clave === "op-a")?.acciones, [], "el puesto ve el pase propuesto pero no lo aprueba");
  assert.deepEqual(red.find((i) => i.clave === "bo-br1")?.acciones, [], "el puesto no aprueba borradores");
  assert.ok(red.find((i) => i.clave === "ta-t1")?.por[0].startsWith("Venció"));
  const cal = armarBandeja({ ...base, miembro: CALIF });
  assert.deepEqual(cal.find((i) => i.clave === "op-c")?.acciones.map((x) => x.tipo), ["pedido_de_datos"]);
});

test("embudo: el ponderado suma por moneda y lo que no tiene monto se cuenta aparte (no es cero)", () => {
  const p = ponderadoDe([
    { moneda: "ARS", montoPonderado: 1000.5 },
    { moneda: "ARS", montoPonderado: 499.5 },
    { moneda: "USD", montoPonderado: 250 },
    { moneda: "ARS", montoPonderado: null },
  ]);
  assert.deepEqual(p, { ARS: 1500, USD: 250, sinMonto: 1 });
  assert.match(textoPonderado(p), /1\.500.*\+.*250/);
  assert.equal(textoPonderado(ponderadoDe([])), "Sin montos");
});

test("menú: «CRM comercial» entra sólo con el interruptor prendido; en el panel de gestión lo abre cualquiera (manda la membresía)", () => {
  const CH: TenantParaApps = { id: "t-ch", slug: "beauty-spa", blueprintId: null, modules: [] };
  const PRODUCTORA: TenantParaApps = { id: "t-pr", slug: "productora-demo", blueprintId: "productora", modules: ["proyectos", "clients"] };
  const de = (role: Role, t: TenantParaApps): NegocioApps => ({ role, contexto: resolverContextoApps(t, { registroGlobal: false, enInicioPorApps: false }, catalogo()), modulosAsignados: t.modules, perfil: null, esMostrador: false, carniceriaLista: false });
  const negocio = de("OWNER", CH);
  // Techo del ERP: clients:read (dueña y Recepción; el usuario de puesto se crea con Recepción). Entra también en el panel de la productora.
  for (const role of ["OWNER", "RECEPTION"] as const) {
    assert.equal(appPermitida(appPorId("crm-comercial"), de(role, CH)), true, role);
    assert.equal(appPermitida(appPorId("crm-comercial"), de(role, PRODUCTORA)), true, `${role} en el panel`);
  }
  assert.equal(appPermitida(appPorId("crm-comercial"), de("PROFESSIONAL", CH)), false);
  assert.ok(!appsDeInterruptores({}, negocio).some((a) => a.id === "crm-comercial"));
  assert.ok(!appsDeInterruptores({ "crm-comercial": { encendido: false } }, negocio).some((a) => a.id === "crm-comercial"));
  assert.ok(appsDeInterruptores({ "crm-comercial": { encendido: true } }, negocio).some((a) => a.id === "crm-comercial"));
  for (const rol of ["DIRECCION", "COMERCIAL", "SIN_FICHA", "DISENO"] as const) assert.equal(appDeGestionVisible("crm-comercial", rol, []), true, rol);
  assert.equal(appEnLaBarra("crm-comercial", "SIN_FICHA"), true, "el usuario de puesto (sin ficha) lo tiene en la barra");
  assert.equal(appEnLaBarra("crm-comercial", "PRODUCCION"), false);
  assert.equal(appDeGestionVisible("eventos-sponsors", "SIN_FICHA", []), false, "lo demás del panel no cambia");
});

test("Miembros del CRM: la pestaña es sólo de Dirección; papel en criollo, orden y puestos para elegir", async () => {
  const { papelEnCrm, ordenarUsuarios, opcionesDePuesto } = await import("./crm-core");
  assert.equal(puedeEn(DIR, "configurar"), true);
  for (const m of [COM, CALIF, VERIF, REDAC]) assert.equal(puedeEn(m, "configurar"), false, `${m.rol} ${m.puesto ?? ""} no ve Miembros`);
  assert.equal(puedeEn({ ...DIR, activo: false }, "configurar"), false, "Dirección dada de baja tampoco");

  const p = (rol: "DIRECCION" | "COMERCIAL" | "PUESTO", puesto: "redactor" | null, activo = true) => ({ rol, puesto, activo, topeAccionesDia: null, topeCostoDiaUsd: null });
  assert.equal(papelEnCrm(null), "Sin acceso");
  assert.equal(papelEnCrm(p("DIRECCION", null)), "Dirección");
  assert.equal(papelEnCrm(p("PUESTO", "redactor")), "Redactor (puesto del equipo)");
  assert.equal(papelEnCrm(p("COMERCIAL", null, false)), "Comercial · dado de baja");

  const orden = ordenarUsuarios([
    { nombre: "Zoe", miembro: null },
    { nombre: "Bruno", miembro: p("PUESTO", "redactor") },
    { nombre: "Ana", miembro: p("COMERCIAL", null, false) },
    { nombre: "Carla", miembro: p("COMERCIAL", null) },
    { nombre: "Dario", miembro: p("DIRECCION", null) },
  ]).map((x) => x.nombre);
  assert.deepEqual(orden, ["Dario", "Carla", "Bruno", "Ana", "Zoe"]);

  const puestos = opcionesDePuesto();
  assert.equal(puestos.length, 8);
  assert.match(puestos.find((x) => x.valor === "contactos")?.etiqueta ?? "", /apagado/);
  assert.equal(puestos.find((x) => x.valor === "armador_brief")?.etiqueta, "Armador de brief");
});

test("GSG-CRM-011 · «Marcar hecha» avisa al puesto que pierde la ficha, y más fuerte si la oportunidad sigue sin verificar", () => {
  const VERIF: Miembro = { userId: "v", rol: "PUESTO", puesto: "verificador", activo: true };
  assert.match(avisoAlCerrarTarea(VERIF, "VERIFICAR", "DETECTADA") ?? "", /sigue sin verificar.*dejás de ver la ficha/);
  assert.match(avisoAlCerrarTarea(VERIF, "VERIFICAR", "VERIFICADA") ?? "", /dejás de ver esta oportunidad/);
  assert.equal(avisoAlCerrarTarea(DIR, "VERIFICAR", "DETECTADA"), null, "una persona no pierde la ficha");
  const hoy = armarBandeja({
    miembro: VERIF,
    entradas: [],
    filas: [fila("p", { etapa: "DETECTADA" })],
    borradores: [],
    enCola: [],
    enCurso: [{ id: "t9", oportunidadId: "p", tipo: "VERIFICAR", venceEl: null, createdAt: AHORA }],
    pedidosEnCola: [],
    pedidosEnCurso: [],
    ahora: AHORA,
  });
  const cerrar = hoy.find((i) => i.clave === "ta-t9")?.acciones[0];
  assert.equal(cerrar?.tipo, "cerrar_tarea");
  assert.match(cerrar && cerrar.tipo === "cerrar_tarea" ? (cerrar.aviso ?? "") : "", /sin verificar/);
  // Las tareas en criollo, nunca el valor interno.
  assert.equal(etiquetaTarea("VERIFICAR"), "Verificar la fuente");
  assert.equal(etiquetaTarea("ALGO_NUEVO"), "algo nuevo");
});
