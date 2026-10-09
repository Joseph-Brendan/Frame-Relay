# Releasing Frame-Relay

This guide covers the npm package, the MCP Registry listing and the Figma Community submission. The
owner runs the steps that need npm or Figma access.

Current version: `0.1.0-beta.0` for `@josephbrendan/frame-relay`, with the `beta` dist-tag. The repo
is in Changesets pre mode (`beta`), so the next versions will be `0.1.0-beta.1`, `0.1.0-beta.2`, and
so on.

---

## Part 1. One-time setup (owner only)

The automated release workflow can only publish after the package exists on npm and trusted
publishing is connected. Do these steps once.

### 1.1 Publish 0.1.0-beta.0 by hand

```bash
git checkout main
git pull
corepack enable
pnpm install --frozen-lockfile
pnpm build
cd packages/cli
npm login
npm publish --access public --tag beta
```

What you should see:

- `npm login` asks for your username, password and a one-time code if two-factor authentication is
  on.
- `npm publish` prints a line like `+ @josephbrendan/frame-relay@0.1.0-beta.0` after the `prepack`
  step copies the README and LICENSE into the package.

Verify the publish:

```bash
npm view @josephbrendan/frame-relay dist-tags
# { beta: '0.1.0-beta.0' }

npx @josephbrendan/frame-relay@beta --version
# frame-relay/0.1.0-beta.0
```

### 1.2 Connect trusted publishing on npmjs.com

1. Open https://www.npmjs.com/package/@josephbrendan/frame-relay and sign in as the owner.
2. Go to **Settings**, then **Trusted publishing**, and click **Add trusted publisher**, then
   **GitHub Actions**.
3. Fill in:
   - **Organization or user**: `Joseph-Brendan`
   - **Repository**: `Frame-Relay`
   - **Workflow filename**: `release.yml`
   - **Environment name**: leave blank
   - **Allowed actions**: select `npm publish` (and `npm dist-tag` if you want the workflow to
     manage tags)
4. Save.

Important: npm gives a new trusted publisher two days to complete its first successful publish.
After that it expires and must be recreated. Merge a version PR soon after this step.

Also recommended in the same settings page: set **Publishing access** to require two-factor
authentication and disallow long-lived tokens. Trusted publishing keeps working.

### 1.3 Allow GitHub Actions to create pull requests

In GitHub, open the repository **Settings**, then **Actions**, then **General**. Under
**Workflow permissions**, enable **Allow GitHub Actions to create and approve pull requests**. The
release workflow needs this to open the "chore: version packages" pull request.

### 1.4 Turn on automated publishing

Set the repository variable that the release workflow checks:

```bash
gh variable set NPM_PUBLISH_ENABLED --body true
```

(Or add it under **Settings**, **Secrets and variables**, **Actions**, **Variables**.) Until this
variable exists, the workflow still opens version PRs but never publishes.

---

## Part 2. How releases work after setup

1. Every user-facing change carries a changeset. Contributors add one with `pnpm changeset` and
   commit the file in `.changeset/`.
2. On every push to `main`, `.github/workflows/release.yml` runs `changesets/action`. If there are
   unreleased changesets, it opens or updates a pull request titled **chore: version packages**.
3. Merging that pull request removes the changesets and bumps versions. The workflow runs again,
   finds no pending changesets, builds the packages, and publishes any package version that is not
   on npm yet with `npm publish --tag beta --provenance`.
4. Trusted publishing uses a short-lived OIDC token, so no `NPM_TOKEN` secret is needed.
   Provenance (a public record of which workflow built the package) is generated automatically.
5. The workflow also creates a git tag such as `@josephbrendan/frame-relay@0.1.0-beta.1`.

The workflow upgrades npm to the latest version before publishing. Trusted publishing requires npm
11.5.1 or newer and Node 22.14 or newer.

To leave beta later:

```bash
pnpm changeset pre exit
git add .changeset
git commit -m "chore: exit beta prerelease mode"
```

