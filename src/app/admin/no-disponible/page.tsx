import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import { requireUser } from "@/lib/authz";
import FormCerrarSesion from "../FormCerrarSesion";
import { getTenantBrand, resolveAccent } from "@/lib/branding";
import { getTeamAccentPreset } from "@/lib/team-accent";
import { getProductoContexto } from "@/lib/producto";
import { buscarApp } from "@/apps/registro";
import { destinoDeVuelta, explicarNoDisponible, motivoNoDisponible } from "@/apps/visibles";
import { getNegocioApps } from "@/apps/contexto.server";
import { IconoApp } from "@/components/iconos-apps";
import { buttonClasses } from "@/components/ui";
import AdminThemeScript from "../AdminThemeScript";
import { disenoNuevo } from "@/lib/diseno/diseno.server";
import { PIEL_RENGLON } from "@/lib/diseno/diseno";
import { ConDiseno } from "@/lib/diseno/ConDiseno";
import { cn } from "@/components/ui/cn";
import HojaDeIngreso, { RAIZ_HOJA_DE_INGRESO } from "../login/HojaDeIngreso";
import { folioDelDia } from "../login/login-core";
import { etiquetaDeRol } from "../(dashboard)/usuarios/roles";

// "APP NO DISPONIBLE" — adonde manda `requireApp` cuando la persona no puede abrir una app.
//
// Vive FUERA de (dashboard) a propósito, como /admin/login y /admin/cambiar-password: sólo
// pide sesión (el proxy ya la exige) y no hereda el layout del panel, así que ningún portón
// de ese layout puede volver a mandar acá. Y esta página NUNCA redirige sola: el único
// camino de salida es un botón, y el botón sólo aparece si su destino se puede abrir.
// Con eso un PROFESSIONAL rebotado desde /admin/facturacion ve el porqué y un botón a su
// agenda, en vez de caer a su agenda sin saber qué pasó.
//
// El porqué NO se lee del link: se recalcula con la misma regla que la guardia
// (`motivoNoDisponible`). El `?app=` sólo dice de qué app hablamos; si no es una app
// registrada, se muestra un mensaje genérico.
export const metadata: Metadata = {
  title: "App no disponible",
  robots: { index: false, follow: false },
};

