/**
 * Printer adapter interface — abstracts OS-specific printing.
 *
 * @typedef {Object} PrinterAdapter
 * @property {(printerName: string, zpl: string) => Promise<string>} printZpl
 *   Print raw ZPL to the specified printer. Resolves once the spooler accepts
 *   the job (this does NOT prove physical printing).
 * @property {() => Promise<string[]>} listPrinters
 *   List available printer names.
 * @property {string} name
 *   Human-readable adapter name (e.g. "CUPS", "Windows").
 */
export { };
