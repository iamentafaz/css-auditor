import path from 'path';
import { isTokenValue, normalizeTokenValue } from './token-values.js';

// Known Tailwind prefixes and utility patterns — these are never "undefined" custom classes
const TAILWIND_PREFIXES = [
  // Layout
  'container', 'flex', 'grid', 'block', 'inline', 'hidden', 'float',
  'overflow', 'object', 'position', 'inset', 'top', 'right', 'bottom', 'left',
  'z', 'order', 'col', 'row', 'aspect', 'basis', 'grow', 'shrink',
  // Spacing
  'p', 'px', 'py', 'pt', 'pr', 'pb', 'pl', 'ps', 'pe',
  'm', 'mx', 'my', 'mt', 'mr', 'mb', 'ml', 'ms', 'me',
  'space', 'gap', 'gap-x', 'gap-y',
  // Sizing
  'w', 'h', 'min', 'max', 'size',
  // Typography
  'font', 'text', 'leading', 'tracking', 'whitespace', 'break', 'truncate',
  'underline', 'overline', 'line', 'indent', 'align', 'list', 'decoration',
  // Color & backgrounds
  'bg', 'from', 'to', 'via', 'gradient',
  'border', 'outline', 'ring', 'shadow',
  // Flexbox / Grid
  'justify', 'items', 'content', 'self', 'place',
  // Effects & transforms
  'opacity', 'mix', 'blur', 'brightness', 'contrast', 'drop', 'grayscale',
  'hue', 'invert', 'saturate', 'sepia', 'backdrop',
  'rotate', 'scale', 'skew', 'translate', 'transform',
  'transition', 'duration', 'ease', 'delay', 'animate',
  // Interactivity
  'cursor', 'pointer', 'select', 'resize', 'scroll', 'snap', 'touch', 'user',
  'appearance', 'caret', 'accent',
  // Borders & radius
  'rounded', 'divide',
  // Accessibility
  'sr', 'not',
  // Misc
  'relative', 'absolute', 'fixed', 'sticky', 'static',
  'table', 'caption', 'flow',
  'visible', 'invisible', 'collapse',
  'antialiased', 'subpixel',
  'italic', 'not-italic', 'normal', 'bold', 'semibold', 'medium', 'thin', 'light', 'extrabold', 'black',
  'uppercase', 'lowercase', 'capitalize',
  'group', 'peer',
  'dark',
];

// Tailwind variant prefixes (responsive, state, etc.)
const TAILWIND_VARIANTS = [
  'hover', 'focus', 'active', 'visited', 'checked', 'disabled', 'enabled',
  'placeholder', 'first', 'last', 'odd', 'even', 'only', 'empty',
  'focus-within', 'focus-visible',
  'sm', 'md', 'lg', 'xl', '2xl',
  'dark', 'print',
  'group-hover', 'group-focus', 'peer-hover', 'peer-focus', 'peer-checked',
  'motion-reduce', 'motion-safe',
  'ltr', 'rtl',
  'open', 'before', 'after', 'first-line', 'first-letter', 'selection', 'marker',
  'file', 'read-only', 'required', 'optional', 'valid', 'invalid', 'in-range',
  'out-of-range', 'autofill', 'indeterminate',
  'aria',
];

/**
 * Returns true if a class name looks like a Tailwind utility class.
 */
