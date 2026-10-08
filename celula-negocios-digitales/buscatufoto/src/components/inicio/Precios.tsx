"use client";

import Link from "next/link";
import { useState } from "react";
import { BotonLink, IconoFlecha, IconoTilde, Insignia, Segmentado } from "@/components/ui";
import { LEYENDA_PRECIOS } from "@/lib/contenido/textos";
import { plata } from "@/lib/dinero";
import { PLANES } from "@/lib/planes";
import s from "./inicio.module.css";

type Ciclo = "mensual" | "anual";

const libre = PLANES.libre;
const pro = PLANES.pro;
const ahorroAnual = pro.mensual > 0 ? Math.round((1 - pro.mensualEnAnual / pro.mensual) * 100) : 0;
const pct = (n: number) => `${Math.round(n * 100)} %`;

function Incluye({ items }: { items: string[] }) {
  return (
    <ul className={s.incluye}>
      {items.map((t) =>
        t.endsWith(":") ? (
          <li key={t} className={s.incluyeTitulo}>
            {t}
          </li>
        ) : (
          <li key={t}>
            <IconoTilde />
            <span>{t}</span>
          </li>
        ),
      )}
    </ul>
  );
}

/** Sección de precios del inicio. Todos los números salen de src/lib/planes.ts. */
export function Precios() {
  const [ciclo, setCiclo] = useState<Ciclo>("mensual");
  const anual = ciclo === "anual";
  const precioPro = anual ? pro.mensualEnAnual : pro.mensual;

  return (
    <section id="precios" className={s.seccion} aria-labelledby="titulo-precios">
      <div className="contenedor">
        <div className={s.cabezaFila}>
          <div className={s.cabezaSeccion}>
            <p className="rotulo">Precios</p>
            <h2 id="titulo-precios" className="titulo-l">
              Pagás cuando vendés, o una cuota fija
            </h2>
            <p className="bajada">Arrancá sin pagar nada fijo. Cuando vendas todos los fines de semana, pasate al Pro.</p>
          </div>
          <Segmentado<Ciclo>
            etiqueta="Ciclo de pago del plan Pro"
            valor={ciclo}
            onChange={setCiclo}
            opciones={[
              { valor: "mensual", texto: "Mensual" },
              { valor: "anual", texto: ahorroAnual > 0 ? `Anual (−${ahorroAnual} %)` : "Anual" },
            ]}
          />
        </div>

        <div className={s.planes}>
          <article className={`${s.plan} ${s.planOscuro}`} aria-labelledby="plan-libre">
            <div className={s.planCabeza}>
              <h3 id="plan-libre">{libre.nombre}</h3>
            </div>
            <p className={s.planBajada}>{libre.bajada}</p>
            <div className={s.precio}>
              <p className={s.precioMonto}>
                <span className="mono">{plata(libre.mensual)}</span>
                <span>por mes</span>
              </p>
              <p className={s.precioNota}>+ {pct(libre.comision)} de cada venta</p>
            </div>
            <Incluye items={libre.incluye} />
            <BotonLink href="/panel" variante="claro" tam="grande" ancho>
              Empezar gratis
            </BotonLink>
          </article>

          <article className={`${s.plan} ${s.planClaro}`} aria-labelledby="plan-pro">
            <div className={s.planCabeza}>
              <h3 id="plan-pro">{pro.nombre}</h3>
              <Insignia tono="acento">Recomendado</Insignia>
            </div>
            <p className={s.planBajada}>{pro.bajada}</p>
            <div className={s.precio} aria-live="polite">
              <p className={s.precioMonto}>
                <span className="mono">{plata(precioPro)}</span>
                <span>por mes</span>
              </p>
              <p className={s.precioNota}>
                {anual
                  ? `Pagás el año: ${plata(pro.mensualEnAnual * 12)}. 0 % de comisión.`
                  : `O ${plata(pro.mensualEnAnual)} por mes pagando el año. 0 % de comisión.`}
              </p>
            </div>
            <Incluye items={pro.incluye} />
            <BotonLink href="/panel" variante="primario" tam="grande" ancho>
              Elegir Pro
            </BotonLink>
          </article>
        </div>

        <p className={s.leyenda}>{LEYENDA_PRECIOS}</p>
        <p className={s.preciosPie}>
          <Link href="/calculadora" className={s.enlaceSuave}>
            Calculá qué plan te conviene
            <IconoFlecha />
          </Link>
        </p>
      </div>
    </section>
  );
}
