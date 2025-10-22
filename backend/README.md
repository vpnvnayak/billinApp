# Backend - DinoPos (Node.js + Express)

Quick start

1. cd backend
2. npm install
3. copy `.env.example` to `.env` and set `DATABASE_URL` if using PostgreSQL
4. npm run dev

Endpoints
- GET /api/products - list products

Auth / RBAC

1. Create DB and run migrations in `backend/migrations/*.sql` (you can run them manually with psql or a migration tool).
2. Set `JWT_SECRET` in `.env`.
3. Run `node scripts/seedAuth.js` to create default roles and an admin user (you can set `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` in `.env`).

Migration and seed helper scripts

- Run migrations (executes SQL files in `backend/migrations/`):

```powershell
cd .\backend
npm run migrate
```

- Run seed script (creates roles and admin user):

```powershell
cd .\backend
npm run seed
```

Auth endpoints
- POST /api/auth/register - create a new user (email, password, full_name)
- POST /api/auth/login - login and receive JWT
 - POST /api/auth/refresh - exchange a valid refresh token for a new access token (body: { refreshToken })
 - POST /api/auth/logout - revoke a refresh token (body: { refreshToken })

Admin-only endpoints
- GET /api/admin/stats - example admin-only route

Notes
- This is a minimal starter. We'll add migrations, models, and services next.
