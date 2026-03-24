import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PowerChart } from "./components/PowerChart";
import { DailySummary } from "./components/DailySummary";
import { format } from "date-fns";

const queryClient = new QueryClient();

function Dashboard() {
  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">消費電力モニター</h1>
        <p className="text-sm text-gray-500 mt-1">{format(new Date(), "yyyy年MM月dd日")}</p>
      </header>

      <div className="max-w-5xl mx-auto space-y-6">
        <DailySummary />
        <PowerChart />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Dashboard />
    </QueryClientProvider>
  );
}
