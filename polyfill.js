import { JSDOM } from 'jsdom';
const { window } = new JSDOM();
globalThis.CustomEvent = window.CustomEvent;
console.log("CustomEvent polyfill via jsdom applied.");
