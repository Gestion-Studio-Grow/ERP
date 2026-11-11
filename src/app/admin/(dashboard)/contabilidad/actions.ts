"use server";

// FC-01 · acciones del Plan de cuentas y del Ejercicio contable.
//
// "use server" publica cada export como endpoint: el negocio sale de la sesión, nunca del
// formulario; cada acción pasa por `requireAppAccion` (rol, módulo y edición, la misma regla que la
// página) y por el estado del módulo contable (interruptor y migración). Las funciones del repo
// filtran por `tenantId` dentro de `tenantTransaction` (RLS): un id de otro negocio da NO_ENCONTRADO.
// El resultado vuelve como un código fijo en la URL (`?r=`), que la pantalla traduce con
// MENSAJES_RESULTADO: nunca se muestra texto que venga de la URL.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentTenantId } from "@/lib/tenant";
import { AppNoDisponibleError, requireAppAccion } from "@/lib/require-app";
import type { AppId } from "@/apps/registro";
import { estadoContabilidadDelNegocio } from "@/lib/contabilidad/modulo.server";
import { abrirEjercicio, asignarRolCuenta, sembrarPlanModelo, type Resultado } from "@/lib/contabilidad/repo";
import { agregarHoja, cambiarActivaCuenta, leerPlanDeCuentas } from "@/lib/contabilidad/repo-plan";
import { RUBROS_CONTABLES, type RubroContable } from "@/lib/contabilidad/plan-modelo";
import { duracionValida, leerDia, mensajeResultado, type CodigoResultado } from "@/lib/contabilidad/plan-vista";

const RUTA_PLAN = "/admin/contabilidad/plan";
const RUTA_EJERCICIO = "/admin/contabilidad/ejercicio";

/** El negocio de la sesión, si puede usar la app y la contabilidad está lista; si no, por qué. */
async function negocioListo(app: AppId): Promise<{ tenantId: string } | CodigoResultado> {
  try {
    await requireAppAccion(app);
  } catch (e) {
    if (e instanceof AppNoDisponibleError) return "SIN_PERMISO";
    throw e;
  }
  const tenantId = await getCurrentTenantId();
  const estado = await estadoContabilidadDelNegocio(tenantId);
  if (estado === "OCULTO") return "APAGADO";
  if (estado === "MIGRACION_PENDIENTE") return "MIGRACION_PENDIENTE";
  return { tenantId };
}

function codigoDe(r: Resultado<object>, exito: CodigoResultado): CodigoResultado {
  if (r.ok) return exito;
  return mensajeResultado(r.error) ? (r.error as CodigoResultado) : "ERROR";
}

function texto(v: FormDataEntryValue | null, max: number): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

function volver(ruta: string, codigo: CodigoResultado): never {
  revalidatePath(ruta);
  redirect(`${ruta}?r=${codigo}`);
}

/** Carga el plan modelo del rubro. Sólo con el plan vacío: no mezcla dos rubros. */
export async function sembrarPlanAccion(formData: FormData): Promise<void> {
  const n = await negocioListo("plan-de-cuentas");
  if (typeof n === "string") volver(RUTA_PLAN, n);
  const rubro = texto(formData.get("rubro"), 20);
  if (!(RUBROS_CONTABLES as readonly string[]).includes(rubro)) volver(RUTA_PLAN, "DATOS_INVALIDOS");
  const plan = await leerPlanDeCuentas(n.tenantId);
  if (!plan.ok) volver(RUTA_PLAN, codigoDe(plan, "sembrado"));
  if (plan.cuentas.length > 0) volver(RUTA_PLAN, "DATOS_INVALIDOS");
  volver(RUTA_PLAN, codigoDe(await sembrarPlanModelo(n.tenantId, rubro as RubroContable), "sembrado"));
}

export async function agregarHojaAccion(formData: FormData): Promise<void> {
  const n = await negocioListo("plan-de-cuentas");
  if (typeof n === "string") volver(RUTA_PLAN, n);
  const r = await agregarHoja(n.tenantId, { padreId: texto(formData.get("padreId"), 64), nombre: texto(formData.get("nombre"), 200) });
  volver(RUTA_PLAN, codigoDe(r, "hoja"));
}

export async function cambiarActivaAccion(formData: FormData): Promise<void> {
  const n = await negocioListo("plan-de-cuentas");
  if (typeof n === "string") volver(RUTA_PLAN, n);
  const activa = formData.get("activa") === "si";
  const r = await cambiarActivaCuenta(n.tenantId, texto(formData.get("cuentaId"), 64), activa);
  volver(RUTA_PLAN, codigoDe(r, activa ? "alta" : "baja"));
}

export async function asignarRolAccion(formData: FormData): Promise<void> {
  const n = await negocioListo("plan-de-cuentas");
  if (typeof n === "string") volver(RUTA_PLAN, n);
  const r = await asignarRolCuenta(n.tenantId, texto(formData.get("rol"), 64), texto(formData.get("cuentaId"), 64));
  volver(RUTA_PLAN, codigoDe(r, "rol"));
}

export async function abrirEjercicioAccion(formData: FormData): Promise<void> {
  const n = await negocioListo("ejercicio-contable");
  if (typeof n === "string") volver(RUTA_EJERCICIO, n);
  const inicio = leerDia(formData.get("inicio"));
  const cierre = leerDia(formData.get("cierre"));
  if (!inicio || !cierre || !duracionValida(inicio, cierre)) volver(RUTA_EJERCICIO, "FECHAS_INVALIDAS");
  volver(RUTA_EJERCICIO, codigoDe(await abrirEjercicio(n.tenantId, { fechaInicio: inicio, fechaCierre: cierre }), "ejercicio"));
}
