export async function waitUntil(condition: () => boolean, what: string, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting until ${what}`);
    await Bun.sleep(20);
  }
}
