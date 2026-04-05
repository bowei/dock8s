/**
 * @jest-environment jsdom
 */
import { createColumn } from './column.js';

const baseTypeData = {
  'example.io/v1.Foo': {
    typeName: 'Foo',
    package: 'example.io/v1',
    fields: [
      {
        fieldName: 'Name',
        typeName: 'string',
        typeDecorators: [],
        docString: '',
        parsedDocString: null,
      },
      {
        fieldName: 'Bar',
        typeName: 'example.io/v1.Bar',
        typeDecorators: [],
        docString: 'A bar field.',
        parsedDocString: {
          elements: [{ type: 'p', content: ['A bar field.'] }],
        },
      },
      {
        fieldName: 'Items',
        typeName: 'string',
        typeDecorators: ['List'],
        docString: '',
        parsedDocString: null,
      },
      {
        fieldName: 'Ptr',
        typeName: 'string',
        typeDecorators: ['Ptr'],
        docString: '',
        parsedDocString: null,
      },
    ],
  },
  'example.io/v1.Bar': {
    typeName: 'Bar',
    package: 'example.io/v1',
    fields: [],
  },
  'example.io/v1.Enum': {
    typeName: 'Enum',
    package: 'example.io/v1',
    enumValues: [
      { name: 'ValueA', docString: '', parsedDocString: null },
      {
        name: 'ValueB',
        docString: 'ValueB doc.',
        parsedDocString: {
          elements: [{ type: 'p', content: ['ValueB doc.'] }],
        },
      },
    ],
  },
};

describe('createColumn', () => {
  it('returns null for unknown type', () => {
    expect(createColumn('unknown.Type', baseTypeData, () => {})).toBeNull();
  });

  it('creates a column element with correct class and dataset', () => {
    const col = createColumn('example.io/v1.Foo', baseTypeData, () => {});
    expect(col).not.toBeNull();
    expect(col.className).toBe('column');
    expect(col.dataset.typeName).toBe('example.io/v1.Foo');
  });

  it('renders the type name and package in the header', () => {
    const col = createColumn('example.io/v1.Foo', baseTypeData, () => {});
    expect(col.querySelector('.header-row').innerHTML).toBe('Foo');
    expect(col.querySelector('.column-header .type-name').innerHTML).toBe('example.io/v1');
  });

  it('renders one li per field', () => {
    const col = createColumn('example.io/v1.Foo', baseTypeData, () => {});
    const items = col.querySelectorAll('li');
    expect(items.length).toBe(4);
  });

  it('sets fieldName and typeName data attributes on li', () => {
    const col = createColumn('example.io/v1.Foo', baseTypeData, () => {});
    const items = col.querySelectorAll('li');
    expect(items[0].dataset.fieldName).toBe('Name');
    expect(items[0].dataset.typeName).toBe('string');
    expect(items[1].dataset.fieldName).toBe('Bar');
    expect(items[1].dataset.typeName).toBe('example.io/v1.Bar');
  });

  it('renders field name and type in spans', () => {
    const col = createColumn('example.io/v1.Foo', baseTypeData, () => {});
    const firstItem = col.querySelectorAll('li')[0];
    expect(firstItem.querySelector('.field-name').innerHTML).toBe('Name');
    expect(firstItem.querySelector('.field-type').innerHTML).toBe('string');
  });

  it('applies List decorator to field type display', () => {
    const col = createColumn('example.io/v1.Foo', baseTypeData, () => {});
    const itemsEl = col.querySelectorAll('li')[2]; // Items field
    expect(itemsEl.querySelector('.field-type').innerHTML).toBe('[]string');
  });

  it('applies Ptr decorator to field type display', () => {
    const col = createColumn('example.io/v1.Foo', baseTypeData, () => {});
    const ptrEl = col.querySelectorAll('li')[3]; // Ptr field
    expect(ptrEl.querySelector('.field-type').innerHTML).toBe('*string');
  });

  it('adds chevron when field type exists in typeData', () => {
    const col = createColumn('example.io/v1.Foo', baseTypeData, () => {});
    const items = col.querySelectorAll('li');
    expect(items[0].querySelector('.chevron')).toBeNull(); // 'string' not in typeData
    expect(items[1].querySelector('.chevron')).not.toBeNull(); // Bar is in typeData
  });

  it('renders docstring for fields that have one', () => {
    const col = createColumn('example.io/v1.Foo', baseTypeData, () => {});
    const items = col.querySelectorAll('li');
    expect(items[0].querySelector('.doc-string')).toBeNull();
    expect(items[1].querySelector('.doc-string')).not.toBeNull();
  });

  it('calls onFieldClick with the li element when clicked', () => {
    const clicked = [];
    const col = createColumn('example.io/v1.Foo', baseTypeData, li => clicked.push(li));
    const items = col.querySelectorAll('li');
    items[1].click();
    expect(clicked.length).toBe(1);
    expect(clicked[0].dataset.fieldName).toBe('Bar');
  });

  it('renders enum values', () => {
    const col = createColumn('example.io/v1.Enum', baseTypeData, () => {});
    const items = col.querySelectorAll('li');
    expect(items.length).toBe(2);
    expect(items[0].querySelector('.field-name').innerHTML).toBe('ValueA');
    expect(items[1].querySelector('.field-name').innerHTML).toBe('ValueB');
  });

  it('renders docstring for enum values that have one', () => {
    const col = createColumn('example.io/v1.Enum', baseTypeData, () => {});
    const items = col.querySelectorAll('li');
    expect(items[0].querySelector('.doc-string')).toBeNull();
    expect(items[1].querySelector('.doc-string')).not.toBeNull();
  });
});
