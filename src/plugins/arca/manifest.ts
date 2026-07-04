/**
 * Manifiesto del plugin ARCA (formato Integration Engine, ADR-006).
 * Declara: qué eventos del Core consume, qué comandos del Core llama, y el
 * schema de su configuración por tenant. El registro central de manifiestos del
 * Core (futuro) lo lee de acá — es la fuente de verdad de cómo se enchufa.
 */

export interface PluginManifest {
  key: string;
  nombre: string;
  descripcion: string;
  /** Eventos de dominio del Core que el plugin escucha (superficie III). */
  consumeEventos: string[];
  /** Comandos públicos del Core que el plugin invoca (superficie II). */
  llamaComandos: string[];
  /** Config por tenant. `secreto: true` ⇒ nunca al repo, va por vault/env. */
  configSchema: Record<
    string,
    { tipo: 'string' | 'number' | 'boolean'; secreto?: boolean; descripcion: string }
  >;
}

export const arcaManifest: PluginManifest = {
  key: 'arca',
  nombre: 'ARCA — Facturación electrónica',
  descripcion:
    'Autorización fiscal de comprobantes ante ARCA (ex-AFIP): obtiene el CAE vía WSAA + WSFEv1. No calcula impuestos (eso vive en el Core, ADR-006).',
  consumeEventos: ['InvoiceCreated'],
  llamaComandos: ['RegisterFiscalDocument'],
  configSchema: {
    cuit: { tipo: 'number', descripcion: 'CUIT del emisor (por tenant).' },
    homologacion: {
      tipo: 'boolean',
      descripcion: 'true = ambiente de testing de ARCA; false = producción.',
    },
    puntoVenta: {
      tipo: 'number',
      descripcion: 'Punto de venta habilitado en ARCA para este tenant.',
    },
    certificadoPem: {
      tipo: 'string',
      secreto: true,
      descripcion: 'Certificado X.509 (PEM) del tenant para el WSAA.',
    },
    clavePrivadaPem: {
      tipo: 'string',
      secreto: true,
      descripcion: 'Clave privada (PEM) asociada al certificado.',
    },
  },
};
