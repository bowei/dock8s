/**
 * @jest-environment jsdom
 */
import { populateSearchDialogList, buildReachableTypes, populateFieldSearchList } from './search.js';

const typeData = {
  'example.io/v1.Pod': { typeName: 'Pod', package: 'example.io/v1', isRoot: true },
  'example.io/v1.PodSpec': { typeName: 'PodSpec', package: 'example.io/v1', isRoot: false },
  'example.io/v1.Node': { typeName: 'Node', package: 'example.io/v1', isRoot: true },
  'example.io/v1.Namespace': { typeName: 'Namespace', package: 'example.io/v1', isRoot: true },
  'other.io/v1.Pod': { typeName: 'Pod', package: 'other.io/v1', isRoot: true },
};

// typeData for field search tests: a graph with one reachable branch and one orphan.
const fieldTypeData = {
  'example.io/v1.Pod': {
    typeName: 'Pod', package: 'example.io/v1', isRoot: true,
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
  it('only includes root types', () => {
    const list = makeList();
    populateSearchDialogList('', typeData, list);
    const items = list.querySelectorAll('li');
    // PodSpec is not root, so 4 items
    expect(items.length).toBe(4);
    const typeNames = Array.from(items).map(li => li.dataset.typeName);
    expect(typeNames).not.toContain('example.io/v1.PodSpec');
  });

  it('filters by substring (case-insensitive)', () => {
    const list = makeList();
    populateSearchDialogList('pod', typeData, list);
    const items = list.querySelectorAll('li');
    expect(items.length).toBe(2);
    const typeNames = Array.from(items).map(li => li.dataset.typeName);
    expect(typeNames).toContain('example.io/v1.Pod');
    expect(typeNames).toContain('other.io/v1.Pod');
  });

  it('filters case-insensitively', () => {
    const list = makeList();
    populateSearchDialogList('POD', typeData, list);
    expect(list.querySelectorAll('li').length).toBe(2);
  });

  it('returns empty list when no match', () => {
    const list = makeList();
    populateSearchDialogList('zzz', typeData, list);
    expect(list.querySelectorAll('li').length).toBe(0);
  });

  it('sorts by short type name', () => {
    const list = makeList();
    populateSearchDialogList('', typeData, list);
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
    populateSearchDialogList('', typeData, list);
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
    populateSearchDialogList('pod', typeData, list);
    expect(list.querySelectorAll('li').length).toBe(2);
    populateSearchDialogList('node', typeData, list);
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
    const fieldNames = items.map(li => li.dataset.fieldName);
    expect(fieldNames).toContain('name');
    expect(fieldNames).toContain('nodeName');
  });

  it('excludes fields on unreachable types', () => {
    const list = makeList();
    // 'spec' exists on both Pod (reachable) and Orphan (unreachable)
    populateFieldSearchList('spec', fieldTypeData, list);
    const items = Array.from(list.querySelectorAll('li:not(.search-results-truncated)'));
    const parents = items.map(li => li.dataset.parentTypeName);
    expect(parents).toContain('example.io/v1.Pod');
    expect(parents).not.toContain('example.io/v1.Orphan');
  });

  it('sets dataset.searchMode, dataset.parentTypeName, dataset.fieldName', () => {
    const list = makeList();
    populateFieldSearchList('phase', fieldTypeData, list);
    const item = list.querySelector('li:not(.search-results-truncated)');
    expect(item.dataset.searchMode).toBe('field');
    expect(item.dataset.parentTypeName).toBe('example.io/v1.PodStatus');
    expect(item.dataset.fieldName).toBe('phase');
  });

  it('sorts by field name then parent type name', () => {
    const list = makeList();
    populateFieldSearchList('e', fieldTypeData, list);
    const items = Array.from(list.querySelectorAll('li:not(.search-results-truncated)'));
    const fieldNames = items.map(li => li.dataset.fieldName);
    // Should be sorted: containers, image, name, nodeName, phase, spec, status
    for (let i = 1; i < fieldNames.length; i++) {
      const cmp = fieldNames[i - 1].localeCompare(fieldNames[i]);
      expect(cmp).toBeLessThanOrEqual(0);
    }
  });

  it('marks the first result as selected', () => {
    const list = makeList();
    populateFieldSearchList('name', fieldTypeData, list);
    const first = list.querySelector('li:not(.search-results-truncated)');
    expect(first.classList.contains('selected')).toBe(true);
  });

  it('shows truncation indicator when results exceed limit', () => {
    // Build typeData with 51 fields all matching 'field'
    const bigData = {
      'example.io/v1.Root': {
        typeName: 'Root', package: 'example.io/v1', isRoot: true,
        fields: Array.from({ length: 51 }, (_, i) => ({ fieldName: `field${i}`, typeName: 'string' })),
      },
    };
    const list = makeList();
    populateFieldSearchList('field', bigData, list);
    const realItems = list.querySelectorAll('li:not(.search-results-truncated)');
    const truncItems = list.querySelectorAll('li.search-results-truncated');
    expect(realItems.length).toBe(50);
    expect(truncItems.length).toBe(1);
    expect(truncItems[0].textContent).toMatch(/50 of 51/);
  });

  it('does not show truncation indicator when results are within limit', () => {
    const list = makeList();
    populateFieldSearchList('phase', fieldTypeData, list);
    expect(list.querySelectorAll('li.search-results-truncated').length).toBe(0);
  });

  it('clears previous results on each call', () => {
    const list = makeList();
    populateFieldSearchList('name', fieldTypeData, list);
    const first = list.querySelectorAll('li:not(.search-results-truncated)').length;
    expect(first).toBeGreaterThan(0);
    populateFieldSearchList('phase', fieldTypeData, list);
    expect(list.querySelectorAll('li:not(.search-results-truncated)').length).toBe(1);
  });
});
