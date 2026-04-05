/**
 * @jest-environment jsdom
 */

// Set up the basic HTML structure needed for app.js
document.body.innerHTML = `
  <div id="main-container"></div>
  <div id="search-dialog-overlay" style="display: none;">
    <div id="search-dialog-dialog">
      <input id="search-dialog-input" />
      <ul id="search-dialog-list"></ul>
    </div>
  </div>
  <div id="help-dialog-overlay" style="display: none;">
    <div id="help-dialog-dialog"></div>
  </div>
  <div id="help-text"></div>
  <select id="theme-select">
    <option value="light.css">Light</option>
  </select>
  <link rel="stylesheet" href="light.css" />
`;

// Mock global variables that would be injected by Go's html/template
global.typeData = {};
global.startTypes = [];

beforeAll(async () => {
  await import('./app.js');
});

// app.js is now just orchestration; unit tests live in utils.test.js,
// column.test.js, hash.test.js, and search.test.js.
// This file verifies that app.js loads without errors given valid DOM and globals.
describe('app', () => {
  it('loads without throwing', () => {
    // If the import above succeeded, app.js initialized cleanly.
    expect(true).toBe(true);
  });
});
