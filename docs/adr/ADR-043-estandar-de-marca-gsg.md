# ADR-043: Estándar de marca GSG — sello de calidad en todo entregable, sin pisar la marca del cliente

**Estado:** Aceptado — vigente (bloque 2 del Gate)
**Fecha:** 2026-07-06
**Depende de:** ADR-040 (Gate de Excelencia — el sello es su bloque 2)
**Relacionado:** ADR-033 (copia exacta — sello solo en metadatos), ADR-042 (autorización), ADR-009 (UX)
**Fuente viva (detalle):** `docs/metodologia/estandar-marca-gsg.md`

---

## Contexto
GSG necesita que **todo lo que sale** tenga su **ADN y nivel de calidad reconocible** —para construir
filosofía y reputación— **sin competir ni pisar la marca visible del cliente** (cada tenant conserva su
branding). Hace falta un estándar verificable, no un logo pegado encima.

## Decisión
Todo entregable lleva el **sello GSG** en **dos capas**:
1. **Calidad (invisible pero presente):** el entregable **pasó la Auditoría SAP Fiori** (ADR-040 bloque 1)
   y usa el design system/tokens → la "mano" GSG se reconoce aunque el tenant tenga sus colores.
2. **Sello verificable (marcador concreto):** app → `metadata.generator="Gestión Studio Grow"` + crédito
   discreto en el **footer del BACKOFFICE** (`/admin`, `/operador`), **no** en la vidriera del tenant; doc
   → firma "— Elaborado por GSG"; commit → trailer del equipo GSG.

**Principio de NO-COLISIÓN (regla dura):** el sello GSG **nunca compite ni pisa** la marca del cliente en su
superficie pública. En el sitio del cliente manda el cliente; el sello va en **backoffice, metadatos o
entregables propios de GSG**. En **réplica exacta** del front, el sello va **solo en metadatos** (ADR-033).

## Consecuencias
- **(+)** Reputación y coherencia GSG en todo lo que sale, **sin invadir** al cliente (respeta ADR-042: ni
  se replica sin permiso, ni se pisa su marca).
- **(−)** Deuda de UI: `metadata.generator` + crédito en el footer del backoffice hay que **cablearlos una
  vez** en el layout; hasta entonces queda anotado.
- **Es el bloque 2 del Gate** (ADR-040): sin sello, el entregable **no se integra**.

## Estado
**Aceptado — vigente.** Estándar del bloque 2 del Gate de Excelencia; detalle y tabla de marcadores en
`docs/metodologia/estandar-marca-gsg.md`.
