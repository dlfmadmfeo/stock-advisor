"use client";

// ---------------------------------------------------------------------------
// 범용 에러 바운더리. Suspense는 로딩만 처리하므로, useSuspenseQuery가 던진 에러를
// 받기 위해 Suspense와 함께 쓴다. getDerivedStateFromError/componentDidCatch에
// 대응하는 훅이 없어 클래스 컴포넌트로 작성했다.
//
// fallback은 노드 또는 (error) => 노드 함수로 받아 실패 사유를 보여줄 수 있다.
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
