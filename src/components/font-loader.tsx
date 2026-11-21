"use client";

import { useEffect } from "react";

// Pretendard 글꼴 CSS(/fonts/pretendard/pretendard.css)를 첫 화면이 그려진 뒤에
// 불러옵니다. <head>에 넣으면 이 CSS가 첫 화면을 막는 데다 글꼴 파일 요청이 첫
// 화면 직전에 몰려요. 대신 시스템 글꼴로 먼저 그리고, 로딩이 끝나면 바꿔 끼웁니다.
export function FontLoader() {
  useEffect(() => {
    const add = () => {
      if (document.getElementById("pretendard-css")) return;
      const link = document.createElement("link");
      link.id = "pretendard-css";
      link.rel = "stylesheet";
      link.href = "/fonts/pretendard/pretendard.css";
      document.head.appendChild(link);
    };
    if (document.readyState === "complete") add();
    else window.addEventListener("load", add, { once: true });
  }, []);
  return null;
}
