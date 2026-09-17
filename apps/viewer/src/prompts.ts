import type { StepNode } from "./graph/model"

export type PromptLanguage = "en" | "ko" | "ja"
export type PromptKind = string
export type PromptTemplates = Record<PromptKind, string>

export const PROMPT_LANGUAGES: { value: PromptLanguage; label: string }[] = [
  { value: "en", label: "EN" },
  { value: "ko", label: "한국어" },
  { value: "ja", label: "日本語" },
]

export const PROMPT_KINDS: { value: PromptKind; label: string }[] = [
  { value: "paths", label: "File paths" },
  { value: "security", label: "Security review" },
  { value: "optimization", label: "Optimization review" },
]

const defaultPromptKeys = new Set(PROMPT_KINDS.map(({ value }) => value))

const DEFAULT_PROMPTS: Record<PromptLanguage, PromptTemplates> = {
  en: {
    paths: `Use this scope to find the code that needs work quickly. Read the referenced flow annotations, surrounding implementation, and relevant callers before changing anything.

{{target}}`,
    security: `Perform a focused security review of the selected REST API flow and fix confirmed high-impact issues.

{{target}}

Treat the supplied metadata as navigation hints, not proof. Inspect the actual implementation, callers, middleware, configuration, and data access reached by this flow. Follow the repository's real Node.js or Python stack instead of assuming a framework.

Check the essentials:
1. Authentication, endpoint and object-level authorization, role checks, and tenant isolation on every branch.
2. Input validation for type, format, range, size, allowlists, and unsafe mass assignment.
3. SQL/NoSQL/command/template injection, unsafe deserialization, path traversal, file access, and SSRF.
4. Passwords, secrets, tokens, sessions, JWT validation, expiry/revocation, cookie flags, CSRF, and CORS where applicable.
5. Sensitive data exposed through responses, logs, errors, over-broad field selection, or debug output.
6. Rate limits, brute force, replay protection, idempotency for writes/webhooks, and denial-of-service risks.
7. Transaction boundaries, race conditions, and failure paths that can bypass checks or leave partial state.
8. Vulnerable dependencies or insecure defaults only when this flow actually reaches them.

Do not invent findings. For each confirmed issue, state severity, exploit scenario, and exact file:line evidence. Implement the smallest safe fix, preserve public API behavior unless it is unsafe, and run the smallest relevant tests or checks. Finish with changed files and remaining risks. If nothing is confirmed, say so and list what you verified.`,
    optimization: `Perform a focused performance review of the selected REST API flow and fix confirmed high-impact bottlenecks.

{{target}}

Treat the supplied metadata as navigation hints, not proof. Inspect the actual implementation, callers, data access, and external services reached by this flow. Follow the repository's real Node.js or Python stack instead of assuming a framework.

Check the essentials:
1. N+1 queries or requests, including queries inside loops, per-item resolvers, lazy relations, and repeated service calls.
2. Database query count, missing or ineffective indexes, avoidable full scans, filters/sorts, pagination, projections, and bulk operations.
3. Sequential independent I/O that can safely run concurrently, without breaking transactions, limits, or ordering.
4. Blocking synchronous I/O, CPU-heavy work on request threads/event loops, oversized payloads, serialization, and unbounded in-memory lists.
5. Duplicate external calls, connection pooling, timeouts, retries, backoff, and response/body cleanup.
6. Caching only where reuse is measurable and freshness, invalidation, and memory limits are explicit.
7. Hot-path logging, repeated parsing/conversion, and work that can be moved out of the request path.

Measure or show code-level evidence before claiming an improvement. For each confirmed issue, state impact, exact file:line evidence, and the smallest effective change. Implement verified fixes without changing response semantics, then run the smallest relevant tests or checks. Label unmeasured ideas as hypotheses and do not add speculative abstractions, dependencies, or caches.`,
  },
  ko: {
    paths: `수정할 코드부터 빠르게 찾아줘. 변경 전 해당 flow 주석, 주변 구현, 관련 호출부를 읽어줘.

{{target}}`,
    security: `선택 REST API flow 보안 점검. 실제로 확인된 고위험 문제만 수정해줘.

{{target}}

메타데이터는 탐색 단서일 뿐 증거가 아님. 실제 구현, 호출부, 미들웨어, 설정, 데이터 접근을 확인해줘. 프레임워크 추측 말고 저장소의 실제 Node.js 또는 Python 스택 기준으로 진행해줘.

필수 점검 항목:
1. 모든 분기의 인증, endpoint·object 단위 인가, role 검사, tenant 격리
2. type·format·range·size·allowlist 입력 검증, 위험한 mass assignment
3. SQL/NoSQL/command/template injection, 위험한 역직렬화, path traversal, 파일 접근, SSRF
4. password·secret·token·session, JWT 검증, 만료·폐기, cookie 속성, 필요 시 CSRF·CORS
5. response·log·error·과도한 field 조회·debug 출력의 민감 정보 노출
6. rate limit, brute force, replay 방지, write·webhook idempotency, DoS 위험
7. 검사 우회 또는 부분 상태를 남기는 transaction 경계, race condition, 실패 경로
8. 이 flow가 실제 사용하는 취약 dependency 또는 안전하지 않은 기본 설정

문제 만들지 마. 확인된 문제마다 severity, 공격 시나리오, 정확한 file:line 근거를 남겨줘. 최소 안전 수정만 해줘. 안전상 필요하지 않다면 공개 API 동작 유지해줘. 최소 관련 test 또는 check 실행해줘. 변경 파일과 남은 위험 정리해줘. 확인된 문제가 없으면 검증 항목을 남겨줘.`,
    optimization: `선택 REST API flow 성능 점검. 실제로 확인된 고영향 병목만 수정해줘.

{{target}}

메타데이터는 탐색 단서일 뿐 증거가 아님. 실제 구현, 호출부, 데이터 접근, 외부 서비스를 확인해줘. 프레임워크 추측 말고 저장소의 실제 Node.js 또는 Python 스택 기준으로 진행해줘.

필수 점검 항목:
1. loop 내부 query, 항목별 resolver, lazy relation, 반복 service call의 N+1 query 또는 request
2. DB query 수, 누락·무효 index, 불필요한 full scan, filter·sort, pagination, projection, bulk operation
3. transaction·제한·순서를 깨지 않는 병렬 가능한 독립 I/O
4. request thread/event loop를 막는 동기 I/O·CPU 작업, 과도한 payload·직렬화, 무제한 memory list
5. 중복 외부 호출, connection pool, timeout, retry, backoff, response body 정리
6. 재사용 효과 측정 가능, freshness·invalidation·memory limit 명확한 cache만 검토
7. hot path logging, 반복 parsing·변환, request path 밖으로 옮길 작업

개선 주장 전 측정값 또는 코드 근거 제시해줘. 확인된 문제마다 영향, 정확한 file:line 근거, 최소 유효 변경 남겨줘. response 의미 유지해줘. 검증된 수정만 해줘. 최소 관련 test 또는 check 실행해줘. 미측정 제안은 가설로 표시해줘. 추측성 abstraction·dependency·cache 추가하지 마.`,
  },
  ja: {
    paths: `修正対象のコードをすばやく見つけるため、次の範囲から確認してください。変更前に、対象の flow 注釈、周辺実装、関連する呼び出し元を読んでください。

{{target}}`,
    security: `選択した REST API flow の重要なセキュリティを点検し、実際に確認できた影響の大きい問題を修正してください。

{{target}}

提供されたメタデータは調査の手掛かりであり、証拠そのものではありません。この flow が実際に通る実装、呼び出し元、ミドルウェア、設定、データアクセスを確認してください。フレームワークを推測せず、リポジトリの実際の Node.js または Python スタックに従ってください。

必須確認項目:
1. すべての分岐における認証、エンドポイント・オブジェクト単位の認可、ロール確認、テナント分離。
2. 型・形式・範囲・サイズ・許可リストの入力検証と危険な mass assignment。
3. SQL/NoSQL/コマンド/テンプレート injection、危険なデシリアライズ、path traversal、ファイルアクセス、SSRF。
4. パスワード・secret・token・session、JWT 検証、期限・失効、cookie 属性、必要な場合の CSRF と CORS。
5. レスポンス・ログ・エラー・過剰なフィールド取得・debug 出力からの機密情報漏えい。
6. rate limit、brute force、replay 対策、書き込み・webhook の idempotency、サービス拒否リスク。
7. 検査を迂回したり中途半端な状態を残したりする transaction 境界、race condition、失敗経路。
8. この flow が実際に利用する脆弱な dependency または安全でない初期設定。

問題を作り上げないでください。確認した問題ごとに重大度、攻撃シナリオ、正確な file:line の根拠を示してください。最小限で安全な修正だけを実装し、安全上必要な場合を除いて公開 API の動作を維持してください。最小限の関連テストまたはチェックを実行し、変更ファイルと残存リスクをまとめてください。問題が確認できなければ、その旨と確認内容を明記してください。`,
    optimization: `選択した REST API flow の重要なパフォーマンスを点検し、実際に確認できた影響の大きいボトルネックを修正してください。

{{target}}

提供されたメタデータは調査の手掛かりであり、証拠そのものではありません。この flow が実際に通る実装、呼び出し元、データアクセス、外部サービスを確認してください。フレームワークを推測せず、リポジトリの実際の Node.js または Python スタックに従ってください。

必須確認項目:
1. loop 内の query、項目別 resolver、lazy relation、反復 service call を含む N+1 query または request。
2. DB query 数、不足または無効な index、不要な full scan、filter・sort、pagination、projection、bulk operation。
3. transaction・制限・順序を壊さず安全に並列化できる、順次実行された独立 I/O。
4. request thread/event loop を止める同期 I/O や CPU 処理、過大な payload・シリアライズ、無制限のメモリ list。
5. 重複した外部呼び出し、connection pool、timeout、retry、backoff、response body の解放。
6. 再利用効果を測定でき、freshness・invalidation・メモリ上限が明確な場合の cache。
7. hot path logging、反復 parsing・変換、リクエスト経路の外へ移せる処理。

改善を主張する前に測定値またはコード上の根拠を示してください。確認した問題ごとに影響、正確な file:line の根拠、最小限で有効な変更を説明してください。レスポンスの意味を保って確認済みの修正だけを実装し、最小限の関連テストまたはチェックを実行してください。未測定の提案は仮説と明記し、推測的な抽象化・dependency・cache を追加しないでください。`,
  },
}

