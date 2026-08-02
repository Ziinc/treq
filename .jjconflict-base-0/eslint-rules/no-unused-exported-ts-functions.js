import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

const SCAN_DIR = "src";
const AST_GREP_RULES = [
  join("test", "ast-grep", "utils", "unused-exported-ts-function-candidate.yml"),
  join("test", "ast-grep", "utils", "unused-exported-tsx-function-candidate.yml"),
];
const TS_EXTS = new Set([".ts", ".tsx"]);
const EXPORT_NAME_REGEX =
  /^export\s+(?:(?:async\s+)?function\s+|const\s+)([A-Za-z_]\w*)\b/m;
const FUNCTION_VALUE_REGEX =
  /^export\s+const\s+[A-Za-z_]\w*\s*=\s*(?:async\s+)?(?:function\b|[\s\S]*=>)/m;

let cachedRootDir;
let cachedUnusedByFile;

function collectFiles(dir, out = []) {
  if (!existsSync(dir)) {
    return out;
  }

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(path, out);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }

    const dot = entry.name.lastIndexOf(".");
    const ext = dot >= 0 ? entry.name.slice(dot) : "";
    if (TS_EXTS.has(ext)) {
      out.push(path);
    }
  }

  return out;
}

function countIdentifier(text, name) {
  const matches = text.match(new RegExp(`\\b${name}\\b`, "g"));
  return matches ? matches.length : 0;
}

function getAstGrepCommand(rootDir) {
  const localBin = join(
    rootDir,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "ast-grep.cmd" : "ast-grep",
  );
  return existsSync(localBin) ? localBin : "ast-grep";
}

function scanRule(rootDir, rulePath) {
  const command = getAstGrepCommand(rootDir);
  const output = execFileSync(
    command,
    ["scan", SCAN_DIR, "--rule", rulePath, "--json=compact", "--color=never"],
    {
      cwd: rootDir,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    },
  );

  return JSON.parse(output || "[]");
}

function collectExportedFunctions(rootDir) {
  return AST_GREP_RULES.flatMap((rulePath) => scanRule(rootDir, rulePath)).flatMap(
    (match) => {
      if ((match.charCount?.leading ?? 0) !== 0) {
        return [];
      }

      if (
        match.text.startsWith("export const") &&
        !FUNCTION_VALUE_REGEX.test(match.text)
      ) {
        return [];
      }

      const name = match.text.match(EXPORT_NAME_REGEX)?.[1];
      if (!name) {
        return [];
      }

      return [
        {
          file: match.file,
          line: (match.range?.start?.line ?? 0) + 1,
          name,
        },
      ];
    },
  );
}

function loadSrcText(rootDir) {
  return collectFiles(join(rootDir, SCAN_DIR))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
}

function buildUnusedByFile(rootDir) {
  const candidates = collectExportedFunctions(rootDir);
  const declarationCounts = new Map();
  for (const candidate of candidates) {
    declarationCounts.set(
      candidate.name,
      (declarationCounts.get(candidate.name) ?? 0) + 1,
    );
  }

  const allText = loadSrcText(rootDir);
  const unusedByFile = new Map();

  for (const candidate of candidates) {
    const declarationCount = declarationCounts.get(candidate.name) ?? 1;
    if (countIdentifier(allText, candidate.name) > declarationCount) {
      continue;
    }

    const entries = unusedByFile.get(candidate.file) ?? [];
    entries.push(candidate);
    unusedByFile.set(candidate.file, entries);
  }

  return unusedByFile;
}

function getUnusedByFile(rootDir) {
  if (cachedRootDir !== rootDir || !cachedUnusedByFile) {
    cachedRootDir = rootDir;
    cachedUnusedByFile = buildUnusedByFile(rootDir);
  }
  return cachedUnusedByFile;
}

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Identify exported functions in src ts/tsx files that have no in-repo references",
      recommended: false,
    },
    schema: [],
    messages: {
      astGrepFailure:
        "Failed to scan exported TS/TSX functions with ast-grep: {{error}}",
      unusedExportedFunction:
        'Exported TS/TSX function "{{name}}" is not referenced anywhere under src/ beyond its declaration.',
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    const ext = filename.slice(filename.lastIndexOf("."));
    const srcSegment = `${sep}src${sep}`;
    const srcIndex = filename.indexOf(srcSegment);
    if (srcIndex < 0 || !TS_EXTS.has(ext)) {
      return {};
    }

    const rootDir = filename.slice(0, srcIndex);
    const relFilename = relative(rootDir, filename);

    return {
      "Program:exit"(node) {
        let unusedByFile;
        try {
          unusedByFile = getUnusedByFile(rootDir);
        } catch (error) {
          context.report({
            node,
            messageId: "astGrepFailure",
            data: { error: error instanceof Error ? error.message : String(error) },
          });
          return;
        }

        for (const candidate of unusedByFile.get(relFilename) ?? []) {
          context.report({
            node,
            loc: {
              start: { line: candidate.line, column: 0 },
              end: { line: candidate.line, column: 1 },
            },
            messageId: "unusedExportedFunction",
            data: { name: candidate.name },
          });
        }
      },
    };
  },
};
