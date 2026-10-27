import { runFill, scanPage } from '../src/core/engine';
import {
  isAutofillRequest,
  type AutofillResponse,
  type FillRequest,
} from '../src/shared/messages';
import type { FieldDescriptor } from '../src/shared/types';

/** Live DOM references — never sent across the messaging boundary. */
const elementMap = new Map<string, HTMLElement>();
let lastFields: FieldDescriptor[] = [];

function handlePing(): AutofillResponse<'ping'> {
  return { ok: true };
}

function handleScan(): AutofillResponse<'scan'> {
  const { fields, elements } = scanPage(document);
  elementMap.clear();
  for (const [id, el] of elements) elementMap.set(id, el);
  lastFields = fields;
  return {
    ok: true,
    url: location.href,
    title: document.title,
    fields,
  };
}

function handleFill(msg: FillRequest): AutofillResponse<'fill'> {
  const scanned = scanPage(document);
  elementMap.clear();
  for (const [id, el] of scanned.elements) elementMap.set(id, el);
  lastFields = scanned.fields;

  const report = runFill(msg.profile, {
    fields: lastFields,
    elements: elementMap,
    url: location.href,
  });

  return { ok: true, report };
}

export default defineContentScript({
  // Injected on demand via scripting.executeScript under activeTab.
  registration: 'runtime',
  main() {
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!isAutofillRequest(message)) return;

      try {
        if (message.type === 'ping') {
          sendResponse(handlePing());
        } else if (message.type === 'scan') {
          sendResponse(handleScan());
        } else if (message.type === 'fill') {
          sendResponse(handleFill(message));
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown error';
        sendResponse({ ok: false, error });
      }

      return true;
    });
  },
});