const LANGUAGE_KEY = "kanrai:prompt-language:v1"
const templateKey = (language: PromptLanguage) => `kanrai:prompt-templates:v1:${language}`

function storage() {
  try {
    return typeof window === "undefined" ? null : window.localStorage
  } catch {
    return null
  }
}

export function detectPromptLanguage(languages?: readonly string[]): PromptLanguage {
  const values = languages ?? (typeof navigator === "undefined" ? [] : navigator.languages)
  for (const value of values) {
    if (value.toLowerCase().startsWith("ko")) return "ko"
    if (value.toLowerCase().startsWith("ja")) return "ja"
    if (value.toLowerCase().startsWith("en")) return "en"
  }
  return "en"
}

export function loadPromptLanguage(): PromptLanguage {
  try {
    const saved = storage()?.getItem(LANGUAGE_KEY)
    return saved === "ko" || saved === "ja" || saved === "en" ? saved : detectPromptLanguage()
  } catch {
    return detectPromptLanguage()
  }
}

export function savePromptLanguage(language: PromptLanguage) {
  try {
    storage()?.setItem(LANGUAGE_KEY, language)
  } catch {
    // 저장이 막힌 브라우저에서도 현재 세션의 언어 변경은 유지한다.
  }
}

export function defaultPromptTemplates(language: PromptLanguage): PromptTemplates {
  return { ...DEFAULT_PROMPTS[language] }
}

