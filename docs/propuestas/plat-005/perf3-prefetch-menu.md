# PLAT-005 perf 3 · Sin prefetch automático en el menú del panel (propuesta en espera)

**Estado:** frenado. No se publica código; queda la propuesta y el diff medido. Decisión de ORQ-007 (14/11/2026).
**Depende de:** PR #114 (MARCA-007), que modifica `src/app/admin/(dashboard)/armazon/ArmazonNuevo.tsx`. Se construye cuando #114 entre a `main`, junto con `inicio/BarraInferior.tsx` (no por separado: su ahorro solo no está medido).

## Qué se encontró
- El interruptor `diseno-nuevo` está incorporado (`src/cambios/interruptores.ts:218`): todo negocio rinde `ArmazonNuevo` (`AdminShell.tsx:491`) y nunca `ArmazonDeSiempre`. Por eso `prefetch={false}` en los `NavLinks` de `AdminShell.tsx` es neutro: es código que nadie ve. Ese commit (`96dda3f`, rama `fix/plat-005-prefetch-menu`) no se publica.
- Los prefetch reales salen de `armazon/ArmazonNuevo.tsx` (10 `<Link>`, cada ruta pedida 2 veces: cabecera de PC y cápsula del celular) y de `inicio/BarraInferior.tsx`.
- Next 16: `prefetch={false}` corta el prefetch al entrar en pantalla y también al pasar el mouse. Se descartó el prefetch al pasar el mouse: en un menú vertical el mouse cruza muchos links y cada uno dispara un pedido.

## Medición (LOCAL, no producción)
Método: build de producción (`next start`) contra una base Postgres **local** efímera (nunca Neon), `RLS_ENFORCEMENT=on`, Chromium con Playwright, sesión de CH, viewport 1366×850. SQL contado del log de Postgres sin `BEGIN/COMMIT/ROLLBACK/set_config`; RSC = pedidos de prefetch `?_rsc=`. Una corrida por vista.

| Vista CH | Antes (SQL / RSC) | Sólo AdminShell (`96dda3f`) | ArmazonNuevo + BarraInferior (diff abajo) |
|---|---|---|---|
| Inicio | 77 / 36 | 77 / 35 | 73 / 32 |
| Agenda (`/admin/turnos`) | 56 / 28 | 58 / 28 | **36 / 5** |

El documento solo no cambia (41 SQL en inicio, 28 en agenda): el ahorro es lo que el navegador pide de fondo, no el tiempo de la primera pintura. Diferencias de ±2 son ruido de una corrida.

## Qué falta antes de publicarlo
1. Que #114 entre a `main` y rebasar el diff sobre ese `ArmazonNuevo.tsx`.
2. Test que lea el fuente y exija `prefetch={false}` en cada `<Link>` de `ArmazonNuevo.tsx` y `BarraInferior.tsx` (rojo sin el cambio), como `admin-shell-prefetch.test.ts` de la rama.
3. Repetir la medición con tres corridas por vista y QA clic por clic: cada link navega, la pestaña activa sigue marcada y no hay salto visible en el celular.
4. Certificador distinto del constructor.

