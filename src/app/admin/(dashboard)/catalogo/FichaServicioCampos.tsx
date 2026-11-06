"use client";

// ============================================================================
// Campos de la ficha completa del servicio — compartidos por el catálogo de siempre
// (ServicesSection) y el «Diseño nuevo» (CatalogoServiciosRenglon).
// ============================================================================
//
// Agrupados como los piensa la dueña: Precio y seña · Tiempo · Cómo se presta · Recordatorio ·
// Imágenes. Si la migración 20261104123000_servicio_completo no está aplicada (`disponible`
// false), sólo se dibujan los campos de siempre (precio, precio vecino, seña fija y duración),
// con los MISMOS nombres: la acción recibe exactamente lo que recibía antes.

import { useRef, useState, useTransition } from "react";
import { Field, Input, Seccion, Segmented, Switch, Textarea, buttonClasses } from "@/components/ui";
import { agregarFotoServicio, quitarFotoServicio } from "@/lib/catalog-actions";
import {
  FICHA_VACIA,
  LADO_FOTO_SERVICIO,
  MAX_FOTOS_SERVICIO,
  MAX_FOTO_SERVICIO,
  MODALIDADES,
  MODALIDAD_ETIQUETA,
  TIPOS,
  TIPO_AYUDA,
  TIPO_ETIQUETA,
  TOPE_NOTA,
  rutaDeFotoDeServicio,
  seniaPorPorcentaje,
  type FichaDelServicio,
} from "@/lib/servicios/ficha";
import { useToast } from "../ToastProvider";

export type DatosDeLaFicha = {
  id?: string;
  price?: number;
  residentPrice?: number | null;
  depositAmount?: number | null;
  durationMin?: number;
  ficha?: FichaDelServicio;
  fotos?: string[];
};

const pesos = (n: number) => `$${n.toLocaleString("es-AR")}`;

