---
name: vidriera-de-autor
description: Método de GSG para diseñar, construir, medir y publicar la vidriera pública de un negocio del ERP con identidad propia, animación y 3D, sin pagarlo en performance ni en honestidad. Usalo cuando un agente de diseño (diseno-marca, un pulido en Fable) arma o mejora una vidriera premium, cuando hay que bajar el costo de carga de una ya hecha, o cuando hay que delegar ese trabajo en un agente. Caso de referencia vivo — Qué Bien Olés (src/app/tienda/quebienoles/).
---

# Vidriera de autor

Método probado en **Qué Bien Olés** (26/09/2026): del Instagram de la marca a una tienda con frasco 3D en
producción (`quebienoles.gsgapp.com.ar`), con backoffice acorde al negocio y dos pasadas de performance medidas.
Acá queda lo que funcionó, cómo se midió y las trampas que costaron tiempo. Cada afirmación lleva su archivo.

## 0. La frontera — leer antes de diseñar

- **ADR-073 (Aceptado, fundacional) prohíbe el código a medida por cliente** (Nivel C: `if (tenant === X)`,
  componentes o archivos exclusivos). Las vidrieras de autor que existen —Magra, Shine Velas y Qué Bien Olés,
  listadas en `EDITORIAL_FRONT_IDS` (`src/lib/identidad-rubro.ts`)— **son** código por marca.
  **[CONTRADICTORIO]**: el ADR dice una cosa, el código hace otra y ningún ADR formaliza la excepción.
  Cierre: decisión del arquitecto con el dueño (ADR de excepción "Creative Grow" con las fronteras de abajo, o
  migrar a Nivel B: config + slots + primitivas). Hasta que se decida, si se hace una:
  - todo lo del negocio vive en **una** carpeta, `src/app/tienda/<marca>/`, más los enganches mínimos de §2;
  - **cero** cambios de schema y **cero** forks del motor de pedidos;
  - lo que le sirve a otro negocio (vocabulario por rubro, 3D en un worker, póster→lienzo) sube al Core como
    primitiva; no se copia de una carpeta a otra.
- **ADR-042:** sin autorización registrada del dueño de la marca no se genera ni se muestra nada con su marca.
- **ADR-043:** el sello GSG va sólo en metadatos (`generator: "Gestión Studio Grow"`), nunca visible en la vidriera.
- **ADR-033:** si el pedido es una RÉPLICA de un front existente, manda la fidelidad; este método es para
  identidad nueva.

## 1. La marca real, con fuente

1. Relevar lo que la marca publica (bio, posteos, placas de precios, destacadas) y dejarlo fechado en
   `docs/preventa/analisis-redes-<marca>.md`.
2. Catálogo en **un** archivo de datos por marca (patrón `src/app/tienda/quebienoles/perfumes.ts`): cada
   producto con su fuente (en QBO, la pirámide olfativa de Fragrantica con su URL).
