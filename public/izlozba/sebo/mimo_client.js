// Lightweight Xiaomi MiMo client helper
// Reads API key from process.env.MIMO_API_KEY

const API_URL = 'https://api.xiaomimimo.com/v1/chat/completions';

function getApiKey() {
    const key = process.env.MIMO_API_KEY || process.env.MIMO_APIKEY;
    if (!key) throw new Error('MIMO API key not found. Set MIMO_API_KEY in your environment.');
    return key;
}

// Secret detection helper — simple heuristics to avoid echoing secrets
function detectSecrets(text) {
    if (!text) return null;
    const checks = [
        /sk-[A-Za-z0-9_-]{20,}/g, // common "sk-..." style keys
        /-----BEGIN (RSA|PRIVATE|OPENSSH) PRIVATE KEY-----/g,
        /api[_-]?key[\s:=]['\"]?[A-Za-z0-9_\-+/=]{8,}/gi,
        /(?:pass(word)?|secret)[\s:=]['\"]?[A-Za-z0-9_\-+/=]{6,}/gi,
        /\/(etc|root)\/|C:\\Users\\[A-Za-z0-9_\\-]+\\/g
    ];
    for (const rx of checks) {
        if (rx.test(text)) return rx.toString();
    }
    return null;
}

async function ensureFetch() {
    if (typeof fetch === 'function') return fetch;
    // Try to dynamically import node-fetch for older Node versions
    try {
        // eslint-disable-next-line global-require
        const nf = require('node-fetch');
        if (nf && typeof nf === 'function') return nf;
        if (nf && nf.default) return nf.default;
    } catch (e) {
        // fallthrough
    }
    throw new Error('Global `fetch` not available. Run Node 18+, or install `node-fetch`.');
}

async function chatCompletion({ messages, model = 'mimo-v2.5', max_tokens = 1024, temperature = 0.7, top_p = 0.95, thinking = { type: 'disabled' } } = {}) {
    if (!messages || !Array.isArray(messages)) throw new Error('`messages` (array) is required');
    const apiKey = getApiKey();

    const body = {
        model,
        messages,
        max_completion_tokens: max_tokens,
        temperature,
        top_p,
        thinking,
        stream: false
    };

    const _fetch = await ensureFetch();

    const res = await _fetch(API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'api-key': apiKey
        },
        body: JSON.stringify(body)
    });

    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch (e) { throw new Error(`MiMo response parse error: ${e.message}\n${text}`); }

    if (!res.ok) {
        const msg = data?.error || data?.message || JSON.stringify(data);
        throw new Error(`MiMo API error ${res.status}: ${msg}`);
    }

    // Log usage if present (helps track tokens/credits)
    if (data.usage) {
        try {
            // Keep logging minimal and safe
            console.log('MiMo usage:', JSON.stringify(data.usage));
        } catch (e) { /* ignore logging errors */ }
    }

    // Detect secrets in assistant outputs — fail safe
    const candidateTexts = [];
    if (data.choices && Array.isArray(data.choices)) {
        for (const ch of data.choices) {
            if (ch?.message?.content) candidateTexts.push(String(ch.message.content));
            if (ch?.message?.reasoning_content) candidateTexts.push(String(ch.message.reasoning_content));
            if (ch?.message?.tool_calls) candidateTexts.push(JSON.stringify(ch.message.tool_calls));
            if (ch?.delta?.content) candidateTexts.push(String(ch.delta.content));
            if (ch?.delta?.reasoning_content) candidateTexts.push(String(ch.delta.reasoning_content));
        }
    }
    const joined = candidateTexts.join('\n');
    const secretFound = detectSecrets(joined);
    if (secretFound) {
        throw new Error('Potential secret detected in model output — aborting.');
    }

    return data;
}

module.exports = { chatCompletion, detectSecrets };
