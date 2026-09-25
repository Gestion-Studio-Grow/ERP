---
id: ADR-099
nivel: fundacional
dominio: producto
depends_on: [ADR-072, ADR-098, ADR-059, ADR-079, ADR-080]
---

# ADR-099 — Diseño nuevo «Renglón»: una piel acotada que se prende por negocio, con su armazón, su navegación, el Inicio y Vender

**Estado:** Aceptada como base (2026-09-24). Las demás pantallas se adoptan en otros frentes · **Reemplaza:** ADR-072 §3 (el «Fable» congelado), y sólo para los negocios con el interruptor prendido · **Depende de:** ADR-072 (enfoque de diseño), ADR-098 (el ERP por apps y los interruptores por negocio), ADR-059 (densidad y primitivas), ADR-079/080 (gate de craft y textos).

> Numeración: el 099 no figura en ninguna de las 96 refs del repo (medido el 2026-09-24 con `git ls-tree` de `docs/adr` en cada una). Si al mergear ya está tomado, se renumera antes de que llegue a main. Una versión anterior de este ADR («Instrumento»: aluminio, teclas con gradiente, Mona Sans) no llegó a commitearse. La auditoría v3 la marcó como transformación cosmética (`AUDITORIA.md:27`: cambiaba botones y letra, pero ninguna pantalla real usaba sus piezas) y este texto la reemplaza entero.

## Contexto

- **La auditoría v3** (`scratchpad/diseno-v3/AUDITORIA.md`) midió el panel de hoy: tarjetas blancas con número grande e ícono en cuadradito, cuatro pisos de navegación, párrafos que explican la pantalla, la plata en cualquier lugar y un Inicio de 18 números que tardaba entre 2,2 y 4,4 s.
- **La dirección elegida** (`DIRECCION.md`, «Renglón») sale del cuaderno, el ticket y el pizarrón del mostrador, no de otro software: *un renglón por cosa, la plata en su columna, una tecla por renglón*. Los prototipos de `proto/` son el criterio de aceptación.
- **La arquitectura** (`ARQUITECTURA.md` §5) ordena el panel por objetivos: diez espacios, acciones con verbo y un Inicio que es una bandeja de lo que hay que atender hoy.
- **CH (`beauty-spa`) está en producción.** El diseño nuevo tiene que vivir en el mismo código sin que CH cambie de HTML mientras su interruptor esté apagado.

## Decisión

### 1 · Se prende por negocio, sin deploy, y apagado deja a CH idéntico

- Interruptor **«Diseño nuevo»** (`diseno-nuevo`, `src/cambios/interruptores.ts`), con el mismo mecanismo que «Trabaja por apps»: una fila de AuditLog escrita sólo por la consola. En CH lo prende únicamente el operador dueño, escribiendo el slug. No cambia qué apps ve nadie.
- **Prendido**, cada raíz del negocio (panel, ingreso, contraseña, «no disponible», contador, Facturita) lleva `data-diseno="renglon"` y `ConDiseno`. `ConDiseno` pide la hoja con `<link precedence>` (React 19), precarga la letra y monta `useDiseno()`. La consola de GSG lo lleva siempre.
- **Apagado**, el atributo no se escribe, `ConDiseno` devuelve a su hijo tal cual y el layout no arma la navegación nueva (`nav` no viaja). **Test del armazón:** `armazon/armazon-ch.test.ts` rinde `AdminShell` para dueña, recepción y profesional de CH (y para un negocio del piloto por apps) y lo compara byte a byte con el HTML de HEAD (`__fixtures__/armazon-head.json`). También prueba que, si alguien pasa `nav` con el interruptor apagado, se ignora. Lo completan `raices-ch.test.ts` (las raíces) y `piel-vieja.test.ts` (las piezas).

### 2 · La piel: una hoja estática sin capa, tokens en TS y contraste medido

