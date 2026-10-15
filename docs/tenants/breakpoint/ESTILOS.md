# Break Point — los 5 estilos visuales del backoffice

**Fecha:** 2026-10-15 · **Pedido del dueño:** 5 estilos premium, fuera del sesgo de los modelos, respetando la marca del club.
**Cómo se hizo:** el plan de diseño lo armó un agente en **Fable** (pedido explícito del dueño en esta sesión: *"planificá con Fable y ejecutá con Opus"*; es una excepción puntual a la norma *sólo Opus 5.5*) y la implementación, QA y ajustes, **Opus 5.5**.
**Dónde está:** `public/previews/breakpoint/club/index.html` → bloque `<style id="estilos">` (generado) y script de `<head>` que aplica el estilo antes de pintar y carga sólo su tipografía.
**Cómo se elige:** botón **Estilo** del encabezado, la búsqueda (Ctrl/⌘K → «estilo …») o `?estilo=chapa|marcador|cesped|bodegon|galpon|original` en la URL. Se recuerda en el navegador. **Por defecto: Chapa.**

## Ajustes hechos al implementar (sobre el plan de abajo)

- Cinta de demo siempre oscura (en oscuro quedaba una franja clara; en Marcador el texto era invisible).
- Galpón: las alertas urgentes sin fondo rosa (sólo la barra roja) para no gritar; KPI en mono a 25 px y sin corte de línea.
- Celular: el chip de usuario se compacta y los ±30′ del reloj de la demo pasan a la búsqueda, para que el encabezado entre en dos filas.
- Las pestañas pegajosas se ubican según la altura real del encabezado (`--alto-header`, medida con ResizeObserver), porque cada estilo mide distinto.
- Base (todos los estilos, incluso el original): `--orange-ui` #BF5A00 para trazos finos naranjas y tinta oscura (`--on-bad`) sobre rojo en modo oscuro.
- **Pendiente con la marca:** el Instagram del club no se pudo abrir desde el entorno (red bloqueada); los colores y el logo salen de la extracción de julio (`docs/metodologia/registro-casos/breakpoint.md`). Hay que validar con el club y pedir el logo vectorial + autorización de marca (ADR-034) antes de mostrarlo.

---

# Break Point Pádel · backoffice — 5 estilos premium (plan de diseño)

Documento para el ingeniero que implementa los temas en `public/previews/breakpoint/club/index.html`.
Alcance: sólo CSS (tokens + overrides por `data-estilo`), sin tocar `app.mjs` salvo el selector de estilo.
Todos los ratios de contraste de este plan se calcularon con un script (WCAG 2.x) sobre los hex finales; no son estimaciones.

---

## 1. Tesis de diseño

**Qué es "premium" para este club.** Break Point no es un resort ni una startup: es un club de amigos en Ezeiza, con cuatro
canchas panorámicas, un bodegón, un torneo regional y una recepción que atiende a las 23:00 un jueves. "Premium" acá es lo que
se siente en un buen club de barrio bien administrado: **todo en su lugar, nada que sobre, letras grandes y claras, los
números alineados como en una planilla de caja, el logo bien puesto y no gritando**. Caro no es brillante: caro es sereno.

**Qué hace que un backoffice se vea caro (y lo que vamos a cuidar en los cinco estilos):**
- **Ritmo.** Una grilla vertical de 4 px, filas de agenda de 30 px (ya está en `--row`), paddings que se repiten (8 / 12 / 16 / 24),
  no "un poquito más acá". Las alineaciones se notan aunque nadie las mida.
- **Jerarquía tipográfica real.** Dos familias como máximo, cada una con un trabajo; títulos de pantalla que se distinguen por
  forma (condensada, serif, ancho) y no sólo por tamaño. Etiquetas chicas con tracking, cuerpo a 14 px, nunca 11 px para leer.
- **Numerales tabulares SIEMPRE** (`font-variant-numeric: tabular-nums`, y `lining-nums` donde la fuente tiene minúsculos):
  la caja, el reloj, la columna de horas y los KPI tienen que apilar como una columna de planilla.
- **Contención.** Un acento por pantalla (naranja para "ahora/fijo", rojo sólo para deuda y urgencia). Sin sombras en todo; la
  sombra existe sólo donde algo flota de verdad (diálogo, menú flotante, toast).
- **Materialidad.** Cada estilo cita un material real (chapa esmaltada, tablero de resultados, césped y vidrio, papel de
  comanda, chapa acanalada) con una textura hecha en CSS puro, muy sutil, que se puede apagar en `prefers-reduced-transparency`
  o simplemente bajando `--texture` a `none`.
- **Movimiento con intención.** 90–160 ms en operaciones repetidas (hover, abrir menú), 160–200 ms para un diálogo, nunca más.
  `prefers-reduced-motion` apaga todo (ya está en el CSS base).

**Restricciones que sobreviven a los cinco estilos (pedido del club):**
1. Turno fijo = relleno naranja (`--orange-soft`) + borde naranja (`--orange-ui`). Siempre.
2. Deuda = marca roja (`.marca-roja`, `.alerta-pago`, `.debe`, `.rojo`) en `--bad`. Siempre.
3. Marca visible: emblema azul `#0B5FB0` + pelota `#F07A0C` en el header en los cinco; el azul y el naranja tienen un rol
   funcional en cada estilo (no son decoración).
4. AA de texto (≥ 4.5:1), 3:1 para bordes de componentes y trazos de estado; claro y oscuro para cada estilo.

**Dos reglas base nuevas, válidas para todos los estilos (corrigen dos fallas de contraste del CSS actual):**
- `--orange-ui`: trazo naranja para UI (borde del fijo, línea "ahora", subrayado de pestaña). En claro es **#BF5A00**
  (≥ 4.0:1 sobre los cinco papeles); en oscuro es igual a `--orange`. `#F07A0C` queda para la pelota del logo, rellenos y la
  etiqueta de hora de la línea "ahora" (con texto `#1D1003`, 6.65:1). El naranja de marca sobre papel claro da 2.5–2.7:1 y no
  sirve como trazo fino.
- En **oscuro**, todo lo que hoy pone blanco sobre `--bad`/`--ok` (`.marca-roja`, `.tabs .badge`, `.toast.err`, `.btn.primary`
  cuando es rojo) usa tinta oscura **#2A0B08** (6.5–8.3:1). Blanco sobre `#FF8C82` da 2.2:1.

---

## 2. Los cinco estilos

| id | Nombre | Referencia | Densidad | Base clara | Base oscura | Mejor para |
|---|---|---|---|---|---|---|
| `chapa` | Chapa | Chapa esmaltada de club de barrio / señalética | media-alta | blanco esmalte frío | esmalte azul noche | Recepción (default) |
| `marcador` | Marcador | Tablero de resultados / gráfica de transmisión | alta | gris estudio | negro de set | Dueño, turno noche |
| `cesped` | Césped | La cancha: césped azul, líneas blancas, vidrio | baja (aire) | celeste vidrio | azul césped profundo | Dueño (cámaras/calor) |
| `bodegon` | Bodegón | Comanda de papel del bodegón "Delicias", libreta de fiado | media | crema papel | madera y luz cálida | Recepción turno largo, caja |
| `galpon` | Galpón | Tinglado de chapa, naranja de seguridad, reflectores | media | gris acero | galpón de noche | Recepción noche, legibilidad máxima |

Todos usan tipografía de Google Fonts. Tres de las cinco familias principales son de fundiciones argentinas
(Archivo, Saira: Omnibus-Type, Buenos Aires; Alegreya: Huerta Tipográfica, Buenos Aires): el "argentinizar" no es sólo copy.

---

### 2.1 `chapa` — Chapa esmaltada

**Concepto.** El cartel de chapa esmaltada azul con letras blancas condensadas que tiene cualquier club, almacén o parada de
Buenos Aires: fondo sólido, borde fino, tipografía angosta, un filete naranja. Nada flota, todo está "atornillado".

**Referencias.** Chapas esmaltadas de clubes y estaciones; señalética de la Línea A; carteles de cancha pintados a mano;
filete porteño reducido a su mínimo (doble línea naranja).

**Por qué encaja.** El logo de Break Point ya es una chapa: círculo azul pleno, tipografía condensada en mayúsculas. El header
azul sólido es el logo extendido a toda la barra. Es sobrio, barrial, serio, y no se parece a ningún SaaS.

**Para quién.** Recepción. Máxima legibilidad, bordes que separan bien en una pantalla barata y con reflejos.

