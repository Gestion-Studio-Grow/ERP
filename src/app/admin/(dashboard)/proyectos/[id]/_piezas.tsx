"use client";

// Piezas de cliente de la ficha: subir imágenes achicadas, guardar un link, abrir un stand nuevo y
// copiar el link de la propuesta.

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { buttonClasses, cn } from "@/components/ui";
import { crearStand, eliminarStand } from "@/lib/proyectos/acciones";
import { armarStandConIA, armarStandsConIA, crearPiezasPropuestas, proponerPiezas, type AlternativaStand } from "@/lib/proyectos/acciones-diseno";
import type { PiezaPropuesta } from "@/lib/proyectos/ia-piezas-core";
import { confirmarSubida, hayNube, pedirSubida, subirArchivoFicha, type ResultadoFicha } from "@/lib/proyectos/acciones-ficha";

const campo = "min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm text-strong";
const TIPOS = [["RENDER", "Render"], ["PLANO", "Plano"], ["PRESENTACION", "Presentación"], ["PRESUPUESTO", "Presupuesto"], ["CONTRATO", "Contrato"], ["OTRO", "Otro"]];

// Una acción del servidor recibe hasta 1 MB: lo que se manda tiene que entrar, con margen para el resto.
const TOPE_IMAGEN = 900_000;

/**
 * El render se achica en el navegador para entrar en la base sin pagar almacenamiento aparte: arranca en
 * 2000 px y baja calidad y tamaño hasta que entra, así una foto pesada también sube.
 */
export async function achicar(archivo: File): Promise<string> {
  const img = await createImageBitmap(archivo);
  try {
    for (const lado of [2000, 1600, 1280, 1024, 800]) {
      const f = Math.min(1, lado / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * f);
      c.height = Math.round(img.height * f);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      for (const calidad of [0.82, 0.7, 0.6]) {
        const datos = c.toDataURL("image/jpeg", calidad);
        if (datos.length <= TOPE_IMAGEN) return datos;
      }
    }
    throw new Error("no entra");
  } finally {
    img.close();
  }
}

/** Una imagen se achica; un PDF viaja tal cual, con su tope. */
export async function archivoADatos(a: File): Promise<string> {
  if (a.type !== "application/pdf") return achicar(a);
  if (a.size > 2_000_000) throw new Error("PDF pesado");
  return new Promise((listo, fallo) => {
    const r = new FileReader();
    r.onload = () => listo(String(r.result));
    r.onerror = () => fallo(new Error("PDF ilegible"));
    r.readAsDataURL(a);
  });
}

/** Si está configurada la nube: mientras no conteste, se ofrece lo que anda sin ella. */
export function useNube(): boolean {
  const [nube, setNube] = useState(false);
  useEffect(() => {
    hayNube().then(setNube, () => setNube(false));
  }, []);
  return nube;
}

function mandarALaNube(url: string, a: File, alAvanzar?: (porcentaje: number) => void): Promise<boolean> {
  return new Promise((listo) => {
    const x = new XMLHttpRequest();
    x.open("PUT", url);
    x.upload.onprogress = (e) => {
      if (e.lengthComputable) alAvanzar?.(Math.round((e.loaded / e.total) * 100)); // no-es-plata: avance de la subida en %
    };
    x.onload = () => listo(x.status >= 200 && x.status < 300);
    x.onerror = () => listo(false);
    x.send(a);
  });
}

/** Sube el original directo a la nube; una imagen deja además su versión achicada para la propuesta y las miniaturas. Sin nube devuelve null y se sigue como siempre. */
export async function subirANube(a: File, d: { proyectoId: string; tipo: string; itemId?: string; visibleCliente?: boolean }, alAvanzar?: (porcentaje: number) => void): Promise<ResultadoFicha<{ id: string }> | null> {
  const pedido = await pedirSubida({ proyectoId: d.proyectoId, nombre: a.name, tamano: a.size });
  if (!pedido.ok) return pedido;
  if (!pedido.url || !pedido.clave) return null;
  if (!(await mandarALaNube(pedido.url, a, alAvanzar))) return { ok: false, error: "No se pudo subir el archivo. Revisá la conexión y probá de nuevo." };
  const miniatura = /^image\/(jpeg|png|webp)$/.test(a.type) ? await achicar(a).catch(() => null) : null;
  return confirmarSubida({ ...d, clave: pedido.clave, nombre: a.name, miniatura });
}

