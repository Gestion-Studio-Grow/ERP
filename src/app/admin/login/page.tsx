import type { Metadata } from "next";
import { FUENTES_PANEL } from "@/design/fuentes-panel";
import { getTenantBrand, resolveAccent, marcaDelNegocio } from "@/lib/branding";
import { getTeamAccentPreset } from "@/lib/team-accent";
import { getProductoContexto } from "@/lib/producto";
import AdminThemeScript from "../AdminThemeScript";
import { disenoNuevo } from "@/lib/diseno/diseno.server";
import { PIEL_RENGLON } from "@/lib/diseno/diseno";
import { ConDiseno } from "@/lib/diseno/ConDiseno";
import LoginRenglon from "./LoginRenglon";
import FormularioDeSiempre from "./FormularioDeSiempre";
import { RAIZ_HOJA_DE_INGRESO } from "./HojaDeIngreso";
import { AVISOS_INFORMATIVOS, avisoDeIngreso, folioDelDia } from "./login-core";
import type { CSSProperties } from "react";
import { direccionConNegocio } from "@/lib/tenant";
import DireccionNoHabilitada from "./DireccionNoHabilitada";
import LogoDelNegocio from "@/components/marca/LogoDelNegocio";
import { buttonClasses } from "@/components/ui";
import { esteticaBackoffice } from "@/lib/estetica-backoffice";
import { claseDeFuentes } from "@/lib/estetica-backoffice-fuentes";
import { marcaProductora } from "@/lib/proyectos/marca";
import { getCurrentTenantSlug } from "@/lib/tenant-site";
import { getBrandSheet } from "@/lib/brand-sheet";
import { pestanaDelPedido } from "@/lib/pestana";
import { getCurrentTenantId } from "@/lib/tenant";
import { esProductora } from "@/lib/proyectos/segundo-factor.server";
import SelloGSG from "@/components/marca/SelloGSG";
import { IsotipoProducto } from "@/components/marca/IsotipoProducto";
import { MarcaDeAgua } from "@/components/marca/MarcaDeAgua";

