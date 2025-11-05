# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog and semantic versioning.

## [Unreleased]
- Ongoing work on POS offline queue (PWA/Dexie) — planned.
- Follow-up fixes and server-side search support for list endpoints.

## [v1.2.0] - 2025-11-05
### Added
- Standardized server-side pagination for listing endpoints: Users, Purchases, Supplier Aggregates, Products.
- Frontend pagination controls updated to use server returned `data` and `total` values.
- `RELEASE_NOTES.md` added with a detailed summary of implemented features and verification steps.
- Draft GitHub Release created locally as a draft file.

### Changed
- Fixed double-slicing bug on Product listing (client previously sliced already-paged server response).
- Moved pill & toggle inline styles into shared CSS classes for consistent theming.
- Suppliers listing now shows primary `phone` and no longer auto-populates `phone` from `phone1` during edit.
- Profile settings now persist `phone`, `full_name`, and allow password change via `PUT /api/auth/me`.

### Fixed
- Pagination mismatch that caused page 2 to appear empty when there are more items than the page size.
- Various test stabilizations for flaky integration tests.

## [v1.1.0] - 2025-10-xx
### Added
- Customer disable flow: `disabled` boolean column; UI toggle; POS exclusion of disabled customers.
- Supplier aggregates endpoint for per-supplier metrics (total_purchases, credit_due, last_purchase).
- Products: support for product variants, HSN, repack items, and PLU export for weighing scales.
- Purchases: transactional create/update flow with variant-aware stock updates.

### Changed
- Backend endpoints implemented schema-aware fallbacks for optional columns (via `schemaCache`).

## [v1.0.0] - (initial milestone)
### Added
- Core POS features: Sales creation, receipt printing, basic products and customers management.
- User & role scaffolding and basic admin pages.


# Notes
- To publish the draft tag to origin: `git push origin --tags` and create a GitHub Release from the annotated tag or use `gh release create` if you have GitHub CLI configured.
- Consider bumping versions and tagging per-release when stable milestones are reached.
