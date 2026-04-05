import * as parser from '@babel/parser';
import _traverse from '@babel/traverse';
const traverse = _traverse.default ?? _traverse;
import fs from 'fs';

/**
 * Parses a JS/TS/JSX/TSX file and extracts styled-components data:
 *  - styledDefinitions: array of { name, file, line }
 *  - hardcodedStyled:   array of { componentName, prop, value, line }
 *  - renderedElements:  Set<string> of PascalCase JSX element names used in this file
 *  - zIndexDecls:       array of { value (number), componentName, file, line }
 *  - cssVarUsages:      array of { varName, file, line }
 */
export function collectStyledInfo(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const styledDefinitions = [];
  const hardcodedStyled = [];
  const renderedElements = new Set();
  const zIndexDecls = [];
  const cssVarUsages = [];

  let ast;
  try {
    ast = parser.parse(content, {
      sourceType: 'module',
      plugins: [
        'jsx',
        'typescript',
        'decorators-legacy',
        'classProperties',
        'optionalChaining',
        'nullishCoalescingOperator',
      ],
    });
  } catch (e) {
    return { styledDefinitions, hardcodedStyled, renderedElements, zIndexDecls, cssVarUsages, parseError: e.message };
  }

  traverse(ast, {
    // ── Styled component definitions ─────────────────────────────────────────
    VariableDeclarator(path) {
      const { node } = path;
      if (!node.init || node.init.type !== 'TaggedTemplateExpression') return;
      if (!node.id || node.id.type !== 'Identifier') return;

      const tag = node.init.tag;
      if (!isStyledTag(tag)) return;

      const name = node.id.name;
      const line = node.loc?.start?.line ?? 0;
      styledDefinitions.push({ name, file: filePath, line });

      const { hardcoded, zIndex, varUsages } = extractFromTemplate(node.init.quasi);
      for (const h of hardcoded) {
        hardcodedStyled.push({ componentName: name, ...h });
      }
      for (const z of zIndex) {
        zIndexDecls.push({ componentName: name, file: filePath, ...z });
      }
      for (const v of varUsages) {
        cssVarUsages.push({ file: filePath, ...v });
      }
    },

    // ── JSX element usage (for dead-component detection) ─────────────────────
    JSXOpeningElement(path) {
      const nameNode = path.node.name;
      // Only collect PascalCase names — native HTML elements (div, span) are lowercase
      if (nameNode.type === 'JSXIdentifier' && /^[A-Z]/.test(nameNode.name)) {
        renderedElements.add(nameNode.name);
      }
    },
  });

  return { styledDefinitions, hardcodedStyled, renderedElements, zIndexDecls, cssVarUsages };
}

/**
 * Returns true if the AST tag node corresponds to a styled-components call:
 *   styled.div`...`            → MemberExpression  (object.name === 'styled')
 *   styled(Base)`...`          → CallExpression    (callee.name === 'styled')
 *   styled.div.attrs({})`...`  → CallExpression    (callee.object is styled.div)
 *   styled(Base).attrs({})`...`→ CallExpression    (callee.object is styled(Base))
 */
function isStyledTag(tag) {
  if (!tag) return false;

  // styled.div
  if (tag.type === 'MemberExpression' && tag.object?.name === 'styled') return true;

  // styled(Base)
  if (tag.type === 'CallExpression' && tag.callee?.name === 'styled') return true;

  // styled.div.attrs({}) or styled(Base).attrs({})
  if (tag.type === 'CallExpression' && tag.callee?.type === 'MemberExpression') {
    const obj = tag.callee.object;
    if (obj?.type === 'MemberExpression' && obj.object?.name === 'styled') return true;
    if (obj?.type === 'CallExpression' && obj.callee?.name === 'styled') return true;
  }

  return false;
}

// Matches a single CSS property declaration line: "  color: #fff;"
// Group 1 = property, Group 2 = value (trimmed, before semicolon)
const PROP_LINE_RE = /^\s*([\w-]+)\s*:\s*([^;{}]+?)\s*;?\s*$/;

