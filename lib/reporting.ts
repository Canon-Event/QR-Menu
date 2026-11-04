export type FinancialSummary = { currency: string; collected_paise: number; refunded_paise: number; net_collected_paise: number; invoiced_paise: number; credited_paise: number; net_invoiced_paise: number; outstanding_paise: number; overpaid_paise: number; cash_paise: number; online_paise: number }
export async function financialSummary(client: any, restaurantId: string, start: string | null = null, end: string | null = null): Promise<{ summary: FinancialSummary | null; unavailable: boolean }> {
  const { data, error } = await client.rpc('restaurant_financial_report', { p_restaurant_id: restaurantId, p_start: start, p_end: end })
  return { summary: error ? null : data, unavailable: Boolean(error) }
}
