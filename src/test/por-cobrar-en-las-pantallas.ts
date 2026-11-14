// Arnés de los tests de cobranza contra Postgres: el «por cobrar» de un proyecto en las 5 pantallas, con los LOADERS
// REALES (ver `src/lib/proyectos/cobranza-pantallas-postgres.test.ts`). Los loaders se importan adentro, al llamarla: ya
// después de `apuntarLaAppA`.

import assert from "node:assert/strict";

/**
 * El «por cobrar» de cada proyecto (por id → cliente) en las 5 pantallas, con sus LOADERS REALES; corre en la sesión de
 * la dueña (adentro de `ejecutarAccion`). Además controla que Dirección vea el mismo cobrado que la caja «Cobros».
 */
export async function porCobrarEnLasPantallas(tenantId: string, clienteDe: ReadonlyMap<string, string>) {
  const { exigirVer } = await import("@/lib/proyectos/gestion.server");
  const { cabeceraFicha, datosFinanzas, datosResumen, vistaDe } = await import("@/lib/proyectos/ficha.server");
  const { clientesConProyectos, proyectosDelCliente, reporteProyectos } = await import("@/lib/proyectos/datos.server");
  const { proyectosConNumeros, recuadrosDeCuotas } = await import("@/lib/proyectos/empresa.server");
  const { aPesos } = await import("@/lib/proyectos/gestion-core");
  const { redondear } = await import("@/lib/proyectos/core");
  const actor = await exigirVer("pipeline");
  const vista = vistaDe(actor);
  const porProyecto = new Map<string, Record<string, number>>();
  const rentabilidad = await reporteProyectos();
  const numeros = await proyectosConNumeros(tenantId);
  const admin = await recuadrosDeCuotas(tenantId);
  const clientes = await clientesConProyectos("");
  for (const id of clienteDe.keys()) {
    const cab = await cabeceraFicha(actor, id);
    assert.ok(cab, "la ficha del proyecto se lee");
    const resumen = await datosResumen(actor, cab, vista);
    const finanzas = await datosFinanzas(actor, cab, vista);
    const delCliente = await proyectosDelCliente(clienteDe.get(id)!);
    const fila = rentabilidad.find((f) => f.id === id)!;
    const cuotasAdmin = admin.cuotas.filter((c) => c.proyectoId === id && c.tipo === "COBRO" && !c.pagadoEl);
    const renglones = redondear(cuotasAdmin.reduce((s, c) => s + aPesos(c.pendiente, c.moneda, admin.tc), 0) + admin.sinCalendario.filter((f) => f.proyectoId === id).reduce((s, f) => s + f.pesos, 0));
    porProyecto.set(id, {
      "1 Estado financiero": resumen.finanzas!.aCobrar,
      "2 Caja «Cobros» (saldo)": finanzas.saldo,
      "2 Caja «Cobros» (resumen)": finanzas.resumen.aCobrar,
      "3 Ficha del cliente": redondear(delCliente.reduce((s, p) => s + p.porCobrar, 0)),
      "3 Lista de clientes": clientes.find((c) => c.id === clienteDe.get(id))!.porCobrar,
      "4 Números (Rentabilidad)": fila.porCobrar,
      "5 Administración (renglones)": renglones,
    });
    // Números de Dirección (Por evento): el mismo cobrado que la caja «Cobros».
    assert.equal(numeros.find((n) => n.id === id)!.cobrado, finanzas.cobrado, `Dirección y la caja «Cobros» difieren en lo cobrado de ${id}`);
  }
  return { porProyecto, kpiAdmin: admin.resumen.aCobrar, kpiEventos: admin.resumen.aCobrarDeEventos };
}
