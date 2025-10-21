E2E tests (Playwright)

Requirements
- Node.js 16+
- The frontend dev server running (Vite) at the URL configured in E2E_BASE_URL (defaults to http://localhost:5173)
- The backend server running and configured (DATABASE_URL set) so registration/login flows work

Quick start

# install deps and browsers
cd e2e
npm install
npm run install-browsers

# run tests (headless)
E2E_BASE_URL=http://localhost:5173 npm test

# or run headed for debugging
E2E_BASE_URL=http://localhost:5173 npm run test:headed

Notes
- The test selectors in `tests/walkthrough.spec.js` use simple name attributes; if your UI uses different selectors, update the test accordingly.
- The test registers a real store and user in the backend DB; run against a disposable/dev DB.
- Consider adding teardown steps to remove test data after runs.
