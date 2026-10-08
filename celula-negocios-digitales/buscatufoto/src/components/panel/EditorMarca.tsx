"use client";

import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { Aviso, BarraProgreso, Boton, Entrada, Insignia, Segmentado, Tarjeta } from "@/components/ui";
import { MARCA_POR_DEFECTO, pintarVistaEnVivo, OPACIDAD_MIN } from "@/lib/marca-agua";
import { mensajeDeError, obtenerRepo } from "@/lib/repo";
import type { MarcaAgua, ModoMarca } from "@/lib/tipos";
import { Encabezado, useFotografo } from "./comunes";
import { rehacerMarcas } from "./rehacer";
import s from "./panel.module.css";

const LOGO_MAX = 1024 * 1024;
const LOGO_TIPOS = ["image/png", "image/jpeg", "image/svg+xml"];

interface Fondo {
  img: ImageBitmap;
  origen: string;
}

/** /panel/marca */
export function EditorMarca() {
  const f = useFotografo();
  // El borrador arranca con la marca guardada; se monta de nuevo si cambia de cuenta.
  return <Editor key={f.id} />;
}

function Editor() {
  const f = useFotografo();
  const [marca, setMarca] = useState<MarcaAgua>(() => ({ ...f.marca }));
  const [fondo, setFondo] = useState<Fondo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorLogo, setErrorLogo] = useState<string | null>(null);
  const [guardada, setGuardada] = useState<MarcaAgua | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [rehacer, setRehacer] = useState<{ hechas: number; total: number } | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);
  const lienzo = useRef<HTMLCanvasElement>(null);
  const idLogo = useId();

  const cambiada = JSON.stringify(marca) !== JSON.stringify(f.marca);
  const set = (c: Partial<MarcaAgua>) => {
    setGuardada(null);
    setResultado(null);
    setMarca((m) => ({ ...m, ...c }));
  };

  // Foto de fondo para la vista en vivo: una del primer álbum que tenga fotos o, si no hay, una de muestra.
  useEffect(() => {
    let vivo = true;
    let cargada: ImageBitmap | null = null;
    (async () => {
      const repo = obtenerRepo();
      let blob: Blob | null = null;
      let origen = "una foto de muestra";
      try {
        for (const a of await repo.albumesDe(f.id)) {
          const foto = (await repo.mediosDe(a.id)).find((m) => m.tipo === "foto");
          if (foto) {
            blob = await repo.originalParaDueno(foto.id, f.id);
            origen = `${foto.nombreArchivo} (${a.nombre})`;
            break;
          }
        }
      } catch {
        blob = null;
      }
      if (!blob) {
        const r = await fetch("/muestras/BTF_1205_d1043.jpg");
        if (r.ok) blob = await r.blob();
        origen = "una foto de muestra";
      }
      if (!blob) return;
      cargada = await createImageBitmap(blob, { imageOrientation: "from-image" });
      if (vivo) setFondo({ img: cargada, origen });
      else cargada.close();
    })().catch(() => {
      /* sin fondo: la vista en vivo usa un gris liso */
    });
    return () => {
      vivo = false;
    };
  }, [f.id]);

  // Repintar en el próximo cuadro cada vez que cambia algo.
  useEffect(() => {
    const c = lienzo.current;
    if (!c) return;
    const raf = requestAnimationFrame(() => {
      void pintarVistaEnVivo(c, fondo?.img ?? null, fondo?.img.width ?? 0, fondo?.img.height ?? 0, marca);
    });
    return () => cancelAnimationFrame(raf);
  }, [marca, fondo]);

  const ancho = 1200;
  const alto = fondo ? Math.round(Math.min(1.25, Math.max(0.5, fondo.img.height / fondo.img.width)) * ancho) : 800;

  function elegirLogo(e: ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    setErrorLogo(null);
    if (!archivo) return;
    if (!LOGO_TIPOS.includes(archivo.type)) return setErrorLogo("El logo tiene que ser PNG, JPG o SVG.");
    if (archivo.size > LOGO_MAX) return setErrorLogo("El logo pesa más de 1 MB. Probá con uno más liviano (un PNG con fondo transparente es ideal).");
    const lector = new FileReader();
    lector.onload = () => set({ logo: String(lector.result) });
    lector.onerror = () => setErrorLogo("No pudimos leer ese archivo.");
    lector.readAsDataURL(archivo);
  }

  async function guardar() {
    setError(null);
    setOcupado(true);
    try {
      const nuevo = await obtenerRepo().actualizarMarca(f.id, marca);
      setGuardada(nuevo.marca);
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setOcupado(false);
    }
  }

  async function rehacerTodo(m: MarcaAgua) {
    setResultado(null);
    setError(null);
    try {
      const repo = obtenerRepo();
      const ids: string[] = [];
      for (const a of await repo.albumesDe(f.id)) for (const medio of await repo.mediosDe(a.id)) ids.push(medio.id);
      const r = await rehacerMarcas(ids, f.id, m, (hechas, total) => setRehacer({ hechas, total }));
      setResultado(r.errores ? `Rehicimos ${r.ok} archivos; ${r.errores} no se pudieron rehacer.` : `Listo: rehicimos la marca de ${r.ok} archivos.`);
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setRehacer(null);
    }
  }

  return (
    <>
      <Encabezado
        titulo="Marca de agua"
        bajada="Es lo que protege tus fotos antes de la venta. Se aplica a las vistas previas y miniaturas; el original queda limpio y sólo lo descarga quien pagó."
        acciones={
          f.plan === "pro" ? (
            <Insignia tono="ok">Incluida en tu plan Pro</Insignia>
          ) : (
            <span className={s.rotuloLargo}>
              <Insignia tono="acento">Función del plan Pro (en la demo está abierta)</Insignia>
            </span>
          )
        }
      />

      <div className={s.editorMarca}>
        <Tarjeta className={s.vistaVivo}>
          <canvas
            ref={lienzo}
            width={ancho}
            height={alto}
            className={s.lienzoVivo}
            role="img"
            aria-label="Vista en vivo de la marca de agua sobre una foto"
          />
          <p className={s.ayudaChica}>Vista en vivo sobre {fondo ? fondo.origen : "un fondo liso (cargando la foto…)"}.</p>
        </Tarjeta>

        <Tarjeta className={s.controlesMarca}>
          <Entrada etiqueta="Texto" value={marca.texto} onChange={(e) => set({ texto: e.target.value })} maxLength={60} placeholder="Ej.: © Tu Estudio" />

          <div className={s.campoLogo}>
            <span className={s.etiquetaSuelta} id={`${idLogo}-et`}>
              Logo
            </span>
            <div className={s.filaLogo}>
              {marca.logo ? (
                // eslint-disable-next-line @next/next/no-img-element -- logo propio como data URL
                <img src={marca.logo} alt="Tu logo" className={s.logoPrevia} />
              ) : (
                <span className={s.ayudaChica}>Sin logo: sólo el texto.</span>
              )}
              <input id={idLogo} type="file" accept={LOGO_TIPOS.join(",")} className={s.inputArchivo} onChange={elegirLogo} aria-describedby={`${idLogo}-ay`} />
              <label className={s.botonArchivo} htmlFor={idLogo}>
                {marca.logo ? "Cambiar logo" : "Subir logo"}
              </label>
              {marca.logo ? (
                <Boton tam="chico" variante="fantasma" onClick={() => set({ logo: null })}>
                  Quitar logo
                </Boton>
              ) : null}
            </div>
            <span id={`${idLogo}-ay`} className={s.ayudaChica}>
              PNG, JPG o SVG de hasta 1 MB. Mejor con fondo transparente.
            </span>
            {errorLogo ? (
              <span role="alert" className={s.error}>
                {errorLogo}
              </span>
            ) : null}
          </div>

          <div className={s.filaColor}>
            <label htmlFor={`${idLogo}-color`} className={s.etiquetaSuelta}>
              Color del texto
            </label>
            <input id={`${idLogo}-color`} type="color" value={marca.color} onChange={(e) => set({ color: e.target.value })} className={s.selectorColor} />
            <span className="mono">{marca.color}</span>
          </div>

          <Deslizador etiqueta="Opacidad" min={OPACIDAD_MIN} max={0.9} paso={0.01} valor={marca.opacidad} mostrar={(v) => `${Math.round(v * 100)} %`} onChange={(v) => set({ opacidad: v })} />
          <Deslizador etiqueta="Escala" min={0.5} max={2.5} paso={0.05} valor={marca.escala} mostrar={(v) => `${v.toFixed(2).replace(".", ",")}×`} onChange={(v) => set({ escala: v })} />
          <Deslizador etiqueta="Ángulo" min={-60} max={60} paso={1} valor={marca.angulo} mostrar={(v) => `${v}°`} onChange={(v) => set({ angulo: v })} />

          <div className={s.campoSuelto}>
            <span className={s.etiquetaSuelta}>Distribución</span>
            <Segmentado<ModoMarca>
              etiqueta="Distribución de la marca"
              valor={marca.modo}
              onChange={(v) => set({ modo: v })}
              opciones={[
                { valor: "mosaico", texto: "Mosaico" },
                { valor: "centro", texto: "Al centro" },
              ]}
            />
          </div>

          {error ? (
            <p role="alert" className={s.error}>
              {error}
            </p>
          ) : null}

          <div className={s.filaBotones}>
            <Boton variante="primario" onClick={guardar} disabled={!cambiada || ocupado}>
              {ocupado ? "Guardando…" : "Guardar marca"}
            </Boton>
            <Boton variante="fantasma" onClick={() => set({ ...MARCA_POR_DEFECTO })}>
              Restablecer
            </Boton>
            {cambiada ? (
              <Boton variante="fantasma" onClick={() => set({ ...f.marca })}>
                Descartar cambios
              </Boton>
            ) : null}
          </div>
        </Tarjeta>
      </div>

      {guardada || rehacer || resultado ? (
        <Tarjeta as="section" className={s.tarjetaRehacer}>
          {guardada && !rehacer && !resultado ? (
            <div className={s.avisoConBoton}>
              <span>Marca guardada. Las fotos nuevas salen con esta marca. ¿Querés aplicarla también a las que ya subiste?</span>
              <Boton variante="primario" tam="chico" onClick={() => rehacerTodo(guardada)}>
                Rehacer las marcas de mis álbumes
              </Boton>
            </div>
          ) : null}
          {rehacer ? (
            <div className={s.cola} aria-live="polite">
              <BarraProgreso valor={rehacer.total ? rehacer.hechas / rehacer.total : 0} etiqueta="Rehaciendo marcas de agua" />
              <p className={`mono ${s.colaEstado}`}>
                Rehaciendo marcas: {rehacer.hechas} de {rehacer.total}
              </p>
            </div>
          ) : null}
          {resultado ? <Aviso tono="ok">{resultado}</Aviso> : null}
        </Tarjeta>
      ) : null}
    </>
  );
}

function Deslizador({
  etiqueta,
  min,
  max,
  paso,
  valor,
  mostrar,
  onChange,
}: {
  etiqueta: string;
  min: number;
  max: number;
  paso: number;
  valor: number;
  mostrar: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const id = useId();
  return (
    <div className={s.deslizador}>
      <div className={s.deslizadorCabeza}>
        <label htmlFor={id} className={s.etiquetaSuelta}>
          {etiqueta}
        </label>
        <output htmlFor={id} className="mono">
          {mostrar(valor)}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={paso}
        value={valor}
        aria-valuetext={mostrar(valor)}
        onChange={(e) => onChange(Number(e.target.value))}
        className={s.rango}
      />
    </div>
  );
}
