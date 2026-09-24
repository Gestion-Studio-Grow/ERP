import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import AdminShell from "./AdminShell";
import ToastProvider from "./ToastProvider";
import GlobalLoadingProvider from "./GlobalLoadingProvider";
import DemoBanner from "./DemoBanner";
import { requireUser } from "@/lib/authz";
import { mustChangePasswordFor } from "@/lib/must-change-password";
import { roleHasCapability } from "@/lib/capabilities";
import { getProductoContexto } from "@/lib/producto";
import { getActiveProfile } from "@/lib/profile-gating";
import { lotesYDespieceListos } from "@/lib/carniceria/schema-probe";
import { densityForProfile } from "@/lib/profile-density";
import { navGroupingEnabled } from "@/modules";
import { rutaPermitidaParaModulos } from "@/lib/admin-nav-items";
import { productoUsaTienda } from "@/lib/producto-identidad";
import { getContextoApps, getNegocioApps } from "@/apps/contexto.server";
import { appsVisibles, proyectarMenuDeHoy } from "@/apps/visibles";
import { rutaDeAppConModulo } from "@/apps/rutas";
import { enInicioPorApps } from "./inicio/piloto";
import { getTenantBrand, resolveAccent } from "@/lib/branding";
import { getTeamAccentPreset } from "@/lib/team-accent";
import AdminThemeScript from "../AdminThemeScript";
import { getBrandSheet, brandSheetAccent } from "@/lib/brand-sheet";
import { tenantBrandSheetEnabled } from "@/lib/identity";
import type { CSSProperties } from "react";

// Monograma de respaldo a partir del nombre ("Velas DEMO" → "VD", "Magra" → "M").
function initialsOf(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean);
  if (w.length === 0) return "•";
  if (w.length === 1) return w[0].slice(0, 1).toUpperCase();
  return w.map((x) => x[0]).join("").slice(0, 2).toUpperCase();
}

