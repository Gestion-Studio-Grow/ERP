"use client";

// «Autorizar anulación» en un cobro de turno (`autorizarAnulacionCobro`).

import { autorizarAnulacionCobro } from "@/lib/actions";
import CodigoDeAutorizacion from "../../_anulacion/CodigoDeAutorizacion";
import { aFormData, camposDeAutorizarAnulacion } from "./campos";

export default function AutorizarAnulacion({ cobroId, turnoId }: { cobroId: string; turnoId: string }) {
  return <CodigoDeAutorizacion vale="este cobro" pedir={() => autorizarAnulacionCobro(aFormData(camposDeAutorizarAnulacion({ cobroId, turnoId })))} />;
}
