---
name: scroll-reveal-composition
description: >-
  Composición editorial scroll-driven de alto nivel — la técnica destilada por ingeniería
  inversa de antigravity.google (Google). Tipografía grande y liviana, lienzo amplio y vacío
  dosificado, revelado progresivo por scroll (opacity + translateY con IntersectionObserver),
  stagger, easings de desaceleración y color con cuentagotas. Úsala cuando un front público
  (vidriera/landing) tiene que sentirse premium, calmo y "que se construye a medida que
  scrolleás", SIN sacrificar accesibilidad, performance ni el camino a la conversión.
  Trae recetas copy-paste (React/Next + CSS), umbrales de calidad (AA, reduced-motion, sin-JS,
  60fps) y una guía honesta de cuándo NO usarla. Invocable por cualquier célula de diseño.
metadata:
  type: reference
  origin: ingeniería inversa de https://antigravity.google (2026-07-13)
  gsg-gate: pasa por Auditoría SAP Fiori + sello GSG antes de integrar
---

# Composición scroll-driven editorial — la técnica de Antigravity, destilada

> **Qué es esto.** Una técnica de composición y movimiento para fronts públicos que se sienten
> **premium, calmos y narrativos** — el contenido "aparece a medida que scrolleás". Fue obtenida
> **desarmando `antigravity.google` en vivo** (Chromium + medición de estilos computados,
> timings y estructura), no mirando un screenshot. Acá están **los principios y las recetas**,
> no los píxeles ni la marca de Google. **Copiá la técnica, nunca los assets ni el copy.**

---

## 0 · Cómo invocar esta skill

- **Célula de diseño / adaptador:** antes de rediseñar una vidriera "que tiene que impresionar",
  leé esta skill y aplicá las recetas §3. Está referenciada desde `.claude/agents/diseno-marca.md`.
- **Preset-IA:** al generar un front premium para un cliente cuyo mundo lo pida (§4).
- **Regla dura:** todo lo que produzcas con esta técnica pasa igual por el **Gate de Excelencia**
  (SAP Fiori 7 ángulos + argentino + sello GSG). Esta skill **no reemplaza el Gate**: lo alimenta.

---

## 1 · Los principios (medidos, no impresionistas)

Lo que hace que Antigravity se sienta como se siente — cada punto verificado sobre el sitio real:

1. **Tipografía grande y LIVIANA, no grande y pesada.** El h1 mide **80px** con **peso 450**
   (una fuente variable), line-height **casi 1.1** (88px) y tracking apenas negativo. La escala es
   dramática pero el peso es liviano: impone por tamaño y aire, no por negrita. Titulares de sección
   ~42px, peso 450, tracking **-0.73px** (ajuste óptico al agrandar). *Contraste con el molde ERP
   actual, que usa weight 800: esta técnica va al revés.*

2. **Lienzo ANCHO + vacío dosificado.** Contenedor máximo **~1744px** (no 1080), grilla de **12
   columnas** (fracciones 8.33% / 25% / 33% / 50%), y **ritmo vertical de 120px** entre secciones
   grandes (72px en las menores). El vacío no es relleno: es la pausa que deja respirar cada bloque.

3. **Revelado progresivo por scroll = opacity + translateY chico.** Cada bloque entra desde
   `opacity: 0; transform: translateY(16px)` hacia `opacity: 1; translateY(0)`. **El offset es
   chico (16px), no 60px** — es un asentar sutil, no un salto. Disparado por **IntersectionObserver**
   (no scroll-timeline CSS: el sitio real no usa `animation-timeline`). ~895 elementos arrancan a
   opacidad <1 y se revelan a su turno.

4. **Stagger corto entre hermanos.** Dentro de un bloque, los hijos revelan con un **delay
   incremental (~60–90ms)** ("delayed-fade-in"). Encadena la entrada sin que se sienta lento.

5. **Easing de DESACELERACIÓN.** La entrada usa curvas tipo `cubic-bezier(.215,.61,.355,1)`
   (easeOutCubic) — arranca rápido y frena suave. Nada de `linear` ni rebotes. Duración ~600–800ms.

6. **Scroll suavizado (momentum).** Un `smooth-scroll-wrapper` propio suaviza la inercia del scroll
   → refuerza la sensación de "se arma solo". Es **opcional y la primera víctima** de reduced-motion.

