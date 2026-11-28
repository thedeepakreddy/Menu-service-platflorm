import { parseWebEnv } from '../env';
import { LocaleSwitcher } from './locale-switcher';

const switchAvailable = parseWebEnv(process.env).WEB_PUBLIC_ORIGIN !== undefined;

/**
 * Page footer with the language choice. Rendered only when the switch can work (a public origin is
 * configured for its CSRF check; required in staging and production), so no control is ever
 * shown that would fail.
 */
export function LocaleFooter() {
  if (!switchAvailable) return null;
  return (
    <footer className="border-t border-line">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <LocaleSwitcher />
      </div>
    </footer>
  );
}
