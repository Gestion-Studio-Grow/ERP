// ProfeTurnos — los nombres de los campos del alta. Sin imports: lo usa también el formulario
// (componente de cliente) sin arrastrar la validación al navegador.

/** Campo trampa (honeypot): invisible para una persona; un robot lo llena. */
export const CAMPO_TRAMPA = "sitio_web";

export const CAMPOS = ["nombre", "negocio", "email", "whatsapp", "clave", "terminos"] as const;
export type CampoDelAlta = (typeof CAMPOS)[number];
