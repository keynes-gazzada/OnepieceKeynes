import Link from 'next/link';
import { Check, ArrowRight } from 'lucide-react';
import type { Mystery } from '@/lib/db';
import styles from './mysteries-page.module.css';

export function MysteriesPage({ mysteries }: { mysteries: Mystery[] }) {
  const entries = mysteries.map((mystery, index) => ({
    ...mystery,
    number: String(index + 1).padStart(2, '0'),
    clues: JSON.parse(mystery.clues) as boolean[],
  }));
  const pending = entries.filter((entry) => !entry.revealed);
  const revealed = entries.filter((entry) => entry.revealed);

  return (
    <div className={`container page ${styles.page}`}>
      <header className={styles.header}>
        <span className={styles.eyebrow}>Registro di classe</span>
        <h1>Misteri</h1>
        <p>
          Quattro indizi per ogni mistero. Qui trovi quelli raccolti e le soluzioni svelate dal
          Narratore.
        </p>
      </header>

      {entries.length ? (
        <>
          <nav className={styles.index} aria-label="Sezioni dei misteri">
            {pending.length ? (
              <a href="#da-risolvere">
                Da risolvere <span>{pending.length}</span>
              </a>
            ) : null}
            {revealed.length ? (
              <a href="#svelati">
                Svelati <span>{revealed.length}</span>
              </a>
            ) : null}
          </nav>

          {pending.length ? (
            <section id="da-risolvere" className={styles.section} aria-labelledby="pending-title">
              <div className={styles.sectionHeading}>
                <h2 id="pending-title">Da risolvere</h2>
                <span>Indizi trovati / 4</span>
              </div>
              {pending.map((entry) => {
                const found = entry.clues.filter(Boolean).length;
                return (
                  <article
                    className={styles.entry}
                    key={entry.id}
                    aria-labelledby={`mystery-${entry.id}`}
                  >
                    <span className={styles.number} aria-hidden="true">
                      {entry.number}
                    </span>
                    <div className={styles.content}>
                      <div className={styles.entryHeading}>
                        <h3 id={`mystery-${entry.id}`}>Mistero {entry.number}</h3>
                        <span className={styles.count}>
                          {found}
                          <span> / 4</span>
                        </span>
                      </div>
                      <ol className={styles.clues} aria-label={`${found} indizi trovati su 4`}>
                        {entry.clues.map((isFound, index) => (
                          <li key={index} className={isFound ? styles.found : undefined}>
                            <span className={styles.clueNumber}>0{index + 1}</span>
                            <span className={styles.clueLabel}>
                              Indizio {index + 1}
                              <small>{isFound ? 'Trovato' : 'Da trovare'}</small>
                            </span>
                            {isFound ? (
                              <Check size={17} aria-hidden="true" />
                            ) : (
                              <span className={styles.missing} aria-hidden="true">
                                —
                              </span>
                            )}
                          </li>
                        ))}
                      </ol>
                      {found === 4 ? (
                        <p className={styles.waiting}>
                          Tutti gli indizi sono stati trovati. In attesa della rivelazione del
                          Narratore.
                        </p>
                      ) : null}
                    </div>
                  </article>
                );
              })}
              <p className={styles.note}>
                Titolo e soluzione compariranno quando il Narratore svelerà il mistero.
              </p>
            </section>
          ) : null}

          {revealed.length ? (
            <section id="svelati" className={styles.section} aria-labelledby="revealed-title">
              <div className={styles.sectionHeading}>
                <h2 id="revealed-title">Svelati</h2>
              </div>
              {revealed.map((entry) => (
                <article
                  className={`${styles.entry} ${styles.revealed}`}
                  key={entry.id}
                  aria-labelledby={`mystery-${entry.id}`}
                >
                  <span className={styles.number} aria-hidden="true">
                    {entry.number}
                  </span>
                  <div className={styles.content}>
                    <span className={styles.solutionLabel}>Mistero {entry.number} · Svelato</span>
                    <h3 id={`mystery-${entry.id}`}>{entry.title}</h3>
                    <p className={styles.description}>{entry.description}</p>
                  </div>
                </article>
              ))}
            </section>
          ) : null}
        </>
      ) : (
        <div className={styles.empty}>
          <h2>Non ci sono ancora misteri.</h2>
          <p>Li troverai qui quando il Narratore li aggiungerà al registro.</p>
        </div>
      )}

      <footer className={styles.footer}>
        <Link href="/regole#armi-misteri">
          Leggi le regole dei misteri <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </footer>
    </div>
  );
}
