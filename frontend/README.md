# Frontend - DinoPos (React + Vite)

Quick start

1. cd frontend
2. npm install
3. npm run dev

By default the app expects the backend at `http://localhost:4000/api`. You can override with `VITE_API_BASE` in `.env`.

Authentication

- The frontend includes a simple login form. Use the seeded admin credentials (from `backend/.env` `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`) to sign in.
- On successful login the JWT is stored in `localStorage` and attached to subsequent requests. Admin-only UI (example: admin stats) will appear if your account has the `admin` role.
 - The login now also returns a refresh token which is stored in `localStorage`. The frontend will automatically attempt to refresh the access token if it receives a 401 from the backend. Logout revokes the refresh token server-side as well.
 - The login now sets an HttpOnly `refreshToken` cookie. The frontend sends credentialed requests (`withCredentials`) so the server can read/rotate the cookie. Logout will clear the cookie server-side.

Note: You must run the frontend at `http://localhost:5173` (default Vite) and the backend `http://localhost:4000`; the backend CORS is configured to allow credentials from the Vite origin.
