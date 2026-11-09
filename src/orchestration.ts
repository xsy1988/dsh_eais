export type RoutePath = 'template' | 'direct' | 'job' | 'subagent' | 'analysis' | 'ask'

export interface RouteFacts {
  template?: string
  directAction?: string
  jobAction?: string
  multiStep?: boolean
  bounded?: boolean
  largeData?: boolean
  customComputation?: boolean
}

export function selectPath(facts: RouteFacts): RoutePath {
  if (facts.template) return 'template'
  if (facts.directAction) return 'direct'
  if (facts.jobAction) return 'job'
  if (facts.multiStep && facts.bounded) return 'subagent'
  if (facts.largeData || facts.customComputation) return 'analysis'
  return 'ask'
}

export interface TaskContract {
  goal: string
  method: string
  allowedActions: string[]
  budget: { maxCalls: number, maxRows: number, expiresInSeconds: number }
  dataPolicy: 'handles-only'
  outputSchema: Record<string, unknown>
  stopCondition: string
  readOnly: boolean
  confirmedWriteActions: string[]
  runId: string
  auditId: string
}

export function createTaskContract(input: Partial<TaskContract> & { goal: string, runId: string }): TaskContract {
  return {
    goal: input.goal,
    method: input.method ?? 'bounded-subagent',
    allowedActions: input.allowedActions ?? [],
    budget: input.budget ?? { maxCalls: 10, maxRows: 1000, expiresInSeconds: 900 },
    dataPolicy: 'handles-only',
    outputSchema: input.outputSchema ?? { type: 'object', required: ['conclusion', 'evidence', 'status'] },
    stopCondition: input.stopCondition ?? 'evidence-complete-or-budget-exhausted',
    readOnly: input.readOnly ?? true,
    confirmedWriteActions: input.confirmedWriteActions ?? [],
    runId: input.runId,
    auditId: input.auditId ?? input.runId,
  }
}

export function assertActionAllowed(contract: TaskContract, action: string, kind: string, confirmed: boolean): void {
  if (!contract.allowedActions.includes(action)) throw new Error('动作不在子代理任务契约内')
  if ((kind === 'write' || kind === 'job') && (!contract.confirmedWriteActions.includes(action) || !confirmed)) {
    throw new Error('写动作未点名并经用户确认')
  }
}

export interface ResultEnvelope {
  conclusion: string
  evidence: { action: string, datasetId?: string, rows: number, contractVersion: string, runId: string }
  assumptions?: string[]
  confidence: number
  status: string
}

export function acceptResult(envelope: ResultEnvelope, contract: TaskContract): ResultEnvelope {
  if (envelope.status !== 'succeeded') throw new Error('子代理没有成功完成')
  if (!envelope.conclusion || envelope.confidence < 0 || envelope.confidence > 1) throw new Error('子代理结论或置信度无效')
  const evidence = envelope.evidence
  if (!evidence || !contract.allowedActions.includes(evidence.action) || evidence.runId !== contract.runId ||
    !evidence.contractVersion || evidence.rows < 0) {
    throw new Error('子代理证据未通过父代理验收')
  }
  return envelope
}

export interface SubagentRuntime {
  spawn(contract: TaskContract): Promise<ResultEnvelope>
}

export async function runBoundedSubagent(runtime: SubagentRuntime, contract: TaskContract): Promise<ResultEnvelope> {
  if (contract.allowedActions.length === 0) throw new Error('子代理至少需要白名单动作')
  const result = await runtime.spawn(contract)
  return acceptResult(result, contract)
}

export interface GuidanceResource {
  text: string
  versions: string[]
}

export interface GuidanceReader {
  read(uri: string): Promise<GuidanceResource>
}

export async function loadGuidance(reader: GuidanceReader, taskType?: string): Promise<{ text: string, versions: string[] }> {
  const base = await reader.read('eais://guidance/base')
  if (!taskType) return base
  const task = await reader.read(`eais://guidance/task/${taskType}`)
  return { text: `${base.text}\n\n${task.text}`, versions: [...base.versions, ...task.versions] }
}

export interface DelegationResponse {
  grant_id: string
  run_id: string
}

export async function issueDelegation(fetchImpl: typeof fetch, serverUrl: string, token: string, contract: TaskContract): Promise<DelegationResponse> {
  const response = await fetchImpl(`${serverUrl.replace(/\/+$/, '')}/delegations`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      run_id: contract.runId,
      allowed_actions: contract.allowedActions,
      read_only: contract.readOnly,
      max_calls: contract.budget.maxCalls,
      max_rows: contract.budget.maxRows,
      expires_in_seconds: contract.budget.expiresInSeconds,
    }),
  })
  if (!response.ok) throw new Error(`委托申请失败（HTTP ${response.status}）`)
  return response.json() as Promise<DelegationResponse>
}
