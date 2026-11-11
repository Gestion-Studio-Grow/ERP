// ============================================================================
// PLAN DE CUENTAS Y EJERCICIOS — lo que usan las pantallas de FC-01.
// ============================================================================
//
// Todo pasa por `enTransaccion` (tenantTransaction con RLS + filtro explícito por tenantId):
// un negocio no lee ni toca el plan de otro. Sin la migración de contabilidad, cada función
// devuelve MIGRACION_PENDIENTE (no rompe la pantalla). Sin migraciones nuevas: usa las tablas de
// las olas 1 y 2 (CuentaContable, CuentaRol, ConfigContable, Ejercicio).

import { naturalezaPorTipo, type TipoCuenta } from "./asiento";
import { CUENTA_MARCA_PROYECTOS, RUBROS_CONTABLES, compararCodigos, planModelo, type RubroContable } from "./plan-modelo";
import { ROLES, rolesModelo, type RolCuenta } from "./roles";
import { Rechazo, candado, enTransaccion, type Resultado } from "./repo";

export interface CuentaDelPlan {
  id: string;
  codigo: string;
  nombre: string;
  tipo: string;
  padreId: string | null;
  imputable: boolean;
  activa: boolean;
  nombreDueno: string | null;
}

export interface PlanDeCuentas {
  cuentas: CuentaDelPlan[];
  /** rol → id de la cuenta que lo cumple. */
  roles: Record<string, string>;
  /** Rubro del plan sembrado (null: todavía no se sembró). */
  rubro: RubroContable | null;
}

/**
 * Rubro del plan a partir de lo guardado. «Servicios por proyecto» se guarda como "servicios" (CHECK
 * de la ola 2) y se reconoce por su cuenta marca. PURA.
 */
export function rubroDelPlan(rubroNegocio: string | null, cuentas: ReadonlyArray<{ codigo: string; nombre: string }>): RubroContable | null {
  if (!rubroNegocio || !(RUBROS_CONTABLES as readonly string[]).includes(rubroNegocio)) return null;
  if (rubroNegocio === "servicios") {
    const marca = planModelo("proyectos").find((c) => c.codigo === CUENTA_MARCA_PROYECTOS)!;
    if (cuentas.some((c) => c.codigo === marca.codigo && c.nombre === marca.nombre)) return "proyectos";
  }
  return rubroNegocio as RubroContable;
}

/**
 * Roles sin cuenta asignada. `delRubro`: los que el plan modelo del rubro trae y faltan (el contador
 * tiene que asignarlos); `otros`: los que no son del rubro (opcionales). PURA.
 */
export function rolesFaltantes(asignados: Iterable<string>, rubro: RubroContable | null): { delRubro: RolCuenta[]; otros: RolCuenta[] } {
  const tiene = new Set(asignados);
  const modelo = rubro ? rolesModelo(rubro) : new Map<RolCuenta, string>();
  const delRubro: RolCuenta[] = [];
  const otros: RolCuenta[] = [];
  for (const rol of ROLES) {
    if (tiene.has(rol)) continue;
    (modelo.has(rol) ? delRubro : otros).push(rol);
  }
  return { delRubro, otros };
}

/** Lee el plan del negocio (ordenado por código), sus roles y el rubro sembrado. */
export function leerPlanDeCuentas(tenantId: string): Promise<Resultado<PlanDeCuentas>> {
  return enTransaccion(tenantId, async (tx) => {
    const [cuentas, roles, config] = await Promise.all([
      tx.cuentaContable.findMany({
        where: { tenantId },
        select: { id: true, codigo: true, nombre: true, tipo: true, padreId: true, imputable: true, activa: true, nombreDueno: true },
      }),
      tx.cuentaRol.findMany({ where: { tenantId }, select: { rol: true, cuentaId: true } }),
      tx.configContable.findFirst({ where: { tenantId }, select: { rubroNegocio: true } }),
    ]);
    cuentas.sort((a, b) => compararCodigos(a.codigo, b.codigo));
    return {
      cuentas,
      roles: Object.fromEntries(roles.map((r) => [r.rol, r.cuentaId])),
      rubro: rubroDelPlan(config?.rubroNegocio ?? null, cuentas),
    };
  });
}

const NOMBRE_MIN = 2;
const NOMBRE_MAX = 80;
const HOJAS_MAX = 99;

/**
 * Agrega una cuenta de detalle (hoja) debajo de un agrupador del negocio. El código lo da el sistema
 * (el siguiente libre del agrupador, nunca reusa un hueco) y la hoja hereda tipo, naturaleza y los
 * atributos de gestión de sus hermanas (o del agrupador si es la primera).
 */
