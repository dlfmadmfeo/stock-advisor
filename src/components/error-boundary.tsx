"use client";

// ---------------------------------------------------------------------------
// 범용 에러 바운더리 (2026-08-14 세션, Suspense 전환 작업에서 추가).
//
// useSuspenseQuery는 요청이 실패하면 에러를 throw해서 가장 가까운 에러
// 바운더리로 보냅니다 — Suspense가 로딩(pending)만 잡아주고 에러는 안
// 잡아주기 때문에, Suspense랑 세트로 이 컴포넌트를 같이 씁니다. 클래스
// 컴포넌트인 이유는 getDerivedStateFromError/componentDidCatch가 아직
// 훅으로 대체가 안 돼서(리액트 공식 훅 버전이 없음).
//
// fallback은 노드를 직접 받거나, (error) => 노드 형태의 함수를 받아서 실패
// 사유 메시지를 그대로 화면에 보여줄 수 있게 했습니다.
// ---------------------------------------------------------------------------

import { Component, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  fallback: ReactNode | ((error: Error) => ReactNode);
  // 예: 종목 티커. 이 값이 바뀌면(다른 종목 상세로 이동 등) 에러 상태를
  // 초기화하고 children을 다시 시도합니다 — 안 그러면 한 번 실패한 뒤로는
  // props가 바뀌어도 계속 fallback만 보여주게 돼요.
  resetKey?: unknown;
};

type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("[ErrorBoundary]", error);
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return typeof this.props.fallback === "function"
        ? this.props.fallback(this.state.error)
        : this.props.fallback;
    }
    return this.props.children;
  }
}
