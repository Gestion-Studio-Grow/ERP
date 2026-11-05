"use client";

// «Compartir» un servicio, un profesional o la combinación (PLAN.md del link, punto 6): copiar el
// link, mandarlo por WhatsApp con el mensaje armado, el link para la bio de Instagram y la vista
// previa que ve quien lo recibe. Es una Hoja (<dialog> nativo): foco adentro, Escape cierra.

import { useId, useState } from "react";
import { Hoja, buttonClasses, cn } from "@/components/ui";
import { copiar } from "../clases/config/_compartir";
import {
  linkPara,
  mensajeWhatsApp,
  urlWhatsApp,
  vistaPrevia,
  type DatosCompartir,
  type Seleccion,
} from "./compartir-core";

function BotonCopiar({ texto, etiqueta, qa }: { texto: string; etiqueta: string; qa: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      className={cn(buttonClasses("outline", "md"), "min-h-11 shrink-0 justify-center")}
      onClick={async () => {
        if (await copiar(texto)) {
          setCopiado(true);
          setTimeout(() => setCopiado(false), 2500);
        }
      }}
      data-qa={qa}
    >
      <span role="status">{copiado ? "✓ Copiado" : etiqueta}</span>
    </button>
  );
}

function Renglon({ titulo, ayuda, link, children }: { titulo: string; ayuda?: string; link: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <p className="text-sm font-medium text-strong">{titulo}</p>
      {ayuda && <p className="text-xs text-muted">{ayuda}</p>}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <p className="min-w-0 flex-1 break-all rounded-lg bg-surface-sunken px-3 py-2 font-mono text-xs text-strong">{link}</p>
        {children}
      </div>
    </div>
  );
}

function Vista({ datos, sel }: { datos: DatosCompartir; sel: Seleccion }) {
  const v = vistaPrevia(datos, sel);
  const [fallo, setFallo] = useState(false);
  const host = (() => {
    try {
      return new URL(datos.base).host;
    } catch {
      return datos.base;
    }
  })();
  return (
    <div className="grid gap-1.5">
      <p className="text-sm font-medium text-strong">Vista previa</p>
      <p className="text-xs text-muted">Así se ve el link cuando lo pegás en WhatsApp o en una red.</p>
      <figure className="overflow-hidden rounded-xl border border-line bg-surface-raised" data-qa="vista-previa">
        {fallo ? (
          <div className="flex aspect-[1200/630] items-center justify-center bg-surface-sunken px-4 text-center text-sm text-muted">
            La imagen todavía no está lista.
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={v.imagen}
            alt={`Imagen de la tarjeta: ${v.titulo}`}
            width={1200}
            height={630}
            loading="lazy"
            onError={() => setFallo(true)}
            className="aspect-[1200/630] w-full bg-surface-sunken object-cover"
          />
        )}
        <figcaption className="grid gap-0.5 border-t border-line px-3 py-2">
          <span className="text-xs uppercase tracking-wide text-faint">{host}</span>
          <span className="text-sm font-semibold text-strong">{v.titulo}</span>
          <span className="text-sm text-muted">{v.descripcion}</span>
        </figcaption>
      </figure>
    </div>
  );
}

export default function CompartirLink({
  datos,
  sel,
  motivo,
  etiqueta = "Compartir",
  className,
}: {
  datos: DatosCompartir;
  sel: Seleccion;
  /** Si viene, el botón queda deshabilitado y explica por qué. */
  motivo?: string;
  etiqueta?: string;
  className?: string;
}) {
  const [abierta, setAbierta] = useState(false);
  // Se monta al primer toque y queda montada: al cerrar, el <dialog> devuelve el foco al botón.
  const [montada, setMontada] = useState(false);
  const idMotivo = useId();
  const clase = className ?? "chip-btn max-sm:min-h-11!";

  if (motivo) {
    return (
      <>
        <button type="button" aria-disabled="true" aria-describedby={idMotivo} title={motivo} className={cn(clase, "cursor-not-allowed opacity-50")} data-qa="compartir-deshabilitado">
          {etiqueta}
        </button>
        <span id={idMotivo} className="sr-only">{motivo}</span>
      </>
    );
  }

  const v = vistaPrevia(datos, sel);
  const directo = linkPara(datos, sel, "directo");
  const instagram = linkPara(datos, sel, "instagram");
  const whatsapp = urlWhatsApp(mensajeWhatsApp(datos, sel));

  return (
    <>
      <button type="button" className={clase} onClick={() => {
          setMontada(true);
          setAbierta(true);
        }} aria-haspopup="dialog" data-qa="compartir">
        {etiqueta}
      </button>
      {montada && (
        <Hoja
          abierta={abierta}
          onCerrar={() => setAbierta(false)}
          titulo="Compartir link de reserva"
          descripcion={v.titulo}
        >
          <div className="grid gap-5 pt-1">
            <Renglon titulo="Link" link={directo}>
              <BotonCopiar texto={directo} etiqueta="Copiar link" qa="copiar-link-reserva" />
            </Renglon>
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonClasses("solid", "md"), "min-h-11 justify-center")}
              data-qa="compartir-whatsapp"
            >
              WhatsApp
            </a>
            <Renglon titulo="Link para la bio de Instagram" ayuda="Pegalo en «Editar perfil → Enlaces». Así sabés cuántas reservas llegan de ahí." link={instagram}>
              <BotonCopiar texto={instagram} etiqueta="Copiar" qa="copiar-link-instagram" />
            </Renglon>
            <Vista datos={datos} sel={sel} />
          </div>
        </Hoja>
      )}
    </>
  );
}
