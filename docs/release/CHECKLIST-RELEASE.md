# Checklist de release — ERP GSG (suite de facturación incluida)

**Objetivo:** que al dueño le quede **una sola decisión**: «deployá». Todo lo verificable lo corre una
máquina (`npm run release:preparar`); lo irreversible queda marcado como **paso humano**.

> ⚠️ En este repo **un push a `main` es un deploy de producción** (Vercel `erp-ch` construye cada push;
> CLAUDE.md «Autorización y gates», dato del 2026-10-07). Mergear a `main` = publicar.

---

## 1. Automático — `npm run release:preparar`

```bash
npm run release:preparar                         # todo, con build (≈ 10–20 min)
npm run release:preparar -- --sin-build          # rápido; el build queda «no verificado»
npm run release:preparar -- --smoke https://<preview>.vercel.app --smoke-preview
npm run release:preparar -- --salida reporte.md  # dónde dejar el reporte (default: carpeta temporal)
```

Corre y deja en el reporte (✅/🟡/❌ por paso):

| # | Paso | Bloquea |
|---|---|---|
| 1 | Estado del árbol (rama, commit, archivos sin commitear) | no |
| 2 | `tsc --noEmit` (6 GB de heap, como Vercel) | **sí** |
| 3 | `npm test` (pass / fail / skipped) | **sí** |
| 4 | `npm run test:release` (núcleo del tren) | **sí** |
| 5 | `npm run gate:rls` (cobertura estática de RLS) | **sí** |
| 6 | `npm run gate:sello` (sello GSG en el backoffice, con trinquete) | **sí** |
| 7 | `npm run lint` | no (deuda pre-existente) |
| 8 | `next build` | **sí** (salvo `--sin-build`, que queda «no verificado» y no da LISTO) |
| 9 | Migraciones: nuevas vs `origin/main`, colisiones de timestamp, fuera de `prisma/lote-deploy.txt` | colisión sí; nuevas = aviso (Gate 2) |
| 10 | Versión semver propuesta + borrador de notas | no |
| 11 | Smoke contra una URL (opcional) | **sí** si se pide |

En GitHub esto está repartido en dos workflows: **`gates`** (tsc, tests, rls, build, visual, visual-aa;
lint no bloqueante) y **`release`** (núcleo del tren, sello GSG, checklist del Gate en el PR, notas, smoke
post-deploy). Ver `.github/workflows/`.

## 2. Gate de Excelencia — en la descripción del PR

El workflow `release` → job **gate-pr** verifica que el PR traiga estos 4 bloques y ninguna casilla sin
tildar salvo «N/A + por qué». Copiar en la descripción:

```markdown
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
```

La auditoría en sí la hace la célula de **Auditoría GSG** (Opus); el job sólo verifica que esté declarada.

## 3. Humano — en este orden

1. [ ] **Reporte LISTO** de `release:preparar` (o los dos workflows en verde en la rama).
2. [ ] **Backup de Neon** — Neon Console → Branches → *Create branch* desde `main`, nombre
       `backup-pre-<versión>`. Siempre que haya migraciones; recomendado siempre. Es lo único que deshace
       un error de datos.
3. [ ] **Gate 2 — migraciones pendientes.** Si el reporte lista migraciones nuevas:
       - revisar que estén en `prisma/lote-deploy.txt` (el build frena si lo pendiente no coincide);
       - cargar `MIGRATE_DATABASE_URL` (cadena **directa**, sin `-pooler`, sólo Production) para que el
         build migre; o no cargarla y el build frena si la base está atrás del código (no publica);
       - **no cancelar** un build que está migrando (P3009).
       Si no hay migraciones nuevas: no cargar `MIGRATE_DATABASE_URL`.
4. [ ] **Variables** que pida el release (las pega el dueño, nunca el agente — SEC-1). Para la suite de
       facturación: `ARCA_INVOICING_ENABLED`, `ARCA_MODO`, `CRON_SECRET`, `FACTURACION_FLAGS`
       ([flags.md](../runbooks/facturacion/flags.md)). Certificados: por la consola, por negocio (ADR-066).
5. [ ] **«Deployá»** → merge a `main`.
6. [ ] **Smoke de producción** — lo corre solo el workflow `release` cuando Vercel termina; o a mano:
       `npm run release:smoke -- https://<dominio> --commit <sha>`. Si falla: [rollback.md](../runbooks/facturacion/rollback.md).
7. [ ] **Versión** — `npm run release:notas -- --escribir` (actualiza `CHANGELOG.md`), commit por pathspec,
       después `npm run release:notas -- --tag` y `git push origin vX.Y.Z` (el tag lo publica el dueño).
8. [ ] **RLS** — si el release crea tablas con `tenantId`: re-ejecutar `prisma/rls/0001_enable_rls.sql` en
       Neon (SQL Editor, como `neondb_owner`). El build lo **avisa** (paso 4 de `vercel-build.mjs`), no lo hace.

## 4. Si algo sale mal

[docs/runbooks/facturacion/rollback.md](../runbooks/facturacion/rollback.md) — rollback de app en un clic,
kill-switch de facturación, flags por negocio, restauración de Neon.

---

— Elaborado por GSG (Plataforma, publicación y mantenimiento)