## Diff medido (sin commitear; base `c15c3f7`)
```diff
diff --git a/src/app/admin/(dashboard)/AdminShell.tsx b/src/app/admin/(dashboard)/AdminShell.tsx
index 9c44e68..cf05f6b 100644
--- a/src/app/admin/(dashboard)/AdminShell.tsx
+++ b/src/app/admin/(dashboard)/AdminShell.tsx
@@ -87,6 +87,7 @@ export function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?:
           <Link
             key={item.href}
             href={item.href}
+            prefetch={false}
             onClick={onNavigate}
             data-nav-item
             data-active={active || undefined}
@@ -339,6 +340,7 @@ export function NavBuscable({
                   role="option"
                   aria-selected={i === seleccionado}
                   href={item.href}
+                  prefetch={false}
                   onClick={() => {
                     limpiar();
                     onNavigate?.();
@@ -400,6 +402,7 @@ export function NavFooter({
       {showPublicSite && (
         <Link
           href="/"
+          prefetch={false}
           onClick={onNavigate}
           className="block rounded-md px-2 py-1.5 text-xs text-muted hover:text-accent hover:bg-surface-sunken"
         >
diff --git a/src/app/admin/(dashboard)/armazon/ArmazonNuevo.tsx b/src/app/admin/(dashboard)/armazon/ArmazonNuevo.tsx
index f25a8d0..36acf8f 100644
--- a/src/app/admin/(dashboard)/armazon/ArmazonNuevo.tsx
+++ b/src/app/admin/(dashboard)/armazon/ArmazonNuevo.tsx
@@ -102,7 +102,7 @@ function HojaDeEspacio({ id, espacio, actual }: { id: string; espacio: EspacioDe
       <ul data-parte="apps">
         {espacio.apps.map((app) => (
           <li key={app.ruta}>
-            <Link href={app.ruta} data-parte="app" aria-current={actual === app.ruta ? "page" : undefined} onClick={cerrarDesplegable}>
+            <Link prefetch={false} href={app.ruta} data-parte="app" aria-current={actual === app.ruta ? "page" : undefined} onClick={cerrarDesplegable}>
               <IconoApp nombre={app.icono} />
               <span className="min-w-0">
                 <b>{app.nombre}</b>
@@ -113,7 +113,7 @@ function HojaDeEspacio({ id, espacio, actual }: { id: string; espacio: EspacioDe
         ))}
       </ul>
       <div data-parte="pie">
-        <Link
+        <Link prefetch={false}
           href={`/admin?espacio=${espacio.id}`}
           data-ui="button"
           data-variant="outline"
@@ -263,7 +263,7 @@ export default function ArmazonNuevo({
       {/* PC: la cabecera de dos renglones. */}
       <header data-ui="cabecera">
         <div data-parte="fila-1">
-          <Link href={casa} data-parte="negocio" aria-label={`${brandName}: ${conInicio ? "Inicio" : "tu puesto"}`}>
+          <Link prefetch={false} href={casa} data-parte="negocio" aria-label={`${brandName}: ${conInicio ? "Inicio" : "tu puesto"}`}>
             <span data-parte="monograma" aria-hidden>
               {monogram}
             </span>
@@ -272,7 +272,7 @@ export default function ArmazonNuevo({
           {activeProfile && <ProfileBadge profile={activeProfile} />}
           <nav data-parte="espacios" aria-label="Espacios">
             {espacios.map((e) => (
-              <Link
+              <Link prefetch={false}
                 key={e.id}
                 href={hrefDelEspacio(e)}
                 data-parte="espacio"
@@ -301,12 +301,12 @@ export default function ArmazonNuevo({
         <div data-parte="fila-2">
           <nav data-ui="pestanas" aria-label={espacioActual ? `Apps de ${espacioActual.nombre}` : "Inicio"}>
             {enInicio && conInicio && (
-              <Link href="/admin" aria-current="page">
+              <Link prefetch={false} href="/admin" aria-current="page">
                 Inicio
               </Link>
             )}
             {pestanas.map((a) => (
-              <Link key={a.ruta} href={a.ruta} aria-current={appActual === a.ruta ? "page" : undefined}>
+              <Link prefetch={false} key={a.ruta} href={a.ruta} aria-current={appActual === a.ruta ? "page" : undefined}>
                 {a.nombre}
               </Link>
             ))}
@@ -315,7 +315,7 @@ export default function ArmazonNuevo({
             {/* Pedidos nuevos de la tienda (Magra 1I): sólo con el chip montado; si no, nada. */}
             <ChipDePedidosNuevos lugar="pc" />
             {rubro && (
-              <Link href={rubro.ruta} data-ui="button" data-variant="solid" data-size="md" className="inline-flex items-center" aria-keyshortcuts="F1">
+              <Link prefetch={false} href={rubro.ruta} data-ui="button" data-variant="solid" data-size="md" className="inline-flex items-center" aria-keyshortcuts="F1">
                 <IconoApp nombre={rubro.icono} />
                 {rubro.palabra}
                 <Kbd enBoton>{rubro.atajo}</Kbd>
@@ -347,14 +347,14 @@ export default function ArmazonNuevo({
       {/* Celular: la cápsula con el Inicio, los primeros espacios y la tecla del rubro. */}
       <nav data-ui="capsula" aria-label="Espacios" style={{ ["--espacios" as string]: String(lugares) }}>
         {conInicio && (
-          <Link href="/admin" data-parte="espacio" aria-current={enInicio ? "page" : undefined}>
+          <Link prefetch={false} href="/admin" data-parte="espacio" aria-current={enInicio ? "page" : undefined}>
             <Icono nombre="casa" />
             <span>Inicio</span>
           </Link>
         )}
         {enCapsula.map((e) =>
           e.apps.length === 1 ? (
-            <Link
+            <Link prefetch={false}
               key={e.id}
               href={e.apps[0].ruta}
               data-parte="espacio"
@@ -379,7 +379,7 @@ export default function ArmazonNuevo({
           ),
         )}
         {rubro ? (
-          <Link href={rubro.ruta} data-parte="rubro" aria-current={pathname === rubro.ruta ? "page" : undefined}>
+          <Link prefetch={false} href={rubro.ruta} data-parte="rubro" aria-current={pathname === rubro.ruta ? "page" : undefined}>
             <IconoApp nombre={rubro.icono} />
             {rubro.palabra}
           </Link>
diff --git a/src/app/admin/(dashboard)/inicio/BarraInferior.tsx b/src/app/admin/(dashboard)/inicio/BarraInferior.tsx
index 1b16ef7..c081e65 100644
--- a/src/app/admin/(dashboard)/inicio/BarraInferior.tsx
+++ b/src/app/admin/(dashboard)/inicio/BarraInferior.tsx
@@ -176,7 +176,7 @@ function HojaDeEspacio({
         <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain p-2">
           {apps.map((app, i) => (
             <li key={app.id}>
-              <Link
+              <Link prefetch={false}
                 ref={i === 0 ? primera : undefined}
                 href={app.ruta}
                 // Si ya estaba en esa app no cambia la ruta: la hoja se cierra igual.
```
