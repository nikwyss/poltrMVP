# NOT TODO

Bewusst **verworfene** Ideen — hier dokumentiert, damit sie nicht erneut
aufkommen. Wenn etwas hier steht, wurde es geprüft und abgelehnt (mit Begründung).
Falls sich die Rahmenbedingungen ändern, kann ein Punkt zurück nach `TODO.md`.

---

## Peerreview-Broadcast: neue Argumente sofort an „recently online"-User zuteilen (verworfen 2026-06-26)

**Idee:** Wenn jemand ein neues Argument submittet (→ neues offenes Peerreview-
Verfahren entsteht), sofort für alle kürzlich online gewesenen User einen
`maybe_assign_reviews_for_user`-Aufruf auslösen, damit das neue Verfahren schnell
Reviewer bekommt — statt erst beim nächsten Tageslogin jedes Reviewers.

**Angedachter Plan (Option C, best-effort):**
- Indexer feuert `NOTIFY peerreview_opened` genau dann, wenn die `app_peerreviews`-
  Open-Zeile real neu angelegt wird ([db.js:340](../services/indexer/src/db.js#L340), `ON CONFLICT DO NOTHING` → nur bei echtem Insert).
- Neuer Writer-Listener fächert über recently-online DIDs (`auth.auth_sessions.last_accessed_at`) auf,
  prüft Eligibility und ruft `maybe_assign_reviews_for_user(did)` (Semaphore + Debounce).
- Config: `PEER_REVIEW_BROADCAST_ENABLED` / `_RECENT_WINDOW_HOURS` / `_BROADCAST_CONCURRENCY`.

**Warum verworfen — Nachteile überwiegen:**
- **„Call ≠ Zuteilung":** `_assign` rollt weiter die 0.35-Lotterie + Per-Ballot-Caps
  (3/Tag, 4 offen). Der Aufwand erzeugt also keine verlässliche „alle bekommen das
  neue Argument"-Wirkung; der Effekt ist nur ein Timing-Vorzug.
- **Daily-Cap deckelt den Nutzen ohnehin:** mehr neue Argumente/Tag → trotzdem max.
  3/Ballot/Tag pro User. Beschleunigt nur, erhöht nichts.
- **Reiner Accelerator über dem bereits funktionierenden Pull-Modell:** der durable
  Login-Trigger teilt ohnehin zu; der Mehrwert ist marginal gegenüber der neuen
  Komplexität (zusätzlicher Indexer→Writer-NOTIFY-Channel, neuer Loop, 3 Env-Vars,
  Thundering-herd-/Coalescing-Sorgen bei Skalierung).
- Verworfene Sub-Alternative (durable Fan-out über `app_acceptance_queue`) verschärft
  zusätzlich das ungelöste Retention-Problem der Queue.

**Fazit:** Kosten/Komplexität > Nutzen. Das Pull-Modell (Zuteilung beim ersten Login
pro UTC-Tag) bleibt der alleinige Trigger. Siehe `TODO.md` (Peerreviews) und
`maybe_assign_reviews_for_user` in [peer_review_assign.py](../services/community-writer/src/arguments/peer_review_assign.py).
