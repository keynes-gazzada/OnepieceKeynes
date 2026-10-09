import Link from 'next/link';

const dailyRules = [
  ['Presenza (P)', '0'],
  ['Assenza (A)', '−40'],
  ['Assenza penalizzata (A+)', '−80'],
  ['Telefono', '+30'],
  ['Bug segnalato', '+50'],
  ['Ansia', '−30'],
  ['Multiverso', '+80'],
  ['Sogno', '+2 / +4'],
  ['Mistero risolto', '+2.000'],
];

export function RulesPage() {
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
          <a href="#classifiche">Materie e classifiche</a>
          <a href="#ciurme">Ciurme e ruoli</a>
          <a href="#armi-misteri">Armi e misteri</a>
        </nav>
        <div className="rules-body">
          <section id="punti" className="rules-chapter">
            <h2>Punti e voti</h2>
            <p>
              La taglia è il totale dei punti ottenuti con i voti e le registrazioni giornaliere.
            </p>
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
                  <td>×200</td>
                </tr>
                <tr>
                  <th scope="row">Interrogazione</th>
                  <td>×15</td>
                </tr>
                <tr>
                  <th scope="row">Progetto</th>
                  <td>×100</td>
                </tr>
              </tbody>
            </table>
            <p className="rules-example">
              Esempio: un 8 in una verifica vale 8 × 200 = <strong>1.600 punti</strong>.
              Le nuove giornate partono da zero. I punti del telefono si assegnano selezionando “+”.
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
              I punti dei frutti sono riportati nel registro. Il Narratore inserisce voti e attività
              giornaliere.
            </p>
          </section>
          <section id="classifiche" className="rules-chapter">
            <h2>Materie e classifiche</h2>
            <p>
              In 3CI e 4CI, TPSIT e SER hanno registri separati. Ogni materia ha i propri voti, punti
              e classifica.
            </p>
            <p>
              Nel profilo e nella classifica scegli la materia. Puoi vedere il totale oppure
              filtrare per anno e rotta. Per caricare i punti dall’Excel, compila la colonna Materia
              con TPSIT o SER. In 5CI la materia è TPSIT.
            </p>
            <Link href="/viaggio">Apri la classifica</Link>
          </section>
          <section id="ciurme" className="rules-chapter">
            <h2>Ciurme e ruoli</h2>
            <p>
              Il Narratore assegna gli studenti alle ciurme e imposta i ruoli: Capitano, Navigatore,
              Archeologo ed Equipaggio. Nel profilo trovi la tua ciurma, i membri e il ruolo
              assegnato.
            </p>
            <p>
              Le attività del Capitano, compresa l’Ambizione del Re Conquistatore, vengono definite
              dal Narratore in classe.
            </p>
          </section>
          <section id="armi-misteri" className="rules-chapter">
            <h2>Armi e misteri</h2>
            <p>
              <strong>Poseidon, Pluton e Uranus</strong> sono utilizzabili una volta per periodo. La
              risoluzione di un mistero può renderle nuovamente disponibili. Lo stato delle armi è
              indicato nel profilo.
            </p>
            <p>
              Ogni mistero ha quattro indizi. Nella pagina Misteri puoi vedere quelli trovati e,
              quando il Narratore lo svela, il titolo e la descrizione.
            </p>
            <Link href="/misteri">Vedi i misteri</Link>
          </section>
        </div>
      </div>
    </article>
  );
}
