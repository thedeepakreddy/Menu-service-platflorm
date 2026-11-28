'use client';

import { MESSAGES } from '../i18n/messages';

/**
 * Last-resort boundary, used only if the root layout itself fails (so no locale is known): the
 * message is shown in both supported languages.
 */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <main id="main">
          {(['en', 'hu'] as const).map((locale) => (
            <section key={locale} lang={locale}>
              <h1>{MESSAGES[locale].error.title}</h1>
              <p>{MESSAGES[locale].error.body}</p>
            </section>
          ))}
          <button type="button" onClick={reset}>
            {MESSAGES.en.error.retry} / {MESSAGES.hu.error.retry}
          </button>
        </main>
      </body>
    </html>
  );
}