7. **Color con cuentagotas sobre lienzo neutro.** La paleta CSS es **casi monocroma**: tinta
   `rgb(18,19,23)` sobre blanco, más tintes fríos a **alpha bajísimo** (`rgba(183,191,217,0.09)`)
   para superficies/filetes. **El color "de verdad" entra por la MATERIA** — video y canvas (la
   imaginería del "liftoff"), no por gradientes de CSS sobre texto. El neutro es el 95%; el color
   es el acento puntual.

8. **Ritmo narrativo: hook → tesis → inmersión pineada → aplicación → conversión.** El orden de
   secciones dosifica la info: héroe a viewport completo (720px) → banda de video (prueba) → tesis
   ("agent-first") → **una sección alta pineada (~2529px) que el scroll "explora" en el lugar** (el
   pico de atención) → casos de uso → probá/soluciones → prueba social → CTA de descarga. El
   silencio entre picos es parte del diseño.

9. **Barato de animar.** Solo se animan **opacity y transform** (compositor GPU), con `will-change`
   **puesto solo en lo que está por entrar** (~31 elementos activos, no en todo). Nada de animar
   `top/left/width/height` ni `box-shadow`. Por eso corre fluido con 22.500px de página.

> **Hallazgo honesto (lo que Antigravity NO hace bien):** su CSS **no tiene bloques
> `@media (prefers-reduced-motion)`** y sus reveals dependen de JS (sin JS, muchos bloques quedarían
> ocultos por el estado inicial `opacity:0`). **Nosotros lo hacemos mejor** (ver §5): reduced-motion
> respetado y contenido visible sin JS son NO negociables en GSG.

---

## 2 · La esencia en una frase

> **Tipografía grande y liviana sobre un lienzo ancho y vacío, donde cada bloque se asienta con un
> fade+subida de 16px al entrar en viewport, encadenado con un stagger corto y una curva que frena
> suave — y el color aparece solo por la imagen, nunca por decoración.**

---

## 3 · Recetas técnicas (copy-paste, React/Next + CSS)

Todas las recetas están pensadas para **degradar bien**: contenido visible sin JS, respeto de
`prefers-reduced-motion`, y solo propiedades baratas.

### 3.1 · El componente `Reveal` (IntersectionObserver, no-JS-safe, reduced-motion-safe)

La clave del "no-JS-safe": **el estado oculto se aplica SOLO cuando una clase `reveal-ready` está en
`<html>`**, y esa clase la agrega el propio JS. Sin JS → nunca se oculta nada → contenido íntegro.

```tsx
// components/Reveal.tsx
"use client";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

// Marca <html> como "JS listo": recién entonces el CSS puede ocultar para revelar.
// Sin este flag (sin JS), todo queda visible. Se corre una sola vez.
if (typeof document !== "undefined") document.documentElement.classList.add("reveal-ready");

export function Reveal({
  children, as: Tag = "div", delay = 0, y = 16, style, className,
}: { children: ReactNode; as?: any; delay?: number; y?: number; style?: CSSProperties; className?: string; }) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Respeta reduced-motion: sin animación, se muestra ya.
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setShown(true); return; }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { setShown(true); io.disconnect(); }
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.15 }); // dispara un toque antes del borde
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      data-reveal={shown ? "in" : "out"}
      className={className}
      style={{ ["--reveal-y" as string]: `${y}px`, ["--reveal-delay" as string]: `${delay}ms`, ...style }}
    >
      {children}
    </Tag>
  );
}
```

```css
/* globals.css — el estado oculto SOLO aplica con JS listo (reveal-ready) */
:root.reveal-ready [data-reveal="out"] {
  opacity: 0;
  transform: translateY(var(--reveal-y, 16px));
}
[data-reveal] {
  transition: opacity 640ms cubic-bezier(.215,.61,.355,1),
              transform 640ms cubic-bezier(.215,.61,.355,1);
  transition-delay: var(--reveal-delay, 0ms);
  will-change: opacity, transform; /* barato: solo estas dos */
}
[data-reveal="in"] { opacity: 1; transform: none; }

/* NO negociable: si el usuario pidió menos movimiento, nada se mueve ni se oculta */
@media (prefers-reduced-motion: reduce) {
  :root.reveal-ready [data-reveal] { opacity: 1 !important; transform: none !important; transition: none !important; }
}
```

