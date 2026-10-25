const TOKEN_PROPS = new Set([
  'color', 'background', 'background-color', 'border-color', 'border-top-color',
  'border-right-color', 'border-bottom-color', 'border-left-color', 'outline-color',
  'fill', 'stroke', 'caret-color', 'accent-color', 'column-rule-color',
  'text-decoration-color', 'font-size', 'letter-spacing', 'word-spacing', 'line-height',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'padding-inline', 'padding-block', 'padding-inline-start', 'padding-inline-end',
  'padding-block-start', 'padding-block-end', 'margin', 'margin-top', 'margin-right',
  'margin-bottom', 'margin-left', 'margin-inline', 'margin-block', 'margin-inline-start',
  'margin-inline-end', 'margin-block-start', 'margin-block-end', 'gap', 'row-gap',
  'column-gap', 'border-radius', 'border-top-left-radius', 'border-top-right-radius',
  'border-bottom-left-radius', 'border-bottom-right-radius',
]);

const TOKEN_LITERAL_RE = /#[0-9a-f]{3,8}\b|\d+(?:\.\d+)?(?:px|rem|em|vh|vw|ch|ex)\b/i;
const SAFE_VALUE_RE = /^(0|auto|inherit|initial|unset|normal|none|transparent|revert|100%|50%|0%)$/i;

export function isTokenValue(prop, value) {
  const cssProp = prop.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  if (!TOKEN_PROPS.has(cssProp.toLowerCase())) return false;
  const normalized = String(value).trim();
  if (normalized.includes('var(') || normalized.includes('${')) return false;
  if (SAFE_VALUE_RE.test(normalized)) return false;
  return TOKEN_LITERAL_RE.test(normalized) || /^(white|black|red|blue|gray|grey)$/i.test(normalized);
}

export function normalizeTokenValue(value) {
  let normalized = String(value).trim().replace(/^(['"])(.*)\1$/, '$2').toLowerCase().replace(/\s+/g, ' ');
  const aliases = { white: '#ffffff', black: '#000000', red: '#ff0000', blue: '#0000ff', gray: '#808080', grey: '#808080' };
  if (aliases[normalized]) return aliases[normalized];
  const hex = normalized.match(/^#([\da-f]{3,4})$/i);
  if (hex) return `#${[...hex[1]].map((digit) => digit + digit).join('')}`;
  return normalized;
}
