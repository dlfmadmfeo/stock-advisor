import { StockDetailScreen } from "@/components/mobile-screens";

export default async function StockPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker } = await params;
  return <StockDetailScreen ticker={ticker} />;
}
