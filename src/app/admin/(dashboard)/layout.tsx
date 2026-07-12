import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import AdminShell from "./AdminShell";
import ToastProvider from "./ToastProvider";
import GlobalLoadingProvider from "./GlobalLoadingProvider";
import DemoBanner from "./DemoBanner";
import { requireUser } from "@/lib/authz";
import { roleHasCapability } from "@/lib/capabilities";
import { getProductoContexto } from "@/lib/producto";
import { getActiveModuleIds } from "@/lib/module-gating";
import { getActiveProfile } from "@/lib/profile-gating";
import { densityForProfile } from "@/lib/profile-density";
import { navGroupingEnabled } from "@/modules";
import { rutaPermitidaComerciante } from "@/lib/admin-nav-items";
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
  const [user, brand, activeModuleIds, activeProfile, productoCtx] = await Promise.all([
    requireUser(),
    getTenantBrand(),
    // Gating por módulo (ADR-054/055): set activo del tenant, o null si el flag está
    // apagado → AdminShell no gatea por módulo (solo por rol). Reversible.
    getActiveModuleIds(),
    // Perfil activo (ADR-058/059): "lite"/"enterprise" o null si `PROFILES_ENABLED`
    // está OFF (default) → AdminShell no gatea por perfil ni suma ítems Empresa. Reversible.
    getActiveProfile(),
    // IDENTIDAD POR PRODUCTO (frente identidad-por-producto): producto derivado del tenant
    // (blueprint + módulos), su identidad y su set de módulos asignados.
    getProductoContexto(),
  ]);

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

  // GATING POR-URL DEL COMERCIANTE (ADR-054/055): la nav ya se le muestra focalizada a su
  // set de módulos (arca/bancos/mercadopago/clients/reports), pero ESO es UX — un OWNER
  // podía teclear /admin/turnos · /admin/caja · /admin/catalogo y aterrizar en una pantalla
  // vacía de un módulo que no tiene. Acá lo cerramos server-side: si la ruta pide un módulo
  // fuera de su set (o cae fuera del backoffice), lo devolvemos a su Inicio (/admin, que
  // SIEMPRE puede ver → sin loop). El pathname llega por header desde el proxy (los layouts
  // no lo reciben por props). Solo Comerciante — el ERP vertical NO se toca (chestetica/
  // magra conservan su backoffice completo). Fail-open: sin header, no gatea (no rompe render).
  if (productoCtx.producto === "comerciante") {
    const pathname = (await headers()).get("x-pathname");
    if (pathname && !rutaPermitidaComerciante(pathname, productoCtx.modules)) {
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
  const useSheet = tenantBrandSheetEnabled();
  const sheet = useSheet ? await getBrandSheet() : null;

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
  const teamPreset = await getTeamAccentPreset();
  const preset = teamPreset ?? identidad?.acento ?? brand.preset;
  const accentLight = sheet ? brandSheetAccent(sheet, "light") : resolveAccent(preset, "light");
  const accentDark = sheet ? brandSheetAccent(sheet, "dark") : resolveAccent(preset, "dark");
  const dataBrand = sheet ? sheet.themeId : undefined;
  const brandName = sheet ? sheet.name : (identidad?.nombre ?? brand.name);
  const monogram = sheet ? initialsOf(sheet.name) : (identidad?.monograma ?? brand.monogram);

  // NAV FOCALIZADA POR PRODUCTO (comerciante), independiente del flag global de módulos:
  // hoy `MODULE_REGISTRY_ENABLED` está OFF → `activeModuleIds` es null → el shell mostraría los
  // 17 ítems (el "mismo backoffice" que rechazó el dueño). Para Comerciante derivamos el gating
  // de su set de módulos ASIGNADO (arca/bancos/mercadopago/clients/reports), así ve SOLO su
  // navegación de facturación (Inicio + Facturación + Clientes + Reportes + config), sin
  // depender del flag y sin tocar el comportamiento de los verticales (que siguen con el flag).
  // Si el flag global ya está ON, `activeModuleIds` manda (misma fuente, sin doble verdad).
  const shellModules =
    activeModuleIds ??
    (productoCtx.producto === "comerciante" ? productoCtx.modules : null);

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
      className="min-h-screen bg-surface text-body"
    >
      {/* Corrige el data-theme ANTES del primer paint (sistema/localStorage). */}
      <AdminThemeScript />
      {/* Banda de "modo demo" — solo aparece en el deploy de demo; null en real. */}
      <DemoBanner />
      <GlobalLoadingProvider>
        <ToastProvider>
          <AdminShell role={user.role} userName={user.name} brandName={brandName} monogram={monogram} activeModules={shellModules ? [...shellModules] : null} navGrouping={navGroupingEnabled()} activeProfile={activeProfile} showPublicSite={productoCtx.producto === "vertical"}>
            {children}
          </AdminShell>
        </ToastProvider>
      </GlobalLoadingProvider>
    </div>
  );
}
