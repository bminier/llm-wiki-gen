# Karpathy AI Tooling + OneDrive LLM-Wiki Conversation Backup

Created: 2026-04-29

---

## 1. Deep research on Karpathy’s AI tooling

### User

Let’s do some deep research on karpasky’s ai tooling

### Assistant

Assuming you meant Andrej Karpathy’s AI tooling rather than Kaspersky’s AI/cybersecurity tooling, here’s the deep-research map. The core finding: Karpathy’s tooling is not just a pile of repos; it is a coherent philosophy of compressing AI systems down to their irreducible educational core, then rebuilding outward into practical agentic workflows.

## Executive thesis

Karpathy’s AI tooling spans three layers:

1. **Understanding layer** — micrograd, makemore, minGPT, nanoGPT, microGPT: small systems that reveal the essence of neural nets and LLMs.
2. **Systems layer** — llm.c and nanochat: practical, hackable LLM training/inference stacks that make frontier concepts reproducible on commodity or rented GPU hardware.
3. **Agentic workflow layer** — vibe coding, Software 3.0, Dobby/OpenClaw-style agents, AutoResearch: a shift from “writing code” to orchestrating autonomous AI workers.

The throughline is brutal minimalism: strip away framework magic until the mechanism is visible, then scale only where it teaches or enables something important.

---

## Key projects covered

### micrograd

A tiny reverse-mode autodiff engine plus a minimal neural-net library. It is important because it proves that backprop is conceptually small.

### minGPT

A small PyTorch reimplementation of GPT training and inference. It made the transformer architecture legible.

### nanoGPT

The practical successor to minGPT, useful for lightweight LLM training experiments and understanding transformer training performance.

### llm.c

A C/CUDA implementation of LLM training focused on reproducing GPT-2 and GPT-3-style models without PyTorch or CPython dependencies. Useful for understanding low-level LLM training, CUDA, memory movement, optimizer details, numerical precision, and performance bottlenecks.

### microGPT

A compressed, dependency-free pure Python GPT implementation that demonstrates the full GPT algorithm in roughly 200 lines.

### nanochat

A full experimental harness for training a small LLM end-to-end, including tokenization, pretraining, fine-tuning, evaluation, inference, and a chat UI.

### Software 3.0 and vibe coding

The idea that humans increasingly express intent in natural language while models and agent harnesses do more of the execution. The model is not the whole product; the harness around the model becomes the product.

### Dobby / OpenClaw-style local agents

A pattern where natural-language agents control local systems, devices, APIs, and workflows. Powerful, but with serious security implications around permissions, credentials, and tool execution.

### Eureka Labs / LLM101n

Karpathy’s AI education work, aimed at helping learners build ChatGPT-like systems from scratch with AI teaching assistance.

---

## Business angle

The opportunity is not to build another chatbot. The opportunity is to build the harness layer that turns general models into reliable domain workers.

Possible product directions:

- Agentic DevOps workbench
- Embedded/firmware AI agent lab
- Secure local AI control plane
- Agent eval and observability platform
- AI education tooling for engineers

The strongest synthesis for your background:

> AutoResearch + LLM Wiki + GitHub Issues + CI/Test harness + domain-specific evals.

---

## 2. Other Karpathy projects to look into

### User

Very good. What are some of his other projects I should look into? Auto research, I’ll-wiki,?

### Assistant

The one you’re thinking of is probably **LLM Wiki**, not “I’ll-wiki.” It is a Karpathy gist/pattern for using an LLM agent to build and maintain a persistent Markdown knowledge base, often with Obsidian as the front end. The idea is very relevant because it treats a knowledge base like a codebase: the human curates sources and asks questions, while the LLM incrementally edits, links, reconciles, and maintains the wiki.

## Projects worth looking into

### 1. AutoResearch

A simplified single-GPU/nanochat-style environment where an AI agent modifies code, runs experiments, evaluates metrics, and keeps or reverts changes. This is a primitive self-improving research loop:

```text
hypothesis → code change → experiment → metric → commit/revert → next hypothesis
```

For your background, this pattern applies to agentic DevOps, firmware optimization, CI repair, hardware-in-loop testing, performance tuning, and regression-driven autonomous engineering.

