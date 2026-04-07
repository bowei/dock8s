/**
 * @jest-environment jsdom
 */
import { populateSearchDialogList, buildReachableTypes, findFieldPaths, populateFieldSearchList, FIELD_SEARCH_LIMIT } from './search.js';

const typeData = {
  'example.io/v1.Pod': { typeName: 'Pod', package: 'example.io/v1', isRoot: true, isTopLevel: true },
  'example.io/v1.PodSpec': { typeName: 'PodSpec', package: 'example.io/v1', isRoot: false, isTopLevel: true },
  'example.io/v1.Node': { typeName: 'Node', package: 'example.io/v1', isRoot: true, isTopLevel: true },
  'example.io/v1.Namespace': { typeName: 'Namespace', package: 'example.io/v1', isRoot: true, isTopLevel: true },
  'other.io/v1.Pod': { typeName: 'Pod', package: 'other.io/v1', isRoot: true, isTopLevel: false },
};

// typeData for field search tests: a graph with one reachable branch and one orphan.
const fieldTypeData = {
  'example.io/v1.Pod': {
    typeName: 'Pod', package: 'example.io/v1', isRoot: true, isTopLevel: true,
    fields: [
      { fieldName: 'spec', typeName: 'example.io/v1.PodSpec' },
      { fieldName: 'status', typeName: 'example.io/v1.PodStatus' },
    ],
  },
  'example.io/v1.PodSpec': {
    typeName: 'PodSpec', package: 'example.io/v1', isRoot: false,
    fields: [
      { fieldName: 'containers', typeName: 'example.io/v1.Container' },
      { fieldName: 'nodeName', typeName: 'string' },
    ],
  },
  'example.io/v1.PodStatus': {
    typeName: 'PodStatus', package: 'example.io/v1', isRoot: false,
    fields: [
      { fieldName: 'phase', typeName: 'string' },
    ],
  },
  'example.io/v1.Container': {
    typeName: 'Container', package: 'example.io/v1', isRoot: false,
    fields: [
      { fieldName: 'name', typeName: 'string' },
      { fieldName: 'image', typeName: 'string' },
    ],
  },
  // Not reachable from any root type.
  'example.io/v1.Orphan': {
    typeName: 'Orphan', package: 'example.io/v1', isRoot: false,
    fields: [
      { fieldName: 'spec', typeName: 'string' },
    ],
  },
};

function makeList() {
  return document.createElement('ul');
}

describe('populateSearchDialogList', () => {
  it('only includes root types (topLevelOnly=false)', () => {
    const list = makeList();
    populateSearchDialogList('', typeData, list, false);
    const items = list.querySelectorAll('li');
    // PodSpec is not root, so 4 items
    expect(items.length).toBe(4);
    const typeNames = Array.from(items).map(li => li.dataset.typeName);
    expect(typeNames).not.toContain('example.io/v1.PodSpec');
  });

  it('only includes top-level root types by default', () => {
    const list = makeList();
    populateSearchDialogList('', typeData, list);
    const items = list.querySelectorAll('li');
    // other.io/v1.Pod is root but not top-level, so 3 items
    expect(items.length).toBe(3);
    const typeNames = Array.from(items).map(li => li.dataset.typeName);
    expect(typeNames).not.toContain('other.io/v1.Pod');
    expect(typeNames).not.toContain('example.io/v1.PodSpec');
  });

  it('includes dependency root types when topLevelOnly=false', () => {
    const list = makeList();
    populateSearchDialogList('pod', typeData, list, false);
    const items = list.querySelectorAll('li');
    expect(items.length).toBe(2);
    const typeNames = Array.from(items).map(li => li.dataset.typeName);
    expect(typeNames).toContain('example.io/v1.Pod');
    expect(typeNames).toContain('other.io/v1.Pod');
  });

  it('filters by substring (case-insensitive)', () => {
    const list = makeList();
    populateSearchDialogList('pod', typeData, list);
    const items = list.querySelectorAll('li');
    // only example.io/v1.Pod is top-level
    expect(items.length).toBe(1);
    expect(items[0].dataset.typeName).toBe('example.io/v1.Pod');
  });

  it('filters case-insensitively', () => {
    const list = makeList();
    populateSearchDialogList('POD', typeData, list);
    expect(list.querySelectorAll('li').length).toBe(1);
  });

  it('returns empty list when no match', () => {
    const list = makeList();
    populateSearchDialogList('zzz', typeData, list);
    expect(list.querySelectorAll('li').length).toBe(0);
  });

  it('sorts by short type name', () => {
    const list = makeList();
    populateSearchDialogList('', typeData, list, false);
    const typeNames = Array.from(list.querySelectorAll('li')).map(li => li.dataset.typeName);
    // Short names: Namespace, Node, Pod, Pod — sorted alphabetically by short name
    expect(typeNames[0]).toBe('example.io/v1.Namespace');
    expect(typeNames[1]).toBe('example.io/v1.Node');
    // Both Pods have same short name; sorted by full name
    expect(typeNames[2]).toBe('example.io/v1.Pod');
    expect(typeNames[3]).toBe('other.io/v1.Pod');
  });

  it('marks the first item as selected', () => {
    const list = makeList();
    populateSearchDialogList('', typeData, list, false);
    expect(list.firstChild.classList.contains('selected')).toBe(true);
    const others = Array.from(list.querySelectorAll('li')).slice(1);
    others.forEach(li => expect(li.classList.contains('selected')).toBe(false));
  });

  it('renders type name and package for each item', () => {
    const list = makeList();
    populateSearchDialogList('namespace', typeData, list);
    const item = list.querySelector('li');
    expect(item.querySelector('.search-dialog-type-name').innerHTML).toBe('Namespace');
    expect(item.querySelector('.search-dialog-type-pkg').innerHTML).toBe('example.io/v1');
  });

  it('clears previous results on each call', () => {
    const list = makeList();
    populateSearchDialogList('pod', typeData, list, false);
    expect(list.querySelectorAll('li').length).toBe(2);
    populateSearchDialogList('node', typeData, list, false);
    expect(list.querySelectorAll('li').length).toBe(1);
  });
});

