import '@testing-library/jest-dom';

// jsdom doesn't implement Element.scrollIntoView — stub it so tests that
// trigger scrollToError (shared helper in marketingUiUtils + TreatmentFormPage)
// don't throw.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function noopScrollIntoView() {};
}

// jsdom doesn't implement window.matchMedia — stub it so hooks that detect
// theme (useTheme — Phase 29.22 round-3 RecallRow consumes it) don't throw.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = function stubMatchMedia(query) {
    return {
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    };
  };
}
