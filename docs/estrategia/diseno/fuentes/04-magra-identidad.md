> **Procedencia:** recuperado del bundle `_recuperacion_inbox_20260710` (2026-07-10), material fundacional del dueño / reconstruido desde apps en vivo. Incorporado a la rama fundacional sin alterar el contenido original.

---

# MAGRA Meat Market — Análisis de identidad (referencia real)

**Fuente:** https://magrameatmarket.com.ar/ (analizada en vivo; colores y tipografías extraídos de los estilos computados reales del sitio, no estimados).
**Qué es:** boutique de carnes envasadas al vacío en Canning (Sotavento Point). Cortes premium vacunos/cerdo/pollo + gourmet (pastas, conservas, congelados). Servicio puerta a puerta. Distribuidor oficial de Estancia Don Ramón.
**Plataforma:** WordPress + Elementor 3.29. Pedidos por WhatsApp y lista de precios externa (BistroSoft).

---

## 1. Paleta exacta (hex verificados en el sitio)

| Rol | HEX | RGB | Uso real en el sitio |
|---|---|---|---|
| **Negro carbón (base de marca)** | `#1D1D1B` | 29,29,27 | Color dominante: textos, fondos oscuros, superficies premium. Es el negro cálido (no puro), firma boutique. |
| **Negro puro** | `#000000` | 0,0,0 | Secciones/fondos de foto, refuerzo de contraste. |
| **Crema hueso** | `#F2E6D7` | 242,230,215 | Fondo claro y texto sobre oscuro. Da la calidez "artesanal / carnicería fina". (Variante `#F2E6D8`.) |
| **Oro cálido / tan (ACENTO principal)** | `#C5AE86` | 197,174,134 | **El color de marca.** Botones, títulos H1, detalles. NO es rojo carnicería: es un dorado terroso, sofisticado. |
| **Slate profundo** | `#0F172A` | 15,23,42 | Secciones oscuras alternativas (heredado de plantilla; se puede unificar hacia el carbón). |
| **Gris acero claro** | `#CCD6DF` | 204,214,223 | Textos secundarios sobre oscuro, líneas. |
| **Gris neutro medio** | `#69727D` | 105,114,125 | Texto de apoyo, metadatos. |

**Lectura de la paleta:** el acierto de MAGRA es *no* usar el rojo carnicería obvio. Elige **carbón + hueso + oro** — un código de boutique/delicatessen premium, más cercano a una casa de vinos o un steakhouse de autor que a una carnicería de barrio. Es exactamente el tipo de decisión opinada que el rediseño GSG debería respetar y amplificar.

**Recomendación para el tenant GSG-Magra:** trabajar sobre `#1D1D1B` como base, `#F2E6D7` como claro, `#C5AE86` como único acento (botones/títulos), y reservar el rojo sangre solo como *chispa* puntual si se quiere señalizar "carne". Descartar/absorber el `#0F172A` (es residuo de plantilla, no marca).

---

## 2. Tipografía (familias reales detectadas)

| Rol | Fuente | Detalle |
|---|---|---|
| **Display / Títulos (H1–H2)** | **Bebas Neue** | Condensada, alta, mayúsculas. H1 real: 52px, weight 400, color oro `#C5AE86`. Da el aire de cartelería / marquesina premium. |
| **Cuerpo / UI** | **Open Sans** | Sans humanista neutra para lectura y botones. Botón: fondo oro, texto carbón, radio 5px. |
| **Acentos serif** | *Times New Roman* (fallback) | Aparece en algunos bloques; conviene reemplazar por una serif intencional (ej. una serif de alto contraste) si se quiere elevar. |
| Secundaria detectada | *Metropolis* | Geométrica, en algunos elementos. |

**Pareja tipográfica de marca:** **Bebas Neue (display condensado) + Open Sans (texto).** Es una pareja con tensión real (enorme condensado vs. neutro legible) — justamente lo que la Dirección Creativa pide. Para el tenant GSG se puede mantener Bebas Neue o subir a una condensada con más carácter (ej. Anton, Druk-like), conservando el gesto.

---

## 3. Tono de voz

