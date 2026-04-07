export function splitTypeName(fullTypeName) {
  const lastDot = fullTypeName.lastIndexOf('.');
  if (lastDot === -1) {
    return { pkg: '', type: fullTypeName };
  }
  const pkg = fullTypeName.substring(0, lastDot);
  const type = fullTypeName.substring(lastDot + 1);
  return { pkg, type };
}

export function formatDecorators(decorators) {
  if (!decorators || decorators.length === 0) {
    return '';
  }
  let prefix = '';
  decorators.forEach(dec => {
    if (dec === 'Ptr') {
      prefix += '*';
    } else if (dec === 'List') {
      prefix += '[]';
    } else if (dec.startsWith('Map[')) {
      const keyType = dec.substring(4, dec.length - 1);
      prefix += 'map[' + keyType + ']';
    }
  });
  return prefix;
}

// hashToParts returns [rootTypeName, [field1, field2, ...]].
export function hashToParts(hash) {
  if (!hash) {
    return [null, []];
  }

  const path = decodeURIComponent(hash);
  if (!path) {
    console.log(`ERROR: decodeURIComponent ${hash}`);
    return [null, []];
  }
  const parts = path.split('/');

  let lastDotIndex = -1;
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].includes('.')) {
      lastDotIndex = i;
    }
  }

  if (lastDotIndex === -1) {
    const rootTypeName = parts[0];
    const fieldParts = parts.slice(1);
    return [rootTypeName, fieldParts];
  }

  const rootTypeName = parts.slice(0, lastDotIndex + 1).join('/');
  const fieldParts = parts.slice(lastDotIndex + 1);

  return [rootTypeName, fieldParts];
}
