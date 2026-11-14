// El estado «elegido» de un chip del mostrador (Venta/Pedido, la góndola, el descuento puesto).
//
// El acento del negocio es para ACENTOS, no para bloques: un chip elegido va en tinte (fondo suave,
// borde y texto del acento en su versión AA), no lleno. El bloque lleno queda para la acción
// principal de la pantalla (Cobrar). Vale para todos los negocios: el color sale del preset.
export const CHIP_ELEGIDO = "!border-accent !bg-accent-soft !text-accent-ink font-semibold";
