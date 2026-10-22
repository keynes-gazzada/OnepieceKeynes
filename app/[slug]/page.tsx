import type { Metadata } from 'next';
import { Fragment } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Compass,
  Flag,
  Map,
  Trophy,
  Waves,
} from 'lucide-react';
import { AuthForm, ChangePassword, CrewEmblem } from '@/components/interactive';
import { RulesPage } from '@/components/rules-page';
import { ProfilePanels } from '@/components/profile-panels';
import { MysteriesPage } from '@/components/mysteries-page';
import { AdminPanel } from '@/components/admin-panel';
import { StudentBounty } from '@/components/student-bounty';
import { currentUser, requireUser } from '@/lib/auth';
import { isISODate } from '@/lib/dates';
import { unifiedDaily } from '@/lib/unified-registry';
import {
  all,
  dailyPoints,
  leaderboard,
  leaderboardForRange,
  one,
  scoreFor,
  type Crew,
  type Daily,
  type Grade,
  type Mystery,
  type PointEvent,
  type Route,
  type User,
} from '@/lib/database';
export const dynamic = 'force-dynamic';
const titles: Record<string, string> = {
  accedi: 'Accedi',
  registrati: 'Registrazione',
  recupero: 'Recupero password',
  profilo: 'Profilo',
  viaggio: 'Caccia al tesoro',
  rotte: 'Rotte',
  misteri: 'Misteri',
  regole: 'Regole',
  narratore: 'Narratore',
};
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return { title: titles[slug] || 'Keynes Grand Line' };
}
const money = (n: number) => new Intl.NumberFormat('it-IT').format(n);
function Heading({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <div className="page-heading">
      <span>{eyebrow}</span>
      <h1>{title}</h1>
      {sub ? <p>{sub}</p> : null}
    </div>
  );
}
function Bounty({
  firstName,
  lastName,
  score,
  compact = false,
}: {
  firstName: string;
  lastName: string;
  score: number;
  compact?: boolean;
}) {
  return (
    <StudentBounty firstName={firstName} lastName={lastName} score={score} compact={compact} />
  );
}
function authPage(mode: 'login' | 'register' | 'forgot' | 'reset', token?: string) {
  const title = {
    login: 'Accedi',
    register: 'Registrati',
    forgot: 'Recupero password',
    reset: 'Nuova password',
  }[mode];
  const description = {
    login: 'Accedi con la tua email e la password del registro.',
    register:
      'Inserisci la mail scolastica: recuperiamo i tuoi dati dall’elenco studenti. Scegli poi la password.',
    forgot: 'Ti invieremo una mail per cambiare la password.',
    reset: 'Scegli una nuova password per il tuo account.',
  }[mode];
  return (
    <section className={`auth-page auth-page-${mode}`}>
      <div className="auth-frame">
        <Link href="/" className="back-link">
          <ArrowLeft size={17} /> Torna alla home
        </Link>
        <header className="auth-masthead">
          <Image
            src="/images/logo-keynes.webp"
            alt="J. M. Keynes"
            width={600}
            height={338}
            unoptimized
            className="auth-keynes-logo"
            priority
          />
          <span>Registro punti</span>
        </header>
        <div className="auth-panel">
          <h1>{title}</h1>
          <p>{description}</p>
          <AuthForm mode={mode} token={token} />
        </div>
      </div>
    </section>
  );
}
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  if (slug === 'accedi' || slug === 'registrati' || slug === 'recupero') {
    const user = await currentUser();
    if (user && slug !== 'recupero') redirect(user.role === 'admin' ? '/narratore' : '/profilo');
    return authPage(
      slug === 'accedi'
        ? 'login'
        : slug === 'registrati'
          ? 'register'
          : typeof query.token === 'string'
            ? 'reset'
            : 'forgot',
      typeof query.token === 'string' ? query.token : undefined,
    );
  }
  if (!titles[slug]) notFound();
  if (slug === 'regole') return <RulesPage />;
  const user = await requireUser();
  if (slug === 'profilo') {
    if (user.role === 'admin') redirect('/narratore');
    const [crew, grades, pointEvents, daily, rankings, dreamScores, routes, crewMembers] =
      await Promise.all([
        user.crew_id ? one<Crew>('SELECT * FROM crews WHERE id=?', user.crew_id) : undefined,
        all<Grade>('SELECT * FROM grades WHERE user_id=? ORDER BY date DESC,id DESC', user.id),
        all<PointEvent>(
          'SELECT * FROM point_events WHERE user_id=? ORDER BY date DESC,id DESC',
          user.id,
        ),
        all<Daily>('SELECT * FROM daily WHERE user_id=? ORDER BY date DESC,id DESC', user.id).then(
          unifiedDaily,
        ),
        leaderboard(),
        all<{ date: string; points: number }>(
          'SELECT date,points FROM dreams WHERE user_id=?',
          user.id,
        ),
        all<Route>(
          'SELECT * FROM routes WHERE class_code=? ORDER BY year,ordinal',
          user.class_code,
        ),
        user.crew_id
          ? all<User>(
              'SELECT id,email,first_name,last_name,class_code,role,crew_id,roles,last_password_change FROM users WHERE crew_id=? ORDER BY last_name',
              user.crew_id,
            )
          : [],
      ]);
    const scoresByUser = new globalThis.Map(rankings.map((member) => [member.id, member.score]));
    const score = scoresByUser.get(user.id) || 0;
    const rank =
      rankings
        .filter((member) => member.class_code === user.class_code)
        .findIndex((member) => member.id === user.id) + 1;
    const dreamPointsInRange = (start: string, end: string) =>
      dreamScores
        .filter((dream) => dream.date >= start && dream.date <= end)
        .reduce((sum, dream) => sum + dream.points, 0);
    const today = new Date().toISOString().slice(0, 10);
    const current =
      routes.find((r) => today >= r.start_date && today <= r.end_date) || routes.at(-1);
    const rankRanges = new globalThis.Map<string, [string, string]>();
    for (const route of routes) {
      rankRanges.set(`${route.start_date}|${route.end_date}`, [route.start_date, route.end_date]);
      const yearRoutes = routes.filter((candidate) => candidate.year === route.year);
      const start = yearRoutes[0].start_date;
      const end = yearRoutes.at(-1)!.end_date;
      rankRanges.set(`${start}|${end}`, [start, end]);
    }
    const ranksByRange = new globalThis.Map(
      await Promise.all(
        [...rankRanges].map(
          async ([key, [start, end]]) =>
            [
              key,
              (await leaderboardForRange(user.class_code, start, end)).find(
                (member) => member.id === user.id,
              )?.position || 0,
            ] as const,
        ),
      ),
    );
    return (
      <div className="container page onepiece-page profile-page">
        <Heading
          eyebrow={`Pirata · ${user.class_code}`}
          title="La tua taglia"
          sub="Punti, voti e attività del registro unico."
        />
        <div className="profile-intro">
          <div>
            <span className="overline">Pirata a bordo</span>
            <h2>
              {user.last_name} {user.first_name}
            </h2>
            <span className="role-pill">{user.roles}</span>
            <div className="profile-password">
              <ChangePassword />
              <small>
                Ultimo cambio: {new Date(user.last_password_change).toLocaleDateString('it-IT')}
              </small>
            </div>
          </div>
          <div className="profile-balance">
            <span>Saldo punti</span>
            <strong>
              {money(score)} <small>฿</small>
            </strong>
            <p>Posizione #{rank || '—'} nella classe</p>
            <Link href="/viaggio">
              Apri la classifica <ArrowRight size={15} />
            </Link>
          </div>
          <div className="current-route">
            <Compass size={30} />
            <span>Rotta attuale</span>
            <strong>
              {current ? `${current.year}° anno · ${current.ordinal}ª rotta` : user.class_code}
            </strong>
            <p>{current?.name || 'Rotta da assegnare'}</p>
          </div>
        </div>
        <div className="profile-cards">
          <ProfilePanels
            user={user}
            score={score}
            rank={rank}
            crew={crew || null}
            members={await Promise.all(
              crewMembers.map(async (member) => ({
                ...member,
                score: scoresByUser.get(member.id) ?? (await scoreFor(member.id)),
              })),
            )}
            grades={grades}
            pointEvents={pointEvents}
            daily={daily}
            periodStart={current?.start_date || ''}
            periodEnd={current?.end_date || ''}
          />
        </div>
        <section className="section-block">
          <div className="section-heading left">
            <span className="section-index">Storico del pirata</span>
            <h2>La tua rotta in numeri</h2>
          </div>
          <p className="table-scroll-hint">Scorri lateralmente per vedere tutti i valori.</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Periodo</th>
                  <th>Posizione</th>
                  <th>Taglia</th>
                  <th>Frutti</th>
                </tr>
              </thead>
              <tbody>
                <tr className="table-total">
                  <td>Totale</td>
                  <td>#{rank || '—'}</td>
                  <td>{money(score)} ฿</td>
                  <td>{money(daily.reduce((sum, row) => sum + row.fruit_points, 0))}</td>
                </tr>
                {routes.map((r) => {
                  const g = grades
                    .filter((x) => x.date >= r.start_date && x.date <= r.end_date)
                    .reduce((s, x) => s + x.points, 0);
                  const imported = pointEvents
                    .filter((x) => x.date >= r.start_date && x.date <= r.end_date)
                    .reduce((s, x) => s + x.points, 0);
                  const periodDaily = daily.filter(
                    (x) => x.date >= r.start_date && x.date <= r.end_date,
                  );
                  const d =
                    periodDaily.reduce((s, x) => s + dailyPoints(x), 0) +
                    dreamPointsInRange(r.start_date, r.end_date);
                  const periodRank = ranksByRange.get(`${r.start_date}|${r.end_date}`) || 0;
                  const yearRoutes = routes.filter((x) => x.year === r.year);
                  const yearStart = yearRoutes[0].start_date,
                    yearEnd = yearRoutes.at(-1)!.end_date;
                  const yearScore =
                    dreamPointsInRange(yearStart, yearEnd) +
                    grades
                      .filter((x) => x.date >= yearStart && x.date <= yearEnd)
                      .reduce((s, x) => s + x.points, 0) +
                    pointEvents
                      .filter((x) => x.date >= yearStart && x.date <= yearEnd)
                      .reduce((s, x) => s + x.points, 0) +
                    daily
                      .filter((x) => x.date >= yearStart && x.date <= yearEnd)
                      .reduce((s, x) => s + dailyPoints(x), 0);
                  const yearRank = ranksByRange.get(`${yearStart}|${yearEnd}`) || 0;
                  return (
                    <Fragment key={r.id}>
                      {r.ordinal === 1 ? (
                        <tr className="year-total">
                          <td>
                            {r.year}° anno — {r.year_name}
                          </td>
                          <td>#{yearRank || '—'}</td>
                          <td>{money(yearScore)} ฿</td>
                          <td>
                            {money(
                              daily
                                .filter((x) => x.date >= yearStart && x.date <= yearEnd)
                                .reduce((sum, row) => sum + row.fruit_points, 0),
                            )}
                          </td>
                        </tr>
                      ) : null}
                      <tr>
                        <td className="route-indent">
                          {r.ordinal}ª rotta — {r.name}
                        </td>
                        <td>#{periodRank || '—'}</td>
                        <td>{money(g + imported + d)} ฿</td>
                        <td>
                          {money(periodDaily.reduce((sum, row) => sum + row.fruit_points, 0))}
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    );
  }
  if (slug === 'viaggio') {
    const classes = (
      await all<{ class_code: string }>(
        "SELECT DISTINCT class_code FROM users WHERE role='student' AND class_code<>'' ORDER BY class_code",
      )
    ).map((row) => row.class_code);
    const cls =
      user.role === 'admin'
        ? typeof query.classe === 'string' && classes.includes(query.classe)
          ? query.classe
          : ''
        : user.class_code;
    const year = cls && typeof query.anno === 'string' ? Number(query.anno) : 0,
      route = cls && typeof query.rotta === 'string' ? Number(query.rotta) : 0;
    const routes = await all<Route>(
      'SELECT * FROM routes WHERE class_code=? ORDER BY year,ordinal',
      cls,
    );
    const selected = route ? routes.find((r) => r.year === year && r.ordinal === route) : null;
    const sameYear = routes.filter((r) => r.year === year);
    const rankings = selected
      ? await leaderboardForRange(cls, selected.start_date, selected.end_date)
      : year && sameYear.length
        ? await leaderboardForRange(cls, sameYear[0].start_date, sameYear.at(-1)!.end_date)
        : await leaderboard(cls);
    const crews = await all<Crew>(
      cls ? 'SELECT * FROM crews WHERE class_code=?' : 'SELECT * FROM crews',
      ...(cls ? [cls] : []),
    );
    return (
      <div className="container page onepiece-page leaderboard-page">
        <Heading
          eyebrow={`Classifica · ${cls || 'Tutte le classi'}`}
          title="Classifica Grand Line"
          sub="Tutti i punti del registro unico, in ordine di taglia."
        />
        <div className="filter-bar">
          <Link
            href={cls ? `/viaggio?classe=${encodeURIComponent(cls)}` : '/viaggio'}
            className={!year ? 'active' : ''}
          >
            Totale
          </Link>
          <form action="/viaggio" className="inline-filters">
            {user.role === 'admin' ? (
              <select name="classe" defaultValue={cls} aria-label="Classe della classifica">
                <option value="">Tutte le classi</option>
                {classes.map((classCode) => (
                  <option key={classCode}>{classCode}</option>
                ))}
              </select>
            ) : null}
            <select name="anno" defaultValue={year || ''} aria-label="Anno" disabled={!cls}>
              <option value="">Tutti gli anni</option>
              {[...new Set(routes.map((r) => r.year))].map((y) => (
                <option key={y} value={y}>
                  {y}° anno
                </option>
              ))}
            </select>
            <select name="rotta" defaultValue={route || ''} aria-label="Rotta" disabled={!year}>
              <option value="">Tutte le rotte</option>
              {sameYear.map((r) => (
                <option key={r.id} value={r.ordinal}>
                  {r.ordinal}ª · {r.name}
                </option>
              ))}
            </select>
            <button type="submit" className="button small navy">
              Applica
            </button>
          </form>
        </div>
        <div className="leaderboard">
          <div className="leaderboard-title">
            <Trophy size={20} />
            <span>
              {selected
                ? `${selected.ordinal}ª rotta · ${selected.name}`
                : year
                  ? `${year}° anno`
                  : 'Classifica generale'}
            </span>
            <small>{rankings.length} pirati</small>
          </div>
          {rankings.length ? (
            rankings.map((p, i) => {
              const crew = crews.find((c) => c.id === p.crew_id);
              return (
                <div key={p.id} className={`leader-row ${i < 3 ? 'top-three' : ''}`}>
                  <span className="rank">{String(p.position).padStart(2, '0')}</span>
                  <Bounty firstName={p.first_name} lastName={p.last_name} score={p.score} compact />
                  <div className="leader-name">
                    <strong>
                      {p.last_name} {p.first_name}
                    </strong>
                    <span>
                      {p.class_code} · {crew?.name || 'Senza ciurma'}
                    </span>
                  </div>
                  <div className="leader-crew">
                    <CrewEmblem flag={crew?.flag} name={crew?.name} />
                    <span>{crew?.name || '—'}</span>
                  </div>
                  <strong className="leader-score">{money(p.score)} ฿</strong>
                </div>
              );
            })
          ) : (
            <div className="empty-state">Nessun pirata in questa classifica.</div>
          )}
        </div>
      </div>
    );
  }
  if (slug === 'rotte') {
    const [routes, islands] = await Promise.all([
      all<Route>('SELECT * FROM routes WHERE class_code=? ORDER BY year,ordinal', user.class_code),
      all<{ route_id: number; name: string; topic: string }>('SELECT * FROM islands'),
    ]);
    return (
      <div className="container page onepiece-page routes-page">
        <Heading
          eyebrow={`Classe ${user.class_code}`}
          title="La Grand Line"
          sub="Il percorso della tua classe, isola dopo isola."
        />
        <div className="routes-list">
          {[...new Set(routes.map((r) => r.year))].map((year) => (
            <section key={year} className="year-section">
              <div className="year-heading">
                <span>{String(year).padStart(2, '0')}</span>
                <div>
                  <small>Anno {year}</small>
                  <h2>{routes.find((r) => r.year === year)?.year_name}</h2>
                </div>
              </div>
              <div className="route-grid">
                {routes
                  .filter((r) => r.year === year)
                  .map((r) => (
                    <div className="route-card" key={r.id}>
                      <span className="route-number">{r.ordinal}ª rotta</span>
                      <h3>{r.name}</h3>
                      <p>
                        {r.start_date && r.end_date
                          ? `${new Date(r.start_date).toLocaleDateString('it-IT')} – ${new Date(r.end_date).toLocaleDateString('it-IT')}`
                          : 'Date da definire'}
                      </p>
                      <ul>
                        {islands
                          .filter((i) => i.route_id === r.id)
                          .map((i, idx) => (
                            <li key={idx}>
                              <Map size={15} />
                              {i.name} · {i.topic}
                            </li>
                          ))}
                      </ul>
                    </div>
                  ))}
              </div>
            </section>
          ))}
          {!routes.length ? (
            <div className="empty-state">
              Nessuna rotta è stata ancora assegnata alla tua classe. Torna qui dopo l’aggiornamento
              del registro.
            </div>
          ) : null}
        </div>
      </div>
    );
  }
  if (slug === 'misteri') {
    const mysteries = await all<Mystery>('SELECT * FROM mysteries ORDER BY id');
    return <MysteriesPage mysteries={mysteries} />;
  }
  if (slug === 'narratore') {
    if (user.role !== 'admin') redirect('/profilo');
    const [users, narrators, crews, routes, mysteries, dreams] = await Promise.all([
      all<User>(
        "SELECT id,email,first_name,last_name,class_code,role,crew_id,roles,last_password_change FROM users WHERE role='student' ORDER BY class_code,last_name",
      ),
      all<User>(
        "SELECT id,email,first_name,last_name,class_code,role,crew_id,roles,last_password_change FROM users WHERE role='admin' ORDER BY last_name,first_name",
      ),
      all<Crew>('SELECT * FROM crews ORDER BY class_code,name'),
      all<Route>('SELECT * FROM routes ORDER BY class_code,year,ordinal'),
      all<Mystery>('SELECT * FROM mysteries ORDER BY id'),
      all<{
        id: number;
        user_id: number;
        text: string;
        points: number;
        date: string;
      }>('SELECT id,user_id,text,points,date FROM dreams ORDER BY id DESC'),
    ]);
    const classes = [
      ...new Set(
        [...users.map((u) => u.class_code), ...routes.map((r) => r.class_code)].filter(Boolean),
      ),
    ];
    const cls =
      typeof query.classe === 'string' && classes.includes(query.classe)
        ? query.classe
        : classes.includes('3CI')
          ? '3CI'
          : classes[0] || '';
    return (
      <div className="container page onepiece-page admin-page">
        <Heading
          eyebrow="Pannello di bordo"
          title="Registro punti"
          sub="Aggiorna la giornata, importa i dati e gestisci rotte e ruoli."
        />
        <AdminPanel
          key={cls}
          initialClass={cls}
          initialSubject={typeof query.materia === 'string' ? query.materia : undefined}
          initialDate={
            typeof query.data === 'string' && isISODate(query.data) ? query.data : undefined
          }
          users={users}
          narrators={narrators}
          crews={crews}
          routes={routes}
          mysteries={mysteries}
          dreams={dreams}
        />
      </div>
    );
  }
  notFound();
}
