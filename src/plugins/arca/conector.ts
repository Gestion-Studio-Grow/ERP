// ============================================================================
// CONECTOR ARCA (suite E3) — sólo salida: ARCA no manda avisos.
// ============================================================================
//
// La emisión del CAE sigue por su camino (arca-dispatch.ts → handler.ts → soap.ts); acá ARCA
// entra al registro de la suite para tener conexión por negocio, secretos cifrados y el botón
// "Probar conexión". La prueba llama a FEDummy de WSFEv1 (no pide ticket ni certificado): dice
// si los servidores de ARCA están arriba, sin escribir nada.

import { arcaModule } from "./module";
import { ENDPOINTS_PRODUCCION } from "./afip/soap";
import { codigoPorEstadoHttp } from "@/integraciones/errores";
import type { ConectorDescriptor, TransporteHttp } from "@/integraciones/contrato";

const enc = new TextEncoder();
const dec = new TextDecoder();

export const SOAP_FE_DUMMY = "http://ar.gov.afip.dif.FEV1/FEDummy";

const SOBRE_FE_DUMMY =
  '<?xml version="1.0" encoding="utf-8"?>' +
  '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">' +
  "<soap:Body><ar:FEDummy/></soap:Body></soap:Envelope>";

/** ¿Los tres servidores de FEDummy dicen OK? */
export function feDummyOk(xml: string): boolean {
  return ["AppServer", "DbServer", "AuthServer"].every((tag) => new RegExp(`<${tag}>\\s*OK\\s*</${tag}>`).test(xml));
}

/** FEDummy falso: OK en los tres servidores (simulador y tests). */
const transporteFalsoArca: TransporteHttp = async (url, solicitud) => {
  const ok = url === ENDPOINTS_PRODUCCION.wsfev1 && solicitud.encabezados?.soapaction === SOAP_FE_DUMMY;
  const xml = ok
    ? "<soap:Envelope><soap:Body><FEDummyResponse><FEDummyResult><AppServer>OK</AppServer><DbServer>OK</DbServer><AuthServer>OK</AuthServer></FEDummyResult></FEDummyResponse></soap:Body></soap:Envelope>"
    : "";
  return { estado: ok ? 200 : 500, encabezados: { "content-type": "text/xml" }, cuerpo: enc.encode(xml) };
};

export const conectorArca: ConectorDescriptor = {
  ...arcaModule,
  kind: "plugin",
  categoria: "fiscal",
  auth: { tipo: "certificado" },
  salida: {
    acciones: [{ id: "emitir-comprobante", descripcion: "Pide el CAE de un comprobante a WSFEv1." }],
  },
  async probarConexion(ctx) {
    try {
      const r = await ctx.transporte(ENDPOINTS_PRODUCCION.wsfev1, {
        metodo: "POST",
        encabezados: { "content-type": "text/xml; charset=utf-8", soapaction: SOAP_FE_DUMMY },
        cuerpo: SOBRE_FE_DUMMY,
      });
      const codigo = codigoPorEstadoHttp(r.estado);
      if (codigo) return { ok: false, codigo };
      return feDummyOk(dec.decode(r.cuerpo))
        ? { ok: true, detalle: "Los servidores de ARCA responden." }
        : { ok: false, codigo: "proveedor_caido" };
    } catch {
      return { ok: false, codigo: "proveedor_caido" };
    }
  },
  // Provisional a confirmar (E2/E3 §2.7).
  limites: { porMinuto: 60, eventosMesPorPlan: { micro: 500, pyme: null } },
  errores: ["credencial_vencida", "cert_por_vencer", "proveedor_caido", "datos_rechazados", "respuesta_invalida"],
  simulador: () => ({
    fuente: "https://www.afip.gob.ar/fe/documentos/manual-desarrollador-ARCA-COMPG-v4-0.pdf (FEDummy; a verificar)",
    escenarios: [],
    transporte: transporteFalsoArca,
  }),
};
