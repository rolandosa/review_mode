import * as esbuild from 'esbuild';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const dev = process.argv.includes('--dev');

/**
 * Custom Pages are served from a Vault-managed location, so there is no stable URL to point
 * pdf.js at for its worker script. This plugin inlines the worker source as a string; at
 * runtime it is turned into a Blob URL (see src/pdf/pdfjs.js).
 */
const pdfWorkerSourcePlugin = {
    name: 'pdf-worker-source',
    setup(build) {
        build.onResolve({ filter: /^virtual:pdf-worker-source$/ }, () => ({
            path: require.resolve('pdfjs-dist/build/pdf.worker.min.mjs'),
            namespace: 'pdf-worker-source',
        }));
        build.onLoad({ filter: /.*/, namespace: 'pdf-worker-source' }, async (args) => ({
            contents: await readFile(args.path, 'utf8'),
            loader: 'text',
        }));
    },
};

/**
 * pdf.js needs extra binary resources: WebAssembly image decoders (JPEG 2000, JBIG2, ICC color),
 * the standard 14 fonts for PDFs that don't embed them, and CMaps for CJK text. With no stable URL
 * for files in a Custom Page distribution, they are embedded as base64 and served to pdf.js by the
 * factories in src/pdf/pdfjs.js, decoded only when a document actually needs one.
 */
const pdfResourcesPlugin = {
    name: 'pdf-resources',
    setup(build) {
        build.onResolve({ filter: /^virtual:pdf-resources$/ }, () => ({ path: 'pdf-resources', namespace: 'pdf-resources' }));
        build.onLoad({ filter: /.*/, namespace: 'pdf-resources' }, async () => {
            const root = dirname(require.resolve('pdfjs-dist/package.json'));
            const embed = async (dir, test) => {
                const files = (await readdir(join(root, dir))).filter(test).sort();
                const entries = await Promise.all(files.map(async (f) => [f, (await readFile(join(root, dir, f))).toString('base64')]));
                return Object.fromEntries(entries);
            };
            const resources = {
                wasm: await embed('wasm', (f) => f.endsWith('.wasm')),
                standardFonts: await embed('standard_fonts', (f) => /\.(pfb|ttf)$/.test(f)),
                cMaps: await embed('cmaps', (f) => f.endsWith('.bcmap')),
            };
            return { contents: `export default ${JSON.stringify(resources)};`, loader: 'js' };
        });
    },
};

await esbuild.build({
    entryPoints: ['src/index.jsx'],
    bundle: true,
    outdir: 'dist',
    format: 'esm',
    target: ['chrome120', 'edge120', 'firefox121', 'safari17'],
    sourcemap: true,
    minify: !dev,
    jsx: 'automatic',
    loader: { '.svg': 'text' },
    define: { 'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production') },
    plugins: [pdfWorkerSourcePlugin, pdfResourcesPlugin],
    logLevel: 'info',
});