export function promptKinds(templates: PromptTemplates) {
  return [
    ...PROMPT_KINDS.filter(({ value }) => value in templates),
    ...Object.keys(templates)
      .filter((value) => !defaultPromptKeys.has(value))
      .map((value) => ({ value, label: value })),
  ]
}

export function loadPromptTemplates(language: PromptLanguage): PromptTemplates {
  const defaults = defaultPromptTemplates(language)
  try {
    const parsed = JSON.parse(storage()?.getItem(templateKey(language)) ?? "{}") as
      | Partial<PromptTemplates>
      | { templates?: Partial<PromptTemplates>; deleted?: string[] }
    const saved = "templates" in parsed ? parsed.templates ?? {} : parsed
    const deleted = new Set("templates" in parsed ? parsed.deleted ?? [] : [])
    return {
      ...Object.fromEntries(Object.entries(defaults).filter(([value]) => !deleted.has(value))),
      ...Object.fromEntries(Object.entries(saved).filter(([, value]) => typeof value === "string")),
    } as PromptTemplates
  } catch {
    return defaults
  }
}

export function savePromptTemplates(language: PromptLanguage, templates: PromptTemplates) {
  try {
    const target = storage()
    if (!target) return false
    target.setItem(
      templateKey(language),
      JSON.stringify({
        templates,
        deleted: PROMPT_KINDS.map(({ value }) => value).filter((value) => !(value in templates)),
      }),
    )
    return true
  } catch {
    return false
  }
}

