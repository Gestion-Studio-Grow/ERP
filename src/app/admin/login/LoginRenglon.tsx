// INGRESO, DISEÑO NUEVO («Renglón») — sólo con el interruptor «Diseño nuevo».
//
// La primera hoja del libro del negocio, no una tarjeta flotando en el medio: el renglón de la marca
// con el día como folio (`HojaDeIngreso`), el título, y el formulario como dos renglones (rótulo a
// la izquierda en la PC, arriba en el celular) con una sola tecla.
//
// Mismo formulario de siempre: la action `login`, los mismos nombres de campo (`email`,
// `password`, `next`) y los mismos `autoComplete`, así el gestor de contraseñas sigue llenándolo.

import { login } from "@/lib/auth-actions";
import SubmitButton from "@/components/SubmitButton";
import { Input, Rotulo, buttonClasses } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import { CampoClave } from "./CampoClave";
import HojaDeIngreso from "./HojaDeIngreso";
import type { AvisoDeIngreso } from "./login-core";

const ROTULO_CAMPO = "text-[11.5px] font-semibold uppercase tracking-[.06em] text-muted";
const RENGLON_CAMPO = "grid gap-1.5 border-b border-line py-3 sm:grid-cols-[8rem_1fr] sm:items-center sm:gap-4";

export default function LoginRenglon({
  marcaNombre,
  marcaMonograma,
  hoy,
  antetitulo,
  titulo,
  subtitulo,
  lema,
  aviso,
  next,
  mostrarAyudaClave,
}: {
  marcaNombre: string;
  marcaMonograma: string;
  hoy: string;
  antetitulo?: string;
  titulo: string;
  subtitulo: string;
  lema?: string;
  aviso: AvisoDeIngreso | null;
  next: string;
  mostrarAyudaClave: boolean;
}) {
  return (
    <HojaDeIngreso marcaNombre={marcaNombre} marcaMonograma={marcaMonograma} hoy={hoy} lema={lema}>
      <div className="mt-8">
        {antetitulo && <Rotulo className="mb-1">{antetitulo}</Rotulo>}
        <h1 id="login-titulo" className="text-[26px] font-semibold leading-tight text-strong">
          {titulo}
        </h1>
        <p className="mt-1 text-sm text-muted">{subtitulo}</p>
      </div>

      {aviso && (
        <div role="alert" className="mt-6 border-y border-danger/40 bg-danger-soft px-3 py-2.5 text-sm text-danger">
          <strong className="font-semibold">{aviso.titulo}</strong> {aviso.detalle}
        </div>
      )}

      <form action={login} aria-labelledby="login-titulo" className="mt-6 border-t border-line">
        <input type="hidden" name="next" value={next} />
        <div className={RENGLON_CAMPO}>
          <label htmlFor="login-email" data-ui="rotulo" className={ROTULO_CAMPO}>
            Email
          </label>
          <Input
            id="login-email"
            type="email"
            name="email"
            required
            autoFocus
            autoComplete="username"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            className="min-h-11"
          />
        </div>
        <div className={RENGLON_CAMPO}>
          <label htmlFor="login-password" data-ui="rotulo" className={ROTULO_CAMPO}>
            Contraseña
          </label>
          <CampoClave id="login-password" />
        </div>
        <div className="pt-5 sm:pl-36">
          <SubmitButton
            pendingText="Entrando…"
            variant="solid"
            size="lg"
            className={cn(buttonClasses("solid", "lg", "w-full sm:w-auto sm:min-w-48"), "min-h-11")}
          >
            Ingresar
          </SubmitButton>
        </div>
      </form>

      {mostrarAyudaClave && (
        <p className="mt-6 text-[13px] text-muted sm:pl-36">
          ¿No te acordás la contraseña? Quien administra el negocio te pone una nueva desde Usuarios.
        </p>
      )}
    </HojaDeIngreso>
  );
}
