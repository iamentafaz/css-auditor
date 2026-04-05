#!/usr/bin/env node
import { glob } from 'glob';
import fs from 'fs';
import path from 'path';
import { collectCssInfo } from './core/css-collector.js';
import { collectJsxInfo } from './core/jsx-collector.js';
import { collectStyledInfo } from './core/styled-collector.js';
import { analyze, isTailwindClass } from './core/analyzer.js';
import { report, reportJson } from './reporter.js';

// ── Parse CLI args ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flags = {
  verbose: args.includes('--verbose') || args.includes('-v'),
  json:    args.includes('--json'),
  help:    args.includes('--help') || args.includes('-h'),
};

const positional = args.filter((a) => !a.startsWith('-'));
const targetDir  = positional[0] || '.';

if (flags.help) {
  printHelp();
  process.exit(0);
}

// ── Load config ───────────────────────────────────────────────────────────
const config = loadConfig(targetDir);

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  const resolvedDir = path.resolve(targetDir);

  if (!fs.existsSync(resolvedDir)) {
    console.error(`\n  Error: directory not found: ${resolvedDir}\n`);
    process.exit(1);
  }

  if (!flags.json) {
    console.log('');
    console.log(`  css-auditor  scanning ${path.relative(process.cwd(), resolvedDir) || '.'}`);
    console.log('');
  }

  // ── Discover files ───────────────────────────────────────────────────────
  const [cssFiles, jsxFiles] = await Promise.all([
    glob('**/*.{css,scss,sass}', {
      cwd: resolvedDir,
      absolute: true,
      ignore: [...(config.ignorePaths || []), '**/node_modules/**', '**/dist/**', '**/build/**', '**/.next/**'],
    }),
    glob('**/*.{jsx,tsx,js,ts}', {
      cwd: resolvedDir,
      absolute: true,
      ignore: [...(config.ignorePaths || []), '**/node_modules/**', '**/dist/**', '**/build/**', '**/.next/**', '**/*.test.*', '**/*.spec.*', '**/*.stories.*'],
    }),
  ]);

  // ── Collect CSS classes + extended info ─────────────────────────────────
  const allCssClasses = new Map();
  const cssFileData = new Map(); // filePath -> full collectCssInfo result
  for (const file of cssFiles) {
    const info = collectCssInfo(file);
    cssFileData.set(file, info);
    for (const [cls, clsInfo] of info.classes) {
      if (!allCssClasses.has(cls)) {
        allCssClasses.set(cls, clsInfo);
      }
    }
  }

  // ── Collect JSX info + styled-components info ───────────────────────────
  const jsxFileData = new Map();
  const styledData = new Map();
  let tailwindClassCount = 0;
  let customClassCount = 0;
  let styledComponentCount = 0;

  for (const file of jsxFiles) {
    const info = collectJsxInfo(file);
    const styledInfo = collectStyledInfo(file);
    jsxFileData.set(file, info);
    styledData.set(file, styledInfo);

    // Count class usage for stats
    for (const usage of info.classUsages || []) {
      for (const cls of usage.classes) {
        if (isTailwindClass(cls)) tailwindClassCount++;
        else customClassCount++;
      }
    }

    styledComponentCount += styledInfo.styledDefinitions?.length ?? 0;
  }

  // ── Analyze ──────────────────────────────────────────────────────────────
  const violations = analyze(allCssClasses, jsxFileData, styledData, config, cssFileData);

  // ── Report ───────────────────────────────────────────────────────────────
  const stats = {
    jsxFiles: jsxFiles.length,
    cssFiles: cssFiles.length,
    cssClasses: allCssClasses.size,
    tailwindClasses: tailwindClassCount,
    customClasses: customClassCount,
    styledComponents: styledComponentCount,
  };

  if (flags.json) {
    reportJson(violations, stats);
  } else {
    report(violations, stats, { verbose: flags.verbose, cwd: process.cwd() });
  }

  // Exit code 1 if there are errors (for CI)
  const hasErrors = [...violations.values()].flat().some((v) => v.severity === 'error');
  process.exit(hasErrors ? 1 : 0);
}

// ── Config loader ─────────────────────────────────────────────────────────
function loadConfig(dir) {
  const configPaths = [
    path.resolve(dir, '.cssauditrc.json'),
    path.resolve(dir, 'cssaudit.config.json'),
    path.resolve(process.cwd(), '.cssauditrc.json'),
  ];

  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      try {
        return JSON.parse(fs.readFileSync(configPath, 'utf8'));
      } catch (e) {
        console.warn(`  Warning: could not parse config at ${configPath}`);
      }
    }
  }

  return {};
}

function printHelp() {
  console.log(`
  css-auditor — CSS usage auditor for React + Tailwind codebases

  Usage:
    css-auditor [directory] [options]

  Arguments:
    directory     Path to scan (default: current directory)

  Options:
    --verbose, -v    Show fix suggestions for each violation
    --json           Output results as JSON (for CI/tooling integration)
    --help, -h       Show this help message

  Config:
    Place a .cssauditrc.json file in the scanned directory to configure rules.

  Example .cssauditrc.json:
    {
      "ignoreClasses": ["js-hook", "data-test"],
      "ignorePaths":   ["src/legacy", "src/vendor"],
      "checkDeadCss":               true,
      "checkUndefined":             true,
      "checkHardcodedInline":       true,
      "checkHardcodedStyled":       true,
      "checkDeadStyledComponents":  true,
      "checkImportant":             true,
      "checkDeadCssVars":           true,
      "checkDuplicateValues":       true,
      "duplicateValueThreshold":    3,
      "checkHighZIndex":            true,
      "zIndexThreshold":            50,
      "checkBreakpoints":           true,
      "knownBreakpoints":           [640, 768, 1024, 1280, 1536]
    }

  Exit codes:
    0   No errors (warnings/info may exist)
    1   One or more undefined-class errors found (useful for CI)
`);
}

main().catch((err) => {
  console.error('\n  Unexpected error:', err.message);
  if (flags.verbose) console.error(err.stack);
  process.exit(2);
});
