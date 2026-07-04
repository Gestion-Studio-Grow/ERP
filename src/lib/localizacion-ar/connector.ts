// Registro de conectores de localización (ADR-020 D2). Un conector DECLARA qué
// capacidades soporta y a qué namespace pertenece (`ar.nacional` = ARCA;
// `ar.provincial` = IIBB/Convenio Multilateral). El Core pide por capacidad +
// namespace, nunca por proveedor: cambiar AfipSDK por WS propios, o sumar un
// fisco provincial, es registrar otro conector sin tocar el Core.
import type {
  Capability,
  FiscalNamespace,
  EmisionInput,
  EmisionResult,
  FiscalCredentials,
} from "./types";

export interface FiscalConnector {
  readonly nombre: string;
  readonly namespace: FiscalNamespace;
  readonly capabilities: ReadonlySet<Capability>;
  // Capacidad Fase 1. Las futuras (consultarPadron, ingestarComprobantes,
  // emitirFce, consultarAlicuotaProvincial…) se agregan como métodos opcionales
  // sin romper a los conectores que no las implementan.
  emitir?(input: EmisionInput, cred: FiscalCredentials): Promise<EmisionResult>;
}

const registry: FiscalConnector[] = [];

export function registrarConnector(c: FiscalConnector): void {
  if (!registry.some((r) => r.nombre === c.nombre)) registry.push(c);
}

export function connectorPara(
  cap: Capability,
  namespace: FiscalNamespace,
): FiscalConnector {
  const found = registry.find(
    (c) => c.namespace === namespace && c.capabilities.has(cap),
  );
  if (!found) {
    throw new Error(
      `No hay conector para la capacidad "${cap}" en "${namespace}" (ADR-020). ¿Falta registrar el adaptador?`,
    );
  }
  return found;
}

export function connectoresRegistrados(): ReadonlyArray<FiscalConnector> {
  return registry;
}
