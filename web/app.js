import { createColumn } from './column.js';
import { computeHash, restoreFromHash } from './hash.js';
import { populateSearchDialogList, populateFieldSearchList } from './search.js';

let isProgrammaticallyUpdatingHash = false;
const mainContainer = document.getElementById('main-container');
const searchDialogOverlay = document.getElementById('search-dialog-overlay');
const searchDialogDialog = document.getElementById('search-dialog-dialog');
const searchDialogInput = document.getElementById('search-dialog-input');
const searchDialogList = document.getElementById('search-dialog-list');
const helpDialogOverlay = document.getElementById('help-dialog-overlay');
const helpDialogDialog = document.getElementById('help-dialog-dialog');
const helpText = document.getElementById('help-text');

function makeColumn(typeName) {
  return createColumn(typeName, typeData, handleFieldClick);
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
    const newColumn = makeColumn(typeName);
    if (newColumn) {
      mainContainer.appendChild(newColumn);
      newColumn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
    }
  }
  updateHash();
}

function updateHash() {
  const newHash = computeHash(mainContainer);
  if (window.location.hash !== newHash) {
    isProgrammaticallyUpdatingHash = true;
    window.location.hash = newHash;
    setTimeout(() => { isProgrammaticallyUpdatingHash = false; }, 0);
  }
}

function showSearchDialog() {
  console.log('Showing search dialog');
  populateSearchDialogList('', typeData, searchDialogList);
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

function selectItem(li) {
  if (li.classList.contains('search-results-truncated')) return;
  hideSearchDialog();
  if (li.dataset.searchMode === 'field') {
    console.log(`Field selected: ${li.dataset.parentTypeName}.${li.dataset.fieldName}`);
    window.location.hash = '#' + li.dataset.parentTypeName + '/' + li.dataset.fieldName;
  } else {
    console.log(`Type selected: ${li.dataset.typeName}`);
    window.location.hash = '#' + li.dataset.typeName;
  }
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
    restoreFromHash(window.location.hash.substring(1), typeData, mainContainer, makeColumn);
  });

  if (restoreFromHash(window.location.hash.substring(1), typeData, mainContainer, makeColumn)) {
    return;
  }

  if (startTypes) {
    const initialColumn = makeColumn(startTypes);
    if (initialColumn) {
      mainContainer.appendChild(initialColumn);
    }
  } else {
    const firstTypeName = Object.keys(typeData)[0];
    if (firstTypeName) {
      const initialColumn = makeColumn(firstTypeName);
      if (initialColumn) {
        mainContainer.appendChild(initialColumn);
      }
    }
  }
}

window.addEventListener('DOMContentLoaded', init);

function handleKeyDown(event) {
  if (event.key === '/' && event.target.tagName !== 'INPUT') {
    console.log("'/' key pressed");
    event.preventDefault();
    showSearchDialog();
    return;
  }
  if (event.key === '?' && event.target.tagName !== 'INPUT') {
    console.log("'?' key pressed");
    event.preventDefault();
    showHelpDialog();
    return;
  }
  if (event.key === 'Escape') {
    if (searchDialogOverlay.style.display === 'flex') {
      console.log("'esc' key pressed");
      hideSearchDialog();
    }
    if (helpDialogOverlay.style.display === 'flex') {
      console.log("'esc' key pressed");
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
  const value = searchDialogInput.value;
  if (value.startsWith('f:')) {
    populateFieldSearchList(value.slice(2), typeData, searchDialogList);
  } else {
    populateSearchDialogList(value, typeData, searchDialogList);
  }
});

searchDialogInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    const selected = searchDialogList.querySelector('li.selected');
    if (selected) {
      selectItem(selected);
    }
  } else if (event.key === 'ArrowDown') {
    event.preventDefault();
    const selected = searchDialogList.querySelector('li.selected');
    if (selected) {
      let next = selected.nextElementSibling;
      if (next && next.classList.contains('search-results-truncated')) next = null;
      if (next) {
        selected.classList.remove('selected');
        next.classList.add('selected');
        next.scrollIntoView({ block: 'nearest' });
      }
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
    selectItem(li);
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
