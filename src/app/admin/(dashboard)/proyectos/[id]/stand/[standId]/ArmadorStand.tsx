"use client";

// El armador de stands: a la izquierda el 3D, a la derecha las medidas, las piezas y el cómputo.
// El dibujo se guarda solo cuando se aprieta Guardar; pasar el cómputo guarda primero, para que el
// presupuesto nunca salga de un dibujo distinto del que se ve.

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { buttonClasses, cn } from "@/components/ui";
import { agregarArchivo, computoAlPresupuesto, guardarStand } from "@/lib/proyectos/acciones";
import { ACABADOS_PISO, computar, dentroDelLote, LIMITES, normalizarDiseno, PIEZAS, TIPOS_STAND, TIPO_STAND_LABEL, type AcabadoPiso, type DisenoStand, type TipoPieza, type TipoStand } from "@/lib/proyectos/stand";
import type { EscenaStand, Vista } from "@/lib/proyectos/stand-escena";

const campo = "min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm text-strong";

export default function ArmadorStand({
  id,
  proyectoId,
  nombreInicial,
  disenoInicial,
  conPlata,
}: {
  id: string;
  proyectoId: string;
  nombreInicial: string;
  disenoInicial: DisenoStand;
  conPlata: boolean;
}) {
  const [nombre, setNombre] = useState(nombreInicial);
  const [d, setD] = useState<DisenoStand>(disenoInicial);
  const [sel, setSel] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>("perspectiva");
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [sinWebgl, setSinWebgl] = useState(false);
  const [escenaLista, setEscenaLista] = useState(false);
  const [sucio, setSucio] = useState(false);
  const [ocupado, iniciar] = useTransition();
  const lienzo = useRef<HTMLCanvasElement>(null);
  const escena = useRef<EscenaStand | null>(null);
  const contador = useRef(d.piezas.length + 1);
  const router = useRouter();

  const cambiar = useCallback((f: (x: DisenoStand) => DisenoStand) => {
    setSucio(true);
    setD((x) => f(x));
  }, []);

  useEffect(() => {
    let vivo = true;
    const c = lienzo.current;
    if (!c) return;
    const r = () => c.parentElement!.getBoundingClientRect();
    import("@/lib/proyectos/stand-escena")
      .then(({ crearEscena }) => {
        if (!vivo) return;
        const e = crearEscena({
          lienzo: c,
          ancho: r().width,
          alto: r().height,
          editable: true,
          alElegir: setSel,
          alMover: (pid, x, z) => cambiar((v) => ({ ...v, piezas: v.piezas.map((p) => (p.id === pid ? { ...p, x, z } : p)) })),
        });
        escena.current = e;
        setEscenaLista(true);
        setD((v) => {
          e.dibujar(v, null);
          return v;
        });
      })
      .catch(() => setSinWebgl(true));
    const ro = new ResizeObserver(() => escena.current?.medir(r().width, r().height));
    ro.observe(c.parentElement!);
    return () => {
      vivo = false;
      ro.disconnect();
      escena.current?.destruir();
      escena.current = null;
    };
  }, [cambiar]);

  useEffect(() => {
    escena.current?.dibujar(d, sel);
  }, [d, sel]);

  const lineas = useMemo(() => computar(d), [d]);
  const elegida = d.piezas.find((p) => p.id === sel) ?? null;

  const agregarPieza = (tipo: TipoPieza) =>
    cambiar((v) => {
      if (v.piezas.length >= LIMITES.maxPiezas) return v;
      const p = dentroDelLote({ id: `n${contador.current++}`, tipo, x: 0, z: 0, giro: 0 }, v);
      setSel(p.id);
      return { ...v, piezas: [...v.piezas, p] };
    });

  const medidas = (patch: Partial<DisenoStand>) =>
    cambiar((v) => {
      const n = normalizarDiseno({ ...v, ...patch });
      return n ?? v;
    });

  async function guardar(): Promise<boolean> {
    const r = await guardarStand({ id, nombre, diseno: d });
    if (!r.ok) setAviso({ ok: false, texto: r.error });
    else setSucio(false);
    return r.ok;
  }

  const accion = (f: () => Promise<void>) =>
    iniciar(async () => {
      setAviso(null);
      try {
        await f();
      } catch {
        setAviso({ ok: false, texto: "No se pudo hacer. Revisá la conexión y probá de nuevo." });
      }
    });

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px]">
      <div>
        <div className="relative h-[52vh] min-h-[320px] overflow-hidden rounded-2xl border border-line lg:h-[72vh]">
          <canvas ref={lienzo} aria-label={`Vista 3D de ${nombre}`} className="block h-full w-full touch-none" />
          {sinWebgl && <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-strong">Este navegador no puede mostrar el 3D. El cómputo de la derecha sigue funcionando.</p>}
          <div className="absolute left-2 top-2 flex gap-1">
            {(["perspectiva", "frente", "planta"] as Vista[]).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={vista === v}
                onClick={() => {
                  setVista(v);
                  escena.current?.vista(v);
                }}
                className={cn("h-11 rounded-lg px-3 text-sm font-medium capitalize", vista === v ? "bg-accent text-on-accent" : "bg-surface-raised text-strong")}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-2 text-sm text-muted">Arrastrá una pieza para moverla. Arrastrá el fondo para girar la cámara y usá la rueda o dos dedos para acercarla.</p>
      </div>

      <div className="grid content-start gap-4">
        <label className="grid gap-1 text-sm font-medium text-strong">
          Nombre de esta opción
          <input value={nombre} maxLength={80} onChange={(e) => { setNombre(e.target.value); setSucio(true); }} className={campo} />
        </label>

        <fieldset className="grid grid-cols-2 gap-2 rounded-xl border border-line p-3">
          <legend className="px-1 text-sm font-semibold text-strong">El lote</legend>
          <label className="col-span-2 grid gap-1 text-sm">
            Tipo
            <select value={d.tipo} onChange={(e) => medidas({ tipo: e.target.value as TipoStand })} className={campo}>
              {TIPOS_STAND.map((t) => <option key={t} value={t}>{TIPO_STAND_LABEL[t]}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            Frente (m)
            <input type="number" min={LIMITES.min} max={LIMITES.max} step={0.5} value={d.ancho} onChange={(e) => medidas({ ancho: Number(e.target.value) })} className={campo} />
          </label>
          <label className="grid gap-1 text-sm">
            Fondo (m)
            <input type="number" min={LIMITES.min} max={LIMITES.max} step={0.5} value={d.fondo} onChange={(e) => medidas({ fondo: Number(e.target.value) })} className={campo} />
          </label>
          <label className="grid gap-1 text-sm">
            Alto de pared (m)
            <input type="number" min={LIMITES.altoMin} max={LIMITES.altoMax} step={0.1} value={d.altoPared} onChange={(e) => medidas({ altoPared: Number(e.target.value) })} className={campo} />
          </label>
          <label className="grid gap-1 text-sm">
            Piso
            <select value={d.piso} onChange={(e) => medidas({ piso: e.target.value as AcabadoPiso })} className={campo}>
              {Object.entries(ACABADOS_PISO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </label>
          <label className="col-span-2 flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={d.tarimaPiso} onChange={(e) => medidas({ tarimaPiso: e.target.checked })} className="h-5 w-5" />
            Piso sobre tarima
          </label>
        </fieldset>

        <fieldset className="grid grid-cols-2 gap-2 rounded-xl border border-line p-3">
          <legend className="px-1 text-sm font-semibold text-strong">La marca del cliente</legend>
          <label className="col-span-2 grid gap-1 text-sm">
            Texto de la cenefa
            <input value={d.textoMarca} maxLength={40} onChange={(e) => medidas({ textoMarca: e.target.value })} placeholder="Ej.: nombre de la marca" className={campo} />
          </label>
          <label className="grid gap-1 text-sm">
            Color de marca
            <input type="color" value={d.colorAcento} onChange={(e) => medidas({ colorAcento: e.target.value })} className="h-11 w-full rounded-lg border border-line" />
          </label>
          <label className="grid gap-1 text-sm">
            Color de pared
            <input type="color" value={d.colorPared} onChange={(e) => medidas({ colorPared: e.target.value })} className="h-11 w-full rounded-lg border border-line" />
          </label>
        </fieldset>

        <fieldset className="rounded-xl border border-line p-3">
          <legend className="px-1 text-sm font-semibold text-strong">Agregar pieza</legend>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(PIEZAS) as TipoPieza[]).map((t) => (
              <button key={t} type="button" onClick={() => agregarPieza(t)} className={cn(buttonClasses("outline", "md"), "justify-center")}>{PIEZAS[t].label}</button>
            ))}
          </div>
          {elegida && (
            <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-strong">{PIEZAS[elegida.tipo].label}</span>
              <button type="button" className={buttonClasses("outline", "md")} onClick={() => cambiar((v) => ({ ...v, piezas: v.piezas.map((p) => (p.id === elegida.id ? dentroDelLote({ ...p, giro: (p.giro + 1) % 4 }, v) : p)) }))}>Girar</button>
              <button type="button" className={buttonClasses("ghost", "md")} onClick={() => { cambiar((v) => ({ ...v, piezas: v.piezas.filter((p) => p.id !== elegida.id) })); setSel(null); }}>Sacar</button>
            </div>
          )}
        </fieldset>

        <section className="rounded-xl border border-line p-3" aria-label="Cómputo de materiales">
          <h2 className="mb-2 text-sm font-semibold text-strong">Cómputo de este dibujo</h2>
          <ul className="grid gap-1 text-sm">
            {lineas.map((l) => (
              <li key={l.clave} className="flex justify-between gap-3">
                <span className="min-w-0">{l.descripcion}</span>
                <span className="shrink-0 font-medium text-strong">{l.cantidad.toLocaleString("es-AR")} {l.unidad}</span>
              </li>
            ))}
          </ul>
        </section>

        <div className="grid gap-2">
          {aviso && <p role="status" className={cn("rounded-lg px-3 py-2 text-sm", aviso.ok ? "bg-surface-raised text-strong" : "text-danger")}>{aviso.texto}</p>}
          <button
            type="button"
            disabled={ocupado}
            className={cn(buttonClasses("solid", "lg"), "justify-center")}
            onClick={() => accion(async () => { if (await guardar()) setAviso({ ok: true, texto: "Stand guardado." }); })}
          >
            {sucio ? "Guardar stand" : "Guardado"}
          </button>
          <button
            type="button"
            disabled={ocupado || !escenaLista}
            className={cn(buttonClasses("outline", "lg"), "justify-center")}
            onClick={() =>
              accion(async () => {
                const datos = escena.current?.captura();
                if (!datos) return;
                const r = await agregarArchivo({ proyectoId, tipo: "RENDER", nombre: `${nombre} · vista ${vista}`, datos, visibleCliente: true });
                setAviso(r.ok ? { ok: true, texto: "Imagen agregada a la propuesta." } : { ok: false, texto: r.error });
              })
            }
          >
            Agregar esta vista a la propuesta
          </button>
          {conPlata && (
            <button
              type="button"
              disabled={ocupado}
              className={cn(buttonClasses("outline", "lg"), "justify-center")}
              onClick={() =>
                accion(async () => {
                  if (!(await guardar())) return;
                  const r = await computoAlPresupuesto({ standId: id });
                  if (r.ok) {
                    setAviso({ ok: true, texto: `Pasaron ${r.lineas} renglones al presupuesto en borrador.` });
                    router.refresh();
                  } else setAviso({ ok: false, texto: r.error });
                })
              }
            >
              Pasar el cómputo al presupuesto
            </button>
          )}
          <Link href={`/admin/proyectos/${proyectoId}`} className={cn(buttonClasses("ghost", "lg"), "justify-center")}>Volver al proyecto</Link>
        </div>
      </div>
    </div>
  );
}