export function isTailwindClass(cls, tailwindConfig = {}) {
  if (tailwindConfig.enabled === false) return false;
  if ((tailwindConfig.classes || []).includes(cls)) return true;
  // Strip variant prefixes: hover:, sm:, dark:focus:, etc.
  let base = cls;
  let parts = cls.split(':');
  if (parts.length > 1) {
    // All but last part should be variants
    const variants = parts.slice(0, -1);
    const allVariants = variants.every((v) =>
      [...TAILWIND_VARIANTS, ...(tailwindConfig.variants || [])].some((prefix) => v === prefix || v.startsWith(prefix + '-'))
    );
    if (allVariants) base = parts[parts.length - 1];
  }

  const configuredPrefixes = tailwindConfig.prefixes || [];
  if (tailwindConfig.mode === 'strict') {
    const candidate = base.startsWith('-') ? base.slice(1) : base;
    return configuredPrefixes.some((prefix) => candidate === prefix || candidate.startsWith(prefix.endsWith('-') ? prefix : prefix + '-'));
  }

  // Handle negation: -mt-4
  const stripped = base.startsWith('-') ? base.slice(1) : base;

  // Handle arbitrary values: w-[100px], bg-[#fff], text-[1.5rem]
  if (/\[.+\]/.test(stripped)) return true;

  // Exact utility matches
  const exactMatches = [
    'flex', 'block', 'inline', 'hidden', 'relative', 'absolute', 'fixed', 'sticky', 'static',
    'italic', 'bold', 'semibold', 'normal', 'medium', 'thin', 'light', 'extrabold', 'black',
    'uppercase', 'lowercase', 'capitalize', 'truncate', 'underline', 'overline', 'antialiased',
    'visible', 'invisible', 'collapse', 'table', 'contents', 'list-none', 'list-disc', 'list-decimal',
    'shrink', 'grow', 'pointer-events-none', 'pointer-events-auto', 'select-none', 'select-all',
    'sr-only', 'not-sr-only',
    'tabular-nums', 'lining-nums', 'proportional-nums', 'normal-nums',
    'ordinal', 'slashed-zero', 'diagonal-fractions', 'stacked-fractions',
  ];
  if (exactMatches.includes(stripped)) return true;

  // Prefix match: w-4, p-2, bg-red-500, text-sm, etc.
  const prefixes = [...TAILWIND_PREFIXES, ...configuredPrefixes];
  return prefixes.some((prefix) => {
    return stripped === prefix || stripped.startsWith(prefix.endsWith('-') ? prefix : prefix + '-');
  });
}

/**
 * Main analysis function. Takes all collected data and returns violations.
 *
 * @param {Map} allCssClasses - Map<className, { file, line }> from all CSS files
 * @param {Map} jsxFileData   - Map<filePath, { classUsages, inlineStyles }>
 * @param {Map} styledData    - Map<filePath, { styledDefinitions, hardcodedStyled, renderedElements, zIndexDecls, cssVarUsages }>
 * @param {object} config
 * @param {Map} cssFileData   - Map<filePath, collectCssInfo result> (optional)
 */
