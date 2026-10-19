// ============================================================================
// CÓDIGO / PLU DEL PRODUCTO — lo que se tipea en el catálogo y lo que se dice si ya está usado.
// ============================================================================
//
// `Product.codigo` es el código de barras, el SKU o el PLU de la balanza (el número del producto
// adentro de la etiqueta que imprime la balanza: supermercado/balanza.ts). Es único por negocio
// (@@unique([tenantId, codigo]) en schema.prisma) y la base no acepta un código vacío ni con
// espacios en los bordes: "sin código" es NULL.
//
// Un producto ELIMINADO es un borrado lógico (deletedAt): su fila sigue, con su código. Por eso un
// código puede chocar con un producto que ya no se ve en el catálogo, y el mensaje lo dice.
//
// PURO: sin base. Lo usan las acciones del catálogo (catalog-actions.ts) y codigo-producto.test.ts.

/**
 * El código que trae el formulario. `undefined` = el formulario no tiene el campo (el catálogo de
 * CH, ProductsSection): no se toca lo guardado. Vacío → null (se le saca el código).
 */
export function codigoDelFormulario(formData: Pick<FormData, "has" | "get">): string | null | undefined {
  if (!formData.has("codigo")) return undefined;
  const c = String(formData.get("codigo") ?? "").trim();
  return c || null;
}

/** Lo que se dice cuando el código ya lo tiene otro producto del negocio. */
export function mensajeCodigoOcupado(codigo: string, dueno: { name: string; eliminado: boolean }): string {
  return dueno.eliminado
    ? `El código ${codigo} lo tenía "${dueno.name}", que está eliminado: un producto eliminado conserva su código. Usá otro.`
    : `Ese código lo tiene "${dueno.name}". Usá otro, o sacáselo primero a "${dueno.name}".`;
}

/** ¿Es el choque de un índice único (P2002 de Prisma)? El llamador confirma que fue el código. */
export function esChoqueDeUnico(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";
}
