/**
 * Every Google Form the site points at, in one place.
 *
 * A page only renders its "fill out the form" button when the URL here is set,
 * so leaving one empty hides the button rather than shipping a dead link.
 */
export const FORMS = {
  /** Enter the 2026-27 NFL futures pool. */
  nflFutures: "",
  /** The EDH survey. */
  edhSurvey: "",
  /** Bug reports and feedback. */
  feedback: "https://forms.gle/X7zzeaww3fgGnyvNA",
} as const;
