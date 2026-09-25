# R0-F1 · migración única de lanzamiento — evidencia (2026-09-25T19:38:40+00:00)
Rama claude/backoffice-estetica-ch-7f2zjx. Todo local (Postgres 5433, /tmp/pgrun). Nada contra Neon, sin deploy.

## Corrección tras el refutador (segunda pasada, 2026-09-25) — manda sobre lo de abajo
Salidas: refutador-antes-despues.txt, ataque-antes-despues.sh/.salida.txt, lab-copia.sh/.salida.txt.
1. La prueba de RLS medía 0001, no la migración (el arnés corre 0001 después de migrate deploy y 0001 borra y
   vuelve a crear la política). Ahora `baseComoElDeploy` (src/lib/lanzamiento-base-postgres.test.ts) arma la base
   como scripts/vercel-build.mjs: migraciones + GRANT, SIN 0001. `fallasDeAislamiento` mide el catálogo (RLS, UNA
   política, USING y WITH CHECK exactos) y la conducta como app_rls (A ve sólo lo suyo; otro negocio y sin negocio,
   0 filas; A no da de alta nada a nombre de B: con INSERT, porque un UPDATE con WHERE lo frena el USING aunque el
   WITH CHECK esté flojo). La reversa re-aplicada con migrate deploy se mide igual. La prueba se prueba a sí misma:
   con USING (true) y con WITH CHECK (true) en el bloque de la migración, falla en las 13 tablas.
   Antes/después: tests viejos + migración con USING (true) = 7/7 verdes (reproduce al refutador); tests nuevos +
   USING (true) = 3 rojos (1, 2 y la reversa); tests nuevos + migración real = 9/9 verdes.
2. Escrituras cruzadas: llaves foráneas con el negocio adentro para IntegracionUso.conexionId,
   OutboxEvent.conexionId, EventoIntegracion.outboxId y ExtractoRecibido.mensajeId (RESTRICT; nulas no se
   verifican: los eventos de ARCA del outbox siguen igual). Los únicos de uso, credencial y evento llevan tenantId:
   con un id ajeno el error es siempre 23503, exista o no la fila del otro, y B sigue sumando su uso. Únicos nuevos
   (tenantId, id) en MensajeWhatsapp y OutboxEvent (destino de esas llaves). La reversa los saca (catálogo idéntico).
3. Cuenta externa: CHECK de forma canónica. conector: minúsculas, dígitos y guiones (también en
   IntegracionEstadoOAuth); cuentaExterna: ASCII imprimible sin espacios (ni invisibles ni ancho completo). Las
   mayúsculas de la cuenta se respetan (hay proveedores con ids que las distinguen).
- Ataques del refutador como app_rls: contra la migración vieja pasan 4 de 5 y el 5.º delata por el único; contra
  la nueva, 5/5 frenados (23503 o 23514). Tests nuevos contra la migración vieja: rojos 5 y 6.
- erp_lab NO se tocó: sigue con la versión ANTERIOR de 20260925120000 (checksum viejo). Ponerla al día: rollback.sql
  nuevo (corre sobre la versión vieja; probado en la copia, paso 2) + migrate deploy, cuando nadie la esté usando.
- Verificación: prisma validate ok; migrate deploy en base vacía ok; drift = sólo Client.phone (a propósito);
  tsc 0 errores; eslint 0; check-coverage exit 0; rls-cobertura + paridad-menu (CH) + ensayo-lote-neon 13/13;
  outbox/ARCA sobre Postgres 122/122.
- Suite completa (node --import tsx --test "src/**/*.test.ts"): 4093 tests, 4088 verdes, 5 rojos = los 4 de XLSX previos (stub local: CDN de sheetjs bloqueado) + "Ingreso en el navegador" (src/app/admin/login/ingreso-pantalla.test.ts), que sola da 5/5 (carga, igual que en la primera pasada). Rojos nuevos: 0.

