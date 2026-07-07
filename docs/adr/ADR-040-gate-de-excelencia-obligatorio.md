# ADR-040: Gate de Excelencia obligatorio — SAP Fiori (todos los ángulos) + sello GSG + arquitectura + confiabilidad, auditado en Opus

**Estado:** Aceptado — vigente y no salteable
**Fecha:** 2026-07-06
**Depende de:** ADR-032 (la Auditoría GSG corre siempre en Opus), ADR-009 (UX role-based)
**Relacionado:** ADR-033 (excepción de copia exacta), ADR-043 (sello de marca GSG), ADR-044 (Argentinizar SAP — ángulo argentino), ADR-039 (sprint)
**Fuente viva (detalle):** `docs/metodologia/auditoria-sap-fiori.md` · `docs/metodologia/estandar-marca-gsg.md` · `docs/METODOLOGIA-SPRINT.md` → "GATE DE EXCELENCIA"

---

## Contexto
Con **muchos frentes tocando la misma app**, la calidad se **degrada pantalla a pantalla** si no hay una
valla dura antes de integrar. "Verde antes de commitear" (`tsc`+build+test) protege la mecánica, pero **no**
la excelencia de producto ni la coherencia de marca. Hace falta un gate obligatorio, no un "nice to have".

## Decisión
**Ningún cambio se integra ni se pushea a `main` sin pasar el GATE DE EXCELENCIA.** Aplica a todo
frente/sector, desktop y móvil; es **adicional** a "verde antes de commitear". **4 bloques; los bloques 1 y
2 son OBLIGATORIOS SIN EXCEPCIÓN** en todo desarrollo:
1. **🔎 Auditoría SAP Fiori — completa (7 ángulos) + ÁNGULO ARGENTINO:** role-based · coherente · simple ·
   adaptable · delightful/enterprise · **accesibilidad** · **consistencia** · **ángulo argentino**
   (*Argentinizar SAP*: criollo claro · fiscal ARCA · Mercado Pago · WhatsApp-first · pyme argentina —
   **ADR-044**).
2. **🏷️ Sello de Marca GSG** en todo entregable (ADR-043).
3. **Arquitectura:** límites de dominio · testabilidad · escalabilidad multi-tenant (`tenantId`) · seguridad/RLS · deuda anotada.
4. **Confiabilidad de producción:** `tsc`+build+test verdes · aislamiento por tenant · manejo de errores · schema = migración SIN aplicar (Gate 2).

Ítem que no aplica → **N/A + por qué**. Si no tilda los bloques, **no se integra**; el PMO **reverifica** al
integrar. **La Auditoría GSG que corre este Gate va SIEMPRE en Opus 4.8** (ADR-032).

## Consecuencias
- **(+)** Calidad **enterprise y coherente** que no se degrada frente a frente; la marca GSG queda
  garantizada por auditoría, no por buena voluntad.
- **(−)** Costo por cambio (una auditoría antes de integrar) — mitigado porque el Gate es *output-liviano*
  (leer + veredicto) y se corre en Opus solo en ese tramo.
- **Excepción de alcance:** en **réplica exacta del front del cliente**, el bloque 1 se lee como *fidelidad
  al original*, no como conformidad con nuestro estándar (**ADR-033**); el backoffice no tiene excepción.

## Estado
**Aceptado — vigente, no salteable.** Detalle y checklist en los docs de fundamento del Gate; este ADR fija
la decisión y su obligatoriedad.
