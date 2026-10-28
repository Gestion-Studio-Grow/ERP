// Datos del responsable y pendientes que aparecen en los textos legales de Facturita. Una sola fuente:
// cuando el dueño (con su contador y su abogado) los confirme, se cambian acá y no en cada página.
// Mientras tanto, placeholders visibles entre corchetes: no se inventa ningún dato de GSG.

export const RESPONSABLE = {
  razonSocial: "[Razón social de Gestión Studio Grow — a confirmar]",
  cuit: "[CUIT — a confirmar]",
  domicilio: "[Domicilio legal — a confirmar]",
  email: "[Email de contacto para datos personales — a confirmar]",
} as const;

/** Lo que falta definir antes de publicar los textos (Ley 25.326, Ley 24.240 y normativa de ARCA). */
export const PENDIENTES = {
  /** Inscripción de la base en el Registro Nacional de Bases de Datos de la AAIP (art. 21, Ley 25.326). */
  registroAaip: "[N° de inscripción en el Registro Nacional de Bases de Datos de la AAIP — trámite pendiente del dueño]",
  /** Proveedores que alojan o procesan datos, con su país (art. 12 y art. 25, Ley 25.326). */
  proveedores: "[Proveedores de alojamiento y base de datos, con el país donde guardan los datos — listar antes de publicar]",
  /** Plazo para borrar los datos después de la baja (art. 25 inc. 2, Ley 25.326). */
  plazoBorrado: "[plazo de borrado después de la baja — a definir con el abogado]",
  /** Plazo de conservación de comprobantes que pide la normativa de ARCA. */
  plazoConservacionFiscal: "[plazo de conservación — a confirmar con el contador]",
  /** Anticipación con la que se avisan cambios de los términos. */
  avisoCambios: "[plazo de aviso — a definir con el abogado]",
  /** Canal para entregar un certificado propio (incluye la clave privada). */
  canalCertificado: "[canal seguro para entregar el certificado — a definir]",
} as const;

export const SITIO_AAIP = "https://www.argentina.gob.ar/aaip";

export const VIGENCIA_BORRADOR = "Borrador del 22 de octubre de 2026 · todavía no vigente";
