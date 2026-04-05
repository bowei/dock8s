function createDocString(docString) {
  const container = document.createElement('div');
  container.className = 'doc-string';

  const summary = document.createElement('div');
  const details = document.createElement('div');
  details.hidden = true;

  container.appendChild(summary);
  container.appendChild(details);

  if (!docString) { return container; }

  if (typeof docString === 'string') {
    summary.innerHTML = getFirstSentence(docString);

    // Fallback for plain text docstrings
    const p = document.createElement('p');
    p.textContent = docString;
    details.appendChild(p);
    return container;
  }

  if (!docString.elements) {
    console.log('ERROR: empty docString.elements');
    return container;
  }

  const stn = document.createTextNode(
    getFirstSentence(docString.elements[0].content[0]));
  summary.appendChild(stn);
  linkifyTextNode(stn);

  // TODO: expandSpan should only be added if there are more than one 
  if (visibleElementsCount(docString) > 1 || docString.elements[0].content.length > 1) {
    const expandSpan = document.createElement('span');
    expandSpan.textContent = ' [more]';
    summary.appendChild(expandSpan);

    expandSpan.addEventListener('click', () => {
      summary.hidden = !summary.hidden;
      details.hidden = !details.hidden;
      return false;
    });
  }

  appendGoDoc(docString, details);

  return container;
}

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

/**
 * @param {object} docString docString is a JSON with schema from pkg/godoc.go GoDocString
 * @returns {number} count of visible elements in the docString.
 */
function visibleElementsCount(docString) {
  var length = 0;
  docString.elements.forEach(elem => {
    switch (elem.type) {
      case 'd': { break; }
      default:
        length++;
    }
  });
  return length;
}

/**
 * Replaces a single text node with a series of text and <a> nodes
 * if any URLs are found in its content.
 *
 * @param {Node} textNode The text node to process.
 */
function linkifyTextNode(textNode) {
  // 1. Ensure we're working with an actual text node
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
    console.error("The provided element is not a text node.");
    return;
  }

  const parent = textNode.parentNode;
  if (!parent) {
    console.error("The text node must be attached to the DOM.");
    return;
  }

  const text = textNode.nodeValue;
  const urlRegex = /(https?:\/\/[^\s/$.?#].[^\s]*)/gi;

  // 2. Only proceed if the regex finds at least one URL
  if (!urlRegex.test(text)) {
    return;
  }

  // Reset regex from the .test() call above
  urlRegex.lastIndex = 0;

  // 3. Create a document fragment to hold the new nodes
  const fragment = document.createDocumentFragment();
  let lastIndex = 0;
  let match;

  while ((match = urlRegex.exec(text)) !== null) {
    // Append the text that comes before the matched URL
    const textBefore = text.substring(lastIndex, match.index);
    if (textBefore) {
      fragment.appendChild(document.createTextNode(textBefore));
    }

    // Create and append the link (<a> element)
    const url = match[0];
    const link = document.createElement('a');
    link.href = url;
    link.appendChild(document.createTextNode(url));
    fragment.appendChild(link);

    lastIndex = urlRegex.lastIndex;
  }

  // 4. Append any remaining text after the last URL
  const textAfter = text.substring(lastIndex);
  if (textAfter) {
    fragment.appendChild(document.createTextNode(textAfter));
  }

  // 5. Replace the original text node with the new fragment
  parent.replaceChild(fragment, textNode);
}

function getFirstSentence(text) {
  if (!text) { return ""; }
  // The regex looks for the first sentence ending with a '.', '?', or '!'
  const match = text.match(/^.+?[.?!]/);

  // If a sentence is found, return it. Otherwise, return the original text.
  return match ? match[0] : text;
}

export {
  createDocString,
  appendGoDoc,
  visibleElementsCount,
};
