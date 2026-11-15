import { existsSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

// Next's generated-output cleanup can fail on OneDrive directory reparse points.
// Native PowerShell removes only the verified generated directory. Stop dev first.
if (process.platform === "win32") {
  const root = realpathSync(process.cwd());
  const output = join(root, ".next");
  if (existsSync(output)) {
    if (realpathSync(output) !== output) {
      throw new Error("Refusing to clean a redirected build output directory.");
    }
    execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `
      $taskBuildPath = [IO.Path]::GetFullPath($env:TENANT_SHIELD_BUILD_OUTPUT)
      $taskExpectedPath = Join-Path ([IO.Path]::GetFullPath($env:TENANT_SHIELD_BUILD_ROOT)) '.next'
      if ($taskBuildPath -ne $taskExpectedPath) { throw 'Unexpected generated output path.' }
      Remove-Item -LiteralPath $taskBuildPath -Recurse -Force -ErrorAction Stop
    `,
      ],
      {
        env: {
          ...process.env,
          TENANT_SHIELD_BUILD_ROOT: root,
          TENANT_SHIELD_BUILD_OUTPUT: output,
        },
        stdio: "inherit",
        windowsHide: true,
      },
    );
  }
}
