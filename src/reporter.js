import chalk from 'chalk';
import path from 'path';

const ICONS = {
  error: '✖',
  warning: '⚠',
  info: '○',
  success: '✔',
};

const COLORS = {
  'undefined-class':          chalk.red,
  'hardcoded-inline':         chalk.yellow,
  'hardcoded-styled':         chalk.yellow,
  'dead-css':                 chalk.cyan,
  'dead-styled-component':    chalk.magenta,
  'important-usage':          chalk.yellow,
  'undefined-css-var':        chalk.red,
  'dead-css-var':             chalk.cyan,
  'duplicate-hardcoded-value':chalk.cyan,
  'high-z-index':             chalk.yellow,
  'inconsistent-breakpoint':  chalk.yellow,
};

const LABELS = {
  'undefined-class':          chalk.bgRed.white(' UNDEF '),
  'hardcoded-inline':         chalk.bgYellow.black(' INLINE '),
  'hardcoded-styled':         chalk.bgYellow.black(' STYLED '),
  'dead-css':                 chalk.bgCyan.black(' DEAD  '),
  'dead-styled-component':    chalk.bgMagenta.white(' DEAD-SC'),
  'important-usage':          chalk.bgYellow.black(' IMPRT '),
  'undefined-css-var':        chalk.bgRed.white(' CSS-VAR'),
  'dead-css-var':             chalk.bgCyan.black(' CSS-VAR'),
  'duplicate-hardcoded-value':chalk.bgCyan.black(' DUP-VAL'),
  'high-z-index':             chalk.bgYellow.black(' Z-IDX '),
  'inconsistent-breakpoint':  chalk.bgYellow.black(' BRKPT '),
};

export function report(violations, stats, options = {}) {
  const { verbose = false, cwd = process.cwd() } = options;

  const totalViolations = [...violations.values()].reduce((s, v) => s + v.length, 0);

  if (totalViolations === 0) {
    console.log('\n' + chalk.green('✔  No violations found. Your CSS is clean!') + '\n');
    printStats(stats);
    return;
  }

  console.log('');

  // ── Per-file output ──────────────────────────────────────────────────────
  for (const [filePath, fileViolations] of violations) {
    const rel = path.relative(cwd, filePath);

    // Group by type for the header badge summary
    const counts = countByType(fileViolations);
    const badges = Object.entries(counts)
      .map(([type, n]) => `${LABELS[type]} ${chalk.dim(`×${n}`)}`)
      .join('  ');

    console.log(chalk.bold(`  ${rel}`));
    console.log(`  ${badges}`);
    console.log('');

    // Sort violations by line
    const sorted = [...fileViolations].sort((a, b) => (a.line || 0) - (b.line || 0));

    for (const v of sorted) {
      const color = COLORS[v.type] || chalk.white;
      const icon = v.severity === 'error' ? ICONS.error : v.severity === 'warning' ? ICONS.warning : ICONS.info;
      const lineTag = v.line ? chalk.dim(`L${v.line}`) : chalk.dim('  —  ');

      console.log(`    ${color(icon)}  ${lineTag.padEnd(6)}  ${color(v.message)}`);

      if (v.detail && verbose) {
        console.log(`             ${chalk.dim(v.detail)}`);
      }
    }

    console.log('');
  }

  // ── Summary bar ───────────────────────────────────────────────────────────
  printDivider();
  printStats(stats);

  const errorCount        = sumType(violations, 'undefined-class');
  const inlineCount       = sumType(violations, 'hardcoded-inline');
  const styledCount       = sumType(violations, 'hardcoded-styled');
  const deadCssCount      = sumType(violations, 'dead-css');
  const deadStyledCount   = sumType(violations, 'dead-styled-component');
  const importantCount    = sumType(violations, 'important-usage');
  const undefinedVarCount = sumType(violations, 'undefined-css-var');
  const deadVarCount      = sumType(violations, 'dead-css-var');
  const dupValueCount     = sumType(violations, 'duplicate-hardcoded-value');
  const highZCount        = sumType(violations, 'high-z-index');
  const brkptCount        = sumType(violations, 'inconsistent-breakpoint');

  const parts = [];
  if (errorCount)        parts.push(chalk.red(`${ICONS.error} ${errorCount} undefined`));
  if (undefinedVarCount) parts.push(chalk.red(`${ICONS.error} ${undefinedVarCount} undefined CSS vars`));
  if (inlineCount)       parts.push(chalk.yellow(`${ICONS.warning} ${inlineCount} hardcoded inline`));
  if (styledCount)       parts.push(chalk.yellow(`${ICONS.warning} ${styledCount} hardcoded styled`));
  if (importantCount)    parts.push(chalk.yellow(`${ICONS.warning} ${importantCount} !important`));
  if (highZCount)        parts.push(chalk.yellow(`${ICONS.warning} ${highZCount} high z-index`));
  if (brkptCount)        parts.push(chalk.yellow(`${ICONS.warning} ${brkptCount} breakpoint issues`));
  if (deadCssCount)      parts.push(chalk.cyan(`${ICONS.info} ${deadCssCount} dead CSS`));
  if (deadStyledCount)   parts.push(chalk.magenta(`${ICONS.info} ${deadStyledCount} dead styled`));
  if (deadVarCount)      parts.push(chalk.cyan(`${ICONS.info} ${deadVarCount} dead CSS vars`));
  if (dupValueCount)     parts.push(chalk.cyan(`${ICONS.info} ${dupValueCount} duplicate values`));

  console.log('\n  ' + parts.join(chalk.dim('  ·  ')));
  console.log(chalk.dim(`\n  ${violations.size} file(s) with violations\n`));

  if (!verbose) {
    console.log(chalk.dim('  Tip: run with --verbose for fix suggestions\n'));
  }
}

export function reportJson(violations, stats) {
  const output = {
    summary: stats,
    files: {},
  };

  for (const [filePath, fileViolations] of violations) {
    output.files[filePath] = fileViolations.map((v) => ({
      type: v.type,
      severity: v.severity,
      line: v.line,
      message: v.message,
      detail: v.detail,
    }));
  }

  console.log(JSON.stringify(output, null, 2));
}

function printStats(stats) {
  const parts = [
    chalk.dim(`${stats.jsxFiles} components`),
    chalk.dim(`${stats.cssFiles} stylesheets`),
    chalk.dim(`${stats.cssClasses} CSS classes`),
    chalk.dim(`${stats.tailwindClasses} Tailwind classes`),
  ];
  if (stats.styledComponents) parts.push(chalk.dim(`${stats.styledComponents} styled components`));
  const statLine = parts.join(chalk.dim('  ·  '));

  console.log('  ' + statLine + '\n');
}

function printDivider() {
  console.log(chalk.dim('  ' + '─'.repeat(60)));
}

function countByType(violations) {
  const counts = {};
  for (const v of violations) {
    counts[v.type] = (counts[v.type] || 0) + 1;
  }
  return counts;
}

function sumType(violations, type) {
  let total = 0;
  for (const vs of violations.values()) {
    total += vs.filter((v) => v.type === type).length;
  }
  return total;
}