export function agregarHoja(tenantId: string, input: { padreId: string; nombre: string }): Promise<Resultado<{ cuentaId: string; codigo: string }>> {
  return enTransaccion(tenantId, async (tx) => {
    const nombre = input.nombre.trim().replace(/\s+/g, " ");
    if (nombre.length < NOMBRE_MIN || nombre.length > NOMBRE_MAX) {
      throw new Rechazo("DATOS_INVALIDOS", `El nombre de la cuenta tiene que tener entre ${NOMBRE_MIN} y ${NOMBRE_MAX} letras.`);
    }
    await candado(tx, `contabilidad-plan:${tenantId}`);
    const padre = await tx.cuentaContable.findFirst({
      where: { id: input.padreId, tenantId },
      select: { id: true, codigo: true, tipo: true, padreId: true, imputable: true, activa: true, rubro: true, plazo: true, funcion: true },
    });
    if (!padre) throw new Rechazo("NO_ENCONTRADO", "Ese agrupador no existe en el plan de este negocio.");
    if (padre.imputable) throw new Rechazo("PADRE_INVALIDO", "Esa es una cuenta de detalle: las cuentas nuevas van debajo de un agrupador.");
    if (!padre.padreId) throw new Rechazo("PADRE_INVALIDO", "Elegí un agrupador más específico (por ejemplo «Caja y bancos»), no una de las cinco grandes ramas.");
    if (!padre.activa) throw new Rechazo("PADRE_INVALIDO", "Ese agrupador está dado de baja.");

    const hermanas = await tx.cuentaContable.findMany({
      where: { tenantId, padreId: padre.id },
      select: { codigo: true, nombre: true, imputable: true, monetaria: true, ritmo: true, rubro: true, plazo: true, funcion: true },
    });
    if (hermanas.some((h) => !h.imputable)) {
      throw new Rechazo("PADRE_INVALIDO", "Ese agrupador ordena otros agrupadores: elegí uno de ellos.");
    }
    if (hermanas.some((h) => h.nombre.toLocaleLowerCase("es-AR") === nombre.toLocaleLowerCase("es-AR"))) {
      throw new Rechazo("DATOS_INVALIDOS", "Ya hay una cuenta con ese nombre en el mismo agrupador.");
    }
    const ultimo = hermanas.reduce((max, h) => Math.max(max, Number(h.codigo.split(".").pop())), 0);
    if (ultimo >= HOJAS_MAX) throw new Rechazo("DATOS_INVALIDOS", "Ese agrupador ya no tiene códigos libres.");
    const codigo = `${padre.codigo}.${String(ultimo + 1).padStart(2, "0")}`;

    const tipo = padre.tipo as TipoCuenta;
    const resultado = tipo === "RESULTADO_POSITIVO" || tipo === "RESULTADO_NEGATIVO";
    const molde = hermanas[0];
    const nueva = await tx.cuentaContable.create({
      data: {
        tenantId,
        codigo,
        nombre,
        tipo,
        naturaleza: naturalezaPorTipo(tipo),
        padreId: padre.id,
        imputable: true,
        activa: true,
        rubro: molde?.rubro ?? padre.rubro,
        plazo: molde?.plazo ?? padre.plazo,
        funcion: tipo === "RESULTADO_NEGATIVO" ? (molde?.funcion ?? padre.funcion) : null,
        monetaria: molde?.monetaria ?? null,
        ritmo: resultado ? "VARIABLE" : null,
        nombreDueno: resultado ? nombre : null,
      },
      select: { id: true },
    });
    return { cuentaId: nueva.id, codigo };
  });
}

/**
 * Da de baja o reactiva una cuenta de detalle. Una cuenta que cumple un rol no se da de baja:
 * primero se asigna el rol a otra (si no, la contabilización automática quedaría sin destino).
 */
export function cambiarActivaCuenta(tenantId: string, cuentaId: string, activa: boolean): Promise<Resultado<{ cuentaId: string; activa: boolean }>> {
  return enTransaccion(tenantId, async (tx) => {
    await candado(tx, `contabilidad-plan:${tenantId}`);
    const cuenta = await tx.cuentaContable.findFirst({ where: { id: cuentaId, tenantId }, select: { id: true, imputable: true, activa: true } });
    if (!cuenta) throw new Rechazo("NO_ENCONTRADO", "Esa cuenta no existe en el plan de este negocio.");
    if (!cuenta.imputable) throw new Rechazo("DATOS_INVALIDOS", "Sólo se dan de baja cuentas de detalle, no agrupadores.");
    if (!activa) {
      const rol = await tx.cuentaRol.findFirst({ where: { tenantId, cuentaId }, select: { rol: true } });
      if (rol) throw new Rechazo("CUENTA_EN_USO", "Esa cuenta cumple un rol del sistema: asigná el rol a otra cuenta antes de darla de baja.");
    }
    if (cuenta.activa !== activa) await tx.cuentaContable.update({ where: { id: cuenta.id }, data: { activa } });
    return { cuentaId: cuenta.id, activa };
  });
}

export interface EjercicioListado {
  id: string;
  fechaInicio: Date;
  fechaCierre: Date;
  estado: string;
}

/** Ejercicios del negocio, el más reciente primero. */
export function listarEjercicios(tenantId: string): Promise<Resultado<{ ejercicios: EjercicioListado[] }>> {
  return enTransaccion(tenantId, async (tx) => ({
    ejercicios: await tx.ejercicio.findMany({
      where: { tenantId },
      orderBy: { fechaInicio: "desc" },
      select: { id: true, fechaInicio: true, fechaCierre: true, estado: true },
    }),
  }));
}
