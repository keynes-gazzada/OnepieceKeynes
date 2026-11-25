'use client';
import { useEffect, useState } from 'react';
import { Modal } from './interactive';
import type { PointMovement } from '@/lib/student-points';

export function ClueAward({
  studentId,
  studentName,
  crewName,
  date,
  onClose,
  onSaved,
}: {
  studentId: number;
  studentName: string;
  crewName: string;
  date: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [entries, setEntries] = useState<PointMovement[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    fetch(`/api/data?student=${studentId}`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Impossibile caricare gli indizi.');
        return response.json();
      })
      .then((data) => {
        if (active) setEntries((data.movements as PointMovement[]).filter((item) => item.clue));
      })
      .catch((error) => {
        if (active) setMessage(error.message);
      });
    return () => {
      active = false;
    };
  }, [studentId, version]);
  return (
    <Modal title={`Indizi · ${studentName}`} onClose={onClose}>
      <p>
        L’indizio e i punti scelti vengono assegnati a tutti i membri attuali della ciurma{' '}
        <strong>{crewName}</strong>.
      </p>
      {entries.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Indizio</th>
                <th>Punti</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.date}</td>
                  <td>{entry.description}</td>
                  <td>{entry.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>Nessun indizio assegnato.</p>
      )}
      <form
        className="management-form"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const values = new FormData(form);
          setBusy(true);
          setMessage('');
          try {
            const response = await fetch('/api/admin/clue-award', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                user_id: studentId,
                date: values.get('date'),
                description: values.get('description'),
                points: Number(values.get('points')),
              }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);
            form.reset();
            setMessage(`Indizio assegnato a ${result.count} studenti.`);
            setVersion((value) => value + 1);
            onSaved();
          } catch (error) {
            setMessage((error as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <h3>Assegna un indizio</h3>
        <label className="modal-field">
          Data
          <input type="date" name="date" defaultValue={date} required />
        </label>
        <label className="modal-field">
          Descrizione indizio
          <input name="description" maxLength={200} required />
        </label>
        <label className="modal-field">
          Punti per ciascuno
          <input name="points" type="number" min="0" max="1000000" step="1" required />
        </label>
        <p>Indica i punti previsti per questo indizio.</p>
        <button className="button navy" disabled={busy}>
          Assegna alla ciurma
        </button>
        {message ? <p role="status">{message}</p> : null}
      </form>
    </Modal>
  );
}
