import { createDocString } from './godoc.js';
import { splitTypeName, formatDecorators } from './utils.js';

// createColumn builds a column DOM element for the given type.
//
// @param {string} typeName - fully qualified type name
// @param {object} typeData - map of typeName -> TypeInfo
// @param {function} onFieldClick - called with the li element when a field is clicked
export function createColumn(typeName, typeData, onFieldClick) {
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