- `public/diseno/renglon.css` tiene todas sus reglas bajo `[data-diseno="renglon"]` y no usa `@layer`. Así le gana a `@layer utilities` de Tailwind y viste lo que ya existe sin tocar sus clases. CH no la pide nunca. La URL lleva `?v=` con el hash del contenido.
- **Tokens** en `src/design/tokens.ts`, con neutros por rol:
  - lienzo, hoja, hundido y apretado;
  - línea, línea fuerte y línea de campo;
  - tinta a 7:1, tinta 2 y tinta 3.
- **El gris toma el matiz del negocio** con `oklch(from var(--accent) L C h)`. Si el navegador no lo soporta (`@supports`), queda un respaldo neutro. `hoja.ts` escribe el bloque de variables y `hoja.test.ts` falla si quedó viejo, si aparece un degradé, un `backdrop-filter`, una sombra de más de una capa o una capa CSS, o si se pasa del presupuesto.
- **Materia plana.** La única sombra es `--sombra-flota`, de una capa, para lo que flota (diálogo, paleta, menú). Los radios son de 4 y 6 px. No hay vidrio ni degradés.
- **Contraste** (`src/design/contraste.ts`, corre en `tokens.test.ts`): 46 pares × 8 acentos (GSG sin negocio + los 7 de `ACCENT_PRESETS`) × claro/oscuro × teñido/respaldo = **1.472 mediciones, 0 debajo del mínimo**. El texto más justo da 4,65:1 y lo gráfico más justo, 3,38:1.

### 3 · La letra: Archivo, auto-hospedada en la hoja

- **Un solo archivo:** Archivo variable (OFL), con ancho de 62 a 125 y peso de 100 a 900, subconjunto latino, 90.104 B.
- **El contraste de anchos es la firma:** condensada para rótulos, folios y títulos; normal para leer; semicondensada y pesada para la plata. Las cifras son tabulares.
- Se declara en la hoja (`src/design/fuentes.ts`) y no con `next/font`, porque `next/font` agrega su CSS al layout de todos, CH incluido. El respaldo ajustado sobre Arial (ascent 85,41 %, descent 20,43 %, size-adjust 102,80 %) sale del mismo calculador de `next/font`, así el cambio de letra no mueve la pantalla.
- Mona Sans y Geist salen de la piel nueva.

### 4 · Las piezas (`src/components/ui`)

- **Anatomía.** `Renglon` arma `[folio][asunto][plata][tecla]`: 40 px en la PC; en el celular, dos líneas con la tecla de 44 px. Además:
  - `Bloque`: rótulo y raya, sin caja;
  - `Rotulo`, `LineaDeEstado` (reemplaza al párrafo explicativo), `Franja` (fija, no flota), `DosColumnas`, `Atajos` y `Pestanas`.
- **Plata.** `Plata` usa cifras tabulares y centavos chicos. `tamano="grande"` mide en `cqi` del contenedor, nunca en `vw`.
- **Estados.** `Marca` los muestra con forma y palabra: ● hecho, ○ pendiente, ◐ a medias, ✕ anulado, ⚠ pide acción. Las formas son SVG, porque «◐» y «⚠» no están en Archivo y cada sistema los dibujaba distinto. `RielDeEstados` muestra los pasos.
- **La tabla densa** (`Tabla.tsx` + `tabla-core.ts`, puro y con tests):
  - selección con casilla y con Shift para un rango;
  - acciones en lote;
  - orden y filtros en la URL (`?orden=`, el cursor se reinicia);
  - teclado: ↑/↓, x, Shift+A y la tecla de la acción;
  - en el celular pasa a dos líneas por container query.
- **Lo que flota:**
  - `Cajon` (lateral) y `Dialogo` sobre `<dialog>` nativo, con entrada por `@starting-style`;
  - `MenuMas` sobre el popover API;
  - `PaletaDeComandos`: combobox accesible con `aria-activedescendant` y `aria-live`, que busca con `comandos-core.ts` (puro y con tests).
- **Sin cambios de API** en las piezas de antes (Button, campos, Segmented, Chip, Switch, Hoja, DeslizarParaConfirmar, TecladoNumerico). La hoja las viste por `data-ui`.

