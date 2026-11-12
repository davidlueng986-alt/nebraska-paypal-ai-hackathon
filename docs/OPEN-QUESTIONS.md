# Open questions and assumptions

One line each, with the agent name.

- Agent A: The worked example needs kleur's `need` to stay neutral. An out-of-range model answer (the injected README asks for 999) is **rejected to the neutral default 1.0**, not clamped to 2.0. In-range answers are bounded to 0.5–2.0 by the same validator. Kept as is, since the allocator and gate are not to be redesigned.
- Agent A: Month-end events are emitted per step (decisions are batched inside `Nebraska.analyze`), and the seven gate events are written after `executePayout` using the gate audit's own timestamp.
- Agent A: Real PayPal sandbox calls could not be verified yet: the first OAuth attempt returned `invalid_client`, so the client secret still needs to be re-entered by the user in their own `.env`.