// Título neutro (antes heredaba "CH Estética…" del layout raíz → se filtraba la
// marca de CH a la pestaña del panel de CUALQUIER tenant, p. ej. Magra). Y el
// backoffice no debe indexarse.
export const metadata: Metadata = {
  title: "Panel de gestión",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // El portón grueso (¿hay sesión?) lo hace `proxy.ts`; acá resolvemos el
  // usuario para adaptar la navegación a su rol (ADR-017 §2.e — ocultar lo que
  // no puede es UX; la seguridad real son los guardas server-side por acción).
  // PERFORMANCE: TODO lo que no depende de otra lectura viaja en UNA sola tanda. Antes
  // `getBrandSheet()` y `getTeamAccentPreset()` se esperaban más abajo, ya con el
  // Promise.all resuelto: eran dos viajes al pooler encadenados detrás del primero, en
  // CADA pantalla del backoffice. Ninguno de los dos depende del usuario ni del otro, así
  // que su lugar es acá. La lectura de la ficha sigue siendo condicional al flag: con el
  // flag OFF no se consulta nada (`null` sin viaje).
  const useSheet = tenantBrandSheetEnabled();
  const [user, brand, activeProfile, productoCtx, , , sheet, teamPreset, modoApps] = await Promise.all([
    requireUser(),
    getTenantBrand(),
    // Perfil activo (ADR-058/059): "lite"/"enterprise" o null si `PROFILES_ENABLED`
    // está OFF (default) → la barra no gatea por perfil ni suma ítems Empresa. Reversible.
    getActiveProfile(),
    // IDENTIDAD POR PRODUCTO (frente identidad-por-producto): producto derivado del tenant
    // (blueprint + módulos), su identidad y su set de módulos asignados.
    getProductoContexto(),
    // Lo que decide qué apps ve cada persona (src/apps/contexto.server.ts): el gate por
    // módulo del negocio (null = sin gate, idéntico a hoy: CH) y si la migración cárnica
    // está aplicada. Se largan acá, en la misma tanda, aunque se usen abajo: están
    // cacheadas por request y `getNegocioApps` (que necesita el rol) las encuentra listas
    // en vez de esperarlas en serie.
    getContextoApps(),
    lotesYDespieceListos(),
    // Ficha de marca (RFC-004-D) — solo si el flag está ON; si no, ni se consulta.
    useSheet ? getBrandSheet() : Promise.resolve(null),
    // Color del equipo elegido en /admin/apariencia (Tenant.accentPreset).
    getTeamAccentPreset(),
    // ¿Trabaja por apps? El interruptor del negocio: una lectura por request, compartida con
    // getContextoApps (src/cambios/interruptores.server.ts). Si falla, el menú de siempre.
    enInicioPorApps(),
  ]);

  // PORTÓN DE CAMBIO FORZADO: si la contraseña del usuario está marcada como temporal (reset del
  // operador), no lo dejamos usar el backoffice hasta que defina una nueva. La pantalla de cambio
  // vive FUERA de (dashboard) → no hereda este layout → sin loop de redirect. Fail-safe: sin la
  // columna (Gate 2 sin aplicar) devuelve false y no gatea nada.
  if (await mustChangePasswordFor({ id: user.id, tenantId: user.tenantId })) {
    redirect("/admin/cambiar-password");
  }

  // RUTEO POR PRODUCTO: Contador y Facturita NO viven en el shell del negocio — su casa es
  // /contador y /facturita/app. Este layout envuelve TODO /admin/(dashboard)/*, así que es el
  // chokepoint: un usuario de esos productos que caiga en cualquier pantalla de /admin se
  // manda a su casa (no ve el backoffice de otro producto). Se gatea por CAPACIDAD para no
  // crear un loop de redirects: solo se redirige si el usuario puede entrar a esa casa
  // (Contador → cartera:manage; Facturita → billing:manage). El ERP vertical y Comerciante
  // viven en /admin → no se tocan.
  if (productoCtx.producto === "contador" && roleHasCapability(user.role, "cartera:manage")) {
    redirect("/contador");
  }
  if (productoCtx.producto === "facturita" && roleHasCapability(user.role, "billing:manage")) {
    redirect("/facturita/app");
  }

  // GATING POR-URL POR PRODUCTO (ADR-054/055/089): la nav ya se muestra focalizada al set de
  // módulos del producto, pero ESO es UX — un OWNER podía teclear /admin/turnos · /admin/caja ·
  // /admin/catalogo y aterrizar en una pantalla vacía de un módulo que no tiene. Acá lo
  // cerramos server-side: si la ruta pide un módulo fuera de su set (o cae fuera del
  // backoffice), lo devolvemos a su Inicio (/admin, que SIEMPRE puede ver → sin loop). El
  // pathname llega por header desde el proxy (los layouts no lo reciben por props).
  // Generalizado de "comerciante" a cualquier producto de facturación con tienda (Comerciante
  // hoy; Pyme a futuro); Contador/Facturita ya salieron por su redirect de casa arriba, y el
  // ERP vertical → `productoUsaTienda` false, NO se toca (chestetica/magra conservan su
  // backoffice completo). Fail-open: sin header, no gatea (no rompe render).
  // Las apps nuevas del registro (Vender, Ventas del día, Mis locales) no están en esa barra:
  // pasan si su módulo está asignado (`rutaDeAppConModulo`), y su página igual las guarda.
  if (productoUsaTienda(productoCtx.producto)) {
    const pathname = (await headers()).get("x-pathname");
    if (
      pathname &&
      !rutaPermitidaParaModulos(pathname, productoCtx.modules) &&
      !rutaDeAppConModulo(pathname, productoCtx.modules)
    ) {
      redirect("/admin");
    }
  }

  // SKIN "FABLE" (mockups aprobados por el dueño, 2026-07): el backoffice ya NO
  // toma su tema de la regla front/back — el tema del admin lo decide el USUARIO
  // (prefers-color-scheme como default + toggle persistente en la topbar). El
  // server manda `data-theme="light"` como fallback sin-JS y AdminThemeScript
  // (primer hijo del contenedor) lo corrige ANTES del primer paint (cero flash);
  // `suppressHydrationWarning` absorbe el desajuste de atributo. La vidriera del
  // tenant conserva su regla y su marca intactas (el skin solo vive acá).
  //
  // ACENTO por tenant, intacto: como el usuario puede flipar el tema en el
  // cliente, se inyectan LOS DOS tonos del preset (claro y oscuro + on-accent AA)
  // como vars neutras, y el skin Fable de globals.css elige el del tema activo.
  // Ojo: NO inyectar `--accent` inline — el inline le ganaría al CSS y el toggle
  // no podría flipar el tono.
  //
  // FICHA DE MARCA (RFC-004-D, frente B), detrás de `TENANT_BRAND_SHEET_ENABLED`: cuando está
  // ON, la PIEL sale de la ficha del tenant leída de la DB (getBrandSheet: name/accentPreset/
  // frontTheme/blueprintId → theme pack) y `data-brand` inyecta tipografía+densidad propias
  // (los neutros en el admin los pisa el skin Fable, a propósito: mismo tema para todo back).

  // COLOR DEL EQUIPO (/admin/apariencia): si el dueño eligió un preset, ese manda
  // en el back (Tenant.accentPreset — la MISMA columna que lee la ficha de marca,
  // así ambos caminos cuentan la misma historia). Sin elección → preset del mapa
  // legado, byte-idéntico a lo de siempre.
  // IDENTIDAD DEL PRODUCTO en el shell: cuando el producto tiene identidad (Comerciante), el
  // panel deja de decir "Mi negocio" — muestra el nombre/monograma/acento del producto. Orden
  // de precedencia igual que en el login: ficha de marca (nombre real del negocio) > color del
  // equipo elegido > acento del producto > branding legado. Para el ERP vertical `identidad`
  // es null → todo cae al camino de siempre, byte-idéntico.
  const identidad = productoCtx.identidad;
  const preset = teamPreset ?? identidad?.acento ?? brand.preset;
  const accentLight = sheet ? brandSheetAccent(sheet, "light") : resolveAccent(preset, "light");
  const accentDark = sheet ? brandSheetAccent(sheet, "dark") : resolveAccent(preset, "dark");
  const dataBrand = sheet ? sheet.themeId : undefined;
  const brandName = sheet ? sheet.name : (identidad?.nombre ?? brand.name);
  const monogram = sheet ? initialsOf(sheet.name) : (identidad?.monograma ?? brand.monogram);

  // LA BARRA SALE DEL REGISTRO DE APPS, calculada UNA vez acá. `appsVisibles` es la misma
  // decisión que usa la guardia de cada página (`requireApp`) y el Inicio por apps: rol ×
  // módulo × rubro × edición. El gate por módulo es POR NEGOCIO (`getContextoApps`):
  //   · CH y todo negocio fuera del piloto → sin gate, la barra de siempre;
  //   · Comerciante → su set de módulos asignado, como antes (Inicio + Facturación +
  //     Clientes + Reportes + config), sin depender del flag global;
  //   · "Trabaja por apps" prendido con módulos asignados → los módulos que tiene activados;
  //   · `MODULE_REGISTRY_ENABLED` prendido → la resolución global, como antes.
  // `proyectarMenuDeHoy` deja sólo las pantallas que ya estaban en la barra, con su rótulo,
  // ícono, grupo y orden de hoy. Que dé EXACTAMENTE la barra de antes (`menuItemsParaTenant`)
  // lo prueba src/apps/paridad-menu.test.ts en todos los casos: CH no ve un cambio.
  const negocioApps = await getNegocioApps(user.role);
  const visibles = appsVisibles(negocioApps);
  const menu = proyectarMenuDeHoy(visibles);

  // DENSIDAD por perfil (ADR-059 D4): el MISMO design system en dos densidades. Comercio
  // (lite) → `data-density="lite"` (espacioso, --density 1.32); Empresa (enterprise) y motor
  // OFF → sin atributo (denso, :root --density 1 = hoy). Es el diferenciador visual que el
  // Challenger marcó invisible (data-theme se seteaba, data-density nunca). Reversible: con
  // `PROFILES_ENABLED` OFF, `activeProfile` es null → sin atributo → byte-idéntico.
  const density = densityForProfile(activeProfile);

  return (
    <div
      data-skin="fable"
      data-theme="light"
      suppressHydrationWarning
      data-density={density}
      data-brand={dataBrand}
      style={
        {
          "--tenant-accent-light": accentLight.accent,
          "--tenant-on-accent-light": accentLight.onAccent,
          "--tenant-accent-dark": accentDark.accent,
          "--tenant-on-accent-dark": accentDark.onAccent,
        } as CSSProperties
      }
      // `--alto-barra-inferior`: lo que ocupa abajo la barra de espacios del celular (sólo en los
      // negocios que trabajan por apps; 0 en la PC y fuera del piloto). Va acá, en la raíz, y no
      // en el shell: lo que se fija abajo en una pantalla cuelga de acá y tiene que apoyarse
      // ENCIMA con `bottom-[var(--alto-barra-inferior,0px)]`. Un `sticky bottom-0` o un `fixed
      // bottom-*` queda DEBAJO de la barra (z-40) y tocarlo abre un espacio. Hoy lo hace el pie de
      // cobrar de Vender (VenderForm.tsx), el pie del Recuento y los avisos (ToastProvider.tsx). El alto es
      // el de la barra entera: botones h-14 + 1px de borde de arriba + la zona segura del celular.
      className={
        modoApps
          ? "min-h-screen bg-surface text-body [--alto-barra-inferior:calc(3.5rem_+_1px_+_env(safe-area-inset-bottom))] lg:[--alto-barra-inferior:0px]"
          : "min-h-screen bg-surface text-body"
      }
    >
      {/* Corrige el data-theme ANTES del primer paint (sistema/localStorage). */}
      <AdminThemeScript />
      {/* Banda de "modo demo" — solo aparece en el deploy de demo; null en real. */}
      <DemoBanner />
      <GlobalLoadingProvider>
        <ToastProvider>
          {/* `apps` (para el buscador de Ctrl/⌘K y la barra de espacios del celular) sólo viaja
              en el piloto: fuera de él la barra busca en su propio menú, como siempre. */}
          <AdminShell role={user.role} userName={user.name} brandName={brandName} monogram={monogram} menu={menu} apps={modoApps ? visibles : []} modoApps={modoApps} esMostrador={negocioApps.esMostrador} navGrouping={navGroupingEnabled()} activeProfile={activeProfile} showPublicSite={productoCtx.producto === "vertical"}>
            {children}
          </AdminShell>
        </ToastProvider>
      </GlobalLoadingProvider>
    </div>
  );
}
