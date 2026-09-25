# R2-F5 pase a facturación real, porción 2 (evidencia)
- tsc del proyecto: 0 errores (con pase-a-real.server.ts, PaseARealCard.tsx, la action y page.tsx).
- eslint --max-warnings=0: 0 en pase-a-real.ts/.server.ts/.test.ts, pase-a-real-postgres.test.ts, PaseARealCard.tsx, page.tsx, operator-actions.ts.
- node --import tsx --test src/lib/operador/pase-a-real-postgres.test.ts: 9/9 (porcion-2-postgres.txt). Contra Postgres local efímero (5433).
  6 combinaciones (1 pasa, 5 se niegan con motivo); vuelta sin datos; 2 confirmaciones simultáneas = 1 cambio + 1 AuditLog;
  huella vieja (punto de venta y certificado rotado) = nada; slug vacío o ajeno = nada; CH: facu frenado (pasar y volver), núcleo niega solo,
  el dueño sin slug no, con slug sí; B intacto.
- Vecinos (porcion-2-vecinos.txt): pase-a-real.test.ts y paridad-menu verdes; guardia-negocio.test.ts 2 rojos:
  #7 falta registrar operator-actions.ts#cambiarFacturacionReal en la lista (archivo ajeno, pedido en necesita_fuera);
  #6 ver porcion-2-falla6.txt (lista de archivos con endpoints de operador).
- Sin next dev/build/start: la QA clic por clic en el lab queda pendiente.
