import { useEffect, useState } from 'react';
import { PrintQueueRepository } from '@jamanvaar/database';
import { PrinterService } from '@jamanvaar/api';
export function PrinterRecovery() {
  const [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  useEffect(() => {
    const timer = setInterval(() => setRevision((v) => v + 1), 10000);
    return () => clearInterval(timer);
  }, []);
  const jobs = PrintQueueRepository.getAllJobs().filter((job) => ['FAILED', 'ERROR'].includes(job.status));
  return (
    <section className="ops-card" data-revision={revision}>
      <h4>Printer recovery on this device</h4>
      <p>Check printer power, connection, paper and cover. Retry the existing job after reconnecting. Other terminals keep their own print queues.</p>
      {message && <p role="status">{message}</p>}
      {jobs.length === 0 ? (
        <p>No failed local print jobs.</p>
      ) : (
        jobs.map((job) => (
          <article key={job.id}>
            <strong>
              {job.printerName || 'Configured printer'} · {job.orderNumber || job.tokenNumber || job.id}
            </strong>
            <p>
              Original print reference: <code>{job.id}</code>
            </p>
            <p>{job.errorMessage || 'Printing failed. Check the printer connection.'}</p>
            <button
              disabled={busy}
              onClick={async () => {
                if (busy) return;
                setBusy(true);
                try {
                  const current = PrintQueueRepository.getJobById(job.id);
                  if (!current || !['FAILED', 'ERROR'].includes(current.status)) throw new Error('This job is no longer failed. Refresh its status first.');
                  PrintQueueRepository.retryJob(job.id);
                  await PrinterService.processQueue();
                  const after = PrintQueueRepository.getJobById(job.id);
                  setMessage(
                    after?.status === 'PRINTED'
                      ? 'Original print job completed.'
                      : after?.errorMessage || 'The original job is queued. Printing has not been confirmed.'
                  );
                  setRevision((v) => v + 1);
                } catch (e) {
                  setMessage(e instanceof Error ? e.message : 'Could not retry the print job.');
                } finally {
                  setBusy(false);
                }
              }}
            >
              Retry original print job
            </button>
          </article>
        ))
      )}
    </section>
  );
}
