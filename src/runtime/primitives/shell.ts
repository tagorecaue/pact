const DANGEROUS_PATTERNS = [
  "rm -rf /",
  "rm -rf /*",
  ":(){ :|:& };:",
  "> /dev/sda",
  "> /dev/hda",
  "dd if=/dev/zero of=/dev/sda",
  "dd if=/dev/random of=/dev/sda",
  "mkfs.",
  "mv /* /dev/null",
  ":(){:|:&};:",
  "chmod -R 777 /",
  "chown -R",
  "wget -O- | sh",
  "curl | sh",
  "fork bomb",
];

function isDangerous(command: string): boolean {
  const normalized = command.replace(/\s+/g, " ").trim().toLowerCase();
  for (const pattern of DANGEROUS_PATTERNS) {
    if (normalized.includes(pattern.toLowerCase())) {
      return true;
    }
  }
  // Check for attempts to overwrite system paths
  if (/>\s*\/dev\//.test(normalized)) return true;
  if (/rm\s+(-[a-z]*f[a-z]*\s+)?\/\s*$/.test(normalized)) return true;
  if (/rm\s+(-[a-z]*f[a-z]*\s+)?\/\*/.test(normalized)) return true;
  return false;
}

export interface ShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export class ShellPrimitive {
  async execute(
    operation: string,
    params: Record<string, unknown>,
  ): Promise<ShellResult> {
    switch (operation) {
      case "run":
      case "exec":
        return this.run(params);
      default:
        throw new Error(`ShellPrimitive: unknown operation "${operation}"`);
    }
  }

  private async run(params: Record<string, unknown>): Promise<ShellResult> {
    const command = params.command as string;
    if (!command) {
      throw new Error("ShellPrimitive.run: command is required");
    }

    if (isDangerous(command)) {
      throw new Error(
        `ShellPrimitive: refused to execute dangerous command: "${command}"`,
      );
    }

    const timeout = (params.timeout as number) ?? 30_000;
    const cwd = (params.cwd as string) ?? process.cwd();

    const proc = Bun.spawn(["sh", "-c", command], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });

    // Set up timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        try {
          proc.kill();
        } catch {
          // process may have already exited
        }
        reject(new Error(`ShellPrimitive: command timed out after ${timeout}ms`));
      }, timeout);
    });

    const resultPromise = (async () => {
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;
      return { stdout, stderr, exitCode };
    })();

    return Promise.race([resultPromise, timeoutPromise]);
  }
}