// Título neutro + sin indexar, igual que el resto de /admin — esta pantalla vive
// FUERA de (dashboard) (proxy.ts la deja pasar sin sesión) así que no hereda su
// metadata y, sin esto, caía en el default de layout.tsx raíz ("CH Estética…"),
// filtrando la marca de CH a la pestaña del login de CUALQUIER tenant (J-2).
// Sello GSG: el login es la primera impresión del producto — GSG firma como
// generador (discreto, en metadata + pie), el tenant conserva SU marca visible.
// Pestaña POR NEGOCIO (E1, 29/10/2026): «Ingresá · Magra»; una dirección sin negocio no nombra a nadie.
export async function generateMetadata(): Promise<Metadata> {
  const base = { robots: { index: false, follow: false }, generator: "Gestión Studio Grow" } satisfies Metadata;
  if (!(await direccionConNegocio().catch(() => false))) return { ...base, title: "Ingresá a tu panel" };
  const brand = await getTenantBrand();
  const { titulo } = pestanaDelPedido({ sinNegocio: false, brand, nombreDelTenant: brand.propia ? null : (await getBrandSheet()).name });
  return { ...base, title: titulo === "Panel de gestión" ? "Ingresá a tu panel" : `Ingresá · ${titulo}` };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  // Una dirección que no lleva a ningún negocio no muestra el formulario: se dice qué pasa y se da
  // una salida (antes: clave y «Se produjo un error inesperado»). Con negocio, nada cambia.
  if (!(await direccionConNegocio())) {
    return <DireccionNoHabilitada whatsappGsg={process.env.WHATSAPP_GSG?.trim() || null} />;
  }
  // Diseño nuevo del negocio (interruptor "Diseño nuevo"): se larga ya y se espera al final, así
  // corre en paralelo con las lecturas de abajo. Nunca rechaza: si falla, el de siempre.
  const disenoP = disenoNuevo();
  const { next, error } = await searchParams;
  const brand = await getTenantBrand();
  // IDENTIDAD POR PRODUCTO (frente identidad-por-producto): el login debe CORRESPONDER
  // al producto, no caer en el "Mi negocio" genérico. Para Comerciante/Contador/Facturita
  // la marca, el copy y el acento salen de la identidad del producto; para el ERP vertical
  // (chestetica/magra) `identidad` es null → todo cae a la marca del tenant, byte-idéntico
  // a lo de antes.
  const { identidad } = await getProductoContexto();
  // Skin Fable (mismo criterio que el layout del admin): el tema lo decide el
  // usuario/sistema, no la regla front/back. Se inyectan los DOS tonos del acento
  // del tenant (nunca `--accent` inline: le ganaría al CSS y el tema no fliparía).
  // El color del equipo elegido en /admin/apariencia SIEMPRE gana; si no, el del
  // producto; si tampoco (vertical), el del branding del tenant.
  // DEMO GSG (src/lib/marca-demo.ts): el cobre de GSG manda sobre el color que haya elegido el cliente.
  const preset = brand.demoGsg ? brand.preset : ((await getTeamAccentPreset()) ?? identidad?.acento ?? brand.preset);
  const accentLight = resolveAccent(preset, "light");
  const accentDark = resolveAccent(preset, "dark");

  // Marca + copy de la pantalla: del producto si lo hay; del tenant (legado) si no.
  const { nombre: marcaNombre, monograma: marcaMonograma } = marcaDelNegocio(brand, identidad);
  const tituloLogin = identidad?.login.titulo ?? "Ingresá a tu panel";
  const subtituloLogin = identidad?.login.subtitulo ?? "Con el email y la contraseña de tu cuenta.";
  // Una productora con marca propia entra con su logo, su letra y sus colores, igual que su panel. Los demás
  // negocios, como siempre: `undefined` deja la raíz y el monograma tal cual.
  const slugDelIngreso = await getCurrentTenantSlug();
  const esteticaDelIngreso = marcaProductora(slugDelIngreso).logoOscuro ? esteticaBackoffice(slugDelIngreso) ?? undefined : undefined;
  const nuevo = await disenoP;
  // Marca de agua de GSG (mosaico del isotipo del producto) SÓLO en el ingreso de un producto de GSG
  // (Comerciante, Contador, Factoque). En un negocio cliente `identidad` es null: nada cambia.
  const marcaDeAgua = identidad != null;
  // Sólo donde está configurado y sólo en una productora: los demás negocios no ven nada nuevo.
  const conGoogle = !!process.env.GOOGLE_CLIENT_ID?.trim() && !!process.env.GOOGLE_CLIENT_SECRET && (await esProductora(await getCurrentTenantId()));

  return (
    <main
      data-skin="fable"
      data-escala="nivel-5"
      // Diseño nuevo: apagado es `undefined` y la raíz queda como siempre (raices-ch.test.ts).
      data-diseno={nuevo ? PIEL_RENGLON : undefined}
      data-theme="light"
      data-estetica={esteticaDelIngreso}
      suppressHydrationWarning
      style={
        {
          "--tenant-accent-light": accentLight.accent,
          "--tenant-on-accent-light": accentLight.onAccent,
          "--tenant-accent-dark": accentDark.accent,
          "--tenant-on-accent-dark": accentDark.onAccent,
        } as CSSProperties
      }
      // Diseño nuevo: la hoja anclada arriba (el teclado del celular tapa la mitad de abajo).
      // Apagado, la misma clase de siempre.
      className={`${marcaDeAgua ? "isolate " : ""}${
        nuevo
          ? `${RAIZ_HOJA_DE_INGRESO} ${FUENTES_PANEL}`
          : `min-h-screen flex flex-col items-center justify-center bg-surface text-body px-4 py-10 sm:px-6 ${FUENTES_PANEL}${esteticaDelIngreso ? ` ${claseDeFuentes(esteticaDelIngreso)}` : ""}`
      }`}
    >
      {/* Corrige el data-theme ANTES del primer paint (sistema/localStorage). */}
      <AdminThemeScript nuevo={nuevo} />
      {marcaDeAgua && <MarcaDeAgua />}

      {/* Diseño nuevo: sus hojas y `useDiseno()`. Apagado devuelve este único hijo tal cual. */}
      <ConDiseno nuevo={nuevo}>
        {nuevo ? (
          <LoginRenglon
            marcaNombre={marcaNombre}
            marcaMonograma={marcaMonograma}
            producto={identidad?.producto}
            hoy={folioDelDia(new Date())}
            antetitulo={identidad?.login.eyebrow}
            titulo={tituloLogin}
            subtitulo={subtituloLogin}
            lema={identidad?.tagline}
            aviso={avisoDeIngreso(error)}
            next={next ?? "/admin"}
            // Sólo en los negocios con equipo (verticales): ahí la clave la repone el dueño desde
            // Usuarios. En los productos (Facturita, Contador) no se afirma lo que no aplica.
            mostrarAyudaClave={!identidad}
          />
        ) : (
        <div className="w-full max-w-sm">
          {/* Marca del producto (o del tenant, en verticales): monograma sobre su acento,
              con un halo suave del acento detrás — primera impresión a la altura del producto,
              sin ruido. Eyebrow + tagline solo cuando hay identidad de producto. */}
          <div className="mb-6 flex flex-col items-center text-center">
            {identidad && (
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[.14em] text-accent">
                {identidad.login.eyebrow}
              </p>
            )}
            {esteticaDelIngreso ? (
              <LogoDelNegocio estetica={esteticaDelIngreso} nombre={marcaNombre} />
            ) : identidad ? (
              <IsotipoProducto producto={identidad.producto} tamano={48} className="text-strong" />
            ) : (
            <span className="relative grid h-12 w-12 place-items-center">
              <span
                aria-hidden
                className="absolute inset-0 rounded-xl bg-accent opacity-20 blur-lg"
              />
              <span
                aria-hidden
                className="relative grid h-12 w-12 place-items-center rounded-xl bg-accent text-lg font-bold text-on-accent shadow-sm"
              >
                {marcaMonograma}
              </span>
            </span>
            )}
            <p className="mt-3 text-sm font-medium text-muted">{marcaNombre}</p>
          </div>

          {/* Card del login: superficie elevada sobre el canvas, borde --line,
              radios del mockup (12px), sombra en reposo. */}
          <section
            aria-labelledby="login-titulo"
            className="rounded-xl border border-line bg-surface-raised p-6 shadow-sm sm:p-8"
          >
            <h1 id="login-titulo" className="text-xl font-semibold tracking-tight text-strong">
              {tituloLogin}
            </h1>
            <p className="mt-1 mb-6 text-sm text-muted">
              {subtituloLogin}
            </p>

            {error === "throttled" ? (
              <p
                role="alert"
                className="mb-5 rounded-md border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm text-danger"
              >
                Demasiados intentos fallidos. Esperá unos minutos y volvé a probar.
              </p>
            ) : error && AVISOS_INFORMATIVOS.has(error) ? (
              <p
                role="status"
                className="mb-5 rounded-md border border-line bg-surface-sunken px-3 py-2.5 text-sm text-strong"
              >
                {avisoDeIngreso(error)?.titulo} {avisoDeIngreso(error)?.detalle}
              </p>
            ) : error === "google" ? (
              <p
                role="alert"
                className="mb-5 rounded-md border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm text-danger"
              >
                No pudimos ingresar con Google. Tu mail tiene que estar dado de alta en este panel.
              </p>
            ) : error ? (
              <p
                role="alert"
                className="mb-5 rounded-md border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm text-danger"
              >
                Email o contraseña incorrectos. Probá de nuevo.
              </p>
            ) : null}

            <FormularioDeSiempre next={next ?? "/admin"} conError={Boolean(error) && !AVISOS_INFORMATIVOS.has(error ?? "")} />
            {conGoogle && (
              <a href={`/admin/login/google?next=${encodeURIComponent(next ?? "/admin")}`} className={`${buttonClasses("outline", "lg", "w-full")} mt-3`}>
                Ingresar con Google
              </a>
            )}
          </section>

          {/* Tagline del producto — cierra la primera impresión. Solo con identidad. */}
          {identidad && (
            <p className="mt-5 text-center text-sm text-muted">{identidad.tagline}</p>
          )}

          {/* Sello GSG, discreto: el tenant conserva su marca; GSG firma detrás. */}
          <SelloGSG className="mt-6" />
        </div>
        )}
      </ConDiseno>
    </main>
  );
}
