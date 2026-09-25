# r2f4-r3f3-plan — porción 2 (2026-09-25)

## Comandos y resultados (salidas completas en esta carpeta, prefijo p2-)
- `node --import tsx --test src/lib/operador/plan-escritura-postgres.test.ts` (Postgres efímero 5433, RLS): 4/4.
  Micro→PyME→Micro con conteos por tabla iguales y mismas pantallas; vista previa = base después de aplicar;
  foto vieja ⇒ "cambio"; CH bloqueado (vista previa, escritura directa y ajuste de límite); filas forjadas con app_rls no cambian plan ni topes.
- `node --import tsx --test src/lib/usuarios-del-plan-postgres.test.ts`: 4/4. Micro con 2 usuarios no crea un tercero
  (motivo «Tu plan incluye hasta 2 personas con usuario…»); ajuste 3 deja entrar uno; sin plan y CH sin tope; dos altas simultáneas por el último lugar ⇒ entra una; reactivar con el lugar lleno ⇒ no.
- Puros: plan-formulario (+ trinquete de quién escribe plan/límites), plan-del-negocio, perfil-datos: 21/21. reglas.ts (bancos) 18/18. alta-usuario 5/5.
- Vecinos (operador, cambios, planes, modules, ficha, usuarios, paridad-menu, guardia-paginas): 339 tests, 336 ok, 3 rojos:
  1 (alta-usuario) ya corregido y verde; 2 del trinquete guardia-negocio.test.ts: faltan registrar los 2 endpoints nuevos (archivo ajeno, pedido en necesita_fuera).
- `npx tsc --noEmit`: 0 errores. `npx eslint --max-warnings=0` sobre los 13 archivos del frente: 0.
