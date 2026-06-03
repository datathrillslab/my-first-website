# Xiaomi MiMo integration (Network Diagram)

This adds a lightweight MiMo client and a test harness.

Setup

- Copy `.env.example` to `.env` and set `MIMO_API_KEY`.
- Ensure you run this with Node 18+ (global `fetch` required).

Run the test

```bash
export MIMO_API_KEY=sk_...        # Windows (PowerShell): $env:MIMO_API_KEY='sk_...'
node mimo_test.js
# or: npm run test-mimo
```

Notes

- Do not commit your real API key. The provided `.env.example` is safe to commit.
- If your Node version lacks global `fetch`, install `node-fetch` and require it at the top of `mimo_client.js`.
