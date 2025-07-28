// Simple ANSI escape code stripper for tests
export function stripAnsi(str: string): string {
  // Remove all ANSI escape sequences
  // We need to match ANSI escape sequences which start with ESC (\u001b).
  // This is required for testing muxa's output since mprocs and the commands it runs often produce colored/formatted
  // terminal output. In tests, we need to strip these formatting codes to make assertions on the actual text content.
  return str.replace(
    // eslint-disable-next-line no-control-regex
    /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
    "",
  );
}
