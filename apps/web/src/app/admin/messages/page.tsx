'use client'
import { useState } from 'react'
import { PageHead } from '@/components/ab/Page'
import { Badge, Seg, Emp, Radio, Note, TableEmpty } from '@/components/ab/atoms'
import { I } from '@/components/ab/icons'
import { Modal, ConfirmDialog } from '@/components/ab/Modal'
import { useToast } from '@/components/ab/Toast'
import {
  useMessageTemplates,
  useCreateMessageTemplate,
  useUpdateMessageTemplate,
  useDeleteMessageTemplate,
  useMessageLogs,
  useSendMessage,
  type MessageTemplate,
  type MessageLog,
} from '@/lib/query/messages'
import { useEmployees, type Employee } from '@/lib/query/employees'

// ── Forms ───────────────────────────────────────────────────────────────────

interface TemplateForm {
  name: string
  content: string
}
const EMPTY_TEMPLATE: TemplateForm = { name: '', content: '' }

interface SendForm {
  title: string
  templateId: string
  recipientIds: string[]
  sendEmail: boolean
}
const EMPTY_SEND: SendForm = { title: '', templateId: '', recipientIds: [], sendEmail: false }

type SegTab = 'logs' | 'templates'

function unwrap<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[]
  return ((raw as { items?: T[] })?.items ?? []) as T[]
}

