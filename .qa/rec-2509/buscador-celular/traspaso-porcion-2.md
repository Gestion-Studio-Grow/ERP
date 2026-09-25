# Traspaso buscador-celular, porción 2 (25/09)

## Hecho en la porción 2
- Punto 2 (renglón vacío en el celular): src/components/ui/Tabla.tsx:324-332, el <td> del renglón vacío lleva
  style gridColumn "1 / -1". Medido en Chromium a 390 px: la celda ocupa todo el ancho, con y sin casillas; sin la
  regla mide menos de la mitad (el test lo comprueba quitándola). En la PC (1440) sigue siendo celda de tabla, 1 línea.
- Punto 4 (consola a 390): negocios-core.ts `coincideNegocio` (la regla de búsqueda; filtrarNegocios la usa).
  TablaNegocios.tsx: prop opcional `buscador={{ q, vista, orden }}` → formulario id="buscar-negocio" en la barra de la
  lista (lg:hidden), filtra mientras se escribe y con Enter hace GET /operador?q=&estado=&orden=. Sin la prop no cambia.
  FALTA LO AJENO: src/app/operador/(console)/page.tsx:332-357 tiene que borrar su <form id="buscar-negocio" lg:hidden>
  y pasar a <TablaNegocios buscador={{ q, vista, orden }} /> (línea 360; `orden` es la variable que ya usa en :151).
  Mientras page.tsx no cambie, la consola se comporta igual que antes (el form viejo sigue).
- Tests: src/app/operador/(console)/tabla-negocios-celular.test.ts (4, Chromium), negocios-core.test.ts (+1). Verde.
  tsc 0 errores, eslint 0. Evidencia en .qa/rec-2509/buscador-celular/.

## Falta (punto 3: «Números del negocio» en el celular)
- Pantalla: el espacio en src/app/admin/(dashboard)/inicio/InicioRenglon.tsx:604-640 (h1 = espacio.nombre), renglones
  con <Renglon> y plata = NumeroDeRenglon (:647-662, cifra + r.detalle o r.motivo en 12-13 px).
- Causa MEDIDA (Chromium 390, CSS real, .qa/rec-2509/buscador-celular/numeros-390-medicion.txt y .png): en el celular
  la grilla del renglón es "minmax(0,1fr) auto" (public/diseno/renglon.css:1076-1083); la columna auto la comparten la
  plata (fila 1) y la tecla (fila 2). Con un detalle largo en la plata («Cerrada · el efectivo va al libro, sin
  turno») la columna auto sube a 215 px y el asunto baja a 127 px → título y detalle con ellipsis («Rep…», «Ingres…»).
  Con detalle corto: asunto 248 px.
- Arreglo propuesto (elegir uno; ninguno de los dos archivos es de este frente):
  a) renglon.css dentro de @media (max-width:1023px) :1076: `[data-diseno="renglon"] [data-ui="renglon"] > [data-parte="plata"] { max-width: 11rem; }`
     y que el texto de la plata pueda partir (white-space normal) — afecta a TODOS los renglones del celular.
  b) Sólo en esta pantalla: en NumeroDeRenglon (InicioRenglon.tsx:652-661) `max-w-[11rem]` + `text-balance` en el span
     del detalle/motivo, así la columna no pasa de 11rem y el asunto queda en ≥ 180 px.
  Recomendado b) (acotado a la pantalla). Test: montar <Renglon> como en la medición y exigir asunto ≥ 45 % de la fila
  y título en una sola línea sin ellipsis a 390 px.
