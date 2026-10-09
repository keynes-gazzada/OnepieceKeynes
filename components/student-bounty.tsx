import Image from 'next/image';
import { Skull } from 'lucide-react';
import { studentPortraitUrl } from '@/lib/student-portraits';

const format = (value: number) => new Intl.NumberFormat('it-IT').format(value);

export function StudentBounty({
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
  const portrait = studentPortraitUrl(firstName, lastName);
  const fullName = `${lastName} ${firstName}`;

  return (
    <div
      className={`student-bounty ${compact ? 'compact' : ''} ${portrait ? 'has-portrait' : 'has-fallback'}`}
      role="img"
      aria-label={`Manifesto di taglia di ${fullName}: ${format(score)} punti`}
    >
      <div className="student-bounty-photo">
        {portrait ? (
          <Image
            src={portrait}
            alt={`Ritratto di ${firstName} ${lastName}`}
            fill
            sizes={compact ? '(max-width: 780px) 64px, 180px' : '(max-width: 780px) 80vw, 360px'}
          />
        ) : (
          <div className="student-bounty-fallback" aria-hidden="true">
            <Skull />
            <span>Ritratto non disponibile</span>
          </div>
        )}
      </div>
      <Image
        src="/images/TagliaBase.png"
        alt=""
        fill
        sizes={compact ? '(max-width: 780px) 64px, 180px' : '(max-width: 780px) 80vw, 360px'}
        className="student-bounty-frame"
      />
      <strong className="student-bounty-name">{fullName}</strong>
      <span className="student-bounty-score">฿ {format(score)}</span>
    </div>
  );
}
