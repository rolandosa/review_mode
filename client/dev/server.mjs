/*
 * Local harness for Review Mode. Serves dev/index.html and dist/, and forwards /api/* to a Vault.
 *
 *   VAULT_HOST=myvault.veevavault.com VAULT_SESSION=<session id> npm run dev
 *   open http://localhost:5173/?doc=123
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.PORT || 5173);
const host = process.env.VAULT_HOST;
const session = process.env.VAULT_SESSION;
if (!host) {
    console.error('Set VAULT_HOST (e.g. myvault.veevavault.com) and VAULT_SESSION.');
    process.exit(1);
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.map': 'application/json' };

createServer(async (req, res) => {
    try {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname.startsWith('/api/')) {
            const chunks = [];
            for await (const chunk of req) chunks.push(chunk);
            const headers = { ...req.headers };
            delete headers.host;
            delete headers.cookie;
            delete headers['accept-encoding'];
            if (session) headers.authorization = session;
            const upstream = await fetch(`https://${host}${url.pathname}${url.search}`, {
                method: req.method,
                headers,
                body: chunks.length ? Buffer.concat(chunks) : undefined,
            });
            res.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') || 'application/octet-stream' });
            res.end(Buffer.from(await upstream.arrayBuffer()));
            return;
        }
        const file = url.pathname === '/' ? 'dev/index.html' : normalize(url.pathname).replace(/^[/\\]+/, '');
        if (!file.startsWith('dist') && file !== 'dev/index.html') {
            res.writeHead(404).end();
            return;
        }
        const body = await readFile(join(root, file));
        res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
        res.end(body);
    } catch (e) {
        res.writeHead(e.code === 'ENOENT' ? 404 : 500).end(String(e.message));
    }
}).listen(port, () => console.log(`Review Mode harness on http://localhost:${port}/?doc=<document id>  ->  ${host}`));
