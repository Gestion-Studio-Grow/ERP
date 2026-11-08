import type { Metadata } from "next";
import { FUENTES_PANEL } from "@/design/fuentes-panel";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import AdminShell from "./AdminShell";
import PanelDeCasa from "./PanelDeCasa";
import LogoDelNegocio from "@/components/marca/LogoDelNegocio";
import { cn } from "@/components/ui/cn";
import ToastProvider from "./ToastProvider";
import GlobalLoadingProvider from "./GlobalLoadingProvider";
import { VocabularioDelNegocio } from "./VocabularioDelNegocio";
import { vocabularioDelNegocio } from "@/lib/vocabulario-negocio";
import DemoBanner from "./DemoBanner";
import { requireUser } from "@/lib/authz";
import { mustChangePasswordFor } from "@/lib/must-change-password";
import { permisoEfectivo } from "@/lib/capabilities";
import { getProductoContexto } from "@/lib/producto";
import { panelInstalable } from "@/lib/terminal/manifest-core";
import { getActiveProfile } from "@/lib/profile-gating";
import { lotesYDespieceListos } from "@/lib/carniceria/schema-probe";
import { getCurrentTenantRubro } from "@/lib/carniceria/rubro";
import { densityForProfile } from "@/lib/profile-density";
import { navGroupingEnabled } from "@/modules";
import { menuDeModoSimple, rutaPermitidaParaModulos } from "@/lib/admin-nav-items";
// En un comercio «Recepción» se dice «Mostrador», como en Usuarios (UAT retail 07-08/11).
import { etiquetaDeRol } from "./usuarios/roles";
import { modoSimpleDeLaSesion } from "@/lib/modo-simple.server";
import FranjaModoSimple from "./FranjaModoSimple";
import { productoUsaTienda } from "@/lib/producto-identidad";
import { getContextoApps, getNegocioApps } from "@/apps/contexto.server";
import { actorActual } from "@/lib/proyectos/gestion.server";
import { appDeGestionVisible, appEnLaBarra, ROL_LABEL } from "@/lib/proyectos/gestion-core";
import { prisma } from "@/lib/prisma";
import { BarraGestion } from "./proyectos/_barra";
import { appDeRuta } from "@/apps/rutas";
import { appCasa, appDelPanelCerrado, appsDeLaCasa, appsVisibles, barraDeCH, conCierreDelMesEnLaBarra, conProyectosEnLaBarra, conVenderEnLaBarra, proyectarMenuDeHoy, rutaDeLaCasa, rutaFueraDelPanel } from "@/apps/visibles";
import { esteticaBackoffice } from "@/lib/estetica-backoffice";
import { esEstetica } from "@/lib/palabras-del-negocio";
import { claseDeFuentes } from "@/lib/estetica-backoffice-fuentes";
import { getCurrentTenantSlug } from "@/lib/tenant-site";
import { rutaDeAppDelNegocio } from "@/apps/rutas";
import { enInicioPorApps } from "./inicio/piloto";
import { getTenantBrand, resolveAccent, marcaDelNegocio } from "@/lib/branding";
import { getTeamAccentPreset } from "@/lib/team-accent";
import AdminThemeScript from "../AdminThemeScript";
import { getBrandSheet, brandSheetAccent } from "@/lib/brand-sheet";
import { pestanaDelPedido } from "@/lib/pestana";
import { tenantBrandSheetEnabled } from "@/lib/identity";
import { disenoNuevo } from "@/lib/diseno/diseno.server";
import { PIEL_RENGLON } from "@/lib/diseno/diseno";
import { armarNavegacion } from "./armazon/navegacion";
import { ConDiseno } from "@/lib/diseno/ConDiseno";
import type { CSSProperties } from "react";
import { interruptoresDelNegocio } from "@/cambios/interruptores.server";
import { mostradorBoutiquePrendido } from "@/cambios/interruptores";

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
// `manifest`: el panel se puede instalar ("Agregar a la pantalla de inicio") con el nombre y el
// color de ESTE negocio, resuelto por host. Vive en /api porque el navegador lo baja sin cookies
// y bajo /admin el portón de sesión lo mandaría al login (src/app/api/pwa/admin.webmanifest/route.ts).
// Taller conserva el suyo en su página (la metadata más específica gana). Sin service worker.
// SÓLO para los negocios con mostrador (módulo terminal o club, `panelInstalable`): al resto no se le
// ofrece «Instalar» (CH no cambia). Los módulos salen de `getProductoContexto`, el mismo que usa el
// layout: cacheado por pedido, no suma ninguna consulta.
export async function generateMetadata(): Promise<Metadata> {
  const [{ modules }, brand] = await Promise.all([getProductoContexto(), getTenantBrand()]);
  // Pestaña POR NEGOCIO (E1, 29/10/2026): «Magra · Panel», no «Panel de gestión» para todos (src/lib/pestana.ts).
  const { titulo } = pestanaDelPedido({ sinNegocio: false, brand, nombreDelTenant: brand.propia ? null : (await getBrandSheet()).name });
  return {
    title: titulo === "Panel de gestión" ? titulo : `${titulo} · Panel`,
    robots: { index: false, follow: false },
    ...(panelInstalable(modules) ? { manifest: "/api/pwa/admin.webmanifest" } : {}),
  };
}

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
  const [user, brand, activeProfile, productoCtx, , , sheet, teamPreset, modoApps, nuevo, rubroDelNegocio, interruptores] = await Promise.all([
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
    // ¿Diseño nuevo? Otro interruptor de la MISMA lectura: cero viajes nuevos. Si falla, el de
    // siempre. Apagado (CH), la raíz y lo de adentro rinden lo de siempre (raices-ch.test.ts).
    disenoNuevo(),
    // PERFORMANCE (informe perf/, E2): el rubro del negocio sale en la MISMA tanda. Está cacheado
    // por pedido (react.cache) y lo leen después el Inicio, Vender y el catálogo: largarlo acá
    // saca un viaje en serie de esas pantallas. Mismo dato, misma función: cambia CUÁNDO se lee.
    getCurrentTenantRubro(),
    // MOSTRADOR BOUTIQUE (Magra 1I): el chip de pedidos nuevos en la cabecera. Es la MISMA lectura de
    // interruptores que las dos de arriba (cacheada por pedido): cero viajes nuevos.
    interruptoresDelNegocio(),
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
  if (productoCtx.producto === "contador" && permisoEfectivo(user, "cartera:manage")) {
    redirect("/contador");
  }
  if (productoCtx.producto === "facturita" && permisoEfectivo(user, "billing:manage")) {
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
  // Las apps nuevas del registro (Vender, Ventas del día, Mis locales, Cierre del mes) no están
  // en esa barra: pasan si su módulo está asignado o si son del núcleo (`rutaDeAppDelNegocio`),
  // y su página igual las guarda con `requireApp`.
  if (productoUsaTienda(productoCtx.producto)) {
    const pathname = (await headers()).get("x-pathname");
    if (
      pathname &&
      !rutaPermitidaParaModulos(pathname, productoCtx.modules) &&
      !rutaDeAppDelNegocio(pathname, productoCtx.modules)
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
  const marca = marcaDelNegocio(brand, identidad);
  let brandName = sheet ? sheet.name : marca.nombre;
  let monogram = sheet ? initialsOf(sheet.name) : marca.monograma;
  // DISEÑO NUEVO — un negocio sin marca propia (cae en la marca neutra de branding.ts: «Mi
  // negocio» con «•») se nombra con SU nombre y sus iniciales: la misma ficha (`getBrandSheet`,
  // cacheada por pedido) que ya se usa con el flag de ficha prendido; acá sólo se toma el nombre,
  // no el color ni el tema. Apagado (CH, que además tiene marca propia) no se consulta nada.
  // QA vuelta 6: con la identidad del producto (Comerciante), la cabecera decía «Comerciante» en el
  // panel de cada negocio. Manda el nombre del negocio (su ficha); el color sigue siendo el del
  // producto. CH no tiene identidad de producto (`identidad` null): no entra acá.
  if (!sheet && identidad) {
    const ficha = await getBrandSheet();
    if (ficha.name !== "Mi negocio") {
      brandName = ficha.name;
      monogram = initialsOf(ficha.name);
    }
  }
  // CO-MARCA (29/10/2026): un negocio sin ficha propia se nombra con SU nombre también con el diseño de siempre (antes
  // sólo con «Diseño nuevo»): el logo tipográfico del encabezado lleva su nombre y sus iniciales, nunca «Mi negocio».
  if (!sheet && !identidad && brand.monogram === "•") {
    const ficha = await getBrandSheet();
    if (ficha.name !== "Mi negocio") {
      brandName = ficha.name;
      monogram = initialsOf(ficha.name);
    }
  }

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
  // ESTÉTICA DEL BACKOFFICE: cada cliente ve su panel con la estética de su front y su marca (src/lib/estetica-
  // backoffice.ts); sin entrada, la del ERP. Va en la raíz (`data-estetica`) para que la tomen todas las pantallas.
  const slugDelNegocio = await getCurrentTenantSlug();
  const estetica = esteticaBackoffice(slugDelNegocio);
  // CO-MARCA (29/10/2026): TODOS los negocios llevan su logo arriba — el de su estética, su logo real o el tipográfico
  // «provisional a confirmar» (LogoDelNegocio) — y GSG firma al pie (FirmaGSG, en el shell).
  const logo = <LogoDelNegocio estetica={estetica} nombre={brandName} slug={slugDelNegocio} monograma={monogram} />;
  const negocioApps = await getNegocioApps(user.role);
  const visiblesDelNegocio = appsVisibles(negocioApps);
  // PANEL DE CASA: un negocio cuyo backoffice es UNA app (Break Point → el club) no ve el menú del ERP. Cualquier
  // otra pantalla de /admin (el Inicio incluido) rebota a su casa; quedan Usuarios y «Salir». Sin módulo con
  // `casa` asignado (CH, Magra, …) es `null` y todo sigue como siempre. Fail-open sin el header, como el gate de
  // arriba: el Inicio también redirige por su cuenta (page.tsx).
  const casa = appCasa(negocioApps);
  if (casa) {
    const pathname = (await headers()).get("x-pathname");
    if (pathname && !rutaDeLaCasa(pathname, casa)) redirect(casa.ruta);
  }
  // PANEL CERRADO (MIA → Proyectos y lo que lo acompaña): lo demás no se abre. Al navegar dentro del panel lo frena
  // `requireApp`, que usa la misma regla; esto es para una dirección abierta directo, sin pasar por «no disponible».
  const panel = appDelPanelCerrado(negocioApps);
  if (panel) {
    const pathname = (await headers()).get("x-pathname");
    if (pathname && rutaFueraDelPanel(pathname, panel)) redirect(panel.ruta);
  }
  // Apps de gestión de eventos: la barra muestra lo que el rol de esa persona puede abrir.
  const actor = panel?.id === "proyectos" ? await actorActual() : null;
  const abribles = actor ? visiblesDelNegocio.filter((a) => appDeGestionVisible(a.id, actor.rol, actor.permisos)) : visiblesDelNegocio;
  const visibles = actor ? abribles.filter((a) => appEnLaBarra(a.id, actor.rol)) : abribles;
  let barraFuera: React.ReactNode = null;
  if (actor) {
    const pathname = (await headers()).get("x-pathname");
    const app = pathname ? appDeRuta(pathname) : null;
    if (app && !abribles.some((a) => a.id === app.id)) redirect("/admin/proyectos/inicio");
    // Fuera de /admin/proyectos (caja, facturación…) el buscador y los avisos siguen a mano; adentro los pone su propio layout.
    if (pathname && !pathname.startsWith("/admin/proyectos")) {
      const avisos = await prisma.proyectoAviso.count({ where: { tenantId: actor.tenantId, destinatario: actor.user.id, leidoEl: null } });
      barraFuera = <div data-gestion><BarraGestion avisos={avisos} persona={actor.nombre} rol={ROL_LABEL[actor.rol]} /></div>;
    }
  }
  // Con tienda (Comerciante), «Cierre del mes» entra a la barra detrás de «Cierre del día»; CH no cambia.
  const barra = conVenderEnLaBarra(conProyectosEnLaBarra(conCierreDelMesEnLaBarra(proyectarMenuDeHoy(visibles), visibles, productoUsaTienda(productoCtx.producto)), visibles), visibles);
  const menuCompleto = esEstetica(slugDelNegocio) ? barraDeCH(barra, visibles, user.role) : barra;
  // MODO SIMPLE (por persona, src/lib/modo-simple.ts): la barra se recorta a Hoy, Agenda, Clientes y
  // Caja; «Ver todo» va en la franja de arriba del contenido. Sin la preferencia, nada cambia.
  const simple = await modoSimpleDeLaSesion();
  const menu = simple.activo ? menuDeModoSimple(menuCompleto) : menuCompleto;
  const rutaActual = simple.prefiere ? ((await headers()).get("x-pathname") ?? "/admin") : "/admin";
  // DISEÑO NUEVO: la navegación del armazón nuevo (espacios, comandos de ⌘K, tecla del rubro), con
  // las MISMAS apps que ya decidió `appsVisibles`. Apagado no se arma ni viaja: CH recibe los mismos
  // props de siempre (armazon/armazon-ch.test.ts).
  const nav = nuevo
    ? armarNavegacion({ visibles, menu, modoApps, esMostrador: negocioApps.esMostrador, role: user.role, overrides: user.overrides })
    : undefined;

  // CHIP DE PEDIDOS NUEVOS (Magra 1I, MG-054): sólo con el mostrador boutique prendido y para quien
  // puede ver pedidos (orders:read, la misma guarda que la consulta del chip). CH y todo negocio con
  // el interruptor apagado: no se monta, no consulta y el HTML de la cabecera queda como estaba.
  const pedidosNuevos = mostradorBoutiquePrendido(interruptores) && permisoEfectivo(user, "orders:read");

  // DENSIDAD por perfil (ADR-059 D4): el MISMO design system en dos densidades. Comercio
  // (lite) → `data-density="lite"` (espacioso, --density 1.32); Empresa (enterprise) y motor
  // OFF → sin atributo (denso, :root --density 1 = hoy). Es el diferenciador visual que el
  // Challenger marcó invisible (data-theme se seteaba, data-density nunca). Reversible: con
  // `PROFILES_ENABLED` OFF, `activeProfile` es null → sin atributo → byte-idéntico.
  const density = densityForProfile(activeProfile);

  return (
    <div
      data-skin="fable"
      // Escala nivel 5 (29/10/2026): letra y radios más generosos, sólo en el panel (globals.css).
      data-escala="nivel-5"
      // DISEÑO NUEVO (interruptor "Diseño nuevo" del negocio): la piel «Renglón» se acota bajo
      // este atributo. Apagado es `undefined` y React no lo escribe: la raíz de siempre, byte a
      // byte. `data-skin="fable"` NO se toca: ThemeToggle, AparienciaControls y theme-client lo buscan.
      data-diseno={nuevo ? PIEL_RENGLON : undefined}
      data-theme="light"
      suppressHydrationWarning
      data-density={density}
      data-brand={dataBrand}
      data-estetica={estetica ?? undefined}
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
      // Por eso un pie pegado NO vuelve a sumar la zona segura si hay barra: deja
      // `max(0.75rem, zona segura − --alto-barra-inferior)` (pie-pegado-zona-segura.test.ts).
      className={cn(
        "min-h-screen bg-surface text-body",
        modoApps && "[--alto-barra-inferior:calc(3.5rem_+_1px_+_env(safe-area-inset-bottom))] lg:[--alto-barra-inferior:0px]",
        // Letras de las pieles del panel (ronda 2: ya no cuelgan de la raíz de la app).
        FUENTES_PANEL,
        claseDeFuentes(estetica),
        // Toque de 48 px, texto de 18 px, foco bien visible y texto secundario con más contraste (globals.css).
        simple.activo && "modo-simple",
      )}
    >
      {/* Corrige el data-theme ANTES del primer paint (sistema/localStorage). Con «Trabaja por
          apps» también sale por ScriptDelTema: la bandeja de un negocio que pesa se refresca sola
          (AvisoDePedidosNuevos, router.refresh) y el <script> de siempre, redibujado en el
          navegador, dispara el aviso de React por consola. El HTML del servidor es el mismo
          (AdminThemeScript.test.ts); CH no trabaja por apps y queda con el de siempre. */}
      <AdminThemeScript nuevo={nuevo || modoApps} />
      {/* Banda de "modo demo" — solo aparece en el deploy de demo; null en real. */}
      <DemoBanner />
      {/* Diseño nuevo: sus hojas y `useDiseno()` para el shell y las pantallas. Apagado devuelve su
          único hijo tal cual, en el mismo lugar: ni un nodo ni una referencia de más. */}
      <ConDiseno nuevo={nuevo}>
        <GlobalLoadingProvider>
          <ToastProvider>
            {/* `apps` (para el buscador de Ctrl/⌘K y la barra de espacios del celular) sólo viaja
                en el piloto: fuera de él la barra busca en su propio menú, como siempre. */}
            {casa ? (
              <PanelDeCasa apps={appsDeLaCasa(casa, visibles)} brandName={brandName} monogram={monogram} logo={logo} userName={user.name}>
                {children}
              </PanelDeCasa>
            ) : (
              <AdminShell role={user.role} rolVisible={actor ? ROL_LABEL[actor.rol] : negocioApps.esMostrador ? etiquetaDeRol(user.role, true) : undefined} userName={user.name} brandName={brandName} monogram={monogram} logo={logo} letraDelNegocio={estetica !== null} menu={menu} apps={modoApps ? visibles : []} modoApps={modoApps} esMostrador={negocioApps.esMostrador} navGrouping={navGroupingEnabled()} activeProfile={activeProfile} showPublicSite={productoCtx.producto === "vertical"} {...(nav ? { nav } : {})} {...(pedidosNuevos ? { pedidosNuevos } : {})} modoSimple={simple.prefiere}>
                <FranjaModoSimple estado={simple} ruta={rutaActual} />
                {/* Cómo se llama el retiro y qué ejemplo lleva la nota, según el rubro (una perfumería
                    entrega en un punto de encuentro, no en un local): sale del rubro ya leído arriba. */}
                {barraFuera}
                <VocabularioDelNegocio valor={vocabularioDelNegocio(rubroDelNegocio.rubro)}>{children}</VocabularioDelNegocio>
              </AdminShell>
            )}
          </ToastProvider>
        </GlobalLoadingProvider>
      </ConDiseno>
    </div>
  );
}
