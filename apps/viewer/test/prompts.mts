import assert from "node:assert/strict";

import {
  buildPrompt,
  defaultPromptTemplates,
  detectPromptLanguage,
  loadPromptTemplates,
  promptKinds,
  savePromptTemplates,
} from "../src/prompts.ts";

const localStorage = new Map<string, string>();
Object.defineProperty(globalThis, "window", {
  value: { localStorage: { getItem: (key: string) => localStorage.get(key) ?? null, setItem: (key: string, value: string) => localStorage.set(key, value) } },
});

const node = {
  id: "src/repositories/session-repository.ts:5",
  data: {
    flowId: "POST /api/auth/login",
    variant: "db",
    order: 7,
    step: {
      order: 7,
      kind: "db",
      table: "sessions",
      op: "create",
      description: "Stores the refresh token",
      filePath: "src/repositories/session-repository.ts",
      layer: "repository",
      line: 5,
      column: 4,
      raw: "// [POST: /api/auth/login flow-7 db:sessions:create] Stores the refresh token",
    },
    diagnostics: [],
    isStart: false,
    isEnd: false,
  },
} as any;

const startNode = {
  ...node,
  id: "src/controllers/auth-controller.ts:12",
  data: {
    ...node.data,
    order: 1,
    step: {
      ...node.data.step,
      order: 1,
      kind: "step",
      filePath: "src/controllers/auth-controller.ts",
      line: 12,
    },
  },
} as any;

assert.equal(detectPromptLanguage(["ko-KR"]), "ko");
assert.equal(detectPromptLanguage(["ja-JP"]), "ja");
assert.equal(detectPromptLanguage(["ja-JP", "ko-KR"]), "ja");
assert.equal(detectPromptLanguage(["fr-FR"]), "en");

const complete = buildPrompt({ kind: "security", language: "ko", nodes: [startNode, node], allSelected: true });
assert.match(complete, /\[POST: \/api\/auth\/login\] 주석에 정의된 전체 flow 점검/);
assert.match(complete, /시작 위치: src\/controllers\/auth-controller\.ts:12 \(flow-1, step\)/);
assert.doesNotMatch(complete, /점검하세요|수정하세요|해라|읽어라|마라/);

const partial = buildPrompt({ kind: "optimization", language: "ja", nodes: [node], allSelected: false });
assert.match(partial, /N\+1/);
assert.match(partial, /"path": "src\/repositories\/session-repository\.ts"/);
assert.match(partial, /"line": 5/);
assert.match(partial, /"route": "POST \/api\/auth\/login"/);
assert.match(partial, /"flow": 7/);
assert.match(partial, /"kind": "db"/);
assert.match(partial, /"detail": "sessions:create"/);
assert.doesNotMatch(partial, /absoluteFilePath|databaseTable|diagnostics|raw/);

const custom = buildPrompt({
  kind: "paths",
  language: "en",
  nodes: [node],
  allSelected: false,
  template: "Custom instructions without a placeholder.",
});
assert.match(custom, /^Custom instructions without a placeholder\./);
assert.match(custom, /selected locations and metadata/);

const savedTemplates = { ...defaultPromptTemplates("en"), "API docs": "Write API docs.\n\n{{target}}" };
assert.equal(savePromptTemplates("en", savedTemplates), true);
assert.equal(loadPromptTemplates("en")["API docs"], savedTemplates["API docs"]);
assert.deepEqual(promptKinds(loadPromptTemplates("en")).at(-1), { value: "API docs", label: "API docs" });
delete savedTemplates.security;
assert.equal(savePromptTemplates("en", savedTemplates), true);
assert.equal(loadPromptTemplates("en").security, undefined);

console.log("프롬프트 언어·전체/부분 선택·동적 위치 정보 테스트 통과");
