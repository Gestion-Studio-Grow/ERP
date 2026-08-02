---
tipo: checklist
generado: true
tags: [brain/gate, brain/metodologia]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# 🛡️ Gate de Excelencia — el checklist para tildar

> **Copia literal, no resumen.** Se rebana de las fuentes canónicas en cada `npm run brain`, así
> que no puede divergir de ellas. **Ante cualquier duda manda la fuente**, citada en cada bloque.
> Sirve para no pagar 45 KB de lectura en cada push solo para llegar a los ítems.

_Fuente: `docs/METODOLOGIA-SPRINT.md` → GATE DE EXCELENCIA_

## 🛡️ GATE DE EXCELENCIA — obligatorio, NO SALTEABLE (antes de integrar/pushear a main)

**Regla dura:** **ningún cambio se integra ni se pushea a `main` sin pasar el Gate de Excelencia
(UX + Arquitectura + Confiabilidad).** Aplica a **todo frente, en ambos sectores**, en desktop y
móvil. El PMO **no integra** una rama que no lo haya pasado. Es **adicional** a "verde antes de
commitear" (tsc+build+test), no lo reemplaza.

**Fundamento transversal — filosofía SAP/Fiori (excelencia para TODOS los agentes):** *rol-based ·
coherente · simple · adaptable · delightful · calidad enterprise.* Es el estándar de fondo de los
tres equipos de excelencia. **Dos auditorías son OBLIGATORIAS y NO SALTEABLES en TODO desarrollo**
(bloques 1 y 2): la **Auditoría SAP Fiori completa** y el **Sello de Marca GSG**.

Cada frente completa este **checklist** en su handoff (`## Sprint activo`) **antes de pushear**:

**1. 🔎 AUDITORÍA SAP FIORI — completa, OBLIGATORIA (todos los ángulos)** · fundamento y detalle:
`docs/metodologia/auditoria-sap-fiori.md`. No se integra ningún cambio sin pasarla. **7 ángulos:**
- [ ] **Role-based** — cada rol ve lo suyo (OWNER/RECEPTION/PROFESSIONAL/operador); nada de más ni de menos; acciones gateadas por capability.
- [ ] **Coherente** — usa design system/tokens y patrones existentes; no reinventa UI ni wording.
- [ ] **Simple** — el camino feliz es obvio; menos pasos, defaults sensatos, lo secundario revelado de a poco.
- [ ] **Adaptable** — responsive real (móvil+desktop) + branding por tenant; sirve a cualquier tenant/rubro sin fork.
- [ ] **Delightful + enterprise** — estados de carga/vacío/error/éxito cuidados; pulido, sin placeholder feo.
- [ ] **Accesibilidad (a11y)** — labels reales, ARIA/`role="alert"`, teclado+foco visible, contraste, `alt`.
- [ ] **Consistencia** — no introduce variantes de patrones que ya existen; layout/íconos/colores semánticos del sistema.

**2. 🏷️ SELLO DE MARCA GSG — OBLIGATORIO en todo entregable** · fundamento: `docs/metodologia/estandar-marca-gsg.md`.
GSG es el sello de calidad detrás (el tenant conserva SU branding visible). No se integra nada sin sello.
- [ ] **Calidad GSG** — pasó la Auditoría SAP Fiori (bloque 1) → la identidad de calidad está.
- [ ] **Sello verificable** — el entregable tiene su marcador GSG: app → `metadata.generator="Gestión Studio Grow"` + crédito discreto en footer del **backoffice** (no en la vidriera del tenant); doc → firma "— Elaborado por GSG"; commit → trailer del equipo GSG.
- [ ] **No-colisión** — el sello NO pisa la marca visible del tenant en su superficie pública.
- [ ] **Identidad coherente** — usa design system/tokens (no UI ad-hoc): la "mano" GSG se reconoce.

**3. Excelencia Arquitectura**
- [ ] **Capas y límites de dominio** — el cambio vive en su core; no invade fronteras ajenas.
- [ ] **Testabilidad** — lógica pura separable y testeada; no acopla a I/O sin necesidad.
- [ ] **Escalabilidad multi-tenant** — toda query lleva predicado `tenantId` / usa `tenantTransaction`.
- [ ] **Seguridad/RLS** — no rompe el aislamiento; nada evade RLS; secretos fuera del repo.
- [ ] **Deuda técnica** — no suma deuda silenciosa; lo que quede va anotado (ADR / `PROXIMOS-PASOS.md`).

**4. Confiabilidad de Producción (que no rompa prod)**
- [ ] **Tests en verde** — `tsc --noEmit` + `npm run build` + `npm test` pasan.
- [ ] **Aislamiento** — verificado que un tenant no ve datos de otro (donde aplique).
- [ ] **Manejo de errores** — fallas controladas (best-effort/try-catch donde corresponde), sin tumbar el flujo.
- [ ] **No rompe prod** — cambios de schema = migración **SIN aplicar** (Gate 2); nada irreversible se corre solo.

> Si un ítem no aplica, se marca **N/A con una línea de por qué**. Un frente que no puede tildar los
> **cuatro bloques** (Auditoría SAP Fiori · Sello GSG · Arquitectura · Confiabilidad) **NO se integra**:
> vuelve a su worktree hasta que pase. Los bloques 1 y 2 (**Auditoría SAP + Marca GSG**) son
> **obligatorios sin excepción en todo desarrollo**. Es el rol de excelencia que cada frente asume sobre
> su propio cambio antes de entregarlo, y que el PMO reverifica al integrar.

---


---

_Fuente: `docs/metodologia/auditoria-sap-fiori.md` §8_

### 8. Ángulo argentino (Argentinizar SAP) — transversal, OBLIGATORIO
*Lo mejor de SAP, adaptado a la pyme argentina (ver el fundamento arriba y **ADR-044**).*
- [ ] **Criollo claro** — wording en español argentino simple, **como lo diría el dueño de la pyme**; sin
      jerga corporativa ni inglés técnico innecesario. Nombres de campos/acciones que el comerciante entiende.
- [ ] **Fiscal y prácticas locales** — respeta **ARCA/AFIP** (monotributo, factura A/B/C, condición de IVA)
      y **cómo opera de verdad** el rubro en Argentina.
- [ ] **Medios de pago locales** — **Mercado Pago, transferencia, efectivo** como default; no asume
      tarjetas/gateways extranjeros.
- [ ] **WhatsApp-first** — WhatsApp como **canal primario** de contacto/aviso/venta (no email-first); CTAs
      y notificaciones por WhatsApp.
- [ ] **Pyme argentina real** — simple y accesible para su **bolsillo y contexto**: opera desde el celular,
      poca fricción, sin requerir infraestructura cara ni conocimiento técnico.


---

> ⚠️ **Divergencia conocida en las fuentes:** `CLAUDE.md` define el bloque 1 como *7 ángulos +
> ángulo argentino*, pero la versión corta del checklist trae solo los 7 —el argentino vive
> aparte, en §8—. Esta nota **ensambla las dos fuentes** para que no se te escape, pero el
> arreglo va en las fuentes (consolidación), no acá.