### 3.2 · Stagger de una lista

El delay incremental encadena la entrada. Mantenelo corto (60–90ms) o se siente lento.

```tsx
{items.map((it, i) => (
  <Reveal key={it.id} delay={i * 70} y={16}>
    <Card {...it} />
  </Reveal>
))}
```

### 3.3 · La escala tipográfica (grande y LIVIANA)

```css
/* Titular héroe: grande, liviano, line-height ~1.05, tracking apenas negativo */
.display-1 { font-size: clamp(44px, 7.5vw, 88px); font-weight: 450; line-height: 1.04; letter-spacing: -0.02em; }
.display-2 { font-size: clamp(30px, 4.6vw, 46px); font-weight: 450; line-height: 1.06; letter-spacing: -0.018em; }
.lede      { font-size: clamp(18px, 2.2vw, 24px); font-weight: 450; line-height: 1.35; letter-spacing: -0.003em; }
/* Kicker/eyebrow: chico, tracking amplio, en el ÚNICO acento de color */
.kicker    { font-size: 13px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; }
```

Requiere una **fuente variable** para que el peso 450 se vea bien (Inter var, Google Sans Flex,
o la que traiga el proyecto). Con una estática, usá 400–500 y no fuerces intermedios.

### 3.4 · El lienzo ancho + ritmo de 120px

```css
.canvas   { max-width: 1200px; margin-inline: auto; padding-inline: clamp(20px, 5vw, 48px); }
.canvas--wide { max-width: 1440px; }           /* para el pico/héroe */
.section  { padding-block: clamp(64px, 10vw, 120px); }  /* el ritmo grande */
.section--tight { padding-block: clamp(40px, 6vw, 72px); }
.grid-12  { display: grid; grid-template-columns: repeat(12, 1fr); gap: clamp(16px, 2vw, 28px); }
```

### 3.5 · Sección "pineada" que el scroll explora (el pico de atención)

Con CSS `position: sticky` — barato, sin JS de scroll. El contenedor alto crea el "tiempo de scroll";
el hijo sticky se queda fijo mientras el índice de paso cambia por IntersectionObserver.

```tsx
<section style={{ position: "relative" }}>
  <div style={{ position: "sticky", top: 0, minHeight: "100vh", display: "grid", placeItems: "center" }}>
    <FeatureStage active={step} />           {/* lo que queda fijo y va cambiando */}
  </div>
  {steps.map((s, i) => (
    <Reveal key={i} as="div" style={{ minHeight: "70vh" }} onSeen={() => setStep(i)}>{/* marca de paso */}</Reveal>
  ))}
</section>
```

> **Regla de honestidad UX:** en un **e-commerce**, la sección pineada NO puede estar entre el
> usuario y el producto. Poné el catálogo y el precio **arriba y accesibles**; el pineado es para
> narrativa de marca, no para tapar la conversión (lección Shine: el precio se ve rápido).

### 3.6 · Scroll suave (opcional) — solo si suma y siempre gateado

Preferí **`scroll-behavior: smooth`** nativo para los anclas. Un smooth-scroll de librería (Lenis y
similares) es un lujo que **debe apagarse con reduced-motion** y no debe romper el scroll del teclado.
Si el proyecto no lo tiene, **no lo agregues solo por esto**: el reveal ya da el 90% del efecto.

```css
@media (prefers-reduced-motion: no-preference) { html { scroll-behavior: smooth; } }
```

---

## 4 · Cuándo usarla — y cuándo NO (sé honesto)

**SÍ le sirve a:**
- Marcas que venden **aspiración, oficio o experiencia** y tienen aire para respirar: diseño,
  boutique, deporte/lifestyle, tecnología, arquitectura, hospitality.
- Landings de producto y **home de marca** donde el primer objetivo es *impresionar y contar*.
- Catálogos **curados y chicos** (pocas piezas, bien mostradas).

**NO le sirve a (y decilo):**
- **Herramientas densas de datos** — backoffice, dashboards, tablas, formularios largos. Ahí manda
  densidad y foco (SAP Fiori clásico), no el aire editorial. *Esta técnica es para la vitrina, no
  para `/admin`.*
