// El botón de «Agendar»: arranca SIN alumno elegido (B1). Antes la lista arrancaba con el primero
// marcado y era fácil agendarle la clase —y mandarle el WhatsApp— a quien no era. Puro, para probarlo.

export function botonAgendar(p: { nuevo: boolean; alumnoId: string; pendiente: boolean }): { disabled: boolean; texto: string } {
  if (p.pendiente) return { disabled: true, texto: "Agendando…" };
  if (!p.nuevo && !p.alumnoId) return { disabled: true, texto: "Elegí el alumno" };
  return { disabled: false, texto: "Agendar" };
}
