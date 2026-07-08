// ============================================================================
// FUNDACIÓN DEL REPOSITORIO DE MÓDULOS — superficie pública (ADR-054 / ADR-055).
// ============================================================================
//
// El "contenedor donde enchufan los módulos" del ERP. Punto de entrada único:
//   - CONTRATO (objeto-maestro): ModuleDescriptor + validación.
//   - REGISTRO / CATÁLOGO (el repo): ModuleRegistry + la instancia curada.
//   - ASIGNACIÓN (variante por tenant): resolverActivacion + asignacionSugerida.
//   - FLAG (reversibilidad): moduleRegistryEnabled.
//
// Ver docs/arquitectura/repositorio-de-modulos.md para el diseño completo.

export {
  type ModuleId,
  type Semver,
  type ModuleKind,
  type EventName,
  type CommandName,
  type RubroCompat,
  type ConfigFieldSchema,
  type ModuleDependency,
  type MigrationRef,
  type ModuleDescriptor,
  type ProblemaCatalogo,
  type PluginManifest,
  validarDescriptor,
  versionSatisface,
  majorDe,
  toLegacyPluginManifest,
} from "./contract";

export {
  ModuleRegistry,
  ModuloDesconocidoError,
  CatalogoInvalidoError,
  rubroCompatible,
} from "./registry";

export {
  type TenantModuleState,
  type Rechazo,
  type ResolucionActivacion,
  resolverActivacion,
  asignacionSugerida,
} from "./activation";

export {
  moduleRegistryEnabled,
  profilesEnabled,
  navGroupingEnabled,
  upgradeTeaserEnabled,
} from "./flags";

export {
  type Perfil,
  type NavGateItem,
  perfilGateAllows,
  visibleNavItems,
} from "./perfil";

export { type NavLockState, resolveNavLockState } from "./candado";

export { construirCatalogo, catalogo, DESCRIPTORES_CATALOGO } from "./catalog";

export {
  type FilaModulo,
  type PlanToggle,
  vistaModulos,
  planActivar,
  planDesactivar,
} from "./vista";
