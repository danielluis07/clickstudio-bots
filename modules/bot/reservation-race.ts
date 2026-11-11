// A concurrent turn took the last slot a send reservation needed: the Tenant's
// monthly allowance or the Contact's daily cap. The reservation's transaction
// rolls back, so nothing was reserved or sent. The job's next delivery runs
// the reply gate again, which hands off. Expected, so it never alerts.
export class ReservationRaceError extends Error {
  override name = "ReservationRaceError";
}
