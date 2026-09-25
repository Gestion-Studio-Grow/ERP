/**
 * Manifiesto del plugin SAP — modo Archivo (regla 2 de `src/plugins/README.md`, ADR-006).
 *
 * Declara la superficie de integración:
 * - Eventos que consume: NINGUNO. En modo Archivo la entrada es el lote contable que arma el Core
 *   (`armarLoteContable`) y le pasa la pantalla de Tesorería; no escucha el outbox.
 * - Comandos del Core que llama: NINGUNO. La salida son cuatro CSV que Tesorería importa en SAP.
 * - Config por tenant: los parámetros SAP del cliente (`ParametrosSap` del Core). El maestro de
 *   proveedores (CUIT → número de proveedor) es un espejo de DATOS, no config: no va en este schema.
 *   No hay secretos: el modo Archivo no se conecta a nada.
 *
 * Cuando exista el modo API (acuerdos 0057, 0002, 0303 y 0008) este manifiesto suma sus comandos y
 * sus credenciales (secretos por tenant, nunca al repo) y pasa a derivarse de un `ModuleDescriptor`
 * como ARCA y BANCOS. Mientras tanto no se registra en el catálogo de módulos.
 *
 * Sólo importa el TIPO del contrato de módulos de la plataforma (igual que ARCA); no toca el Core de
 * rendiciones (ADR-002).
 */

import type { PluginManifest } from "@/modules/contract";

export const sapManifest: PluginManifest = {
  key: "sap",
  nombre: "SAP S/4HANA Cloud Public — modo Archivo",
  descripcion:
    "Convierte el lote contable de Rendí en las planillas de carga masiva de SAP (facturas de proveedor, asientos, instrucción de compensación para Tesorería y propuesta de alta de proveedores). No se conecta a SAP.",
  consumeEventos: [],
  llamaComandos: [],
  configSchema: {
    sociedad: { tipo: "string", descripcion: "Sociedad (código de empresa) del cliente en SAP." },
    claseDocFactura: { tipo: "string", descripcion: "Clase de documento de la factura de proveedor (ej. KR)." },
    claseDocAsiento: { tipo: "string", descripcion: "Clase de documento del asiento de gastos (ej. SA)." },
    lugarComercial: { tipo: "string", descripcion: "Lugar comercial (business place) de la sociedad." },
    cuentaPuenteAnticipos: {
      tipo: "string",
      descripcion: "Cuenta puente de anticipos, con partidas abiertas por asignación (efectivo y recargable).",
    },
    cuentaTarjetaAPagar: { tipo: "string", descripcion: "Cuenta de la tarjeta corporativa a pagar." },
    cuentaReintegrosAPagar: { tipo: "string", descripcion: "Cuenta de reintegros a pagar al empleado." },
    cuentaPercepcionIva: { tipo: "string", descripcion: "Cuenta de percepciones de IVA sufridas." },
    cuentaPercepcionIibb: { tipo: "string", descripcion: "Cuenta de percepciones de Ingresos Brutos sufridas." },
  },
};
