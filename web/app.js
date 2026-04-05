import { createDocString } from "./godoc.js";

let isProgrammaticallyUpdatingHash = false;
const mainContainer = document.getElementById('main-container');
const searchDialogOverlay = document.getElementById('search-dialog-overlay');
const searchDialogDialog = document.getElementById('search-dialog-dialog');
const searchDialogInput = document.getElementById('search-dialog-input');
const searchDialogList = document.getElementById('search-dialog-list');
const helpDialogOverlay = document.getElementById('help-dialog-overlay');
const helpDialogDialog = document.getElementById('help-dialog-dialog');
const helpText = document.getElementById('help-text');

function splitTypeName(fullTypeName) {
  const lastDot = fullTypeName.lastIndexOf('.');
  if (lastDot === -1) {
    return { pkg: '', type: fullTypeName };
  }
  const pkg = fullTypeName.substring(0, lastDot);
  const type = fullTypeName.substring(lastDot + 1);
  return { pkg, type };
}

function formatDecorators(decorators) {
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

function createColumn(typeName) {
  console.log(`Creating column for type: ${typeName}`);
  const typeInfo = typeData[typeName];
  if (!typeInfo) return;

  const column = document.createElement('div');
  column.className = 'column';
  column.dataset.typeName = typeName;

  const header = document.createElement('div');
  header.className = 'column-header';

  const headerType = document.createElement('div');
  headerType.innerHTML = typeInfo.typeName;
  headerType.className = 'header-row';

  const headerPkg = document.createElement('div');
  headerPkg.innerHTML = typeInfo.package;
  headerPkg.className = 'type-name';

  header.appendChild(headerType);
  header.appendChild(headerPkg);

  column.appendChild(header);

  const ul = document.createElement('ul');

  if (typeInfo.fields) {
    typeInfo.fields.forEach(field => {
      const li = document.createElement('li');
      li.dataset.fieldName = field.fieldName;
      li.dataset.typeName = field.typeName;
      li.dataset.parentType = typeName;

      const { pkg, type } = splitTypeName(field.typeName);
      const decorators = formatDecorators(field.typeDecorators);

      const line1 = document.createElement('div');
      line1.className = "field-row";

      const fieldName = document.createElement('span');
      fieldName.innerHTML = field.fieldName;
      fieldName.className = 'field-name';

      const fieldType = document.createElement('span');
      fieldType.innerHTML = decorators + type;
      fieldType.className = 'field-type';

      line1.appendChild(fieldName);
      line1.appendChild(fieldType);

      const line2 = document.createElement('div');
      line2.className = 'type-name';
      line2.innerHTML = pkg;

      const contentWrapper = document.createElement('div');
      contentWrapper.appendChild(line1);
      contentWrapper.appendChild(line2);
      if (field.docString) {
        contentWrapper.appendChild(createDocString(field.parsedDocString));
      }

      li.appendChild(contentWrapper);

      if (typeData[field.typeName]) {
        const chevron = document.createElement('span');
        chevron.className = 'chevron';
        li.appendChild(chevron);
      }

      li.addEventListener('click', (event) => {
        handleFieldClick(event.currentTarget);
      });
      ul.appendChild(li);
    });
  }

  if (typeInfo.enumValues) {
    typeInfo.enumValues.forEach(enumVal => {
      const li = document.createElement('li');
      li.style.cursor = 'default';

      const line1 = document.createElement('div');
      line1.className = "field-row";

      const enumName = document.createElement('span');
      enumName.innerHTML = enumVal.name;
      enumName.className = 'field-name';

      line1.appendChild(enumName);

      const contentWrapper = document.createElement('div');
      contentWrapper.appendChild(line1);
      if (enumVal.docString) {
        contentWrapper.appendChild(createDocString(enumVal.parsedDocString));
      }

      li.appendChild(contentWrapper);
      ul.appendChild(li);
    });
  }

  column.appendChild(ul);
  return column;
}

function handleFieldClick(listItem) {
  const { typeName, parentType } = listItem.dataset;
  console.log(`Field clicked: ${parentType}.${listItem.dataset.fieldName} -> ${typeName}`);

  let currentColumn = listItem.closest('.column');

  while (currentColumn && currentColumn.nextSibling) {
    currentColumn.nextSibling.remove();
  }

  const parentList = listItem.parentElement;
  parentList.querySelectorAll('li.selected').forEach(item => {
    item.classList.remove('selected');
  });

  listItem.classList.add('selected');

  if (typeData[typeName]) {
    const newColumn = createColumn(typeName);
    if (newColumn) {
      mainContainer.appendChild(newColumn);
      newColumn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
    }
  }
  updateHash();
}

function populateSearchDialogList(filter = '') {
  searchDialogList.innerHTML = '';

  const typeArray = Object.entries(typeData);
  const typeNames = typeArray.map(x => { return x[0] });

  const filteredTypes = typeNames.filter(name => {
    const typeInfo = typeData[name];
    if (!typeInfo.isRoot) {
      return false;
    }
    return name.toLowerCase().includes(filter.toLowerCase());
  });

  // Sort on the short name.
  filteredTypes.sort((a, b) => {
    const as = a.split(".");
    const bs = b.split(".");
    const shortA = as[as.length - 1];
    const shortB = bs[bs.length - 1];
    const ret = shortA.localeCompare(shortB);

    if (ret != 0) { return ret; }
    return a.localeCompare(b);
  });

  filteredTypes.forEach(typeName => {
    const typeInfo = typeData[typeName];

    const li = document.createElement('li');

    const tn = document.createElement('div');
    tn.innerHTML = typeInfo.typeName;
    tn.className = 'search-dialog-type-name';

    const pkg = document.createElement('div');
    pkg.innerHTML = typeInfo.package;
    pkg.className = 'search-dialog-type-pkg';

    li.appendChild(tn);
    li.appendChild(pkg);
    li.dataset.typeName = typeName;

    searchDialogList.appendChild(li);
  });

  if (searchDialogList.firstChild) {
    searchDialogList.firstChild.classList.add('selected');
  }
}

function showSearchDialog() {
  console.log('Showing search dialog');
  populateSearchDialogList();
  searchDialogOverlay.style.display = 'flex';
  searchDialogInput.focus();
}

function hideSearchDialog() {
  console.log('Hiding search dialog');
  searchDialogInput.value = '';
  searchDialogOverlay.style.display = 'none';
}

function showHelpDialog() {
  console.log('Showing help dialog');
  helpDialogOverlay.style.display = 'flex';
}

function hideHelpDialog() {
  console.log('Hiding help dialog');
  helpDialogOverlay.style.display = 'none';
}

// ----

function updateHash() {
  const columns = mainContainer.querySelectorAll('.column');
  if (columns.length === 0) {
    isProgrammaticallyUpdatingHash = true;
    window.location.hash = '';
    setTimeout(() => { isProgrammaticallyUpdatingHash = false; }, 0);
    return;
  }

  const rootType = columns[0].dataset.typeName;
  const path = [rootType];

  const selectedFields = mainContainer.querySelectorAll('li.selected');
  selectedFields.forEach(item => {
    path.push(item.dataset.fieldName);
  });

  const newHash = '#' + path.join('/');
  console.log(`Updating hash to: ${newHash}`);
  if (window.location.hash !== newHash) {
    isProgrammaticallyUpdatingHash = true;
    window.location.hash = newHash;
    setTimeout(() => { isProgrammaticallyUpdatingHash = false; }, 0);
  }
}

// hashToParts returns [rootTypeName, [field1, field2, ...].
function hashToParts(hash) {
  if (!hash) {
    return [null, []];
  }

  const path = decodeURIComponent(hash);
  if (!path) {
    console.log(`ERROR: decodeURIComponent ${hash}`);
    return [null, []];
  }
  const parts = path.split('/');
  console.log(`parts = ${parts}`);

  let lastDotIndex = -1;
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].includes('.')) {
      lastDotIndex = i;
    }
  }

  if (lastDotIndex === -1) {
    // This can happen if the type name has no package, e.g., a built-in,
    // or if the hash is just a single type name without a package.
    // In this case, assume the first part is the type name.
    const rootTypeName = parts[0];
    const fieldParts = parts.slice(1);
    return [rootTypeName, fieldParts];
  }

  const rootTypeName = parts.slice(0, lastDotIndex + 1).join('/');
  const fieldParts = parts.slice(lastDotIndex + 1);

  return [rootTypeName, fieldParts];
}

