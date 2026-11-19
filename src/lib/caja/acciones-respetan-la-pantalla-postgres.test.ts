// MIA-ACCIONES-PANEL (GSG-MIA-136, hallazgo de la certificación CRM-018): con la app apagada la PANTALLA rebota, pero las
// acciones de servidor de Caja, Libro, Cierre del día y Apariencia sólo pedían el rol. Un pedido armado a mano (sin pasar
// por la pantalla) escribía igual. Acá se llaman TAL CUAL, contra Postgres real y como `app_rls` (RLS aplicado; el dueño de
// la base sólo siembra y cuenta), con la sesión de cada persona:
//   · APAGADA → rechaza y no escribe nada (ni turno, ni movimiento, ni auditoría, ni el color).
//   · PRENDIDA → sigue andando como siempre.
// Los dos negocios de la base efímera hacen de los dos casos reales de «app apagada»:
//   · A = una productora con panel cerrado (como MIA / el ARM): Apariencia queda fuera del panel para Dirección, y Caja,
//     Libro y Cierre quedan fuera para un rol de gestión que no los tiene (Comercial).
//   · B = un negocio con casa (como Break Point: el club es todo el panel): Caja, Libro, Cierre y Apariencia rebotan a la casa.
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio, type NegocioDePrueba, type UsuarioDePrueba } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

// Los textos de «App no disponible» (explicarNoDisponible): fuera del panel o fuera de lo que su usuario abre.
const NO_DISPONIBLE = /esta app no es parte|no tiene acceso a esta app/;

const form = (c: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(c)) fd.set(k, v);
  return fd;
};

