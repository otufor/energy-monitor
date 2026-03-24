// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import "../../test/setup";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PowerChart } from "../PowerChart";
import { mockPowerLogs } from "../../test/mocks";

vi.mock("../../hooks/usePowerData", () => ({
  useRecentPower: vi.fn(),
  usePowerRange: vi.fn(),
}));

// Recharts は jsdom で SVG を描画できないためモック
vi.mock("recharts", () => ({
  AreaChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="area-chart">{children}</div>
  ),
  Area: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CartesianGrid: () => null,
  // Recharts 3.x hooks（チャートコンテキスト外では undefined を返す）
  useYAxisScale: () => undefined,
  useYAxisInverseScale: () => undefined,
  usePlotArea: () => undefined,
}));

import { useRecentPower, usePowerRange } from "../../hooks/usePowerData";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

const idleRange = { data: undefined, isLoading: false, isError: false } as ReturnType<
  typeof usePowerRange
>;

describe("PowerChart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePowerRange).mockReturnValue(idleRange);
  });

  it("ローディング中はスケルトンを表示する", () => {
    vi.mocked(useRecentPower).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useRecentPower>);

    const { container } = render(<PowerChart />, { wrapper });
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("データがある場合はグラフを表示する", () => {
    vi.mocked(useRecentPower).mockReturnValue({
      data: mockPowerLogs,
      isLoading: false,
    } as ReturnType<typeof useRecentPower>);

    render(<PowerChart />, { wrapper });

    expect(screen.getByText("瞬時電力（直近1時間）")).toBeInTheDocument();
    expect(screen.getByTestId("area-chart")).toBeInTheDocument();
  });

  it("期間ボタンで表示期間を切り替えられる", async () => {
    vi.mocked(useRecentPower).mockReturnValue({
      data: mockPowerLogs,
      isLoading: false,
    } as ReturnType<typeof useRecentPower>);

    render(<PowerChart />, { wrapper });

    await userEvent.click(screen.getByRole("button", { name: "3時間" }));
    expect(screen.getByText("瞬時電力（直近3時間）")).toBeInTheDocument();
  });

  it("自動更新チェックボックスはデフォルトで OFF である", () => {
    vi.mocked(useRecentPower).mockReturnValue({
      data: mockPowerLogs,
      isLoading: false,
    } as ReturnType<typeof useRecentPower>);

    render(<PowerChart />, { wrapper });

    const checkbox = screen.getByRole("checkbox", { name: "自動更新" });
    expect(checkbox).not.toBeChecked();
  });

  it("自動更新チェックボックスを ON にすると useRecentPower に autoRefresh=true が渡る", async () => {
    vi.mocked(useRecentPower).mockReturnValue({
      data: mockPowerLogs,
      isLoading: false,
    } as ReturnType<typeof useRecentPower>);

    render(<PowerChart />, { wrapper });

    const checkbox = screen.getByRole("checkbox", { name: "自動更新" });
    await userEvent.click(checkbox);

    expect(checkbox).toBeChecked();
    expect(vi.mocked(useRecentPower)).toHaveBeenCalledWith(expect.any(Number), true);
  });

  it("「← 前」ボタンで過去へ移動し「現在」ボタンが有効になる", async () => {
    vi.mocked(useRecentPower).mockReturnValue({
      data: mockPowerLogs,
      isLoading: false,
    } as ReturnType<typeof useRecentPower>);
    vi.mocked(usePowerRange).mockReturnValue({
      data: mockPowerLogs,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof usePowerRange>);

    render(<PowerChart />, { wrapper });

    const nowBtn = screen.getByRole("button", { name: "現在" });
    expect(nowBtn).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "← 前" }));

    expect(nowBtn).not.toBeDisabled();
  });
});
