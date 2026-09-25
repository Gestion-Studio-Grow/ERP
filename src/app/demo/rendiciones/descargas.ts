// Descargas de la demo. Nada viaja a un servidor: el contenido ya está en memoria (lo armó el
// motor o el plugin SAP) y se le entrega al navegador como un Blob. Los nombres llevan el
// prefijo DEMO_ para que nadie confunda una planilla de la demo con una de verdad.

export function nombreDemo(archivo: string, periodo: string): string {
  return `DEMO_${archivo}_${periodo}.csv`;
}

export function descargarArchivo(nombre: string, contenido: string, tipo = "text/csv;charset=utf-8"): void {
  try {
    const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = nombre;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    // Se libera después: revocar en el mismo ciclo hace que algunos navegadores cancelen la descarga.
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  } catch {
    /* navegador sin Blob/URL: no hay descarga, la vista previa sigue en pantalla */
  }
}
