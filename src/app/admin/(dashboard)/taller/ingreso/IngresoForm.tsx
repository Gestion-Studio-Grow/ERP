"use client";

// Ingreso del auto en una sola pantalla, pensado para el celular y las manos sucias:
// patente → si ya vino, se completa solo → qué le pasa → guardar. Fotos y firma son opcionales.
// El borrador se guarda en el teléfono: si se corta la señal o se cierra la pestaña, no se pierde.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { buttonClasses, cn, Input, Textarea } from "@/components/ui";
import { formatoPatente, mostrarPatente, normalizarPatente } from "@/lib/taller/core";
import { agregarFoto, buscarPatente, ingresarVehiculo } from "@/lib/taller/acciones";
import { achicarFoto } from "../_piezas";

const BORRADOR = "taller:ingreso:borrador";
const NIVELES = ["Reserva", "1/4", "1/2", "3/4", "Lleno"];

interface Campos {
  patente: string;
  marca: string;
  modelo: string;
  anio: string;
  km: string;
  combustible: number | null;
  cliente: string;
  telefono: string;
  problema: string;
}
const VACIO: Campos = { patente: "", marca: "", modelo: "", anio: "", km: "", combustible: null, cliente: "", telefono: "", problema: "" };

const etiqueta = "mb-1 block text-sm font-semibold text-strong";
const grande = "h-14 text-lg";

