'use client';
import { useState } from 'react';
import { Modal } from './interactive';
import type { User } from '@/lib/registry-core';
import { subjectLabel } from '@/lib/subjects';

export type Dream = {
  id: number;
  user_id: number;
  text: string;
  points: number;
  date: string;
  subject: string;
};
type DreamDraft = { id?: number; text: string; points: number; date: string; subject: string };

export function AdminDreams({
  student,
  dreams,
  onChange,
  onClose,
  date,
  subject,
}: {
  student: User;
  dreams: Dream[];
  onChange: (dreams: Dream[]) => void;
  onClose: () => void;
  date: string;
  subject: string;
}) {
  const studentDreams = dreams.filter((dream) => dream.user_id === student.id);
  const newDraft = () => ({ text: '', points: 0, date, subject });
  const [draft, setDraft] = useState<DreamDraft | null>(studentDreams.length ? null : newDraft());
  const [deleting, setDeleting] = useState<Dream | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const author = `${student.first_name} ${student.last_name} · ${student.class_code}`;
  async function post(action: string, body: unknown) {
    const response = await fetch(`/api/admin/${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Operazione non riuscita.');
    return data;
  }
  function close() {
    if (!busy) onClose();
  }
  if (deleting)
    return (
      <Modal title="Elimina sogno" onClose={close}>
        <p>Rimuovere il sogno di {author} dal Dream Log?</p>
        <blockquote>{deleting.text}</blockquote>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <button
          className="button navy full"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              await post('dream-delete', { id: deleting.id });
              onChange(dreams.filter((dream) => dream.id !== deleting.id));
              setDeleting(null);
              setMessage('Sogno eliminato.');
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Operazione non riuscita.');
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Eliminazione…' : 'Conferma eliminazione'}
        </button>
      </Modal>
    );
  if (draft)
    return (
      <Modal title={draft.id ? 'Modifica sogno' : 'Aggiungi sogno'} onClose={close}>
        <p>
          <strong>{author}</strong>
        </p>
        <p>La frase sarà pubblicata nel Dream Log della home.</p>
        <p>
          Punti assegnati al {draft.date.split('-').reverse().join('/')} ·{' '}
          {subjectLabel(draft.subject) || 'Registro precedente'}.
        </p>
        <form
          className="auth-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            try {
              const { dream } = await post('dream-save', { ...draft, user_id: student.id });
              onChange(
                draft.id ? dreams.map((d) => (d.id === dream.id ? dream : d)) : [dream, ...dreams],
              );
              setMessage(draft.id ? 'Sogno aggiornato.' : 'Sogno pubblicato.');
              setDraft(null);
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Operazione non riuscita.');
            } finally {
              setBusy(false);
            }
          }}
        >
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <label>
            Sogno
            <textarea
              aria-label="Sogno"
              required
              maxLength={1000}
              rows={5}
              disabled={busy}
              value={draft.text}
              onChange={(e) => setDraft({ ...draft, text: e.target.value })}
            />
          </label>
          <label>
            Punti sogno
            <select
              aria-label="Punti sogno"
              value={draft.points}
              disabled={busy}
              onChange={(e) => setDraft({ ...draft, points: Number(e.target.value) })}
            >
              <option value={2}>+2</option>
              <option value={4}>+4</option>
              <option value={0}>0</option>
            </select>
          </label>
          <button className="button navy full" disabled={busy}>
            {busy ? 'Salvataggio…' : 'Salva sogno'}
          </button>
        </form>
      </Modal>
    );
  return (
    <Modal title="Sogni dello studente" onClose={close}>
      <p>
        <strong>{author}</strong>
      </p>
      {message ? (
        <p className="form-success" role="status">
          {message}
        </p>
      ) : null}
      <button
        className="button outline"
        onClick={() => {
          setError('');
          setDraft(newDraft());
        }}
      >
        Aggiungi sogno
      </button>
      <div className="mystery-toggle-list">
        {studentDreams.map((dream) => (
          <article className="mystery-admin-card" key={dream.id}>
            <p style={{ whiteSpace: 'pre-wrap' }}>{dream.text}</p>
            <small>
              {dream.points ? `+${dream.points}` : '0'} punti
              {dream.date
                ? ` · ${dream.date.split('-').reverse().join('/')} · ${subjectLabel(dream.subject) || 'Registro precedente'}`
                : ''}
            </small>
            <div className="hero-actions">
              <button
                className="button outline"
                aria-label={`Modifica sogno di ${author}`}
                onClick={() => {
                  setError('');
                  setDraft({
                    id: dream.id,
                    text: dream.text,
                    points: dream.points,
                    date: dream.date || date,
                    subject: dream.date ? dream.subject : subject,
                  });
                }}
              >
                Modifica
              </button>
              <button
                className="button outline"
                aria-label={`Elimina sogno di ${author}`}
                onClick={() => {
                  setError('');
                  setDeleting(dream);
                }}
              >
                Elimina
              </button>
            </div>
          </article>
        ))}
      </div>
      {!studentDreams.length ? <p>Nessun sogno pubblicato per questo studente.</p> : null}
    </Modal>
  );
}
