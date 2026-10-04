export function runMcpStub(): void {
  process.stderr.write('The MCP server ships in the next release\n');
  process.exitCode = 1;
}
