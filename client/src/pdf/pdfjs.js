import * as pdfjs from 'pdfjs-dist/build/pdf.mjs';
import workerSource from 'virtual:pdf-worker-source';

let workerReady = null;

/**
 * Starts the pdf.js worker from an inlined Blob URL. If the Vault CSP blocks blob: workers,
 * pdf.js falls back to parsing on the main thread, which is slower but still correct.
 */
function ensureWorker() {
    if (workerReady) return workerReady;
    workerReady = (async () => {
        try {
            const url = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
            const worker = new Worker(url, { type: 'module' });
            // The worker posts a "ready" message once its script has evaluated; a CSP block
            // surfaces as an error event instead.
            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('pdf.js worker start timed out')), 5000);
                worker.addEventListener('message', () => {
                    clearTimeout(timer);
                    resolve();
                }, { once: true });
                worker.addEventListener('error', (e) => {
                    clearTimeout(timer);
                    reject(e);
                }, { once: true });
            });
            pdfjs.GlobalWorkerOptions.workerPort = worker;
            return 'worker';
        } catch (e) {
            console.warn('[review-mode] pdf.js worker unavailable, using main thread', e);
            const mainThreadWorker = await import('pdfjs-dist/build/pdf.worker.min.mjs');
            globalThis.pdfjsWorker = mainThreadWorker;
            return 'main-thread';
        }
    })();
    return workerReady;
}

export async function openPdf(arrayBuffer) {
    await ensureWorker();
    return pdfjs.getDocument({
        data: new Uint8Array(arrayBuffer),
        isEvalSupported: false,
        enableXfa: false,
    }).promise;
}

export const { TextLayer, RenderingCancelledException } = pdfjs;
