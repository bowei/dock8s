/**
 * @jest-environment jsdom
 */
import { appendGoDoc } from './utils.js';

function renderDocString(docString) {
  const out = document.createElement('div');
  appendGoDoc(docString, out);
  return out;
}

describe('appendGoDoc', () => {
  beforeEach(() => {
    global.linkifyTextNode.mockClear();
  });

  describe('paragraph (type "p")', () => {
    it('renders a single-line paragraph', () => {
      const out = renderDocString({
        elements: [{ type: 'p', content: ['Hello world'] }],
      });
      const p = out.querySelector('p');
      expect(p).not.toBeNull();
      expect(p.textContent).toBe('Hello world');
    });

    it('renders multi-line paragraph with <br> separators', () => {
      const out = renderDocString({
        elements: [{ type: 'p', content: ['line one\nline two\nline three'] }],
      });
      const p = out.querySelector('p');
      expect(p).not.toBeNull();
      expect(p.querySelectorAll('br').length).toBe(2);
      expect(p.textContent).toBe('line oneline twoline three');
    });

    it('calls linkifyTextNode for each line', () => {
      renderDocString({
        elements: [{ type: 'p', content: ['line one\nline two'] }],
      });
      expect(global.linkifyTextNode).toHaveBeenCalledTimes(2);
    });
  });

  describe('heading (type "h")', () => {
    it('renders a heading div', () => {
      const out = renderDocString({
        elements: [{ type: 'h', content: ['My Heading'] }],
      });
      const h = out.querySelector('.heading');
      expect(h).not.toBeNull();
      expect(h.textContent).toBe('My Heading');
    });
  });

  describe('list (type "l")', () => {
    it('renders a ul with li items', () => {
      const out = renderDocString({
        elements: [{ type: 'l', content: ['item one', 'item two', 'item three'] }],
      });
      const ul = out.querySelector('ul');
      expect(ul).not.toBeNull();
      const items = ul.querySelectorAll('li');
      expect(items.length).toBe(3);
      expect(items[0].textContent).toBe('item one');
      expect(items[1].textContent).toBe('item two');
      expect(items[2].textContent).toBe('item three');
    });

    it('renders multi-line list items with <br> separators', () => {
      const out = renderDocString({
        elements: [{ type: 'l', content: ['line one\nline two'] }],
      });
      const li = out.querySelector('li');
      expect(li).not.toBeNull();
      expect(li.querySelectorAll('br').length).toBe(1);
      expect(li.textContent).toBe('line oneline two');
    });

    it('calls linkifyTextNode for each line in each item', () => {
      renderDocString({
        elements: [{ type: 'l', content: ['a\nb', 'c'] }],
      });
      expect(global.linkifyTextNode).toHaveBeenCalledTimes(3);
    });
  });

  describe('code block (type "c")', () => {
    it('renders a pre > code block', () => {
      const out = renderDocString({
        elements: [{ type: 'c', content: ['x := 1\ny := 2'] }],
      });
      const pre = out.querySelector('pre');
      expect(pre).not.toBeNull();
      const code = pre.querySelector('code');
      expect(code).not.toBeNull();
      expect(code.textContent).toBe('x := 1\ny := 2');
    });

    it('does not call linkifyTextNode for code blocks', () => {
      renderDocString({
        elements: [{ type: 'c', content: ['some code'] }],
      });
      expect(global.linkifyTextNode).not.toHaveBeenCalled();
    });
  });

  describe('directive (type "d")', () => {
    it('does not render anything for directives', () => {
      const out = renderDocString({
        elements: [{ type: 'd', content: ['+Deprecated'] }],
      });
      expect(out.children.length).toBe(0);
    });
  });

  describe('multiple elements', () => {
    it('renders elements in order', () => {
      const out = renderDocString({
        elements: [
          { type: 'h', content: ['Title'] },
          { type: 'p', content: ['A paragraph.'] },
          { type: 'l', content: ['item a', 'item b'] },
          { type: 'c', content: ['code here'] },
        ],
      });
      const children = out.children;
      expect(children[0].className).toBe('heading');
      expect(children[1].tagName).toBe('P');
      expect(children[2].tagName).toBe('UL');
      expect(children[3].tagName).toBe('PRE');
    });
  });
});