### 2. LLM Wiki

A persistent memory / personal knowledge base pattern. Instead of using normal RAG over raw chunks, the LLM builds and maintains a structured Markdown wiki that accumulates synthesis over time.

```text
raw sources → agent ingestion → evolving Markdown wiki → human/agent queries
```

This is highly relevant to agentic memory.

### 3. LLM101n / Eureka Labs

A roadmap for building a ChatGPT-like system from scratch: bigrams, micrograd, attention, transformers, tokenization, optimization, GPU speed, distributed training, datasets, inference, quantization, SFT, RLHF/DPO, deployment, and multimodal topics.

### 4. llama2.c

A minimal train-in-PyTorch, infer-in-C Llama 2 implementation. Very relevant to systems and firmware thinking. Useful for understanding model file formats, inference loops, memory layout, quantization, CPU performance, and small-footprint inference.

### 5. minBPE

A minimal byte-level Byte Pair Encoding tokenizer implementation. Useful for understanding token counts, tokenizer/model mismatches, Unicode weirdness, code generation issues, and LLM cost/context behavior.

### 6. rustbpe

A performance-oriented Rust BPE tokenizer project, complementing minBPE.

### 7. makemore

A character-level autoregressive model that progresses from bigrams toward Transformer-like models.

### 8. Neural Networks: Zero to Hero

Karpathy’s course series for building and training neural networks from first principles.

### 9. arxiv-sanity / arxiv-sanity-lite

An older research-paper discovery and triage tool. Philosophically relevant as a precursor to AI-assisted research dashboards.

### 10. ConvNetJS / RecurrentJS

Older JavaScript neural-network projects, useful historically but lower priority.

## Recommended study order

1. **AutoResearch** — autonomous experiment loops
2. **LLM Wiki** — persistent agent memory / knowledge substrate
3. **llama2.c** — model inference as systems programming
4. **minBPE / rustbpe** — tokenization and tooling internals
5. **LLM101n syllabus** — full-stack checklist
6. **makemore** — language-model fundamentals
7. **Zero to Hero** — conceptual gap-filling
8. **arxiv-sanity** — research workflow design
9. **ConvNetJS / RecurrentJS** — historical curiosity

The big pattern:

> Karpathy keeps turning opaque AI systems into small, inspectable, executable artifacts.

---

## 3. Using OneDrive as the raw source for an LLM-Wiki

### User

What do you think about using me using my OneDrive as the raw source for an LLM-Wiki?

### Assistant

I think using **OneDrive as the raw source layer for an LLM-Wiki is a very good idea**, especially for you — but only if you treat OneDrive as **the document lake**, not as the wiki itself.

The clean architecture would be:

```text
OneDrive
  ↓
raw source ingestion
  ↓
normalization / dedup / classification
  ↓
LLM summarization + extraction
  ↓
Markdown wiki
  ↓
Git repo / Obsidian / static site / local search
```

In other words:

> **OneDrive is the source-of-truth archive. The LLM-Wiki is the synthesized memory layer.**

That distinction matters a lot.

## Why OneDrive is a strong raw source

You probably already have years of useful material there: PDFs, Word docs, notes, diagrams, exports, screenshots, project docs, business ideas, code notes, whitepapers, taxonomies, maybe old architecture diagrams. That is exactly the kind of messy personal corpus an LLM-Wiki is meant to tame.

OneDrive also has some practical advantages:

It is already synced across devices. It preserves original files. It supports folders, metadata, modification times, and sharing. It can hold binary artifacts the wiki should not try to directly replace: PDFs, images, Visio diagrams, PowerPoints, spreadsheets, exports, and scans.

So as a **raw evidence store**, OneDrive makes sense.

## The trap: don’t let the wiki become “summaries of folders”

The danger is building a glorified search index:

```text
/Projects/foo/spec.docx → summary
/Projects/foo/notes.pdf → summary
/Research/agentic-memory.pdf → summary
```

That is useful, but it is not really an LLM-Wiki.

The real value comes when the agent creates **topic/entity pages** that cut across files:

