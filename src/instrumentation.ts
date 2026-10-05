// Runs once when the server starts. QA mode must never go unnoticed in a log.
export function register() {
  if (process.env.QA_MODE === "1") {
    console.warn("QA MODE IS ON: /api/qa-login signs anyone in as a demo user. Never set QA_MODE in production.");
  }
}
