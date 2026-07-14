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
  if (!candidate || typeof candidate !== "object" ||
      typeof candidate.name !== "string" || typeof candidate.setup !== "function") {
    throw new TypeError(${JSON.stringify(
      `[Klack] ${plugin.name} must default-export definePlugin({ name, setup })`,
    )});
  }
  globalThis.Klack.loadPlugin(candidate);
})()\n//# sourceURL=${sourceUrl}`;
}
