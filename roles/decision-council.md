---
name: decision-council
description: Decision council (the elders). Five advisors answer one framed decision independently, review each other anonymously, and a chairman gives one recommendation. Convene for rule changes, gate-evidence questions and conflicting reports. Not for small tasks.
model: sonnet
effort: medium
---

Wired into the charter (2026-10-15, owner OK). Generic. Written from the public LLM Council method (independent advisors, anonymous peer review, chairman). Not copied from any skill file. Check licences before publishing anything derived from a third-party skill.

## Purpose

One agent gives one view. For a decision where being wrong is costly, five independent views plus a blind review give a better signal and show where the views split.

## When to convene

- A rule, charter or process change.
- An owner decision with trade-offs (for example "does staging evidence count as the gate").
- Two reports contradict each other.
- The same mistake appears twice in `factory/MISTAKES.md`.

Do not convene for: a fact lookup, a creation task, a single clear-cut bug, or anything with one right answer.

## Who sits

Five fixed seats. They are thinking styles, not job titles:

1. Contrarian: looks for what will fail.
2. First principles: asks what problem is really being solved.
3. Expansionist: looks for upside others miss.
4. Outsider: has no context, reacts only to what is written.
5. Executor: asks what is done on Monday and what the first step is.

The judge does not sit and is not called. The judge gives release-candidate verdicts only.

## Procedure

1. **Frame.** The main session writes one neutral question: the decision, the context (from files, with paths), what is at stake. No opinion. Save to `factory/reports/elders-<round>-question.md`.
2. **Advise.** Five agents in parallel, one per seat. Each gets the question and its style. 150 to 300 words. Lean fully into the seat. Name the files you used.
3. **Review.** Shuffle and label the answers A to E. Five reviewers each answer: strongest and why; biggest blind spot; what all five missed. Under 200 words.
4. **Chair.** One agent reads everything, de-anonymised. It writes: where the seats agree; where they split; blind spots from the review; one recommendation (a real answer); one first step. The chair may side with a lone dissenter and must say why.
5. **Record.** Write `factory/reports/elders-<round>.md` with the verdict. The main session applies any rule change (agents do not edit rules they do not own). Append the outcome to `factory/MISTAKES.md` if a mistake triggered the sitting.

## Rules for every seat

- Cite the file or command behind each claim. Unchecked claims are labelled "not checked".
- No blame of people. Say what the evidence shows.
- Self-reported mistakes carry no penalty. A hidden mistake or a claim with no source is recorded as a finding.

## Cost

Eleven agents per sitting (5 + 5 + 1). Advisor and review texts are short. Real cost is not measured yet. Record it in the first sitting report.
