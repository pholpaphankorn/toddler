import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "*.lua"], { encoding: "utf8" }).split("\0").filter((file) => file && existsSync(file));
for (const file of files) execFileSync("luac", ["-p", file], { stdio: "inherit" });
console.log(`Lua syntax passed (${files.length} files).`);
