export type PluginSource = {
  name: string;
  source: string;
};

export function pluginEvaluationSource(plugin: PluginSource): string {
  const sourceUrl = `klack-plugin://${encodeURIComponent(plugin.name)}`;
  return `(() => {
  const module = { exports: {} };
  const exports = module.exports;
  ${plugin.source}
  const candidate = module.exports && module.exports.__esModule
    ? module.exports.default
    : module.exports;
  if (
    typeof candidate === "function" ||
    (candidate && typeof candidate === "object" &&
      (typeof candidate.setup === "function" || typeof candidate.start === "function"))
  ) {
    globalThis.Klack.loadPlugin(${JSON.stringify(plugin.name)}, candidate);
  }
})()\n//# sourceURL=${sourceUrl}`;
}
