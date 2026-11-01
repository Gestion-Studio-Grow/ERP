// ============================================================================
// LA CARTA DEL DISEÑO NUEVO DE CH (DISENO.md §5.2) y el renglón de servicio que comparten la home y la ficha.
// ============================================================================
//
// Servidor. Una placa de precios navegable: en la compu, índice de familias pegajoso a la izquierda y todas las
// familias abiertas; en el celular, chips de familias arriba y la lista entera con los títulos pegajosos (sin
// acordeón: nadie toca nada para ver un precio). Cada nombre es un enlace a su ficha (/servicios/[id]), que es
// como circula un precio en el barrio: por WhatsApp. «Reservar» abre el modal con ese servicio ya elegido.

import Link from "next/link";
import ReserveButton from "./ReserveButton";
import { categoriaVisible } from "./copy-ch";
import { enumerar, nombreDePila, pesos } from "./equipo";
import type { BookingGroup, BookingProfessional, BookingService } from "./types";

type Servicio = Pick<BookingService, "id" | "name" | "durationMin" | "price" | "residentPrice">;

export function Renglon({
  s,
  meta,
  conVecina,
  enlace = true,
}: {
  s: Servicio;
  /** «Faciales · Carolina y Macarena». */
  meta: string;
  /** El precio de vecina es de CH (ADR-013): otro negocio no lo ve. */
  conVecina: boolean;
  enlace?: boolean;
}) {
  return (
    <li className="chf-serv">
      <span className="chf-serv-txt">
        {enlace ? (
          <Link href={`/servicios/${s.id}`} className="chf-serv-nom">
            {s.name}
          </Link>
        ) : (
          <span className="chf-serv-nom">{s.name}</span>
        )}
        {meta && <span className="chf-serv-meta">{meta}</span>}
      </span>
      <span className="chf-dur">{s.durationMin} min</span>
      <span className="chf-plata">
        {pesos(s.price)}
        {conVecina && s.residentPrice != null && s.residentPrice < s.price && <small>Vecinas {pesos(s.residentPrice)}</small>}
      </span>
      <ReserveButton clase="chf-btn-borde chf-btn-chico" prefill={{ serviceId: s.id }} etiqueta={`Reservar ${s.name}`}>
        Reservar
      </ReserveButton>
    </li>
  );
}

/** Nombres de pila de quienes hacen el servicio, en el orden del equipo. */
export function quienesHacen(id: string, professionals: BookingProfessional[]): string {
  return enumerar(professionals.filter((p) => p.serviceIds.includes(id)).map((p) => nombreDePila(p.name)));
}

const ancla = (g: BookingGroup) => `familia-${g.id}`;

export default function Carta({
  groups,
  professionals,
  conVecina,
}: {
  groups: BookingGroup[];
  professionals: BookingProfessional[];
  conVecina: boolean;
}) {
  const familias = groups.filter((g) => g.services.length > 0);
  // Todo en «Otros servicios» es que el negocio todavía no cargó categorías: ni índice ni título de relleno.
  if (familias.length === 1 && !categoriaVisible(familias[0].name)) {
    return (
      <ul className="chf-renglones">
        {familias[0].services.map((s) => (
          <Renglon key={s.id} s={s} meta={quienesHacen(s.id, professionals)} conVecina={conVecina} />
        ))}
      </ul>
    );
  }
  return (
    <>
      <nav className="chf-chips" aria-label="Familias de servicios">
        {familias.map((g) => (
          <a key={g.id} href={`#${ancla(g)}`}>
            {g.name} <span>{g.services.length}</span>
          </a>
        ))}
      </nav>
      <div className="chf-carta">
        <nav className="chf-indice" aria-label="Índice de la carta">
          {familias.map((g) => (
            <a key={g.id} href={`#${ancla(g)}`}>
              {g.name} <span>{g.services.length}</span>
            </a>
          ))}
        </nav>
        <div>
          {familias.map((g) => (
            <section key={g.id} id={ancla(g)} className="chf-familia" aria-labelledby={`${ancla(g)}-t`}>
              <h2 id={`${ancla(g)}-t`} className="chf-familia-tit">
                {g.name} <span>{g.services.length}</span>
              </h2>
              <ul className="chf-renglones">
                {g.services.map((s) => (
                  <Renglon key={s.id} s={s} meta={quienesHacen(s.id, professionals)} conVecina={conVecina} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
