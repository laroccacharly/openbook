export interface RunOptions {
  cwd?: string
  env?: Record<string, string | undefined>
}

export async function run(
  command: readonly string[],
  options: RunOptions = {},
): Promise<number> {
  const child = Bun.spawn([...command], {
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  })
  return child.exited
}

export async function runOrExit(
  command: readonly string[],
  options: RunOptions = {},
): Promise<never> {
  process.exit(await run(command, options))
}
