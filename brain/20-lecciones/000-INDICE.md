---
tipo: indice
generado: true
tags: [brain/indice]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# 🛡️ Lecciones — índice de guardarraíles

> 38 lecciones, una nota por lección. **Leé este índice y abrí solo la que aplica**
> — no el registro entero. Calibración obligatoria antes de tocar Prod/Deploy · Datos/DB ·
> Multi-tenant · Seguridad (ADR-052).

## PD — Prod / Deploy

- **[PD-1](PD-1-build-de-vercel-colgado.md)** — rutas públicas/demo `force-static` sin DB; no matar un build por lento — revisar logs antes.
- **[PD-2](PD-2-deploy-migracion-corridos-solos.md)** — nunca deploy ni `migrate deploy` sin OK explícito; lo irreversible se eleva (ADR-048/049).
- **[PD-3](PD-3-cron-horario-rompe-el-deploy-en-vercel-hobby.md)** — en Hobby, cron diario; si hace falta sub-diario → parar y avisar (es gasto).
- **[PD-4](PD-4-vercel-no-ve-el-repo.md)** — instalar la GitHub App en el scope de la org, no en la cuenta personal.

## DB — Datos / DB

- **[DB-1](DB-1-un-seed-deletemany-contra-prod-borra-todo.md)** — NUNCA seed contra prod; `deleteMany` siempre con `where { tenantId }`; migraciones = carpeta SIN aplicar (Gate 2); destructivo bloqueado por config.
- **[DB-2](DB-2-contador-de-modulos-en-0-op-2.md)** — el alta/preset valida `modules` no vacío; el probador falla ruidoso si faltan.
- **[DB-3](DB-3-migrate-deploy-aplica-todas-las-pendientes.md)** — verificar pendientes con `predeploy-check`; Gate 2 (owner) antes de `migrate deploy`.
- **[DB-4](DB-4-doble-reserva-overbooking-toctou.md)** — invariantes de unicidad/exclusión en la BD (constraint/serializable), no en la app.

## MT — Multi-tenant

- **[MT-1](MT-1-todos-los-tenants-mostraban-la-marca-de-ch-j-2.md)** — toda query lleva predicado `tenantId`; prohibido `findFirst` sin `where`; RLS como backstop.
- **[MT-2](MT-2-la-raiz-del-tenant-redirigia-a-login-c-1.md)** — separar data pública de data admin-gated en las home de tenant; el Gate (role-based §1) lo chequea.
- **[MT-3](MT-3-con-2-tenants-resolvia-el-mas-viejo-en-silencio.md)** — resolución de tenant fail-closed; el alta del 2º tenant dispara RLS (Gate).
- **[MT-4](MT-4-home-pelada-con-1-tenant-a-quien-sirvo.md)** — mapear cada host; nunca `APP_BASE_DOMAIN=vercel.app`; home pelada solo para `/demo`.
- **[MT-5](MT-5-indices-compuestos-que-no-rendian.md)** — toda query con predicado `tenantId` / `tenantTransaction`; RLS enforced en prod (Gate 2).

## DX — Demo / UX

- **[DX-1](DX-1-como-mostrar-el-backoffice-sin-friccion-j-1-j-3.md)** — demo = FASE 1 sin secretos; toggle de persistencia separa demo de operación; nunca datos reales en demo.
- **[DX-2](DX-2-entregable-sin-sello-gsg-op-3.md)** — sin sello no se integra (Gate bloque 2); sello en el backoffice/metadatos, nunca sobre la vidriera del tenant.
- **[DX-3](DX-3-confundir-la-lamina-estatica-con-el-producto.md)** — el entregable es la app real; no mantener láminas paralelas; retirar el preview al servir el producto real.
- **[DX-4](DX-4-cta-de-whatsapp-roto.md)** — cero placeholders de WhatsApp; el link/intent sale del helper único (una fuente de verdad).
- **[DX-5](DX-5-no-es-la-copia-de-la-web-real-hay-que-afinar-el-lapiz.md)** — en todo cliente "réplica exacta" — (a) extraer el sitio real con navegador (tree + `innerText` de header/footer), no solo `WebFetch`; (b) correr el checklist de réplica exacta […]
- **[DX-6](DX-6-una-relacion-seedeada-uniforme-hace-que-el-front-mienta-por.md)** — (1) el provisioning/import de catálogo real captura y aplica la asignación por profesional (nunca `connect`-a-todo ni dejar vacío) — es parte del relevamiento, no un default; si el mapeo real no […]
- **[DX-7](DX-7-fix-de-dato-de-prod-con-guardarrail-sin-seed-sin-deletemany.md)** — todo fix de dato de prod (no-migración) usa script versionado con dry-run default + `--apply` explícito; el diff se imprime campo por campo antes de escribir; scope por `tenantId` de un único tenant, […]

