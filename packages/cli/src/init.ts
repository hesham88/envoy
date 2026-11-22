/**
 * `envoy-guard init claude|gemini` — prints the exact hook settings snippet for the user to add.
 * Never edits the user's settings files automatically.
 */
export type SupportedAgent = 'claude' | 'gemini';

export function buildInitSnippet(agent: SupportedAgent, command = 'envoy-guard'): { file: string; note: string; json: Record<string, unknown> } {
  if (agent === 'claude') {
    return {
      file: '.claude/settings.json (or ~/.claude/settings.json)',
      note: 'Basic protection (rules-only in Node; no on-device LLM). Note: Claude Code UserPromptSubmit can block and display a masked copy to paste, but cannot rewrite your prompt inline.',
      json: {
        hooks: {
          UserPromptSubmit: [
            {
              matcher: '',
              hooks: [
                {
                  type: 'command',
                  command: `${command} --agent claude`,
                  timeout: 10,
                },
              ],
            },
          ],
          PreToolUse: [
            {
              matcher: 'WebFetch|Bash|Write|Edit',
              hooks: [
                {
                  type: 'command',
                  command: `${command} --agent claude`,
                  timeout: 10,
                },
              ],
            },
          ],
        },
      },
    };
  }

  return {
    file: '.gemini/settings.json (or ~/.gemini/settings.json)',
    note: 'Basic protection (rules-only in Node; no on-device LLM). Uses Gemini CLI native BeforeAgent and BeforeTool hook events.',
    json: {
      hooks: {
        BeforeAgent: [
          {
            matcher: '*',
            hooks: [
              {
                name: 'envoy-guard-prompt',
                type: 'command',
                command: `${command} --agent gemini`,
              },
            ],
          },
        ],
        BeforeTool: [
          {
            matcher: 'web_fetch|run_shell_command|write_file|replace',
            hooks: [
              {
                name: 'envoy-guard-tool',
                type: 'command',
                command: `${command} --agent gemini`,
              },
            ],
          },
        ],
      },
    },
  };
}