test("acciones de Caja, Libro, Cierre del día y Apariencia: con la app apagada rechazan sin escribir; prendida, andan", async (t) => {
  const laBase = await baseEfimeraParaElTest(t);
  if (!laBase) return;
  apuntarLaAppA(laBase);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(laBase);
  const { a, b } = laBase;
  const { openCashSession, closeCashSession } = await import("@/lib/caja-actions");
  const { addLibroEntry, deleteLibroEntry } = await import("@/lib/libro-caja-actions");
  const { cerrarDia } = await import("@/lib/cierre-diario-actions");
  const { reabrirDiaAction } = await import("@/lib/cierre-mes/acciones");
  const { updateAccentPresetAction } = await import("@/lib/apariencia-actions");
  const { CAMPO_ESPERADO_CONFIRMADO } = await import("@/lib/caja/esperado-del-cajon");
  const { dateStrInBusinessTz } = await import("@/lib/datetime");
  const hoy = dateStrInBusinessTz(new Date());

  // A = productora con panel cerrado (Proyectos asignado). B = negocio con casa (el club).
  await duenio.tenant.update({ where: { id: a.id }, data: { blueprintId: "productora", modules: ["proyectos"] } });
  await duenio.tenant.update({ where: { id: b.id }, data: { modules: ["club"], accentPreset: null } });
  // La recepcionista de A está en el equipo como Comercial: su barra no tiene Caja, Libro ni Cierre.
  await duenio.proyectoPersona.create({ data: { tenantId: a.id, userId: a.recepcion.id, nombre: a.recepcion.nombre, rol: "COMERCIAL" } });
  // Un movimiento de B para que «borrar del libro» tenga qué borrar.
  const movB = await duenio.cashMovement.create({ data: { tenantId: b.id, type: "EGRESO", method: "EFECTIVO", amount: 100, reason: "Hielo", createdBy: "seed" } });

  const huella = async (n: NegocioDePrueba) => {
    const [turnos, movimientos, auditoria, negocio] = await Promise.all([
      duenio.cashSession.count({ where: { tenantId: n.id } }),
      duenio.cashMovement.count({ where: { tenantId: n.id } }),
      duenio.auditLog.count({ where: { tenantId: n.id } }),
      duenio.tenant.findUniqueOrThrow({ where: { id: n.id }, select: { accentPreset: true } }),
    ]);
    return { turnos, movimientos, auditoria, acento: negocio.accentPreset };
  };
  // Rechazo = la acción devuelve un error (o el corte de Next) y la base queda igual.
  const rechaza = async (n: NegocioDePrueba, u: UsuarioDePrueba, nombre: string, f: () => Promise<unknown>) => {
    const antes = await huella(n);
    const r = await ejecutarAccion({ negocio: n, usuario: u }, f);
    const valor = r.tipo === "respuesta" ? (r.valor as { ok?: boolean } | null) : null;
    // Tiene que ser EL rechazo de la app (el texto de «no disponible»), no una validación que justo no pasó.
    const texto = JSON.stringify(valor);
    assert.ok(r.tipo === "respuesta" && valor?.ok === false && NO_DISPONIBLE.test(texto), `${nombre} (${u.rol} de ${n.slug}) con la app apagada NO rechazó por la app: ${r.tipo} ${texto}`);
    assert.deepEqual(await huella(n), antes, `${nombre} (${u.rol} de ${n.slug}) con la app apagada escribió en la base`);
    return valor;
  };
  const anda = async (n: NegocioDePrueba, u: UsuarioDePrueba, nombre: string, f: () => Promise<unknown>) => {
    const r = await ejecutarAccion({ negocio: n, usuario: u }, f);
    assert.equal(r.tipo, "respuesta", `${nombre} con la app prendida cortó con ${r.tipo}`);
    assert.equal((r as { valor: { ok?: boolean } }).valor?.ok, true, `${nombre} con la app prendida: ${JSON.stringify((r as { valor: unknown }).valor)}`);
  };

  const rechazos: string[] = [];
  const probarRechazo = async (n: NegocioDePrueba, u: UsuarioDePrueba, nombre: string, f: () => Promise<unknown>) => {
    await t.test(`apagada · ${nombre} · ${u.rol} de ${n === a ? "A (panel cerrado)" : "B (casa)"}`, async () => {
      rechazos.push(`${nombre}: ${JSON.stringify(await rechaza(n, u, nombre, f))}`);
    });
  };

  // ── PRENDIDA (primero: no depende de lo que pase con la app apagada) ─────────────────────────────────────
  await t.test("prendida · Dirección de A abre caja, carga y borra en el libro, cierra el turno, cierra y reabre el día", async () => {
    await anda(a, a.duenia, "openCashSession", () => openCashSession(null, form({ openingFloat: "0", [CAMPO_ESPERADO_CONFIRMADO]: "0" })));
    await anda(a, a.duenia, "addLibroEntry", () => addLibroEntry(null, form({ date: hoy, detail: "Ingreso de prueba", type: "INGRESO", method: "EFECTIVO", amount: "2.000" })));
    const mov = await duenio.cashMovement.findFirstOrThrow({ where: { tenantId: a.id, reason: "Ingreso de prueba" } });
    await anda(a, a.duenia, "deleteLibroEntry", () => deleteLibroEntry(null, form({ id: mov.id })));
    await anda(a, a.duenia, "closeCashSession", () => closeCashSession(null, form({ counted: "0", [CAMPO_ESPERADO_CONFIRMADO]: "0" })));
    await anda(a, a.duenia, "cerrarDia", () => cerrarDia(form({ day: hoy, declarado_EFECTIVO: "0", columnas: "x" })));
    await anda(a, a.duenia, "reabrirDiaAction", () => reabrirDiaAction(null, form({ day: hoy, motivo: "Me equivoqué al contar" })));
  });
  // ── APAGADA ────────────────────────────────────────────────────────────────────────────────────────────────
  // A · Dirección (OWNER sin ficha = Dirección): Apariencia está fuera del panel de la productora.
  await probarRechazo(a, a.duenia, "updateAccentPresetAction", () => updateAccentPresetAction("verde"));
  // A · Comercial: Caja, Libro y Cierre no son de su barra (layout.tsx: `appDeGestionVisible`).
  await probarRechazo(a, a.recepcion, "openCashSession", () => openCashSession(null, form({ openingFloat: "0", [CAMPO_ESPERADO_CONFIRMADO]: "0" })));
  await probarRechazo(a, a.recepcion, "addLibroEntry", () => addLibroEntry(null, form({ date: hoy, detail: "Hielo", type: "EGRESO", method: "EFECTIVO", amount: "1.300" })));
  // B · Dirección (OWNER): con casa, todo lo que no es el club rebota.
  await probarRechazo(b, b.duenia, "openCashSession", () => openCashSession(null, form({ openingFloat: "0", [CAMPO_ESPERADO_CONFIRMADO]: "0" })));
  await probarRechazo(b, b.duenia, "addLibroEntry", () => addLibroEntry(null, form({ date: hoy, detail: "Hielo", type: "EGRESO", method: "EFECTIVO", amount: "1.300" })));
  await probarRechazo(b, b.duenia, "deleteLibroEntry", () => deleteLibroEntry(null, form({ id: movB.id })));
  await probarRechazo(b, b.duenia, "cerrarDia", () => cerrarDia(form({ day: hoy, declarado_EFECTIVO: "0", columnas: "x" })));
  await probarRechazo(b, b.duenia, "reabrirDiaAction", () => reabrirDiaAction(null, form({ day: hoy, motivo: "Me equivoqué al contar" })));
  await probarRechazo(b, b.duenia, "updateAccentPresetAction", () => updateAccentPresetAction("verde"));
  // closeCashSession con un turno abierto en B (sembrado como dueño de la base: la acción de abrir ya no entra).
  await duenio.cashSession.create({ data: { tenantId: b.id, status: "OPEN", openingFloat: 0, openedBy: b.duenia.id } });
  await probarRechazo(b, b.duenia, "closeCashSession", () => closeCashSession(null, form({ counted: "0", [CAMPO_ESPERADO_CONFIRMADO]: "0" })));
  t.diagnostic(`rechazos vistos: ${rechazos.join(" · ")}`);

  // ── PRENDIDA · Apariencia sin casa ───────────────────────────────────────────────────────────────────────────
  await t.test("prendida · sin casa, la dueña de B cambia el color del equipo", async () => {
    await duenio.tenant.update({ where: { id: b.id }, data: { modules: [] } });
    await anda(b, b.duenia, "updateAccentPresetAction", () => updateAccentPresetAction("verde"));
    assert.equal((await huella(b)).acento, "verde");
  });
});
