export type AIResponseKind = "summary" | "task-context" | "task-start";

export const responseSchemas = {
  "task-start": {
    type: "object",
    properties: {
      title: { type: "string", minLength: 1, maxLength: 80 },
      goal: { type: "string", minLength: 1, maxLength: 500 },
      searches: { type: "array", items: { type: "string", minLength: 1, maxLength: 160 }, minItems: 2, maxItems: 3 },
    },
    required: ["title", "goal", "searches"],
    additionalProperties: false,
  },
  "task-context": {
    type: "object",
    properties: {
      goal: { type: "string", maxLength: 300 },
      searches: { type: "array", items: { type: "string", maxLength: 160 }, maxItems: 2 },
    },
    required: ["goal", "searches"],
    additionalProperties: false,
  },
  summary: {
    type: "object",
    properties: { summary: { type: "string" } },
    required: ["summary"],
    additionalProperties: false,
  },
} as const;

export function responseSchema(kind: AIResponseKind = "summary") {
  return responseSchemas[kind];
}
