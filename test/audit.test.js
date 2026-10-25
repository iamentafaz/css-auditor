import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectCssInfo } from '../src/core/css-collector.js';
import { collectJsxInfo } from '../src/core/jsx-collector.js';
import { analyze, isTailwindClass } from '../src/core/analyzer.js';
import { reportSarif } from '../src/reporter.js';

function withTempDir(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'css-auditor-'));
  try { run(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('CSS Module references resolve against their imported stylesheet', () => {
  withTempDir((dir) => {
    const component = path.join(dir, 'Button.tsx');
    const stylesheet = path.join(dir, 'Button.module.css');
    fs.writeFileSync(component, "import styles from './Button.module.css';\nexport const Button = () => <button className={styles.primary} />;");
    fs.writeFileSync(stylesheet, '.primary {}\n.unused {}');

    const jsx = collectJsxInfo(component);
    const css = collectCssInfo(stylesheet);
    const violations = analyze(new Map(), new Map([[component, jsx]]), new Map(), {
      checkDeadCss: true,
      checkHardcodedInline: false,
      checkDeadStyledComponents: false,
      checkDeadCssVars: false,
      checkDuplicateValues: false,
      checkBreakpoints: false,
    }, new Map([[stylesheet, css]]));

    const found = [...violations.values()].flat();
    assert.equal(found.filter((item) => item.type === 'undefined-class').length, 0);
    assert.equal(found.filter((item) => item.type === 'dead-css').length, 1);
    assert.equal(found.find((item) => item.type === 'dead-css').cls, 'unused');
  });
});

test('Tailwind recognition supports a strict, project-configured class set', () => {
  assert.equal(isTailwindClass('bg-brand'), true);
  assert.equal(isTailwindClass('bg-brand', { mode: 'strict' }), false);
  assert.equal(isTailwindClass('bg-brand', { mode: 'strict', classes: ['bg-brand'] }), true);
  assert.equal(isTailwindClass('u-flex', { mode: 'strict', prefixes: ['u-'] }), true);
  assert.equal(isTailwindClass('flex', { enabled: false }), false);
});

test('parser failures become file diagnostics and can be assigned a rule severity', () => {
  withTempDir((dir) => {
    const component = path.join(dir, 'Broken.tsx');
    fs.writeFileSync(component, 'export const Broken = () => <div>');
    const jsx = collectJsxInfo(component);
    assert.ok(jsx.parseError);

    const violations = analyze(new Map(), new Map([[component, jsx]]), new Map(), {
      rules: { 'parse-error': 'warning' },
      checkDeadCss: false,
      checkDeadStyledComponents: false,
      checkHardcodedInline: false,
      checkDeadCssVars: false,
      checkDuplicateValues: false,
      checkBreakpoints: false,
    });
    assert.equal([...violations.values()].flat()[0].severity, 'warning');
  });
});

test('CSS parser failures are retained for reporting', () => {
  withTempDir((dir) => {
    const stylesheet = path.join(dir, 'Broken.css');
    fs.writeFileSync(stylesheet, '.broken { color: red;');
    const info = collectCssInfo(stylesheet);
    assert.ok(info.parseError);
    assert.match(info.parseError.message, /Unclosed|end of file|Expected/i);
  });
});

test('SARIF output includes rule identity and source location', () => {
  const originalLog = console.log;
  let output = '';
  console.log = (value) => { output = value; };
  try {
    reportSarif(new Map([['C:/project/File.tsx', [{
      type: 'undefined-class', severity: 'error', line: 4, column: 2, message: 'Unknown class',
    }]]]), { jsxFiles: 1 }, { cwd: 'C:/project' });
  } finally {
    console.log = originalLog;
  }
  const sarif = JSON.parse(output);
  assert.equal(sarif.version, '2.1.0');
  assert.equal(sarif.runs[0].results[0].ruleId, 'undefined-class');
  assert.equal(sarif.runs[0].results[0].locations[0].physicalLocation.region.startLine, 4);
  assert.equal(sarif.runs[0].results[0].locations[0].physicalLocation.region.startColumn, 2);
});
