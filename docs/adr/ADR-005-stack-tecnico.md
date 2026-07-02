# ADR-005: Stack Técnico

**Depende de:** ADR-001 (RLS/exclusion constraints → requiere Postgres sí o sí)

## Decisiones (sin alternativas largas — van directo, son consecuencia de lo ya decidido)

| Capa | Elección | Por qué |
|---|---|---|
| **Base de datos** | PostgreSQL gestionado. Arrancar en **Neon** o **Supabase** (tier gratuito/barato, branching de DB útil para testing). Migrar a **RDS/Aurora Postgres** cuando el volumen justifique control fino de réplicas. | ADR-001 y ADR-004 ya exigen RLS + `EXCLUDE USING GIST` → no hay alternativa real a Postgres. |
| **Backend** | **Node.js + TypeScript + NestJS.** | NestJS fuerza estructura modular con Dependency Injection — mapea 1 a 1 con "Business Capabilities" de ADR-002 sin pelear contra el framework. TypeScript comparte tipos con el frontend (menos bugs de contrato API). Pool de devs en Argentina amplio y costo salarial razonable vs. .NET/Java senior. |
| **Frontend** | **Next.js (React) + TypeScript.** | Mismo lenguaje que el backend. SSR para el marketplace/landing público, CSR para el panel del ERP. |
| **Job queue / workers (outbox dispatcher de ADR-002)** | **pg-boss** sobre la misma Postgres. | Cero infraestructura nueva. Migrar a Redis Streams o Kafka solo si el volumen de eventos/seg lo justifica — no antes. |
| **Cache** | **Redis** (Upstash serverless al inicio — cobra por uso, no por instancia fija). | Sesiones, rate limiting, cache de queries pesadas. Upstash evita pagar una instancia 24/7 para tráfico bajo. |
| **Object Storage** | **Cloudflare R2**, no S3. | Compatible con API S3, pero sin costo de egress — importante porque vas a servir imágenes de catálogo/comprobantes constantemente. |
| **Hosting (Fase 1-2, hasta ~100 tenants)** | **Railway o Render.** | Deploy simple, sin equipo de DevOps dedicado, costo predecible. |
| **Hosting (Fase 3, escala)** | Migrar a **AWS ECS Fargate** o equivalente contenedorizado, con autoscaling real. | Recién cuando el ahorro de control operativo pese más que la simplicidad de Railway — no migres antes de necesitarlo, es trabajo que no aporta al piloto. |
| **Auth** | **Custom, no Auth0/Clerk.** JWT + refresh tokens, librería tipo Lucia o implementación propia sobre `argon2`. | Necesitás manejar `tenant_id` como claim de sesión para que RLS funcione (`SET app.tenant_id`) — eso ningún vendor de auth genérico te lo resuelve gratis, y a partir de cierto volumen de usuarios el pricing por MAU de Auth0/Clerk se vuelve caro rápido. Ya vas a tener que construir la capa de tenant-context de todas formas. |
| **CDN** | Cloudflare (gratis en el tier base). | Ya lo necesitás si usás R2 del mismo proveedor. |
| **Observabilidad** | **Axiom o Grafana Cloud (tier gratuito)** para logs, **Sentry** para errores. | Barato/gratis a bajo volumen, escala con uso, evita operar tu propio stack ELK. |

## Riesgo a marcar
No caigas en la tentación de arrancar directo en Kubernetes o AWS "porque a futuro va a hacer falta". Con 3 personas, cada hora en Terraform/K8s es una hora que no vas al piloto. Railway/Render te dan 90% del beneficio operativo con 10% del esfuerzo hasta que el volumen realmente lo exija.
