export function injectStorageCompatibility(html: string) {
  if (html.includes('data-intentloop-storage-script="true"')) return html;
  const script = `<script data-intentloop-storage-script="true" data-intentloop-agent-script="true">
;(() => {
  for (const name of ["localStorage", "sessionStorage"]) {
    try {
      window[name].getItem("__intentloop_storage_probe__");
      continue;
    } catch {
      // Opaque-origin previews cannot access browser storage. Keep state in this window only.
    }
    const values = new Map();
    const storage = {
      get length() { return values.size; },
      key(index) { return Array.from(values.keys())[Number(index) >>> 0] ?? null; },
      getItem(key) { return values.get(String(key)) ?? null; },
      setItem(key, value) { values.set(String(key), String(value)); },
      removeItem(key) { values.delete(String(key)); },
      clear() { values.clear(); }
    };
    Object.defineProperty(window, name, { configurable: true, value: storage });
  }
})();
</script>`;

  // Run before application scripts, including synchronous React initialization.
  const head = html.match(/<head\b[^>]*>/i);
  const firstScript = html.search(/<script\b/i);
  if (head && (firstScript < 0 || head.index! < firstScript)) {
    return html.replace(/<head\b[^>]*>/i, (head) => `${head}${script}`);
  }
  const doctype = html.match(/^\s*<!doctype[^>]*>/i);
  if (doctype) return `${doctype[0]}${script}${html.slice(doctype[0].length)}`;
  return `${script}${html}`;
}
