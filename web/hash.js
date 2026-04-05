import { hashToParts } from './utils.js';

// computeHash returns the hash string that represents the current column state.
export function computeHash(mainContainer) {
  const columns = mainContainer.querySelectorAll('.column');
  if (columns.length === 0) {
    return '';
  }

  const rootType = columns[0].dataset.typeName;
  const path = [rootType];

  const selectedFields = mainContainer.querySelectorAll('li.selected');
  selectedFields.forEach(item => {
    path.push(item.dataset.fieldName);
  });

  return '#' + path.join('/');
}

// restoreFromHash reconstructs the column view from a hash string.
// Returns true if the hash was valid and state was restored.
//
// @param {string} hash - the hash portion of the URL (without leading #)
// @param {object} typeData - map of typeName -> TypeInfo
// @param {Element} container - the main container element
// @param {function} createColumnFn - function(typeName) => Element
export function restoreFromHash(hash, typeData, container, createColumnFn) {
  if (!hash) {
    return false;
  }

  const [rootTypeName, parts] = hashToParts(hash);

  if (!typeData[rootTypeName]) {
    console.log(`ERROR: ${rootTypeName} not found`);
    return false;
  }

  container.innerHTML = '';
  let currentColumn = createColumnFn(rootTypeName);
  if (!currentColumn) {
    console.log(`ERROR: could not create column for ${rootTypeName}`);
    return false;
  }

  container.appendChild(currentColumn);

  for (const fieldName of parts) {
    const fieldItem = Array.from(currentColumn.querySelectorAll('li')).find(
      li => li.dataset.fieldName === fieldName
    );

    if (fieldItem) {
      fieldItem.classList.add('selected');
      const nextTypeName = fieldItem.dataset.typeName;
      if (typeData[nextTypeName]) {
        currentColumn = createColumnFn(nextTypeName);
        if (currentColumn) {
          container.appendChild(currentColumn);
        } else {
          break;
        }
      } else {
        break;
      }
    } else {
      break;
    }
  }

  const lastColumn = container.querySelector('.column:last-child');
  if (lastColumn) {
    lastColumn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
  }

  return true;
}
