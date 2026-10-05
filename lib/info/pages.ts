/**
 * The public info pages. Settings links to each, and every info page lists
 * the others at its foot. They need no sign-in, so app stores, the sign-in
 * page and anyone asked to read them can open the same address.
 */
export type InfoPageId = "features" | "whats-new" | "privacy" | "terms" | "account-deletion";

export type InfoPage = {
  id: InfoPageId;
  path: `/${InfoPageId}`;
  title: string;
  /** One line under the title in Settings. */
  summary: string;
};

export const INFO_PAGES: Record<InfoPageId, InfoPage> = {
  features: {
    id: "features",
    path: "/features",
    title: "Features",
    summary: "Everything Pokerize does, explained simply",
  },
  "whats-new": {
    id: "whats-new",
    path: "/whats-new",
    title: "What's New",
    summary: "New features and fixes, by date",
  },
  privacy: {
    id: "privacy",
    path: "/privacy",
    title: "Privacy Policy",
    summary: "What we keep, why, and who can see it",
  },
  terms: {
    id: "terms",
    path: "/terms",
    title: "Terms of Use",
    summary: "The rules for using Pokerize",
  },
  "account-deletion": {
    id: "account-deletion",
    path: "/account-deletion",
    title: "Account Deletion",
    summary: "How to delete your account and what happens",
  },
};

/** Added by Settings so an info page's Back returns to it instead of Home. */
export const FROM_APP_PARAM = "from=app";
