# Datos de prueba cargados en el laboratorio (sólo base `erp_lab`) — vuelta 2, armado 26/09

**Todo lo de este archivo es de PRUEBA y existe sólo en `erp_lab`.** No son datos reales de los
negocios; son *provisionales a confirmar* con cada dueño antes de cualquier uso fuera del laboratorio.
Ninguno se cargó en Neon ni en producción.

## CUIT de prueba

Shine Velas y A Dos Manos estaban en la cartera del estudio sin CUIT (`Tenant.arcaCuit` vacío), así que
el panel del estudio los mostraba sin ARCA configurado. Se les cargó un CUIT válido (dígito verificador
correcto según `src/lib/fiscal/cuit.ts` `validarCuit`) inventado para el laboratorio:

| Negocio | subdominio | CUIT de prueba | Tipo de persona | Estado |
|---|---|---|---|---|
| A Dos Manos Pádel | `adosmanos` | 30-71888801-4 | jurídica | PRUEBA — provisional a confirmar |
| Shine Velas | `shinevelas` | 27-33444555-6 | humana | PRUEBA — provisional a confirmar |

Salida del `UPDATE` (con la condición `arcaCuit IS NULL`, 1 fila cada uno): `cuit-lab-update.txt`.

Para volver atrás (sólo `erp_lab`):
`update "Tenant" set "arcaCuit" = null where subdomain in ('adosmanos','shinevelas');`

## Direcciones del laboratorio (`TENANT_HOST_MAP` de `env-lab.sh`)

Se agregaron los clientes de la cartera del estudio que no tenían dirección: `andino-lab`,
`delsur-lab`, `dontito-lab`, `luciaferro-lab`, `paularios-lab`, `tornillo-lab`. Cada uno entra por
`http://<subdominio>.localhost:3210`. Se respetó el formato que ya tenía la variable
(`<subdominio>.localhost=<subdominio>`, sin puerto): `parseTenantHostMap` descarta el puerto de la
clave (`src/lib/tenant.ts:81`), así que escribir `:3210` en el mapa daba la misma clave.
Antes y después: `tenant-host-map-antes.txt`, `tenant-host-map-despues.txt`.

Queda sin dirección «Ferretería El Tornillo UAT»: está en la cartera pero no tiene subdominio en
`erp_lab`, así que no se puede mapear.