// A value is "hardcoded" if it contains a hex color or an explicit CSS unit
const HARDCODED_VALUE_RE = /#[0-9a-fA-F]{3,8}|\d+(?:\.\d+)?(?:px|rem|em|vh|vw|ch|ex)\b/;

// Only flag properties that are genuine design-token candidates.
// Everything else (border, width, height, z-index, opacity, transition, etc.) is skipped —
// those values are either already not caught by the regex (unitless) or are structural values
// where hardcoding is reasonable without a token.
const TOKEN_PROPS = new Set([
  // Colors — always token candidates
  'color', 'background', 'background-color',
  'border-color', 'border-top-color', 'border-right-color',
  'border-bottom-color', 'border-left-color',
  'outline-color', 'fill', 'stroke', 'caret-color',
  'accent-color', 'column-rule-color', 'text-decoration-color',

  // Typography
  'font-size', 'letter-spacing', 'word-spacing', 'line-height',

  // Spacing — padding / margin / gap are the most common token candidates
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'padding-inline', 'padding-block', 'padding-inline-start', 'padding-inline-end',
  'padding-block-start', 'padding-block-end',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'margin-inline', 'margin-block', 'margin-inline-start', 'margin-inline-end',
  'margin-block-start', 'margin-block-end',
  'gap', 'row-gap', 'column-gap',

  // Shape — border-radius is frequently tokenized in design systems
  'border-radius',
  'border-top-left-radius', 'border-top-right-radius',
  'border-bottom-left-radius', 'border-bottom-right-radius',
]);

// Values that are always acceptable even within token properties
// (zero, percentages, and CSS-wide keywords never need a design token)
const SAFE_VALUE_RE = /^(0|auto|inherit|initial|unset|normal|none|transparent|revert|100%|50%|0%)$/i;

// Regex to extract var(--name) references from a value string
const CSS_VAR_USAGE_RE = /var\(\s*(--[\w-]+)/g;

/**
 * Scans the static quasis of a TemplateLiteral and returns:
 *   hardcoded  — token-worthy properties with literal values (no var/interpolation)
 *   zIndex     — z-index declarations with their numeric value
 *   varUsages  — all var(--name) references found in any property value
 *
 * Skips anything inside a JS interpolation (${...}) since those are inherently dynamic.
 */
function extractFromTemplate(quasi) {
  const hardcoded = [];
  const zIndex = [];
  const varUsages = [];

  for (const q of quasi.quasis) {
    const text = q.value.cooked;
    if (!text) continue;

    const quasiStartLine = q.loc?.start?.line ?? 0;
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const match = PROP_LINE_RE.exec(lines[i]);
      if (!match) continue;

      const prop = match[1];
      const value = match[2].trim();
      const line = quasiStartLine + i;

      // Collect CSS var usages from any property
      let m;
      CSS_VAR_USAGE_RE.lastIndex = 0;
      while ((m = CSS_VAR_USAGE_RE.exec(value)) !== null) {
        varUsages.push({ varName: m[1], line });
      }

      // Collect z-index values
      if (prop === 'z-index') {
        const num = parseInt(value, 10);
        if (!isNaN(num)) {
          zIndex.push({ value: num, line });
        }
        continue; // z-index is not a TOKEN_PROP, skip hardcoded check
      }

      // Hardcoded token-worthy value check
      if (!TOKEN_PROPS.has(prop)) continue;
      if (!HARDCODED_VALUE_RE.test(value)) continue;

      // Skip CSS variable usage: var(--token) or ${theme.x}
      if (value.includes('var(') || value.includes('${')) continue;

      // Skip structurally fine literals that never need a design token
      if (SAFE_VALUE_RE.test(value)) continue;

      hardcoded.push({ prop, value, line });
    }
  }

  return { hardcoded, zIndex, varUsages };
}
