// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import "../../test/setup";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DailySummary } from "../DailySummary";
import { mockDailySummary } from "../../test/mocks";

vi.mock("../../hooks/usePowerData", () => ({
  useDailySummary: vi.fn(),
}));

import { useDailySummary } from "../../hooks/usePowerData";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

describe("DailySummary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("データ取得中は --- を表示する", () => {
    vi.mocked(useDailySummary).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useDailySummary>);

    render(<DailySummary />, { wrapper });

    expect(screen.getAllByText("---")).toHaveLength(4);
  });

  it("サマリーデータを正しく表示する", () => {
    vi.mocked(useDailySummary).mockReturnValue({
      data: mockDailySummary,
      isLoading: false,
    } as ReturnType<typeof useDailySummary>);

    render(<DailySummary />, { wrapper });

    expect(screen.getByText("12.50 kWh")).toBeInTheDocument();
    expect(screen.getByText("2800 W")).toBeInTheDocument();
    expect(screen.getByText("520 W")).toBeInTheDocument();
    expect(screen.getByText("375 円")).toBeInTheDocument();
  });

  it("4 つのカードが表示される", () => {
    vi.mocked(useDailySummary).mockReturnValue({
      data: mockDailySummary,
      isLoading: false,
    } as ReturnType<typeof useDailySummary>);

    render(<DailySummary />, { wrapper });

    expect(screen.getByText("消費電力量")).toBeInTheDocument();
    expect(screen.getByText("ピーク電力")).toBeInTheDocument();
    expect(screen.getByText("平均電力")).toBeInTheDocument();
    expect(screen.getByText("電気代概算")).toBeInTheDocument();
  });
});
