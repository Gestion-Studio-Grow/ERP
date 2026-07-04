// Conector de ENSAYO (ADR-019). Stand-in del adaptador AfipSDK hasta cablear
// credenciales/certificado y homologar contra ARCA. Devuelve un CAE ficticio
// determinístico para ejercitar el pipeline completo (FiscalDocument → outbox →
// comando idempotente → estado AUTORIZADO) end-to-end SIN tocar ARCA.
//
// NO emite comprobantes reales. Cuando exista el adaptador AfipSDK con
// credenciales, se registra en su lugar y el Core lo toma por capacidad+namespace
// sin cambiar nada más (ADR-020 D2).
import type { FiscalConnector } from "../connector";
import type {
  Capability,
  EmisionInput,
  EmisionResult,
  FiscalCredentials,
} from "../types";

export class HomologacionConnector implements FiscalConnector {
  readonly nombre = "homologacion-stub";
  readonly namespace = "ar.nacional" as const;
  readonly capabilities = new Set<Capability>(["emitir-comprobante"]);

  async emitir(
    input: EmisionInput,
    cred: FiscalCredentials,
  ): Promise<EmisionResult> {
    // CAE ficticio determinístico (14 dígitos, como el real) para trazar el flujo.
    const seed = `${cred.cuit}-${input.puntoVenta}-${input.total}-${input.fechaEmision
      .toISOString()
      .slice(0, 10)}`;
    const cae = Array.from(seed)
      .reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)
      .toString()
      .padStart(14, "0")
      .slice(0, 14);
    const caeVencimiento = new Date(
      input.fechaEmision.getTime() + 10 * 24 * 60 * 60 * 1000,
    );
    const nroComprobante = Date.now() % 100000;
    return { ok: true, cae, caeVencimiento, nroComprobante };
  }
}