function annotationLabel(flowId: string) {
  const separator = flowId.indexOf(" ")
  return separator < 0 ? `[${flowId}]` : `[${flowId.slice(0, separator)}: ${flowId.slice(separator + 1)}]`
}

function selectedContext(nodes: StepNode[]) {
  return {
    route: nodes[0]?.data.flowId,
    selection: nodes.map(({ data }) => {
      const step = data.step
      return {
        path: step?.filePath ?? null,
        line: step?.line ?? null,
        flow: data.order,
        ...(data.case && { case: data.case }),
        kind: step?.kind ?? data.variant,
        ...(step?.kind === "db" && { detail: `${step.table}:${step.op}` }),
        ...(step?.kind === "api" && { detail: step.service }),
        ...(step?.kind === "fail" && { detail: `status:${step.status ?? "unknown"}` }),
      }
    }),
  }
}

function targetText(language: PromptLanguage, nodes: StepNode[], allSelected: boolean) {
  const label = annotationLabel(nodes[0]?.data.flowId ?? "unknown flow")
  if (allSelected) {
    const start = nodes.find(({ data }) => data.order === 1 && data.step?.filePath)?.data.step
    const startLocation = start ? `${start.filePath}:${start.line} (flow-1, ${start.kind})` : "flow-1"
    if (language === "ko")
      return `${label} 주석에 정의된 전체 flow 점검. 저장소에서 해당 kanrai 주석을 검색해 모든 단계 찾아줘.\n시작 위치: ${startLocation}. 이 위치부터 추적해줘.`
    if (language === "ja")
      return `${label} の注釈で定義された flow 全体を点検してください。リポジトリ内の該当 kanrai 注釈を検索し、すべてのステップを見つけてください。\n開始位置: ${startLocation}。ここから追跡してください。`
    return `Review the complete flow defined by the ${label} annotations. Search the repository for those kanrai annotations to locate every step.\nStart at: ${startLocation}. Trace the flow from this location.`
  }

  const json = JSON.stringify(selectedContext(nodes), null, 2)
  if (language === "ko") return `아래 선택 위치부터 확인해줘.\n\n\`\`\`json\n${json}\n\`\`\``
  if (language === "ja")
    return `次の選択された位置とメタデータを優先して確認してください。\n\n\`\`\`json\n${json}\n\`\`\``
  return `Start with the selected locations and metadata below.\n\n\`\`\`json\n${json}\n\`\`\``
}

export function buildPrompt({
  kind,
  language,
  nodes,
  allSelected,
  template,
}: {
  kind: PromptKind
  language: PromptLanguage
  nodes: StepNode[]
  allSelected: boolean
  template?: string
}) {
  const target = targetText(language, nodes, allSelected)
  const source = template ?? loadPromptTemplates(language)[kind] ?? ""
  return source.includes("{{target}}") ? source.replaceAll("{{target}}", target) : `${source.trim()}\n\n${target}`
}
