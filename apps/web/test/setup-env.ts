// Test environment: dedicated database, local chains, in-memory KV.
process.env.DATABASE_URL ??= "postgresql://trestle:trestle@localhost:5432/trestle_test";
process.env.NETWORK_MODE = "local";
process.env.RELAYER_WEBHOOK_SECRET = "test-webhook-secret-0123456789abcdef0123456789";
process.env.SIWE_SECRET = "test-siwe-secret-0123456789abcdef0123456789abcd";
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.REDIS_URL;
