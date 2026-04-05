/**
 * @jest-environment jsdom
 */
import { computeHash, restoreFromHash } from './hash.js';

// jsdom does not implement scrollIntoView
Element.prototype.scrollIntoView = () => {};

function makeContainer() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

function makeColumn(typeName, fields = []) {
  const col = document.createElement('div');
  col.className = 'column';
  col.dataset.typeName = typeName;
  fields.forEach(({ fieldName, typeName: ft }) => {
    const li = document.createElement('li');
    li.dataset.fieldName = fieldName;
    li.dataset.typeName = ft;
    col.appendChild(li);
  });
  return col;
}

describe('computeHash', () => {
  it('returns empty string when container has no columns', () => {
    const container = makeContainer();
    expect(computeHash(container)).toBe('');
  });

  it('returns hash with just the root type when nothing is selected', () => {
    const container = makeContainer();
    container.appendChild(makeColumn('k8s.io/v1.Pod'));
    expect(computeHash(container)).toBe('#k8s.io/v1.Pod');
  });

  it('includes selected field names in the hash', () => {
    const container = makeContainer();
    const col1 = makeColumn('k8s.io/v1.Pod', [{ fieldName: 'spec', typeName: 'k8s.io/v1.PodSpec' }]);
    const col2 = makeColumn('k8s.io/v1.PodSpec', [{ fieldName: 'containers', typeName: 'string' }]);
    container.appendChild(col1);
    container.appendChild(col2);

    col1.querySelector('li').classList.add('selected');
    col2.querySelector('li').classList.add('selected');

    expect(computeHash(container)).toBe('#k8s.io/v1.Pod/spec/containers');
  });
});

describe('restoreFromHash', () => {
  const typeData = {
    'example.io/v1.Foo': { typeName: 'Foo', package: 'example.io/v1', fields: [
      { fieldName: 'bar', typeName: 'example.io/v1.Bar', typeDecorators: [], docString: '' },
    ]},
    'example.io/v1.Bar': { typeName: 'Bar', package: 'example.io/v1', fields: [] },
  };

  it('returns false for empty hash', () => {
    const container = makeContainer();
    const result = restoreFromHash('', typeData, container, () => null);
    expect(result).toBe(false);
  });

  it('returns false for unknown root type', () => {
    const container = makeContainer();
    const result = restoreFromHash('unknown.Type', typeData, container, () => null);
    expect(result).toBe(false);
  });

  it('restores a single root column', () => {
    const container = makeContainer();
    const createColumnFn = (typeName) => makeColumn(typeName);

    const result = restoreFromHash('example.io/v1.Foo', typeData, container, createColumnFn);
    expect(result).toBe(true);
    expect(container.querySelectorAll('.column').length).toBe(1);
    expect(container.querySelector('.column').dataset.typeName).toBe('example.io/v1.Foo');
  });

  it('clears existing columns before restoring', () => {
    const container = makeContainer();
    container.appendChild(makeColumn('stale.Type'));
    container.appendChild(makeColumn('stale.Type2'));

    const createColumnFn = (typeName) => makeColumn(typeName);
    restoreFromHash('example.io/v1.Foo', typeData, container, createColumnFn);

    expect(container.querySelectorAll('.column').length).toBe(1);
    expect(container.querySelector('.column').dataset.typeName).toBe('example.io/v1.Foo');
  });

  it('restores selected field and child column', () => {
    const container = makeContainer();
    const createColumnFn = (typeName) => {
      if (typeName === 'example.io/v1.Foo') {
        return makeColumn(typeName, [{ fieldName: 'bar', typeName: 'example.io/v1.Bar' }]);
      }
      return makeColumn(typeName);
    };

    const result = restoreFromHash('example.io/v1.Foo/bar', typeData, container, createColumnFn);
    expect(result).toBe(true);

    const columns = container.querySelectorAll('.column');
    expect(columns.length).toBe(2);
    expect(columns[1].dataset.typeName).toBe('example.io/v1.Bar');

    const selected = container.querySelector('li.selected');
    expect(selected).not.toBeNull();
    expect(selected.dataset.fieldName).toBe('bar');
  });

  it('stops at unknown field name', () => {
    const container = makeContainer();
    const createColumnFn = (typeName) => makeColumn(typeName); // no fields in column

    const result = restoreFromHash('example.io/v1.Foo/nonexistent', typeData, container, createColumnFn);
    expect(result).toBe(true); // root was found
    expect(container.querySelectorAll('.column').length).toBe(1);
  });
});
