import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../db.js', () => ({ claimPrintJobs: vi.fn(), markShopeeConversionFailed: vi.fn() }));
vi.mock('../services/pdfToZpl.js', () => ({ pdfToZpl: vi.fn() }));
import { claimPrintJobs, markShopeeConversionFailed } from '../db.js';
import { pdfToZpl } from '../services/pdfToZpl.js';
import { claimAgentPrintJobs } from '../services/agentPrintJobs.js';
const pdfJob = { id: 1, user_id: 42, account_id: 7, provider: 'shopee', shipment_id: 'SN1', content_type: 'pdf', zpl: Buffer.from('%PDF-test').toString('base64') };
const mlJob = { id: 2, provider: 'mercadolivre', content_type: 'zpl', zpl: '^XA^FDML^FS^XZ' };
beforeEach(() => vi.resetAllMocks());
describe('agent format negotiation', () => {
  it('delivers TikTok PDFs as ZPL using the existing printer DPI and receipt id', async () => {
    const tiktokJob = { ...pdfJob, id: 9, provider: 'tiktok' };
    vi.mocked(claimPrintJobs).mockResolvedValue([tiktokJob, mlJob]);
    vi.mocked(pdfToZpl).mockResolvedValue('TIKTOK_RASTER');
    expect(await claimAgentPrintJobs(42, 'existing', 5, ['zpl'], 203)).toEqual([
      { ...tiktokJob, content_type: 'zpl', zpl: 'TIKTOK_RASTER' }, mlJob
    ]);
    expect(pdfToZpl).toHaveBeenCalledWith(Buffer.from('%PDF-test'), 203);
  });
  it('converts only Shopee PDFs for legacy agents, preserves job id and original stored bytes', async () => {
    vi.mocked(claimPrintJobs).mockResolvedValue([pdfJob, mlJob]);
    vi.mocked(pdfToZpl).mockResolvedValue('RASTER_ZPL');
    const jobs = await claimAgentPrintJobs(42, 'old', 5, ['zpl'], 300);
    expect(claimPrintJobs).toHaveBeenCalledWith(42, 'old', 5, ['zpl']);
    expect(pdfToZpl).toHaveBeenCalledWith(Buffer.from('%PDF-test'), 300);
    expect(jobs).toEqual([{ ...pdfJob, zpl: 'RASTER_ZPL', content_type: 'zpl' }, mlJob]);
    expect(jobs[1]).toBe(mlJob);
    expect(pdfJob.content_type).toBe('pdf');
  });
  it('keeps native PDF support on current agents', async () => {
    vi.mocked(claimPrintJobs).mockResolvedValue([pdfJob, mlJob]);
    expect(await claimAgentPrintJobs(42, 'new', 5, ['zpl', 'pdf'])).toEqual([pdfJob, mlJob]);
    expect(pdfToZpl).not.toHaveBeenCalled();
  });
  it('does not deliver failed conversions and schedules a safe retry without dropping ML', async () => {
    vi.mocked(claimPrintJobs).mockResolvedValue([pdfJob, mlJob]);
    vi.mocked(pdfToZpl).mockRejectedValue(new Error('corrupt'));
    expect(await claimAgentPrintJobs(42, 'old', 5)).toEqual([mlJob]);
    expect(markShopeeConversionFailed).toHaveBeenCalledWith(42, 1, 'corrupt');
  });
});
