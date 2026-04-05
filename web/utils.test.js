import { splitTypeName, formatDecorators, hashToParts } from './utils.js';

describe('splitTypeName', () => {
  it('splits a fully qualified type name', () => {
    const { pkg, type } = splitTypeName('k8s.io/api/core/v1.Pod');
    expect(pkg).toBe('k8s.io/api/core/v1');
    expect(type).toBe('Pod');
  });

  it('handles type names without a package', () => {
    const { pkg, type } = splitTypeName('string');
    expect(pkg).toBe('');
    expect(type).toBe('string');
  });

  it('handles empty strings', () => {
    const { pkg, type } = splitTypeName('');
    expect(pkg).toBe('');
    expect(type).toBe('');
  });

  it('handles a simple pkg.Type pattern', () => {
    const { pkg, type } = splitTypeName('v1.Pod');
    expect(pkg).toBe('v1');
    expect(type).toBe('Pod');
  });
});

describe('formatDecorators', () => {
  it('returns empty string for null', () => {
    expect(formatDecorators(null)).toBe('');
  });

  it('returns empty string for empty array', () => {
    expect(formatDecorators([])).toBe('');
  });

  it('formats Ptr decorator', () => {
    expect(formatDecorators(['Ptr'])).toBe('*');
  });

  it('formats List decorator', () => {
    expect(formatDecorators(['List'])).toBe('[]');
  });

  it('formats Map decorator', () => {
    expect(formatDecorators(['Map[string]'])).toBe('map[string]');
  });

  it('formats combined decorators', () => {
    expect(formatDecorators(['Ptr', 'List'])).toBe('*[]');
  });

  it('formats map with complex key type', () => {
    expect(formatDecorators(['Map[ResourceName]'])).toBe('map[ResourceName]');
  });
});

describe('hashToParts', () => {
  it('returns nulls for empty hash', () => {
    expect(hashToParts('')).toEqual([null, []]);
    expect(hashToParts(null)).toEqual([null, []]);
    expect(hashToParts(undefined)).toEqual([null, []]);
  });

  it('parses a type-only hash', () => {
    const [root, fields] = hashToParts('k8s.io/api/core/v1.Pod');
    expect(root).toBe('k8s.io/api/core/v1.Pod');
    expect(fields).toEqual([]);
  });

  it('parses a type with one field', () => {
    const [root, fields] = hashToParts('k8s.io/api/core/v1.Pod/spec');
    expect(root).toBe('k8s.io/api/core/v1.Pod');
    expect(fields).toEqual(['spec']);
  });

  it('parses a type with multiple fields', () => {
    const [root, fields] = hashToParts('k8s.io/api/core/v1.Pod/spec/containers');
    expect(root).toBe('k8s.io/api/core/v1.Pod');
    expect(fields).toEqual(['spec', 'containers']);
  });

  it('handles a type with no package prefix', () => {
    const [root, fields] = hashToParts('Pod/spec');
    expect(root).toBe('Pod');
    expect(fields).toEqual(['spec']);
  });
});