## Esquema
- npx prisma validate -> The schema at prisma/schema.prisma is valid 🚀
validate exit 0
- npx prisma generate -> Generated Prisma Client (7.8.0) to ./src/generated/prisma in 657ms
- migrate deploy en base VACÍA: 47/47, orden ...20260911 -> 20260925120000_lanzamiento_base -> 20260925150000_comprobante_autorizado_inmutable (base-vacia.txt)
- drift schema.prisma vs migraciones (prisma migrate diff): sólo Client.phone SET NOT NULL, a propósito (base-vacia.txt)
- migrate deploy sobre COPIA de erp_lab tras correr las dos reversas con datos: 46 tablas / 33.494 filas idénticas (md5 por columna), 0 filas con datos en lo nuevo, SIN correr 0001 (antes se corría y tapaba la medición): 13/13 tablas nuevas con RLS y la política exacta, B ve 0 de A, el único frena la misma cuenta, WITH CHECK frena escribir a nombre de otro, CHECK frena 'WhatsApp', la llave frena el uso con la conexión de otro (lab-copia.sh / lab-copia.salida.txt)
- erp_lab: tenía las dos migraciones con el checksum de la PRIMERA pasada; tras la corrección, 20260925120000 cambió y erp_lab quedó con la versión anterior (ver arriba)
- node prisma/rls/check-coverage.mjs -> exit 0 (check-coverage.txt)

## Código
- npx tsc --noEmit -p . -> 0 errores (había 6 en src/lib/lanzamiento-base-postgres.test.ts: anotados los tipos)
- npx eslint --max-warnings=0 src/lib/lanzamiento-base-postgres.test.ts src/lib/rls-cobertura-migraciones.test.ts prisma/rls/check-coverage.mjs -> exit 0
- node --import tsx --test lanzamiento-base-postgres + rls-cobertura-migraciones + src/apps/paridad-menu.test.ts -> 17/17 verdes (primera pasada; la segunda, arriba)

## Dependencias (ADR-103)
- unpdf 1.8.1, pdf-lib 1.17.1, qrcode 1.5.4, @types/qrcode 1.5.6: exactas, resolved registry.npmjs.org, instaladas en node_modules
- npm audit: HEAD 13 (5 moderate, 8 high) = ahora 13 (5 moderate, 8 high); 0 en paquetes nuevos
- xlsx a vendor/: NO hecho (cdn.sheetjs.com bloqueado en este entorno); línea de xlsx sin tocar

## prisma/rls/0001_enable_rls.sql: queda IGUAL a HEAD (decisión)
- El agente anterior le había cambiado sólo la cabecera (comentario; 0 líneas de SQL). Eso rompía 2 tests de
  src/lib/ensayo-lote-neon.test.ts: exigen que 0001 sea byte a byte la copia ensayada en
  docs/runbooks/ensayo-neon/2-rls-despues-del-lote.sql y docs/runbooks/pase-produccion/2-rls-despues-del-lote.sql.
- 0001 no necesita cambios de SQL: las 13 tablas nuevas traen RLS + tenant_isolation DENTRO de la migración
  (check-coverage lo exige) y 0001 re-ejecutado es inocuo (borra y recrea la misma política); la medición ya no lo corre porque la taparía.
- La cabecera propuesta (saca el "NO APLICADA A PRODUCCIÓN", que ya no es cierto) queda en
  0001-cabecera-propuesta.diff para quien regenere los runbooks en el mismo cambio.
- Tras restaurarla: ensayo-lote-neon + rls-cobertura-migraciones + lanzamiento-base-postgres + ingreso-pantalla = 21/21.

## Suite completa (npm test = node --import tsx --test "src/**/*.test.ts")
- 1ª corrida (con la cabecera de 0001 cambiada): 4091 tests, 4084 verdes, 7 rojos = 4 XLSX (previos) + 2 ensayo-lote-neon
  (causados por la cabecera de 0001 → corregido) + 1 ingreso-pantalla en navegador (timing bajo carga; verde sola).
- 2ª corrida (final): 4091 tests, 4087 verdes, 4 rojos = sólo los 4 de XLSX, PREVIOS a este frente
  (src/plugins/bancos/parser/xlsx.test.ts x3 y src/plugins/bancos/handler.test.ts x1: "stub local de xlsx (CDN de
  sheetjs bloqueado en este entorno)"). Rojos nuevos: 0.
- paridad-menu de CH (src/apps/paridad-menu.test.ts): verde.

## Fuera de alcance acá
- vendor/xlsx-0.20.3.tgz: no se pudo bajar (cdn.sheetjs.com bloqueado). Línea de xlsx en package.json sin tocar.
- next build / next start: prohibidos en esta corrida (el criterio del backlog los pide; quedan para quien pueda correrlos).
- Neon: nada aplicado. La migración NO está en prisma/lote-deploy.txt (el lote ensayado): sumarla es decisión del dueño.
