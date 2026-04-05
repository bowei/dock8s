const FIELD_SEARCH_LIMIT = 50;

// populateSearchDialogList fills listEl with filtered, sorted root types.
//
// @param {string} filter - substring filter (case-insensitive)
// @param {object} typeData - map of typeName -> TypeInfo
// @param {Element} listEl - the <ul> element to populate
export function populateSearchDialogList(filter, typeData, listEl) {
  listEl.innerHTML = '';

  const typeNames = Object.keys(typeData).filter(name => {
    const typeInfo = typeData[name];
    if (!typeInfo.isRoot) {
      return false;
    }
    return name.toLowerCase().includes(filter.toLowerCase());
  });

  // Sort on the short name.
  typeNames.sort((a, b) => {
    const as = a.split('.');
    const bs = b.split('.');
    const shortA = as[as.length - 1];
    const shortB = bs[bs.length - 1];
    const ret = shortA.localeCompare(shortB);
    if (ret !== 0) { return ret; }
    return a.localeCompare(b);
  });

  typeNames.forEach(typeName => {
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

    listEl.appendChild(li);
  });

  if (listEl.firstChild) {
    listEl.firstChild.classList.add('selected');
  }
}

// buildReachableTypes returns a Set of fully-qualified type names reachable
// from any root type via field references.
export function buildReachableTypes(typeData) {
  const reachable = new Set();
  const queue = [];

  for (const typeName of Object.keys(typeData)) {
    if (typeData[typeName].isRoot) {
      queue.push(typeName);
    }
  }

  while (queue.length > 0) {
    const typeName = queue.pop();
    if (reachable.has(typeName)) continue;
    reachable.add(typeName);

    const typeInfo = typeData[typeName];
    if (typeInfo && typeInfo.fields) {
      for (const field of typeInfo.fields) {
        if (field.typeName && typeData[field.typeName] && !reachable.has(field.typeName)) {
          queue.push(field.typeName);
        }
      }
    }
  }

  return reachable;
}

// populateFieldSearchList fills listEl with fields matching filter, searching
// only types reachable from root types. Results are capped at FIELD_SEARCH_LIMIT.
//
// @param {string} filter - substring filter (case-insensitive)
// @param {object} typeData - map of typeName -> TypeInfo
// @param {Element} listEl - the <ul> element to populate
export function populateFieldSearchList(filter, typeData, listEl) {
  listEl.innerHTML = '';

  if (!filter) {
    return;
  }

  const reachable = buildReachableTypes(typeData);
  const lowerFilter = filter.toLowerCase();
  const matches = [];

  for (const typeName of reachable) {
    const typeInfo = typeData[typeName];
    if (!typeInfo || !typeInfo.fields) continue;
    for (const field of typeInfo.fields) {
      if (field.fieldName.toLowerCase().includes(lowerFilter)) {
        matches.push({ typeName, typeInfo, field });
      }
    }
  }

  // Sort by field name, then parent type name as tiebreaker.
  matches.sort((a, b) => {
    const fc = a.field.fieldName.localeCompare(b.field.fieldName);
    if (fc !== 0) return fc;
    return a.typeName.localeCompare(b.typeName);
  });

  const total = matches.length;
  const limited = matches.slice(0, FIELD_SEARCH_LIMIT);

  for (const { typeName, typeInfo, field } of limited) {
    const li = document.createElement('li');
    li.dataset.searchMode = 'field';
    li.dataset.parentTypeName = typeName;
    li.dataset.fieldName = field.fieldName;

    const fieldNameEl = document.createElement('div');
    fieldNameEl.className = 'search-dialog-type-name';
    fieldNameEl.textContent = field.fieldName;

    const parentEl = document.createElement('div');
    parentEl.className = 'search-dialog-type-pkg';
    parentEl.textContent = typeInfo.typeName + ' · ' + typeInfo.package;

    li.appendChild(fieldNameEl);
    li.appendChild(parentEl);
    listEl.appendChild(li);
  }

  if (total > FIELD_SEARCH_LIMIT) {
    const truncLi = document.createElement('li');
    truncLi.className = 'search-results-truncated';
    truncLi.textContent = `Showing ${FIELD_SEARCH_LIMIT} of ${total} results — refine your search`;
    listEl.appendChild(truncLi);
  }

  if (listEl.firstChild) {
    listEl.firstChild.classList.add('selected');
  }
}