### 5 · El armazón y la navegación

- **PC:** una cabecera de dos filas.
  - Fila 1: el negocio (lleva al Inicio), los espacios, «¿Qué querés hacer?» con Ctrl/⌘K y la persona.
  - Fila 2: las pestañas del espacio actual y la **tecla del rubro** a la derecha, siempre en el mismo lugar: Vender en un mostrador, Dar un turno en servicios, con F1.
- **Celular:** una barra arriba (monograma, título y lupa) y una **cápsula** abajo con Inicio, los primeros espacios y la tecla del rubro. Cada espacio abre su hoja con las apps y «Ver el tablero de X».
- **Los diez espacios** de ARQUITECTURA §5.2 (Mostrador/Recepción, Caja, Mis locales, Clientes, Catálogo y precios, Stock, Compras y proveedores, Facturas e impuestos, Números del negocio, Configuración) son **presentación**: `ESPACIOS_NAV` en `src/apps/espacios.ts` agrupa las MISMAS apps que ya decidió `appsVisibles`.
  - Buscar nunca muestra algo que la persona no puede abrir: la paleta busca sólo entre lo que armó el servidor.
  - CH, que trabaja con el menú de siempre, ve las mismas pantallas con los mismos nombres, sólo agrupadas (`navegacion.test.ts`).
  - La propiedad `espacio` de cada app del catálogo no se tocó: es de otro frente.
- **Acciones con verbo** (`src/apps/acciones.ts`): Vender, Dar un turno, Tomar un pedido, Cerrar el día, Recibir mercadería, Cargar una merma y otras. Cada una apunta a una ruta que ya existe y exige la capability de la app que la resuelve.
- **Error de una pantalla** (`(dashboard)/error.tsx`): con el diseño nuevo, falla sólo esa pantalla, el armazón queda y se ofrece «Probar de nuevo». Apagado, relanza el error y lo atiende `global-error.tsx`, como antes.

### 6 · El Inicio y Vender, de punta a punta

- **Inicio** (`inicio/InicioRenglon.tsx` + `bandeja-core.ts`, puro y con tests):
  - Título «Hoy, jueves 24 de septiembre» y la línea del día («Caja cerrada · 11 pedidos abiertos · agosto sin cerrar»).
  - **Para atender hoy**: los números que ya calculaban los loaders de apps, convertidos en tareas por objetivo (Cobrar, Preparar, Cerrar, Reponer, Facturar, Revisar), cada una con su verbo y su tecla.
    - Los pedidos se escriben uno por uno, con sujeto y plata: 3 por lado, más «y N pedidos más».
    - Una alerta sin regla va a Revisar: no se pierde ninguna.
    - Lo que no se pudo leer se dice aparte, porque sin eso no se puede afirmar «nada pendiente».
  - **Mis apps** y el índice de espacios, con un punto donde algo pide atención.
  - La cajera y la recepción que entran a `/admin` pelado caen en su puesto (Vender o Agenda).
- **Vender** (`vender/VenderForm.tsx`):
  - Vista de ticket: buscador, más vendidos como teclas con precio, y un ticket con Venta/Pedido, líneas con peso editable y «−», total grande, medio de pago, vuelto y Cobrar pegado abajo.
  - Teclado: `/` busca, F2 cobra, Alt+1..3 elige el medio, Esc limpia.
  - **Los campos que viajan al servidor son los mismos:** `vender-pantalla.test.ts` compara el FormData de la vista nueva con el de la vieja.
  - La lógica de plata, el cobro sin conexión y los guardias no cambiaron.

### 7 · Performance (informe `perf/`)

