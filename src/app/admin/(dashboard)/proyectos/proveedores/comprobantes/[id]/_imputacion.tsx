"use client";

// O28 · el editor de la imputación: cada línea va a un proyecto o a administración; «Falta imputar» tiene que llegar a 0
// al centavo para guardar (el servidor lo vuelve a controlar y, si no suma, no guarda nada).
import { useMemo, useState, useTransition } from "react";
import { buttonClasses, cn } from "@/components/ui";
import { imputarComprobante, type LineaDelForm } from "@/lib/proyectos/acciones-comprobantes";
import type { TratamientoIva } from "@/lib/proyectos/comprobantes-core";
import { centavosDelTexto, textoDeCentavos as aTexto } from "@/lib/proyectos/comprobantes-core";
import { pesos } from "@/lib/proyectos/core";
import { repartirIva } from "@/lib/proyectos/imputacion-core";
import { campo, etiqueta } from "../../../_vista";

interface Fila {
  clave: number;
  destino: string; // id de proyecto o «ADMINISTRACION»
  categoria: string;
  sector: string;
  neto: string;
  iva: string;
  tratamiento: TratamientoIva;
}

export function EditorImputacion(props: {
  comprobanteId: string;
  netoCentavos: number;
  ivaCentavos: number;
  tratamientoPorDefecto: TratamientoIva;
  provisional: boolean;
  proyectos: readonly { id: string; label: string }[];
  categorias: readonly string[];
  categoriasAdministracion: readonly string[];
  sectores: readonly string[];
  iniciales: readonly { destino: string; categoria: string; sector: string; netoCentavos: number; ivaCentavos: number; tratamiento: TratamientoIva }[];
}) {
  const [filas, setFilas] = useState<Fila[]>(() =>
    (props.iniciales.length > 0 ? props.iniciales : [{ destino: "", categoria: "", sector: "", netoCentavos: props.netoCentavos, ivaCentavos: props.ivaCentavos, tratamiento: props.tratamientoPorDefecto }]).map((l, i) => ({
      clave: i,
      destino: l.destino,
      categoria: l.categoria,
      sector: l.sector,
      neto: aTexto(l.netoCentavos),
      iva: aTexto(l.ivaCentavos),
      tratamiento: l.tratamiento,
    })),
  );
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [enCurso, iniciar] = useTransition();
  const centavos = useMemo(() => filas.map((f) => ({ neto: centavosDelTexto(f.neto) || 0, iva: centavosDelTexto(f.iva) || 0 })), [filas]);
  const falta = props.netoCentavos + props.ivaCentavos - centavos.reduce((s, c) => s + c.neto + c.iva, 0);
  const cambiar = (clave: number, cambio: Partial<Fila>) => setFilas((fs) => fs.map((f) => (f.clave === clave ? { ...f, ...cambio } : f)));
  const sumar = () => setFilas((fs) => [...fs, { clave: Math.max(...fs.map((f) => f.clave)) + 1, destino: "", categoria: "", sector: "", neto: "0,00", iva: "0,00", tratamiento: props.tratamientoPorDefecto }]);
  const repartir = () => {
    const ivas = repartirIva(props.ivaCentavos, centavos.map((c) => c.neto));
    setFilas((fs) => fs.map((f, i) => ({ ...f, iva: aTexto(ivas[i] ?? 0) })));
  };
  const guardar = () =>
    iniciar(async () => {
      setMensaje(null);
      const lineas: LineaDelForm[] = filas.map((f, i) => ({
        destino: f.destino === "ADMINISTRACION" ? "ADMINISTRACION" : "PROYECTO",
        proyectoId: f.destino && f.destino !== "ADMINISTRACION" ? f.destino : null,
        sector: f.sector || null,
        categoria: f.categoria,
        detalle: "",
        netoCentavos: centavos[i].neto,
        ivaCentavos: centavos[i].iva,
        ivaTratamiento: f.tratamiento,
      }));
      try {
        const r = await imputarComprobante({ comprobanteId: props.comprobanteId, lineas });
        setMensaje(r.ok ? { ok: true, texto: "Imputación guardada: el costo real de cada proyecto ya la cuenta." } : { ok: false, texto: r.error });
      } catch {
        setMensaje({ ok: false, texto: "No se pudo guardar. Revisá la conexión y probá de nuevo." });
      }
    });

  return (
    <div className="grid gap-3">
      <ol className="grid gap-3">
        {filas.map((f, i) => {
          const esAdm = f.destino === "ADMINISTRACION";
          const lista = esAdm ? props.categoriasAdministracion : props.categorias;
          return (
            <li key={f.clave} className="grid gap-2 border-t border-line pt-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] sm:items-end">
              <label className={etiqueta}>
                <span>Línea {i + 1} · destino</span>
                <select value={f.destino} onChange={(e) => cambiar(f.clave, { destino: e.target.value, categoria: "" })} className={campo}>
                  <option value="">Elegí</option>
                  <option value="ADMINISTRACION">Administración</option>
                  {props.proyectos.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </label>
              <label className={etiqueta}>
                Categoría
                <select value={f.categoria} onChange={(e) => cambiar(f.clave, { categoria: e.target.value })} className={campo}>
                  <option value="">Elegí</option>
                  {lista.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className={etiqueta}>
                Sector
                <select value={f.sector} onChange={(e) => cambiar(f.clave, { sector: e.target.value })} className={campo}>
                  <option value="">Sin sector</option>
                  {props.sectores.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className={etiqueta}>Neto<input value={f.neto} inputMode="decimal" onChange={(e) => cambiar(f.clave, { neto: e.target.value })} className={campo} /></label>
              <label className={etiqueta}>IVA<input value={f.iva} inputMode="decimal" onChange={(e) => cambiar(f.clave, { iva: e.target.value })} className={campo} /></label>
              <label className={etiqueta}>
                El IVA
                <select value={f.tratamiento} onChange={(e) => cambiar(f.clave, { tratamiento: e.target.value as TratamientoIva })} className={campo}>
                  <option value="CREDITO">Es crédito fiscal</option>
                  <option value="COSTO">Va al costo</option>
                </select>
              </label>
              <button type="button" disabled={filas.length === 1} onClick={() => setFilas((fs) => fs.filter((x) => x.clave !== f.clave))} className={buttonClasses("ghost", "md")} aria-label={`Quitar la línea ${i + 1}`}>
                Quitar
              </button>
            </li>
          );
        })}
      </ol>
      {props.provisional && <p className="text-xs text-muted">El tratamiento del IVA por tipo de comprobante es provisional (a confirmar con el contador): queda marcado en cada línea que lo use.</p>}
      <p aria-live="polite" className={cn("text-base font-semibold", falta === 0 ? "text-strong" : "text-danger")}>
        Falta imputar: {pesos(falta / 100)}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={sumar} className={buttonClasses("outline", "md")}>Sumar línea</button>
        <button type="button" onClick={repartir} className={buttonClasses("outline", "md")}>Repartir el IVA en proporción</button>
        <button type="button" onClick={guardar} disabled={enCurso || falta !== 0} aria-disabled={enCurso || falta !== 0} className={buttonClasses("solid", "md")}>
          {enCurso ? "Guardando…" : "Guardar imputación"}
        </button>
      </div>
      {mensaje && <p role={mensaje.ok ? "status" : "alert"} className={cn("text-sm", mensaje.ok ? "text-strong" : "text-danger")}>{mensaje.texto}</p>}
    </div>
  );
}
