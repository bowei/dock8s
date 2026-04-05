export const FIELD_SEARCH_LIMIT = 50;

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

// MAX_FIELD_SEARCH_DEPTH caps the DFS path length when searching for fields.
// Kubernetes types rarely exceed 5-6 levels deep in practice; 10 is a
// conservative upper bound. Increase this constant if deeper paths are needed.
const MAX_FIELD_SEARCH_DEPTH = 10;

// findFieldPaths returns all paths from root types to fields matching filter.
// Each result is { rootTypeName, path } where path is an array of field names
// from the root type down to and including the matching field.
//
// Search stops once FIELD_SEARCH_LIMIT results are collected (early termination),
// so the returned array may be a prefix of all matches. Results are not sorted.
//
// @param {string} filter - substring filter (case-insensitive, must be non-empty)
// @param {object} typeData - map of typeName -> TypeInfo
// @returns {{ rootTypeName: string, path: string[] }[]}
export function findFieldPaths(filter, typeData) {
  const results = [];
  const lowerFilter = filter.toLowerCase();

  function dfs(rootTypeName, typeName, path, visitedInPath) {
    if (results.length >= FIELD_SEARCH_LIMIT) return;
    // MAX_FIELD_SEARCH_DEPTH prevents runaway DFS on deeply nested or cyclic graphs.
    if (path.length >= MAX_FIELD_SEARCH_DEPTH) return;

    const typeInfo = typeData[typeName];
    if (!typeInfo || !typeInfo.fields) return;

    for (const field of typeInfo.fields) {
      if (results.length >= FIELD_SEARCH_LIMIT) return;

      const newPath = [...path, field.fieldName];

      if (field.fieldName.toLowerCase().includes(lowerFilter)) {
        results.push({ rootTypeName, path: newPath });
      }

      if (field.typeName && typeData[field.typeName] && !visitedInPath.has(field.typeName)) {
        visitedInPath.add(field.typeName);
        dfs(rootTypeName, field.typeName, newPath, visitedInPath);
        visitedInPath.delete(field.typeName);
      }
    }
  }

  for (const rootTypeName of Object.keys(typeData)) {
    if (!typeData[rootTypeName].isRoot) continue;
    if (results.length >= FIELD_SEARCH_LIMIT) break;
    dfs(rootTypeName, rootTypeName, [], new Set([rootTypeName]));
  }

  return results;
}

// populateFieldSearchList fills listEl with root-to-field paths matching filter.
// Only paths originating from root types are included. Results are capped at
// FIELD_SEARCH_LIMIT with a truncation indicator shown when the cap is hit.
//
// @param {string} filter - substring filter (case-insensitive)
// @param {object} typeData - map of typeName -> TypeInfo
// @param {Element} listEl - the <ul> element to populate
export function populateFieldSearchList(filter, typeData, listEl) {
  listEl.innerHTML = '';

  if (!filter) {
    return;
  }

  const matches = findFieldPaths(filter, typeData);

  // Sort by field name (last path segment), then root type, then path depth,
  // then full path as final tiebreaker.
  matches.sort((a, b) => {
    const fa = a.path[a.path.length - 1];
    const fb = b.path[b.path.length - 1];
    const fc = fa.localeCompare(fb);
    if (fc !== 0) return fc;
    const rc = a.rootTypeName.localeCompare(b.rootTypeName);
    if (rc !== 0) return rc;
    if (a.path.length !== b.path.length) return a.path.length - b.path.length;
    return a.path.join('/').localeCompare(b.path.join('/'));
  });

  // matches.length === FIELD_SEARCH_LIMIT means DFS stopped early; there may be more.
  const truncated = matches.length >= FIELD_SEARCH_LIMIT;

  for (const { rootTypeName, path } of matches) {
    const rootTypeInfo = typeData[rootTypeName];
    const li = document.createElement('li');
    li.dataset.searchMode = 'field';
    li.dataset.rootTypeName = rootTypeName;
    li.dataset.fieldPath = path.join('/');

    const fieldNameEl = document.createElement('div');
    fieldNameEl.className = 'search-dialog-type-name';
    fieldNameEl.textContent = path[path.length - 1];

    // Breadcrumb: RootShortName / field1 / field2 / ... up to (not including) the matching field.
    const breadcrumb = [rootTypeInfo.typeName, ...path.slice(0, -1)].join(' / ');
    const breadcrumbEl = document.createElement('div');
    breadcrumbEl.className = 'search-dialog-type-pkg';
    breadcrumbEl.textContent = breadcrumb;

    li.appendChild(fieldNameEl);
    li.appendChild(breadcrumbEl);
    listEl.appendChild(li);
  }

  if (listEl.firstChild) {
    listEl.firstChild.classList.add('selected');
  }

  return { truncated };
}
