export type DirectorBill = {id:string;state:'pending'|'recorded'|'not_submitted';points?:number;needsReview?:boolean};

/** A closed one-shot authorization can never submit again. Settlement is independent:
 * retain pending receipts and reservations, and require a NEW authorization on retry. */
export function reviewDirectorReceipt(bill:DirectorBill, receipt:any):DirectorBill {
  if(receipt?.status==='recorded'&&Number.isFinite(receipt.points))return {id:bill.id,state:'recorded',points:receipt.points,needsReview:false};
  if(receipt?.status==='not_submitted')return {id:bill.id,state:'not_submitted',points:0,needsReview:false};
  return {...bill,needsReview:!['stopped','expired'].includes(receipt?.budget?.state)};
}
