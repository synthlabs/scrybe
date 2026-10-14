# Internal Features

This repository is checked out at `internal/` in Pepo and Scrybe.

- `main` contains the private implementation used for local development.
- `starter` contains the OSS-safe implementation copied into both public repositories.

The branch is a superset: Pepo consumes the Rust crate while Scrybe consumes `rust/mod.rs`. Both
apps share the frontend entrypoint, generated binding, command list, and build-info plugin contract.

## Run

From either app root:

```sh
make dev-internal
```

Without `ENABLE_INTERNAL=1`, each app uses its tracked public no-op hooks.

## Keep the parent status clean

The private implementation intentionally differs from the starter files tracked by the public app.
After switching the nested checkout to `main`, hide those expected parent-repository differences:

```sh
cd internal
git switch main
sh scripts/parent-overlay.sh hide pepo ..
```

Use `scrybe` instead of `pepo` in the Scrybe checkout. The helper marks only `Cargo.lock` and the
app's public manifest paths as `assume-unchanged` in the parent repository's local index. Git does
not treat this as a general-purpose tracked-file ignore, so use it only as a local status
convenience, not as a protection boundary.

Reveal the differences at any time with:

```sh
sh scripts/parent-overlay.sh show pepo ..
```

## Update the public starter

Commit the OSS-safe interface change on `starter`, then synchronize it from each app checkout:

```sh
cd internal
git switch starter
git pull --ff-only
sh scripts/starter-sync.sh stage pepo ..
```

Use `scrybe` instead of `pepo` in the Scrybe checkout. The script stages only the approved manifest
and writes `.starter-revision`; it never commits or pushes. It also reveals any paths hidden by the
parent overlay helper before staging. Review the parent repository's staged diff, run
`sh internal/verify.sh`, and commit from the parent repository.

Switch the nested checkout back to `main` and run `parent-overlay.sh hide` for private development.

## Verify

```sh
sh internal/verify.sh
```

The verification runs public frontend/Rust checks, then `node internal/internal-test.mjs`
from the app root. Both branches provide that common entry point.
The public Cargo check retains its existing lockfile preparation behavior when
switching the Pepo implementation branch; the hook's Cargo checks and tests use
`--locked`.

The hook runs its process-contract tests, internal-enabled frontend/Rust checks,
and the app's Rust library tests serially. The private branch also runs its existing
Rust implementation tests with the runtime feature and local HTTP mocks. It copies
that crate into an owned temporary directory outside the host workspace, preserves
its lockfile, and removes the copy on success or failure. Build output stays under
the app's `target/internal-tests` unless `CARGO_TARGET_DIR` is supplied.

Children receive `ENABLE_INTERNAL=1`, stream output, and stop the hook on failure.
The hook never calls the host's aggregate test or verify commands.
Scrybe exposes it as `pnpm test:internal` and `make test-internal`; Pepo uses the
direct Node entry point without changing its test framework.

Private CI runs verification with Node 24 against clean Pepo and Scrybe checkouts.
Both starter manifests export the hook and its contract tests. Private implementation
sources stay outside the public manifests.
