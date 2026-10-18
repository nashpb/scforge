export const meta = {
  name: 'factory-round',
  description: 'Run the planned teams in parallel, enforce real gates with retry, then update the board',
  phases: [
    { title: 'Build', detail: 'one agent per planned task' },
    { title: 'Gates', detail: 'typecheck, test, build exit codes; fix and re-gate up to 2 times' },
    { title: 'Board', detail: 'PM updates factory/BOARD.md' },
  ],
}
// args: { round: 9, repo: "C:\...", tasks: [{ team: "sde", task: "...", files: "src/...", doneCheck: "command + expected" }] }
// Founder plan comes first (agent step, outside this script). RC + judge come after (main session).
const REPORT = { type: 'object', properties: {
  summary: { type: 'string' }, filesChanged: { type: 'array', items: { type: 'string' } },
  doneCheckRan: { type: 'boolean' }, doneCheckOutput: { type: 'string' },
  blockedOn: { type: 'string' } }, required: ['summary', 'doneCheckRan', 'doneCheckOutput'] }
const GATES = { type: 'object', properties: {
  typecheck: { type: 'integer' }, test: { type: 'integer' }, build: { type: 'integer' },
  failures: { type: 'string' } }, required: ['typecheck', 'test', 'build'] }

phase('Build')
const reports = await parallel(args.tasks.map(t => () =>
  agent(`Round ${args.round}. Task: ${t.task}\nWrite only inside: ${t.files}\nDone-check (you must run it and paste the output): ${t.doneCheck}\nRepo: ${args.repo}. Follow factory/CHARTER.md.`,
    { agentType: t.team, label: t.team, phase: 'Build', schema: REPORT })))
const built = reports.map((r, i) => ({ team: args.tasks[i].team, ...(r || { summary: 'agent failed', doneCheckRan: false, doneCheckOutput: '' }) }))
built.filter(b => !b.doneCheckRan).forEach(b => log(`${b.team}: done-check NOT run, treat as not done`))

phase('Gates')
const runGates = () => agent(`In ${args.repo} run, in order, bun run typecheck, bun test, bun run build. Return each exit code as an integer, and for any non-zero the shortest decisive failing lines. Do not fix anything.`,
  { agentType: 'sdet', effort: 'low', label: 'gates', phase: 'Gates', schema: GATES })
let gates = await runGates()
for (let i = 0; i < 2 && gates && (gates.typecheck || gates.test || gates.build); i++) {
  log(`gates red (try ${i + 1}): ${gates.failures || ''}`)
  await agent(`Gates are red in ${args.repo}. Fix the cause, not the test, unless the pin is stale. Failures:\n${gates.failures}`,
    { agentType: 'sde', label: `fix-${i + 1}`, phase: 'Gates' })
  gates = await runGates()
}
const red = !gates || gates.typecheck || gates.test || gates.build

phase('Board')
await agent(`Update factory/BOARD.md for round ${args.round} from these results, short and factual: backlog, in progress, done (only if its done-check ran and passed), defects open, job row (14) status, gates: ${JSON.stringify(gates)}.\nResults: ${JSON.stringify(built)}`,
  { agentType: 'project-manager', effort: 'low', label: 'board', phase: 'Board' })
return { built, gates, red, notDone: built.filter(b => !b.doneCheckRan).map(b => b.team) }
