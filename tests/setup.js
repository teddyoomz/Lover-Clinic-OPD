import '@testing-library/jest-dom';

// jsdom doesn't implement Element.scrollIntoView — stub it so tests that
// trigger scrollToError (shared helper in marketingUiUtils + TreatmentFormPage)
// don't throw.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function noopScrollIntoView() {};
}
