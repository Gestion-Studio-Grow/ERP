// «Lo que más se elige» (DISENO.md §5.1.4): tres renglones grandes con el precio exacto, en el orden que decide
// la agenda (getMostBookedServiceIds; sin historial, los primeros de la carta). Servidor.
import Link from "next/link";
import { Renglon, quienesHacen } from "./Carta";
import type { BookingProfessional } from "./types";
import type { FeaturedService } from "./FeaturedTreatments";

export default function CartaDestacada({
  destacados,
  professionals,
  total,
  conVecina,
}: {
  destacados: FeaturedService[];
  professionals: BookingProfessional[];
  total: number;
  conVecina: boolean;
}) {
  // Sin precio no se destaca (DISENO.md §10).
  const lista = destacados.filter((s) => s.price > 0).slice(0, 3);
  if (lista.length === 0) {
    return <p className="chf-lede">Estamos cargando la carta. Mientras tanto, reservá y te contamos.</p>;
  }
  return (
    <>
      <ul className="chf-renglones">
        {lista.map((s) => (
          <Renglon
            key={s.id}
            s={s}
            meta={[s.groupName, quienesHacen(s.id, professionals)].filter(Boolean).join(" · ")}
            conVecina={conVecina}
          />
        ))}
      </ul>
      <Link href="/servicios" className="chf-enlace chf-mas">
        Ver la carta completa · {total} servicios
      </Link>
    </>
  );
}
