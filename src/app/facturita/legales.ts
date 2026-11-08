// Datos del responsable y pendientes que aparecen en los textos legales de Factoque. Una sola fuente:
// cuando el dueño (con su contador y su abogado) los confirme, se cambian acá y no en cada página.
// Mientras tanto, placeholders visibles entre corchetes «provisional a confirmar»: no se inventa
// ningún dato de GSG. Plan de salida 11/2026 §1 #14: publicados sin franja de borrador y sin noindex.

export const RESPONSABLE = {
  /** Orden del dueño (08/11/2026): nombre comercial y titular. CUIT y domicilio, a confirmar. */
  razonSocial: "Gestión Studio Grow (nombre comercial), titular Maximiliano Ezequiel Lloveras",
  cuit: "[CUIT — provisional a confirmar]",
  domicilio: "[Domicilio legal — provisional a confirmar]",
  email: "[Email de contacto para datos personales — provisional a confirmar]",
} as const;

/** Lo que falta definir antes de publicar los textos (Ley 25.326, Ley 24.240 y normativa de ARCA). */
export const PENDIENTES = {
  /** Inscripción de la base en el Registro Nacional de Bases de Datos de la AAIP (art. 21, Ley 25.326). */
  registroAaip: "[N° de inscripción en el Registro Nacional de Bases de Datos de la AAIP — provisional a confirmar]",
  /** Proveedores que alojan o procesan datos, con su país (art. 12 y art. 25, Ley 25.326). */
  proveedores: "[Proveedores de alojamiento y base de datos, con el país donde guardan los datos — provisional a confirmar]",
  /** Plazo para borrar los datos después de la baja (art. 25 inc. 2, Ley 25.326). */
  plazoBorrado: "[plazo de borrado después de la baja — provisional a confirmar]",
  /** Plazo de conservación de comprobantes que pide la normativa de ARCA. */
  plazoConservacionFiscal: "[plazo de conservación — provisional a confirmar]",
  /** Anticipación con la que se avisan cambios de los términos. */
  avisoCambios: "[plazo de aviso — provisional a confirmar]",
} as const;

export const SITIO_AAIP = "https://www.argentina.gob.ar/aaip";

/** Vigencia de los textos. La fecha la fija el dueño al aprobarlos. */
export const VIGENCIA = "Vigente desde [fecha de vigencia — provisional a confirmar]";