export default function IngresoForm({ patenteInicial }: { patenteInicial: string }) {
  const router = useRouter();
  const [c, setC] = useState<Campos>({ ...VACIO, patente: normalizarPatente(patenteInicial) });
  // Resultado de la última búsqueda, con la patente a la que corresponde: lo que se muestra se
  // deriva de comparar esa patente con la escrita (sin estados intermedios que sincronizar).
  const [busqueda, setBusqueda] = useState<null | { patente: string; conocido: null | { abierta: { id: string; numero: number } | null } }>(null);
  const [fotos, setFotos] = useState<string[]>([]);
  const [firma, setFirma] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sinSenal, setSinSenal] = useState(false);
  const camara = useRef<HTMLInputElement>(null);

  // Recupera el borrador (sin fotos: pesan y el teléfono las tiene igual).
  useEffect(() => {
    if (patenteInicial) return;
    try {
      const b = localStorage.getItem(BORRADOR);
      // Se lee al montar y no al crear el estado: el servidor no tiene el borrador del teléfono.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (b) setC({ ...VACIO, ...JSON.parse(b) });
    } catch {}
  }, [patenteInicial]);
  useEffect(() => {
    // Un formulario vacío nunca pisa un borrador guardado (pasa al montar, antes de recuperarlo).
    if (!c.patente && !c.cliente && !c.telefono && !c.problema && !c.modelo) return;
    try {
      localStorage.setItem(BORRADOR, JSON.stringify(c));
    } catch {}
  }, [c]);
  useEffect(() => {
    const ver = () => setSinSenal(!navigator.onLine);
    ver();
    window.addEventListener("online", ver);
    window.addEventListener("offline", ver);
    return () => {
      window.removeEventListener("online", ver);
      window.removeEventListener("offline", ver);
    };
  }, []);

  const set = <K extends keyof Campos>(k: K, v: Campos[K]) => setC((p) => ({ ...p, [k]: v }));
  const formato = formatoPatente(c.patente);
  const resuelta = !!formato && busqueda?.patente === c.patente;
  const buscando = !!formato && !resuelta;
  const conocido = resuelta ? busqueda!.conocido : null;

  // Patente completa y válida → busca si ya vino y completa solo.
  useEffect(() => {
    if (!formato) return;
    const patente = c.patente;
    let vigente = true;
    buscarPatente(patente)
      .then((r) => {
        if (!vigente) return;
        if (r.valida && r.encontrado) {
          setBusqueda({ patente, conocido: { abierta: r.abierta } });
          setC((p) => ({
            ...p,
            marca: p.marca || r.marca,
            modelo: p.modelo || r.modelo,
            anio: p.anio || (r.anio ? String(r.anio) : ""),
            cliente: r.cliente,
            telefono: r.telefono,
          }));
        } else setBusqueda({ patente, conocido: null });
      })
      // Sin señal no se sabe si ya vino: se sigue como auto nuevo y el guardado lo resuelve.
      .catch(() => vigente && setBusqueda({ patente, conocido: null }));
    return () => {
      vigente = false;
    };
  }, [c.patente, formato]);

  async function sumarFotos(files: FileList | null) {
    if (!files) return;
    const nuevas: string[] = [];
    for (const f of Array.from(files).slice(0, 8 - fotos.length)) nuevas.push(await achicarFoto(f));
    setFotos((p) => [...p, ...nuevas]);
    if (camara.current) camara.current.value = "";
  }

  async function guardar() {
    setError(null);
    if (!formato) return setError("Revisá la patente: va como ABC123 o AB123CD.");
    if (!c.cliente.trim()) return setError("Falta el nombre del cliente.");
    if (c.telefono.replace(/\D/g, "").length < 8) return setError("Falta el teléfono: lo necesitamos para avisarle por WhatsApp.");
    setGuardando(true);
    try {
      const r = await ingresarVehiculo({ ...c, combustible: c.combustible ?? undefined, firma, firmaNombre: c.cliente });
      if (!r.ok) {
        setError(r.error);
        setGuardando(false);
        return;
      }
      // Las fotos suben de a una después: si alguna falla, la orden ya existe y se agregan desde ahí.
      for (const f of fotos) {
        try {
          await agregarFoto(r.id, f, "INGRESO");
        } catch {
          break;
        }
      }
      try {
        localStorage.removeItem(BORRADOR);
      } catch {}
      router.push(`/admin/taller/orden/${r.id}?nuevo=1`);
    } catch {
      setError("No hay conexión. Tus datos quedaron guardados en este teléfono: tocá «Guardar ingreso» cuando vuelva la señal.");
      setGuardando(false);
    }
  }

  return (
    <form
      className="grid grid-cols-1 gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        guardar();
      }}
    >
      {sinSenal && (
        <p role="status" className="rounded-xl border border-line p-3 text-sm font-medium" style={{ background: "var(--warning-soft)" }}>
          Sin conexión. Podés seguir cargando: lo guardamos en el teléfono y lo mandás cuando vuelva la señal.
        </p>
      )}

      <div>
        <label htmlFor="patente" className={etiqueta}>Patente</label>
        <Input
          id="patente"
          autoFocus
          autoCapitalize="characters"
          autoComplete="off"
          inputMode="text"
          maxLength={9}
          placeholder="AB 123 CD"
          value={formato ? mostrarPatente(c.patente) : c.patente}
          onChange={(e) => set("patente", normalizarPatente(e.target.value).slice(0, 7))}
          className={cn(grande, "text-center font-mono text-2xl font-bold tracking-widest")}
          aria-describedby="patente-ayuda"
        />
        <p id="patente-ayuda" className="mt-1 text-sm text-muted" aria-live="polite">
          {buscando
            ? "Buscando…"
            : conocido
              ? "✓ Ya vino antes: completamos sus datos."
              : formato
                ? "Auto nuevo en el taller."
                : c.patente.length >= 6
                  ? "No parece una patente válida (ABC123 o AB123CD)."
                  : "Vieja (ABC123) o Mercosur (AB123CD)."}
        </p>
        {conocido?.abierta && (
          <p className="mt-2 rounded-xl border border-line p-3 text-sm" style={{ background: "var(--warning-soft)" }}>
            Este auto ya tiene la orden #{conocido.abierta.numero} abierta.{" "}
            <Link href={`/admin/taller/orden/${conocido.abierta.id}`} className="font-semibold underline">Abrirla</Link>
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="marca" className={etiqueta}>Marca</label>
          <Input id="marca" list="marcas" value={c.marca} onChange={(e) => set("marca", e.target.value)} placeholder="Volkswagen" className={grande} />
          <datalist id="marcas">
            {["Volkswagen", "Chevrolet", "Peugeot", "Renault", "Fiat", "Ford", "Toyota", "Citroën", "Honda", "Nissan", "Jeep"].map((m) => <option key={m} value={m} />)}
          </datalist>
        </div>
        <div>
          <label htmlFor="modelo" className={etiqueta}>Modelo</label>
          <Input id="modelo" value={c.modelo} onChange={(e) => set("modelo", e.target.value)} placeholder="Gol Trend" className={grande} />
        </div>
        <div>
          <label htmlFor="km" className={etiqueta}>Kilómetros</label>
          <Input id="km" inputMode="numeric" value={c.km} onChange={(e) => set("km", e.target.value.replace(/\D/g, ""))} placeholder="85000" className={grande} />
        </div>
        <div>
          <label htmlFor="anio" className={etiqueta}>Año</label>
          <Input id="anio" inputMode="numeric" maxLength={4} value={c.anio} onChange={(e) => set("anio", e.target.value.replace(/\D/g, ""))} placeholder="2018" className={grande} />
        </div>
      </div>

      <fieldset>
        <legend className={etiqueta}>Combustible</legend>
        <div className="grid grid-cols-5 gap-1.5">
          {NIVELES.map((n, i) => (
            <button
              key={n}
              type="button"
              aria-pressed={c.combustible === i * 2}
              onClick={() => set("combustible", c.combustible === i * 2 ? null : i * 2)}
              className={cn("h-12 rounded-xl border text-sm font-semibold", c.combustible === i * 2 ? "border-transparent bg-accent text-on-accent" : "border-line bg-surface-raised text-strong")}
            >
              {n}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-1 gap-3">
        <div>
          <label htmlFor="cliente" className={etiqueta}>Cliente</label>
          <Input id="cliente" autoComplete="off" value={c.cliente} onChange={(e) => set("cliente", e.target.value)} placeholder="Nombre y apellido" className={grande} />
        </div>
        <div>
          <label htmlFor="telefono" className={etiqueta}>Celular (WhatsApp)</label>
          <Input id="telefono" type="tel" inputMode="tel" autoComplete="off" value={c.telefono} onChange={(e) => set("telefono", e.target.value)} placeholder="11 5555-5555" className={grande} />
        </div>
      </div>

      <div>
        <label htmlFor="problema" className={etiqueta}>¿Qué le pasa? (lo que cuenta el cliente)</label>
        <Textarea id="problema" rows={3} value={c.problema} onChange={(e) => set("problema", e.target.value)} placeholder="Hace ruido al frenar, tira para la derecha…" className="text-base" />
      </div>

      <div>
        <p className={etiqueta}>Fotos de cómo llegó <span className="font-normal text-muted">(rayones, golpes — opcional)</span></p>
        <input ref={camara} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => sumarFotos(e.target.files)} />
        <div className="flex flex-wrap gap-2">
          {fotos.map((f, i) => (
            <button key={i} type="button" onClick={() => setFotos((p) => p.filter((_, j) => j !== i))} aria-label={`Quitar foto ${i + 1}`} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f} alt={`Foto ${i + 1} del estado del auto`} className="size-20 rounded-xl border border-line object-cover" />
              <span aria-hidden className="absolute -right-1 -top-1 grid size-6 place-items-center rounded-full bg-surface-inverted text-xs text-on-accent">✕</span>
            </button>
          ))}
          {fotos.length < 8 && (
            <button type="button" onClick={() => camara.current?.click()} className="grid size-20 place-items-center rounded-xl border-2 border-dashed border-line-strong text-2xl" aria-label="Sacar foto">
              📷
            </button>
          )}
        </div>
      </div>

      <Firma valor={firma} onCambio={setFirma} />

      {error && <p role="alert" className="rounded-xl border border-line p-3 text-sm font-medium text-strong" style={{ background: "var(--danger-soft)" }}>{error}</p>}

      <div className="sticky bottom-0 -mx-4 border-t border-line bg-surface px-4 py-3" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
        <button type="submit" disabled={guardando} className={cn(buttonClasses("solid", "lg"), "h-14 w-full justify-center text-lg")}>
          {guardando ? "Guardando…" : "Guardar ingreso"}
        </button>
      </div>
    </form>
  );
}

// Firma de conformidad del cliente, con el dedo. Opcional. Sale como PNG chico.
function Firma({ valor, onCambio }: { valor: string | null; onCambio: (v: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  const [abierta, setAbierta] = useState(false);

  function punto(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * e.currentTarget.width, y: ((e.clientY - r.top) / r.height) * e.currentTarget.height };
  }
  function limpiar() {
    const cv = ref.current;
    if (cv) {
      const g = cv.getContext("2d")!;
      g.fillStyle = "#fff";
      g.fillRect(0, 0, cv.width, cv.height);
    }
    onCambio(null);
  }
  useEffect(() => {
    if (abierta && !valor) limpiar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierta]);

  if (!abierta) {
    return (
      <button type="button" onClick={() => setAbierta(true)} className={cn(buttonClasses("outline", "lg"), "justify-center")}>
        ✍️ {valor ? "Firma cargada — volver a firmar" : "Firma de conformidad del cliente (opcional)"}
      </button>
    );
  }
  return (
    <div>
      <p className={etiqueta}>Firma del cliente <span className="font-normal text-muted">— conforme con el estado en que deja el auto</span></p>
      <canvas
        ref={ref}
        width={600}
        height={220}
        className="w-full touch-none rounded-xl border-2 border-line-strong bg-white"
        onPointerDown={(e) => {
          dibujando.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          const g = e.currentTarget.getContext("2d")!;
          const p = punto(e);
          g.lineWidth = 3;
          g.lineCap = "round";
          g.strokeStyle = "#111";
          g.beginPath();
          g.moveTo(p.x, p.y);
        }}
        onPointerMove={(e) => {
          if (!dibujando.current) return;
          const g = e.currentTarget.getContext("2d")!;
          const p = punto(e);
          g.lineTo(p.x, p.y);
          g.stroke();
        }}
        onPointerUp={(e) => {
          dibujando.current = false;
          onCambio(e.currentTarget.toDataURL("image/png"));
        }}
      />
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={limpiar} className={buttonClasses("ghost", "md")}>Borrar</button>
        <button type="button" onClick={() => setAbierta(false)} className={buttonClasses("outline", "md")}>Listo</button>
      </div>
    </div>
  );
}
