import * as parser from '@babel/parser';
import _traverse from '@babel/traverse';
const traverse = _traverse.default ?? _traverse;
import fs from 'fs';

/**
 * Parses a JS/TS/JSX/TSX file and extracts styled-components data:
 *  - styledDefinitions: array of { name, file, line }
 *  - hardcodedStyled:   array of { componentName, prop, value, line }
 *  - renderedElements:  Set<string> of PascalCase JSX element names used in this file
 */
export function collectStyledInfo(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const styledDefinitions = [];
  const hardcodedStyled = [];
  const renderedElements = new Set();

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
    return { styledDefinitions, hardcodedStyled, renderedElements, parseError: e.message };
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

      const hardcoded = extractHardcodedFromTemplate(node.init.quasi);
      for (const h of hardcoded) {
        hardcodedStyled.push({ componentName: name, ...h });
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

  return { styledDefinitions, hardcodedStyled, renderedElements };
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

// Structural/layout properties that are never design token candidates — skip to reduce noise
const SKIP_PROPS = new Set([
  'display', 'position', 'flex', 'flex-direction', 'flex-wrap', 'flex-shrink', 'flex-grow',
  'flex-basis', 'align-items', 'align-self', 'align-content',
  'justify-content', 'justify-items', 'justify-self',
  'overflow', 'overflow-x', 'overflow-y', 'cursor', 'pointer-events', 'visibility',
  'box-sizing', 'content', 'list-style', 'list-style-type',
  'text-align', 'text-transform', 'text-decoration', 'text-overflow',
  'white-space', 'word-break', 'word-wrap', 'font-style', 'font-variant',
  'float', 'clear', 'vertical-align',
  'border-style', 'border-collapse', 'border-spacing',
  'outline', 'outline-style', 'resize', 'appearance', '-webkit-appearance',
  'user-select', '-webkit-user-select',
  'transition', 'animation', 'animation-fill-mode', 'animation-timing-function',
  'animation-direction', 'animation-iteration-count', 'animation-play-state',
  'transform-origin', 'transform-style', 'backface-visibility',
  'table-layout', 'caption-side', 'empty-cells',
  // Composite properties — mix geometry px values with colors; too noisy to flag wholesale
  'box-shadow', 'text-shadow', 'filter', 'backdrop-filter',
]);

/**
 * Scans the static quasis of a TemplateLiteral for hardcoded CSS property values.
 * Skips anything inside a JS interpolation (${...}) since those are inherently dynamic.
 */
function extractHardcodedFromTemplate(quasi) {
  const results = [];

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

      if (SKIP_PROPS.has(prop)) continue;
      if (!HARDCODED_VALUE_RE.test(value)) continue;

      // Skip CSS variable usage: var(--token) or ${theme.x}
      if (value.includes('var(') || value.includes('${')) continue;

      results.push({ prop, value, line: quasiStartLine + i });
    }
  }

  return results;
}
