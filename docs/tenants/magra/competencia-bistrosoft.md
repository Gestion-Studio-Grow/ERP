# Competencia — Bistrosoft (investigación) y alcance superador de `magra`

**Tipo:** investigación competitiva · **Fecha:** 2026-07-04 · **Rol:** PO
**Para:** definir el alcance superador del tenant `magra` (carnicería premium).
**Resumen del BACKLOG:** la tabla comparativa vive en `BACKLOG.md §1`; este doc es
el respaldo investigado (con fuentes) de esas afirmaciones y afina dónde ganamos.

---

## 1. Qué es Bistrosoft (hechos verificados)

- **Software de gestión gastronómica**, no de retail ni carnicería: está diseñado
  para restaurantes, bares y cafeterías. Se presenta como *"la primera solución
  Android de software gastronómico de Argentina"*.
- **Escala y trayectoria:** +25.000 locales gastronómicos en +8 países de
  Latinoamérica, más de una década de operación. Es un competidor consolidado.
- **Modelo comercial:** abono mensual sin contrato de permanencia; el precio real
  es *"cotización personalizada"* (se cita "desde ~€39/mes" en comparadores). El
  abono **incluye el hardware** (terminal **Bistro Advance**, doble pantalla táctil
  Android), **mesa de ayuda 24 h** y web de reportes (**Bistro Web**).
- **Arquitectura híbrida:** hardware Android propietario en el local + backoffice
  en la nube. No es cloud-puro: el terminal es parte del producto.
- **Módulos:** Tienda Online, Bistro Cocina (KDS/comandas), Autoservicio, Móvil,
  Salón (gestión de mesas).
- **Integraciones:** PedidosYa, Rappi, Mercado Pago y **Contabilium** (contable).
- **Punto débil documentado (soporte/estabilidad):** reseña pública 2/5 —
  *"llevo 3 días perdiendo mesas porque no son capaces de solucionar que los
  productos sean visibles en la tablet"*. Es **una** reseña (anecdótica, no
  concluyente), pero apunta a soporte lento con impacto operativo.
- **Sin evidencia de venta por peso para carnicería:** no hay documentación de
  integración de **balanza**, **PLU**, **etiqueta con peso embebido (EAN-13 tipo 2)**
  ni **tara**. Su fuerte es la comanda gastronómica (mesa → cocina → delivery),
  no el corte al peso de mostrador.

## 2. Lectura estratégica (dónde ganamos, dónde no)

Bistrosoft es fortísimo en **su** rubro (gastronomía con salón/cocina/delivery).
Pero magra **no** es un restaurante: es una **carnicería premium de mostrador**.
El solapamiento real es parcial, y ahí están las oportunidades:

**Donde Bistrosoft NO está pensado (nuestro terreno para ganar):**
1. **Venta por peso de primera clase.** Su modelo es el plato/producto de menú,
   no el corte a $/kg con gramaje variable. magra hace de la venta por kg el
   núcleo (ya implementado en software este ciclo; balanza física en v1+).
2. **Vidriera de marca premium.** Su "Tienda Online" es gastronómica y de branding
   limitado; magra ofrece vidriera por tenant con identidad propia (oxblood/hueso/
   latón), catálogo de cortes con precio/kg y foto.
3. **Cloud multi-tenant puro (estilo SAP Public Cloud).** Sin hardware propietario:
   updates centrales, multi-sucursal/casa-matriz nativas, un solo Core para todos
   los tenants. Bistrosoft ata el producto a su terminal Android.
4. **Cuenta corriente de clientes/mayoristas.** Habitual en carnicería (fiado,
   mayorista), no es el centro de un POS gastronómico. Diferencial v1+.
5. **Confiabilidad y soporte cercano.** Su talón de Aquiles reportado; para un
   negocio único que arranca, la cercanía es una ventaja defendible.

**Donde Bistrosoft ya tiene paridad (no diferencia, no perder tiempo en "ganar"):**
- **Facturación fiscal (ARCA/AFIP):** ellos ya la tienen; nosotros la damos con el
  Plugin `arca` (ADR-022). Es paridad — requisito, no diferencial.
- **Delivery por apps (PedidosYa/Rappi) y medios de pago (MP/Modo/etc.):** su
  fuerte. Para nosotros es *alcanzar en v1+*, no el frente de ataque del MVP.
- **Cocina/KDS/mesas/recetas/mermas de gastronomía:** irrelevante para carnicería;
  fuera de alcance a propósito (BACKLOG §4).

**Conclusión (define el foco del MVP):** no competimos de frente con la comanda
gastronómica. Ganamos en **venta por kg + vidriera de marca + experiencia cloud
multi-tenant + cuenta corriente**, damos **paridad** en fiscal, y *alcanzamos* en
delivery-apps/pagos recién en v1+. El alcance priorizado está en `BACKLOG.md §2–3`.

## 3. Impacto en el roadmap de este ciclo

Este ciclo se avanzó el **diferencial #1 en su versión software**: la capability
**POS/Orden del Core** con **venta por kg** (precio/kg × gramaje → total), toma de
pedidos (retiro/envío) y bandeja de pedidos en el backoffice. La **balanza física**
(PLU, tara, etiqueta EAN-13 con peso embebido) —el *knockout* sobre Bistrosoft para
carnicería de corte— queda en v1+ (`BACKLOG.md §3`). Ver
`docs/tenants/magra/pos-orden-capability.md` para el detalle técnico de lo hecho.

---

## Fuentes

- [Bistrosoft — Preguntas frecuentes / precios (sitio oficial)](https://bistrosoft.com/ar/preguntas-frecuentes/)
- [Bistrosoft: precios, funciones y opiniones — ComparaSoftware](https://www.comparasoftware.com/bistrosoft)
- [Software gastronómico: mucho más que un POS — Bistrosoft (Medium)](https://bistrosoft.medium.com/software-gastron%C3%B3mico-mucho-m%C3%A1s-que-un-pos-2ed2ecba3bb5)
- [Bistrosoft software gastronómico: precio y opiniones 2025 — TPV Hostelería](https://tpvhosteleria.org/bistrosoft/)

*Nota: la reseña 2/5 citada proviene de ComparaSoftware; muestra chica (anecdótica).
La ausencia de balanza/PLU/tara documentados es "no encontrado en fuentes públicas",
no una prueba de que no exista — se valida con una demo del competidor si hace falta.*
