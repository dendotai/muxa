/**
 * The text of a terminal's output, without its escape sequences. dekit can skip a blank cell by
 * moving the cursor past it (`ESC[5;48H`, `ESC[3C`), so a cursor move reads as a space, as a
 * terminal would show it.
 */
export function stripAnsi(str: string): string {
  return (
    str
      // eslint-disable-next-line no-control-regex
      .replace(/[\u001b\u009b]\[[0-9;]*[CHf]/g, " ")
      .replace(
        // eslint-disable-next-line no-control-regex
        /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
        "",
      )
  );
}
