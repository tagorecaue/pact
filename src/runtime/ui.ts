// ── Terminal UI helpers ── zero dependencies, pure ANSI escape codes

export const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",

  // Colors
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
  white: "\x1b[37m",
  gray: "\x1b[90m",

  // Bright
  brightGreen: "\x1b[92m",
  brightYellow: "\x1b[93m",
  brightBlue: "\x1b[94m",
  brightMagenta: "\x1b[95m",
  brightCyan: "\x1b[96m",
};

/**
 * Bold ASCII banner for the Pact CLI.
 */
export function printBanner(): void {
  const p = c.brightCyan;
  const a = c.brightMagenta;
  const r = c.reset;
  const d = c.dim;
  const g = c.gray;

  console.log("");
  console.log(`   ${p}██████╗  ${a}█████╗  ${p}██████╗${a}████████╗${r}`);
  console.log(`   ${p}██╔══██╗${a}██╔══██╗${p}██╔════╝${a}╚══██╔══╝${r}`);
  console.log(`   ${p}██████╔╝${a}███████║${p}██║     ${a}   ██║${r}`);
  console.log(`   ${p}██╔═══╝ ${a}██╔══██║${p}██║     ${a}   ██║${r}`);
  console.log(`   ${p}██║     ${a}██║  ██║${p}╚██████╗${a}   ██║${r}`);
  console.log(`   ${p}╚═╝     ${a}╚═╝  ╚═╝${p} ╚═════╝${a}   ╚═╝${r}`);
  console.log("");
  console.log(`   ${d}${g}intent in, execution out — with proof.${r}`);
  console.log("");
}

export function success(msg: string): void {
  console.log(`  ${c.green}${c.bold}\u2713${c.reset} ${msg}`);
}

export function fail(msg: string): void {
  console.log(`  ${c.red}${c.bold}\u2717${c.reset} ${msg}`);
}

export function info(msg: string): void {
  console.log(`  ${c.blue}\u203a${c.reset} ${msg}`);
}

export function warn(msg: string): void {
  console.log(`  ${c.yellow}!${c.reset} ${msg}`);
}

export function step(n: number, total: number, msg: string): void {
  console.log(`  ${c.cyan}[${n}/${total}]${c.reset} ${msg}`);
}

export function header(text: string): void {
  const line = "\u2500".repeat(text.length + 4);
  console.log(`\n  ${c.dim}${line}${c.reset}`);
  console.log(`  ${c.bold}  ${text}${c.reset}`);
  console.log(`  ${c.dim}${line}${c.reset}\n`);
}

export function section(name: string): void {
  console.log(`\n  ${c.cyan}${c.bold}${name}${c.reset}`);
}

export function keyValue(key: string, value: string): void {
  console.log(`  ${c.gray}${key}:${c.reset} ${value}`);
}

export function divider(): void {
  console.log(`  ${c.dim}${"\u2500".repeat(50)}${c.reset}`);
}

export function createSpinner(msg: string): { stop: (finalMsg?: string) => void } {
  const frames = ["\u280b", "\u2819", "\u2839", "\u2838", "\u283c", "\u2834", "\u2826", "\u2827", "\u2807", "\u280f"];
  let i = 0;
  const interval = setInterval(() => {
    process.stdout.write(`\r  ${c.cyan}${frames[i % frames.length]}${c.reset} ${msg}`);
    i++;
  }, 80);

  return {
    stop(finalMsg?: string) {
      clearInterval(interval);
      process.stdout.write(`\r  ${c.green}${c.bold}\u2713${c.reset} ${finalMsg ?? msg}\n`);
    },
  };
}

// ── Category colors for gap tags ──

const gapCategoryColors: Record<string, string> = {
  security: c.red,
  error_handling: c.yellow,
  edge_case: c.blue,
  data: c.gray,
};

export function gapTag(category: string): string {
  const color = gapCategoryColors[category] ?? c.gray;
  return `${color}[${category}]${c.reset}`;
}

// ── Syntax highlighting for .pact source ──

export function highlightPactLine(line: string): string {
  // Section prefixes: @C, @I, @E, @X, @K, @F, @T, @D, @R, @V
  if (/^\s*@[CIEXKFTDRV]\b/.test(line)) {
    return line.replace(/(@[CIEXKFTDRV]\b)/, `${c.cyan}${c.bold}$1${c.reset}`);
  }
  // Comment lines
  if (/^\s*--/.test(line)) {
    return `${c.dim}${line}${c.reset}`;
  }
  // pact v1 header
  if (/^pact\s+v\d+/.test(line)) {
    return `${c.brightCyan}${c.bold}${line}${c.reset}`;
  }
  // String literals
  if (/"[^"]*"/.test(line)) {
    return line.replace(/"([^"]*)"/g, `${c.green}"$1"${c.reset}`);
  }
  return line;
}