export function analyze(allCssClasses, jsxFileData, styledData = new Map(), config = {}, cssFileData = new Map()) {
  const {
    ignoreClasses = [],
    ignorePaths = [],
    checkDeadCss = true,
    checkUndefined = true,
    checkHardcodedInline = true,
    checkHardcodedStyled = true,
    checkDeadStyledComponents = true,
    checkImportant = true,
    checkDeadCssVars = true,
    checkDuplicateValues = true,
    duplicateValueThreshold = 3,
    checkHighZIndex = true,
    zIndexThreshold = 50,
    checkBreakpoints = true,
    knownBreakpoints = [],
  } = config;
  const tailwindConfig = config.tailwind || {};

  const violations = new Map(); // filePath -> violation[]
  const usedCssClasses = new Set();
  const renderedComponents = new Set(); // PascalCase JSX element names seen across all files

  // ── Pass 1: scan JSX files ──────────────────────────────────────────────
  for (const [filePath, jsxInfo] of jsxFileData) {
    if (shouldIgnore(filePath, ignorePaths)) continue;
    const { classUsages = [], inlineStyles = [] } = jsxInfo;

    const fileViolations = [];

    if (jsxInfo.parseError) fileViolations.push(parseErrorViolation(jsxInfo.parseError));

    // Check className usage
    for (const usage of classUsages) {
      const moduleRefs = usage.cssModuleRefs || [];
      for (const ref of moduleRefs) {
        if (ignoreClasses.includes(ref.className)) continue;
        const moduleClasses = cssFileData.get(ref.file)?.classes;
        if (!moduleClasses?.has(ref.className)) {
          fileViolations.push({ type: 'undefined-class', severity: 'error', line: usage.line,
            message: `CSS Module class "${ref.className}" is not defined in ${path.basename(ref.file)}`,
            detail: usage.isDynamic ? '(reference extracted from dynamic expression)' : null, cls: ref.className });
        } else {
          usedCssClasses.add(`${ref.file}::${ref.className}`);
        }
      }
      for (const cls of usage.classes) {
        if (ignoreClasses.includes(cls)) continue;

        // Track for dead CSS check
        if (!isTailwindClass(cls, tailwindConfig)) {
          usedCssClasses.add(cls);
        }

        // Check if custom (non-Tailwind) class is defined anywhere
        if (checkUndefined && !isTailwindClass(cls, tailwindConfig) && !allCssClasses.has(cls)) {
          fileViolations.push({
            type: 'undefined-class',
            severity: 'error',
            line: usage.line,
            message: `Class "${cls}" is applied but not defined in any CSS/SCSS file`,
            detail: usage.isDynamic ? '(extracted from dynamic expression)' : null,
            cls,
          });
        }
      }
    }

    // Check inline styles
    if (checkHardcodedInline) {
      for (const styleInfo of inlineStyles) {
        if (styleInfo.hardcodedProps.length === 0) continue;

        for (const prop of styleInfo.hardcodedProps) {
          fileViolations.push({
            type: 'hardcoded-inline',
            severity: 'warning',
            line: prop.line,
            message: `Hardcoded inline style: \`${prop.key}: ${prop.value}\``,
            detail: 'Move to a CSS class or design token. Inline styles should only be used for dynamic values.',
            prop,
          });
        }
      }
    }

    if (fileViolations.length > 0) {
      violations.set(filePath, fileViolations);
    }
  }

  // ── Pass A: styled-components — hardcoded values + collect rendered names ─
  for (const [filePath, { styledDefinitions = [], hardcodedStyled = [], renderedElements = new Set() }] of styledData) {
    if (shouldIgnore(filePath, ignorePaths)) continue;

    // Accumulate rendered component names for dead-component check (Pass B)
    for (const name of renderedElements) renderedComponents.add(name);

    if (checkHardcodedStyled && hardcodedStyled.length > 0) {
      const fileViolations = violations.get(filePath) || [];
      for (const h of hardcodedStyled) {
        fileViolations.push({
          type: 'hardcoded-styled',
          severity: 'warning',
          line: h.line,
          message: `Hardcoded value in \`${h.componentName}\`: \`${h.prop}: ${h.value}\``,
          detail: 'Move to a design token or CSS variable. Styled-component templates should reference theme variables.',
        });
      }
      violations.set(filePath, fileViolations);
    }
  }

  // ── Pass 2: dead CSS — classes defined but never used ──────────────────
  if (checkDeadCss) {
    const deadByFile = new Map();

    const definitions = cssFileData.size
      ? [...cssFileData].flatMap(([file, info]) => [...info.classes].map(([cls, data]) => [cls, { ...data, file }]))
      : [...allCssClasses];
    for (const [cls, { file, line }] of definitions) {
      if (ignoreClasses.includes(cls)) continue;
      const isCssModule = /\.module\.(css|scss|sass)$/i.test(file);
      const isUsed = isCssModule
        ? usedCssClasses.has(`${file}::${cls}`)
        : usedCssClasses.has(cls);
      if (isUsed) continue;

      if (!deadByFile.has(file)) deadByFile.set(file, []);
      deadByFile.get(file).push({
        type: 'dead-css', severity: 'info', line,
        message: `Dead CSS: class ".${cls}" is defined but never used in any component`,
        detail: 'Consider removing it to reduce stylesheet size.', cls,
      });
    }

    for (const [file, fileViolations] of deadByFile) {
      if (shouldIgnore(file, ignorePaths)) continue;
      const existing = violations.get(file) || [];
      violations.set(file, [...existing, ...fileViolations]);
    }
  }

  // ── Pass B: dead styled components — defined but never rendered ────────────
  if (checkDeadStyledComponents) {
    for (const [filePath, { styledDefinitions = [] }] of styledData) {
      if (shouldIgnore(filePath, ignorePaths)) continue;

      for (const def of styledDefinitions) {
        if (renderedComponents.has(def.name)) continue;

        const existing = violations.get(filePath) || [];
        existing.push({
          type: 'dead-styled-component',
          severity: 'info',
          line: def.line,
          message: `Dead styled component: \`${def.name}\` is defined but never rendered`,
          detail: 'Consider removing it or checking if it was accidentally left behind.',
        });
        violations.set(filePath, existing);
      }
    }
  }

  // ── Pass C: CSS-file-level checks (!important, z-index, breakpoints) ───────
  for (const [filePath, cssInfo] of cssFileData) {
    if (shouldIgnore(filePath, ignorePaths)) continue;

    const fileViolations = violations.get(filePath) || [];
    let added = false;
    if (cssInfo.parseError) {
      fileViolations.push(parseErrorViolation(cssInfo.parseError));
      added = true;
    }

    // !important usage
    if (checkImportant) {
      for (const decl of cssInfo.importantDecls || []) {
        fileViolations.push({
          type: 'important-usage',
          severity: 'warning',
          line: decl.line,
          message: `\`!important\` used on \`${decl.prop}\` in ".${decl.cls}" — avoid specificity overrides`,
          detail: 'Prefer higher specificity selectors or refactor to avoid needing !important.',
        });
        added = true;
      }
    }

    // High z-index in CSS files
    if (checkHighZIndex) {
      for (const zi of cssInfo.zIndexDecls || []) {
        if (zi.value <= zIndexThreshold) continue;
        fileViolations.push({
          type: 'high-z-index',
          severity: 'warning',
          line: zi.line,
          message: `High z-index: \`z-index: ${zi.value}\` in ".${zi.cls}" — consider a z-index scale or CSS variable`,
          detail: `Values above ${zIndexThreshold} signal stacking context issues. Use a defined z-index scale.`,
        });
        added = true;
      }
    }

    // Breakpoint consistency
    if (checkBreakpoints && cssInfo.breakpoints?.length > 0) {
      for (const bp of cssInfo.breakpoints) {
        let flagged = false;

        // If an explicit allowlist is given, flag anything not in it
        if (knownBreakpoints.length > 0 && !knownBreakpoints.includes(bp.value)) {
          fileViolations.push({
            type: 'inconsistent-breakpoint',
            severity: 'warning',
            line: bp.line,
            message: `Non-standard breakpoint: \`${bp.value}px\` in \`@media ${bp.query}\``,
            detail: `Known breakpoints: ${knownBreakpoints.join(', ')}px. Use a consistent breakpoint scale.`,
          });
          flagged = true;
        }

        added = added || flagged;
      }
    }

    if (added) violations.set(filePath, fileViolations);
  }

  // ── Pass D: breakpoint near-miss detection (across all CSS files) ──────────
  if (checkBreakpoints && knownBreakpoints.length === 0) {
    // Collect all breakpoint values across files
    const allBreakpoints = [];
    for (const [filePath, cssInfo] of cssFileData) {
      if (shouldIgnore(filePath, ignorePaths)) continue;
      for (const bp of cssInfo.breakpoints || []) {
        allBreakpoints.push({ ...bp, filePath });
      }
    }

    // Flag breakpoints that are within ±2px of another breakpoint in a different file
    for (let i = 0; i < allBreakpoints.length; i++) {
      for (let j = i + 1; j < allBreakpoints.length; j++) {
        const a = allBreakpoints[i];
        const b = allBreakpoints[j];
        const diff = Math.abs(a.value - b.value);
        if (diff > 0 && diff <= 2) {
          // Flag both locations
          for (const bp of [a, b]) {
            const existing = violations.get(bp.filePath) || [];
            existing.push({
              type: 'inconsistent-breakpoint',
              severity: 'warning',
              line: bp.line,
              message: `Near-duplicate breakpoint: \`${bp.value}px\` is within 2px of another breakpoint`,
              detail: `Breakpoints ${a.value}px and ${b.value}px are likely the same breakpoint with a typo. Use a consistent value.`,
            });
            violations.set(bp.filePath, existing);
          }
        }
      }
    }
  }

  // ── Pass E: high z-index in styled-components ──────────────────────────────
  if (checkHighZIndex) {
    for (const [filePath, { zIndexDecls = [] }] of styledData) {
      if (shouldIgnore(filePath, ignorePaths)) continue;
      const fileViolations = violations.get(filePath) || [];
      let added = false;
      for (const zi of zIndexDecls) {
        if (zi.value <= zIndexThreshold) continue;
        fileViolations.push({
          type: 'high-z-index',
          severity: 'warning',
          line: zi.line,
          message: `High z-index: \`z-index: ${zi.value}\` in \`${zi.componentName}\` — consider a z-index scale or CSS variable`,
          detail: `Values above ${zIndexThreshold} signal stacking context issues. Use a defined z-index scale.`,
        });
        added = true;
      }
      if (added) violations.set(filePath, fileViolations);
    }
  }

  // ── Pass F: CSS custom property tracking ───────────────────────────────────
  {
    // Collect all defined CSS custom properties across all CSS files
    const allVarDefs = new Map(); // '--name' -> { file, line }
    for (const [, cssInfo] of cssFileData) {
      for (const [varName, def] of cssInfo.cssVarDefs || []) {
        if (!allVarDefs.has(varName)) allVarDefs.set(varName, def);
      }
    }

    // Collect all CSS var usages from CSS files + styled-components
    const allVarUsages = []; // array of { varName, file, line }
    for (const [, cssInfo] of cssFileData) {
      for (const u of cssInfo.cssVarUsages || []) allVarUsages.push(u);
    }
    for (const [, styledInfo] of styledData) {
      for (const u of styledInfo.cssVarUsages || []) allVarUsages.push(u);
    }

    const usedVarNames = new Set(allVarUsages.map((u) => u.varName));

    // Undefined var references: var(--x) used but --x never defined
    const undefinedVarsByFile = new Map();
    for (const usage of allVarUsages) {
      if (allVarDefs.has(usage.varName)) continue;
      if (!undefinedVarsByFile.has(usage.file)) undefinedVarsByFile.set(usage.file, []);
      undefinedVarsByFile.get(usage.file).push(usage);
    }
    for (const [filePath, usages] of undefinedVarsByFile) {
      if (shouldIgnore(filePath, ignorePaths)) continue;
      const fileViolations = violations.get(filePath) || [];
      for (const u of usages) {
        fileViolations.push({
          type: 'undefined-css-var',
          severity: 'error',
          line: u.line,
          message: `CSS variable \`${u.varName}\` is used but never defined`,
          detail: 'Define it in a :root block or CSS custom properties file.',
        });
      }
      violations.set(filePath, fileViolations);
    }

    // Dead var definitions: --x defined but var(--x) never used
    if (checkDeadCssVars) {
      const deadVarsByFile = new Map();
      for (const [varName, def] of allVarDefs) {
        if (usedVarNames.has(varName)) continue;
        if (!deadVarsByFile.has(def.file)) deadVarsByFile.set(def.file, []);
        deadVarsByFile.get(def.file).push({ varName, ...def });
      }
      for (const [filePath, defs] of deadVarsByFile) {
        if (shouldIgnore(filePath, ignorePaths)) continue;
        const fileViolations = violations.get(filePath) || [];
        for (const d of defs) {
          fileViolations.push({
            type: 'dead-css-var',
            severity: 'info',
            line: d.line,
            message: `CSS variable \`${d.varName}\` is defined but never referenced with var()`,
            detail: 'Consider removing it to keep the token set clean.',
          });
        }
        violations.set(filePath, fileViolations);
      }
    }
  }

  // ── Pass G: duplicate hardcoded values across styled-components ─────────────
  if (checkDuplicateValues) {
    // Collect all hardcoded values from styled-components across all files
    const valueMap = new Map(); // normalized value -> array of locations
    const addValue = (value, occurrence) => {
      const normalized = normalizeTokenValue(value);
      if (!valueMap.has(normalized)) valueMap.set(normalized, []);
      valueMap.get(normalized).push({ ...occurrence, componentName: occurrence.componentName || occurrence.source });
    };
    for (const [filePath, { hardcodedStyled = [] }] of styledData) {
      if (shouldIgnore(filePath, ignorePaths)) continue;
      for (const h of hardcodedStyled) {
        addValue(h.value, { file: filePath, line: h.line, componentName: h.componentName, prop: h.prop });
      }
    }
    for (const [filePath, cssInfo] of cssFileData) {
      if (shouldIgnore(filePath, ignorePaths)) continue;
      for (const item of cssInfo.hardcodedValues || []) addValue(item.value, { file: filePath, line: item.line, source: `.${item.cls}` });
    }
    for (const [filePath, jsxInfo] of jsxFileData) {
      if (shouldIgnore(filePath, ignorePaths)) continue;
      for (const style of jsxInfo.inlineStyles || []) {
        for (const item of style.hardcodedProps || []) {
          if (isTokenValue(item.key, item.value)) addValue(item.value, { file: filePath, line: item.line, source: `inline ${item.key}` });
        }
      }
    }

    // Find values that exceed the threshold and emit a single info violation per file
    const duplicateViolationsByFile = new Map();
    for (const [value, occurrences] of valueMap) {
      if (occurrences.length < duplicateValueThreshold) continue;

      // Group by file and emit one violation per file (at the first occurrence in that file)
      const byFile = new Map();
      for (const occ of occurrences) {
        if (!byFile.has(occ.file)) byFile.set(occ.file, occ);
      }
      for (const [filePath, firstOcc] of byFile) {
        if (!duplicateViolationsByFile.has(filePath)) duplicateViolationsByFile.set(filePath, []);
        duplicateViolationsByFile.get(filePath).push({
          type: 'duplicate-hardcoded-value',
          severity: 'info',
          line: firstOcc.line,
          message: `Value \`${value}\` is hardcoded in ${occurrences.length} places — consider a CSS variable or design token`,
          detail: `Appears in: ${[...new Set(occurrences.map((o) => o.componentName || o.source))].join(', ')}`,
        });
      }
    }

    for (const [filePath, dupViolations] of duplicateViolationsByFile) {
      const existing = violations.get(filePath) || [];
      violations.set(filePath, [...existing, ...dupViolations]);
    }
  }

  // Styled and CSS collectors parse the same source independently; report one parser diagnostic per file.
  for (const [filePath, info] of styledData) {
    if (!info.parseError || shouldIgnore(filePath, ignorePaths)) continue;
    const existing = violations.get(filePath) || [];
    if (!existing.some((violation) => violation.type === 'parse-error')) {
      existing.push(parseErrorViolation(info.parseError));
      violations.set(filePath, existing);
    }
  }

  for (const [filePath, fileViolations] of violations) {
    const comments = jsxFileData.get(filePath)?.comments || cssFileData.get(filePath)?.comments || styledData.get(filePath)?.comments || [];
    const ranges = buildSuppressionRanges(comments);
    if (ranges.length) {
      const remaining = fileViolations.filter((violation) => !ranges.some((range) =>
        (range.rule === '*' || range.rule === violation.type) && violation.line >= range.start && violation.line <= range.end));
      if (remaining.length) violations.set(filePath, remaining);
      else violations.delete(filePath);
    }
  }

  for (const [, fileViolations] of violations) {
    for (const violation of fileViolations) {
      const severity = config.rules?.[violation.type];
      if (severity === 'off') violation.suppressed = true;
      else if (['error', 'warning', 'info'].includes(severity)) violation.severity = severity;
    }
  }
  for (const [filePath, fileViolations] of violations) {
    const active = fileViolations.filter((violation) => !violation.suppressed);
    if (active.length) violations.set(filePath, active);
    else violations.delete(filePath);
  }
  return violations;
}

