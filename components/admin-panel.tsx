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
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import {
  dailyPoints as dayPoints,
  presencePoints,
  phonePoints,
  POINT_RULES,
  GRADE_MULTIPLIERS,
} from '@/lib/point-rules';
import { AuthForm, Modal } from './interactive';
import { AdminDreams, type Dream } from './admin-dreams';
import type { Crew, Daily, Grade, Mystery, Route, User } from '@/lib/db';
import { registrySubject } from '@/lib/registry-lessons';
type Row = {
  user_id: number;
  presence: string;
  phone: string;
  bug: number;
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
  presence: 'P',
  phone: '+',
  bug: 0,
  anxiety: false,
  mystery: false,
  weapon: '',
  multiverse: '',
  multiverse_points: 0,
  fruit_points: 0,
});
const registryColumns = [
  ['pirate', 'Pirata'],
  ['crew', 'Ciurma'],
  ['weapon', 'Arma'],
  ['presence', 'Presenza'],
  ['phone', 'Telefono'],
  ['bug', 'Bug'],
  ['anxiety', 'Ansia'],
  ['mystery', 'Mistero'],
  ['multiverse', 'Multiverso'],
  ['dream', 'Sogno'],
  ['grades', 'Voti'],
  ['day', 'Totale giornata'],
  ['total', 'Totale punti'],
] as const;
type RegistrySortKey = (typeof registryColumns)[number][0];
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
function updateRegistryURL(classCode: string, date?: string, subject?: string) {
  const url = new URL(window.location.href);
  url.searchParams.set('classe', classCode);
  if (subject !== undefined) {
    if (subject) url.searchParams.set('materia', subject);
    else url.searchParams.delete('materia');
  }
  if (date) url.searchParams.set('data', date);
  window.history.replaceState(null, '', url.pathname + url.search);
}
export function AdminPanel({
  users,
  narrators,
  crews,
  routes,
  mysteries,
  dreams,
  initialClass,
  initialDate,
  initialSubject,
}: {
  users: User[];
  narrators: User[];
  crews: Crew[];
  routes: Route[];
  mysteries: Mystery[];
  dreams: Dream[];
  initialClass: string;
  initialDate?: string;
  initialSubject?: string;
}) {
  const [members, setMembers] = useState(users);
  const [adminCreationOpen, setAdminCreationOpen] = useState(false);
  const [managedDreams, setManagedDreams] = useState(dreams);
  const [dreamStudentId, setDreamStudentId] = useState<number | null>(null);
  const dreamStudent = users.find((u) => u.id === dreamStudentId);
  const [secrets, setSecrets] = useState(mysteries);
  const [newMystery, setNewMystery] = useState({ title: '', description: '' });
  const [date, setDate] = useState(() => initialDate || new Date().toLocaleDateString('en-CA'));
  const [subject, setSubject] = useState(() => registrySubject(initialSubject) || '');
  const [managedRoutes, setManagedRoutes] = useState(routes);
  const [routeYear, setRouteYear] = useState('');
  const [routeClass, setRouteClass] = useState(initialClass);
  const [routeMessage, setRouteMessage] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [userStatus, setUserStatus] = useState('all');
  const [roleDrafts, setRoleDrafts] = useState<Record<number, string>>({});
  const [managementMessage, setManagementMessage] = useState('');
  const [managementBusy, setManagementBusy] = useState(false);
  const [mysteryMessage, setMysteryMessage] = useState('');
  const [deletingMystery, setDeletingMystery] = useState<Mystery | null>(null);
  const [mysteryBusy, setMysteryBusy] = useState(false);
  const [loadedKey, setLoadedKey] = useState('');
  const [totals, setTotals] = useState<Record<number, number>>({});
  const [importedPoints, setImportedPoints] = useState<Record<number, number>>({});
  const [otherDailyPoints, setOtherDailyPoints] = useState<Record<number, number>>({});
  const [totalsLoadedKey, setTotalsLoadedKey] = useState('');
  const [totalsRevision, setTotalsRevision] = useState(0);
  const [sort, setSort] = useState<{ key: RegistrySortKey; direction: 'asc' | 'desc' }>({
    key: 'pirate',
    direction: 'asc',
  });
  const [cls, setCls] = useState(initialClass),
    [crew, setCrew] = useState(''),
    [rows, setRows] = useState<Row[]>(users.map(makeRow)),
    [grades, setGrades] = useState<Grade[]>([]);
  const loadKey = `${date}:${cls}:${subject}`;
  const totalsKey = `${loadKey}:${totalsRevision}`;
  const registryReady = !!cls && !!subject && loadedKey === loadKey;
  const registryWritable = registryReady;
  const [modal, setModal] = useState<'upload' | 'multiverse' | 'grade' | 'users' | 'routes' | null>(
      null,
    ),
    [selected, setSelected] = useState<number | null>(null);
  const [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [routeNames, setRouteNames] = useState<Record<number, string>>({}),
    [routeDates, setRouteDates] = useState<Record<number, { start: string; end: string }>>({});
  const classes = [
    ...new Set(
      [...members.map((u) => u.class_code), ...managedRoutes.map((r) => r.class_code)].filter(
        Boolean,
      ),
    ),
  ];
  const filtered = members.filter(
    (u) => (!cls || u.class_code === cls) && (!crew || u.crew_id === Number(crew)),
  );
  useEffect(() => {
    if (!cls || !subject) return;
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
            return r
              ? {
                  user_id: u.id,
                  presence: r.presence,
                  phone: r.phone === '+' ? '+' : '',
                  bug: Number(r.bug),
                  anxiety: !!r.anxiety,
                  mystery: !!r.mystery,
                  weapon: r.weapon,
                  multiverse: r.multiverse,
                  multiverse_points: r.multiverse_points,
                  fruit_points: r.fruit_points,
                  imported_points_offset: r.imported_points_offset || 0,
                }
              : { ...makeRow(u), ...(data.importedRegistry?.[u.id] || {}) };
          }),
        );
        setGrades(data.grades || []);
        setImportedPoints(data.importedPoints || {});
        setOtherDailyPoints(data.otherDailyPoints || {});
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
    fetch(`/api/data?date=${date}&totalsOnly=1`)
      .then((response) => {
        if (!response.ok) throw new Error('Caricamento totali non riuscito.');
        return response.json();
      })
      .then((data) => {
        if (!live) return;
        setTotals(data.totals || {});
        setTotalsLoadedKey(totalsKey);
      })
      .catch(() => {
        if (live) setMessage('Impossibile caricare i totali dei punti.');
      });
    return () => {
      live = false;
    };
  }, [date, totalsKey]);
  const summary = useMemo(
    () => ({
      totali: filtered.length + narrators.length,
      narratori: narrators.length,
      registrati:
        filtered.filter((user) => !user.email.endsWith('@studenti.invalid')).length +
        narrators.length,
      nonRegistrati: filtered.filter((user) => user.email.endsWith('@studenti.invalid')).length,
    }),
    [filtered, narrators],
  );
  const detailUsers = [...filtered, ...narrators]
    .filter((user) => {
      const registered = !user.email.endsWith('@studenti.invalid');
      if (userStatus === 'registered' && !registered) return false;
      if (userStatus === 'unregistered' && registered) return false;
      if (userStatus === 'narrators' && user.role !== 'admin') return false;
      return `${user.last_name} ${user.first_name} ${user.class_code} ${registered ? user.email : ''}`
        .toLocaleLowerCase('it-IT')
        .includes(userSearch.trim().toLocaleLowerCase('it-IT'));
    })
    .sort((a, b) =>
      `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`, 'it'),
    );
  function sortValue(user: User): string | number {
    const row = rows.find((item) => item.user_id === user.id) || makeRow(user);
    switch (sort.key) {
      case 'pirate':
        return `${user.last_name} ${user.first_name}`;
      case 'crew':
        return crews.find((crew) => crew.id === user.crew_id)?.name || '';
      case 'weapon':
        return row.weapon;
      case 'presence':
        return presencePoints(row.presence);
      case 'phone':
        return phonePoints(row.phone);
      case 'bug':
        return row.bug * POINT_RULES.bug;
      case 'anxiety':
        return row.anxiety ? POINT_RULES.anxiety : 0;
      case 'mystery':
        return row.mystery ? POINT_RULES.mystery : 0;
      case 'multiverse':
        return row.multiverse_points;
      case 'dream':
        return managedDreams
          .filter((dream) => dream.user_id === user.id && dream.date === date)
          .reduce((sum, dream) => sum + dream.points, 0);
      case 'grades':
        return grades
          .filter((grade) => grade.user_id === user.id)
          .reduce((sum, grade) => sum + grade.points, 0);
      case 'day':
        return (
          dayPoints(row) +
          (otherDailyPoints[user.id] ?? 0) +
          (importedPoints[user.id] ?? 0) +
          grades
            .filter((grade) => grade.user_id === user.id)
            .reduce((sum, grade) => sum + grade.points, 0) +
          managedDreams
            .filter((dream) => dream.user_id === user.id && dream.date === date)
            .reduce((sum, dream) => sum + dream.points, 0)
        );
      case 'total':
        return totals[user.id] ?? 0;
    }
  }
  const sortedMembers = [...filtered].sort((a, b) => {
    const first = sortValue(a),
      second = sortValue(b);
    const difference =
      typeof first === 'number' && typeof second === 'number'
        ? first - second
        : String(first).localeCompare(String(second), 'it', { sensitivity: 'base' });
    return (
      (sort.direction === 'asc' ? difference : -difference) ||
      `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`, 'it', {
        sensitivity: 'base',
      }) ||
      a.id - b.id
    );
  });
  function changeSort(key: RegistrySortKey) {
    setSort((current) => ({
      key,
      direction:
        current.key === key
          ? current.direction === 'asc'
            ? 'desc'
            : 'asc'
          : textSortKeys.includes(key)
            ? 'asc'
            : 'desc',
    }));
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
      setMessage(
        `Registro ${cls}${subject ? ` · ${subject}` : ''} salvato. Le taglie sono aggiornate.`,
      );
      setTotalsRevision((revision) => revision + 1);
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
                updateRegistryURL(cls, e.target.value);
                setLoadedKey('');
                setMessage('');
                setModal(null);
              }}
            />
          </label>
          <label>
            Classe
            <select
              aria-label="Classe"
              value={cls}
              disabled={busy}
              onChange={(e) => {
                setCls(e.target.value);
                updateRegistryURL(e.target.value);
                setRouteYear('');
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
          <label>
            Materia
            <select
              aria-label="Materia"
              required
              value={subject}
              disabled={busy}
              onChange={(e) => {
                setSubject(e.target.value);
                updateRegistryURL(cls, date, e.target.value);
                setLoadedKey('');
                setMessage('');
                setModal(null);
              }}
            >
              <option value="" disabled>
                Seleziona una materia
              </option>
              <option value="TPSIT">TPSIT</option>
              <option value="SER">SER</option>
            </select>
          </label>
          <label>
            Ciurma
            <select
              aria-label="Ciurma"
              value={crew}
              disabled={!cls}
              onChange={(e) => setCrew(e.target.value)}
            >
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
        <Link className="button outline" href="/viaggio">
          Classifica di tutte le classi
        </Link>
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
        <button
          type="button"
          className="admin-tile admin-tile-trigger"
          aria-label="Apri dettagli utenti"
          aria-haspopup="dialog"
          onClick={() => setModal('users')}
        >
          <span className="admin-tile-title">
            <Users size={19} />
            <span className="admin-tile-heading">Utenti</span>
          </span>
          {Object.entries(summary).map(([label, n]) => (
            <span className="stat-line" key={label}>
              <span>
                {label === 'nonRegistrati'
                  ? 'Non registrati'
                  : label[0].toUpperCase() + label.slice(1)}
              </span>
              <strong>{n}</strong>
            </span>
          ))}
          <span className="admin-tile-cta">
            Visualizza dettagli <ArrowRight size={16} />
          </span>
        </button>
        <button
          type="button"
          className="admin-tile admin-tile-trigger"
          aria-label="Apri dettagli rotte"
          aria-haspopup="dialog"
          onClick={() => {
            setRouteClass(cls);
            setRouteYear('');
            setRouteMessage('');
            setModal('routes');
          }}
        >
          <span className="admin-tile-title">
            <ShipWheel size={19} />
            <span className="admin-tile-heading">Rotte</span>
          </span>
          <span className="tile-hint">
            {cls
              ? managedRoutes.filter((route) => route.class_code === cls).length + ' rotte · ' + cls
              : 'Consulta le rotte e scegli la classe da modificare.'}
          </span>
          <span className="admin-tile-cta">
            Visualizza e modifica <ArrowRight size={16} />
          </span>
        </button>
        <section className="admin-tile">
          <div className="admin-tile-title">
            <Settings2 size={19} />
            <h2>Ruoli</h2>
          </div>
          {!cls ? (
            <p className="tile-hint">Seleziona una classe per assegnare i ruoli.</p>
          ) : (
            <div className="roles-editor">
              {filtered.map((u) => (
                <div key={u.id}>
                  <span>
                    {u.first_name} {u.last_name}
                  </span>
                  <input
                    aria-label={`Ruolo di ${u.first_name} ${u.last_name}`}
                    list="crew-role-options"
                    maxLength={120}
                    value={roleDrafts[u.id] ?? u.roles}
                    onChange={(e) => setRoleDrafts((old) => ({ ...old, [u.id]: e.target.value }))}
                  />
                  <button
                    type="button"
                    aria-label={`Salva ruolo di ${u.first_name} ${u.last_name}`}
                    disabled={managementBusy || !(roleDrafts[u.id] ?? u.roles).trim()}
                    onClick={async () => {
                      setManagementBusy(true);
                      try {
                        const role = (roleDrafts[u.id] ?? u.roles).trim();
                        await post('role', { user_id: u.id, role });
                        setMembers((old) =>
                          old.map((member) =>
                            member.id === u.id ? { ...member, roles: role } : member,
                          ),
                        );
                        setRoleDrafts((old) => ({ ...old, [u.id]: role }));
                        setManagementMessage('Ruolo aggiornato.');
                      } catch (err) {
                        setManagementMessage((err as Error).message);
                      } finally {
                        setManagementBusy(false);
                      }
                    }}
                  >
                    <Save size={15} />
                  </button>
                </div>
              ))}
              <datalist id="crew-role-options">
                {['Capitano', 'Navigatore', 'Archeologo', 'Equipaggio'].map((role) => (
                  <option key={role} value={role} />
                ))}
              </datalist>
              {crew ? (
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
              ) : null}
            </div>
          )}
        </section>
      </div>
      {managementMessage ? (
        <p role="status" className="admin-message">
          {managementMessage}
        </p>
      ) : null}
      {dreamStudent ? (
        <AdminDreams
          key={dreamStudent.id}
          student={dreamStudent}
          date={date}
          dreams={managedDreams}
          onChange={(updated) => {
            setManagedDreams(updated);
            setTotalsRevision((revision) => revision + 1);
          }}
          onClose={() => setDreamStudentId(null)}
        />
      ) : null}
      <section className="registry-section">
        <div className="registry-heading">
          <div>
            <span className="section-index">Registro della lezione</span>
            <h2>{cls ? `Registro punti · ${cls}` : 'Registro punti'}</h2>
            <p>
              {new Date(date + 'T12:00:00').toLocaleDateString('it-IT', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </p>
            <p>
              {filtered.length} pirati · {cls || 'tutte le classi'} ·{' '}
              {subject || 'Materia da selezionare'}
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
        <p className="table-scroll-hint">
          Clicca sulle intestazioni per ordinare. Scorri lateralmente per vedere tutte le colonne.
        </p>
        {!cls ? <p>Seleziona una classe per compilare il registro.</p> : null}
        {cls && !subject ? <p>Seleziona una materia per compilare il registro.</p> : null}
        <fieldset
          disabled={busy || !registryWritable}
          style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
        >
          <div className="table-wrap registry-table">
            <table>
              <thead>
                <tr>
                  {registryColumns.map(([key, label]) => (
                    <th
                      key={key}
                      scope="col"
                      aria-sort={
                        sort.key === key
                          ? sort.direction === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                      }
                    >
                      <button
                        type="button"
                        className="registry-sort-button"
                        aria-label={`Ordina per ${label}`}
                        onClick={() => changeSort(key)}
                        disabled={
                          busy ||
                          (!textSortKeys.includes(key) &&
                            (key === 'total' ? totalsLoadedKey !== totalsKey : !registryReady))
                        }
                      >
                        {label}
                        {sort.key === key ? (
                          sort.direction === 'asc' ? (
                            <ArrowUp size={13} aria-hidden="true" />
                          ) : (
                            <ArrowDown size={13} aria-hidden="true" />
                          )
                        ) : (
                          <ArrowUpDown size={13} aria-hidden="true" />
                        )}
                      </button>
                      {key === 'presence' || key === 'phone' ? (
                        <input
                          type="checkbox"
                          className="registry-select-all"
                          aria-label={
                            key === 'presence'
                              ? 'Seleziona tutte le presenze'
                              : 'Seleziona tutti i telefoni'
                          }
                          disabled={busy || !registryWritable || !filtered.length}
                          checked={
                            !!filtered.length &&
                            filtered.every(
                              (u) =>
                                rows.find((r) => r.user_id === u.id)?.[key] ===
                                (key === 'presence' ? 'P' : '+'),
                            )
                          }
                          ref={(node) => {
                            if (node) {
                              const count = filtered.filter(
                                (u) =>
                                  rows.find((r) => r.user_id === u.id)?.[key] ===
                                  (key === 'presence' ? 'P' : '+'),
                              ).length;
                              node.indeterminate = count > 0 && count < filtered.length;
                            }
                          }}
                          onChange={(e) => {
                            const value = e.target.checked ? (key === 'presence' ? 'P' : '+') : '';
                            const ids = new Set(filtered.map((u) => u.id));
                            setRows((old) =>
                              old.map((row) =>
                                ids.has(row.user_id) ? { ...row, [key]: value } : row,
                              ),
                            );
                          }}
                        />
                      ) : null}
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
                    .filter((dream) => dream.user_id === u.id && dream.date === date)
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
                          {r.weapon.includes(', ') ? <option>{r.weapon}</option> : null}
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
                        <small className="points-chip">{presencePoints(r.presence)}</small>
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
                      <td>
                        <input
                          type="number"
                          min="0"
                          max="1000000"
                          step="1"
                          aria-label={`Bug di ${u.first_name}`}
                          disabled={busy || !registryWritable}
                          value={r.bug}
                          onChange={(e) => {
                            const count = Number(e.target.value);
                            if (Number.isSafeInteger(count) && count >= 0 && count <= 1000000)
                              change(u.id, { bug: count });
                          }}
                        />
                        <small className="points-chip">+{r.bug * POINT_RULES.bug}</small>
                      </td>
                      {(['anxiety', 'mystery'] as const).map((k) => (
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
                          {registryReady
                            ? new Intl.NumberFormat('it-IT').format(
                                dayPoints(r) +
                                  gradeSum +
                                  dreamPoints +
                                  (importedPoints[u.id] ?? 0) +
                                  (otherDailyPoints[u.id] ?? 0),
                              )
                            : '—'}
                        </strong>
                      </td>
                      <td>
                        <strong title="Saldo complessivo salvato">
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
              <button
                type="button"
                className="table-action"
                disabled={mysteryBusy}
                aria-label={`Elimina mistero ${m.title}`}
                onClick={() => {
                  setMysteryMessage('');
                  setDeletingMystery(m);
                }}
              >
                <Trash2 size={15} /> Elimina
              </button>
              <label>
                <input
                  type="checkbox"
                  disabled={mysteryBusy}
                  checked={!!m.revealed}
                  onChange={async (e) => {
                    const revealed = e.target.checked;
                    setMysteryBusy(true);
                    try {
                      await post('mystery', { id: m.id, revealed });
                      setMysteryMessage(revealed ? 'Mistero svelato.' : 'Mistero nascosto.');
                      setSecrets((old) =>
                        old.map((item) =>
                          item.id === m.id ? { ...item, revealed: Number(revealed) } : item,
                        ),
                      );
                    } catch (err) {
                      setMysteryMessage((err as Error).message);
                    } finally {
                      setMysteryBusy(false);
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
                      disabled={mysteryBusy}
                      checked={found}
                      onChange={async (e) => {
                        const next = [...(JSON.parse(m.clues) as boolean[])];
                        next[index] = e.target.checked;
                        setMysteryBusy(true);
                        try {
                          await post('mystery-clue', { id: m.id, index, found: next[index] });
                          setMysteryMessage('Indizio aggiornato.');
                          setSecrets((old) =>
                            old.map((item) =>
                              item.id === m.id ? { ...item, clues: JSON.stringify(next) } : item,
                            ),
                          );
                        } catch (err) {
                          setMysteryMessage((err as Error).message);
                        } finally {
                          setMysteryBusy(false);
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
            setMysteryBusy(true);
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
              setMysteryMessage('Mistero aggiunto.');
            } catch (err) {
              setMysteryMessage((err as Error).message);
            } finally {
              setMysteryBusy(false);
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
          <button className="button outline" type="submit" disabled={mysteryBusy}>
            <Plus size={16} /> Aggiungi mistero
          </button>
        </form>
        {mysteryMessage ? (
          <p role="status" className="admin-message">
            {mysteryMessage}
          </p>
        ) : null}
      </section>
      {deletingMystery ? (
        <Modal
          title="Elimina mistero"
          onClose={() => {
            if (!mysteryBusy) setDeletingMystery(null);
          }}
        >
          <p>Eliminare “{deletingMystery.title}” e i suoi indizi?</p>
          <button
            className="button navy"
            disabled={mysteryBusy}
            onClick={async () => {
              setMysteryBusy(true);
              try {
                await post('mystery-delete', { id: deletingMystery.id });
                setSecrets((old) => old.filter((m) => m.id !== deletingMystery.id));
                setDeletingMystery(null);
                setMysteryMessage('Mistero eliminato.');
              } catch (error) {
                setMysteryMessage((error as Error).message);
                setDeletingMystery(null);
              } finally {
                setMysteryBusy(false);
              }
            }}
          >
            {mysteryBusy ? 'Eliminazione…' : 'Conferma eliminazione'}
          </button>
        </Modal>
      ) : null}
      {modal === 'users' ? (
        <Modal title="Dettagli utenti" onClose={() => setModal(null)}>
          <div className="admin-detail-panel">
            <p>
              {cls ? 'Studenti di ' + cls : 'Studenti di tutte le classi'}
              {crew ? ' · ' + (crews.find((item) => item.id === Number(crew))?.name || '') : ''} e
              narratori del sito.
            </p>
            <div className="admin-detail-filters">
              <label className="modal-field">
                Cerca utenti
                <input
                  type="search"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Nome, classe o email"
                />
              </label>
              <label className="modal-field">
                Stato utenti
                <select value={userStatus} onChange={(e) => setUserStatus(e.target.value)}>
                  <option value="all">Tutti</option>
                  <option value="registered">Registrati</option>
                  <option value="unregistered">Non registrati</option>
                  <option value="narrators">Narratori</option>
                </select>
              </label>
            </div>
            <p>{detailUsers.length} utenti visualizzati</p>
            {detailUsers.length ? (
              <ul className="admin-user-list">
                {detailUsers.map((member) => {
                  const registered = !member.email.endsWith('@studenti.invalid');
                  return (
                    <li key={member.id}>
                      <div className="admin-user-heading">
                        <h3>
                          {member.last_name} {member.first_name}
                        </h3>
                        <span className="admin-user-status">
                          {registered ? 'Registrato' : 'Non registrato'}
                        </span>
                      </div>
                      <dl className="admin-user-details">
                        <div>
                          <dt>Classe</dt>
                          <dd>{member.class_code || '—'}</dd>
                        </div>
                        <div>
                          <dt>Ciurma</dt>
                          <dd>{crews.find((item) => item.id === member.crew_id)?.name || '—'}</dd>
                        </div>
                        <div>
                          <dt>Ruolo</dt>
                          <dd>
                            {member.role === 'admin' ? 'Narratore' : member.roles || 'Studente'}
                          </dd>
                        </div>
                        <div>
                          <dt>Email</dt>
                          <dd>{registered ? member.email : 'Non ancora registrato'}</dd>
                        </div>
                      </dl>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p>Nessun utente corrisponde ai filtri.</p>
            )}
          </div>
        </Modal>
      ) : null}
      {modal === 'routes' ? (
        <Modal
          title="Dettagli rotte"
          onClose={() => {
            if (!managementBusy) setModal(null);
          }}
        >
          <div className="admin-detail-panel">
            <label className="modal-field">
              Classe delle rotte
              <select
                value={routeClass}
                disabled={managementBusy}
                onChange={(e) => {
                  setRouteClass(e.target.value);
                  setRouteYear('');
                  setRouteMessage('');
                }}
              >
                <option value="">Seleziona una classe</option>
                {classes.map((classCode) => (
                  <option key={classCode} value={classCode}>
                    {classCode}
                  </option>
                ))}
              </select>
            </label>
            {!routeClass ? (
              <p className="tile-hint">Seleziona una classe per modificare le rotte.</p>
            ) : (
              <>
                <label className="route-year-filter">
                  Anno delle rotte
                  <select value={routeYear} onChange={(e) => setRouteYear(e.target.value)}>
                    <option value="">Tutti gli anni</option>
                    {[
                      ...new Set(
                        managedRoutes.filter((r) => r.class_code === routeClass).map((r) => r.year),
                      ),
                    ].map((year) => (
                      <option key={year} value={year}>
                        {year}° anno
                      </option>
                    ))}
                  </select>
                </label>
                <div className="route-editor">
                  {managedRoutes
                    .filter(
                      (r) =>
                        r.class_code === routeClass && (!routeYear || r.year === Number(routeYear)),
                    )
                    .map((r) => (
                      <div key={r.id}>
                        <span title={`${r.year}° anno`}>
                          {r.year}° · {r.ordinal}ª
                        </span>
                        <input
                          aria-label={`Nome rotta ${r.ordinal}, anno ${r.year}`}
                          value={routeNames[r.id] ?? r.name}
                          onChange={(e) =>
                            setRouteNames((old) => ({ ...old, [r.id]: e.target.value }))
                          }
                        />
                        <button
                          aria-label={`Salva rotta ${r.ordinal}, anno ${r.year}`}
                          disabled={managementBusy}
                          onClick={async () => {
                            setManagementBusy(true);
                            try {
                              const updated = {
                                id: r.id,
                                name: routeNames[r.id] ?? r.name,
                                start_date: routeDates[r.id]?.start ?? r.start_date,
                                end_date: routeDates[r.id]?.end ?? r.end_date,
                              };
                              await post('route', updated);
                              setManagedRoutes((old) =>
                                old.map((route) =>
                                  route.id === r.id ? { ...route, ...updated } : route,
                                ),
                              );
                              setRouteMessage('Rotta aggiornata.');
                            } catch (e) {
                              setRouteMessage((e as Error).message);
                            } finally {
                              setManagementBusy(false);
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
                              aria-label={`Inizio rotta ${r.ordinal}, anno ${r.year}`}
                              value={routeDates[r.id]?.start ?? r.start_date}
                              onChange={(e) =>
                                setRouteDates((old) => ({
                                  ...old,
                                  [r.id]: {
                                    start: e.target.value,
                                    end: old[r.id]?.end ?? r.end_date,
                                  },
                                }))
                              }
                            />
                          </label>
                          <label>
                            Al
                            <input
                              type="date"
                              aria-label={`Fine rotta ${r.ordinal}, anno ${r.year}`}
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
              </>
            )}
            {routeClass &&
            !managedRoutes.some(
              (route) =>
                route.class_code === routeClass && (!routeYear || route.year === Number(routeYear)),
            ) ? (
              <p>Nessuna rotta disponibile per questa selezione.</p>
            ) : null}
            {routeMessage ? (
              <p role="status" className="admin-message">
                {routeMessage}
              </p>
            ) : null}
          </div>
        </Modal>
      ) : null}
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
            Numero di multiversi
            <input
              type="number"
              min="0"
              step="1"
              max="1000000"
              value={active.multiverse_points / POINT_RULES.multiverse}
              onChange={(e) => {
                const count = Number(e.target.value);
                if (Number.isSafeInteger(count) && count >= 0 && count <= 1000000)
                  change(active.user_id, { multiverse_points: count * POINT_RULES.multiverse });
              }}
            />
            <small>+{active.multiverse_points} punti</small>
          </label>
          <button className="button navy" onClick={() => setModal(null)}>
            Conferma
          </button>
        </Modal>
      ) : null}
      {modal === 'grade' && selected ? (
        <GradeModal
          date={date}
          userId={selected}
          grades={grades.filter((g) => g.user_id === selected)}
          onAdd={(g) => {
            setGrades((old) => [...old, g]);
            setTotalsRevision((revision) => revision + 1);
          }}
          onClose={() => setModal(null)}
        />
      ) : null}
      {modal === 'upload' ? <UploadModal onClose={() => setModal(null)} /> : null}
    </>
  );
}
function GradeModal({
  date,
  userId,
  grades,
  onAdd,
  onClose,
}: {
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
          {Math.round(Number(grade) * GRADE_MULTIPLIERS[type as 'verifica' | 'progetto'])} punti
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
              user_id: userId,
              date,
              type,
              grade: Number(grade),
            });
            onAdd({
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
