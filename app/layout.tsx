import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { currentUser } from '@/lib/auth';
import { Github, Mail, MapPin } from 'lucide-react';
import { LogoutButton } from '@/components/interactive';
import { MotionEffects } from '@/components/motion-effects';
import { NavigationMenu } from '@/components/navigation-menu';
import './fonts.css';
import './globals.css';
import './design-system.css';
import './grand-line.css';
import './motion.css';
import './navigation.css';
import './rules.css';
import './page-details.css';
import './powers.css';
import './admin-management.css';
import './planning.css';
export const metadata: Metadata = {
  title: { default: 'Keynes Grand Line · J. M. Keynes', template: '%s · Keynes Grand Line' },
  description: 'La Grand Line dei punti del J. M. Keynes: ciurme, taglie, rotte e sfide.',
};
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const links =
    user?.role === 'admin'
      ? [
          ['/', 'Home'],
          ['/viaggio', 'Classifiche'],
          ['/regole', 'Regole'],
          ['/narratore', 'Narratore'],
          ['/planning', 'Planning'],
        ]
      : user
        ? [
            ['/', 'Home'],
            ['/viaggio', 'Classifiche'],
            ['/profilo', 'Profilo'],
            ['/rotte', 'Grand Line'],
            ['/misteri', 'Misteri'],
            ['/regole', 'Regole'],
          ]
        : [
            ['/', 'Home'],
            ['/regole', 'Regole'],
          ];
  return (
    <html lang="it" data-scroll-behavior="smooth">
      <body>
        <MotionEffects />
        <nav className="topnav" aria-label="Navigazione principale">
          <div className="nav-inner">
            <Link className="nav-mark" href="/" aria-label="Keynes Grand Line, pagina iniziale">
              <Image
                src="/images/logo-keynes.webp"
                alt="J. M. Keynes"
                width={600}
                height={338}
                unoptimized
                className="nav-logo"
                priority
              />
            </Link>
            <NavigationMenu>
              <div className={`nav-links ${user?.role === 'admin' ? 'admin-nav-links' : ''}`}>
                {links.map(([href, label]) => (
                  <Link key={href} href={href}>
                    {label}
                  </Link>
                ))}
              </div>
              {user ? (
                <div className="nav-user">
                  <span>
                    {user.first_name} {user.last_name}
                  </span>
                  <LogoutButton />
                </div>
              ) : null}
            </NavigationMenu>
            {!user ? (
              <Link className="button gold nav-auth" href="/accedi">
                Accedi / Registrati
              </Link>
            ) : null}
          </div>
        </nav>
        <main>{children}</main>
        <footer className="footer">
          <div className="footer-inner">
            <Link className="footer-logo" href="/" aria-label="ISIS J.M. Keynes, pagina iniziale">
              <Image
                src="/images/logo-keynes.webp"
                alt="ISIS J.M. Keynes"
                width={600}
                height={338}
                unoptimized
                sizes="180px"
              />
            </Link>
            <div className="footer-links">
              <a
                href="https://youtu.be/dQw4w9WgXcQ"
                target="_blank"
                rel="noreferrer"
                aria-label="Position"
              >
                <MapPin size={24} aria-hidden="true" />
              </a>
              <a
                href="https://github.com/keynes-gazzada"
                target="_blank"
                rel="noreferrer"
                aria-label="GitHub"
              >
                <Github size={24} aria-hidden="true" />
              </a>
              <a href="mailto:puntikeynes@gmail.com" aria-label="Invia mail">
                <Mail size={24} aria-hidden="true" />
              </a>
            </div>
            <p>© 2026 ISIS J.M. Keynes Students. All rights reserved</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
