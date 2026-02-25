# Destiny Chronicle

Angular 19 SPA for tracking Destiny 1 & 2 activity history. No backend — communicates directly with the Bungie API.

## Cursor Cloud specific instructions

### Quick reference

| Task | Command |
|------|---------|
| Install deps | `npm install` |
| Dev server | `npm start` (serves on `http://localhost:4200`) |
| Prod build | `npm run build` |
| Tests | `npm test` (Karma/Jasmine; see caveat below) |
| Tailwind rebuild | `npm run tailwind:build` |

### Known caveats

- **No ESLint configured.** There is no lint script or ESLint config in the repo. Use `npx ng build --configuration development` as a TypeScript type-check proxy.
- **Tests have pre-existing compilation errors.** `src/app/services/bungie-api.service.spec.ts` references renamed methods (`searchPlayer` → `searchD1Player`, `getDestinyManifest` → `getD1Manifest`) and has implicit `any` parameters. Tests will fail to compile until those specs are updated.
- **Bungie API key is hardcoded** in `src/environments/environment.ts` (dev) and `environment.prod.ts` (prod). No `.env` files or runtime secrets are needed.
- **Legacy non-Angular files exist** in `src/components/*.tsx` and `netlify/functions/`. These are not part of the Angular build and will cause errors if you run a bare `tsc --noEmit` from the repo root. Always use Angular CLI commands (`ng build`, `ng serve`) instead.
- **`vite.config.ts`** configures a proxy for `/api/lowman` but Angular's dev server uses `@angular-devkit/build-angular`, not Vite directly. This proxy does not take effect during `ng serve`.
- **CI uses Node 20** (`.github/workflows/deploy.yml`), but Node 22 works fine locally.