The next version PR then produces a stable version such as `0.1.0`.

---

## Part 3. MCP Registry

The registry at https://registry.modelcontextprotocol.io lists the server metadata. It does not
host the package, so npm must come first.

The repo already contains `server.json` at the root with:

- `name`: `io.github.Joseph-Brendan/frame-relay` (matches `mcpName` in the npm package)
- `repository`: the GitHub repository
- `version`: the package version
- one npm package entry with `runtimeArguments` `["mcp"]`

The npm package must include the same `mcpName`. It already does.

Steps:

1. Make sure the version in `server.json` matches the published npm version.
2. Install the publisher tool:

   ```bash
   brew install mcp-publisher
   ```

   Or download the binary from
   https://github.com/modelcontextprotocol/registry/releases/latest and put it on your `PATH`.

3. Validate the file against the schema it declares:

   ```bash
   mcp-publisher validate
   ```

   To validate against the schema directly without the publisher tool:

   ```bash
   curl -s https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json -o /tmp/mcp-server.schema.json
   npx --yes ajv-cli@5 validate --strict=false -s /tmp/mcp-server.schema.json -d server.json
   # server.json valid
   ```

4. Check the template the publisher would generate (optional, our file already exists):

   ```bash
   mcp-publisher init
   # creates server.json only if it is missing
   ```

5. Log in with GitHub. The registry checks that the GitHub account matches the
   `io.github.Joseph-Brendan/...` namespace, so log in as `Joseph-Brendan`:

   ```bash
   mcp-publisher login github
   ```

6. Publish:

   ```bash
   mcp-publisher publish
   ```

7. Verify the listing at https://registry.modelcontextprotocol.io (search for `frame-relay`).

When a later release changes the version, update `server.json`, commit it, and publish to the
registry again.

---

## Part 4. Figma Community submission

Figma Community is where users will find the plugin after review. Until it is approved, the docs
tell users to import the manifest from this repo.

### 4.1 Build and test locally

```bash
pnpm install --frozen-lockfile
pnpm build
```

In Figma desktop: open **Plugins**, **Development**, **Import plugin from manifest**, and choose
`packages/plugin/manifest.json`. Run the plugin and check:

- **Lint** on a file with a component set.
- **Export** to download a kit zip.
- **Live**: start the MCP server with live mode (`npx @josephbrendan/frame-relay@beta mcp --live`),
  ask your agent for `start_live`, and pair with the code.

The manifest is already set up for submission:

- `name`: `Frame-Relay`
- `id`: `1688306391908778327`
- `editorType`: `["figma"]`
- `documentAccess`: `dynamic-page`
- `networkAccess.allowedDomains`: the three localhost live mode ports, with the reasoning line
  "Frame-Relay live mode connects only to a local server on your own computer. No data leaves your
  machine."

Do not change the plugin id after the listing exists. Figma uses it to match updates to the
published plugin.

### 4.2 Submit

1. In Figma desktop, open any file and go to **Plugins**, **Development**, **Manage plugins in
   development**.
2. Select **Frame-Relay** and choose **Publish**.
3. Fill in the form from `docs/dev/figma-submission/listing.md`:
   - Name: `Frame-Relay`
   - Tagline and description: paste from the listing file.
   - Tags: the eight tags from the listing file.
   - Support contact: the GitHub issues URL from the listing file.
   - Network access explanation: use the listing text, which matches the manifest reasoning
     exactly.
4. Upload `docs/dev/figma-submission/icon.png` (128x128) and
   `docs/dev/figma-submission/cover.png` (1920x960). Run `pnpm assets:figma` to regenerate them.
5. Submit for review. Figma emails the owner when the plugin is approved or if changes are needed.

### 4.3 After approval

Update these places to point at the Community listing instead of the manifest import:

- `README.md`, in the "Getting the Figma plugin" paragraph.
- `docs/getting-started.md`, Step 2.
- `docs/plugin.md`, if it mentions the import.

Keep the manifest id, name and network access unchanged so existing installs keep updating.
