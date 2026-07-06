# 🔁 Plan de reconversión de clientes — de `/previews` estáticos a producto real / demo del flujo

> **Concepto (corregido, vigente):** el entregable de un negocio es el **producto REAL (front + backoffice)
> servido en su URL con nombre de cliente**, no una lámina estática. **Consolidados = producto real (sin
> preview estático). Demo/prospecto = la app del flujo en modo demo, en una URL de cliente.** Fundamento:
> `docs/metodologia/demo-publica-costo-cero.md → "CONCEPTO CORREGIDO"`.
>
> **Alcance de este doc:** estado real por cliente + plan ordenado y priorizado + qué hacer con
> `public/previews/*`. **Doc/plan only — NO ejecuta altas en Neon ni deploys** (Gate 1 = deploy con OK del
> dueño; Gate 2 = tocar Neon con OK del dueño). Respeta modo ahorro y tope de **4 sesiones** concurrentes.

---

## 1. Estado real por cliente

| Cliente | Rubro | ¿Tenant real en Neon? | URL (`TENANT_HOST_MAP`) | Estado | Qué falta |
|---|---|---|---|---|---|
| **CH Estética** | estética / servicios (turnos) | ✅ **sí** | `chestetica-erp.vercel.app` | ✅ **REAL y VIVO** | Solo **retirar** su preview estático `public/previews/chestetica/` + confirmar sello GSG en backoffice. |
| **Magra** | carnicería / retail | ✅ **sí** (alta hecha) | `magra-erp.vercel.app` (ya en el mapa) | 🟡 **casi — falta servir/verificar** | **Verificar que levante con la llave ya cargada** (host→tenant + `DATABASE_URL`); agregar el dominio al proyecto Vercel si falta; **publicar (Gate 1, OK dueño)**; retirar su preview. **No toca Neon.** |
| **A Dos Manos** | retail / tienda (pádel) | ❌ **no** (solo preview) | `adosmanos-erp.vercel.app` (mapeo previsto) | 🔒 **gated (Neon)** | **Alta como tenant real** (blueprint **retail/tienda**) → **requiere OK del dueño para tocar Neon (Gate 2)**. Luego servir front+back + retirar preview. |
| **Shine** | retail / tienda (velas/deco) | ❌ **no** (solo preview) | `shinevelas-erp.vercel.app` (mapeo previsto) | 🔒 **gated (Neon)** | Igual que A Dos Manos: **alta tenant real retail** → **OK Neon (Gate 2)**. Luego servir + retirar preview. |
| **Break Point** | preventa (pádel) | ❌ (es prospecto) | `breakpoint-erp.vercel.app` (demo) | 🎬 **DEMO / preventa** | Queda como **demo del flujo**: front+back que salen del Generador de Preset / Adaptador cuando el motor esté. Su preview estático = **demo interina** hasta entonces. |

> Nota: el `TENANT_HOST_MAP` ya contempla los cuatro consolidados (`chestetica-erp`, `magra-erp`,
> `shinevelas-erp`, `adosmanos-erp` → su subdomain), verificado en `src/lib/tenant.test.ts`. Lo que falta
> **no** es el ruteo, es **la existencia del tenant real en Neon** (A Dos Manos / Shine) y **publicar**.

## 2. Qué hacer con `public/previews/*` (deprecación ordenada)

- **Consolidados** (`chestetica`, `magra`, `adosmanos`, `shinevelas`): **retirar** el preview estático
  **cuando su URL real ya sirve** el producto — **no antes** (para no dejar la URL sin nada). Orden:
  **CH ahora** (ya es real); **Magra** al publicar; **A Dos Manos / Shine** al darse de alta. Hasta ese
  momento, quedan marcados **DEPRECADOS** (stopgap, no son el entregable).
- **Prospecto** (`breakpoint`): **se mantiene** como **demo interina** hasta que exista el front+back del
  flujo; ahí se reemplaza por la app en modo demo.