describe('buildReachableTypes', () => {
  it('includes root types', () => {
    const reachable = buildReachableTypes(fieldTypeData);
    expect(reachable.has('example.io/v1.Pod')).toBe(true);
  });

  it('includes types reachable via fields', () => {
    const reachable = buildReachableTypes(fieldTypeData);
    expect(reachable.has('example.io/v1.PodSpec')).toBe(true);
    expect(reachable.has('example.io/v1.PodStatus')).toBe(true);
    expect(reachable.has('example.io/v1.Container')).toBe(true);
  });

  it('excludes types not reachable from any root', () => {
    const reachable = buildReachableTypes(fieldTypeData);
    expect(reachable.has('example.io/v1.Orphan')).toBe(false);
  });

  it('handles types with no fields', () => {
    const data = {
      'example.io/v1.Root': { typeName: 'Root', package: 'example.io/v1', isRoot: true, fields: [] },
    };
    const reachable = buildReachableTypes(data);
    expect(reachable.has('example.io/v1.Root')).toBe(true);
    expect(reachable.size).toBe(1);
  });
});

describe('findFieldPaths', () => {
  it('finds direct fields on root types', () => {
    const results = findFieldPaths('spec', fieldTypeData);
    const paths = results.map(r => r.path);
    expect(paths).toContainEqual(['spec']);
  });

  it('finds fields nested under root types', () => {
    const results = findFieldPaths('phase', fieldTypeData);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].path).toEqual(['status', 'phase']);
    expect(results[0].rootTypeName).toBe('example.io/v1.Pod');
  });

  it('excludes paths originating from non-root (orphan) types', () => {
    // 'spec' appears on Pod (root) and Orphan (non-root, unreachable)
    const results = findFieldPaths('spec', fieldTypeData);
    const rootNames = results.map(r => r.rootTypeName);
    expect(rootNames).not.toContain('example.io/v1.Orphan');
  });

  it('filters case-insensitively', () => {
    const lower = findFieldPaths('phase', fieldTypeData);
    const upper = findFieldPaths('PHASE', fieldTypeData);
    expect(upper.length).toBe(lower.length);
  });

  it('returns empty array when no fields match', () => {
    const results = findFieldPaths('zzznomatch', fieldTypeData);
    expect(results).toEqual([]);
  });

  it('does not follow cycles', () => {
    const cyclicData = {
      'example.io/v1.Root': {
        typeName: 'Root', package: 'example.io/v1', isRoot: true, isTopLevel: true,
        fields: [{ fieldName: 'self', typeName: 'example.io/v1.Root' }],
      },
    };
    // Should not infinite-loop; 'self' matches once as a direct field.
    const results = findFieldPaths('self', cyclicData);
    expect(results.length).toBe(1);
    expect(results[0].path).toEqual(['self']);
  });

  it('stops collecting after FIELD_SEARCH_LIMIT results', () => {
    const bigData = {
      'example.io/v1.Root': {
        typeName: 'Root', package: 'example.io/v1', isRoot: true, isTopLevel: true,
        fields: Array.from({ length: 51 }, (_, i) => ({ fieldName: `field${i}`, typeName: 'string' })),
      },
    };
    const results = findFieldPaths('field', bigData);
    expect(results.length).toBe(50);
  });

  it('respects MAX_FIELD_SEARCH_DEPTH by not descending beyond 10 levels', () => {
    // Build a chain of 12 types: Root -> T1 -> T2 -> ... -> T11, each with a 'deep' field.
    const deepData = { 'example.io/v1.Root': { typeName: 'Root', package: 'example.io/v1', isRoot: true, isTopLevel: true, fields: [] } };
    let prev = 'example.io/v1.Root';
    for (let i = 1; i <= 11; i++) {
      const name = `example.io/v1.T${i}`;
      deepData[prev].fields.push({ fieldName: `f${i}`, typeName: name });
      deepData[name] = { typeName: `T${i}`, package: 'example.io/v1', isRoot: false, fields: [] };
      prev = name;
    }
    // Add a matching field at level 11 (deeper than MAX_FIELD_SEARCH_DEPTH=10).
    deepData[prev].fields.push({ fieldName: 'deepField', typeName: 'string' });

    const results = findFieldPaths('deepField', deepData);
    // Path would be [f1,f2,...,f11,deepField] = length 12, which exceeds depth 10.
    expect(results.length).toBe(0);
  });

  it('excludes non-top-level roots when topLevelOnly=true (default)', () => {
    const mixedData = {
      'example.io/v1.Pod': {
        typeName: 'Pod', package: 'example.io/v1', isRoot: true, isTopLevel: true,
        fields: [{ fieldName: 'spec', typeName: 'string' }],
      },
      'dep.io/v1.DepType': {
        typeName: 'DepType', package: 'dep.io/v1', isRoot: true, isTopLevel: false,
        fields: [{ fieldName: 'spec', typeName: 'string' }],
      },
    };
    const results = findFieldPaths('spec', mixedData);
    expect(results.every(r => r.rootTypeName === 'example.io/v1.Pod')).toBe(true);
  });

  it('includes non-top-level roots when topLevelOnly=false', () => {
    const mixedData = {
      'example.io/v1.Pod': {
        typeName: 'Pod', package: 'example.io/v1', isRoot: true, isTopLevel: true,
        fields: [{ fieldName: 'spec', typeName: 'string' }],
      },
      'dep.io/v1.DepType': {
        typeName: 'DepType', package: 'dep.io/v1', isRoot: true, isTopLevel: false,
        fields: [{ fieldName: 'spec', typeName: 'string' }],
      },
    };
    const results = findFieldPaths('spec', mixedData, false);
    const roots = results.map(r => r.rootTypeName);
    expect(roots).toContain('example.io/v1.Pod');
    expect(roots).toContain('dep.io/v1.DepType');
  });

  it('same root appears multiple times for different paths to matching field', () => {
    // Pod has two paths to a field named 'name': via spec/containers/name and via containers/name
    const multiPathData = {
      'example.io/v1.Pod': {
        typeName: 'Pod', package: 'example.io/v1', isRoot: true, isTopLevel: true,
        fields: [
          { fieldName: 'spec', typeName: 'example.io/v1.PodSpec' },
          { fieldName: 'containers', typeName: 'example.io/v1.Container' },
        ],
      },
      'example.io/v1.PodSpec': {
        typeName: 'PodSpec', package: 'example.io/v1', isRoot: false,
        fields: [{ fieldName: 'containers', typeName: 'example.io/v1.Container' }],
      },
      'example.io/v1.Container': {
        typeName: 'Container', package: 'example.io/v1', isRoot: false,
        fields: [{ fieldName: 'name', typeName: 'string' }],
      },
    };
    const results = findFieldPaths('name', multiPathData);
    expect(results.length).toBe(2);
    const rootNames = results.map(r => r.rootTypeName);
    expect(rootNames.every(n => n === 'example.io/v1.Pod')).toBe(true);
    const paths = results.map(r => r.path.join('/'));
    expect(paths).toContain('spec/containers/name');
    expect(paths).toContain('containers/name');
  });
});

