// ============================================================================
// EL APROBADOR DEL DUEÑO EN OTRO SITIO — configuración por negocio. PURO, sin imports.
// ============================================================================
//
// El link que le llega al dueño por WhatsApp («Avisar a <dueño>», aprobar-core.ts → `linkDelAprobador`) abre, por
// defecto, el aprobador del ERP (`/admin/club/aprobar`). Un negocio que todavía aprueba desde el celular con OTRO
// sistema lo declara acá: su link va a esa dirección con el MISMO fragmento `#aprobar&id=…&c=…&n=…&m=…&t=…&p=…&f=…`.
//
// Break Point (decisión G4 del dueño, 18/10, docs/tenants/breakpoint/PARIDAD-REACT.md): mientras dure el trial en el
// ERP, el dueño aprueba con el link del sistema de hoy (el club vanilla, sin login). Ese celular, sin jornada guardada,
// sólo calcula el código con el PIN (`codigoAprobacion`, la misma función del motor que usa el ERP), así que el código
// que da lo acepta la compu del club React (`aprobarPorCodigo`). Para pasar al aprobador del ERP, se borra la línea.
//
// La dirección es la de la página que lee `#aprobar&…` (sin fragmento ni barra final). Nada del tenant en el núcleo:
// el negocio lo pasa quien arma el aviso (pedido-del-duenio.tsx y clientes-core.ts, vía `useNegocioDelClub`).

export const APROBADOR_EXTERNO: Readonly<Record<string, string>> = {
  breakpoint: "https://breakpointpadel.gsgapp.com.ar/club",
};

/** La página externa que aprueba los pedidos de ESTE negocio, o null (el aprobador del ERP). */
export function aprobadorExternoDe(negocio: string | null | undefined, mapa: Readonly<Record<string, string>> = APROBADOR_EXTERNO): string | null {
  if (!negocio) return null;
  return Object.hasOwn(mapa, negocio) ? mapa[negocio] : null;
}
