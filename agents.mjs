// Sandcastle supplies HOME and TMPDIR for each private Seatbelt sandbox.
export function privateHomeAgent(baseAgent, provider) {
  return { ...baseAgent, buildPrintCommand(options) {
    const print = baseAgent.buildPrintCommand(options);
    const hostOnly = "CODEX_HOME CLAUDE_CONFIG_DIR OPENAI_API_KEY CODEX_API_KEY ANTHROPIC_API_KEY GH_TOKEN GITHUB_TOKEN CODEX_USAGE_COMMAND CLAUDE_USAGE_COMMAND CLAUDE_USAGE_TOKEN_COMMAND";
    const clear = `unset ${hostOnly}${provider === "codex" ? " CLAUDE_CODE_OAUTH_TOKEN" : ""}; `;
    // Claude defaults to /tmp on macOS even when TMPDIR is set; keep its
    // internal files inside Seatbelt's private temp directory.
    const temp = provider === "claude" ? 'export CLAUDE_CODE_TMPDIR="$TMPDIR"; ' : "";
    return { ...print, command: clear + temp + print.command };
  } };
}
