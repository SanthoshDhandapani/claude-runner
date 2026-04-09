# Demo 1: Quick Start — CLI one-liner
# Run: vhs demo-1-quickstart.tape

Output demo-1-quickstart.gif

Set FontSize 16
Set Width 900
Set Height 450
Set Theme "Homebrew"
Set Padding 20
Set TypingSpeed 50ms
Set Shell zsh

# Warm up + navigate silently
Hide
Type "cd ~/Documents/dev/E2E_Skills_Work/specwright/apps/examples/show-buff"
Enter
Sleep 1s
Type "alias claude-runner='node ~/Documents/dev/E2E_Skills_Work/claude-runner/dist/cli.js'"
Enter
Sleep 500ms
Type "claude-runner -p auto 'hello' > /dev/null 2>&1"
Enter
Sleep 15s
Type "clear"
Enter
Sleep 500ms
Show

Type "ls src/"
Enter
Sleep 2s

Type "claude-runner -p auto 'Read package.json and tell me what this app is in 3 bullet points.'"
Enter
Sleep 20s
