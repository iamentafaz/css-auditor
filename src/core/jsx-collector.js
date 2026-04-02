import * as parser from '@babel/parser';
import _traverse from '@babel/traverse';
const traverse = _traverse.default ?? _traverse;
import fs from 'fs';

/**
 * Parses a JSX/TSX file and extracts:
 *  - classUsages: array of { classes: string[], line, isDynamic }
 *  - inlineStyles: array of { node info, line, isHardcoded, properties }
 */
export function collectJsxInfo(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const classUsages = [];
  const inlineStyles = [];

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
    return { classUsages, inlineStyles, parseError: e.message };
  }

  traverse(ast, {
    JSXAttribute(path) {
      const name = path.node.name.name;

      // ── className analysis ──────────────────────────────────────────
      if (name === 'className') {
        const val = path.node.value;
        const line = path.node.loc?.start?.line ?? 0;

        if (!val) return;

        if (val.type === 'StringLiteral') {
          // className="foo bar baz"
          const classes = val.value.split(/\s+/).filter(Boolean);
          classUsages.push({ classes, line, isDynamic: false });

        } else if (val.type === 'JSXExpressionContainer') {
          const expr = val.expression;
          const { staticClasses, cssModuleRefs, isDynamic } = extractClassesFromExpr(expr);
          classUsages.push({ classes: staticClasses, cssModuleRefs, line, isDynamic });
        }
      }

      // ── style analysis ──────────────────────────────────────────────
      if (name === 'style') {
        const val = path.node.value;
        const line = path.node.loc?.start?.line ?? 0;

        if (!val || val.type !== 'JSXExpressionContainer') return;

        const expr = val.expression;

        // style={{ ... }} - object expression directly in JSX
        if (expr.type === 'ObjectExpression') {
          analyzeStyleObject(expr, line, inlineStyles, filePath);
        }
        // style={someVar} or style={computedFn()} - not flagged (dynamic reference)
      }
    },
  });

  return { classUsages, inlineStyles };
}

/**
 * Recursively extracts static string class names from an expression.
 * Handles: template literals, ternaries, logical &&, cn()/clsx()/classnames() calls,
 * array expressions, and string concatenation.
 */
function extractClassesFromExpr(expr) {
  const staticClasses = [];
  let isDynamic = false;

  function walk(node) {
    if (!node) return;

    switch (node.type) {
      case 'StringLiteral':
        node.value.split(/\s+/).filter(Boolean).forEach((c) => staticClasses.push(c));
        break;

      case 'TemplateLiteral':
        // Extract static parts from template strings: `foo ${cond ? 'bar' : ''} baz`
        node.quasis.forEach((q) => {
          q.value.cooked?.split(/\s+/).filter(Boolean).forEach((c) => staticClasses.push(c));
        });
        // If there are expressions inside the template, it's dynamic
        if (node.expressions.length > 0) {
          isDynamic = true;
          node.expressions.forEach(walk);
        }
        break;

      case 'ConditionalExpression':
        // cond ? 'foo' : 'bar'
        isDynamic = true;
        walk(node.consequent);
        walk(node.alternate);
        break;

      case 'LogicalExpression':
        // isActive && 'foo'
        isDynamic = true;
        walk(node.right);
        break;

      case 'CallExpression': {
        // cn(...), clsx(...), classnames(...)
        const callee = node.callee.name || node.callee?.property?.name || '';
        const isCnLike = ['cn', 'clsx', 'classnames', 'cx', 'twMerge', 'twJoin'].includes(callee);
        if (isCnLike) {
          isDynamic = true; // these calls usually have conditions
          node.arguments.forEach(walk);
        } else {
          isDynamic = true; // unknown function result
        }
        break;
      }

      case 'ArrayExpression':
        isDynamic = true;
        node.elements.forEach((el) => el && walk(el));
        break;

      case 'BinaryExpression':
        // 'foo' + ' ' + 'bar'  or  'foo' + someVar
        walk(node.left);
        walk(node.right);
        if (node.left.type !== 'StringLiteral' || node.right.type !== 'StringLiteral') {
          isDynamic = true;
        }
        break;

      case 'MemberExpression':
        if (!node.computed) {
          // styles.btn  →  property name is an Identifier
          if (node.property.type === 'Identifier') {
            staticClasses.push(node.property.name);
          }
        } else if (node.property.type === 'StringLiteral') {
          // styles['btn--primary']
          staticClasses.push(node.property.value);
        } else {
          // styles[`btn--${v}`] or styles[expr]  →  dynamic
          isDynamic = true;
          walk(node.property);
        }
        break;

      default:
        isDynamic = true;
        break;
    }
  }

  walk(expr);
  return { staticClasses, isDynamic };
}

/**
 * Analyzes a style object expression and classifies each property as
 * hardcoded (violation) or dynamic (OK).
 */
function analyzeStyleObject(objExpr, line, inlineStyles, filePath) {
  const hardcodedProps = [];
  const dynamicProps = [];

  for (const prop of objExpr.properties) {
    if (prop.type === 'SpreadElement') {
      // style={{ ...baseStyles }} - skip, dynamic reference
      continue;
    }

    const key = prop.key?.name || prop.key?.value || '?';
    const val = prop.value;
    const propLine = prop.loc?.start?.line ?? line;

    if (isLiteralValue(val)) {
      hardcodedProps.push({ key, value: getLiteralDisplay(val), line: propLine });
    } else {
      dynamicProps.push({ key, line: propLine });
    }
  }

  if (hardcodedProps.length > 0 || dynamicProps.length > 0) {
    inlineStyles.push({
      file: filePath,
      line,
      hardcodedProps,
      dynamicProps,
      isHardcoded: hardcodedProps.length > 0,
      isFullyDynamic: hardcodedProps.length === 0,
    });
  }
}

/**
 * Returns true if the AST node is a plain literal value (string, number, boolean).
 * These are the "hardcoded" cases we flag.
 */
function isLiteralValue(node) {
  if (!node) return false;
  return (
    node.type === 'StringLiteral' ||
    node.type === 'NumericLiteral' ||
    node.type === 'BooleanLiteral' ||
    // Negative numbers: UnaryExpression(-) + NumericLiteral
    (node.type === 'UnaryExpression' && node.operator === '-' && node.argument?.type === 'NumericLiteral')
  );
}

function getLiteralDisplay(node) {
  if (node.type === 'StringLiteral') return `'${node.value}'`;
  if (node.type === 'NumericLiteral') return String(node.value);
  if (node.type === 'BooleanLiteral') return String(node.value);
  if (node.type === 'UnaryExpression') return `-${node.argument.value}`;
  return '?';
}
