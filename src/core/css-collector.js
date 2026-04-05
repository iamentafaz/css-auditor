import postcss from 'postcss';
import postcssScss from 'postcss-scss';
import fs from 'fs';

/**
 * Parses a CSS/SCSS file and returns:
 *   classes         — Map<className, { file, line }>
 *   importantDecls  — array of { prop, cls, file, line }
 *   cssVarDefs      — Map<'--name', { file, line, value }>
 *   cssVarUsages    — array of { varName, file, line }
 *   zIndexDecls     — array of { value (number), cls, file, line }
 *   breakpoints     — array of { value (number), query, file, line }
 */
export function collectCssInfo(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const isScss = filePath.endsWith('.scss') || filePath.endsWith('.sass');

  const classes = new Map();
  const importantDecls = [];
  const cssVarDefs = new Map();
  const cssVarUsages = [];
  const zIndexDecls = [];
  const breakpoints = [];

  try {
    const root = postcss.parse(content, {
      syntax: isScss ? postcssScss : undefined,
    });

    // Track the "current" classes in scope for a rule so we can attach them to decls
    root.walkRules((rule) => {
      const selectors = rule.selectors || [rule.selector];
      const ruleClasses = [];

      for (const selector of selectors) {
        extractClassesFromSelector(selector).forEach((cls) => {
          ruleClasses.push(cls);
          if (!classes.has(cls)) {
            classes.set(cls, {
              file: filePath,
              line: rule.source?.start?.line ?? 0,
            });
          }
        });
      }

      // Walk declarations inside this rule
      rule.walkDecls((decl) => {
        const prop = decl.prop;
        const value = decl.value;
        const line = decl.source?.start?.line ?? 0;
        const clsLabel = ruleClasses[0] ?? '(unknown)';

        // !important detection
        if (decl.important) {
          importantDecls.push({ prop, cls: clsLabel, file: filePath, line });
        }

        // CSS custom property definitions: --my-token: value
        if (prop.startsWith('--')) {
          if (!cssVarDefs.has(prop)) {
            cssVarDefs.set(prop, { file: filePath, line, value });
          }
        }

        // CSS variable usages: var(--my-token)
        const varUsageRE = /var\(\s*(--[\w-]+)/g;
        let m;
        while ((m = varUsageRE.exec(value)) !== null) {
          cssVarUsages.push({ varName: m[1], file: filePath, line });
        }

        // z-index values
        if (prop === 'z-index') {
          const num = parseInt(value, 10);
          if (!isNaN(num)) {
            zIndexDecls.push({ value: num, cls: clsLabel, file: filePath, line });
          }
        }
      });
    });

    // CSS custom property definitions at :root / top-level
    root.walkDecls((decl) => {
      if (!decl.prop.startsWith('--')) return;
      if (cssVarDefs.has(decl.prop)) return;
      const line = decl.source?.start?.line ?? 0;
      cssVarDefs.set(decl.prop, { file: filePath, line, value: decl.value });

      // Also collect usages in values of custom properties themselves
      const varUsageRE = /var\(\s*(--[\w-]+)/g;
      let m;
      while ((m = varUsageRE.exec(decl.value)) !== null) {
        cssVarUsages.push({ varName: m[1], file: filePath, line });
      }
    });

    // @media breakpoint extraction
    root.walkAtRules('media', (rule) => {
      const line = rule.source?.start?.line ?? 0;
      const query = rule.params;
      // Extract pixel values from media queries: (max-width: 768px), (min-width: 1024px)
      const bpRE = /\b(\d+)px\b/g;
      let m;
      while ((m = bpRE.exec(query)) !== null) {
        breakpoints.push({ value: parseInt(m[1], 10), query, file: filePath, line });
      }
    });
  } catch (e) {
    // Silently skip unparseable files
  }

  return { classes, importantDecls, cssVarDefs, cssVarUsages, zIndexDecls, breakpoints };
}

/**
 * Convenience wrapper — kept for the existing collection loop in cli.js.
 * Returns only the classes Map.
 */
export function collectCssClasses(filePath) {
  return collectCssInfo(filePath).classes;
}

/**
 * Extracts all plain class names from a CSS selector string.
 * Handles: .foo, .foo:hover, .foo .bar, .foo > .bar, .foo.bar, :not(.foo)
 */
function extractClassesFromSelector(selector) {
  const classes = [];
  const regex = /\.(-?[a-zA-Z_][a-zA-Z0-9_-]*)/g;
  let match;
  while ((match = regex.exec(selector)) !== null) {
    classes.push(match[1]);
  }
  return classes;
}
