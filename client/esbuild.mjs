import * as esbuild from 'esbuild';
import { readFile } from 'node:fs/promises';
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
    plugins: [pdfWorkerSourcePlugin],
    logLevel: 'info',
});
