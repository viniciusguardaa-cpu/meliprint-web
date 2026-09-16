/**
 * Printer adapter interface — abstracts OS-specific printing.
 * Each adapter implements raw ZPL printing + printer discovery.
 */
export interface PrinterAdapter {
  /** Print raw ZPL to the specified printer. */
  printZpl(printerName: string, zpl: string): Promise<string>;
  /** List available printer names. */
  listPrinters(): Promise<string[]>;
  /** Human-readable adapter name (e.g. "CUPS", "Windows"). */
  readonly name: string;
}
