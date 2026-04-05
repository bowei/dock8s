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