- **Regla:** ningún consolidado conserva preview estático una vez servido su producto real. El estático es
  transición, no destino.

## 3. Plan ordenado y priorizado (modo ahorro · ≤ 4 sesiones · en olas)

Prioridad según `CLAUDE.md → CONCURRENCIA Y PRIORIDADES` (P1 = lo que ya es cliente/vende; foco demos) y el
ciclo **DEMO → VENTA → INVERSIÓN** (consolidados = post-venta → se sirven; prospecto = demo).

### 🌊 Ola 1 — P1, SIN tocar Neon, máxima palanca / mínimo costo
1. **Magra — servir + verificar** (no requiere Neon: el tenant ya existe).
   - Verificar que `magra-erp.vercel.app` **resuelve al tenant `magra`** y que **levanta con la llave ya
     cargada** (`DATABASE_URL`/`OPERATOR_DATABASE_URL`, RLS `app_rls`).
   - Agregar el dominio `.vercel.app` al proyecto si faltara (config de Vercel, sin secretos).
   - **Publicar = Gate 1** (acción del dueño: *"deployá"*). Al confirmar vivo → **retirar** su preview.
2. **CH Estética — cierre de reconversión** (ya real y vivo): **retirar** `public/previews/chestetica/` y
   confirmar el **sello GSG** en el footer del backoffice. Cleanup de bajo costo.

### 🌊 Ola 2 — P2 / GATED, requiere OK del dueño para Neon (Gate 2)
3. **A Dos Manos y Shine — alta como tenants reales (retail/tienda).**
   - **Preparar el paquete de alta LISTO para un solo tiro** (sin ejecutar): blueprint `retail`/tienda por
     rubro, `subdomain`, entrada en `TENANT_HOST_MAP` (ya prevista), preset del flujo (branding/catálogo
     demo), `.env.vercel.template`. Todo lo **no secreto** queda cableado en el repo.
   - **Ejecutar el alta SOLO con OK explícito del dueño (Gate 2 — tocar Neon).** Con RLS activo y el
     aislamiento verificado. Luego servir front+back en su URL y **retirar** sus previews.
   - Los **secretos los pega el dueño** (FASE 2 de credenciales).

### 🔁 Continuo — P1 demo/preventa
4. **Break Point — demo del flujo.** Cuando el motor de preset/adaptador entregue el front+back en modo
   demo, publicarlo en `breakpoint-erp.vercel.app` (FASE 1, sin datos reales) y jubilar su preview interino.

## 4. Gates y lo que NO se ejecuta ahora

- **NO se ejecuta ninguna alta en Neon** (A Dos Manos / Shine) — quedan **preparadas** y **gated** al OK
  del dueño (**Gate 2**). Es lo único irreversible.
- **NO se publica/deploya** sin OK del dueño (**Gate 1**, *"deployá"*). Magra queda **lista para publicar**.
- **Modo ahorro:** trabajo por olas de ≤ 4 sesiones; primero lo que ya es cliente (Magra/CH), lo gated
  después. Sin golpear Neon para "verificar" (leer del repo/estado; la verificación real de que Magra
  levanta se hace en el momento de publicar, con el dueño).
- **Todo pasa por el Gate GSG** antes de integrar; los frentes que sirven front replicado aplican la
  **regla de copia exacta** (`docs/metodologia/auditoria-sap-fiori.md`): fidelidad al cliente en el front,
  Gate completo en el backoffice.

## 5. Resumen ejecutivo (una línea por cliente)

- **CH** ✅ real/vivo → retirar preview.
- **Magra** 🟡 tenant listo → verificar + **publicar (OK dueño)** → retirar preview. *Sin Neon.*
- **A Dos Manos** 🔒 → **alta Neon (OK dueño)** → servir → retirar preview.
- **Shine** 🔒 → **alta Neon (OK dueño)** → servir → retirar preview.
- **Break Point** 🎬 → demo del flujo cuando esté; preview interino mientras tanto.

— Elaborado por **Gestión Studio Grow (GSG)**.