export function SubirArchivo({ proyectoId, itemId, alTerminar }: { proyectoId: string; itemId?: string; alTerminar?: () => void }) {
  const nube = useNube();
  const [avance, setAvance] = useState<number | null>(null);
  const [tipo, setTipo] = useState("RENDER");
  const [link, setLink] = useState("");
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  const entrada = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const fin = (r: { ok: true } | { ok: false; error: string }) => {
    if (r.ok) {
      setLink("");
      setNombre("");
      alTerminar?.();
      router.refresh();
    } else setError(r.error);
  };

  return (
    <div className="grid gap-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium text-strong">
          Tipo
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={campo}>
            {TIPOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <div className="grid min-w-0 gap-1 text-sm font-medium text-strong">
          {nube ? "Archivo (hasta 200 MB)" : "Imagen o PDF"}
          <input
            ref={entrada}
            type="file"
            accept={nube ? undefined : "image/jpeg,image/png,image/webp,application/pdf"}
            aria-label={nube ? "Elegir archivo" : "Elegir imagen o PDF"}
            disabled={ocupado}
            className="w-full min-w-0 text-sm"
            onChange={(e) => {
              const a = e.target.files?.[0];
              if (!a) return;
              setError(null);
              iniciar(async () => {
                try {
                  const enNube = await subirANube(a, { proyectoId, tipo, itemId, visibleCliente: tipo === "RENDER" }, setAvance);
                  setAvance(null);
                  if (enNube) {
                    fin(enNube);
                    if (entrada.current) entrada.current.value = "";
                    return;
                  }
                } catch {
                  setAvance(null);
                  setError("No se pudo subir el archivo. Revisá la conexión y probá de nuevo.");
                  if (entrada.current) entrada.current.value = "";
                  return;
                }
                let datos: string | null = null;
                try {
                  datos = await archivoADatos(a);
                } catch {
                  setError(a.type === "application/pdf" ? "El PDF pesa más de 2 MB o no se pudo leer. Pegá el link de tu nube." : "No se pudo leer esa imagen. Probá con un JPG o PNG.");
                }
                if (datos) {
                  try {
                    fin(await subirArchivoFicha({ proyectoId, tipo, nombre: a.name, datos, visibleCliente: tipo === "RENDER", itemId }));
                  } catch {
                    setError("No se pudo guardar el archivo. Revisá la conexión y probá de nuevo.");
                  }
                }
                if (entrada.current) entrada.current.value = "";
              });
            }}
          />
        </div>
      </div>
      {avance !== null && <p role="status" className="text-sm font-medium text-strong">Subiendo… {avance} %</p>}
      <p className="text-sm text-muted">{nube ? "¿Ya está en otra nube? Pegá el link:" : "Para archivos de más de 2 MB, planos pesados o video, pegá el link de tu nube:"}</p>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} aria-label="Nombre del archivo" placeholder="Nombre" maxLength={120} className={campo} />
        <input value={link} onChange={(e) => setLink(e.target.value)} aria-label="Link del archivo" placeholder="https://…" inputMode="url" className={campo} />
        <button
          type="button"
          disabled={ocupado || !link.trim()}
          className={buttonClasses("outline", "md")}
          onClick={() => {
            setError(null);
            iniciar(async () => fin(await subirArchivoFicha({ proyectoId, tipo, nombre, url: link, itemId })));
          }}
        >
          Guardar link
        </button>
      </div>
      {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
    </div>
  );
}

export function BotonNuevoStand({ proyectoId }: { proyectoId: string }) {
  const [ocupado, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <>
      <button
        type="button"
        disabled={ocupado}
        className={cn(buttonClasses("solid", "md"), "justify-center")}
        onClick={() =>
          iniciar(async () => {
            const fd = new FormData();
            fd.set("proyectoId", proyectoId);
            const r = await crearStand(fd);
            if (r.ok) router.push(`/admin/proyectos/${r.proyectoId}/stand/${r.id}`);
            else setError(r.error);
          })
        }
      >
        {ocupado ? "Abriendo…" : "+ Armar stand en 3D"}
      </button>
      {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
    </>
  );
}

/** Elimina una maqueta tras una confirmación; con ella se van sus renglones del presupuesto en borrador. `alEliminar`: refrescar la lista o volver al proyecto. */
export function BotonEliminarStand({ id, nombre, proyectoId, alEliminar, ancho }: { id: string; nombre: string; proyectoId: string; alEliminar: "refrescar" | "volver"; ancho?: boolean }) {
  const [ocupado, iniciar] = useTransition();
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  if (!abierto) {
    return (
      <button type="button" aria-label={`Eliminar la maqueta ${nombre}`} onClick={() => setAbierto(true)} className={cn(buttonClasses("ghost", "md"), "min-h-11 text-danger", ancho && "w-full justify-center")}>
        Eliminar{ancho ? " esta maqueta" : ""}
      </button>
    );
  }
  return (
    <div role="alertdialog" aria-label="Confirmar la eliminación" className="grid gap-2 rounded-lg border border-danger p-2 text-sm text-strong">
      <p>¿Eliminar «{nombre}»? No se puede deshacer. También se sacan del presupuesto en borrador los renglones que salieron de esta maqueta.</p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={ocupado}
          className={cn(buttonClasses("solid", "md"), "min-h-11 flex-1 justify-center")}
          onClick={() =>
            iniciar(async () => {
              setError(null);
              const r = await eliminarStand({ id });
              if (!r.ok) return setError(r.error);
              if (alEliminar === "volver") router.push(`/admin/proyectos/${proyectoId}?tab=diseno`);
              else router.refresh();
            })
          }
        >
          {ocupado ? "Eliminando…" : "Sí, eliminar"}
        </button>
        <button type="button" disabled={ocupado} className={cn(buttonClasses("ghost", "md"), "min-h-11 flex-1 justify-center")} onClick={() => setAbierto(false)}>No</button>
      </div>
      {error && <p role="alert" className="font-medium text-danger">{error}</p>}
    </div>
  );
}

/** El agente propone las piezas que el proyecto necesita; la persona tilda las que quiere y se crean. No se crea nada sin elegirlo. */
export function ProponerPiezasConIA({ proyectoId }: { proyectoId: string }) {
  const router = useRouter();
  const [ocupado, iniciar] = useTransition();
  const [pedido, setPedido] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [propuesta, setPropuesta] = useState<{ piezas: PiezaPropuesta[]; nota: string } | null>(null);
  const [elegidas, setElegidas] = useState<Set<number>>(new Set());
  const [hecho, setHecho] = useState<string | null>(null);

  return (
    <div className="mb-3 grid gap-2 rounded-xl border border-line p-3">
      <label className="grid gap-1 text-sm font-medium text-strong">
        Que el agente proponga las piezas
        <textarea value={pedido} onChange={(e) => setPedido(e.target.value)} maxLength={2000} rows={2} placeholder="Opcional: qué necesita mostrar el cliente, formatos, plazos…" className={cn(campo, "py-2 font-normal")} />
      </label>
      <button
        type="button"
        disabled={ocupado}
        className={cn(buttonClasses("outline", "md"), "justify-center")}
        onClick={() =>
          iniciar(async () => {
            setError(null);
            setHecho(null);
            const r = await proponerPiezas({ proyectoId, pedido });
            if (!r.ok) return setError(r.error);
            setPropuesta({ piezas: r.piezas, nota: r.nota });
            setElegidas(new Set(r.piezas.map((_, i) => i)));
          })
        }
      >
        {ocupado && !propuesta ? "Pensando las piezas…" : "Proponer piezas con IA"}
      </button>
      {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
      {hecho && <p role="status" className="text-sm font-medium text-strong">{hecho}</p>}
      {propuesta && (
        <div className="grid gap-2 text-sm text-strong">
          {propuesta.nota && <p className="text-muted">{propuesta.nota}</p>}
          <ul className="grid gap-2">
            {propuesta.piezas.map((p, i) => (
              <li key={p.nombre} className="rounded-lg border border-line p-2">
                <label className="flex min-h-11 items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1 h-5 w-5"
                    checked={elegidas.has(i)}
                    onChange={(e) =>
                      setElegidas((v) => {
                        const n = new Set(v);
                        if (e.target.checked) n.add(i);
                        else n.delete(i);
                        return n;
                      })
                    }
                  />
                  <span>
                    <span className="block font-medium">{p.nombre}</span>
                    <span className="block text-muted">{p.especificacion}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={ocupado || elegidas.size === 0}
              className={cn(buttonClasses("solid", "md"), "min-h-11")}
              onClick={() =>
                iniciar(async () => {
                  setError(null);
                  const r = await crearPiezasPropuestas({ proyectoId, piezas: propuesta.piezas.filter((_, i) => elegidas.has(i)) });
                  if (!r.ok) return setError(r.error);
                  setHecho(r.creadas === 1 ? "Se creó 1 pieza." : `Se crearon ${r.creadas} piezas.`);
                  setPropuesta(null);
                  router.refresh();
                })
              }
            >
              Crear {elegidas.size === 1 ? "la pieza elegida" : `las ${elegidas.size} elegidas`}
            </button>
            <button type="button" disabled={ocupado} className={cn(buttonClasses("ghost", "md"), "min-h-11")} onClick={() => setPropuesta(null)}>Descartar la propuesta</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Un agente arma el primer borrador del stand desde el brief; el equipo lo abre y lo ajusta. */
export function BotonStandConIA({ proyectoId }: { proyectoId: string }) {
  const [ocupado, iniciar] = useTransition();
  const [pedido, setPedido] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<{ id: string; notas: string } | null>(null);
  const [alternativas, setAlternativas] = useState<{ lista: AlternativaStand[]; fallaron: number } | null>(null);
  return (
    <div className="mt-3 grid gap-2 border-t border-line pt-3">
      <label className="grid gap-1 text-sm font-medium text-strong">
        Primer borrador con IA
        <textarea
          value={pedido}
          onChange={(e) => setPedido(e.target.value)}
          maxLength={2000}
          rows={2}
          placeholder="Opcional: medidas del lote, estilo, qué tiene que mostrar el stand…"
          className={cn(campo, "py-2 font-normal")}
        />
      </label>
      <button
        type="button"
        disabled={ocupado}
        className={cn(buttonClasses("outline", "md"), "justify-center")}
        onClick={() =>
          iniciar(async () => {
            setError(null);
            setListo(null);
            setAlternativas(null);
            const r = await armarStandConIA({ proyectoId, pedido });
            if (r.ok) setListo({ id: r.id, notas: r.notas });
            else setError(r.error);
          })
        }
      >
        {ocupado ? "Armando el borrador… puede tardar un minuto" : "Armar un primer borrador con IA"}
      </button>
      <button
        type="button"
        disabled={ocupado}
        className={cn(buttonClasses("outline", "md"), "justify-center")}
        onClick={() =>
          iniciar(async () => {
            setError(null);
            setListo(null);
            setAlternativas(null);
            const r = await armarStandsConIA({ proyectoId, pedido });
            if (r.ok) setAlternativas({ lista: r.alternativas, fallaron: r.fallaron });
            else setError(r.error);
          })
        }
      >
        {ocupado ? "Armando las alternativas… puede tardar un minuto" : "Armar 3 alternativas para comparar"}
      </button>
      {alternativas && (
        <div role="status" className="grid gap-2 rounded-lg border border-line p-3 text-sm text-strong">
          <p className="font-medium">Alternativas listas: son puntos de partida, revisalas y ajustalas.{alternativas.fallaron > 0 ? ` ${alternativas.fallaron} no se pudo armar; probá de nuevo.` : ""}</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left">
              <thead>
                <tr className="text-xs text-muted">
                  <th className="py-1 pr-2 font-medium">Alternativa</th>
                  <th className="py-1 pr-2 font-medium">Piezas</th>
                  <th className="py-1 pr-2 font-medium">Ocupa</th>
                  <th className="py-1 font-medium">Controles</th>
                </tr>
              </thead>
              <tbody>
                {alternativas.lista.map((x) => (
                  <tr key={x.id} className="border-t border-line align-top">
                    <td className="py-2 pr-2">
                      <Link href={`/admin/proyectos/${proyectoId}/stand/${x.id}`} className="font-medium underline">{x.enfoque}</Link>
                      {x.notas && <p className="mt-1 max-w-xs whitespace-pre-line text-xs text-muted">{x.notas}</p>}
                    </td>
                    <td className="py-2 pr-2">{x.piezas}</td>
                    <td className="py-2 pr-2">{x.ocupacion} %</td>
                    <td className={cn("py-2", x.errores > 0 && "font-medium text-danger")}>{x.errores > 0 ? `${x.errores} por revisar` : "Sin errores"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
      {listo && (
        <div role="status" className="grid gap-2 rounded-lg border border-line p-3 text-sm text-strong">
          <p className="font-medium">Borrador listo. Es un punto de partida: revisalo y ajustalo antes de mostrarlo.</p>
          {listo.notas && <p className="whitespace-pre-line text-muted">{listo.notas}</p>}
          <Link href={`/admin/proyectos/${proyectoId}/stand/${listo.id}`} className={cn(buttonClasses("solid", "md"), "justify-center")}>Abrir el borrador</Link>
        </div>
      )}
    </div>
  );
}

/** Copia con la API del portapapeles; si no está (http sin certificado, permiso negado) prueba con execCommand. */
async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch {
    // sigue con el plan B
  }
  try {
    const area = document.createElement("textarea");
    area.value = texto;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

// Antes: si el portapapeles no estaba disponible o negaba el permiso, la promesa fallaba sin aviso y el botón no
// cambiaba; y el cambio de texto no se anunciaba a lectores de pantalla. Ahora hay plan B, mensaje con aria-live y,
// si nada funciona, el link queda a la vista y seleccionado para copiarlo a mano.
export function CopiarLink({ ruta }: { ruta: string }) {
  const [estado, setEstado] = useState<"" | "copiado" | "fallo">("");
  const [url, setUrl] = useState("");
  const campo = useRef<HTMLInputElement>(null);
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (reloj.current) clearTimeout(reloj.current);
  }, []);
  useEffect(() => {
    if (estado === "fallo") campo.current?.select();
  }, [estado]);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        className={buttonClasses("outline", "md")}
        onClick={async () => {
          const completo = `${window.location.origin}${ruta}`;
          setUrl(completo);
          if (reloj.current) clearTimeout(reloj.current);
          if (await copiarTexto(completo)) {
            setEstado("copiado");
            reloj.current = setTimeout(() => setEstado(""), 3000);
          } else setEstado("fallo");
        }}
      >
        {estado === "copiado" ? "¡Copiado!" : "Copiar link"}
      </button>
      <span role="status" aria-live="polite" className="text-sm text-strong">
        {estado === "copiado" ? "Link copiado: pegalo en WhatsApp o en un mail." : estado === "fallo" ? "No se pudo copiar solo: copialo de acá." : ""}
      </span>
      {estado === "fallo" && (
        <input ref={campo} readOnly value={url} aria-label="Link para copiar" onFocus={(e) => e.currentTarget.select()} className="min-h-11 w-full min-w-0 rounded-lg border border-line bg-surface px-2 text-sm text-strong" />
      )}
    </span>
  );
}
