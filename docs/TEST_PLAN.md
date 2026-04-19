# PaperBanana Test Plan

## 1. AC1 — App shell + theme smoke

- Date: 2026-04-19
- Result: Pending manual verification in a browser session with backend + frontend running.

Checklist:
- [ ] Start the API with `uvicorn server.main:app`.
- [ ] Start the frontend with `pnpm --dir web dev`.
- [ ] Open the app shell and confirm the default route redirects to `/generate`.
- [ ] Confirm the left rail renders `Generate`, `Battle`, `Refine`, `History`, `Logs`, `Settings`, and `Design`.
- [ ] Confirm the page uses the light-mode tokens from `web/src/styles/tokens.css`.
- [ ] Confirm no uncaught browser-console errors appear during initial load or route switches.

## 2. AC10 — Manual end-to-end operator loop

- Date: 2026-04-19
- Result: Pending manual verification on an environment with configured model credentials.

Checklist:
- [ ] Generate a run from `/generate` with a valid method section, caption, and configured models.
- [ ] Wait for terminal success and verify candidate images render in the gallery.
- [ ] Navigate to `/history` and confirm the new run is listed with correct status and metadata.
- [ ] Open `/history/:runId` and confirm prompts, stage timeline, and artifacts are present.
- [ ] Use `Reuse` to return to `/generate` with the previous payload prefilled.
- [ ] Edit one or more fields and submit a regenerated run.
- [ ] Cancel an in-flight run and confirm it reaches `cancelled`.
- [ ] Resume a paused or resumable run and confirm execution continues without restarting completed stages.
- [ ] Open `/battle`, reuse the same prompt context, and confirm battle child results render without unhandled errors.
- [ ] Confirm every stored artifact referenced in the UI exists on disk for the exercised runs.
