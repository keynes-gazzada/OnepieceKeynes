import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import { currentUser } from '@/lib/auth';
import { all, type Crew } from '@/lib/database';
import { DreamCarousel, CrewCarousel } from '@/components/interactive';
import styles from './home-crews.module.css';
export const dynamic = 'force-dynamic';
type Dream = { text: string; first_name: string; last_name: string; class_code: string };
export default async function Home() {
  const [user, recentDreams, crews] = await Promise.all([
    currentUser(),
    all<Dream>(
      "SELECT dreams.text,users.first_name,users.last_name,users.class_code FROM dreams JOIN users ON users.id=dreams.user_id WHERE TRIM(dreams.text)<>'' ORDER BY dreams.id DESC LIMIT 20",
    ),
    all<Crew>('SELECT * FROM crews ORDER BY class_code, name, id'),
  ]);
  const dreams = recentDreams.filter((dream) => dream.text.trim().length > 0);
  return (
    <>
      <section className="hero">
        <Image
          src="/images/one-piece/luffy-adventure.jpg"
          alt="Monkey D. Luffy pronto a salpare"
          fill
          priority
          sizes="100vw"
          className="hero-art"
        />
        <div className="hero-shade" />
        <div className="hero-content">
          <div className="hero-copy">
            <div className="hero-kicker">J. M. Keynes · Registro punti</div>
            <h1>
              <span>Il registro</span>
              <span>
                <em>Grand Line</em>
              </span>
              <span>della classe.</span>
            </h1>
            <p>Consulta i punti, i voti e la classifica del registro unico.</p>
            <div className="hero-actions">
              {user ? (
                <Link
                  className="button gold"
                  href={user.role === 'admin' ? '/narratore' : '/profilo'}
                >
                  {user.role === 'admin' ? 'Apri il registro' : 'Il tuo profilo'}{' '}
                  <ArrowRight size={18} />
                </Link>
              ) : (
                <Link className="button gold" href="/accedi">
                  Accedi al registro <ArrowRight size={18} />
                </Link>
              )}
              <Link className="hero-secondary" href={user ? '/viaggio' : '/regole'}>
                {user ? 'Apri la classifica' : 'Leggi le regole'}
              </Link>
            </div>
          </div>
        </div>
      </section>
      {user ? (
        <div className="welcome-strip">
          <div className="container">
            <span>Accesso come</span>
            <strong>
              {user.last_name} {user.first_name}
              {user.class_code ? ` · ${user.class_code}` : ''}
            </strong>
            <Link href={user.role === 'admin' ? '/narratore' : '/viaggio'}>
              {user.role === 'admin' ? 'Registro' : 'Classifica'} <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      ) : null}
      {dreams.length ? (
        <section className="home-stories container">
          <div className="section-heading">
            <h2>I sogni degli studenti</h2>
            <p>I sogni condivisi nel registro.</p>
          </div>
          <DreamCarousel dreams={dreams} />
        </section>
      ) : null}
      <section className={styles.section} aria-labelledby="home-crews-title">
        <div className="container">
          <header className={styles.heading}>
            <h2 id="home-crews-title" className={styles.title}>
              Le ciurme
            </h2>
            <span className={styles.count}>
              {crews.length} {crews.length === 1 ? 'ciurma' : 'ciurme'}
            </span>
          </header>
          <CrewCarousel crews={crews} />
        </div>
      </section>
    </>
  );
}
