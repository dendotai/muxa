import { ChildProcess } from "child_process";

// Track all spawned processes
const activeProcesses = new Set<ChildProcess>();

// Register cleanup on exit
process.on("exit", killAllProcesses);
process.on("SIGINT", () => {
  killAllProcesses();
  process.exit(1);
});
process.on("SIGTERM", () => {
  killAllProcesses();
  process.exit(1);
});

export function trackProcess(proc: ChildProcess): void {
  activeProcesses.add(proc);

  proc.on("exit", () => {
    activeProcesses.delete(proc);
  });
}

export function killAllProcesses(): void {
  for (const proc of activeProcesses) {
    try {
      // Force kill to ensure it stops
      proc.kill("SIGKILL");
    } catch {
      // Process might already be dead
    }
  }
  activeProcesses.clear();
}
