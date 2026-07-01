# 🔒 Dominócito Backend — Security Audit

**Fecha:** 2026-06-18  
**Auditado por:** Dev subagent  
**Scope:** `~/clawd-dev/dominocito/backend/src/`  
**Estado:** ✅ Fixes aplicados — Pendientes para producción documentados abajo

---

## Resumen Ejecutivo

Se auditaron 10 vectores de ataque. Se encontraron **6 vulnerabilidades críticas/altas** y **4 menores/buenas prácticas**. Todas fueron corregidas. El código ya pasaba bien en SQL injection y manejo de transacciones atómicas.

---

## Vulnerabilidades Encontradas y Fixes Aplicados

### 1. 🔴 CRÍTICO — Admin endpoints sin autenticación

**Estado:** ✅ CORREGIDO

**Problema:**  
`POST /admin/sorteos/crear` y `POST /admin/sorteos/:id/revelar` eran completamente públicos. Cualquier persona podía crear sorteos o revelarlos arbitrariamente.

**Fix aplicado:**
- Nuevo middleware: `src/middleware/adminAuth.ts`
- Requiere header `X-Admin-Key` con valor igual a `ADMIN_API_KEY` en `.env`
- En desarrollo con `ADMIN_LOCALHOST_ONLY=true`, permite llamadas desde `127.0.0.1/::1` sin key
- En producción: siempre requiere `X-Admin-Key` — si `ADMIN_API_KEY` no está configurado, el servidor rechaza todas las peticiones admin con 503
- Applied via `router.use(requireAdmin)` al inicio de `admin.ts`

**Cómo usar:**
```bash
curl -X POST http://localhost:3200/admin/sorteos/crear \
  -H "X-Admin-Key: dev_admin_key_change_in_production" \
  -H "Content-Type: application/json"
```

---

### 2. 🔴 CRÍTICO — JWT_SECRET con fallback hardcodeado

**Estado:** ✅ CORREGIDO

**Problema:**  
```typescript
// ANTES — peligroso
const secret = process.env.JWT_SECRET || 'fallback_secret';
```
Si `JWT_SECRET` no estaba en `.env`, todos los tokens se firmaban con `'fallback_secret'`, una clave predecible que cualquiera podía usar para forjar JWTs válidos.

**Fix aplicado:**
- El servidor **falla al iniciar** si `JWT_SECRET` no está definido (`process.exit(1)` en `index.ts`)
- El middleware `auth.ts` usa `process.env.JWT_SECRET as string` (nunca fallback)
- Si por alguna razón llega a auth.ts sin secret, retorna 500 con log de error crítico
- Errores JWT diferenciados: `TokenExpiredError` → 401 con mensaje de expiración; `JsonWebTokenError` → 401 inválido

---

### 3. 🔴 ALTA — Rate limiting ausente

**Estado:** ✅ CORREGIDO

**Problema:**  
Sin rate limiting, un atacante podía hacer brute-force de contraseñas en login, spam de registros, y flood de apuestas.

**Fix aplicado:**  
Nuevo archivo `src/middleware/rateLimiter.ts` con `express-rate-limit`:

| Endpoint | Límite | Ventana | Clave |
|----------|--------|---------|-------|
| `POST /auth/login` | 5 intentos | 1 minuto | IP |
| `POST /auth/register` | 3 intentos | 1 minuto | IP |
| `POST /sorteos/bet` | 10 apuestas | 1 minuto | User ID (o IP) |

**Verificado con pruebas reales:** El 6to intento de login retorna HTTP 429. El 4to registro retorna HTTP 429.

---

### 4. 🔴 ALTA — /wallet/add sin protección (Testing endpoint expuesto)

**Estado:** ✅ CORREGIDO

**Problema:**  
`POST /wallet/add` era accesible para cualquier usuario autenticado, permitiendo agregar saldo arbitrario sin pasarela de pago real.

**Fix aplicado:**
- El endpoint verifica `TESTING_MODE=true` Y `NODE_ENV !== 'production'`
- Si cualquiera de las condiciones falla → HTTP 403 con mensaje explicativo
- Límite de depósito en testing: máximo €1,000 por operación
- Nueva variable en `.env`: `TESTING_MODE=true` (solo para desarrollo)

---

### 5. 🟡 MEDIA — Input validation insuficiente en apuestas

**Estado:** ✅ CORREGIDO

**Problema:**
- `amount_eur` solo validaba `> 0`, sin mínimo ni máximo
- `domino_id` estaba validado (0-27) ✅
- No se verificaba que el sorteo esté en status `'open'` antes de aceptar la apuesta (en realidad sí estaba, pero ahora está más explícito)

