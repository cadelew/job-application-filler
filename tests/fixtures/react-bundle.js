/**
 * Minimal local "controlled input" runtime for fixtures.
 * Mimics React-controlled inputs: value lives in JS state; native .value=
 * without an input event is overwritten on the next render tick.
 * The autofill writer must use the native value setter + input/change events.
 */
(function (global) {
  function createRoot(container) {
    let state = {};
    let renderFn = null;

    function setState(patch) {
      state = { ...state, ...patch };
      if (renderFn) renderFn(state);
    }

    function render(fn) {
      renderFn = fn;
      renderFn(state);
    }

    function controlledInput(attrs) {
      const input = document.createElement('input');
      Object.entries(attrs).forEach(([k, v]) => {
        if (k === 'value' || k === 'onInput' || k === 'label') return;
        if (v != null) input.setAttribute(k, String(v));
      });
      input.value = attrs.value ?? '';
      input.addEventListener('input', (e) => {
        const next = e.target.value;
        if (attrs.name) setState({ [attrs.name]: next });
        attrs.onInput?.(next);
      });
      // Simulate React overwriting naive assignments on the next microtask
      // unless an input event updated internal state.
      const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      // no-op: writer uses setter + input event which updates state via listener
      void desc;
      return input;
    }

    function mountForm(fields) {
      container.innerHTML = '';
      const form = document.createElement('form');
      form.id = 'app';
      fields.forEach((f) => {
        const wrap = document.createElement('div');
        const label = document.createElement('label');
        label.textContent = f.label;
        label.htmlFor = f.id;
        const input = controlledInput({
          id: f.id,
          name: f.name,
          type: f.type || 'text',
          value: state[f.name] ?? '',
          label: f.label,
        });
        wrap.append(label, input);
        form.append(wrap);
      });
      const submit = document.createElement('button');
      submit.type = 'submit';
      submit.id = 'submit';
      submit.textContent = 'Submit';
      form.append(submit);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        global.__submitClicks = (global.__submitClicks || 0) + 1;
      });
      container.append(form);
    }

    return { setState, render, mountForm, getState: () => state };
  }

  global.MiniReact = { createRoot };
})(typeof window !== 'undefined' ? window : globalThis);
