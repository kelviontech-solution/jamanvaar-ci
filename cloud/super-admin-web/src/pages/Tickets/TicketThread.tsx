import { useMemo, useRef, useState } from 'react';
import { Paperclip, Lock } from 'lucide-react';
import { api, ApiError } from '../../api/client';
import type { SupportTicketDetail } from '../../api/types';
import { Button, Input } from '../../components/ui';
import { absoluteTime } from '../../lib/relativeTime';

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain';

const EVENT_TEXT: Record<string, (from: string | null, to: string | null) => string> = {
  CREATED: () => 'opened the ticket',
  STATUS: (from, to) => `changed status from ${from ?? '?'} to ${to ?? '?'}`,
  PRIORITY: (from, to) => `changed priority from ${from ?? '?'} to ${to ?? '?'}`,
  ASSIGNEE: (from, to) => `changed assignee from ${from ?? 'Unassigned'} to ${to ?? 'Unassigned'}`,
  ATTACHMENT: (_from, to) => `attached ${to ?? 'a file'}`
};

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the file'));
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.readAsDataURL(file);
  });
}

const formatSize = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

/** The ticket's conversation: comments, internal notes and every change in one timeline, plus attachments. */
export function TicketThread({ ticket, onChanged, onError }: { ticket: SupportTicketDetail; onChanged: () => Promise<void>; onError: (message: string) => void }) {
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const timeline = useMemo(() => {
    const entries = [
      ...ticket.events.map((e) => ({ kind: 'event' as const, at: e.createdAt, id: `e-${e.id}`, e })),
      ...ticket.comments.map((c) => ({ kind: 'comment' as const, at: c.createdAt, id: `c-${c.id}`, c }))
    ];
    return entries.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  }, [ticket.events, ticket.comments]);

  async function post() {
    if (!body.trim()) return;
    setSaving(true);
    try {
      await api.post(`/api/v1/support-tickets/${ticket.id}/comments`, { body: body.trim(), internal });
      setBody('');
      setInternal(false);
      await onChanged();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Failed to add comment');
    } finally {
      setSaving(false);
    }
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      onError('Files can be at most 2 MB.');
      return;
    }
    setUploading(true);
    try {
      await api.post(`/api/v1/support-tickets/${ticket.id}/attachments`, { fileName: file.name, mimeType: file.type, dataBase64: await toBase64(file) });
      await onChanged();
    } catch (err) {
      onError(err instanceof ApiError ? err.issues?.map((i) => i.message).join(' ') || err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function open(attachmentId: string, fileName: string) {
    try {
      const file = await api.download(`/api/v1/support-tickets/${ticket.id}/attachments/${attachmentId}`);
      const url = URL.createObjectURL(file.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.filename ?? fileName;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Download failed');
    }
  }

  return (
    <div style={{ borderTop: '1px solid var(--jv-border)', paddingTop: 12, display: 'grid', gap: 12 }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Attachments</div>
        {ticket.attachments.length === 0 ? (
          <span className="muted" style={{ fontSize: 12 }}>None.</span>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
            {ticket.attachments.map((a) => (
              <li key={a.id} style={{ fontSize: 12.5, display: 'flex', gap: 8, alignItems: 'center' }}>
                <Paperclip className="w-3 h-3" />
                <button type="button" className="table-link" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', fontWeight: 600 }} onClick={() => open(a.id, a.fileName)}>
                  {a.fileName}
                </button>
                <span className="muted">{formatSize(a.sizeBytes)} · {a.uploadedByName ?? a.uploadedByType.toLowerCase()}</span>
              </li>
            ))}
          </ul>
        )}
        <div style={{ marginTop: 8 }}>
          <input ref={fileInput} type="file" accept={ACCEPT} onChange={(e) => upload(e.target.files?.[0])} disabled={uploading} aria-label="Attach a file" />
          <div className="muted" style={{ fontSize: 11 }}>Images, PDF or text, up to 2 MB each, at most 5 per ticket.</div>
        </div>
      </div>

      <div>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Conversation and history</div>
        <div style={{ display: 'grid', gap: 8, maxHeight: 260, overflowY: 'auto', marginBottom: 10 }}>
          {timeline.length === 0 ? (
            <span className="muted" style={{ fontSize: 12 }}>Nothing yet.</span>
          ) : (
            timeline.map((t) =>
              t.kind === 'event' ? (
                <div key={t.id} className="muted" style={{ fontSize: 12 }}>
                  {absoluteTime(t.at)} · <strong>{t.e.actorName ?? t.e.actorType.toLowerCase()}</strong> {(EVENT_TEXT[t.e.type] ?? (() => t.e.type.toLowerCase()))(t.e.fromValue, t.e.toValue)}
                </div>
              ) : (
                <div
                  key={t.id}
                  style={{
                    fontSize: 12.5,
                    borderRadius: 8,
                    padding: '8px 10px',
                    background: t.c.internal ? 'rgba(245, 158, 11, 0.12)' : t.c.authorType === 'RESTAURANT' ? 'rgba(59, 130, 246, 0.10)' : 'var(--jv-bg-muted)'
                  }}
                >
                  <strong>{t.c.authorName ?? t.c.author?.fullName ?? 'Unknown'}</strong>{' '}
                  {t.c.authorType === 'RESTAURANT' && <span className="muted" style={{ fontSize: 11 }}>(restaurant)</span>}{' '}
                  {t.c.internal && (
                    <span style={{ fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      <Lock className="w-3 h-3" /> Internal note
                    </span>
                  )}{' '}
                  <span className="muted" style={{ fontSize: 11 }}>{absoluteTime(t.at)}</span>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{t.c.body}</div>
                </div>
              )
            )
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Input value={body} onChange={(e) => setBody(e.target.value)} placeholder={internal ? 'Internal note (the restaurant will not see this)…' : 'Reply to the restaurant…'} />
          <Button variant="accent" onClick={post} disabled={saving || !body.trim()}>
            {internal ? 'Add note' : 'Post'}
          </Button>
        </div>
        <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12, marginTop: 6 }}>
          <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
          Internal note, not shown to the restaurant
        </label>
      </div>
    </div>
  );
}
