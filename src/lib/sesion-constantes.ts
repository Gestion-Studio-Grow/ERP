// Los números de la vigencia por uso de la sesión del panel (orden del dueño, 08/11/2026). Sin importaciones a
// propósito: los usan auth.ts (edge), sesion-pin.ts y los textos del login (que llegan al navegador).

/** Sin uso durante esto, la sesión se bloquea y pide el PIN. PROVISIONAL A CONFIRMAR (dueño). */
export const INACTIVIDAD_BLOQUEO_MS = 15 * 60 * 1000;
/** Sin uso durante esto, la sesión vence y pide la contraseña completa. PROVISIONAL A CONFIRMAR (dueño). */
export const INACTIVIDAD_VENCE_MS = 7 * 24 * 60 * 60 * 1000;
/** El proxy reemite el token como mucho cada esto (la última actividad tiene esta resolución). */
export const RENOVAR_SESION_CADA_MS = 5 * 60 * 1000;
/** Intentos errados seguidos de PIN antes de pedir la contraseña completa. PROVISIONAL A CONFIRMAR (dueño). */
export const MAX_INTENTOS_PIN = 5;
/** Cuánto después de entrar con la contraseña se puede definir o cambiar el PIN. PROVISIONAL A CONFIRMAR (dueño). */
export const VENTANA_DEFINIR_PIN_MS = 15 * 60 * 1000;
