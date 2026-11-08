# Relevo · especialista del 07/11 (sesión session_01BtqRUHpCmAu5CBAaDE233v)

## Hecho
- T1 manual CH vs modo simple: informe + cambios enviados a la orquestadora. En producción, nadie de beauty-spa
  tiene `ui:modo-simple` (Carolina ve el panel completo). La tabla UserPermissionOverride está aplicada.
- T2 CI de main: PR #42 (claude/ci-main-club-codigo) arregla el lector del pedido por WhatsApp en
  `motor.mjs:3911` (2,4 % de los códigos) y la versión de la hoja. Pendiente de decisión: redondeos-locales
  (31 líneas, deuda de plata), ensayo-lote-neon (generador con lote vacío → `IN ()`, Gate 2) y el gate visual sin base.
- T3 #40: merge de main en claude/sena-obligatoria (9d2dfab, pusheado). tsc 0 · 160/160 · `next build` OK.
- T5 #41 MIA: merge de main limpio en un worktree local (no pusheado). Migración 20261107120000 aditiva, con RLS
  y fuera del lote. NO publicar hasta que Ale confirme los porcentajes.
- T6 Break Point: breakpoint.modules ya trae club, clients y pos. Nada que aplicar.
- Pedido del dueño: frente «Estética del backoffice + marca GSG», con el brief ya enviado a la orquestadora.

## Falta (orden)
1. T3: QA clic por clic de los avisos de seña (regla prendida y apagada) sobre una base local con seed; después,
   publicar según las reglas de Factory (respaldo Neon, CI verde, Vercel READY, un PR a la vez).
2. T5: build de MIA (sin publicar).
3. T4: UAT de todos los roles por tenant → docs/tenants/<cliente>/UAT-2026-11.md.

## Ojo
- Turbopack no acepta `node_modules` como symlink en un worktree: usar `cp -al`.
- En un worktree hace falta `npx prisma generate` antes de tsc/tests.
