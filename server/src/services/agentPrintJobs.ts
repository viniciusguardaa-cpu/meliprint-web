import { claimPrintJobs, markShopeeConversionFailed } from '../db.js';
import { pdfToZpl } from './pdfToZpl.js';

/** Same queue, job id, owner and receipt protocol on both agent generations. */
export async function claimAgentPrintJobs(userId: number, agentId: string, limit: number, contentTypes: string[] = ['zpl'], dpi: 203 | 300 = 203) {
  const jobs = await claimPrintJobs(userId, agentId, limit, contentTypes);
  if (contentTypes.includes('pdf')) return jobs;
  const deliverable = [];
  for (const job of jobs) {
    if (job.content_type !== 'pdf') {
      deliverable.push(job);
      continue;
    }
    try {
      if (job.provider !== 'shopee') throw new Error('Unsupported PDF compatibility provider');
      const zpl = await pdfToZpl(Buffer.from(job.zpl, 'base64'), dpi);
      deliverable.push({ ...job, content_type: 'zpl', zpl });
    } catch (err) {
      // Conversion failed BEFORE sending a response to the agent. This is a
      // safe, bounded retry. Lost responses after delivery remain needs_review.
      await markShopeeConversionFailed(userId, job.id, err instanceof Error ? err.message : String(err));
    }
  }
  return deliverable;
}
