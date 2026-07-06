<!--
Gate de Excelencia — OBLIGATORIO, no salteable (ver docs/METODOLOGIA-SPRINT.md → "GATE DE EXCELENCIA").
Ningún cambio se integra a main sin tildar los tres bloques. Ítem que no aplica: marcar N/A + por qué.
Fundamento transversal: filosofía SAP/Fiori (rol-based · coherente · simple · adaptable · delightful · calidad enterprise).
-->

## Qué cambia y por qué


## Core/frente y sector
<!-- ej. Pagos / ERP · Consultores / Agencia -->

---

## 🛡️ Gate de Excelencia (obligatorio — no se integra sin los 3 bloques)

### 1. Excelencia UX (SAP/Fiori)
- [ ] **Rol-based** — cada rol ve lo suyo (OWNER/RECEPTION/PROFESSIONAL).
- [ ] **Coherente** — usa design system/tokens y patrones existentes; no reinventa UI.
- [ ] **Simple** — camino feliz obvio, menos pasos.
- [ ] **Adaptable** — responsive + branding por tenant; sin fork.
- [ ] **Delightful + enterprise** — estados de carga/vacío/error cuidados.

### 2. Excelencia Arquitectura
- [ ] **Capas / límites de dominio** respetados (el cambio vive en su core).
- [ ] **Testabilidad** — lógica pura separable y testeada.
- [ ] **Escalabilidad multi-tenant** — query con predicado `tenantId` / `tenantTransaction`.
- [ ] **Seguridad / RLS** — no rompe aislamiento; nada evade RLS; secretos fuera del repo.
- [ ] **Deuda técnica** — no suma deuda silenciosa (lo que quede, anotado en ADR/`PROXIMOS-PASOS.md`).

### 3. Confiabilidad de Producción
- [ ] **Verde** — `tsc --noEmit` + `npm run build` + `npm test` pasan.
- [ ] **Aislamiento** — un tenant no ve datos de otro (donde aplique).
- [ ] **Manejo de errores** — fallas controladas, sin tumbar el flujo.
- [ ] **No rompe prod** — cambios de schema = migración SIN aplicar (Gate 2); nada irreversible se corre solo.

> Ítems N/A: listar cuáles y por qué.
