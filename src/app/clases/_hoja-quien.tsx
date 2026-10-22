"use client";

// «¿Quién sos?» (F7): la PRIMERA vez que el alumno toca «Pedir» sube esta hoja con nombre y
// celular, y adentro el «Pedir». Después este teléfono los recuerda (localStorage: sólo nombre y
// celular, nunca el link) y no se pide nada. El celular se acepta como venga (+54 9 11…, 011 15…,
// 11…, M-093): lo normaliza el servidor.

import { HojaPublica } from "./_hoja";
import { alerta, botonPrincipal, campo, etiqueta } from "./_estilos";

export function HojaQuien({
  abierta,
  onCerrar,
  onPedir,
  pendiente,
  error,
  inicial,
  textoBoton,
  profe,
}: {
  abierta: boolean;
  onCerrar: () => void;
  onPedir: (quien: { nombre: string; telefono: string }) => void;
  pendiente: boolean;
  error: string | null;
  inicial: { nombre: string; telefono: string } | null;
  textoBoton: string;
  profe: string;
}) {
  return (
    <HojaPublica
      abierta={abierta}
      onCerrar={onCerrar}
      titulo="¿Quién sos?"
      descripcion={`Así ${profe} sabe quién pidió y te confirma por WhatsApp. Lo pedimos una sola vez.`}
      qa="hoja-quien"
      pie={
        <button type="submit" form="form-quien" disabled={pendiente} className={botonPrincipal} data-qa="pedir-hoja">
          {pendiente ? "Pidiendo…" : textoBoton}
        </button>
      }
    >
      <form
        id="form-quien"
        noValidate
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          onPedir({ nombre: String(f.get("nombre") ?? ""), telefono: String(f.get("telefono") ?? "") });
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
          <input id="t-tel" name="telefono" type="tel" inputMode="tel" autoComplete="tel" placeholder="11 5555-1234" defaultValue={inicial?.telefono ?? ""} className={campo} />
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
