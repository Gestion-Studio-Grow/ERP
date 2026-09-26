// La dirección de una pantalla del panel de un cliente, a partir de lo que armó el servidor
// (paneles-de-la-cartera.ts). PURA y sin imports: la usan las pantallas de /contador en el navegador.

/** subdominio → origen que el deploy rutea («https://host»). Texto plano: viaja del servidor a la pantalla. */
export type PanelesDeLaCartera = Readonly<Record<string, string>>;

/** La dirección de `ruta` en el panel del cliente, o `null` si el deploy no le rutea ninguna. */
export function direccionDelPanel(paneles: PanelesDeLaCartera, subdominio: string | null | undefined, ruta: string): string | null {
  const sub = subdominio?.trim().toLowerCase();
  if (!sub || !Object.hasOwn(paneles, sub)) return null;
  return `${paneles[sub]}${ruta}`;
}
