// ============================================================================
// PLAN DE CUENTAS Y EJERCICIOS — lo que usan las pantallas de FC-01.
// ============================================================================
//
// Todo pasa por `enTransaccion` (tenantTransaction con RLS + filtro explícito por tenantId):
// un negocio no lee ni toca el plan de otro. Sin la migración de contabilidad, cada función
// devuelve MIGRACION_PENDIENTE (no rompe la pantalla). Sin migraciones nuevas: usa las tablas de
// las olas 1 y 2 (CuentaContable, CuentaRol, ConfigContable, Ejercicio) y AuditLog.
//
// Cada cambio del plan (alta de hoja, baja o reactivación, rol, carga y completar roles) toma el
// candado `contabilidad-plan:<negocio>` y deja su fila de AuditLog en la misma transacción.

import { naturalezaPorTipo, type TipoCuenta } from "./asiento";
import { RUBROS_CONTABLES, compararCodigos, planModelo, type RubroContable } from "./plan-modelo";
import { ROLES, problemaDeAsignacion, rolesModelo, type RolCuenta } from "./roles";
import { AUDITORIA_PLAN, Rechazo, candado, enTransaccion, rastroDelPlan, type AuditoriaPlan, type Resultado, type Tx } from "./repo";

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
 * de la ola 2) y se reconoce SÓLO por la marca que deja la carga del plan (`sembradoComoProyectos`:
 * la fila de AuditLog `sembrar` con `rubroAnotado: "proyectos"`). Nunca por las cuentas: el usuario
 * puede crear cualquier combinación de código y nombre. Sin marca, «servicios». PURA.
 */
export function rubroDelPlan(rubroNegocio: string | null, sembradoComoProyectos: boolean): RubroContable | null {
  if (!rubroNegocio || !(RUBROS_CONTABLES as readonly string[]).includes(rubroNegocio)) return null;
  if (rubroNegocio === "servicios" && sembradoComoProyectos) return "proyectos";
  return rubroNegocio as RubroContable;
}

/** Rubro del negocio dentro de una transacción: ConfigContable + la marca de la carga (AuditLog). */
async function rubroEnTx(tx: Tx, tenantId: string): Promise<RubroContable | null> {
  const config = await tx.configContable.findFirst({ where: { tenantId }, select: { rubroNegocio: true } });
  const rubroNegocio = config?.rubroNegocio ?? null;
  const marca =
    rubroNegocio === "servicios"
      ? await tx.auditLog.findFirst({
          where: {
            tenantId,
            entity: AUDITORIA_PLAN.entidadPlan,
            action: AUDITORIA_PLAN.sembrar,
            changes: { path: ["rubroAnotado"], equals: "proyectos" },
          },
          select: { id: true },
        })
      : null;
  return rubroDelPlan(rubroNegocio, marca !== null);
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
    const [cuentas, roles, rubro] = await Promise.all([
      tx.cuentaContable.findMany({
        where: { tenantId },
        select: { id: true, codigo: true, nombre: true, tipo: true, padreId: true, imputable: true, activa: true, nombreDueno: true },
      }),
      tx.cuentaRol.findMany({ where: { tenantId }, select: { rol: true, cuentaId: true } }),
      rubroEnTx(tx, tenantId),
    ]);
    cuentas.sort((a, b) => compararCodigos(a.codigo, b.codigo));
    return {
      cuentas,
      roles: Object.fromEntries(roles.map((r) => [r.rol, r.cuentaId])),
      rubro,
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
export function agregarHoja(
  tenantId: string,
  input: { padreId: string; nombre: string },
  auditoria?: AuditoriaPlan,
): Promise<Resultado<{ cuentaId: string; codigo: string }>> {
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
    await rastroDelPlan(tx, tenantId, auditoria, {
      action: "agregar_hoja",
      entity: AUDITORIA_PLAN.entidadCuenta,
      entityId: nueva.id,
      changes: { despues: { codigo, nombre, padreId: padre.id } },
    });
    return { cuentaId: nueva.id, codigo };
  });
}

/**
 * Da de baja o reactiva una cuenta de detalle. No se da de baja una cuenta que:
 *   · cumple un rol (primero se asigna el rol a otra: si no, la contabilización automática quedaría
 *     sin destino; `asignarRolCuenta` toma el mismo candado, así no se cruzan);
 *   · tiene asientos en borrador (quedarían trabados: no se podrían confirmar);
 *   · tiene saldo distinto de cero en lo confirmado (quedaría congelado en el balance).
 * Todo eso es CUENTA_EN_USO, con el motivo en criollo.
 */
