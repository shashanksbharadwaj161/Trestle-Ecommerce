// Test environment: dedicated database, local chains, in-memory KV.
process.env.DATABASE_URL ??= "postgresql://trestle:trestle@localhost:5432/trestle_test";
process.env.NETWORK_MODE = "local";
process.env.RELAYER_WEBHOOK_SECRET = "test-webhook-secret-0123456789abcdef0123456789";
process.env.SIWE_SECRET = "test-siwe-secret-0123456789abcdef0123456789abcd";
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.REDIS_URL;
// Card payments against the LOCAL mock Stripe (test/mock-stripe.ts). sk_test_ + loopback only.
process.env.STRIPE_SECRET_KEY = "sk_test_mock_0000000000000000000000000000";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_mock_0000000000000000000000000";
process.env.STRIPE_API_BASE = "http://127.0.0.1:12111";
process.env.CRON_SECRET = "test-cron-secret-0123456789abcdef";
process.env.EMAIL_PROVIDER = "log"; // DEV/TEST-only email driver: nothing is ever sent
