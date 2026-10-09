const portraitKeys = new Set([
  'ahmed',
  'angelino',
  'bana',
  'beretta',
  'bianchi',
  'botta',
  'calciano',
  'calderon',
  'caltabiano',
  'campisi',
  'castellano',
  'castiglioni',
  'ceriani',
  'cilli',
  'consoli',
  'de-luca',
  'deidda',
  'del-favero',
  'dimotta',
  'ferraris',
  'fontana',
  'gabriele',
  'gaceur',
  'gentilini',
  'genualdi',
  'giocoso',
  'grosso',
  'iannello',
  'kharchenko',
  'lai',
  'landi',
  'laslou',
  'locatelli',
  'locuratolo',
  'magnoni',
  'maimone',
  'marotto',
  'martorana',
  'mattiello',
  'medizza',
  'miatto',
  'minelli',
  'pepnikaj',
  'perri',
  'piccoli-m',
  'piccoli-s',
  'rroma',
  'salvetti',
  'shelkunov',
  'soria',
  'tarantola',
  'traversi',
  'velati',
  'verdi',
  'violante',
]);

function slug(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('it-IT')
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function studentPortraitUrl(firstName: string, lastName: string) {
  const surname = slug(lastName);
  const initial = slug(firstName).charAt(0);
  const specificKey = initial ? `${surname}-${initial}` : surname;
  const portraitKey = portraitKeys.has(specificKey)
    ? specificKey
    : portraitKeys.has(surname)
      ? surname
      : null;

  return portraitKey ? `/images/students/${portraitKey}.webp` : null;
}