- **E2 aplicado:** el rubro sale en la misma tanda del layout (`getCurrentTenantRubro()` en el `Promise.all`). Está cacheado por pedido, así que cambia cuándo se lee, no qué.
- **E1 no es de este frente:** las lecturas de columnas propias de `Tenant` salen sin la transacción de 4 viajes. Lo hizo el frente de performance en `src/lib/rls.ts` (`esLecturaDirectaDeTenant`, con `rls-tenant-directo.test.ts`), porque toca la capa de aislamiento. Con E1, las lecturas de `Tenant` del layout (marca, módulos, rubro) salen de a un viaje cada una y en la misma tanda.
- El Inicio pide menos números que el de tarjetas: 10 de la bandeja, 4 de la línea y hasta 8 de Mis apps, todos cacheados por pedido con el tope de 1,5 s. A eso suma una sola lectura liviana de pedidos (6 filas).

### 8 · Presupuesto (medido el 2026-09-24)

| Qué | Presupuesto | Medido |
|---|---|---|
| Hoja de la piel | ≤ 30 KB gzip | 87.744 B crudos · 14.449 B gzip (`gzip -9`; lo vigila `hoja.test.ts`) |
| Letra | 1 archivo, ≤ 120 KB | 90.104 B, precargada sólo con el diseño nuevo |
| JS nuevo en CH (apagado) | lo mínimo | `SubmitButton`: de 229 a 467 B gzip (esbuild, minificado, sin React), porque pregunta `useDiseno()`. `error.tsx`: 769 B gzip. `ArmazonNuevo` va con `next/dynamic` y CH no lo pide. Lo que el build de Next separe o no del barril `@/components/ui`: **no medido** (no se corrió `next build`) |
| Contraste | AA en los dos modos | 1.472 mediciones, 0 debajo del mínimo |
| Toque | ≥ 44 px en el celular | Inicio, Vender, la paleta y las hojas de espacio a 412 px: 0 controles por debajo (la casilla «Cobrado» se mide con su etiqueta) |

LCP, CLS e INP en producción: **sin medir**. En el laboratorio (modo dev) algunos números del Inicio pasan el tope de 1,5 s en la primera carga después de compilar.

## Consecuencias

- Con el interruptor prendido, cualquier pantalla se viste de Renglón, porque consume la capa semántica (`bg-surface`, `text-muted`, `border-line`…) que la hoja redefine. Las que no están rehechas (Pedidos, Agenda, Caja…) conservan su estructura vieja con la piel nueva hasta que las adopte su frente.
- La galería `/operador/diseno` (consola, sólo GSG) muestra cada pieza viva en claro y oscuro, con el acento de cada negocio y el contraste medido. Es la referencia de quien construye y del repaso del dueño.
- **CH:** nada cambia hasta que el dueño prenda su interruptor. Prenderlo es exponer al cliente en producción: decide el dueño.

## Trade-offs honestos

- **Una regla sin capa pisa utilidades.** Una pieza marcada con `data-ui` pierde los colores y rellenos que un llamador le pase por `className`. La hoja no toca la ubicación de lo que ubica el llamador.
- **Color relativo:** en un navegador que no entiende `oklch(from …)`, el gris queda neutro, sin el matiz del negocio. El respaldo también pasa el contraste (se mide igual). Sólo se probó en Chromium: ningún Safari ni Firefox reales.
- **`public/`** se sirve con `max-age=0, must-revalidate`, así que cada carga revalida (304). La `?v=` permite, si se quiere, `immutable` en `next.config`, que está fuera de este frente.

## Alternativas consideradas

- **«Instrumento»** (aluminio, teclas con gradiente y sombra, Mona Sans): la auditoría v3 la marcó como cosmética. La reemplaza ésta.
- **Un condicional por diseño en cada componente:** duplica cada pieza y ensucia el HTML de CH. Rechazada.
- **`@layer` propia:** perdería contra `@layer utilities` o pediría `!important`. Rechazada.
- **`next/font`:** sumaría su CSS al layout de CH sin beneficio. Rechazada.
- **Radix, cmdk o Framer Motion:** runtime nuevo para todos, cuando la plataforma ya da `<dialog>`, el popover API, `:has()`, container queries y `@starting-style`. Rechazadas.
