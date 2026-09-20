import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LifeBuoy, Paperclip, Plus, ArrowLeft, Send } from 'lucide-react';
import {
  attachToSupportTicket,
  createSupportTicket,
  downloadSupportAttachment,
  fetchCloudBranches,
  fetchSupportTicket,
  fetchSupportTickets,
  isCloudConnected,
  isCloudLoggedIn,
  cloudSetupHint,
  replyToSupportTicket,
  CloudApiError,
  type CloudBranch,
  type SupportTicketCategory,
  type SupportTicketDetail,
  type SupportTicketPriority,
  type SupportTicketRow,
  type SupportTicketStatus
} from '../../cloud/cloudClient';

const CATEGORIES: Array<{ id: SupportTicketCategory; label: string }> = [
  { id: 'HARDWARE', label: 'Printer or hardware' },
  { id: 'SYNC', label: 'Sync or data' },
  { id: 'BILLING', label: 'Billing or subscription' },
  { id: 'ONBOARDING', label: 'Setup help' },
  { id: 'FEATURE_REQUEST', label: 'Feature request' },
  { id: 'OTHER', label: 'Something else' }
];
const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label])) as Record<SupportTicketCategory, string>;

const PRIORITIES: Array<{ id: SupportTicketPriority; label: string; hint: string }> = [
  { id: 'LOW', label: 'Low', hint: 'Answer within a week' },
  { id: 'MEDIUM', label: 'Normal', hint: 'Answer within 3 days' },
  { id: 'HIGH', label: 'High', hint: 'Answer within a day' },
  { id: 'URGENT', label: 'Urgent: we cannot serve customers', hint: 'Answer within 4 hours' }
];

const STATUS_STYLE: Record<SupportTicketStatus, string> = {
  OPEN: 'bg-amber-50 text-amber-800 border-amber-200',
  IN_PROGRESS: 'bg-sky-50 text-sky-800 border-sky-200',
  RESOLVED: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  CLOSED: 'bg-slate-100 text-slate-600 border-slate-200'
};
const STATUS_LABEL: Record<SupportTicketStatus, string> = { OPEN: 'Open', IN_PROGRESS: 'Being worked on', RESOLVED: 'Resolved', CLOSED: 'Closed' };

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain';
const ticketNo = (n: number) => `TKT-${String(n).padStart(6, '0')}`;
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the file'));
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.readAsDataURL(file);
  });
}

const errorText = (err: unknown, fallback: string) => (err instanceof CloudApiError ? err.message : fallback);

interface Props {
  showToast: (msg: string) => void;
}

