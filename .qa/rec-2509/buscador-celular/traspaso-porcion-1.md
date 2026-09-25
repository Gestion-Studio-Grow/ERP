# Traspaso buscador-celular, porción 1 (25/09)

## Hecho (punto 1: buscador del cajero)
- src/lib/buscador/registros-core.ts: `PermisosDeBusqueda.vender`; `productosParaCobrar` (sólo activos y con precio,
  segunda línea «Por kilo|Por unidad · $precio de venta», enlace /admin/vender). Con Catálogo manda lo de siempre.
- src/lib/buscador/buscar-en-el-negocio.ts: `vender: appPermitida(appPorId("vender"))`; lee productos con catálogo O vender;
  sin catálogo filtra `active: true` y con precio (como vender/datos.ts:17-25). El costo no se lee (no está en el select).
- Tests: registros-core.test.ts (+4), buscar-cajero-postgres.test.ts (nuevo, base efímera propia: 2 bases en el mismo
  archivo no andan, el cliente de Prisma queda en la primera). 25/25 verde. Evidencia .qa/rec-2509/buscador-celular/.
- CH: no cambia. Vender es `moduloDuro` (mostrador.ts:23-28) y beauty-spa no tiene `pos`; la paleta sólo existe con Diseño nuevo.
- OJO: no correr prettier en estos archivos (el repo no lo usa; reformatea todo).

## Falta
2. Tabla vacía en el celular: Tabla.tsx:325-326, el <td> del renglón vacío no tiene data-movil y cae en la columna
   `sel` (ancho 0/auto) del grid móvil de public/diseno/renglon.css:1537-1562 → una palabra por renglón.
   Arreglo propuesto dentro de Tabla.tsx: `style={{ gridColumn: "1 / -1" }}` en ese <td> (en la PC, display table-cell,
   se ignora). Test en Chromium: molde de src/app/admin/(dashboard)/caja/caja-renglon.test.ts (esbuild + CSS real con
   cssDeLaApp + data-diseno="renglon"), montar <Tabla filas={[]} vacio="..."> a 390 px y medir que el td mida ≈ el
   ancho de la tabla y que el texto quepa en 1-2 líneas. Chromium está en /opt/pw-browsers/chromium-1194.
3. «Números del negocio» en el celular (textos «Rep…», «Ingres…»): sin investigar. Espacio en src/apps/espacios.ts:260-266
   (apps resultado-del-mes, margen, flujo-de-fondos, reportes, comisiones...). Buscar qué pantalla dibuja los rótulos
   cortados (probablemente las tarjetas/solapas del espacio con truncate) y cortar por palabras o achicar.
4. Consola a 390: el QA (.qa/rediseno/ch-consola-contador/recorrido.mjs:141-151) hace `getByPlaceholder(/Buscar un
   negocio/).first()`, que a 390 es el input OCULTO de la cabecera de PC (CabeceraConsola.tsx:137-155); timeout. El
   formulario del celular existe (operador/(console)/page.tsx:332-357, lg:hidden, GET ?q=) y la lupa de la barra móvil
   lleva a #buscar-negocio (CabeceraConsola.tsx:203). No medido en navegador todavía si funciona.
   Propuesta: mover el buscador de la lista a TablaNegocios (slot `barra` de Tabla) con prop opcional
   `buscador={{ q, vista }}`: form GET a /operador (mismo comportamiento sin JS) + filtro en vivo de las filas con una
   función pura nueva en negocios-core (`coincideNegocio`, la misma regla que filtrarNegocios:81-90). Sin la prop no
   cambia nada. Después page.tsx (ajeno) tiene que sacar su form lg:hidden y pasar la prop. Test Chromium a 390.
