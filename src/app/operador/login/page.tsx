import Link from "next/link";
import { operatorLogin } from "@/lib/operator-actions";
import SubmitButton from "@/components/SubmitButton";
import { Input, Rotulo, buttonClasses } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import HojaDeIngreso, { RAIZ_HOJA_DE_INGRESO } from "@/app/admin/login/HojaDeIngreso";
import { CampoClave } from "@/app/admin/login/CampoClave";
import { folioDelDia } from "@/app/admin/login/login-core";
import AdminThemeScript from "@/app/admin/AdminThemeScript";
import { PIEL_RENGLON } from "@/lib/diseno/diseno";
import { ConDiseno } from "@/lib/diseno/ConDiseno";

// Login del PLANO DE OPERADOR (control-plane, ADR-021) — separado del login de tenant
// (/admin/login). Nombre y clave:
//   · el dueño de GSG: su clave de siempre (OPERATOR_PASSWORD); el nombre puede quedar vacío;
//   · otro operador: su nombre y la clave con la que armó su línea de OPERADORES (/operador/clave).
// Cada cosa que se hace en la consola queda firmada con ese nombre. La sesión vence a las 8 h.
// En dev, sin OPERATOR_PASSWORD, la clave del dueño es "operador".
//
// La consola es un producto de GSG: lleva siempre el diseño «Renglón» (como su armazón,
// (console)/layout.tsx), sin interruptor. La misma hoja de ingreso que el panel de un negocio
// (HojaDeIngreso): el renglón de la marca con el día como folio, el título y el formulario como
// renglones. Mismo `action`, mismos nombres de campo (`nombre`, `password`, `next`).
const ROTULO_CAMPO = "text-[11.5px] font-semibold uppercase tracking-[.06em] text-muted";
const RENGLON_CAMPO = "grid gap-1.5 border-b border-line py-3 sm:grid-cols-[8rem_1fr] sm:items-center sm:gap-4";

export default async function OperatorLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const aviso =
    error === "throttled"
      ? { titulo: "Demasiados intentos fallidos.", detalle: "Esperá unos minutos y volvé a probar." }
      : error
        ? { titulo: "Nombre o clave incorrectos.", detalle: "Revisá las mayúsculas y probá de nuevo." }
        : null;

  return (
    <div data-skin="fable" data-diseno={PIEL_RENGLON} data-theme="light" suppressHydrationWarning className="min-h-screen">
      {/* Corrige el tema antes del primer paint (lo elegido a mano, o el del sistema). */}
      <AdminThemeScript nuevo />
      <ConDiseno nuevo>
        <main className={RAIZ_HOJA_DE_INGRESO}>
          <HojaDeIngreso marcaNombre="Consola GSG" marcaMonograma="G" hoy={folioDelDia(new Date())} lema="Gestión Studio Grow">
            <div className="mt-8">
              <Rotulo className="mb-1">Plataforma · operadores</Rotulo>
              <h1 id="login-titulo" className="text-[26px] font-semibold leading-tight text-strong">
                Consola de GSG
              </h1>
              <p className="mt-1 text-sm text-muted">Sólo para quienes operan la plataforma. No es el panel de un negocio.</p>
            </div>

            {aviso && (
              <div role="alert" className="mt-6 border-y border-danger/40 bg-danger-soft px-3 py-2.5 text-sm text-danger">
                <strong className="font-semibold">{aviso.titulo}</strong> {aviso.detalle}
              </div>
            )}

            <form action={operatorLogin} aria-labelledby="login-titulo" className="mt-6 border-t border-line">
              <input type="hidden" name="next" value={next ?? "/operador"} />
              <div className={RENGLON_CAMPO}>
                <label htmlFor="operador-nombre" data-ui="rotulo" className={ROTULO_CAMPO}>
                  Operador
                </label>
                <Input
                  id="operador-nombre"
                  type="text"
                  name="nombre"
                  autoFocus
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="Vacío si sos el dueño"
                  className="min-h-11"
                />
              </div>
              <div className={RENGLON_CAMPO}>
                <label htmlFor="operador-clave" data-ui="rotulo" className={ROTULO_CAMPO}>
                  Clave
                </label>
                <CampoClave id="operador-clave" />
              </div>
              <div className="pt-5 sm:pl-36">
                <SubmitButton
                  pendingText="Entrando…"
                  variant="solid"
                  size="lg"
                  className={cn(buttonClasses("solid", "lg", "w-full sm:w-auto sm:min-w-48"), "min-h-11")}
                >
                  Ingresar a la consola
                </SubmitButton>
              </div>
            </form>

            <p className="mt-6 text-[13px] text-muted sm:pl-36">
              ¿Te suman como operador?{" "}
              <Link href="/operador/clave" className="underline underline-offset-2 hover:text-strong">
                Armá tu línea de acceso
              </Link>{" "}
              y pasásela al dueño. Tu clave no sale de tu pantalla.
            </p>
          </HojaDeIngreso>
        </main>
      </ConDiseno>
    </div>
  );
}
