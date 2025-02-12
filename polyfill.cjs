// polyfill.cjs
const { JSDOM } = require('jsdom');

// Create a new JSDOM instance. Using pretendToBeVisual can sometimes help produce a more complete DOM.
const dom = new JSDOM('', { pretendToBeVisual: true });

// Set global Event and CustomEvent from the same window
globalThis.Event = dom.window.Event;
globalThis.CustomEvent = dom.window.CustomEvent;

console.log("Polyfilled Event and CustomEvent via jsdom.");
// For debugging: verify that CustomEvent is an instance of Event
console.log("Test: new CustomEvent('test') instanceof Event =", new CustomEvent('test') instanceof Event);
