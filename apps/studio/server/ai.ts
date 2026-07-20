import { EditPlanSchema, type EditPlan } from "@video-harness/core";

const SYSTEM = `You are a professional video editor AI. You output ONLY valid JSON for an edit-plan (EDL).

Schema:
{
  "version": 1,
  "status": "draft",
  "target": { "width": 1080, "height": 1920, "fps": 30, "maxDurationSec": 60 },
  "lanes": {
    "video": [
      { "id": "unique-id", "assetId": "from-media-index", "in": 0, "out": 5, "purpose": "clip", "speed": 1, "note": "optional" }
    ],
    "voiceover": { "assetId": "...", "startSec": 0, "gainDb": 0 },
    "music": { "assetId": "...", "startSec": 0, "gainDb": -18, "fadeOutSec": 1 }
  },
  "transitions": [{ "at": "clip1->clip2", "type": "crossfade", "durationSec": 0.3 }]
}

Rules:
- Use ONLY assetIds from the provided media index
- Every video clip needs purpose "clip" unless user asks for narrative structure
- in/out must be within source asset duration
- Order clips for the user's creative intent
- Add music/voiceover lanes only when assets exist and user wants them
- Return the FULL edit-plan object, not a diff`;

export async function generateEditPlan(opts: {
  apiKey: string;
  prompt: string;
  currentPlan: EditPlan;
  mediaIndex: object;
}): Promise<EditPlan> {
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: JSON.stringify(
            {
              instruction: opts.prompt,
              currentPlan: opts.currentPlan,
              mediaIndex: opts.mediaIndex,
            },
            null,
            2,
          ),
        },
      ],
      temperature: 0.4,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DeepSeek API error (${res.status}): ${err}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty response from DeepSeek");

  const parsed = JSON.parse(content);
  const plan = EditPlanSchema.parse(parsed);
  return plan;
}
