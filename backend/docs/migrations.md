## Migration runbook (safe steps)

This file documents a safe, repeatable process for applying database migrations for this project.
Keep this short and follow it for staging/production runs.

### Preconditions
- Ensure you have a recent backup of the database before running destructive migrations.
- Set `DATABASE_URL` in your environment to point to the target DB (use staging first).
- Node.js and `npm` are available. Run the check script and migrate runner from `backend/`.

### Quick checklist
1. Run `scripts/check-migrations.js` locally or in CI and review any warnings.
2. Create a DB backup (see commands below).
3. Run migrations against a staging DB and smoke test the app.
4. For production, schedule a maintenance window if migrations touch large tables or add indexes.
5. Run the migrations on production and monitor.

### Backup (PowerShell examples)
# Use `pg_dump` with your connection string. Replace or export `DATABASE_URL` first.

PowerShell (single-line):

```powershell
# Create a timestamped custom-format dump file
$ts = (Get-Date -Format yyyyMMddHHmmss)
pg_dump "$env:DATABASE_URL" -Fc -f ".\backups\pre_migrations_$ts.dump"
```

If you prefer to specify host/user/db directly:

```powershell
pg_dump -h myhost -p 5432 -U myuser -F c -b -v -f ".\backups\pre_migrations_$ts.dump" mydb
```

To restore (use with caution):

```powershell
# Restore into a target DB (be careful: this may overwrite existing data)
pg_restore --verbose --clean --no-owner --dbname "$env:DATABASE_URL" ".\backups\pre_migrations_20250101120000.dump"
```

### Preflight: check migrations for destructive operations

From `backend/` run:

```powershell
node ./scripts/check-migrations.js
```

If the script exits non-zero, inspect the listed migration files and confirm the destructive changes are intended. If they are, ensure backups exist and that you have approval to proceed.

### Run migrations (staging first)

From `backend/`:

```powershell
# Run all pending migrations
node ./scripts/migrate.js
```

Notes:
- The migration runner executes `.sql` files in `backend/migrations` sorted alphabetically and records applied files in the `migrations` table.
- Files that end with `.nt.sql` OR contain the marker `-- NO-TRANSACTION` will be executed without being wrapped in a transaction (useful for `CREATE INDEX CONCURRENTLY`).

### Creating non-transactional migrations (for large indexes)

If you need to add an index on a large table without locking it, create a migration named like `027_create_index_products_store_id.nt.sql` with contents such as:

```sql
-- NO-TRANSACTION
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_store_id ON products(store_id);
```

Run the migration runner as normal; files marked as non-transactional will be executed without `BEGIN/COMMIT`.

Warning: non-transactional migrations may leave partial changes on failure and will require manual remediation.

### Example safe pattern for adding FK + index on a large table
1. Create index concurrently:
   - `.nt.sql` file with `CREATE INDEX CONCURRENTLY IF NOT EXISTS ...`
2. Add the FK constraint as `NOT VALID` (this can be run in a transaction):
   - `ALTER TABLE ... ADD CONSTRAINT ... REFERENCES ... NOT VALID;`
3. Validate the constraint after ensuring no orphan rows:
   - `ALTER TABLE ... VALIDATE CONSTRAINT ...;`

This pattern reduces table locking and allows stepwise enforcement.

### Post-migration verification
- Confirm the service starts and key endpoints are functioning (smoke tests).
- Check logs for errors and monitor DB locks/cpu.
- If any destructive migration was applied, confirm backup restoration plan is available.

### CI integration (recommended)
- Add a CI job that runs:
  - `node ./scripts/check-migrations.js` (and fails on non-zero),
  - Run migrations against a disposable staging DB, and run integration tests.

### Emergency rollback (if migration causes unrecoverable issues)
1. Stop the app or put it into maintenance mode.
2. If you have a recent dump, restore from it (see `pg_restore` example above).
3. If you do NOT have a dump, inspect the `migrations` table and `migrations/*.sql` files to manually revert changes; manual SQL will be required.

### Helpful notes
- `scripts/migrate.js` records applied migration filenames in the `migrations` table. If a migration partially applied (non-transactional), you may need to manually remove the entry from `migrations` and/or fix partial changes before re-running.
- Prefer small, idempotent migrations that use `IF NOT EXISTS` guards when possible.

If you want, I can:
- Add a simple CI workflow snippet to run `check-migrations` and block merges until approved.
- Add a PowerShell script under `backend/scripts` that automates backup + migrate with confirmation prompts.

## CI & authoring notes

CI will run `node ./scripts/check-migrations.js` and will block merges if destructive SQL is detected. In addition, changes to `backend/scripts/migrate.js` are gated by the `MIGRATE_SAFE` marker: if you change `migrate.js`, add the literal `MIGRATE_SAFE` somewhere in the file (a comment is fine) to signal that the change was intentional and reviewed.

Authoring safe migrations:
- Prefer small, idempotent migrations with `IF NOT EXISTS` guards.
- For non-transactional operations (large indexes), use `.nt.sql` suffix and include `-- NO-TRANSACTION` at the top of the file.
- If a migration drops data, create a backup migration (like `019b_backup_...sql`) before the destructive migration.
