'use client';
import { useEffect, useState } from 'react';
import { Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { Modal } from './interactive';
import { DEFAULT_SCORING, type ScoringSettings } from '@/lib/point-rules';
import type { Crew, Grade, Route, User } from '@/lib/registry-core';
import type { PointMovement } from '@/lib/student-points';

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
const number = (n: number) => new Intl.NumberFormat('it-IT').format(n);
const fields = (form: HTMLFormElement) => Object.fromEntries(new FormData(form));

export function BulkGrades({
  users,
  date: initialDate,
  settings,
  onClose,
  onSaved,
}: {
  users: User[];
  date: string;
  settings: ScoringSettings;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(initialDate);
  const [type, setType] = useState<'verifica' | 'progetto'>('verifica');
  const [description, setDescription] = useState('');
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const count = users.filter((u) => (drafts[u.id] || '').trim()).length;
  const [existing, setExisting] = useState<Grade[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setSelectedIds([]);
    setConfirmDelete(false);
    fetch(`/api/data?date=${encodeURIComponent(date)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Impossibile caricare i voti.');
        return response.json();
      })
      .then((result) => {
        if (active) setExisting(result.grades || []);
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, [date, type, revision]);
  const visibleGrades = existing.filter(
    (grade) => grade.type === type && users.some((user) => user.id === grade.user_id),
  );

  return (
    <Modal
      title="Voti della classe"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <p className="bulk-grades-intro">Registra una prova per tutta la classe. Compila solo i voti da assegnare.</p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError('');
          try {
            await post('grade-bulk', {
              date,
              type,
              description,
              entries: users
                .filter((u) => (drafts[u.id] || '').trim())
                .map((u) => ({ user_id: u.id, grade: Number(drafts[u.id].replace(',', '.')) })),
            });
            onSaved();
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy} className="management-fieldset bulk-grades-form">
          <div className="bulk-grades-section-heading"><span>01</span><div><h3>Dettagli della prova</h3><p>Questi dati saranno associati a tutti i voti inseriti.</p></div></div>
          <div className="grade-form bulk-grades-details">
            <label>
              Data
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </label>
            <label>
              Tipologia
              <select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
                <option value="verifica">Verifica</option>
                <option value="progetto">Progetto</option>
              </select>
            </label>
          </div>
          <label className="bulk-grades-description">Descrizione della prova
            <input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={250} placeholder="Es. Verifica sulle reti" required />
          </label>
          <div className="bulk-grades-section-heading bulk-grades-students-heading"><span>02</span><div><h3>Voti degli studenti</h3><p>Usa Tab per passare al voto successivo; lascia vuoti i campi non necessari.</p></div></div>
          <div className="table-wrap bulk-grades-table">
            <table>
              <thead>
                <tr>
                  <th>Studente</th>
                  <th>Voto</th>
                  <th>Punti</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <th scope="row">
                      {u.last_name} {u.first_name}
                    </th>
                    <td>
                      <input
                        className="bulk-grade-input"
                        aria-label={`Voto di ${u.first_name} ${u.last_name}`}
                        inputMode="decimal"
                        type="text"
                        value={drafts[u.id] || ''}
                        onChange={(e) => setDrafts((old) => ({ ...old, [u.id]: e.target.value }))}
                        placeholder="—"
                      />
                    </td>
                    <td>
                      {drafts[u.id] && Number.isFinite(Number(drafts[u.id].replace(',', '.')))
                        ? number(
                            Math.round(
                              Number(drafts[u.id].replace(',', '.')) * settings.grades[type],
                            ),
                          )
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {error ? (
            <p role="alert" className="form-error">
              {error}
            </p>
          ) : null}
          <div className="bulk-grades-footer">
            <span aria-live="polite">{count} {count === 1 ? 'voto inserito' : 'voti inseriti'}</span>
            <button className="button navy" disabled={!count || busy} type="submit">
              <Save size={16} />
              {busy ? 'Salvataggio…' : 'Salva voti'}
            </button>
          </div>
        </fieldset>
      </form>
      <details className="management-form bulk-grades-delete" aria-label="Eliminazione voti della classe">
        <summary>Gestisci voti già inseriti</summary>
        <p>
          Voti di {type} del {date}, limitati agli studenti visualizzati.
        </p>
        {visibleGrades.length ? (
          <>
            <label>
              <input
                type="checkbox"
                checked={selectedIds.length === visibleGrades.length}
                onChange={(e) => {
                  setSelectedIds(e.target.checked ? visibleGrades.map((grade) => grade.id) : []);
                  setConfirmDelete(false);
                }}
              />{' '}
              Seleziona tutti
            </label>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Seleziona</th>
                    <th>Studente</th>
                    <th>Voto</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleGrades.map((grade) => {
                    const student = users.find((user) => user.id === grade.user_id)!;
                    return (
                      <tr key={grade.id}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Seleziona voto ${grade.grade} di ${student.first_name} ${student.last_name}`}
                            checked={selectedIds.includes(grade.id)}
                            onChange={(e) => {
                              setSelectedIds((old) =>
                                e.target.checked
                                  ? [...old, grade.id]
                                  : old.filter((id) => id !== grade.id),
                              );
                              setConfirmDelete(false);
                            }}
                          />
                        </td>
                        <td>
                          {student.last_name} {student.first_name}
                        </td>
                        <td>{grade.grade}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {confirmDelete ? (
              <>
                <button
                  type="button"
                  className="button navy"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError('');
                    try {
                      await post('grade-delete-bulk', { ids: selectedIds });
                      setRevision((old) => old + 1);
                      onSaved();
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Conferma eliminazione di {selectedIds.length} voti
                </button>{' '}
                <button type="button" onClick={() => setConfirmDelete(false)}>
                  Annulla
                </button>
              </>
            ) : (
              <button
                type="button"
                className="button outline"
                disabled={!selectedIds.length || busy}
                onClick={() => setConfirmDelete(true)}
              >
                Elimina voti selezionati
              </button>
            )}
          </>
        ) : (
          <p>Nessun voto per data, tipo e studenti selezionati.</p>
        )}
      </details>
    </Modal>
  );
}

type PointsData = { movements: PointMovement[]; grades: Grade[]; total: number };
export function StudentPointsDialog({
  student,
  date: initialDate,
  admin = false,
  initialTab = 'points',
  onClose,
  onChanged,
}: {
  student: Pick<User, 'id' | 'first_name' | 'last_name'>;
  date: string;
  admin?: boolean;
  initialTab?: 'points' | 'grades';
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [tab, setTab] = useState(initialTab);
  const [data, setData] = useState<PointsData | null>(null);
  const [editing, setEditing] = useState<Grade | null>(null);
  const [editingMovement, setEditingMovement] = useState<PointMovement | null>(null);
  const [deletingMovement, setDeletingMovement] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    fetch(`/api/data?student=${student.id}`)
      .then(async (r) => {
        const result = await r.json();
        if (!r.ok) throw new Error(result.error);
        return result;
      })
      .then((result) => {
        if (live) setData(result);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [student.id, revision]);
  async function mutate(action: string, body: unknown) {
    setBusy(true);
    setError('');
    try {
      await post(action, body);
      setEditing(null);
      setDeleting(null);
      setRevision((r) => r + 1);
      onChanged?.();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={`Dettaglio punti · ${student.last_name} ${student.first_name}`}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {error ? (
        <p role="alert" className="form-error">
          {error}
        </p>
      ) : null}
      {data ? (
        <>
          <p className="points-total">
            Totale: <strong>{number(data.total)} punti</strong>
          </p>
          <div
            className="management-tabs"
            role="tablist"
            aria-label="Dettagli studente"
            onKeyDown={(e) => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
              e.preventDefault();
              const next =
                e.key === 'Home'
                  ? 'points'
                  : e.key === 'End'
                    ? 'grades'
                    : tab === 'points'
                      ? 'grades'
                      : 'points';
              setTab(next);
              e.currentTarget.querySelector<HTMLButtonElement>(`#${next}-tab`)?.focus();
            }}
          >
            <button
              type="button"
              role="tab"
              id="points-tab"
              aria-controls="points-panel"
              aria-selected={tab === 'points'}
              tabIndex={tab === 'points' ? 0 : -1}
              onClick={() => setTab('points')}
            >
              Movimenti
            </button>
            <button
              type="button"
              role="tab"
              id="grades-tab"
              aria-controls="grades-panel"
              aria-selected={tab === 'grades'}
              tabIndex={tab === 'grades' ? 0 : -1}
              onClick={() => setTab('grades')}
            >
              Voti
            </button>
          </div>
          {tab === 'points' ? (
            <div role="tabpanel" id="points-panel" aria-labelledby="points-tab">
              {data.movements.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Voce</th>
                        <th>Punti</th>
                        {admin ? <th>Azioni</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {data.movements.map((m) => (
                        <tr key={m.id}>
                          <td>
                            {m.date
                              ? new Date(`${m.date}T12:00:00`).toLocaleDateString('it-IT')
                              : 'Storico'}
                          </td>
                          <td>{m.description}</td>
                          <td>
                            {m.points > 0 ? '+' : ''}
                            {number(m.points)}
                          </td>
                          {admin ? (
                            <td>
                              <div className="management-actions">
                                <button
                                  type="button"
                                  className="table-action"
                                  onClick={() => {
                                    if (m.id.startsWith('g')) {
                                      setEditing(
                                        data.grades.find(
                                          (grade) => grade.id === Number(m.id.slice(1)),
                                        ) || null,
                                      );
                                      setTab('grades');
                                    } else setEditingMovement(m);
                                  }}
                                >
                                  Modifica
                                </button>
                                {m.id.startsWith('g') ? null : deletingMovement === m.id ? (
                                  <>
                                    <button
                                      type="button"
                                      className="table-action"
                                      disabled={busy}
                                      onClick={async () => {
                                        if (
                                          await mutate('movement-delete', {
                                            movement: m.id,
                                            user_id: student.id,
                                          })
                                        )
                                          setDeletingMovement(null);
                                      }}
                                    >
                                      Conferma eliminazione
                                    </button>
                                    <button
                                      type="button"
                                      className="table-action"
                                      onClick={() => setDeletingMovement(null)}
                                    >
                                      Annulla
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    className="table-action"
                                    onClick={() => setDeletingMovement(m.id)}
                                  >
                                    Elimina
                                  </button>
                                )}
                              </div>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p>Nessun movimento registrato.</p>
              )}
              {admin && editingMovement ? (
                <form
                  className="management-form"
                  key={editingMovement.id}
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const values = fields(event.currentTarget);
                    if (
                      await mutate('movement-update', {
                        movement: editingMovement.id,
                        user_id: student.id,
                        date: values.date,
                        description: values.description,
                        points: Number(values.points),
                      })
                    )
                      setEditingMovement(null);
                  }}
                >
                  <h3>Modifica movimento</h3>
                  <fieldset disabled={busy} className="management-fieldset">
                    <label className="modal-field">
                      Data
                      <input
                        type="date"
                        name="date"
                        defaultValue={editingMovement.date}
                        required
                        readOnly={editingMovement.id.startsWith('d')}
                      />
                    </label>
                    <label className="modal-field">
                      Voce
                      <input
                        name="description"
                        defaultValue={
                          editingMovement.editableDescription || editingMovement.description
                        }
                        maxLength={250}
                        required
                        readOnly={!editingMovement.id.startsWith('e')}
                      />
                    </label>
                    <label className="modal-field">
                      Punti
                      <input
                        name="points"
                        type="number"
                        step="1"
                        min="-2000000000"
                        max="2000000000"
                        defaultValue={editingMovement.points}
                        required
                      />
                    </label>
                    {editingMovement.id.startsWith('d') ? (
                      <p>
                        Per le voci del registro i punti devono rispettare i valori configurati per
                        quella voce.
                      </p>
                    ) : null}
                    <div className="management-actions">
                      <button className="button navy" type="submit">
                        Salva movimento
                      </button>
                      <button
                        className="button outline"
                        type="button"
                        onClick={() => setEditingMovement(null)}
                      >
                        Annulla
                      </button>
                    </div>
                  </fieldset>
                </form>
              ) : null}
              {admin ? (
                <form
                  className="management-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const values = fields(form);
                    if (
                      await mutate('extra-points', {
                        user_id: student.id,
                        date: values.date,
                        reason: values.reason,
                        points: Number(values.points),
                      })
                    )
                      form.reset();
                  }}
                >
                  <h3>Aggiungi punti extra</h3>
                  <fieldset disabled={busy} className="management-fieldset">
                    <label className="modal-field">
                      Data
                      <input name="date" type="date" defaultValue={initialDate} required />
                    </label>
                    <label className="modal-field">
                      Motivazione
                      <input name="reason" maxLength={250} required />
                    </label>
                    <label className="modal-field">
                      Punti extra
                      <input
                        name="points"
                        type="number"
                        step="1"
                        min="-1000000"
                        max="1000000"
                        required
                      />
                    </label>
                    <button className="button navy" type="submit">
                      <Plus size={16} />
                      Aggiungi punti extra
                    </button>
                  </fieldset>
                </form>
              ) : null}
            </div>
          ) : (
            <div role="tabpanel" id="grades-panel" aria-labelledby="grades-tab">
              {data.grades.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Tipologia</th>
                        <th>Descrizione</th>
                        <th>Voto</th>
                        <th>Punti</th>
                        <th>Arma</th>
                        {admin ? <th>Azioni</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {data.grades.map((g) => (
                        <tr key={g.id}>
                          <td>{g.date}</td>
                          <td>{g.type}</td>
                          <td>{g.description || '—'}</td>
                          <td>{g.grade}</td>
                          <td>{number(g.points)}</td>
                          <td>
                            {admin ? (
                              <label>
                                <span className="sr-only">
                                  Arma collegata al voto {g.grade} del {g.date}
                                </span>
                                <select
                                  aria-label={`Arma collegata al voto ${g.grade} del ${g.date}`}
                                  value={g.weapon || ''}
                                  disabled={busy}
                                  onChange={(event) =>
                                    mutate('grade-weapon', {
                                      id: g.id,
                                      user_id: student.id,
                                      weapon: event.target.value,
                                    })
                                  }
                                >
                                  <option value="">Nessuna</option>
                                  <option value="Pluton">Pluton ×2</option>
                                </select>
                              </label>
                            ) : g.weapon ? (
                              'Pluton ×2'
                            ) : (
                              '—'
                            )}
                          </td>
                          {admin ? (
                            <td>
                              <div className="management-actions">
                                <button
                                  type="button"
                                  aria-label={`Modifica voto ${g.grade} del ${g.date}`}
                                  disabled={busy}
                                  onClick={() => {
                                    setEditing(g);
                                    setDeleting(null);
                                  }}
                                >
                                  <Pencil size={16} />
                                </button>
                                <button
                                  type="button"
                                  aria-label={`Elimina voto ${g.grade} del ${g.date}`}
                                  disabled={busy}
                                  onClick={() => setDeleting(g.id)}
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p>Nessun voto registrato.</p>
              )}
              {deleting !== null ? (
                <div className="management-confirm" role="alert">
                  <p>Eliminare questo voto e i relativi punti?</p>
                  <button
                    className="button navy"
                    disabled={busy}
                    onClick={() => mutate('grade-delete', { id: deleting })}
                  >
                    Conferma eliminazione voto
                  </button>
                  <button
                    className="button outline"
                    disabled={busy}
                    onClick={() => setDeleting(null)}
                  >
                    Annulla
                  </button>
                </div>
              ) : null}
              {admin ? (
                <form
                  className="management-form"
                  key={editing?.id || 'new'}
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const values = fields(e.currentTarget);
                    await mutate(editing ? 'grade-update' : 'grade', {
                      id: editing?.id,
                      user_id: student.id,
                      date: values.date,
                      type: values.type,
                      grade: Number(values.grade),
                    });
                  }}
                >
                  <h3>{editing ? 'Modifica voto' : 'Aggiungi voto'}</h3>
                  <fieldset disabled={busy} className="management-fieldset">
                    <div className="grade-form">
                      <label>
                        Data
                        <input
                          name="date"
                          type="date"
                          defaultValue={editing?.date || initialDate}
                          required
                        />
                      </label>
                      <label>
                        Tipologia
                        <select name="type" defaultValue={editing?.type || 'verifica'}>
                          <option value="verifica">Verifica</option>
                          <option value="progetto">Progetto</option>
                        </select>
                      </label>
                      <label>
                        Voto
                        <input
                          name="grade"
                          aria-label="Voto"
                          type="number"
                          min="2"
                          max="10"
                          step="any"
                          defaultValue={editing?.grade ?? 6}
                          required
                        />
                      </label>
                    </div>
                    <button className="button navy" type="submit">
                      <Save size={16} />
                      {editing ? 'Salva modifica voto' : 'Aggiungi voto'}
                    </button>
                    {editing ? (
                      <button
                        className="button outline"
                        type="button"
                        onClick={() => setEditing(null)}
                      >
                        Annulla
                      </button>
                    ) : null}
                  </fieldset>
                </form>
              ) : null}
            </div>
          )}
        </>
      ) : !error ? (
        <p role="status">Caricamento movimenti…</p>
      ) : (
        <button
          className="button outline"
          onClick={() => {
            setError('');
            setRevision((r) => r + 1);
          }}
        >
          Riprova
        </button>
      )}
    </Modal>
  );
}

export function UserEditor({
  user,
  crews,
  onChange,
  onDelete,
}: {
  user: User;
  crews: Crew[];
  onChange: (user: User) => void;
  onDelete: (id: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [cls, setCls] = useState(user.class_code);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="user-editor">
      <div className="management-actions">
        <button
          type="button"
          className="table-action"
          onClick={() => {
            setEditing(!editing);
            setDeleting(false);
          }}
        >
          <Pencil size={15} />
          Modifica utente
        </button>
        <button type="button" className="table-action" onClick={() => setDeleting(true)}>
          <Trash2 size={15} />
          Elimina utente
        </button>
      </div>
      {editing ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            const values = fields(e.currentTarget);
            try {
              const result = await post('user-update', {
                ...values,
                id: user.id,
                crew_id: values.crew_id ? Number(values.crew_id) : null,
              });
              onChange(result.user);
              setEditing(false);
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset disabled={busy} className="management-fieldset management-form">
            <label className="modal-field">
              Nome
              <input name="first_name" defaultValue={user.first_name} required maxLength={100} />
            </label>
            <label className="modal-field">
              Cognome
              <input name="last_name" defaultValue={user.last_name} required maxLength={100} />
            </label>
            <label className="modal-field">
              Email
              <input name="email" type="email" defaultValue={user.email} required />
            </label>
            {user.role === 'student' ? (
              <>
                <label className="modal-field">
                  Classe
                  <input
                    name="class_code"
                    value={cls}
                    onChange={(e) => setCls(e.target.value)}
                    required
                    maxLength={20}
                  />
                </label>
                <label className="modal-field">
                  Ciurma
                  <select
                    name="crew_id"
                    key={cls}
                    defaultValue={cls === user.class_code ? user.crew_id || '' : ''}
                  >
                    <option value="">Senza ciurma</option>
                    {crews
                      .filter((c) => c.class_code === cls)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </label>
              </>
            ) : null}
            <label className="modal-field">
              Ruoli
              <input name="roles" defaultValue={user.roles} maxLength={120} />
            </label>
            <button className="button navy" type="submit">
              <Save size={16} />
              Salva utente
            </button>
          </fieldset>
        </form>
      ) : null}
      {deleting ? (
        <div className="management-confirm">
          <p>
            Eliminare {user.first_name} {user.last_name}? Verranno eliminati anche voti,
            registrazioni e punti di questo utente.
          </p>
          <button
            className="button navy"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                await post('user-delete', { id: user.id });
                onDelete(user.id);
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Conferma eliminazione utente
          </button>
          <button className="button outline" disabled={busy} onClick={() => setDeleting(false)}>
            Annulla
          </button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="form-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function RouteCreator({
  classCode,
  onCreated,
}: {
  classCode: string;
  onCreated: (route: Route) => void;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <details className="management-form">
      <summary>Aggiungi rotta</summary>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const values = fields(form);
          setBusy(true);
          setError('');
          try {
            const result = await post('route-create', {
              ...values,
              class_code: classCode,
              year: Number(values.year),
              ordinal: Number(values.ordinal),
            });
            onCreated(result.route);
            form.reset();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy} className="management-fieldset">
          <label className="modal-field">
            Nome rotta
            <input name="name" required maxLength={120} />
          </label>
          <div className="grade-form">
            <label>
              Anno
              <input name="year" type="number" min="1" max="10" defaultValue="1" required />
            </label>
            <label>
              Numero rotta
              <input name="ordinal" type="number" min="1" max="100" defaultValue="1" required />
            </label>
          </div>
          <div className="grade-form">
            <label>
              Dal
              <input name="start_date" type="date" required />
            </label>
            <label>
              Al
              <input name="end_date" type="date" required />
            </label>
          </div>
          {error ? (
            <p role="alert" className="form-error">
              {error}
            </p>
          ) : null}
          <button className="button navy" type="submit">
            <Plus size={16} />
            Crea rotta
          </button>
        </fieldset>
      </form>
    </details>
  );
}

const scoringLabels: Record<string, string> = {
  absence: 'Assenza (A)',
  absencePlus: 'Assenza penalizzata (A+)',
  phone: 'Telefono',
  bug: 'Punti per Bug',
  anxiety: 'Punti per episodio di ansia',
  mystery: 'Mistero',
  multiverse: 'Punti per Multiverso',
  verifica: 'Moltiplicatore verifica',
  progetto: 'Moltiplicatore progetto',
};
export function ScoringDialog({
  settings,
  onClose,
  onSaved,
}: {
  settings: ScoringSettings;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState(settings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <Modal
      title="Impostazioni punteggi"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <p>
        Le modifiche ricalcolano le voci giornaliere, anche quelle già registrate. Voti, multiversi,
        frutti, importazioni e punti extra già assegnati conservano i loro punti; i nuovi
        inserimenti usano i valori aggiornati.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            await post('point-rules', { settings: draft });
            onSaved();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy} className="management-fieldset">
          {(['daily', 'grades'] as const).map((group) => (
            <div key={group}>
              {Object.entries(draft[group]).map(([key, value]) => (
                <label className="modal-field" key={key}>
                  {scoringLabels[key]}
                  <input
                    type="number"
                    step="1"
                    min={group === 'grades' || key === 'multiverse' ? 1 : -100000}
                    max="100000"
                    value={value}
                    required
                    onChange={(e) =>
                      setDraft(
                        (old) =>
                          ({
                            ...old,
                            [group]: {
                              ...old[group],
                              [key]: e.target.value === '' ? '' : Number(e.target.value),
                            },
                          }) as ScoringSettings,
                      )
                    }
                  />
                </label>
              ))}
            </div>
          ))}
          {error ? (
            <p role="alert" className="form-error">
              {error}
            </p>
          ) : null}
          <button className="button navy" type="submit">
            <Save size={16} />
            Salva punteggi
          </button>
          <button
            className="button outline"
            type="button"
            onClick={() => setDraft(DEFAULT_SCORING)}
          >
            Ripristina valori predefiniti
          </button>
        </fieldset>
      </form>
    </Modal>
  );
}