export default async function NoDisponiblePage({
  searchParams,
}: {
  searchParams: Promise<{ app?: string | string[] }>;
}) {
  const [{ app: appParam }, user] = await Promise.all([searchParams, requireUser()]);
  // Una app que no se ofrece en ningún lanzador (esta misma pantalla) no es algo que se
  // pueda "pedir": se trata como un id desconocido.
  const pedida = buscarApp(typeof appParam === "string" ? appParam : undefined);
  const app = pedida?.enLanzador === false ? undefined : pedida;

  const [negocio, brand, { identidad }, teamPreset, nuevo] = await Promise.all([
    getNegocioApps(user.role),
    getTenantBrand(),
    getProductoContexto(),
    getTeamAccentPreset(),
    // Diseño nuevo: sale de la misma lectura de interruptores que `getNegocioApps` (cacheada por
    // pedido), así que no suma viajes. Si falla, el de siempre.
    disenoNuevo(),
  ]);
  const motivo = app ? motivoNoDisponible(app, negocio) : null;
  const texto = explicarNoDisponible(app, motivo, negocio);
  const vuelta = destinoDeVuelta(negocio);
  // Si la app ya se puede abrir (se activó recién, o alguien llegó con el link), se ofrece
  // abrirla. Es un botón, no un redirect: acá no se redirige nunca.
  const abrir = app && motivo === null ? app : null;

  const preset = teamPreset ?? identidad?.acento ?? brand.preset;
  const accentLight = resolveAccent(preset, "light");
  const accentDark = resolveAccent(preset, "dark");
  const marcaNombre = identidad?.nombre ?? brand.name;

  return (
    <main
      data-skin="fable"
      // Diseño nuevo: apagado es `undefined` y la raíz queda como siempre (raices-ch.test.ts).
      data-diseno={nuevo ? PIEL_RENGLON : undefined}
      data-theme="light"
      suppressHydrationWarning
      style={
        {
          "--tenant-accent-light": accentLight.accent,
          "--tenant-on-accent-light": accentLight.onAccent,
          "--tenant-accent-dark": accentDark.accent,
          "--tenant-on-accent-dark": accentDark.onAccent,
        } as CSSProperties
      }
      // Diseño nuevo: la hoja de ingreso, anclada arriba. Apagado, la clase de siempre.
      className={
        nuevo
          ? RAIZ_HOJA_DE_INGRESO
          : "min-h-screen flex flex-col items-center justify-center bg-surface text-body px-4 py-10 sm:px-6"
      }
    >
      <AdminThemeScript nuevo={nuevo} />

      {/* Diseño nuevo: sus hojas y `useDiseno()`. Apagado devuelve este único hijo tal cual. */}
      <ConDiseno nuevo={nuevo}>
        {nuevo ? (
          <HojaDeIngreso
            marcaNombre={marcaNombre}
            marcaMonograma={identidad?.monograma ?? brand.monogram}
            hoy={folioDelDia(new Date())}
            lema={identidad?.tagline}
          >
            <section aria-labelledby="nd-titulo" className="mt-8">
              <h1 id="nd-titulo" className="text-[26px] font-semibold leading-tight text-strong">
                {texto.titulo}
              </h1>
              <p className="mt-2 text-[15px] text-body">{texto.porque}</p>
              <p className="mt-1 text-sm text-muted">{texto.aQuien}</p>

              {/* El renglón de la app, como figura en el inicio, con su estado a la derecha. */}
              {app && (
                <div className="mt-6 flex items-center gap-3 border-y border-line py-3">
                  <IconoApp nombre={app.icono} className="h-5 w-5 shrink-0 text-muted" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium text-strong">{app.nombre}</p>
                    <p className="text-[13px] text-muted">{app.descripcion}</p>
                  </div>
                  <span
                    data-parte="estado-app"
                    className={cn("shrink-0 text-[13px] font-medium", abrir ? "text-strong" : "text-muted")}
                  >
                    {abrir ? "Disponible" : "Sin acceso"}
                  </span>
                </div>
              )}

              {/* Quién está entrando: para pasarle el teléfono a quien sí puede, sin adivinar. */}
              <p className={cn("text-[13px] text-muted", app ? "mt-3" : "mt-6")}>
                Entraste como <span className="font-medium text-body">{user.name}</span> ·{" "}
                {etiquetaDeRol(user.role, negocio.esMostrador)}
              </p>

              <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {abrir && (
                  <Link href={abrir.ruta} className={cn(buttonClasses("solid", "lg", "w-full sm:w-auto"), "min-h-11")}>
                    Abrir {abrir.nombre}
                  </Link>
                )}
                {vuelta && (
                  <Link
                    href={vuelta.href}
                    className={cn(buttonClasses(abrir ? "outline" : "solid", "lg", "w-full sm:w-auto"), "min-h-11")}
                  >
                    {vuelta.etiqueta}
                  </Link>
                )}
                <FormCerrarSesion>
                  <button
                    type="submit"
                    className={cn(buttonClasses(vuelta || abrir ? "ghost" : "outline", "lg", "w-full sm:w-auto"), "min-h-11")}
                  >
                    Cerrar sesión
                  </button>
                </FormCerrarSesion>
              </div>
            </section>
          </HojaDeIngreso>
        ) : (
        <div className="w-full max-w-sm">
          <p className="mb-4 text-center text-sm font-medium text-muted">{marcaNombre}</p>

          <section
            aria-labelledby="nd-titulo"
            className="rounded-xl border border-line bg-surface-raised p-6 shadow-sm sm:p-8"
          >
            <span className="relative mb-4 grid h-12 w-12 place-items-center rounded-xl bg-surface-sunken text-muted">
              <IconoApp nombre={app?.icono ?? "candado"} className="h-6 w-6" />
              {!abrir && (
                <span className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full border border-line bg-surface-raised text-strong">
                  <IconoApp nombre="candado" className="h-3.5 w-3.5" />
                </span>
              )}
            </span>

            <h1 id="nd-titulo" className="text-xl font-semibold tracking-tight text-strong">
              {texto.titulo}
            </h1>
            {app && <p className="mt-1 text-sm text-muted">{app.descripcion}</p>}

            <p className="mt-4 text-sm text-body">{texto.porque}</p>
            <p className="mt-1 text-sm text-body">{texto.aQuien}</p>

            <div className="mt-6 flex flex-col gap-2">
              {abrir && (
                <Link href={abrir.ruta} className={buttonClasses("solid", "md", "w-full")}>
                  Abrir {abrir.nombre}
                </Link>
              )}
              {vuelta && (
                <Link href={vuelta.href} className={buttonClasses(abrir ? "outline" : "solid", "md", "w-full")}>
                  {vuelta.etiqueta}
                </Link>
              )}
              <FormCerrarSesion>
                <button type="submit" className={buttonClasses(vuelta || abrir ? "ghost" : "outline", "md", "w-full")}>
                  Cerrar sesión
                </button>
              </FormCerrarSesion>
            </div>
          </section>

          <p className="mt-6 text-center text-xs text-faint">Con tecnología de Gestión Studio Grow</p>
        </div>
        )}
      </ConDiseno>
    </main>
  );
}
