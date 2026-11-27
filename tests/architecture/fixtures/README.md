# Architecture regression fixtures

Each directory under `rules/` is an isolated, minimal tree that violates **exactly one**
boundary rule (the directory name), using every applicable import form (value, type-only,
dynamic). `valid/` exercises the allowed patterns and must produce no violations.

`tests/architecture/boundaries.test.ts` cruises each tree on its own and asserts that:
the fixture files are actually in the graph; every violation belongs to the intended rule and
comes from the expected files; and removing that rule makes the violations disappear.

These files are never built, linted, type-checked or formatted, and the real-tree boundary check
excludes this directory. Do not "fix" them. The `node_modules/`, `dist/` and `.next/` folders
here are hand-written fakes, committed through `.gitignore` negations. Fake npm packages
keep their entry point in `dist/`, like most real packages, so a regression of audit finding
H-01 (exclusions swallowing `dist/` paths inside `node_modules`) breaks these fixtures too.