**Tipografía.** Una sola familia variable con eje de ancho.
```
https://fonts.googleapis.com/css2?family=Archivo:ital,wdth,wght@0,62..125,400..900&display=swap
```
| Rol | Fuente | Tamaño / peso / tracking |
|---|---|---|
| `--display` (títulos de pantalla, emblema, reloj) | Archivo `font-stretch:75%` 800 | `.pantalla` 24px, mayúsculas, `letter-spacing:.03em` |
| `--sans` (UI) | Archivo `font-stretch:100%` 400/500/700 | cuerpo 14px / 1.45 |
| Título de card `.card h2` | Archivo 100% 700 | 15px, `letter-spacing:-.005em` |
| Etiquetas (`.kpi .l`, `th`, `.gh .tag`, `.al .lvl`) | Archivo 100% 600 | 11.5px, mayúsculas, `letter-spacing:.08em` |
| KPI `.kpi .v` | Archivo 75% 800 tabular | 34px / 1.0 |
| Reloj `.clock b` | Archivo 75% 700 tabular | 24px, `letter-spacing:.02em` |
| Bloque de turno `.blk .tt` / `.meta` | Archivo 100% 650 / 500 | 12.5px / 11.5px tabular |
Verificar `tnum` en Archivo (test en §3); si no está, numerales en `Archivo` 90% con `font-feature-settings:"tnum"` igual
funciona porque la fuente lo trae; si fallara, usar la mono del estilo `galpon` sólo para reloj y KPI.

**Tokens — claro**
```css
:root[data-estilo="chapa"]{
  --royal:#0B5FB0; --royal-deep:#084A8A; --royal-soft:#E4EEF8; --royal-line:#0B5FB0;
  --orange:#F07A0C; --orange-deep:#9A4A00; --orange-soft:#FFE9D2; --orange-ui:#BF5A00;
  --ok:#1E7A3C; --ok-soft:#DDF3E3; --warn:#8A5200; --warn-soft:#FFF0CC; --bad:#B3261E; --bad-soft:#FBE2E0;
  --ink:#101418; --ink-2:#2B3138; --muted:#5B6570; --line:#7D8893; --line-2:#D5DAE0;
  --paper:#F8F9FA; --cream:#EEF0F2; --panel:#FFFFFF; --overlay:rgba(16,20,24,.55);
  --grid-past:#E9ECEF; --hatch:rgba(16,20,24,.07);
  --header-bg:#0B5FB0; --header-ink:#FFFFFF; --header-muted:#C9DDF3; --accent-line:#F07A0C;
  --texture:none; --r-xs:0; --r-sm:2px; --r-md:3px; --r-lg:4px;
  --shadow-pop:0 14px 32px -12px rgba(16,20,24,.35);
}
```
**Tokens — oscuro** (esmalte azul de noche)
```css
:root[data-estilo="chapa"][data-theme="dark"], /* + media query equivalente, ver §3 */
{
  --royal:#5FA8F0; --royal-deep:#9CC8F6; --royal-soft:#15304D; --royal-line:#5FA8F0;
  --orange:#FF9A3D; --orange-deep:#FFB873; --orange-soft:#3B2512; --orange-ui:#FF9A3D;
  --ok:#62CF8E; --ok-soft:#10311F; --warn:#F2B35A; --warn-soft:#3A2A0E; --bad:#FF8C82; --bad-soft:#44191A;
  --ink:#EEF2F6; --ink-2:#CBD3DC; --muted:#9AA7B5; --line:#5A6B7E; --line-2:#26323F;
  --paper:#0E1620; --cream:#0A1119; --panel:#121C28; --overlay:rgba(0,0,0,.65);
  --grid-past:#121A24; --hatch:rgba(255,255,255,.06);
  --header-bg:#0B5FB0; --header-ink:#FFFFFF; --header-muted:#C9DDF3; --accent-line:#FF9A3D;
}
```
**Contraste (claro / oscuro).** ink/panel 18.5 / 15.3 · ink/cream 16.2 / 16.9 · muted/panel 5.9 / 7.0 · muted/cream 5.2 / 7.7 ·
blanco sobre `--royal` 6.4 (claro); `#0B1A2A` sobre `--royal` 7.0 (oscuro) · header-ink/header-bg 6.4 · royal-deep/royal-soft
7.6 / 7.7 · ink/orange-soft 15.7 / 12.8 · bad/panel 6.5 / 7.6 · line/panel 3.6 / 3.1 · orange-ui/paper 4.3 (claro).

**Forma y superficie.**
- Radios: 0 en cards y grilla, 2px en botones y bloques, 3px en inputs, 4px en diálogo. Chips: 2px (nunca píldora).
- Bordes, no sombras: `.card{border:1px solid var(--line-2);box-shadow:none}`; sólo `dialog`, `.menu` y `.toast` llevan `--shadow-pop`.
- Divisores: 1px `--line-2`; separador de secciones "de chapa": 2px `--ink` con 1px `--accent-line` debajo (sólo en `.card-head` de `.pantalla`).
- Elevación: diálogos con borde 1px `--line` + sombra; sin blur.

**Componentes.**
- **Header** `header.top{background:var(--header-bg);color:var(--header-ink)}`; `.brand .w2{color:var(--header-muted)}`;
  `.emblem` conserva el azul pero con `box-shadow:0 0 0 2px #fff` (anillo blanco, como la chapa dentro de la chapa);
  `.buscar`, `.user-chip`, `.clock b`, `.btn.ghost` del header en blanco sobre azul (`background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.35)`), `.clock b{color:#fff}`.
  Debajo del header: filete doble, `header.top::after{content:"";display:block;height:4px;background:linear-gradient(var(--accent-line) 0 2px,transparent 2px 3px,var(--accent-line) 3px)}`.
- **Tabs** fondo `--paper`, texto `--ink-2` 600; activa: `box-shadow:inset 0 -3px 0 var(--orange-ui)` + una pelota:
  `.tabs button[aria-current="page"]::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--orange);margin-right:6px}`.
- **Días** `.days button{border-radius:2px;border:1px solid transparent}`; activo `border-color:var(--royal);background:var(--royal-soft);color:var(--royal-deep)`;
  `.days b` 15px tabular.
- **Botones** todos radio 2px, altura 38; primary `--royal` + borde `--royal-deep` 1px (bisel de chapa: `box-shadow:inset 0 -2px 0 var(--royal-deep)`);
  secondary (`.btn`) borde `--line`; ghost sin borde, hover `--line-2`; danger texto `--bad`, borde `--line`, hover borde `--bad`.
- **Grilla** `.grid-wrap{border:1px solid var(--line);border-radius:0}`; `.gh{background:var(--cream);border-bottom:2px solid var(--ink)}`;
  `.gh .n` mayúsculas 12.5px `letter-spacing:.06em`; `.tcol span` tabular 11.5px; slot hover `--royal-soft` + texto `--royal-deep`;
  `.blk{border-radius:2px;border-left-width:4px}`; `.blk.fijo{background:var(--orange-soft);border-left-color:var(--orange-ui)}`;
  `.blk.alerta{box-shadow:inset 0 0 0 2px var(--bad)}` (se mantiene); `.blk.finalizada` texto `--muted` sobre `--grid-past` (5.0:1);
  `.now{border-top:2px solid var(--orange-ui)}`, etiqueta de hora fondo `--orange` texto `#1D1003`.