**Fix aplicado en `sorteos.ts`:**
```
amount_eur mínimo: €0.25
amount_eur máximo: €25.00
domino_id: 0-27 (ya validado, mantenido)
sorteo.status === 'open': verificado desde DB con FOR UPDATE (ya estaba)
```

**Verificado:** `amount_eur: 0.10` → `{"error":"La apuesta mínima es €0.25"}` ✅  
**Verificado:** `amount_eur: 30.00` → `{"error":"La apuesta máxima es €25.00"}` ✅

---

### 6. 🟡 MEDIA — Input sanitization en auth (username/email)

**Estado:** ✅ CORREGIDO

**Problema:**  
`username` y `email` no tenían sanitización — strings arbitrariamente largos, caracteres especiales, etc.

**Fix aplicado en `auth.ts`:**
- `sanitizeText()`: trim + límite de longitud
- `sanitizeEmail()`: regex básica de formato email, lowercase, máx 320 chars
- `sanitizeUsername()`: regex estricta `^[a-zA-Z0-9_-]{3,50}$` — solo alfanumérico, guiones, guiones bajos, 3-50 chars
- Contraseña: mínimo 8 chars (era 6), máximo 128 chars (previene bcrypt DoS con password muy largo)

**Verificado:** `username: "; DROP TABLE dc_users; --"` → error de username inválido ✅  
**Verificado:** `username: "<script>alert(1)</script>"` → error de username inválido ✅

---

### 7. 🟡 MEDIA — Helmet.js ausente (headers de seguridad)

**Estado:** ✅ CORREGIDO

**Problema:**  
Sin headers de seguridad HTTP, la app era vulnerable a clickjacking, MIME sniffing, XSS via X-Powered-By disclosure, etc.

**Fix aplicado:**  
Instalado y configurado `helmet` en `index.ts`:

| Header | Valor |
|--------|-------|
| `Content-Security-Policy` | Restrictivo (only self) |
| `X-Frame-Options` | DENY |
| `X-Content-Type-Options` | nosniff |
| `X-DNS-Prefetch-Control` | off |
| `X-Permitted-Cross-Domain-Policies` | none |
| `HSTS` | Solo en `NODE_ENV=production` |

**Verificado:** `curl -I http://localhost:3200/health` muestra todos los headers ✅

---

### 8. 🟢 BAJA — Request logging ausente

**Estado:** ✅ CORREGIDO

**Problema:**  
Sin request logging, era imposible auditar actividad sospechosa o diagnosticar problemas en producción.

**Fix aplicado:**  
Instalado `morgan`:
- Desarrollo: formato `dev` (colorido, compacto)
- Producción: formato `combined` (Apache-style, para log aggregators)
- Health check (`/health`) excluido del log para reducir ruido
- Body no logueado (morgan solo logea method, URL, status, response time — nunca el body con passwords)

---

### 9. ✅ YA CORRECTO — SQL Injection

**Estado:** Sin vulnerabilidades encontradas

Todos los queries en el codebase usan parámetros posicionales (`$1, $2, ...`):
- `dc_users`, `dc_wallets`, `dc_bets`, `dc_sorteos`, `dc_wallet_transactions`, `dc_banca_log`
- No se encontró concatenación de strings en queries SQL
- Codebase limpio en este aspecto

---

### 10. ✅ YA CORRECTO — Transacciones atómicas y Race conditions

**Estado:** Sin vulnerabilidades encontradas

El código ya usaba correctamente:
- `BEGIN / COMMIT / ROLLBACK` en todas las operaciones multi-step
- `SELECT ... FOR UPDATE` en wallets (previene race condition de doble gasto)
- `SELECT ... FOR UPDATE` en sorteos (previene race condition en tope por piedra)
- Verificación de balance suficiente dentro de la transacción con el wallet bloqueado

---

### 11. ✅ YA CORRECTO — CORS

**Estado:** Sin vulnerabilidades encontradas

- CORS configurado vía `CORS_ORIGIN` env var (no wildcard `*`)
- Credenciales habilitadas solo para el origin configurado
- Métodos y headers explícitamente listados

---

## Paquetes Instalados

```bash
npm install express-rate-limit helmet morgan --save
npm install @types/morgan --save-dev
```

## Archivos Modificados

