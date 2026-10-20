export const meta = {
  name: 'scforge-round',
  description: 'One feature per run through the scforge-round steps, in order',
  phases: [
    { title: 'Plan', detail: 'planner picks one feature; agent names read from the role map' },
    { title: 'Red', detail: 'failing test committed alone' },
    { title: 'Build', detail: 'sde implements, then the test-path lock check' },
    { title: 'Check', detail: 'code checks (fix loop max 3, escalate on repeat), then the secret and size checks' },
    { title: 'Judge', detail: 'judge verdict as plain JSON, then record it' },
  ],
}
// args: { repo: "C:\...", roundId: "20261020c", plugin: "<plugin root>" }
// RND = node <plugin>/scripts/scforge-round.js. Gate commands live in .scforge/config.json; RND runs them.
const RND = `node "${args.plugin}/scripts/scforge-round.js"`
// Step strings are joined so the ordered literals below stay the first mention of each step.
const BASE = [RND, 'gates', '--reset'].join(' ')
const GUARD = [RND, 'guard'].join(' ')
const IN = `Repo: ${args.repo}. Run shell steps from that directory.`
const OBJ = (properties, required) => ({ type: 'object', properties, required })
const REPORT = OBJ({
  summary: { type: 'string' }, filesChanged: { type: 'array', items: { type: 'string' } },
  doneCheckRan: { type: 'boolean' }, doneCheckOutput: { type: 'string' }, blockedOn: { type: 'string' },
  commitSha: { type: 'string' } }, ['summary', 'doneCheckRan', 'doneCheckOutput'])
const SHELL = OBJ({ exit: { type: 'integer' }, output: { type: 'string' } }, ['exit', 'output'])
const sh = (cmd, label, phaseName) => agent(`${IN}\nRun exactly this command, change nothing, return its exit code and its stdout (shortest decisive lines on failure):\n${cmd}`,
  { effort: 'low', label, phase: phaseName, schema: SHELL })
const stop = (why, extra) => { log(why); return { stopped: why, ...extra } }

phase('Plan')
const roles = await agent(`${IN}\nRead the line starting with "Agents:" in .scforge/CLAUDE.factory.md (role = agent name pairs). Return the map as JSON.`,
  { effort: 'low', label: 'roles', phase: 'Plan',
    schema: OBJ({ planner: { type: 'string' }, sde: { type: 'string' }, judge: { type: 'string' }, 'build-fixer': { type: 'string' } }, ['planner', 'sde', 'judge', 'build-fixer']) })
if (!roles) return stop('role map unreadable')
const plan = await agent(`${IN}\nPlan from .scforge/state/features.json. Pick the first feature with passes false. If it has needs_clarification, return blockedOn and stop. Do not set passes.`,
  { agentType: roles.planner, label: 'plan', phase: 'Plan', schema: OBJ({ featureId: { type: 'string' }, blockedOn: { type: 'string' } }, ['featureId']) })
if (!plan || plan.blockedOn) return stop(`plan blocked: ${plan && plan.blockedOn}`)
const base = await sh(BASE, 'baseline', 'Plan')
if (!base || base.exit !== 0) return stop('baseline red', { baseline: base })

phase('Red')
const red = await agent(`${IN}\nFeature ${plan.featureId}. Write only the failing test for it and commit it alone with trailer "round_id: ${args.roundId}". Run ${GUARD} (no sha) before committing; non-zero means stop. Return the commit sha in commitSha and paste the red output.`,
  { agentType: roles.sde, label: 'red-test', phase: 'Red', schema: REPORT })
if (!red || !red.commitSha) return stop('no red commit')
const RED = red.commitSha

phase('Build')
const built = await agent(`${IN}\nFeature ${plan.featureId}. Implement until its done-check passes. Do not edit test paths after ${RED}. Run the done-check and paste its output.`,
  { agentType: roles.sde, label: 'build', phase: 'Build', schema: REPORT })
if (!built || !built.doneCheckRan) return stop('done-check not run, not done', { built })
const locked = await sh(`${RND} locked ${RED}`, 'locked', 'Build')
if (!locked || locked.exit !== 0) return stop('test paths changed after red commit', { locked })

phase('Check')
let gate = await sh(`${RND} gates --reset`, 'gates', 'Check')
while (gate && gate.exit !== 0) {
  let next
  try { next = JSON.parse(gate.output).next } catch (e) { next = 'escalate' }
  if (next !== 'fix') return stop('gates red, escalate', { gate })
  await agent(`${IN}\nGates are red. Fix the cause, not the test. Failures:\n${gate.output}`,
    { agentType: roles['build-fixer'], label: 'fix', phase: 'Check' })
  gate = await sh(`${RND} gates`, 'regate', 'Check')
}
if (!gate) return stop('gates did not run')
const secrets = await sh(`${RND} secrets`, 'secrets', 'Check')
if (!secrets || secrets.exit !== 0) return stop('secret-found', { secrets })
const guard = await sh(`${RND} guard ${RED}`, 'guard', 'Check')
if (!guard || guard.exit !== 0) return stop('guard failed', { guard })

phase('Judge')
const verdict = await agent(`${IN}\nJudge feature ${plan.featureId}. Inputs: diff since ${RED}, gate JSON ${gate.output}, done-check output below. Return the plain JSON verdict.\n${built.doneCheckOutput}`,
  { agentType: roles.judge, label: 'judge', phase: 'Judge' })
if (!verdict) return stop('no verdict')
const flip = await sh(`write the verdict JSON below to .scforge/state/verdict.json, then run ${RND} flip .scforge/state/verdict.json\n${JSON.stringify(verdict)}`, 'flip', 'Judge')
return { feature: plan.featureId, red: RED, verdict, flip }