/** Precio y seña · Tiempo · Cómo se presta · Recordatorio. Va ADENTRO del <form> del servicio. */
export function CamposDeLaFicha({ prefijo: p, servicio: s, disponible }: { prefijo: string; servicio: DatosDeLaFicha | null; disponible: boolean }) {
  const f = s?.ficha ?? FICHA_VACIA;
  const [aDefinir, setADefinir] = useState(disponible && f.priceToDefine);
  const [precio, setPrecio] = useState<string>(s?.price && !f.priceToDefine ? String(s.price) : "");
  const [tipoSenia, setTipoSenia] = useState<"monto" | "porcentaje">(disponible && f.depositPercent != null ? "porcentaje" : "monto");
  const [porcentaje, setPorcentaje] = useState<string>(f.depositPercent != null ? String(f.depositPercent) : "");
  const [duracion, setDuracion] = useState<string>(String(s?.durationMin ?? 60));
  const [nota, setNota] = useState(f.reminderNote ?? "");
  const vistaPrevia = seniaPorPorcentaje(Number(precio), Number(porcentaje));

  return (
    <>
      {disponible && <input type="hidden" name="ficha" value="1" />}
      <Seccion titulo="Precio y seña">
        <div className="mt-3 flex flex-col gap-3">
          {disponible && (
            <Switch
              name="priceToDefine"
              etiqueta="Precio a definir"
              detalle="Se fija al cobrar. En la reserva y la agenda dice «A definir»."
              checked={aDefinir}
              onChange={(e) => setADefinir(e.currentTarget.checked)}
            />
          )}
          <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
            <Field label="Precio ($)" htmlFor={`${p}-precio`} required={!aDefinir} hint={aDefinir ? "Se carga al cobrar" : undefined}>
              <Input
                id={`${p}-precio`}
                name="price"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={aDefinir ? "" : precio}
                onChange={(e) => setPrecio(e.currentTarget.value)}
                disabled={aDefinir}
                required={!aDefinir}
              />
            </Field>
            <Field label="Precio vecino ($)" htmlFor={`${p}-vecino`} hint="Vacío si no tiene">
              <Input id={`${p}-vecino`} name="residentPrice" type="number" inputMode="numeric" min={0} step={1} defaultValue={s?.residentPrice ?? ""} disabled={aDefinir} />
            </Field>
          </div>
          {aDefinir ? (
            <p className="text-sm text-muted">Sin precio no se pide seña: se cobra todo al final.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {disponible && (
                <Segmented
                  name="depositKind"
                  leyenda="Cómo se calcula la seña"
                  leyendaVisible
                  lleno
                  value={tipoSenia}
                  onChange={(e) => {
                    const v = (e.target as unknown as HTMLInputElement).value;
                    if (v === "monto" || v === "porcentaje") setTipoSenia(v);
                  }}
                  opciones={[
                    { valor: "monto", etiqueta: "Monto fijo" },
                    { valor: "porcentaje", etiqueta: "Porcentaje" },
                  ]}
                />
              )}
              {tipoSenia === "porcentaje" ? (
                <Field
                  label="Seña (%)"
                  htmlFor={`${p}-senia-pct`}
                  hint={vistaPrevia > 0 ? `Seña de ${pesos(vistaPrevia)} con el precio de hoy` : "Vacío si no pide"}
                >
                  <Input
                    id={`${p}-senia-pct`}
                    name="depositPercent"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={100}
                    step={1}
                    value={porcentaje}
                    onChange={(e) => setPorcentaje(e.currentTarget.value)}
                  />
                </Field>
              ) : (
                <Field label="Seña ($)" htmlFor={`${p}-sena`} hint="Vacío si no pide">
                  <Input id={`${p}-sena`} name="depositAmount" type="number" inputMode="numeric" min={0} step={1} defaultValue={s?.depositAmount ?? ""} />
                </Field>
              )}
            </div>
          )}
        </div>
      </Seccion>

      <Seccion titulo="Tiempo">
        <div className="mt-3 grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
          <Field label="Duración para la clienta (min)" htmlFor={`${p}-duracion`} required>
            <Input
              id={`${p}-duracion`}
              name="durationMin"
              type="number"
              inputMode="numeric"
              min={5}
              step={5}
              value={duracion}
              onChange={(e) => setDuracion(e.currentTarget.value)}
              required
            />
          </Field>
          {disponible && (
            <Field label="Ocupa en la agenda (min)" htmlFor={`${p}-agenda`} hint="Vacío = igual. Sumá preparación o limpieza.">
              <Input
                id={`${p}-agenda`}
                name="calendarMin"
                type="number"
                inputMode="numeric"
                min={Number(duracion) || 5}
                step={5}
                defaultValue={f.calendarMin ?? ""}
              />
            </Field>
          )}
        </div>
      </Seccion>

      {disponible && (
        <>
          <Seccion titulo="Cómo se presta">
            <div className="mt-3 flex flex-col gap-4">
              <Segmented
                name="modality"
                leyenda="Modalidad"
                leyendaVisible
                lleno
                defaultValue={f.modality}
                opciones={MODALIDADES.map((m) => ({ valor: m, etiqueta: MODALIDAD_ETIQUETA[m] }))}
              />
              <fieldset className="m-0 min-w-0 border-0 p-0">
                <legend className="mb-1.5 text-sm font-medium text-strong">Tipo de servicio</legend>
                <div className="flex flex-col">
                  {TIPOS.map((t) => (
                    <label key={t} className="flex min-h-11 cursor-pointer items-start gap-3 border-b border-line py-2 last:border-b-0">
                      <input type="radio" name="kind" value={t} defaultChecked={f.kind === t} className="mt-0.5 size-5 shrink-0 accent-accent" />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-strong">{TIPO_ETIQUETA[t]}</span>
                        <span className="block text-[13px] text-muted">{TIPO_AYUDA[t]}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
          </Seccion>

          <Seccion titulo="Recordatorio">
            <div className="mt-3">
              <Field
                label="Aclaraciones para la clienta"
                htmlFor={`${p}-nota`}
                hint={`Va en la confirmación y el recordatorio por WhatsApp. ${nota.length}/${TOPE_NOTA}`}
              >
                <Textarea
                  id={`${p}-nota`}
                  name="reminderNote"
                  rows={2}
                  maxLength={TOPE_NOTA}
                  placeholder="Ej.: Vení bañada y sin cremas."
                  value={nota}
                  onChange={(e) => setNota(e.currentTarget.value)}
                />
              </Field>
            </div>
          </Seccion>
        </>
      )}
    </>
  );
}

/** Achica la foto en el navegador: lado mayor ≤ 1600 px, WebP (o JPEG) y bajo el tope de tamaño. */
async function achicarFoto(file: File): Promise<string | null> {
  const bitmap = await createImageBitmap(file);
  const escala = Math.min(1, LADO_FOTO_SERVICIO / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * escala));
  canvas.height = Math.max(1, Math.round(bitmap.height * escala));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  for (const calidad of [0.82, 0.72, 0.6, 0.48, 0.36]) {
    for (const tipo of ["image/webp", "image/jpeg"]) {
      const datos = canvas.toDataURL(tipo, calidad);
      // Un navegador sin WebP devuelve PNG: no sirve, se prueba JPEG.
      if (datos.startsWith(`data:${tipo};`) && datos.length <= MAX_FOTO_SERVICIO) return datos;
    }
  }
  return null;
}

/** Imágenes del servicio: hasta 4, se suben de a una (si se corta la señal, las que entraron quedan). */
export function FotosDelServicio({ servicio: s, disponible }: { servicio: DatosDeLaFicha | null; disponible: boolean }) {
  const { showError } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [pendiente, startTransition] = useTransition();
  const [estado, setEstado] = useState<string | null>(null);
  if (!disponible) return null;
  const fotos = s?.fotos ?? [];
  const quedan = MAX_FOTOS_SERVICIO - fotos.length;

  const subir = (archivos: FileList | null) => {
    if (!archivos || !s?.id) return;
    const lista = [...archivos].slice(0, Math.max(0, quedan));
    startTransition(async () => {
      for (let i = 0; i < lista.length; i++) {
        setEstado(`Subiendo ${i + 1} de ${lista.length}…`);
        const datos = await achicarFoto(lista[i]).catch(() => null);
        if (!datos) {
          showError(`«${lista[i].name}» no se pudo achicar. Probá con otra foto.`);
          continue;
        }
        const r = await agregarFotoServicio(s.id as string, datos);
        if (!r.ok) {
          showError(r.error);
          break;
        }
      }
      setEstado(null);
      if (input.current) input.current.value = "";
    });
  };

  return (
    <Seccion titulo="Imágenes" nota={`${fotos.length}/${MAX_FOTOS_SERVICIO}`}>
      <div className="mt-3 flex flex-col gap-3" aria-busy={pendiente || undefined}>
        {!s?.id ? (
          <p className="text-sm text-muted">Guardá el servicio y después sumale hasta {MAX_FOTOS_SERVICIO} fotos.</p>
        ) : (
          <>
            {fotos.length > 0 && (
              <ul className="grid grid-cols-2 gap-2 min-[480px]:grid-cols-4">
                {fotos.map((id, i) => (
                  <li key={id} className="flex flex-col gap-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={rutaDeFotoDeServicio(id)}
                      alt={`Foto ${i + 1} del servicio`}
                      loading="lazy"
                      className="aspect-square w-full rounded-md border border-line object-cover"
                    />
                    <button
                      type="button"
                      disabled={pendiente}
                      onClick={() =>
                        startTransition(async () => {
                          const r = await quitarFotoServicio(id);
                          if (!r.ok) showError(r.error);
                        })
                      }
                      className={buttonClasses("ghost", "sm", "min-h-11")}
                      aria-label={`Quitar la foto ${i + 1}`}
                    >
                      Quitar
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {quedan > 0 ? (
              <label className={buttonClasses("outline", "md", "self-start cursor-pointer")}>
                {estado ?? "Sumar fotos"}
                <input
                  ref={input}
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={pendiente}
                  className="sr-only"
                  onChange={(e) => subir(e.currentTarget.files)}
                />
              </label>
            ) : (
              <p className="text-sm text-muted">Llegaste al tope de {MAX_FOTOS_SERVICIO} fotos. Quitá una para sumar otra.</p>
            )}
            <p className="text-[13px] text-muted">Se achican solas antes de subir. Se ven en el catálogo y en la reserva.</p>
          </>
        )}
      </div>
    </Seccion>
  );
}
