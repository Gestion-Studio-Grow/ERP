// FACTOQUE · Cualquier dirección de la app que no existe (/facturita/app/lo-que-sea) → el 404 de la app
// (../not-found.tsx), adentro del layout: con la barra y una salida. Sin esto Next pintaba el 404 raíz.
// Las rutas reales (facturas, cuenta, arca…) ganan siempre sobre este comodín.

import { notFound } from "next/navigation";

export default function DireccionInexistente(): never {
  notFound();
}
