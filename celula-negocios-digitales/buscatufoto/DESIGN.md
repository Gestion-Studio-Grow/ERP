# buscatufoto — diseño

## Idea

El mundo del negocio es **la línea de llegada y el dorsal**. El número del corredor es la llave de todo: se
busca por número, se etiqueta por número, se ve en mono. La idea de interacción: *escribís tu dorsal y la
galería se ordena alrededor tuyo*. Un solo momento protagonista: el buscador de dorsal del álbum.

## Logo

Tipográfico: `buscatufoto` en Hanken Grotesk 300, interletrado −0,04em; **"tu"** en el color de acento,
encerrado entre cuatro esquinas de visor (las marcas de enfoque de una cámara). Componente `Logo`.

## Tokens (`src/app/globals.css`)

| Token | Oscuro (por defecto) | Claro |
|---|---|---|
| `--bg` | `#0b0d11` casi negro frío | `#f5f5f2` |
| `--fg` | `#eef0f3` casi blanco | `#111318` |
| `--muted` | `#9aa1ac` | `#5b616b` |
| `--line` | blanco 10 % | negro 10 % |
| `--accent` | `#ff6a3d` naranja dorsal | `#e2531f` |
| `--radius` | 10 px | 10 px |

Tintes por función (degradé desde una esquina, nunca violeta): naranja (marca de agua), amarillo (dorsal),
verde (cupones), azul (colaboradores), verde agua (WhatsApp), rosa óxido (historias).

## Tipografía

- **Hanken Grotesk Variable** (Fontsource, OFL, auto-hospedada vía npm): titulares 300 con −0,05em; cuerpo 400.
- **IBM Plex Mono** 400/500: dorsales, precios, códigos de cupón.
- Escala: titulares `clamp(30px, 4.6vw, 60px)`, cuerpo 14–16 px, rótulos 12–13 px.

## Fondo

`public/fondo/pista.webp`: pista de atletismo vacía al anochecer, B/N, generada por nosotros. Fija detrás de
toda la página, con degradé oscuro desde la izquierda; el contenido se desplaza encima.

## Movimiento (criterio de emil-design-eng + review-animations)

- Curva única de salida `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`; entrada/salida `cubic-bezier(0.77, 0, 0.175, 1)`.
- Duraciones: 120 ms (hover, `:active`), 180 ms (diálogos), 240 ms (paneles). Nada de más de 300 ms en UI.
- `:active` en botones: `scale(0.97)`.
- Diálogos: aparecen desde `scale(0.96)` + opacidad, origen en el centro; salen más rápido que entran.
- Sólo se animan `transform`, `opacity` y `clip-path`. El titular del héroe NO arranca en `opacity: 0` (LCP).
- `prefers-reduced-motion: reduce`: sin desplazamientos ni escalas; quedan fundidos cortos.

## Lo que no va

Degradé violeta, vidrio esmerilado en todo, emojis como íconos, testimonios, contadores de urgencia, "IA" que
no existe, fotos de stock.

## Accesibilidad

`<dialog>` nativo, foco visible (`:focus-visible` con anillo de acento), labels reales, `role="alert"` en
errores, contraste AA, títulos que no se cortan a 390 px.

— Elaborado por GSG
