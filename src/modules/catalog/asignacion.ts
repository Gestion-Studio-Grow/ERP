// ============================================================================
// MÓDULO SERVICIOS/CATÁLOGO — lógica de ASIGNACIÓN (variante, ADR-055).
// ============================================================================
//
// Primer módulo REAL construido sobre la fundación (src/modules/): el descriptor
// vive en el catálogo (`catalogModule`, kind "capability"); acá está su lógica de
// dominio para la ASIGNACIÓN servicio↔profesional.
//
// El principio de variante (ADR-055) aplicado al catálogo: el SERVICIO es el
// objeto-maestro (se crea una vez, ABM propio); la relación servicio↔profesional es
// la ASIGNACIÓN (su propio ABM), **explícita y DISTINTA por entidad**. Nunca "todos
// con todo" (causa raíz de A-1 / DX-6): una asignación uniforme hace que el front
// mienta (todas las profesionales mostrando el mismo catálogo).
//
// Este archivo es PURO (sin Prisma, sin React): recibe la foto del catálogo como dato
// y devuelve diagnósticos. Así es testeable sin DB y no toca el aislamiento RLS (el
// llamador ya resolvió el tenant). Es la contraparte de `activation.ts` pero para la
// asignación DENTRO de un tenant (servicio↔profesional), no módulo↔tenant.

/** Vista mínima de un profesional para la asignación. */
export interface ProfesionalLite {
  id: string;
  name: string;
  active: boolean;
  /** Ids de los servicios que tiene asignados (su set, DIFERENCIADO). */
  serviceIds: string[];
}

/** Vista mínima de un servicio para la asignación. */
export interface ServicioLite {
  id: string;
  name: string;
  active: boolean;
  categoryName: string | null;
}

/** Diagnóstico de la asignación de un tenant — el detector del antipatrón DX-6. */
export interface DiagnosticoAsignacion {
  /** Servicios activos SIN ninguna profesional asignada (hueco de cobertura). */
  serviciosSinProfesional: ServicioLite[];
  /** Profesionales activas SIN ningún servicio (no pueden recibir turnos). */
  profesionalesSinServicio: ProfesionalLite[];
  /**
   * true si hay ≥2 profesionales activas con servicios y TODAS comparten
   * exactamente el mismo set — el olor de DX-6 ("todos con todo"). No bloquea (un
   * negocio chico puede tenerlo legítimamente), pero se avisa fuerte para que el
   * operador confirme que es real y no un import uniforme.
   */
  asignacionUniforme: boolean;
  /** Cantidad de profesionales activas con al menos un servicio (contexto del aviso). */
  profesionalesConServicios: number;
}

/** Clave canónica de un set de ids (ordenado) para comparar sets por igualdad. */
function claveSet(ids: string[]): string {
  return [...new Set(ids)].sort().join("|");
}

/**
 * Profesionales (activas) asignadas a un servicio — lookup inverso para el ABM de
 * asignación desde el lado del servicio ("¿quién hace este servicio?").
 */
export function profesionalesDeServicio(
  serviceId: string,
  profesionales: ProfesionalLite[],
): ProfesionalLite[] {
  return profesionales.filter((p) => p.serviceIds.includes(serviceId));
}

/**
 * Corre el diagnóstico de la asignación de un tenant. Núcleo del guardarraíl DX-6:
 * hace VISIBLE lo que antes estaba enterrado en el form de cada profesional.
 */
export function diagnosticar(
  profesionales: ProfesionalLite[],
  servicios: ServicioLite[],
): DiagnosticoAsignacion {
  const activos = profesionales.filter((p) => p.active);
  const serviciosActivos = servicios.filter((s) => s.active);

  // Servicios activos sin ninguna profesional (mirando TODAS las profesionales, no
  // solo activas: un servicio "cubierto" solo por una profesional inactiva igual es
  // un hueco operativo, pero contamos la asignación tal cual está).
  const asignados = new Set<string>();
  for (const p of profesionales) for (const sid of p.serviceIds) asignados.add(sid);
  const serviciosSinProfesional = serviciosActivos.filter((s) => !asignados.has(s.id));

  // Profesionales activas sin ningún servicio.
  const profesionalesSinServicio = activos.filter((p) => p.serviceIds.length === 0);

  // Detector de uniformidad (DX-6): entre las profesionales activas CON servicios,
  // ¿comparten todas el mismo set?
  const conServicios = activos.filter((p) => p.serviceIds.length > 0);
  const claves = new Set(conServicios.map((p) => claveSet(p.serviceIds)));
  const asignacionUniforme = conServicios.length >= 2 && claves.size === 1;

  return {
    serviciosSinProfesional,
    profesionalesSinServicio,
    asignacionUniforme,
    profesionalesConServicios: conServicios.length,
  };
}

/** ¿Hay algo que avisar? (para decidir si se muestra el panel de diagnóstico). */
export function hayAvisos(d: DiagnosticoAsignacion): boolean {
  return (
    d.asignacionUniforme ||
    d.serviciosSinProfesional.length > 0 ||
    d.profesionalesSinServicio.length > 0
  );
}