- **Catálogos enormes** (cientos de SKUs, góndola de supermercado): el usuario quiere buscar y
  filtrar rápido, no scrollear una narrativa. El reveal estorba.
- **Marcas de urgencia/precio** (descuentazo, mayorista) donde el mensaje es "rápido y barato": el
  minimalismo caro contradice la promesa.
- **Conexiones lentas / equipos viejos** como público principal: aunque es barato, 22.000px de
  página con media pesada penaliza. Medí antes (§5).
- Cuando **no hay imaginería buena**: la técnica depende de que la MATERIA (foto/video/canvas)
  aporte el color y la emoción. Con placeholders grises, se ve vacía, no premium.

Si el caso cae en la columna "NO", **decilo y proponé el molde denso**. Aplicar esto a lo que no
corresponde es peor que no aplicarlo.

---

## 5 · Umbrales de calidad (NO negociables — el Gate los verifica)

1. **`prefers-reduced-motion` respetado.** Con la preferencia activa: **cero** reveals, cero
   translate, cero smooth-scroll. El contenido aparece estático y completo. (Ya cableado en §3.1.)
2. **Funciona sin JS.** El HTML servido trae **todo el contenido visible**. El reveal es *progressive
   enhancement*: el estado oculto solo lo aplica el CSS bajo `:root.reveal-ready`, clase que agrega el
   JS. Sin JS → nada oculto → SEO y accesibilidad intactos. **Verificá desactivando JS.**
3. **Contraste AA.** Texto ≥ 4.5:1 (≥ 3:1 el grande). Ojo con **texto claro sobre imagen**: poné un
   velo/gradiente bajo el texto y medí contra el píxel real, no contra el lienzo hermano
   (falso positivo conocido). Objetivo AA real, no "parece".
4. **Touch targets ≥ 44×44px** en todo control (botones +/−, CTAs, links de nav).
5. **Performance / 60fps.** Solo animar `opacity`/`transform`. `will-change` **acotado** a lo que
   está por entrar (no en todo el árbol). Sin layout thrashing. Medí con el panel de rendimiento o
   contando long tasks; apuntá a scroll sin jank en un mid-range.
6. **La conversión no se sacrifica por la estética.** En tienda, producto+precio visibles rápido y
   el CTA de compra siempre alcanzable. La narrativa envuelve, no bloquea.
7. **El color entra por la materia, no por decoración chillona.** Lienzo neutro; el acento de marca,
   con moderación (kicker, filetes, precio, CTA). Nada de gradientes arcoíris sobre el texto.

**Checklist de auto-verificación antes del Gate:**
- [ ] Con reduced-motion ON: estático y completo.
- [ ] Con JS OFF: todo el contenido presente y legible.
- [ ] AA medido sobre el píxel real (desktop + mobile).
- [ ] Targets ≥44px.
- [ ] Scroll fluido (solo transform/opacity; will-change acotado).
- [ ] Producto/precio/CTA visibles sin pelear con la narrativa.
- [ ] Color por imagen; acento con cuentagotas.

---

## 6 · Anti-patrones (lo que arruina el efecto)

- **Offsets grandes de reveal (40–80px)** → se siente lento y mareador. Quedate en 12–20px.
- **Stagger largo (>120ms)** o revelar de a uno elementos que deberían entrar juntos → el usuario
  espera. Agrupá.
- **Animar `linear` o con rebote** → rompe la calma. Siempre desaceleración.
- **Weight 700–800 en el titular gigante** → se vuelve "grito", pierde el aire. 400–500.
- **Ocultar contenido detrás de JS sin fallback** → mata SEO y accesibilidad. Usá el patrón
  `reveal-ready`.
- **Pineado que tapa la compra** en e-commerce → conversión sacrificada. La narrativa no bloquea.
- **Placeholders grises donde va la materia** → se ve pobre, no premium. Conseguí la imagen primero.

---

*Origen: ingeniería inversa medida de `antigravity.google` (Chromium, estilos computados + timings),
2026-07-13. Se destiló la **técnica de composición**, no la marca ni los assets de Google.*

*— Elaborado por GSG (Diseño & Marca)*
