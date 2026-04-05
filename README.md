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

The auditor looks for this file in the scanned directory first, then falls back to your current working directory.

---

**Recommended starting point** — use Option 1 with `--verbose` to see everything, then add a `.cssauditrc.json` to suppress noise specific to your project.