import Link from 'next/link';

import { scoringSettings } from '@/lib/scoring-settings';
import { all } from '@/lib/database';
import { currentUser } from '@/lib/auth';
import { defaultRules, rulesSheetPrefix, validRule, type RuleContent } from '@/lib/rules-content';
import { RuleChapter, AdditionalRules } from './rule-chapter';

export async function RulesPage() {
  const { daily: rules, grades } = await scoringSettings();
  const [user, saved] = await Promise.all([
    currentUser(),
    all<{ data: string }>(
      'SELECT data FROM imported_rows WHERE sheet LIKE ? ORDER BY id',
      `${rulesSheetPrefix}%`,
    ),
  ]);
  const contents = new Map<string, RuleContent>(defaultRules.map((rule) => [rule.id, rule]));
  for (const row of saved) {
    try {
      const rule: unknown = JSON.parse(row.data);
      if (validRule(rule)) contents.set(rule.id, rule);
    } catch {
      /* Ignore malformed historical entries. */
    }
  }
  const admin = user?.role === 'admin';
  const extra = [...contents.values()].filter(
    (rule) => !defaultRules.some((item) => item.id === rule.id) && !rule.deleted,
  );
  const signed = (n: number) => (n > 0 ? '+' : '') + new Intl.NumberFormat('it-IT').format(n);
  const dailyRules = [
    ['Presenza (P)', '0'],
    ['Assenza (A)', signed(rules.absence)],
    ['Assenza penalizzata (A+)', signed(rules.absencePlus)],
    ['Telefono', signed(rules.phone)],
    ['Bug segnalato', signed(rules.bug) + ' per Bug'],
    ['Ansia', signed(rules.anxiety) + ' per episodio'],
    ['Multiverso', signed(rules.multiverse) + ' per Multiverso'],
    ['Mistero risolto', signed(rules.mystery)],
  ];
  return (
    <article className="container page rules-guide">
      <header className="rules-intro">
        <h1>Regole</h1>
        <p>Come si calcolano i punti e come leggere il registro.</p>
      </header>
      <div className="rules-layout">
        <nav className="rules-index" aria-label="Indice delle regole">
          <span>In questa pagina</span>
          <a href="#punti">Punti e voti</a>
          <a href="#classifiche">Classifica</a>
          <a href="#ciurme">Ciurme e ruoli</a>
          <a href="#armi-misteri">Armi e misteri</a>
        </nav>
        <div className="rules-body">
          <RuleChapter initial={contents.get('punti')!} admin={admin}>
            <table className="rules-table">
              <caption>Il voto viene moltiplicato per il valore della prova.</caption>
              <thead>
                <tr>
                  <th scope="col">Prova</th>
                  <th scope="col">Moltiplicatore</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Verifica</th>
                  <td>×{grades.verifica}</td>
                </tr>
                <tr>
                  <th scope="row">Progetto</th>
                  <td>×{grades.progetto}</td>
                </tr>
              </tbody>
            </table>
            <p className="rules-example">
              Esempio: un 8 in una verifica vale 8 × {grades.verifica} ={' '}
              <strong>{new Intl.NumberFormat('it-IT').format(8 * grades.verifica)} punti</strong>.
              La presenza (P) vale zero punti. I punti del telefono si assegnano selezionando “+”.
            </p>
            <table className="rules-table">
              <caption>Voci del registro giornaliero</caption>
              <thead>
                <tr>
                  <th scope="col">Voce</th>
                  <th scope="col">Punti</th>
                </tr>
              </thead>
              <tbody>
                {dailyRules.map(([name, points]) => (
                  <tr key={name}>
                    <th scope="row">{name}</th>
                    <td>{points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>
              Il Narratore inserisce voti, attività giornaliere e punti extra con data e
              motivazione. Bug e ansia si conteggiano per ogni episodio. I valori riportati sono
              quelli configurati dal Narratore.
            </p>
          </RuleChapter>
          <RuleChapter initial={contents.get('classifiche')!} admin={admin}>
            <Link href="/viaggio">Apri la classifica</Link>
          </RuleChapter>
          <RuleChapter initial={contents.get('ciurme')!} admin={admin} />
          <RuleChapter initial={contents.get('armi-misteri')!} admin={admin}>
            <Link href="/misteri">Vedi i misteri</Link>
          </RuleChapter>
          <AdditionalRules initial={extra} admin={admin} />
        </div>
      </div>
    </article>
  );
}
