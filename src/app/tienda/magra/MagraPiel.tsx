// La piel de la vidriera de MAGRA: el <style> (una sola vez, desde el servidor) y la parte del
// navegador. Sin las letras: las pone `MagraVidriera` con `next/font`, que sólo existe compilado
// por Next. Los tests montan esta pieza directo (renderToStaticMarkup / esbuild), con las letras
// de respaldo.

import { CSS_BASE, CSS_VIDRIERA } from "./estilos";
import MagraTienda, { type MagraProps } from "./MagraTienda";

export default function MagraPiel({ claseFuentes = "", ...props }: MagraProps & { claseFuentes?: string }) {
  return (
    <div className={claseFuentes || undefined}>
      <style>{CSS_BASE + CSS_VIDRIERA}</style>
      <MagraTienda {...props} />
    </div>
  );
}
