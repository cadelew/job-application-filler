import type { Profile } from '../profile/schema';
import type { FieldDescriptor, FillReport } from './types';

/**
 * Popup -> content script messages, sent with `browser.tabs.sendMessage(tabId, request)`
 * after injecting the runtime content script with `browser.scripting.executeScript({ files })`.
 * The content script replies with the matching response type. Responses never throw across
 * the boundary: failures come back as `{ ok: false, error }`.
 */

/** Liveness check so the popup can avoid injecting the content script twice. */
export interface PingRequest {
  type: 'ping';
}
export interface PingResponse {
  ok: true;
}

/** Scan the page's forms. Rebuilds the content script's fieldId -> element map. */
export interface ScanRequest {
  type: 'scan';
}
export type ScanResponse =
  | { ok: true; url: string; title: string; fields: FieldDescriptor[] }
  | { ok: false; error: string };

/**
 * Scan, match, and fill high-confidence fields using the given validated profile.
 * The content script re-scans itself, so a prior 'scan' is not required. Never submits.
 */
export interface FillRequest {
  type: 'fill';
  profile: Profile;
}
export type FillResponse = { ok: true; report: FillReport } | { ok: false; error: string };

export type AutofillRequest = PingRequest | ScanRequest | FillRequest;

/** Maps each request type to its response type. */
export interface AutofillResponseMap {
  ping: PingResponse;
  scan: ScanResponse;
  fill: FillResponse;
}

export type AutofillResponse<T extends AutofillRequest['type']> = AutofillResponseMap[T];

const REQUEST_TYPES: ReadonlySet<string> = new Set<AutofillRequest['type']>(['ping', 'scan', 'fill']);

export function isAutofillRequest(message: unknown): message is AutofillRequest {
  return (
    typeof message === 'object' &&
    message !== null &&
    typeof (message as { type?: unknown }).type === 'string' &&
    REQUEST_TYPES.has((message as { type: string }).type)
  );
}