function fmtDateTime(iso?: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

// ─────────────────────────────────────────────────────────────────────────────

export default function MessagesPage() {
  const toast = useToast()
  const [tab, setTab] = useState<SegTab>('logs')

  const { data: rawTemplates, isLoading: templatesLoading } = useMessageTemplates()
  const templates = unwrap<MessageTemplate>(rawTemplates)

  const { data: logsRaw, isLoading: logsLoading } = useMessageLogs()
  const logs = unwrap<MessageLog>(logsRaw)

  const { data: employeesData } = useEmployees({ isActive: true })
  const employees: Employee[] = employeesData?.items ?? []

  const createTemplateMutation = useCreateMessageTemplate()
  const updateTemplateMutation = useUpdateMessageTemplate()
  const deleteTemplateMutation = useDeleteMessageTemplate()
  const sendMutation = useSendMessage()

  // Template modal
  const [templateModalOpen, setTemplateModalOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null)
  const [templateForm, setTemplateForm] = useState<TemplateForm>(EMPTY_TEMPLATE)

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<MessageTemplate | null>(null)

  // Compose (send) modal
  const [composeOpen, setComposeOpen] = useState(false)
  const [sendForm, setSendForm] = useState<SendForm>(EMPTY_SEND)

  // ── Template actions ──────────────────────────────────────────────────────

  function openAddTemplate() {
    setEditingTemplate(null)
    setTemplateForm(EMPTY_TEMPLATE)
    setTemplateModalOpen(true)
  }

  function openEditTemplate(t: MessageTemplate) {
    setEditingTemplate(t)
    setTemplateForm({ name: t.name, content: t.content })
    setTemplateModalOpen(true)
  }

  async function handleSaveTemplate() {
    if (!templateForm.name.trim() || !templateForm.content.trim()) return
    const hasVariables = /#\{.+?\}/.test(templateForm.content)
    try {
      if (editingTemplate) {
        await updateTemplateMutation.mutateAsync({
          id: editingTemplate.id,
          name: templateForm.name.trim(),
          content: templateForm.content.trim(),
          hasVariables,
        })
        toast('템플릿을 수정했습니다')
      } else {
        await createTemplateMutation.mutateAsync({
          name: templateForm.name.trim(),
          content: templateForm.content.trim(),
        })
        toast('템플릿을 추가했습니다')
      }
      setTemplateModalOpen(false)
    } catch {
      toast('저장에 실패했습니다')
    }
  }

  async function handleDeleteTemplate() {
    if (!deleteTarget) return
    try {
      await deleteTemplateMutation.mutateAsync(deleteTarget.id)
      setDeleteTarget(null)
      toast('템플릿을 삭제했습니다')
    } catch {
      toast('삭제에 실패했습니다')
    }
  }

  // ── Send actions ──────────────────────────────────────────────────────────

  function openCompose() {
    setSendForm(EMPTY_SEND)
    setComposeOpen(true)
  }

  function toggleRecipient(id: string) {
    setSendForm((f) => ({
      ...f,
      recipientIds: f.recipientIds.includes(id)
        ? f.recipientIds.filter((r) => r !== id)
        : [...f.recipientIds, id],
    }))
  }

  function toggleAllRecipients() {
    setSendForm((f) => ({
      ...f,
      recipientIds: f.recipientIds.length === employees.length ? [] : employees.map((e) => e.id),
    }))
  }

  async function handleSend() {
    if (!sendForm.title.trim() || !sendForm.templateId || sendForm.recipientIds.length === 0) return
    const template = templates.find((t) => t.id === sendForm.templateId)
    if (!template) return
    try {
      await sendMutation.mutateAsync({
        title: sendForm.title.trim(),
        content: template.content,
        templateId: sendForm.templateId,
        recipientEmployeeIds: sendForm.recipientIds,
        sendEmail: sendForm.sendEmail,
      })
      setComposeOpen(false)
      toast(`메시지를 ${sendForm.recipientIds.length}명에게 발송했습니다`)
      setTab('logs')
    } catch {
      toast('발송에 실패했습니다')
    }
  }

  const isTemplateSaving = createTemplateMutation.isPending || updateTemplateMutation.isPending
  const selectedTemplate = templates.find((t) => t.id === sendForm.templateId)
  const allRecipients = sendForm.recipientIds.length === employees.length && employees.length > 0
  const isLoading = tab === 'logs' ? logsLoading : templatesLoading

  return (
    <>
      <PageHead
        eyebrow="Message"
        title="메시지"
        right={
          <div className="head-actions">
            <button className="btn btn-line btn-sm" onClick={() => toast('자동화 규칙 관리')}>
              자동화 규칙
            </button>
            <button className="btn btn-ghost btn-sm" onClick={openCompose}>
              {I.plus({ style: { marginRight: 6 } })}메시지 작성
            </button>
          </div>
        }
      />

      <div className="tbl-bar">
        <span className="tbl-count">
          {tab === 'logs' ? (
            <>
              수신 <b>{logs.length}</b>건
            </>
          ) : (
            <>
              템플릿 <b>{templates.length}</b>개
            </>
          )}
        </span>
        <div className="tbl-tools">
          {tab === 'templates' && (
            <button className="btn btn-ghost btn-sm" onClick={openAddTemplate}>
              {I.plus({ style: { marginRight: 6 } })}템플릿 추가
            </button>
          )}
          <Seg<SegTab>
            value={tab}
            onChange={setTab}
            options={[
              { value: 'logs', label: '발송 내역' },
              { value: 'templates', label: '템플릿' },
            ]}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="ab-loading">
          <span className="ab-spin" />
          불러오는 중…
        </div>
      ) : tab === 'logs' ? (
        <div className="tbl-scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>제목</th>
                <th style={{ width: 110 }} className="c">
                  읽음
                </th>
                <th style={{ width: 150 }}>발송일시</th>
                <th style={{ width: 100 }} className="c">
                  상태
                </th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <TableEmpty colSpan={4} message="수신한 메시지가 없습니다" />
              ) : (
                logs.map((log) => {
                  const isRead = !!log.readAt
                  return (
                    <tr key={log.id}>
                      <td className="lead">
                        <span
                          className="tbl-link"
                          role="button"
                          tabIndex={0}
                          onClick={() => toast(`'${log.title ?? '메시지'}' 상세`)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              toast(`'${log.title ?? '메시지'}' 상세`)
                            }
                          }}
                        >
                          {log.title ?? '—'}
                        </span>
                      </td>
                      <td className="c">
                        <span
                          className="att-dur"
                          style={{ color: isRead ? 'var(--ok)' : 'var(--fg-5)' }}
                        >
                          {isRead ? '읽음' : '안읽음'}
                        </span>
                      </td>
                      <td className="muted att-dur">{fmtDateTime(log.sentAt ?? log.createdAt)}</td>
                      <td className="c">
                        <Badge kind="b-done">발송됨</Badge>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="tbl-scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>템플릿명</th>
                <th>내용 미리보기</th>
                <th style={{ width: 90 }} className="c">
                  변수
                </th>
                <th style={{ width: 120 }}>생성 날짜</th>
                <th style={{ width: 90 }} className="c">
                  관리
                </th>
              </tr>
            </thead>
            <tbody>
              {templates.length === 0 ? (
                <TableEmpty colSpan={5} message="등록된 템플릿이 없습니다" />
              ) : (
                templates.map((t) => (
                  <tr key={t.id}>
                    <td className="lead">
                      <span
                        className="tbl-link"
                        role="button"
                        tabIndex={0}
                        onClick={() => openEditTemplate(t)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            openEditTemplate(t)
                          }
                        }}
                      >
                        {t.name}
                      </span>
                    </td>
                    <td className="muted" style={{ fontSize: 12 }}>
                      {t.content.slice(0, 50)}
                      {t.content.length > 50 ? '…' : ''}
                    </td>
                    <td className="c">
                      {t.hasVariables ? (
                        <span style={{ color: 'var(--ab-orange)', fontSize: 12 }}>포함</span>
                      ) : (
                        <span className="zero">—</span>
                      )}
                    </td>
                    <td className="muted att-dur">{fmtDateTime(t.createdAt)}</td>
                    <td className="c">
                      <span
                        className="icell"
                        role="button"
                        tabIndex={0}
                        aria-label="템플릿 수정"
                        onClick={() => openEditTemplate(t)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            openEditTemplate(t)
                          }
                        }}
                      >
                        {I.edit()}
                      </span>
                      <span
                        className="icell"
                        style={{ marginLeft: 6, color: 'var(--err)' }}
                        role="button"
                        tabIndex={0}
                        aria-label="템플릿 삭제"
                        onClick={() => setDeleteTarget(t)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setDeleteTarget(t)
                          }
                        }}
                      >
                        {I.trash()}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── 메시지 작성 모달 ──────────────────────────────────────────────── */}
      <Modal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        eyebrow="New Message"
        title="메시지 작성"
        maxWidth={680}
        footer={
          <>
            <button className="btn btn-line" style={{ minWidth: 110 }} onClick={() => setComposeOpen(false)}>
              취소
            </button>
            <button
              className="btn btn-primary"
              style={{ minWidth: 110 }}
              disabled={
                sendMutation.isPending ||
                !sendForm.title.trim() ||
                !sendForm.templateId ||
                sendForm.recipientIds.length === 0
              }
              onClick={handleSend}
            >
              발송
            </button>
          </>
        }
      >
        <div className="doc">
          <div className="doc-section">
            <div className="doc-field">
              <span className="fk">
                수신 대상<span className="req">*</span>
              </span>
              <span className="fv" style={{ width: '100%' }}>
                <button className="chip add" type="button" onClick={toggleAllRecipients}>
                  {allRecipients ? '전체 해제' : `전체 직원 (${employees.length})`}
                </button>
                <div className="chips" style={{ marginTop: 10 }}>
                  {employees.map((emp) => {
                    const on = sendForm.recipientIds.includes(emp.id)
                    return (
                      <button
                        key={emp.id}
                        type="button"
                        className={'chip' + (on ? '' : ' add')}
                        onClick={() => toggleRecipient(emp.id)}
                      >
                        {emp.name}
                        {on && <span className="x">{I.x()}</span>}
                      </button>
                    )
                  })}
                </div>
                <p style={{ fontSize: 11, color: 'var(--fg-5)', margin: '8px 0 0' }}>
                  {sendForm.recipientIds.length}명 선택됨
                </p>
              </span>
            </div>

            <div className="doc-field">
              <span className="fk">
                제목<span className="req">*</span>
              </span>
              <span className="fv">
                <input
                  className="inp-block"
                  value={sendForm.title}
                  onChange={(e) => setSendForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="[사내공지] 제목을 입력하세요"
                />
              </span>
            </div>

            <div className="doc-field">
              <span className="fk">
                템플릿<span className="req">*</span>
              </span>
              <span className="fv">
                <select
                  className="sel"
                  value={sendForm.templateId}
                  onChange={(e) => setSendForm((f) => ({ ...f, templateId: e.target.value }))}
                  style={{ borderBottom: '1px solid var(--warm-500)' }}
                >
                  <option value="">템플릿 선택</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </span>
            </div>

            {selectedTemplate && (
              <div className="doc-field">
                <span className="fk">본문</span>
                <span className="fv" style={{ width: '100%' }}>
                  <textarea
                    className="ta"
                    readOnly
                    value={selectedTemplate.content}
                    style={{ minHeight: 110 }}
                  />
                </span>
              </div>
            )}

            <div className="doc-field">
              <span className="fk">발송 시점</span>
              <span className="fv">
                <div className="rad-grp">
                  <Radio on={!sendForm.sendEmail} onChange={() => setSendForm((f) => ({ ...f, sendEmail: false }))}>
                    인앱 발송
                  </Radio>
                  <Radio on={sendForm.sendEmail} onChange={() => setSendForm((f) => ({ ...f, sendEmail: true }))}>
                    인앱 + 이메일
                  </Radio>
                </div>
              </span>
            </div>

            <p style={{ fontSize: 11, color: 'var(--fg-5)', margin: '4px 0 0' }}>
              치환 변수: {'#{employee}'} · {'#{team}'} · {'#{month}'} 사용 가능
            </p>
          </div>
        </div>
      </Modal>

      {/* ── 템플릿 작성/수정 모달 ──────────────────────────────────────────── */}
      <Modal
        open={templateModalOpen}
        onClose={() => setTemplateModalOpen(false)}
        eyebrow="Template"
        title={editingTemplate ? '템플릿 수정' : '템플릿 추가'}
        maxWidth={640}
        footer={
          <>
            <button className="btn btn-line" style={{ minWidth: 110 }} onClick={() => setTemplateModalOpen(false)}>
              취소
            </button>
            <button
              className="btn btn-primary"
              style={{ minWidth: 110 }}
              disabled={isTemplateSaving || !templateForm.name.trim() || !templateForm.content.trim()}
              onClick={handleSaveTemplate}
            >
              {editingTemplate ? '수정' : '추가'}
            </button>
          </>
        }
      >
        <div className="doc">
          <div className="doc-section">
            <div className="doc-field">
              <span className="fk">
                템플릿명<span className="req">*</span>
              </span>
              <span className="fv">
                <input
                  className="inp-block"
                  value={templateForm.name}
                  onChange={(e) => setTemplateForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="템플릿 이름"
                />
              </span>
            </div>
            <div className="doc-field">
              <span className="fk">
                내용<span className="req">*</span>
              </span>
              <span className="fv" style={{ width: '100%' }}>
                <textarea
                  className="ta"
                  value={templateForm.content}
                  onChange={(e) => setTemplateForm((f) => ({ ...f, content: e.target.value }))}
                  placeholder="안녕하세요, #{employee}님."
                  style={{ minHeight: 120 }}
                />
              </span>
            </div>
            <Note title="치환 변수">
              {'#{employee}'} · {'#{team}'} · {'#{month}'} 형식으로 입력하면 발송 시 자동 치환됩니다.
            </Note>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="템플릿 삭제"
        message={`"${deleteTarget?.name}" 템플릿을 삭제하시겠습니까?`}
        confirmLabel="삭제"
        onConfirm={handleDeleteTemplate}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  )
}
