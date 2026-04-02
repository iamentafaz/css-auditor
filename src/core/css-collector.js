import postcss from 'postcss';
import postcssScss from 'postcss-scss';
import fs from 'fs';

/**
 * Extracts all class names defined in a CSS/SCSS file.
 * Returns a Map of className -> { file, line }
 */
export function collectCssClasses(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const isScss = filePath.endsWith('.scss') || filePath.endsWith('.sass');
  const classes = new Map();

  try {
    const root = postcss.parse(content, {
      syntax: isScss ? postcssScss : undefined,
    });

    root.walkRules((rule) => {
      // Handle comma-separated selectors: .foo, .bar {}
      const selectors = rule.selectors || [rule.selector];
      for (const selector of selectors) {
        extractClassesFromSelector(selector).forEach((cls) => {
          if (!classes.has(cls)) {
            classes.set(cls, {
              file: filePath,
              line: rule.source?.start?.line ?? 0,
            });
          }
        });
      }
    });
  } catch (e) {
    // Silently skip unparseable files
  }

  return classes;
}

/**
 * Extracts all plain class names from a CSS selector string.
 * Handles: .foo, .foo:hover, .foo .bar, .foo > .bar, .foo.bar, :not(.foo)
 */
function extractClassesFromSelector(selector) {
  const classes = [];
  // Match all .classname tokens (including those inside pseudo-classes)
  const regex = /\.(-?[a-zA-Z_][a-zA-Z0-9_-]*)/g;
  let match;
  while ((match = regex.exec(selector)) !== null) {
    classes.push(match[1]);
  }
  return classes;
}
