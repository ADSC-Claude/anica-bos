/**
 * The seed's password gate.
 *
 * The seed gives every account it creates the same password, and one of those
 * accounts is an OWNER — the role that can read guest contact details, reissue
 * access codes and see the books. The built-in password is committed to a
 * public repository, so it is only ever safe on a database nobody outside this
 * machine can reach.
 *
 * `mustChangePassword` does not make it safe elsewhere. In this app the flag is
 * checked *after* authentication: `login()` succeeds and then bounces the
 * session to `/portal/change-password` (see `src/app/login/actions.ts` and
 * `requirePage()` in `src/lib/guard.ts`). Whoever signs in first is therefore
 * the one who chooses the new password. On a reachable database that is a race
 * between the operator and anyone who has read this file on GitHub.
 *
 * So: local host, use the demo password; anywhere else, the operator supplies
 * one through SEED_PASSWORD or the seed refuses to run.
 */

/** The password baked in for local development and CI. Public by design. */
export const DEMO_PASSWORD = 'ChangeMe2026!';

/** Shortest SEED_PASSWORD the seed will accept. */
export const MIN_SEED_PASSWORD_LENGTH = 12;

/**
 * Hosts that only resolve inside the machine or the container network running
 * the seed. `postgres` and `db` are the conventional service names in a compose
 * file; CI reaches its `postgres:16` service container on `localhost`.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'postgres', 'db']);

/**
 * The host `url` points at, or `null` if there is nothing parseable to point
 * at. An unparseable string — a connection string whose password contains an
 * unescaped `/`, say — yields `null` and is therefore treated as remote, since
 * the safe answer to "where does this go?" is never "somewhere local".
 */
export function databaseHost(url: string | undefined | null): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  // WHATWG URL keeps IPv6 literals in brackets: [::1].
  const host = parsed.hostname.replace(/^\[(.*)\]$/, '$1');
  return host === '' ? null : host.toLowerCase();
}

/** True only for a database that cannot be reached from off this machine. */
export function isLocalDatabase(url: string | undefined | null): boolean {
  const host = databaseHost(url);
  return host !== null && LOCAL_HOSTS.has(host);
}

/** `printable` is what may be echoed in a log — never a supplied password. */
export type SeedPassword =
  | { ok: true; password: string; printable: string }
  | { ok: false; message: string };

/**
 * Decides which password the seed may use, given the target database and the
 * environment. Pure, so `tests/seed-password.test.ts` can hold it to its word.
 */
export function resolveSeedPassword(
  databaseUrl: string | undefined | null,
  seedPassword: string | undefined | null,
): SeedPassword {
  const supplied = seedPassword ?? '';
  const local = isLocalDatabase(databaseUrl);

  if (supplied !== '') {
    if (supplied.length < MIN_SEED_PASSWORD_LENGTH) {
      return {
        ok: false,
        message: refusal(
          `SEED_PASSWORD is ${supplied.length} character${supplied.length === 1 ? '' : 's'} long. ` +
            `The seed requires at least ${MIN_SEED_PASSWORD_LENGTH}.`,
        ),
      };
    }
    if (!local && supplied === DEMO_PASSWORD) {
      return {
        ok: false,
        message: refusal(
          'SEED_PASSWORD is the demo password, which is published in this repository. Choose one that is not.',
        ),
      };
    }
    return { ok: true, password: supplied, printable: 'as supplied in SEED_PASSWORD' };
  }

  if (local) return { ok: true, password: DEMO_PASSWORD, printable: `"${DEMO_PASSWORD}"` };

  const host = databaseHost(databaseUrl);
  return {
    ok: false,
    message: refusal(
      host === null
        ? 'DATABASE_URL is not set, or is not a connection string this seed can read, so there is no way to tell whether the target is local.'
        : `DATABASE_URL points at ${host}, which is not a local database.`,
    ),
  };
}

function refusal(reason: string): string {
  return [
    'Refusing to seed.',
    '',
    `  ${reason}`,
    '',
    "  The seed's built-in password is committed to a public repository, and one of the",
    '  accounts it creates is an OWNER. `mustChangePassword` is checked after sign-in, so',
    '  it does not stop a stranger from using that password — it only decides where they',
    '  land afterwards. Whoever signs in first sets the new one.',
    '',
    `  Supply your own, at least ${MIN_SEED_PASSWORD_LENGTH} characters:`,
    '',
    `    SEED_PASSWORD='<${MIN_SEED_PASSWORD_LENGTH}+ characters>' DATABASE_URL='<direct string>' npm run db:seed`,
    '',
    '  In GitHub Actions pass it as a repository secret, never as a workflow input:',
    '  inputs are recorded and displayed on the run page, secrets are masked in the log.',
    '',
    '  Local development and CI need none of this — a database on localhost, 127.0.0.1,',
    '  ::1, postgres or db keeps using the demo password.',
  ].join('\n');
}
