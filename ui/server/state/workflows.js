// Map<taskPath, wf> — tracks currently running workflow/fix/subtask child procs
// so WS clients can subscribe to live output, and reconnects can replay
// buffered stdout. Entries are auto-removed via setTimeout(..., 5 * 60 * 1000)
// from the WS connection handler and queue cron.
//
// Exported as a const Map — mutations via .set/.get/.delete propagate to all
// importers via the same instance.

export const runningWorkflows = new Map();