/** Raise a problem to the JAMANVAAR support team and follow the answer: this restaurant's own tickets only. */
export const SupportTicketsModule: React.FC<Props> = ({ showToast }) => {
  const cloudReady = isCloudConnected() && isCloudLoggedIn();
  const [tickets, setTickets] = useState<SupportTicketRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SupportTicketDetail | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    if (!cloudReady) return;
    fetchSupportTickets()
      .then((rows) => {
        setTickets(rows);
        setLoadError(null);
      })
      .catch((err) => setLoadError(errorText(err, 'Could not load your tickets.')));
  }, [cloudReady]);

  useEffect(load, [load]);

  async function open(id: string) {
    try {
      setSelected(await fetchSupportTicket(id));
    } catch (err) {
      showToast(errorText(err, 'Could not open the ticket.'));
    }
  }

  if (!cloudReady) {
    return (
      <div className="max-w-3xl mx-auto space-y-3">
        <h1 className="text-2xl sm:text-3xl font-black text-jaman-navy tracking-tight">Help & Support</h1>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          Support tickets go to the JAMANVAAR team over the internet. {cloudSetupHint()}
        </div>
      </div>
    );
  }

  if (creating) {
    return (
      <NewTicket
        onCancel={() => setCreating(false)}
        onCreated={async (ticket) => {
          setCreating(false);
          showToast(`Ticket ${ticketNo(ticket.number)} sent to support`);
          load();
          await open(ticket.id);
        }}
      />
    );
  }

  if (selected) {
    return (
      <TicketView
        ticket={selected}
        onBack={() => {
          setSelected(null);
          load();
        }}
        onChanged={async () => setSelected(await fetchSupportTicket(selected.id))}
        showToast={showToast}
      />
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-jaman-navy tracking-tight">Help & Support</h1>
          <p className="text-xs sm:text-sm text-[#4A5568] mt-0.5">Tell the JAMANVAAR team what is wrong. They reply here, and you can add screenshots.</p>
        </div>
        <button type="button" onClick={() => setCreating(true)} className="inline-flex items-center gap-2 rounded-xl bg-jaman-navy px-4 py-2.5 text-sm font-bold text-white">
          <Plus className="w-4 h-4" /> New ticket
        </button>
      </div>

      {loadError && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{loadError}</div>}

      <div className="rounded-2xl border border-jaman-border bg-white shadow-2xs overflow-hidden">
        {tickets === null && !loadError ? (
          <div className="p-6 text-sm text-slate-500">Loading…</div>
        ) : tickets && tickets.length === 0 ? (
          <div className="p-8 text-center">
            <LifeBuoy className="w-8 h-8 mx-auto text-slate-400" />
            <p className="mt-2 text-sm font-bold text-jaman-navy">No tickets yet</p>
            <p className="text-xs text-slate-500">If something is not working, raise a ticket and we will help.</p>
          </div>
        ) : (
          <ul className="divide-y divide-jaman-border">
            {(tickets ?? []).map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => open(t.id)} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-slate-50">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-jaman-navy">{t.subject}</span>
                    <span className="block text-xs text-slate-500">{ticketNo(t.number)} · {CATEGORY_LABEL[t.category]} · updated {when(t.updatedAt)}</span>
                  </span>
                  <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-bold ${STATUS_STYLE[t.status]}`}>{STATUS_LABEL[t.status]}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

function NewTicket({ onCancel, onCreated }: { onCancel: () => void; onCreated: (t: SupportTicketRow) => void | Promise<void> }) {
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<SupportTicketCategory>('HARDWARE');
  const [priority, setPriority] = useState<SupportTicketPriority>('MEDIUM');
  const [branchId, setBranchId] = useState('');
  const [branches, setBranches] = useState<CloudBranch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchCloudBranches().then(setBranches).catch(() => setBranches([]));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (subject.trim().length < 3) return setError('Give the problem a short title (at least 3 characters).');
    if (description.trim().length < 3) return setError('Describe what happened (at least 3 characters).');
    setError(null);
    setSaving(true);
    try {
      await onCreated(await createSupportTicket({ subject: subject.trim(), description: description.trim(), category, priority, branchId: branchId || undefined }));
    } catch (err) {
      setError(errorText(err, 'Could not send the ticket. Check your connection and try again.'));
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-2xl mx-auto space-y-4" noValidate>
      <button type="button" onClick={onCancel} className="inline-flex items-center gap-1 text-xs font-bold text-slate-600">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to tickets
      </button>
      <h1 className="text-2xl font-black text-jaman-navy tracking-tight">New support ticket</h1>
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}

      <label className="block text-xs font-bold text-slate-700">
        What is the problem?
        <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} className="mt-1 w-full rounded-xl border border-jaman-border px-3 py-2.5 text-sm font-medium" placeholder="For example: kitchen printer stopped printing" />
      </label>
      <label className="block text-xs font-bold text-slate-700">
        Tell us more
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} maxLength={5000} className="mt-1 w-full rounded-xl border border-jaman-border px-3 py-2.5 text-sm font-medium" placeholder="What happened, when it started, and what you already tried." />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs font-bold text-slate-700">
          Topic
          <select value={category} onChange={(e) => setCategory(e.target.value as SupportTicketCategory)} className="mt-1 w-full rounded-xl border border-jaman-border px-3 py-2.5 text-sm font-medium">
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        <label className="block text-xs font-bold text-slate-700">
          How urgent is it?
          <select value={priority} onChange={(e) => setPriority(e.target.value as SupportTicketPriority)} className="mt-1 w-full rounded-xl border border-jaman-border px-3 py-2.5 text-sm font-medium">
            {PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label} ({p.hint})</option>)}
          </select>
        </label>
      </div>
      {branches.length > 1 && (
        <label className="block text-xs font-bold text-slate-700">
          Which outlet?
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="mt-1 w-full rounded-xl border border-jaman-border px-3 py-2.5 text-sm font-medium">
            <option value="">The whole restaurant</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
      )}
      <p className="text-xs text-slate-500">Your restaurant, name and this device are sent with the ticket automatically. You can add screenshots after sending.</p>
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="rounded-xl bg-jaman-navy px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60">{saving ? 'Sending…' : 'Send to support'}</button>
        <button type="button" onClick={onCancel} disabled={saving} className="rounded-xl border border-jaman-border px-5 py-2.5 text-sm font-bold text-slate-700">Cancel</button>
      </div>
    </form>
  );
}

function TicketView({ ticket, onBack, onChanged, showToast }: { ticket: SupportTicketDetail; onBack: () => void; onChanged: () => Promise<void>; showToast: (m: string) => void }) {
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const timeline = useMemo(() => {
    const items = [
      ...ticket.events.filter((e) => e.type !== 'ATTACHMENT').map((e) => ({ at: e.createdAt, id: `e-${e.id}`, event: e })),
      ...ticket.comments.map((c) => ({ at: c.createdAt, id: `c-${c.id}`, comment: c }))
    ];
    return items.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  }, [ticket]);

  async function send() {
    if (!reply.trim()) return;
    setSending(true);
    try {
      await replyToSupportTicket(ticket.id, reply.trim());
      setReply('');
      await onChanged();
    } catch (err) {
      showToast(errorText(err, 'Could not send your reply.'));
    } finally {
      setSending(false);
    }
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_BYTES) return showToast('Files can be at most 2 MB.');
    setUploading(true);
    try {
      await attachToSupportTicket(ticket.id, { fileName: file.name, mimeType: file.type, dataBase64: await toBase64(file) });
      await onChanged();
    } catch (err) {
      showToast(errorText(err, 'Could not attach the file.'));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function download(id: string, name: string) {
    try {
      const url = URL.createObjectURL(await downloadSupportAttachment(ticket.id, id));
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      showToast(errorText(err, 'Could not download the file.'));
    }
  }

  const closed = ticket.status === 'CLOSED';

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-xs font-bold text-slate-600">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to tickets
      </button>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-jaman-navy tracking-tight">{ticket.subject}</h1>
          <p className="text-xs text-slate-500">{ticketNo(ticket.number)} · {CATEGORY_LABEL[ticket.category]} · opened {when(ticket.createdAt)}</p>
        </div>
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${STATUS_STYLE[ticket.status]}`}>{STATUS_LABEL[ticket.status]}</span>
      </div>
      <p className="rounded-2xl border border-jaman-border bg-white p-4 text-sm whitespace-pre-wrap">{ticket.description}</p>

      <div className="rounded-2xl border border-jaman-border bg-white p-4 space-y-2">
        <h2 className="text-sm font-extrabold text-jaman-navy">Attachments</h2>
        {ticket.attachments.length === 0 ? (
          <p className="text-xs text-slate-500">None yet.</p>
        ) : (
          <ul className="space-y-1">
            {ticket.attachments.map((a) => (
              <li key={a.id} className="flex items-center gap-2 text-xs">
                <Paperclip className="w-3 h-3" />
                <button type="button" className="font-bold text-jaman-navy underline" onClick={() => download(a.id, a.fileName)}>{a.fileName}</button>
                <span className="text-slate-500">{Math.max(1, Math.round(a.sizeBytes / 1024))} KB</span>
              </li>
            ))}
          </ul>
        )}
        {!closed && (
          <div>
            <input ref={fileInput} type="file" accept={ACCEPT} disabled={uploading} onChange={(e) => upload(e.target.files?.[0])} aria-label="Attach a screenshot or file" className="text-xs" />
            <p className="text-[11px] text-slate-500">Images, PDF or text, up to 2 MB each, at most 5.</p>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-jaman-border bg-white p-4 space-y-3">
        <h2 className="text-sm font-extrabold text-jaman-navy">Conversation</h2>
        {timeline.map((t) =>
          'event' in t ? (
            <p key={t.id} className="text-xs text-slate-500">
              {when(t.at)} · {t.event.type === 'CREATED' ? 'Ticket opened' : t.event.type === 'STATUS' ? `Status changed to ${STATUS_LABEL[t.event.toValue as SupportTicketStatus] ?? t.event.toValue}` : t.event.type === 'PRIORITY' ? `Priority set to ${t.event.toValue}` : t.event.type.toLowerCase()}
            </p>
          ) : (
            <div key={t.id} className={`rounded-xl p-3 text-sm ${t.comment!.authorType === 'RESTAURANT' ? 'bg-slate-50' : 'bg-sky-50'}`}>
              <div className="text-xs font-bold text-jaman-navy">
                {t.comment!.authorType === 'RESTAURANT' ? 'You' : `${t.comment!.authorName ?? 'JAMANVAAR support'} (support)`} <span className="font-medium text-slate-500">{when(t.at)}</span>
              </div>
              <div className="whitespace-pre-wrap">{t.comment!.body}</div>
            </div>
          )
        )}
        {closed ? (
          <p className="text-xs text-slate-500">This ticket is closed. Please raise a new ticket if the problem comes back.</p>
        ) : (
          <div className="flex gap-2">
            <input value={reply} onChange={(e) => setReply(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void send()} maxLength={5000} placeholder={ticket.status === 'RESOLVED' ? 'Still a problem? Reply to reopen this ticket' : 'Write a reply…'} className="flex-1 rounded-xl border border-jaman-border px-3 py-2 text-sm" />
            <button type="button" onClick={send} disabled={sending || !reply.trim()} className="inline-flex items-center gap-1 rounded-xl bg-jaman-navy px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
              <Send className="w-3.5 h-3.5" /> Send
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
