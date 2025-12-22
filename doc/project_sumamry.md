# POLTR — Project Summary (current state)

## Overview

- **Core idea:** ATProto-based civic-tech platform for Swiss referenda (arguments, proposals, voting context).
- **Protocol stack:**
  ATProto is the backbone. PDS (bluesky), AppView (services/appview), Firehose listener (service/indexer). 
- **Data model:** Custom lexicons (e.g. proposals, arguments) with companion posts for Bluesky compatibility.
- **Identity:** DID-based users; focus on anonymity / pseudonymity.
- **Infra:** Dockerized services, Kubernetes deployment, CI/CD, and a firehose replay strategy. (workflows + k8s manifests).
- **Read paths implemented:** `listRecords`, `getLikes`, cross-PDS likes handling.... Many more..
- **Positioning:** Not just a feed — structured political objects and deliberation.
- **Auth flow:** Email-only / magic-link approach; Unknown master password. integration with third-party ATProto clients with ad-hoc app-passwords.
(Custom auth wrapper)



## Not defined

- **Global visibility:** Subscribing to global relays (Bluesky Jetstream)
- **Moderation:** Labels, takedown flows and governance rules are drafted but not finalized.
- **UI/UX:** High-level ideas exist; no final frontend patterns yet.

## Open questions (priority)

1. **Product scope & Governance**
   - P2P- Governance: Who can create proposals?
   - Verification, reputation and anti-abuse mechanisms
   - Define MVP scope vs long-term features (voting only? argument ranking? recommendations?)

