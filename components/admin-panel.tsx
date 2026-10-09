'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarDays,
  Check,
  CloudUpload,
  FileSpreadsheet,
  Plus,
  Save,
  Settings2,
  ShipWheel,
  Users,
  X,
} from 'lucide-react';
import { subjectLabel, subjectsForClass } from '@/lib/subjects';
import { dailyPoints as dayPoints, presencePoints, phonePoints, POINT_RULES, GRADE_MULTIPLIERS } from '@/lib/point-rules';
import { AuthForm, Modal } from './interactive';
import { AdminDreams, type Dream } from './admin-dreams';
import type { Crew, Daily, Grade, Mystery, Route, User } from '@/lib/db';
type Row = {
  user_id: number;
  presence: string;
  phone: string;
  bug: boolean;
  anxiety: boolean;
  mystery: boolean;
  weapon: string;
  multiverse: string;
  multiverse_points: number;
  fruit_points: number;
  imported_points_offset?: number;
};
const makeRow = (u: User): Row => ({
  user_id: u.id,
  presence: '',
  phone: '',
  bug: false,
  anxiety: false,
  mystery: false,
  weapon: '',
  multiverse: '',
  multiverse_points: 0,
  fruit_points: 0,
});
const registryColumns = [
  ['pirate', 'Pirata'], ['crew', 'Ciurma'], ['weapon', 'Arma'],
  ['presence', 'Presenza'], ['phone', 'Telefono'], ['bug', 'Bug'],
  ['anxiety', 'Ansia'], ['mystery', 'Mistero'], ['multiverse', 'Multiverso'],
  ['dream', 'Sogno'], ['grades', 'Voti'], ['day', 'Totale giornata'], ['total', 'Totale materia'],
] as const;
type RegistrySortKey = typeof registryColumns[number][0];
const textSortKeys: RegistrySortKey[] = ['pirate', 'crew', 'weapon'];
async function post(action: string, body: unknown) {
  const res = await fetch(`/api/admin/${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Operazione non riuscita.');
  return data;
}
function updateRegistryURL(classCode: string, subject: string) {
  const url = new URL(window.location.href);
  url.searchParams.set('classe', classCode);
  url.searchParams.set('materia', subject || 'storico');
  window.history.replaceState(null, '', url.pathname + url.search);
}
export function AdminPanel({
  users,
  crews,
  routes,
  mysteries,
  dreams,
  initialClass,
  initialSubject,
}: {
  users: User[];
  crews: Crew[];
  routes: Route[];
  mysteries: Mystery[];
  dreams: Dream[];
  initialClass: string;
  initialSubject: string;
}) {
  const [members, setMembers] = useState(users);
  const [adminCreationOpen, setAdminCreationOpen] = useState(false);
  const [managedDreams, setManagedDreams] = useState(dreams);
  const [dreamStudentId, setDreamStudentId] = useState<number | null>(null);
  const dreamStudent = users.find((u) => u.id === dreamStudentId);
  const [secrets, setSecrets] = useState(mysteries);
  const [newMystery, setNewMystery] = useState({ title: '', description: '' });
  const [date, setDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [subject, setSubject] = useState(initialSubject);
  const [loadedKey, setLoadedKey] = useState('');
  const [totals, setTotals] = useState<Record<number, number>>({});
  const [importedPoints, setImportedPoints] = useState<Record<number, number>>({});
  const [totalsLoadedKey, setTotalsLoadedKey] = useState('');
  const [totalsRevision, setTotalsRevision] = useState(0);
  const [sort, setSort] = useState<{key: RegistrySortKey; direction: 'asc' | 'desc'}>({key:'pirate',direction:'asc'});
  const [cls, setCls] = useState(initialClass),
    [crew, setCrew] = useState(''),
    [rows, setRows] = useState<Row[]>(users.map(makeRow)),
    [grades, setGrades] = useState<Grade[]>([]);
  const loadKey = `${date}:${cls}:${subject}`;
  const totalsKey = `${loadKey}:${totalsRevision}`;
  const subjects = subjectsForClass(cls);
  const registryReady = !!cls && loadedKey === loadKey;
  const registryWritable = registryReady && (!subjects.length || subjects.includes(subject));
  const [modal, setModal] = useState<'upload' | 'multiverse' | 'grade' | null>(null),
    [selected, setSelected] = useState<number | null>(null);
  const [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [routeNames, setRouteNames] = useState<Record<number, string>>({}),
    [routeDates, setRouteDates] = useState<Record<number, { start: string; end: string }>>({});
  const classes = [
    ...new Set(
      [...members.map((u) => u.class_code), ...routes.map((r) => r.class_code)].filter(Boolean),
    ),
  ];
  const filtered = members.filter(
    (u) => (!cls || u.class_code === cls) && (!crew || u.crew_id === Number(crew)),
  );
  useEffect(() => {
    let live = true;
    fetch(`/api/data?date=${date}&subject=${encodeURIComponent(subject)}`)
      .then((r) => {
        if (!r.ok) throw new Error('Caricamento non riuscito.');
        return r.json();
      })
      .then((data) => {
        if (!live) return;
        const saved = new Map<number, Daily>((data.daily || []).map((d: Daily) => [d.user_id, d]));
        setRows(
          users.map((u) => {
            const r = saved.get(u.id);
            const presence = data.lessonClasses?.includes(u.class_code) ? 'P' : '';
            return r
              ? {
                  user_id: u.id,
                  presence: r.presence || presence,
                  phone: r.phone === '+' ? '+' : '',
                  bug: !!r.bug,
                  anxiety: !!r.anxiety,
                  mystery: !!r.mystery,
                  weapon: r.weapon,
                  multiverse: r.multiverse,
                  multiverse_points: r.multiverse_points,
                  fruit_points: r.fruit_points,
                  imported_points_offset: r.imported_points_offset || 0,
                }
              : { ...makeRow(u), presence, ...(data.importedRegistry?.[u.id] || {}) };
          }),
        );
        setGrades(data.grades || []);
        setImportedPoints(data.importedPoints || {});
        setLoadedKey(loadKey);
      })
      .catch(() => {
        if (live) setMessage('Impossibile caricare il registro.');
      });
    return () => {
      live = false;
    };
  }, [date, cls, subject, users, loadKey]);
  useEffect(() => {
    let live = true;
    fetch(`/api/data?date=${date}&subject=${encodeURIComponent(subject)}&totalsOnly=1`)
      .then(response => {
        if (!response.ok) throw new Error('Caricamento totali non riuscito.');
        return response.json();
      })
      .then(data => {
        if (!live) return;
        setTotals(data.totals || {});
        setTotalsLoadedKey(totalsKey);
      })
      .catch(() => {
        if (live) setMessage('Impossibile caricare i totali della materia.');
      });
    return () => { live = false; };
  }, [date, subject, totalsKey]);
  const summary = useMemo(
    () => ({
      totali: filtered.length,
      narratori: 1,
      registrati: filtered.filter((user) => !user.email.endsWith('@studenti.invalid')).length,
      nonRegistrati: filtered.filter((user) => user.email.endsWith('@studenti.invalid')).length,
    }),
    [filtered],
  );
  function sortValue(user: User): string | number {
    const row = rows.find(item => item.user_id === user.id) || makeRow(user);
    switch (sort.key) {
      case 'pirate': return `${user.last_name} ${user.first_name}`;
      case 'crew': return crews.find(crew => crew.id === user.crew_id)?.name || '';
      case 'weapon': return row.weapon;
      case 'presence': return presencePoints(row.presence);
      case 'phone': return phonePoints(row.phone);
      case 'bug': return row.bug ? POINT_RULES.bug : 0;
      case 'anxiety': return row.anxiety ? POINT_RULES.anxiety : 0;
      case 'mystery': return row.mystery ? POINT_RULES.mystery : 0;
      case 'multiverse': return row.multiverse_points;
      case 'dream': return managedDreams.filter(dream => dream.user_id === user.id && dream.date === date && dream.subject === subject).reduce((sum,dream) => sum + dream.points,0);
      case 'grades': return grades.filter(grade => grade.user_id === user.id).reduce((sum,grade) => sum + grade.points,0);
      case 'day': return dayPoints(row)
        + (importedPoints[user.id] ?? 0)
        + grades.filter(grade => grade.user_id === user.id).reduce((sum,grade) => sum + grade.points,0)
        + managedDreams.filter(dream => dream.user_id === user.id && dream.date === date && dream.subject === subject).reduce((sum,dream) => sum + dream.points,0);
      case 'total': return totals[user.id] ?? 0;
    }
  }
  const sortedMembers = [...filtered].sort((a,b) => {
    const first = sortValue(a), second = sortValue(b);
    const difference = typeof first === 'number' && typeof second === 'number'
      ? first - second
      : String(first).localeCompare(String(second),'it',{sensitivity:'base'});
    return (sort.direction === 'asc' ? difference : -difference)
      || `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`,'it',{sensitivity:'base'})
      || a.id - b.id;
  });
  function changeSort(key: RegistrySortKey) {
    setSort(current => ({key,direction:current.key === key
      ? current.direction === 'asc' ? 'desc' : 'asc'
      : textSortKeys.includes(key) ? 'asc' : 'desc'}));
  }
  function change(id: number, patch: Partial<Row>) {
    setRows((old) => old.map((r) => (r.user_id === id ? { ...r, ...patch } : r)));
  }
  const active = rows.find((r) => r.user_id === selected);
  async function save() {
    if (!registryWritable || busy) return;
    setBusy(true);
    setMessage('');
    try {
      await post('registry', {
        date,
        subject,
        rows: filtered.map((u) => rows.find((r) => r.user_id === u.id)),
      });
      const crewIds = new Set(
        filtered
          .filter((u) => rows.find((r) => r.user_id === u.id)?.mystery && u.crew_id)
          .map((u) => u.crew_id),
      );
      setRows((old) =>
        old.map((r) =>
          crewIds.has(members.find((u) => u.id === r.user_id)?.crew_id || null)
            ? { ...r, mystery: true }
            : r,
        ),
      );
      setMessage(`Registro ${subjectLabel(subject) || cls} salvato. Le taglie sono aggiornate.`);
      setTotalsRevision(revision => revision + 1);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Errore nel salvataggio.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="admin-toolbar">
        <div className="admin-filters">
          <label>
            Data
            <input
              type="date"
              disabled={busy}
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setLoadedKey('');
                setMessage('');
                setModal(null);
              }}
            />
          </label>
          <label>
            Classe
            <select
              value={cls}
              disabled={busy}
              onChange={(e) => {
                setCls(e.target.value);
                setSubject(subjectsForClass(e.target.value)[0] || '');
                updateRegistryURL(e.target.value, subjectsForClass(e.target.value)[0] || '');
                setLoadedKey('');
                setMessage('');
                setModal(null);
                setCrew('');
              }}
            >
              <option value="">Seleziona una classe</option>
              {classes.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          {subjects.length ? (
            <label>
              Materia
              <select
                value={subject}
                disabled={busy}
                onChange={(e) => {
                  setSubject(e.target.value);
                  updateRegistryURL(cls, e.target.value);
                  setLoadedKey('');
                  setMessage('');
                  setModal(null);
                }}
              >
                {subjects.map((name) => (
                  <option key={name} value={name}>{subjectLabel(name)}</option>
                ))}
              </select>
            </label>
          ) : null}
          <label>
            Ciurma
            <select value={crew} disabled={!cls} onChange={(e) => setCrew(e.target.value)}>
              <option value="">Tutte le ciurme</option>
              {crews
                .filter((c) => c.class_code === cls)
                .map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <button className="button outline" onClick={() => setAdminCreationOpen(true)}>
          <Plus size={17} /> Nuovo admin
        </button>
        <button className="button outline" onClick={() => setModal('upload')}>
          <CloudUpload size={17} /> Upload .xlsx
        </button>
      </div>
      {adminCreationOpen ? (
        <Modal title="Nuovo admin" onClose={() => setAdminCreationOpen(false)}>
          <p>Crea un account Narratore per un docente. La classe non è richiesta.</p>
          <AuthForm mode="create-admin" />
        </Modal>
      ) : null}
      <div className="admin-overview">
        <section className="admin-tile">
          <div className="admin-tile-title">
            <Users size={19} />
            <h2>Utenti</h2>
          </div>
          {Object.entries(summary).map(([label, n]) => (
            <div className="stat-line" key={label}>
              <span>
                {label === 'nonRegistrati'
                  ? 'Non registrati'
                  : label[0].toUpperCase() + label.slice(1)}
              </span>
              <strong>{n}</strong>
            </div>
          ))}
        </section>
        <section className="admin-tile">
          <div className="admin-tile-title">
            <ShipWheel size={19} />
            <h2>Rotte</h2>
          </div>
          {!cls ? (
            <p className="tile-hint">Seleziona una classe per modificare le rotte.</p>
          ) : (
            <div className="route-editor">
              {routes
                .filter(
                  (r) =>
                    r.class_code === cls &&
                    r.year ===
                      Math.max(...routes.filter((x) => x.class_code === cls).map((x) => x.year)),
                )
                .map((r) => (
                  <div key={r.id}>
                    <span>{r.ordinal}ª</span>
                    <input
                      aria-label={`Nome rotta ${r.ordinal}`}
                      value={routeNames[r.id] ?? r.name}
                      onChange={(e) => setRouteNames((old) => ({ ...old, [r.id]: e.target.value }))}
                    />
                    <button
                      aria-label={`Salva rotta ${r.ordinal}`}
                      onClick={async () => {
                        try {
                          await post('route', {
                            id: r.id,
                            name: routeNames[r.id] ?? r.name,
                            start_date: routeDates[r.id]?.start ?? r.start_date,
                            end_date: routeDates[r.id]?.end ?? r.end_date,
                          });
                          setMessage('Rotta aggiornata.');
                        } catch (e) {
                          setMessage((e as Error).message);
                        }
                      }}
                    >
                      <Save size={15} />
                    </button>
                    <div className="date-pair">
                      <label>
                        Dal
                        <input
                          type="date"
                          aria-label={`Inizio rotta ${r.ordinal}`}
                          value={routeDates[r.id]?.start ?? r.start_date}
                          onChange={(e) =>
                            setRouteDates((old) => ({
                              ...old,
                              [r.id]: { start: e.target.value, end: old[r.id]?.end ?? r.end_date },
                            }))
                          }
                        />
                      </label>
                      <label>
                        Al
                        <input
                          type="date"
                          aria-label={`Fine rotta ${r.ordinal}`}
                          value={routeDates[r.id]?.end ?? r.end_date}
                          onChange={(e) =>
                            setRouteDates((old) => ({
                              ...old,
                              [r.id]: {
                                start: old[r.id]?.start ?? r.start_date,
                                end: e.target.value,
                              },
                            }))
                          }
                        />
                      </label>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </section>
        <section className="admin-tile">
          <div className="admin-tile-title">
            <Settings2 size={19} />
            <h2>Ruoli</h2>
          </div>
          {!cls || !crew ? (
            <p className="tile-hint">Seleziona classe e ciurma per assegnare i ruoli.</p>
          ) : (
            <div className="roles-editor">
              {filtered.map((u) => (
                <div key={u.id}>
                  <span>
                    {u.first_name} {u.last_name}
                  </span>
                  <select
                    defaultValue={u.roles}
                    onChange={async (e) => {
                      try {
                        await post('role', { user_id: u.id, role: e.target.value });
                        setMessage('Ruolo aggiornato.');
                      } catch (err) {
                        setMessage((err as Error).message);
                      }
                    }}
                  >
                    {[u.roles, 'Capitano', 'Navigatore', 'Archeologo', 'Equipaggio']
                      .filter((v, i, a) => a.indexOf(v) === i)
                      .map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                  </select>
                </div>
              ))}
              <select
                aria-label="Assegna pirata alla ciurma"
                defaultValue=""
                onChange={async (e) => {
                  const id = Number(e.target.value);
                  if (!id) return;
                  try {
                    await post('crew', { user_id: id, crew_id: Number(crew) });
                    setMembers((old) =>
                      old.map((u) => (u.id === id ? { ...u, crew_id: Number(crew) } : u)),
                    );
                    setMessage('Pirata assegnato alla ciurma.');
                  } catch (err) {
                    setMessage((err as Error).message);
                  }
                }}
              >
                <option value="">Aggiungi un pirata…</option>
                {members
                  .filter((u) => u.class_code === cls && u.crew_id !== Number(crew))
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.last_name} {u.first_name}
                    </option>
                  ))}
              </select>
            </div>
          )}
        </section>
      </div>
      {dreamStudent ? (
        <AdminDreams
          key={dreamStudent.id}
          student={dreamStudent}
          date={date}
          subject={subject}
          dreams={managedDreams}
          onChange={(updated) => {
            setManagedDreams(updated);
            setTotalsRevision(revision => revision + 1);
          }}
          onClose={() => setDreamStudentId(null)}
        />
      ) : null}
      <section className="registry-section">
        {subjects.length > 1 ? (
          <nav className="registry-tabs" aria-label={`Registri ${cls}`}>
            {subjects.map((name) => (
              <button
                key={name}
                type="button"
                aria-pressed={subject === name}
                disabled={busy}
                onClick={() => {
                  if (subject === name) return;
                  setSubject(name);
                  updateRegistryURL(cls, name);
                  setLoadedKey('');
                  setMessage('');
                  setModal(null);
                }}
              >
                Registro {subjectLabel(name)}
              </button>
            ))}
          </nav>
        ) : null}
        <div className="registry-heading">
          <div>
            <span className="section-index">Registro della giornata</span>
            <h2>{cls ? `Registro ${subjectLabel(subject) || 'precedente'} · ${cls}` : 'Registro punti'}</h2>
            <p>
              {new Date(date + 'T12:00:00').toLocaleDateString('it-IT', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </p>
            <p>
              {filtered.length} pirati · {cls || 'tutte le classi'} ·{' '}
              {subjectLabel(subject) || 'Registro precedente'}
            </p>
          </div>
          <button className="button gold" onClick={save} disabled={busy || !registryWritable}>
            <Save size={17} />
            {busy ? 'Salvataggio…' : 'Salva registro'}
          </button>
        </div>
        {message ? (
          <p role="status" className="admin-message">
            {message}
          </p>
        ) : null}
        <p className="table-scroll-hint">Clicca sulle intestazioni per ordinare. Scorri lateralmente per vedere tutte le colonne.</p>
        {!cls ? <p>Seleziona una classe per compilare il registro.</p> : null}
        <fieldset style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <div className="table-wrap registry-table">
            <table>
              <thead>
                <tr>
                  {registryColumns.map(([key,label]) => (
                    <th key={key} scope="col" aria-sort={sort.key === key ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}>
                      <button type="button" className="registry-sort-button"
                        aria-label={`Ordina per ${label}`} onClick={() => changeSort(key)}
                        disabled={busy || (!textSortKeys.includes(key) && (key === 'total' ? totalsLoadedKey !== totalsKey : !registryReady))}>
                        {label}
                        {sort.key === key
                          ? sort.direction === 'asc' ? <ArrowUp size={13} aria-hidden="true" /> : <ArrowDown size={13} aria-hidden="true" />
                          : <ArrowUpDown size={13} aria-hidden="true" />}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedMembers.map((u) => {
                  const r = rows.find((x) => x.user_id === u.id) || makeRow(u);
                  const gradeSum = grades
                    .filter((g) => g.user_id === u.id)
                    .reduce((s, g) => s + g.points, 0);
                  const dreamPoints = managedDreams
                    .filter(
                      (dream) =>
                        dream.user_id === u.id && dream.date === date && dream.subject === subject,
                    )
                    .reduce((sum, dream) => sum + dream.points, 0);
                  return (
                    <tr key={u.id}>
                      <td>
                        <strong>
                          {u.last_name} {u.first_name}
                        </strong>
                        <small>{u.class_code}</small>
                      </td>
                      <td>{crews.find((c) => c.id === u.crew_id)?.name || '—'}</td>
                      <td>
                        <select
                          aria-label={`Arma di ${u.first_name}`}
                          disabled={busy || !registryWritable}
                          value={r.weapon}
                          onChange={(e) => change(u.id, { weapon: e.target.value })}
                        >
                          <option value="">—</option>
                          {['Poseidon', 'Pluton', 'Uranus'].map((x) => (
                            <option key={x}>{x}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          aria-label={`Presenza di ${u.first_name}`}
                          disabled={busy || !registryWritable}
                          value={r.presence}
                          onChange={(e) => change(u.id, { presence: e.target.value })}
                        >
                          <option value="">—</option>
                          {['P', 'A', 'A+'].map((x) => (
                            <option key={x}>{x}</option>
                          ))}
                        </select>
                        <small className="points-chip">
                          {presencePoints(r.presence)}
                        </small>
                      </td>
                      <td>
                        <select
                          aria-label={`Telefono di ${u.first_name}`}
                          disabled={busy || !registryWritable}
                          value={r.phone}
                          onChange={(e) => change(u.id, { phone: e.target.value })}
                        >
                          <option value="+">+</option>
                          <option value="">—</option>
                        </select>
                        <small className="points-chip">
                          {r.phone === '+' ? `+${POINT_RULES.phone}` : '0'}
                        </small>
                      </td>
                      {(['bug', 'anxiety', 'mystery'] as const).map((k) => (
                        <td key={k}>
                          <input
                            type="checkbox"
                            disabled={busy || !registryWritable}
                            aria-label={`${k} di ${u.first_name}`}
                            checked={r[k]}
                            onChange={(e) => change(u.id, { [k]: e.target.checked })}
                          />
                          <small className="points-chip">
                            {r[k] ? `${POINT_RULES[k] > 0 ? '+' : ''}${POINT_RULES[k]}` : '0'}
                          </small>
                        </td>
                      ))}
                      <td>
                        <button
                          className="table-action"
                          onClick={() => {
                            setSelected(u.id);
                            setModal('multiverse');
                          }}
                          disabled={busy || !registryWritable}
                        >
                          {r.multiverse ? 'Dettagli' : 'Aggiungi'}
                        </button>
                        <small className="points-chip">+{r.multiverse_points}</small>
                      </td>
                      <td>
                        <button
                          className="table-action"
                          aria-label={`Sogni di ${u.first_name} ${u.last_name}`}
                          onClick={() => setDreamStudentId(u.id)}
                        >
                          {managedDreams.some((dream) => dream.user_id === u.id)
                            ? 'Dettagli'
                            : 'Aggiungi'}
                        </button>
                        <small className="points-chip">+{dreamPoints}</small>
                      </td>
                      <td>
                        <button
                          className="table-action"
                          onClick={() => {
                            setSelected(u.id);
                            setModal('grade');
                          }}
                          disabled={busy || !registryWritable}
                        >
                          Dettagli
                        </button>
                        <small className="points-chip">+{gradeSum}</small>
                      </td>
                      <td>
                        <strong title="Punti della giornata, comprese le modifiche non ancora salvate">
                          {registryReady ? new Intl.NumberFormat('it-IT').format(dayPoints(r) + gradeSum + dreamPoints + (importedPoints[u.id] ?? 0)) : '—'}
                        </strong>
                      </td>
                      <td>
                        <strong title="Saldo complessivo salvato della materia">
                          {totalsLoadedKey === totalsKey
                            ? new Intl.NumberFormat('it-IT').format(totals[u.id] ?? 0)
                            : '—'}
                        </strong>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </fieldset>
      </section>
      <section className="admin-mysteries">
        <div className="section-heading left">
          <span className="section-index">Controllo del narratore</span>
          <h2>Misteri</h2>
        </div>
        <div className="mystery-toggle-list">
          {secrets.map((m) => (
            <div className="mystery-admin-card" key={m.id}>
              <strong>{m.title}</strong>
              <label>
                <input
                  type="checkbox"
                  checked={!!m.revealed}
                  onChange={async (e) => {
                    const revealed = e.target.checked;
                    try {
                      await post('mystery', { id: m.id, revealed });
                      setSecrets((old) =>
                        old.map((item) =>
                          item.id === m.id ? { ...item, revealed: Number(revealed) } : item,
                        ),
                      );
                    } catch (err) {
                      setMessage((err as Error).message);
                    }
                  }}
                />
                Svelato
              </label>
              <div className="admin-clues" aria-label={`Indizi di ${m.title}`}>
                {(JSON.parse(m.clues) as boolean[]).map((found, index) => (
                  <label key={index}>
                    <input
                      type="checkbox"
                      checked={found}
                      onChange={async (e) => {
                        const next = [...(JSON.parse(m.clues) as boolean[])];
                        next[index] = e.target.checked;
                        try {
                          await post('mystery-clue', { id: m.id, index, found: next[index] });
                          setSecrets((old) =>
                            old.map((item) =>
                              item.id === m.id ? { ...item, clues: JSON.stringify(next) } : item,
                            ),
                          );
                        } catch (err) {
                          setMessage((err as Error).message);
                        }
                      }}
                    />
                    Indizio {index + 1}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        <form
          className="mystery-create"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const result = await post('mystery-create', newMystery);
              setSecrets((old) => [
                ...old,
                {
                  id: result.id,
                  title: newMystery.title,
                  description: newMystery.description,
                  revealed: 0,
                  clues: '[false,false,false,false]',
                },
              ]);
              setNewMystery({ title: '', description: '' });
              setMessage('Mistero aggiunto.');
            } catch (err) {
              setMessage((err as Error).message);
            }
          }}
        >
          <input
            aria-label="Titolo nuovo mistero"
            placeholder="Titolo del nuovo mistero"
            value={newMystery.title}
            onChange={(e) => setNewMystery((old) => ({ ...old, title: e.target.value }))}
            required
          />
          <input
            aria-label="Descrizione nuovo mistero"
            placeholder="Breve descrizione"
            value={newMystery.description}
            onChange={(e) => setNewMystery((old) => ({ ...old, description: e.target.value }))}
          />
          <button className="button outline" type="submit">
            <Plus size={16} /> Aggiungi mistero
          </button>
        </form>
      </section>
      {modal === 'multiverse' && active ? (
        <Modal title="Inserimento multiverso" onClose={() => setModal(null)}>
          <p>Annota il multiverso della giornata e assegna i punti.</p>
          <label className="modal-field">
            Data
            <input type="date" value={date} readOnly />
          </label>
          <label className="modal-field">
            Multiverso
            <textarea
              value={active.multiverse}
              onChange={(e) => change(active.user_id, { multiverse: e.target.value })}
              rows={5}
              placeholder="Scrivi il multiverso o la nota…"
            />
          </label>
          <label className="modal-field">
            Punti multiverso
            <select
              value={active.multiverse_points}
              onChange={(e) =>
                change(active.user_id, { multiverse_points: Number(e.target.value) })
              }
            >
              <option value="0">0 punti</option>
              <option value={POINT_RULES.multiverse}>+{POINT_RULES.multiverse} punti</option>
            </select>
          </label>
          <button className="button navy" onClick={() => setModal(null)}>
            Conferma
          </button>
        </Modal>
      ) : null}
      {modal === 'grade' && selected ? (
        <GradeModal
          subject={subject}
          date={date}
          userId={selected}
          grades={grades.filter((g) => g.user_id === selected)}
          onAdd={(g) => {
            setGrades((old) => [...old, g]);
            setTotalsRevision(revision => revision + 1);
          }}
          onClose={() => setModal(null)}
        />
      ) : null}
      {modal === 'upload' ? <UploadModal onClose={() => setModal(null)} /> : null}
    </>
  );
}
function GradeModal({
  subject,
  date,
  userId,
  grades,
  onAdd,
  onClose,
}: {
  subject: string;
  date: string;
  userId: number;
  grades: Grade[];
  onAdd: (g: Grade) => void;
  onClose: () => void;
}) {
  const [type, setType] = useState('verifica'),
    [grade, setGrade] = useState('6'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const options = Array.from({ length: 17 }, (_, i) => 2 + i * 0.5);
  return (
    <Modal title="Inserimento voti" onClose={onClose}>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Tipologia</th>
              <th>Voto</th>
              <th>Punti</th>
            </tr>
          </thead>
          <tbody>
            {grades.map((g) => (
              <tr key={g.id}>
                <td>{g.date}</td>
                <td>{g.type}</td>
                <td>{g.grade}</td>
                <td>{g.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grade-form">
        <label>
          Data
          <input type="date" value={date} readOnly />
        </label>
        <label>
          Tipologia
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option>verifica</option>
            <option>interrogazione</option>
            <option>progetto</option>
          </select>
        </label>
        <label>
          Voto
          <select value={grade} onChange={(e) => setGrade(e.target.value)}>
            {options.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <strong>
          {Math.round(
            Number(grade) *
              GRADE_MULTIPLIERS[
                type as 'verifica' | 'interrogazione' | 'progetto'
              ],
          )}{' '}
          punti
        </strong>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
      <button
        className="button navy"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const result = await post('grade', {
              subject,
              user_id: userId,
              date,
              type,
              grade: Number(grade),
            });
            onAdd({
              subject,
              id: Date.now(),
              user_id: userId,
              date,
              type,
              grade: Number(grade),
              points: result.points,
            });
            setError('');
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Plus size={16} /> Aggiungi voto
      </button>
    </Modal>
  );
}
function UploadModal({ onClose }: { onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null),
    [mode, setMode] = useState('details'),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  return (
    <Modal title="Upload dati" onClose={onClose}>
      <p>
        Carica un file .xlsx. <strong>Dettagli</strong> importa anche i fogli Studenti e One Piece,
        oltre a Rotte, Ciurme, Taglie, Ruoli e Stagioni 1–2. <strong>Update</strong> importa solo il
        foglio Update.
      </p>
      <div className="upload-options">
        <label>
          <input type="radio" checked={mode === 'details'} onChange={() => setMode('details')} />{' '}
          Dettagli
        </label>
        <label>
          <input type="radio" checked={mode === 'update'} onChange={() => setMode('update')} />{' '}
          Update
        </label>
      </div>
      <label className="upload-drop">
        <FileSpreadsheet size={30} />
        <span>{file?.name || 'Seleziona il file .xlsx'}</span>
        <input type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      </label>
      {message ? (
        <p role="status" className="admin-message">
          {message}
        </p>
      ) : null}
      <button
        className="button navy"
        disabled={!file || busy}
        onClick={async () => {
          if (!file) return;
          setBusy(true);
          const form = new FormData();
          form.append('file', file);
          form.append('mode', mode);
          try {
            const res = await fetch('/api/admin/upload', { method: 'POST', body: form });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setMessage(
              `Importate ${Object.entries(data.counts)
                .map(([name, n]) => `${n} righe da ${name}`)
                .join(', ')}. ${data.warning}`,
            );
          } catch (e) {
            setMessage((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <CloudUpload size={17} />
        {busy ? 'Caricamento…' : 'Carica file'}
      </button>
    </Modal>
  );
}
