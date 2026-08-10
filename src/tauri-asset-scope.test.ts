import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

interface TauriConfig {
  app: {
    security: {
      assetProtocol: {
        scope: {
          allow: string[];
          deny: string[];
          requireLiteralLeadingDot: boolean;
        };
      };
    };
  };
}

const config = JSON.parse(
  readFileSync(resolve("src-tauri/tauri.conf.json"), "utf8"),
) as TauriConfig;

describe("Tauri asset protocol scope", () => {
  it("does not special-case a particular hidden directory", () => {
    expect(config.app.security.assetProtocol.scope.allow).not.toContain(
      "$HOME/**/.generated/**/*",
    );
  });

  it("lets runtime working-directory scopes include hidden paths", () => {
    const scope = config.app.security.assetProtocol.scope;

    expect(scope.requireLiteralLeadingDot).toBe(false);
    expect(scope.allow).not.toContain("$HOME/**/*");
  });

  it("continues to deny SSH files", () => {
    expect(config.app.security.assetProtocol.scope.deny).toContain(
      "$HOME/.ssh/**",
    );
  });
});
