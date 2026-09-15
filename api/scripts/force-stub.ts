// Force STUB mode for the integration test, regardless of what .env holds
// (the server's .env is usually set to AGENT_LIVE=1 for real testing). This
// MUST be imported before ../src/server.js so env.ts reads the blanked value.
// isStubMode() = !env.ANTHROPIC_API_KEY && process.env.AGENT_LIVE !== '1'.
delete process.env.ANTHROPIC_API_KEY;
process.env.AGENT_LIVE = '';
