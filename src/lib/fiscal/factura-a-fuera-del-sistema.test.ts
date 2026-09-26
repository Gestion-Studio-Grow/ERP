// ============================================================================
// «A CON LEYENDA» Y «M»: EL SISTEMA NO LAS EMITE, Y SE DICE AL CONFIGURAR (QA vuelta 7, bloqueante 1)
// ============================================================================
//
// Soporte elegía «A con leyenda» o «M» como si fuera «A común»; el negocio se enteraba al facturar
// («ARCA te asignó la Factura A con leyenda, y el sistema todavía no la emite…», decidir-comprobante.ts)
// y el Libro IVA y el paquete del estudio quedaban sin esas facturas sin decirlo. Se ejecutan las reglas
// reales: el configurador y la ficha no la aceptan sin confirmar que el cliente y la contadora lo saben,
// «Pasale esto» se lo dice al dueño, y el libro (pantalla, CSV y paquete) avisa que el débito no las trae.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest } from "@/test/base-efimera";
import { prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import * as regimen from "./regimen-factura-a";
import { validarConfiguracion } from "@/app/operador/(console)/solicitudes/configurador-reglas";
import { pasaleEsto } from "@/app/operador/(console)/alta/pasale-esto";
import { armarLibroIva, unirFilasDelCuit } from "@/lib/libros/libro-iva";
import { lineasLibroIva } from "@/lib/libros/libro-iva-export";

const RI = "RESPONSABLE_INSCRIPTO";

test("«A con leyenda» y «M» no pasan sin confirmar que el cliente y la contadora saben que se hacen en ARCA; «A común» no pide nada", () => {
  for (const clase of ["A_CON_LEYENDA", "M"] as const) {
    const sin = regimen.validarRegimenFacturaA(RI, clase);
    assert.equal(sin.ok, false, clase);
    const error = sin.ok ? "" : sin.error;
    assert.match(error, /el sistema todavía no emite/);
    assert.match(error, /sitio de ARCA/);
    assert.match(error, /Libro IVA/);
    assert.match(error, /Tildá «Se lo avisé al cliente y a la contadora»/);
    assert.deepEqual(regimen.validarRegimenFacturaA(RI, clase, true), { ok: true, regimen: clase });
  }
  assert.deepEqual(regimen.validarRegimenFacturaA(RI, "A"), { ok: true, regimen: "A" });
  assert.deepEqual(regimen.validarRegimenFacturaA("MONOTRIBUTO", "M"), { ok: true, regimen: null }, "fuera de un inscripto no corresponde");
  assert.deepEqual([...regimen.REGIMENES_FUERA_DEL_SISTEMA], ["A_CON_LEYENDA", "M"]);
});

test("el configurador de Soporte: «A con leyenda» sin la casilla no crea el cliente; con la casilla, sí", () => {
  const base = {
    razonSocial: "Distribuidora Del Plata SA",
    cuit: "30-71843225-8",
    condicionIva: RI,
    regimenFacturaA: "A_CON_LEYENDA",
    puntoVenta: "3",
    rubro: "mostrador",
    plan: "comerciante",
    email: "duena@delplata.ejemplo.test",
  };
  const sin = validarConfiguracion(base);
  assert.equal(sin.ok, false);
  assert.match(sin.ok ? "" : sin.error, /Con «A con leyenda», el sistema todavía no emite sus Facturas A/);
  const con = validarConfiguracion({ ...base, confirmaFacturaAFuera: "si" });
  assert.equal(con.ok, true, con.ok ? "" : con.error);
  assert.equal(con.ok && con.config.regimenFacturaA, "A_CON_LEYENDA");
});

test("«Pasale esto» le dice al dueño que esas facturas, por ahora, van por el sitio de ARCA", () => {
  const datos = { negocio: "Del Plata", direccion: "https://delplata.gsgapp.com.ar/admin", usuario: "duena@delplata.ejemplo.test", clave: "x" };
  const leyenda = pasaleEsto({ ...datos, facturaAFuera: "A_CON_LEYENDA" }).mensaje;
  assert.match(leyenda, /tus Facturas A con leyenda hacelas en el sitio de ARCA: el sistema todavía no las emite\. Las Facturas B, desde el sistema\./);
  assert.match(pasaleEsto({ ...datos, facturaAFuera: "M" }).mensaje, /tus Facturas M hacelas en el sitio de ARCA/);
  assert.doesNotMatch(pasaleEsto({ ...datos, facturaAFuera: "A" }).mensaje, /sitio de ARCA/);
  assert.doesNotMatch(pasaleEsto(datos).mensaje, /sitio de ARCA/);
});

test("el Libro IVA de un inscripto con «M» avisa arriba que el débito no trae las que se hicieron en ARCA (pantalla, CSV y paquete)", () => {
  const vacio = { comprobantes: [], ventasSinComprobante: [], compras: [], condicion: "responsable-inscripto" as const };
  const conM = armarLibroIva({ ...vacio, regimenFacturaA: "M" });
  assert.equal(conM.facturaAFueraDelSistema, "M");
  const csv = lineasLibroIva(conM).join("\n");
  assert.match(csv, /A revisar: ARCA le asignó Factura M y el sistema todavía no la emite/);
  assert.match(csv, /el débito fiscal de este libro no las incluye/);
  assert.match(csv, /Mis Comprobantes › Emitidos/);
  // «A común» o sin cargar: el libro no cambia.
  assert.equal(armarLibroIva({ ...vacio, regimenFacturaA: "A" }).facturaAFueraDelSistema, undefined);
  assert.doesNotMatch(lineasLibroIva(armarLibroIva(vacio)).join("\n"), /A revisar: ARCA le asignó/);
  // El libro de un CUIT con locales: la clase es del CUIT, la casa manda.
  const fila = { ...vacio, comprobantesDePrueba: [], tiposEmitidos: [], condicionCargada: RI };
  assert.equal(unirFilasDelCuit([{ ...fila, regimenFacturaA: "A_CON_LEYENDA" }, { ...fila, regimenFacturaA: null }]).regimenFacturaA, "A_CON_LEYENDA");
});

test("contra Postgres: la ficha no guarda «A con leyenda» sin confirmar, y el libro del negocio avisa cuando quedó guardada", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor(); // el cargador del libro es «server-only»
  const { operatorPrisma } = await import("@/lib/operator-db");
  const { tenantTransaction } = await import("@/lib/rls");
  const { corregirRegimenFacturaA, leerRegimenFacturaA } = await import("./regimen-factura-a.server");
  const { leerLibroIva } = await import("@/lib/libros/libro-iva-loader");
  base.alBorrar(() => operatorPrisma.$disconnect());

  await operatorPrisma.tenant.update({ where: { id: base.b.id }, data: { arcaCuit: "30718432258", arcaCondicionIva: RI } });
  const sin = await corregirRegimenFacturaA({ tenantId: base.b.id, operador: "soporte", regimen: "A_CON_LEYENDA" });
  assert.equal(sin.ok, false);
  assert.equal(await leerRegimenFacturaA(base.b.id), null, "no se guardó nada");
  assert.deepEqual(await corregirRegimenFacturaA({ tenantId: base.b.id, operador: "soporte", regimen: "A_CON_LEYENDA", confirmaFuera: true }), {
    ok: true,
    regimen: "A_CON_LEYENDA",
  });
  const libro = await tenantTransaction((tx) => leerLibroIva(tx, base.b.id, "2026-09"), { tenantId: base.b.id });
  assert.equal(libro.facturaAFueraDelSistema, "A_CON_LEYENDA");
  // Aislamiento: el libro del otro negocio no hereda el aviso.
  const otro = await tenantTransaction((tx) => leerLibroIva(tx, base.a.id, "2026-09"), { tenantId: base.a.id });
  assert.equal(otro.facturaAFueraDelSistema, undefined);
});
