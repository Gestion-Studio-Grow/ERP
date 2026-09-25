# R2-F5 pase a facturación real, porción 3: corrección del refutador fiscal (evidencia)

Comandos (salidas completas en los .txt de esta carpeta):
- node --import tsx --test src/lib/operador/pase-a-real.test.ts -> 11/11 (porcion-3-unit.txt)
- MISMOS tests contra la decisión de ANTES (copia en el scratchpad con la rama de delegación y sin
  la sexta condición) -> 4 rojos: 7 combinaciones, delegación, comprobantes de prueba, huella
  (porcion-3-unit-ANTES.txt). Falla antes, pasa después.
- node --import tsx --test src/lib/operador/pase-a-real-postgres.test.ts -> 10/10 contra Postgres
  efímero (5433), 0 salteados (porcion-3-postgres.txt). Nuevo: negocio con 1 PENDING + 1 envío
  abierto se niega y no cambia nada (columna y AuditLog iguales), también llamando al núcleo directo;
  1 autorizada en pruebas se niega; lo autorizado antes de la última vuelta no cuenta y el pase entra
  con el conteo en AuditLog; lo autorizado después de la vuelta vuelve a negar con la fecha.
- npx tsc --noEmit -p . -> exit 0, 0 errores (porcion-3-tsc.txt)
- npx eslint --max-warnings=0 (pase-a-real*.ts, PaseARealCard.tsx, page.tsx, operator-actions.ts) -> exit 0
- Vecinos: paridad-menu 4/4; plan-del-negocio 10/10; apps-del-negocio 22/22; comprobante-pdf 29/29;
  comprobante-pdf-postgres 3/3; guardia-negocio 4/6: los 2 rojos son plan-actions.ts (R2-F4) sin
  registrar en la lista del trinquete (archivo ajeno; cambiarFacturacionReal ya figura).

Cambios:
1-2. Sexta condición `comprobantesDePrueba`: PENDING, envíos InvoiceCreated abiertos y AUTHORIZED
     desde la última vuelta a pruebas (AuditLog arcaHomologacion.despues=true; authorizedAt ?? createdAt,
     >=). Contado en pase-a-real.server.ts con app.current_tenant_id fijado y RELEÍDO bajo el bloqueo.
     Motivos en castellano; el conteo queda en AuditLog.changes.comprobantesDePrueba.
3.   Tarjeta: la vuelta a pruebas ya no dice "no cambian"; dice que no se reimprimen (Mis Comprobantes
     de ARCA), que Facturación muestra pruebas y que lo autorizado en pruebas frena el próximo pase.
4.   Credencial: sólo certificado de producción del mismo CUIT; la delegación queda como aviso.
5.   page.tsx monta PlanDelNegocioCard (pestaña Plan y apps, ?plan= abre su vista previa); el plan
     de antes se muestra sólo si el negocio no tiene plan o tiene uno de los de antes.

Sin next dev/build/start: QA clic por clic en el lab PENDIENTE.