## MP — Metodología / Proceso

- **[MP-1](MP-1-archivos-corrompidos-al-editar.md)** — no alternar file-tool ↔ bash en el mismo archivo; para shell usar heredoc.
- **[MP-2](MP-2-sesiones-pisandose-en-el-tree-compartido.md)** — pathspec siempre, nunca `-A`; editar sobre `origin/main` en worktree descartable; una vez en `origin/main` es permanente.
- **[MP-3](MP-3-servicio-ocupado-por-congestion.md)** — ≤ 4 corriendo; en congestión solo P1 (demos/venta); P2 espera, P3 pausado.
- **[MP-4](MP-4-subagentes-gastando-de-mas-opus-por-herencia.md)** — cada célula etiqueta su modelo explícito; subagentes nunca Opus; Gate GSG siempre Opus.
- **[MP-5](MP-5-despachar-sin-la-foto.md)** — "sin la foto no se despacha"; FASE 0 no salteable.
- **[MP-6](MP-6-worktree-nuevo-sin-dependencias.md)** — `npm install` una vez por worktree; no copiar `node_modules` ni depender de junctions para el build.
- **[MP-7](MP-7-contexto-que-se-relee-a-si-mismo.md)** — acotar el contexto por célula; compactar/cerrar sesiones largas; el repo es la memoria (no el chat).
- **[MP-8](MP-8-sin-red-de-tests-la-logica-regresiona.md)** — la lógica de mayor riesgo (reserva/fiscal/retención/tenant) va con tests; verde antes de commitear.
- **[MP-9](MP-9-frente-reversible-corriendo-en-opus-modelo-mal-etiquetado.md)** — ningún frente arranca sin modelo declarado; reversible → Sonnet; una sesión sin modelo etiquetado está fuera de norma y se corrige antes de trabajar.
- **[MP-10](MP-10-reconciliar-una-rama-vieja-a-main-selectivo-no-git-merge.md)** — reconciliar rama vieja → main por pathspec/delta, no `git merge`; para cada archivo tocado por ambas, comparar contra `main` y traer solo lo nuevo. Colisión de nº de ADR → renumerar el de la rama al […]
- **[MP-11](MP-11-rebase-con-conflicto-en-una-tabla-de-irreversibles-c.md)** — conflicto en una tabla/lista con IDs → antes de resolver, leer qué concepto describe cada lado; si son distintos, conservar ambos y renumerar (como la colisión de ADR de MP-10); actualizar las […]
- **[MP-12](MP-12-estado-actual-md-con-drift-interno-el-handoff-avanza-pero.md)** — en FASE 0, verificar contra git (no contra el propio doc) los 3 anclas duras — `main HEAD` (§1), estado de frentes (§7-bis) y `.claude/agents/` (§8) — y reconciliar TODAS las secciones que citen esos […]
- **[MP-13](MP-13-una-fundacion-gateada-sin-consumidor-real-infla-el-de-avance.md)** — al reportar % de una fundación/flag, distinguir construido de consumido; no contar "listo" una capa sin al menos un consumidor real cableado y verde.
- **[MP-14](MP-14-gating-por-redirect-riesgo-de-loop-si-el-destino-tambien-se.md)** — antes de enforcar gating con `redirect()`, mapear el destino para CADA rol y CADA combinación de módulos apagados; si algún destino puede estar gateado, no redirigir — usar 404/estado neutro o […]
- **[MP-15](MP-15-deviacion-de-una-decision-de-adr-citando-una-autoridad-no.md)** — si una sesión se desvía de un ADR aceptado, trae la confirmación del dueño al mismo commit (nota fechada en el ADR/ESTADO-ACTUAL) o lo marca como propuesta para el Gate — nunca lo commitea como hecho […]

## SEC — Seguridad

- **[SEC-1](SEC-1-secretos-en-el-chat-credenciales-expuestas.md)** — el agente NUNCA toca secretos; si un secreto se expuso, se ROTA de inmediato; el repo lleva solo la plantilla (`.env.vercel.template`).
- **[SEC-2](SEC-2-un-rol-de-app-que-evade-rls.md)** — la app conecta siempre con un rol sin `BYPASSRLS`; verificar aislamiento antes del go-live.
- **[SEC-3](SEC-3-webhooks-y-logins-sin-defensa.md)** — verificar firma de todo webhook; rate-limit en endpoints de auth y API pública.

---

Fuente: `docs/lecciones-aprendidas/registro.md` (ADR-047 la alimenta en cada retro).
