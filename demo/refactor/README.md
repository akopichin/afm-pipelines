# Refactor workshop demo

The recording begins in an already open workshop. It reviews an illustrative
checkout architecture, asks about rounding, creates two named plans, plays the
component/connection transition, rotates the real 3D graph, approves the plans
and shows the exported result.

The architecture is synthetic. The reply in `evidence/reply.txt` is an actual
Codex response to this example, with provenance recorded beside it. The capture
replays it through the normal publication API; it does **not** run agents or
pretend to show a complete AFM analysis run. Selection, plan creation, approval,
checkpointing and export use the real interface and model. The final cards are
a presentation of the actual exported plan files, not additional product UI.

## Reproduce

Requirements: Node.js 22+, Google Chrome, Python 3 and the pinned requirements.
Use `CHROME_PATH` for a nonstandard Chrome location and `DEMO_FONT` for a font
with Cyrillic support outside macOS (for example DejaVu Sans).

From the catalog root, create a fresh output directory outside the repository:

```sh
python3 -m venv /tmp/refactor-render-venv
/tmp/refactor-render-venv/bin/pip install -r demo/refactor/render-requirements.txt
node demo/refactor/capture.mjs /tmp/refactor-brag-take-1
/tmp/refactor-render-venv/bin/python demo/refactor/encode.py /tmp/refactor-brag-take-1
```

The recorder starts its own isolated Chrome profile and a static preview on an
available loopback port. It closes only the processes it created. Output includes
raw screenshots, frame metadata, a sealed checkpoint, the complete export,
`refactor-workshop.gif`, a silent MP4, poster, contact sheet and validation JSON.
Repeated still frames share files; motion is captured from actual browser frames.
The capture asserts two selected proposals, two nonempty plans, the dependency
between them and no uncaught browser exceptions. Encoding checks duration,
dimensions and a 10 MiB GIF size limit.

The storyboard applies the same
[brag](https://github.com/latent-spaces/brag/blob/069432cac935ed1895859df201c31436c07fb74e/skills/brag/SKILL.md)
creative workflow as `afm-ux-demo`: show the real product immediately, use readable
holds and finish with concrete evidence. It uses the existing CDP/local encoding
approach rather than adding Hyperframes. There is no music or voice-over.

The committed GIF is in `pipelines/refactor/docs/assets/`. Its adjacent
`validation.json` records the current take. The example's exported plans are
linked from the pipeline README. Re-capturing makes no model calls and consumes
no provider quota; replacing the reply requires a new real model response and
updated provenance.
