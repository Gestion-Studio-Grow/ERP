# R3-F1 · Comprobante PDF con QR de ARCA — porciones 1 y 2 (2026-09-25)

## Porción 1 (sigue valiendo)
Generador único `src/lib/comprobante-pdf.ts` (pdf-lib + qrcode, QR con `urlQrAfip`), lector único `src/lib/comprobante-pdf-datos.ts` (RLS + tenantId), vista `src/app/admin/(dashboard)/facturacion/comprobante/[id]/page.tsx` y descarga `.../[id]/pdf/route.ts` (requireApp("facturacion") + requireCapability("billing:manage")), lector de QR de tests `src/test/lector-qr.ts`.

## Porción 2 (esta)
1. Render real del PDF (PyMuPDF 1.28.2 instalado sólo en el scratchpad, no es dependencia del proyecto). Se encontraron dos defectos visibles: el recuadro de la letra pisaba "FACTURA" y "COD. 006" pisaba "Punto de venta" y "Fecha de emisión"; y los rótulos quedaban pegados al valor ("Razón social:Velas"). Arreglados (recuadro 48x56 con el código adentro, columna derecha a cx+32, "Comp. nro" alineado a la derecha, espacio entre rótulo y valor medido aparte porque `sanear` recorta).
   Medición (solapes-pdf-antes.txt → solapes-pdf.txt, script de cajas de texto con PyMuPDF): antes 10 y 11 pares de textos que se pisaban, varios en la misma línea; después 5 y 6 pares, todos entre renglones vecinos en vertical (cajas tipográficas de líneas a 11-14 pt), ninguno en la misma línea, 0 textos cortando el recuadro de la letra, 0 fuera del margen. La A se miró en la imagen (muestra-factura-A.png): sin choques.
2. Factura A con el detalle completo: cada renglón con precio sin IVA, alícuota y subtotal sin IVA (`detalleSinIva`). Reparte la base autorizada por ARCA en proporción al importe de cada renglón con `redondearAlCentavo` (src/lib/dinero); el último renglón se lleva los centavos, así la suma da justo el neto impreso. Con más de una alícuota, con neto distinto de la base, sin desglose o sin renglones: no imprime y dice por qué.
3. Vista: el detalle de la A muestra lo mismo que el PDF; la cantidad sale con coma decimal (`cantidadImpresa`).

## Comandos y resultado
- Rojo antes de implementar: tests-r3f1-porcion2-rojo.txt → 22 tests, 19 pass, 3 fail (los 3 nuevos).
- `node --import tsx --test src/lib/comprobante-pdf.test.ts src/lib/comprobante-pdf-postgres.test.ts` → 24 tests, 24 pass, 0 fail, 0 skipped (tests-r3f1.txt). Los 2 de Postgres corren contra la base efímera como app_rls (aislamiento: otro negocio no lee el comprobante).
- `node --import tsx --test src/apps/paridad-menu.test.ts` → 4/4 (paridad-menu.txt): CH no ve cambios en el menú.
- `npx tsc --noEmit -p tsconfig.json` → exit 0, 0 errores (tsc.txt). `npx eslint --max-warnings=0` sobre los 7 archivos → exit 0 (eslint.txt).
- Muestras regeneradas con muestras.ts: muestra-factura-B-modo-prueba.pdf/.png, muestra-factura-A.pdf/.png.

## Refutador fiscal
No se corrió como agente independiente (esta corrida no tiene cómo lanzarlo). Pasada adversarial propia: la fuente primaria de la RG 1415 Anexo II no se pudo abrir (el proxy rechaza afip.gob.ar, argentina.gob.ar, unc.edu.ar y unlz.edu.ar). NO VERIFICABLE: si la "condición de venta" (contado, cuenta corriente) es obligatoria en el impreso; hoy el PDF no la lleva y el comprobante no la guarda.

## Qué no se midió
- La vista en el navegador a 412 px: sin next dev/build. Los dos botones usan ButtonLink tamaño md = h-11 = 44 px (src/components/ui/Button.tsx:54): verificado en código, no medido en pantalla.

## Corrección del refutador (2026-09-25)
1. Leyenda RG 5003/2021 en la A al monotributista: `leyendasDeLaA` (src/lib/comprobante-pdf.ts) le pregunta al motor fiscal (`decidirComprobante`) qué A emitiría al mismo cliente, fecha y total, y toma sus leyendas con texto: la regla y el texto viven en decidir-comprobante.ts:1275-1284, no hay copia. Va en un recuadro abajo a la izquierda (muestra-factura-A-monotributista.pdf/.png, 3 renglones, 0 textos pisados en la misma línea, 0 fuera del margen: solapes-pdf-correccion.txt). La vista la muestra entera en la sección «Leyendas». Si el motor no llega a una A, no se imprime (faltante «leyendas»).
2. Marca «sin validez fiscal»: `ambienteDelComprobante` usa `emiteConValidezFiscal(arcaHomologacion, modoDesdeEnv())` (monitor-core.ts:253) y el último cambio de ambiente del negocio (AuditLog `changes.arcaHomologacion.despues`, que deja el pase a real y la vuelta a pruebas). Autorizado antes (o en el mismo instante) de ese cambio: no se imprime (faltante «ambiente», que dice cómo buscarlo en ARCA). En prueba, el pie ya no dice «Comprobante autorizado por ARCA… verificar con el QR».
3. Condición del cliente contra la letra: `faltantesDelComprobante` usa RECEPTORES_ADMITIDOS y CONDICION_IVA_RECEPTOR_ID (decidir-comprobante.ts:145-164). Una B a quien hoy figura inscripto, o una A a exento o consumidor final, no se reimprime.

Comandos:
- Rojo antes de implementar: tests-correccion-rojo.txt → 29 tests, 22 pass, 7 fail (6 nuevos + el de modo de prueba adaptado al campo nuevo).
- Unitarios + Postgres: tests-correccion.txt → 32 tests, 32 pass. El de Postgres corre como app_rls: ARCA_MODO=homologacion da «prueba» aunque el negocio diga real; el cambio de ambiente de otro negocio no afecta; lo autorizado antes del cambio propio no se imprime.
- Un test viejo cambió su expectativa: la A a un DNI sin condición ahora también avisa «receptor.condicionIva» (consumidor final no recibe A).
- tsc: exit 0, 0 errores (tsc-correccion.txt). eslint --max-warnings=0 en los 6 archivos del frente: exit 0 (eslint-correccion.txt). paridad-menu 4/4 (paridad-menu-correccion.txt).

Queda (necesita migración, fuera del frente): guardar en Invoice, al autorizar, el ambiente de ARCA y la condición informada (CondicionIVAReceptorId) con nombre y domicilio del receptor. Sin eso: un cambio de ARCA_MODO de la plataforma no se registra, y un cliente que pasó de inscripto a monotributista (o al revés) después de una A cambia la leyenda al reimprimir.
No medido: la vista a 412 px (sin next dev ni build).
