"use client";

import { useState } from "react";
import { Aviso, Entrada, Insignia, Segmentado, Tarjeta } from "@/components/ui";
import { LEYENDA_PRECIOS } from "@/lib/contenido/textos";
import { plata } from "@/lib/dinero";
import { CREDITOS, PLANES, calcularPlanes } from "@/lib/planes";
import s from "./paginas.module.css";

type Ciclo = "mensual" | "anual";

const num = (v: string) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const soloDigitos = (v: string) => v.replace(/\D/g, "").slice(0, 12);
const entero = (n: number) => n.toLocaleString("es-AR");
const pct = (n: number) => `${Math.round(n * 100)} %`;

/** Calculadora de planes: compara Libre y Pro con los números del fotógrafo. Usa calcularPlanes(). */
export function Calculadora() {
  const [ventas, setVentas] = useState("300000");
  const [fotos, setFotos] = useState("1500");
  const [videos, setVideos] = useState("20");
  const [gb, setGb] = useState("30");
  const [ciclo, setCiclo] = useState<Ciclo>("mensual");
  const anual = ciclo === "anual";

  const r = calcularPlanes({
    ventasMes: num(ventas),
    fotosMes: num(fotos),
    videosMes: num(videos),
    gb: num(gb),
    anual,
  });
  const gbPorMes = anual ? CREDITOS.porGBMesAnual : CREDITOS.porGBMes;
  const topeLibre = PLANES.libre.almacenamientoGB;
  const pasaTope = topeLibre !== null && num(gb) > topeLibre;
  const empate = r.ahorro === 0;
  const nombre = PLANES[r.conviene].nombre;

  return (
    <div className={s.calc}>
      <Tarjeta as="section">
        <form className={s.form} onSubmit={(e) => e.preventDefault()} aria-labelledby="calc-titulo">
          <h2 id="calc-titulo" className="titulo-m">
            Tus números de un mes
          </h2>
          <Entrada
            etiqueta="Ventas por mes (en pesos)"
            inputMode="numeric"
            autoComplete="off"
            value={ventas}
            onChange={(e) => setVentas(soloDigitos(e.target.value))}
            ayuda={`${plata(num(ventas))} por mes`}
          />
          <div className={s.formFila}>
            <Entrada
              etiqueta="Fotos que subís por mes"
              inputMode="numeric"
              autoComplete="off"
              value={fotos}
              onChange={(e) => setFotos(soloDigitos(e.target.value))}
              ayuda={`${CREDITOS.porFoto} crédito cada una`}
            />
            <Entrada
              etiqueta="Videos que subís por mes"
              inputMode="numeric"
              autoComplete="off"
              value={videos}
              onChange={(e) => setVideos(soloDigitos(e.target.value))}
              ayuda={`${CREDITOS.porVideo} créditos cada uno`}
            />
          </div>
          <Entrada
            etiqueta="GB guardados en total"
            inputMode="numeric"
            autoComplete="off"
            value={gb}
            onChange={(e) => setGb(soloDigitos(e.target.value))}
            ayuda={`${gbPorMes} créditos por GB al mes en el Pro ${anual ? "anual" : "mensual"}`}
          />
          <div className={s.cicloCampo}>
            <span aria-hidden>Ciclo del plan Pro</span>
            <Segmentado<Ciclo>
              etiqueta="Ciclo del plan Pro"
              valor={ciclo}
              onChange={setCiclo}
              opciones={[
                { valor: "mensual", texto: "Mensual" },
                { valor: "anual", texto: "Anual" },
              ]}
            />
          </div>
        </form>
      </Tarjeta>

      <section className={s.resultados} aria-labelledby="calc-resultado">
        <div className={s.veredicto}>
          <h2 id="calc-resultado" className="sr-only">
            Resultado
          </h2>
          <strong aria-live="polite">
            {empate
              ? "Te sale lo mismo con cualquiera de los dos."
              : `Te conviene el plan ${nombre}: ahorrás ${plata(r.ahorro)} por mes.`}
          </strong>
          <p>Cuenta por mes, con tus números. Cambiá cualquier valor y se recalcula.</p>
        </div>

        <div className={s.totales}>
          <Tarjeta as="article" className={s.total}>
            <div className={s.totalCabeza}>
              <h3>{PLANES.libre.nombre}</h3>
              {!empate && r.conviene === "libre" ? <Insignia tono="acento">Te conviene</Insignia> : null}
            </div>
            <p className={`mono ${s.totalMonto}`}>{plata(r.libre.total)}</p>
            <dl className={s.desglose}>
              <div>
                <dt>Ventas del mes</dt>
                <dd className="mono">{plata(num(ventas))}</dd>
              </div>
              <div>
                <dt>Comisión ({pct(PLANES.libre.comision)})</dt>
                <dd className="mono">{plata(r.libre.comision)}</dd>
              </div>
              <div>
                <dt>Costo fijo</dt>
                <dd className="mono">{plata(0)}</dd>
              </div>
            </dl>
          </Tarjeta>

          <Tarjeta as="article" className={s.total}>
            <div className={s.totalCabeza}>
              <h3>{PLANES.pro.nombre}</h3>
              {!empate && r.conviene === "pro" ? <Insignia tono="acento">Te conviene</Insignia> : null}
            </div>
            <p className={`mono ${s.totalMonto}`}>{plata(r.pro.total)}</p>
            <dl className={s.desglose}>
              <div>
                <dt>Abono {anual ? "(anual, por mes)" : "mensual"}</dt>
                <dd className="mono">{plata(r.pro.abono)}</dd>
              </div>
              <div>
                <dt>Créditos incluidos</dt>
                <dd className="mono">{entero(r.pro.creditosIncluidos)}</dd>
              </div>
              <div>
                <dt>Subidas</dt>
                <dd className="mono">{entero(r.pro.creditosSubidas)}</dd>
              </div>
              <div>
                <dt>Almacenamiento</dt>
                <dd className="mono">{entero(r.pro.creditosAlmacen)}</dd>
              </div>
              <div>
                <dt>Créditos usados</dt>
                <dd className="mono">{entero(r.pro.creditosUsados)}</dd>
              </div>
              <div>
                <dt>
                  Excedente ({entero(r.pro.excedente)} × {plata(CREDITOS.extra)})
                </dt>
                <dd className="mono">{plata(r.pro.costoExcedente)}</dd>
              </div>
            </dl>
          </Tarjeta>
        </div>

        {pasaTope ? (
          <Aviso>
            Ojo: el plan Libre guarda hasta {topeLibre} GB. Con {entero(num(gb))} GB te pasás del tope, así que para
            guardar todo necesitás el Pro.
          </Aviso>
        ) : null}

        <p className={s.cuentaNota}>
          {LEYENDA_PRECIOS} En el Pro, los créditos que no usás pasan al mes siguiente; esta cuenta mira un solo mes.
        </p>
      </section>
    </div>
  );
}