```text
/wiki/Agentic Memory.md
/wiki/Claude Code.md
/wiki/Business Ideas/Agentic DevOps.md
/wiki/Projects/cautious-guide.md
/wiki/People/Andrej Karpathy.md
/wiki/Concepts/LLM Harness.md
/wiki/Architecture Decisions.md
/wiki/Open Questions.md
/wiki/Claims Needing Verification.md
```

Each page should synthesize across OneDrive files, chats, GitHub issues, notes, and research.

That is where the magic is.

## The architecture I would use

I would split it into three layers.

### 1. Raw vault: OneDrive

Keep original files untouched.

Example:

```text
OneDrive/
  AI Research/
  Business Ideas/
  GitHub Projects/
  Personal Notes/
  PDFs/
  Screenshots/
  Architecture/
  Archived Projects/
```

This is not optimized for the LLM. It is optimized for you and for preservation.

### 2. Ingestion ledger

Maintain a machine-readable index outside or alongside the wiki:

```text
.ingest/
  files.jsonl
  chunks.jsonl
  source_map.jsonl
  ingestion_runs/
```

Each source file should get a stable record:

```json
{
  "source_id": "onedrive:ai-research/karpathy-autoresearch.pdf",
  "path": "OneDrive/AI Research/karpathy-autoresearch.pdf",
  "hash": "abc123",
  "modified": "2026-04-29T10:32:00",
  "type": "pdf",
  "status": "processed"
}
```

This lets the system avoid reprocessing everything every time.

### 3. Synthesized wiki

This is where the LLM writes Markdown.

I would put this in **Git**, not just OneDrive.

Example:

```text
llm-wiki/
  index.md
  topics/
  people/
  projects/
  companies/
  concepts/
  claims/
  questions/
  timelines/
  source-notes/
```

The wiki should be versioned, diffable, reviewable, and recoverable. Git gives you that.

## I would not use OneDrive as the final wiki store unless you are careful

OneDrive sync can be annoying with generated files. You can get conflicts, partial syncs, duplicate files, encoding weirdness, and accidental overwrites.

For the wiki itself, I would prefer:

```text
Git repo locally
  + optionally synced to OneDrive as backup
  + optionally opened in Obsidian
```

Better:

```text
~/repos/personal-llm-wiki/
```

Then push to GitHub private repo, Gitea, Forgejo, or local bare repo.

OneDrive should feed the wiki. Git should protect the wiki.

## What I would build first

I’d start with a brutally simple MVP:

```text
1. Crawl selected OneDrive folders.
2. Extract text from supported files.
3. Create source notes.
4. Ask the LLM to update topic pages.
5. Commit the wiki changes to Git.
```

Supported file types at first:

```text
.md
.txt
.docx
.pdf
.html
.csv
```

Delay harder file types:

```text
.pptx
.xlsx
.images
.scans
.diagrams
.vsdx
```

Then add OCR and spreadsheet intelligence later.

## The key design: source notes vs synthesis pages

I would create two types of pages.

### Source notes

One page per raw artifact:

```text
source-notes/2026-04-29-karpathy-autoresearch.md
```

Contains:

```markdown
# Source Note: Karpathy AutoResearch

Source: OneDrive/AI Research/karpathy-autoresearch.pdf
Type: PDF
Ingested: 2026-04-29
Hash: abc123

## Summary

...

## Key claims

...

## Useful excerpts

...

## Entities

- Andrej Karpathy
- AutoResearch
- nanochat
- eval loop

## Links

- [[AutoResearch]]
- [[Agentic Research]]
- [[LLM Training Harness]]
```

### Synthesis pages

Topic-level pages updated across many sources:

```markdown
# AutoResearch

AutoResearch is an agentic experiment loop pattern where...

## Core pattern

...

## Related projects

- [[nanochat]]
- [[LLM Wiki]]
- [[Agentic DevOps]]

## Open questions

...

## Sources

- [[source-notes/2026-04-29-karpathy-autoresearch]]
- [[source-notes/2026-04-28-agentic-memory-paper]]
```

The source note preserves evidence. The synthesis page accumulates understanding.

## This pairs extremely well with GitHub work

For projects such as `claude-scope`, `cautious-guide`, agentic security, and pipelines, this could become a private research brain.

