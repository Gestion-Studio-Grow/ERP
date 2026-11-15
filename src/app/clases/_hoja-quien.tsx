"use client";

// «¿Quién sos?» (F7): la PRIMERA vez que el alumno toca «Pedir» sube esta hoja con nombre y
// celular, y adentro el «Pedir». Después este teléfono los recuerda (localStorage: sólo nombre y
// celular, nunca el link) y no se pide nada. El celular se acepta como venga (+54 9 11…, 011 15…,
// 11…, M-093): lo normaliza el servidor. Sin número de ejemplo como placeholder: ayuda en texto (§10).

import { HojaPublica } from "./_hoja";
import { cn } from "@/components/ui/cn";
import { alerta, ayuda, botonPrincipal, campo, etiqueta, ocupado } from "./_estilos";
import { IconoGirando } from "./_iconos";

export function HojaQuien({
  abierta,
  onCerrar,
  onPedir,
  pendiente,
  error,
  inicial,
  textoBoton,
  profe,
  avisaGsg = false,
}: {
  abierta: boolean;
  onCerrar: () => void;
  onPedir: (quien: { nombre: string; telefono: string }) => void;
  pendiente: boolean;
  error: string | null;
  inicial: { nombre: string; telefono: string } | null;
  textoBoton: string;
  profe: string;
  /** Vino del buscador de profes: avisa GSG (canal.ts), no el profe. */
  avisaGsg?: boolean;
}) {
  return (
    <HojaPublica
      abierta={abierta}
      onCerrar={onCerrar}
      titulo="¿Quién sos?"
      descripcion={avisaGsg ? `Así ${profe} sabe quién pidió y te avisamos por WhatsApp cuando confirme. Lo pedimos una sola vez.` : `Así ${profe} sabe quién pidió y te confirma por WhatsApp. Lo pedimos una sola vez.`}
      qa="hoja-quien"
      pie={
        <button type="submit" form="form-quien" aria-busy={pendiente} className={cn(botonPrincipal, ocupado)} data-qa="pedir-hoja">
          {pendiente ? (
            <>
              <IconoGirando className="size-6 shrink-0" /> Pidiendo tu clase…
            </>
          ) : (
            textoBoton
          )}
        </button>
      }
    >
      <form
        id="form-quien"
        noValidate
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (pendiente) return;
          const f = new FormData(e.currentTarget);
          onPedir({ nombre: String(f.get("nombre") ?? ""), telefono: String(f.get("telefono") ?? "") });
        }}
        // Enter en cualquiera de los dos campos pide (QA 29/10): el botón vive en el pie de la hoja,
        // fuera del <form>, y no todos los navegadores lo toman como el botón por defecto.
        onKeyDown={(e) => {
          if (e.key !== "Enter" || e.nativeEvent.isComposing || !(e.target instanceof HTMLInputElement)) return;
          e.preventDefault();
          e.currentTarget.requestSubmit();
        }}
      >
        <div>
          <label htmlFor="t-nombre" className={etiqueta}>
            Nombre
          </label>
          <input id="t-nombre" name="nombre" autoComplete="name" defaultValue={inicial?.nombre ?? ""} className={campo} />
        </div>
        <div>
          <label htmlFor="t-tel" className={etiqueta}>
            Celular (WhatsApp)
          </label>
          <input id="t-tel" name="telefono" type="tel" inputMode="tel" autoComplete="tel" aria-describedby="t-tel-ayuda" defaultValue={inicial?.telefono ?? ""} className={campo} />
          <p id="t-tel-ayuda" className={ayuda}>
            El que usás en WhatsApp, con característica.
          </p>
        </div>
        {error && (
          <p role="alert" className={alerta} data-qa="error-quien">
            {error}
          </p>
        )}
      </form>
    </HojaPublica>
  );
}
