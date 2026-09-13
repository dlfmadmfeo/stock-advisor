// ---------------------------------------------------------------------------
// Claude API(Anthropic) 클라이언트. 지금은 AI 추천 탭(관리자 전용) 하나만
// 씁니다. dart.ts/kis.ts와 같은 패턴 — 설정이 안 됐거나 호출이 실패해도
// 예외를 던지지 않고 null을 돌려줘서, 호출부가 "AI 분석을 못 만들었어요"
// 같은 안내 문구로 자연스럽게 처리하게 합니다.
// ---------------------------------------------------------------------------

const CLAUDE_MODEL = "claude-sonnet-5";
const ANTHROPIC_VERSION = "2023-06-01";

export function claudeConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function askClaude(system: string, prompt: string): Promise<string | null> {
  if (!claudeConfigured()) return null;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 3000,
        system,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    // claude-sonnet-5는 기본적으로 확장 사고(extended thinking) 블록을 먼저
    // 반환해서 content[0]이 {type:"thinking"}이고 실제 답변은 그 뒤에 있는
    // {type:"text"} 블록이에요 — index 0을 그냥 쓰면 항상 undefined였습니다
    // (실측 확인, 2026-09-13 세션).
    const blocks: Array<{ type: string; text?: string }> = data?.content ?? [];
    const textBlock = blocks.find((b) => b.type === "text");
    return typeof textBlock?.text === "string" ? textBlock.text : null;
  } catch {
    return null;
  }
}
