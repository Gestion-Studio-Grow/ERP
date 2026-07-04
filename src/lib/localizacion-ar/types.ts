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
import type { IvaDetalleItem } from "./calculo-fiscal";

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
  cbteTipo: number; // código CbteTipo de ARCA, derivado por el Core
  puntoVenta: number;
  fechaEmision: Date;
  receptorCondicionIva: CondicionIva;
  receptorCondicionIvaId: number; // código ARCA (RG 5616), derivado por el Core
  receptorTipoDoc: TipoDocReceptor;
  receptorDocTipoId: number; // código DocTipo de ARCA, derivado por el Core
  receptorNroDoc: string | null;
  neto: number; // ImpNeto (base gravada)
  exento: number; // ImpOpEx
  noGravado: number; // ImpTotConc
  iva: number; // ImpIVA
  total: number; // ImpTotal
  // Desglose de IVA por alícuota — lo que WSFEv1 exige en su array Iva. Vacío
  // para Factura C (monotributo/exento no discrimina).
  ivaDetalle: IvaDetalleItem[];
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
