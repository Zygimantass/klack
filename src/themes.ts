import fs from "node:fs";
import path from "node:path";

export type LoadedTheme = {
  css: string;
  description?: string;
  id: string;
  name: string;
  version?: string;
};

export type LoadThemesOptions = {
  directories: string[];
  onError?: (themePath: string, error: unknown) => void;
};

type ThemeMetadata = Omit<LoadedTheme, "css">;

const THEME_SUFFIX = ".theme.css";
const IMPORT_PATTERN = /@import\s+(?:url\(\s*)?["']([^"']+)["']\s*\)?\s*;/gi;
const ANY_IMPORT_PATTERN = /@import\s+/i;

function themeFiles(directory: string): string[] {
  const files: string[] = [];

  const visit = (current: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }

    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) visit(entryPath);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(THEME_SUFFIX)) files.push(entryPath);
    }
  };

  visit(directory);
  return files;
}

function metadata(source: string, themePath: string): ThemeMetadata {
  const comment = source.match(
    /^\uFEFF?\s*(?:@charset\s+(?:"[^"]*"|'[^']*');\s*)?\/\*\*([\s\S]*?)\*\//i,
  )?.[1] || "";
  const fields = new Map<string, string>();
  for (const line of comment.split("\n")) {
    const match = line.match(/^\s*\*?\s*@([A-Za-z]+)\s+(.+?)\s*$/);
    if (match) fields.set(match[1].toLowerCase(), match[2]);
  }

  const fallbackId = path.basename(themePath).slice(0, -THEME_SUFFIX.length);
  const id = fields.get("id") || fallbackId;
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new TypeError(`Invalid theme id ${JSON.stringify(id)} in ${themePath}`);
  }

  return {
    description: fields.get("description"),
    id,
    name: fields.get("name") || id,
    version: fields.get("version"),
  };
}

function importedCss(themePath: string): string {
  const root = fs.realpathSync(path.dirname(themePath));
  const loading = new Set<string>();

  const read = (cssPath: string): string => {
    const resolved = fs.realpathSync(path.resolve(cssPath));
    if (loading.has(resolved)) {
      throw new Error(`Circular theme import: ${[...loading, resolved].join(" -> ")}`);
    }

    loading.add(resolved);
    try {
      const source = fs.readFileSync(resolved, "utf8");
      const inlined = source.replace(IMPORT_PATTERN, (_statement, specifier: string) => {
        if (/^(?:[a-z]+:|\/\/|\/)/i.test(specifier)) {
          throw new Error(`Theme imports must be local relative files: ${specifier}`);
        }

        const imported = fs.realpathSync(path.resolve(path.dirname(resolved), specifier));
        const relative = path.relative(root, imported);
        if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
          throw new Error(`Theme import escapes its theme directory: ${specifier}`);
        }
        if (path.extname(imported).toLowerCase() !== ".css") {
          throw new Error(`Theme imports must reference CSS files: ${specifier}`);
        }
        return `\n/* Klack inlined ${specifier} */\n${read(imported)}\n`;
      });

      if (ANY_IMPORT_PATTERN.test(inlined)) {
        throw new Error("Theme contains an unsupported @import; use @import \"./relative.css\";");
      }
      return inlined;
    } finally {
      loading.delete(resolved);
    }
  };

  return read(themePath);
}

export function loadThemes(options: LoadThemesOptions): LoadedTheme[] {
  const selected = new Map<string, LoadedTheme>();

  for (const directory of options.directories) {
    for (const themePath of themeFiles(directory)) {
      try {
        const source = fs.readFileSync(themePath, "utf8");
        const definition = metadata(source, themePath);
        selected.set(definition.id, {
          ...definition,
          css: importedCss(themePath),
        });
      } catch (error) {
        options.onError?.(themePath, error);
      }
    }
  }

  return [...selected.values()].sort((left, right) => left.name.localeCompare(right.name));
}
