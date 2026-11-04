"use client";

// El creador: texto → «Proponer» → tres placas con la marca → elegir y ajustar → captions → agendar.
import { useCallback, useId, useMemo, useRef, useState } from "react";
import {
  CANALES,
  ESTADOS,
  NOMBRE_TIPO,
  TIPOS,
  detectarTipo,
  plantillaPorId,
  proponerPiezas,
  type Canal,
  type CamposDeLaPieza,
  type Captions,
  type ClaveFormato,
  type EstadoPublicacion,
  type MarcaDeLaPlaca,
  type PiezaPropuesta,
  type Publicacion,
  type TipoDeContenido,
} from "@/lib/contenido";
import { Button, Field, Input, Segmented, Select, Textarea, cn } from "@/components/ui";
import { PlacaCanvas, type PlacaCanvasRef } from "./PlacaCanvas";
import { Copiar } from "./Copiar";

const CAMPOS: { clave: keyof CamposDeLaPieza; etiqueta: string }[] = [
  { clave: "rotulo", etiqueta: "Rótulo" },
  { clave: "titulo", etiqueta: "Título" },
  { clave: "bajada", etiqueta: "Bajada" },
  { clave: "cta", etiqueta: "Llamado (CTA)" },
];

export function Creador({
  marca,
  hoy,
  onAgendar,
}: {
  marca: MarcaDeLaPlaca;
  hoy: string;
  onAgendar: (pub: Publicacion) => Promise<string | null>;
}) {
  const id = useId();
  const [texto, setTexto] = useState("");
  const [tipoElegido, setTipoElegido] = useState<TipoDeContenido | "auto">("auto");
  const [formato, setFormato] = useState<ClaveFormato>("post");
  const [piezas, setPiezas] = useState<PiezaPropuesta[]>([]);
  const [elegida, setElegida] = useState(0);
  const [campos, setCampos] = useState<CamposDeLaPieza | null>(null);
  const [caption, setCaption] = useState<Captions>({ instagram: "", whatsapp: "" });
  const [recortado, setRecortado] = useState(false);
  const [fecha, setFecha] = useState(hoy);
  const [hora, setHora] = useState("19:00");
  const [canal, setCanal] = useState<Canal>("instagram");
  const [estado, setEstado] = useState<EstadoPublicacion>("programado");
  const [mensaje, setMensaje] = useState<{ tono: "ok" | "error"; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const placa = useRef<PlacaCanvasRef>(null);

  const deteccion = useMemo(() => (texto.trim() ? detectarTipo(texto) : null), [texto]);
  const tipo: TipoDeContenido = tipoElegido === "auto" ? (deteccion?.tipo ?? "novedad") : tipoElegido;

  const elegir = (i: number, lista = piezas) => {
    const p = lista[i];
    if (!p) return;
    setElegida(i);
    setCampos({ ...p.campos });
    setCaption({ ...p.caption });
  };

  const proponer = (f: ClaveFormato = formato, t: TipoDeContenido = tipo) => {
    if (!texto.trim()) {
      setMensaje({ tono: "error", texto: "Escribí primero qué querés contar." });
      return;
    }
    const lista = proponerPiezas(texto, marca, t, { formato: f });
    setPiezas(lista);
    setMensaje(null);
    elegir(0, lista);
    if (f === "historia" && canal === "instagram") setCanal("historia");
    if (f === "post" && canal === "historia") setCanal("instagram");
  };

  const cambiarFormato = (f: ClaveFormato) => {
    setFormato(f);
    if (piezas.length) {
      // Se re-dibujan las tres en el formato nuevo, conservando lo que la persona ya ajustó en la elegida.
      const lista = proponerPiezas(texto, marca, tipo, { formato: f });
      setPiezas(lista);
      if (f === "historia" && canal === "instagram") setCanal("historia");
      if (f === "post" && canal === "historia") setCanal("instagram");
    }
  };

  const actual = piezas[elegida];
  const piezaEditada = useMemo(
    () => (actual && campos ? { variante: actual.variante, formato, campos } : null),
    [actual, campos, formato],
  );
  const alRecortar = useCallback((r: boolean) => setRecortado(r), []);

  const agendar = async () => {
    if (!actual || !campos) return;
    setGuardando(true);
    const err = await onAgendar({
      id: "",
      fecha,
      hora,
      canal,
      estado,
      tipo: actual.tipo,
      plantilla: actual.plantilla,
      formato,
      titulo: campos.titulo.trim() || texto.trim().slice(0, 80),
      texto: texto.trim(),
      campos,
      caption,
    });
    setGuardando(false);
    setMensaje(err ? { tono: "error", texto: err } : { tono: "ok", texto: `Agendada para el ${fecha.split("-").reverse().join("/")} a las ${hora} ✔` });
  };

  return (
    <section aria-labelledby={`${id}-t`} className="rounded-lg border border-line bg-surface-raised p-4 sm:p-6">
      <h2 id={`${id}-t`} className="text-lg font-semibold text-strong">
        Crear una publicación
      </h2>

      <div className="mt-4 grid gap-4">
        <Field label="¿Qué querés contar?" htmlFor={`${id}-texto`} hint="Ej.: «2x1 en turnos de lunes a viernes de 10 a 16».">
          <Textarea id={`${id}-texto`} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={2000} rows={3} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Tipo de publicación"
            htmlFor={`${id}-tipo`}
            hint={deteccion ? `Detectado: ${NOMBRE_TIPO[deteccion.tipo]}${deteccion.pistas.length ? ` (por «${deteccion.pistas.slice(0, 2).join("», «")}»)` : ""}` : undefined}
          >
            <Select
              id={`${id}-tipo`}
              value={tipoElegido}
              onChange={(e) => {
                const v = e.target.value as TipoDeContenido | "auto";
                setTipoElegido(v);
                if (piezas.length) proponer(formato, v === "auto" ? (deteccion?.tipo ?? "novedad") : v);
              }}
            >
              <option value="auto">Que lo detecte ({NOMBRE_TIPO[deteccion?.tipo ?? "novedad"]})</option>
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {NOMBRE_TIPO[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Segmented
            name={`${id}-formato`}
            leyenda="Formato"
            leyendaVisible
            value={formato}
            onChange={(e) => {
              const v = (e.target as EventTarget as HTMLInputElement).value;
              if (v === "post" || v === "historia") cambiarFormato(v);
            }}
            opciones={[
              { valor: "post", etiqueta: "Post" },
              { valor: "historia", etiqueta: "Historia" },
            ]}
          />
        </div>

        <div>
          <Button type="button" onClick={() => proponer()}>
            Proponer
          </Button>
        </div>

        {piezas.length > 0 && (
          <fieldset>
            <legend className="text-sm font-semibold text-strong">Elegí una de las tres</legend>
            <div className="mt-2 grid grid-cols-3 gap-2 sm:gap-4">
              {piezas.map((p, i) => {
                const nombre = plantillaPorId(p.plantilla)?.nombre ?? p.variante;
                const pieza = i === elegida && piezaEditada ? piezaEditada : { variante: p.variante, formato, campos: p.campos };
                return (
                  <button
                    key={p.plantilla}
                    type="button"
                    aria-pressed={i === elegida}
                    onClick={() => elegir(i)}
                    className={cn(
                      "min-w-0 rounded-md border-2 p-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                      i === elegida ? "border-accent" : "border-transparent",
                    )}
                  >
                    <PlacaCanvas pieza={pieza} marca={marca} etiqueta={`Placa «${nombre}»: ${pieza.campos.titulo}`} />
                    <span className="mt-1 block truncate text-xs text-body">
                      {i === elegida ? "✔ " : ""}
                      {nombre}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        {actual && campos && piezaEditada && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,18rem)_1fr]">
            <div className="grid content-start gap-2">
              <PlacaCanvas ref={placa} pieza={piezaEditada} marca={marca} etiqueta={`Vista de la placa elegida: ${campos.titulo}`} onRecorte={alRecortar} />
              {recortado && <p className="text-xs text-warning">⚠ Algún texto no entra entero: acortalo.</p>}
              <Button type="button" variant="outline" onClick={() => placa.current?.descargar(`${actual.plantilla}-${formato}`)}>
                Descargar PNG
              </Button>
            </div>

            <div className="grid min-w-0 content-start gap-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {CAMPOS.map((c) => (
                  <Field key={c.clave} label={c.etiqueta} htmlFor={`${id}-${c.clave}`}>
                    <Input
                      id={`${id}-${c.clave}`}
                      value={campos[c.clave]}
                      maxLength={400}
                      onChange={(e) => setCampos({ ...campos, [c.clave]: e.target.value })}
                    />
                  </Field>
                ))}
              </div>

              <Field label="Texto para Instagram" htmlFor={`${id}-ig`}>
                <Textarea id={`${id}-ig`} value={caption.instagram} rows={5} maxLength={4000} onChange={(e) => setCaption({ ...caption, instagram: e.target.value })} />
              </Field>
              <Copiar texto={caption.instagram} que="texto de Instagram" />
              <Field label="Texto para WhatsApp" htmlFor={`${id}-wa`}>
                <Textarea id={`${id}-wa`} value={caption.whatsapp} rows={4} maxLength={4000} onChange={(e) => setCaption({ ...caption, whatsapp: e.target.value })} />
              </Field>
              <Copiar texto={caption.whatsapp} que="texto de WhatsApp" />

              <fieldset className="grid gap-3 rounded-md border border-line p-3 sm:grid-cols-2">
                <legend className="px-1 text-sm font-semibold text-strong">Agendar</legend>
                <Field label="Día" htmlFor={`${id}-fecha`}>
                  <Input id={`${id}-fecha`} type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
                </Field>
                <Field label="Hora" htmlFor={`${id}-hora`}>
                  <Input id={`${id}-hora`} type="time" value={hora} onChange={(e) => setHora(e.target.value)} required />
                </Field>
                <Field label="Dónde" htmlFor={`${id}-canal`}>
                  <Select id={`${id}-canal`} value={canal} onChange={(e) => setCanal(e.target.value as Canal)}>
                    {(Object.keys(CANALES) as Canal[]).map((c) => (
                      <option key={c} value={c}>
                        {CANALES[c]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Estado" htmlFor={`${id}-estado`}>
                  <Select id={`${id}-estado`} value={estado} onChange={(e) => setEstado(e.target.value as EstadoPublicacion)}>
                    {(Object.keys(ESTADOS) as EstadoPublicacion[]).map((e) => (
                      <option key={e} value={e}>
                        {ESTADOS[e].simbolo} {ESTADOS[e].etiqueta}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="sm:col-span-2">
                  <Button type="button" onClick={agendar} disabled={guardando}>
                    {guardando ? "Agendando…" : "Agendar"}
                  </Button>
                </div>
              </fieldset>
            </div>
          </div>
        )}

        <p aria-live="polite" className={cn("text-sm", mensaje?.tono === "error" ? "text-danger" : "text-success")}>
          {mensaje?.texto ?? ""}
        </p>
      </div>
    </section>
  );
}
