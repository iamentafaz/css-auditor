There are **three ways** to run it depending on your setup:

---

## Option 1 — Direct `node` call (no install, quickest)

Point it at any project folder from inside the `css-auditor` directory:

```bash
node src/cli.js /path/to/your/app
```

Examples:
```bash
# Scan another project on your machine
node src/cli.js C:/Users/mir/Documents/work/my-react-app

# Verbose mode (shows fix suggestions under every violation)
node src/cli.js C:/Users/mir/Documents/work/my-react-app --verbose

# JSON output (pipe into a file or CI tool)
node src/cli.js C:/Users/mir/Documents/work/my-react-app --json > audit.json

# SARIF output for GitHub Code Scanning and compatible CI tools
node src/cli.js C:/Users/mir/Documents/work/my-react-app --format sarif > audit.sarif
```

---

## Option 2 — Install globally with `npm link` (run as `css-auditor` anywhere)

From inside the `css-auditor` directory, run once:

```bash
cd C:\Users\mir\Documents\work\css-auditor
npm link
```

Then from **any directory on your machine**:

```bash
# Scan the current project
cd C:\Users\mir\Documents\work\my-react-app
css-auditor .

# Or point at it explicitly
css-auditor C:\Users\mir\Documents\work\my-react-app --verbose
```

---

## Option 3 — Add as a `devDependency` inside the target app

In the app you want to audit, install it locally:

```bash
cd C:\Users\mir\Documents\work\my-react-app
npm install --save-dev ../css-auditor
```

Then add a script to that app's `package.json`:

```json
"scripts": {
  "audit:css": "css-auditor . --verbose"
}
```

Run it with:
```bash
npm run audit:css
```

---

## Configuring per-project

Drop a `.cssauditrc.json` at the **root of the app you're scanning** to tune which checks run:

```json
{
  "ignoreClasses": ["js-hook", "qa-"],
  "ignorePaths": ["src/legacy", "src/vendor"],
  "checkImportant": true,
  "checkHighZIndex": true,
  "zIndexThreshold": 100,
  "checkBreakpoints": true,
  "knownBreakpoints": [640, 768, 1024, 1280, 1536],
  "checkDuplicateValues": true,
  "duplicateValueThreshold": 3,
  "checkDeadCssVars": true
}
```

Rules can use `error`, `warning`, `info`, or `off` severities. `failOn` controls the minimum severity that causes a nonzero exit code:

```json
{
  "rules": {
    "undefined-class": "error",
    "dead-css": "warning",
    "hardcoded-inline": "off"
  },
  "failOn": "warning"
}
```

Tailwind recognition defaults to the built-in heuristic. Use strict mode with explicit prefixes or classes when the heuristic reports false positives:

```json
{
  "tailwind": {
    "mode": "strict",
    "prefixes": ["tw-"],
    "classes": ["flex", "hidden"]
  }
}
```

CSS Module references such as `styles.button` and `styles['button--active']` are checked against the stylesheet imported by that component. Parsing failures are reported as `parse-error` diagnostics rather than silently skipped.

Suppress individual findings with comments. `disable-next-line`, `disable-line`, and `ignore` accept rule IDs or `*`; a `disable` block stays active until its matching `enable` comment:

```jsx
{/* css-auditor-disable-next-line undefined-class */}
<div className="third-party-hook" />
```

```css
/* css-auditor-disable dead-css */
.generated-class { color: #fff; }
/* css-auditor-enable dead-css */
```

Duplicate-value analysis now combines CSS declarations, inline style objects, and styled-component templates. Common equivalent color spellings such as `white` and `#fff` are grouped together. JSON output includes a schema version and violation counts by rule and severity; SARIF results include stable fingerprints for CI annotations.

Run the automated regression suite with `npm test` (Node.js built-in test runner).

The auditor looks for this file in the scanned directory first, then falls back to your current working directory.

---

**Recommended starting point** — use Option 1 with `--verbose` to see everything, then add a `.cssauditrc.json` to suppress noise specific to your project.
