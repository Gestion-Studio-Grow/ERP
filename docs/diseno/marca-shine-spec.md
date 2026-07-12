# Sistema de marca SHINE — spec de diseño (del manual oficial 2026)

> Fuente: `manual de marca shine (1).pdf` (24 págs, diseñadora Cisterna Aylén, 2026). Traducido a
> tokens para implementar el front sobre el sistema Fable. **Elaborado por GSG.**

## Esencia
- **Slogan:** «QUE TU LUZ NUNCA SE APAGUE».
- **Qué es:** velas aromáticas artesanales. Experiencias sensoriales, armonía en los espacios.
- **Misión:** llevar luz y calidez a cada momento especial de la vida.
- **Visión:** marca en crecimiento, cada vez más profesional, reconocida por su calidad.
- **Valores:** **Calidad** (intensidad/permanencia de fragancias) · **Estética** (diseño + armonía) ·
  **Artesanal** (detalle, procesos artesanales, autenticidad).
- **Concepto:** el **brillo y la luz** como eje; la **vela/llama** como isotipo (iluminación, intención,
  ambientación). Momentos cotidianos de **pausa y bienestar** en el hogar.
- **Moodboard (adjetivos rectores):** profesional · brillo · cercano · luz · cálido · aesthetic · aroma ·
  especial · sentimental.
- **Partido gráfico:** el **fuego de la vela** como elemento visual principal; la llama = isotipo; tipografía
  delicada. Sistema de íconos + **trama** modular (pattern) como recurso de fondo.

## Paleta cromática (hex oficiales)
| Rol sugerido | Hex | Nota |
|---|---|---|
| **Malva terroso — principal** | `#b88a89` | color firma (C25 M47 Y35 K11) |
| Malva oscuro | `#835c5b` | texto sobre crema / profundidad |
| **Burdeos profundo — acento** | `#671128` | acento fuerte, CTA/detalle (vino) |
| Nude | `#d0aeac` | apoyo suave |
| Rosa pálido | `#e1cdca` | superficies elevadas / tinte |
| **Crema — fondo** | `#f3ebe1` | fondo base cálido (off-white) |

Contraste: texto en `#835c5b`/`#671128` sobre `#f3ebe1` → cumplir **AA** (verificar 4.5:1 en cuerpo).
Neutros cálidos, nunca gris frío. Acento = burdeos, usado con moderación (la marca es luz, no oscuridad).

## Tipografía
- **Primaria / titulares:** **The Seasons** (serif display delicada, alto contraste; Light/Regular/Bold/Italic).
- **Subtítulos y texto extenso:** **Kumbh Sans** (sans humanista redondeada).
- **Secundaria:** **Garet** (sans geométrica; alternativa/apoyo).
- Regla: The Seasons para títulos; Kumbh Sans para body. Fallbacks web-safe si la fuente no carga
  (serif elegante → Cormorant/“Playfair” como sustituto de licencia libre si The Seasons no está disponible;
  Kumbh Sans está en Google Fonts).

## Traducción a tokens Fable (para el front de Shine)
- `--accent` (claro) = `#671128` burdeos · on-accent = crema `#f3ebe1` (verificar AA).
- Fondo base = `#f3ebe1` · superficie elevada = `#e1cdca`/blanco cálido · línea = malva translúcido.
- Texto fuerte = `#671128` / `#835c5b`; texto cuerpo = malva oscuro sobre crema.
- Radios suaves, sombras cálidas de bajo contraste (nada de sombra azulada). Mucho aire (espacioso).
- Motivo recurrente: **llama** (isotipo SVG) + **halo/glow** cálido; trama modular sutil de fondo.
- Tono de copy: criollo cálido, sensorial, cercano — coherente con ADR-046 (zona humana).