export function cambiarActivaCuenta(
  tenantId: string,
  cuentaId: string,
  activa: boolean,
  auditoria?: AuditoriaPlan,
): Promise<Resultado<{ cuentaId: string; activa: boolean }>> {
  return enTransaccion(tenantId, async (tx) => {
    await candado(tx, `contabilidad-plan:${tenantId}`);
    const cuenta = await tx.cuentaContable.findFirst({ where: { id: cuentaId, tenantId }, select: { id: true, imputable: true, activa: true } });
    if (!cuenta) throw new Rechazo("NO_ENCONTRADO", "Esa cuenta no existe en el plan de este negocio.");
    if (!cuenta.imputable) throw new Rechazo("DATOS_INVALIDOS", "Sólo se dan de baja cuentas de detalle, no agrupadores.");
    if (!activa && cuenta.activa) {
      const rol = await tx.cuentaRol.findFirst({ where: { tenantId, cuentaId }, select: { rol: true } });
      if (rol) throw new Rechazo("CUENTA_EN_USO", "Esa cuenta cumple un rol del sistema: asigná el rol a otra cuenta antes de darla de baja.");
      const borradores = await tx.asientoLinea.count({ where: { tenantId, cuentaId, asiento: { tenantId, estado: "BORRADOR" } } });
      if (borradores > 0) {
        throw new Rechazo("CUENTA_EN_USO", "Esa cuenta tiene asientos en borrador sin confirmar: resolvelos antes de darla de baja.");
      }
      const sumas = await tx.asientoLinea.aggregate({
        where: { tenantId, cuentaId, asiento: { tenantId, estado: "CONFIRMADO" } },
        _sum: { debe: true, haber: true },
      });
      if ((sumas._sum.debe ?? BigInt(0)) !== (sumas._sum.haber ?? BigInt(0))) {
        throw new Rechazo("CUENTA_EN_USO", "Esa cuenta tiene saldo: pasá el saldo a otra cuenta con un asiento y después dala de baja.");
      }
    }
    if (cuenta.activa !== activa) {
      await tx.cuentaContable.update({ where: { id: cuenta.id }, data: { activa } });
      await rastroDelPlan(tx, tenantId, auditoria, {
        action: activa ? "reactivar_cuenta" : "baja_cuenta",
        entity: AUDITORIA_PLAN.entidadCuenta,
        entityId: cuenta.id,
        changes: { antes: { activa: cuenta.activa }, despues: { activa } },
      });
    }
    return { cuentaId: cuenta.id, activa };
  });
}

/**
 * Completa los roles del rubro que faltan en un plan ya cargado (por ejemplo los roles comunes que
 * se sumaron después de la carga). Idempotente y sin pisar nada: no reasigna un rol que ya tiene
 * cuenta, no crea cuentas, y sólo asigna si en el código del plan modelo está LA cuenta del modelo
 * (mismo nombre), de detalle, activa y del tipo del rol. Lo que no cumple queda para el contador.
 */
export function completarRolesFaltantes(
  tenantId: string,
  auditoria?: AuditoriaPlan,
): Promise<Resultado<{ rolesAsignados: number; sinCuenta: RolCuenta[] }>> {
  return enTransaccion(tenantId, async (tx) => {
    await candado(tx, `contabilidad-plan:${tenantId}`);
    const rubro = await rubroEnTx(tx, tenantId);
    if (!rubro) throw new Rechazo("DATOS_INVALIDOS", "Todavía no hay un plan de cuentas cargado: cargá el plan modelo primero.");
    const [cuentas, asignados] = await Promise.all([
      tx.cuentaContable.findMany({ where: { tenantId }, select: { id: true, codigo: true, nombre: true, tipo: true, imputable: true, activa: true } }),
      tx.cuentaRol.findMany({ where: { tenantId }, select: { rol: true } }),
    ]);
    const porCodigo = new Map(cuentas.map((c) => [c.codigo, c]));
    const nombreModelo = new Map(planModelo(rubro).map((c) => [c.codigo, c.nombre]));
    const yaAsignados = new Set(asignados.map((r) => r.rol));
    const nuevos: { tenantId: string; rol: RolCuenta; cuentaId: string }[] = [];
    const sinCuenta: RolCuenta[] = [];
    for (const [rol, codigo] of rolesModelo(rubro)) {
      if (yaAsignados.has(rol)) continue;
      const cuenta = porCodigo.get(codigo);
      if (!cuenta || cuenta.nombre !== nombreModelo.get(codigo) || problemaDeAsignacion(rol, cuenta)) {
        sinCuenta.push(rol);
        continue;
      }
      nuevos.push({ tenantId, rol, cuentaId: cuenta.id });
    }
    const creados = nuevos.length ? await tx.cuentaRol.createMany({ data: nuevos, skipDuplicates: true }) : { count: 0 };
    if (creados.count > 0) {
      await rastroDelPlan(tx, tenantId, auditoria, {
        action: "completar_roles",
        entity: AUDITORIA_PLAN.entidadPlan,
        entityId: null,
        changes: { rubro, rolesAsignados: nuevos.map((n) => ({ rol: n.rol, cuentaId: n.cuentaId })) },
      });
    }
    return { rolesAsignados: creados.count, sinCuenta };
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
