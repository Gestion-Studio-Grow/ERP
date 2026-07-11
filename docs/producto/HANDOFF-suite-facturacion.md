# 🤝 HANDOFF — Suite de Facturación (retomar en otra sesión)

**Fecha:** 2026-07-11 · **Rama de trabajo:** `frente/producto-contador` (worktree `estetica-erp-fiscal`)
**Por qué el handoff:** el clasificador de permisos del sistema (claude-opus-4-8) tuvo una caída
sostenida que bloqueó agentes/comandos/workflows. El trabajo quedó a salvo en el working tree.

---

## ⚠️ LO PRIMERO al retomar

1. **Hay ~104 archivos modificados SIN COMMITEAR** en `frente/producto-contador`. NO están perdidos
   (viven en el working tree), pero tampoco están en git. Al retomar: verificar verde (tsc + npm test +
   next build), correr el Gate, y **commitear por pathspec** (nunca `-A`).
2. **Última verificación conocida antes de la caída: VERDE** — `npx tsc --noEmit` ✅, `npm test` **945/945** ✅,
   `npx next build` ✅, `npx prisma validate` ✅.
3. Modelo de ejecución: el dueño autorizó hacer **TODO lo fiscal/regulatorio en Fable esta vez**
   (override de la norma que lo mandaría a Opus). El resto sigue la norma GSG.

---

## ✅ LO QUE YA ESTÁ HECHO (en la rama, sin commitear)

- **Producto A · Comerciante** — importador de extracto bancario (plugin `src/plugins/bancos`) + glue
  (`src/lib/bancos-*.ts`) + UI (`/admin/facturacion/bancos`). YA estaba en `main` (merge `6735716`) y
  **deployado** en `gsg-erp.vercel.app`. Migración `20260711120000_add_bancos_importacion` YA aplicada a Neon.
- **Producto B · Contador** — cartera multi-cliente: `src/lib/cartera-core.ts` + `cartera-actions.ts` +
  `src/app/contador/**` + `src/modules/descriptors/cartera.ts` + migración
  `20260711140000_add_cartera_cliente` (**SIN aplicar a Neon — Gate 2**).
- **Tema claro/oscuro + login + selector de acento** — tokens exactos de los mockups (blacklight/grafito),
  `ThemeToggle`, `AdminThemeScript`, login rehecho (bug del card de 12px corregido de raíz en
  `globals.css` max-width), página `/admin/apariencia` (toggle + swatches de color del equipo,
  capability `appearance:manage`, `apariencia-actions.ts`).
- **87 fixes de calidad aplicados** (35 UX del Gate ADR-079 + 52 de textos del ADR-080). Bug de 500 en
  runtime corregido (loading.tsx importaba de un módulo "use client" → `data-table-skeleton.ts`).
- **6 ADRs escritos** (075-080): producto bancario, suite un-motor-tres-productos, contador, pricing,
  Gate UX/UI, guía de textos. INDEX.md y ESTADO-ACTUAL.md actualizados.
- **Tenant `gsg`** creado en prod con CUIT 20376833098 (homologación), subdominio `gsg`, módulos
  arca+bancos. `TENANT_HOST_MAP` de Vercel incluye `gsg-erp.vercel.app=gsg`.
- **Docs de negocio:** `docs/producto/blueprint-facturacion-planes.md` (114 conceptos regulatorios +
  planes), `costos-pricing-suite.md`, `plan-construccion-suite-golive.md`, y los runbooks
  `golive-suite-3-productos.md` y `facturacion-bancaria-golive.md`.

---

## 🔨 LO QUE FALTA CONSTRUIR (en orden, spec en plan-construccion-suite-golive.md)

1. **Auto-facturado total MP + banco** (Comerciante + Facturita): OAuth real de Mercado Pago por tenant
   + webhook HTTP + glue real (hoy el MP es stub simulado) → cada cobro aprobado se factura solo.
   Prompt de build ya redactado (ver historial de la sesión / plan-construccion §Frente 1).
2. **Producto C · Facturita** — NO construido. Empaquetado liviano (arca+clients), signup público
   `/facturita`, emisión manual 3 clics, tope 5/mes, + recepción MP. Spec en ADR-076.
3. **Tier PYME "reloj suizo"** (nada de esto existe hoy — verificado por grep): **nómina** (recibos,
   F.931, ART, SAC, CCT 130/75 comercio), **Convenio Multilateral / IIBB** (coeficientes, por
   jurisdicción, percepciones AGIP/ARBA), **feed bancario directo** (evaluar Prometeo/Belvo), **multi-
   sucursal / conciliación por local**. Todo con motor de tablas parametrizadas por vigencia (nunca
   hardcode). Es el frente grande y fiscalmente profundo — por etapas, con Gate cada módulo.
4. **Publicación:** commit+push rama → deploy → migración Gate 2 (OK dueño) → 3 tenants (CUIT del dueño,
   homologación) → 3 dominios (`comerciante-gsg`, `contador-gsg`, `facturita-gsg`) + `TENANT_HOST_MAP`.
   Script listo: `scratchpad/configurar-3-tenants.js`. Runbook: `golive-suite-3-productos.md`.
5. **Entregables por producto:** 1 PDF ejecutivo + 1 MANUAL DE USO paso a paso (Comerciante, Contador,
   Facturita; y Pyme cuando esté).

---

## 🎯 REGLA DE VENTA (crítica — lección de la auditoría)

Vendible/demostrable YA: **Comerciante + Facturita** (extracto/MP → factura automática). El **tier PYME
NO se vende como terminado** hasta que cada módulo pase el Gate — va como premium "en construcción". No
prometer nómina/CM/feed bancario/multi-local como disponibles: no lo están.

## 🔒 GATES PENDIENTES DEL DUEÑO
- **Gate 2:** aplicar migración `20260711140000_add_cartera_cliente` a Neon (+ re-ejecutar RLS SQL).
- **Credenciales:** cert de TEST de ARCA + token de test de Mercado Pago → los pega el dueño en Vercel
  (ARCA_MODO=homologacion, ARCA_CERT_PEM, ARCA_KEY_PEM, ARCA_INVOICING_ENABLED=true).

— Elaborado por GSG · 2026-07-11
