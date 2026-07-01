# Dominócito — Migraciones de Base de Datos

## Cómo funcionan

Las migraciones son archivos SQL en `backend/src/db/migrations/` que se ejecutan en orden alfabético/numérico. Cada una modifica el schema de la DB sin perder datos.

**Migraciones existentes:**

| Archivo | Descripción | Cuándo corre |
|---------|-------------|--------------|
| `001_init.sql` | Schema inicial: users, wallets, sorteos, bets, transacciones, banca_log | Solo la primera vez |
| `002_security_advanced.sql` | Agrega email_hash, columnas de cifrado, tabla refresh_tokens, columnas ECDSA | Una vez |

**Cómo correr una nueva migración:**

```bash
cd /opt/dominocito/backend
node dist/db/migrate.js
```

El script busca todos los archivos `.sql` en `migrations/`, los aplica en orden, y registra cuáles ya se aplicaron en una tabla `dc_migrations`.

## Crear una nueva migración

1. Crea el archivo SQL con prefijo numérico siguiente:
   ```
   backend/src/db/migrations/003_mi_cambio.sql
   ```

2. Usa `IF NOT EXISTS` para que sea idempotente:
   ```sql
   ALTER TABLE dc_users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
   CREATE INDEX IF NOT EXISTS idx_users_phone ON dc_users(phone);
   ```

3. Commit + push a `main` → CI/CD corre `node dist/db/migrate.js` automáticamente en el .3

## Estado actual en producción

**Última migración aplicada:** `002_security_advanced`

**Tabla de migraciones (en DB de producción):**
```sql
SELECT * FROM dc_migrations ORDER BY id;
```

## Migraciones manuales (no son parte del deploy automático)

- **Cambios de data** (UPDATE, DELETE masivo): correr manual con `psql`
- **Backfills**: correr manual con un script temporal
- **Rollbacks**: NO hay rollback automático — siempre crear una nueva migración que revierta

## Troubleshooting

**"Migration already applied":**
- Significa que el script ya corrió. La tabla `dc_migrations` lo registra.

**"Column already exists":**
- Usá `ADD COLUMN IF NOT EXISTS` en vez de `ADD COLUMN`

**Falla de conexión a DB:**
- Verificar que el VPN Lottopro está activo
- Verificar que el .2 (PostgreSQL) responde: `nc -zv 10.101.20.2 5432`