- **Directo, confiado, con guiño.** Titular real: *"Esto no es una carnicería!"*. Se posiciona por negación/aspiración: *"No hace falta saber de cocina, ni de cortes. Solo tener buen gusto (y hambre!)."*
- **Premium accesible:** "estilo, practicidad y sabor premium en un solo pack". Vende *conveniencia con estatus*, no commodity.
- **Cercano y local:** nombra los barrios (Canning, San Vicente, Guernica, Ezeiza, Monte Grande), empuja WhatsApp, "atención personalizada", "antojos".
- **Prueba social explícita:** reviews 5/5 con nombres, logos de proveedores (Estancia Don Ramón, Paladini, etc.) como sello de calidad.

**Traducción a UI:** títulos cortos y aseverativos en Bebas; microcopy cálido y coloquial-correcto (sin lunfardo forzado); CTA siempre hacia WhatsApp/pedido.

---

## 4. Estructura / layout actual

Orden real de la home:
1. Header con logo (blanco sobre transparente) + redes + WhatsApp.
2. Hero: imagen de carnes + eyebrow "PRODUCTOS GOURMET PREMIUM" + H1 "Esto no es una carnicería!" + bajada + CTA "LISTA DE PRECIOS".
3. Franja de 4 beneficios con ícono: *Free Shipping · Calidad premium · Todos los medios de pago · Atención personalizada*.
4. **Productos gourmet**: grilla de categorías con foto (ensaladas, pescado, pasta, conservas).
5. **Envasados al vacío**: bloques por proteína (vaca / cerdo / pollo), cada uno con CTA "Hacer pedido" → WhatsApp.
6. **Nuestros proveedores**: logos.
7. **Reviews** de clientes (5/5, con foto y nombre).
8. Footer: about, dirección (José Champagnat 4351, Local 1, Sotavento Point), horarios, redes.

**Patrón:** es una landing de e-commerce por catálogo con conversión vía WhatsApp — coherente, pero con la estructura estándar de Elementor. Para el tenant GSG bold: conservar el *contenido* y el *tono*, y reencuadrarlo en el lenguaje **Vidriera** (editorial full-bleed, escala dramática, riel de pedido permanente) — es lo que hace el mockup.

---

## 5. Fotografía / estilo visual

- **Producto sobre fondo neutro/oscuro**, packaging al vacío visible (refuerza "premium/higiénico/gourmet").
- Mezcla de fotos de producto reales y algunos assets de stock/ilustrativos (pastas, conservas).
- Logos de proveedores como retícula de credibilidad.
- Logo propio: lockup horizontal claro sobre fondo oscuro (se usa en `.webp` transparente).

**Recomendación de dirección de arte para el tenant:** foto de corte a sangre completa, luz cálida y lateral, fondo carbón `#1D1D1B`, mucho primer plano de textura (grasa, hueso, marmoleo) — tratar la carne como *objeto de deseo editorial* (referencia: editoriales de steakhouse premium / Aesop-de-la-carne). Evitar el collage de stock.

---

## 6. Kit rápido para replicar el tenant GSG-Magra fielmente

```
--magra-carbon:  #1D1D1B;   /* base / superficies oscuras */
--magra-negro:   #000000;   /* fondos de foto */
--magra-crema:   #F2E6D7;   /* claro / texto sobre oscuro */
--magra-oro:     #C5AE86;   /* ACENTO: botones, títulos */
--magra-acero:   #CCD6DF;   /* texto secundario s/oscuro */
--magra-gris:    #69727D;   /* metadatos */

Display: 'Bebas Neue', mayúsculas, tracking leve.  H1 ~52px+.
Texto:   'Open Sans'.
Botón:   fondo oro, texto carbón, radio ~5px.
Voz:     asertiva + guiño ("Esto no es una carnicería!"), cercana, premium accesible.
Norte:   carbón + hueso + oro; rojo sangre solo como chispa puntual.
```

Estos valores son los reales del sitio en producción y sirven para clonar/adaptar la identidad con fidelidad en el tenant. El mockup `mockup-magra-vidriera.html` ya está construido con esta paleta y tipografía.