function parseErrorViolation(error) {
  return {
    type: 'parse-error', severity: 'error', line: error.line || 0, column: error.column,
    message: `Could not parse source: ${error.message}`,
  };
}

function buildSuppressionRanges(comments) {
  const ranges = [];
  const open = new Map();
  const directivePattern = /(?:^|\n)\s*\*?\s*css-auditor-(disable-next-line|disable-line|disable|enable|ignore)\b([^\n]*)/gi;
  for (const comment of comments) {
    directivePattern.lastIndex = 0;
    let match;
    while ((match = directivePattern.exec(comment.value)) !== null) {
      const directiveLine = (comment.line || 1) + comment.value.slice(0, match.index).split('\n').length - 1;
      const rules = match[2].trim().split(/[\s,]+/).filter(Boolean);
      const targets = rules.length ? rules : ['*'];
      if (match[1] === 'disable-next-line' || match[1] === 'ignore') {
        for (const rule of targets) ranges.push({ rule, start: directiveLine + (match[1] === 'ignore' ? 0 : 1), end: directiveLine + (match[1] === 'ignore' ? 0 : 1) });
      } else if (match[1] === 'disable-line') {
        for (const rule of targets) ranges.push({ rule, start: directiveLine, end: directiveLine });
      } else if (match[1] === 'disable') {
        for (const rule of targets) open.set(rule, directiveLine + 1);
      } else if (match[1] === 'enable') {
        for (const rule of targets) {
          const start = open.get(rule);
          if (start !== undefined) ranges.push({ rule, start, end: directiveLine - 1 });
          open.delete(rule);
        }
      }
    }
  }
  for (const [rule, start] of open) ranges.push({ rule, start, end: Infinity });
  return ranges;
}

function shouldIgnore(filePath, ignorePaths) {
  return ignorePaths.some((p) => filePath.includes(p));
}
