# AGENTS.md

## Project Structure

Excalidraw is a **monorepo** with a clear separation between the core library and the application:

- **`packages/excalidraw/`** - Main React component library published to npm as `@excalidraw/excalidraw`
- **`excalidraw-app/`** - Full-featured web application (excalidraw.com) that uses the library
- **`packages/`** - Core packages: `@excalidraw/common`, `@excalidraw/element`, `@excalidraw/math`, `@excalidraw/utils`
- **`examples/`** - Integration examples (NextJS, browser script)

## Development Workflow

1. **Package Development**: Work in `packages/*` for editor features
2. **App Development**: Work in `excalidraw-app/` for app-specific features
3. **Testing**: Always run `yarn test:update` before committing
4. **Type Safety**: Use `yarn test:typecheck` to verify TypeScript

## Development Commands

```bash
yarn test:typecheck  # TypeScript type checking
yarn test:update     # Run all tests (with snapshot updates)
yarn fix             # Auto-fix formatting and linting issues
```

## Architecture Notes

### Package System

- Uses Yarn workspaces for monorepo management
- Internal packages use path aliases (see `vitest.config.mts`)
- Build system uses esbuild for packages, Vite for the app
- TypeScript throughout with strict configuration

## Handwriting / iPad Work

For handwriting, brush controls/presets, hold-to-shape recognition, or related file workflow changes, read `docs/handwriting/README.md`, `SPEC.md`, and `ACCEPTANCE.md` before implementation. These documents distinguish the shipped phase-one baseline from the planned phase-two features.

Every independently reviewable batch of changes (including follow-up fixes, configuration, tests, dependencies, and documentation) must add a numbered record under `docs/handwriting/changes/` using `CHANGELOG_TEMPLATE.md` and update `docs/handwriting/PROGRESS.md`. Include requirement IDs, changed files, actual validation results, remaining risks, and deviations. Do not claim real-device verification from desktop simulation. Include the change record in the same implementation commit. The final handoff must identify base/head commits and unverified acceptance items so another reviewer can reproduce the result.
