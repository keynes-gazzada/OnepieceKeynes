'use client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { PointMovement } from '@/lib/student-points';

export function MultiverseEntries({
  studentId,
  initialDate,
  points,
  onChanged,
}: {
  studentId: number;
  initialDate: string;
  points: number;
  onChanged: () => void;
}) {
  const [items, setItems] = useState<PointMovement[]>([]);
  const [date, setDate] = useState(initialDate);
  const [description, setDescription] = useState('');
  const [editing, setEditing] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch(`/api/data?student=${studentId}`);
    if (!response.ok) throw new Error('Impossibile caricare i multiversi.');
    const data = await response.json();
    setItems((data.movements as PointMovement[]).filter((entry) => entry.multiverse));
  }, [studentId]);
  useEffect(() => {
    load().catch((error) => setError(error.message));
  }, [load]);
  async function send(operation: 'create' | 'update' | 'delete', id?: number) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/admin/multiverse-entry', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ operation, id, user_id: studentId, date, description }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      await load();
      onChanged();
      setEditing(null);
      setDeleting(null);
      setDescription('');
      setDate(initialDate);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="management-form">
      <h3>Storico multiversi</h3>
      <p>
        Ogni attività aggiunge {points} punti. Puoi registrare più attività con date e descrizioni
        diverse.
      </p>
      {items.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Descrizione</th>
                <th>Punti</th>
                <th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const id = Number(item.id.slice(1));
                return (
                  <tr key={item.id}>
                    <td>{item.date}</td>
                    <td>{item.description.replace(/^Multiverso · /, '')}</td>
                    <td>{item.points}</td>
                    <td>
                      <div className="management-actions">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setEditing(id);
                            setDate(item.date);
                            setDescription(
                              (item.editableDescription || item.description).replace(
                                /^Multiverso · /,
                                '',
                              ),
                            );
                          }}
                        >
                          Modifica
                        </button>
                        {deleting === id ? (
                          <>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => send('delete', id)}
                            >
                              Conferma eliminazione
                            </button>
                            <button type="button" onClick={() => setDeleting(null)}>
                              Annulla
                            </button>
                          </>
                        ) : (
                          <button type="button" disabled={busy} onClick={() => setDeleting(id)}>
                            Elimina
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p>Nessuna attività registrata.</p>
      )}
      <form
        key={editing || 'new'}
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          send(editing ? 'update' : 'create', editing || undefined);
        }}
      >
        <h3>{editing ? 'Modifica multiverso' : 'Aggiungi multiverso'}</h3>
        <label className="modal-field">
          Data attività
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            required
          />
        </label>
        <label className="modal-field">
          Descrizione attività
          <input
            value={description}
            maxLength={200}
            onChange={(event) => setDescription(event.target.value)}
            required
          />
        </label>
        {error ? <p role="alert">{error}</p> : null}
        <div className="management-actions">
          <button className="button navy" disabled={busy}>
            {editing ? 'Salva multiverso' : 'Aggiungi multiverso'}
          </button>
          {editing ? (
            <button
              type="button"
              className="button outline"
              onClick={() => {
                setEditing(null);
                setDescription('');
                setDate(initialDate);
              }}
            >
              Annulla
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
