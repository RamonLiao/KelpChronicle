export interface Finding {
  key: string;
  title: string;
  summary: string;
  sourceUrl: string;
}

export interface Artifact {
  schema: 'recall.report.v1';
  agent: string;
  namespace: string;
  runId: number;
  createdAtMs: number;
  topic: string;
  findings: Finding[];
  priorRunIds: string[];
}
