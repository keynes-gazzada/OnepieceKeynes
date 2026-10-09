'use client';
import { useState } from 'react';
import Image from 'next/image';
import { ArrowRight, Skull } from 'lucide-react';
import { CrewEmblem, Modal } from './interactive';
import { StudentBounty } from './student-bounty';
import type { Crew, Daily, Grade, PointEvent, User } from '@/lib/db';
import { studentPortraitUrl } from '@/lib/student-portraits';
import { subjectLabel } from '@/lib/subjects';
import { dailyPoints } from '@/lib/point-rules';
import styles from './crew-members.module.css';
const format = (n: number) => new Intl.NumberFormat('it-IT').format(n);
const weapons = [
  { name: 'Poseidon', image: 'poseidon', theme: 'sea' },
  { name: 'Pluton', image: 'pluton', theme: 'earth' },
  { name: 'Uranus', image: 'uranus', theme: 'sky' },
] as const;
export function ProfilePanels({
  user,
  score,
  rank,
  crew,
  members,
  scoreSubject,
  grades,
  pointEvents,
  daily,
  periodStart,
  periodEnd,
}: {
  user: User;
  score: number;
  rank: number;
  crew: Crew | null;
  members: (User & { score: number })[];
  scoreSubject: string;
  grades: Grade[];
  pointEvents: PointEvent[];
  daily: Daily[];
  periodStart: string;
  periodEnd: string;
}) {
  const [modal, setModal] = useState<'bounty' | 'crew' | 'Poseidon' | 'Pluton' | 'Uranus' | null>(
    null,
  );
  const periodDaily = daily.filter((d) =>
    periodStart && periodEnd ? d.date >= periodStart && d.date <= periodEnd : false,
  );
  const used = new Set(
    ['Poseidon', 'Pluton', 'Uranus'].filter((name) => {
      const lastUse = periodDaily.find((d) => d.weapon === name);
      return lastUse && !periodDaily.some((d) => d.mystery && d.date >= lastUse.date);
    }),
  );
  return (
    <>
      <button className="profile-feature bounty-feature" onClick={() => setModal('bounty')}>
        <span className="feature-label">La tua taglia</span>
        <StudentBounty firstName={user.first_name} lastName={user.last_name} score={score} />
        <div className="feature-foot">
          <span>Posizione #{rank || '—'}</span>
          <ArrowRight size={19} />
        </div>
      </button>
      <button className="profile-feature crew-profile" onClick={() => setModal('crew')}>
        <span className="feature-label">La tua ciurma</span>
        <CrewEmblem flag={crew?.flag} name={crew?.name} size="large" />
        <strong>{crew?.name || 'Senza ciurma'}</strong>
        <div className="feature-foot">
          <span>{members.length} pirati a bordo</span>
          <ArrowRight size={19} />
        </div>
      </button>
      <div className="weapons-profile">
        <h2 className="powers-heading">Frutti &amp; armi ancestrali</h2>
        <div className="fruit-summary">
          <Image
            src="/images/powers/devil-fruit.svg"
            alt="Frutto del diavolo viola con spirali"
            width={112}
            height={112}
          />
          <div>
            <span className="feature-label">Frutti del diavolo</span>
            <strong>
              {format(periodDaily.reduce((sum, row) => sum + row.fruit_points, 0))}{' '}
              <small>punti</small>
            </strong>
            <p>Ottenuti nel periodo attuale</p>
          </div>
        </div>
        <h3 className="feature-label">Armi ancestrali</h3>
        <p>Disponibilità delle armi nel periodo attuale.</p>
        <div className="weapons-list">
          {weapons.map(({ name, image, theme }, i) => (
            <button
              className={`power-card power-${theme} ${used.has(name) ? 'used' : ''}`}
              key={name}
              onClick={() => setModal(name)}
              aria-label={`${name}: ${used.has(name) ? 'già usata' : 'disponibile'}. Vedi dettagli`}
            >
              <div className="power-art">
                <Image src={`/images/powers/${image}.svg`} alt="" width={112} height={112} />
              </div>
              <div className="power-copy">
                <span className="power-number">Arma ancestrale / 0{i + 1}</span>
                <strong>{name}</strong>
                <span className="power-status">{used.has(name) ? 'Già usata' : 'Disponibile'}</span>
              </div>
              <ArrowRight className="power-arrow" size={18} aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
      {modal === 'bounty' ? (
        <Modal title="Dettaglio taglia" onClose={() => setModal(null)}>
          <div className="modal-bounty">
            <Skull />
            <span>Taglia totale</span>
            <strong>{format(score)} ฿</strong>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Periodo</th>
                  <th>Tipologia</th>
                  <th>Punti</th>
                </tr>
              </thead>
              <tbody>
                {pointEvents.map((event) => (
                  <tr key={`e${event.id}`}>
                    <td>{new Date(`${event.date}T12:00:00`).toLocaleDateString('it-IT')}</td>
                    <td>{event.route ? `${event.route}ª rotta` : event.date.slice(0, 4)}</td>
                    <td>
                      {event.type}
                      {event.grade !== null ? ` · ${event.grade}` : ''}
                    </td>
                    <td>{event.points > 0 ? `+${event.points}` : event.points}</td>
                  </tr>
                ))}
                {grades.map((g) => (
                  <tr key={g.id}>
                    <td>{new Date(g.date).toLocaleDateString('it-IT')}</td>
                    <td>{g.date.slice(0, 4)}</td>
                    <td>
                      {g.type} · {g.grade}
                    </td>
                    <td>+{g.points}</td>
                  </tr>
                ))}
                {daily.map((d) => (
                  <tr key={`d${d.id}`}>
                    <td>{new Date(d.date).toLocaleDateString('it-IT')}</td>
                    <td>{d.date.slice(0, 4)}</td>
                    <td>Giornata · {subjectLabel(d.subject) || 'Registro precedente'}</td>
                    <td>
                      {dailyPoints(d)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      ) : null}
      {modal === 'crew' ? (
        <Modal title="Dettaglio ciurma" onClose={() => setModal(null)}>
          <div className="modal-crew">
            <CrewEmblem flag={crew?.flag} name={crew?.name} size="large" />
            <h3>{crew?.name || 'Senza ciurma'}</h3>
          </div>
          {members.length ? (
            <p className={styles.caption}>Punteggio attuale · {scoreSubject}</p>
          ) : null}
          {members.length ? (
            <div className={`member-list ${styles.list}`}>
              {members.map((m) => {
                const portrait = studentPortraitUrl(m.first_name, m.last_name);
                return (
                  <div key={m.id} className={styles.row}>
                    {portrait ? (
                      <Image
                        src={portrait}
                        alt={`Ritratto di ${m.first_name} ${m.last_name}`}
                        width={52}
                        height={52}
                        sizes="52px"
                        className={styles.portrait}
                      />
                    ) : (
                      <span
                        className={styles.initials}
                        aria-label={`Ritratto non disponibile per ${m.first_name} ${m.last_name}`}
                      >
                        {m.first_name.charAt(0)}
                        {m.last_name.charAt(0)}
                      </span>
                    )}
                    <div className={styles.name}>
                      <strong>
                        {m.last_name} {m.first_name}
                      </strong>
                      <span>{m.roles}</span>
                    </div>
                    <span className={styles.score} aria-label={`${format(m.score)} punti`}>
                      <strong>{format(m.score)}</strong>
                      <small>punti</small>
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="empty-state">Nessun componente assegnato.</p>
          )}
        </Modal>
      ) : null}
      {modal && ['Poseidon', 'Pluton', 'Uranus'].includes(modal) ? (
        <Modal title={modal} onClose={() => setModal(null)}>
          <div className={`weapon-detail illustrated-weapon ${used.has(modal) ? 'used' : ''}`}>
            <Image
              src={`/images/powers/${modal.toLowerCase()}.svg`}
              alt={`Illustrazione simbolica di ${modal}`}
              width={160}
              height={160}
            />
            <div>
              <strong>{used.has(modal) ? 'Potere già usato' : 'Potere disponibile'}</strong>
              <p>
                Utilizzabile una volta per periodo. Un mistero risolto dalla ciurma può renderlo
                nuovamente disponibile.
              </p>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
