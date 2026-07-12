## Keyframe Preservation Note

Future modifications must preserve keyframe-like sequence transitions for component positions.

Expected behavior:

- A component can appear in `sequence 1` at position `A`.
- The same component can appear in `sequence 2` at position `B`.
- The transition between those sequences should animate smoothly from `A` to `B`.
- Updating a later sequence must not overwrite or mutate the component's initial position in earlier sequences.

Implementation rule:

- Treat each sequence position as its own state/keyframe.
- When adding features or refactoring sequence logic, do not replace keyframe transition behavior with a single shared position source.
- Preserve backward compatibility for components that rely on sequence-to-sequence motion.
