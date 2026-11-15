import type { CaseRow, Checkpoint, Result } from "../../types/backend";
export type CaseInput = Omit<CaseRow,"user_id"|"created_at"|"updated_at"|"revision">;
export interface DataClient {
  listCases():Promise<Result<CaseRow[]>>;
  getCase(id:string):Promise<Result<CaseRow|null>>;
  getMostRecentCase():Promise<Result<CaseRow|null>>;
  createCase(input:CaseInput):Promise<Result<CaseRow>>;
  updateCase(id:string,patch:CaseInput,expectedRevision?:number):Promise<Result<CaseRow>>;
  deleteCase(id:string):Promise<Result<null>>;
  saveDraft(checkpoint:Checkpoint):Promise<Result<Checkpoint>>;
  getDraft(draftKey:string):Promise<Result<Checkpoint|null>>;
  clearDraft(draftKey:string):Promise<Result<null>>;
  listDrafts():Promise<Result<Checkpoint[]>>;
  legacyStatus():Promise<Result<number>>;
  importLegacy():Promise<Result<number>>;
}
