export type RuleContent = {
  id: string;
  title: string;
  description: string;
  image: string;
  deleted?: boolean;
};
export const defaultRules: RuleContent[] = [
  {
    id: 'punti',
    title: 'Punti e voti',
    description:
      'La taglia è il totale dei punti ottenuti con i voti e le registrazioni giornaliere. Le verifiche e i progetti trasformano i voti in punti secondo i moltiplicatori indicati qui sotto. Il Narratore registra anche le attività quotidiane e gli eventuali punti extra.',
    image: '/images/TagliaBase.png',
  },
  {
    id: 'classifiche',
    title: 'Classifica',
    description:
      'La classifica ordina gli studenti per taglia, sommando voti, attività e punti già assegnati. Ogni studente consulta la propria classe; il Narratore può confrontare le classi e scegliere un anno o una rotta quando sono disponibili.',
    image: '/images/nave-tramonto.png',
  },
  {
    id: 'ciurme',
    title: 'Ciurme e ruoli',
    description:
      'Ogni pirata può far parte di una ciurma della propria classe. Il Narratore assegna i membri e i ruoli, che possono essere aggiornati nel corso del viaggio. Nel profilo trovi la tua ciurma e i compagni di equipaggio.',
    image: '/images/one-piece/straw-hat-crew.jpg',
  },
  {
    id: 'armi-misteri',
    title: 'Armi e misteri',
    description:
      'Le armi ancestrali si possono usare una volta per periodo: Poseidon offre una domanda aggiuntiva da 200 punti, Pluton raddoppia i punti della prova collegata e Uranus permette di togliere una taglia negativa. Ogni mistero ha quattro indizi e la sua risoluzione assegna 2.000 punti a ciascun membro della ciurma e può rendere nuovamente disponibile un’arma ancestrale.',
    image: '/images/powers/poseidon.svg',
  },
];
export const rulesSheetPrefix = '__rules:';
export function validRule(value: unknown): value is RuleContent {
  if (!value || typeof value !== 'object') return false;
  const rule = value as RuleContent;
  return (
    typeof rule.id === 'string' &&
    /^[a-z0-9-]{1,60}$/.test(rule.id) &&
    typeof rule.title === 'string' &&
    !!rule.title.trim() &&
    rule.title.length <= 150 &&
    typeof rule.description === 'string' &&
    rule.description.length <= 10000 &&
    typeof rule.image === 'string' &&
    rule.image.length <= 2000 &&
    (!rule.image || /^https:\/\//i.test(rule.image) || /^\/(?!\/)/.test(rule.image)) &&
    (rule.deleted === undefined || typeof rule.deleted === 'boolean')
  );
}
