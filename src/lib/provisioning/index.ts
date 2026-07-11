// Fábrica de tenants (ADR-074) — barrel público del módulo.
//
// La saga que envuelve el core de ADR-019: contrato de entrada, máquina de estados, motor de
// dry-run y orquestador con compensación. Todo lo externo entra por puertos (stubs en esta
// iteración). La consola de operador (RFC-003) y el self-service futuro consumen `planProvision`
// (preview) y `runTenantProvisioning` (alta) inyectando los adaptadores reales.
//
// OJO: importar `./adapters` arrastra el core de ADR-019 (y su `dotenv/config`). Los tests
// importan los submódulos puros (dry-run/provision/stubs/state-machine) directo, no este barrel.

export * from "./types";
export * from "./ports";
export * from "./slug";
export * from "./state-machine";
export { planProvision } from "./dry-run";
export { runTenantProvisioning, ProvisionBlockedError } from "./provision";
export * from "./stubs";
export * from "./adapters";
