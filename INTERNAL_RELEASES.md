# Internal releases (onesrvnet fork)

This fork publishes internal builds of Pruvious v4 to GitHub Packages (`npm.pkg.github.com`) under the `@onesrvnet` scope. Nothing is published to the public npm registry.

The workflow is [`.github/workflows/publish-internal.yml`](.github/workflows/publish-internal.yml). Package names, versions and `workspace:*` dependencies are rewritten only inside the CI job, so committed `package.json` files stay identical to upstream and syncs remain clean.

## Published packages

| Upstream package    | Internal package              |
| :------------------ | :---------------------------- |
| `pruvious`          | `@onesrvnet/pruvious`         |
| `@pruvious/utils`   | `@onesrvnet/pruvious-utils`   |
| `@pruvious/i18n`    | `@onesrvnet/pruvious-i18n`    |
| `@pruvious/orm`     | `@onesrvnet/pruvious-orm`     |
| `@pruvious/storage` | `@onesrvnet/pruvious-storage` |
| `@pruvious/ui`      | `@onesrvnet/pruvious-ui`      |

All six are published with the same version. Inside `@onesrvnet/pruvious`, the dependencies keep their original `@pruvious/*` names as npm aliases (e.g. `"@pruvious/utils": "npm:@onesrvnet/pruvious-utils@4.0.0-onesrv.3"`), so no source changes are needed.

## Cutting a release

Push a tag named `v4-internal-<N>` on the `v4` branch, where `<N>` is a positive integer one higher than the last release:

```sh
git checkout v4
git pull
git tag v4-internal-3
git push origin v4-internal-3
```

This publishes version `4.0.0-onesrv.3` under the `next` dist-tag. Tags with a non-integer suffix fail immediately.

List existing tags with `git tag -l 'v4-internal-*' --sort=-v:refname`.

For a throwaway test build, run the workflow manually (Actions → publish-internal → Run workflow, or `gh workflow run publish-internal.yml --ref v4`). That publishes `4.0.0-onesrv.0-<short-sha>` under the `dev` dist-tag, so it never moves `next`.

## Installing in a consumer project

Developers and CI need a GitHub token with the `read:packages` scope (a classic PAT, or `GITHUB_TOKEN` in Actions with `packages: read` and access granted to the package).

Add `.npmrc` to the consumer project:

```ini
@onesrvnet:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Install under the original name via an alias:

```sh
pnpm add pruvious@npm:@onesrvnet/pruvious@4.0.0-onesrv.3
```

Everything else follows the upstream setup: `extends: ['pruvious']` in `nuxt.config.ts`, `#pruvious/...` imports, removing `app.vue`, and so on. See [docs/guide/installation.md](docs/guide/installation.md#manual-installation).

## Syncing from upstream and releasing

```sh
gh repo sync onesrvnet/pruvious --source pruvious/pruvious --branch v4
git checkout v4
git pull
git tag v4-internal-<next N>
git push origin v4-internal-<next N>
```

## Upstream workflows

Upstream's `ci.yml` (publishes every push to pkg.pr.new) and `release.yml` (publishes `v*` tags to public npm) are **disabled** in this repository's Actions settings. They're disabled rather than deleted, so the files still match upstream. Keep them disabled; re-check after syncs if upstream adds new workflows.
