import axios from 'axios';
export type AccountUser = { id: string; email: string; name: string; goals: string; skillLevel: 'beginner' | 'intermediate' | 'advanced' };
export type AnalysisRecord = { id: string; fileName: string; analysisType: 'shooting' | 'dribbling'; score: number; uploadedAt: string };
let scope = 'guest';
let signedIn = false;
export function setAccountMode(value: boolean, userId?: string) { signedIn = value; scope = value ? userId || 'account' : 'guest'; }
export function accountScope() { return scope; }
export function hasAccount() { return signedIn; }
export async function accountRequest<T = any>(data?: object): Promise<T> {
  try {
    const response = data ? await axios.post<T>('/api/account', data, { timeout: 15000 }) : await axios.get<T>('/api/account', { timeout: 15000 });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) throw new Error(error.response?.data?.error || 'Could not reach account storage. Please try again.');
    throw error;
  }
}
export async function loadAnalyses(): Promise<AnalysisRecord[]> {
  if (hasAccount()) return (await accountRequest({ action: 'list' })).records.filter((item: { kind: string }) => item.kind === 'analysis');
  try { return JSON.parse(localStorage.getItem('hoopcoach-analysis-videos') || '[]'); } catch { return []; }
}
export async function saveAnalysis(record: AnalysisRecord) {
  if (hasAccount()) return (await accountRequest({ action: 'save', kind: 'analysis', record })).record as AnalysisRecord;
  const records = await loadAnalyses();
  localStorage.setItem('hoopcoach-analysis-videos', JSON.stringify([record, ...records].slice(0, 30)));
  return record;
}
