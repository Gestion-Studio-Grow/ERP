import { test } from "node:test";
import assert from "node:assert/strict";
import { motivoFueraDelPlan, type NegocioConPlan } from "./modulos-y-plan";
import { modulosDelPlan } from "@/planes/catalogo";

const nombre = (id: string) => ({ "cuentas-a-pagar": "Cuentas a pagar", multilocal: "Mis locales" })[id] ?? id;
const kiosco = (plan: string | null): NegocioConPlan => ({ plan, esMostrador: true, carniceriaLista: false });
const deMicro = modulosDelPlan("micro", "mostrador").modulos;

test("activar «Cuentas a pagar» en un Micro se rechaza: no entra en Micro", () => {
  const motivo = motivoFueraDelPlan(kiosco("micro"), deMicro, [...deMicro, "cuentas-a-pagar"], nombre);
  assert.ok(motivo);
  assert.match(motivo, /«Cuentas a pagar» no entra en Micro/);
  assert.match(motivo, /No se cambió nada/);
});

test("en Comerciante «Cuentas a pagar» es un agregado permitido: pasa", () => {
  const base = modulosDelPlan("comerciante", "mostrador").modulos;
  assert.equal(motivoFueraDelPlan(kiosco("comerciante"), base, [...base, "cuentas-a-pagar"], nombre), null);
});

test("lo que ya trae el plan (o su rubro) nunca se frena", () => {
  const sinStock = deMicro.filter((m) => m !== deMicro[deMicro.length - 1]);
  assert.equal(motivoFueraDelPlan(kiosco("micro"), sinStock, deMicro, nombre), null);
});

test("apagar un módulo nunca se frena por el plan, aunque el negocio tenga de más", () => {
  const conDeMas = [...deMicro, "cuentas-a-pagar", "multilocal"];
  assert.equal(motivoFueraDelPlan(kiosco("micro"), conDeMas, conDeMas.filter((m) => m !== "multilocal"), nombre), null);
});

test("si el cambio arrastra varios que no entran, los nombra a todos en plural", () => {
  const motivo = motivoFueraDelPlan(kiosco("micro"), deMicro, [...deMicro, "cuentas-a-pagar", "multilocal"], nombre);
  assert.match(motivo ?? "", /«Cuentas a pagar», «Mis locales» no entran en Micro/);
});

test("sin plan del catálogo (vacío o un plan comercial viejo) no hay tope que aplicar", () => {
  const todo = [...deMicro, "cuentas-a-pagar"];
  assert.equal(motivoFueraDelPlan(kiosco(null), deMicro, todo, nombre), null);
  assert.equal(motivoFueraDelPlan(kiosco(""), deMicro, todo, nombre), null);
  assert.equal(motivoFueraDelPlan(kiosco("Pro"), deMicro, todo, nombre), null);
});

test("el rubro cuenta: lo que el plan trae para el mostrador no entra en un negocio de servicios", () => {
  const servicios: NegocioConPlan = { plan: "micro", esMostrador: false, carniceriaLista: false };
  const deServicios = modulosDelPlan("micro", "servicios").modulos;
  const soloMostrador = deMicro.filter((m) => !deServicios.includes(m));
  if (soloMostrador.length === 0) return; // el catálogo no distingue: nada que probar acá
  const motivo = motivoFueraDelPlan(servicios, deServicios, [...deServicios, soloMostrador[0]], nombre);
  assert.match(motivo ?? "", /no entra en Micro/);
});
