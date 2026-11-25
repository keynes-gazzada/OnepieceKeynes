'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Download, FileUp, Plus, Trash2 } from 'lucide-react';
import { Modal } from './interactive';
import {
  planningFields,
  type PlanningKind,
  type PlanningRow,
  type PlanningValues,
} from '@/lib/planning';

const empty = (kind: PlanningKind) =>
  Object.fromEntries(planningFields[kind].map(([name]) => [name, '']));

function PlanningTable({
  kind,
  rows,
  reload,
}: {
  kind: PlanningKind;
  rows: PlanningRow[];
  reload: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [editingField, setEditingField] = useState('');
  const [editingVersion, setEditingVersion] = useState<string | null>(null);
  const [values, setValues] = useState<PlanningValues>(() => empty(kind));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [remove, setRemove] = useState<number | null>(null);
  const label = kind === 'planning' ? 'Planning' : 'Studenti';
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 25;
  const query = search.trim().toLocaleLowerCase('it-IT');
  const filtered = query
    ? rows.filter((row) =>
        planningFields[kind].some(([name]) =>
          (row.values[name] || '').toLocaleLowerCase('it-IT').includes(query),
        ),
      )
    : rows;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages - 1);
  const visibleRows = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/planning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          action: editing === 'new' ? 'create' : 'update',
          id: editing,
          expected: editingVersion,
          values,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      await reload();
      setEditing(null);
      setMessage('Riga salvata.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function deleteRow(id: number) {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/planning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, action: 'delete', id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      await reload();
      setRemove(null);
      setMessage('Riga eliminata.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const editor =
    editing !== null ? (
      <form className="planning-form" onSubmit={save}>
        {kind === 'planning' || editing === 'new' ? (
          <h3>{editing === 'new' ? 'Nuova riga' : 'Modifica riga'}</h3>
        ) : null}
        {kind === 'students' && typeof editing === 'number' && message ? (
          <p role="alert" className="form-error">
            {message}
          </p>
        ) : null}
        <div className="planning-fields">
          {planningFields[kind]
            .filter(
              ([name]) => kind !== 'students' || name !== 'entry' || values.entryExit !== 'Uscita',
            )
            .filter(
              ([name]) => kind !== 'students' || name !== 'exit' || values.entryExit !== 'Entrata',
            )
            .map(([name, title, type]) => (
              <label key={name}>
                {title}
                {kind === 'students' && name === 'entryExit' ? (
                  <select
                    value={values[name] || ''}
                    onChange={(event) =>
                      setValues((old) => ({ ...old, [name]: event.target.value }))
                    }
                  >
                    <option value="">Nessuna selezione</option>
                    <option value="Entrata">Entrata</option>
                    <option value="Uscita">Uscita</option>
                    {values[name] && !['Entrata', 'Uscita'].includes(values[name]) ? (
                      <option value={values[name]}>{values[name]}</option>
                    ) : null}
                  </select>
                ) : kind === 'students' && name === 'lessonHour' ? (
                  <select
                    value={values[name] || ''}
                    onChange={(event) =>
                      setValues((old) => ({ ...old, [name]: event.target.value }))
                    }
                  >
                    <option value="">Seleziona l’ora</option>
                    {Array.from({ length: 8 }, (_, index) => (
                      <option key={index + 1} value={String(index + 1)}>
                        {index + 1}ª ora
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={type}
                    value={values[name] || ''}
                    required={
                      kind === 'planning'
                        ? name === 'date'
                        : name === 'classCode' || name === 'student'
                    }
                    maxLength={type === 'text' ? (name === 'notes' ? 2000 : 250) : undefined}
                    onChange={(event) =>
                      setValues((old) => ({ ...old, [name]: event.target.value }))
                    }
                  />
                )}
              </label>
            ))}
        </div>
        <div className="planning-form-actions">
          <button className="button navy small" disabled={busy}>
            Salva riga
          </button>
          <button
            className="button outline small"
            type="button"
            disabled={busy}
            onClick={() => setEditing(null)}
          >
            Annulla
          </button>
        </div>
      </form>
    ) : null;
  return (
    <section className="planning-section" aria-labelledby={`${kind}-title`}>
      <div className="planning-header">
        <div>
          <h2 id={`${kind}-title`}>{label}</h2>
          <p>
            {rows.length} {rows.length === 1 ? 'riga' : 'righe'}
          </p>
        </div>
        <button
          className="button navy small"
          type="button"
          onClick={() => {
            setValues(empty(kind));
            setEditing('new');
            setEditingVersion(null);
            setMessage('');
          }}
        >
          <Plus size={16} /> Aggiungi riga
        </button>
      </div>
      <div className="planning-tools">
        <a className="button outline small" href={`/api/planning?export=1&kind=${kind}`}>
          <Download size={16} /> Scarica Excel / modello
        </a>
        <label className="button outline small planning-upload">
          <FileUp size={16} /> Importa Excel
          <input
            type="file"
            accept=".xlsx"
            disabled={busy}
            aria-label={`Importa Excel ${label}`}
            onChange={async (event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (!file) return;
              const form = new FormData();
              form.set('kind', kind);
              form.set('file', file);
              setBusy(true);
              setMessage('');
              try {
                const response = await fetch('/api/planning', { method: 'POST', body: form });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error);
                await reload();
                setMessage(`${result.count} righe importate.`);
              } catch (error) {
                setMessage((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
      </div>
      <p className="planning-hint">
        {kind === 'planning'
          ? 'L’importazione aggiunge le righe delle lezioni.'
          : 'L’importazione aggiorna il registro e le schede degli studenti già presenti.'}
      </p>
      <p className="planning-hint">Scorri la tabella lateralmente per vedere tutte le colonne.</p>
      {message ? (
        <p role="status" className="admin-message">
          {message}
        </p>
      ) : null}
      {editing === 'new' ? editor : null}
      {kind === 'students' && remove !== null ? (
        <Modal
          title="Elimina studente dal Planning"
          onClose={() => {
            if (!busy) setRemove(null);
          }}
        >
          <p>
            Sei sicuro di voler eliminare la riga di{' '}
            <strong>
              {rows.find((row) => row.id === remove)?.values.student || 'questo studente'}
            </strong>{' '}
            dal Planning?
          </p>
          <p>Questa azione elimina la riga del Planning.</p>
          {message ? (
            <p role="alert" className="form-error">
              {message}
            </p>
          ) : null}
          <div className="planning-form-actions">
            <button
              type="button"
              className="button navy small"
              disabled={busy}
              onClick={() => deleteRow(remove)}
            >
              Conferma eliminazione
            </button>
            <button
              type="button"
              className="button outline small"
              disabled={busy}
              onClick={() => setRemove(null)}
            >
              Annulla
            </button>
          </div>
        </Modal>
      ) : null}
      <div className="planning-navigation">
        <label>
          Cerca in {label}
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
            placeholder={
              kind === 'planning' ? 'Data, classe, materia o argomento' : 'Nome, classe o ciurma'
            }
          />
        </label>
        <span>
          {filtered.length} {filtered.length === 1 ? 'riga trovata' : 'righe trovate'}
        </span>
      </div>
      <div className="table-wrap planning-table">
        <table>
          <thead>
            <tr>
              {planningFields[kind].map(([name, title]) => (
                <th key={name} scope="col">
                  {title}
                </th>
              ))}
              <th scope="col">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.id}>
                {planningFields[kind].map(([name, title, type]) => (
                  <td key={name}>
                    {editing === row.id ? (name === 'entryExit' || name === 'lessonHour' ? (
                      <select autoFocus={editingField === name} aria-label={title + ' riga ' + row.id} value={values[name] || ''} onChange={(event) => setValues((old) => ({ ...old, [name]: event.target.value }))}>
                        <option value="">—</option>{(name === 'entryExit' ? ['Entrata', 'Uscita'] : ['1','2','3','4','5','6','7','8']).map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    ) : <input autoFocus={editingField === name} aria-label={title + ' riga ' + row.id} type={type} value={values[name] || ''} onChange={(event) => setValues((old) => ({ ...old, [name]: event.target.value }))} />) : (
                      <button type="button" className="planning-cell" disabled={editing !== null} onClick={() => { setMessage(''); setEditingField(name); setValues({ ...row.values }); setEditing(row.id); setEditingVersion(row.version); }}>{name === 'lessonHour' && row.values[name] ? row.values[name] + 'ª ora' : row.values[name] || '—'}</button>
                    )}
                  </td>
                ))}
                <td>
                  <div className="planning-row-actions">
                    {editing === row.id ? <>
                      <button type="button" className="table-action" disabled={busy} onClick={() => void save({ preventDefault() {} } as FormEvent)}>Salva</button>
                      <button type="button" className="table-action" disabled={busy} onClick={() => setEditing(null)}>Annulla</button>
                    </> : null}
                    {kind === 'planning' && remove === row.id ? (
                      <>
                        <button
                          type="button"
                          className="table-action"
                          disabled={busy}
                          onClick={() => deleteRow(row.id)}
                        >
                          Conferma eliminazione
                        </button>
                        <button
                          type="button"
                          className="table-action"
                          onClick={() => setRemove(null)}
                        >
                          Annulla
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="table-action"
                        aria-label={`Elimina riga ${row.id} ${label}`}
                        onClick={() => {
                          setMessage('');
                          setRemove(row.id);
                        }}
                      >
                        <Trash2 size={15} /> Elimina
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length ? (
          <p className="empty-state">
            {rows.length ? 'Nessuna riga corrisponde alla ricerca.' : 'Nessuna riga presente.'}
          </p>
        ) : null}
      </div>
      {filtered.length > pageSize ? (
        <nav className="planning-pagination" aria-label={`Pagine ${label}`}>
          <button
            type="button"
            className="button outline small"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            Precedente
          </button>
          <span>
            Pagina {currentPage + 1} di {pages}
          </span>
          <button
            type="button"
            className="button outline small"
            disabled={currentPage >= pages - 1}
            onClick={() => setPage(currentPage + 1)}
          >
            Successiva
          </button>
        </nav>
      ) : null}
    </section>
  );
}

export function PlanningPage() {
  const [data, setData] = useState<{ planning: PlanningRow[]; students: PlanningRow[] } | null>(
    null,
  );
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');
  const [annual, setAnnual] = useState(false);
  const [annualPreview, setAnnualPreview] = useState<{
    file: File;
    graduating: { id: number; first_name: string; last_name: string; class_code: string }[];
  } | null>(null);
  const reload = useCallback(async () => {
    const response = await fetch('/api/planning', { cache: 'no-store' });
    if (!response.ok) throw new Error('Impossibile caricare il planning.');
    setData(await response.json());
  }, []);
  useEffect(() => {
    reload().catch((error) => setError(error.message));
  }, [reload]);
  async function importFile(file: File, preview: boolean, graduatingIds?: number[]) {
    const form = new FormData();
    form.set('kind', 'workbook');
    form.set('file', file);
    if (annual) form.set('annual', '1');
    if (preview) form.set('preview', '1');
    if (graduatingIds) form.set('graduatedIds', JSON.stringify(graduatingIds));
    setUploading(true);
    setUploadMessage('');
    try {
      const response = await fetch('/api/planning', { method: 'POST', body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (preview) setAnnualPreview({ file, graduating: result.graduating });
      else {
        await reload();
        setAnnualPreview(null);
        setUploadMessage(
          `Importazione completata: ${result.counts.Planning} lezioni, ${result.counts.Studenti} studenti, ${result.counts.Ciurme} ciurme${annual ? `; ${result.counts.Rimossi} studenti di quinta rimossi` : ''}.`,
        );
      }
    } catch (error) {
      setUploadMessage((error as Error).message);
    } finally {
      setUploading(false);
    }
  }
  return (
    <div className="container page onepiece-page planning-page">
      <div className="page-heading">
        <span>Pannello del Narratore</span>
        <h1>Planning</h1>
        <p>Organizza le lezioni e le informazioni degli studenti.</p>
      </div>
      <div className="planning-import-all">
        <label className="planning-annual-option">
          <input
            type="checkbox"
            checked={annual}
            disabled={uploading}
            onChange={(event) => {
              setAnnual(event.target.checked);
              setAnnualPreview(null);
              setUploadMessage('');
            }}
          />{' '}
          Importazione annuale
        </label>
        <p>
          Il foglio Studenti aggiorna anche il registro. Le lezioni vengono aggiunte al Planning.
        </p>
        {annual ? (
          <p>
            Usa l’elenco completo del nuovo anno. Prima della conferma vedrai gli studenti di quinta
            assenti dal file i cui account, voti e dati saranno eliminati.
          </p>
        ) : null}
        <label className="button navy planning-upload">
          <FileUp size={16} /> Importa file Planning e Studenti
          <input
            type="file"
            accept=".xlsx"
            aria-label="Importa file Planning e Studenti"
            disabled={uploading}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (file) {
                setAnnualPreview(null);
                void importFile(file, annual);
              }
            }}
          />
        </label>
        {annualPreview ? (
          <section className="planning-annual-preview" aria-label="Anteprima importazione annuale">
            <h2>Controlla gli studenti da rimuovere</h2>
            {annualPreview.graduating.length ? (
              <>
                <p>
                  Questi studenti di quinta non compaiono nel foglio. Confermando, i loro account,
                  voti e dati saranno eliminati.
                </p>
                <ul>
                  {annualPreview.graduating.map((student) => (
                    <li key={student.id}>
                      {student.last_name} {student.first_name} · {student.class_code}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p>Nessuno studente di quinta risulta da rimuovere.</p>
            )}
            <div className="planning-form-actions">
              <button
                type="button"
                className="button navy"
                disabled={uploading}
                onClick={() =>
                  importFile(
                    annualPreview.file,
                    false,
                    annualPreview.graduating.map((student) => student.id),
                  )
                }
              >
                Conferma importazione annuale
              </button>
              <button
                type="button"
                className="button outline"
                disabled={uploading}
                onClick={() => setAnnualPreview(null)}
              >
                Annulla
              </button>
            </div>
          </section>
        ) : null}
        {uploadMessage ? <p role="status">{uploadMessage}</p> : null}
      </div>
      {error ? <p role="alert">{error}</p> : null}
      {data ? (
        <div className="planning-grid">
          <PlanningTable kind="planning" rows={data.planning} reload={reload} />
          <PlanningTable kind="students" rows={data.students} reload={reload} />
        </div>
      ) : !error ? (
        <p role="status">Caricamento…</p>
      ) : null}
    </div>
  );
}
