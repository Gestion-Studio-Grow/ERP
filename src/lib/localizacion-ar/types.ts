// Localización fiscal argentina — tipos del subsistema (ADR-019 + ADR-020).
// El conector se modela por CAPACIDADES (no una función fija): agregar padrón,
// ingesta o IIBB provincial más adelante es registrar una capacidad, no rehacer
// esta interfaz (ADR-020 D2).
import type {
  TipoComprobante,
  CondicionIva,
  TipoDocReceptor,
  FiscalAmbiente,
} from "@/generated/prisma/client";

export type Capability =
  | "emitir-comprobante"
  | "consultar-padron"
  | "ingestar-comprobantes"
  | "emitir-fce"
  | "presentar-regimen-informativo"
  | "consultar-alicuota-provincial";

export type FiscalNamespace = "ar.nacional" | "ar.provincial";

// Lo que el Core le pasa al conector para emitir. El Core YA calculó los
// importes (ADR-006): el conector solo hace I/O con ARCA, nunca calcula un impuesto.
export interface EmisionInput {
  tipo: TipoComprobante;
  puntoVenta: number;
  fechaEmision: Date;
  receptorCondicionIva: CondicionIva;
  receptorTipoDoc: TipoDocReceptor;
  receptorNroDoc: string | null;
  neto: number;
  iva: number;
  total: number;
}

// Identidad fiscal con la que el conector habla con ARCA. `connectorRef` es una
// referencia a la credencial (certificado/API key) en el proveedor/gestor de
// secretos, nunca el secreto en claro (regla viva: secretos fuera del repo/DB).
export interface FiscalCredentials {
  cuit: string;
  ambiente: FiscalAmbiente;
  connectorRef: string | null;
}

export type EmisionResult =
  | { ok: true; cae: string; caeVencimiento: Date; nroComprobante: number }
  | { ok: false; motivo: string };
