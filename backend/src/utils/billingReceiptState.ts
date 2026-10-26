/** Zero calls is established by the gateway reservation ledger, never by a balance difference. */
export function billingReceiptStatus(recordedEntries:number,budget:{state:string;calls:number}|null):"recorded"|"not_submitted"|"pending"{
  if(recordedEntries>0)return "recorded";
  if(budget&&budget.state!=="active"&&budget.calls===0)return "not_submitted";
  return "pending";
}
