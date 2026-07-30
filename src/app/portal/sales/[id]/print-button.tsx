'use client';

export function PrintClient() {
  return (
    <button className="btn-primary btn-sm" onClick={() => window.print()}>
      Print receipt
    </button>
  );
}