| Archivo | Cambio |
|---------|--------|
| `src/index.ts` | + Helmet, + Morgan, + startup checks JWT_SECRET/ADMIN_API_KEY, body size limit 10kb |
| `src/middleware/auth.ts` | + No fallback JWT_SECRET, + error diferenciado por tipo, + payload validation |
| `src/middleware/adminAuth.ts` | **NUEVO** — Admin API key middleware |
| `src/middleware/rateLimiter.ts` | **NUEVO** — Rate limiters login/register/bet |
| `src/routes/auth.ts` | + sanitizeText/Email/Username, + loginLimiter, + registerLimiter, + timing attack fix |
| `src/routes/sorteos.ts` | + betLimiter, + amount min/max (€0.25-€25), + validaciones mejoradas |
| `src/routes/admin.ts` | + requireAdmin middleware, + seed length validation, errores limpiados |
| `src/routes/wallet.ts` | + TESTING_MODE guard, + DEPOSIT_MAX_EUR limit, errores limpiados |
| `.env` | + ADMIN_API_KEY, + ADMIN_LOCALHOST_ONLY, + TESTING_MODE |
| `.env.example` | Actualizado con todas las variables nuevas |

---

## Pendientes para Producción 🚀

Estos items **NO se implementaron** porque son cambios de arquitectura o requieren servicios externos, pero son **obligatorios antes de ir a producción**:

### CRÍTICO antes de producción

1. **Secrets en vault real**
   - El `seed` del sorteo se retorna al admin y se guarda en DB después de revelar. En producción: guardar el seed en HashiCorp Vault, AWS Secrets Manager, o similar — no en la respuesta HTTP.
   - `ADMIN_API_KEY` y `JWT_SECRET` deben generarse con `openssl rand -hex 32` y nunca estar en el repositorio.

2. **Pasarela de pago real**
   - `POST /wallet/add` debe reemplazarse con Stripe, PayPal, o la pasarela elegida.
   - `TESTING_MODE=true` debe estar BLOQUEADO en producción (ya está implementado el guard).

3. **HTTPS obligatorio**
   - Configurar nginx/caddy con TLS en frente del servidor.
   - Activar HSTS (ya configurado en helmet para `NODE_ENV=production`).
   - Cambiar `CORS_ORIGIN` al dominio real.

4. **`trust proxy` verificación**
   - El servidor ya tiene `app.set('trust proxy', 1)` para producción, pero verificar que el proxy de producción (nginx) está configurado para pasar `X-Forwarded-For` correctamente — de lo contrario el rate limiting por IP no funcionará bien.

### ALTA prioridad

5. **Refresh tokens**
   - Los JWT tienen 7 días de vida. Si un token se compromete, sigue válido 7 días.
   - Implementar refresh token con rotación o reducir expiración a 1h + refresh token.
   - Actualmente no hay blacklisting de tokens.

6. **Account lockout**
   - El rate limiter resetea cada minuto. Un atacante puede hacer 5 intentos/min indefinidamente (300/hora).
   - Implementar lockout temporal de cuenta después de N intentos fallidos.

7. **Email verification**
   - No hay verificación de email al registrarse. Cualquiera puede registrar emails falsos.

8. **Audit log**
   - Logear a archivo persistente: logins exitosos/fallidos, apuestas, depósitos, revelaciones de sorteo.
   - Morgan actual solo logea en stdout.

9. **Monitoring**
   - Configurar alertas para patrones sospechosos: múltiples 429, errores 500, apuestas muy grandes.

### MEDIA prioridad

10. **CORS origin list**
    - Actualmente acepta un solo origin. Si hay múltiples frontends (app móvil, etc.), necesitará lógica de lista blanca.

11. **Seed storage**
    - El comentario en `admin.ts` dice "guardar en vault/secrets". Hasta que se implemente el vault, el flujo actual (seed en respuesta, no en DB hasta revelar) es aceptable para desarrollo.

12. **Body size limits**
    - Ya implementado: `express.json({ limit: '10kb' })`. Ajustar si se necesitan payloads más grandes.

13. **PostgreSQL SSL**
    - En `db/pool.ts`, agregar `ssl: { rejectUnauthorized: true }` si la DB está en servidor remoto en producción.

---

## Verificaciones Realizadas (Testing)

```
✅ Health check: {"status":"ok","env":"development"}
✅ Rate limit login: 5 intentos → 401, 6to → 429
✅ Rate limit register: 3 intentos → 201/409, 4to → 429
✅ Bet min: amount_eur:0.10 → 400 "La apuesta mínima es €0.25"
✅ Bet max: amount_eur:30.00 → 400 "La apuesta máxima es €25.00"
✅ Bet domino: domino_id:99 → 400 "domino_id debe estar entre 0 y 27"
✅ Username SQL injection: "; DROP TABLE..." → 400 "username inválido"
✅ Username XSS: "<script>alert(1)</script>" → 400 "username inválido"
✅ Helmet headers: CSP, X-Frame-Options:DENY, X-Content-Type-Options:nosniff presentes
✅ TypeScript: 0 errores de compilación
✅ Build: dist/ generado correctamente
```
