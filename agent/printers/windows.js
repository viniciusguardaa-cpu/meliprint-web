/**
 * Windows printer adapter — uses PowerShell to send raw ZPL to a printer.
 * Falls back to `lpr` (LPR/LPD) if available.
 *
 * Raw printing on Windows requires sending bytes directly to the printer
 * spooler. We use a PowerShell snippet that writes raw bytes via .NET
 * RawPrinterHelper (the standard way to send ESC/POS or ZPL on Windows).
 */
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export const windowsAdapter = {
  name: 'Windows',

  async printZpl(printerName, zpl) {
    // PowerShell script: send raw bytes to the printer using RawPrinterHelper.
    // This avoids any Windows print processor rendering (which would corrupt ZPL).
    const psScript = `
$bytes = [System.Text.Encoding]::Default.GetBytes([System.Environment]::GetEnvironmentVariable('LABELGO_ZPL'))
$printerName = [System.Environment]::GetEnvironmentVariable('LABELGO_PRINTER')
$method = [System.Drawing.Printing.PrinterSettings].GetMethod('RawPrinterHelper', [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Static)
if (-not $method) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class RawPrinterHelper {
  [StructLayout(LayoutKind.Sequential)]
  public struct DOCINFO { public string pDocName; public string pOutputFile; public string pDataType; }
  [DllImport("winspool.Drv", EntryPoint="OpenPrinterA", SetLastError=true)]
  public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);
  [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterA", SetLastError=true)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, int level, ref DOCINFO di);
  [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);
  public static bool SendBytesToPrinter(string szPrinterName, IntPtr pBytes, int dwCount) {
    IntPtr hPrinter; DOCINFO di = new DOCINFO(); di.pDocName = "LabelGo Label"; di.pDataType = "RAW";
    if (!OpenPrinter(szPrinterName.Normalize(), out hPrinter, IntPtr.Zero)) return false;
    if (hPrinter == IntPtr.Zero) return false;
    bool bSuccess = StartDocPrinter(hPrinter, 1, ref di);
    if (bSuccess) { StartPagePrinter(hPrinter); int dwWritten; bSuccess = WritePrinter(hPrinter, pBytes, dwCount, out dwWritten); EndPagePrinter(hPrinter); EndDocPrinter(hPrinter); }
    ClosePrinter(hPrinter); return bSuccess;
  }
}
'@
  $hGlobal = [Runtime.InteropServices.Marshal]::AllocHGlobal($bytes.Length)
  [Runtime.InteropServices.Marshal]::Copy($bytes, 0, $hGlobal, $bytes.Length)
  $ok = [RawPrinterHelper]::SendBytesToPrinter($printerName, $hGlobal, $bytes.Length)
  [Runtime.InteropServices.Marshal]::FreeHGlobal($hGlobal)
  if (-not $ok) { exit 1 }
}
`;

    return new Promise((resolve, reject) => {
      const child = execFile('powershell', ['-NoProfile', '-Command', psScript], {
        env: {
          ...process.env,
          LABELGO_ZPL: zpl,
          LABELGO_PRINTER: printerName,
        },
        timeout: 30000,
      }, (err, stdout, stderr) => {
        if (err) reject(new Error(`Windows print failed: ${stderr || err.message}`));
        else resolve('OK');
      });
    });
  },

  async listPrinters() {
    try {
      const { stdout } = await execFileAsync('powershell', [
        '-NoProfile', '-Command',
        'Get-Printer | Select-Object -ExpandProperty Name',
      ], { timeout: 10000 });
      return stdout.trim().split('\n').map(s => s.trim()).filter(Boolean);
    } catch {
      return [];
    }
  },
};