function restoreFromHash() {
  const hash = window.location.hash.substring(1);
  console.log(`Restoring from hash: ${hash}`);
  if (!hash) {
    return false;
  }

  const [rootTypeName, parts] = hashToParts(hash)
  console.log(`hashToParts = ${rootTypeName}, ${parts}`);

  if (!typeData[rootTypeName]) {
    console.log(`ERROR: ${rootTypeName} not found`);
    return false;
  }

  mainContainer.innerHTML = '';
  let currentTypeName = rootTypeName;
  let currentColumn = createColumn(currentTypeName);
  if (!currentColumn) {
    console.log(`ERROR: could not create column for ${rootTypeName}`);
    return false;
  }

  mainContainer.appendChild(currentColumn);

  for (const fieldName of parts) {
    const fieldItem = Array.from(currentColumn.querySelectorAll('li')).find(li => li.dataset.fieldName === fieldName);

    if (fieldItem) {
      fieldItem.classList.add('selected');
      const nextTypeName = fieldItem.dataset.typeName;
      if (typeData[nextTypeName]) {
        currentTypeName = nextTypeName;
        currentColumn = createColumn(currentTypeName);
        if (currentColumn) {
          mainContainer.appendChild(currentColumn);
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

  const lastColumn = mainContainer.querySelector('.column:last-child');
  if (lastColumn) {
    lastColumn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
  }

  return true;
}

function selectType(typeName) {
  console.log(`Type selected: ${typeName}`);
  hideSearchDialog();
  window.location.hash = '#' + typeName;
}

function init() {
  console.log('App initializing...');

  // Theme picker functionality
  const themeSelect = document.getElementById('theme-select');
  const currentTheme = document.querySelector('link[rel="stylesheet"]').getAttribute('href');
  themeSelect.value = currentTheme;

  themeSelect.addEventListener('change', function () {
    const newTheme = this.value;
    document.querySelector('link[rel="stylesheet"]').setAttribute('href', newTheme);
    localStorage.setItem('selectedTheme', newTheme);
  });

  // Load saved theme preference
  const savedTheme = localStorage.getItem('selectedTheme');
  if (savedTheme) {
    document.querySelector('link[rel="stylesheet"]').setAttribute('href', savedTheme);
    themeSelect.value = savedTheme;
  }

  // Anchor hash handling.
  window.addEventListener('hashchange', () => {
    if (isProgrammaticallyUpdatingHash) {
      console.log('hashchange event: ignoring');
      return;
    }
    console.log('hashchange event');
    restoreFromHash();
  });

  if (restoreFromHash()) { return; }

  if (startTypes) {
    const initialColumn = createColumn(startTypes);
    if (initialColumn) {
      mainContainer.appendChild(initialColumn);
    }
  } else {
    const firstTypeName = Object.keys(typeData)[0];
    if (firstTypeName) {
      const initialColumn = createColumn(firstTypeName);
      if (initialColumn) {
        mainContainer.appendChild(initialColumn);
      }
    }
  }
}

window.addEventListener('DOMContentLoaded', init);

function handleKeyDown(event) {
  if (event.key === '/' && event.target.tagName !== 'INPUT') {
    console.log('‘/’ key pressed');
    event.preventDefault();
    showSearchDialog();
    return;
  }
  if (event.key === '?' && event.target.tagName !== 'INPUT') {
    console.log('‘?’ key pressed');
    event.preventDefault();
    showHelpDialog();
    return;
  }
  if (event.key === 'Escape') {
    if (searchDialogOverlay.style.display === 'flex') {
      console.log('‘esc’ key pressed');
      hideSearchDialog();
    }
    if (helpDialogOverlay.style.display === 'flex') {
      console.log('‘esc’ key pressed');
      hideHelpDialog();
    }
    return;
  }

  if (searchDialogOverlay.style.display === 'flex' || helpDialogOverlay.style.display === 'flex') {
    return;
  }

  const activeKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'];
  if (!activeKeys.includes(event.key)) {
    return;
  }

  event.preventDefault();

  let selectedItems = mainContainer.querySelectorAll('li.selected');

  if (selectedItems.length === 0) {
    if (['ArrowUp', 'ArrowDown', 'ArrowRight', 'ArrowLeft'].includes(event.key)) {
      const firstItem = mainContainer.querySelector('.column:first-child li');
      if (firstItem) {
        firstItem.classList.add('selected');
        firstItem.scrollIntoView({ block: 'nearest' });
        updateHash();
      }
    }
    return;
  }

  const activeSelection = selectedItems[selectedItems.length - 1];
  const activeColumn = activeSelection.closest('.column');

  switch (event.key) {
    case 'ArrowUp': {
      const prev = activeSelection.previousElementSibling;
      if (prev) {
        activeSelection.classList.remove('selected');
        prev.classList.add('selected');
        prev.scrollIntoView({ block: 'nearest' });
        updateHash();
      }
      break;
    }
    case 'ArrowDown': {
      const next = activeSelection.nextElementSibling;
      if (next) {
        activeSelection.classList.remove('selected');
        next.classList.add('selected');
        next.scrollIntoView({ block: 'nearest' });
        updateHash();
      }
      break;
    }
    case 'ArrowRight': {
      if (typeData[activeSelection.dataset.typeName]) {
        handleFieldClick(activeSelection);
        const newColumn = activeColumn.nextElementSibling;
        if (newColumn) {
          const firstItem = newColumn.querySelector('li');
          if (firstItem) {
            firstItem.classList.add('selected');
            firstItem.scrollIntoView({ block: 'nearest' });
            updateHash();
          }
        }
      }
      break;
    }
    case 'ArrowLeft': {
      if (activeColumn !== mainContainer.firstElementChild) {
        activeColumn.remove();
        updateHash();
        const newSelectedItems = mainContainer.querySelectorAll('li.selected');
        if (newSelectedItems.length > 0) {
            const newActiveSelection = newSelectedItems[newSelectedItems.length - 1];
            newActiveSelection.scrollIntoView({ block: 'nearest' });
        }
      }
      break;
    }
    case 'Enter': {
      const docString = activeSelection.querySelector('.doc-string');
      if (docString) {
        const summary = docString.children[0];
        const details = docString.children[1];
        if (summary && details && summary.querySelector('span')) {
          summary.hidden = !summary.hidden;
          details.hidden = !details.hidden;
        }
      }
      break;
    }
  }
}

document.addEventListener('keydown', handleKeyDown);

helpText.addEventListener('click', () => {
  showSearchDialog();
});

searchDialogInput.addEventListener('input', () => {
  populateSearchDialogList(searchDialogInput.value);
});

searchDialogInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    const selected = searchDialogList.querySelector('li.selected');
    if (selected) {
      selectType(selected.dataset.typeName);
    }
  } else if (event.key === 'ArrowDown') {
    event.preventDefault();
    const selected = searchDialogList.querySelector('li.selected');
    if (selected && selected.nextElementSibling) {
      selected.classList.remove('selected');
      selected.nextElementSibling.classList.add('selected');
      selected.nextElementSibling.scrollIntoView({ block: 'nearest' });
    }
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    const selected = searchDialogList.querySelector('li.selected');
    if (selected && selected.previousElementSibling) {
      selected.classList.remove('selected');
      selected.previousElementSibling.classList.add('selected');
      selected.previousElementSibling.scrollIntoView({ block: 'nearest' });
    }
  }
});

searchDialogList.addEventListener('click', (event) => {
  const li = event.target.closest('li');
  if (li) {
    selectType(li.dataset.typeName);
  }
});

searchDialogDialog.addEventListener('click', (event) => {
  event.stopPropagation();
});

searchDialogOverlay.addEventListener('click', () => {
  hideSearchDialog();
});

helpDialogDialog.addEventListener('click', (event) => {
  event.stopPropagation();
});

helpDialogOverlay.addEventListener('click', () => {
  hideHelpDialog();
});

export default {
  splitTypeName,
};