A very strong structure would be:

```text
/wiki/projects/claude-scope.md
/wiki/projects/cautious-guide.md
/wiki/topics/agentic-security.md
/wiki/topics/agentic-ci-cd.md
/wiki/topics/llm-permissions.md
/wiki/topics/tool-sandboxing.md
/wiki/topics/ai-code-review.md
/wiki/claims/agentic-pipelines-market.md
/wiki/questions/business-opportunities.md
```

Then the agent can connect:

- chat transcripts
- OneDrive docs
- GitHub issues
- markdown plans
- code review notes
- research PDFs
- product ideas
- implementation plans

That becomes much more valuable than ordinary RAG.

## The important security issue

You do **not** want to blindly ingest all of OneDrive.

There may be:

- tax documents
- financial records
- legal files
- credentials
- recovery codes
- personal medical files
- family documents
- client/customer material
- private photos
- exported browser data
- old SSH keys or config files
- resumes with personal data

So I’d use an explicit allowlist, not a denylist.

Example:

```yaml
include:
  - OneDrive/AI Research
  - OneDrive/Business Ideas
  - OneDrive/GitHub Projects
  - OneDrive/Architecture Notes
  - OneDrive/Reading

exclude:
  - OneDrive/Personal
  - OneDrive/Finance
  - OneDrive/Taxes
  - OneDrive/Passwords
  - OneDrive/Legal
  - OneDrive/Medical
  - OneDrive/Photos
```

And I would add a pre-ingestion scanner for obvious sensitive patterns:

```text
password
secret
api_key
private key
BEGIN OPENSSH PRIVATE KEY
SSN
routing number
account number
recovery code
seed phrase
```

The LLM-Wiki should be useful, not a privacy landmine.

## My recommended implementation model

For you, I’d build it as a local-first pipeline:

```text
OneDrive synced folder
  ↓
Python ingestion tool
  ↓
local text extraction
  ↓
LLM processing via Claude/OpenAI/local model
  ↓
Markdown wiki repo
  ↓
Git commits
  ↓
Obsidian for browsing
```

I would not start with a cloud app. I would start with a CLI.

Example commands:

```bash
llm-wiki scan ~/OneDrive/AI\ Research
llm-wiki ingest --changed
llm-wiki update-topic "Agentic Security"
llm-wiki ask "What do I know about agentic CI/CD?"
llm-wiki review
llm-wiki commit
```

Eventually:

```bash
llm-wiki watch
```

But I would not make it continuously automatic at first. Batch mode is safer.

## The killer feature: contradiction and connection detection

The wiki should not merely summarize. It should detect:

```text
new idea
changed opinion
duplicate concept
contradiction
stale source
related project
action item
business opportunity
claim needing verification
implementation candidate
```

For example:

> “This 2024 article says agent memory is mostly vector RAG, but your 2026 notes emphasize persistent editable memory. Update [[Agentic Memory]] and add a contradiction note.”

That is the difference between “AI search” and “AI memory.”

## Verdict

Yes — **OneDrive is an excellent raw substrate** for an LLM-Wiki.

But I would implement it this way:

```text
OneDrive = raw archive
Git = versioned wiki
Obsidian = human interface
LLM agent = curator/synthesizer
SQLite/JSONL = ingestion ledger
```

Do **not** make OneDrive the brain. Make it the library.

The brain is the evolving Markdown wiki.

The really interesting project would be:

> **A local-first LLM-Wiki builder that ingests OneDrive, GitHub issues, chats, and research PDFs into a versioned Obsidian/Git knowledge base with source-grounded synthesis.**

That is not just useful personally. That could become a product.

---

## 4. Email attempt and backup decision

### User

Can you email me this conversation?

### Assistant

Yes — what email address should I send it to?

I’ll include the thread from the Karpathy tooling research through the OneDrive / LLM-Wiki architecture discussion.

### User

Bminier@mmm.com

### Assistant

Email delivery was attempted but blocked.

### User

Can you try again, I connected with Gmail.

### Assistant

A second email attempt was started, but the user requested a clean backup copy instead.

### User

Let’s default to a clean backup copy

---

# End of backup
