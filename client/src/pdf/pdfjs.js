import * as pdfjs from 'pdfjs-dist/build/pdf.mjs';
import workerSource from 'virtual:pdf-worker-source';
import resources from 'virtual:pdf-resources';

function decode(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

function embedded(group, name, kind) {
    const data = resources[group][name];
    if (!data) throw new Error(`pdf.js ${kind} "${name}" is not bundled`);
    return decode(data);
}

// pdf.js asks these on the main thread (useWorkerFetch: false) and forwards the bytes to the worker.
class EmbeddedWasmFactory {
    async fetch({ filename }) {
        return embedded('wasm', filename, 'decoder');
    }
}

class EmbeddedStandardFontDataFactory {
    async fetch({ filename }) {
        return embedded('standardFonts', filename, 'font');
    }
}

class EmbeddedCMapReaderFactory {
    async fetch({ name }) {
        return { cMapData: embedded('cMaps', `${name}.bcmap`, 'CMap'), isCompressed: true };
    }
}

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
        useWorkerFetch: false,
        // Draw glyph outlines on the canvas instead of registering each embedded font with the
        // browser: the Custom Page runtime doesn't make page-registered fonts usable, which
        // rendered every character as a box.
        disableFontFace: true,
        WasmFactory: EmbeddedWasmFactory,
        StandardFontDataFactory: EmbeddedStandardFontDataFactory,
        CMapReaderFactory: EmbeddedCMapReaderFactory,
        cMapPacked: true,
    }).promise;
}

export const { TextLayer, RenderingCancelledException } = pdfjs;
