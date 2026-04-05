// appendGoDoc render a GoDocString into the DOM.
//
// @param {object} docString is a JSON with schema from pkg/godoc.go GoDocString.
// @param out is the DOM into which the content will be rendered.
function appendGoDoc(docString, out) {
  // Schema for docstrings come from pkg/godoc.go.
  docString.elements.forEach(elem => {
    switch (elem.type) {
      case 'p': {
        const p = document.createElement('p');
        elem.content[0].split('\n').forEach((line, index, arr) => {
          const tn = document.createTextNode(line);
          p.appendChild(tn);
          linkifyTextNode(tn);
          if (index < arr.length - 1) {
            p.appendChild(document.createElement('br'));
          }
        });
        out.appendChild(p);
        break;
      }

      case 'h': {
        const h = document.createElement('div');
        h.className = 'heading';
        h.textContent = elem.content[0];
        out.appendChild(h);
        break;
      }

      case 'l': {
        const ul = document.createElement('ul');
        elem.content.forEach(itemText => {
          const li = document.createElement('li');
          itemText.split('\n').forEach((line, index, arr) => {
            const tn = document.createTextNode(line)
            li.appendChild(tn);
            linkifyTextNode(tn);
            if (index < arr.length - 1) {
              li.appendChild(document.createElement('br'));
            }
          });
          ul.appendChild(li);
        });
        out.appendChild(ul);
        break;
      }

      case 'c': {
        const pre = document.createElement('pre');
        const code = document.createElement('code');
        code.textContent = elem.content[0];
        pre.appendChild(code);
        out.appendChild(pre);
        break;
      }

      case 'd': {
        break; // TODO: ignore this for now. These should be shown in a special way.
      }
    }
  });
}
