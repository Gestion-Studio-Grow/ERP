"use client";

import { useState } from "react";
import { Aviso, BarraProgreso, Boton, Insignia, ModoDemo, Segmentado, Tarjeta } from "@/components/ui";
import { pesoLegible, plata } from "@/lib/dinero";
import { useDatos } from "@/lib/hooks";
import { CREDITOS, PLANES } from "@/lib/planes";
import { mensajeDeError, obtenerRepo } from "@/lib/repo";
import type { PlanId } from "@/lib/tipos";
import { Cargando, Cifra, Encabezado, ErrorCarga, Seccion, useFotografo } from "./comunes";
import s from "./panel.module.css";

type Periodo = "mensual" | "anual";
const GB = 1024 ** 3;

/** /panel/facturacion */
export function Facturacion() {
  const f = useFotografo();
  const [periodo, setPeriodo] = useState<Periodo>("mensual");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const anual = periodo === "anual";

  const uso = useDatos(
    async () => {
      const repo = obtenerRepo();
      const ahora = new Date();
      const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1).getTime();
      const bytes = await repo.almacenamientoDe(f.id);
      let fotos = 0;
      let videos = 0;
      for (const a of await repo.albumesDe(f.id)) {
        for (const m of await repo.mediosDe(a.id)) {
          if (m.creadoEn < inicioMes) continue;
          if (m.tipo === "video") videos++;
          else fotos++;
        }
      }
      return { bytes, fotos, videos };
    },
    [f.id],
    ["medios", "albumes"],
  );

  async function cambiarPlan(plan: PlanId) {
    setError(null);
    setOcupado(true);
    try {
      await obtenerRepo().actualizarFotografo(f.id, { plan });
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setOcupado(false);
    }
  }

  const actual = PLANES[f.plan];

  return (
    <>
      <Encabezado
        titulo="Facturación"
        bajada="Tu plan y lo que vas usando. Todos los precios, comisiones y créditos son provisionales, a confirmar."
        acciones={
          <span className={s.rotuloLargo}>
            <ModoDemo>Cambiar de plan no cobra nada</ModoDemo>
          </span>
        }
      />

      <Seccion titulo="Plan actual">
        <div className={s.planActual}>
          <Insignia tono={f.plan === "pro" ? "acento" : "ok"}>Plan {actual.nombre}</Insignia>
          <span className={s.ayudaChica}>
            Comisión por venta: <span className="mono">{Math.round(actual.comision * 100)} %</span>
            {f.plan === "pro" ? (
              <>
                {" "}
                · <span className="mono">{actual.creditosMes.toLocaleString("es-AR")}</span> créditos por mes
              </>
            ) : null}
          </span>
        </div>
        {uso.estado === "cargando" ? <Cargando texto="Calculando uso…" /> : null}
        {uso.estado === "error" ? <ErrorCarga error={uso.error} /> : null}
        {uso.estado === "listo" ? <Uso {...uso.datos} plan={f.plan} anual={anual} /> : null}
      </Seccion>

      <Seccion
        titulo="Planes disponibles"
        acciones={
          <Segmentado<Periodo>
            etiqueta="Período de facturación"
            valor={periodo}
            onChange={setPeriodo}
            opciones={[
              { valor: "mensual", texto: "Mensual" },
              { valor: "anual", texto: "Anual" },
            ]}
          />
        }
      >
        {error ? <Aviso tono="error">{error}</Aviso> : null}
        <div className={s.planes}>
          {(Object.keys(PLANES) as PlanId[]).map((id) => {
            const p = PLANES[id];
            const precio = anual ? p.mensualEnAnual : p.mensual;
            const esActual = f.plan === id;
            return (
              <Tarjeta key={id} as="article" className={s.plan}>
                <div className={s.planCabeza}>
                  <h3 className={s.planNombre}>{p.nombre}</h3>
                  {esActual ? <Insignia tono="acento">Tu plan</Insignia> : null}
                </div>
                <p className={s.ayudaChica}>{p.bajada}</p>
                <p className={s.planPrecio}>
                  <span className="mono">{precio ? plata(precio) : "$ 0"}</span>
                  <span className={s.ayudaChica}> / mes{anual && precio ? ", pagando el año" : ""}</span>
                </p>
                <p className={s.ayudaChica}>
                  Comisión <span className="mono">{Math.round(p.comision * 100)} %</span> ·{" "}
                  {p.almacenamientoGB ? (
                    <>
                      <span className="mono">{p.almacenamientoGB} GB</span> de almacenamiento
                    </>
                  ) : (
                    "almacenamiento sin tope fijo"
                  )}
                </p>
                <ul className={s.planLista}>
                  {p.incluye.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
                <p className={s.provisional}>Provisional a confirmar.</p>
                {esActual ? (
                  <Boton disabled ancho>
                    Es tu plan actual
                  </Boton>
                ) : id === "pro" ? (
                  <Boton variante="primario" ancho onClick={() => cambiarPlan("pro")} disabled={ocupado}>
                    Pasar a Pro (modo demostración)
                  </Boton>
                ) : (
                  <Boton ancho onClick={() => cambiarPlan("libre")} disabled={ocupado}>
                    Volver a Libre
                  </Boton>
                )}
              </Tarjeta>
            );
          })}
        </div>
      </Seccion>
    </>
  );
}

function Uso({ bytes, fotos, videos, plan, anual }: { bytes: number; fotos: number; videos: number; plan: PlanId; anual: boolean }) {
  const p = PLANES[plan];
  const gb = bytes / GB;
  const creditosSubidas = fotos * CREDITOS.porFoto + videos * CREDITOS.porVideo;
  const creditosAlmacen = Math.ceil(gb * (anual ? CREDITOS.porGBMesAnual : CREDITOS.porGBMes));
  const creditos = creditosSubidas + creditosAlmacen;
  const limite = p.almacenamientoGB;
  return (
    <div className={s.cifras}>
      <Cifra
        etiqueta="Almacenamiento usado"
        valor={pesoLegible(bytes)}
        nota={
          limite ? (
            <span className={s.usoBarra}>
              <BarraProgreso valor={gb / limite} etiqueta={`Almacenamiento: ${pesoLegible(bytes)} de ${limite} GB`} />
              de {limite} GB del plan {p.nombre}
            </span>
          ) : (
            "Sin tope fijo en Pro"
          )
        }
      />
      <Cifra etiqueta="Subidas este mes" valor={`${fotos} + ${videos}`} nota="fotos + videos" />
      <Cifra
        etiqueta="Créditos estimados del mes"
        valor={creditos.toLocaleString("es-AR")}
        nota={
          plan === "pro"
            ? `${creditosSubidas} por subidas + ${creditosAlmacen} por almacenamiento, de ${p.creditosMes.toLocaleString("es-AR")} incluidos.`
            : "En Libre no se usan créditos: pagás la comisión sólo cuando vendés. Así se verían en Pro."
        }
      />
    </div>
  );
}
