# TODO: Fix 500 error on /api/qradar/events

## Completed
- [x] Analyzed the issue: Route calls getRelatedEvents which was not robust
- [x] Updated getRelatedEvents in lib/api/qradar.ts with:
  - Multiple alternative queries
  - Better polling with status checks
  - Error handling and logging
  - Timeout handling

## Pending
- [ ] Test the endpoint to ensure it works
- [ ] Verify that the 500 error is resolved
