// El error de un pedido, JUNTO al botón que falló (ronda 2, §4.5): `role="alert"` para que el lector de pantalla lo
// diga y a la vista de quien tocó el botón. Antes el error del cupón quedaba arriba, debajo de la barra fija, y parecía
// que «Hacer pedido» no andaba (QA de Qué Bien Olés y Shine). Sin texto no dibuja nada (y no ocupa lugar).
export default function ErrorDelPedido({ texto, className, id }: { texto: string | null | undefined; className?: string; id?: string }) {
  if (!texto) return null;
  return (
    <p role="alert" id={id} className={className} data-error-del-pedido="">
      {texto}
    </p>
  );
}
