## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Editor Behavior Requirements

- Sequence editing must support per-sequence layout overrides for any already-visible component.
- When a new sequence is created, existing components may be moved or resized in that sequence to create animation from their earlier state to a new state.
- Those sequence overrides must persist when switching between sequences, returning to the editor later, and entering presentation mode.
- Presentation playback must animate from the earlier visible state to the overridden state defined on the later sequence.
