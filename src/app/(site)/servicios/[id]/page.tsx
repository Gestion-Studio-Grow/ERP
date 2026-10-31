// ============================================================================
// LA FICHA DE UN TRATAMIENTO (DISENO.md de CH §5.3) — existe para compartir un precio por WhatsApp.
// ============================================================================
//
// SÓLO CH con el interruptor «Diseño nuevo» prendido. Apagado (o cualquier otro negocio) la ruta no existe:
// 404, como hoy. Datos: el servicio sale de `getPublicBookingData()` (el mismo loader público de la carta:
// sólo servicios activos); si no está, 404. No hay descripción en el modelo: no se inventa texto.

import { destinoPropio, rubroDelTurno } from "@/lib/turnos/rubro-del-turno";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getPublicBookingData } from "@/lib/actions";
import { nextBusinessDays } from "@/lib/datetime";
import { reglaVigenteParaLaClienta } from "@/lib/turnos/practica.server";
import ReserveButton from "../../_ch/ReserveButton";
import ProximoHueco from "../../_ch/ProximoHueco";
import BarraReservar from "../../_ch/BarraReservar";
import Compartir from "../../_ch/Compartir";
import { chConDisenoNuevo } from "../../_ch/diseno-ch.server";
import { metadataCH, nombreDelNegocioCH } from "../../_ch/metadata-ch.server";
import JsonLd from "@/components/seo/JsonLd";
import { canonicalDe, pedidoPublico } from "@/lib/seo/base";
import { servicioLd } from "@/lib/seo/jsonld";
import { fichasDeHueco, fotoChicaDe, ilustracionDeFamilia, iniciales, enumerar, nombreDePila, pesos } from "../../_ch/equipo";

export const dynamic = "force-dynamic";

async function buscar(id: string) {
  if (!(await chConDisenoNuevo())) return null;
  const { groups, professionals } = await getPublicBookingData();
  for (const g of groups) {
    const s = g.services.find((x) => x.id === id);
    if (s) return { s, familia: g.name, groups, professionals };
  }
  return null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const hallado = await buscar(id);
  if (!hallado) return {};
  const { s } = hallado;
  return metadataCH({
    titulo: `${s.name} · ${pesos(s.price)} — ${await nombreDelNegocioCH()}`,
    descripcion: `${s.durationMin} min · ${pesos(s.price)}. Reservá online.`,
  });
}

export default async function FichaServicio({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const propio = destinoPropio(await rubroDelTurno(), "servicio", id);
  if (propio) redirect(propio);
  const hallado = await buscar(id);
  if (!hallado) notFound();
  const { s, familia, groups, professionals } = hallado;
  const regla = await reglaVigenteParaLaClienta().catch(() => null);
  const quienes = professionals.filter((p) => p.serviceIds.includes(s.id));
  const fichas = fichasDeHueco(professionals, groups, [], s.id);
  const dias = nextBusinessDays(2);
  const vecina = s.residentPrice != null && s.residentPrice < s.price ? s.residentPrice : null;
  const { origen, ruta } = await pedidoPublico();
  const ld = origen
    ? servicioLd(
        { nombre: s.name, url: canonicalDe(origen, ruta), precio: s.price, duracionMin: s.durationMin },
        { nombre: await nombreDelNegocioCH(), url: origen, tipo: "HealthAndBeautyBusiness" },
      )
    : null;

  return (
    <div className="chf">
      {ld && <JsonLd datos={ld} />}
      <article className="chf-env chf-ficha">
        <div className="chf-ficha-txt">
          <Link href="/servicios" className="chf-volver">
            Volver a la carta
          </Link>
          <p className="chf-kicker">{familia}</p>
          <h1 className="chf-h2" style={{ overflowWrap: "anywhere" }}>
            {s.name}
          </h1>
          <dl className="chf-cifras">
            <div>
              <dt>Duración</dt>
              <dd>{s.durationMin} min</dd>
            </div>
            <div>
              <dt>Precio</dt>
              <dd>{pesos(s.price)}</dd>
            </div>
            {vecina != null && (
              <div>
                <dt>Vecinas</dt>
                <dd>{pesos(vecina)}</dd>
              </div>
            )}
            {s.depositAmount != null && (
              <div>
                <dt>Seña</dt>
                <dd>{pesos(s.depositAmount)}</dd>
              </div>
            )}
          </dl>
          {quienes.length > 0 && (
            <div className="chf-lohacen">
              <ul aria-hidden>
                {quienes.map((p) => {
                  const foto = fotoChicaDe(p.name);
                  return (
                    <li key={p.id} className="chf-cara">
                      {/* eslint-disable-next-line @next/next/no-img-element -- WebP propio de 320 px, ya optimizado */}
                      {foto ? <img src={foto} alt="" width={56} height={56} decoding="async" /> : iniciales(p.name)}
                    </li>
                  );
                })}
              </ul>
              <p>
                {quienes.length === 1 ? "Lo hace" : "Lo hacen"} {enumerar(quienes.map((p) => nombreDePila(p.name)))}
              </p>
            </div>
          )}
          {regla && <p className="chf-regla">{regla}</p>}
          <div className="chf-acc">
            <ReserveButton clase="chf-btn" prefill={{ serviceId: s.id }}>
              Reservar este tratamiento
            </ReserveButton>
            <Compartir titulo={`${s.name} · ${pesos(s.price)}`} />
          </div>
          {fichas.length > 0 && (
            <div className="chf-ficha-hueco">
              <ProximoHueco fichas={fichas} dias={dias} />
            </div>
          )}
        </div>
        <div className="chf-ficha-ilu" aria-hidden>
          {/* Ilustración de marca de la familia: placeholder hasta tener fotos propias del tratamiento. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- SVG propio */}
          <img src={ilustracionDeFamilia(familia)} alt="" width={1200} height={900} loading="lazy" decoding="async" />
        </div>
      </article>
      <BarraReservar texto={`Reservar · ${pesos(s.price)}`} prefill={{ serviceId: s.id }} />
    </div>
  );
}