describe('populateFieldSearchList', () => {
  it('returns empty list for empty filter', () => {
    const list = makeList();
    populateFieldSearchList('', fieldTypeData, list);
    expect(list.querySelectorAll('li').length).toBe(0);
  });

  it('finds fields by substring match (case-insensitive)', () => {
    const list = makeList();
    populateFieldSearchList('NAME', fieldTypeData, list);
    const items = Array.from(list.querySelectorAll('li:not(.search-results-truncated)'));
    const fieldNames = items.map(li => li.querySelector('.search-dialog-type-name').textContent);
    expect(fieldNames).toContain('name');
    expect(fieldNames).toContain('nodeName');
  });

  it('excludes paths from unreachable (orphan) types', () => {
    // 'spec' exists on Pod (reachable root) and Orphan (unreachable non-root)
    const list = makeList();
    populateFieldSearchList('spec', fieldTypeData, list);
    const items = Array.from(list.querySelectorAll('li:not(.search-results-truncated)'));
    const roots = items.map(li => li.dataset.rootTypeName);
    expect(roots).toContain('example.io/v1.Pod');
    expect(roots).not.toContain('example.io/v1.Orphan');
  });

  it('sets dataset.searchMode, dataset.rootTypeName, dataset.fieldPath', () => {
    const list = makeList();
    populateFieldSearchList('phase', fieldTypeData, list);
    const item = list.querySelector('li:not(.search-results-truncated)');
    expect(item.dataset.searchMode).toBe('field');
    expect(item.dataset.rootTypeName).toBe('example.io/v1.Pod');
    expect(item.dataset.fieldPath).toBe('status/phase');
  });

  it('breadcrumb shows root short name and path to containing type', () => {
    const list = makeList();
    populateFieldSearchList('phase', fieldTypeData, list);
    const item = list.querySelector('li:not(.search-results-truncated)');
    expect(item.querySelector('.search-dialog-type-pkg').textContent).toBe('Pod / status');
  });

  it('breadcrumb for direct root field shows only root short name', () => {
    const list = makeList();
    populateFieldSearchList('spec', fieldTypeData, list);
    const item = list.querySelector('li:not(.search-results-truncated)');
    expect(item.querySelector('.search-dialog-type-pkg').textContent).toBe('Pod');
  });

  it('sorts by field name then root type then path depth', () => {
    const list = makeList();
    populateFieldSearchList('e', fieldTypeData, list);
    const items = Array.from(list.querySelectorAll('li:not(.search-results-truncated)'));
    const fieldNames = items.map(li => li.querySelector('.search-dialog-type-name').textContent);
    for (let i = 1; i < fieldNames.length; i++) {
      expect(fieldNames[i - 1].localeCompare(fieldNames[i])).toBeLessThanOrEqual(0);
    }
  });

  it('marks the first result as selected', () => {
    const list = makeList();
    populateFieldSearchList('name', fieldTypeData, list);
    const first = list.querySelector('li:not(.search-results-truncated)');
    expect(first.classList.contains('selected')).toBe(true);
  });

  it('returns truncated:true and caps list at FIELD_SEARCH_LIMIT when results hit the limit', () => {
    const bigData = {
      'example.io/v1.Root': {
        typeName: 'Root', package: 'example.io/v1', isRoot: true, isTopLevel: true,
        fields: Array.from({ length: 51 }, (_, i) => ({ fieldName: `field${i}`, typeName: 'string' })),
      },
    };
    const list = makeList();
    const { truncated } = populateFieldSearchList('field', bigData, list);
    expect(truncated).toBe(true);
    expect(list.querySelectorAll('li').length).toBe(FIELD_SEARCH_LIMIT);
  });

  it('returns truncated:false when results are within limit', () => {
    const list = makeList();
    const { truncated } = populateFieldSearchList('phase', fieldTypeData, list);
    expect(truncated).toBe(false);
  });

  it('clears previous results on each call', () => {
    const list = makeList();
    populateFieldSearchList('name', fieldTypeData, list);
    expect(list.querySelectorAll('li:not(.search-results-truncated)').length).toBeGreaterThan(0);
    populateFieldSearchList('phase', fieldTypeData, list);
    expect(list.querySelectorAll('li:not(.search-results-truncated)').length).toBe(1);
  });
});
