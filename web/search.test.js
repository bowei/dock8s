/**
 * @jest-environment jsdom
 */
import { populateSearchDialogList } from './search.js';

const typeData = {
  'example.io/v1.Pod': { typeName: 'Pod', package: 'example.io/v1', isRoot: true },
  'example.io/v1.PodSpec': { typeName: 'PodSpec', package: 'example.io/v1', isRoot: false },
  'example.io/v1.Node': { typeName: 'Node', package: 'example.io/v1', isRoot: true },
  'example.io/v1.Namespace': { typeName: 'Namespace', package: 'example.io/v1', isRoot: true },
  'other.io/v1.Pod': { typeName: 'Pod', package: 'other.io/v1', isRoot: true },
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
