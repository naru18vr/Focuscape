import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://focuscape.test/", pretendToBeVisual: true });
for (const key of ["window", "document", "navigator", "HTMLElement", "HTMLDialogElement", "KeyboardEvent", "MutationObserver"] as const) {
  Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
}

// jsdom does not implement native dialog focus behavior. Test close/cancel state
// here; native focus trapping and restoration are covered by the browser suite.
dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };

export const testWindow = dom.window;
