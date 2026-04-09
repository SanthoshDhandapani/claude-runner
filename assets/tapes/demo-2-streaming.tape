# Demo 2: Streaming SDK — watch Claude work
# Run: vhs demo-2-streaming.tape

Output demo-2-streaming.gif

Set FontSize 16
Set Width 900
Set Height 500
Set Theme "Homebrew"
Set Padding 20
Set Shell zsh

# Warm up + navigate + write both scripts silently
Hide
Type "cd ~/Documents/dev/E2E_Skills_Work/specwright/apps/examples/show-buff"
Enter
Sleep 1s
Type "export CR=~/Documents/dev/E2E_Skills_Work/claude-runner"
Enter
Sleep 500ms
Type "node $CR/dist/cli.js -p auto 'hello' > /dev/null 2>&1"
Enter
Sleep 15s
Type "cat <<EOF > /tmp/demo.js"
Enter
Type "import { Runner } from '$CR/dist/index.js';"
Enter
Type ""
Enter
Type "const runner = new Runner({ model: 'sonnet', permissions: 'auto' });"
Enter
Type ""
Enter
Type "for await (const event of runner.stream('Read src/App.tsx and suggest 3 improvements')) {"
Enter
Type "  switch (event.type) {"
Enter
Type "    case 'text': process.stdout.write(event.text); break;"
Enter
Type "    case 'tool_start': console.error('  > ' + event.tool); break;"
Enter
Type "    case 'tool_end': console.error('  < ' + event.tool); break;"
Enter
Type "    case 'done': console.error('Cost: ' + event.result.cost.toFixed(4)); break;"
Enter
Type "  }"
Enter
Type "}"
Enter
Type "EOF"
Enter
Sleep 500ms
Type "cat <<'DISPLAY' > /tmp/demo-display.js"
Enter
Type "import { Runner } from 'claude-runner';"
Enter
Type ""
Enter
Type "const runner = new Runner({ model: 'sonnet', permissions: 'auto' });"
Enter
Type ""
Enter
Type "for await (const event of runner.stream('Read src/App.tsx and suggest 3 improvements')) {"
Enter
Type "  switch (event.type) {"
Enter
Type "    case 'text': process.stdout.write(event.text); break;"
Enter
Type "    case 'tool_start': console.error('  > ' + event.tool); break;"
Enter
Type "    case 'tool_end': console.error('  < ' + event.tool); break;"
Enter
Type "    case 'done': console.error('Cost: ' + event.result.cost.toFixed(4)); break;"
Enter
Type "  }"
Enter
Type "}"
Enter
Type "DISPLAY"
Enter
Sleep 500ms
Type "clear"
Enter
Sleep 500ms
Show

Set TypingSpeed 50ms

Type "cat /tmp/demo-display.js"
Enter
Sleep 3s

Type "node /tmp/demo.js"
Enter
Sleep 25s
