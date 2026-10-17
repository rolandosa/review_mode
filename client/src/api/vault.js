import { vaultApiClient } from '@veeva/vault';

export const API_VERSION = 'v26.2';
const CLIENT_ID = 'review-mode-custom-page';
const ANNOTATION_PAGE_SIZE = 500;

export class VaultApiError extends Error {
    constructor(message, errors = []) {
        super(message);
        this.errors = errors;
    }
}

async function request(path, { method = 'GET', body, binary = false } = {}) {
    // Binary downloads send no Accept header: Vault rejects `application/octet-stream` there.
    const headers = { 'X-VaultAPI-ClientID': CLIENT_ID };
    if (!binary) headers.Accept = 'application/json';
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await vaultApiClient.fetch(`/${API_VERSION}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const isJson = (response.headers.get('content-type') || '').includes('application/json');
    if (binary && !isJson) {
        if (!response.ok) throw new VaultApiError(`Request failed (${response.status})`);
        return response;
    }
    const json = await response.json();
    if (json.responseStatus === 'FAILURE') {
        const message = json.errors?.map((e) => e.message).join('; ') || json.responseMessage || 'Vault API request failed';
        throw new VaultApiError(message, json.errors);
    }
    if (binary) throw new VaultApiError('Expected a file but Vault returned JSON');
    return json;
}

/** Escapes a value for use inside a single-quoted VQL string literal. */
function vqlString(value) {
    return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

export async function query(vql) {
    const form = new URLSearchParams({ q: vql });
    const response = await vaultApiClient.fetch(`/${API_VERSION}/query`, {
        method: 'POST',
        headers: {
            'X-VaultAPI-ClientID': CLIENT_ID,
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
    });
    const json = await response.json();
    if (json.responseStatus === 'FAILURE') {
        throw new VaultApiError(json.errors?.map((e) => e.message).join('; ') || 'Query failed', json.errors);
    }
    return json.data || [];
}

export async function getCurrentUser() {
    const json = await request('/objects/users/me');
    const user = json.users?.[0]?.user || {};
    return {
        id: String(user.id),
        name: [user.user_first_name__v, user.user_last_name__v].filter(Boolean).join(' ') || user.user_name__v,
    };
}

export async function getUserNames(ids) {
    const unique = [...new Set(ids.filter(Boolean).map(String))];
    if (!unique.length) return {};
    const rows = await query(`SELECT id, name__v FROM user__sys WHERE id CONTAINS (${unique.map(vqlString).join(', ')})`);
    return Object.fromEntries(rows.map((r) => [String(r.id), r.name__v]));
}

/**
 * Loads document metadata. When no version is given, the latest version is used.
 */
export async function getDocument(docId, major, minor) {
    const path = major === undefined
        ? `/objects/documents/${encodeURIComponent(docId)}`
        : `/objects/documents/${encodeURIComponent(docId)}/versions/${major}/${minor}`;
    const json = await request(path);
    const d = json.document;
    return {
        id: String(d.id),
        name: d.name__v,
        number: d.document_number__v,
        major: Number(d.major_version_number__v),
        minor: Number(d.minor_version_number__v),
        status: d.status__v,
        lifecycle: d.lifecycle__v,
        type: d.type__v,
        format: d.format__v,
        pages: d.pages__v,
        versionId: `${d.id}_${d.major_version_number__v}_${d.minor_version_number__v}`,
    };
}

export async function getViewableRendition(doc) {
    const response = await request(
        `/objects/documents/${doc.id}/versions/${doc.major}/${doc.minor}/renditions/viewable_rendition__v`,
        { binary: true },
    );
    return response.arrayBuffer();
}

export async function getAnnotations(doc) {
    const all = [];
    for (let offset = 0; ; offset += ANNOTATION_PAGE_SIZE) {
        const json = await request(
            `/objects/documents/${doc.id}/versions/${doc.major}/${doc.minor}/annotations?limit=${ANNOTATION_PAGE_SIZE}&offset=${offset}`,
        );
        all.push(...(json.data || []));
        const total = json.responseDetails?.total ?? all.length;
        if (all.length >= total || !json.data?.length) break;
    }
    return all;
}

export async function getReplies(doc, annotationId) {
    const json = await request(
        `/objects/documents/${doc.id}/versions/${doc.major}/${doc.minor}/annotations/${annotationId}/replies`,
    );
    return (json.data || []).sort(
        (a, b) => (a.placemark?.reply_position_index__sys ?? 0) - (b.placemark?.reply_position_index__sys ?? 0),
    );
}

function firstResult(json) {
    const result = json.data?.[0];
    if (result?.responseStatus === 'FAILURE') {
        throw new VaultApiError(result.errors?.map((e) => e.message).join('; ') || 'Annotation request failed', result.errors);
    }
    return result;
}

/**
 * Creates a note annotation. `placemark` must already be in Vault's coordinate system
 * (PDF points, origin bottom-left); see src/pdf/geometry.js.
 */
export async function createNote(doc, { comment, placemark, color, tags }) {
    const annotation = {
        document_version_id__sys: doc.versionId,
        type__sys: 'note__sys',
        comment__sys: comment,
        placemark,
    };
    if (color) annotation.color__sys = color;
    if (tags?.length) annotation.tag_names__sys = tags;
    return firstResult(await request('/objects/documents/annotations/batch', { method: 'POST', body: [annotation] }));
}

export async function addReply(doc, parentId, comment) {
    return firstResult(await request('/objects/documents/annotations/replies/batch', {
        method: 'POST',
        body: [{
            document_version_id__sys: doc.versionId,
            type__sys: 'reply__sys',
            comment__sys: comment,
            placemark: { type__sys: 'reply__sys', reply_parent__sys: String(parentId) },
        }],
    }));
}

export async function setAnnotationState(doc, annotationId, state) {
    return firstResult(await request('/objects/documents/annotations/batch', {
        method: 'PUT',
        body: [{ id__sys: String(annotationId), document_version_id__sys: doc.versionId, state__sys: state }],
    }));
}

const DOC_FIELDS = 'id, name__v, document_number__v, major_version_number__v, minor_version_number__v, status__v, format__v';

export async function searchDocuments(term) {
    const trimmed = term.trim();
    if (!trimmed) return [];
    if (/^\d+$/.test(trimmed)) {
        return query(`SELECT ${DOC_FIELDS} FROM documents WHERE id = ${trimmed}`);
    }
    return query(`SELECT ${DOC_FIELDS} FROM documents FIND (${vqlString(trimmed)}) ORDER BY version_modified_date__v DESC LIMIT 25`);
}

/**
 * Open document workflow tasks for the current user: tasks assigned to them and tasks available
 * for them to accept (e.g. a participant-group pool). The tasks endpoint applies Vault's own
 * eligibility rules for "available"; VQL then maps each task to its documents.
 */
export async function getMyOpenDocumentTasks() {
    const json = await request('/objects/objectworkflows/tasks?assignee__v=me()&status__v=available__v,assigned__v&page_size=1000');
    const tasks = json.data || [];
    if (!tasks.length) return [];
    const items = await query(
        `SELECT task__sys, document_id__sys FROM active_workflow_task_item__sys WHERE task__sys CONTAINS (${tasks.map((t) => Number(t.id)).join(', ')})`,
    );
    const docIds = [...new Set(items.map((i) => i.document_id__sys).filter(Boolean).map(String))];
    if (!docIds.length) return [];
    const docs = await query(`SELECT ${DOC_FIELDS} FROM documents WHERE id CONTAINS (${docIds.join(', ')})`);
    const docsById = Object.fromEntries(docs.map((d) => [String(d.id), d]));
    const tasksById = Object.fromEntries(tasks.map((t) => [String(t.id), t]));
    return items
        .filter((i) => i.document_id__sys && docsById[String(i.document_id__sys)] && tasksById[String(i.task__sys)])
        .map((i) => {
            const t = tasksById[String(i.task__sys)];
            return {
                taskId: String(t.id),
                label: t.label__v,
                instructions: t.instructions__v,
                status: t.status__v?.includes('assigned__v') ? 'assigned' : 'available',
                due: t.due_date__v,
                workflowId: String(t.workflow__v ?? ''),
                docId: String(i.document_id__sys),
                doc: docsById[String(i.document_id__sys)],
            };
        })
        .sort((x, y) => (x.status === y.status ? String(x.due || '9').localeCompare(String(y.due || '9')) : x.status === 'assigned' ? -1 : 1));
}

/**
 * The current user's open task on this document (assigned first, then available), if any.
 * Time is only tracked while one exists.
 */
export async function findMyTaskForDocument(docId) {
    const rows = await getMyOpenDocumentTasks();
    const row = rows.find((r) => r.docId === String(docId));
    return row ? { id: row.taskId, label: row.label, status: row.status, due: row.due, workflowId: row.workflowId } : null;
}

export function vaultDocumentUrl(doc) {
    return `${window.location.origin}/ui/#doc_info/${doc.id}/${doc.major}/${doc.minor}`;
}

const TIME_LOG_OBJECT = 'review_time_log__c';

function firstRecordId(json) {
    const record = json.data?.[0];
    if (record?.responseStatus !== 'SUCCESS') {
        throw new VaultApiError(record?.errors?.map((e) => e.message).join('; ') || 'Vault rejected the time log', record?.errors);
    }
    return String(record.data.id);
}

/** Creates or updates a review time log record; returns its ID. `keepalive` lets the final save outlive the page. */
export async function saveTimeLog(id, fields, { keepalive = false } = {}) {
    const response = await vaultApiClient.fetch(`/${API_VERSION}/vobjects/${TIME_LOG_OBJECT}`, {
        method: id ? 'PUT' : 'POST',
        keepalive,
        headers: { 'X-VaultAPI-ClientID': CLIENT_ID, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify([id ? { id, ...fields } : fields]),
    });
    const json = await response.json();
    if (json.responseStatus === 'FAILURE') {
        throw new VaultApiError(json.errors?.map((e) => e.message).join('; ') || 'Time log save failed', json.errors);
    }
    return firstRecordId(json);
}
