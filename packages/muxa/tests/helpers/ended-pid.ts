/** The id of a process that has ended, as a killed muxa leaves in its run record */
export async function endedPid(): Promise<number> {
  const proc = Bun.spawn(["true"]);
  await proc.exited;
  return proc.pid;
}
