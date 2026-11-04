import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);

export interface CommandOptions { cwd?: string; timeout?: number }
export type Command = (file: string, args?: string[], options?: CommandOptions) => Promise<string>;

export const command: Command = async (file, args = [], options = {}) => {
  const { stdout } = await exec(file, args, {
    encoding: "utf8", timeout: 30_000, maxBuffer: 8 * 1024 * 1024, ...options,
  });
  return stdout.trim();
};
// Only user-owned adapter commands; never pass issue content to a host shell.
export function adapter(text: string, timeoutMs: number): Promise<string> {
  return command("/bin/sh", ["-c", text], { timeout: timeoutMs });
}
export function subscriptionEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of ["OPENAI_API_KEY", "CODEX_API_KEY", "ANTHROPIC_API_KEY"]) delete env[key];
  return env;
}
// Account queries do not start a model turn.
export function codexRpc<T>(method: string, params: object = {}, timeoutMs = 12_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const child = spawn("codex", ["app-server", "--listen", "stdio://"], {
      env: subscriptionEnv(), stdio: ["pipe", "pipe", "ignore"],
    });
    let buffer = "", settled = false;
    const finish = (error: Error | null, value?: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stdin.end();
      child.kill("SIGTERM");
      if (error) reject(error); else resolve(value as T);
    };
    const timer = setTimeout(() => finish(new Error("Codex account query timed out")), timeoutMs);
    const send = (message: object) => child.stdin.write(`${JSON.stringify(message)}\n`);
    child.stdin.on("error", () => {});
    child.on("error", () => finish(new Error("Cannot launch codex app-server")));
    child.on("exit", () => finish(new Error("Codex app-server exited before replying")));
    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        let message;
        try { message = JSON.parse(line); } catch { continue; }
        if (message.error) return finish(new Error(`Codex account query failed (${message.error.code})`));
        if (message.id === 1) {
          send({ method: "initialized", params: {} });
          send({ id: 2, method, params });
        } else if (message.id === 2) finish(null, message.result);
      }
    });
    send({ id: 1, method: "initialize", params: {
      clientInfo: { name: "sandcastle_nvim", version: "1.0.0" },
    } });
  });
}
