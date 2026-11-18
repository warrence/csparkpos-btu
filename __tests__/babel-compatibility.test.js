const babel = require('@babel/core');

test('Symbol fallback transformation still visits later Flow-typed classes', () => {
  const source = `
    export class First { [Symbol.iterator]() { return this; } }
    export class Second { value: string; read(value: string): string { return value; } }
  `;
  const output = babel.transformSync(source, {filename: 'compatibility-fixture.js'}).code;
  expect(() => require('@babel/parser').parse(output, {sourceType: 'unambiguous'})).not.toThrow();
  expect(output).not.toContain('value:string');
});

test('Flow-only props declarations do not overwrite React component props', () => {
  const source = `
    import React from 'react';
    export class Example extends React.Component {
      props: {label: string};
      render() { return this.props.label; }
    }
  `;
  const output = babel.transformSync(source, {filename: 'compatibility-props.js'}).code;
  const scope = {exports: {}, require};
  require('vm').runInNewContext(output, scope);
  expect(new scope.exports.Example({label: 'saved'}).render()).toBe('saved');
});
