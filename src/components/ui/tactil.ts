// Respuesta física de un toque: 10 ms de vibración en los teléfonos que la tienen (Android; el
// iPhone no expone `navigator.vibrate`) y SÓLO si la persona no pidió menos movimiento. Sin efecto
// en el servidor. Lo usan la tecla principal (vía DisenoProvider), Deslizar y el Teclado.
export function vibrar(ms = 10): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  try {
    navigator.vibrate(ms);
  } catch {
    // Algunos navegadores tiran si la página no tuvo un gesto todavía: no es un error del usuario.
  }
}
