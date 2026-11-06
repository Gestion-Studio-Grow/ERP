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
import { FICHA_VACIA, MODALIDAD_ETIQUETA, TIPO_ETIQUETA, rutaDeFotoDeServicio, textoDelPrecio } from "@/lib/servicios/ficha";
import { fichasDeServicios } from "@/lib/servicios/ficha.server";
import { getCurrentTenantId } from "@/lib/tenant";

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
    titulo: `${s.name} · ${textoDelPrecio(s.price, pesos)} — ${await nombreDelNegocioCH()}`,
    descripcion: `${s.durationMin} min · ${textoDelPrecio(s.price, pesos)}. Reservá online.`,
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
  // Ficha completa y fotos del servicio (sin la migración: la ficha vacía y sin fotos, como antes).
  const extra = await fichasDeServicios(await getCurrentTenantId(), [s.id]).catch(() => null);
  const ficha = extra?.fichas.get(s.id) ?? FICHA_VACIA;
  const fotos = extra?.fotos.get(s.id) ?? [];
  const dias = nextBusinessDays(2);
  const vecina = s.residentPrice != null && s.residentPrice < s.price ? s.residentPrice : null;
  const { origen, ruta } = await pedidoPublico();
  const ld = origen
    ? servicioLd(
        { nombre: s.name, url: canonicalDe(origen, ruta), precio: s.price > 0 ? s.price : null, duracionMin: s.durationMin },
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
              <dd>{textoDelPrecio(s.price, pesos)}</dd>
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
                <dd>{ficha.depositPercent != null ? `${ficha.depositPercent}\u00a0%` : pesos(s.depositAmount)}</dd>
              </div>
            )}
            {ficha.modality !== "PRESENCIAL" && (
              <div>
                <dt>Modalidad</dt>
                <dd>{MODALIDAD_ETIQUETA[ficha.modality]}</dd>
              </div>
            )}
            {ficha.kind !== "REGULAR" && (
              <div>
                <dt>Tipo</dt>
                <dd>{TIPO_ETIQUETA[ficha.kind]}</dd>
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
            <Compartir titulo={`${s.name} · ${textoDelPrecio(s.price, pesos)}`} />
          </div>
          {fichas.length > 0 && (
            <div className="chf-ficha-hueco">
              <ProximoHueco fichas={fichas} dias={dias} />
            </div>
          )}
        </div>
        {fotos.length > 0 ? (
          <div className="chf-ficha-ilu">
            {/* Fotos propias del tratamiento (hasta 4), servidas por /servicios/foto/[id]. */}
            {/* eslint-disable-next-line @next/next/no-img-element -- JPEG/WebP ya achicado al subir */}
            <img src={rutaDeFotoDeServicio(fotos[0])} alt={`${s.name}: foto 1`} width={1200} height={900} decoding="async" style={{ objectFit: "cover" }} />
            {fotos.length > 1 && (
              <ul style={{ display: "grid", gridTemplateColumns: `repeat(${fotos.length - 1}, minmax(0, 1fr))`, gap: 8, margin: "8px 0 0", padding: 0, listStyle: "none" }}>
                {fotos.slice(1).map((f, i) => (
                  <li key={f}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- JPEG/WebP ya achicado al subir */}
                    <img src={rutaDeFotoDeServicio(f)} alt={`${s.name}: foto ${i + 2}`} width={400} height={300} loading="lazy" decoding="async" style={{ width: "100%", height: "auto", aspectRatio: "4 / 3", objectFit: "cover" }} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="chf-ficha-ilu" aria-hidden>
            {/* Ilustración de marca de la familia: hasta que el servicio tenga fotos propias. */}
            {/* eslint-disable-next-line @next/next/no-img-element -- SVG propio */}
            <img src={ilustracionDeFamilia(familia)} alt="" width={1200} height={900} loading="lazy" decoding="async" />
          </div>
        )}
      </article>
      <BarraReservar texto={s.price > 0 ? `Reservar · ${pesos(s.price)}` : "Reservar"} prefill={{ serviceId: s.id }} />
    </div>
  );
}
