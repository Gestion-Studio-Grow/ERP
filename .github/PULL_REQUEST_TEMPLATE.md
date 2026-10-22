<!--
Gate de Excelencia — OBLIGATORIO, no salteable (CLAUDE.md → "Gate de Excelencia" · docs/METODOLOGIA-SPRINT.md).
Ningún cambio se integra a main sin tildar los CUATRO bloques. Ítem que no aplica: marcarlo y escribir "N/A + por qué".
El job `release / gate-pr` rechaza el PR si falta un bloque o queda una casilla sin tildar (docs/release/CHECKLIST-RELEASE.md §2).
-->

## Qué cambia y por qué


## Cómo se verificó
<!-- tsc / tests / build / capturas / recorrido clic por clic -->

## Core/frente y sector
<!-- ej. Facturación / ERP · Facturita / Agencia Digital -->

---

## 🛡️ Gate de Excelencia
### 1. Auditoría SAP Fiori + ángulo argentino
- [ ] Rol-based · coherente · simple · adaptable (responsive + marca del negocio) · delightful/enterprise
- [ ] Accesibilidad (labels reales, ARIA, role="alert", teclado, contraste AA)
- [ ] Consistencia (no duplica patrones existentes)
- [ ] 🇦🇷 Criollo claro · fiscal ARCA · Mercado Pago/transferencia · WhatsApp-first · simple para la pyme
### 2. Sello de marca GSG
- [ ] App: metadata.generator="Gestión Studio Grow" (+ crédito en el footer del backoffice) · doc: «— Elaborado por GSG» · commit: trailer
### 3. Excelencia Arquitectura
- [ ] Capas y límites de dominio · testeable · multi-tenant (tenantId / tenantTransaction) · RLS no evadido · deuda anotada
### 4. Confiabilidad de Producción
- [ ] tsc + build + test verdes · aislamiento por negocio · manejo de errores · no rompe prod (schema = migración SIN aplicar)

> Ítems N/A: listar cuáles y por qué.
