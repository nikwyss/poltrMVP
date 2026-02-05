# POLTR Roadmap

## Vision & Core Idea

Build an ATProto-based civic-tech platform for Swiss referenda that enables:
- **Structured political discourse** - Not just a feed, but structured political objects and deliberation
- **Anonymous/pseudonymous participation** - DID-based users with focus on anonymity
- **Cross-platform compatibility** - ATProto backbone with PDS, AppView, Firehose listener
- **Open, federated architecture** - Custom lexicons with companion posts for Bluesky compatibility

### Positioning
- Custom data model for proposals and arguments
- Email-only / magic-link authentication (unknown master password)
- Integration with third-party ATProto clients via app-passwords
- Cross-PDS likes handling and federated interactions

## Current State (v0.1)

### ✅ Implemented
- AT Protocol infrastructure (PDS, AppView, Indexer)
- React frontend with OAuth authentication
- Custom lexicons (proposals, arguments)
- Firehose indexing from own PDS
- PostgreSQL data persistence
- Kubernetes deployment with CI/CD
- Read APIs: `listRecords`, `getLikes`, cross-PDS likes handling
- Docker containerization for all services
- TLS/HTTPS with Let's Encrypt
- Firehose replay strategy

### 🎯 Current Focus (Phase 1 - MVP)
We are currently in **Phase 1: MVP Development**

Key areas of active work:
- Authentication & identity infrastructure
- Data model finalization and lexicon definitions
- Git workflow and development practices
- Core API implementation

See [todo.md](./todo.md) for specific week-by-week tasks.

### ⚠️ Not Yet Defined
- **Global visibility:** Subscribing to global relays (Bluesky Jetstream)
- **Moderation:** Labels, takedown flows and governance rules (drafted but not finalized)
- **UI/UX:** High-level ideas exist; no final frontend patterns yet

## Phases

### Phase 1: MVP - Core Platform (Current)
**Goal:** Functional platform for basic referendum discussion

**Authentication & Identity**
- [ ] Magic link email-only authentication
- [ ] Pseudonym assignment (Swiss mountain names)
- [ ] App password generation for third-party clients

**Data Model Finalization**
- [ ] Finalize custom lexicons
- [ ] Bluesky fallback compatibility
- [ ] Correct DID/URL references throughout

**Basic Features**
- [ ] Create and view proposals
- [ ] Post arguments (pro/con)
- [ ] Like/unlike functionality
- [ ] User profiles with pseudonyms

**Development Process**
- [ ] Git feature branch workflow
- [ ] Pull request reviews
- [ ] Automated testing in CI

**Target:** Q1 2026

### Phase 2: Enhanced Functionality
**Goal:** Rich interaction and content discovery

**Global Visibility**
- [ ] Subscribe to Bluesky Jetstream (global firehose)
- [ ] Index external replies referencing Poltr proposals
- [ ] Cross-PDS interaction tracking

**Content Features**
- [ ] Argument threading and replies
- [ ] Search functionality
- [ ] Tags and categorization
- [ ] Rich media support (images, links)

**User Experience**
- [ ] Notification system
- [ ] Bookmarks and saved items
- [ ] User following/followers
- [ ] Activity feeds

**Target:** Q2 2026

### Phase 3: Governance & Moderation
**Goal:** Sustainable community management

**Proposal Governance**
- [ ] Define who can create proposals
- [ ] Verification system for official proposals
- [ ] Proposal status workflow

**Moderation**
- [ ] Labeling system
- [ ] Takedown procedures
- [ ] Report mechanisms
- [ ] Moderator roles and tools

**Reputation & Anti-Abuse**
- [ ] Reputation scoring
- [ ] Spam detection
- [ ] Rate limiting
- [ ] Quality filters

**Target:** Q3 2026

### Phase 4: Advanced Features
**Goal:** Platform maturity and innovation

**Analytics & Insights**
- [ ] Argument quality metrics
- [ ] Engagement analytics
- [ ] Trend detection
- [ ] Export tools

**Integration**
- [ ] API documentation
- [ ] Third-party app support
- [ ] Webhook system
- [ ] Bot framework

**Scalability**
- [ ] Split indexer/appview services
- [ ] Read replicas
- [ ] Caching layer
- [ ] CDN integration

**Innovation**
- [ ] Recommendation algorithms
- [ ] Argument ranking
- [ ] Fact-checking integration
- [ ] Voting simulation

**Target:** Q4 2026+

## Open Questions (High Priority)

### Product Scope & Governance
1. **MVP Boundaries** - What's the minimum feature set for launch?
   - Voting only? Argument ranking? Recommendations?
2. **P2P Governance** - Who can create proposals?
   - Verified vs unverified users?
   - Official proposal verification system?
3. **Content Governance** - What content is allowed? How to handle misinformation?
4. **Verification & Reputation** - Anti-abuse mechanisms and reputation scoring

### Technical Decisions
1. **Backfill Strategy** - Nightly task for missed firehose events (Redis vs PostgreSQL for cursor)
2. **Service Architecture** - When to split indexer/appview? Caching strategy?
3. **Data Retention** - How long to keep deleted records? GDPR compliance?

### UI/UX
1. **Design System** - Component library choice, accessibility requirements
2. **User Flows** - Onboarding experience, first-time user education
3. **Frontend Patterns** - Final design decisions needed

## Success Metrics

### MVP Success Criteria
- [ ] 100+ registered users
- [ ] 10+ active proposals
- [ ] 500+ arguments posted
- [ ] < 2s page load times
- [ ] 99% uptime

### Long-term Goals
- 10,000+ registered users
- Coverage of all Swiss federal referenda
- Integration with official voting information
- Third-party app ecosystem
- Recognition as credible civic platform
