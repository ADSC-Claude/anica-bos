'use client';

/** Saves a coordinator the Ctrl+P. The browser's own dialog does the rest. */
export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="btn btn-primary btn-sm">
      Print or save as PDF
    </button>
  );
}
