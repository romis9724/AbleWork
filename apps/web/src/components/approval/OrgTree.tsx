'use client'
import { useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Collapse from '@mui/material/Collapse'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import type { Organization } from '@/lib/query/organizations'

interface Props {
  nodes: Organization[]
  selectedId: string | null
  onSelect: (id: string) => void
  /** 보조 텍스트(예: 담당자 수) 렌더러 */
  secondary?: (org: Organization) => string | undefined
}

/** 모든 노드 id 수집 (기본 펼침용) */
function collectIds(nodes: Organization[], acc: string[] = []): string[] {
  for (const n of nodes) {
    acc.push(n.id)
    if (n.children?.length) collectIds(n.children, acc)
  }
  return acc
}

interface NodeProps {
  org: Organization
  depth: number
  selectedId: string | null
  expanded: Set<string>
  onToggle: (id: string) => void
  onSelect: (id: string) => void
  secondary?: (org: Organization) => string | undefined
}

function OrgNode({ org, depth, selectedId, expanded, onToggle, onSelect, secondary }: NodeProps) {
  const hasChildren = !!org.children?.length
  const isOpen = expanded.has(org.id)
  return (
    <>
      <ListItemButton
        selected={org.id === selectedId}
        onClick={() => onSelect(org.id)}
        sx={{ pl: 1 + depth * 1.5, py: 0.5 }}
      >
        {hasChildren ? (
          <IconButton
            size="small"
            edge="start"
            onClick={(e) => {
              e.stopPropagation()
              onToggle(org.id)
            }}
            sx={{ mr: 0.5, p: 0.25 }}
            aria-label={isOpen ? '접기' : '펼치기'}
          >
            {isOpen ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
          </IconButton>
        ) : (
          <Box sx={{ width: 28 }} />
        )}
        <ListItemText
          primary={org.name}
          secondary={secondary?.(org)}
          primaryTypographyProps={{ noWrap: true, fontSize: 14 }}
        />
      </ListItemButton>
      {hasChildren && (
        <Collapse in={isOpen} timeout="auto" unmountOnExit>
          {org.children!.map((child) => (
            <OrgNode
              key={child.id}
              org={child}
              depth={depth + 1}
              selectedId={selectedId}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={onSelect}
              secondary={secondary}
            />
          ))}
        </Collapse>
      )}
    </>
  )
}

/** 조직도 트리 (접기/펼치기 + 단일 선택) — 카카오워크 좌측 조직 트리 정합 */
export default function OrgTree({ nodes, selectedId, onSelect, secondary }: Props) {
  const allIds = useMemo(() => collectIds(nodes), [nodes])
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(allIds))

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <List dense disablePadding>
      {nodes.map((org) => (
        <OrgNode
          key={org.id}
          org={org}
          depth={0}
          selectedId={selectedId}
          expanded={expanded}
          onToggle={toggle}
          onSelect={onSelect}
          secondary={secondary}
        />
      ))}
    </List>
  )
}