- **Bandeja** `.al{border:1px solid var(--line-2);border-left-width:4px;border-radius:0;background:var(--panel)}`.
- **KPI** `.kpi{border:1px solid var(--line-2);border-top:3px solid var(--royal);border-radius:0}`; `.kpi .l` mayúsculas 11.5px tracking .08em.
- **Cámaras** `.cam{border-radius:0;border:1px solid var(--line)}`; el overlay queda igual (siempre oscuro).
- **Tablas** `th` mayúsculas 11px tracking .08em, `border-bottom:2px solid var(--ink)`; filas `border-bottom:1px solid var(--line-2)`; `td.r` tabular.
- **Diálogos** radio 4px, `border:1px solid var(--line)`; `.dlg-h` con `border-bottom:2px solid var(--ink)`; en 390px hoja inferior radio `6px 6px 0 0` con una "manija" `.dlg-h::before` de 36×4px `--line`.
- **Paleta (#cmdk)** radio 4px; item seleccionado `--royal-soft` con borde izquierdo 3px `--royal`.
- **Toast** fondo `--ink`, radio 2px, borde izquierdo 4px `--orange`; `.toast.err` fondo `--bad` texto blanco (claro) / `#2A0B08` (oscuro).
- **User chip** radio 2px, en header: `background:rgba(255,255,255,.12)`, avatar fondo `--orange` texto `#1D1003`.
- **Reloj** `.clock b` Archivo 75% 700 24px, `color:var(--header-ink)`.
- **Foco** `outline:2px solid var(--orange-ui);outline-offset:2px;box-shadow:0 0 0 4px var(--panel)` (sobre el header azul: outline blanco).

**Movimiento.** `--ease:cubic-bezier(.2,0,0,1)`; hover 100 ms; menú 120 ms sin escala (sólo opacidad); diálogo 160 ms,
desplazamiento 6px; `pulso` 280 ms. Nada rebota: la chapa no rebota.

**Detalle firma.** El **filete doble naranja** bajo el header azul (dos líneas de 2 y 1 px) y la **pelota de 6 px** como marcador
de pestaña activa. Pure CSS, dos reglas.

**Riesgos.** Header azul sólido puede cansar en 8 horas: por eso `.tabs` y `main` son neutros y el azul no vuelve a aparecer en
superficies grandes. Bordes 1px sobre `#EEF0F2` en pantallas malas: por eso `--line` es 3.6:1 y no un gris lavado.

---

### 2.2 `marcador` — Tablero de resultados

**Concepto.** La gráfica de transmisión de un partido: franjas horizontales, score-bug con barra de color por equipo, reloj
grande, bloques con esquinas casi rectas, todo apoyado en negro o gris de estudio. Es denso y rápido: la recepción ve la
agenda como un marcador en vivo; el dueño ve el tablero como un panel de control de transmisión.

**Referencias.** Lower-thirds y score-bugs de transmisiones de pádel y tenis; tableros electrónicos de club con dígitos
grandes; la "torre" de un torneo (Circuito Padel Sur) donde se anotan canchas y horarios en tablones.

**Por qué encaja.** El club organiza un torneo regional y tiene cámaras: el tablero del dueño con 7 cámaras es literalmente un
control de transmisión. El azul y el naranja funcionan como "colores de equipo" en las barras.

**Para quién.** Dueño (tablero, cámaras, calor) y recepción de noche: es el estilo donde el **oscuro es el modo principal**.

**Tipografía.**
```
https://fonts.googleapis.com/css2?family=Saira:wdth,wght@50..125,400..800&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap
```
| Rol | Fuente | Tamaño / peso / tracking |
|---|---|---|
| `--display` (títulos, reloj, KPI, cabecera de cancha) | Saira `font-stretch:75%` 700 | `.pantalla` 24px mayúsculas, tracking .04em |
| `--sans` (UI) | IBM Plex Sans 400/500/600 | cuerpo 14px / 1.4 |
| Título de card | IBM Plex Sans 600 | 14.5px, mayúsculas, tracking .06em |
| Etiquetas | IBM Plex Sans 500 | 11.5px mayúsculas tracking .1em |
| KPI `.kpi .v` | Saira 75% 700 tabular | 36px / 1.0 |
| Reloj `.clock b` | Saira 75% 700 tabular | 26px, `letter-spacing:.04em` |
| Bloque `.blk .tt` / `.meta` | IBM Plex Sans 600 / 500 | 12.5px / 11.5px tabular |
IBM Plex Sans tiene `tnum`. Saira: verificar; si no, KPI/reloj en IBM Plex Sans 700 condensado por `font-stretch` no existe → usar `IBM Plex Mono` 600 como respaldo (agregar `&family=IBM+Plex+Mono:wght@600` sólo si hace falta).

**Tokens — claro** (gris de estudio, header negro)
```css
:root[data-estilo="marcador"]{
  --royal:#0B5FB0; --royal-deep:#08478A; --royal-soft:#DDEAF8; --royal-line:#7FB0E6;
  --orange:#F07A0C; --orange-deep:#A24C00; --orange-soft:#FFE6CC; --orange-ui:#BF5A00;
  --ok:#11733A; --ok-soft:#DCF3E4; --warn:#8D5A00; --warn-soft:#FFF1CF; --bad:#C1121F; --bad-soft:#FCE3E4;
  --ink:#0F1216; --ink-2:#343A42; --muted:#5F6873; --line:#848D98; --line-2:#DDE2E7;
  --paper:#F4F5F7; --cream:#E8EBEF; --panel:#FFFFFF; --overlay:rgba(15,18,22,.6);
  --grid-past:#E6E9ED; --hatch:rgba(15,18,22,.08);
  --header-bg:#0F1216; --header-ink:#FFFFFF; --header-muted:#98A2AE; --accent-line:#F07A0C;
  --texture:repeating-linear-gradient(0deg,rgba(15,18,22,.025) 0 1px,transparent 1px 4px); /* scanline finísima en .cam y header */
  --r-xs:0; --r-sm:2px; --r-md:2px; --r-lg:3px;
  --shadow-pop:0 18px 40px -14px rgba(0,0,0,.5);
}
```
**Tokens — oscuro** (negro de set; es el modo recomendado del estilo)
```css
{
  --royal:#4DA3F5; --royal-deep:#8FC4F8; --royal-soft:#0F2742; --royal-line:#2B5280;
  --orange:#FF8A1F; --orange-deep:#FFB066; --orange-soft:#3A2008; --orange-ui:#FF8A1F;
  --ok:#4CD37D; --ok-soft:#0C2E1A; --warn:#F5B342; --warn-soft:#332406; --bad:#FF6B62; --bad-soft:#3E1413;
  --ink:#F2F4F6; --ink-2:#CBD1D8; --muted:#98A2AE; --line:#6B7682; --line-2:#222932;
  --paper:#0C0F13; --cream:#07090C; --panel:#14181E; --overlay:rgba(0,0,0,.7);
  --grid-past:#101419; --hatch:rgba(255,255,255,.06);
  --header-bg:#07090C; --header-ink:#FFFFFF; --header-muted:#98A2AE; --accent-line:#FF8A1F;
  --texture:repeating-linear-gradient(0deg,rgba(255,255,255,.02) 0 1px,transparent 1px 4px);
}
```
**Contraste.** ink/panel 18.8 / 16.2 · muted/panel 5.7 / 6.9 · muted/cream 4.7 / 7.7 · blanco/royal 6.4 (claro), `#07121F`/royal 7.1 (oscuro) ·
header 18.8 / 19.9 · royal-deep/royal-soft 7.6 / 8.2 · bad/panel 6.2 / 6.4 · ok/ok-soft 5.1 / 7.7 · line/panel 3.4 / 3.9 · orange sobre header negro 6.7.

**Forma y superficie.**
- Radios 0–3px. Cards sin borde ni sombra: se separan por **franjas**: `.card{background:var(--panel);border-radius:0;box-shadow:none;border-top:3px solid var(--line-2)}`.
- Score-bug: todo bloque "de estado" (KPI, `.al`, `.torre .t`, `.blk`) lleva **barra izquierda de 4px** de su color y fondo plano.
- Divisores: 1px `--line-2`; entre secciones del tablero, 3px `--line-2`.
- Elevación: `dialog` y `.menu` con `border:1px solid var(--line-2)` + `--shadow-pop`; `.menu` además `border-top:3px solid var(--orange-ui)`.

**Componentes.**
- **Header** negro `--header-bg`, 56px, `.brand .w1` en Saira 75% 800 20px blanco; `.emblem` igual (azul sobre negro resalta como logo de transmisión);
  `.clock` es un **bug de reloj**: `.clock{background:#000;color:#fff;padding:0 10px;border-left:3px solid var(--orange)}` (en claro también negro: es la firma), `.clock b{color:#fff;font-size:26px}`.
  Botones del header: `.btn.ghost{color:var(--header-ink)}`, hover `rgba(255,255,255,.1)`.
- **Tabs** sobre `--cream`, botones mayúsculas 12.5px tracking .08em; activa `background:var(--panel);box-shadow:inset 0 3px 0 var(--orange-ui)` (la barra va ARRIBA, como pestaña de score-bug); `.badge` en `--bad`, radio 2px, texto blanco (claro) / `#2A0B08` (oscuro).
- **Días** fila de celdas pegadas: `.days{gap:0;border:1px solid var(--line-2)}`, `.days button{border-radius:0;border-right:1px solid var(--line-2)}`;
  activo `background:var(--ink);color:var(--paper)`, en oscuro `background:var(--royal);color:#07121F`.
- **Botones** radio 2px; primary `--royal`; `.btn.accent` fondo `--royal-soft` texto `--royal-deep`; ghost mayúsculas chicas; danger como en base.
- **Grilla** `.grid-wrap{border:0;border-top:3px solid var(--line-2);border-radius:0}`; `.gh{background:var(--cream);min-height:48px}`; `.gh .n` Saira 75% 700 15px mayúsculas;
  `.tcol span` Saira 75% 600 12px; `.slot.hora{border-top-color:var(--line)}`; slot hover `--royal-soft`;
  `.blk{border-radius:2px;border-left-width:4px;background:var(--panel);box-shadow:inset 0 0 0 1px var(--line-2)}`; reservada barra `--royal`, en cancha barra `--ok` y fondo `--ok-soft`,
  **fijo** barra `--orange-ui` y fondo `--orange-soft`, finalizada barra `--line`, bloqueo rayado como base;
  `.blk.alerta{box-shadow:inset 0 0 0 2px var(--bad)}`; `.now{border-top:2px solid var(--orange-ui)}` con etiqueta **negra**: `.now::before{background:#000;color:var(--orange);border-radius:0;padding:2px 6px;font-family:var(--display);font-size:11px}`.
- **Bandeja** `.al{background:var(--panel);border-left-width:4px;border-radius:0;box-shadow:inset 0 0 0 1px var(--line-2)}`; `.lvl` mayúsculas tracking .1em.
- **KPI** `.kpi{border-radius:0;border-left:4px solid var(--royal);box-shadow:none;background:var(--cream)}`; el segundo y cuarto KPI podrían alternar barra `--orange` → no: sólo azul; la variedad la da el valor.
- **Cámaras** `.cam{border-radius:0;border:1px solid var(--line-2)}`; `.cam::after{content:"";position:absolute;inset:0;background:var(--texture);pointer-events:none}` (scanline);
  `.cam .live` ya tiene el punto rojo; dejarlo.
- **Tablas** `th{background:var(--cream);text-transform:uppercase;letter-spacing:.08em;font-size:11px}`; filas alternadas `tr:nth-child(even) td{background:color-mix(in oklab,var(--cream) 50%,transparent)}`.
- **Diálogos** radio 3px, `border-top:4px solid var(--orange-ui)`; móvil: hoja con radio 0 y la misma barra superior naranja (sirve de manija visual).
- **Paleta** `#cmdk{border-top:4px solid var(--royal)}`; item seleccionado `background:var(--royal);color:#fff` (claro) / `color:#07121F` (oscuro); `.g` mayúsculas.
- **Toast** fondo `#000`, borde izquierdo 4px `--orange`, radio 0; `.toast.err` fondo `--bad`.
- **User chip** radio 0, fondo `rgba(255,255,255,.08)` en header; avatar cuadrado 32px radio 2px `--orange` texto `#1D1003`.
- **Foco** `outline:2px solid var(--orange-ui);outline-offset:1px`.

**Movimiento.** `--ease:cubic-bezier(.3,0,.1,1)`; hover 80 ms; menú 100 ms "corte" (opacity sólo); diálogo 140 ms desde `translateY(4px)`;
la línea `.now` no se anima nunca. Los cambios de estado de un bloque usan `pulso` 240 ms con el color del estado.

**Detalle firma.** El **reloj como bug de transmisión**: bloque negro con barra naranja a la izquierda y dígitos Saira condensados,
idéntico en claro y oscuro. Y la etiqueta de la línea "ahora" en negro con hora naranja, como un lower-third.

**Riesgos.** El claro puede verse "frío y corporativo" si se abusa del negro: el negro sólo vive en header, reloj, toast y etiqueta de ahora.
Franjas sin radios + mucha mayúscula cansan en texto largo: mayúsculas sólo en etiquetas (≤ 13px) y títulos, nunca en cuerpo ni en nombres de clientes.

---

### 2.3 `cesped` — La cancha

**Concepto.** Lo que se ve desde la recepción de Break Point: césped sintético azul, líneas blancas pintadas, paredes de vidrio
y estructura negra fina. Superficie clara, casi sin cajas: las cosas se separan con **líneas blancas o celestes de 1–2 px**, como las
líneas de la cancha. Mucho aire, bloques de turno "pintados" con color pleno y el nombre en blanco.

**Referencias.** Cancha panorámica de pádel (césped azul, líneas blancas, vidrio templado, estructura negra); planos de
arquitectura deportiva; marcación de piso de un polideportivo.

**Por qué encaja.** Es la foto del club. El azul de marca es el césped; el naranja es la pelota sobre el césped (y por eso
"fijo" y "ahora" saltan a la vista sin esfuerzo).

**Para quién.** Dueño (cámaras y mapa de calor se ven naturales sobre este fondo) y clientes en demo: es el más "lindo" para
mostrar. También sirve en recepción, pero con menos densidad que `chapa`.

**Tipografía.**
```
https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,400..800&family=Work+Sans:wght@400;500;600;700&display=swap
```
| Rol | Fuente | Tamaño / peso / tracking |
|---|---|---|
| `--display` | Bricolage Grotesque `font-stretch:80%` 700, `font-optical-sizing:auto` | `.pantalla` 26px, Sentence case (no mayúsculas), tracking -.01em |
| `--sans` | Work Sans 400/500/600 | cuerpo 14px / 1.45 |
| Título de card | Bricolage 100% 600 | 16px tracking -.01em |
| Etiquetas | Work Sans 600 | 12px, Sentence case, color `--muted` |
| KPI `.kpi .v` | Bricolage 80% 700 tabular | 36px / 1.0 |
| Reloj `.clock b` | Bricolage 80% 700 tabular | 24px |
| Bloque `.blk .tt` / `.meta` | Work Sans 600 / 500 | 12.5px / 11.5px tabular |
Work Sans tiene `tnum`. Bricolage: verificar; si falla, KPI/reloj en Work Sans 700 (36/24px).

**Tokens — claro** (vidrio y cielo)
```css
:root[data-estilo="cesped"]{
  --royal:#0B5FB0; --royal-deep:#0A4C8E; --royal-soft:#E3EEFA; --royal-line:#9DC0E8;
  --orange:#F07A0C; --orange-deep:#9C4B00; --orange-soft:#FFEAD6; --orange-ui:#BF5A00;
  --ok:#166B3E; --ok-soft:#DFF4E6; --warn:#875400; --warn-soft:#FFF0D0; --bad:#B0251C; --bad-soft:#FBE4E2;
  --ink:#0F1B2D; --ink-2:#2E3D52; --muted:#5A6B82; --line:#8395AB; --line-2:#E1E8F0;
  --paper:#F3F6FA; --cream:#E9EEF4; --panel:#FFFFFF; --overlay:rgba(15,27,45,.5);
  --grid-past:#EBEFF4; --hatch:rgba(15,27,45,.06);
  --court:#1766C2; --court-line:#FFFFFF; --header-bg:#FFFFFF; --header-ink:#0F1B2D; --accent-line:#0B5FB0;
  --texture:linear-gradient(90deg,rgba(255,255,255,.9) 1px,transparent 1px) 0 0/48px 100%,linear-gradient(0deg,rgba(255,255,255,.9) 1px,transparent 1px) 0 0/100% 48px; /* cuadrícula blanca de "líneas de cancha" sobre --cream, sólo en body */
  --r-xs:3px; --r-sm:4px; --r-md:6px; --r-lg:12px;
  --shadow-pop:0 20px 50px -20px rgba(15,27,45,.35);
}
```
**Tokens — oscuro** (césped azul profundo bajo las luces)
```css
{
  --royal:#63ADF4; --royal-deep:#9DCBF8; --royal-soft:#15355A; --royal-line:#2C5F94;
  --orange:#FF9A3D; --orange-deep:#FFB873; --orange-soft:#3C2510; --orange-ui:#FF9A3D;
  --ok:#5CD28E; --ok-soft:#0F3322; --warn:#F3B553; --warn-soft:#3A2A0C; --bad:#FF8A80; --bad-soft:#43191A;
  --ink:#EAF0F8; --ink-2:#C5D1E0; --muted:#93A5BC; --line:#5F7A9C; --line-2:#1C2F4A;
  --paper:#0B1626; --cream:#071020; --panel:#122240; --overlay:rgba(0,0,0,.65);
  --grid-past:#0F1D33; --hatch:rgba(255,255,255,.05);
  --court:#1766C2; --court-line:#DCE8F7; --header-bg:#0B1626; --header-ink:#EAF0F8; --accent-line:#63ADF4;
  --texture:linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px) 0 0/48px 100%,linear-gradient(0deg,rgba(255,255,255,.04) 1px,transparent 1px) 0 0/100% 48px;
}
```
**Contraste.** ink/panel 17.3 / 13.8 · muted/panel 5.4 / 6.3 · muted/cream 4.7 / 7.6 · blanco/royal 6.4 · `#07121F`/royal 7.9 (oscuro) ·
blanco sobre `--court` 5.7 (nombres en bloques pintados) · royal-deep/royal-soft 7.3 / 7.3 · bad/panel 6.7 / 6.9 · line/panel 3.1 / 3.6.

**Forma y superficie.**
- Radios chicos y distintos: bloques 3px, botones 6px, cards 12px, diálogo 12px (móvil 16px arriba). Nunca píldora salvo `.marca-roja` (que es un sello, se mantiene).
- **Sin sombra en cards** ni bordes grises: `.card{border:0;box-shadow:none;background:var(--panel)}` y se apoyan sobre `--cream` con la cuadrícula blanca (`body{background:var(--texture),var(--cream)}`).
- Divisores "de cancha": `hr`, `.card-head`, `.dlg-f` usan la **línea con T de saque**: `border-top:2px solid var(--line-2)` y un `::after` de 2×10px centrado (ver firma).
- Elevación sólo en `dialog`/`.menu`/`.toast` con `--shadow-pop` (sombra azulada, no negra).

**Componentes.**
- **Header** blanco (claro) / `--paper` (oscuro), `border-bottom:2px solid var(--line-2)`; `.brand .w1` Bricolage 80% 800 20px; `.emblem` igual.
  `.clock b` Bricolage 24px `color:var(--ink)`; `.buscar` con borde `--line-2` y radio 6px.
- **Tabs** fondo `--paper`, texto `--ink-2` 500; activa `color:var(--royal-deep)` + subrayado de 3px `--royal` con esquinas 2px; el badge rojo igual.
- **Días** botones radio 6px; activo **pintado**: `background:var(--court);color:#fff` (claro y oscuro; 5.7:1), `small` en `rgba(255,255,255,.85)`.
- **Botones** radio 6px; primary `--royal` blanco; accent `--royal-soft`/`--royal-deep`; ghost hover `--cream`; danger idéntico a base.
- **Grilla (la cancha)** `.grid-wrap{border:2px solid var(--line-2);border-radius:8px;background:var(--paper)}`;
  `.gh{background:var(--paper);border-bottom:2px solid var(--line-2)}`; `.gh .n` Bricolage 100% 700 14px; `.gh .tag` 11px `--muted`;
  `.tcol{border-right:2px solid var(--line-2)}`, `.ccol{border-right:2px solid var(--line-2)}` (**líneas de cancha, blancas en oscuro**: `--line-2` ya es el tono); `.slot{border-top:1px solid color-mix(in oklab,var(--line-2) 60%,transparent)}`, `.slot.hora{border-top:2px solid var(--line-2)}`;
  hover de slot `background:var(--royal-soft)`;
  **bloques pintados**: `.blk{border-radius:3px;border-left:0;background:var(--court);color:#fff;padding:6px 9px}`, `.blk .meta{color:#EAF2FB}` (5.0:1 sobre `--court`; no usar alpha, que baja a 4.4),
  `.blk .debe{color:#FFEAE7;font-weight:800}` sobre `--court` (4.9:1) — el rojo de deuda acá es un **punto rojo `.alerta-pago` de 8px con anillo blanco** `box-shadow:0 0 0 2px #fff` + el texto `debe $` en `#FFEAE7` (el rojo pleno sobre azul no llega a 3:1, por eso el punto lleva anillo);
  `.blk.en_cancha{background:var(--ok);color:#fff}` (claro: `#166B3E`, 6.6:1; `.meta` en `#EAF2FB` también pasa) / en oscuro `background:var(--ok-soft);color:var(--ink);border-left:4px solid var(--ok)`;
  **`.blk.fijo{background:var(--orange-soft);color:var(--ink);border-left:4px solid var(--orange-ui)}`** (siempre naranja, claro y oscuro; `.meta` en `--muted` 4.7:1);
  `.blk.finalizada{background:var(--grid-past);color:var(--muted)}`; `.blk.alerta{box-shadow:0 0 0 2px #fff,0 0 0 4px var(--bad)}` (anillo doble, como línea de falta); bloqueo rayado como base;
  `.now{border-top:2px solid var(--orange-ui)}`, etiqueta `--orange` con texto `#1D1003`, radio 3px.
- **Bandeja** `.al{background:var(--paper);border:0;border-left:3px solid;border-radius:3px 8px 8px 3px}` (como base, radios chicos).
- **KPI** `.kpi{border:0;box-shadow:none;background:var(--paper);border-radius:8px;border-top:2px solid var(--line-2)}`; valor Bricolage 36px; el primer KPI (ocupación) puede llevar `border-top-color:var(--court)`.
- **Cámaras** `.cam{border-radius:6px;border:2px solid var(--line-2)}`; grilla de cámaras con `gap:12px`.
- **Tablas** `th{font-weight:600;color:var(--muted);border-bottom:2px solid var(--line-2)}`; filas con `border-bottom:1px solid var(--line-2)`.
- **Diálogos** radio 12px, `border:2px solid var(--line-2)`; móvil radio `16px 16px 0 0` con manija 40×4 `--line-2`.
- **Paleta** radio 12px, item seleccionado `--royal-soft` + `--royal-deep`; `.g` 11px.
- **Toast** fondo `--ink` (claro) / `--panel` con borde `--line` (oscuro); radio 8px; acción en `--orange`.
- **User chip** radio 8px, `background:var(--paper)`, avatar redondo `--court` blanco.
- **Foco** `outline:2px solid var(--royal);outline-offset:2px;box-shadow:0 0 0 4px var(--panel)` (como base).

**Movimiento.** `--ease:cubic-bezier(.22,.61,.36,1)` (el actual); hover 120 ms; slot hover 90 ms; menú 120 ms `scale(.98)`;
diálogo 180 ms; `pulso` 320 ms en `--court`. Es el estilo con más "suavidad", pero sin pasar de 200 ms.

**Detalle firma.** La **línea con T de saque** como divisor: 
`.card-head{border-bottom:2px solid var(--line-2);position:relative;padding-bottom:10px}` +
`.card-head::after{content:"";position:absolute;left:50%;bottom:-2px;width:2px;height:10px;background:var(--line-2);transform:translateX(-50%)}`.
Y los turnos como **bloques pintados** sobre el césped con nombre en blanco.

**Riesgos.** Bloques azules plenos uno al lado del otro pierden distinción entre canchas: por eso las columnas tienen línea de 2px y los
bloques `left:4px;right:4px` (en vez de 3). En oscuro, `--court` sobre `--panel` tiene poco contraste de borde: agregar `box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)` a `.blk`.
La cuadrícula del fondo debe ser casi invisible (alpha .9 blanco sobre `#E9EEF4` = apenas): si molesta, `--texture:none`.

---

### 2.4 `bodegon` — Comanda del bodegón

**Concepto.** El papel: la comanda del bodegón "Delicias", la libreta de fiado del almacén (que es exactamente la cuenta
corriente del club), el talonario de caja. Crema cálida, serif con carácter para los títulos, sans humanista para la UI,
líneas finas sepia, **líneas de puntos entre concepto y precio** como en una carta. Cálido para un turno de 8 horas.

**Referencias.** Cartas y comandas de bodegón porteño; libreta de fiado; talonario de remito; sello de goma "DEBE";
tipografía Alegreya (Huerta Tipográfica, Buenos Aires).

**Por qué encaja.** Break Point tiene bodegón propio y vende con cuenta corriente: el flujo de "cuentas abiertas" y "cobrar"
es el corazón de la recepción, y el papel es el lenguaje natural de cobrar y anotar. Es sobrio, de amigos, y nadie lo confunde con un SaaS.

**Para quién.** Recepción (turno largo, luz baja: el crema cansa menos que el blanco) y la caja/buffet.

**Tipografía.**
```
https://fonts.googleapis.com/css2?family=Alegreya:ital,wght@0,500;0,700;0,800;1,500&family=Alegreya+Sans:ital,wght@0,400;0,500;0,700;0,800;1,400&display=swap
```
| Rol | Fuente | Tamaño / peso / tracking |
|---|---|---|
| `--display` | Alegreya 700 | `.pantalla` 26px, Sentence case, tracking -.005em |
| `--sans` | Alegreya Sans 400/500/700 | cuerpo **15px** / 1.45 (Alegreya Sans es chica de ojo: +1px respecto a los otros estilos) |
| Título de card | Alegreya 700 | 18px |
| Etiquetas | Alegreya Sans 700 | 12px, mayúsculas, tracking .1em, `--muted` |
| KPI `.kpi .v` | Alegreya 800 tabular lining | 36px / 1.0 |
| Reloj `.clock b` | Alegreya Sans 800 tabular lining | 24px |
| Bloque `.blk .tt` / `.meta` | Alegreya Sans 700 / 500 | 13.5px / 12px tabular lining |
**Obligatorio:** `html[data-estilo="bodegon"]{font-variant-numeric:lining-nums tabular-nums}` — Alegreya y Alegreya Sans traen
numerales *oldstyle* por defecto (bailan sobre la línea base) y eso en una caja es inaceptable. Ambas tienen `lnum` y `tnum`.

**Tokens — claro** (papel crema)
```css
:root[data-estilo="bodegon"]{
  --royal:#0B5FB0; --royal-deep:#083F78; --royal-soft:#E7EDF4; --royal-line:#A5BFDB;
  --orange:#F07A0C; --orange-deep:#8F4400; --orange-soft:#FBE7D0; --orange-ui:#BF5A00;
  --ok:#2E6B3A; --ok-soft:#E3EFDC; --warn:#8A5600; --warn-soft:#F7E8C6; --bad:#A6261B; --bad-soft:#F6DFDA;
  --ink:#2A1F14; --ink-2:#4A3D2F; --muted:#75654F; --line:#967F5E; --line-2:#E9DFCC;
  --paper:#FBF6EC; --cream:#F1E9DA; --panel:#FFFCF5; --overlay:rgba(42,31,20,.5);
  --grid-past:#EFE7D8; --hatch:rgba(42,31,20,.07);
  --header-bg:#FBF6EC; --header-ink:#2A1F14; --accent-line:#F07A0C;
  --texture:repeating-linear-gradient(0deg,rgba(42,31,20,.035) 0 1px,transparent 1px 3px),repeating-linear-gradient(90deg,rgba(255,255,255,.25) 0 1px,transparent 1px 2px); /* grano de papel; sólo en body */
  --r-xs:3px; --r-sm:4px; --r-md:6px; --r-lg:8px;
  --shadow-pop:0 16px 40px -16px rgba(42,31,20,.45);
}
```
**Tokens — oscuro** (bodegón de noche: madera, luz cálida)
```css
{
  --royal:#6FB0F0; --royal-deep:#A4CCF5; --royal-soft:#192E45; --royal-line:#2E5276;
  --orange:#FFA04A; --orange-deep:#FFBD7E; --orange-soft:#3E2611; --orange-ui:#FFA04A;
  --ok:#7BCB8B; --ok-soft:#1A3322; --warn:#EFB75D; --warn-soft:#3A2A10; --bad:#FF8F85; --bad-soft:#46201C;
  --ink:#F3EADB; --ink-2:#D8CBB7; --muted:#AE9E88; --line:#7A664F; --line-2:#30271D;
  --paper:#1B1510; --cream:#140F0B; --panel:#231B14; --overlay:rgba(0,0,0,.65);
  --grid-past:#1F1812; --hatch:rgba(255,255,255,.05);
  --header-bg:#1B1510; --header-ink:#F3EADB; --accent-line:#FFA04A;
  --texture:repeating-linear-gradient(0deg,rgba(255,255,255,.02) 0 1px,transparent 1px 3px);
}
```
**Contraste.** ink/panel 15.7 / 14.2 · ink/cream 13.3 / 16.0 · muted/panel 5.5 / 6.5 · muted/cream 4.7 / 7.3 · blanco/royal 6.4 · `#0B1A2A`/royal 7.7 (oscuro) ·
royal-deep/royal-soft 8.9 / 8.3 · bad/panel 7.0 / 7.7 · bad/bad-soft 5.7 / 6.4 · line/panel 3.7 / 3.1 · muted/orange-soft 4.7 · orange-ui/cream 3.7.

**Forma y superficie.**
- Radios 3–8px (comanda: esquinas apenas redondeadas). Cards `border:1px solid var(--line-2);border-radius:8px;box-shadow:none` sobre `--cream` con grano (`body{background:var(--texture),var(--cream)}`).
- Divisores **sepia 1px** `--line-2`; los totales con **doble raya** de contador: `.kv .tot{border-top:1px solid var(--line);box-shadow:0 -3px 0 -2px var(--line)}` (dos líneas finas).
- Líneas de puntos en `.kv`: `.kv dt{background:radial-gradient(circle,var(--line) 1px,transparent 1.2px) bottom/4px 2px repeat-x;padding-bottom:2px}` (leader de carta; el `dd` queda alineado a la derecha, tabular).
- Elevación: `dialog` radio 8px, `border:1px solid var(--line-2)`, `--shadow-pop` (sombra cálida); `.menu` igual.

**Componentes.**
- **Header** `--paper` con `border-bottom:1px solid var(--line)` y una segunda raya a 3px (doble filete sepia); `.brand .w1` Alegreya 800 20px; `.w2` Alegreya Sans 700 11px tracking .22em `--muted`;
  `.emblem` igual (es la única superficie azul plena del header: funciona como sello). `.clock b` Alegreya Sans 800 24px `--ink`.
- **Tabs** texto Alegreya Sans 700 14px; activa: `color:var(--ink);box-shadow:inset 0 -2px 0 var(--orange-ui)`; hover `--line-2`.
- **Días** `.days button{border-radius:4px;border:1px solid transparent}`; activo `border-color:var(--line);background:var(--panel);color:var(--ink)` con `small` en `--orange-deep` (la fecha "marcada con lápiz naranja").
- **Botones** radio 4px; primary `--royal` blanco; accent `--royal-soft`/`--royal-deep`; secondary borde `--line` sobre `--panel`; danger texto `--bad`; ghost hover `--line-2`.
- **Grilla** `.grid-wrap{border:1px solid var(--line-2);border-radius:6px;background:var(--paper)}` con **renglones de cuaderno**: `.slot{border-top:1px solid var(--line-2)}`, `.slot.hora{border-top-color:var(--line)}`;
  `.gh{background:var(--cream);border-bottom:1px solid var(--line)}`; `.gh .n` Alegreya 700 15px; `.tcol span` Alegreya Sans 700 12px `--muted`;
  slot hover `--royal-soft`/`--royal-deep`; `.blk{border-radius:3px;border-left:3px solid var(--royal);background:var(--panel);box-shadow:inset 0 0 0 1px var(--line-2)}`;
  en cancha `--ok-soft`/`--ok`; **fijo `--orange-soft`/`--orange-ui`**; finalizada `--grid-past`/`--line` texto `--muted` (4.6:1); bloqueo rayado como base;
  `.blk.alerta{box-shadow:inset 0 0 0 2px var(--bad)}`; `.now{border-top:2px solid var(--orange-ui)}`, etiqueta `--orange`/`#1D1003`.
- **Deuda (firma)** `.marca-roja` como **sello de goma**: `border:2px solid var(--bad);color:var(--bad);background:transparent;border-radius:3px;text-transform:uppercase;letter-spacing:.08em;font-weight:800;transform:rotate(-3deg);padding:1px 7px` (claro y oscuro; el texto es `--bad` sobre `--panel`: 7.0 / 7.7).
  `.blk .debe` y `.rojo` en `--bad` 800, igual que base.
- **Bandeja** `.al{background:var(--panel);border:1px solid var(--line-2);border-left:3px solid;border-radius:4px}`; `.al.alta .lvl` en `--bad` con el mismo sello chico.
- **KPI** `.kpi{background:var(--panel);border:1px solid var(--line-2);border-radius:6px;box-shadow:none}`; `.kpi .l` mayúsculas 12px tracking .1em; `.kpi .v` Alegreya 800 36px.
- **Cámaras** `.cam{border-radius:4px;border:1px solid var(--line)}` (las cámaras siguen oscuras; el borde sepia las "enmarca").
- **Tablas** `th` Alegreya Sans 700 12px mayúsculas tracking .08em `--muted`, `border-bottom:1px solid var(--line)`; `td` 14.5px; totales con doble raya.
- **Diálogos** radio 8px; `.dlg-h h2` Alegreya 700 22px; `.dlg-f` con doble raya arriba; móvil radio `12px 12px 0 0`, manija 36×3 `--line`.
- **Paleta** radio 8px; input Alegreya Sans 17px; item seleccionado `--royal-soft`/`--royal-deep`.
- **Toast** fondo `--ink` (claro) / `--panel` con borde `--line` (oscuro); radio 4px; acción en `--orange` (claro) / `--orange-deep` (oscuro).
- **User chip** radio 4px borde `--line-2` fondo `--panel`; avatar redondo `--royal` blanco (es el "sello" del usuario).
- **Foco** `outline:2px solid var(--royal);outline-offset:2px;box-shadow:0 0 0 4px var(--panel)`.

**Movimiento.** `--ease:cubic-bezier(.25,.1,.25,1)` (ease clásico); hover 120 ms; menú 140 ms; diálogo 180 ms; `pulso` 300 ms en `--orange`.
Sin escalas; el papel no se infla.

**Detalle firma.** Las **líneas de puntos de la cuenta** (`.kv dt`) + el **sello DEBE rotado -3°** en la marca roja + la **doble raya de total**.
Tres reglas CSS, cero imágenes.

**Riesgos.** Serif en pantalla barata a 13px se rompe: Alegreya sólo en títulos ≥ 15px y KPI; todo lo chico es Alegreya Sans.
Numerales oldstyle: resuelto con `lining-nums` global (QA obligatorio). El crema sobre crema puede quedar "sucio": `--panel` es casi blanco (`#FFFCF5`) y las cards llevan borde 1px.

---

### 2.5 `galpon` — Tinglado de chapa

**Concepto.** El galpón industrial que techa las canchas: chapa acanalada gris, estructura metálica negra, **naranja de seguridad**
para todo lo que hay que ver (ahora, fijo, atención), reflectores de noche. Tipografía condensada industrial para títulos y una
sans **hiperlegible** (diseñada para baja visión) para todo el cuerpo: es el estilo que mejor se lee a las 2 de la mañana.

**Referencias.** Tinglados y galpones de chapa de la zona sur del conurbano; señalética de obra y de seguridad industrial (negro/naranja);
placas de identificación metálicas; la fuente Atkinson Hyperlegible (Braille Institute).

**Por qué encaja.** Break Point es un club de chapa y estructura, no de mármol. El naranja de marca y el naranja de seguridad
son casi el mismo color, así que la marca y la función coinciden. Sobrio, de laburo, sin vueltas.

**Para quién.** Recepción de noche y gente con la vista cansada; también el dueño si prefiere algo neutro.

**Tipografía.**
```
https://fonts.googleapis.com/css2?family=Oswald:wght@400..700&family=Atkinson+Hyperlegible+Next:wght@400..800&family=Atkinson+Hyperlegible+Mono:wght@400..700&display=swap
```
| Rol | Fuente | Tamaño / peso / tracking |
|---|---|---|
| `--display` | Oswald 600 | `.pantalla` 24px, mayúsculas, tracking .05em |
| `--sans` | Atkinson Hyperlegible Next 400/700 | cuerpo 14.5px / 1.45 |
| Título de card | Atkinson Next 700 | 15px |
| Etiquetas | Oswald 500 | 12px mayúsculas tracking .12em `--muted` |
| KPI `.kpi .v` | Atkinson Hyperlegible Mono 700 | 32px / 1.0 (mono = tabular por naturaleza) |
| Reloj `.clock b` | Atkinson Mono 700 | 24px |
| Horas de grilla `.tcol span`, `.blk .meta` | Atkinson Mono 500 | 11.5px |
| Bloque `.blk .tt` | Atkinson Next 700 | 13px |
Las tres familias están en Google Fonts (Atkinson Hyperlegible Next y Mono desde 2025). La mono evita la duda de `tnum`.

**Tokens — claro** (gris acero)
```css
:root[data-estilo="galpon"]{
  --royal:#0B5FB0; --royal-deep:#084A8A; --royal-soft:#DFE9F4; --royal-line:#7FA6D0;
  --orange:#F07A0C; --orange-deep:#9A4A00; --orange-soft:#FFE4CC; --orange-ui:#BF5A00;
  --ok:#176A36; --ok-soft:#DCEFE2; --warn:#825000; --warn-soft:#FBEBC9; --bad:#B21E1E; --bad-soft:#F8DEDE;
  --ink:#121416; --ink-2:#2F3337; --muted:#5C636A; --line:#80878E; --line-2:#D3D7DB;
  --paper:#F2F3F4; --cream:#E6E8EA; --panel:#FBFBFB; --overlay:rgba(18,20,22,.6);
  --grid-past:#E4E7EA; --hatch:rgba(18,20,22,.08);
  --header-bg:#2A2E32; --header-ink:#FFFFFF; --header-muted:#B8BEC4; --accent-line:#F07A0C;
  --texture:repeating-linear-gradient(90deg,rgba(18,20,22,.035) 0 2px,transparent 2px 16px); /* chapa acanalada, sólo body */
  --r-xs:0; --r-sm:2px; --r-md:2px; --r-lg:2px;
  --shadow-pop:0 16px 36px -12px rgba(0,0,0,.45);
}
```
**Tokens — oscuro** (galpón bajo reflectores)
```css
{
  --royal:#5EA6EE; --royal-deep:#99C5F4; --royal-soft:#152B42; --royal-line:#2E5579;
  --orange:#FF8F2A; --orange-deep:#FFB36B; --orange-soft:#3B2108; --orange-ui:#FF8F2A;
  --ok:#5ACC86; --ok-soft:#0F301F; --warn:#F0B24E; --warn-soft:#352609; --bad:#FF7A70; --bad-soft:#40161A;
  --ink:#F0F2F3; --ink-2:#CDD2D6; --muted:#9BA3AA; --line:#6E777F; --line-2:#2A2F34;
  --paper:#141618; --cream:#0E1012; --panel:#1B1E21; --overlay:rgba(0,0,0,.7);
  --grid-past:#181B1E; --hatch:rgba(255,255,255,.06);
  --header-bg:#0E1012; --header-ink:#F0F2F3; --header-muted:#9BA3AA; --accent-line:#FF8F2A;
  --texture:repeating-linear-gradient(90deg,rgba(255,255,255,.025) 0 2px,transparent 2px 16px);
}
```
**Contraste.** ink/panel 17.8 / 14.9 · muted/panel 5.9 / 6.6 · muted/cream 5.0 / 7.5 · blanco/royal 6.4 · `#0B1A2A`/royal 6.8 (oscuro) ·
header-ink/header-bg 13.7 / 17.0 · royal-deep/royal-soft 7.3 / 8.0 · bad/panel 6.6 / 6.6 · ok/ok-soft 5.6 / 7.1 · line/panel 3.5 / 3.7 · orange-ui/paper 4.0.

**Forma y superficie.**
- Radio 0–2px en todo. Cards `border:1px solid var(--line-2);border-radius:2px;box-shadow:none`.
- **Remaches**: `.card{position:relative}` + `.card::before,.card::after{content:"";position:absolute;top:6px;width:4px;height:4px;border-radius:50%;background:var(--line)}` (`::before{left:6px}` `::after{right:6px}`). Sólo en `.card`, no en KPI ni `.al`.
- Divisores: 1px `--line-2`; **rayas de seguridad** (negro/naranja a 45°) sólo para `.ccol.mant` y `.blk.bloqueo`: `repeating-linear-gradient(45deg,var(--orange-soft) 0 8px,var(--hatch) 8px 16px)`.
- Elevación: `dialog`/`.menu` con `border:1px solid var(--line)` + `--shadow-pop`; `.menu` con `border-top:3px solid var(--orange-ui)`.

**Componentes.**
- **Header** gris acero `--header-bg` (claro) / casi negro (oscuro), texto blanco; `.brand .w1` Oswald 600 20px tracking .06em; `.w2` Oswald 400 11px tracking .25em `--header-muted`;
  `.emblem` igual (azul sobre acero), con `box-shadow:0 0 0 2px var(--orange)` (anillo naranja fino: la pelota alrededor del escudo). `.clock b` Atkinson Mono 700 24px blanco.
  Franja de seguridad bajo el header: `header.top::after{content:"";display:block;height:3px;background:repeating-linear-gradient(45deg,var(--orange) 0 10px,#1D1003 10px 20px)}` (se ve como cinta de obra; en 390px también).
- **Tabs** Oswald 500 14px mayúsculas tracking .08em; activa `color:var(--ink);box-shadow:inset 0 -3px 0 var(--orange-ui)`; `.badge` radio 2px.
- **Días** `.days button{border-radius:2px;border:1px solid var(--line-2);background:var(--panel)}`; activo `background:var(--ink);color:var(--paper)` (claro) / `background:var(--orange);color:#1D1003` (oscuro: el día "iluminado").
- **Botones** radio 2px, altura 40 (dedos cansados): primary `--royal` blanco con `box-shadow:inset 0 -2px 0 var(--royal-deep)`; accent `--royal-soft`/`--royal-deep`; secondary borde `--line`; danger texto `--bad` borde `--line`; ghost mayúsculas Oswald 500 13px.
- **Grilla** `.grid-wrap{border:1px solid var(--line);border-radius:0}`; `.gh{background:var(--cream);border-bottom:2px solid var(--ink)}`; `.gh .n` Oswald 600 15px mayúsculas tracking .06em;
  `.tcol span` Atkinson Mono 11.5px; `.slot.hora{border-top:1px solid var(--line)}`; hover `--royal-soft`;
  `.blk{border-radius:2px;border-left:4px solid var(--royal);background:var(--royal-soft)}`; en cancha `--ok-soft`/`--ok`; **fijo `--orange-soft`/`--orange-ui`**; finalizada `--grid-past`/`--line` `--muted` (4.9:1);
  `.blk.alerta{box-shadow:inset 0 0 0 2px var(--bad)}`; `.now{border-top:3px solid var(--orange-ui)}` (más gruesa: línea de seguridad), etiqueta `--orange`/`#1D1003` radio 0, Oswald 600.
- **Bandeja** `.al{background:var(--panel);border:1px solid var(--line-2);border-left:4px solid;border-radius:2px}`; `.al.alta` además `background:var(--bad-soft)`.
- **KPI** `.kpi{background:var(--panel);border:1px solid var(--line-2);border-radius:2px;box-shadow:none}` + placa: `.kpi .l` Oswald 500 12px mayúsculas tracking .12em; `.kpi .v` Atkinson Mono 700 32px.
- **Cámaras** `.cam{border-radius:0;border:2px solid var(--line)}`; `.cam .live` Oswald tracking .12em.
- **Tablas** `th` Oswald 500 12px mayúsculas tracking .1em `--muted`, `border-bottom:2px solid var(--ink)`; `td.r` Atkinson Mono 13.5px.
- **Diálogos** radio 2px, `border:1px solid var(--line)`; `.dlg-h h2` Oswald 600 22px mayúsculas; móvil hoja radio 0 con la cinta de obra de 3px arriba como manija.
- **Paleta** radio 2px; input Atkinson Next 17px; item seleccionado `--ink`/`--paper` (claro) / `--orange-soft`/`--ink` (oscuro).
- **Toast** fondo `--ink` radio 2px borde izquierdo 4px `--orange`; `.toast.err` fondo `--bad` texto blanco (claro) / `#2A0B08` (oscuro).
- **User chip** radio 2px, fondo `rgba(255,255,255,.1)` en header; avatar cuadrado radio 2px `--orange` texto `#1D1003`.
- **Foco** `outline:3px solid var(--orange-ui);outline-offset:2px` (foco grueso: accesibilidad primero).

**Movimiento.** `--ease:cubic-bezier(.2,0,0,1)`; hover 90 ms; menú 110 ms; diálogo 150 ms; `pulso` 260 ms en `--orange`. Industrial: corto y seco.

**Detalle firma.** La **cinta de obra** (rayas naranja/negro a 45°, 3px) bajo el header y como manija de la hoja móvil, y los **remaches** de 4px en las esquinas de las cards.

**Riesgos.** Puede verse "duro": lo compensan Atkinson (formas abiertas, cálidas) y los paddings generosos (16/20). La cinta de obra es la única
raya diagonal visible: `.ccol.mant` y `.blk.bloqueo` usan la versión suave con `--hatch` para no competir. Texturas acanaladas en pantallas de baja densidad pueden generar moiré: alpha .035 y paso de 16px lo evitan; si aparece, `--texture:none`.

---

## 3. Contrato de implementación

### 3.1 Mecánica del cambio de estilo
- Atributo `<html data-estilo="chapa|marcador|cesped|bodegon|galpon">`. Sin atributo = estilo base actual (no romper nada).
- Oscuro sigue como hoy: `data-theme="dark"` explícito o `prefers-color-scheme:dark` sin `data-theme="light"`. Por estilo, cada bloque de tokens oscuros se escribe **dos veces** con el mismo contenido (copiar el patrón del CSS base, líneas 24–41):
  ```css
  :root[data-estilo="chapa"]{ /* claro */ }
  @media (prefers-color-scheme:dark){ :root[data-estilo="chapa"]:not([data-theme="light"]){ /* oscuro */ } }
  :root[data-estilo="chapa"][data-theme="dark"]{ /* oscuro, mismo bloque */ }
  ```
  Para no duplicar texto a mano, el ingeniero puede definir los tokens oscuros una vez en una custom property set y repetir sólo el selector; lo importante es que las dos puertas al oscuro queden cubiertas.
- Persistencia: `localStorage["bp.estilo"]`, aplicada en `<head>` con un script inline de 3 líneas antes del CSS (evita el flash), con `try/catch`.
- Selector de estilo: una entrada en el menú «Más» y un comando en la paleta («Cambiar estilo → Chapa / Marcador / Césped / Bodegón / Galpón»). Es un cambio chico en `app.mjs`; si no se quiere tocar JS, alcanza con `?estilo=` en la URL leído por el mismo script inline.
- Fuentes: un único `<link rel="preconnect">` a `fonts.gstatic.com` y **un `<link>` por estilo activo**, inyectado por el script inline según `data-estilo` (no cargar las cinco familias). `display=swap` siempre.
- Las fuentes se declaran redefiniendo `--display` y `--sans` por estilo; además un `--mono` nuevo para `galpon` (y respaldo para los demás).
- Nuevos tokens que todos los estilos deben definir (claro y oscuro): `--orange-ui`, `--header-bg`, `--header-ink`, `--accent-line`, `--texture`, `--r-xs/--r-sm/--r-md/--r-lg`, `--shadow-pop`. El CSS base debe definirlos también con los valores actuales (`--orange-ui:#BF5A00` claro / `#FF9A3D` oscuro, `--header-bg:var(--paper)`, `--header-ink:var(--ink)`, `--accent-line:var(--orange)`, `--texture:none`, radios 7/9/10/14, sombra actual de dialog) para que el estilo base también herede las dos reglas de contraste nuevas.

### 3.2 Selectores que necesitan override por estilo
Listado para que nada quede fuera. Lo que no figura hereda del base y cambia sólo por tokens.
- Tipografía: `body`, `.card h2.pantalla`, `.card h2/h3`, `.kpi .l/.v`, `.clock b`, `.blk .tt/.meta/.debe`, `.gh .n/.tag`, `.tcol span`, `th`, `.al .lvl`, `.dlg-h h2`, `.tabs button`, `.brand .w1/.w2`, `.emblem b`, `.pin-in`, `#cmdk input`, `.days b/small`.
- Header: `header.top`, `.top-in`, `.brand`, `.emblem`, `.buscar`, `kbd`, `.user-chip` (+`.avatar`), `.clock`, `.btn.ghost` dentro de `header.top`, `header.top::after`, `.demo-ribbon` (dejar en `--ink`/`--paper` en todos, salvo `marcador` que lo pone en `#000`).
- Navegación: `.tabs`, `.tabs button`, `.tabs button[aria-current="page"]` (+`::before` en `chapa`), `.tabs .badge`, `.menu`, `.menu button`, `.menu hr`.
- Agenda: `.days button` (+`[aria-pressed="true"]`), `.toolbar`, `.grid-wrap`, `.gh`, `.luz[aria-pressed="true"]`, `.tcol`, `.ccol`, `.ccol.mant`, `.slot`, `.slot.hora`, `.slot:hover`, `.slot.pasado`, `.blk` y variantes `.reservada/.en_cancha/.finalizada/.fijo/.alerta/.bloqueo`, `.blk .dot/.alerta-pago`, `.now`, `.now::before`, `.legend i`, `.chip` y variantes.
- Bandeja y caja: `.al` y niveles, `.kv`, `.kv .tot`, `.cta`, `.seccion`, `.marca-roja`, `.rojo`, `.honesto`.
- Dueño: `.kpi`, `.kpis`, `.cam`, `.cam::after` (sólo `marcador`), `.torre .t`, `.bar`, `.bar i`, `.heat .c`, `table/th/td`, `.medios .m`, `.log`.
- Formularios y diálogos: `input,select`, `label.f`, `dialog`, `dialog::backdrop`, `.dlg-h/.dlg-b/.dlg-f`, `.medio-pick button`, `.sug button`, `.player`, `.prod`, `.qty button`, `.pin-pad button`, `.usuarios button`, `.wa`, `.err`, la media query de 640px (hoja inferior: radio y manija `.dlg-h::before`).
- Paleta y avisos: `dialog#cmdk`, `#cmdk .q`, `#cmdk li[aria-selected="true"]`, `#cmdk .pie`, `.toast`, `.toast.err`, `.toast button`.
- Globales: `:focus-visible`, `.card` (+`::before/::after` en `galpon`), `.card-head` (+`::after` en `cesped`), `body` (textura), `footer.gsg`, `--ease` y duraciones.
- Contenido (calendario): `.cal .dia`, `.cal .dia.hoy`, `.pub` — heredan radios por token; sólo verificar que `.hoy` use `--orange-ui`.

### 3.3 Estilo por defecto recomendado: `chapa`
Razones: (1) es el que más se parece al logo (chapa azul, condensada en mayúsculas) sin inventar nada; (2) es el de mejor legibilidad
en mostrador con bordes de 3.6:1 y tinta 18.5:1; (3) es el que menos se parece a un SaaS genérico y no depende de texturas ni de un
modo (claro y oscuro son igual de buenos); (4) tipografía argentina de una sola familia: una sola carga de fuente, el más barato.
Segunda opción: `marcador` como default cuando el sistema está en oscuro de noche (puede proponerse como regla: `chapa` de día, `marcador` de 20:00 a cierre, pero sólo si el club lo pide; no hacerlo automático sin preguntar).

### 3.4 Checklist de QA por estilo (claro y oscuro, cada uno)
1. **Contraste**: con el inspector, leer `--ink`/`--muted` sobre `--panel`, `--paper`, `--cream` y sobre cada `*-soft` que lleve texto; confirmar los valores de este plan (≥ 4.5). Bordes de input (`--line` sobre `--paper`) ≥ 3.0.
2. **Fijo naranja**: en la agenda del jueves (Lucas Fernández 20:30, Valentina Paz 22:30) el bloque tiene fondo `--orange-soft` y borde `--orange-ui`; se distingue de "reservado" y de "en cancha" **sin leer el texto**. En `cesped` claro, que el fijo no se confunda con un bloque pintado.
3. **Deuda roja**: `.alerta-pago` (punto), `.debe` (texto), `.marca-roja` (chip/sello) y `.rojo` visibles en el bloque de Martín Ríos, en `verReserva` y en la torre del dueño; en oscuro el texto de `.marca-roja` es `#2A0B08`, no blanco.
4. **Línea "ahora"**: 2–3px `--orange-ui`, etiqueta de hora legible (`#1D1003` sobre `--orange`).
5. **390px**: header en una o dos filas sin corte, `.w2` oculto, tabs con scroll horizontal, grilla con scroll, hoja inferior con manija y botones a 40px de alto; sin scroll horizontal de página.
6. **Oscuro**: `color-scheme:dark` aplicado (inputs y scrollbars nativos oscuros); `.cam` y su overlay sin cambios; `.seg button[aria-pressed]` y `.btn.primary` con texto oscuro sobre azul claro.
7. **Numerales tabulares**: en consola, medir `getBoundingClientRect().width` de dos `<span>` con "11111" y "00000" en `.clock b`, `.kpi .v`, `.tcol span` y `.kv dd`; deben ser iguales. En `bodegon`, además, que los números no "bailen" (lining).
8. **Marca**: emblema azul + pelota naranja visibles en el header de los cinco; azul y naranja con rol funcional (primary / fijo-ahora).
9. **Movimiento**: ninguna transición > 200 ms; con `prefers-reduced-motion:reduce` no se mueve nada.
10. **Texturas**: con `--texture:none` el estilo sigue en pie; sin moiré a 100% y 125% de zoom.
11. **Foco**: Tab por header → tabs → días → toolbar → slots → bloques: anillo visible en todos, también sobre el header de color (`chapa`, `marcador`, `galpon`).
12. **Peso**: una sola hoja de fuentes por estilo, ≤ 3 familias, `display=swap`; sin imágenes nuevas.


— Elaborado por GSG
