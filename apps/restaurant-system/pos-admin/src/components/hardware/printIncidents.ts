import type { PrintJob } from '@jamanvaar/types';

export interface PrintIncident {
  printerId: string;
  printerName: string;
  failingJobs: number;
  firstFailureAt: string;
  lastFailureAt: string;
  recovered: boolean;
  recoveredAt?: string;
}

/**
 * #12: each failing print job showed as its own unexplained row -- five orders stuck behind one
 * jammed kitchen printer looked like five separate problems instead of one. Groups by printerId
 * so repeated failures become a single incident with how long it has been going on and whether
 * it has since recovered (a later job on the same printer that printed fine).
 */
export function groupPrintIncidents(jobs: PrintJob[]): PrintIncident[] {
  const byPrinter = new Map<string, PrintJob[]>();
  for (const job of jobs) {
    if (!job.printerId) continue;
    byPrinter.set(job.printerId, [...(byPrinter.get(job.printerId) ?? []), job]);
  }

  const incidents: PrintIncident[] = [];
  for (const [printerId, printerJobs] of byPrinter) {
    const sorted = [...printerJobs].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const failing = sorted.filter((j) => j.status === 'FAILED' || j.status === 'RETRYING');
    if (failing.length === 0) continue;

    const lastFailure = failing[failing.length - 1];
    const lastFailureAt = lastFailure.lastAttemptAt || lastFailure.createdAt;
    // Recovered: a later job on this same printer (by creation order) that actually printed.
    const recoveryJob = sorted.find(
      (j) => (j.status === 'PRINTED' || j.status === 'SUCCESS') && new Date(j.createdAt).getTime() > new Date(lastFailureAt).getTime()
    );

    incidents.push({
      printerId,
      printerName: failing[0].printerName || printerId,
      failingJobs: failing.length,
      firstFailureAt: failing[0].createdAt,
      lastFailureAt,
      recovered: !!recoveryJob,
      recoveredAt: recoveryJob?.printedAt || recoveryJob?.completedAt || recoveryJob?.createdAt
    });
  }

  return incidents.sort((a, b) => Number(a.recovered) - Number(b.recovered) || new Date(b.lastFailureAt).getTime() - new Date(a.lastFailureAt).getTime());
}