3. Lo que no se sabe no se inventa: `notas: null` y un aviso visible al comprador ("Consultanos la presentación
   antes de pedirlo"). En el código, `[A VALIDAR]` o `[CONTRADICTORIO]` con todas sus versiones.
4. Un test ata el catálogo a sus fuentes (patrón `quebienoles.test.ts`: coincide con las placas publicadas, las
   fotos existen, los nombres son únicos, nada inventado, el recomendador responde).
5. Sin reseñas reales, `reviews: []`. Nada de urgencia falsa ni de stock inventado.

## 2. Dónde se engancha (arquitectura GSG, sin schema nuevo)

Negocio nuevo = **TENANT + blueprint `retail` + rubro** (configuración). Enganches, todos con precedente en QBO:

| Qué | Dónde |
|---|---|
| Rubro y vocabulario del panel (entrega, ejemplo de nota, "por peso") | `src/blueprints/retail/rubros.ts` (+ `RUBRO_BY_SLUG`) · `src/lib/vocabulario-negocio.ts` |
| Módulos por defecto del rubro | `src/blueprints/presets-meta.ts` |
| Marca (nombre, monograma, preset, tema) | `src/lib/branding.ts` → `TENANTS` |
| Textos de la marca | `src/tenants/storefront.ts` → `COPY_BY_BRAND` |
| Elegir la vidriera de autor | `src/lib/identidad-rubro.ts` → `EDITORIAL_FRONT_IDS` · `src/app/tienda/vidriera/marcas.ts` → `usaVidrieraNueva` en `false` |
| Rama en la página y metadata (favicon, OG, `generator`) | `src/app/tienda/page.tsx` · `src/app/tienda/gracias/page.tsx` |
| Dirección publicada | `src/lib/tenant.ts` → `HOSTS_PUBLICADOS`; con dominio propio, `<sub>.gsgapp.com.ar`. **Nunca** `FORCE_TENANT_SLUG` |

- **El motor de pedidos se reusa, no se toca:** `useVidriera` (bolsa, clave de idempotencia, cupón, envío),
  `usePedidoOnline`, `placeOnlineOrder`, `OlvidarBolsa` y los ayudantes de `catalogo-core` (`plata`, `responde`,
  `parecidosPorPrecio`, `textoDelEnvio`).
- **Carga del catálogo en producción:** script idempotente, simulación por defecto, `--apply` explícito, sin
  borrados y con el GUC del tenant (patrón `scripts/tenants/quebienoles-catalogo.ts`). **Nunca `npm run seed`
  contra producción**: el `.env` local apunta a la base de producción.

## 3. Diseño que no parezca hecho con IA

La vidriera es zona HUMANA (ADR-046); el código, estándar.

- **Una idea sacada del mundo del negocio, no de un template.** Preguntá qué hace la gente con el producto en la
  vida real y convertilo en la interacción. En QBO: mantener apretado el frasco para rociarlo, un retablo con el
  monograma, "puertas" por familia olfativa, la pirámide de notas en la ficha.
- **Un solo momento protagonista.** Un objeto 3D o una escena; el resto es tipografía, ritmo y aire.
- **Tipografía con carácter, auto-hospedada:** didona + caligráfica + palo seco (Bodoni Moda, Pinyon Script y
  Jost, OFL, bajadas de Fontsource, en `public/tenants/<marca>/fuentes/` con `LICENCIAS.txt`). En la vidriera
  no se usa `next/font`, porque suma su CSS y sus precargas al layout de todos (mismo criterio que ADR-099 §3).
- **Paleta del producto real**, no una de moda (QBO: fondo `#0b0908`, oro `#d8b36a`, un color por familia).
- **Copy con las palabras de la marca** (su bio, sus posteos), criollo y concreto. Nada de "Descubrí nuestra
  colección".
- **Recomendador determinista y explicable** en lugar de prometer "IA": tres preguntas y un puntaje por reglas
  (patrón `recomendador.ts`).
- **Delatan a la IA y no van:** degradé violeta, vidrio esmerilado en todo, tres tarjetas con ícono, héroe con
  foto de stock, emojis como íconos, testimonios inventados, contadores de urgencia.
- **Accesibilidad sin negociar:** `<dialog>` nativo, foco visible, teclado, `prefers-reduced-motion` (un cuadro
  quieto), contraste AA, títulos que no se cortan a 390 px (container queries con `cqi`).

## 4. 3D sin romper la página (three.js)

- **Import dinámico, sólo en esa vidriera.** Verificar en el build que three no entra en ninguna otra ruta.
- **Póster primero:** una imagen o SVG del objeto como respaldo (sirve sin WebGL y no compite con el LCP); el
  lienzo aparece con un fundido cuando la escena avisa que está lista.
- **Arranque tardío:** después del LCP, en `requestIdleCallback`, con `compileAsync` antes del primer cuadro.
- **Fuera del hilo principal:** <<COMPLETAR con el informe de la 2.ª pasada: worker + OffscreenCanvas, qué
  mensajes cruza, cuándo cae al camino en el hilo>>.
- **Vidrio físico** (`MeshPhysicalMaterial` con `transmission`): sólo refracta objetos OPACOS. Un volumen interior
  opaco (el perfume) hace que el vidrio se lea como vidrio; el entorno PMREM necesita las franjas de luz DENTRO
  de la sala (14×10×14 en QBO), si no el frasco se ve negro.
- Encuadre de cámara calculado desde el fov, no a ojo; estado inicial explícito de cada pieza móvil (la tapa
  arrancaba levantada).
- Calidad adaptativa por fps medido (DPR y resolución); pausa fuera de pantalla y con la pestaña oculta;
  `webglcontextlost` devuelve el póster; `dispose` al desmontar.

## 5. Performance: con qué vara se mide y qué trampas hay

Medir SIEMPRE antes y después, con la misma vara:

- Lighthouse móvil y escritorio: puntaje, LCP, TBT, SI y CLS.
- Chrome headless con GPU real: tiempo hasta "3D listo", fps del portal y del scroll, tareas largas.
- Bytes reales en producción, desde la consola: `performance.getEntriesByType("resource")` agrupado por tipo,
  con `encodedBodySize` (no depende de la caché).

| Trampa (medida en QBO) | Síntoma | Arreglo |
|---|---|---|
| Animación de entrada desde `opacity: 0` en el titular | Chrome no lo toma como LCP mientras está en 0: LCP tarde | animar `transform`, `clip-path` o `filter`, nunca la opacidad del candidato a LCP |
| CSS en un string que importa un componente cliente | viaja dos veces, en el HTML y en el JS (~45 KB) | renderizar el `<style>` desde un componente de servidor |
| Fuentes precargadas de más | compiten con lo crítico | precargar sólo lo que se ve arriba del pliegue; respaldo con `size-adjust` y `ascent-override` (CLS 0) |
| El layout común precarga fuentes de otro negocio | QBO baja 144 KB de Geist y de CH que no usa | deuda de plataforma: precarga por negocio; no tocar a CH sin decisión |
| Listas largas | scroll a 6 fps en móvil | `content-visibility: auto` + `contain-intrinsic-size`, tarjetas con `memo`, variables de scroll cuantizadas (pasos de 2 %) |
| three con imports nombrados | el chunk no baja (medido) | no vale el cambio |
| `og:image` relativa | sale con el host del deploy (`erp-ch.vercel.app`) | `metadataBase` desde el host del request, sólo para esa marca |

Resultados de referencia en QBO: <<COMPLETAR con la tabla de las dos pasadas>>.

## 6. Verificación antes de decir "listo"

1. **Gate (ADR-040):** `npx tsc --noEmit` · `npx eslint <archivos tocados>` · `npm test` comparado **por nombre**
   contra la línea de base (no por cantidad) · `npx next build`.
2. **Demo local en modo producción** con base en memoria (patrón `scripts/tenants/quebienoles-demo.mts --prod`).
   PGlite atiende una sola sesión: `DB_CONNECTION_LIMIT=1`. En modo dev, detrás del panel de vista previa, la
   página no hidrata: usar `--prod`.
3. **Recorrido del comprador clic por clic,** en escritorio y a 390 px: portal → guía → vitrina → ficha → bolsa →
   datos → pedido → gracias. Marcar callejones sin salida.
4. **Recorrido del dueño** en el panel: alta manual de pedido, tablero, aviso de "listo", cobro y entrega, con el
   vocabulario del rubro.
5. **Regresión de las otras vidrieras** (CH, Magra, Shine): `src/app/tienda/page.tsx` es compartida.
6. Si el panel de vista previa está oculto, las capturas salen vacías: verificar por DOM o JS, no por imagen.

## 7. Publicar

- Rama propia y commit por pathspec. Nunca `git add -A`: el árbol puede estar compartido.
- Justo antes del push, `git fetch` y mirar `origin/main`: la sesión de la nube también empuja.
- Un push por sesión. `git push origin HEAD:main` dispara el deploy de Vercel (proyecto `erp-ch`); anotar el
  deploy anterior como candidato a rollback.
- Verificar en vivo `https://<sub>.gsgapp.com.ar/tienda`: respuesta 200, consola sin errores, bytes transferidos,
  `og:image` absoluta. Después, las otras vidrieras.

## 8. Delegar en un agente de diseño

Encargo que funcionó (orquesta Opus, ejecuta el agente, p. ej. Fable):

- Worktree y rama propios; alcance = la carpeta de la marca más los enganches de §2; sin dependencias nuevas;
  sin tocar datos ni textos que tienen fuente.
- Medir antes y después con SU vara y devolver ≤ 50 líneas: hash, cambios con archivo:línea, tabla antes/después
  y lo no verificado dicho como tal.
- Commit sólo en su rama, sin push ni merge. El orquestador corre el Gate, integra y despliega.
- Con apuro: "una corrida de cada medición, no promedios".

## 9. Archivos del caso de referencia (QBO)

`src/app/tienda/quebienoles/`: `perfumes.ts` (datos y fuentes) · `recomendador.ts` · `vitrina.ts` ·
`QuebienolesFront.tsx` (la vidriera) · `Frasco.tsx` + `frasco-escena.ts` (3D) · `Ficha.tsx` · `Bolsa.tsx` ·
`Guia.tsx` · `estilos.ts` · `GraciasQuebienoles.tsx` · `quebienoles.test.ts`. Documentación:
`docs/tenants/quebienoles/README.md` (autorización, arquitectura, receta) y `proceso.md` (proceso del negocio y
guía del panel).
