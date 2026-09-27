/**
 * The testbed's fake people. `npm run testbed:seed` creates them with the
 * story in `setup`, and the sign-in page lists them in testbed mode. Emails
 * use the reserved `.test` domain, so nothing can ever be delivered.
 */
export type TestbedPersona = {
  key: string;
  email: string;
  /** Name friends see; null leaves the account on the name setup screen. */
  displayName: string | null;
  setup: string;
};

export const TESTBED_PERSONAS: readonly TestbedPersona[] = [
  {
    key: "big-host",
    email: "big.host@menoka.test",
    displayName: "Bikram Big Host",
    setup:
      "60 players and 300 games. Friends with Asha (linked both ways); a request from Meera waits for him",
  },
  {
    key: "asha",
    email: "asha@menoka.test",
    displayName: "Asha Host",
    setup:
      "12 players and 25 games. Friends with Bikram, so Ranks shows his group; her request to Ravi is pending",
  },
  {
    key: "ravi",
    email: "ravi@menoka.test",
    displayName: "Ravi",
    setup: "No games. Has Asha's friend request waiting to accept or decline",
  },
  {
    key: "meera",
    email: "meera@menoka.test",
    displayName: "Meera",
    setup: "5 players and 8 games. Sent Bikram a friend request (pending)",
  },
  {
    key: "karan",
    email: "karan@menoka.test",
    displayName: "Karan",
    setup: "Declined a request from Meera, so she can't ask again for 7 days",
  },
  {
    key: "farhan",
    email: "farhan@menoka.test",
    displayName: "Farhan Solo",
    setup: "A named account with 3 players, no games and no friends",
  },
  {
    key: "new",
    email: "new.person@menoka.test",
    displayName: null,
    setup: "Just signed up: no name yet, so the name screen opens first",
  },
];

export function testbedPersona(key: string) {
  return TESTBED_PERSONAS.find((persona) => persona.key === key) ?? null;
}
