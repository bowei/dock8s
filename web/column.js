import { createDocString } from './godoc.js';
import { splitTypeName, formatDecorators } from './utils.js';

// createColumn builds a column DOM element for the given type.
//
// @param {string} typeName - fully qualified type name
// @param {object} typeData - map of typeName -> TypeInfo
// @param {function} onFieldClick - called with the li element when a field is clicked
// @param {Set<string>} expandedDocStrings - set of "parentType.fieldName" keys that are expanded
export function createColumn(typeName, typeData, onFieldClick, expandedDocStrings) {
  const typeInfo = typeData[typeName];
  if (!typeInfo) return null;

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
      line1.className = 'field-row';

      const fieldName = document.createElement('span');
      fieldName.innerHTML = field.fieldName;
      fieldName.className = 'field-name';

      const fieldType = document.createElement('span');
      fieldType.innerHTML = decorators + type;
      fieldType.className = 'field-type';

      line1.appendChild(fieldName);
      line1.appendChild(fieldType);

      if (field.sourceURL) {
        const a = document.createElement('a');
        a.href = field.sourceURL;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.className = 'source-link';
        a.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';
        line1.appendChild(a);
      }

      const line2 = document.createElement('div');
      line2.className = 'type-name';
      line2.innerHTML = pkg;

      const contentWrapper = document.createElement('div');
      contentWrapper.appendChild(line1);
      contentWrapper.appendChild(line2);
      if (field.docString) {
        const expandKey = typeName + '.' + field.fieldName;
        const docStringEl = createDocString(field.parsedDocString);
        docStringEl.dataset.expandKey = expandKey;
        if (expandedDocStrings && expandedDocStrings.has(expandKey)) {
          const summary = docStringEl.children[0];
          const details = docStringEl.children[1];
          if (summary && details) {
            summary.hidden = true;
            details.hidden = false;
          }
        }
        contentWrapper.appendChild(docStringEl);
      }

      li.appendChild(contentWrapper);

      if (typeData[field.typeName]) {
        const chevron = document.createElement('span');
        chevron.className = 'chevron';
        li.appendChild(chevron);
      }

      li.addEventListener('click', (event) => {
        onFieldClick(event.currentTarget);
      });
      ul.appendChild(li);
    });
  }

  if (typeInfo.enumValues) {
    typeInfo.enumValues.forEach(enumVal => {
      const li = document.createElement('li');
      li.style.cursor = 'default';

      const line1 = document.createElement('div');
      line1.className = 'field-row';

      const enumName = document.createElement('span');
      enumName.innerHTML = enumVal.name;
      enumName.className = 'field-name';

      line1.appendChild(enumName);

      if (enumVal.value) {
        const enumValue = document.createElement('span');
        enumValue.textContent = enumVal.value;
        enumValue.className = 'enum-value';
        line1.appendChild(enumValue);
      }

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
