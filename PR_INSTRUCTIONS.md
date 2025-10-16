PR steps to run locally (Windows PowerShell)

# 1. Initialize git (if the repo isn't already a git repo)
cd d:\vsprojects\billingApp
git init
git remote add origin <your-remote-url>   # e.g. git@github.com:youruser/billingApp.git

# 2. Create branch and commit
git checkout -b fix/settings-upsert-and-tests
git add backend/src/routes/settings.js backend/migrations/030_add_hours_and_store_settings_constraint.sql backend/migrations/031_make_store_settings_id_serial.sql backend/migrations/017_create_stores_table.sql backend/migrations/019b_backup_stores_auth.sql backend/scripts/smoke-write-settings.js backend/tests/settings.integration.test.js
git commit -m "fix(settings): resilient settings upsert + add hours migration and integration test"

# 3. Push branch
git push -u origin fix/settings-upsert-and-tests

# 4. Open PR using gh (optional)
# gh repo clone <owner>/<repo> (if not cloned) ; or run from repo root
gh pr create --base main --head youruser:fix/settings-upsert-and-tests --title "fix(settings): resilient upsert + add hours migration and tests" --body "This PR makes writeSettingsToDB resilient to missing columns/constraints, adds migrations to add hours column and set id default, and adds an integration test that validates settings upsert/read."

# If `gh` is not installed, open this URL in your browser after pushing:
# https://github.com/<owner>/<repo>/compare/main...youruser:fix/settings-upsert-and-tests

# Notes:
# - Review migrations before pushing; adjust filenames to match your migration ordering if needed.
# - If your default branch is `master` or different, replace `main` with the correct base branch.
