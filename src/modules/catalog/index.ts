// ============================================================================
// MÓDULO SERVICIOS/CATÁLOGO — superficie del módulo (ADR-054/055).
// ============================================================================
//
// Primer módulo real sobre la fundación. Su OBJETO-MAESTRO en el catálogo es el
// descriptor `catalogModule` (kind "capability", capability "catalog:manage"); su
// lógica de ASIGNACIÓN (servicio↔profesional, con el detector DX-6) vive acá. La UI
// del ABM está en src/app/admin/(dashboard)/catalogo (AsignacionSection + las
// secciones de objeto Service/Product/Professional).

export {
  type ProfesionalLite,
  type ServicioLite,
  type DiagnosticoAsignacion,
  diagnosticar,
  profesionalesDeServicio,
  hayAvisos,
} from "./asignacion";

// Re-export del descriptor para tenerlo a mano desde el módulo (la fuente sigue
// siendo el catálogo de la fundación, src/modules/descriptors/nativos.ts).
export { catalogModule } from "../descriptors/nativos";
