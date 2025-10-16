# DinoPos - Supermarket POS (Starter scaffold)

This repository contains a starter scaffold for a Supermarket POS (Point-of-Sale) application.

Structure
- `backend/` - Node.js + Express API with PostgreSQL (pg)
- `frontend/` - React (Vite) single-page app

Developer contract (minimal)
- Backend: exposes JSON REST API under `/api` and connects to PostgreSQL using `DATABASE_URL`.
- Frontend: React SPA that talks to backend at `VITE_API_BASE` or `http://localhost:4000/api`.

Quick run (Windows PowerShell)

Open two terminals.

Backend:

```powershell
cd .\backend
npm install
copy .env.example .env
# edit .env to set DATABASE_URL if you have Postgres running
npm run dev
```

Frontend:

```powershell
cd .\frontend
npm install
npm run dev
```

What I added
- Starter Express backend with a sample `/api/products` route and Postgres pool helper.
- Vite+React frontend that fetches `/api/products` and displays them.
- Basic README files and .env examples.

Next steps we can implement
- Database migrations and seed data (e.g., using node-pg-migrate or Prisma)
- Product CRUD, barcode lookup, and inventory management
- Cart, checkout, receipts, tax calculation, discounts
- Authentication for staff and role-based access
- Reports (sales, stock, daily summaries) and export
- Docker compose for local development

Local HTTPS (mkcert) helper

You can create a locally-trusted certificate for `localhost` using `mkcert` and the provided helper scripts. This will let you run both frontend (Vite) and backend over HTTPS for testing secure cookies.

1. Install mkcert (e.g., `choco install mkcert -y`) and ensure it's on PATH.
2. Generate certs and CA with the helper (PowerShell):

```powershell
cd D:\vsprojects\billingApp
.\scripts\setup-mkcert.ps1
```

3. Import the CA into Windows Trusted Root (run as Administrator):

```powershell
.\scripts\import-cert.ps1
```

4. Start the backend with SSL certs (update `backend\.env` with these paths or set `SSL_CERT_PATH` and `SSL_KEY_PATH`):

```powershell
# example .env settings
SSL_CERT_PATH=D:\vsprojects\billingApp\certs\localhost.pem
SSL_KEY_PATH=D:\vsprojects\billingApp\certs\localhost-key.pem
COOKIE_SECURE=true

cd backend
npm install
npm run migrate
npm run dev
```

5. Start the frontend over HTTPS (Vite will pick up certs in `certs/`):

```powershell
cd frontend
npm install
npm run dev
```

The frontend dev server will serve at `https://localhost:5173` if the certs are present.

