# Auditoría UX contra SAP Fiori — estetica-erp

> Foto de la experiencia contra los 5 principios Fiori (**role-based · coherente · simple · adaptable ·
> delightful/enterprise**). Complementa `MAPA.md` (estructura) con la capa de **UX/UI**. Los ítems
> accionables viven priorizados en `BACKLOG-MEJORAS.md` (sección **UX Fiori**, U1…).

- **Actualizado:** 2026-07-06 · **Autor:** frente Excelencia (explorador UX read-only) · **Base:** `main` @ `28b4778`
- **Alcance:** 18 páginas de `src/app/admin/**`, sitio público `(site)/reserva`, control-plane `operador/`, primitivos `src/components/ui/**`, tokens `globals.css`.

---

## Score por principio

| Principio | Score | Lectura |
|---|---|---|
| 1. Role-based | **8/10** | RBAC correcto (ADR-017); `AdminShell` filtra el menú por capability; home por rol; PROFESSIONAL scopeado. Falta: pantalla de comisiones (capacidad sin UI dedicada). |
| 2. Coherente | **5/10** | ✅ tokens + primitivos maduros · ❌ ~50% de forms admin **no** usan `<Field>` · ❌ toggles con `bg-black` hardcodeado (ignoran marca/tenant) · ❌ placeholders usados como labels. |
| 3. Simple | **6.5/10** | Flujos core cortos y progresivos (turno, caja, reserva). ❌ `catalogo/page.tsx` concentra 6 secciones (scroll largo); ficha de profesional densísima. |
| 4. Adaptable | **7/10** | Responsive general OK + branding multi-tenant maduro (`branding.ts`, tema front/back inverso, contraste AA). ❌ POS/Caja flojos en mobile (ADR-009 pide mobile-first operativo); header de sitio con estilos inline. |
| 5. Delightful/enterprise | **4.5/10** | Caja es el mejor caso (loading+error+empty). ❌ ~60% de forms chicos sin **pending feedback** · empty states genéricos (sin icon/CTA) · errores sin `role="alert"` en varios. |
| **Promedio** | **6.2/10** | Fundación sólida; la incoherencia operacional en formularios es lo que baja el puntaje. |

---

## Fortalezas confirmadas (mantener)
- **Design system token-driven** (`globals.css`, 155+ vars semánticas: `--surface/--text-strong/--accent/--focus-ring`).
- **Primitivos** `Button/Card/Field/Badge/Heading` bien diseñados; `Field` ya trae label+hint+error accesibles.
- **RBAC** (`capabilities.ts`) aplicado en navegación y en loaders server-side.
- **Branding por tenant** maduro: acento dinámico con contraste AA, favicon/monograma, tema front-claro/back-oscuro.
- **Referencias de excelencia:** `caja/` (estados completos) y `BookingModal` (focus trap, Escape, aria) — usar como patrón a replicar.

---

## Top hallazgos (impacto alto → bajo)

| ID | Severidad | Hallazgo | Evidencia (muestra) |
|---|---|---|---|
| U1 | 🔴 Alto | Forms admin sin `<Field>` → inputs sin `htmlFor`/label (WCAG 1.3.1) | `turnos/NewAppointmentForm.tsx`, `usuarios/page.tsx`, `pedidos/PosForm.tsx`, `recordatorios/page.tsx`, `ajustes/AjustesForm.tsx` |
| U2 | 🔴 Alto | Placeholder usado como label (WCAG 3.3.2) | `(site)/reserva/BookingForm.tsx:39`, `recordatorios/page.tsx:66`, `usuarios/page.tsx:165` |
| U3 | ✅ hecho | ~~Toggles `bg-black text-white` hardcodeado~~ → `bg-accent text-on-accent` (respeta tenant/tema) | `pedidos/PosForm.tsx`, `ajustes/AjustesForm.tsx`, `compras/ComprasForm.tsx` |
| U4 | 🟠 Medio | ~60% de forms chicos sin pending feedback (existe `SubmitButton`, no se usa) | `PosForm.tsx`, `AjustesForm.tsx`, `ComprasForm.tsx` |
| U5 | 🟠 Medio | `catalogo/page.tsx` sobrecargado (6 secciones en una) + ficha profesional densa | `catalogo/page.tsx`, `catalogo/ProfessionalsSection.tsx` |
| U6 | 🟠 Medio | POS/Caja no optimizados para mobile (ADR-009) | `pedidos/PosForm.tsx`, tablas sin scroll-x en SM |
| U7 | 🟠 Medio | Errores sin `role="alert"` (lector no los anuncia) | `NewAppointmentForm.tsx:80`, `BookingForm.tsx` |
| U8 | 🟡 Bajo | `BookingForm` redeclara estilos de input en vez de usar el primitivo | `(site)/reserva/BookingForm.tsx:39-40` |
| U9 | 🟡 Bajo | Empty states genéricos (texto plano, sin icon/CTA) | `ClientsList.tsx`, `pedidos/page.tsx`, `auditoria/page.tsx` |
| U10 | 🟡 Bajo | Header de sitio con estilos inline (revisar mobile estrecho) | `(site)/_ch/Header.tsx:30` |

**No revisadas en detalle** (siguiente pasada): `clientes/[id]`, `espera`, `resenas`, `reportes`, `localizacion`, `admin/login`.

---

## Naturaleza de los arreglos
Casi todos son **aditivos y de bajo riesgo** (envolver en `<Field>`, sustituir `bg-black`→token semántico, sumar `role="alert"`, usar `SubmitButton`). Pero son cambios de **UI no cubiertos por tests unitarios** → se verifican por `build` + preview y **son decisiones visuales**, por lo que se despachan con OK del dueño (no unilateralmente), en tandas coherentes. La partición de Catálogo y el mobile de POS son **cambios grandes** → backlog + OK.
