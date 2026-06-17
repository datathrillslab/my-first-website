// Simple test harness for MiMo client with usage output
try { require('dotenv').config(); } catch (e) {}
const readline = require('readline');
const { chatCompletion } = require('./mimo_client');

async function runOnce(prompt) {
    const messages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: prompt }
    ];
    const resp = await chatCompletion({ messages, model: 'mimo-v2.5' });
    const choice = resp?.choices?.[0]?.message?.content || JSON.stringify(resp, null, 2);
    console.log('\n--- MiMo response ---\n');
    console.log(choice);
    if (resp.usage) console.log('\n--- Usage ---\n', resp.usage);
}

async function repl() {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log('MiMo REPL — type a prompt and press Enter (CTRL+C to exit)');
    for await (const line of rl) {
        const prompt = line.trim();
        if (!prompt) continue;
        try {
            await runOnce(prompt);
        } catch (err) {
            console.error('Error:', err.message);
        }
        rl.prompt();
    }
}

if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.length > 0) {
        runOnce(args.join(' ')).catch(e => { console.error(e.message); process.exit(1); });
    } else {
        repl().catch(e => { console.error(e.message); process.exit(1); });
    }
}

