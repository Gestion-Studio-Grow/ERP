# ADR-044: Argentinizar SAP — lo mejor de SAP, adaptado a la realidad de la pyme argentina (principio transversal de auditoría)

**Estado:** Aceptado — vigente y transversal
**Fecha:** 2026-07-06
**Depende de:** ADR-040 (Gate de Excelencia), ADR-043 (estándar de marca GSG)
**Relacionado:** ADR-009 (UX "para la recepcionista"), ADR-022/024/025 (fiscal ARCA + Mercado Pago), ADR-012 (WhatsApp), ADR-033 (copia exacta)
**Fuente viva (detalle):** `docs/metodologia/auditoria-sap-fiori.md` → §8 "Ángulo argentino"

---

## Contexto
SAP/Fiori nos da lo que queremos como **fondo de calidad**: rigor enterprise, role-based, coherencia,
producto serio. Pero **SAP "a secas"** es **ajeno** para una pyme argentina: corporativo, en **jerga /
inglés técnico**, pensado para grandes empresas globales, con supuestos que no son los de acá (medios de
pago, régimen fiscal, canal de contacto). En el otro extremo, el **software local "sin nivel"** no tiene
rigor. Un ERP para el comerciante argentino no puede ser **ni "SAP tal cual" ni "otro software más"**.

## Decisión
El estándar de producto de GSG es **ARGENTINIZAR SAP**: **tomar TODO lo positivo de SAP** (Fiori, rigor
enterprise, role-based, coherencia, calidad de nivel) **pero adaptado a la realidad argentina**:
- **Lenguaje criollo y simple** — como lo diría el dueño de la pyme; **sin jerga corporativa ni inglés técnico**.
- **Prácticas de negocio locales** — cómo opera de verdad el rubro en Argentina.
- **Fiscal ARCA/AFIP** — monotributo, factura A/B/C, condición de IVA.
- **Medios de pago locales** — Mercado Pago, transferencia, efectivo (no gateways/tarjetas extranjeras por default).
- **Cultura WhatsApp-first** — WhatsApp como canal primario de contacto/aviso/venta (no email-first).
- **Contexto y bolsillo de la pyme** — opera desde el celular, poca fricción, sin infra cara.

Es un **principio TRANSVERSAL de la auditoría**: la Auditoría SAP Fiori evalúa, **además de sus 7 ángulos,
el ÁNGULO ARGENTINO** (§8 del fundamento). Y el **sello de marca GSG** (ADR-043) **ES** exactamente eso:
*lo mejor de SAP, argentinizado.*

## Consecuencias
- **(+)** Producto que se siente **de nivel enterprise Y propio del comerciante argentino** → adopción,
  confianza y **diferencial** claro (vs SAP: ajeno/caro/jerga; vs software local: sin nivel).
- **(+)** Ordena decisiones ya presentes (UX criolla de ADR-009, fiscal ARCA de ADR-022/024/025, WhatsApp
  de ADR-012) bajo un **mismo principio rector**.
- **(−)** Exige **criterio local en cada pantalla** (wording, fiscal, pagos, canal) y suma **un ángulo más**
  a la auditoría.
- **Toca / documentado en:** `docs/metodologia/auditoria-sap-fiori.md` (§8 ángulo argentino),
  `docs/metodologia/estandar-marca-gsg.md`, `CLAUDE.md` (Gate), ADR-040 (bloque 1 del Gate).

## Estado
**Aceptado — vigente y transversal.** Es el estándar de fondo de todo lo que audita y sella GSG.
