'use client';
import { useState } from 'react';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import { CrewEmblem, Modal } from './interactive';
import { StudentBounty } from './student-bounty';
import type { Crew, Daily, User } from '@/lib/db';
import { studentPortraitUrl } from '@/lib/student-portraits';
import { StudentPointsDialog } from './admin-management';
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
  daily,
  periodStart,
  periodEnd,
  linkedPlutonDates = [],
}: {
  user: User;
  score: number;
  rank: number;
  crew: Crew | null;
  members: (User & { score: number })[];
  daily: Daily[];
  periodStart: string;
  periodEnd: string;
  linkedPlutonDates?: string[];
}) {
  const [modal, setModal] = useState<'bounty' | 'crew' | 'Poseidon' | 'Pluton' | 'Uranus' | null>(
    null,
  );
  const periodDaily = daily.filter((d) =>
    periodStart && periodEnd ? d.date >= periodStart && d.date <= periodEnd : false,
  );
  const used = new Set(
    ['Poseidon', 'Pluton', 'Uranus'].filter((name) => {
      const dates = periodDaily
        .filter((d) => d.weapon.split(', ').includes(name))
        .map((d) => d.date);
      if (name === 'Pluton')
        dates.push(
          ...linkedPlutonDates.filter(
            (date) => periodStart && periodEnd && date >= periodStart && date <= periodEnd,
          ),
        );
      const lastUse = dates.sort().at(-1);
      return lastUse && !periodDaily.some((d) => d.mystery && d.date >= lastUse);
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
                <Image src={`/images/${image}.png`} alt="" width={112} height={112} />
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
        <StudentPointsDialog
          student={user}
          date={new Date().toLocaleDateString('en-CA')}
          onClose={() => setModal(null)}
        />
      ) : null}
      {modal === 'crew' ? (
        <Modal title="Dettaglio ciurma" onClose={() => setModal(null)}>
          <div className="modal-crew">
            <CrewEmblem flag={crew?.flag} name={crew?.name} size="large" />
            <h3>{crew?.name || 'Senza ciurma'}</h3>
          </div>
          {members.length ? <p className={styles.caption}>Punteggio attuale</p> : null}
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
              src={`/images/${modal.toLowerCase()}.png`}
              alt={`Immagine di ${modal}`}
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
