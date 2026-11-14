"use client";

// Las dos casillas del permiso (n1 leer, n2 proponer cambios), con el texto que se acepta, lo que
// NUNCA hacen, cómo se revoca y la versión del texto (provisorio hasta que lo revise el dueño). Cada
// casilla se guarda sola, con su botón. Quien no es titular ve el estado sin poder cambiarlo; n2 sin
// n1 queda deshabilitado. La pantalla no decide nada: la action vuelve a validar todo con la sesión.

import { startTransition, useActionState, useState } from "react";
import { Bloque, Button } from "@/components/ui";
import { Franja } from "@/components/ui/Renglon";
import { TEXTO_CONSENTIMIENTO, type Consentimiento, type CopiaEnBorrador, type NivelDeConsentimiento } from "@/lib/soporte/consentimiento-core";
import { cambiarPermisoSoporteAction, type ResultadoPermiso } from "./actions";

const TITULO: Record<NivelDeConsentimiento, string> = {
  n1: "Leer mis pedidos y preparar respuestas",
  n2: "Proponer cambios de configuración (lista cerrada)",
};

function CopiaDelMail({ copia, titulo }: { copia: CopiaEnBorrador; titulo: string }) {
  return (
    <section aria-label={titulo} className="grid gap-2 rounded border border-dashed border-line p-3 text-sm">
      <p className="font-medium text-strong">{titulo}</p>
      <p className="text-muted">Todavía no mandamos mails: la copia queda guardada como borrador y la ves acá.</p>
      {copia.para && <p>Para: {copia.para}</p>}
      <p>Asunto: {copia.asunto}</p>
      <p className="whitespace-pre-wrap break-words">{copia.cuerpo}</p>
    </section>
  );
}

function Casilla({ nivel, tildada, puede, motivo }: { nivel: NivelDeConsentimiento; tildada: boolean; puede: boolean; motivo: string | null }) {
  const [r, accion, pendiente] = useActionState<ResultadoPermiso | null, FormData>(cambiarPermisoSoporteAction, null);
  const [marcada, setMarcada] = useState(tildada);
  // Si lo guardado cambia (se guardó, o se sacó n1 y n2 dejó de valer), la casilla vuelve a lo guardado.
  const [antes, setAntes] = useState({ tildada, puede });
  if (antes.tildada !== tildada || antes.puede !== puede) {
    setAntes({ tildada, puede });
    setMarcada(tildada);
  }
  const id = `permiso-soporte-${nivel}`;
  const cambio = puede && marcada !== tildada;
  return (
    <form
      // Sin `action={...}`: React 19 resetea el form después de una acción de formulario y la casilla
      // controlada se veía destildada aunque el permiso quedara dado (QA MANT-003).
      onSubmit={(e) => {
        e.preventDefault();
        const datos = new FormData(e.currentTarget);
        startTransition(() => accion(datos));
      }}
      className="grid gap-2 border-b border-line py-3"
    >
      <input type="hidden" name="nivel" value={nivel} />
      <label htmlFor={id} className="flex min-h-11 items-start gap-3 text-sm">
        <input
          id={id}
          type="checkbox"
          name="aceptado"
          checked={marcada}
          onChange={(e) => setMarcada(e.target.checked)}
          disabled={!puede || pendiente}
          aria-describedby={`${id}-texto ${id}-estado`}
          className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--accent)]"
        />
        <span className="grid gap-1">
          <span className="font-medium text-strong">{TITULO[nivel]}</span>
          <span id={`${id}-texto`}>{TEXTO_CONSENTIMIENTO[nivel]}</span>
        </span>
      </label>
      <p id={`${id}-estado`} className="text-[13px] text-muted">
        Hoy: {tildada ? "permiso dado" : "sin permiso"}
        {motivo ? ` · ${motivo}` : ""}
      </p>
      {puede && (
        <div>
          <Button type="submit" size="md" variant={cambio ? "solid" : "outline"} className="min-h-11" disabled={!cambio || pendiente}>
            {pendiente ? "Guardando…" : marcada ? "Guardar: doy el permiso" : "Guardar: saco el permiso"}
          </Button>
        </div>
      )}
      {r && (
        <Franja tono={r.ok ? undefined : "peligro"}>
          <span>{r.ok ? r.mensaje : r.error}</span>
        </Franja>
      )}
      {r?.ok && <CopiaDelMail copia={r.copia} titulo="Copia por mail (borrador, no enviada)" />}
    </form>
  );
}

export default function PermisoSoporte({ habilitado, vigente, esTitular, ultimaCopia }: {
  habilitado: boolean;
  vigente: Consentimiento;
  esTitular: boolean;
  ultimaCopia: CopiaEnBorrador | null;
}) {
  const puede = habilitado && esTitular;
  return (
    <div className="grid gap-6">
      {TEXTO_CONSENTIMIENTO.provisorio && (
        <Franja tono="atencion">
          Texto provisorio: lo está revisando Gestión Studio Grow y puede cambiar. Si cambia, te lo volvemos a pedir.
        </Franja>
      )}
      {!habilitado && (
        <Franja tono="atencion">
          Este permiso todavía no está habilitado en tu negocio, así que no se guarda nada. Mientras tanto, tus pedidos los atiende una persona de GSG.
        </Franja>
      )}
      {habilitado && !esTitular && (
        <Franja>Sólo el titular del negocio puede dar o sacar este permiso. Acá ves cómo está hoy.</Franja>
      )}
      <Bloque titulo="Permiso a la IA de soporte">
        <Casilla nivel="n1" tildada={vigente.n1} puede={puede} motivo={null} />
        <Casilla
          nivel="n2"
          tildada={vigente.n2}
          puede={puede && vigente.n1}
          motivo={vigente.n1 ? null : "primero hace falta el permiso de lectura"}
        />
      </Bloque>
      <Bloque titulo="Lo que nunca hacen">
        <p className="pt-3 text-sm">{TEXTO_CONSENTIMIENTO.nunca}</p>
      </Bloque>
      <Bloque titulo="Cómo sacarlo">
        <p className="pt-3 text-sm">{TEXTO_CONSENTIMIENTO.revocar}</p>
        <p className="pt-2 text-[13px] text-muted">Versión del texto: {TEXTO_CONSENTIMIENTO.version}</p>
      </Bloque>
      {ultimaCopia && <CopiaDelMail copia={ultimaCopia} titulo="Última copia por mail (borrador, no enviada)" />}
    </div>
  );
}
