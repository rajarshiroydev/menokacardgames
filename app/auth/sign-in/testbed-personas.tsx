import { TESTBED_PERSONAS } from "@/lib/testbed/personas";

import { signInAsPersona } from "./testbed-actions";

/** Testbed mode only: one button per fake persona, in place of email links. */
export function TestbedPersonas({ error }: { error: string | null }) {
  return (
    <div className="testbed-personas">
      <p className="auth-notice" role="note">
        <strong>Testbed.</strong> Fake data in the separate menoka-testbed
        project. Pick who to be:
      </p>
      {error ? (
        <p className="auth-error" role="alert">
          Sign-in failed ({error}). Has `npm run testbed:seed` run?
        </p>
      ) : null}
      {TESTBED_PERSONAS.map((persona) => (
        <form key={persona.key} action={signInAsPersona}>
          <input type="hidden" name="persona" value={persona.key} />
          <button type="submit" className="testbed-persona">
            <strong>{persona.displayName ?? "New person (no name)"}</strong>
            <small>{persona.setup}</small>
          </button>
        </form>
      ))}
    </div>
  );
}
