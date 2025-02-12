// polyfill.cjs

// Ensure the global window is set to globalThis.
globalThis.window = globalThis;

// Minimal Event polyfill
if (typeof globalThis.Event === 'undefined') {
  class Event {
    constructor(type, eventInitDict = {}) {
      this.type = type;
      this.bubbles = eventInitDict.bubbles || false;
      this.cancelable = eventInitDict.cancelable || false;
    }
  }
  globalThis.Event = Event;
  console.log("Minimal Event polyfill applied.");
}

// Minimal CustomEvent polyfill that extends our Event polyfill
if (typeof globalThis.CustomEvent === 'undefined') {
  class CustomEvent extends globalThis.Event {
    constructor(type, eventInitDict = {}) {
      super(type, eventInitDict);
      this.detail = eventInitDict.detail || null;
    }
  }
  globalThis.CustomEvent = CustomEvent;
  // Adjust prototype chain so that instances are recognized as Events.
  globalThis.CustomEvent.prototype.__proto__ = globalThis.Event.prototype;
  console.log("Minimal CustomEvent polyfill applied.");
}

// Debug output to verify that new CustomEvent instances are instanceof Event.
console.log("Test: new CustomEvent('test') instanceof Event =", new CustomEvent('test') instanceof globalThis.Event);
